import type { InputState } from '../sim/types';

/** Placeholder until Task 10 wires real keyboard/mouse/touch input. */
export function noInputFor(tick: number): InputState {
  return { tick, move: { x: 0, y: 0 }, aim: 0, attack: false, special: false, sprint: false };
}
