// runEnvelope.ts — the run artifact (ADR 0011: D-10, D-11, D-12).
//
// This file starts with the two constants and the slot shape, because the
// codec next door needs the ceiling in order to refuse a log before decoding
// it. The envelope type itself lands right after.
//
// The artifact is a READABLE JSON envelope with the input log as a base64 blob
// inside it. Three forces pulled the design apart and this is where they
// balance: a replay nobody can open is a replay nobody can debug, a 20-minute
// run is 72.000 ticks so per-tick JSON blows the 100 KB budget, and everything
// the run needs to be rebuilt has to be present without making it forgeable.
// Everything a person would want to read is plain JSON; the log, which is 99%
// of the bytes, is the one field that is not.

import type { ClassKey, RunConfig } from '@dg2/sim';

/**
 * Bumped when the shape of the envelope changes in a way an older reader
 * cannot cope with.
 *
 * Annotated `: number` rather than left as the literal `1`, for the same
 * reason PROTOCOL_VERSION is annotated `: string`: this value is compared
 * against a number that arrived inside a submitted artifact, and narrowing it
 * to a literal would let the compiler "prove" things about a comparison whose
 * other side is runtime data.
 */
export const RUN_FORMAT_VERSION: number = 1;

/**
 * Hard ceiling on how many ticks a run may claim: sixty ticks per second,
 * three hours of wall clock.
 *
 * The field lives in the FORMAT from day one even though the machinery that
 * ENFORCES it in full (bytes and wall-clock budget) belongs to phase 9. Adding
 * it after replays exist would be a format migration, and the whole point of
 * ADR 0011 is to fix the expensive fields before the format has users.
 *
 * The number is not decoration. A log claiming a ten-hour run is 2.16 million
 * ticks of work for whoever verifies it, and ten such submissions in parallel
 * take a small VPS down — the cost is paid by the verifier and chosen by the
 * submitter, which is the shape of every amplification attack (T-1-03). So the
 * ceiling is structural, checked inside the decoder, rather than a validation
 * someone can forget to wire into the next endpoint.
 */
export const MAX_RUN_TICKS: number = 60 * 3600 * 3;

/**
 * One entry of the canonical player order.
 *
 * The order is the artifact's, not the network's: byte 5 of every packed tick
 * is an index into THIS array (D-12). Until `RunConfig.players` exists, index
 * 0 designates the local slot — written down here rather than left implicit,
 * because an implicit zero is how two sides end up disagreeing about who
 * player one is.
 */
export type PlayerSlot = {
  id: string;
  cls: ClassKey;
  name: string;
};

/**
 * A recorded run, as submitted for verification.
 *
 * WHAT IS NOT HERE IS THE DESIGN (D-11). There is no initial snapshot and
 * there are no periodic hash checkpoints, and both absences are deliberate:
 *
 *   - No initial snapshot, because a tampered one is an arbitrary starting
 *     World that the verifier would then faithfully re-run. The verifier calls
 *     `createWorld(config)` and generates the arena from the seed, so the
 *     whole setup is DERIVED rather than DECLARED, and a divergent setup fails
 *     at tick 0 instead of somewhere unhelpful later.
 *   - No periodic checkpoints, because they invite sampled verification —
 *     partial checking sold as complete — and because the first valid
 *     checkpoint hides every tick before it. Verification here is integral or
 *     it is nothing.
 *
 * The `checkpoints` array that lives in `tests/golden/*.json` is TEST DATA and
 * is not part of this type. The distinction is written down because this is
 * exactly where the refusal above tends to leak back in: a fixture field that
 * looks useful gets copied into the format by someone who never read D-11.
 */
export type RunEnvelope = {
  /** RUN_FORMAT_VERSION at the time of recording. */
  runFormatVersion: number;
  /**
   * The run's seed, surfaced at the top level so a person can read it without
   * unfolding `config`. `config` remains the authoritative copy — the verifier
   * builds the world from it, so this field can only ever be inspected, never
   * obeyed.
   */
  seed: number;
  /** Everything `createWorld` needs. The replay starts here (D-11). */
  config: RunConfig;
  /** SIM_VERSION of the build that recorded the run (FORM-03). */
  simVersion: string;
  /** PROTOCOL_VERSION of the build that recorded the run (D-09). */
  protocolVersion: string;
  /** Canonical player order. Packed tick indices point into this (D-12). */
  players: PlayerSlot[];
  /** How many ticks the run claims to be. Checked against `maxTicks`. */
  ticks: number;
  /** The ceiling in force when this was recorded. See MAX_RUN_TICKS. */
  maxTicks: number;
  /** The score the submitter claims. Believed only after the replay agrees. */
  score: number;
  /** `hashWorld` after `ticks` ticks — what the replay has to reproduce. */
  finalHash: string;
  /** The input log, base64 of the binary form in `inputCodec.ts`. */
  log: string;
};
