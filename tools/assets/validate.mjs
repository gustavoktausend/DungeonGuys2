// validate.mjs — the executable half of docs/ASSET-SPEC.md.
//
// WHO READS THE OUTPUT OF THIS SCRIPT: an automated agent working in ANOTHER
// repository, with no access to this codebase and no human in the loop. That
// single fact drives every design choice below. Every refusal names the file,
// the exact field (as a JSON Pointer) and the expected shape. No message is
// ever just "invalid" — a reader who cannot ask a follow-up question needs the
// answer in the first line.
//
// WHY ajv IS ALLOWED HERE: the root package.json keeps `dependencies` empty and
// that is a project invariant — the published game ships zero runtime deps. ajv
// is a devDependency, imported ONLY from this file, which lives under tools/ and
// is never bundled by Vite nor served to a browser. Someone will ask; this is
// the answer. Hand-rolling a JSON Schema checker would cost hundreds of lines
// and would get wrong exactly the corners `strict: true` exists to catch.
//
// THE MANIFEST IS DATA, NEVER CODE (threat T-1-04). A manifest arrives by pull
// request from an external repository and is processed here BEFORE any merge.
// Nothing read out of a manifest is ever executed, interpolated into a program,
// used as a module specifier or turned into a callable. The only dynamic import
// in this file targets a fixed, repository-owned path (`packages/sim/dist/
// sim.js`) that no manifest can influence.
//
// TWO LAYERS, AND BOTH ALWAYS RUN:
//   1. Schema — tools/assets/schema/manifest.v1.json, ajv in strict mode.
//   2. Hitbox coverage — the sprite a manifest declares must be big enough for
//      the hitbox the SIMULATION already owns. The hitbox is read from
//      ENEMY_DEFS in the built sim bundle and is NEVER derived from the
//      manifest: art must not move balance, and SIM_VERSION must not come to
//      depend on an art file (decision D-23).
// Layer 2 runs even when layer 1 failed, on every entry that is structurally
// usable. A producer who has two unrelated problems should learn about both in
// one round trip, not one per push.
import Ajv2020 from 'ajv/dist/2020.js';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF_REL = 'tools/assets/validate.mjs';
const SCHEMA_REL = 'tools/assets/schema/manifest.v1.json';
const BUNDLE_REL = 'packages/sim/dist/sim.js';
const DEFAULT_DIR_REL = 'public/assets';
const MANIFEST_SUFFIX = '.manifest.json';

/**
 * Coverage is a comparison of two ratios written by two different people, so a
 * producer who declares exactly the ratio their art produces must not be
 * refused by the last bit of a double. One part in a billion is far below the
 * two decimal places a tolerance is written with.
 */
const RATIO_EPSILON = 1e-9;

let failed = 0;

/** Repository-relative, posix separators, so the message is copy-pasteable. */
const rel = (absolute) => relative(ROOT, absolute).split('\\').join('/');

/** One refusal. Format is `file:pointer: message` per tools/README.md §3. */
function fail(file, pointer, message) {
  console.error(`${file}:${pointer}: ${message}`);
  failed += 1;
}

/** A refusal that makes continuing pointless: report and leave immediately. */
function abort(file, pointer, message) {
  console.error(`${file}:${pointer}: ${message}`);
  process.exit(1);
}

const quote = (value) => (typeof value === 'string' ? `'${value}'` : JSON.stringify(value));

/** Trims the float noise out of a computed pixel size (2.3 * 16 = 36.8, not 36.800000000000004). */
const px = (value) => String(Number(value.toFixed(3)));

// ─── The sim bundle: where the hitboxes come from ─────────────────────────────

/**
 * Reads ENEMY_DEFS out of the built sim bundle. The bundle is a build artifact
 * (packages/sim/dist is gitignored), so its absence is the single most likely
 * way to run this script wrong — it gets a message that says what to run, not a
 * module-resolution stack trace.
 */
async function loadEnemyDefs() {
  const bundle = join(ROOT, BUNDLE_REL);
  if (!existsSync(bundle)) {
    abort(
      BUNDLE_REL,
      '/',
      'artefato da simulação ausente — rode `npm run sim:build` antes de validar assets. '
        + 'É dele que as hitboxes de ENEMY_DEFS são lidas.',
    );
  }

  let loaded;
  try {
    // Fixed, repository-owned specifier. No manifest can influence this path.
    const bundleUrl = pathToFileURL(bundle).href;
    loaded = await import(bundleUrl);
  } catch (error) {
    abort(
      BUNDLE_REL,
      '/',
      `não consegui carregar o artefato da simulação (${error.message}) — rode \`npm run sim:build\``,
    );
  }

  const defs = loaded.ENEMY_DEFS;
  if (defs === null || typeof defs !== 'object') {
    abort(
      BUNDLE_REL,
      '/ENEMY_DEFS',
      'o artefato da simulação não exporta ENEMY_DEFS — rode `npm run sim:build` de novo',
    );
  }
  return defs;
}

// ─── Layer 1: the schema ──────────────────────────────────────────────────────

function compileSchema() {
  const schemaPath = join(ROOT, SCHEMA_REL);
  if (!existsSync(schemaPath)) {
    abort(SCHEMA_REL, '/', 'schema não encontrado — o contrato do manifesto sumiu do repositório');
  }
  let schema;
  try {
    schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  } catch (error) {
    abort(SCHEMA_REL, '/', `schema ilegível: ${error.message}`);
  }
  // strict: true is the point of the exercise (threat T-1-04) — it turns a
  // typo'd keyword in the schema itself into a build failure here instead of a
  // constraint that silently never runs. allErrors: true is what lets a
  // producer fix everything in one round trip.
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  try {
    return ajv.compile(schema);
  } catch (error) {
    abort(SCHEMA_REL, '/', `schema recusado pelo ajv em modo strict: ${error.message}`);
  }
}

/**
 * ajv reports a failing `if`/`anyOf`/`propertyNames` twice: once for the inner
 * constraint and once for the wrapper. The wrapper carries no information the
 * inner error does not, except for `anyOf` and `propertyNames`, whose inner
 * errors are the ones that read badly. Keep exactly one line per real problem.
 */
function usefulErrors(errors) {
  return (errors ?? []).filter((error) => {
    if (error.keyword === 'if') return false;
    if (error.schemaPath.includes('/anyOf/')) return false;
    if (error.schemaPath.includes('/propertyNames/')) return false;
    return true;
  });
}

/** RFC 6901 escaping, so a key containing `/` or `~` still yields a valid pointer. */
const escapePointer = (token) => String(token).split('~').join('~0').split('/').join('~1');

/**
 * ajv reports `additionalProperties` and `propertyNames` against the CONTAINER,
 * with the offending key in params. Pointing at the container is useless in a
 * 200-line manifest, so the key is appended: the reader gets the exact field.
 */
function pointerFor(error) {
  const base = error.instancePath;
  const key = error.keyword === 'additionalProperties'
    ? error.params.additionalProperty
    : error.keyword === 'propertyNames'
      ? error.params.propertyName
      : undefined;
  const full = key === undefined ? base : `${base}/${escapePointer(key)}`;
  return full === '' ? '/' : full;
}

/** Turns one ajv error into a sentence that names the field and the expected shape. */
function describe(error) {
  const { keyword, params, message } = error;
  switch (keyword) {
    case 'required':
      return `falta a propriedade obrigatória '${params.missingProperty}'`;
    case 'additionalProperties':
      return `propriedade desconhecida '${params.additionalProperty}' — o formato v1 recusa campo `
        + 'com nome errado em vez de ignorá-lo em silêncio; confira a grafia em docs/ASSET-SPEC.md § 10';
    case 'propertyNames':
      return `nome de propriedade inválido: '${params.propertyName}'`;
    case 'anyOf':
      return "o manifesto precisa declarar pelo menos um entre 'characters' e 'entities', e não vazio";
    case 'const':
      return `valor tem que ser exatamente ${quote(params.allowedValue)}`;
    case 'enum':
      return `valor tem que ser um destes: ${params.allowedValues.map(quote).join(', ')}`;
    case 'type':
      return `tipo tem que ser ${params.type}`;
    case 'pattern':
      return `não casa com o padrão esperado ${params.pattern}`;
    case 'minimum':
      return `tem que ser >= ${params.limit}`;
    case 'maximum':
      return `tem que ser <= ${params.limit}`;
    case 'exclusiveMinimum':
      return `tem que ser > ${params.limit}`;
    case 'exclusiveMaximum':
      return `tem que ser < ${params.limit}`;
    case 'minItems':
      return `precisa de pelo menos ${params.limit} item(ns)`;
    case 'maxItems':
      return `aceita no máximo ${params.limit} item(ns)`;
    case 'uniqueItems':
      return `tem item repetido (posições ${params.i} e ${params.j})`;
    case 'minProperties':
      return `precisa de pelo menos ${params.limit} entrada(s)`;
    default:
      // Never bare "inválido": say which constraint failed, even when unmapped.
      return `restrição '${keyword}' não satisfeita: ${message}`;
  }
}

// ─── Layer 2: hitbox coverage ─────────────────────────────────────────────────

const isFinitePositive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * The rule, per axis:
 *
 *     hitbox / (sprite * scale)  <=  hitboxTolerance
 *
 * In words: the drawn sprite must be large enough for the hitbox to sit inside
 * it, with the slack THAT ENTRY declared. A sprite too small for its own hitbox
 * ships the worst bug in this genre — taking damage from a shot that visibly
 * missed.
 *
 * The tolerance is per entry and never global, because the measured ratio is
 * not constant: 0.75 for `goblin`, 1.06 for `necro_lord`, whose hitbox is
 * genuinely LARGER than the sprite it is drawn at. A global constant loose
 * enough for 1.06 would let a 40% overdraw through unnoticed. The schema caps
 * every tolerance at 1.25, so "declare a huge number" is not an escape hatch.
 */
function checkCoverage(file, entities, enemyDefs) {
  let checked = 0;
  if (entities === null || typeof entities !== 'object' || Array.isArray(entities)) return checked;

  for (const key of Object.keys(entities).sort()) {
    const pointer = `/entities/${key}`;
    const entry = entities[key];
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue; // layer 1 said so

    const def = Object.prototype.hasOwnProperty.call(enemyDefs, key) ? enemyDefs[key] : undefined;
    if (def === undefined) {
      const known = Object.keys(enemyDefs).sort().join(', ');
      fail(
        file,
        pointer,
        `'${key}' não existe em ENEMY_DEFS (packages/sim/src/defs/enemies.ts). `
          + `As chaves válidas são: ${known}`,
      );
      continue;
    }

    const { spriteWidth, spriteHeight, scale, hitboxTolerance } = entry;
    if (!isFinitePositive(spriteWidth) || !isFinitePositive(spriteHeight) || !isFinitePositive(scale)) {
      continue; // layer 1 already named the offending field
    }
    if (hitboxTolerance === null || typeof hitboxTolerance !== 'object') continue;
    if (!isFinitePositive(hitboxTolerance.x) || !isFinitePositive(hitboxTolerance.y)) continue;

    const drawn = { x: spriteWidth * scale, y: spriteHeight * scale };
    const hitbox = { x: def.w, y: def.h };
    checked += 1;

    for (const axis of ['x', 'y']) {
      const ratio = hitbox[axis] / drawn[axis];
      if (ratio > hitboxTolerance[axis] + RATIO_EPSILON) {
        fail(
          file,
          pointer,
          `o sprite desenhado (${px(drawn.x)}x${px(drawn.y)}) não cobre a hitbox de '${key}' `
            + `(${hitbox.x}x${hitbox.y}) no eixo ${axis}: razão ${ratio.toFixed(3)} > `
            + `tolerância declarada ${hitboxTolerance[axis]}`,
        );
      }
    }
  }
  return checked;
}

// ─── Per-file checks that the schema cannot express ───────────────────────────

/** The schema cannot see the file name, so the sheet/manifest pairing is checked here. */
function checkSheetPairing(file, name, data) {
  const expected = `${name.slice(0, -MANIFEST_SUFFIX.length)}.png`;
  const declared = data.sheet?.file;
  if (typeof declared !== 'string') return; // layer 1 already named it
  if (declared !== expected) {
    fail(
      file,
      '/sheet/file',
      `'${declared}' não corresponde ao nome do manifesto — esperado '${expected}'`,
    );
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  const dirArg = process.argv[2] ?? DEFAULT_DIR_REL;
  const dir = resolve(ROOT, dirArg);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    abort(rel(dir), '/', 'diretório não encontrado — passe o caminho de um diretório de manifestos');
  }

  const enemyDefs = await loadEnemyDefs();
  const validate = compileSchema();

  // Sorted so two runs on the same tree print the same lines in the same order.
  const names = readdirSync(dir).filter((n) => n.endsWith(MANIFEST_SUFFIX)).sort();

  let entitiesChecked = 0;
  for (const name of names) {
    const file = rel(join(dir, name));
    let data;
    try {
      data = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    } catch (error) {
      fail(file, '/', `JSON inválido: ${error.message}`);
      continue;
    }
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      fail(file, '/', 'o manifesto tem que ser um objeto JSON');
      continue;
    }

    if (!validate(data)) {
      for (const error of usefulErrors(validate.errors)) {
        fail(file, pointerFor(error), describe(error));
      }
    }

    checkSheetPairing(file, name, data);
    entitiesChecked += checkCoverage(file, data.entities, enemyDefs);
  }

  if (failed > 0) process.exit(1);
  console.log(
    `assets ok: ${names.length} manifesto(s) em ${rel(dir)}, ${entitiesChecked} entidade(s) conferida(s) contra ENEMY_DEFS`,
  );
}

try {
  await main();
} catch (error) {
  // No unhandled throw ever escapes: a stack trace is exit 1 without an
  // actionable message, which is the one thing this script exists to avoid.
  abort(SELF_REL, '/', error instanceof Error ? error.message : String(error));
}
