// tests/net/e2e-helpers.ts — the game and the signalling leg on ONE origin.
//
// WHY ONE SERVER AND NOT TWO. In production, Caddy answers 443: it serves the
// built client from disk and reverse-proxies `/ws` to the unit on 8080, so the
// browser sees a single origin (ops/Caddyfile, C-9). This file is that topology
// collapsed into one Node process, and the collapse is MANDATORY rather than
// convenient — two of the phase's own decisions refuse the alternative:
//
//   - the signalling upgrade compares the request's `Origin` byte for byte
//     against one configured string (plan 03-04, T-3-02), so a WebSocket on a
//     second port would be refused before the handshake completed;
//   - D-08 refuses peers on different builds with no bypass, so both contexts
//     have to be served the same `dist/`.
//
// A spec that worked around either would be proving a shape production does not
// have, which is the failure mode a browser test exists to rule out.
//
// WHY THE STATIC HALF IS `serveDir` FROM tests/pwa/helpers.ts. It already
// answers an unknown path with a 404 instead of index.html (the same refusal
// ops/Caddyfile makes, and the reason is written down there), it sends the same
// cache headers production sends, it guards against path traversal out of the
// served root, and its `close()` destroys live keep-alive sockets rather than
// merely stopping the listener. A second copy here would be a second place for
// every one of those to be wrong — so `serveDir` grew one field, `upgradable`,
// and this file attaches to it.
//
// NOTHING IS PERSISTED. `recordOutcome` and `forgetOutcomes` are no-ops: the
// ICE telemetry recorder is the only part of the server that wants a database,
// and a spec that opened one would leave a file behind in a repository that has
// none. They are separate arguments from `iceConfig` precisely so a caller with
// nothing to store can pass a pair of no-ops — signaling/index.ts says so.
import { randomBytes } from 'node:crypto';
import { attachSignalling, HEARTBEAT_MS } from '../../apps/server/src/signaling/index';
import {
  createLimiter, JOIN_LIMIT, LIMIT_WINDOW_MS, UPGRADE_LIMIT,
} from '../../apps/server/src/signaling/limiter';
import { createRooms } from '../../apps/server/src/signaling/rooms';
import { NO_TURN } from '../../apps/server/src/signaling/turn';
import { serveDir } from '../pwa/helpers';

export interface GameServer {
  /** `http://127.0.0.1:<ephemeral port>` — the game AND `/ws` live here. */
  readonly origin: string;
  /** Every structured line the signalling leg logged, for a failure report. */
  readonly log: { event: string; fields: Record<string, unknown> }[];
  /** Stops the listener, drops open sockets, and disarms the heartbeat. */
  close(): Promise<void>;
}

/**
 * Serves `dir` and the signalling leg on one ephemeral origin.
 *
 * NO ICE SERVERS ARE ADVERTISED, and that is a deliberate answer rather than an
 * omission. Both contexts run on this machine, so each gathers a loopback host
 * candidate and the pair nominates without ever needing to discover a public
 * address — while a STUN entry pointing at the internet would make a hermetic
 * browser test depend on the network, and its failure would read as "WebRTC is
 * broken" rather than as "CI has no route out". The relay path is not exercised
 * here by construction; it is the subject of the plan that has the box.
 */
export async function serveGame(dir = 'dist'): Promise<GameServer> {
  const statics = await serveDir(dir);
  const log: GameServer['log'] = [];
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  attachSignalling(statics.upgradable, {
    // The origin the browser will actually send, taken from the listener that
    // just bound: an ephemeral port cannot be written down in advance, and
    // writing down a wrong one would produce a refusal that looks like a bug in
    // the client.
    origin: statics.origin,
    rooms: createRooms({ randomBytes, now: () => Date.now() }),
    upgradeLimiter: createLimiter({
      now: () => Date.now(), limit: UPGRADE_LIMIT, windowMs: LIMIT_WINDOW_MS,
    }),
    joinLimiter: createLimiter({
      now: () => Date.now(), limit: JOIN_LIMIT, windowMs: LIMIT_WINDOW_MS,
    }),
    // Collected rather than printed: a passing spec should be silent, and a
    // failing one wants these lines in its own report, correlated with the
    // assertion that failed.
    log: (event, fields) => { log.push({ event, fields: fields ?? {} }); },
    now: () => Date.now(),
    recordOutcome: () => {},
    forgetOutcomes: () => {},
    iceConfig: () => ({ ice: { iceServers: [] }, turn: NO_TURN }),
    startHeartbeat: (tick) => {
      heartbeat = setInterval(tick, HEARTBEAT_MS);
      // .unref() for the reason index.ts gives: a periodic timer must not be
      // the thing keeping the process alive. Cleared in close() as well,
      // because a spec that leaves timers armed leaks them into the next one.
      heartbeat.unref();
    },
  });

  return {
    origin: statics.origin,
    log,
    async close(): Promise<void> {
      if (heartbeat !== null) { clearInterval(heartbeat); heartbeat = null; }
      await statics.close();
    },
  };
}
