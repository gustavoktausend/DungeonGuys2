import { describe, it, expect } from 'vitest';
import { createWorld, emit } from '../src/sim/world';
import { WORLD, TILE } from '../src/sim/constants';
import type { RunConfig } from '../src/sim/types';

const config: RunConfig = {
  seed: 1234,
  mode: 'campaign',
  classKey: 'mage',
  playerName: 'TEST',
  forge: { vigor: 0, honed: 0, fleet: 0, startgold: 0, merchant: 0, wise: 0, golden: 0 },
};

describe('createWorld', () => {
  it('começa no tick 0, fase playing, sem entidades', () => {
    const w = createWorld(config);
    expect(w.tick).toBe(0);
    expect(w.phase).toBe('playing');
    expect(w.enemies).toEqual([]);
    expect(w.bullets).toEqual([]);
    expect(Object.keys(w.players)).toEqual([]);
    expect(w.wave).toBe(0);
  });

  it('deriva os limites de jogo do WORLD, não de nenhuma janela', () => {
    const w = createWorld(config);
    expect(w.play).toEqual({
      left: TILE,
      right: WORLD.w - TILE,
      top: TILE * 2,
      bottom: WORLD.h - TILE * 2,
    });
  });

  it('semeia o rng com config.seed', () => {
    const a = createWorld(config);
    const b = createWorld(config);
    expect(a.rng.next()).toBe(b.rng.next());

    const c = createWorld({ ...config, seed: 999 });
    expect(c.rng.next()).not.toBe(createWorld(config).rng.next());
  });

  it('emit empilha eventos em ordem', () => {
    const w = createWorld(config);
    emit(w, { t: 'sfx', name: 'hit' });
    emit(w, { t: 'shake', mag: 6, dur: 220 });
    expect(w.events).toEqual([
      { t: 'sfx', name: 'hit' },
      { t: 'shake', mag: 6, dur: 220 },
    ]);
  });

  it('nextId é único e crescente', () => {
    const w = createWorld(config);
    const a = w.nextId++;
    const b = w.nextId++;
    expect(b).toBe(a + 1);
  });
});
