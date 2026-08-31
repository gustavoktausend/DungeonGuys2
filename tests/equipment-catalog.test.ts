// tests/equipment-catalog.test.ts — catalog integrity, ported from
// ORIG/tests/equipment-catalog.test.js.
import { describe, it, expect } from 'vitest';
import { EQUIPMENT } from '@dg2/sim';

const VALID_SLOTS = ['weapon', 'offhand', 'helm', 'armor', 'boots', 'ring', 'amulet'];
const VALID_ARCH = ['melee', 'ranged', 'elemental'];
const VALID_ATTACK = ['melee', 'bolt', 'arrow', 'bullet'];
// keys that exist in baseStats()/STAT_LABELS (block added in Task 1) + maxHp
const VALID_STATS = [
  'hpRegen', 'lifeSteal', 'dmgPct', 'meleeDmg', 'rangedDmg', 'elementalDmg',
  'atkSpeedPct', 'crit', 'armor', 'dodge', 'range', 'speedPct', 'luck', 'stamina', 'burn', 'chill', 'block', 'maxHp',
];

// names that must NOT be reused (class tiers + equipment-named consumables)
const FORBIDDEN_NAMES = new Set([
  'APPRENTICE STAFF', 'EMERALD STAFF', 'ARCANE STAFF', 'CURSED STAFF', 'VENOM STAFF', 'PLAGUE STAFF',
  'SHORT BOW', 'ELVEN BOW', 'TWIN BOW', 'RUSTY SWORD', 'KNIGHT SWORD', 'ANIME BLADE',
  'KNIFE', 'MACHETE', 'KATANA', 'MACE', 'WAR HAMMER', 'GOLDEN BLADE', 'PISTOL', 'SMG', 'PLASMA RIFLE',
  'HEAVY PLATE', 'TOWER SHIELD', 'IRON GREAVES',
]);

describe('equipment-catalog', () => {
  it('ids must be unique', () => {
    const ids = EQUIPMENT.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names must be unique', () => {
    const names = EQUIPMENT.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every item has a valid slot, name, price and mods object; weapons carry weapon params, non-weapons do not', () => {
    for (const it of EQUIPMENT) {
      expect(VALID_SLOTS.includes(it.slot)).toBe(true);
      expect(typeof it.name === 'string' && it.name.length > 0).toBe(true);
      expect(!FORBIDDEN_NAMES.has(it.name)).toBe(true);
      expect(typeof it.price === 'number' && it.price > 0).toBe(true);
      expect(it.mods && typeof it.mods === 'object' && !Array.isArray(it.mods)).toBe(true);
      for (const k of Object.keys(it.mods)) {
        expect(VALID_STATS.includes(k)).toBe(true);
      }
      if (it.slot === 'weapon') {
        expect(VALID_ARCH.includes(it.archetype as string)).toBe(true);
        const w = it.weapon;
        expect(w && VALID_ATTACK.includes(w.attack)).toBe(true);
        expect(w && Array.isArray(w.damage) && w.damage.length === 2).toBe(true);
      } else {
        expect(!it.weapon).toBe(true);
      }
    }
  });

  it('has at least one weapon per archetype', () => {
    for (const a of VALID_ARCH) {
      expect(EQUIPMENT.some((i) => i.slot === 'weapon' && i.archetype === a)).toBe(true);
    }
  });

  it('has at least one item per slot', () => {
    for (const s of VALID_SLOTS) {
      expect(EQUIPMENT.some((i) => i.slot === s)).toBe(true);
    }
  });

  it('shields must give block', () => {
    const shields = EQUIPMENT.filter((i) => i.slot === 'offhand');
    expect(shields.length >= 2 && shields.every((s) => (s.mods.block ?? 0) > 0)).toBe(true);
  });
});
