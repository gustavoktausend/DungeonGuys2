// index.ts — the single public surface of @dg2/sim, and the entry point of the
// bundle whose hash becomes SIM_VERSION (D-07).
//
// These two roles are the same file on purpose. SIM_VERSION is the hash of ONE
// emitted bundle, so the package exposes ONE entry: `exports` in package.json
// has only ".", and no subpath entry (no separate `math` export). Whatever is
// not reachable from this barrel does not enter the bundle, which makes the
// boundary of the hash coincide with the boundary of the package.
//
// Consequence for consumers: a file that used to import from two or three
// sim/ modules now has a single import line. That collapse is expected — the
// import diff of the extraction is not 1:1.
//
// Modules are listed alphabetically by specifier. Adding a module here changes
// SIM_VERSION; that is the intended signal, not a side effect.

export * from './arena';
export * from './boss';
export * from './bullets';
export * from './combat';
export * from './constants';
export * from './defs/blessings';
export * from './defs/classes';
export * from './defs/enemies';
export * from './defs/items';
export * from './defs/mutators';
export * from './enemies';
export * from './equipment';
export * from './equipment-catalog';
export * from './levelup';
export * from './loot';
export * from './math';
export * from './player';
export * from './rng';
export * from './run';
export * from './shop';
export * from './special';
export * from './stats';
export * from './step';
export * from './types';
export * from './world';
export * from './xp';
