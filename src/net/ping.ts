// ping.ts — o número que o lobby mostra, e o caminho que ele mede.
//
// THESE `ping`/`pong` MESSAGES ARE GAME MESSAGES, ON THE `unreliable` DATA
// CHANNEL, AT INDICES 8 AND 9 OF `MSG_KIND`. THEY ARE NOT THE WEBSOCKET
// CONTROL FRAMES OF THE SAME NAME. The signalling server's keepalive uses the
// RFC 6455 ping/pong frames, which the WebSocket implementation handles by
// itself and which never reach the frozen table. Two mechanisms, two
// transports, two purposes: one detects a dead socket, this one measures the
// round trip of the path that `input` and `snapshot` will take in phase 4 —
// which is the number a player is actually looking at. Anyone "unifying" the
// two will have merged a liveness check with a latency measurement and will
// have neither. The collision of names is a fact of the stack, not a mistake:
// renaming either costs more than this paragraph.
//
// `getStats()` IS NOT THE SOURCE OF THIS NUMBER (D3-13). The
// `RTCPeerConnection` stats report a `currentRoundTripTime` for the ICE
// candidate pair, and it is a different quantity: it is the STUN connectivity
// check's round trip on the selected pair, not the trip a game message makes
// through the DataChannel's own queues, and it is not available at all until
// ICE has settled. `getStats()` remains the only source of the ROUTE (direct
// or relay, plan 03-08 fills that in); the milliseconds come from here.
//
// NO CLOCK CROSSES THE WIRE. The frame carries a sequence number and a tick,
// and the instant a ping left is kept LOCALLY, in a map keyed by that sequence
// number. Putting a timestamp in the frame would need both machines to agree
// on a clock — they do not — and would hand the far end a value it could
// simply lie about, turning the ping display into something the other player
// writes.
//
// TIME ARRIVES AS AN ARGUMENT. `now` and `schedule` are injected, so this
// module holds no platform timer and tests/ping.test.ts drives seven seconds of
// measurement in microseconds. Same reasoning as `startWatchdog` in
// apps/server/src/shutdown.ts.
import { MSG_KIND } from '@dg2/protocol';
import type { PeerId, Schedule, Transport, Unsubscribe } from './transport';

/** One ping per second (D3-13, §#11). The lobby relays the summary at 1 Hz. */
export const PING_INTERVAL_MS = 1000;

/** Silence this long is a LOSS, not an infinite round trip. */
export const PING_TIMEOUT_MS = 3000;

/** How many samples the median is taken over — about five seconds of history. */
export const PING_WINDOW = 5;

/** Consecutive losses before the screen stops showing a number at all. */
export const PING_LOSSES_FOR_SILENCE = 3;

/** `u8 kind` + `u16 seq` LE + `u32 tick` LE. */
export const PING_FRAME_BYTES = 7;

/**
 * What the screen should say.
 *
 * `medindo` is the honest state before the first answer, and it is distinct
 * from `sem-resposta` on purpose: "not yet" and "not any more" are different
 * things to a player deciding whether to wait.
 */
export type PingState = 'medindo' | 'ok' | 'sem-resposta';

export interface PingerDeps {
  transport: Transport;
  /** The one peer this instance measures. The authority keeps one per guest. */
  peer: PeerId;
  now: () => number;
  schedule: Schedule;
  /**
   * The tick that travels in the frame. Zero in the lobby, where no run exists;
   * from phase 4 it is the run's tick, so a measured round trip can be lined up
   * against the snapshot it overlapped with. The field is in the frame now
   * because the frame's 7 bytes are being frozen now.
   */
  tick?: () => number;
}

export interface Pinger {
  /** Median of the last samples in ms; null while unmeasured or unanswered. */
  rtt(): number | null;
  state(): PingState;
  /** Cancels the interval, every outstanding deadline and the subscription. */
  close(): void;
}

const KIND_PING = MSG_KIND.indexOf('ping');
const KIND_PONG = MSG_KIND.indexOf('pong');

/** Sequence numbers are `u16`, so they wrap. See the note on `nextSeq`. */
const SEQ_MASK = 0xffff;

function writeFrame(kind: number, seq: number, tick: number): ArrayBuffer {
  const buf = new ArrayBuffer(PING_FRAME_BYTES);
  const view = new DataView(buf);
  view.setUint8(0, kind);
  view.setUint16(1, seq & SEQ_MASK, true);
  view.setUint32(3, tick >>> 0, true);
  return buf;
}

/**
 * The median of the window, taking the LOWER middle for an even count.
 *
 * Averaging the two middles would invent a number that no packet produced, and
 * this value goes on a screen next to a player's name as a measurement. In the
 * steady state the window holds five samples and the question does not arise;
 * it only arises in the first seconds, where under-reporting by one sample is
 * the harmless direction.
 */
function median(samples: readonly number[]): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1];
}

export function createPinger(deps: PingerDeps): Pinger {
  const { transport, peer, now, schedule } = deps;
  const tickOf = deps.tick ?? (() => 0);

  /** seq -> the local instant that ping left. The stamp never travels. */
  const pending = new Map<number, number>();
  /** seq -> the way to cancel that ping's deadline. */
  const deadlines = new Map<number, Unsubscribe>();
  const samples: number[] = [];
  let losses = 0;
  let seq = 0;
  let closed = false;
  let cancelInterval: Unsubscribe | null = null;

  /**
   * Sequence numbers wrap at 65536, which at 1 Hz is eighteen hours — and even
   * that cannot collide, because a ping is forgotten after PING_TIMEOUT_MS
   * either way, so at most three are outstanding at once.
   */
  function nextSeq(): number {
    const value = seq;
    seq = (seq + 1) & SEQ_MASK;
    return value;
  }

  function forget(id: number): void {
    pending.delete(id);
    const cancel = deadlines.get(id);
    if (cancel) { cancel(); deadlines.delete(id); }
  }

  function emit(): void {
    if (closed) return;
    const id = nextSeq();
    pending.set(id, now());
    transport.send(peer, writeFrame(KIND_PING, id, tickOf()), 'unreliable');
    deadlines.set(id, schedule(() => {
      deadlines.delete(id);
      // Guarded: a pong that arrived cancels this, but a cancel that raced a
      // firing would otherwise count a loss for a ping that was answered.
      if (closed || !pending.has(id)) return;
      pending.delete(id);
      // A LOSS DOES NOT ENTER THE WINDOW. Not as Infinity, not as the timeout
      // value, not as zero. The channel is `unreliable` — losing one ping is
      // normal and says nothing about latency — and a sample nobody measured
      // would drag the median toward a number the network never produced.
      losses++;
    }, PING_TIMEOUT_MS));
  }

  function arm(): void {
    cancelInterval = schedule(() => {
      cancelInterval = null;
      if (closed) return;
      emit();
      arm();
    }, PING_INTERVAL_MS);
  }

  const unsubscribe = transport.onMessage((from, payload) => {
    if (closed || from !== peer) return;
    if (payload.byteLength !== PING_FRAME_BYTES) return;
    const view = new DataView(payload);
    const kind = view.getUint8(0);
    if (kind === KIND_PING) {
      // Answer with the SAME sequence number, on the same channel. The tick is
      // echoed rather than replaced by ours: it belongs to the asker, who is
      // the only one who can do anything with it.
      transport.send(peer, writeFrame(KIND_PONG, view.getUint16(1, true), view.getUint32(3, true)), 'unreliable');
      return;
    }
    if (kind !== KIND_PONG) return;
    const id = view.getUint16(1, true);
    const sentAt = pending.get(id);
    // An unknown sequence number is IGNORED, never an error: it is what a pong
    // that arrived after its own deadline looks like, and a late answer is not
    // a fault worth throwing inside a transport callback.
    if (sentAt === undefined) return;
    forget(id);
    samples.push(now() - sentAt);
    if (samples.length > PING_WINDOW) samples.shift();
    losses = 0;
  });

  arm();

  return {
    rtt() {
      // Null while silent, and that is the point of D3-13: a ping frozen at
      // "42 ms" through an outage is worse than no number, because it reads as
      // a working connection. The caller shows `state()` instead.
      if (losses >= PING_LOSSES_FOR_SILENCE) return null;
      return median(samples);
    },
    state() {
      if (losses >= PING_LOSSES_FOR_SILENCE) return 'sem-resposta';
      return samples.length === 0 ? 'medindo' : 'ok';
    },
    close() {
      if (closed) return;
      closed = true;
      if (cancelInterval) { cancelInterval(); cancelInterval = null; }
      for (const cancel of deadlines.values()) cancel();
      deadlines.clear();
      pending.clear();
      unsubscribe();
    },
  };
}
