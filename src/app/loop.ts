// loop.ts — the browser adapter for the fixed timestep, and nothing else.
// The tick arithmetic lives in stepper.ts, which knows no wall clock; what
// stays here is the clock reading, the frame pump and the running flag.
// Rendering interpolates between the last two states so a 60Hz simulation
// does not stutter on a 144Hz display.
import { createStepper } from './stepper';
import type { InputState, World } from '../sim/types';

export type LoopHooks = {
  collectInputs(tick: number): Record<string, InputState>;
  afterStep(world: World): void;
  render(world: World, alpha: number): void;
};

/** Starts the loop; the returned function stops it. */
export function startLoop(world: World, hooks: LoopHooks): () => void {
  const stepper = createStepper(world);
  let last = performance.now();
  let raf = 0;
  let running = true;

  const frame = (now: number) => {
    if (!running) return;
    // Wrapped rather than passed by reference: hooks are methods, and a bare
    // reference would drop their `this`.
    const alpha = stepper.advance(
      now - last,
      tick => hooks.collectInputs(tick),
      stepped => hooks.afterStep(stepped),
    );
    last = now;

    hooks.render(world, alpha);
    raf = requestAnimationFrame(frame);
  };

  raf = requestAnimationFrame(frame);
  return () => {
    running = false;
    cancelAnimationFrame(raf);
  };
}
