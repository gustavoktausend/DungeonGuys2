// step.ts — one simulation tick. Everything the world does happens here,
// in this order. Later tasks add stages; the order is the contract.
import type { InputState, SimEvent, World } from './types';

export function step(world: World, inputs: Record<string, InputState>): void {
  world.tick++;
  void inputs; // stages added in Tasks 9-15
}

/** Hands the tick's events to app/ and clears them. */
export function drainEvents(world: World): SimEvent[] {
  const out = world.events;
  world.events = [];
  return out;
}
