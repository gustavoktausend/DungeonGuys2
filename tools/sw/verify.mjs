// verify.mjs — the gate that fails the build when the emit step is skipped.
//
// Four properties of dist/, and none of them implies another:
//
//   1. NO SENTINEL SURVIVED. This is the "somebody ran `vite build` on its
//      own" case. Vite copies public/ verbatim, so a bare build produces a
//      syntactically valid worker whose precache list is the identifier
//      __PRECACHE__ — it installs, it precaches NOTHING, and the defect only
//      shows up offline, weeks later, to a player with no network. Without
//      this gate, forgetting one link in the build chain is silent.
//
//   2. THE PRECACHE MATCHES THE REAL dist/. A list that drifts from the
//      artifact fails in both directions: an entry with no file makes
//      cache.addAll reject the WHOLE install (the incident the old
//      public/sw.js documented in its own header), and a file with no entry is
//      a hole in the offline build that nothing else would report.
//
//   3. THE CACHE NAME HAS THE EXPECTED SHAPE. `dg2-` plus 16 hex characters:
//      the prefix is what keeps activate() from deleting the original
//      DungeonGuys' cache on a shared origin (DM-3), and the digest is what
//      makes a new deploy leave no old cache behind (P-3).
//
//   4. NO EMITTED FILE CARRIES THE GITHUB PAGES SUBPATH. This is the artifact
//      half of INFRA-01, and it lives HERE rather than in tests/build-base.
//      test.ts for a reason worth writing down: in .github/workflows/ci.yml,
//      `npm test` runs BEFORE `npm run build`, so a Vitest case globbing dist/
//      would find an empty directory and pass by vacuity — green forever,
//      proving nothing. The source half is asserted over there, and the
//      comment at the top of that file points back at this one.
//
// WHY THIS DOES NOT CALL tools/sw/emit.mjs. sim-version/verify.mjs runs the
// real chain because it is testing a chain; this one is testing an ARTIFACT
// against the directory it claims to describe, and calling the emitter — or
// importing its walk() — would make the two agree by construction. A verifier
// that recomputes the value the tool's own way stops testing the tool and
// starts testing itself. The directory scan below is therefore a second,
// independent implementation, and the duplication is the point.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST_REL = 'dist';
const SW_REL = 'dist/sw.js';
const DIST = join(ROOT, DIST_REL);
const SW = join(ROOT, SW_REL);

/** The worker is the one file the precache cannot contain — see emit.mjs. */
const SELF = '/sw.js';

/** What a bare `vite build` leaves behind. */
const SENTINELS = ['__BUILD_HASH__', '__PRECACHE__'];

/** `dg2-` plus exactly 16 hex characters, anchored at both ends. */
const CACHE_SHAPE = /^dg2-[0-9a-f]{16}$/;

/** Both slashes: bare "DungeonGuys2" is still the project name and is fine. */
const PAGES_SUBPATH = '/DungeonGuys2/';

/** Failure: `file:pointer: message` on stderr, exit 1 (tools/README.md §3). */
function fail(file, pointer, message) {
  console.error(`${file}:${pointer}: ${message}`);
  process.exit(1);
}

/**
 * Every file under `dir`, as root-absolute pathnames with forward slashes.
 *
 * Deliberately a private copy and not an import from emit.mjs — see the header.
 */
function walk(dir, prefix, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const pathname = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) walk(join(dir, entry.name), pathname, out);
    else out.push(pathname);
  }
  return out;
}

/** The value of a single-quoted top-level constant, or throws naming it. */
function readConstant(source, name) {
  const marker = `const ${name} = '`;
  const at = source.indexOf(marker);
  if (at < 0) throw new Error(`${SW_REL} não declara ${name} como literal de aspas simples`);
  const start = at + marker.length;
  const end = source.indexOf("'", start);
  if (end < 0) throw new Error(`${SW_REL}: o literal de ${name} não fecha`);
  return source.slice(start, end);
}

/** The PRECACHE array literal, parsed as JSON — emit.mjs writes it with JSON.stringify. */
function readPrecache(source) {
  const marker = 'const PRECACHE = ';
  const at = source.indexOf(marker);
  if (at < 0) throw new Error(`${SW_REL} não declara PRECACHE`);
  const start = at + marker.length;
  // Up to the closing bracket of the array rather than to the first `;`: a
  // pathname is free to contain a semicolon, and the array literal is not.
  const end = source.indexOf('];', start);
  if (end < 0) throw new Error(`${SW_REL}: o array de PRECACHE não fecha`);
  let parsed;
  try {
    parsed = JSON.parse(source.slice(start, end + 1));
  } catch (error) {
    throw new Error(`${SW_REL}: PRECACHE não é um array JSON — ${error.message}`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${SW_REL}: PRECACHE não é um array`);
  return parsed;
}

function main() {
  let files;
  try {
    files = walk(DIST, '', []).sort();
  } catch (error) {
    return fail(
      DIST_REL,
      '/',
      `não consegui varrer o diretório — rode \`npm run build\` antes: ${error.message}`,
    );
  }

  let source;
  try {
    source = readFileSync(SW, 'utf8');
  } catch (error) {
    return fail(SW_REL, '/', `não consegui ler: ${error.message}`);
  }

  // 1. Sentinels. Checked before anything is parsed out of the file: with a
  //    sentinel standing, PRECACHE is a bare identifier and every downstream
  //    message would be about the wrong thing.
  for (const sentinel of SENTINELS) {
    if (source.includes(sentinel)) {
      return fail(
        SW_REL,
        '/',
        `a sentinela ${sentinel} sobreviveu ao build — falta \`npm run sw:emit\` depois do \`vite build\`; o worker publicado precacharia nada e o defeito só apareceria offline`,
      );
    }
  }

  // 2. The precache against the directory it claims to describe.
  const expected = files.filter(pathname => pathname !== SELF);
  const listed = readPrecache(source);

  const listedSet = new Set(listed);
  const expectedSet = new Set(expected);
  const extra = listed.filter(pathname => !expectedSet.has(pathname)).sort();
  const missing = expected.filter(pathname => !listedSet.has(pathname)).sort();

  if (extra.length > 0 || missing.length > 0) {
    const parts = [];
    // Named, never just counted: "diverged by 2" sends the reader back to the
    // directory listing, which is the work this message exists to save.
    if (extra.length > 0) parts.push(`sobrou na lista sem existir no dist/: ${extra.join(', ')}`);
    if (missing.length > 0) parts.push(`faltou na lista mas existe no dist/: ${missing.join(', ')}`);
    return fail(SW_REL, '/PRECACHE', `o precache divergiu do dist/ — ${parts.join('; ')}`);
  }

  if (listed.length !== expected.length) {
    return fail(SW_REL, '/PRECACHE', `a lista tem ${listed.length} entradas para ${expected.length} arquivos — há repetição`);
  }

  if (listedSet.has(SELF)) {
    return fail(SW_REL, '/PRECACHE', `${SELF} não pode estar no próprio precache — ver a fronteira do hash em tools/sw/emit.mjs`);
  }

  // 3. The cache name.
  const cache = readConstant(source, 'CACHE');
  if (!CACHE_SHAPE.test(cache)) {
    return fail(
      SW_REL,
      '/CACHE',
      `nome de cache fora da forma \`dg2-<16 hex>\`: ${JSON.stringify(cache)} — o prefixo protege o cache do jogo original (DM-3) e o dígito muda a cada deploy (P-3)`,
    );
  }

  // 4. The Pages subpath, over the BYTES of every emitted file — Buffer so the
  //    sweep covers the PNGs and the woff2 without a decoding step that could
  //    throw or mangle them.
  const tainted = [];
  for (const pathname of files) {
    const bytes = readFileSync(join(DIST, pathname.slice(1)));
    if (bytes.includes(PAGES_SUBPATH)) tainted.push(pathname);
  }
  if (tainted.length > 0) {
    return fail(
      DIST_REL,
      '/',
      `o subcaminho do GitHub Pages ${PAGES_SUBPATH} sobreviveu no artefato: ${tainted.join(', ')} (INFRA-01)`,
    );
  }

  console.log(
    `sw ok: ${cache}, ${listed.length} caminhos de precache batendo com o dist/, e nenhum ${PAGES_SUBPATH} em ${files.length} arquivos`,
  );
}

try {
  main();
} catch (error) {
  // Nothing escapes as a bare stack trace: an uncaught throw exits 1 with no
  // actionable message, which is the one failure mode a gate cannot afford.
  fail('tools/sw/verify.mjs', '/', error.message);
}
