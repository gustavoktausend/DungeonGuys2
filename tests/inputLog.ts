// inputLog.ts — PROVISIONAL home of the input-log codec.
//
// Plan 01-10 promotes this module to `packages/protocol/src/inputCodec.ts`,
// where both peers will import it from a single source. It lives under
// tests/ only because the protocol package does not exist yet and the golden
// fixture needs a decoder today. Nothing in src/ may import it.
//
// The golden log stores ALREADY QUANTIZED INTEGERS, never floats. That is the
// whole point: a script generated with Math.sin would diverge between engines
// by itself, which is exactly the failure the cross-engine gate exists to
// catch. Integers are bit-identical everywhere, and the decoding below is
// only division and multiplication — both correctly rounded by IEEE-754 per
// the ECMAScript spec, so it is bit-identical everywhere too.
import type { ClassKey, InputState, RunConfig } from '../src/sim/types';

/** 2*pi/65536 — one turn split into 65536 steps (0.005493 degrees). */
export const AIM_STEP = (Math.PI * 2) / 65536;

/** One tick of one player, as stored in the golden fixture. */
export type InputRecord = {
  /** Tick this input takes effect on. */
  t: number;
  /** Index into the canonical player order. */
  idx: number;
  /** int8, [-127, 127] — decodes to move.x as idx/127. */
  mx: number;
  /** int8, [-127, 127] — decodes to move.y. */
  my: number;
  /** int16, [-32768, 32767] — decodes to radians as aim * AIM_STEP. */
  aim: number;
  /** uint8: bit0 attack, bit1 special, bit2 sprint, bits 3-7 zero. */
  flags: number;
};

export type GoldenSlot = { id: string; cls: ClassKey; name: string };

/**
 * Shape of `tests/golden/*.json`.
 *
 * `maxTicks` is the format's hard ceiling (60 * 3600 * 3), carried from day
 * one: a replay verifier that trusts a claimed tick count is unbounded work
 * for whoever submits the log (T-1-03), and adding the field later would be a
 * format migration.
 *
 * `checkpoints` is TEST DATA and NOT part of the replay format — D-11 refused
 * periodic hash checkpoints in the format itself, and that refusal must not
 * leak back in through the fixture.
 */
export type GoldenFixture = {
  config: RunConfig;
  players: GoldenSlot[];
  ticks: number;
  maxTicks: number;
  log: InputRecord[];
  hash: string;
  checkpoints: { t: number; hash: string }[];
};

const ATTACK = 1;
const SPECIAL = 2;
const SPRINT = 4;

/** Before a player's first record, the last known input is "nothing held". */
function neutral(tick: number): InputState {
  return { tick, move: { x: 0, y: 0 }, aim: 0, attack: false, special: false, sprint: false };
}

function check(ok: boolean, field: string, record: InputRecord): void {
  if (!ok) {
    throw new Error(
      `input log inválido em t=${record.t} idx=${record.idx}: ${field}=${String(
        record[field as keyof InputRecord],
      )}`,
    );
  }
}

/**
 * Builds the per-tick input view the stepper's `runTicks` consumes.
 *
 * Hole-filling policy (D-04) is part of the FORMAT, not an implementation
 * detail: when a tick carries no record for a player, that player REPEATS its
 * last known input. A log therefore only stores changes, which is what makes
 * a 3000-tick run a few hundred records instead of 3000.
 */
export function decodeInputLog(
  log: InputRecord[],
  players: GoldenSlot[],
): (tick: number) => Record<string, InputState> {
  // One ascending timeline per player. Sorting a copy keeps the decoder
  // independent of the writer's emission order; Array#sort is stable and the
  // comparator is pure integer arithmetic, so this is engine-independent.
  const timelines = players.map((): InputRecord[] => []);
  for (const record of log) {
    check(Number.isInteger(record.t) && record.t >= 0, 't', record);
    check(Number.isInteger(record.idx) && record.idx >= 0 && record.idx < players.length, 'idx', record);
    check(Number.isInteger(record.mx) && record.mx >= -127 && record.mx <= 127, 'mx', record);
    check(Number.isInteger(record.my) && record.my >= -127 && record.my <= 127, 'my', record);
    check(Number.isInteger(record.aim) && record.aim >= -32768 && record.aim <= 32767, 'aim', record);
    check(Number.isInteger(record.flags) && record.flags >= 0 && record.flags <= 7, 'flags', record);
    timelines[record.idx].push(record);
  }
  for (const timeline of timelines) timeline.sort((a, b) => a.t - b.t);

  /** Last record with `t <= tick`, or -1 when the player has none yet. */
  function lastAt(timeline: InputRecord[], tick: number): number {
    let lo = 0, hi = timeline.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (timeline[mid].t <= tick) { found = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return found;
  }

  return (tick: number): Record<string, InputState> => {
    const out: Record<string, InputState> = {};
    for (let i = 0; i < players.length; i++) {
      const at = lastAt(timelines[i], tick);
      if (at < 0) { out[players[i].id] = neutral(tick); continue; }
      const record = timelines[i][at];
      out[players[i].id] = {
        tick,
        // `| 0` normalizes a -0 that would otherwise ride through the World
        // and vanish in JSON serialization, faking hash agreement.
        move: { x: (record.mx | 0) / 127, y: (record.my | 0) / 127 },
        // Decoded as int16, NOT uint16: that keeps `aim` in [-pi, pi), the
        // same domain Math.atan2 produces today, so the angle-normalising
        // while-loops in sim/combat.ts keep their current iteration count and
        // therefore their current bits at the edge of the melee arc.
        aim: ((record.aim << 16) >> 16) * AIM_STEP,
        attack: (record.flags & ATTACK) !== 0,
        special: (record.flags & SPECIAL) !== 0,
        sprint: (record.flags & SPRINT) !== 0,
      };
    }
    return out;
  };
}
