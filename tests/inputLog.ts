// inputLog.ts — thin adapter. Plan 01-10 promoted the codec to
// @dg2/protocol; golden.test.ts and cross-engine.test.ts keep importing it
// from here, which is what makes the promotion pure code motion and leaves the
// golden hash provably untouched.
import type { InputRecord } from '@dg2/protocol';
import type { RunConfig } from '@dg2/sim';

export { AIM_STEP, decodeInputRecords as decodeInputLog } from '@dg2/protocol';
export type { InputRecord, PlayerSlot as GoldenSlot } from '@dg2/protocol';

/**
 * Shape of tests/golden/*.json. `checkpoints` is TEST DATA, not format (D-11).
 *
 * There is NO top-level `players` here any more: plan 01-13 folded the
 * fixture's slot list into `config.players`, which is the canonical order the
 * simulation itself iterates (FORM-02/D-13). Two lists of who is in the run is
 * two answers to the same question, and the replay only reads one of them.
 */
export type GoldenFixture = {
  config: RunConfig; ticks: number; maxTicks: number;
  log: InputRecord[]; hash: string; checkpoints: { t: number; hash: string }[];
};
