import { describe, it, expect } from 'vitest';
import { makeTestWorld } from './helpers';
import { createPlayer } from '../src/sim/player';
import { spawnBoss, bossPlanForWave } from '../src/sim/boss';
import { updateEnemies } from '../src/sim/enemies';
import { WAVES_TOTAL } from '../src/sim/constants';

describe('bossPlanForWave', () => {
  it('waves comuns não têm chefe', () => {
    const w = makeTestWorld();
    expect(bossPlanForWave(w, 1)).toEqual([]);
    expect(bossPlanForWave(w, 3)).toEqual([]);
  });

  it('as waves de mini-boss trazem o mini-boss certo', () => {
    const w = makeTestWorld();
    expect(bossPlanForWave(w, 4)).toEqual(['goblin_chief']);
    expect(bossPlanForWave(w, 12)).toEqual(['necro_lord']);
  });

  it('a wave final da campanha traz o chefe final', () => {
    const w = makeTestWorld();
    expect(bossPlanForWave(w, WAVES_TOTAL)).toContain('ogre_warlord');
  });
});

describe('spawnBoss', () => {
  it('cria um inimigo marcado como chefe, dentro dos limites', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    spawnBoss(w, 'zombie_king', 0, 1);
    expect(w.enemies).toHaveLength(1);
    const b = w.enemies[0];
    expect(b.boss).toBe('ZOMBIE KING');
    expect(b.x).toBeGreaterThanOrEqual(w.play.left);
    expect(b.x).toBeLessThanOrEqual(w.play.right);
  });

  it('vários chefes nascem em posições diferentes', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    spawnBoss(w, 'zombie_king', 0, 2);
    spawnBoss(w, 'ogre_warlord', 1, 2);
    expect(w.enemies[0].x).not.toBe(w.enemies[1].x);
  });
});

describe('padrão de chefe', () => {
  it('o chefe invoca lacaios ao longo do tempo', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    spawnBoss(w, 'zombie_king', 0, 1);
    for (let i = 0; i < 600; i++) updateEnemies(w);
    expect(w.enemies.length).toBeGreaterThan(1);
  });

  it('é determinístico', () => {
    const run = () => {
      const w = makeTestWorld();
      createPlayer(w, 'p1', 'mage', 'T');
      spawnBoss(w, 'zombie_king', 0, 1);
      for (let i = 0; i < 300; i++) updateEnemies(w);
      return w.enemies.length;
    };
    expect(run()).toBe(run());
  });
});
