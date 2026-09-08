// snapshot-bench.test.ts — the gate of SYNC-04 and of success criterion 5 of
// phase 3: a snapshot that does not fit in 16 KiB per DataChannel message
// breaks the build before it reaches a player.
//
// THIS FILE AND tools/bench/snapshot.mjs ARE HALVES OF ONE CONTROL, and they
// are not redundant. This one refuses to let a part reach the ceiling. That one
// prints the six numbers into the CI log, which is the only thing that makes a
// regression from 2,8 KiB to 9 KiB visible in the pull request that caused it —
// a regression the gate below happily passes. The gate alone hides drift under
// the ceiling; the print alone never says no.
//
// Both measure THE SAME WORLDS, imported from tests/worlds.ts and never rebuilt
// here. The header of that file spells out why: a second copy of the
// constructors lets the bench and the gate drift apart while both stay green,
// and by then one of them has stopped describing the game.
import { describe, expect, it } from 'vitest';
import {
  SNAPSHOT_MAX_BYTES,
  SNAPSHOT_PART,
  encodeSnapshot,
  extractSnapshot,
} from '@dg2/protocol';
import { step } from '@dg2/sim';
import type { InputState, World } from '@dg2/sim';
import { noInput } from './helpers';
import { expectedEnemies, wave16SwarmElite, wave1FourPlayers, wave40Endless } from './worlds';

/**
 * How many ticks the neutral-input run is driven for: one WAVE_DURATION.
 *
 * THE LIMITATION, WRITTEN DOWN RATHER THAN LEFT TO BE DISCOVERED, because a
 * reader who assumes this run reaches wave 16 would draw a far stronger
 * conclusion than the run supports:
 *
 *   1. Neutral input means nobody attacks, so no enemy ever dies. That errs
 *      HIGH on the enemy count, which is the correct side to err on in a
 *      ceiling test — a real played run has fewer actors alive, not more.
 *   2. Nobody moves either, so the four players are killed by the wave-1
 *      cohort. Measured on this fixture: `phase` leaves 'playing' at tick 614
 *      of the run, and `step` returns early from then on, freezing the world.
 *      The research that proposed this test predicted enemies would PILE UP
 *      over many waves; the measurement says the run ends first. Both readings
 *      agree on the conclusion and disagree on the mechanism, so the mechanism
 *      is recorded here as measured, not as predicted.
 *   3. Boss waves are not released by time — `advanceWave` only auto-clears a
 *      wave when `!waveHasBoss` — so even a surviving party would stall at the
 *      wave-4 miniboss. This run NEVER REACHES WAVE 16.
 *
 * What it proves, therefore, is the one thing D3-20 asks of it: the synthetic
 * world is a CEILING, not a sample. If the assertion below ever turns red, the
 * conclusion is "the synthetic is wrong and tests/worlds.ts is what gets
 * fixed", not "the game blew the budget".
 *
 * 1800 ticks is 30 s at the fixed step, one full WAVE_DURATION, chosen so the
 * window comfortably outlives the 614 ticks the run actually lasts.
 */
const REAL_RUN_TICKS = 1800;

/** The three part sizes of one world, in the fixed order of SNAPSHOT_PART. */
function partBytes(world: World): number[] {
  return encodeSnapshot(extractSnapshot(world)).map(part => part.byteLength);
}

/**
 * Names every part at or above the budget, instead of stopping at the first.
 *
 * Same discipline as tests/input-codec.test.ts:96-119: one run has to report
 * all the problems it can see. A gate that fails on part 0 and says nothing
 * about parts 1 and 2 sends someone back for a second round trip over a defect
 * that was already measurable.
 */
function overBudget(scenario: string, bytes: number[]): string[] {
  const found: string[] = [];
  bytes.forEach((size, index) => {
    // `>=`, not `>`: a part landing exactly on the budget has already spent it.
    if (size >= SNAPSHOT_MAX_BYTES) {
      found.push(`${scenario}/${SNAPSHOT_PART[index]}: ${size} >= ${SNAPSHOT_MAX_BYTES}`);
    }
  });
  return found;
}

/** Names every part of `bytes` that failed to stay under `reference`. */
function notBelow(label: string, bytes: number[], reference: number[]): string[] {
  const found: string[] = [];
  bytes.forEach((size, index) => {
    if (size >= reference[index]) {
      found.push(`${label}/${SNAPSHOT_PART[index]}: ${size} >= ${reference[index]}`);
    }
  });
  return found;
}

// tools/ read as text through Vite's raw glob, not node:fs — tsconfig's `types`
// is ["vite/client"] only, and tools/README.md §4 says not to touch that. Same
// mechanism tests/ops-config.test.ts uses to assert files that never execute
// inside this program.
const BENCH_REL = '../tools/bench/snapshot.mjs';
const BENCH = import.meta.glob<string>('../tools/bench/*.mjs', {
  query: '?raw', import: 'default', eager: true,
});

describe('teto de mensagem do DataChannel (SYNC-04)', () => {
  it('cada uma das três partes da wave 16 com quatro jogadores cabe abaixo do teto', () => {
    expect(overBudget('wave16', partBytes(wave16SwarmElite()))).toEqual([]);
  });

  it('cada uma das três partes da wave 40 endless cabe abaixo do teto', () => {
    expect(overBudget('wave40', partBytes(wave40Endless()))).toEqual([]);
  });

  it('a wave 1 mede menos que a wave 16 em todas as três partes', () => {
    // Not a ceiling assertion — a monotonicity one. If the cheap world ever
    // measured as much as the expensive one, the codec would have stopped
    // responding to the thing it is supposed to respond to (how much is in the
    // world), and every number above it would be measuring something else.
    expect(notBelow('wave1', partBytes(wave1FourPlayers()), partBytes(wave16SwarmElite())))
      .toEqual([]);
  });

  it('uma run real de quatro jogadores com input neutro fica abaixo do sintético', () => {
    const world = wave1FourPlayers();
    const slots = world.config.players.map(entry => entry.id);
    const inputs = (tick: number): Record<string, InputState> =>
      Object.fromEntries(slots.map(id => [id, noInput(tick)]));

    // The PEAK across every tick, not the last frame. The last frame of this
    // run is a frozen gameover world whose projectiles have all expired — 14
    // bytes of part 1 — and a test that measured only that would be asserting
    // almost nothing. The peak is the honest number: at no point during the run
    // did any part come near the synthetic.
    const peak = partBytes(world);
    for (let i = 0; i < REAL_RUN_TICKS; i++) {
      step(world, inputs(world.tick));
      world.events.length = 0; // events are presentation, and unbounded here
      partBytes(world).forEach((size, index) => {
        if (size > peak[index]) peak[index] = size;
      });
    }

    expect(notBelow('run real (pico)', peak, partBytes(wave16SwarmElite()))).toEqual([]);

    // The limitation of REAL_RUN_TICKS, asserted rather than merely claimed in
    // a comment. A red line here does NOT mean the snapshot grew: it means the
    // run stopped behaving the way the constant's doc says it behaves, and the
    // doc is what has to be re-read before the number above is trusted again.
    expect(world.wave, 'a run com input neutro não deveria alcançar a wave 16').toBeLessThan(16);
    expect(world.phase, 'a run com input neutro termina em derrota').not.toBe('playing');
  });

  it('o teto do bench e o SNAPSHOT_MAX_BYTES do codec são o mesmo número', () => {
    // Structural guard in the style of tests/ops-config.test.ts: the bench is
    // read as TEXT because it is the only way to see the literal without
    // running it. TWO CEILINGS IN TWO FILES DIVERGE ON THE DAY ONE OF THEM
    // MOVES, and the divergence is silent in the worst direction — the bench
    // would go on printing `teto=16384` while the codec had been raised, so the
    // CI log would report a limit nobody was enforcing.
    const src = BENCH[BENCH_REL];
    // Type is not the guard, length is: '' is a string and would satisfy
    // toBeTypeOf and then match nothing below, turning this into a green no-op
    // over an empty glob. tests/ops-config.test.ts records the same trap.
    expect(src, `o glob não encontrou ${BENCH_REL}`).toBeTypeOf('string');
    expect(src!.length, 'tools/bench/snapshot.mjs está vazio ou truncado').toBeGreaterThan(1000);

    const match = src!.match(/^const CEILING = (\d+)(?:\s*\*\s*(\d+))?;/m);
    expect(match, 'não achei a constante CEILING em tools/bench/snapshot.mjs').not.toBeNull();
    const ceiling = Number(match![1]) * (match![2] === undefined ? 1 : Number(match![2]));
    expect(ceiling).toBe(SNAPSHOT_MAX_BYTES);
  });

  it('o sintético da wave 16 carrega ao menos a coorte da fórmula do sim', () => {
    // `round((4 + 16 * 3) * 1.6)` is startNextWave's own arithmetic under
    // `swarm`, spelled out here instead of imported so that a change to the
    // formula shows up as a disagreement between two files rather than as two
    // files agreeing on a new number. The boss makes the fixture one larger,
    // which is why this is >= and not ===.
    const byFormula = Math.round((4 + 16 * 3) * 1.6);
    expect(byFormula).toBe(83);
    expect(wave16SwarmElite().enemies.length).toBeGreaterThanOrEqual(byFormula);
    expect(wave16SwarmElite().enemies.length).toBe(expectedEnemies(16, 'swarm'));
  });
});
