// build-base.test.ts — the guard that keeps the client servable from the root
// of its own domain. Written in the shape of purity.test.ts: raw globs, an
// anti-vacuity guard first, and violations collected into a list so a failure
// names every offender instead of only the first.
//
// Deliberate deviation from the letter of 02-VALIDATION.md, which phrases the
// check as "nothing under dist/ contains /DungeonGuys2/": this file asserts on
// the SOURCE, not on the build output. In .github/workflows/ci.yml `npm test`
// runs BEFORE `npm run build`, so a test globbing `dist/` would pass by
// vacuity in CI — the directory simply is not there yet. The artifact half of
// the check belongs to tools/sw/verify.mjs (plan 02-06), which runs after the
// build and can therefore see something.
import { describe, it, expect } from 'vitest';
import { scan } from './scan';

// Vite's raw glob, not node:fs — tsconfig's `types` is ["vite/client"] only.
const TS = import.meta.glob<string>('../src/**/*.ts', {
  query: '?raw', import: 'default', eager: true,
});
const CSS = import.meta.glob<string>('../src/**/*.css', {
  query: '?raw', import: 'default', eager: true,
});
const HTML = import.meta.glob<string>('../index.html', {
  query: '?raw', import: 'default', eager: true,
});
const VITE_CONFIG = import.meta.glob<string>('../vite.config.ts', {
  query: '?raw', import: 'default', eager: true,
});
const MANIFEST = import.meta.glob<string>('../public/manifest.json', {
  query: '?raw', import: 'default', eager: true,
});

// Also kept out of the sweep globs: public/sw.js is a TEMPLATE, and the
// sentinels tools/sw/emit.mjs fills in would be noise to every assertion about
// sources. It is read here for its own describe block, at the bottom.
const SW = import.meta.glob<string>('../public/sw.js', {
  query: '?raw', import: 'default', eager: true,
});

// A document, not a source — and the only one this file reads. It is here
// because the thing being asserted is a CHECKBOX, and a checkbox is the one
// piece of prose in the repository that a command can meaningfully refuse.
const PARIDADE = import.meta.glob<string>('../docs/PARIDADE.md', {
  query: '?raw', import: 'default', eager: true,
});

// Deliberately NOT merged into the globs above: the fixture is a build
// artifact, and the "no Pages subpath in any source" sweep below is about
// sources. These two are read for the opposite reason — to prove the fixture
// has NOT moved.
const FIXTURE_SW = import.meta.glob<string>('../tests/pwa/fixtures/old-build/sw.js', {
  query: '?raw', import: 'default', eager: true,
});
const FIXTURE_HTML = import.meta.glob<string>('../tests/pwa/fixtures/old-build/index.html', {
  query: '?raw', import: 'default', eager: true,
});

/** The record has exactly one entry, or the glob missed — '' makes the length
 *  guard below fire instead of every assertion passing on `undefined`. */
function only(files: Record<string, string>): string {
  const values = Object.values(files);
  return values.length === 1 ? values[0] : '';
}

const fixtureSw = only(FIXTURE_SW);
const fixtureHtml = only(FIXTURE_HTML);
const swTemplate = only(SW);

const indexHtml = HTML['../index.html'];
const viteConfig = VITE_CONFIG['../vite.config.ts'];
const styleCss = CSS['../src/style.css'];
const screensTs = TS['../src/ui/screens.ts'];

/** The GitHub Pages subpath, with both slashes: bare "DungeonGuys2" is still
 *  the project name and legitimately appears in the title and share message. */
const PAGES_SUBPATH = '/DungeonGuys2/';

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('o build é servível da raiz do domínio', () => {
  // Anti-vacuity: a glob that finds nothing — or that finds the file and hands
  // back an empty string — makes every assertion below pass. The second case is
  // not hypothetical: Vitest's default `css: false` blanks CSS modules by file
  // extension, `?raw` included, so this guard checks CONTENT, not just type.
  // vitest.config.ts sets `css: true` precisely so style.css arrives whole.
  it.each([
    ['index.html', indexHtml, 500],
    ['vite.config.ts', viteConfig, 100],
    ['src/style.css', styleCss, 1000],
    ['src/ui/screens.ts', screensTs, 1000],
    ['src/main.ts', TS['../src/main.ts'], 500],
    ['public/manifest.json', MANIFEST['../public/manifest.json'], 200],
  ])('o glob leu %s por inteiro', (name, src, minLength) => {
    expect(src, `o glob não encontrou ${name}`).toBeTypeOf('string');
    expect(src.length, `${name} veio vazio ou truncado`).toBeGreaterThan(minLength);
  });

  it('nenhuma fonte carrega o subcaminho do GitHub Pages', () => {
    const all = { ...TS, ...CSS, ...HTML, ...VITE_CONFIG, ...MANIFEST };
    const bad: string[] = [];
    for (const [path, src] of Object.entries(all)) {
      if (src.includes(PAGES_SUBPATH)) bad.push(path);
    }
    expect(bad).toEqual([]);
  });

  it('vite.config.ts serve a raiz', () => {
    expect(viteConfig).toContain("base: '/'");
  });

  it('os href escritos à mão do index.html são absolutos de raiz', () => {
    // Vite only rewrites the entries it generates (assets/*); these resolve
    // against the document, so at any deep URL a relative href points nowhere.
    expect(indexHtml).toContain('href="/manifest.json"');
    expect(count(indexHtml, 'href="/icons/icon-192.png"')).toBe(2);
  });

  it('o manifesto continua com escopo relativo ao próprio arquivo', () => {
    // Served from /manifest.json, "." resolves to "/" for both fields — which
    // is exactly the wanted scope. This assertion exists so that "fixing" the
    // manifest into absolute paths fails the suite.
    const manifest = JSON.parse(MANIFEST['../public/manifest.json']) as {
      start_url?: string; scope?: string;
    };
    expect(manifest.start_url).toBe('.');
    expect(manifest.scope).toBe('.');
  });

  it('o link de compartilhamento não crava um domínio', () => {
    expect(screensTs).not.toContain('github.io');
    expect(count(screensTs, 'location.origin')).toBe(1);
  });

  it('nenhuma fonte de terceiro no caminho de carregamento', () => {
    expect(indexHtml).not.toContain('fonts.googleapis.com');
    expect(indexHtml).not.toContain('fonts.gstatic.com');
  });

  it('as duas famílias são declaradas localmente', () => {
    // The family names are load-bearing: --pixel-font and --display-font, and
    // the ~40 font-family rules that read them, were not touched.
    expect(styleCss).toContain("font-family: 'Press Start 2P'");
    expect(styleCss).toContain("font-family: 'Pixelify Sans'");
    const faces = count(styleCss, '@font-face');
    expect(faces).toBeGreaterThanOrEqual(2);
    // Every @font-face sources from the self-hosted directory — one stray
    // remote src: would put the third party back on the offline path.
    expect(count(styleCss, "url('/fonts/")).toBe(faces);
  });
});

// T-2-VACUOUS. tests/pwa/fixtures/old-build/ is the "old installation" the
// update test of success criterion 2 upgrades FROM. Regenerated from a later
// build it would be the NEW build, and that test would pass without testing
// anything — the failure mode a fixture cannot report about itself. These four
// assertions are the report.
describe('fixture da instalação antiga', () => {
  // Anti-vacuity by LENGTH, never by type: `toBeTypeOf('string')` accepts '',
  // which is how plan 02-02 shipped a green test that had read no CSS at all.
  it.each([
    ['sw.js', fixtureSw, 1000],
    ['index.html', fixtureHtml, 500],
  ])('o glob leu %s da fixture por inteiro', (name, src, minLength) => {
    expect(src.length, `tests/pwa/fixtures/old-build/${name} veio vazio ou sumiu`)
      .toBeGreaterThan(minLength);
  });

  it('o sw.js da fixture é o worker ANTIGO', () => {
    // The two defects that date it: the unconditional swap D2-09 removes, and
    // the literal cache name D2-10 replaces with one derived from the build.
    expect(fixtureSw).toContain('skipWaiting');
    expect(fixtureSw).toContain('dungeonguys2-v1');
  });

  it('o sw.js da fixture não foi sobrescrito pelo template novo', () => {
    // The sentinel tools/sw/emit.mjs fills in (02-06) and the prefix the new
    // cache name carries. Either one here means the fixture was regenerated.
    expect(fixtureSw).not.toContain('__PRECACHE__');
    expect(fixtureSw).not.toContain('dg2-');
  });

  it('a fixture foi construída DEPOIS da mudança de base', () => {
    // Root-absolute href is the signature of `base: '/'` (plan 02-02). Built
    // before it, the worker's scope would be /DungeonGuys2/ and the update
    // under test would not be in-place — a different experiment entirely.
    expect(fixtureHtml).toContain('href="/manifest.json"');
    expect(fixtureHtml).not.toContain(PAGES_SUBPATH);
  });
});

// The template of plan 02-06 (D2-09, D2-10, INFRA-03). Every assertion here
// reads CODE, never the file as it sits on disk: the header explains in prose
// why this worker does not claim clients and does not swap version on its own,
// so a grep over the raw text would be measuring the documentation of the rule
// and would flip red the moment somebody improved a comment.
describe('template do service worker', () => {
  // scan(src, true), and NOT the scan(scan(src, true), false) of
  // purity.test.ts: there the strings are noise, here they are the subject.
  // The build sentinel lives inside 'dg2-__BUILD_HASH__' and the prefix guard
  // inside startsWith('dg2-') — blanking string bodies would erase both of the
  // things being asserted. Comments go, strings stay.
  const code = scan(swTemplate, true);

  it('o glob leu public/sw.js por inteiro', () => {
    // Anti-vacuity by LENGTH, never by type (the lesson of plan 02-02): a glob
    // that hands back '' would make every assertion below pass.
    expect(swTemplate.length, 'public/sw.js veio vazio ou sumiu').toBeGreaterThan(1000);
    expect(code.length, 'o filtro de comentários não pode consumir o arquivo inteiro')
      .toBeGreaterThan(500);
  });

  it('as duas sentinelas continuam no template', () => {
    // Without them tools/sw/emit.mjs has nothing to substitute, and the build
    // would ship a worker whose precache list is a bare identifier.
    expect(code).toContain('__BUILD_HASH__');
    expect(code).toContain('__PRECACHE__');
  });

  it('o worker não toma o controle de páginas que não carregou', () => {
    // D2-09. With claim(), a deploy would swap the sim under a running match —
    // the exact refusal D-08 of phase 1 makes unbypassable.
    expect(code).not.toContain('clients.claim');
  });

  it('a única troca de versão é a que a página pede', () => {
    // Exactly one occurrence, and it has to be inside the message handler —
    // one in install() would be the unconditional swap D2-09 removed.
    expect(count(code, 'skipWaiting')).toBe(1);
    const message = code.indexOf("'message'");
    expect(message, "o listener de 'message' tem de existir").toBeGreaterThan(-1);
    expect(code.indexOf('skipWaiting')).toBeGreaterThan(message);
  });

  it('nenhuma resposta não-ok é gravada no cache', () => {
    // P-2: Cache Storage ignores Cache-Control, so a 502 stored during a deploy
    // is a broken index.html forever.
    expect(code).toContain('if (res.ok)');
  });

  it('o activate só apaga cache com o prefixo do próprio jogo', () => {
    // DM-3/P-11: Cache Storage is per origin. One delete site, and it is behind
    // the prefix filter — a second, unfiltered one would reach the sibling game.
    expect(count(code, "startsWith('dg2-')")).toBe(1);
    expect(count(code, 'caches.delete')).toBe(1);
  });

  it('o activate alcança o cache anterior ao esquema de nome por hash', () => {
    // T-2-STALECACHE, measured by tests/pwa/update.spec.ts and fixed here: a
    // `dg2-` prefix cannot match 'dungeonguys2-v1', a name written before the
    // prefix existed, so every installation predating the rewrite would carry a
    // dead build in Cache Storage forever. The literal is the only way the
    // cleanup can reach it, and this assertion is why removing it fails loudly
    // instead of silently on machines nobody tests on.
    expect(count(code, "'dungeonguys2-v1'")).toBe(1);
    // Still exactly one delete site — the reach widened, the surface did not.
    expect(code).toContain('k === LEGACY_CACHE');
  });

  it('o cache só responde por caminho que o build emitiu', () => {
    // INFRA-03, the allowlist half: the set comes from the precache sentinel,
    // so a route the build did not produce can never be answered from storage.
    expect(code).toContain('PRECACHE_SET.has(path)');
    // And the redundant early return that documents the intent for a reviewer.
    expect(code).toContain("url.pathname.startsWith('/api/')");
    expect(code).toContain("url.pathname === '/ws'");
  });
});

// T-2-FALSECOVER. The one assertion in this repository whose subject is a
// checkbox, and it exists because the failure it guards is silent: four
// Playwright specs now cover install, update, offline and /api/ isolation, so
// the natural next move is to tick the box — and ticking it would turn a
// recorded decision into imaginary coverage. Playwright supports service
// workers in Chromium ONLY, so Firefox, WebKit and a physical iOS device are
// uncovered no matter how many specs get written under tests/pwa/. Phase 2
// chose that gap on purpose (D2-11); it is not a pending item of the phase, and
// the phase verifier is told as much in 02-VALIDATION.md.
//
// Closing this line means installing the game on a real iPhone, not adding a
// spec. When somebody does that, they delete this block in the same commit.
describe('lacuna aceita de PWA (D2-11)', () => {
  const doc = only(PARIDADE);
  const LABEL = 'PWA instalável e funcional offline';

  it('o glob leu docs/PARIDADE.md por inteiro', () => {
    // Anti-vacuity by LENGTH, never by type: '' would make the regex below find
    // nothing and the assertion pass by never running.
    expect(doc.length, 'docs/PARIDADE.md veio vazio ou sumiu').toBeGreaterThan(1000);
  });

  it('a caixa do PWA continua desmarcada', () => {
    const lines = doc.split('\n').filter(line => line.includes(LABEL));
    // Exactly one, checked first: two lines with the label and the assertion
    // below could pass on the wrong one.
    expect(lines, `docs/PARIDADE.md tem de ter uma linha com "${LABEL}"`).toHaveLength(1);
    expect(lines[0].startsWith('- [ ] '), 'marcar esta caixa contradiz D2-11 — a cobertura é só Chromium')
      .toBe(true);
    expect(lines[0]).not.toContain('- [x]');
  });

  it('o texto registra o alcance real da lacuna', () => {
    // Not decoration. The old text said only "install it on a device"; the
    // research widened the measured gap to every engine that is not Chromium,
    // and a reader who does not find that here will assume desktop is covered.
    expect(doc, 'o alcance medido da lacuna tem de estar escrito').toContain('Chromium');
    expect(doc).toContain('D2-11');
  });
});
