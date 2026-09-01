// health.ts — the body of GET /api/health, computed away from the route so the
// question "what does this publish?" has a single, short answer.
//
// The consumer is a free third-party monitor polling once a minute over the
// public internet (D2-21). That makes this the one response in the system read
// by something outside it, on a schedule, forever — and the one worth being
// pedantic about.
import type { Database as SqliteHandle } from 'better-sqlite3';

/**
 * Everything the endpoint says, and the type is exhaustive on purpose.
 *
 * What is deliberately NOT here, item by item:
 *   - the database path, or any path: it would name /var/lib/dg2 to the world;
 *   - the hostname or the upstream port: the whole point of binding to
 *     loopback is that neither is reachable, so neither should be published;
 *   - library or runtime versions: a Node or better-sqlite3 version is a
 *     shopping list for whoever is looking for an unpatched one;
 *   - the error string when the probe fails: `db: false` says everything the
 *     monitor can act on, and a SQLite error message says where the file is;
 *   - the simulation version hash. It is derived from a public artifact so it
 *     is not a secret, and phase 3 will want it in the room handshake — but
 *     today it lives only in packages/sim/dist/sim-version.json and is not sent
 *     to the client at all. Putting it here would be its first publication,
 *     decided by a health endpoint rather than by the protocol that needs it.
 *     Phase 3 adds it when there is a consumer (02-RESEARCH.md open question 5).
 *
 * `release` stays because it is the one field that makes the monitor useful
 * beyond up/down: it is the git sha ops/deploy.sh put in /etc/dg2/env, so an
 * alert can say WHICH release started failing.
 */
export interface HealthBody {
  status: 'ok' | 'degraded';
  db: boolean;
  release: string;
}

/**
 * Probes the database and describes the result.
 *
 * The probe counts rows in `kysely_migration`, which is cheap and meaningful at
 * the same time: it succeeds only if the file opened AND the schema was
 * applied. A bare `select 1` would prove the process is alive, which the HTTP
 * response already proved; opening a connection per request would make the
 * health check the most expensive route on the server.
 */
export function healthBody(sqlite: SqliteHandle, release: string): HealthBody {
  let db = true;
  try {
    sqlite.prepare('select count(*) as n from kysely_migration').get();
  } catch {
    // Swallowed on purpose: the caller gets a boolean and the reason stays in
    // the process. Anything more specific than `false` is topology.
    db = false;
  }
  return { status: db ? 'ok' : 'degraded', db, release };
}
