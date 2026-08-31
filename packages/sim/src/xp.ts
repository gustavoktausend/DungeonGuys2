// xp.ts — leveling and the level-up blessing pick.
// Ported from ORIG/entities.js:68-86 (gainXp), :124-172 (maybeOpenLevelUp,
// rollLevelChoices, pickBlessing, closeLevelUp).
//
// Deliberate deviations from the original — see task-16-brief.md:
//  - `rollLevelChoices` drops the original's `innerHTML` block entirely: it
//    only fills `p.levelChoices` (three Blessing objects, no markup). `ui/`
//    draws the level-up screen from that array. One of the brief's own
//    tests ("não gera HTML") is the guard on this rule.
//  - The original shuffles with `[...pool].sort(() => Math.random() - 0.5)`
//    — a biased shuffle that favours the array's original order. This port
//    uses `world.rng.shuffled(pool)` (Fisher-Yates), which is a
//    *correction*, not a regression: blessings near the end of
//    `LEVELUP_POOL` (IGNITE, FROST) now show up as often as the ones near
//    the front. Flagging this explicitly per the brief so it never reads
//    as an accidental behavior change.
//  - `forgeLevel('wise')` is `world.config.forge.wise`; `tryUnlock('witch')`
//    at level 8 is `emit(world, { t: 'unlock', cls: 'witch' })`.
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
//  - enemies.ts -> xp.ts -> run.ts -> enemies.ts is a module cycle (`killEnemy`
//    calls `gainXp`, `closeLevelUp` calls `run.ts`'s `victory`, and `run.ts`
//    calls `enemies.ts`'s `spawnEnemy`/`nearestPlayer`). Same shape as the
//    already-documented enemies.ts <-> boss.ts cycle: every cross-reference
//    is used inside a function body, never at module-eval time, so it's
//    safe under ESM live bindings. Task 19 adds another edge to the same
//    tangle: `closeLevelUp` also calls `shop.ts`'s `openShop`, and `shop.ts`
//    already calls back into this file's `run.ts` (`closeShop` ->
//    `startNextWave`) — still function-body-only, still safe.
import { emit, setPhase } from './world';
import { LEVELUP_POOL, XP_GROWTH, LEVEL_HP } from './defs/blessings';
import { applyMods, recalcStats, playerDmgKind } from './stats';
import { victory } from './run';
import { openShop } from './shop';
import type { Player, World } from './types';

/** ORIG/entities.js:68-86. */
export function gainXp(world: World, p: Player, amount: number): void {
  const gained = Math.round(amount * (1 + world.config.forge.wise * 0.1));
  p.xp += gained;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.xpNext = Math.round(p.xpNext * XP_GROWTH);
    p.level++;
    p.permMaxHp += LEVEL_HP;
    recalcStats(p);
    p.hp = Math.min(p.maxHp, p.hp + LEVEL_HP);
    p.pendingLevelUps++;
    if (p.level >= 8) emit(world, { t: 'unlock', cls: 'witch' });
    emit(world, { t: 'float', x: p.x, y: p.y - 34, text: 'LEVEL UP!', color: '#66ccff' });
    emit(world, { t: 'sfx', name: 'levelup' });
    emit(world, { t: 'particles', x: p.x, y: p.y, color: '#66ccff', count: 16 });
  }
  maybeOpenLevelUp(world, p);
}

/** ORIG/entities.js:124-129. */
export function maybeOpenLevelUp(world: World, p: Player): void {
  if (p.pendingLevelUps <= 0 || world.phase !== 'playing') return;
  setPhase(world, 'levelup');
  rollLevelChoices(world, p);
}

/**
 * ORIG/entities.js:131-146, minus the `innerHTML` block (see file header):
 * fills `p.levelChoices` with 3 Blessing objects; `ui/` draws them.
 */
export function rollLevelChoices(world: World, p: Player): void {
  const kind = playerDmgKind(p);
  const pool = LEVELUP_POOL.filter(b => !b.dmgKind || b.dmgKind === kind);
  p.levelChoices = world.rng.shuffled(pool).slice(0, 3);
}

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
