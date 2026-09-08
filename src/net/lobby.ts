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
import type { ClassKey, ForgeLevels, GameMode, PlayerSlot, RunConfig, RunPlayer } from '@dg2/sim';
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

/** The clothing colour, as it travels: three bytes of presentation (D3-06). */
export type Rgb = readonly [number, number, number];

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
  /** Present for the pingers this module owns; see ping.ts. */
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
  onStart(cb: (config: RunConfig) => void): Unsubscribe;
  chooseClass(cls: ClassKey): void;
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

function decode(payload: ArrayBuffer): { kind: number; body: unknown } | null {
  const bytes = new Uint8Array(payload);
  if (bytes.length < 1) return null;
  if (bytes.length === 1) return { kind: bytes[0], body: null };
  try {
    return { kind: bytes[0], body: JSON.parse(new TextDecoder().decode(bytes.subarray(1))) };
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

// ─── The machine ─────────────────────────────────────────────────────────────

export function createLobby(deps: LobbyDeps): Lobby {
  const { transport, self, isAuthority, authorityPeerId, colorFor, schedule } = deps;

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

  const stateCbs = new Set<(view: LobbyView) => void>();
  const deadCbs = new Set<() => void>();
  const rejectCbs = new Set<(reason: RejectReason) => void>();
  const startCbs = new Set<(config: RunConfig) => void>();
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

  function notify(): void {
    const view = buildView();
    // A snapshot of the set: a subscriber that unsubscribes itself while this
    // runs must not make the next one be skipped.
    for (const cb of [...stateCbs]) cb(view);
  }

  /** The authority's one write of the truth: relay it, then tell the screen. */
  function publish(): void {
    if (disposed) return;
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
    const msg = decode(payload);
    if (!msg) return;
    if (isAuthority) {
      // An authority accepts exactly one kind from a peer in this phase.
      // `ping` and `pong` belong to the pinger, which subscribes separately.
      if (msg.kind === KIND_HELLO) onAnnounce(from, msg.body);
      return;
    }
    if (from !== authorityPeerId) return;
    if (msg.kind === KIND_LOBBY_STATE) { onLobbyState(from, msg.body); return; }
    if (msg.kind === KIND_REJECT) {
      const reason = isRecord(msg.body) ? msg.body.reason : null;
      if (isRejectReason(reason)) for (const cb of [...rejectCbs]) cb(reason);
      return;
    }
    if (msg.kind === KIND_START_RUN) {
      const config = readRunConfig(msg.body);
      if (!config) return;
      started = config;
      for (const cb of [...startCbs]) cb(config);
    }
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
  }

  return {
    state: buildView,
    onState(cb) { stateCbs.add(cb); return () => { stateCbs.delete(cb); }; },
    onRoomDead(cb) { deadCbs.add(cb); return () => { deadCbs.delete(cb); }; },
    onRejected(cb) { rejectCbs.add(cb); return () => { rejectCbs.delete(cb); }; },
    onStart(cb) { startCbs.add(cb); return () => { startCbs.delete(cb); }; },

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
      publish();
      const frame = encode(KIND_START_RUN, started);
      for (const o of occupants) {
        if (o.peerId === self.peerId || !o.connected) continue;
        transport.send(o.peerId, frame, 'reliable');
      }
      for (const cb of [...startCbs]) cb(started);
      return started;
    },

    close() {
      if (disposed) return;
      disposed = true;
      if (cancelTick) { cancelTick(); cancelTick = null; }
      for (const un of subs) un();
      subs.length = 0;
      stateCbs.clear();
      deadCbs.clear();
      rejectCbs.clear();
      startCbs.clear();
      // The transport is NOT closed here: this module did not open it, and the
      // same connection carries the run once the lobby is done with it.
    },
  };
}
