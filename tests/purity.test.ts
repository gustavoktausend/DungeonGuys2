// purity.test.ts — the second half of the sim/ purity contract. The plan
// (linha 17) says it is enforced "por lint (Task 1) E POR TESTE (Task 4)";
// this is that test. It is not redundant with eslint.config.js, which
// structurally cannot see:
//   - `new Date()` / `Date.parse` / `Date.UTC` — `no-restricted-properties`
//     only pins `Date.now`, while the plan names `Date` bare;
//   - `globalThis.window` — `no-restricted-globals` matches bare identifiers;
//   - `const { random } = Math` — destructuring is not a member expression;
//   - `from '../render'` — `no-restricted-imports` patterns are
//     gitignore-style, and `**/render/**` requires a segment AFTER `render/`.
//
// Comments legitimately name these APIs ("the original called Date.now()
// here"), so comments and string literals are stripped before matching —
// otherwise correct code fails.
import { describe, it, expect } from 'vitest';

// Vite's raw glob, not node:fs — tsconfig's `types` is ["vite/client"] only.
const FILES = import.meta.glob<string>('../packages/sim/src/**/*.ts', {
  query: '?raw', import: 'default', eager: true,
});

/**
 * Removes comments; also blanks string/template literal bodies when
 * `keepStrings` is false. Strings are consumed atomically either way, so a
 * "//" inside a literal is never mistaken for a comment. sim/ contains no
 * regex literals (checked), so the ambiguous `/` case does not arise.
 */
function scan(src: string, keepStrings: boolean): string {
  let out = '', i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (two === '/*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 2; continue; }
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const start = i++;
      while (i < src.length && src[i] !== c) { if (src[i] === '\\') i++; i++; }
      i++;
      out += keepStrings ? src.slice(start, i) : '""';
      continue;
    }
    out += c; i++;
  }
  return out;
}

/** Host APIs and non-deterministic sources sim/ must never reach for. */
const FORBIDDEN: RegExp[] = [
  /\bdocument\b/, /\bwindow\b/, /\bnavigator\b/, /\blocalStorage\b/,
  /\bsessionStorage\b/, /\bperformance\b/, /\bDate\b/, /\brandom\b/,
  /\brequestAnimationFrame\b/, /\bsetTimeout\b/, /\bsetInterval\b/,
  /\bglobalThis\b/, /\bfetch\b/, /\bprocess\b/,
];

/** Any import/export-from whose specifier mentions render/, ui/ or app/ —
 *  bare directory (`'../render'`) included. */
const LAYER_IMPORT = /\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
const FORBIDDEN_LAYER = /(^|[/\\])(render|ui|app)([/\\]|$)/;

describe('pureza de src/sim', () => {
  it('encontrou os arquivos de sim/', () => {
    expect(Object.keys(FILES).length).toBeGreaterThanOrEqual(15);
  });

  it('nenhum arquivo toca DOM, relógio de parede ou aleatoriedade não semeada', () => {
    const bad: string[] = [];
    for (const [path, src] of Object.entries(FILES)) {
      const code = scan(scan(src, true), false);
      for (const re of FORBIDDEN) {
        const m = code.match(re);
        if (m) bad.push(`${path}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('nenhum arquivo importa de render/, ui/ ou app/', () => {
    const bad: string[] = [];
    for (const [path, src] of Object.entries(FILES)) {
      const noComments = scan(src, true);
      for (const m of noComments.matchAll(LAYER_IMPORT)) {
        if (FORBIDDEN_LAYER.test(m[1])) bad.push(`${path}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
