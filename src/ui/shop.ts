// shop.ts — the shop screen's markup: equipped-set panel, equipment/consumable
// offers (with buy buttons), heal/reroll, the stats panel, and the "next
// wave" button. All state comes from `world`/`p`; every mutation goes through
// sim/shop.ts's pure functions, never touched directly here.
// Ported from ORIG/items.js:60-64 (fmtMod), :65-128 (renderShop), :144-169
// (equipDelta).
//
// Same "read world, never call back into game logic" split as ui/hud.ts and
// ui/screens.ts (task-18): this module's own click handlers are the one
// exception — they call the pure functions in sim/shop.ts (that's how a
// click becomes a purchase) and then redraw, exactly mirroring the
// original's buyOffer()/shopHeal()/shopReroll() each ending in a
// `renderShop()` call, just split across the sim/ui boundary.
import { dom } from './dom';
import { mouseOnly } from './events';
import {
  EQUIP_SLOTS, canEquip, targetSlot, STAT_LABELS, PCT_STATS,
  itemPrice, buyOffer, buyEquipOffer, shopHeal, shopReroll, closeShop, HEAL_PRICE,
} from '@dg2/sim';
import type { EquipItem, EquipSlot, Equipment, Mods, Player, Stats, Weapon, World } from '@dg2/sim';

const SLOT_LABELS: Record<EquipSlot, string> = {
  weapon: 'WEAPON', offhand: 'OFF-HAND', helm: 'HELM', armor: 'ARMOR',
  boots: 'BOOTS', ring1: 'RING', ring2: 'RING', amulet: 'AMULET',
};
const SLOT_ICONS: Record<EquipSlot, string> = {
  weapon: '⚔', offhand: '🛡', helm: '⛑', armor: '🦺',
  boots: '👢', ring1: '💍', ring2: '💍', amulet: '📿',
};

/** ORIG/items.js:60-63. */
function fmtMod(k: string, v: number): string {
  const sign = v > 0 ? '+' : '';
  return `${sign}${v}${PCT_STATS.has(k) ? '%' : ''} ${STAT_LABELS[k]}`;
}

/** The mods on whatever currently sits in a slot — `Weapon` (the starting
 * tier) never has a `mods` field, only catalog `EquipItem`s do. */
function modsOf(x: Equipment[EquipSlot] | null | undefined): Mods {
  return x && 'mods' in x ? x.mods : {};
}

/** The weapon combat params of whatever currently sits in the weapon slot:
 * a catalog item nests them under `.weapon`; the starting tier IS them
 * (flat, with `damage` at the top level). ORIG/items.js:158. */
function weaponOf(x: Equipment[EquipSlot] | null | undefined): Omit<Weapon, 'name'> | Weapon | null {
  if (!x) return null;
  if ('weapon' in x) return x.weapon ?? null;
  if ('damage' in x) return x;
  return null;
}

/**
 * Short comparison string vs. the item currently in the target slot: mod
 * deltas, plus (for weapons) the average-damage delta. ORIG/items.js:144-169.
 */
export function equipDelta(p: Player, item: EquipItem): string {
  const slot = targetSlot(item, p.equipment);
  const cur = p.equipment[slot];
  const parts: string[] = [];

  const curMods = modsOf(cur);
  const keys = new Set([...Object.keys(item.mods), ...Object.keys(curMods)]);
  for (const k of keys) {
    const key = k as keyof Mods;
    const d = (item.mods[key] ?? 0) - (curMods[key] ?? 0);
    if (d === 0) continue;
    const sign = d > 0 ? '+' : '';
    parts.push(`<span class="${d > 0 ? 'cmp-up' : 'cmp-down'}">${sign}${d}${PCT_STATS.has(k) ? '%' : ''} ${STAT_LABELS[k] || k}</span>`);
  }

  if (item.weapon) {
    const avg = (w: Omit<Weapon, 'name'> | Weapon | null) => (w ? (w.damage[0] + w.damage[1]) / 2 : 0);
    const d = Math.round(avg(item.weapon) - avg(weaponOf(cur)));
    if (d !== 0) {
      const sign = d > 0 ? '+' : '';
      parts.push(`<span class="${d > 0 ? 'cmp-up' : 'cmp-down'}">${sign}${d} DMG</span>`);
    }
  }

  return parts.length ? parts.join('') : '<span class="cmp-same">— no change —</span>';
}

// The world/localId currently on screen, and the click handlers below fire
// asynchronously outside the render loop — same pattern as ui/screens.ts's
// boundWorld/boundLocalId.
let boundWorld: World | null = null;
let boundLocalId: string | null = null;

/** ORIG/items.js:65-128. */
export function renderShop(world: World, localId: string): void {
  boundWorld = world;
  boundLocalId = localId;
  const p = world.players[localId];
  if (!p) return;

  dom.shopGold.textContent = String(p.gold);

  // equipped-set panel (8 slots)
  dom.shopSlots.innerHTML = EQUIP_SLOTS.map(s => {
    const it = p.equipment[s];
    const ico = it && 'icon' in it && it.icon ? it.icon : SLOT_ICONS[s];
    return `<div class="slot-chip ${it ? 'filled' : 'empty'}" title="${SLOT_LABELS[s]}">
        <span class="slot-ico">${ico}</span>
        <span class="slot-lbl">${it ? it.name : SLOT_LABELS[s]}</span>
      </div>`;
  }).join('');

  // equipment offers (with comparison)
  dom.shopEquip.innerHTML = world.shopEquipOffers.map((o, i) => {
    if (o.sold) return `<div class="shop-item offer sold"><span class="shop-name">SOLD</span></div>`;
    const price = itemPrice(world, p, o.item);
    const blocked = !canEquip(o.item, p.equipment);
    const dis = p.gold < price || blocked;
    return `
      <button class="shop-item offer equip" data-i="${i}" ${dis ? 'disabled' : ''}>
        <span class="shop-icon">${o.item.icon}</span>
        <span class="shop-name">${o.item.name}</span>
        <span class="shop-effects">${equipDelta(p, o.item)}</span>
        ${blocked ? '<span class="cmp-down">NEEDS 1-HAND</span>' : ''}
        <span class="shop-price">${price}</span>
      </button>`;
  }).join('');

  // consumable offers
  dom.shopItems.innerHTML = world.shopOffers.map((o, i) => {
    if (o.sold) return `<div class="shop-item offer sold"><span class="shop-name">SOLD</span></div>`;
    const price = itemPrice(world, p, o.item);
    const fx = Object.entries(o.item.mods)
      .map(([k, v]) => `<span class="${(v as number) > 0 ? 'fx-pos' : 'fx-neg'}">${fmtMod(k, v as number)}</span>`).join('');
    return `
      <button class="shop-item offer" data-i="${i}" ${p.gold < price ? 'disabled' : ''}>
        <span class="shop-icon">${o.item.icon}</span>
        <span class="shop-name">${o.item.name}</span>
        <span class="shop-effects">${fx}</span>
        <span class="shop-price">${price}</span>
      </button>`;
  }).join('');

  // heal / reroll
  dom.priceHeal.textContent = String(HEAL_PRICE);
  dom.priceReroll.textContent = String(world.rerollCost);
  dom.btnShopHeal.disabled = p.gold < HEAL_PRICE || p.hp >= p.maxHp;
  dom.btnShopReroll.disabled = p.gold < world.rerollCost;

  // stats panel (only non-zero stats)
  const st = p.stats;
  const rows: [string, string | number][] = [['MAX HP', p.maxHp], ['HP', Math.ceil(p.hp)]];
  for (const k of Object.keys(st) as (keyof Stats)[]) {
    if (st[k] !== 0) rows.push([STAT_LABELS[k], (st[k] > 0 ? '+' : '') + st[k] + (PCT_STATS.has(k) ? '%' : '')]);
  }
  dom.shopStats.innerHTML = rows.map(([l, v]) => `<div class="stat-line"><span>${l}</span><span>${v}</span></div>`).join('');
}

function redraw(): void {
  if (boundWorld && boundLocalId) renderShop(boundWorld, boundLocalId);
}

function currentPlayer(): Player | null {
  if (!boundWorld || !boundLocalId) return null;
  return boundWorld.players[boundLocalId] ?? null;
}

// ORIG/items.js:129-143 (buyOffer), click-delegated over the consumables list.
dom.shopItems.addEventListener('click', e => {
  if (e.detail === 0) return; // keyboard-activated click, not a real click
  const btn = (e.target as HTMLElement).closest('.shop-item[data-i]') as HTMLElement | null;
  if (!btn || !boundWorld) return;
  const p = currentPlayer();
  if (!p) return;
  buyOffer(boundWorld, p, Number(btn.dataset.i));
  redraw();
});

// ORIG/items.js:170-183 (buyEquipOffer), click-delegated over the equipment list.
dom.shopEquip.addEventListener('click', e => {
  if (e.detail === 0) return; // keyboard-activated click, not a real click
  const btn = (e.target as HTMLElement).closest('.shop-item[data-i]') as HTMLElement | null;
  if (!btn || !boundWorld) return;
  const p = currentPlayer();
  if (!p) return;
  buyEquipOffer(boundWorld, p, Number(btn.dataset.i));
  redraw();
});

// ORIG/items.js:184-190 (shopHeal).
dom.btnShopHeal.addEventListener('click', mouseOnly(() => {
  const p = currentPlayer();
  if (!boundWorld || !p) return;
  shopHeal(boundWorld, p);
  redraw();
}));

// ORIG/items.js:192-198 (shopReroll).
dom.btnShopReroll.addEventListener('click', mouseOnly(() => {
  const p = currentPlayer();
  if (!boundWorld || !p) return;
  shopReroll(boundWorld, p);
  redraw();
}));

// ORIG/items.js:12-18 (closeShop) — the "leave shop, start next wave" button.
dom.btnNextWave.addEventListener('click', mouseOnly(() => {
  if (!boundWorld) return;
  closeShop(boundWorld);
}));
