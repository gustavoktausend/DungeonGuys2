// index.ts — the entrypoint dg2.service runs. Everything here is a side effect,
// in a fixed order: read the environment, open the database, migrate, serve.
//
// The one other entrypoint in this repository, src/main.ts, has the same shape
// and the same top-level `await`. The difference is what failure means: a
// browser that cannot load sprites still shows a menu, while a server that
// cannot migrate must not answer a single request.
import { serve } from '@hono/node-server';
// 'kysely/migration', not 'kysely' — see db/migrations.ts for why.
import { Migrator } from 'kysely/migration';
import { openDb } from './db/open';
import { provider } from './db/migrations';
import { createApp } from './app';
import { readEnv, type ServerEnv } from './env';
import { createShutdown, SHUTDOWN_GRACE_MS } from './shutdown';

// All three come from /etc/dg2/env, which is NOT in this repository (ops/
// README.md §1: the repo never says where the machine lives). The defaults are
// the production paths, so a MISSING env file fails loudly on the box rather
// than silently writing a database somewhere else.
//
// A missing file was never the dangerous case, though. A BLANK value is: the
// reading used to be `process.env.DG2_DB ?? '...'`, and `??` falls back only on
// undefined, which an EnvironmentFile never produces. `DG2_DB=` arrived as ''
// and openDb('') opens an anonymous temporary database that is discarded when
// the connection closes — with the migration passing, /api/health answering ok
// and Litestream replicating a file nobody writes. readEnv() refuses instead;
// see env.ts for the reasoning and tests/server-env.test.ts for the measurement.
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
// Exiting is the correct behaviour and not a cop-out. It is what lets
// StartLimitIntervalSec=60 / StartLimitBurst=5 in dg2.service turn a broken
// migration into a `failed` unit instead of an invisible restart loop; a failed
// unit means nothing is listening on 8080, which means Caddy's `handle_errors`
// answers 503, which means the external monitor stops matching "status":"ok"
// and raises an alarm (P-9). Every link in that chain depends on this process
// refusing to run half-configured. Serving with an unmigrated database would
// give the monitor a green light over a server that cannot store anything.
const { error } = await new Migrator({ db, provider }).migrateToLatest();
if (error) {
  console.error(`apps/server:/migrate: ${String(error)}`);
  process.exit(1);
}

const app = createApp({ sqlite, release: env.release });

/**
 * The real `http.Server`, kept in a named export rather than discarded.
 *
 * Phase 3 attaches the `ws` signalling server to this object's `upgrade` event
 * with `noServer: true`, which is what makes it possible to authenticate a
 * WebSocket BEFORE completing the handshake. That this object is reachable at
 * all is the entire reason Hono was chosen over Fastify, whose websocket plugin
 * keeps the server behind its own abstraction.
 *
 * hostname is access control, not configuration: bound to loopback, the process
 * is reachable only through Caddy, so the API cannot be spoken to outside TLS.
 * Binding every interface instead — the default if this argument is dropped —
 * would publish the API to the internet on a plain HTTP port and leave the
 * defence to a firewall nobody has configured (T-2-BIND).
 */
export const server = serve({ fetch: app.fetch, port: env.port, hostname: '127.0.0.1' });

// The other end of the process's life, and it is a DEPLOY path rather than a
// crash path: ops/deploy.sh runs `systemctl restart dg2` every time the server
// bundle changed, systemd stops a unit with SIGTERM, and Node's default action
// for SIGTERM is to terminate at once. Every deploy therefore used to sever
// whatever was mid-response — Caddy turns those into 502s — and skip
// sqlite.close() entirely, so nothing checkpointed on the way out. open.ts
// accepts that risk for a power cut under `synchronous = NORMAL`; it should not
// also be the price of shipping.
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

// SIGTERM is the one systemd sends. SIGINT is not symmetry: it makes Ctrl+C in
// development take the same path production takes, so the sequence is exercised
// by hand daily instead of being run for the first time on the box.
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
