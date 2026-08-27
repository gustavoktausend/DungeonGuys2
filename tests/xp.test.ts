import { describe, it, expect } from 'vitest';
import { makeTestWorld } from './helpers';
import { createPlayer } from '../src/sim/player';
import { gainXp, rollLevelChoices, pickBlessing } from '../src/sim/xp';
import { XP_BASE, XP_GROWTH, LEVEL_HP } from '../src/sim/defs/blessings';

describe('gainXp', () => {
  it('acumula xp sem subir de nível abaixo do limiar', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    gainXp(w, p, XP_BASE - 1);
    expect(p.level).toBe(1);
    expect(p.xp).toBe(XP_BASE - 1);
  });

  it('sobe de nível, aumenta maxHp, cura e enfileira a escolha', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    p.hp = 50;
    gainXp(w, p, XP_BASE);
    expect(p.level).toBe(2);
    expect(p.permMaxHp).toBe(100 + LEVEL_HP);
    expect(p.hp).toBe(50 + LEVEL_HP);
    expect(p.pendingLevelUps).toBe(1);
    expect(p.xpNext).toBe(Math.round(XP_BASE * XP_GROWTH));
  });

  it('xp em excesso pode subir vários níveis de uma vez', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    gainXp(w, p, XP_BASE * 10);
    expect(p.level).toBeGreaterThan(2);
    expect(p.pendingLevelUps).toBe(p.level - 1);
  });

  it('o perk wise do forge aumenta o xp ganho', () => {
    const w = makeTestWorld();
    w.config.forge.wise = 3;            // the perk's max level
    const p = createPlayer(w, 'p1', 'mage', 'T');
    gainXp(w, p, 50);
    expect(p.xp).toBe(65);              // round(50 * (1 + 3 * 0.1))
    expect(p.level).toBe(1);            // stays below XP_BASE, so the multiplier is what's measured
  });

  it('subir de nível leva o mundo para a fase levelup', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    gainXp(w, p, XP_BASE);
    expect(w.phase).toBe('levelup');
    expect(p.levelChoices).toHaveLength(3);
  });
});

describe('rollLevelChoices', () => {
  it('oferece 3 opções distintas', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    rollLevelChoices(w, p);
    expect(p.levelChoices).toHaveLength(3);
    expect(new Set(p.levelChoices.map(b => b.name)).size).toBe(3);
  });

  it('filtra as bênçãos pelo tipo de dano da classe', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T'); // elemental
    for (let i = 0; i < 60; i++) {
      rollLevelChoices(w, p);
      for (const b of p.levelChoices) {
        if (b.dmgKind) expect(b.dmgKind).toBe('elemental');
      }
    }
  });

  it('é determinística', () => {
    const run = () => {
      const w = makeTestWorld();
      const p = createPlayer(w, 'p1', 'mage', 'T');
      rollLevelChoices(w, p);
      return p.levelChoices.map(b => b.name);
    };
    expect(run()).toEqual(run());
  });

  it('não gera HTML', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    rollLevelChoices(w, p);
    for (const b of p.levelChoices) expect(JSON.stringify(b)).not.toContain('<');
  });
});

describe('pickBlessing', () => {
  it('aplica os mods e consome um level-up pendente', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    p.pendingLevelUps = 1;
    p.levelChoices = [{ name: 'MIGHT', icon: '💪', mods: { dmgPct: 4 } }];
    w.phase = 'levelup';
    pickBlessing(w, p, 0);
    expect(p.permStats.dmgPct).toBe(4);
    expect(p.pendingLevelUps).toBe(0);
    expect(w.phase).toBe('playing');
  });

  it('com level-ups na fila, oferece de novo em vez de fechar', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    p.pendingLevelUps = 2;
    p.levelChoices = [{ name: 'MIGHT', icon: '💪', mods: { dmgPct: 4 } }];
    w.phase = 'levelup';
    pickBlessing(w, p, 0);
    expect(p.pendingLevelUps).toBe(1);
    expect(p.levelChoices).toHaveLength(3);
    expect(w.phase).toBe('levelup');
  });

  it('índice inválido não faz nada', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    p.pendingLevelUps = 1;
    p.levelChoices = [];
    w.phase = 'levelup';
    pickBlessing(w, p, 5);
    expect(p.pendingLevelUps).toBe(1);
  });
});
