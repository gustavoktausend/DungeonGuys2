// step.ts — one simulation tick. Everything the world does happens here,
// in this order. Later tasks add stages; the order is the contract — it
// comes from ORIG/combat.js:3-20, and reordering it changes behavior (e.g.
// a bullet that kills in the same tick an enemy moves resolves differently
// depending on which runs first).
import { updatePlayer } from './player';
import { updateBullets } from './bullets';
import { updateEnemies, updateEnemyBullets } from './enemies';
import { updatePotions, updateChests, updateCoins } from './loot';
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
  // THE CANONICAL ORDER, and it is not a style choice — do not "simplify" it
  // back to walking the Record. Object keys iterate in INSERTION order, so
  // whoever joined first would be updated first, and since updatePlayer ->
  // attack -> dealDamage -> killEnemy -> gainXp all draw from the one global
  // `world.rng`, two rooms that filled in a different order would hand the
  // same draws to different people and drift apart in silence. The order that
  // decides this lives in the run manifest, which the authority writes and the
  // replay already reads (FORM-02/D-13). A slot the manifest lists but nobody
  // occupies, and a slot with no input this tick, are both skipped.
  for (const slot of world.config.players) {
    const p = world.players[slot.id];
    if (!p) continue;
    const input = inputs[slot.id];
    if (input) updatePlayer(world, p, input);
  }
  updateBullets(world);
  updateEnemyBullets(world);
  updateEnemies(world);
  updatePotions(world);
  updateChests(world);
  updateCoins(world);
  updateSpawnQueue(world);
  checkWaveComplete(world);
}

/** Hands the tick's events to app/ and clears them. */
export function drainEvents(world: World): SimEvent[] {
  const out = world.events;
  world.events = [];
  return out;
}
