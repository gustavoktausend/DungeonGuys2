// dom-ids.test.ts -- the guard behind the rule src/ui/dom.ts:19-21 states in
// prose: "Every id is resolved with `document.getElementById(id)!` -- if an id
// is missing from index.html, that surfaces immediately as a runtime error the
// first time the element is touched".
//
// That sentence describes a real invariant with no enforcement. The failure it
// promises is a TypeError on FIRST TOUCH, which for a button nobody clicks in a
// smoke test means the defect ships and only the player finds it. So the rule
// "markup and the dom.ts entry move in the same commit" is asserted here
// instead of trusted.
//
// Written in the shape of purity.test.ts: raw globs, an anti-vacuity guard
// first, and violations collected into a list so a failure names every missing
// id rather than only the first.
import { describe, it, expect } from 'vitest';

// Vite's raw glob, not node:fs -- tsconfig's `types` is ["vite/client"] only.
const DOM_TS = import.meta.glob<string>('../src/ui/dom.ts', {
  query: '?raw', import: 'default', eager: true,
});
const HTML = import.meta.glob<string>('../index.html', {
  query: '?raw', import: 'default', eager: true,
});

/** The record has exactly one entry, or the glob missed -- '' makes the length
 *  guard below fire instead of every assertion passing on `undefined`. */
function only(files: Record<string, string>): string {
  const values = Object.values(files);
  return values.length === 1 ? values[0] : '';
}

const domSrc = only(DOM_TS);
const html = only(HTML);

/**
 * A lower bound, not an exact count. This file is about two files AGREEING, and
 * pinning the total would force an unrelated edit here every time an element is
 * added. The bound exists for one reason: a regex that silently stopped
 * matching -- a rename away from `getElementById`, a switch to double quotes, a
 * formatter breaking the call across lines -- would otherwise leave this test
 * asserting `[] === []` forever, green and worthless. 87 ids today.
 */
const MIN_IDS = 80;

/** Only the single-quoted single-line form, which is the only form dom.ts uses
 *  (checked: zero double-quoted calls). MIN_IDS is what notices if that ever
 *  stops being true. */
const ids = [...domSrc.matchAll(/document\.getElementById\('([^']+)'\)/g)].map(m => m[1]!);

describe('every id dom.ts resolves exists in index.html', () => {
  // Anti-vacuity by LENGTH, never by type: vitest.config.ts sets `css: true`
  // precisely because the default stubs modules to '' -- and '' is a string, so
  // a toBeTypeOf('string') guard passes on exactly the input it exists to
  // reject. The same trap applies to any glob that misses.
  it('read both files, non-empty', () => {
    expect(domSrc.length).toBeGreaterThan(1000);
    expect(html.length).toBeGreaterThan(1000);
  });

  it('extracted a plausible number of ids', () => {
    expect(ids.length).toBeGreaterThanOrEqual(MIN_IDS);
  });

  it('resolves no id twice under two names', () => {
    // dom.ts already documents one deliberate reuse (`touchSpecial` and the
    // touch section share #btn-touch-special) -- it reuses the FIELD rather
    // than re-resolving it, and this asserts that stays the practice.
    expect([...new Set(ids)].length).toBe(ids.length);
  });

  it('has markup for every resolved id', () => {
    const missing = ids.filter(id => !html.includes(`id="${id}"`));
    expect(missing).toEqual([]);
  });

  // Named on purpose, so deleting the button fails by NAME instead of as one
  // anonymous entry in the list above. The update offer is the only path a
  // player has to a waiting service worker (D2-09): without the button the
  // worker sits in `waiting` forever and the game never updates.
  it('has the D2-09 update button, in markup and in dom.ts', () => {
    expect(ids).toContain('btn-update');
    expect(html).toContain('id="btn-update"');
  });
});
