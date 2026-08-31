import { createWorld, orderedPlayers, step } from '@dg2/sim';
import type { InputState, Player, RunConfig, World } from '@dg2/sim';

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

/**
 * A stable fingerprint of everything the simulation owns. Excludes `events`
 * (drained every tick by app/) and `config` (the run's constant input — seed,
 * mode and the player manifest with each slot's class, name and forge levels
 * — never changes across ticks, so including it can only mask or fake a
 * divergence, never reveal one). Includes the rng
 * cursor, so a divergence in random draws shows up even when no entity moved
 * yet.
 *
 * `players` is re-keyed into canonical order before it is serialised.
 * `JSON.stringify` emits object keys in INSERTION order, so without this two
 * rooms holding bit-identical simulations would fingerprint differently for
 * the sole reason that the four people joined in a different sequence — a
 * false desync, reported by the very thing whose job is to detect real ones
 * (FORM-02/D-13). Key ORDER inside the Record is not simulation state; who is
 * in it, and what they are, is, and that is still compared exactly.
 *
 * This does not move any recorded hash: a world whose insertion order already
 * matches the manifest — every solo run, including tests/golden — serialises
 * to the same bytes as before.
 */
export function hashWorld(world: World): string {
  const snapshot = JSON.stringify(world, (key, value) => {
    if (key === 'events') return undefined;
    if (key === 'config') return undefined;
    if (key === 'players') {
      const canonical: Record<string, Player> = {};
      for (const p of orderedPlayers(world)) canonical[p.id] = p;
      return canonical;
    }
    if (key === 'rng') return (value as { save(): number }).save();
    // JSON.stringify collapses NaN, Infinity and -Infinity all to `null`, so
    // an unfiltered replacer gives the same fingerprint to a healthy world
    // and to one that has diverged into NaN — the exact opposite of what a
    // determinism guard is for. Tag them apart instead.
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return Number.isNaN(value) ? 'NaN' : value > 0 ? 'Inf' : '-Inf';
    }
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
