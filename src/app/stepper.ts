// stepper.ts — the fixed-timestep driver, with no wall clock and no frame
// pump: the caller hands in the elapsed milliseconds. That single property is
// what lets a unit test, a headless Node replay and a future authoritative
// server drive the exact same simulation the browser drives.
//
// The arithmetic is loop.ts's old frame() verbatim, moved rather than
// rewritten — the render pacing must not change just because the code did.
// See tests/stepper.test.ts for the one place where IEEE-754 makes that
// arithmetic surprising (DT_MS * 3 is not three whole slices).
import { DT_MS, step } from '@dg2/sim';
import type { World } from '@dg2/sim';
import type { LoopHooks } from './loop';

/** A long stall (a backgrounded tab) must not trigger a spiral of death. */
export const MAX_CATCHUP_MS = DT_MS * 5;

export type Stepper = {
  /**
   * Advances the world by whole ticks paid for by `elapsedMs`, and returns
   * the render interpolation alpha (the leftover fraction of a tick).
   */
  advance(
    elapsedMs: number,
    collect: LoopHooks['collectInputs'],
    afterStep?: LoopHooks['afterStep'],
  ): number;
  /** Replay/verification driver: exactly n ticks, no elapsed time involved. */
  runTicks(n: number, collect: LoopHooks['collectInputs']): void;
};

export function createStepper(world: World): Stepper {
  let carry = 0;

  return {
    advance(elapsedMs, collect, afterStep) {
      carry += Math.min(elapsedMs, MAX_CATCHUP_MS);
      while (carry >= DT_MS) {
        step(world, collect(world.tick));
        afterStep?.(world);
        carry -= DT_MS;
      }
      return carry / DT_MS;
    },

    runTicks(n, collect) {
      for (let i = 0; i < n; i++) step(world, collect(world.tick));
    },
  };
}
