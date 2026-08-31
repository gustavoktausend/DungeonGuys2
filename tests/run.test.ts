import { describe, it, expect } from 'vitest';
import { makeTestWorld, runTicks, hashWorld } from './helpers';
import { createPlayer, startRun, startNextWave, pickEnemyType, checkWaveComplete, WAVES_TOTAL } from '@dg2/sim';
import type { InputState } from '@dg2/sim';

// A scripted input sequence: moves, attacks and specials at fixed ticks.
// Local to this file on purpose — tests/determinism.test.ts has its own
// equivalent, and sharing one is scope this fix does not own.
function scripted(tick: number): Record<string, InputState> {
  return {
    p1: {
      tick,
      move: { x: Math.sin(tick / 17), y: Math.cos(tick / 23) },
      aim: (tick % 360) * (Math.PI / 180),
      attack: tick % 7 === 0,
      special: tick % 211 === 0,
      sprint: tick % 90 < 30,
    },
  };
}

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
  it('múltiplas waves em sequência não quebram nem divergem', () => {
    // WAVE_DURATION is 30000ms and a tick is 1000/60ms (~1800 ticks), so
    // each wave gets 2200 ticks of headroom to resolve — by clearing, by
    // the survival timeout, or by the player dying.
    //
    // Advancing between waves needs an explicit startNextWave() call here:
    // checkWaveComplete only ever sets waveActive = false on a cleared,
    // non-final wave (the real trigger for the next wave — closeShop(),
    // after the player shops — is Task 19's, and doesn't exist yet; see
    // run.ts's file header). Calling startNextWave() directly is exactly
    // what four of the other tests in this file already do to stand in for
    // that missing shop step, and it's the only way for this test to reach
    // more than one wave at all.
    //
    // Measured with the seed in makeTestWorld's default config: wave 1
    // clears by tick 729 (hp 100->76), wave 2 by tick 1569 (hp ->24), and
    // the player dies partway into wave 3 at tick 2127 (phase 'gameover').
    // So this genuinely exercises several waves' worth of spawn queue,
    // combat, kills and wave transitions, not just the fixed point wave 1
    // settles into once cleared.
    const WAVE_TICK_BUDGET = 2200;
    const MAX_WAVES = 6;

    const build = () => {
      const w = makeTestWorld();
      createPlayer(w, 'p1', 'mage', 'T');
      startRun(w);
      for (let wave = 0; wave < MAX_WAVES && w.phase === 'playing'; wave++) {
        for (let t = 0; t < WAVE_TICK_BUDGET && w.phase === 'playing' && w.waveActive; t++) {
          runTicks(w, 1, scripted);
        }
        // Advance only on an actual clear (!waveActive), never on a
        // budget timeout with waveActive still true — otherwise a combat
        // freeze regression would force-advance anyway and this test
        // would stop being able to catch it.
        if (!w.waveActive && w.phase === 'playing') startNextWave(w);
      }
      return w;
    };
    const a = build(), b = build();

    // the run must actually have progressed, or this test proves nothing
    expect(a.wave > 1 || a.phase !== 'playing').toBe(true);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });
});
