import { createWorld } from '../src/sim/world';
import { step } from '../src/sim/step';
import type { InputState, RunConfig, World } from '../src/sim/types';

export const BASE_CONFIG: RunConfig = {
  seed: 20260827,
  mode: 'campaign',
  classKey: 'mage',
  playerName: 'TEST',
  forge: { vigor: 0, honed: 0, fleet: 0, startgold: 0, merchant: 0, wise: 0 },
};

export function makeTestWorld(overrides: Partial<RunConfig> = {}): World {
  return createWorld({ ...BASE_CONFIG, ...overrides });
}

export function noInput(tick: number): InputState {
  return { tick, move: { x: 0, y: 0 }, aim: 0, attack: false, special: false, sprint: false };
}

/** Advances the world n ticks. `inputs` may vary per tick via a callback. */
export function runTicks(
  world: World,
  n: number,
  inputs: (tick: number) => Record<string, InputState> = t => ({ p1: noInput(t) }),
): void {
  for (let i = 0; i < n; i++) {
    step(world, inputs(world.tick));
    world.events.length = 0; // events are presentation; not part of sim state
  }
}

/**
 * A stable fingerprint of everything the simulation owns. Excludes `events`
 * (drained every tick by app/) and `config` (the run's constant input — seed,
 * mode, class, name, forge levels — never changes across ticks, so including
 * it can only mask or fake a divergence, never reveal one). Includes the rng
 * cursor, so a divergence in random draws shows up even when no entity moved
 * yet.
 */
export function hashWorld(world: World): string {
  const snapshot = JSON.stringify(world, (key, value) => {
    if (key === 'events') return undefined;
    if (key === 'config') return undefined;
    if (key === 'rng') return (value as { save(): number }).save();
    return value;
  });
  // FNV-1a, 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < snapshot.length; i++) {
    h ^= snapshot.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
