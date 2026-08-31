// runEnvelope.ts — the run artifact (ADR 0011: D-10, D-11, D-12).
//
// This file starts with the two constants and the slot shape, because the
// codec next door needs the ceiling in order to refuse a log before decoding
// it. The envelope type itself lands right after.

import type { ClassKey } from '@dg2/sim';

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
