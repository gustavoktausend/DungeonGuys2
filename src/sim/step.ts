// step.ts — one simulation tick. Everything the world does happens here,
// in this order. Later tasks add stages; the order is the contract.
import { updatePlayer } from './player';
import { updateBullets } from './bullets';
import { updateEnemies, updateEnemyBullets } from './enemies';
import type { InputState, SimEvent, World } from './types';

export function step(world: World, inputs: Record<string, InputState>): void {
  world.tick++;
  if (world.phase !== 'playing') return;
  for (const id of Object.keys(world.players)) {
    const input = inputs[id];
    if (input) updatePlayer(world, world.players[id], input);
  }
  updateBullets(world);
  updateEnemyBullets(world);
  updateEnemies(world);
}

/** Hands the tick's events to app/ and clears them. */
export function drainEvents(world: World): SimEvent[] {
  const out = world.events;
  world.events = [];
  return out;
}
