// cross-engine.test.ts — the BROWSER leg of the determinism gate.
//
// This is the only test in the suite that can fail for the reason it exists
// to catch. tests/determinism.test.ts compares two worlds in the SAME process
// on the SAME engine, so by construction it can never see an engine
// disagreeing with another engine. This file runs the identical golden run in
// Chromium, Firefox and WebKit (vitest.browser.config.ts) and compares each
// engine's hashWorld against the golden recorded from Node.
//
// It was RED BY DESIGN from plan 01-04 until plan 01-12, which pointed sim/'s
// 27 trigonometry call sites at the vendored fdlibm ports in sim/math.ts. It
// is GREEN now, and green is the deliverable: all four engines answer
// 53f86446 on the golden run, and every one of the 50 checkpoints agrees.
//
// The measurement it recorded on the way is worth keeping. Before the swap,
// Node answered d3a93053 and all three browsers answered fa099f16, first
// disagreeing at tick 960 and still disagreeing at tick 3000. After the swap
// Node moved to fa099f16 — the browsers' old answer — which is to say the
// port agrees with what Chromium, Firefox and WebKit had been computing, and
// Node's built-ins were the outlier. The remaining step to 53f86446 is the
// World shape change in the same plan, not trigonometry.
//
// If this ever goes red again, do NOT "fix" it by loosening the comparison or
// dropping an engine. It has exactly one meaning: some path in sim/ started
// depending on arithmetic the spec only approximates.
//
// The body below is deliberately a copy of the run in tests/golden.test.ts:
// the two legs must drive the sim identically or the comparison between them
// means nothing. Change one, change the other.
import { describe, it, expect } from 'vitest';
import { createWorld, createPlayer, startRun } from '@dg2/sim';
import { createStepper } from '../src/app/stepper';
import { hashWorld } from './helpers';
import { decodeInputLog, type GoldenFixture } from './inputLog';
import type { World } from '@dg2/sim';
import FIXTURE from './golden/campaign-mage-3000.json';

const GOLDEN = FIXTURE as unknown as GoldenFixture;

/**
 * Checkpoint cadence. These intermediate hashes are TEST DATA and are NOT
 * part of the replay format: D-11 refused periodic hash checkpoints in the
 * format, and that refusal must not leak back in through this file. They
 * exist for one reason — so a failure says WHICH TICK diverged instead of
 * only that the final hash differs.
 */
const CHECKPOINT_EVERY = 60;

/** The canonical start-of-run sequence, exactly as main.ts:120-124 does it. */
function buildWorld(): World {
  const world = createWorld(GOLDEN.config);
  for (const slot of GOLDEN.players) createPlayer(world, slot.id, slot.cls, slot.name);
  startRun(world);
  return world;
}

// The engine name comes from the Vitest project name, so a failure already
// reads "webkit > determinismo entre motores" with no plumbing here. Nothing
// in this file inspects the host to find out where it is running.
describe('determinismo entre motores', () => {
  it('a run de ouro produz o mesmo hashWorld neste motor', () => {
    const world = buildWorld();
    createStepper(world).runTicks(GOLDEN.ticks, decodeInputLog(GOLDEN.log, GOLDEN.players));
    expect(world.tick).toBe(GOLDEN.ticks);
    expect(hashWorld(world)).toBe(GOLDEN.hash);
  });

  it('os hashes intermediários batem, para localizar o tick da divergência', () => {
    const world = buildWorld();
    const stepper = createStepper(world);
    const collect = decodeInputLog(GOLDEN.log, GOLDEN.players);

    const marks: { t: number; hash: string }[] = [];
    while (world.tick < GOLDEN.ticks) {
      stepper.runTicks(Math.min(CHECKPOINT_EVERY, GOLDEN.ticks - world.tick), collect);
      marks.push({ t: world.tick, hash: hashWorld(world) });
    }

    // Reported as a sentence rather than as a 50-entry array diff. The span
    // matters as much as the first tick: a divergence that appears and then
    // heals (an entity that diverged and then died) leaves the FINAL hash
    // agreeing, which is why the final-hash test above cannot be trusted on
    // its own. Printing first, last and count makes that visible instead of
    // silent.
    const bad = marks
      .map((mark, i) => ({ mark, gold: GOLDEN.checkpoints[i].hash }))
      .filter(({ mark, gold }) => mark.hash !== gold);
    const verdict = bad.length === 0
      ? 'nenhuma divergência'
      : `${bad.length}/${marks.length} checkpoints divergem; primeiro no tick ${bad[0].mark.t} `
        + `(ouro ${bad[0].gold}, este motor ${bad[0].mark.hash}); `
        + `último no tick ${bad[bad.length - 1].mark.t}`;
    expect(verdict).toBe('nenhuma divergência');
  });
});
