// limiter.ts — a fixed-window counter per address, and the question of which
// address that is.
//
// TWO THINGS ARE BEING BOUGHT HERE, and only one of them is obvious. The
// obvious one is abuse control: the room code is six characters (D3-09), which
// is 32^6 ≈ 1.07e9, and that number is only large enough BECAUSE guessing costs
// ten attempts a minute. Without the join bucket the same six characters are
// sweepable by a script in an afternoon, and the code stops being a credential.
//
// The non-obvious one is that THIS MODULE MUST NOT BECOME THE DENIAL OF SERVICE
// IT PREVENTS. A Map keyed by remote input, with no ceiling, is a memory leak
// that a stranger controls: a spoofed X-Forwarded-For per request costs a few
// hundred bytes each and reaches the unit's MemoryMax=256M long before any
// bucket fills. Hence MAX_TRACKED_KEYS and the eviction below.
//
// WHY THIS IS HAND-ROLLED AND NOT `hono-rate-limiter`: see the comment in
// index.ts. The short version is that Node's http.Server emits 'upgrade'
// INSTEAD OF 'request', so no Hono middleware runs on the path that needs
// limiting — and the smoke test would pass anyway.

/**
 * The window every bucket is measured over: ONE MINUTE.
 *
 * Fixed rather than sliding. A sliding window costs a timestamp list per key
 * and buys precision at the boundary that nothing here needs: the limits below
 * are set generously enough that the burst a fixed window permits across a
 * boundary — twice the limit — is still far under what a real client does.
 */
export const LIMIT_WINDOW_MS = 60 * 1000;

/**
 * Handshakes per minute per address: TWENTY.
 *
 * Generous on purpose. Four friends behind one CGNAT — which is how a large
 * share of Brazilian residential fibre is delivered — leave through a SINGLE
 * public address, so they share this bucket. Reconnect storms after a dropped
 * link land here too. The number is not tuned; the first real four-player
 * session is a manual check listed in plan 03-11, and this is one of the things
 * it is meant to measure.
 */
export const UPGRADE_LIMIT = 20;

/**
 * Room-code attempts per minute per address: TEN.
 *
 * Tighter than the handshake bucket, and the asymmetry is the point: opening a
 * socket proves nothing, while a join attempt is a guess at the one secret a
 * room has. Ten a minute turns sweeping 32^6 into roughly two hundred years per
 * address, which is what makes six characters enough (T-3-01).
 */
export const JOIN_LIMIT = 10;

/**
 * The hard ceiling on tracked addresses: TEN THOUSAND.
 *
 * Not a tuning knob — the absence of this number is a defect, and the number
 * itself only has to be big enough that no legitimate traffic reaches it. Ten
 * thousand simultaneous distinct addresses is orders of magnitude beyond a game
 * played among friends by room code.
 */
export const MAX_TRACKED_KEYS = 10_000;

/**
 * How many of the oldest entries an overflow discards at once.
 *
 * A batch rather than one, and the reason is cost: evicting a single entry per
 * insert makes every insert past the ceiling do O(n) work, which is a way of
 * paying for the denial of service in CPU after refusing to pay for it in
 * memory. A tenth of the map amortises that to a constant.
 */
const EVICTION_BATCH = MAX_TRACKED_KEYS / 10;

interface Bucket {
  count: number;
  windowStart: number;
}

export interface LimiterDeps {
  now: () => number;
  /** Attempts allowed per window. */
  limit: number;
  windowMs: number;
}

export interface Limiter {
  /** Spends one attempt for `key`. False when the bucket is empty. */
  take(key: string): boolean;
  /** How many addresses are currently tracked. For the ceiling's test. */
  size(): number;
}

export function createLimiter({ now, limit, windowMs }: LimiterDeps): Limiter {
  const buckets = new Map<string, Bucket>();

  /**
   * Makes room for one more key.
   *
   * Expired buckets go first, because discarding them costs nothing — their
   * counters would have reset on the next touch anyway. Only if that frees
   * nothing does a batch of LIVE buckets go, oldest first, and that is a real
   * trade: an evicted attacker gets a fresh allowance. It is the right trade,
   * because the alternative is the process dying, and a limiter that has run
   * out of memory limits nothing at all.
   *
   * "Oldest" means FIRST SEEN, not least recently used: a Map iterates in
   * insertion order and `take` updates a bucket in place without reinserting
   * it. Under overflow — which only a flood produces — first-seen and
   * least-recently-used are the same set anyway.
   */
  const makeRoom = (at: number): void => {
    for (const [key, bucket] of buckets) {
      if (at - bucket.windowStart >= windowMs) buckets.delete(key);
    }
    if (buckets.size < MAX_TRACKED_KEYS) return;

    let dropped = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      dropped += 1;
      if (dropped >= EVICTION_BATCH) break;
    }
  };

  return {
    take(key: string): boolean {
      const at = now();
      const bucket = buckets.get(key);

      if (bucket === undefined) {
        if (buckets.size >= MAX_TRACKED_KEYS) makeRoom(at);
        buckets.set(key, { count: 1, windowStart: at });
        return true;
      }

      // Lazy sweep: the window rolls when the bucket is next touched, so a key
      // nobody comes back to costs one entry until the ceiling reclaims it,
      // rather than an interval timer walking the whole map on a schedule.
      if (at - bucket.windowStart >= windowMs) {
        bucket.count = 1;
        bucket.windowStart = at;
        return true;
      }

      if (bucket.count >= limit) return false;
      bucket.count += 1;
      return true;
    },

    size: () => buckets.size,
  };
}

/** The minimum of `IncomingMessage` this function reads. */
export interface ForwardedRequest {
  headers: { 'x-forwarded-for'?: string | string[] | undefined };
}

/** The minimum of the upgrade socket this function reads. */
export interface RemoteSocket {
  remoteAddress?: string | undefined;
}

/**
 * Which address a request should be counted against.
 *
 * BEHIND CADDY EVERY SOCKET IS LOOPBACK, because the reverse proxy terminates
 * TLS and opens a fresh connection to 127.0.0.1. Counting `remoteAddress` there
 * would put the entire internet in one bucket, and the two outcomes are "nobody
 * is limited" (high limit) or "everybody is" (low limit) — the second being
 * indistinguishable, from the outside, from the server being down.
 *
 * `X-Forwarded-For` is trustworthy HERE and would not be everywhere: Caddy
 * REPLACES the header for untrusted sources rather than appending to it, so
 * what arrives is the address Caddy saw and not something a client wrote. That
 * property is a configuration away from being false — a loose `trusted_proxies`
 * would restore forgeability — which is why it is written down rather than
 * assumed.
 *
 * With no proxy in front (development) the header is absent and the socket
 * address is the correct answer. The blank-header case falls through to the
 * same place: an empty bucket key would collapse every request carrying one
 * into a single counter, which is the loopback failure arrived at from the
 * other direction.
 */
export function clientIp(req: ForwardedRequest, socket: RemoteSocket): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof raw === 'string') {
    const first = raw.split(',')[0]?.trim() ?? '';
    if (first.length > 0) return first;
  }
  return socket.remoteAddress ?? 'desconhecido';
}
