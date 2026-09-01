// workspaces.test.ts — the executable half of D2-04: server dependencies are
// confined to apps/server, and everything else in this repository publishes
// nothing at runtime.
//
// The constraint in CLAUDE.md is blunt — "sem dependências de runtime no jogo
// publicado (`dependencies` vazio)" — and until this phase it cost nothing to
// keep, because there was nothing to install. That changed the moment
// apps/server took on hono, @hono/node-server, better-sqlite3 and kysely. A
// `npm i <pkg>` typed at the repository root instead of with `-w apps/server`
// is a one-character mistake that nothing else in the toolchain notices: the
// build still passes, the tests still pass, and the game quietly starts
// shipping a server framework to the browser. This file is what notices.
//
// JSON takes no comments, so apps/server/package.json cannot carry its own
// justification for being the one manifest allowed a non-empty `dependencies`.
// It is carried here instead, where it is not just written down but enforced.
import { describe, it, expect } from 'vitest';

// Vite's raw glob, not node:fs — the root tsconfig's `types` is ["vite/client"]
// only, and tools/README.md §4 forbids touching it. Same access pattern as
// purity.test.ts, which reads packages/sim/package.json this way for the same
// `dependencies: {}` assertion.
const MANIFESTS = import.meta.glob<string>(
  [
    '../package.json',
    '../packages/sim/package.json',
    '../packages/protocol/package.json',
    '../apps/server/package.json',
  ],
  { query: '?raw', import: 'default', eager: true },
);

type Manifest = {
  workspaces?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/**
 * Reads one manifest, refusing to pass by vacuity. A glob that matched nothing
 * yields `undefined`, and `JSON.parse(undefined!)` would throw somewhere less
 * legible than here; a glob that matched an empty file yields `''`, which is
 * still a string and would slip past a type check. Hence the length assertion:
 * plan 02-02 learned that one the hard way.
 */
function manifest(path: string): Manifest {
  const raw = MANIFESTS[path];
  expect(typeof raw, `o glob não encontrou ${path}`).toBe('string');
  expect(raw!.length, `${path} está vazio — o glob casou mas não leu nada`).toBeGreaterThan(10);
  return JSON.parse(raw!) as Manifest;
}

/** Every manifest that must declare `dependencies` present and empty. */
const MUST_BE_EMPTY = [
  '../package.json',
  '../packages/sim/package.json',
  '../packages/protocol/package.json',
];

/**
 * The four, and only the four, runtime dependencies apps/server is allowed.
 * All four carry an [OK] verdict in the Package Legitimacy Audit of
 * 02-RESEARCH.md. A fifth one has to be added here in the same commit that
 * installs it — which is precisely the moment to ask whether it was audited,
 * and whether the server really needs it.
 */
const SERVER_DEPS = ['@hono/node-server', 'better-sqlite3', 'hono', 'kysely'];

describe('confinamento de dependências entre workspaces (D2-04)', () => {
  it('a raiz declara os dois globs de workspace, nessa ordem', () => {
    // Exact array, not `toContain`: `packages/*` disappearing would break the
    // sim package silently, and a third glob appearing is a structural change
    // that deserves to be noticed in review rather than discovered later.
    expect(manifest('../package.json').workspaces).toEqual(['packages/*', 'apps/*']);
  });

  it.each(MUST_BE_EMPTY)('%s declara dependencies exatamente vazio', path => {
    // Equality with {}, not "no keys": npm silently deletes an empty object on
    // install, and the invariant of CLAUDE.md is that the key is THERE and
    // empty. `expect(undefined).toEqual({})` fails, which is the whole point —
    // a missing key means the next `npm i` at the root has nothing to collide
    // with, and the invariant stops being visible to anyone reading the file.
    // The reasoning is spelled out at purity.test.ts:85-92.
    expect(manifest(path).dependencies).toEqual({});
  });

  it('apps/server declara exatamente as quatro dependências auditadas', () => {
    const deps = manifest('../apps/server/package.json').dependencies ?? {};
    // Set equality via sorted keys — "nem mais nem menos". A missing one means
    // the server cannot start; an extra one means something arrived without
    // passing the audit.
    expect(Object.keys(deps).sort()).toEqual(SERVER_DEPS);
  });

  it('nenhuma dependência do servidor vazou para a raiz, nem como devDependency', () => {
    // The root `devDependencies` is checked too, and deliberately: installing
    // hono with `-D` at the root would satisfy the `dependencies: {}` test
    // above while still hoisting the package into the root program, where
    // src/ could import it and the bundle would grow. Confinement means the
    // name does not appear at the root at all.
    const root = manifest('../package.json');
    const rootNames = [
      ...Object.keys(root.dependencies ?? {}),
      ...Object.keys(root.devDependencies ?? {}),
    ];
    const leaked = SERVER_DEPS.filter(name => rootNames.includes(name));
    expect(leaked).toEqual([]);
  });
});
