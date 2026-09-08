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
 * The six, and only the six, runtime dependencies apps/server is allowed.
 *
 * The first four carry an [OK] verdict in the Package Legitimacy Audit of
 * 02-RESEARCH.md. `ws` is [OK] in 03-RESEARCH.md's audit (14 years on the
 * registry, no install script); `zod` was [ASSUMED] there and went through a
 * blocking human gate in plan 03-04 before a single `npm install` ran. A
 * seventh one has to be added here in the same commit that installs it — which
 * is precisely the moment to ask whether it was audited, and whether the server
 * really needs it.
 */
const SERVER_DEPS = ['@hono/node-server', 'better-sqlite3', 'hono', 'kysely', 'ws', 'zod'];

/**
 * The two packages phase 3 added, checked by NAME against every other manifest.
 *
 * Separate from SERVER_DEPS above even though it is a subset of it, because the
 * two lists answer different questions: that one is "what may apps/server
 * have", this one is "what must nowhere else have". Deriving the second from
 * the first would tie the confinement check to the size of the allowance, so
 * removing hono one day would quietly stop checking that hono is confined.
 */
const PHASE_3_SERVER_ONLY = ['ws', 'zod'];

/** Manifests that must not name a server package in either dependency map. */
const MUST_NOT_MENTION = MUST_BE_EMPTY;

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

  it('apps/server declara exatamente as seis dependências auditadas', () => {
    const deps = manifest('../apps/server/package.json').dependencies ?? {};
    // Set equality via sorted keys — "nem mais nem menos". A missing one means
    // the server cannot start; an extra one means something arrived without
    // passing the audit.
    expect(Object.keys(deps).sort()).toEqual(SERVER_DEPS);
  });

  it('apps/server fixa ws e zod em versão exata, sem faixa', () => {
    // A caret range is how a package you audited becomes a package you did not:
    // `npm install` inside the range picks up whatever was published since, and
    // the audit in 03-RESEARCH.md was run against a specific tarball. The
    // @types/* entries below are deliberately NOT held to this — they carry no
    // runtime code, so a wider range there costs nothing.
    const deps = manifest('../apps/server/package.json').dependencies ?? {};
    for (const name of PHASE_3_SERVER_ONLY) {
      expect(deps[name], `${name} deveria estar em dependencies`).toBeTypeOf('string');
      expect(deps[name], `${name} está numa faixa, não numa versão fixa`).toMatch(
        /^[0-9]+\.[0-9]+\.[0-9]+$/,
      );
    }
  });

  it('apps/server declara @types/ws em devDependencies, não em dependencies', () => {
    const server = manifest('../apps/server/package.json');
    // The distinction is not bookkeeping: `npm run server:build` bundles
    // `dependencies` into dist-server/server.mjs, and a types-only package in
    // that list is a package esbuild would try to resolve at build time.
    expect(Object.keys(server.devDependencies ?? {})).toContain('@types/ws');
    expect(Object.keys(server.dependencies ?? {})).not.toContain('@types/ws');
  });

  it.each(MUST_NOT_MENTION)('%s não menciona ws nem zod, em nenhum dos dois mapas', path => {
    // The whole point of the gate: `npm i zod` typed without `-w apps/server`
    // puts a validator in the browser bundle of a game whose entire published
    // dependency list is supposed to be empty (C-1). The `dependencies: {}`
    // test above would catch it at the root — but NOT with `-D`, and not at all
    // in packages/sim or packages/protocol, whose devDependencies this reaches.
    const m = manifest(path);
    const names = [
      ...Object.keys(m.dependencies ?? {}),
      ...Object.keys(m.devDependencies ?? {}),
    ];
    const leaked = PHASE_3_SERVER_ONLY.filter(name => names.includes(name));
    expect(leaked).toEqual([]);
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
