// lint-coverage.test.ts — WHICH files `npm run lint` actually looks at.
//
// The rules in eslint.config.js are tested by their own effects; what has
// never had a guard is the `ignores` list, and that list is the one part of a
// lint configuration whose failure mode is SILENCE. A rule that stops working
// makes some file red somewhere. A directory added to `ignores` makes nothing
// red ever again, and the gate stays green while covering less — which is
// exactly how tools/ came to hold two files that run on the VPS without a
// single lint run between them (WR-22).
//
// The question is asked of ESLint ITSELF, through isPathIgnored, and not of a
// regex over the config source. Flat-config ignore semantics are subtle enough
// that a pattern test would be testing my reading of them: `dist` anchors at
// the repository root and does NOT match a nested one, `'public'` and
// `'public/**'` behave differently the moment something inside has to be
// un-ignored, and a bare directory name matches by path SEGMENT. Every one of
// those has already cost this configuration a measured surprise, recorded in
// its own comments. So the test loads the real config and asks the real
// implementation.
import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';

/** One instance, loaded once: the flat config resolution is the slow part. */
const eslint = new ESLint();

/**
 * Files that MUST be linted, each with the reason it is not scaffolding.
 *
 * The reason is carried in the table rather than in prose because a future
 * edit to `ignores` fails here naming the file AND why it mattered, which is
 * the information the person doing the edit needs and the thing a bare path
 * list would not tell them.
 */
const MUST_LINT: [string, string][] = [
  ['tools/ops/restore-verify.mjs',
    'roda NA VPS: ops/README.md §11 o documenta como comando de operador, e ele chama litestream e sqlite3 sobre o ledger vivo'],
  ['tools/sw/emit.mjs',
    'escreve o precache do service worker publicado — um erro aqui só aparece offline, semanas depois'],
  ['tools/sw/verify.mjs',
    'é o portão que recusa esse precache; um portão sem lint é a última coisa que deveria ter'],
  ['tools/assets/validate.mjs',
    'recusa manifesto de arte vindo de PR de outro repositório, sem revisão humana antes do CI (T-1-04)'],
  ['public/sw.js',
    'É O ARQUIVO PUBLICADO. Carrega o isolamento de /api/ e a limpeza de cache do DM-3'],
];

/**
 * Files that MUST stay ignored — and this half is not decoration.
 *
 * Without it, an isPathIgnored that returned false for everything (a config
 * that failed to load, an API that changed shape) would satisfy every
 * assertion above in full, and this file would go green having measured
 * nothing. The two lists together are what make the answer discriminating.
 * Each of these is a build artifact whose lint findings belong to esbuild,
 * Vite or a bundled dependency, never to a source file of this repository —
 * the reasoning is in eslint.config.js and is not repeated here.
 */
const MUST_IGNORE = [
  'dist/sw.js',
  'dist-server/server.mjs',
  'packages/sim/dist/sim.js',
  'tests/pwa/fixtures/old-build/sw.js',
  'node_modules/typescript/lib/typescript.js',
];

describe('o que `npm run lint` de fato inspeciona', () => {
  it('todo executável que sai desta máquina é linted (WR-22)', async () => {
    const missed: string[] = [];
    for (const [file, why] of MUST_LINT) {
      if (await eslint.isPathIgnored(file)) missed.push(`${file} — ${why}`);
    }
    expect(missed).toEqual([]);
  });

  it('e os artefatos de build continuam de fora', async () => {
    const leaked: string[] = [];
    for (const file of MUST_IGNORE) {
      if (!await eslint.isPathIgnored(file)) leaked.push(file);
    }
    expect(leaked).toEqual([]);
  });
});
