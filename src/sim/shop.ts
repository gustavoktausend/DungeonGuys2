// shop.ts — the between-waves shop: rolling offers, pricing, buying,
// equipping, healing and rerolling. Pure logic only; ui/shop.ts owns the
// markup that reads this module's outputs off `world`.
// Ported from ORIG/items.js:3-19 (openShop/closeShop), :22-27 (equipItem),
// :30-44 (rollOffers), ORIG/ui.js:100-108 (itemPrice), ORIG/items.js:129-143
// (buyOffer), :170-183 (buyEquipOffer), :184-201 (shopHeal/shopReroll).
//
// Deliberate deviations from the original — see task-19-brief.md:
//  - `gold` (a global) becomes `p.gold`: gold is per-player, not per-run.
//  - `forgeLevel('merchant')` becomes `world.config.forge.merchant` (T7 —
//    forge levels are part of RunConfig, sim never reads Save/localStorage).
//  - The original's `[...pool].sort(() => Math.random() - 0.5)` becomes
//    `world.rng.shuffled(pool)` (Fisher-Yates on a copy). Same deliberate
//    correction already applied to the blessing roll in xp.ts (task-16):
//    the original's shuffle is biased toward the pool's original order, so
//    items late in ITEM_POOL/EQUIPMENT would show up less often than items
//    near the front. This is a correction, not a regression.
//  - Every `Math.random()` becomes `world.rng.next()`, never `rng.chance()`
//    — `chance()` skips the draw entirely at `p <= 0`/`p >= 1`, which would
//    desync two machines replaying the same seed (same rule enforced
//    throughout sim/, see run.ts's file header).
//  - `updateHUD()`/`renderShop()` calls are dropped from every mutator here:
//    the HUD reads `world` every frame (task-18) and `ui/shop.ts` redraws
//    itself after calling into these functions. `Sfx.play(...)` becomes
//    `emit(world, { t: 'sfx', name: ... })` (T5).
//  - `openShop`/`closeShop` are exported here (not run.ts) per the brief's
//    interface list, even though `closeShop` calls back into run.ts's
//    `startNextWave` and run.ts's `checkWaveComplete` calls this module's
//    `openShop` — a two-file cycle, same shape (and same safety argument:
//    every cross-reference is used inside a function body, never at
//    module-eval time) as the already-documented enemies.ts<->boss.ts and
//    enemies.ts->xp.ts->run.ts->enemies.ts cycles.
//  - `openShop` keeps the original's `pendingAfterLevelUp` guard (a
//    level-up chosen mid-wave-clear must resolve before the shop can open;
//    see xp.ts's `closeLevelUp`), ported as `world.phase` checks exactly
//    like `victory` (run.ts) and `maybeOpenLevelUp` (xp.ts) already do.
import { emit, setPhase } from './world';
import { startNextWave } from './run';
import { ITEM_POOL, HEAL_PRICE } from './defs/items';
import { EQUIPMENT } from './equipment-catalog';
import { isEligible, canEquip, equipInto } from './equipment';
import { applyMods, recalcStats, playerDmgKind, playerArchetype } from './stats';
import type { EquipItem, Player, ShopItem, World } from './types';

/** ORIG/items.js:3-10. */
export function openShop(world: World, p: Player): void {
  if (world.phase === 'levelup') { world.pendingAfterLevelUp = 'shop'; return; }
  if (world.phase !== 'playing') return;
  setPhase(world, 'shop');
  world.rerollCost = 5;
  rollOffers(world, p);
}

/** ORIG/items.js:12-18, minus requestAnimationFrame (app-layer, T5). */
export function closeShop(world: World): void {
  setPhase(world, 'playing');
  startNextWave(world);
}

/**
 * Places a bought item into its slot, syncs the active weapon, recalculates
 * stats. ORIG/items.js:22-27.
 */
export function equipItem(_world: World, p: Player, item: EquipItem): void {
  p.equipment = equipInto(p.equipment, item);
  // catalog weapons nest their combat params under .weapon; player.weapon
  // must stay flat (same shape as CLASS_DEFS tiers) for combat/render/archetype.
  if (item.slot === 'weapon' && item.weapon) p.weapon = { ...item.weapon, name: item.name };
  recalcStats(p);
}

/** ORIG/items.js:30-44 (see file header for the shuffle deviation). */
export function rollOffers(world: World, p: Player): void {
  // consumables (ITEM_POOL), filtered by the player's damage kind
  const kind = playerDmgKind(p);
  const cPool = ITEM_POOL.filter(it => !it.dmgKind || it.dmgKind === kind);
  world.shopOffers = world.rng.shuffled(cPool).slice(0, 4)
    .map(item => ({ item, sold: false }));

  // equipment (EQUIPMENT), filtered by class/archetype eligibility
  const arch = playerArchetype(p);
  const ePool = EQUIPMENT.filter(it => isEligible(it, p.cls, arch));
  world.shopEquipOffers = world.rng.shuffled(ePool).slice(0, 4)
    .map(item => ({ item, sold: false }));
}

/** ORIG/ui.js:100-108. `p` is unused by the formula (kept for interface
 * symmetry with the other shop functions, all of which take `p`). Accepts
 * either offer kind (ShopItem or EquipItem) since both are priced the
 * same way — only `.price` is read. */
export function itemPrice(world: World, _p: Player, item: ShopItem | EquipItem): number {
  const waveScale = 1 + (world.wave - 1) * 0.06; // pricier as waves go
  const discount = 1 - world.config.forge.merchant * 0.05;
  return Math.max(1, Math.round(item.price * waveScale * discount));
}

/** ORIG/items.js:129-143. */
export function buyOffer(world: World, p: Player, i: number): void {
  const o = world.shopOffers[i];
  if (!o || o.sold) return;
  const price = itemPrice(world, p, o.item);
  if (p.gold < price) return;
  p.gold -= price;
  o.sold = true;
  applyMods(p, o.item.mods);
  emit(world, { t: 'sfx', name: 'buy' });
}

/** ORIG/items.js:170-183. */
export function buyEquipOffer(world: World, p: Player, i: number): void {
  const o = world.shopEquipOffers[i];
  if (!o || o.sold) return;
  if (!canEquip(o.item, p.equipment)) return; // shield vs 2H
  const price = itemPrice(world, p, o.item);
  if (p.gold < price) return;
  p.gold -= price;
  o.sold = true;
  equipItem(world, p, o.item);
  emit(world, { t: 'sfx', name: 'buy' });
}

/** ORIG/items.js:184-190. */
export function shopHeal(world: World, p: Player): void {
  if (p.gold < HEAL_PRICE || p.hp >= p.maxHp) return;
  p.gold -= HEAL_PRICE;
  p.hp = Math.min(p.maxHp, p.hp + 30);
  emit(world, { t: 'sfx', name: 'potion' });
}

/** ORIG/items.js:192-198. */
export function shopReroll(world: World, p: Player): void {
  if (p.gold < world.rerollCost) return;
  p.gold -= world.rerollCost;
  world.rerollCost += 5;
  rollOffers(world, p);
}
