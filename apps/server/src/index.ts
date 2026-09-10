// index.ts — the entrypoint of the `api` container. Everything here is a side
// effect, in a fixed order: read the environment, open the database, migrate,
// serve.
//
// THIS PROCESS IS NOT PID 1 OF THAT CONTAINER. Litestream is, wrapping it with
// `replicate -exec`, so that the database never takes a write while nothing is
// replicating it — for a currency ledger that window is soul gold that vanishes
// (D2-28). What that arrangement costs and what it buys for the shutdown below
// is spelled out at the signal wiring at the bottom of this file.
//
// The one other entrypoint in this repository, src/main.ts, has the same shape
// and the same top-level `await`. The difference is what failure means: a
// browser that cannot load sprites still shows a menu, while a server that
// cannot migrate must not answer a single request.
import { serve } from '@hono/node-server';
// 'kysely/migration', not 'kysely' — see db/migrations.ts for why.
import { Migrator } from 'kysely/migration';
import { randomBytes } from 'node:crypto';
import { openDb } from './db/open';
import { provider } from './db/migrations';
import { createApp } from './app';
import { readEnv, type ServerEnv } from './env';
import { createShutdown, SHUTDOWN_GRACE_MS } from './shutdown';
import { attachSignalling, HEARTBEAT_MS } from './signaling';
import { createOutcomeRecorder } from './signaling/outcome';
import { createRooms } from './signaling/rooms';
import { DEV_STUN_DOMAIN, iceServers, NO_TURN, turnCredential } from './signaling/turn';
import {
  createLimiter,
  JOIN_LIMIT,
  LIMIT_WINDOW_MS,
  UPGRADE_LIMIT,
} from './signaling/limiter';

// Every value readEnv needs arrives in the PROCESS ENVIRONMENT, and where that
// environment is authored moved with D2-29: the deployment's values are the
// app's variables in the Coolify panel, a developer's are whatever the shell
// exports. Neither is in this repository, which is the half of D2-15 that
// survived intact — the repo still never says where the machine lives. The
// defaults are the production paths, so a deployment that forgot a key fails
// loudly rather than silently writing a database somewhere else.
//
// A missing value was never the dangerous case, though. A BLANK one is: the
// reading used to be `process.env.DG2_DB ?? '...'`, and `??` falls back only on
// undefined, which neither a shell export nor a saved panel field ever produces.
// `DG2_DB=` arrived as '' and openDb('') opens an anonymous temporary database
// that is discarded when the connection closes — with the migration passing,
// /api/health answering ok and Litestream replicating a file nobody writes.
// readEnv() refuses instead; see env.ts for the reasoning and
// tests/server-env.test.ts for the measurement.
//
// A PANEL MAKES THAT MORE LIKELY, NOT LESS. A text field somebody cleared and
// saved is the same empty string a truncated line in a file used to be, and
// there is no diff of it anywhere to notice.
let env: ServerEnv;
try {
  env = readEnv(process.env);
} catch (error) {
  // The failure contract of ops/README.md §1, in TypeScript: one line on
  // stderr as `file:pointer: message`, exit non-zero, no stack trace. Exiting
  // before openDb() is the whole point — a wrong path here is worse than a
  // crash, because a crash is visible and a throwaway database is not.
  console.error(`apps/server:${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const { sqlite, db } = openDb(env.dbPath);

// D2-07: migrate BEFORE accepting a request, and exit non-zero if it fails.
//
// Exiting is the correct behaviour and not a cop-out, and the alarm chain it
// starts survived containerisation with exactly one link replaced. The restart
// policy is the compose's (`restart: unless-stopped`) rather than a supervisor's
// give-up counter, so a broken migration now produces a container that
// crash-loops with backoff instead of one that gives up and stays down. Either
// way NOTHING IS LISTENING on the port the web container proxies to, which means
// Caddy's `handle_errors` answers 503, which means the external monitor stops
// matching "status":"ok" and raises an alarm (P-9).
//
// What the replacement lost is a TERMINAL state: the container will be retried
// forever, so the alarm is now the only thing that ever says "stop waiting".
// That makes the external monitor of D2-16/D2-21 load-bearing rather than a
// nicety — and it makes this refusal to run half-configured load-bearing too.
// Serving with an unmigrated database would give the monitor a green light over
// a server that cannot store anything.
const { error } = await new Migrator({ db, provider }).migrateToLatest();
if (error) {
  console.error(`apps/server:/migrate: ${String(error)}`);
  process.exit(1);
}

const app = createApp({ sqlite, release: env.release });

/**
 * The real `http.Server`, kept in a named export rather than discarded.
 *
 * The signalling server of phase 3 is attached to this object's `upgrade` event
 * just below, with `noServer: true` — which is what makes it possible to refuse
 * a WebSocket BEFORE the handshake completes, and therefore where phase 6 will
 * validate a session cookie. That this object is reachable at all is the entire
 * reason Hono was chosen over Fastify, whose websocket plugin keeps the server
 * behind its own abstraction.
 *
 * THE BIND ADDRESS IS CONFIGURATION NOW, AND THE DEFENCE MOVED HOUSE RATHER
 * THAN LEFT. The literal that used to sit here was the loopback, on the reading
 * that a process bound to loopback can only be spoken to through Caddy. That
 * reading was right while Caddy and Node shared one host's loopback, and it is
 * WRONG for two containers: `127.0.0.1` inside a container is that container's
 * own loopback, and the Caddy container has no route to it. The symptom would
 * have been 503 on every /api/* from the first deploy with every other check
 * green — the static game loading perfectly, which reads as a Node fault and is
 * a routing one (DM-9).
 *
 * So what keeps the API off the internet is no longer this argument. Under
 * D2-22 NOTHING IS PUBLISHED ON THE HOST, and that is the whole of it: a
 * container port with no published mapping crosses neither the host's NAT nor
 * its firewall, so `0.0.0.0` in here means "reachable from the isolated bridge
 * network Coolify created" and nothing more. The boundary became the compose
 * network plus the ABSENCE of a `ports:` key — an absence somebody has to keep,
 * which is why plan 02-14, which writes that compose, also carries the assertion
 * that no service declares `ports:` (T-2-BIND). Delete that assertion and this
 * line becomes the hole the old literal prevented.
 *
 * `DG2_BIND` therefore defaults to the loopback, so every native run, every
 * restore drill and every developer's machine keeps the original defence
 * untouched; the container value is written in the compose, where it is one
 * reviewable line in a diff instead of a constant nobody re-reads.
 *
 * AND THE PORT BELOW IS NOT A CONFLICT, though it reads like one. `DG2_PORT`
 * defaults to 8080 and the Traefik that fronts the neighbouring app on this box
 * already holds 0.0.0.0:8080 on the host. The two cannot collide, by
 * construction rather than by luck: a container's ports live in that container's
 * own network namespace, and nothing here is published into the host's. Do not
 * "fix" the default — it would buy nothing and would put this file out of step
 * with the compose, the healthcheck and the upstream the web container proxies
 * to.
 */
export const server = serve({ fetch: app.fetch, port: env.port, hostname: env.bind });

/**
 * One JSON object per line on stdout, which is what a container log collector
 * wants and what a later pino would emit unchanged. Correlated by room code,
 * because debugging a WebRTC failure without being able to group the lines of
 * one room is not debugging.
 *
 * Named rather than written inline now that two consumers share it: the
 * signalling leg and the telemetry recorder both log through this one function,
 * so a change to the format cannot reach one and miss the other.
 */
const log = (event: string, fields?: Record<string, unknown>): void => {
  console.log(JSON.stringify({ event, ...fields }));
};

// The ICE telemetry recorder, built AFTER migrateToLatest above — the table it
// writes to is created by `002_ice_outcome`, and a recorder constructed before
// the migration would be one whose first write is the one that discovers the
// schema is missing.
const outcomes = createOutcomeRecorder({ sqlite, log, now: () => Date.now() });

// The relay, or the honest absence of one.
//
// WARNED ONCE, AT BOOT, AND NOT PER ROOM. A deployment without coturn is a
// supported state — it is what every wave of phase 3 before the box runs
// against — so this is not an error; but it is also not something to discover
// from a player's complaint. One line at startup is where an operator looks
// when relay stops working, and a line per room would bury it.
const turnDomain = env.turnRealm ?? DEV_STUN_DOMAIN;
if (env.turnSecret === null) {
  log('turn-disabled', {
    // No key names beyond the one to set, and no path: the operator can act on
    // this, and the rest is topology (D2-15).
    detail: 'DG2_TURN_SECRET ausente — ICE será emitido só com STUN, sem relay',
  });
}

// The signalling leg, wired with everything time-like and stateful passed in.
//
// The two dependencies plan 03-04 left inert are real from here on:
// `recordOutcome` writes the telemetry row and `iceConfig` mints the ephemeral
// TURN credential. They were arguments from the start precisely so that filling
// them in would be a change to THIS file only — signaling/index.ts learned
// nothing about either, beyond resolving the reporter from its own socket.
attachSignalling(server, {
  origin: env.origin,
  rooms: createRooms({ randomBytes, now: () => Date.now() }),
  upgradeLimiter: createLimiter({
    now: () => Date.now(),
    limit: UPGRADE_LIMIT,
    windowMs: LIMIT_WINDOW_MS,
  }),
  joinLimiter: createLimiter({
    now: () => Date.now(),
    limit: JOIN_LIMIT,
    windowMs: LIMIT_WINDOW_MS,
  }),
  log,
  now: () => Date.now(),
  recordOutcome: outcomes.record,
  forgetOutcomes: outcomes.forget,
  // Minted PER ENTRY, per room and per seat, so the pair a peer holds names the
  // session it was issued for and stops being useful when that session ends
  // (D3-10). Seconds and not milliseconds: the expiry inside the username is
  // what coturn enforces, and it reads unix seconds.
  iceConfig: (code, slot) => {
    const cred =
      env.turnSecret === null
        ? null
        : turnCredential(env.turnSecret, code, slot, Math.floor(Date.now() / 1000));
    return {
      ice: { iceServers: iceServers(turnDomain, cred) },
      turn: cred ?? NO_TURN,
    };
  },
  // .unref() for the same reason shutdown.ts gives: a periodic timer must not
  // itself be a reason for the process to stay alive.
  startHeartbeat: (tick) => {
    setInterval(tick, HEARTBEAT_MS).unref();
  },
});

// The other end of the process's life, and it is a DEPLOY path rather than a
// crash path: shipping a new server bundle means a new image and a new
// container, so every deploy replaces this process. The replacement opens with
// SIGTERM — `docker stop` sends it, and the recreation of the container is what
// issues that stop — and Node's default action for SIGTERM is to terminate at
// once. Every deploy would therefore sever whatever was mid-response (Caddy
// turns those into 502s) and skip sqlite.close() entirely, so nothing
// checkpointed on the way out. open.ts accepts that risk for a power cut under
// `synchronous = NORMAL`; it should not also be the price of shipping.
//
// THE SIGNAL REACHES THIS PROCESS THROUGH LITESTREAM, which is PID 1 of the
// container and runs the server as the child of `replicate -exec`. Measured in
// its own source (02-RESEARCH.md §DM-13): it forwards the EXACT signal to the
// child and waits for the child to exit before terminating itself. That is why
// the graceful shutdown built here is still the graceful shutdown that runs on
// the box, and it is also why the container's stop grace has to exceed this
// process's own watchdog — the drain happens first, and only then does
// Litestream make its final sync. Plan 02-14 owns that number.
//
// The sequence itself lives in shutdown.ts, tested; what stays here is the
// wiring, which is the half that cannot be tested in-process (see
// tests/server-shutdown.test.ts for how it is audited instead).
const shutdown = createShutdown({
  server,
  sqlite,
  exit: code => process.exit(code),
  startWatchdog: fire => {
    // .unref(): a pending timer is a reason for Node to stay alive, and a
    // deadline for stopping must not itself be something keeping the process
    // up. Nothing here waits for it — it only ever fires if the drain does not
    // finish first.
    setTimeout(fire, SHUTDOWN_GRACE_MS).unref();
  },
});

// SIGTERM is the one `docker stop` sends, handed over unchanged by the
// Litestream process that wraps this one. SIGINT is not symmetry: it makes
// Ctrl+C in development take the same path production takes, so the sequence is
// exercised by hand daily instead of being run for the first time on the box.
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
