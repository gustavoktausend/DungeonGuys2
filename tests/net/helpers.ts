// tests/net/helpers.ts — the instruments the room's specs measure with.
//
// Written in the shape of tests/helpers.ts and tests/pwa/helpers.ts: a .ts
// module with no `.test.` in the name (vitest.config.ts includes only
// `tests/**/*.test.ts`, so this file is never collected as a suite), exporting
// fixtures plus the comment that says WHY each fixture is what it is. Four of
// those "why"s are load-bearing.
//
// 1. WHY flush() GOES THROUGH A MACROTASK.
//    src/net/local.ts delivers on `queueMicrotask`, and lossy.ts adds more
//    microtask hops on top. Awaiting a resolved promise is NOT enough: that
//    queues one continuation into the same FIFO, and anything the earlier
//    microtasks queue lands AFTER it — so a single await drains one layer and
//    silently leaves the rest. A macrotask boundary is drained only once the
//    microtask queue is empty, which is exactly the guarantee "after everything
//    that was already in flight" needs.
//
// 2. WHY fakeClock() EXISTS INSTEAD OF vi.useFakeTimers().
//    Nothing under src/net/ reaches for a platform timer at all — the lobby and
//    the pinger take `now` and `schedule` as arguments (transport.ts declares
//    the type, apps/server/src/shutdown.ts set the precedent with
//    `startWatchdog`). There is therefore no global to fake: the test simply
//    hands them a clock it owns. That is stricter than faking timers, because
//    a module that started capturing one would not be patched by this and its
//    test would hang instead of quietly passing.
//
// 3. WHY recordingTransport() DELIVERS SYNCHRONOUSLY, THE OPPOSITE OF local.ts.
//    local.ts is asynchronous on purpose (see its header). This one is not,
//    and the difference is the point: a ping test has to place the `pong` at an
//    exact instant on the fake clock, and an extra microtask hop between
//    `advance()` and the reply would put the reply at a time the test did not
//    choose. Use local.ts to test the room; use this to test a clock.
//
// 4. WHY withLoss() TAKES A SEED AND HANDS BACK report().
//    A failing network test has to print the seed that produced it or it is
//    unreproducible, and an unreproducible failure gets retried until green.
//    Put `lossy.report()` in the assertion message, never in a console line.
import { createLocalNetwork, createLocalPair, createLocalStar } from '../../src/net/local';
import { createLossyTransport, type LossyOptions, type LossyTransport } from '../../src/net/lossy';
import type { ChannelClass } from '@dg2/protocol';
import type { PeerId, Schedule, Transport } from '../../src/net/transport';

export { createLocalNetwork, createLocalPair, createLocalStar };

/**
 * Resolves once every microtask queued before the call — and everything those
 * queued in turn — has run. See note 1 in the header.
 */
export function flush(): Promise<void> {
  return new Promise<void>((resolve) => { setTimeout(resolve, 0); });
}

/** Two linked endpoints. The name the plan's key-link check looks for. */
export function makePair(a = 'peer-a', b = 'peer-b'): { a: Transport; b: Transport } {
  const { a: ta, b: tb } = createLocalPair(a, b);
  return { a: ta, b: tb };
}

/**
 * One authority and N peers, with no peer-to-peer link — the topology the game
 * actually runs on. `net` comes back too, because a test that adds a fifth peer
 * after the fact needs to open and link it.
 */
export function makeStar(authority: PeerId, peers: readonly PeerId[]) {
  return createLocalStar(authority, peers);
}

/** Wraps one endpoint's outbound side in seeded loss. See note 4. */
export function withLoss(inner: Transport, opts: LossyOptions): LossyTransport {
  return createLossyTransport(inner, opts);
}

export interface FakeClock {
  /** The current instant, in ms. Handed to a module as its `now`. */
  now(): number;
  /** Handed to a module as its `schedule`. One-shot, cancellable. */
  schedule: Schedule;
  /**
   * Moves time forward by `ms`, firing every deadline that falls inside the
   * window in time order — including deadlines armed BY those callbacks, which
   * is what makes a module that re-arms itself (the lobby's 1 Hz emission, the
   * pinger's 1 Hz ping) tick the expected number of times in one call.
   */
  advance(ms: number): void;
  /** Deadlines still armed. A closed module should leave none behind. */
  pending(): number;
}

/** Guard against a callback that re-arms itself at 0 ms and never lets go. */
const MAX_FIRINGS_PER_ADVANCE = 100_000;

export function fakeClock(start = 0): FakeClock {
  let t = start;
  let nextId = 0;
  const armed = new Map<number, { at: number; fn: () => void }>();

  const schedule: Schedule = (fn, ms) => {
    const id = nextId++;
    armed.set(id, { at: t + ms, fn });
    return () => { armed.delete(id); };
  };

  return {
    now: () => t,
    schedule,
    pending: () => armed.size,
    advance(ms) {
      const target = t + ms;
      for (let fired = 0; ; fired++) {
        if (fired > MAX_FIRINGS_PER_ADVANCE) {
          throw new Error('advance não terminou: um callback está se re-armando em 0 ms');
        }
        // Earliest deadline inside the window; ties broken by arming order, so
        // two deadlines at the same instant fire in the order they were set.
        let dueId = -1;
        let dueAt = Infinity;
        for (const [id, timer] of armed) {
          if (timer.at <= target && (timer.at < dueAt || (timer.at === dueAt && id < dueId))) {
            dueId = id;
            dueAt = timer.at;
          }
        }
        if (dueId < 0) break;
        const timer = armed.get(dueId)!;
        armed.delete(dueId);
        t = timer.at;
        timer.fn();
      }
      t = target;
    },
  };
}

export interface RecordedSend {
  to: PeerId;
  payload: ArrayBuffer;
  ch: ChannelClass;
}

export interface RecordingTransport {
  transport: Transport;
  /** Every send, in order, with the bytes as they were handed over. */
  sent: RecordedSend[];
  /** Pushes a frame at the subscribers, synchronously. See note 3. */
  deliver(from: PeerId, payload: ArrayBuffer, ch?: ChannelClass): void;
  join(peer: PeerId): void;
  leave(peer: PeerId, reason?: string): void;
  isClosed(): boolean;
}

export function recordingTransport(): RecordingTransport {
  const sent: RecordedSend[] = [];
  const message = new Set<(f: PeerId, p: ArrayBuffer, c: ChannelClass) => void>();
  const join = new Set<(p: PeerId) => void>();
  const leave = new Set<(p: PeerId, r: string) => void>();
  let closed = false;

  const transport: Transport = {
    send(to, payload, ch) {
      if (closed) return;
      sent.push({ to, payload, ch });
    },
    onMessage(cb) { message.add(cb); return () => { message.delete(cb); }; },
    onPeerJoin(cb) { join.add(cb); return () => { join.delete(cb); }; },
    onPeerLeave(cb) { leave.add(cb); return () => { leave.delete(cb); }; },
    rtt() { return null; },
    close() { closed = true; },
  };

  return {
    transport,
    sent,
    deliver(from, payload, ch = 'unreliable') {
      for (const cb of [...message]) cb(from, payload, ch);
    },
    join(peer) { for (const cb of [...join]) cb(peer); },
    leave(peer, reason = 'closed') { for (const cb of [...leave]) cb(peer, reason); },
    isClosed: () => closed,
  };
}
