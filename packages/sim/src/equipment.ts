// equipment.ts — pure equipment/stat helpers (no DOM/canvas; usable in Node).
// Per-run gear lives in player.equipment; the effective stats the combat code
// reads are derived from a permanent layer plus the mods of whatever is equipped.
// Ported from ORIG/equipment.js:6-91.

import type {
  Archetype,
  AttackKind,
  ClassKey,
  EquipItem,
  EquipSlot,
  Equipment,
  Mods,
  Stats,
} from './types';

// the eight equipment slots; a two-handed weapon occupies 'weapon' and blocks 'offhand'
export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'offhand', 'helm', 'armor', 'boots', 'ring1', 'ring2', 'amulet'];

// a fresh, fully-empty equipment record
export function emptyEquipment(): Equipment {
  const eq = {} as Equipment;
  for (const s of EQUIP_SLOTS) eq[s] = null;
  return eq;
}

// total stat mods contributed by every equipped item (includes maxHp)
export function sumEquipmentMods(equipment: Equipment): Mods {
  const total: Mods = {};
  for (const s of EQUIP_SLOTS) {
    const item = equipment[s];
    if (!item || !('mods' in item) || !item.mods) continue;
    for (const [k, v] of Object.entries(item.mods)) {
      const key = k as keyof Mods;
      total[key] = (total[key] || 0) + v;
    }
  }
  return total;
}

// permStats + equipment mods (maxHp is handled separately by effectiveMaxHp)
export function computeEffectiveStats(permStats: Stats, equipment: Equipment): Stats {
  const stats: Stats = { ...permStats };
  const mods = sumEquipmentMods(equipment);
  for (const [k, v] of Object.entries(mods)) {
    if (k === 'maxHp') continue;
    const key = k as keyof Stats;
    stats[key] = (stats[key] || 0) + v;
  }
  return stats;
}

// permanent max HP plus any maxHp mods from equipment (never below 30)
export function effectiveMaxHp(permMaxHp: number, equipment: Equipment): number {
  const bonus = sumEquipmentMods(equipment).maxHp || 0;
  return Math.max(30, permMaxHp + bonus);
}

// maps a weapon's attack type to its archetype bucket
export function archetypeOf(attack: AttackKind): Archetype {
  if (attack === 'melee') return 'melee';
  if (attack === 'arrow' || attack === 'bullet') return 'ranged';
  return 'elemental';
}

// is this item usable by the given class/archetype?
// weapons must match the archetype; classReq (if present) gates any item
export function isEligible(item: EquipItem, classKey: ClassKey, archetype: Archetype): boolean {
  if (item.slot === 'weapon' && item.archetype !== archetype) return false;
  if (item.classReq && !item.classReq.includes(classKey)) return false;
  return true;
}

// first empty ring slot, or ring1 when both are full
export function resolveRingSlot(equipment: Equipment): 'ring1' | 'ring2' {
  if (!equipment.ring1) return 'ring1';
  if (!equipment.ring2) return 'ring2';
  return 'ring1';
}

// the concrete slot key an item occupies (rings resolve to ring1/ring2)
export function targetSlot(item: EquipItem, equipment: Equipment): EquipSlot {
  return item.slot === 'ring' ? resolveRingSlot(equipment) : item.slot;
}

// a shield (offhand) cannot be equipped while a two-handed weapon is held
export function canEquip(item: EquipItem, equipment: Equipment): boolean {
  if (item.slot === 'offhand' && equipment.weapon && 'twoHanded' in equipment.weapon && equipment.weapon.twoHanded) return false;
  return true;
}

// returns a NEW equipment object with item placed per the slot rules;
// a two-handed weapon also clears the offhand. Never mutates the input.
export function equipInto(equipment: Equipment, item: EquipItem): Equipment {
  const next = { ...equipment };
  const slot = targetSlot(item, next);
  next[slot] = item;
  if (item.slot === 'weapon' && item.twoHanded) next.offhand = null;
  return next;
}
