// local.ts — a `Transport` that never leaves the process.
//
// This is the cable the room's rules are written against BEFORE WebRTC exists,
// and it is the reason tests/lobby.test.ts runs in Node in well under a second
// with no browser, no signalling server and no box. Swapping it for rtc.ts is a
// change of constructor, which is the promise transport.ts is shaped to keep.
//
// DELIVERY IS ALWAYS ASYNCHRONOUS, THROUGH `queueMicrotask`, AND NEVER
// SYNCHRONOUS. This is the single most important line in the file. A
// synchronous fake hides every reentrancy the real one has: a `send` issued
// from inside an `onMessage` handler becomes RECURSION instead of a queued
// message, so a handler that answers what it just received runs nested inside
// itself, sees half-updated state, and can blow the stack on a chain that a
// real DataChannel would have flattened into a queue. Worse, the in-process
// test would stop having the same shape of execution as the networked one,
// which is the whole reason for it to exist. One microtask hop is the smallest
// possible amount of "later" — it costs no timer and no clock, so a test still
// finishes in microseconds, but the ordering it produces is the ordering the
// wire produces.
//
// THE PAYLOAD IS COPIED ON SEND. A real transport serialises, so the caller's
// buffer is free to be reused the instant `send` returns. Handing the very same
// `ArrayBuffer` to the far end would let a caller that keeps one scratch buffer
// per tick work perfectly here and corrupt every message over the wire — a
// difference that would only ever be found in production. The copy makes the
// fake wrong in the same way the real thing is.
import type { ChannelClass } from '@dg2/protocol';
import type { PeerId, Transport } from './transport';

type MessageCb = (from: PeerId, payload: ArrayBuffer, ch: ChannelClass) => void;
type JoinCb = (peer: PeerId) => void;
type LeaveCb = (peer: PeerId, reason: string) => void;

/** Why a link went away, as the far end is told. */
const REASON_CLOSED = 'closed';

interface Endpoint {
  readonly id: PeerId;
  readonly links: Set<PeerId>;
  closed: boolean;
  readonly message: Set<MessageCb>;
  readonly join: Set<JoinCb>;
  readonly leave: Set<LeaveCb>;
}

/**
 * The shared medium the endpoints hang off.
 *
 * Exposed as an object rather than as module state because two tests running in
 * the same file must not be able to reach each other's peers — module state
 * would make the suite order-dependent, which is the one thing a determinism
 * suite may never be.
 */
export interface LocalNetwork {
  /** Adds an endpoint under this id. Opening the same id twice throws. */
  open(id: PeerId): Transport;
  /**
   * Connects two open endpoints. Both learn about it via `onPeerJoin` on the
   * next microtask — never synchronously, for the reason in the file header.
   */
  link(a: PeerId, b: PeerId): void;
  /** The endpoint under this id, for a test that only kept the ids. */
  get(id: PeerId): Transport | undefined;
}

export function createLocalNetwork(): LocalNetwork {
  const endpoints = new Map<PeerId, Endpoint>();
  const handles = new Map<PeerId, Transport>();

  const deliverLeave = (to: Endpoint, gone: PeerId, reason: string): void => {
    queueMicrotask(() => {
      if (to.closed) return;
      for (const cb of [...to.leave]) cb(gone, reason);
    });
  };

  const makeHandle = (self: Endpoint): Transport => ({
    send(to, payload, ch) {
      // A send from a closed endpoint, or to a peer this one is not linked to,
      // is DROPPED and not thrown. That is what a closed RTCDataChannel does
      // with a queued message, and a room where one peer left while another
      // was mid-send is ordinary, not exceptional — throwing here would turn
      // a normal race into a crash in the caller's happy path.
      if (self.closed || !self.links.has(to)) return;
      const copy = payload.slice(0);
      queueMicrotask(() => {
        const target = endpoints.get(to);
        if (!target || target.closed || !target.links.has(self.id)) return;
        // Iterate a snapshot: a handler that unsubscribes itself (or another)
        // while this loop is running must not skip its neighbour.
        for (const cb of [...target.message]) cb(self.id, copy, ch);
      });
    },
    onMessage(cb) {
      self.message.add(cb);
      return () => { self.message.delete(cb); };
    },
    onPeerJoin(cb) {
      self.join.add(cb);
      return () => { self.join.delete(cb); };
    },
    onPeerLeave(cb) {
      self.leave.add(cb);
      return () => { self.leave.delete(cb); };
    },
    rtt() {
      // Always null, and honestly so: nothing measures a link that never
      // leaves the process, and inventing a plausible number here would let a
      // test assert a round trip that no code computed. The number the lobby
      // shows comes from createPinger (D3-13, ping.ts), which measures the
      // path that input and snapshots will actually take.
      return null;
    },
    close() {
      // Idempotent for the same reason createShutdown is: the lobby closes its
      // transport on teardown and a test's afterEach closes it again, and the
      // second call must not fire a second round of onPeerLeave at handlers
      // whose owner is already gone.
      if (self.closed) return;
      self.closed = true;
      for (const other of self.links) {
        const peer = endpoints.get(other);
        if (!peer) continue;
        peer.links.delete(self.id);
        deliverLeave(peer, self.id, REASON_CLOSED);
      }
      self.links.clear();
    },
  });

  return {
    open(id) {
      if (endpoints.has(id)) throw new Error(`endpoint já aberto: ${id}`);
      const self: Endpoint = {
        id, links: new Set(), closed: false,
        message: new Set(), join: new Set(), leave: new Set(),
      };
      endpoints.set(id, self);
      const handle = makeHandle(self);
      handles.set(id, handle);
      return handle;
    },
    link(a, b) {
      const ea = endpoints.get(a);
      const eb = endpoints.get(b);
      if (!ea || !eb) throw new Error(`link entre pontas desconhecidas: ${a} ↔ ${b}`);
      if (ea.closed || eb.closed) throw new Error(`link com ponta fechada: ${a} ↔ ${b}`);
      if (a === b) throw new Error(`link de uma ponta com ela mesma: ${a}`);
      ea.links.add(b);
      eb.links.add(a);
      queueMicrotask(() => {
        if (!ea.closed) for (const cb of [...ea.join]) cb(b);
        if (!eb.closed) for (const cb of [...eb.join]) cb(a);
      });
    },
    get(id) {
      return handles.get(id);
    },
  };
}

/** The two linked endpoints almost every unit test needs. */
export function createLocalPair(
  a: PeerId = 'peer-a',
  b: PeerId = 'peer-b',
): { net: LocalNetwork; a: Transport; b: Transport } {
  const net = createLocalNetwork();
  const ta = net.open(a);
  const tb = net.open(b);
  net.link(a, b);
  return { net, a: ta, b: tb };
}

/**
 * The star this game actually runs on: one authority, N peers, and NO link
 * between the peers.
 *
 * The missing peer-to-peer links are the topology, asserted by construction.
 * A guest that could reach another guest directly would be a mesh, and every
 * rule written above this layer — one hop per message, the authority at the
 * far end of it — would quietly stop being true without a single test failing.
 */
export function createLocalStar(
  authority: PeerId,
  peers: readonly PeerId[],
): { net: LocalNetwork; authority: Transport; peers: Map<PeerId, Transport> } {
  const net = createLocalNetwork();
  const authorityHandle = net.open(authority);
  const handles = new Map<PeerId, Transport>();
  for (const peer of peers) {
    handles.set(peer, net.open(peer));
    net.link(authority, peer);
  }
  return { net, authority: authorityHandle, peers: handles };
}
