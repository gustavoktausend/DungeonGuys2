// loot.ts — coins, potions and chests: floor loot not dropped directly by
// killEnemy (that lives in enemies.ts).
// Ported from ORIG/entities.js:473-502 (updateCoins), ORIG/items.js:203-221
// (updatePotions), :223-245 (updateChests), :247-278 (lootChest).
//
// Deliberate deviations from the original — see task-16-brief.md and
// task-16-report.md:
//  - Coins and potions target and credit the *nearest living player*
//    (`p.gold += …`), not a global `player`/`gold`. `world.runGoldEarned`
//    stays the run total.
//  - `updateChests` looks for ANY player within the opening radius, not a
//    single global one.
//  - The mimic a chest can conceal is spawned through enemies.ts's
//    `makeEnemy`.
//  - `RunConfig.forge.golden` (Ruling A on task-16-report.md — the six-key
//    forge type was missing this perk) drives the coin double-chance
//    exactly as `ORIG/entities.js:494`: `world.rng.next() < golden * 0.1`,
//    an *unconditional* draw even at level 0. Using `rng.chance()` here
//    would skip that draw entirely and desync a golden-level-0 run from
//    one that has ever leveled the perk.
//  - `Chest.fade` (Ruling B on task-16-report.md — the type was missing
//    this field) decays exactly as `ORIG/items.js:227`
//    (`ch.fade -= dt / 1500`), and `world.chests` is filtered with the
//    original's exact condition, `ch.state !== 'looted' || ch.fade > 0`.
//  - Every `Math.random()` becomes `world.rng.next()`/`.int()` — see
//    task-16-report.md for the exact draw-by-draw accounting per branch.
import { emit } from './world';
import { COIN_MAGNET, TICK_FACTOR, DT_MS } from './constants';
import { makeEnemy, nearestPlayer } from './enemies';
import type { Chest, Player, World } from './types';

/** ORIG/entities.js:473-502. */
export function updateCoins(world: World): void {
  const factor = TICK_FACTOR;
  for (const c of world.coins) {
    if (c.dead) continue;
    c.bob += 0.05 * factor;
    // slow down
    c.vx *= 0.92;
    c.vy *= 0.92;
    c.x += c.vx * factor;
    c.y += c.vy * factor;

    const target = nearestPlayer(world, c.x, c.y);
    if (!target) continue; // nobody alive to attract or collect it

    const dx = target.x - c.x;
    const dy = target.y - c.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < COIN_MAGNET) {
      const pull = (1 - dist / COIN_MAGNET) * 4;
      c.x += (dx / dist) * pull * factor;
      c.y += (dy / dist) * pull * factor;
    }
    if (dist < 14) {
      c.dead = true;
      // unconditional draw, even at golden level 0 (Ruling A) — matching
      // `chance()` here would skip it and desync a level-0 run against one
      // that has ever rolled the perk.
      const doubled = world.rng.next() < world.config.forge.golden * 0.1 ? 2 : 1;
      target.gold += doubled;
      world.runGoldEarned += doubled;
      emit(world, { t: 'particles', x: c.x, y: c.y, color: '#ffd700', count: 4 });
      emit(world, { t: 'sfx', name: 'coin' });
    }
  }
  world.coins = world.coins.filter(c => !c.dead);
}

/** ORIG/items.js:203-221 (auto-used on touch). */
export function updatePotions(world: World): void {
  for (const pt of world.potions) {
    if (pt.dead) continue;
    pt.bob += DT_MS * 0.004;

    const target = nearestPlayer(world, pt.x, pt.y);
    if (!target) continue;
    const dx = target.x - pt.x;
    const dy = target.y - pt.y;
    // only picked up when hurt — no waste
    if (target.hp < target.maxHp && Math.sqrt(dx * dx + dy * dy) < 20) {
      pt.dead = true;
      const heal = Math.min(25, target.maxHp - target.hp);
      target.hp += heal;
      emit(world, { t: 'particles', x: target.x, y: target.y, color: '#2ecc71', count: 10 });
      emit(world, { t: 'float', x: target.x, y: target.y - 24, text: `+${heal} HP`, color: '#2ecc71' });
      emit(world, { t: 'sfx', name: 'potion' });
    }
  }
  world.potions = world.potions.filter(pt => !pt.dead);
}

/** ORIG/items.js:223-245. */
export function updateChests(world: World): void {
  for (const ch of world.chests) {
    if (ch.state === 'looted') {
      // empty chest lingers a moment, then fades away
      ch.fade -= DT_MS / 1500;
      continue;
    }

    if (ch.state === 'opening') {
      ch.timer += DT_MS;
      if (ch.timer >= 350) {
        const opener = nearestPlayer(world, ch.x, ch.y);
        if (opener) lootChest(world, opener, ch);
      }
      continue;
    }

    // closed: any player standing close enough starts the open animation
    const near = Object.values(world.players).some(
      p => {
        if (p.hp <= 0) return false;
        const dx = p.x - ch.x, dy = p.y - ch.y;
        return Math.sqrt(dx * dx + dy * dy) < 26;
      },
    );
    if (near) {
      ch.state = 'opening';
      ch.timer = 0;
    }
  }
  world.chests = world.chests.filter(ch => ch.state !== 'looted' || ch.fade > 0);
}

/**
 * ORIG/items.js:247-278 — see task-16-report.md for the branch/draw
 * accounting. `_p` (the opening player) is part of the interface for
 * parity with the original call site, but — like the original, which never
 * reads `player` in this function — nothing here actually uses it.
 */
export function lootChest(world: World, _p: Player, chest: Chest): void {
  chest.state = 'looted';
  chest.fade = 1;
  emit(world, { t: 'sfx', name: 'chest' });
  const roll = world.rng.next();

  if (roll < 0.15) {
    // mimic! it was never a chest at all
    world.chests = world.chests.filter(c => c !== chest);
    emit(world, { t: 'particles', x: chest.x, y: chest.y, color: '#9b59b6', count: 14 });
    emit(world, { t: 'float', x: chest.x, y: chest.y - 24, text: 'MIMIC!', color: '#e74c3c' });
    emit(world, { t: 'sfx', name: 'mimic' });
    world.enemies.push(makeEnemy(world, 'mimic', chest.x, chest.y));
  } else if (roll < 0.6) {
    // gold burst
    const n = 6 + world.rng.int(5);
    for (let i = 0; i < n; i++) {
      const angle = world.rng.next() * Math.PI * 2;
      world.coins.push({
        x: chest.x, y: chest.y,
        vx: Math.cos(angle) * 2.5,
        vy: Math.sin(angle) * 2.5,
        dead: false,
        bob: world.rng.next() * Math.PI * 2,
      });
    }
    emit(world, { t: 'particles', x: chest.x, y: chest.y, color: '#ffd700', count: 12 });
  } else {
    world.potions.push({ x: chest.x, y: chest.y - 20, bob: 0, dead: false });
    emit(world, { t: 'particles', x: chest.x, y: chest.y, color: '#2ecc71', count: 8 });
  }
}
