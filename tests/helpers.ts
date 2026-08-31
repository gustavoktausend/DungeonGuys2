import { createWorld, step } from '@dg2/sim';
import type { InputState, RunConfig, World } from '@dg2/sim';

/**
 * `hashWorld` now lives in packages/sim/src/serialize.ts (plan 01-14).
 *
 * It was never a test utility: it is the fingerprint a phase-9 replay verifier
 * runs on a server, and code the server depends on cannot live under tests/.
 * The re-export is what kept the promotion a two-file diff — the twenty-one
 * test files that import it from './helpers' did not change a line, so the
 * diff shows the move and nothing else.
 */
export { hashWorld } from '@dg2/sim';

/**
 * The run manifest almost every test builds its world from.
 *
 * The single slot is 'p1' because that is the id the suite has always passed
 * to `createPlayer`, and `runTicks` below feeds inputs under the same key —
 * `step()` iterates `config.players`, so a slot that is not listed here gets
 * no tick at all.
 */
export const BASE_CONFIG: RunConfig = {
  seed: 20260827,
  mode: 'campaign',
  players: [{
    id: 'p1',
    name: 'TEST',
    cls: 'mage',
    forge: { vigor: 0, honed: 0, fleet: 0, startgold: 0, merchant: 0, wise: 0, golden: 0 },
  }],
};

/**
 * A world from BASE_CONFIG, with `players` DEEP-COPIED.
 *
 * The copy is what lets a test write `w.config.players[0].forge.wise = 3`
 * without that value leaking into every other world built afterwards — a
 * shared literal would make the suite order-dependent, which is the one thing
 * a determinism suite must never be.
 */
export function makeTestWorld(overrides: Partial<RunConfig> = {}): World {
  const players = BASE_CONFIG.players.map(s => ({ ...s, forge: { ...s.forge } }));
  return createWorld({ ...BASE_CONFIG, players, ...overrides });
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
