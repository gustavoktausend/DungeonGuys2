import { describe, it, expect } from 'vitest';
import { makeTestWorld, runTicks } from './helpers';
import { createPlayer } from '../src/sim/player';
import { startRun, startNextWave, pickEnemyType, checkWaveComplete } from '../src/sim/run';
import { WAVES_TOTAL } from '../src/sim/constants';

describe('startRun', () => {
  it('gera a arena, cria a wave 1 e deixa a fase em playing', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    startRun(w);
    expect(w.obstacles.length).toBeGreaterThan(0);
    expect(w.wave).toBe(1);
    expect(w.waveActive).toBe(true);
    expect(w.phase).toBe('playing');
    expect(w.spawnQueue.length).toBeGreaterThan(0);
  });
});

describe('startNextWave', () => {
  it('avança a wave e limpa o loot do chão', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    startRun(w);
    w.coins.push({ x: 0, y: 0, vx: 0, vy: 0, bob: 0, dead: false });
    startNextWave(w);
    expect(w.wave).toBe(2);
    expect(w.coins).toEqual([]);
  });

  it('zera o combo entre waves', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    startRun(w);
    w.combo = 10;
    startNextWave(w);
    expect(w.combo).toBe(0);
  });

  it('waves de chefe não sorteiam mutador', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    w.wave = 3;
    startNextWave(w); // wave 4 = mini-boss
    expect(w.waveHasBoss).toBe(true);
    expect(w.waveMutator).toBeNull();
  });

  it('a fila de spawn cresce com a wave', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    startRun(w);
    const early = w.spawnQueue.length;
    w.wave = 8;
    startNextWave(w);
    expect(w.spawnQueue.length).toBeGreaterThan(early);
  });

  it('anuncia a wave', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    startRun(w);
    expect(w.events.some(e => e.t === 'announce')).toBe(true);
  });
});

describe('pickEnemyType', () => {
  it('só sorteia tipos liberados para a wave', () => {
    const w = makeTestWorld();
    for (let i = 0; i < 200; i++) {
      expect(['skeleton', 'goblin']).toContain(pickEnemyType(w, 1));
    }
  });

  it('waves altas liberam os tipos avançados', () => {
    const w = makeTestWorld();
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(pickEnemyType(w, 6));
    expect(seen.size).toBeGreaterThan(2);
  });
});

describe('checkWaveComplete', () => {
  it('não completa enquanto sobram inimigos ou fila', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    startRun(w);
    checkWaveComplete(w);
    expect(w.wave).toBe(1);
  });

  it('a campanha vence ao limpar a última wave', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    startRun(w);
    w.wave = WAVES_TOTAL;
    w.spawnQueue = [];
    w.enemies = [];
    w.waveActive = true;
    checkWaveComplete(w);
    expect(w.phase).toBe('victory');
  });

  it('no endless não há vitória, só a próxima wave', () => {
    const w = makeTestWorld({ mode: 'endless' });
    createPlayer(w, 'p1', 'mage', 'T');
    startRun(w);
    w.wave = WAVES_TOTAL;
    w.spawnQueue = [];
    w.enemies = [];
    w.waveActive = true;
    checkWaveComplete(w);
    expect(w.phase).not.toBe('victory');
  });
});

describe('run completa', () => {
  it('600 ticks de simulação com waves não quebram nem divergem', () => {
    const build = () => {
      const w = makeTestWorld();
      createPlayer(w, 'p1', 'mage', 'T');
      startRun(w);
      return w;
    };
    const a = build(), b = build();
    runTicks(a, 600);
    runTicks(b, 600);
    expect(a.enemies.length).toBe(b.enemies.length);
    expect(a.wave).toBe(b.wave);
  });
});
