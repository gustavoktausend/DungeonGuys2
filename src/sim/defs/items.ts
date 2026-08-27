// items.ts — ITEM_POOL, HEAL_PRICE, ported verbatim from ORIG/ui.js:70-97, :98.
// dmgKind restricts the offer to classes using that damage type (no dead picks)

import type { ShopItem } from '../types';

export const ITEM_POOL: ShopItem[] = [
  { name: 'WHETSTONE',       icon: '🗡', price: 18, dmgKind: 'melee',     mods: { meleeDmg: 3 } },
  { name: 'BROADHEAD TIPS',  icon: '🏹', price: 18, dmgKind: 'arrow',     mods: { rangedDmg: 3 } },
  { name: 'FIRE GEM',        icon: '🔥', price: 18, dmgKind: 'elemental', mods: { elementalDmg: 3 } },
  { name: 'POWER CRYSTAL',   icon: '💎', price: 30, mods: { dmgPct: 8 } },
  { name: 'SWIFT BOOTS',     icon: '👢', price: 24, mods: { speedPct: 8 } },
  { name: 'HEAVY PLATE',     icon: '🛡', price: 28, mods: { armor: 3, speedPct: -3 } },
  { name: 'LUCKY CLOVER',    icon: '🍀', price: 20, mods: { luck: 15 } },
  { name: 'VAMPIRE FANG',    icon: '🦇', price: 32, mods: { lifeSteal: 4 } },
  { name: 'HEALING HERBS',   icon: '🌿', price: 26, mods: { hpRegen: 2 } },
  { name: 'ADRENALINE VIAL', icon: '⚡', price: 30, mods: { atkSpeedPct: 10 } },
  { name: 'EAGLE EYE',       icon: '👁', price: 20, mods: { range: 30 } },
  { name: 'JAGGED DAGGER',   icon: '🔪', price: 30, mods: { crit: 8 } },
  { name: 'GIANT BELT',      icon: '🥋', price: 34, mods: { maxHp: 25, speedPct: -4 } },
  { name: 'SHADOW CLOAK',    icon: '🌑', price: 30, mods: { dodge: 8, dmgPct: -5 } },
  { name: 'BLOOD PACT',      icon: '🩸', price: 40, mods: { meleeDmg: 4, rangedDmg: 4, elementalDmg: 4, maxHp: -15 } },
  { name: 'BERSERK TONIC',   icon: '🧪', price: 35, mods: { atkSpeedPct: 15, armor: -2 } },
  { name: 'ENERGY DRINK',    icon: '🥤', price: 22, mods: { stamina: 30 } },
  { name: 'IRON GREAVES',    icon: '🥾', price: 30, mods: { armor: 2, stamina: -20 } },
  { name: 'TOWER SHIELD',    icon: '🏰', price: 36, mods: { armor: 5, atkSpeedPct: -8 } },
  { name: 'CURSED SKULL',    icon: '💀', price: 38, mods: { dmgPct: 15, maxHp: -10, hpRegen: -1 } },
  { name: 'EMBER BRAND',     icon: '🔥', price: 30, mods: { burn: 15 } },
  { name: 'FROST RUNE',      icon: '❄', price: 28, mods: { chill: 18 } },
];

export const HEAL_PRICE = 10;
