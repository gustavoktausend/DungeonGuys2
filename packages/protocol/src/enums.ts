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
// FORM-12 — THE PROTOCOL DOES NOT CONTAIN THE WORD "host". Comments are
// stripped before the check in tests/protocol-vocabulary.test.ts, so this
// paragraph is free to name the word it is about. In CODE there is now exactly
// one occurrence in the whole package — the first entry of
// ICE_CANDIDATE_TYPE, which is the W3C/RFC 8445 name for a network interface
// and not a claim about who is in charge. It carries a per-line exemption
// marker, the list of files allowed to use that marker is a literal in the
// audit, and every marked line has to cite the RFC. One named exception with
// three locks on it is a smaller hole than a looser regex, which would have
// stopped catching `authorityHost` as well. The replacement vocabulary is:
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
 *
 * `ping` and `pong` were APPENDED in phase 3 (D3-13), taking indices 8 and 9.
 * They are appended and not slotted next to the session messages they
 * conceptually belong with, because appending is the only safe edit — putting
 * them at index 2 would have turned every recorded `reject` into a `ping`.
 *
 * THESE ARE GAME MESSAGES, ON THE `unreliable` DATA CHANNEL, AND THEY ARE NOT
 * THE WEBSOCKET CONTROL FRAMES OF THE SAME NAME. The signalling server's
 * keepalive uses RFC 6455 ping/pong frames, which the transport handles and
 * which never reach this table; these two travel between PEERS and measure the
 * round trip of the path that `input` and `snapshot` actually take, which is
 * the number the screen shows. Two things wearing one name in two layers is a
 * fact of the stack, not a naming mistake — the cost of renaming either would
 * be worse than the cost of this paragraph.
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
  'ping',
  'pong',
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

/**
 * The three parts a snapshot splits into when it does not fit in one message
 * (D3-19). The index is the part number on the wire.
 *
 * THE PARTITION IS BY CLASS OF ENTITY, AND EACH PART IS SELF-CONTAINED: actors
 * (players and enemies), projectiles, pickups (coins, potions, chests). Every
 * part carries its own tick and decodes on its own, so LOSING ONE DOES NOT
 * INVALIDATE THE OTHERS — the receiver applies what arrived and waits for the
 * next tick to catch up on what did not. That is the whole reason the split is
 * by class and not by byte count: fragmenting a single logical message would
 * mean reassembly, reassembly means a buffer keyed by tick, and a buffer keyed
 * by tick on an unreliable channel means a memory leak with a stranger's
 * message in it.
 *
 * IT IS NOT INTEREST MANAGEMENT. Nothing here decides what a given peer is
 * allowed to see or cares to see; all three parts go to everyone. Culling by
 * relevance is a different feature with a different failure mode (an entity
 * that pops into existence at the edge of the screen), and conflating the two
 * would make one table serve two decisions.
 *
 * `actors` is index 0 because it is the part that a room cannot play without.
 */
export const SNAPSHOT_PART = ['actors', 'projectiles', 'pickups'] as const;
export type SnapshotPart = typeof SNAPSHOT_PART[number];

/**
 * The signalling vocabulary — the SERVER leg, over the WebSocket.
 *
 * `MSG_KIND` above is the PEER leg, over the DataChannel. Two tables because
 * they are two wires with two trust models: the server is a post office that
 * routes envelopes it never opens, and the peers are the ones running a shared
 * simulation. Folding the two vocabularies into one would let a peer address
 * the server by accident, and would make every future signalling message cost
 * a `PROTOCOL_VERSION` bump for peers that never see it.
 *
 * The order is the order of a room's life: `create`/`created` opens it,
 * `join`/`joined` fills it, `peers` keeps the authority informed, the three
 * relay verbs negotiate the connections, `leave`/`closed` end it, `iceOutcome`
 * reports how it went (D3-14) and `error` refuses.
 *
 * THE SERVER NEVER PARSES SDP. `offer`, `answer` and `candidate` carry opaque
 * strings that it copies from one socket to another without reading — which is
 * what keeps the signalling server out of the WebRTC compatibility business,
 * and what makes "the server relayed it wrong" a diagnosis that cannot happen.
 */
export const SIGNAL_KIND = [
  'create',
  'created',
  'join',
  'joined',
  'peers',
  'offer',
  'answer',
  'candidate',
  'leave',
  'closed',
  'iceOutcome',
  'error',
] as const;
export type SignalKind = typeof SIGNAL_KIND[number];

/**
 * How a peer connection was actually routed, once ICE settled (D3-14).
 *
 * `unknown` IS AT INDEX 0, and the reason is worth having twice rather than
 * once by reference: a zeroed or absent field has to decode to "I do not know"
 * and never to "direct". This table exists to measure how often relay is
 * needed, and a bug that silently reports missing data as `direct` would bias
 * the one number the measurement was built to produce — downward, in the
 * reassuring direction, which is the direction nobody investigates.
 *
 * `direct` covers every pair that crossed the NAT on its own, including
 * `srflx` to `srflx`. `relay` is any pair with a TURN allocation on either
 * end, because one relayed end is enough to pay the latency and the bandwidth.
 */
export const ICE_ROUTE = ['unknown', 'direct', 'relay'] as const;
export type IceRoute = typeof ICE_ROUTE[number];

/**
 * The four ICE candidate types, spelled exactly as the W3C stats API and
 * RFC 8445 spell them, because these values are READ OFF `getStats()` and
 * stored — renaming them here would mean translating at every call site and
 * mistranslating at one of them.
 *
 * The first entry is the local-interface candidate, and it is the one word
 * this package otherwise refuses to contain: the FORM-12 audit forbids it
 * because it describes a TOPOLOGY (whose machine is in charge), and this
 * occurrence is the standards body's word for a NETWORK INTERFACE, which is a
 * different noun that happens to be spelled the same. The line therefore
 * carries the exemption marker that the audit in
 * tests/protocol-vocabulary.test.ts looks for; the marker is per LINE, the set
 * of files allowed to use it is a literal list in that test, and every marked
 * line must also cite the RFC. Loosening the regex instead would have been the
 * cheap fix and the wrong one: it would stop catching `authorityHost` too.
 */
export const ICE_CANDIDATE_TYPE = [
  'host', // FORM-12-EXEMPT: RFC 8445 candidate type (network interface), not this project's topology
  'srflx',
  'prflx',
  'relay',
] as const;
export type IceCandidateType = typeof ICE_CANDIDATE_TYPE[number];
