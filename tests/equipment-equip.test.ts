// tests/equipment-equip.test.ts — pure equip-rule checks, ported from
// ORIG/tests/equipment-equip.test.js.
import { describe, it, expect } from 'vitest';
import * as eq from '../src/sim/equipment';
import type { EquipItem } from '../src/sim/types';

describe('archetypeOf', () => {
  it('melee -> melee', () => {
    expect(eq.archetypeOf('melee')).toBe('melee');
  });

  it('arrow -> ranged', () => {
    expect(eq.archetypeOf('arrow')).toBe('ranged');
  });

  it('bullet -> ranged', () => {
    expect(eq.archetypeOf('bullet')).toBe('ranged');
  });

  it('bolt -> elemental', () => {
    expect(eq.archetypeOf('bolt')).toBe('elemental');
  });
});

describe('isEligible — weapons must match archetype; classReq gates everything', () => {
  const sword = { slot: 'weapon', archetype: 'melee' } as unknown as EquipItem;
  const ring = { slot: 'ring', archetype: null } as unknown as EquipItem;
  const coproGun = { slot: 'weapon', archetype: 'ranged', classReq: ['coprobo'] } as unknown as EquipItem;

  it('matching weapon archetype is eligible', () => {
    expect(eq.isEligible(sword, 'warrior', 'melee')).toBe(true);
  });

  it('wrong archetype weapon', () => {
    expect(eq.isEligible(sword, 'mage', 'elemental')).toBe(false);
  });

  it('generic ring fits anyone', () => {
    expect(eq.isEligible(ring, 'mage', 'elemental')).toBe(true);
  });

  it('classReq matches the required class', () => {
    expect(eq.isEligible(coproGun, 'coprobo', 'ranged')).toBe(true);
  });

  it('classReq excludes archer', () => {
    expect(eq.isEligible(coproGun, 'archer', 'ranged')).toBe(false);
  });
});

describe('resolveRingSlot', () => {
  it('empty equipment resolves to ring1', () => {
    const e = eq.emptyEquipment();
    expect(eq.resolveRingSlot(e)).toBe('ring1');
  });

  it('ring1 full resolves to ring2', () => {
    const e = eq.emptyEquipment();
    e.ring1 = { slot: 'ring' } as unknown as EquipItem;
    expect(eq.resolveRingSlot(e)).toBe('ring2');
  });

  it('both full -> ring1', () => {
    const e = eq.emptyEquipment();
    e.ring1 = { slot: 'ring' } as unknown as EquipItem;
    e.ring2 = { slot: 'ring' } as unknown as EquipItem;
    expect(eq.resolveRingSlot(e)).toBe('ring1');
  });
});

describe('targetSlot', () => {
  it('non-ring items keep their own slot', () => {
    expect(eq.targetSlot({ slot: 'helm' } as unknown as EquipItem, eq.emptyEquipment())).toBe('helm');
  });

  it('ring items resolve to ring1 when empty', () => {
    expect(eq.targetSlot({ slot: 'ring' } as unknown as EquipItem, eq.emptyEquipment())).toBe('ring1');
  });
});

describe('canEquip — shield blocked only when a two-handed weapon is equipped', () => {
  const shield = { slot: 'offhand' } as unknown as EquipItem;

  it('shield ok with empty weapon', () => {
    const g = eq.emptyEquipment();
    expect(eq.canEquip(shield, g)).toBe(true);
  });

  it('shield ok with 1H weapon', () => {
    const g = eq.emptyEquipment();
    g.weapon = { slot: 'weapon', twoHanded: false } as unknown as EquipItem;
    expect(eq.canEquip(shield, g)).toBe(true);
  });

  it('shield blocked with 2H weapon', () => {
    const g = eq.emptyEquipment();
    g.weapon = { slot: 'weapon', twoHanded: true } as unknown as EquipItem;
    expect(eq.canEquip(shield, g)).toBe(false);
  });
});

describe('equipInto — does not mutate input; 2H clears offhand', () => {
  const base = eq.emptyEquipment();
  base.offhand = { slot: 'offhand', name: 'SHIELD' } as unknown as EquipItem;
  const twoH = { slot: 'weapon', name: 'GREATSWORD', twoHanded: true } as unknown as EquipItem;
  const after = eq.equipInto(base, twoH);

  it('places the item in its slot', () => {
    expect(after.weapon?.name).toBe('GREATSWORD');
  });

  it('2H clears offhand', () => {
    expect(after.offhand).toBe(null);
  });

  it('input not mutated (offhand)', () => {
    expect(!!(base.offhand && base.offhand.name === 'SHIELD')).toBe(true);
  });

  it('input not mutated (weapon)', () => {
    expect(base.weapon).toBe(null);
  });

  it('ring goes to first free slot', () => {
    const r1 = eq.equipInto(eq.emptyEquipment(), { slot: 'ring', name: 'R1' } as unknown as EquipItem);
    expect(r1.ring1?.name).toBe('R1');
  });

  it('second ring goes to ring2', () => {
    const r1 = eq.equipInto(eq.emptyEquipment(), { slot: 'ring', name: 'R1' } as unknown as EquipItem);
    const r2 = eq.equipInto(r1, { slot: 'ring', name: 'R2' } as unknown as EquipItem);
    expect(r2.ring2?.name).toBe('R2');
  });

  it('first ring preserved', () => {
    const r1 = eq.equipInto(eq.emptyEquipment(), { slot: 'ring', name: 'R1' } as unknown as EquipItem);
    const r2 = eq.equipInto(r1, { slot: 'ring', name: 'R2' } as unknown as EquipItem);
    expect(r2.ring1?.name).toBe('R1');
  });
});
