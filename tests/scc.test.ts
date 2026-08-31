// scc.test.ts — the size of packages/sim's import cycle, computed instead of
// claimed. Plan 01-08 cut two edges out of an eight-module strongly connected
// component; this test is what keeps them cut.
//
// It exists because the previous record of the cycle was prose. docs/BACKLOG.md
// asserted that removing `xp -> run` alone would drop the component to six
// modules, and that `run <-> shop` "falls with it". Running Tarjan on the real
// graph showed both claims to be false: cutting `xp -> run` alone leaves all
// eight, because `xp -> shop -> run -> enemies -> xp` closes the cycle on its
// own, and `run <-> shop` is an independent cycle that no amount of cutting in
// xp.ts touches. A number nobody computes is a number that drifts, and phase 03
// is going to add edges.
//
// Why the cycle is worth bounding: a module-eval-time `const` whose initialiser
// crosses a cycle evaluates to `undefined` rather than throwing, and the failure
// surfaces far from its cause. That is precisely the shape of a vendored
// trigonometry module with precomputed tables.
import { describe, it, expect } from 'vitest';

// Vite's raw glob rather than a filesystem read — tsconfig's `types` is
// ["vite/client"] only, and this test has to run in the browser bundle as
// happily as it does in Node.
const FILES = import.meta.glob<string>('../packages/sim/src/**/*.ts', {
  query: '?raw', import: 'default', eager: true,
});

const SRC_PREFIX = '../packages/sim/src/';

/** The ceiling. Lower it when a cut earns it; never raise it to make a diff pass. */
const MAX_SCC = 5;

/**
 * The two cycles that are allowed to exist, smallest first.
 *
 * `run <-> shop` is a genuine, independent cycle: shop.ts's `closeShop` calls
 * run.ts's `startNextWave`, and run.ts's `checkWaveComplete` calls shop.ts's
 * `openShop`. Breaking it is the same technique used on xp.ts and is written up
 * in docs/BACKLOG.md — deliberately out of scope for this phase, and recorded
 * here as known debt rather than left to look like a failure.
 */
const EXPECTED_CYCLES = [
  ['run', 'shop'],
  ['boss', 'combat', 'enemies', 'player', 'special'],
];

/**
 * Removes comments, keeping string literals intact (the import specifiers are
 * string literals). Strings are consumed atomically, so a "//" inside a literal
 * is never mistaken for a comment. Copied from tests/purity.test.ts rather than
 * shared: these two meta-tests are each other's backstop, and a helper they both
 * import is a single point of failure for both.
 *
 * Stripping comments is not cosmetic here. xp.ts's header now narrates the very
 * edges this test asserts are gone ("used to import `victory` from ./run"), and
 * a scanner that read comments would resurrect the cycle it is meant to police.
 */
function stripComments(src: string): string {
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
      out += src.slice(start, i);
      continue;
    }
    out += c; i++;
  }
  return out;
}

/**
 * An `import`/`export ... from` statement, anchored to the start of a line so
 * that an incidental `Array.from('x')` mid-expression cannot be read as one.
 * Group 2 is the clause between the keyword and `from`, which may span lines;
 * it is what distinguishes a value import from a type-only one.
 */
const IMPORT_FROM = /^\s*(?:import|export)\s+([^'"]*?)\bfrom\s*['"]([^'"]+)['"]/gm;

/** A side-effect import (`import './x'`) — no bindings, but a real runtime edge. */
const BARE_IMPORT = /^\s*import\s*['"]([^'"]+)['"]/gm;

/**
 * THE FILTER THAT MAKES THIS TEST MEASURE WHAT IT PROMISES.
 *
 * The strongly connected component that matters is the one that exists at
 * RUNTIME, so it is built from value imports only. `import type { X } from
 * './y'` is erased by the compiler: it creates no module-eval-time edge, cannot
 * produce an `undefined` binding, and counting it would inflate the component
 * with edges that do not exist in the emitted bundle. tests/purity.test.ts's
 * LAYER_IMPORT regex matches type and value imports alike — correct for its own
 * question ("does sim/ name the ui layer at all?"), wrong for this one.
 *
 * Three shapes have to be told apart:
 *   `import type { X } from './y'`      — type-only, no edge
 *   `import { type X } from './y'`      — every specifier erased, no edge
 *   `import { a, type X } from './y'`   — `a` survives, so the edge is real
 */
function isValueImport(clause: string): boolean {
  const c = clause.trim();
  if (/^type\b/.test(c)) return false;

  const open = c.indexOf('{');
  const close = c.lastIndexOf('}');
  // No braces: a default import, a namespace import, or `export * from` — all
  // of which bind or re-export something at runtime.
  if (open < 0 || close < 0) return true;

  // A default binding sitting outside the braces keeps the edge alive
  // regardless of what is inside them (`import def, { type X } from './y'`).
  const outside = (c.slice(0, open) + c.slice(close + 1)).replace(/[,\s]/g, '');
  if (outside.length > 0) return true;

  const specs = c.slice(open + 1, close).split(',').map(s => s.trim()).filter(Boolean);
  if (specs.length === 0) return false;
  return specs.some(s => !/^type\b/.test(s));
}

/** '../packages/sim/src/defs/blessings.ts' -> 'defs/blessings' */
function moduleId(globKey: string): string {
  return globKey.slice(SRC_PREFIX.length).replace(/\.ts$/, '');
}

/** Resolves a relative specifier against the importing module's directory. */
function resolveSpecifier(fromId: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null; // bare specifier: outside the package
  const slash = fromId.lastIndexOf('/');
  const parts = slash < 0 ? [] : fromId.slice(0, slash).split('/');
  for (const seg of spec.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/').replace(/\.ts$/, '');
}

/** Value-import adjacency over the modules of packages/sim/src. */
function buildGraph(): { nodes: string[]; edges: Map<string, string[]> } {
  const nodes = Object.keys(FILES).map(moduleId).sort();
  const known = new Set(nodes);
  const edges = new Map<string, string[]>();

  for (const [key, src] of Object.entries(FILES)) {
    const from = moduleId(key);
    const code = stripComments(src);
    const targets = new Set<string>();

    for (const m of code.matchAll(IMPORT_FROM)) {
      if (!isValueImport(m[1])) continue;
      const to = resolveSpecifier(from, m[2]);
      if (to && known.has(to) && to !== from) targets.add(to);
    }
    for (const m of code.matchAll(BARE_IMPORT)) {
      const to = resolveSpecifier(from, m[1]);
      if (to && known.has(to) && to !== from) targets.add(to);
    }
    edges.set(from, [...targets].sort());
  }
  return { nodes, edges };
}

/** Tarjan's SCC. Recursive is fine — the graph is a couple of dozen nodes. */
function stronglyConnectedComponents(nodes: string[], edges: Map<string, string[]>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  const connect = (v: string): void => {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);

    for (const w of edges.get(v) ?? []) {
      if (!index.has(w)) {
        connect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }

    if (low.get(v) === index.get(v)) {
      const component: string[] = [];
      for (;;) {
        const w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
        if (w === v) break;
      }
      components.push(component.sort());
    }
  };

  for (const v of nodes) if (!index.has(v)) connect(v);
  return components;
}

const { nodes, edges } = buildGraph();
const components = stronglyConnectedComponents(nodes, edges);
const cycles = components
  .filter(c => c.length > 1)
  .sort((a, b) => a.length - b.length || a.join(',').localeCompare(b.join(',')));
const largest = cycles.reduce<string[]>((a, b) => (b.length > a.length ? b : a), []);

describe('ciclo de imports de packages/sim', () => {
  it('o grafo foi realmente lido', () => {
    // A glob that silently matched nothing would make every assertion below
    // pass vacuously, which is the classic way a meta-test rots.
    expect(nodes.length).toBeGreaterThan(20);
    expect(nodes).toContain('xp');
    expect(nodes).toContain('levelup');
  });

  it('o maior componente fortemente conexo cabe no teto', () => {
    expect(
      largest.length,
      `o maior ciclo tem ${largest.length} módulos (teto ${MAX_SCC}): ${largest.join(', ')}`,
    ).toBeLessThanOrEqual(MAX_SCC);
  });

  it('os ciclos remanescentes são exatamente os dois conhecidos', () => {
    expect(cycles).toEqual(EXPECTED_CYCLES);
  });

  it('xp não volta a importar run nem shop', () => {
    // The two edges plan 01-08 cut. They are called out by name because they
    // are the ones a future change is most likely to reintroduce: anything that
    // wants to resolve `world.pendingAfterLevelUp` will reach for them.
    expect(edges.get('xp')).not.toContain('run');
    expect(edges.get('xp')).not.toContain('shop');
  });

  it('nada dentro do ciclo importa levelup', () => {
    // levelup.ts only works as a cut while it stays a sink: it holds the two
    // edges that used to close the eight-module component, so an import of it
    // from inside the component drags them straight back in.
    const importers = nodes.filter(n => (edges.get(n) ?? []).includes('levelup'));
    expect(importers, `levelup foi importado por: ${importers.join(', ')}`).toEqual(['index']);
  });
});
