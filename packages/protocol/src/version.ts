// version.ts — PROTOCOL_VERSION and the version refusal (D-08, D-09).
//
// PROTOCOL_VERSION IS NOT SIM_VERSION. The two numbers answer different
// questions and are deliberately kept apart:
//
//   SIM_VERSION       a content hash of the simulation bundle, computed by the
//                     build. Changing it CLOSES A SEASON: every replay and
//                     every ranking entry recorded under the old value belongs
//                     to a different era and cannot be compared with the new
//                     one.
//   PROTOCOL_VERSION  a hand-bumped integer, below. Changing it only REFUSES A
//                     CONNECTION. Nothing already stored becomes invalid,
//                     because nothing already stored was written in terms of
//                     it.
//
// Folding them into one number would make a wire-format tweak close a season
// for no reason at all — which is why they are two fields in `Versions` and
// two separate comparisons in `checkVersions`, not one concatenated string.

/**
 * Bumped by hand, and only when the meaning of bytes on the wire changes:
 * a new message kind, a changed field layout, a changed framing rule.
 *
 * Typed as `string` rather than the literal `'1'` on purpose. This value is
 * compared against strings that arrived from a remote machine, so narrowing it
 * to a literal would let the compiler "prove" things about a runtime-variable
 * comparison and reject perfectly correct future code with "no overlap".
 */
export const PROTOCOL_VERSION: string = '1';

/** The pair of versions that has to agree before two machines may talk. */
export type Versions = {
  sim: string;
  protocol: string;
};

/**
 * The first axis on which two `Versions` disagree, carrying BOTH values.
 *
 * Both values are here because the screen needs both (D-08). "Incompatible
 * version" on its own costs an hour of debugging every single time it is seen;
 * "yours 1, theirs 2" costs nothing.
 */
export type VersionMismatch = {
  kind: keyof Versions;
  ours: string;
  theirs: string;
};

/**
 * Comparison order, as data rather than as an if-chain, so that "which
 * mismatch is reported first" is a reviewable decision instead of an accident
 * of statement order.
 *
 * `protocol` comes first because the protocol version governs how the message
 * was framed in the first place. If that disagrees, the `sim` field may not
 * even mean what this side thinks it means, so reporting a sim mismatch would
 * be reporting a value that was possibly misread.
 */
const AXES: readonly (keyof Versions)[] = ['protocol', 'sim'];

/**
 * Returns the first mismatching axis, or `null` when both agree.
 *
 * D-08, written here because this is where it is enforced: DIFFERENT VERSIONS
 * ALWAYS REFUSE, AND THERE IS NO DEV ESCAPE HATCH. An escape hatch that exists
 * is an escape hatch that leaks into production, and a silent desync is the
 * most expensive failure to diagnose in this project — it surfaces forty
 * seconds later, somewhere else, as "the game is weird on my screen". So this
 * function takes no flag, reads no environment variable, and has no optional
 * tolerance parameter. It is pure, total, and has exactly two arguments.
 *
 * The wording above avoids spelling the identifiers an audit would search for
 * (an environment read, an escape-hatch flag name), and that is deliberate:
 * the acceptance check for this file is a grep, and a doc comment that trips
 * the audit it describes is how an audit gets retired for being noisy.
 *
 * The caller is the one that builds the message for the screen, and it gets
 * everything it needs from the return value: the axis (which maps to a
 * REJECT_REASON), `ours` and `theirs`. The remaining half of D-08 — telling
 * the player to reload — belongs to that caller, because the wording is a
 * product decision and this package renders nothing.
 *
 * Symmetric by construction (T-1-01): whoever holds authority passes ITS OWN
 * values as `ours` and the values that arrived as `theirs`. A remote peer
 * never supplies the reference to compare against, so a forged version can
 * only get itself refused — it can never widen what is accepted.
 */
export function checkVersions(ours: Versions, theirs: Versions): VersionMismatch | null {
  for (const kind of AXES) {
    if (ours[kind] !== theirs[kind]) {
      return { kind, ours: ours[kind], theirs: theirs[kind] };
    }
  }
  return null;
}
