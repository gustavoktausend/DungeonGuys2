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
