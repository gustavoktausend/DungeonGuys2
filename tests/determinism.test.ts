import { describe, it, expect } from 'vitest';
import { makeTestWorld, runTicks, hashWorld, noInput } from './helpers';
import type { InputState } from '../src/sim/types';

// NOTE: 'seeds diferentes divergem' and 'inputs diferentes produzem mundos
// diferentes' only have teeth once the player moves (Task 9). Keep them
// skipped until then, and un-skip in Task 9.

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
    runTicks(a, 600, scripted);
    runTicks(b, 600, scripted);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  it.skip('seeds diferentes divergem', () => {
    const a = makeTestWorld({ seed: 1 });
    const b = makeTestWorld({ seed: 2 });
    runTicks(a, 600, scripted);
    runTicks(b, 600, scripted);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it('o tick avança exatamente uma vez por step', () => {
    const w = makeTestWorld();
    runTicks(w, 120);
    expect(w.tick).toBe(120);
  });

  it.skip('inputs diferentes produzem mundos diferentes', () => {
    const a = makeTestWorld();
    const b = makeTestWorld();
    runTicks(a, 300, scripted);
    runTicks(b, 300, t => ({ p1: noInput(t) }));
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
