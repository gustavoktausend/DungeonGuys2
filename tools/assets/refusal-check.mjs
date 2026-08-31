// refusal-check.mjs — proves the REFUSAL path of the asset validator.
//
// Phase 1's success criterion 5 is not "the validator accepts a good manifest".
// It is "the validator refuses a bad one and says which field is wrong". A
// validator that accepts everything passes an acceptance-only test, so the
// refusal needs its own gate, and it has to run in CI next to the acceptance
// one.
//
// This exists as a script instead of an inverted exit code in the workflow for
// two reasons. First, tools/README.md §2: CI calls `npm run <script>`, never a
// file path, and `!` inversion is shell-dependent. Second, and this is the real
// one: a bare "did it exit 1?" check is a TRAP. validate.mjs also exits 1 when
// packages/sim/dist/sim.js is missing, so a naive inversion would go green on a
// machine where the sim was never built, while proving nothing at all. So this
// asserts WHICH defects were caught, by name, one marker per deliberate defect
// in the fixture. See tools/assets/README.md for the table of the three.
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF_REL = 'tools/assets/refusal-check.mjs';
const VALIDATE_REL = 'tools/assets/validate.mjs';
const FIXTURES_REL = 'tools/assets/fixtures/bad';

/**
 * One marker per deliberate defect of fixtures/bad/character-broken.manifest.json.
 * Adding a defect to the fixture means adding a row here, or the new axis is
 * exercised by nobody.
 */
const EXPECTED = [
  { defect: 'campo obrigatório ausente (D-22)', marker: /recolorRamp/ },
  { defect: 'campo com nome errado (additionalProperties: false)', marker: /spriteScale/ },
  { defect: 'sprite que não cobre a hitbox de ENEMY_DEFS (D-23)', marker: /não cobre a hitbox de 'brute'/ },
];

function fail(pointer, message) {
  console.error(`${SELF_REL}:${pointer}: ${message}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [join(ROOT, VALIDATE_REL), FIXTURES_REL], {
  cwd: ROOT,
  encoding: 'utf8',
});

if (result.error) {
  fail('/', `não consegui rodar ${VALIDATE_REL}: ${result.error.message}`);
}

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

if (result.status !== 1) {
  fail(
    '/',
    `${VALIDATE_REL} saiu com ${result.status} ao validar ${FIXTURES_REL}, esperado 1 — `
      + `o manifesto ruim NÃO foi recusado. Saída:\n${output.trim()}`,
  );
}

const missing = EXPECTED.filter(({ marker }) => !marker.test(output));
if (missing.length > 0) {
  fail(
    '/',
    `${VALIDATE_REL} recusou ${FIXTURES_REL}, mas sem apontar ${missing.length} defeito(s): `
      + `${missing.map((m) => m.defect).join('; ')}. Saída:\n${output.trim()}`,
  );
}

console.log(`recusa ok: ${FIXTURES_REL} rejeitado com os ${EXPECTED.length} defeitos apontados por campo`);
