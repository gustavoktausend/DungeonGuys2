// step.ts — one simulation tick. Everything the world does happens here,
// in this order. Later tasks add stages; the order is the contract — it
// comes from ORIG/combat.js:3-20, and reordering it changes behavior (e.g.
// a bullet that kills in the same tick an enemy moves resolves differently
// depending on which runs first).
import { updatePlayer } from './player';
import { updateBullets } from './bullets';
import { updateEnemies, updateEnemyBullets } from './enemies';
import { updateSpawnQueue, checkWaveComplete } from './run';
import { DT_MS } from './constants';
import type { InputState, SimEvent, World } from './types';

export function step(world: World, inputs: Record<string, InputState>): void {
  world.tick++;
  if (world.phase !== 'playing') return;
  if (world.comboTimer > 0) {
    world.comboTimer -= DT_MS;
    if (world.comboTimer <= 0) world.combo = 0;
  }
  for (const id of Object.keys(world.players)) {
    const input = inputs[id];
    if (input) updatePlayer(world, world.players[id], input);
  }
  updateBullets(world);
  updateEnemyBullets(world);
  updateEnemies(world);
  // updatePotions(world);   // Task 16
  // updateChests(world);    // Task 16
  // updateCoins(world);     // Task 16
  updateSpawnQueue(world);
  checkWaveComplete(world);
}

/** Hands the tick's events to app/ and clears them. */
export function drainEvents(world: World): SimEvent[] {
  const out = world.events;
  world.events = [];
  return out;
}
