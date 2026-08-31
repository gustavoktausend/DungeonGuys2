// constants.ts — fixed timestep and world geometry.
//
// ─── Floating-point doctrine for sim/ ─────────────────────────────────────────
// ECMAScript leaves the engine's built-in sine, cosine, two-argument arc
// tangent and euclidean norm IMPLEMENTATION-APPROXIMATED: the spec asks only
// for an approximation, so two engines (a Chrome peer, a Firefox peer) may
// legitimately return different bits for the same inputs. The square root is
// the exception — the spec pins it to IEEE-754, so `Math.sqrt` is bit-exact
// everywhere and stays.
//
// So sim/ uses `Math.sqrt(dx * dx + dy * dy)` and never the built-in norm.
// (Yes, that norm guards against intermediate overflow and a sqrt of squares
// does not; at this game's magnitudes — a 2400x1600 world — that cannot arise.)
//
// SETTLED, and measured in THIS repository rather than inferred. The phase's
// research probe ran 3000 ticks through four engines and got THREE different
// fingerprints — Node `9f870f80`, Chromium `18539474`, Firefox and WebKit
// agreeing with each other on `e934dfd7`. Plan 01-04 then built the versioned
// golden gate and measured it again there: Node recorded `d3a93053` and all
// three browsers answered `fa099f16`, first disagreeing at tick 960 and still
// disagreeing at tick 3000 (23 of 50 checkpoints in Chromium, 24 of 50 in
// Firefox and WebKit). It is not theoretical and it is not small.
//
// Plan 01-09 vendored a bit-exact port of those three functions into
// `sim/math.ts` (FreeBSD msun + Go, polynomials over `+ - * /` only, proven
// against an oracle by `Object.is`), and plan 01-12 pointed all 27 call sites
// in sim/ at it. `eslint.config.js` now refuses the engine's versions inside
// packages/sim/src so they cannot come back by habit, and
// `tests/cross-engine.test.ts` is the gate that would notice if they did.
//
// The remaining `Math.*` in sim/ are the ones the spec fixes exactly: sqrt,
// PI, max, min, round, floor, abs, imul and trunc.
//
// Note that neither determinism test in this suite can catch this class of
// divergence on its own: both compare two worlds in the SAME process, on the
// same engine. Only the browser leg of the gate can.

/** One simulation tick, in milliseconds. The sim never sees any other delta. */
export const DT_MS = 1000 / 60;

/**
 * The original game multiplied per-frame velocities by `dt / 16.67`.
 * Keeping that divisor preserves the exact tuning of every speed constant.
 */
export const TICK_FACTOR = DT_MS / 16.67;

export const TILE = 32;

/** Logical world size, independent of any window. */
export const WORLD = { w: 2400, h: 1600 } as const;

// ─── Stamina / sprint (ORIG/ui.js:51-55) ──────────────────────────────────────
export const STAMINA_BASE  = 100;
export const SPRINT_MULT   = 1.55; // speed while sprinting
export const FATIGUE_MULT  = 0.7;  // speed while stamina is recovering
export const STAMINA_DRAIN = 30;   // per second while sprinting
export const STAMINA_REGEN = 18;   // per second while recovering

/** ms before a kill streak lapses (ORIG/ui.js:110). */
export const COMBO_WINDOW = 3000;

/**
 * px radius auto-collect. The original's value is 80 (ORIG/config.js:4);
 * this is the one number Task 21 raised. Measured with the same scripted
 * bot on both games, "coins still on the floor when the wave ends" over
 * waves 1-5: the original loses 23.98% +/- 1.52 (22 runs read out of the
 * running original), this port at 80 loses 28.51% +/- 0.27 (800 seeds,
 * headless). At 100 the port loses 24.66% — back on the original's number.
 * See docs/PARIDADE.md for the full response curve and the caveat about
 * the original's frame-rate dependence.
 */
export const COIN_MAGNET = 100;

/**
 * Size multiplier an enemy gets when its definition does not name one — it is
 * written straight into `Enemy.scale`, so it is WORLD STATE, versioned by
 * SIM_VERSION and observable by any replay. That is why the number stays here.
 *
 * What left is the NAME. It used to be named after sprites, which made it look
 * like a drawing concern filed in the wrong package, and D-19 retires that idea
 * from this package entirely: the new art is 32x48 authored at scale 1, so
 * `render/entities.ts` keeps its own local constant for how big to draw things
 * and this one stops pretending to be about pixels. Phase 7 flips the
 * render-side number to 1 when that art lands, and — because of this rename —
 * that change will not touch packages/sim and will not close a season.
 *
 * ORIG/config.js:5.
 */
export const DEFAULT_ENTITY_SCALE = 2;

/** ORIG/entities.js:58. */
export const WAVES_TOTAL = 16;

/** Share of run gold forged into soul gold (ORIG/ui.js:473). */
export const FORGE_RATE = 0.25;
