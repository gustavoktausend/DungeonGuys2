// tests/equipment.test.ts — pure-module checks, ported from ORIG/tests/equipment.test.js.
import { describe, it, expect } from 'vitest';
import * as eq from '@dg2/sim';
import type { EquipItem, Stats, Mods } from '@dg2/sim';

describe('EQUIP_SLOTS', () => {
  it('should have 8 slots', () => {
    expect(eq.EQUIP_SLOTS.length).toBe(8);
  });

  it('includes weapon, amulet, ring1 and ring2', () => {
    expect(eq.EQUIP_SLOTS.includes('weapon') && eq.EQUIP_SLOTS.includes('amulet')).toBe(true);
    expect(eq.EQUIP_SLOTS.includes('ring1') && eq.EQUIP_SLOTS.includes('ring2')).toBe(true);
  });
});

describe('emptyEquipment', () => {
  it('has exactly the EQUIP_SLOTS keys', () => {
    const empty = eq.emptyEquipment();
    expect(Object.keys(empty).sort()).toEqual([...eq.EQUIP_SLOTS].sort());
  });

  it('all slots null', () => {
    const empty = eq.emptyEquipment();
    expect(eq.EQUIP_SLOTS.every((s) => empty[s] === null)).toBe(true);
  });
});

describe('sumEquipmentMods', () => {
  const gear = eq.emptyEquipment();
  gear.helm = { mods: { armor: 2, dmgPct: 5 } } as unknown as EquipItem;
  gear.ring1 = { mods: { dmgPct: 3, maxHp: 20 } } as unknown as EquipItem;
  gear.boots = {} as unknown as EquipItem; // no mods
  const sum = eq.sumEquipmentMods(gear);

  it('sums armor', () => {
    expect(sum.armor).toBe(2);
  });

  it('sums dmgPct across items', () => {
    expect(sum.dmgPct).toBe(8);
  });

  it('sums maxHp', () => {
    expect(sum.maxHp).toBe(20);
  });
});

describe('computeEffectiveStats (maxHp excluded; permStats untouched)', () => {
  const gear = eq.emptyEquipment();
  gear.helm = { mods: { armor: 2, dmgPct: 5 } } as unknown as EquipItem;
  gear.ring1 = { mods: { dmgPct: 3, maxHp: 20 } } as unknown as EquipItem;
  gear.boots = {} as unknown as EquipItem; // no mods
  const perm = { dmgPct: 10, armor: 0, crit: 0 } as unknown as Stats;
  const stats = eq.computeEffectiveStats(perm, gear);

  it('perm 10 + equip 8', () => {
    expect(stats.dmgPct).toBe(18);
  });

  it('armor comes from equipment alone', () => {
    expect(stats.armor).toBe(2);
  });

  it('maxHp must not leak into stats', () => {
    expect((stats as unknown as Mods).maxHp).toBe(undefined);
  });

  it('permStats must not be mutated', () => {
    expect(perm.dmgPct).toBe(10);
  });
});

describe('effectiveMaxHp', () => {
  const gear = eq.emptyEquipment();
  gear.helm = { mods: { armor: 2, dmgPct: 5 } } as unknown as EquipItem;
  gear.ring1 = { mods: { dmgPct: 3, maxHp: 20 } } as unknown as EquipItem;
  gear.boots = {} as unknown as EquipItem; // no mods

  it('adds maxHp mods to permMaxHp', () => {
    expect(eq.effectiveMaxHp(100, gear)).toBe(120);
  });

  it('returns permMaxHp unchanged when nothing is equipped', () => {
    expect(eq.effectiveMaxHp(100, eq.emptyEquipment())).toBe(100);
  });

  it('floored at 30', () => {
    expect(eq.effectiveMaxHp(5, eq.emptyEquipment())).toBe(30);
  });
});
