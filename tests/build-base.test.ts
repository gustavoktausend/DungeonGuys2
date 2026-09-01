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
  // Anti-vacuity: a glob that finds nothing makes every assertion below pass.
  it('os globs encontraram os arquivos nomeados', () => {
    expect(indexHtml, 'o glob não encontrou index.html').toBeTypeOf('string');
    expect(viteConfig, 'o glob não encontrou vite.config.ts').toBeTypeOf('string');
    expect(styleCss, 'o glob não encontrou src/style.css').toBeTypeOf('string');
    expect(screensTs, 'o glob não encontrou src/ui/screens.ts').toBeTypeOf('string');
    expect(TS['../src/main.ts'], 'o glob não encontrou src/main.ts').toBeTypeOf('string');
    expect(MANIFEST['../public/manifest.json'], 'o glob não encontrou public/manifest.json').toBeTypeOf('string');
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
});
