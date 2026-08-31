import { describe, it, expect } from 'vitest';
import { createWorld, emit, drainEvents, slotForge, WORLD, TILE } from '@dg2/sim';
import type { RunConfig } from '@dg2/sim';

const config: RunConfig = {
  seed: 1234,
  mode: 'campaign',
  players: [{
    id: 'p1',
    name: 'TEST',
    cls: 'mage',
    forge: { vigor: 0, honed: 0, fleet: 0, startgold: 0, merchant: 0, wise: 0, golden: 0 },
  }],
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

// FORM-01/D-30: o forge é por slot, e quem lê precisa dizer de quem.
describe('slotForge', () => {
  it('devolve o forge do slot pedido, não o do primeiro da lista', () => {
    const w = createWorld({
      ...config,
      players: [
        { id: 'p0', name: 'A', cls: 'mage', forge: { vigor: 1, honed: 0, fleet: 0, startgold: 0, merchant: 0, wise: 0, golden: 0 } },
        { id: 'p1', name: 'B', cls: 'archer', forge: { vigor: 0, honed: 0, fleet: 0, startgold: 0, merchant: 4, wise: 0, golden: 0 } },
      ],
    });
    expect(slotForge(w, 'p0').vigor).toBe(1);
    expect(slotForge(w, 'p0').merchant).toBe(0);
    expect(slotForge(w, 'p1').merchant).toBe(4);
    expect(slotForge(w, 'p1').vigor).toBe(0);
  });

  it('um slot fora do manifesto vale zero em todos os sete níveis, sem lançar', () => {
    const w = createWorld(config);
    const forge = slotForge(w, 'p3');
    expect(forge).toEqual({
      vigor: 0, honed: 0, fleet: 0, startgold: 0, merchant: 0, wise: 0, golden: 0,
    });
  });
});

// drainEvents é chamado só de src/main.ts (o sink do app/), e os testes o
// contornam com `world.events.length = 0` em helpers.ts — ou seja, o contrato
// sim -> app inteiro, que o Marco 1 estende, não tinha teste nenhum.
describe('drainEvents', () => {
  it('devolve os eventos na ordem e deixa a fila vazia (novo array, não o mesmo)', () => {
    const w = createWorld(config);
    emit(w, { t: 'sfx', name: 'hit' });
    emit(w, { t: 'shake', mag: 6, dur: 220 });
    const queue = w.events;

    const out = drainEvents(w);
    expect(out).toEqual([
      { t: 'sfx', name: 'hit' },
      { t: 'shake', mag: 6, dur: 220 },
    ]);
    expect(out).toBe(queue);      // entrega a fila em si...
    expect(w.events).toEqual([]); // ...e o mundo recomeça com outra, vazia
    expect(w.events).not.toBe(out);

    // o que sai do dreno não pode ser corrompido por emits posteriores
    emit(w, { t: 'sfx', name: 'shoot' });
    expect(out).toHaveLength(2);
    expect(w.events).toHaveLength(1);
    expect(drainEvents(w)).toEqual([{ t: 'sfx', name: 'shoot' }]);
    expect(drainEvents(w)).toEqual([]);
  });
});
