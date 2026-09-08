// signaling.ts — the twelve message bodies of the signalling leg, as TYPES.
//
// ZERO RUNTIME. Every import in this file is `import type`, nothing is
// exported that exists after compilation, and that is the property that lets
// @dg2/protocol keep `dependencies: {}` (C-1/C-3): the SHAPES live here, where
// both the browser client and the Node server read them from one source, and
// the VALIDATION lives in apps/server, where zod is already paid for. The two
// are tied together by a compile-time equality assertion in the server's
// schema module, so a schema that drifts from the type it validates is a
// `npm run typecheck:server` failure and not a runtime surprise.
//
// The wire here is JSON, not bytes. SDP is already text, the WebSocket is
// reliable and cold — a handful of messages per room, none of them per tick —
// and JSON is legible in DevTools, which is where this layer is debugged. The
// binary framing of phase 3 is on the OTHER leg, the DataChannel, where the
// per-tick traffic lives.
//
// TWO DECISIONS ARE WRITTEN DOWN HERE BECAUSE THEY ARE EXPENSIVE TO REVERSE:
//
//   1. `Created` and `Joined` both carry `authorityPeerId` EXPLICITLY. The
//      authority is never derived from a slot — not "whoever is in p0", not
//      "whoever created the room". FORM-12 says the protocol does not encode
//      the topology, and a derivation rule IS the topology, written in the one
//      place nobody thinks to look. Naming the peer costs 26 characters per
//      message and is what makes moving authority to a dedicated server a
//      change of constructor: the server announces itself in the same field.
//
//   2. `IceOutcome` carries a client-generated ULID and DOES NOT carry the
//      network endpoint of either peer. D3-14 limits what this telemetry may
//      contain to "no personal data beyond the local ULID", and a player's
//      public endpoint is personal data by any reading. The candidate TYPE and
//      the transport protocol answer the whole question the table asks —
//      how often is relay needed — so the fields that would identify a person
//      are not merely unused, they are UNDECLARABLE (T-3-09): a caller that
//      tried to send them would not compile.
import type { IceCandidateType, IceRoute, RejectReason } from './enums';
import type { Versions } from './version';
import type { PlayerSlot as SlotId } from '@dg2/sim';

/**
 * One ICE server, as plain data.
 *
 * Deliberately not `RTCIceServer`: that is a DOM type, this package compiles
 * with `types: []` and no browser library, and the server that BUILDS this
 * object has no DOM at all. The shape is structurally compatible, so the
 * client hands it straight to `RTCPeerConnection` without a conversion.
 */
export type IceServer = {
  urls: readonly string[];
  username?: string;
  credential?: string;
};

/**
 * The ephemeral TURN credential (D3-10), minted per room by the signalling
 * server as an HMAC over the coturn shared secret.
 *
 * `ttl` is seconds of remaining validity, not an absolute time: an absolute
 * timestamp would need the two machines to agree on a clock, and they do not.
 * The secret itself never leaves the server, and there is no open HTTP
 * endpoint that hands these out — only a peer the server is already matching
 * into a room receives one.
 */
export type TurnCredential = {
  username: string;
  credential: string;
  ttl: number;
};

/** Everything a peer needs to construct its connection, sent on entry. */
export type IceConfig = {
  iceServers: readonly IceServer[];
};

/**
 * One occupant of a room, as the lobby shows it.
 *
 * `name` and `accountId` are SELF-DECLARED (D3-09). Nothing durable depends on
 * either in this phase: they exist to be displayed and to correlate log lines,
 * and phase 6 replaces the pair with an authenticated identity at the one
 * named point in the upgrade handler. Treating them as trusted anywhere would
 * be building on a foundation this phase deliberately did not pour.
 */
export type PeerInfo = {
  peerId: string;
  accountId: string;
  name: string;
  slot: SlotId;
};

/**
 * A peer asks the server to open a room.
 *
 * `versions` is the pair `checkVersions` compares, carried whole rather than
 * as two loose strings, so that the refusal at the door uses the same type as
 * the refusal between peers (D-08). Announcing them at `create` and not only
 * at `hello` is what lets the SERVER refuse a build it cannot pair with,
 * instead of opening a room that nobody will ever be allowed to enter.
 */
export type Create = {
  kind: 'create';
  accountId: string;
  name: string;
  versions: Versions;
};

/** The room exists. The code is the only credential it has (D3-09). */
export type Created = {
  kind: 'created';
  code: string;
  peerId: string;
  authorityPeerId: string;
  slot: SlotId;
  ice: IceConfig;
  turn: TurnCredential;
};

/** A peer asks to enter a room by code. */
export type Join = {
  kind: 'join';
  code: string;
  accountId: string;
  name: string;
  versions: Versions;
};

/** Entry granted, with everyone already inside and who to negotiate with. */
export type Joined = {
  kind: 'joined';
  code: string;
  peerId: string;
  authorityPeerId: string;
  slot: SlotId;
  ice: IceConfig;
  turn: TurnCredential;
  peers: readonly PeerInfo[];
};

/**
 * The room's occupancy changed.
 *
 * The WHOLE list, not a delta. A room holds four people at most, so the delta
 * would save a few dozen bytes on a cold channel and buy the classic bug of
 * an out-of-order delta leaving two machines with different rosters.
 */
export type Peers = {
  kind: 'peers';
  peers: readonly PeerInfo[];
};

/**
 * The three relay verbs. `sdp` and `candidate` are OPAQUE: the server copies
 * the string from one socket to the other and never reads it.
 */
export type Offer = {
  kind: 'offer';
  from: string;
  to: string;
  sdp: string;
};

export type Answer = {
  kind: 'answer';
  from: string;
  to: string;
  sdp: string;
};

export type Candidate = {
  kind: 'candidate';
  from: string;
  to: string;
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
};

/** A peer is leaving on purpose, rather than by dropping its socket. */
export type Leave = {
  kind: 'leave';
  peerId: string;
};

/**
 * The room is gone. Sent to everyone still in it.
 *
 * A room is ephemeral state in a Map, and it dies when the authority's socket
 * closes (D3-11) — this message is the difference between "the game ended" and
 * four clients each guessing from a silence.
 */
export type Closed = {
  kind: 'closed';
  code: string;
  reason: RejectReason;
};

/**
 * How the ICE negotiation actually ended, reported by the peer over the
 * signalling socket that is still open (D3-11, D3-14).
 *
 * `id` is a ULID generated on the CLIENT, and it is the idempotency key: the
 * server writes with the equivalent of an insert-or-ignore, so a peer that
 * retries after a dropped socket produces one row and not two. The same
 * property the gold ledger buys with a client-generated id, for the same
 * reason (ADR 0002).
 *
 * FAILURE IS REPORTED TOO, with `route: 'unknown'` and `result: 'failed'`.
 * A table that only records successes measures nothing: the question is what
 * fraction of rooms needed a relay, and the sessions that never connected are
 * exactly the evidence for the answer.
 *
 * `protocol` and `relayProtocol` are the TRANSPORT of the candidate pair, and
 * they are spelled the way `RTCIceCandidateStats` spells them and the way the
 * `ice_outcome` columns spell them — one word, three places, no translation
 * step to get wrong. They have nothing to do with `PROTOCOL_VERSION`, which is
 * why the version fields elsewhere in this file are a `Versions` pair and not
 * a loose string named `protocol`.
 *
 * `result` and the two transports are inline unions rather than frozen tables
 * on purpose: this leg is JSON, so no index travels, and a table's whole
 * reason to exist — freezing a NUMBER against a NAME — buys nothing here.
 *
 * On what is NOT here, see decision 2 in the file header — the omission is the
 * mitigation, not an oversight.
 */
export type IceOutcome = {
  kind: 'iceOutcome';
  id: string;
  code: string;
  slot: SlotId;
  route: IceRoute;
  localCandidate: IceCandidateType | null;
  remoteCandidate: IceCandidateType | null;
  protocol: 'udp' | 'tcp' | null;
  relayProtocol: 'udp' | 'tcp' | 'tls' | null;
  rttMs: number | null;
  result: 'connected' | 'failed';
};

/**
 * A refusal, carrying a reason from the frozen `REJECT_REASON` table.
 *
 * Named `SignalError` and not `Error`: this module's exports go through the
 * package barrel with `export *`, and a type called `Error` reaching every
 * importer of @dg2/protocol would shadow the global one in whichever file
 * forgot that it had.
 *
 * `detail` is free text for the screen, never for a branch. D-08 wants both
 * version numbers in front of the player, and that sentence is composed by the
 * side that has both — a caller matching on this string instead of on `reason`
 * would be branching on a message written for a human.
 */
export type SignalError = {
  kind: 'error';
  reason: RejectReason;
  detail: string;
};

/**
 * Every message that can cross the signalling socket, discriminated by `kind`.
 *
 * The union exists so that a handler's exhaustiveness is the compiler's
 * problem: adding a thirteenth entry to `SIGNAL_KIND` without handling it
 * turns the `switch` in the server red, which is the whole reason the vocabulary
 * is a frozen table and not a set of loose string comparisons.
 */
export type SignalMessage =
  | Create
  | Created
  | Join
  | Joined
  | Peers
  | Offer
  | Answer
  | Candidate
  | Leave
  | Closed
  | IceOutcome
  | SignalError;
