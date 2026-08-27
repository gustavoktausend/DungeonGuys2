// loop.ts — fixed-timestep driver. The sim only ever advances in DT_MS slices;
// rendering interpolates between the last two states so 60Hz simulation does
// not stutter on a 144Hz display.
import { DT_MS } from '../sim/constants';
import { step } from '../sim/step';
import type { InputState, World } from '../sim/types';

export type LoopHooks = {
  collectInputs(tick: number): Record<string, InputState>;
  afterStep(world: World): void;
  render(world: World, alpha: number): void;
};

/** Starts the loop; the returned function stops it. */
export function startLoop(world: World, hooks: LoopHooks): () => void {
  let last = performance.now();
  let acc = 0;
  let raf = 0;
  let running = true;

  // A long stall (tab in the background) must not trigger a spiral of death.
  const MAX_CATCHUP = DT_MS * 5;

  const frame = (now: number) => {
    if (!running) return;
    acc += Math.min(now - last, MAX_CATCHUP);
    last = now;

    while (acc >= DT_MS) {
      step(world, hooks.collectInputs(world.tick));
      hooks.afterStep(world);
      acc -= DT_MS;
    }

    hooks.render(world, acc / DT_MS);
    raf = requestAnimationFrame(frame);
  };

  raf = requestAnimationFrame(frame);
  return () => {
    running = false;
    cancelAnimationFrame(raf);
  };
}
