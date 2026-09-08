// rooms.ts — the live rooms, as a Map in memory.
//
// A ROOM IS EPHEMERAL STATE AND NEVER ENTERS THE DATABASE (C-12, D3-02). It is
// born when someone asks for a code, it dies when the authority leaves or when
// nobody has spoken for half an hour, and it dies with the process. Nothing in
// this file opens a handle, readies a statement or names a table — and the
// acceptance check for that is a grep over this file for the names of the
// database layer, which is why this paragraph describes them instead of
// spelling them. The one thing this phase does persist is the ICE outcome of
// plan 03-06, which is telemetry about a connection rather than room state.
//
// The reason is not tidiness. Persisting a room would make the server the owner
// of a fact the game does not need it to own: the spec already accepts that the
// authority's disappearance ends the match, so a room that survived a restart
// would come back referring to peers that no longer exist, holding slots
// nobody can claim, in a lobby nobody can start. The Map is not a shortcut
// taken until there is time for a table — it is the correct lifetime.
//
// Everything here takes `now` and `randomBytes` as arguments, in the shape
// shutdown.ts established: a factory with closed-over state and no module-level
// singleton. That is what lets a test force a code collision and jump half an
// hour without waiting or being lucky.
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@dg2/protocol';
import type { PeerInfo, RejectReason } from '@dg2/protocol';

/**
 * How long a room survives with no message from its authority: THIRTY MINUTES.
 *
 * A lobby waiting for friends to wake up legitimately does nothing visible for
 * fifteen, and a run in progress produces keepalive traffic continuously — so
 * "idle" here means idle in earnest rather than merely quiet. Shorter would
 * collect rooms out from under people who are still coming; longer would keep a
 * dead room's code out of circulation for no benefit.
 */
export const ROOM_IDLE_TTL_MS = 30 * 60 * 1000;

/**
 * How long a room outlives its authority's WebSocket: SIXTY SECONDS.
 *
 * D3-02 says the server deletes the room when the authority's WebSocket closes.
 * Read literally that is wrong in one measured, ordinary case: `systemctl
 * reload caddy` CLOSES EVERY LIVE WEBSOCKET, while the P2P DataChannels — which
 * never pass through Caddy — keep running. Under the literal reading, changing
 * a header on the reverse proxy during a game night deletes every room on the
 * box at once, and the games carry on with a server that has forgotten them,
 * leaving phase 5 nowhere to reconnect to.
 *
 * The reading taken here is that THE ROOM DIES WHEN THE AUTHORITY LEAVES, AND
 * THE SOCKET IS THE DETECTOR RATHER THAN THE EVENT. Sixty seconds of grace
 * implements D3-02 instead of contradicting it: an authority that genuinely
 * left does not come back, so the room still dies, one minute later than it
 * would have. The alternative was an operational rule — "never reload Caddy
 * while people are playing" — which moves a rule the code can carry onto a
 * human who will eventually be in a hurry.
 */
export const AUTHORITY_GRACE_MS = 60 * 1000;

/** FOUR seats, which is what `PLAYER_SLOT` freezes and what the arena is built for. */
export const MAX_OCCUPANTS = 4;

/**
 * How many times a draw may collide before `create` gives up.
 *
 * With 32^6 codes and a realistic number of live rooms, ten consecutive
 * collisions is not bad luck — it is a broken generator. The ceiling exists so
 * that case terminates: an unbounded `while` here spins inside a socket handler
 * with the event loop blocked, so the process stops answering while systemd
 * still sees a healthy unit, which is the worst shape a failure can take.
 */
export const MAX_CODE_ATTEMPTS = 10;

/** The slots, in the order they are handed out. Mirrors `PLAYER_SLOT`. */
const SLOTS = ['p0', 'p1', 'p2', 'p3'] as const;

/** A seat in a room. `slot` is stable for the run; `peerId` is not (ADR 0001). */
export type Occupant = PeerInfo;

/** What a caller knows about an arriving peer before it has a seat. */
export interface ArrivingPeer {
  peerId: string;
  accountId: string;
  name: string;
}

export interface Room {
  readonly code: string;
  /**
   * Who owns the simulation, NAMED rather than derived from a slot.
   *
   * Reassigned when the authority reconnects, because a reconnection produces a
   * new connection handle for the same player. Deriving authority from "whoever
   * is in p0" would encode the topology in a rule nobody thinks to look at
   * (FORM-12), and would break on exactly this path.
   */
  authorityPeerId: string;
  /** Keyed by `peerId`; insertion order is the order peers arrived. */
  readonly occupants: Map<string, Occupant>;
  /** When the authority last spoke. Drives `ROOM_IDLE_TTL_MS`. */
  lastSeen: number;
  /** When the authority's socket closed, or `null` while it is connected. */
  authorityGoneAt: number | null;
}

export type JoinResult =
  | { ok: true; room: Room; occupant: Occupant }
  | { ok: false; reason: RejectReason };

export interface RoomsDeps {
  /**
   * The platform CSPRNG, injected.
   *
   * THE ENGINE'S ORDINARY PSEUDO-RANDOM FUNCTION IS DISQUALIFIED HERE, not
   * merely discouraged, and this file is grepped to keep it out. The code is
   * the ONLY credential a room has in this phase (D3-09), and the ordinary
   * generator is an unseeded PRNG whose internal state a determined caller can
   * recover from a handful of outputs — after which every future room code on
   * the box is predictable. A guessable room code is an open door with a lock
   * painted on it, and nothing downstream would ever notice.
   */
  randomBytes: (size: number) => Uint8Array;
  /** Wall clock, in milliseconds. */
  now: () => number;
}

export interface Rooms {
  /** Draws a code that no live room is using. Throws after MAX_CODE_ATTEMPTS. */
  createCode(): string;
  /** Opens a room with `peer` as its authority, seated in p0. */
  create(peer: ArrivingPeer): Room;
  /** Seats `peer` in an existing room, or says why not. */
  join(code: string, peer: ArrivingPeer): JoinResult;
  get(code: string): Room | undefined;
  /** Records that the authority spoke, deferring the idle TTL. */
  touch(code: string): void;
  /** Frees a seat. The room survives; only the authority's exit ends it. */
  leave(code: string, peerId: string): void;
  /** Starts the grace period. Does NOT delete — see AUTHORITY_GRACE_MS. */
  authorityLeft(code: string): void;
  /** Ends the grace period, rebinding the authority to its new handle. */
  authorityReturned(code: string, peerId: string): boolean;
  /** Deletes what has expired and returns the codes removed. */
  sweep(): string[];
  size(): number;
}

export function createRooms({ randomBytes, now }: RoomsDeps): Rooms {
  const rooms = new Map<string, Room>();

  /**
   * One code, drawn uniformly.
   *
   * `byte & 31` is uniform because 32 DIVIDES 256 EXACTLY — every alphabet
   * position is reachable from exactly eight byte values, so no index is more
   * likely than another. Writing that down is the difference between a correct
   * line and a silent bias: the same expression with an alphabet of, say, 36
   * would favour the first twelve characters and nothing would ever complain.
   */
  const draw = (): string => {
    const bytes = randomBytes(ROOM_CODE_LENGTH);
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
      code += ROOM_CODE_ALPHABET[bytes[i]! & 31];
    }
    return code;
  };

  const createCode = (): string => {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = draw();
      if (!rooms.has(code)) return code;
    }
    throw new Error(
      `código de sala: ${MAX_CODE_ATTEMPTS} sorteios seguidos colidiram — o gerador está quebrado`,
    );
  };

  /** The lowest seat nobody is sitting in, or null when the room is full. */
  const freeSlot = (room: Room): Occupant['slot'] | null => {
    const taken = new Set<string>();
    for (const occupant of room.occupants.values()) taken.add(occupant.slot);
    for (const slot of SLOTS) {
      if (!taken.has(slot)) return slot;
    }
    return null;
  };

  const create = (peer: ArrivingPeer): Room => {
    const code = createCode();
    const room: Room = {
      code,
      authorityPeerId: peer.peerId,
      occupants: new Map(),
      lastSeen: now(),
      authorityGoneAt: null,
    };
    room.occupants.set(peer.peerId, { ...peer, slot: SLOTS[0] });
    rooms.set(code, room);
    return room;
  };

  const join = (code: string, peer: ArrivingPeer): JoinResult => {
    const room = rooms.get(code);
    // No distinction between "never existed" and "already swept", and that is
    // deliberate: telling them apart would confirm to a sweeping script that a
    // code was real, which is exactly the bit the code's secrecy is protecting.
    if (!room) return { ok: false, reason: 'badCode' };

    const slot = freeSlot(room);
    if (slot === null) return { ok: false, reason: 'roomFull' };

    const occupant: Occupant = { ...peer, slot };
    room.occupants.set(peer.peerId, occupant);
    return { ok: true, room, occupant };
  };

  const touch = (code: string): void => {
    const room = rooms.get(code);
    if (room) room.lastSeen = now();
  };

  const leave = (code: string, peerId: string): void => {
    const room = rooms.get(code);
    if (room) room.occupants.delete(peerId);
  };

  const authorityLeft = (code: string): void => {
    const room = rooms.get(code);
    // Idempotent: a socket can emit both 'close' and 'error', and restarting
    // the grace period on the second one would extend a dead room's life by
    // however long the two events were apart.
    if (room && room.authorityGoneAt === null) room.authorityGoneAt = now();
  };

  const authorityReturned = (code: string, peerId: string): boolean => {
    const room = rooms.get(code);
    if (!room) return false;

    // The seat survives the connection. Move the occupant record to the new
    // handle, keeping its slot, name and account: that is the ADR 0001 rule
    // made concrete — losing a socket is a transport event, and the simulation
    // must not be able to tell it happened.
    const previous = room.occupants.get(room.authorityPeerId);
    if (previous) {
      room.occupants.delete(room.authorityPeerId);
      room.occupants.set(peerId, { ...previous, peerId });
    }
    room.authorityPeerId = peerId;
    room.authorityGoneAt = null;
    room.lastSeen = now();
    return true;
  };

  const sweep = (): string[] => {
    const at = now();
    const removed: string[] = [];
    for (const [code, room] of rooms) {
      const graceExpired =
        room.authorityGoneAt !== null && at - room.authorityGoneAt > AUTHORITY_GRACE_MS;
      const idleExpired = at - room.lastSeen > ROOM_IDLE_TTL_MS;
      if (graceExpired || idleExpired) {
        rooms.delete(code);
        removed.push(code);
      }
    }
    return removed;
  };

  return {
    createCode,
    create,
    join,
    get: (code: string) => rooms.get(code),
    touch,
    leave,
    authorityLeft,
    authorityReturned,
    sweep,
    size: () => rooms.size,
  };
}
