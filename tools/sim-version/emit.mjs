// emit.mjs — SIM_VERSION, step 2 of the build (D-07).
//
// THE HASH OF AN ARTIFACT CANNOT LIVE INSIDE THAT ARTIFACT.
//
// Injecting the value into the bundle would change its bytes and therefore
// change its hash — the definition would eat itself. So the build is two steps:
// step 1 (`npm run sim:build`) emits packages/sim/dist/sim.js, and this step
// writes the value into a SIBLING file, packages/sim/dist/sim-version.json.
// Nothing in src/ or packages/ imports that file in this phase: the only
// consumers today are the CI and tools/sim-version/verify.mjs.
//
// The input is the BYTES OF THE BUNDLE, hashed with sha256 from node:crypto —
// never a hand-rolled hash, and never file metadata. A value derived from the
// modification timestamp, the name and the size would be wrong in both
// directions: a fresh `git clone` rewrites timestamps and would invent a new
// version out of nothing, while a code edit that happens to preserve the size
// would leave the version standing.
//
// BOUNDARY OF THE HASH (D-06) — a property, not a rule someone must remember:
// the hash covers what the barrel packages/sim/src/index.ts reaches, which is
// the sim/ modules plus sim/defs/ (classes, enemies, items, blessings,
// mutators) and the constants. A file the barrel does not reach is not in the
// bundle and cannot move the value. So a HUD, audio or sprite tweak does NOT
// close the ranking season, while rebalancing an enemy DOES — and that is
// correct, because rebalancing changes the outcome of a replay (D-34).
//
// Known exception, resolved by plan 01-12: STAT_LABELS and PCT_STATS are HUD
// vocabulary and today they enter the hash.
//
// Second known consequence, and it is a feature: the artifact is minified, so
// the value tracks EMITTED CODE, not source text. Reformatting a file or
// rewriting a comment does not close the season. See verify.mjs, which is why
// its sensitivity probe has to be a real code change.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUNDLE_REL = 'packages/sim/dist/sim.js';
const OUTPUT_REL = 'packages/sim/dist/sim-version.json';
const BUNDLE = join(ROOT, BUNDLE_REL);
const OUTPUT = join(ROOT, OUTPUT_REL);

/** How many hex characters of the digest become the version. */
const DIGEST_CHARS = 16;

/** Failure: `file:pointer: message` on stderr, exit 1 (tools/README.md §3). */
function fail(file, pointer, message) {
  console.error(`${file}:${pointer}: ${message}`);
  process.exit(1);
}

function main() {
  let bytes;
  try {
    bytes = readFileSync(BUNDLE);
  } catch (error) {
    return fail(
      BUNDLE_REL,
      '/',
      `não consegui ler o bundle — rode \`npm run sim:build\` antes: ${error.message}`,
    );
  }

  if (bytes.length === 0) {
    return fail(BUNDLE_REL, '/', 'bundle vazio — o build da etapa 1 não emitiu nada');
  }

  const digest = createHash('sha256').update(bytes).digest('hex');
  const simVersion = `sha256:${digest.slice(0, DIGEST_CHARS)}`;

  try {
    writeFileSync(OUTPUT, `${JSON.stringify({ simVersion, bytes: bytes.length }, null, 2)}\n`, 'utf8');
  } catch (error) {
    return fail(OUTPUT_REL, '/simVersion', `não consegui gravar: ${error.message}`);
  }

  console.log(`SIM_VERSION = ${simVersion}  (${bytes.length} bytes)`);
}

main();
