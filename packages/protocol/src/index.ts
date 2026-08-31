// index.ts — the single public surface of @dg2/protocol.
//
// `exports` in package.json declares only "." and deliberately offers no
// subpaths, exactly as @dg2/sim does: one entry means one module graph, which
// is what lets the boundary of the package coincide with the boundary of
// whatever gets hashed or bundled from it.
//
// This package is types, frozen tables and one pure function. It opens no
// socket and holds no state — the transports of phases 3 to 5 import the
// shapes from here, they do not live here.

export * from './version';
