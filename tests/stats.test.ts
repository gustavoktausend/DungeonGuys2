import { describe, it, expect } from 'vitest';
import {
  baseStats, recalcStats, startWeapon, maxStamina, playerDmgKind, playerArchetype, applyMods,
  emptyEquipment,
} from '@dg2/sim';
import type { EquipItem, Player } from '@dg2/sim';

function makePlayer(cls: Player['cls'] = 'mage'): Player {
  const weapon = startWeapon(cls);
  const p = {
    id: 'p1', name: 'T', cls,
    x: 0, y: 0, w: 20, h: 20,
    hp: 100, maxHp: 100, speed: 2.6,
    stamina: 100, sprinting: false,
    invincible: 0, specialTimer: 0, attackTimer: 0,
    regenAcc: 0, dustTimer: 0, facing: 0, moving: false,
    walkFrame: 0, walkTimer: 0,
    level: 1, xp: 0, xpNext: 100, gold: 0,
    equipment: emptyEquipment(),
    weapon,
    permStats: baseStats(), permMaxHp: 100,
    stats: baseStats(),
    pendingLevelUps: 0, levelChoices: [],
  } as Player;
  p.equipment.weapon = weapon;
  recalcStats(p);
  return p;
}

const helm: EquipItem = {
  id: 'h_test', name: 'TEST HELM', icon: '⛑', slot: 'helm',
  archetype: null, classReq: null, mods: { armor: 4, dmgPct: 10, maxHp: 25 }, price: 10,
};

describe('baseStats', () => {
  it('começa com as 17 stats zeradas', () => {
    const s = baseStats();
    expect(Object.keys(s)).toHaveLength(17);
    expect(Object.values(s).every(v => v === 0)).toBe(true);
  });

  it('devolve um objeto novo a cada chamada', () => {
    const a = baseStats();
    a.armor = 5;
    expect(baseStats().armor).toBe(0);
  });
});

describe('recalcStats', () => {
  it('soma os mods do equipamento sobre a camada permanente', () => {
    const p = makePlayer();
    p.equipment.helm = helm;
    recalcStats(p);
    expect(p.stats.armor).toBe(4);
    expect(p.stats.dmgPct).toBe(10);
  });

  it('maxHp vem de permMaxHp mais os mods, e não entra em stats', () => {
    const p = makePlayer();
    p.equipment.helm = helm;
    recalcStats(p);
    expect(p.maxHp).toBe(125);
    expect('maxHp' in p.stats).toBe(false);
  });

  it('não deixa hp acima do novo maxHp', () => {
    const p = makePlayer();
    p.hp = 100;
    p.permMaxHp = 60;
    recalcStats(p);
    expect(p.hp).toBe(60);
  });

  it('não altera a camada permanente', () => {
    const p = makePlayer();
    p.equipment.helm = helm;
    recalcStats(p);
    expect(p.permStats.armor).toBe(0);
  });
});

describe('applyMods', () => {
  it('mods permanentes entram em permStats e reaparecem em stats', () => {
    const p = makePlayer();
    applyMods(p, { dmgPct: 4, crit: 3 });
    expect(p.permStats.dmgPct).toBe(4);
    expect(p.stats.crit).toBe(3);
  });

  it('ganhar maxHp permanente também cura essa quantia', () => {
    const p = makePlayer();
    p.hp = 50;
    applyMods(p, { maxHp: 15 });
    expect(p.permMaxHp).toBe(115);
    expect(p.hp).toBe(65);
  });

  it('perder maxHp não cura e nunca desce de 30', () => {
    const p = makePlayer();
    p.permMaxHp = 35;
    p.hp = 35;
    applyMods(p, { maxHp: -20 });
    expect(p.permMaxHp).toBe(30);
    expect(p.hp).toBe(30);
  });
});

describe('classificação de dano', () => {
  it('mage é elemental, archer é arrow/ranged, warrior é melee', () => {
    expect(playerDmgKind(makePlayer('mage'))).toBe('elemental');
    expect(playerArchetype(makePlayer('mage'))).toBe('elemental');
    expect(playerDmgKind(makePlayer('archer'))).toBe('arrow');
    expect(playerArchetype(makePlayer('archer'))).toBe('ranged');
    expect(playerDmgKind(makePlayer('warrior'))).toBe('melee');
    expect(playerArchetype(makePlayer('warrior'))).toBe('melee');
  });

  it('coprobo atira bullet, que é arrow em dmgKind e ranged em archetype', () => {
    expect(playerDmgKind(makePlayer('coprobo'))).toBe('arrow');
    expect(playerArchetype(makePlayer('coprobo'))).toBe('ranged');
  });
});

describe('maxStamina', () => {
  it('é 100 mais a stat de stamina', () => {
    const p = makePlayer();
    expect(maxStamina(p)).toBe(100);
    p.permStats.stamina = 30;
    recalcStats(p);
    expect(maxStamina(p)).toBe(130);
  });
});
