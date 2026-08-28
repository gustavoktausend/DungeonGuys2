import { describe, it, expect } from 'vitest';
import { makeTestWorld, runTicks, hashWorld, noInput } from './helpers';
import { createPlayer } from '../src/sim/player';
import { generateArena } from '../src/sim/arena';
import type { InputState } from '../src/sim/types';

// A scripted input sequence: moves, attacks and specials at fixed ticks.
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

describe('determinismo da simulação', () => {
  it('duas instâncias com a mesma seed e os mesmos inputs convergem', () => {
    const a = makeTestWorld();
    const b = makeTestWorld();
    generateArena(a);
    generateArena(b);
    createPlayer(a, 'p1', 'mage', 'T');
    createPlayer(b, 'p1', 'mage', 'T');
    runTicks(a, 600, scripted);
    runTicks(b, 600, scripted);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  it('seeds diferentes divergem', () => {
    const a = makeTestWorld({ seed: 1 });
    const b = makeTestWorld({ seed: 2 });
    generateArena(a);
    generateArena(b);
    createPlayer(a, 'p1', 'mage', 'T');
    createPlayer(b, 'p1', 'mage', 'T');
    runTicks(a, 600, scripted);
    runTicks(b, 600, scripted);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it('o tick avança exatamente uma vez por step', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    runTicks(w, 120);
    expect(w.tick).toBe(120);
  });

  // JSON.stringify colapsa NaN, Infinity e -Infinity todos em `null`. Sem o
  // replacer de não-finitos, um mundo que divergiu para NaN teria a mesma
  // impressão digital de um mundo saudável — o guarda de determinismo
  // esconderia justamente a divergência que existe para pegar.
  it('hashWorld distingue NaN, Infinity e -Infinity entre si e de um número', () => {
    const mk = (hp: number) => {
      const w = makeTestWorld();
      createPlayer(w, 'p1', 'mage', 'T');
      w.players.p1.hp = hp;
      return hashWorld(w);
    };
    const hashes = [mk(NaN), mk(Infinity), mk(-Infinity), mk(0)];
    expect(new Set(hashes).size).toBe(4);
  });

  it('inputs diferentes produzem mundos diferentes', () => {
    const a = makeTestWorld();
    const b = makeTestWorld();
    createPlayer(a, 'p1', 'mage', 'T');
    createPlayer(b, 'p1', 'mage', 'T');
    runTicks(a, 300, scripted);
    runTicks(b, 300, t => ({ p1: noInput(t) }));
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
