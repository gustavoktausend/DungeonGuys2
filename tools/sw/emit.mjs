// emit.mjs — the precache list and the cache name, derived from dist/ (D2-10).
//
// THE SAME PROPERTY tools/sim-version/emit.mjs DOCUMENTS, INVERTED.
//
// That script opens with "THE HASH OF AN ARTIFACT CANNOT LIVE INSIDE THAT
// ARTIFACT" and therefore writes its value into a SIBLING file. A service
// worker has no sibling to write to: the cache name has to travel inside the
// worker, or the worker cannot open the cache. So the value does not move —
// THE BOUNDARY DOES:
//
//     THE HASH COVERS EVERY FILE IN dist/ EXCEPT dist/sw.js.
//
// Writing that down as a rule is the whole point of this paragraph. The next
// person to read this will notice that the worker is not covered by its own
// digest and will be tempted to "fix" it; including dist/sw.js would make the
// substitution change the bytes it just hashed, and the build would stop being
// reproducible. The exclusion is the design, not an oversight.
//
// WHY THIS FILE EXISTS AT ALL — an incident, not a style preference. The
// precache list used to be written by hand, and the header of the old
// public/sw.js documented in the first person how that ended: it named files
// (`engine.js`, `combat.js`, `entities.js`, ...) that this Vite build does not
// produce. `cache.addAll` rejects the ENTIRE install if a single URL 404s, so
// the installation was broken outright the moment anything registered it. A
// derived list cannot make that mistake, because it only knows files the build
// actually emitted. And the two files nobody could precache by hand —
// assets/index-<hash>.js and .css, whose names change every build — are the
// bulk of the 350 KB that make the game playable offline.
//
// WHY A POST-BUILD SCRIPT AND NOT A VITE PLUGIN OR define():
// define() is IMPOSSIBLE here, measured: Vite copies public/ verbatim, so
// public/sw.js and dist/sw.js came out byte for byte identical — the file never
// passes through a transform. A closeBundle plugin would work, but it would
// bury the logic in vite.config.ts, out of reach of `npm run <script>`
// (tools/README.md §2), and buy nothing that this shape does not already buy.
//
// The exclusion rule is deliberately total: EVERYTHING under dist/ except
// dist/sw.js. Not "everything except sw.js and the .txt files", not "everything
// except documentation" — a rule with exceptions is a rule someone forgets. It
// is what puts /assets/CREDITS.md, /assets/100_Anims_Order_List.txt and
// /fonts/OFL.txt in the precache at no extra thought, and it is what will pick
// up the next file the build starts emitting without anyone editing this line.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST_REL = 'dist';
const SW_REL = 'dist/sw.js';
const DIST = join(ROOT, DIST_REL);
const SW = join(ROOT, SW_REL);

/** How many hex characters of the digest become the cache name. */
const DIGEST_CHARS = 16;

/** The two placeholders public/sw.js ships with. Both are valid identifiers,
 *  which is what lets `node --check` verify the template before substitution. */
const HASH_SENTINEL = '__BUILD_HASH__';
const PRECACHE_SENTINEL = '__PRECACHE__';

/** The one path the precache cannot contain — see the header. */
const SELF = '/sw.js';

/** Failure: `file:pointer: message` on stderr, exit 1 (tools/README.md §3). */
function fail(file, pointer, message) {
  console.error(`${file}:${pointer}: ${message}`);
  process.exit(1);
}

/**
 * A directory entry's name as a URL PATH SEGMENT.
 *
 * The precache list is a list of URLs, not of filenames. public/sw.js matches
 * an incoming request with `PRECACHE_SET.has(url.pathname)`, and `url.pathname`
 * is percent-encoded by the URL parser — so a name concatenated raw can never
 * match it. `hero walk.png` would be precached as `/assets/hero walk.png` and
 * requested as `/assets/hero%20walk.png`: the file occupies Cache Storage, is
 * never served from it, and offline is quietly broken for that asset with no
 * error anywhere (WR-10).
 *
 * `encodeURI` and NOT `encodeURIComponent`. The latter also escapes
 * `$ & + , : ; = @`, every one of which the URL path parser leaves LITERAL —
 * encoding them would manufacture the exact mismatch this function exists to
 * remove. `?` and `#` are the two characters the parser treats as delimiters
 * rather than as path content, so those are escaped by hand on top.
 */
function segment(name) {
  return encodeURI(name).replace(/[?#]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Every file under `dir` as `{ pathname, file }`: the ROOT-ABSOLUTE URL built
 * with forward slashes (node:path's separator must not leak into a URL on
 * Windows), and the real filesystem path it came from.
 *
 * The two travel together so that nothing downstream ever has to turn a key
 * back into a filename — decoding is lossy at the edges (a stray `%` throws),
 * and the caller already has the exact path in hand here. Directory order from
 * the filesystem is not stable across platforms; the caller sorts.
 */
function walk(dir, prefix, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const pathname = `${prefix}/${segment(entry.name)}`;
    const file = join(dir, entry.name);
    if (entry.isDirectory()) walk(file, pathname, out);
    else out.push({ pathname, file });
  }
  return out;
}

/** By URL, so the emitted list has a stable order on every platform. */
function byPathname(a, b) {
  return a.pathname < b.pathname ? -1 : a.pathname > b.pathname ? 1 : 0;
}

function main() {
  let all;
  try {
    all = walk(DIST, '', []).sort(byPathname);
  } catch (error) {
    return fail(
      DIST_REL,
      '/',
      `não consegui varrer o diretório — rode \`npm run build\` antes: ${error.message}`,
    );
  }

  if (!all.some(entry => entry.pathname === SELF)) {
    return fail(
      SW_REL,
      '/',
      'o worker não está no dist/ — o Vite copia public/ verbatim, então ou o template sumiu ou o build não rodou',
    );
  }

  const precache = all.filter(entry => entry.pathname !== SELF);
  if (precache.length === 0) {
    return fail(DIST_REL, '/', 'o dist/ só tem o sw.js — não há nada para precachear');
  }

  // Path AND bytes, in sorted order: hashing only the bytes would leave a pure
  // rename invisible, and a renamed asset is a precache entry that 404s.
  const hash = createHash('sha256');
  for (const { pathname, file } of precache) {
    let bytes;
    try {
      bytes = readFileSync(file);
    } catch (error) {
      return fail(relative(ROOT, file).split('\\').join('/'), '/', `não consegui ler: ${error.message}`);
    }
    hash.update(pathname);
    hash.update('\0');
    hash.update(bytes);
  }
  const digest = hash.digest('hex').slice(0, DIGEST_CHARS);

  let source;
  try {
    source = readFileSync(SW, 'utf8');
  } catch (error) {
    return fail(SW_REL, '/', `não consegui ler: ${error.message}`);
  }

  // Checked before substituting, and reported one by one: a missing sentinel
  // means either the template regressed or this script already ran over this
  // dist/. Both are build-breaking, and neither is obvious from the artifact.
  if (!source.includes(HASH_SENTINEL)) {
    return fail(SW_REL, '/CACHE', `sentinela ${HASH_SENTINEL} não encontrada — o template regrediu, ou o script já rodou sobre este dist/`);
  }
  if (!source.includes(PRECACHE_SENTINEL)) {
    return fail(SW_REL, '/PRECACHE', `sentinela ${PRECACHE_SENTINEL} não encontrada — o template regrediu, ou o script já rodou sobre este dist/`);
  }

  // split/join and not String.replace: `$&` and friends are special in a
  // replacement string, and a pathname is attacker-adjacent input the day
  // someone adds an asset with a dollar sign in its name.
  const emitted = source
    .split(HASH_SENTINEL).join(digest)
    .split(PRECACHE_SENTINEL).join(JSON.stringify(precache.map(entry => entry.pathname)));

  try {
    writeFileSync(SW, emitted, 'utf8');
  } catch (error) {
    return fail(SW_REL, '/', `não consegui gravar: ${error.message}`);
  }

  console.log(`sw precache: ${precache.length} arquivos, cache dg2-${digest}`);
}

main();
