// enums.ts — the frozen wire tables (FORM-11).
//
// APPEND-ONLY. Each table is an ordered array and the INDEX of a name is its
// wire value, which makes exactly one edit safe:
//
//   append at the END      safe. Every value that already existed keeps its
//                          number, so an old reader still decodes correctly
//                          and merely does not recognise the new one.
//   insert in the MIDDLE   break. Every value after the insertion point shifts
//                          by one, so a message written as 'input' is read as
//                          'snapshot'. Nothing throws; it just misbehaves,
//                          somewhere else, later.
//   rename an entry        break, same as above wearing a different name.
//
// tests/protocol-enums.test.ts compares these against the frozen record in
// tests/snapshots/protocol-enums.json and names the table and the index it
// disagrees on. Updating the golden in the same commit is what turns "I
// appended" into a reviewable statement instead of a hope.
//
// FORM-12 — THE PROTOCOL DOES NOT CONTAIN THE WORD "host". This comment is the
// only place it appears in this package, and comments are stripped before the
// check in tests/protocol-vocabulary.test.ts. The replacement vocabulary is:
// whoever owns the simulation is the AUTHORITY, the machines connected to it
// are PEERS, and the places they occupy in a room are SLOTS. The words are the
// point, not decoration: today authority happens to sit on a player's machine
// over WebRTC, and the day it moves to a dedicated server the names still
// describe reality, so that change is a swap of transport and not a rename of
// every message in the protocol.

/**
 * Message kinds. The index is the wire value.
 *
 * The order is the order of a session: a peer says `hello`, the authority
 * answers `welcome` or `reject`, `lobbyState` carries the slots, `startRun`
 * begins, then `input` and `snapshot` flow for the rest of the run with `ack`
 * closing the loop.
 */
export const MSG_KIND = [
  'hello',
  'welcome',
  'reject',
  'lobbyState',
  'startRun',
  'input',
  'snapshot',
  'ack',
] as const;
export type MsgKind = typeof MSG_KIND[number];

/**
 * Why a peer was refused. D-08 requires the reason to reach the screen, so
 * every entry here has to be something a player can act on.
 *
 * `simVersion` and `protocolVersion` are named to match `VersionMismatch.kind`
 * plus the `Version` suffix — see the test that pins the two vocabularies
 * together.
 */
export const REJECT_REASON = [
  'simVersion',
  'protocolVersion',
  'roomFull',
  'roomClosed',
  'badCode',
] as const;
export type RejectReason = typeof REJECT_REASON[number];

/**
 * The two delivery guarantees a channel can offer, which is all the wire needs
 * to distinguish: `reliable` for things that must arrive exactly once and in
 * order (lobby, start, refusal), `unreliable` for things whose successor makes
 * them obsolete (input, snapshot), where a retransmit would deliver stale
 * truth late and cost more than the loss did.
 *
 * The table exists now because the shape is knowable now. The backpressure
 * policy is NOT here on purpose: that is a measured decision for phase 4, and
 * writing it down before there is a measurement would be design without data.
 */
export const CHANNEL_CLASS = ['reliable', 'unreliable'] as const;
export type ChannelClass = typeof CHANNEL_CLASS[number];

/**
 * Mission objective kinds, on the wire from phase 8.
 *
 * `none` sits at index 0 so that an absent or zeroed objective field decodes
 * to "no objective" rather than to a real one — the safe value is the cheap
 * one to get by accident.
 *
 * The table is born here, ahead of its use, because the wire value has to be
 * frozen before anything writes it down. Plan 01-14 asserts that this list
 * matches the simulation's `ObjectiveKind` in the same order; without that
 * check the simulation and the wire would read the same integer as two
 * different objectives.
 */
export const OBJECTIVE_KIND = [
  'none',
  'defend',
  'hunt',
  'purge',
  'fetch',
  'extract',
] as const;
export type ObjectiveKind = typeof OBJECTIVE_KIND[number];
