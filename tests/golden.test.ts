// golden.test.ts — the NODE leg of the cross-engine determinism gate, and the
// hash emitter that tools/golden/rebaseline.mjs reads.
//
// tests/cross-engine.test.ts is the browser leg and runs the same run through
// Chromium, Firefox and WebKit. This leg is expected to PASS: the golden was
// recorded from Node. If this one goes red, the simulation changed.
//
// With VITE_GOLDEN_EMIT set, the two run tests print their result instead of
// asserting it — that is how the re-baseline script obtains the new values
// without needing Node's types inside a tsconfig whose `types` is
// ["vite/client"] only.
import { describe, it, expect } from 'vitest';
import { createWorld, createPlayer, startRun } from '@dg2/sim';
import { createStepper } from '../src/app/stepper';
import { hashWorld } from './helpers';
import { decodeInputLog, type GoldenFixture } from './inputLog';
import type { World } from '@dg2/sim';
import FIXTURE from './golden/campaign-mage-3000.json';

const GOLDEN = FIXTURE as unknown as GoldenFixture;
const EMIT = Boolean(import.meta.env.VITE_GOLDEN_EMIT);

/** Checkpoint cadence. Test data only (D-11) — see GoldenFixture. */
const CHECKPOINT_EVERY = 60;

/**
 * Tick at which this run stops evolving.
 *
 * `step()` returns right after `world.tick++` once `phase !== 'playing'`, so
 * every phase other than 'playing' is an absorbing state for a pure tick
 * driver: ticks 1801..3000 only advance the counter. Measured across 400
 * scripted seeds, ZERO stayed 'playing' for 3000 ticks — the run always
 * either clears wave 1 (382/400) or dies (18/400) first. Driving past that
 * wall means resolving levelup/shop, which means choosing an upgrade, which
 * is app-layer policy and belongs to the replay driver, not to this gate.
 *
 * This number is pinned because the fixture's seed was chosen for it: 1800
 * is the longest live stretch found in a 3000-seed sweep, AND that seed's
 * cross-engine divergence still survives at tick 3000 in all three browsers
 * (most seeds heal before then — see tools/golden/rebaseline.mjs). If this
 * moves, the fixture stopped exercising what it was recorded to exercise.
 */
const LIVE_UNTIL = 1800;

/** The canonical start-of-run sequence, exactly as main.ts:120-124 does it. */
function buildWorld(): World {
  const world = createWorld(GOLDEN.config);
  for (const slot of GOLDEN.config.players) createPlayer(world, slot.id, slot.cls, slot.name);
  startRun(world);
  return world;
}

/** Runs the golden in CHECKPOINT_EVERY-tick chunks, hashing at each boundary. */
function runWithCheckpoints(): { t: number; hash: string }[] {
  const world = buildWorld();
  const stepper = createStepper(world);
  const collect = decodeInputLog(GOLDEN.log, GOLDEN.config.players);
  const marks: { t: number; hash: string }[] = [];
  while (world.tick < GOLDEN.ticks) {
    stepper.runTicks(Math.min(CHECKPOINT_EVERY, GOLDEN.ticks - world.tick), collect);
    marks.push({ t: world.tick, hash: hashWorld(world) });
  }
  return marks;
}

describe('run de ouro em Node', () => {
  it('reproduz o hash-ouro depois dos ticks do fixture', () => {
    const world = buildWorld();
    createStepper(world).runTicks(GOLDEN.ticks, decodeInputLog(GOLDEN.log, GOLDEN.config.players));
    expect(world.tick).toBe(GOLDEN.ticks);
    const hash = hashWorld(world);
    if (EMIT) {
      console.log(`GOLDEN_HASH=${hash}`);
      return;
    }
    expect(hash).toBe(GOLDEN.hash);
  });

  it('reproduz os hashes intermediários de cada checkpoint', () => {
    const marks = runWithCheckpoints();
    if (EMIT) {
      console.log(`GOLDEN_CHECKPOINTS=${JSON.stringify(marks)}`);
      return;
    }
    expect(marks).toEqual(GOLDEN.checkpoints);
  });

  it('o último checkpoint é o mesmo estado que o hash-ouro', () => {
    if (EMIT) return;
    expect(GOLDEN.checkpoints.at(-1)).toEqual({ t: GOLDEN.ticks, hash: GOLDEN.hash });
  });

  // T-1-03: the ceiling is structural, not a runtime guess. A verifier that
  // trusts a claimed tick count is unbounded work for whoever submits a log.
  it('o fixture carrega o teto de ticks do formato e cabe dentro dele', () => {
    expect(GOLDEN.maxTicks).toBe(60 * 3600 * 3);
    expect(GOLDEN.ticks).toBeLessThanOrEqual(GOLDEN.maxTicks);
  });

  it('o log é feito só de inteiros quantizados, nunca de floats', () => {
    const bad = GOLDEN.log.filter(
      r => ![r.t, r.idx, r.mx, r.my, r.aim, r.flags].every(Number.isInteger),
    );
    expect(bad).toEqual([]);
  });

  // FORM-01/D-30 fixes the slots as p0..p3. Recording the golden against 'p1'
  // would cost an extra re-baseline the day the ids are aligned.
  it('os slots do ouro seguem a numeração p0..p3', () => {
    expect(GOLDEN.config.players.map(p => p.id)).toEqual(['p0']);
  });

  it('simula de verdade até a onda 1 fechar, e o tamanho desse trecho está fixado', () => {
    const world = buildWorld();
    const stepper = createStepper(world);
    const collect = decodeInputLog(GOLDEN.log, GOLDEN.config.players);
    let live = 0;
    while (world.tick < GOLDEN.ticks && world.phase === 'playing') {
      stepper.runTicks(1, collect);
      live = world.tick;
    }
    expect(live).toBe(LIVE_UNTIL);
    expect(world.phase).toBe('shop');
  });

  // D-04: a tick with no record repeats that player's last known input, so a
  // log stores changes only. Without this the fixture would be 3000 records.
  it('o log é esparso, e a política de buracos é repetir o último input', () => {
    expect(GOLDEN.log.length).toBeLessThan(GOLDEN.ticks);
    const collect = decodeInputLog(GOLDEN.log, GOLDEN.config.players);
    const first = GOLDEN.log[0];
    const next = GOLDEN.log.find(r => r.t > first.t)!;
    // Any tick strictly between two records must read as the earlier one.
    const between = next.t - 1;
    expect(collect(between).p0.move.x).toBe((first.mx | 0) / 127);
    expect(collect(between).p0.tick).toBe(between);
  });
});
