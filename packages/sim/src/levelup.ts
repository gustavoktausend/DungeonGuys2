// levelup.ts — the blessing pick and the exit door of the level-up screen.
// Ported from ORIG/entities.js:148-159 (pickBlessing) and :161-172
// (closeLevelUp). Both lived in xp.ts until phase 01 / plan 01-08 moved them
// here, body for body, to take two edges out of the strongly connected
// component of sim/ — see the CYCLE CUT note in xp.ts's header for why both
// edges had to leave together, and why a file split (not a deferral of the
// resolution to step()) is the behaviourally neutral way to do it.
//
// This module is deliberately a sink of the dependency graph in the useful
// direction: it imports ./run and ./shop, and nothing inside the component
// imports it back. `pickBlessing`'s only caller is the ui/ layer, and
// `closeLevelUp`'s only caller is `pickBlessing`. Keep it that way — an
// import of this file from anywhere inside {boss, combat, enemies, player,
// special, run, shop, xp} merges the component back into one lump, and
// tests/scc.test.ts will say so.
//
// Deliberate deviations from the original — see task-16-brief.md:
//  - `closeLevelUp` drops `requestAnimationFrame`/`updateHUD` (app-layer,
//    T5) and turns `pendingAfterLevelUp` into `openShop(world, p)` /
//    `victory(world)` — matching `ORIG/entities.js:172`'s `openShop()` call
//    for the `'shop'` case exactly (Task 19 correction: this used to be a
//    bare `setPhase(world, 'shop')`, written before `openShop` existed;
//    that skipped rolling offers, so a level-up racing a wave clear would
//    land on a stale/empty shop — see task-19-report.md). Because `openShop`
//    needs a player, `closeLevelUp` now takes one too — its only caller,
//    `pickBlessing`, already has `p` in scope.
//  - `pickBlessing` keeps the original's `gameState !== 'levelup'` guard,
//    ported as `world.phase !== 'levelup'` (Ruling D on task-16-report.md
//    confirmed this stays — it's a real safety property, not an artifact
//    to drop for a test's convenience). Its three unit tests put the world
//    in `'levelup'` phase before calling it, same as real play would.
import { emit, setPhase } from './world';
import { applyMods } from './stats';
import { rollLevelChoices } from './xp';
import { victory } from './run';
import { openShop } from './shop';
import type { Player, World } from './types';

/** ORIG/entities.js:148-159. */
export function pickBlessing(world: World, p: Player, index: number): void {
  const b = p.levelChoices[index];
  if (!b || world.phase !== 'levelup') return;
  applyMods(p, b.mods);
  emit(world, { t: 'sfx', name: 'upgrade' });
  p.pendingLevelUps--;
  if (p.pendingLevelUps > 0) {
    rollLevelChoices(world, p); // queued level-ups: choose again
  } else {
    closeLevelUp(world, p);
  }
}

/**
 * ORIG/entities.js:161-172, minus requestAnimationFrame/updateHUD (app-layer,
 * T5). Both `pendingAfterLevelUp` branches now go through the same entry
 * points `checkWaveComplete`/`victory` themselves use (`openShop`/`victory`),
 * so there is exactly one door into each screen (see file header — Task 19
 * correction).
 */
export function closeLevelUp(world: World, p: Player): void {
  setPhase(world, 'playing');
  // wave-end events that fired while choosing resume now
  const after = world.pendingAfterLevelUp;
  world.pendingAfterLevelUp = null;
  if (after === 'shop') openShop(world, p);
  if (after === 'victory') victory(world);
}
