// schema.ts — the twelve signalling messages, validated at the door.
//
// EVERY MESSAGE IN THIS FILE ARRIVES FROM THE INTERNET. The signalling upgrade
// carries no session until phase 6 (D3-09), so the only thing standing between
// a stranger's JSON and the room map is this module. That is why every text
// field below has a CEILING and why an unknown `kind` is REFUSED rather than
// ignored (ASVS V5): a field with no maximum is a memory budget handed to
// whoever connects first, and a message that is silently dropped is a bug
// report nobody can file.
//
// WHY THE SCHEMAS LIVE HERE AND THE TYPES LIVE IN @dg2/protocol. The shapes are
// shared with the browser, which publishes zero runtime dependencies (C-1/C-3),
// so packages/protocol/src/signaling.ts is `import type` from top to bottom and
// has no validator in it. The server already pays for hono, kysely and
// better-sqlite3, so the marginal cost of zod here is zero. The two halves are
// two spellings of one thing, and THE FAILURE MODE OF TWO SPELLINGS IS THAT
// THEY DRIFT IN SILENCE — a schema that stops matching its type does not throw,
// it simply starts accepting a message the rest of the server cannot read.
//
// The `Equal`/`Expect` pair below is what makes that drift impossible. Each
// message gets one line asserting that `z.infer<typeof X>` and the wire type
// are THE SAME TYPE, not merely assignable to each other, and the assertion is
// evaluated by `npm run typecheck:server` — a gate that already exists and
// already runs in CI. Assignability would not do: a schema that dropped a field
// would still produce a value assignable to a type with that field optional,
// and a schema that added one would still satisfy the reader. Identity is the
// only relation that catches both directions.
//
// NAMING NOTE: the wire types are imported as `wire`, not as `protocol`. The
// obvious name collides with two real fields — `Versions.protocol` and
// `IceOutcome.protocol`, the second of which is an ICE TRANSPORT and has
// nothing to do with the version — and a reader who has to decide which
// `protocol` a line means is one keystroke from writing the wrong one.
import { z } from 'zod';
import {
  ICE_CANDIDATE_TYPE,
  ICE_ROUTE,
  PLAYER_SLOT,
  REJECT_REASON,
  isRoomCode,
} from '@dg2/protocol';
import type * as wire from '@dg2/protocol';

/**
 * True only when A and B are the SAME type, not merely mutually assignable.
 *
 * The two function types are identical except for the branch, so TypeScript can
 * only relate them by comparing A and B with its internal identity check — the
 * one relation that is not weakened by variance.
 */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;

/** Fails to compile when its argument is anything but `true`. */
type Expect<T extends true> = T;

// ─── The ceilings ────────────────────────────────────────────────────────────
//
// Numbers, with the reason next to each, because a limit whose justification
// lives in a plan is a limit somebody raises during an outage.

/**
 * A self-declared display name (D3-09), in CODE POINTS rather than UTF-16 code
 * units.
 *
 * Twenty-four is what fits a lobby row. Counting code points and not `.length`
 * is the difference between "24 characters" and "12 emoji", and a player whose
 * name is refused for being 24 characters long would have no way to tell why.
 */
const MAX_NAME_CODE_POINTS = 24;

/** An account identifier. Phase 6 replaces this with an authenticated one. */
const MAX_ACCOUNT_ID = 32;

/** A connection handle minted by the server. ULID-shaped, with slack. */
const MAX_PEER_ID = 64;

/**
 * The SDP body of an `offer` or an `answer`.
 *
 * A real offer with a generous candidate list lands at 4-8 KiB; 16 KiB is
 * roughly double the worst case observed, and it sits well inside the socket's
 * own 64 KiB `maxPayload` so that a message refused HERE is refused with a
 * reason rather than by the transport tearing the connection down.
 */
const MAX_SDP = 16 * 1024;

/** One ICE candidate line. RFC 8839 candidates are a few hundred bytes. */
const MAX_CANDIDATE = 2 * 1024;

/** A version string (`SIM_VERSION` is 16 hex characters, `PROTOCOL_VERSION` is one). */
const MAX_VERSION = 64;

/** One ICE server URL, and the TURN username/credential pair minted for it. */
const MAX_URL = 256;
const MAX_TURN_FIELD = 256;

/** A client-generated ULID, which is 26 characters of Crockford Base32. */
const MAX_ULID = 32;

/** Free text composed for a human screen, never branched on (D-08). */
const MAX_DETAIL = 200;

// ─── The leaf schemas ────────────────────────────────────────────────────────

/**
 * A display name, capped by code point.
 *
 * The `.max()` is a cheap pre-filter on UTF-16 length so that a pasted novel is
 * rejected before the spread allocates an array of it; the refinement is the
 * real rule. Both are needed: the first bounds the work, the second bounds the
 * meaning.
 */
const DisplayName = z
  .string()
  .max(MAX_NAME_CODE_POINTS * 2)
  .refine((value) => [...value].length <= MAX_NAME_CODE_POINTS, {
    message: `nome com mais de ${MAX_NAME_CODE_POINTS} caracteres`,
  });

const AccountId = z.string().max(MAX_ACCOUNT_ID);
const PeerId = z.string().max(MAX_PEER_ID);

/**
 * A room code in its CANONICAL form.
 *
 * `isRoomCode` and not a second copy of the alphabet: the strict check already
 * exists in @dg2/protocol, where the client's forgiving `normalizeRoomCode` sits
 * next to it, and a room map keyed by string cannot afford two spellings of one
 * room. The client normalises before sending; the server accepts only the
 * result.
 */
const RoomCode = z.string().refine(isRoomCode, {
  message: 'código de sala fora do formato canônico',
});

/** `p0`..`p3`, from the frozen table rather than from four literals here. */
const Slot = z.enum(PLAYER_SLOT);

const Versions = z.object({
  sim: z.string().max(MAX_VERSION),
  protocol: z.string().max(MAX_VERSION),
});
export type _VersionsMatches = Expect<Equal<z.infer<typeof Versions>, wire.Versions>>;

const IceServer = z.object({
  urls: z.array(z.string().max(MAX_URL)).readonly(),
  username: z.string().max(MAX_TURN_FIELD).optional(),
  credential: z.string().max(MAX_TURN_FIELD).optional(),
});
export type _IceServerMatches = Expect<Equal<z.infer<typeof IceServer>, wire.IceServer>>;

const IceConfig = z.object({
  iceServers: z.array(IceServer).readonly(),
});
export type _IceConfigMatches = Expect<Equal<z.infer<typeof IceConfig>, wire.IceConfig>>;

const TurnCredential = z.object({
  username: z.string().max(MAX_TURN_FIELD),
  credential: z.string().max(MAX_TURN_FIELD),
  ttl: z.number().int(),
});
export type _TurnCredentialMatches = Expect<
  Equal<z.infer<typeof TurnCredential>, wire.TurnCredential>
>;

const PeerInfo = z.object({
  peerId: PeerId,
  accountId: AccountId,
  name: DisplayName,
  slot: Slot,
});
export type _PeerInfoMatches = Expect<Equal<z.infer<typeof PeerInfo>, wire.PeerInfo>>;

// ─── The twelve messages, in SIGNAL_KIND order ───────────────────────────────
//
// The order is the order of a room's life, and it is the order of the frozen
// table for a reason that is not tidiness: a reader comparing this file against
// packages/protocol/src/enums.ts should be able to do it with one finger on
// each, and a message that went missing should leave a visible gap.

export const Create = z.object({
  kind: z.literal('create'),
  accountId: AccountId,
  name: DisplayName,
  versions: Versions,
});
export type _CreateMatches = Expect<Equal<z.infer<typeof Create>, wire.Create>>;

export const Created = z.object({
  kind: z.literal('created'),
  code: RoomCode,
  peerId: PeerId,
  authorityPeerId: PeerId,
  slot: Slot,
  ice: IceConfig,
  turn: TurnCredential,
});
export type _CreatedMatches = Expect<Equal<z.infer<typeof Created>, wire.Created>>;

export const Join = z.object({
  kind: z.literal('join'),
  code: RoomCode,
  accountId: AccountId,
  name: DisplayName,
  versions: Versions,
});
export type _JoinMatches = Expect<Equal<z.infer<typeof Join>, wire.Join>>;

export const Joined = z.object({
  kind: z.literal('joined'),
  code: RoomCode,
  peerId: PeerId,
  authorityPeerId: PeerId,
  slot: Slot,
  ice: IceConfig,
  turn: TurnCredential,
  peers: z.array(PeerInfo).readonly(),
});
export type _JoinedMatches = Expect<Equal<z.infer<typeof Joined>, wire.Joined>>;

export const Peers = z.object({
  kind: z.literal('peers'),
  peers: z.array(PeerInfo).readonly(),
});
export type _PeersMatches = Expect<Equal<z.infer<typeof Peers>, wire.Peers>>;

/**
 * The three relay verbs.
 *
 * `sdp` and `candidate` are bounded and OTHERWISE UNINSPECTED. A length is not
 * a parse: the server counts the characters and copies them, which is what
 * keeps it out of the WebRTC compatibility business and makes "the server
 * relayed it wrong" a diagnosis that cannot happen.
 */
export const Offer = z.object({
  kind: z.literal('offer'),
  from: PeerId,
  to: PeerId,
  sdp: z.string().max(MAX_SDP),
});
export type _OfferMatches = Expect<Equal<z.infer<typeof Offer>, wire.Offer>>;

export const Answer = z.object({
  kind: z.literal('answer'),
  from: PeerId,
  to: PeerId,
  sdp: z.string().max(MAX_SDP),
});
export type _AnswerMatches = Expect<Equal<z.infer<typeof Answer>, wire.Answer>>;

export const Candidate = z.object({
  kind: z.literal('candidate'),
  from: PeerId,
  to: PeerId,
  candidate: z.string().max(MAX_CANDIDATE),
  sdpMid: z.string().max(MAX_PEER_ID).nullable(),
  sdpMLineIndex: z.number().int().nullable(),
});
export type _CandidateMatches = Expect<Equal<z.infer<typeof Candidate>, wire.Candidate>>;

export const Leave = z.object({
  kind: z.literal('leave'),
  peerId: PeerId,
});
export type _LeaveMatches = Expect<Equal<z.infer<typeof Leave>, wire.Leave>>;

export const Closed = z.object({
  kind: z.literal('closed'),
  code: RoomCode,
  reason: z.enum(REJECT_REASON),
});
export type _ClosedMatches = Expect<Equal<z.infer<typeof Closed>, wire.Closed>>;

export const IceOutcome = z.object({
  kind: z.literal('iceOutcome'),
  id: z.string().max(MAX_ULID),
  code: RoomCode,
  slot: Slot,
  route: z.enum(ICE_ROUTE),
  localCandidate: z.enum(ICE_CANDIDATE_TYPE).nullable(),
  remoteCandidate: z.enum(ICE_CANDIDATE_TYPE).nullable(),
  protocol: z.enum(['udp', 'tcp']).nullable(),
  relayProtocol: z.enum(['udp', 'tcp', 'tls']).nullable(),
  rttMs: z.number().nullable(),
  result: z.enum(['connected', 'failed']),
});
export type _IceOutcomeMatches = Expect<Equal<z.infer<typeof IceOutcome>, wire.IceOutcome>>;

export const SignalError = z.object({
  kind: z.literal('error'),
  reason: z.enum(REJECT_REASON),
  detail: z.string().max(MAX_DETAIL),
});
export type _SignalErrorMatches = Expect<Equal<z.infer<typeof SignalError>, wire.SignalError>>;

/**
 * The whole vocabulary, discriminated by `kind`.
 *
 * `discriminatedUnion` and not `union`: the union form tries every member and
 * reports the failure of all twelve, which for a malformed `offer` produces an
 * error listing eleven irrelevant complaints. The discriminated form reads
 * `kind` first and reports only what is wrong with the message the sender
 * actually meant to send.
 */
const Signal = z.discriminatedUnion('kind', [
  Create,
  Created,
  Join,
  Joined,
  Peers,
  Offer,
  Answer,
  Candidate,
  Leave,
  Closed,
  IceOutcome,
  SignalError,
]);
export type _SignalMatches = Expect<Equal<z.infer<typeof Signal>, wire.SignalMessage>>;

/**
 * What `parseSignal` gives back: a typed message, or the refusal to send.
 *
 * The refusal is a real `SignalError` and not a bare string, so the caller has
 * nothing left to compose and therefore nothing left to get wrong — the routing
 * layer serialises it and moves on.
 */
export type ParsedSignal =
  | { readonly ok: true; readonly message: wire.SignalMessage }
  | { readonly ok: false; readonly error: wire.SignalError };

/**
 * THE ONLY VALIDATION ENTRY POINT IN THE SERVER. Nothing downstream of this
 * function re-checks a field, and nothing upstream of it may read one.
 *
 * It accepts the raw wire text as well as an already-decoded value, and that is
 * deliberate rather than convenient: `JSON.parse` throws on the exact input this
 * module exists to survive, so leaving the call to the caller would put a
 * `try`/`catch` in the socket handler that a later reader would eventually
 * "clean up".
 *
 * ON THE REASON CARRIED BY THE REFUSAL. `REJECT_REASON` is an append-only wire
 * table frozen in phase 3 plan 01, and it has no entry meaning "I could not read
 * that" — its five entries are about versions and about rooms. `badCode` is the
 * nearest true statement ("what you sent is not something I recognise") and it
 * is what travels, while the specific complaint travels in `detail`, which D-08
 * reserves for the screen and forbids branching on. Appending a `badMessage`
 * entry is the correct long-term fix and is recorded as debt: it moves the
 * frozen table and its golden, which belongs to a commit already doing that.
 */
export function parseSignal(raw: unknown): ParsedSignal {
  let value: unknown = raw;

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return refuse('mensagem não é JSON válido');
    }
  }

  const result = Signal.safeParse(value);
  if (!result.success) {
    // The zod issue list is NOT forwarded to the sender. It names internal
    // field paths and echoes back what arrived, which is a description of the
    // server's shape handed to whoever probed it; the caller logs the detail
    // it has and the sender learns only that the message was refused.
    return refuse('mensagem fora do vocabulário do signaling');
  }

  return { ok: true, message: result.data };
}

/** Builds the one refusal shape this module produces. */
function refuse(detail: string): ParsedSignal {
  return { ok: false, error: { kind: 'error', reason: 'badCode', detail } };
}
