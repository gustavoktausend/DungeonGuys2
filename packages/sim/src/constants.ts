// constants.ts — fixed timestep and world geometry.
//
// ─── Floating-point doctrine for sim/ ─────────────────────────────────────────
// ECMAScript leaves `Math.hypot`, `Math.sin`, `Math.cos` and `Math.atan2`
// IMPLEMENTATION-DEFINED: the spec only asks for an implementation-approximated
// result, so two engines (a Chrome host, a Firefox client) may legitimately
// return different bits for the same inputs. `Math.sqrt` is the exception —
// the spec pins it to IEEE-754, so it is bit-exact everywhere.
//
// So sim/ uses `Math.sqrt(dx * dx + dy * dy)` and never `Math.hypot`. (Yes,
// `hypot` guards against intermediate overflow and `sqrt` of squares does not;
// at this game's magnitudes — a 2400x1600 world — that cannot arise.)
//
// This does NOT close the property: `sin`, `cos` and `atan2` are still all over
// sim/ (aim, spread, spawn rings, boss patterns) and are just as
// implementation-defined. Replacing them means a `sim/math.ts` with our own
// implementations, which is a Marco 2 architecture decision, deliberately out
// of scope here. OPEN ITEM for Marco 2. Note that no test in this suite can
// catch this class of divergence: both determinism tests compare two worlds in
// the SAME process, on the same engine.

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

/** ORIG/config.js:5. */
export const SPRITE_SCALE = 2;

/** ORIG/entities.js:58. */
export const WAVES_TOTAL = 16;

/** Share of run gold forged into soul gold (ORIG/ui.js:473). */
export const FORGE_RATE = 0.25;
