// verify.mjs — the automated test of FORM-03, listed in 01-VALIDATION.md.
//
// A version number is worth nothing unless BOTH halves hold, and neither half
// implies the other:
//
//   REPRODUCIBLE — the same source always yields the same value. A value that
//   drifts between two runs of the same commit would close the ranking season
//   at random (D-34) and would make every room handshake a coin toss (D-08).
//
//   SENSITIVE — a change in the simulation always yields a different value. A
//   value that stands still while the code moves is worse than no value at
//   all: it would certify two divergent builds as the same era, and the
//   desync would surface forty seconds into a match instead of at the door.
//
// This runs the REAL two-step chain (`sim:build` then `emit.mjs`) and reads
// the emitted sim-version.json, rather than re-implementing the hash here — a
// verifier that recomputes the value its own way stops testing the tool and
// starts testing itself.
//
// WHY THE PROBE IS A CODE CHANGE AND NOT A COMMENT: the bundle is minified,
// so esbuild strips comments before the bytes are hashed. Appending a comment
// leaves the artifact byte-identical and the sensitivity check would fail on a
// property that is actually working as designed. The probe therefore appends
// an exported constant, which the barrel re-exports and Rollup must keep. The
// consequence is worth stating plainly: SIM_VERSION tracks emitted code, not
// source text — reformatting does not close the season, rebalancing does.
//
// The probe is applied inside a try/finally and the file is restored byte for
// byte, including on failure. Nothing in the perturbed window may call
// process.exit(): exiting skips `finally` and would leave the probe on disk.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VITE = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const EMIT = join(ROOT, 'tools', 'sim-version', 'emit.mjs');
const CONFIG_REL = 'packages/sim/vite.config.ts';
const OUTPUT_REL = 'packages/sim/dist/sim-version.json';
const OUTPUT = join(ROOT, OUTPUT_REL);

/**
 * The file the probe perturbs. constants.ts is reached by the barrel, so an
 * export appended here is an export of the entry and Rollup cannot drop it.
 * It is also owned by no other plan in this wave.
 */
const PROBE_REL = 'packages/sim/src/constants.ts';
const PROBE = join(ROOT, PROBE_REL);
/** Literal, never a clock: a probe seeded from the time of day would make this verifier itself irreproducible. */
const PROBE_PATCH = Buffer.from('\nexport const __simVersionProbe = 20260831;\n', 'utf8');

/** Failure: `file:pointer: message` on stderr, exit 1 (tools/README.md §3). */
function fail(file, pointer, message) {
  console.error(`${file}:${pointer}: ${message}`);
  process.exit(1);
}

/** Runs a Node script under ROOT. Throws instead of exiting — see the header. */
function node(argv, label) {
  try {
    execFileSync(process.execPath, argv, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
    throw new Error(`${label} falhou:\n${output}`);
  }
}

/** Step 1 then step 2, returning the emitted simVersion. */
function buildAndEmit() {
  node([VITE, 'build', '--config', CONFIG_REL], 'npm run sim:build');
  node([EMIT], 'npm run sim:version');

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(OUTPUT, 'utf8'));
  } catch (error) {
    throw new Error(`${OUTPUT_REL} ilegível: ${error.message}`);
  }
  if (typeof parsed.simVersion !== 'string' || !/^sha256:[0-9a-f]{16}$/.test(parsed.simVersion)) {
    throw new Error(`${OUTPUT_REL} trouxe simVersion inválido: ${JSON.stringify(parsed.simVersion)}`);
  }
  return parsed.simVersion;
}

function main() {
  const original = readFileSync(PROBE);

  const first = buildAndEmit();
  const second = buildAndEmit();

  let probed;
  try {
    writeFileSync(PROBE, Buffer.concat([original, PROBE_PATCH]));
    probed = buildAndEmit();
  } finally {
    try {
      writeFileSync(PROBE, original);
    } catch (error) {
      // Loud on purpose: a probe left on disk is a corrupted working tree, and
      // the next build would hash a file nobody meant to write.
      console.error(`${PROBE_REL}:/: NÃO CONSEGUI RESTAURAR o arquivo — desfaça à mão: ${error.message}`);
    }
  }

  const restored = readFileSync(PROBE);
  if (!restored.equals(original)) {
    return fail(PROBE_REL, '/', 'o arquivo não voltou ao conteúdo original depois da perturbação');
  }

  if (first !== second) {
    return fail(
      OUTPUT_REL,
      '/simVersion',
      `reprodutibilidade quebrada — dois builds da mesma fonte deram ${first} e ${second}`,
    );
  }

  if (probed === first) {
    return fail(
      OUTPUT_REL,
      '/simVersion',
      `sensibilidade quebrada — editar ${PROBE_REL} não mexeu em ${first}`,
    );
  }

  // The probe build left dist/ holding a bundle that does not match the source
  // on disk. Rebuild so the artifact and its sibling json describe the real
  // tree: a verifier that poisons the thing it verifies is a trap for whoever
  // runs it before a deploy.
  const afterRestore = buildAndEmit();
  if (afterRestore !== first) {
    return fail(
      OUTPUT_REL,
      '/simVersion',
      `o build pós-restauração deu ${afterRestore}, esperado ${first} — a perturbação não foi totalmente desfeita`,
    );
  }

  console.log(
    `sim-version ok: reprodutível (${first} em 3 builds) e sensível (perturbar ${PROBE_REL} deu ${probed})`,
  );
}

try {
  main();
} catch (error) {
  fail('tools/sim-version/verify.mjs', '/', error.message);
}
