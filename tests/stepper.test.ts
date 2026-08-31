import { describe, it, expect } from 'vitest';
import { createStepper, MAX_CATCHUP_MS } from '../src/app/stepper';
import { DT_MS } from '../src/sim/constants';
import { makeTestWorld, noInput } from './helpers';
import type { InputState } from '../src/sim/types';

// Raw source of app/, so "no wall clock, no frame pump" is asserted on the
// file itself and not merely on its behavior. Same trick as purity.test.ts:
// Vite's raw glob, because tsconfig `types` is ["vite/client"] only.
const APP_SRC = import.meta.glob<string>('../src/app/*.ts', {
  query: '?raw', import: 'default', eager: true,
});

function sourceOf(suffix: string): string {
  const entry = Object.entries(APP_SRC).find(([path]) => path.endsWith(suffix));
  if (!entry) throw new Error(`fonte não encontrada: ${suffix}`);
  return entry[1];
}

/** Records which tick numbers the stepper asked inputs for. */
function recorder() {
  const seen: number[] = [];
  const collect = (tick: number): Record<string, InputState> => {
    seen.push(tick);
    return { p0: noInput(tick) };
  };
  return { seen, collect };
}

describe('passo fixo do stepper', () => {
  it('um advance de exatamente DT_MS executa um tick e zera o alpha', () => {
    const world = makeTestWorld();
    const { seen, collect } = recorder();
    const alpha = createStepper(world).advance(DT_MS, collect);
    expect(world.tick).toBe(1);
    expect(seen.length).toBe(1);
    expect(alpha).toBe(0);
  });

  it('um advance de DT_MS * 2 executa dois ticks numa chamada só', () => {
    const world = makeTestWorld();
    const { seen, collect } = recorder();
    const alpha = createStepper(world).advance(DT_MS * 2, collect);
    expect(world.tick).toBe(2);
    expect(seen.length).toBe(2);
    expect(alpha).toBe(0);
  });

  // `DT_MS * 3` is NOT three whole slices. DT_MS is 16.666666666666668 (the
  // double just ABOVE 50/3), so 3 * DT_MS is 50.0000000000000035, which is
  // exactly half an ulp from 50 and rounds — ties-to-even — down to 50. That
  // is 3.55e-15 SHORT of three ticks, so the third tick correctly does not
  // fire. Asserting "three ticks" here would assert something IEEE-754 does
  // not do; the honest assertion is this one.
  it('DT_MS * 3 paga dois ticks, porque o produto arredonda abaixo de três fatias', () => {
    const world = makeTestWorld();
    const { collect } = recorder();
    const alpha = createStepper(world).advance(DT_MS * 3, collect);
    expect(world.tick).toBe(2);
    expect(DT_MS * 3 - DT_MS - DT_MS < DT_MS).toBe(true);
    expect(alpha).toBe((DT_MS * 3 - DT_MS - DT_MS) / DT_MS);
  });

  it('chamadas sucessivas acumulam a fração até fechar um tick', () => {
    const world = makeTestWorld();
    const { seen, collect } = recorder();
    const stepper = createStepper(world);
    const slice = DT_MS * 0.6;

    const first = stepper.advance(slice, collect);
    expect(world.tick).toBe(0);
    expect(seen.length).toBe(0);
    expect(first).toBe(slice / DT_MS);

    const second = stepper.advance(slice, collect);
    expect(world.tick).toBe(1);
    expect(seen.length).toBe(1);
    // x + x is exact in IEEE-754, so this is literally what advance computed.
    expect(second).toBe((slice + slice - DT_MS) / DT_MS);
  });

  it('um stall longo é grampeado em MAX_CATCHUP_MS e nunca vira espiral da morte', () => {
    expect(MAX_CATCHUP_MS).toBe(DT_MS * 5);
    const ticksFor = (elapsedMs: number): number => {
      const world = makeTestWorld();
      const { seen, collect } = recorder();
      createStepper(world).advance(elapsedMs, collect);
      return seen.length;
    };
    // Ten seconds of stalled tab must cost exactly what the clamp costs.
    expect(ticksFor(10_000)).toBe(ticksFor(MAX_CATCHUP_MS));
    expect(ticksFor(10_000)).toBeLessThanOrEqual(5);
  });

  it('runTicks executa exatamente n ticks, sem envolver tempo nenhum', () => {
    const world = makeTestWorld();
    const { seen, collect } = recorder();
    createStepper(world).runTicks(120, collect);
    expect(world.tick).toBe(120);
    expect(seen.length).toBe(120);
  });

  it('collect recebe world.tick e é chamado uma vez por tick', () => {
    const world = makeTestWorld();
    const { seen, collect } = recorder();
    createStepper(world).runTicks(5, collect);
    expect(seen).toEqual([0, 1, 2, 3, 4]);
  });

  it('o módulo do stepper não contém símbolo nenhum de relógio ou de frame', () => {
    const src = sourceOf('/stepper.ts');
    const forbidden = ['performance', 'Date', 'requestAnimationFrame', 'setTimeout', 'setInterval'];
    expect(forbidden.filter(symbol => src.includes(symbol))).toEqual([]);
  });

  it('loop.ts delega ao stepper e não guarda mais o acumulador', () => {
    const src = sourceOf('/loop.ts');
    expect(src.includes('createStepper')).toBe(true);
    expect(src.includes('acc')).toBe(false);
  });
});
