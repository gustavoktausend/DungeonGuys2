// lossy.ts — a `Transport` decorator that breaks the cable on purpose.
//
// THE FAULT INJECTION IS SEEDED, AND THE SEED COMES OUT IN THE FAILURE
// MESSAGE. That is the whole point of the file. A network test built on
// unseeded randomness produces a red run that nobody can reproduce, so it fails
// once in fifty, gets marked flaky, and then gets deleted or retried until
// green — which is how a suite stops being evidence. With `Rng` from @dg2/sim
// (the same seeded generator the simulation itself draws from) a red run prints
// its seed, and re-running with that seed replays the exact interleaving of
// drops, duplicates and reorderings that produced it.
//
// `report()` exists for exactly that: put it in the assertion message, not in a
// console line, so the seed is attached to the failure and not to the scrollback.
//
// DIRECTION. The decorator sits on the OUTBOUND side of one endpoint, so
// wrapping one end gives a one-way-lossy link. Wrap both ends to make a link
// lossy in both directions — asymmetric loss is real (an upstream that is worse
// than the downstream is the normal shape of a home connection), so making the
// asymmetry expressible was worth more than hiding it.
//
// WHY THE DELAY IS COUNTED IN MICROTASK HOPS AND NOT IN MILLISECONDS. A delay
// in ms needs a clock, and a test that waits on a real clock is a slow test
// asserting a clock instead of a sequence — the same reasoning that made
// `startWatchdog` an injected argument in apps/server/src/shutdown.ts. What a
// network test actually needs from "delay" is ORDER: that message B can
// overtake message A. A hop count produces exactly that, costs no timer, and is
// fully drained by the same `flush()` the rest of the in-process transport
// already needs. If phase 4 ever needs wall-clock latency to reproduce a
// bandwidth bug, that is a different instrument and it should say so.
import { Rng } from '@dg2/sim';
import type { ChannelClass } from '@dg2/protocol';
import type { PeerId, Transport, Unsubscribe } from './transport';

/** Fraction of sends that never arrive. An unreliable channel loses packets. */
export const DEFAULT_DROP_RATE = 0.05;
/** Fraction of sends delivered twice. UDP-shaped transports do duplicate. */
export const DEFAULT_DUPLICATE_RATE = 0.02;
/** Fraction of sends held back far enough for the next one to overtake them. */
export const DEFAULT_REORDER_RATE = 0.05;
/** Upper bound of the ordinary jitter, in microtask hops. */
export const DEFAULT_MAX_DELAY_HOPS = 2;
/** Extra hops added when the reorder roll fires — enough to lose a place. */
export const REORDER_EXTRA_HOPS = 3;

export interface LossyOptions {
  /** The one number that makes a red run reproducible. Required on purpose. */
  seed: number;
  dropRate?: number;
  duplicateRate?: number;
  reorderRate?: number;
  maxDelayHops?: number;
}

export interface LossyStats {
  sent: number;
  dropped: number;
  duplicated: number;
  reordered: number;
}

export interface LossyTransport extends Transport {
  readonly seed: number;
  readonly stats: Readonly<LossyStats>;
  /** One line for an assertion message: the seed plus what it actually did. */
  report(): string;
}

/**
 * Runs `fn` after `hops` extra microtask turns.
 *
 * Zero hops still means "not synchronously", because the wrapped transport
 * defers on its own; this only adds turns on top of that.
 */
function afterHops(hops: number, alive: () => boolean, fn: () => void): void {
  if (hops <= 0) { if (alive()) fn(); return; }
  queueMicrotask(() => afterHops(hops - 1, alive, fn));
}

export function createLossyTransport(inner: Transport, opts: LossyOptions): LossyTransport {
  const rng = new Rng(opts.seed);
  const dropRate = opts.dropRate ?? DEFAULT_DROP_RATE;
  const duplicateRate = opts.duplicateRate ?? DEFAULT_DUPLICATE_RATE;
  const reorderRate = opts.reorderRate ?? DEFAULT_REORDER_RATE;
  const maxDelayHops = opts.maxDelayHops ?? DEFAULT_MAX_DELAY_HOPS;
  const stats: LossyStats = { sent: 0, dropped: 0, duplicated: 0, reordered: 0 };
  let closed = false;
  const alive = (): boolean => !closed;

  const jitter = (): number => {
    // Guarded so that an all-zero configuration draws NOTHING from the
    // generator. A pass-through that silently consumed the stream would make
    // two tests with the same seed disagree depending on how many messages
    // crossed a decorator that was configured to do nothing.
    let hops = maxDelayHops > 0 ? rng.int(maxDelayHops + 1) : 0;
    if (rng.chance(reorderRate)) { hops += REORDER_EXTRA_HOPS; stats.reordered++; }
    return hops;
  };

  return {
    seed: opts.seed,
    stats,
    report() {
      return `seed=${opts.seed} enviadas=${stats.sent} perdidas=${stats.dropped} `
        + `duplicadas=${stats.duplicated} reordenadas=${stats.reordered}`;
    },
    send(to: PeerId, payload: ArrayBuffer, ch: ChannelClass): void {
      if (closed) return;
      stats.sent++;
      if (rng.chance(dropRate)) { stats.dropped++; return; }
      const copies = rng.chance(duplicateRate) ? 2 : 1;
      if (copies === 2) stats.duplicated++;
      for (let i = 0; i < copies; i++) {
        // Each copy rolls its own jitter, so a duplicate does not arrive glued
        // to its original — which is what makes a receiver that de-duplicates
        // by "the same message twice in a row" fail here, as it should.
        afterHops(jitter(), alive, () => inner.send(to, payload, ch));
      }
    },
    onMessage(cb): Unsubscribe { return inner.onMessage(cb); },
    onPeerJoin(cb): Unsubscribe { return inner.onPeerJoin(cb); },
    onPeerLeave(cb): Unsubscribe { return inner.onPeerLeave(cb); },
    rtt(peer: PeerId): number | null { return inner.rtt(peer); },
    close(): void {
      if (closed) return;
      closed = true;
      inner.close();
    },
  };
}
