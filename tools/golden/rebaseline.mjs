// rebaseline.mjs — the ONLY auditable path to change a golden hash.
//
// RULE OF THE PLAN, and it is not decoration:
//
//   A COMMIT THAT CHANGES A GOLDEN HASH CHANGES NOTHING ELSE.
//
// A schema migration of the fixture is a SEPARATE commit, and it is only
// valid if the hash does NOT change. Keep both halves true and
// `git log -- tests/golden/` becomes the complete, auditable list of
// everything that has ever altered the simulation — which is exactly what
// phase 9's replay verifier will need to consult.
//
// Node only, by design: the golden is recorded from the Node leg of the gate.
// Re-recording it from a browser would bake that browser's trigonometry into
// the fixture and quietly disarm tests/cross-engine.test.ts.
//
// Without --confirm the script only reports what it would do, and exits 1.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REL = 'tests/golden/campaign-mage-3000.json';
const FIXTURE = join(ROOT, REL);
const TEST = 'tests/golden.test.ts';
const VITEST = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');

const TICKS = 3000;
/** 60 * 3600 * 3 — three hours of ticks, the format's hard ceiling (T-1-03). */
const MAX_TICKS = 60 * 3600 * 3;
/**
 * Seed of the scripted input log. Literal and versioned; never a clock.
 *
 * NOT arbitrary. Most seeds produce a run whose cross-engine divergence is
 * TRANSIENT — it appears around tick 180, then heals as the entities that
 * diverged are destroyed, leaving the tick-3000 hash agreeing on all four
 * engines and the final-hash half of the gate silently useless. This seed was
 * chosen by sweeping 3000 seeds in Node, taking the 90 with the longest live
 * stretch, and running all 90 through Chromium, Firefox and WebKit: it is one
 * of the five whose divergence still survives at tick 3000 in all three, and
 * the one with the longest live stretch (1800 ticks). See the 01-04 SUMMARY.
 */
const LOG_SEED = 0x0d6b0975;

/** Failure: `file:pointer: message` on stderr, exit 1 (tools/README.md §3). */
function fail(pointer, message) {
  console.error(`${REL}:${pointer}: ${message}`);
  process.exit(1);
}

// ─── the scripted input log ──────────────────────────────────────────────
// Generated from a seeded PRNG — never from a clock, never from the engine's
// unseeded randomness — so re-running this script on any machine rebuilds the
// same script. Every field written is an integer: a log generated with
// trigonometry would diverge between engines by itself, which is precisely
// the failure the cross-engine gate exists to detect. The grep in this plan's
// acceptance criteria checks that neither trigonometry nor unseeded
// randomness is even NAMED in this file.

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const irand = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
/** Keeps `aim` inside int16, the domain the decoder reads it back from. */
const wrapInt16 = n => (n << 16) >> 16;

function generateLog(ticks) {
  const rng = mulberry32(LOG_SEED);
  const log = [];
  let mx = 0, my = 0, aim = 0, flags = 0;
  for (let t = 0; t < ticks; t++) {
    let changed = t === 0;
    // Direction, aim and buttons change on different periods so the script
    // never settles into a cycle the sim could average out.
    if (t % 23 === 0) { mx = irand(rng, -127, 127); my = irand(rng, -127, 127); changed = true; }
    if (t % 7 === 0) { aim = wrapInt16(aim + irand(rng, -5000, 5000)); changed = true; }
    if (t % 11 === 0) {
      const roll = rng();
      flags = (roll < 0.6 ? 1 : 0) | (roll > 0.94 ? 2 : 0) | (irand(rng, 0, 2) === 0 ? 4 : 0);
      changed = true;
    }
    if (changed) log.push({ t, idx: 0, mx, my, aim, flags });
  }
  return log;
}

function freshFixture() {
  return {
    // `config.players` IS the canonical order (FORM-02/D-13), and it is the
    // fixture's only list of who is in the run — plan 01-13 folded the old
    // top-level `players` into it. Two such lists is two answers to one
    // question, and the simulation only ever reads this one.
    config: {
      seed: 20260827,
      mode: 'campaign',
      players: [{
        id: 'p0',
        name: 'GOLD',
        cls: 'mage',
        forge: { vigor: 0, honed: 0, fleet: 0, startgold: 0, merchant: 0, wise: 0, golden: 0 },
      }],
    },
    ticks: TICKS,
    maxTicks: MAX_TICKS,
    hash: '',
    checkpoints: [],
    log: generateLog(TICKS),
  };
}

// ─── serialization ───────────────────────────────────────────────────────
// One record per line: a diff of this file then names the exact ticks that
// moved, which is the whole point of keeping it in git.

function rows(name, list, last) {
  const body = list.length
    ? `\n${list.map(item => `    ${JSON.stringify(item)}`).join(',\n')}\n  `
    : '';
  return `  ${JSON.stringify(name)}: [${body}]${last ? '' : ','}`;
}

function serialize(f) {
  return [
    '{',
    `  "config": ${JSON.stringify(f.config)},`,
    `  "ticks": ${f.ticks},`,
    `  "maxTicks": ${f.maxTicks},`,
    `  "hash": ${JSON.stringify(f.hash)},`,
    rows('checkpoints', f.checkpoints, false),
    rows('log', f.log, true),
    '}',
    '',
  ].join('\n');
}

// ─── the emit round-trip ─────────────────────────────────────────────────

/**
 * Runs the Node leg with VITE_GOLDEN_EMIT=1 and returns its stdout.
 *
 * `--disableConsoleIntercept` is required, not cosmetic: Vitest 4's default
 * reporter swallows console output from passing tests, so without it the
 * GOLDEN_HASH line never reaches this process.
 */
function emit() {
  try {
    const stdout = execFileSync(
      process.execPath,
      [VITEST, 'run', TEST, '--disableConsoleIntercept'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, VITE_GOLDEN_EMIT: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    return { ok: true, output: stdout };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}`.trim() };
  }
}

function extract(output, key) {
  const match = output.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!match) fail('/hash', `a saída do teste não trouxe ${key}=`);
  return match[1].trim();
}

// ─── main ────────────────────────────────────────────────────────────────

function main() {
  const confirm = process.argv.slice(2).includes('--confirm');
  const exists = existsSync(FIXTURE);
  const previous = exists ? readFileSync(FIXTURE, 'utf8') : null;

  let fixture;
  if (exists) {
    try {
      fixture = JSON.parse(previous);
    } catch (error) {
      return fail('/', `JSON inválido: ${error.message}`);
    }
  } else {
    fixture = freshFixture();
  }

  if (!confirm) {
    const what = exists
      ? `re-gravaria hash e checkpoints de ${fixture.log.length} registros (hash atual ${fixture.hash || '<vazio>'})`
      : `criaria o fixture com ${TICKS} ticks e geraria o log do zero`;
    return fail('/hash', `${what} — faltou --confirm`);
  }

  // The fixture must be on disk before the test can import it. An existing
  // config/ticks/log is NEVER regenerated: re-rolling the script
  // would change the hash for a reason other than a change in the sim.
  if (!exists) {
    mkdirSync(dirname(FIXTURE), { recursive: true });
    writeFileSync(FIXTURE, serialize(fixture), 'utf8');
  }

  const before = fixture.hash || '<vazio>';
  const run = emit();
  if (!run.ok) {
    // Leave no half-written fixture behind: a bootstrap that failed must not
    // look like a golden that merely lost its hash.
    if (!exists) rmSync(FIXTURE, { force: true });
    return fail('/hash', `a perna de Node falhou ao emitir o hash:\n${run.output}`);
  }
  const output = run.output;

  const hash = extract(output, 'GOLDEN_HASH');
  let checkpoints;
  try {
    checkpoints = JSON.parse(extract(output, 'GOLDEN_CHECKPOINTS'));
  } catch (error) {
    return fail('/checkpoints', `checkpoints ilegíveis: ${error.message}`);
  }

  fixture.hash = hash;
  fixture.checkpoints = checkpoints;
  try {
    writeFileSync(FIXTURE, serialize(fixture), 'utf8');
  } catch (error) {
    if (previous !== null) writeFileSync(FIXTURE, previous, 'utf8');
    return fail('/', `não consegui gravar: ${error.message}`);
  }

  console.log(`${before} -> ${hash}`);
}

main();
