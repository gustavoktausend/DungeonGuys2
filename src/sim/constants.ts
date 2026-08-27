// constants.ts — fixed timestep and world geometry.

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

/** px radius auto-collect (ORIG/config.js:4). */
export const COIN_MAGNET = 80;

/** ORIG/config.js:5. */
export const SPRITE_SCALE = 2;

/** ORIG/entities.js:58. */
export const WAVES_TOTAL = 16;

/** Share of run gold forged into soul gold (ORIG/ui.js:473). */
export const FORGE_RATE = 0.25;
