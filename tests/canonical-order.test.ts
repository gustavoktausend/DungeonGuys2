// canonical-order.test.ts — FORM-02, phase success criterion 4.
//
// THE BUG THIS PINS DOWN. `world.players` is a Record whose keys are 'p0'..'p3'
// — non-numeric strings, so JavaScript iterates them in INSERTION order, not
// lexicographic order. `step()` used to walk `Object.keys(world.players)`, and
// `updatePlayer` -> `attack` -> `dealDamage` -> `killEnemy` -> `gainXp` all draw
// from the same global `world.rng`. Iteration order therefore decided WHO GETS
// WHICH DRAW: two pairs who joined the same room in a different order would
// diverge with nothing at all looking wrong, forty seconds later.
//
// The fix is D-13: the Record stays a Record (it serialises to JSON with no
// special handling), and the ORDER moves into `world.config.players`, the run
// manifest — which is where the replay already looks, and which the authority,
// not the join sequence, decides.
//
// WHAT THE PERMUTATION TESTS SHUFFLE, AND WHY IT MATTERS: they shuffle the
// order of the `createPlayer` CALLS, never the `inputs` record. Inputs are
// keyed by slot, so reordering them would prove nothing — the trap lives
// entirely in the order keys are INSERTED into the Record.
import { describe, it, expect } from 'vitest';
import { createPlayer, startRun, step } from '@dg2/sim';
import type { ForgeLevels, InputState, PlayerSlot, RunPlayer } from '@dg2/sim';
import { makeTestWorld, hashWorld, noInput, runTicks } from './helpers';

const SEED = 0x51ded;

const NO_FORGE: ForgeLevels = {
  vigor: 0, honed: 0, fleet: 0, startgold: 0, merchant: 0, wise: 0, golden: 0,
};

/** Four different classes, so the four players do not shoot identical bullets. */
const ROSTER: Record<PlayerSlot, RunPlayer> = {
  p0: { id: 'p0', name: 'ZERO', cls: 'mage', forge: NO_FORGE },
  p1: { id: 'p1', name: 'UM', cls: 'archer', forge: NO_FORGE },
  p2: { id: 'p2', name: 'DOIS', cls: 'warrior', forge: NO_FORGE },
  p3: { id: 'p3', name: 'TRES', cls: 'ninja', forge: NO_FORGE },
};

const CANONICAL: PlayerSlot[] = ['p0', 'p1', 'p2', 'p3'];

/** Fixed start positions per SLOT — never per creation order. */
const SPOT: Record<PlayerSlot, { x: number; y: number }> = {
  p0: { x: 1100, y: 760 },
  p1: { x: 1300, y: 760 },
  p2: { x: 1200, y: 660 },
  p3: { x: 1200, y: 860 },
};

/**
 * A scripted tick of input for all four slots, keyed by slot id.
 *
 * Integer arithmetic only, apart from turning degrees into radians: this file
 * also runs under the Node leg of a determinism suite, and a driver built out
 * of implementation-approximated trigonometry would be measuring the engine
 * rather than the simulation.
 */
function scripted(tick: number): Record<string, InputState> {
  const out: Record<string, InputState> = {};
  CANONICAL.forEach((id, i) => {
    out[id] = {
      tick,
      move: { x: (((tick + i * 13) % 5) - 2) / 2, y: (((tick + i * 7) % 5) - 2) / 2 },
      aim: (((tick * (i + 1)) % 360) * Math.PI) / 180,
      attack: (tick + i) % 6 === 0,
      special: (tick + i * 3) % 197 === 0,
      sprint: (tick + i * 11) % 90 < 30,
    };
  });
  return out;
}

/**
 * The same run, with the four players CREATED in `creationOrder`.
 *
 * Everything else is held fixed: same seed, same manifest (so the same
 * canonical order), same per-slot start positions, same per-slot inputs.
 */
function runWithCreationOrder(creationOrder: PlayerSlot[], ticks = 600): string {
  const world = makeTestWorld({ seed: SEED, players: CANONICAL.map(id => ROSTER[id]) });
  for (const id of creationOrder) createPlayer(world, id, ROSTER[id].cls, ROSTER[id].name);
  for (const id of CANONICAL) {
    world.players[id].x = SPOT[id].x;
    world.players[id].y = SPOT[id].y;
  }
  startRun(world);
  runTicks(world, ticks, scripted);
  return hashWorld(world);
}

describe('ordem canônica de jogadores (FORM-02)', () => {
  // Three permutations, not two: two orders agreeing could be a coincidence of
  // that particular pair. p0 leads only in the first of the three.
  it('embaralhar a ordem de criação não muda o hash, em três permutações', () => {
    const base = runWithCreationOrder(['p0', 'p1', 'p2', 'p3']);
    expect(runWithCreationOrder(['p2', 'p0', 'p3', 'p1'])).toBe(base);
    expect(runWithCreationOrder(['p3', 'p2', 'p1', 'p0'])).toBe(base);
  });

  // The run has to actually EXERCISE the rng through the players, or the test
  // above passes on an empty world. This is the control: the same 600 ticks
  // with a different seed must not land on the same hash.
  it('o roteiro de 600 ticks realmente move o mundo (controle)', () => {
    const base = runWithCreationOrder(CANONICAL);
    const other = (() => {
      const world = makeTestWorld({ seed: SEED + 1, players: CANONICAL.map(id => ROSTER[id]) });
      for (const id of CANONICAL) createPlayer(world, id, ROSTER[id].cls, ROSTER[id].name);
      for (const id of CANONICAL) {
        world.players[id].x = SPOT[id].x;
        world.players[id].y = SPOT[id].y;
      }
      startRun(world);
      runTicks(world, 600, scripted);
      return hashWorld(world);
    })();
    expect(base).not.toBe(other);
  });

  /**
   * The direct assertion, and the one that fails loudest against `Object.keys`.
   *
   * Creation order is held FIXED and the MANIFEST is reordered instead. If
   * `step()` walked the Record, the manifest would be inert and the two runs
   * would be bit-identical. They must not be: the manifest is what decides who
   * is updated first, and therefore who draws from `world.rng` first.
   *
   * Deliberately run on an empty world — no `startRun`, so no enemies, no
   * coins, no spawn anchors. The ONLY order-sensitive path left is `step()`'s
   * own player loop, through the per-shot spread draw in combat.ts.
   */
  it('a ordem de iteração é a do manifesto, não a de Object.keys', () => {
    const twoShooters = (manifestOrder: PlayerSlot[]): string => {
      const world = makeTestWorld({
        seed: SEED,
        players: manifestOrder.map(id => ROSTER[id]),
      });
      // Creation order is p0 then p1 in BOTH runs.
      createPlayer(world, 'p0', 'mage', 'ZERO');
      createPlayer(world, 'p1', 'mage', 'UM');
      world.players.p0.x = 1000; world.players.p0.y = 800;
      world.players.p1.x = 1400; world.players.p1.y = 800;
      runTicks(world, 120, tick => ({
        p0: { ...noInput(tick), attack: true, aim: 0 },
        p1: { ...noInput(tick), attack: true, aim: 0 },
      }));
      return hashWorld(world);
    };
    expect(twoShooters(['p0', 'p1'])).not.toBe(twoShooters(['p1', 'p0']));
  });

  it('um slot do manifesto ausente de world.players é pulado sem erro', () => {
    const world = makeTestWorld({ seed: SEED, players: CANONICAL.map(id => ROSTER[id]) });
    // Only two of the four manifest slots ever join.
    createPlayer(world, 'p1', 'archer', 'UM');
    createPlayer(world, 'p3', 'ninja', 'TRES');
    expect(() => runTicks(world, 30, scripted)).not.toThrow();
    expect(world.tick).toBe(30);
    expect(Object.keys(world.players).sort()).toEqual(['p1', 'p3']);
  });

  it('um slot sem input no tick é pulado, como sempre foi', () => {
    const world = makeTestWorld({ seed: SEED, players: [ROSTER.p0, ROSTER.p1] });
    createPlayer(world, 'p0', 'mage', 'ZERO');
    createPlayer(world, 'p1', 'archer', 'UM');
    // A value a single updatePlayer call would visibly decrement.
    world.players.p1.invincible = 500;
    const frozen = JSON.stringify(world.players.p1);

    for (let i = 0; i < 10; i++) {
      step(world, { p0: noInput(world.tick) }); // no entry for p1
      world.events.length = 0;
    }

    expect(JSON.stringify(world.players.p1)).toBe(frozen);
    expect(world.players.p1.invincible).toBe(500);
  });
});

// What these tests do NOT prove: that p0..p3 is the right shape for a slot, or
// that the authority assigns them correctly. Both are decisions, recorded in
// docs/adr/0001-identidade-em-tres-espacos.md, and neither is executable here.
// What is executable is that the simulation reads the order from the manifest.
