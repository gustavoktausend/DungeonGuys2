// lobby.ts — quem está na sala, com que classe, e quando a run começa.
//
// THIS IS THE FIRST SCREEN STATE IN THE GAME DRIVEN BY NETWORK STATE INSTEAD OF
// BY THE `World`, AND THE INVERSION IS THE MOST IMPORTANT LINE IN THIS FILE.
// Everything in src/ui/screens.ts reads the simulation once per frame —
// `syncScreens(w, id)` polls `w.phase` and paints from it — because until now
// the simulation was the only source of truth there was. Here there is no
// simulation at all: it does not exist until `startRun` hands out the run
// manifest, and by then this module's job is over. Anyone arriving here looking
// for the object screens.ts reads will not find one, and will conclude
// something is missing. Nothing is missing. The truth of this screen is the
// last message the authority sent, and this file is where it is kept.
//
// WHAT THIS FILE IS NOT. It paints nothing and touches no DOM: the lobby screen
// is plan 03-09's job and it renders from `state()` through `textContent`,
// never through markup. Two reasons, and the second is the sharp one. The
// player names and classes here arrive from a remote machine over WebRTC, so
// they are exactly the "remotely authored content" that the comment in
// screens.ts already names phase 3 as the reason for; and from phase 6 this
// origin holds a session cookie, with no CSP in front of it. Keeping the
// rendering out of this module is what makes "the lobby cannot build markup" a
// property of the file rather than a habit of whoever edits it.
//
// THE RULES THIS MACHINE ENCODES, each with the decision it comes from:
//
//   D3-01  the authority of the room is the machine that created it, and
//          `lobbyState` travels on the `reliable` channel.
//   D3-02  THE ROOM DIES WITH WHOEVER CREATED IT. When the authority goes, every
//          guest is told. There is no authority migration, not even in the
//          lobby: one path for "who is in charge" and no second one to test.
//   D3-03  REPEATED CLASSES ARE FINE. Two mages get no warning, no mark and no
//          different colour — they are told apart by the clothing colour and by
//          the name, which is what D3-06 puts in this message for.
//   D3-04  WHOEVER CREATED THE ROOM STARTS IT, ALONE IF THEY WANT. No ready
//          state and no safety timer: both were refused, in writing. Solo is a
//          case of multiplayer, which is what lets the whole pipeline be
//          exercised without a second person.
//   D3-08  A GUEST NEVER BRINGS THE ROOM DOWN. A guest that leaves or fails
//          empties its place and touches nothing else.
//   D3-16  the ping and route summary per seat is relayed once a second, because
//          in a star a guest can only measure its own link.
//
// THE RUN STARTS LOCAL AND UNSYNCHRONISED, AND THAT IS BY DESIGN (D3-05,
// D3-18). Once `startRun` goes out, every machine builds the same world from
// the same manifest and then steps it ON ITS OWN: the other characters stand
// still, because nothing streams inputs or snapshots between them yet. That is
// the subject of fase 4, and it is deliberately not started here — writing half
// of it now would be writing it against a wire whose shape phase 4 measures.
// The sentence is in the file because without it the standing characters read
// as a bug, and somebody would "fix" them by inventing the netcode early.
//
// WHAT THIS FILE DOES INSTEAD IS PROVE THE STARTING POINT. Each machine returns
// the tick-0 fingerprint of the world it built, and the two are compared before
// anything else. It costs one string per run and it catches, IN THE LOBBY, the
// failure whose only other symptom is "it desynchronised forty seconds in" —
// which is the symptom nobody can debug.
//
// TIME ARRIVES AS AN ARGUMENT. `schedule` is injected (see transport.ts), so a
// test asserts a SEQUENCE rather than waiting on a clock — the same reasoning
// apps/server/src/shutdown.ts wrote down when it made `startWatchdog` a
// parameter. This module holds no platform timer of its own, and
// tests/lobby.test.ts drives three seconds of relaying in microseconds.
//
// NO REGULAR EXPRESSION LITERALS IN THIS DIRECTORY. tests/scan.ts, which strips
// comments before the FORM-12 audit reads these sources, does not understand a
// regex literal — a `/` opening one that contained `//` would silently swallow
// the rest of the file and the audit would go green over nothing. The validation
// below is written with explicit comparisons, which is also easier to read.
import { CLASS_KEY, GAME_MODE, ICE_ROUTE, MSG_KIND, PLAYER_SLOT, REJECT_REASON } from '@dg2/protocol';
import type { IceRoute, RejectReason } from '@dg2/protocol';
// Aliased because this file already has three other things called "start": the
// `startRun` MESSAGE KIND, `startRoom`, and `onStart`. The import is the one
// that builds a world.
import { createPlayer, createWorld, hashWorld, startRun as startSimRun } from '@dg2/sim';
import type { ClassKey, ForgeLevels, GameMode, PlayerSlot, RunConfig, RunPlayer } from '@dg2/sim';
import { createPinger, type Pinger } from './ping';
import type { PeerId, Schedule, Transport, Unsubscribe } from './transport';

// The wire NUMBER comes from @dg2/protocol and the TYPE comes from @dg2/sim.
// That split is the rule enums.ts states at length on CLASS_KEY, and this file
// is the first consumer of both halves at once: `PLAYER_SLOT` is the frozen
// table whose index is the seat, `PlayerSlot` is the union the simulation
// already declares. Re-deriving either from the other would put a second
// spelling of the same thing on the public surface.

/** Seats in a room. Four, because the width of a room is a decision. */
export const MAX_OCCUPANTS = 4;

/** How often the authority relays the roster and the ping summary (D3-16). */
export const LOBBY_EMIT_MS = 1000;

/**
 * The longest name that may be shown, in CODE POINTS and not in UTF-16 units.
 *
 * `'x'.length` counts units, so a name of 24 emoji measures 48 and would be
 * refused although it is perfectly legitimate. Counting code points is what
 * makes the limit mean "24 characters as a person sees them".
 */
export const MAX_NAME_CODE_POINTS = 24;

/**
 * A sanity ceiling on a forge level arriving from a peer, NOT the forge's own
 * rule — those caps live in the client that spends the gold. It exists so that
 * a level of 1e9 cannot reach the stat maths as a number nobody bounded.
 */
export const MAX_FORGE_LEVEL = 99;

/**
 * The longest fingerprint this module will accept off the wire.
 *
 * `hashWorld` returns FNV-1a as unpadded hex, so eight characters at most; the
 * cap is generous and exists for one reason — the value is put on a screen, and
 * a peer that sent a megabyte of text would otherwise be putting a megabyte of
 * text on it (T-3-14/T-3-34).
 */
export const MAX_HASH_CHARS = 16;

/** The clothing colour, as it travels: three bytes of presentation (D3-06). */
export type Rgb = readonly [number, number, number];

/**
 * The tick-0 fingerprint of a run manifest — THE canonical start-of-run
 * sequence, written once and never twice.
 *
 * `createWorld`, one `createPlayer` per seat IN THE MANIFEST'S ORDER, then
 * `startRun` (which is what generates the arena, sim/run.ts). It is the same
 * sequence main.ts's `beginRun` runs and the same one a replay is rebuilt from
 * (D-11), and that identity is the whole value of the number: a second way of
 * building the initial world would be a second way for two machines to disagree
 * about a world neither of them got wrong.
 *
 * THE STATIC LAYER NEVER TRAVELS (D3-17). `startRun` carries the manifest and
 * nothing else — no arena, no derived config — because every machine can build
 * the rest from the seed, and shipping it would be shipping a second source of
 * truth for something that is already deterministic. This function is the proof
 * that the rest really is derivable: if it were not, the fingerprints would
 * differ and the room would say so on the spot, in the lobby, instead of the
 * run drifting apart forty seconds in.
 *
 * The world built here is DISCARDED. It costs one arena generation per run
 * start, which is microseconds, and it buys a fingerprint that depends on
 * nothing this module could have got subtly right by accident.
 */
export function tickZeroHash(config: RunConfig): string {
  const world = createWorld(config);
  for (const seat of config.players) createPlayer(world, seat.id, seat.cls, seat.name);
  startSimRun(world);
  return hashWorld(world);
}

/** One occupant, as a screen would draw them. */
export interface OccupantView {
  peerId: PeerId;
  accountId: string;
  name: string;
  cls: ClassKey;
  color: Rgb;
  /** Null until the room closes; assigned in order of entry and then frozen. */
  slot: PlayerSlot | null;
  connected: boolean;
  /** Median round trip in ms, or null while unmeasured or unanswered (D3-13). */
  ping: number | null;
  route: IceRoute;
}

export interface LobbyView {
  authorityPeerId: PeerId;
  selfPeerId: PeerId;
  isAuthority: boolean;
  /** True once `startRoom` has handed out the seats. */
  closed: boolean;
  occupants: readonly OccupantView[];
}

export interface LobbySelf {
  peerId: PeerId;
  /** Self-declared in this phase (D3-09); phase 6 replaces it with a session. */
  accountId: string;
  name: string;
  cls: ClassKey;
  forge: ForgeLevels;
}

export interface LobbyDeps {
  transport: Transport;
  self: LobbySelf;
  isAuthority: boolean;
  /**
   * The authority named EXPLICITLY by `created`/`joined`, never derived from a
   * seat. "Whoever is in p0" is a topology rule written where nobody looks, and
   * it is the exact spoof T-3-07b is about.
   */
  authorityPeerId: PeerId;
  /** `Save.data.settings.colors[cls]`, injected so this module reads no store. */
  colorFor: (cls: ClassKey) => Rgb;
  /** Handed to the pingers this module owns; see ping.ts. */
  now: () => number;
  schedule: Schedule;
}

export interface StartOptions {
  seed: number;
  mode: GameMode;
}

export interface Lobby {
  state(): LobbyView;
  onState(cb: (view: LobbyView) => void): Unsubscribe;
  /** The authority went. There is no migration (D3-02). */
  onRoomDead(cb: () => void): Unsubscribe;
  onRejected(cb: (reason: RejectReason) => void): Unsubscribe;
  /**
   * The run begins, with the manifest AND the seat this machine was given.
   *
   * The seat travels alongside because the manifest cannot say it: `RunConfig`
   * names `p0..p3` and nothing in it says which one is us — `peerId` never
   * enters the simulation (ADR 0001). The lobby is the one place that knows
   * both, so it is the one place the translation happens.
   */
  onStart(cb: (config: RunConfig, slot: PlayerSlot) => void): Unsubscribe;
  /**
   * The two tick-0 fingerprints disagreed: this machine's, then the other's.
   *
   * Fires on WHICHEVER SIDE NOTICES, and both do — the authority sends its own
   * fingerprint alongside `startRun` and every peer sends its answer back, so
   * each end compares a pair. A divergence seen only by the authority would
   * leave the other player in a run nobody told them was wrong.
   */
  onDesync(cb: (ours: string, theirs: string) => void): Unsubscribe;
  chooseClass(cls: ClassKey): void;
  /**
   * The measured route of one leg, from whoever holds the connection.
   *
   * PUSHED IN RATHER THAN READ OUT, because the route comes from
   * `RTCPeerConnection.getStats()` — asynchronous, and belonging to a transport
   * this module deliberately does not know the type of. `Transport` has no
   * `getStats`, and widening it so the lobby could ask would put WebRTC in the
   * interface that `local.ts` and `lossy.ts` also satisfy.
   *
   * Only the authority's copy matters: in a star a guest can measure its own
   * leg but has nowhere to put it, and the relayed `lobbyState` is what carries
   * every seat's route to every screen (D3-16).
   */
  setRoute(peer: PeerId, route: IceRoute): void;
  /** Closes the room and hands out the seats. Authority only (D3-04). */
  startRoom(options: StartOptions): RunConfig;
  /** Drops every subscription and deadline. Does not close the transport. */
  close(): void;
}

const KIND_HELLO = MSG_KIND.indexOf('hello');
const KIND_REJECT = MSG_KIND.indexOf('reject');
const KIND_LOBBY_STATE = MSG_KIND.indexOf('lobbyState');
const KIND_START_RUN = MSG_KIND.indexOf('startRun');
/**
 * `ack` carries the tick-0 fingerprint, IN BOTH DIRECTIONS.
 *
 * The table's own header describes `ack` as what "closes the loop" of a run's
 * messages, and this is the first loop there is to close: the authority hands
 * out a manifest and every machine answers with what that manifest built. One
 * kind and one meaning in both directions, rather than a second name for the
 * same sentence said the other way round — the authority sends its own
 * fingerprint too, so each end holds a pair and each end can be the one that
 * notices.
 */
const KIND_ACK = MSG_KIND.indexOf('ack');

/**
 * The forge keys, pinned to the type by `satisfies`.
 *
 * Adding a level to `ForgeLevels` in the simulation turns this line red instead
 * of letting a new level travel unvalidated — which is the only way a list of
 * field names in a validator stays honest.
 */
const FORGE_KEYS = Object.keys({
  vigor: true, honed: true, fleet: true, startgold: true,
  merchant: true, wise: true, golden: true,
} satisfies Record<keyof ForgeLevels, true>) as (keyof ForgeLevels)[];

interface Occupant extends OccupantView {
  forge: ForgeLevels;
}

// ─── The wire: one byte of kind, then UTF-8 JSON ─────────────────────────────
//
// Byte 0 is the index into the frozen `MSG_KIND` table, exactly as the binary
// messages of phase 4 will spell it, so a receiver dispatches on one byte
// without parsing anything. What follows is JSON because these messages are
// COLD — a handful per room, none per tick — and legibility in DevTools is
// worth more here than bytes. The per-tick traffic gets the packed codec.

function encode(kind: number, body: unknown): ArrayBuffer {
  const json = new TextEncoder().encode(JSON.stringify(body));
  const out = new Uint8Array(1 + json.length);
  out[0] = kind;
  out.set(json, 1);
  return out.buffer;
}

/** Byte 0, or -1 for an empty frame. Never parses the rest. */
function kindOf(payload: ArrayBuffer): number {
  const bytes = new Uint8Array(payload);
  return bytes.length === 0 ? -1 : bytes[0];
}

/**
 * The JSON after byte 0, wrapped so that "parsed to null" and "did not parse"
 * are different answers.
 *
 * Read only AFTER the kind has been recognised. The `ping` and `pong` frames of
 * ping.ts share this transport and are seven binary bytes; running them through
 * JSON.parse would throw once per second per peer, and a caught throw in a hot
 * path is still work plus a stack.
 */
function parseBody(payload: ArrayBuffer): { body: unknown } | null {
  const bytes = new Uint8Array(payload);
  if (bytes.length <= 1) return { body: null };
  try {
    return { body: JSON.parse(new TextDecoder().decode(bytes.subarray(1))) };
  } catch {
    // Malformed JSON from a peer is a message that never happened, not a
    // throw: this runs inside a transport callback, where an exception would
    // take out every listener that had not run yet.
    return null;
  }
}

// ─── The narrow guard ────────────────────────────────────────────────────────
//
// WHY THIS IS THIRTY LINES OF COMPARISONS AND NOT A CAST (T-3-07, T-3-14).
// `lobbyState` is JSON authored by a machine this one does not control, and
// every field of it ends up as text on a screen served from an origin that will
// be holding a session cookie from phase 6 on, with no CSP in front of it. A
// cast would compile and assert nothing.
//
// Two properties matter as much as the checks themselves:
//
//   IT IS ALL-OR-NOTHING. A single bad occupant discards the WHOLE message and
//   the previous state stands. A validator that applied as it went would let an
//   attacker put one crafted entry on the screen by attaching it to a valid
//   one — which is the shape this kind of payload actually takes.
//
//   IT REBUILDS, NEVER PASSES THROUGH. Every value below is copied into a fresh
//   object field by field, so nothing that JSON.parse produced is retained: no
//   extra keys ride along, and an own `__proto__` or `constructor` key in the
//   input reaches nothing that reads them.

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isName(v: unknown): v is string {
  return typeof v === 'string' && [...v].length <= MAX_NAME_CODE_POINTS;
}

function isClassKey(v: unknown): v is ClassKey {
  return typeof v === 'string' && (CLASS_KEY as readonly string[]).includes(v);
}

function isSlot(v: unknown): v is PlayerSlot {
  return typeof v === 'string' && (PLAYER_SLOT as readonly string[]).includes(v);
}

function isRoute(v: unknown): v is IceRoute {
  return typeof v === 'string' && (ICE_ROUTE as readonly string[]).includes(v);
}

function isByte(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 255;
}

function isRgb(v: unknown): v is Rgb {
  return Array.isArray(v) && v.length === 3 && v.every(isByte);
}

function isPingValue(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isFinite(v));
}

function isForge(v: unknown): v is ForgeLevels {
  if (!isRecord(v)) return false;
  for (const key of FORGE_KEYS) {
    const level = v[key];
    if (typeof level !== 'number' || !Number.isInteger(level)) return false;
    if (level < 0 || level > MAX_FORGE_LEVEL) return false;
  }
  return true;
}

function copyForge(f: ForgeLevels): ForgeLevels {
  return {
    vigor: f.vigor, honed: f.honed, fleet: f.fleet, startgold: f.startgold,
    merchant: f.merchant, wise: f.wise, golden: f.golden,
  };
}

function readOccupant(raw: unknown): OccupantView | null {
  if (!isRecord(raw)) return null;
  const { peerId, accountId, name, cls, color, slot, connected, ping, route } = raw;
  if (typeof peerId !== 'string' || peerId.length === 0) return null;
  if (typeof accountId !== 'string') return null;
  if (!isName(name)) return null;
  if (!isClassKey(cls)) return null;
  if (!isRgb(color)) return null;
  if (slot !== null && !isSlot(slot)) return null;
  if (typeof connected !== 'boolean') return null;
  if (!isPingValue(ping)) return null;
  if (!isRoute(route)) return null;
  return {
    peerId, accountId, name, cls,
    color: [color[0], color[1], color[2]],
    slot, connected, ping, route,
  };
}

function readLobbyState(
  from: PeerId,
  authorityPeerId: PeerId,
  body: unknown,
): { closed: boolean; occupants: OccupantView[] } | null {
  // The sender must be the peer named as the authority when this machine
  // entered the room — never the peer sitting in p0 (T-3-07b).
  if (from !== authorityPeerId) return null;
  if (!isRecord(body)) return null;
  if (body.authorityPeerId !== from) return null;
  if (typeof body.closed !== 'boolean') return null;
  const list = body.occupants;
  if (!Array.isArray(list) || list.length > MAX_OCCUPANTS) return null;
  const occupants: OccupantView[] = [];
  for (const entry of list) {
    const parsed = readOccupant(entry);
    if (!parsed) return null;
    occupants.push(parsed);
  }
  return { closed: body.closed, occupants };
}

interface Announce {
  accountId: string;
  name: string;
  cls: ClassKey;
  color: Rgb;
  forge: ForgeLevels;
}

function readAnnounce(body: unknown): Announce | null {
  if (!isRecord(body)) return null;
  const { accountId, name, cls, color, forge } = body;
  if (typeof accountId !== 'string') return null;
  if (!isName(name) || !isClassKey(cls) || !isRgb(color) || !isForge(forge)) return null;
  return {
    accountId, name, cls,
    color: [color[0], color[1], color[2]],
    forge: copyForge(forge),
  };
}

/**
 * The run manifest, validated with the same suspicion as everything else.
 *
 * A cheating authority is out of scope by design (T-3-12) — nothing durable
 * passes through it in this phase. A MALFORMED one is not: this object is fed
 * straight to the simulation's builder, and `{}` arriving here would be a crash
 * inside a transport callback rather than a message that never happened.
 */
function readRunConfig(body: unknown): RunConfig | null {
  if (!isRecord(body)) return null;
  const { seed, mode, players } = body;
  if (typeof seed !== 'number' || !Number.isInteger(seed)) return null;
  if (typeof mode !== 'string' || !(GAME_MODE as readonly string[]).includes(mode)) return null;
  if (!Array.isArray(players) || players.length < 1 || players.length > MAX_OCCUPANTS) return null;
  const out: RunPlayer[] = [];
  for (const entry of players) {
    if (!isRecord(entry)) return null;
    const { id, name, cls, forge } = entry;
    if (!isSlot(id) || !isName(name) || !isClassKey(cls) || !isForge(forge)) return null;
    out.push({ id, name, cls, forge: copyForge(forge) });
  }
  return { seed, mode: mode as GameMode, players: out };
}

function isRejectReason(v: unknown): v is RejectReason {
  return typeof v === 'string' && (REJECT_REASON as readonly string[]).includes(v);
}

/**
 * The fingerprint out of an `ack`, or null.
 *
 * Bounded and rebuilt like everything else here: it is a string authored by
 * another machine that lands on a screen, so its LENGTH is as much a part of
 * the contract as its type. Nothing is branched on beyond "equal or not".
 */
function readHash(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const { hash } = body;
  if (typeof hash !== 'string') return null;
  if (hash.length === 0 || hash.length > MAX_HASH_CHARS) return null;
  return hash;
}

// ─── The machine ─────────────────────────────────────────────────────────────

export function createLobby(deps: LobbyDeps): Lobby {
  const { transport, self, isAuthority, authorityPeerId, colorFor, now, schedule } = deps;

  /** The authority's roster, IN ORDER OF ENTRY. That order becomes p0..p3. */
  const occupants: Occupant[] = [];
  /** A guest's copy of the last accepted roster. */
  let remote: OccupantView[] = [];
  let remoteClosed = false;
  let closed = false;
  let dead = false;
  let disposed = false;
  let started: RunConfig | null = null;
  let myCls: ClassKey = self.cls;
  /**
   * The class this machine picked but has not seen echoed yet.
   *
   * The optimistic echo is what makes the class cards paint on the click
   * instead of after a round trip; the next `lobbyState` is the truth and
   * overwrites it. Cleared as soon as the authority agrees.
   */
  let echo: ClassKey | null = null;

  /**
   * This machine's own tick-0 fingerprint, once a run has started.
   *
   * Null before that, and that is a meaningful state: an `ack` arriving before
   * this machine has built anything has nothing to be compared against, and
   * comparing it to a placeholder would manufacture a divergence out of a
   * message that merely arrived early.
   */
  let ourHash: string | null = null;

  const stateCbs = new Set<(view: LobbyView) => void>();
  const deadCbs = new Set<() => void>();
  const rejectCbs = new Set<(reason: RejectReason) => void>();
  const startCbs = new Set<(config: RunConfig, slot: PlayerSlot) => void>();
  const desyncCbs = new Set<(ours: string, theirs: string) => void>();
  const subs: Unsubscribe[] = [];
  let cancelTick: Unsubscribe | null = null;
  /**
   * Peers already told why they cannot come in.
   *
   * A refusal is idempotent for the same reason createShutdown's sequence is:
   * a guest announces itself twice on purpose (see the constructor below), and
   * a full room would otherwise answer the same peer twice on a reliable
   * channel — two identical refusals on one screen, and a second one arriving
   * after the player already went back to the room screen. Cleared when the
   * peer's connection goes, so a genuine retry after a seat frees up is heard.
   */
  const refused = new Set<PeerId>();

  /**
   * One pinger per link this machine has (D3-13, D3-16).
   *
   * THE AUTHORITY KEEPS ONE PER GUEST AND RELAYS THE SUMMARY, because in a star
   * a guest can only measure its own leg — without the relay nobody can see
   * WHICH player is lagging, only that someone is. The guest keeps one toward
   * the authority for two reasons: something has to answer the authority's
   * pings, and the guest needs its own number for the in-run indicator (D3-15).
   *
   * On the authority a pinger is created when a peer is ADMITTED, not when its
   * connection opens: a peer that is about to be refused should not get a
   * measurement loop, and one that never announces itself is not in the room.
   */
  const pingers = new Map<PeerId, Pinger>();

  function startPinger(peer: PeerId): void {
    if (pingers.has(peer)) return;
    pingers.set(peer, createPinger({ transport, peer, now, schedule }));
  }

  function stopPinger(peer: PeerId): void {
    const pinger = pingers.get(peer);
    if (!pinger) return;
    pinger.close();
    pingers.delete(peer);
  }

  const toView = (o: Occupant): OccupantView => ({
    peerId: o.peerId, accountId: o.accountId, name: o.name, cls: o.cls,
    color: o.color, slot: o.slot, connected: o.connected, ping: o.ping, route: o.route,
  });

  function buildView(): LobbyView {
    const list = isAuthority
      ? occupants.map(toView)
      : remote.map((o) => (echo !== null && o.peerId === self.peerId
        ? { ...o, cls: echo, color: colorFor(echo) }
        : o));
    return {
      authorityPeerId,
      selfPeerId: self.peerId,
      isAuthority,
      closed: isAuthority ? closed : remoteClosed,
      occupants: list,
    };
  }

  /**
   * This machine's seat, or null while the room is still open.
   *
   * Read from the roster and never from the manifest's array position: the two
   * agree today, and the day they stop agreeing the roster is the one that
   * carries `peerId` — which is the only field that says which row is us.
   */
  function mySlot(): PlayerSlot | null {
    const list = isAuthority ? occupants : remote;
    return list.find((o) => o.peerId === self.peerId)?.slot ?? null;
  }

  function notify(): void {
    const view = buildView();
    // A snapshot of the set: a subscriber that unsubscribes itself while this
    // runs must not make the next one be skipped.
    for (const cb of [...stateCbs]) cb(view);
  }

  /**
   * Copies the measurements into the roster right before it is relayed (D3-16).
   *
   * The authority's own row carries no ping, and null rather than zero: a
   * machine has no round trip to itself, and a zero there would read on screen
   * as the best connection in the room instead of as the absence of one.
   *
   * `route` is NOT touched here. It is not a measurement this module can take —
   * it comes off the connection's statistics, which belong to the transport
   * (net/ice.ts, D3-13) — so it is written by `setRoute` and merely carried
   * along by the row. A seat nobody has reported on keeps `'unknown'`, the
   * value the frozen table puts at index 0 precisely so that an absent
   * measurement can never decode as `direct` and bias the one number the
   * telemetry exists to produce in the reassuring direction.
   */
  function refreshPings(): void {
    for (const o of occupants) {
      if (o.peerId === self.peerId) { o.ping = null; continue; }
      const pinger = pingers.get(o.peerId);
      o.ping = pinger ? pinger.rtt() : null;
    }
  }

  /**
   * Compares a fingerprint that arrived against this machine's own.
   *
   * Silence on agreement is the whole design: the common case must cost one
   * string comparison and produce nothing, and the screen only exists for the
   * case that should never happen.
   */
  function compareHash(theirs: string): void {
    if (ourHash === null || ourHash === theirs) return;
    for (const cb of [...desyncCbs]) cb(ourHash, theirs);
  }

  /** Builds this machine's world from the manifest and answers with its hash. */
  function proveTickZero(config: RunConfig, to: PeerId[]): void {
    ourHash = tickZeroHash(config);
    const proof = encode(KIND_ACK, { hash: ourHash });
    for (const peer of to) transport.send(peer, proof, 'reliable');
  }

  /** The authority's one write of the truth: relay it, then tell the screen. */
  function publish(): void {
    if (disposed) return;
    refreshPings();
    const frame = encode(KIND_LOBBY_STATE, {
      authorityPeerId, closed, occupants: occupants.map(toView),
    });
    for (const o of occupants) {
      if (o.peerId === self.peerId || !o.connected) continue;
      // One send per leg. There is no fan-out on Transport, and this loop is
      // where FORM-12 says the fan-out belongs (see transport.ts).
      transport.send(o.peerId, frame, 'reliable');
    }
    notify();
  }

  function arm(): void {
    cancelTick = schedule(() => {
      cancelTick = null;
      if (disposed) return;
      publish();
      arm();
    }, LOBBY_EMIT_MS);
  }

  /** A guest telling the authority who it is. Idempotent by `peerId`. */
  function announce(): void {
    transport.send(authorityPeerId, encode(KIND_HELLO, {
      accountId: self.accountId, name: self.name, cls: myCls,
      color: colorFor(myCls), forge: copyForge(self.forge),
    }), 'reliable');
  }

  function refuse(to: PeerId, reason: RejectReason): void {
    if (refused.has(to)) return;
    refused.add(to);
    transport.send(to, encode(KIND_REJECT, { reason }), 'reliable');
  }

  function onAnnounce(from: PeerId, body: unknown): void {
    const hello = readAnnounce(body);
    if (!hello) return;
    const known = occupants.find((o) => o.peerId === from);
    if (known) {
      // A re-announce is how a class change travels: one message, one meaning,
      // and no second kind to keep in step with the first.
      known.accountId = hello.accountId;
      known.name = hello.name;
      known.cls = hello.cls;
      known.color = hello.color;
      known.forge = hello.forge;
      known.connected = true;
      publish();
      return;
    }
    if (closed) { refuse(from, 'roomClosed'); return; }
    if (occupants.length >= MAX_OCCUPANTS) { refuse(from, 'roomFull'); return; }
    occupants.push({
      peerId: from, accountId: hello.accountId, name: hello.name, cls: hello.cls,
      color: hello.color, forge: hello.forge,
      slot: null, connected: true, ping: null, route: 'unknown',
    });
    startPinger(from);
    publish();
  }

  function onLobbyState(from: PeerId, body: unknown): void {
    const next = readLobbyState(from, authorityPeerId, body);
    if (!next) return;
    remoteClosed = next.closed;
    remote = next.occupants;
    const mine = next.occupants.find((o) => o.peerId === self.peerId);
    if (echo !== null && mine && mine.cls === echo) echo = null;
    notify();
  }

  subs.push(transport.onMessage((from, payload) => {
    if (disposed || dead) return;
    // Dispatch on the kind byte FIRST. `ping` and `pong` share this transport
    // and belong to the pingers, which subscribe on their own; they must not
    // reach the parser below.
    const kind = kindOf(payload);
    if (isAuthority) {
      // An authority accepts exactly two kinds from a peer in this phase: who
      // you are, and what the manifest built on your machine.
      if (kind !== KIND_HELLO && kind !== KIND_ACK) return;
      const parsed = parseBody(payload);
      if (!parsed) return;
      if (kind === KIND_HELLO) { onAnnounce(from, parsed.body); return; }
      // Only from a peer that is actually in the room: a fingerprint from a
      // stranger is a divergence screen raised by someone with no part in the
      // run (the same reasoning as T-3-07b, one message further along).
      if (!occupants.some((o) => o.peerId === from)) return;
      const theirs = readHash(parsed.body);
      if (theirs !== null) compareHash(theirs);
      return;
    }
    if (from !== authorityPeerId) return;
    if (kind !== KIND_LOBBY_STATE && kind !== KIND_REJECT
      && kind !== KIND_START_RUN && kind !== KIND_ACK) return;
    const parsed = parseBody(payload);
    if (!parsed) return;
    if (kind === KIND_LOBBY_STATE) { onLobbyState(from, parsed.body); return; }
    if (kind === KIND_REJECT) {
      const reason = isRecord(parsed.body) ? parsed.body.reason : null;
      if (isRejectReason(reason)) for (const cb of [...rejectCbs]) cb(reason);
      return;
    }
    if (kind === KIND_ACK) {
      const theirs = readHash(parsed.body);
      if (theirs !== null) compareHash(theirs);
      return;
    }
    const config = readRunConfig(parsed.body);
    if (!config) return;
    const slot = mySlot();
    // A manifest with no seat for this machine is not startable, and it is not
    // a malformed message either — it is a `startRun` that arrived before the
    // roster that hands out the seats. The reliable channel is ORDERED and
    // `startRoom` publishes the closed roster BEFORE sending this frame, so it
    // cannot happen; refusing rather than guessing is what keeps that ordering
    // a fact instead of an assumption nobody would notice breaking.
    if (slot === null) return;
    started = config;
    // Build, fingerprint, answer — BEFORE the run is handed to the caller, so
    // that the proof is on the wire even if starting the run throws.
    proveTickZero(config, [authorityPeerId]);
    for (const cb of [...startCbs]) cb(config, slot);
  }));

  subs.push(transport.onPeerLeave((peer) => {
    if (disposed) return;
    if (!isAuthority) {
      // D3-02: the room dies with whoever created it, and only with them. A
      // guest in a star never sees another guest go, because it is not linked
      // to one — so anything else arriving here is not a reason to end.
      if (dead || peer !== authorityPeerId) return;
      dead = true;
      for (const cb of [...deadCbs]) cb();
      return;
    }
    refused.delete(peer);
    stopPinger(peer);
    const i = occupants.findIndex((o) => o.peerId === peer);
    if (i < 0) return;
    if (closed) {
      // After the room closes a seat is FROZEN (ADR 0001): a player who drops
      // comes back to the same one, and a run that renumbered mid-flight would
      // renumber the input log with it.
      occupants[i].connected = false;
    } else {
      occupants.splice(i, 1);
    }
    // D3-08: that is the entire consequence. Nothing else in the room moves.
    publish();
  }));

  subs.push(transport.onPeerJoin((peer) => {
    if (disposed || isAuthority || peer !== authorityPeerId) return;
    announce();
  }));

  if (isAuthority) {
    occupants.push({
      peerId: self.peerId, accountId: self.accountId, name: self.name, cls: myCls,
      color: colorFor(myCls), forge: copyForge(self.forge),
      slot: null, connected: true, ping: null, route: 'unknown',
    });
    arm();
  } else {
    // Announced here AND again on the join event, on purpose. If the link is
    // already up this costs one extra sixty-byte message on a cold reliable
    // channel and the authority treats it as the idempotent update it is; if
    // the link is not up yet this send is dropped and the join event is the one
    // that lands. The alternative — picking one — is a guest that sometimes
    // never appears in the room, which costs incomparably more.
    announce();
    startPinger(authorityPeerId);
  }

  return {
    state: buildView,
    onState(cb) { stateCbs.add(cb); return () => { stateCbs.delete(cb); }; },
    onRoomDead(cb) { deadCbs.add(cb); return () => { deadCbs.delete(cb); }; },
    onRejected(cb) { rejectCbs.add(cb); return () => { rejectCbs.delete(cb); }; },
    onStart(cb) { startCbs.add(cb); return () => { startCbs.delete(cb); }; },
    onDesync(cb) { desyncCbs.add(cb); return () => { desyncCbs.delete(cb); }; },

    setRoute(peer, route) {
      if (disposed || !isAuthority) return;
      // Validated like anything else that ends up on a screen, even though this
      // one comes from the same process: `IceRoute` is a frozen table and a
      // value outside it would print as itself.
      if (!isRoute(route)) return;
      const o = occupants.find((x) => x.peerId === peer);
      if (!o || o.route === route) return;
      o.route = route;
      // No `publish()` here. The route rides the next second's roster (D3-16)
      // instead of costing a fan-out of its own: it changes at most once per
      // connection, and a message per report would put N sends on the wire for
      // a value that did not move.
    },

    chooseClass(cls) {
      // D3-03: no exclusivity check. Two people may pick the same class, and
      // nothing here marks either of them for it.
      if (disposed || !isClassKey(cls)) return;
      myCls = cls;
      if (isAuthority) {
        const mine = occupants.find((o) => o.peerId === self.peerId);
        if (mine) { mine.cls = cls; mine.color = colorFor(cls); }
        publish();
        return;
      }
      echo = cls;
      announce();
      notify();
    },

    startRoom({ seed, mode }) {
      if (!isAuthority) throw new Error('só quem criou a sala pode iniciar (D3-04)');
      // Idempotent, and not merely tidy: a second call that reassigned seats
      // would renumber players a run had already started with.
      if (started) return started;
      closed = true;
      const players: RunPlayer[] = [];
      for (let i = 0; i < occupants.length; i++) {
        const o = occupants[i];
        // Order of entry becomes p0..p3, once, at the moment the room closes —
        // the single `accountId -> seat` translation ADR 0001 puts here. The
        // ARRAY ORDER is the canonical order the simulation iterates.
        o.slot = PLAYER_SLOT[i];
        players.push({ id: o.slot, name: o.name, cls: o.cls, forge: copyForge(o.forge) });
      }
      started = { seed, mode, players };
      // The closed roster goes out FIRST and the manifest second, on the same
      // ordered reliable channel: the roster is where a guest reads its own
      // seat, and a manifest that overtook it would arrive at a machine that
      // does not yet know where it sits.
      publish();
      const frame = encode(KIND_START_RUN, started);
      const guests: PeerId[] = [];
      for (const o of occupants) {
        if (o.peerId === self.peerId || !o.connected) continue;
        guests.push(o.peerId);
        transport.send(o.peerId, frame, 'reliable');
      }
      // The authority proves its own tick 0 by the SAME path every guest takes,
      // and sends its fingerprint along so each of them can be the one that
      // notices. A room where only the authority compared would leave a
      // divergent player in a run nobody told them was wrong.
      proveTickZero(started, guests);
      // The authority takes the SAME path as every guest, from here on: it
      // starts from the manifest it just published, at the seat the roster gave
      // it. A short cut here — starting from the local selection instead —
      // would be a second way of beginning a run, and the tick-0 hash would be
      // comparing two things that were never built the same way (D-11).
      const slot = mySlot();
      if (slot !== null) for (const cb of [...startCbs]) cb(started, slot);
      return started;
    },

    close() {
      if (disposed) return;
      disposed = true;
      if (cancelTick) { cancelTick(); cancelTick = null; }
      for (const pinger of pingers.values()) pinger.close();
      pingers.clear();
      for (const un of subs) un();
      subs.length = 0;
      stateCbs.clear();
      deadCbs.clear();
      rejectCbs.clear();
      startCbs.clear();
      desyncCbs.clear();
      // The transport is NOT closed here: this module did not open it, and the
      // same connection carries the run once the lobby is done with it.
    },
  };
}
