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

// All three come from /etc/dg2/env, which is NOT in this repository (ops/
// README.md §1: the repo never says where the machine lives). The defaults are
// the production paths, so a missing env file fails loudly on the box rather
// than silently writing a database somewhere else.
const DB_PATH = process.env.DG2_DB ?? '/var/lib/dg2/dg2.db';
const PORT = Number(process.env.DG2_PORT ?? 8080);
const RELEASE = process.env.DG2_RELEASE ?? 'dev';

const { sqlite, db } = openDb(DB_PATH);

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

const app = createApp({ sqlite, release: RELEASE });

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
export const server = serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' });
