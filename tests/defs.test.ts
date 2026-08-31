import { describe, it, expect } from 'vitest';
import {
  CLASS_DEFS, CLASS_KEYS, ENEMY_DEFS, ELITE_TYPES, MINIBOSS_WAVES,
  ITEM_POOL, LEVELUP_POOL, MUTATORS, baseStats,
} from '@dg2/sim';

const STAT_KEYS = new Set([...Object.keys(baseStats()), 'maxHp']);

describe('defs de classes', () => {
  it('tem as 7 classes, cada uma com 3 tiers', () => {
    expect(CLASS_KEYS).toHaveLength(7);
    for (const k of CLASS_KEYS) {
      expect(CLASS_DEFS[k]).toBeDefined();
      expect(CLASS_DEFS[k].tiers).toHaveLength(3);
    }
  });

  it('todo tier tem dano [min, max] com min <= max e fireRate positivo', () => {
    for (const k of CLASS_KEYS) {
      for (const t of CLASS_DEFS[k].tiers) {
        expect(t.damage).toHaveLength(2);
        expect(t.damage[0]).toBeLessThanOrEqual(t.damage[1]);
        expect(t.fireRate).toBeGreaterThan(0);
        expect(t.range).toBeGreaterThan(0);
      }
    }
  });

  it('armas melee têm arc e knockback; armas de projétil têm bulletSpeed', () => {
    for (const k of CLASS_KEYS) {
      for (const t of CLASS_DEFS[k].tiers) {
        if (t.attack === 'melee') {
          expect(t.arc).toBeGreaterThan(0);
          expect(t.knockback).toBeGreaterThan(0);
        } else {
          expect(t.bulletSpeed).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('defs de inimigos', () => {
  it('todo inimigo tem hp, speed e caixa positivos', () => {
    for (const [name, d] of Object.entries(ENEMY_DEFS)) {
      expect(d.hp, name).toBeGreaterThan(0);
      expect(d.speed, name).toBeGreaterThan(0);
      expect(d.w, name).toBeGreaterThan(0);
      expect(d.h, name).toBeGreaterThan(0);
    }
  });

  it('tudo que um chefe invoca existe no catálogo', () => {
    for (const [name, d] of Object.entries(ENEMY_DEFS)) {
      for (const s of d.summons ?? []) {
        expect(ENEMY_DEFS[s], `${name} invoca ${s}`).toBeDefined();
      }
    }
  });

  it('as waves de mini-boss apontam para inimigos existentes marcados como boss', () => {
    for (const [wave, type] of Object.entries(MINIBOSS_WAVES)) {
      const def = ENEMY_DEFS[type];
      expect(def, `wave ${wave}`).toBeDefined();
      expect(def.boss, `wave ${wave}`).toBeTruthy();
    }
  });

  it('todo elite tem tint e multiplicador de hp', () => {
    for (const [name, e] of Object.entries(ELITE_TYPES)) {
      expect(e.tint, name).toMatch(/^#[0-9a-f]{6}$/i);
      expect(e.hp, name).toBeGreaterThan(1);
    }
  });
});

describe('tabelas de progressão', () => {
  it('todo mod de item e de bênção usa uma chave de stat válida', () => {
    for (const it of ITEM_POOL) {
      for (const k of Object.keys(it.mods)) {
        expect(STAT_KEYS.has(k), `${it.name} usa mod desconhecido "${k}"`).toBe(true);
      }
    }
    for (const b of LEVELUP_POOL) {
      for (const k of Object.keys(b.mods)) {
        expect(STAT_KEYS.has(k), `${b.name} usa mod desconhecido "${k}"`).toBe(true);
      }
    }
  });

  it('todo item da loja tem preço positivo e nome único', () => {
    const names = ITEM_POOL.map(i => i.name);
    expect(new Set(names).size).toBe(names.length);
    for (const it of ITEM_POOL) expect(it.price, it.name).toBeGreaterThan(0);
  });

  it('as bênçãos restritas usam apenas os três dmgKind conhecidos', () => {
    for (const b of LEVELUP_POOL) {
      if (b.dmgKind) expect(['melee', 'arrow', 'elemental']).toContain(b.dmgKind);
    }
  });

  it('os 5 mutadores têm nome e descrição', () => {
    expect(Object.keys(MUTATORS)).toHaveLength(5);
    for (const [k, m] of Object.entries(MUTATORS)) {
      expect(m.name, k).toBeTruthy();
      expect(m.desc, k).toBeTruthy();
    }
  });
});
