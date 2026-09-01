// server-health.test.ts — the contract of GET /api/health, on both sides.
//
// Two things are being pinned here, and only one of them is "does it work".
// The other is what the response does NOT contain, because this endpoint is
// polled once a minute, forever, by a free third-party monitor over the public
// internet (D2-21). It is the single most-read surface this system exposes, and
// the cheapest place in the whole project to leak topology by accident — a
// debugging field added in a hurry two phases from now would ship straight to
// an outside service and nobody would notice. That is what the "does not
// contain" assertions are for: they fail on the commit that adds the field.
//
// createApp() is imported instead of index.ts, on purpose: importing index.ts
// would open /var/lib/dg2/dg2.db, run migrations and bind port 8080 as a side
// effect of the import. Hono's app.request() drives the route with no socket at
// all, so this file needs neither a port nor a temporary file.
import { describe, it, expect } from 'vitest';
import { Migrator } from 'kysely/migration';
import { openDb } from '../apps/server/src/db/open';
import { provider } from '../apps/server/src/db/migrations';
import { createApp } from '../apps/server/src/app';

/** A git-sha-shaped release, as ops/deploy.sh would put in DG2_RELEASE. */
const RELEASE = 'a1b2c3d';

/**
 * Opens an in-memory database and migrates it, exactly as index.ts does.
 *
 * `sqlite` is returned alongside because the bookkeeping tests below have to
 * reach past the query builder to damage the database the way a bad restore
 * would.
 */
async function healthyApp() {
  const { sqlite, db } = openDb(':memory:');
  const { error } = await new Migrator({ db, provider }).migrateToLatest();
  expect(error).toBeUndefined();
  return { app: createApp({ sqlite, release: RELEASE }), db, sqlite };
}

describe('GET /api/health com o banco migrado', () => {
  it('responde 200 com Cache-Control no-store', async () => {
    const { app, db } = await healthyApp();

    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    // no-store and not merely "not empty": an intermediary allowed to
    // revalidate could still serve a stale "ok" for a server that is down.
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    await db.destroy();
  });

  it('o corpo tem exatamente as três chaves publicadas', async () => {
    const { app, db } = await healthyApp();

    const body = (await (await app.request('/api/health')).json()) as Record<string, unknown>;
    // Set equality AND length. "Contains status" would pass while the response
    // also carried a database path; the point of this assertion is that a
    // fourth key fails, whatever it is (T-2-LEAK).
    expect(Object.keys(body).sort()).toEqual(['db', 'release', 'status']);
    expect(Object.keys(body)).toHaveLength(3);
    expect(body).toEqual({ status: 'ok', db: true, release: RELEASE });

    await db.destroy();
  });

  it('serializa a subsequência que o monitor externo casa por keyword', async () => {
    const { app, db } = await healthyApp();

    const raw = await (await app.request('/api/health')).text();
    // The external monitor of D2-21 does keyword matching on the response body,
    // not JSON parsing. That makes the exact serialized substring part of the
    // contract: reordering the object or spacing the JSON would silently stop
    // the alarm from ever firing, and nothing else in the system would notice.
    expect(raw).toContain('"status":"ok"');

    await db.destroy();
  });

  it('o corpo não vaza caminho, nome de arquivo, motor nem erro', async () => {
    const { app, db } = await healthyApp();

    const raw = await (await app.request('/api/health')).text();
    // A path separator would mean a filesystem path escaped into the body; the
    // database filename would name /var/lib/dg2's contents; the engine name
    // would advertise which database to look for an unpatched version of; and
    // `Error` would mean a driver message was passed through verbatim, which is
    // how paths leak in the first place.
    for (const forbidden of ['/', 'dg2.db', 'sqlite', 'Error']) {
      expect(raw, `o corpo contém "${forbidden}": ${raw}`).not.toContain(forbidden);
    }
    // Anti-vacuity: the loop above would also pass on an empty body.
    expect(raw.length).toBeGreaterThan(20);

    await db.destroy();
  });
});

// The states between "migrated" and "the query throws". They are the ones the
// endpoint used to answer `ok` for, because the probe fetched a count and threw
// it away — which made it a `select 1` against a differently-named table, and a
// table that merely EXISTS proves nothing about whether the schema was applied.
//
// Both cases below are reachable in production and neither is exotic: the
// bookkeeping table is created by the migrator BEFORE the first migration runs,
// so a migration that fails on its first statement leaves exactly the first
// one; and a restore from a generation predating the first migration, or a
// truncated one, leaves the second. The external monitor of D2-21 keyword-
// matches `"status":"ok"`, so these are precisely the states that must not read
// green.
describe('GET /api/health com kysely_migration vazia', () => {
  it('recusa dizer ok quando a tabela existe sem nenhuma linha', async () => {
    const { sqlite, db } = openDb(':memory:');
    // Built by hand, in the shape kysely 0.29 builds it: the migrator creates
    // this table first and records a row per migration, so "table present, zero
    // rows" is the bookkeeping of a migration that never completed.
    sqlite
      .prepare(
        'create table kysely_migration (' +
          'name varchar(255) primary key, timestamp varchar(255) not null)',
      )
      .run();

    const res = await createApp({ sqlite, release: RELEASE }).request('/api/health');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'degraded', db: false, release: RELEASE });

    sqlite.close();
    await db.destroy();
  });

  it('volta a degraded se as linhas somem de um banco já migrado', async () => {
    // The truncated-restore case, and the harsher of the two: this database WAS
    // migrated, so the table, the schema and every column are present and
    // correct. Only the bookkeeping rows are gone, which is what a restore from
    // the wrong generation looks like — the server would answer ok over a
    // database whose migration state it can no longer vouch for.
    const { app, db, sqlite } = await healthyApp();
    expect((await app.request('/api/health')).status).toBe(200);

    sqlite.prepare('delete from kysely_migration').run();

    const res = await app.request('/api/health');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'degraded', db: false, release: RELEASE });

    await db.destroy();
  });
});

describe('GET /api/health com o banco sem migração', () => {
  it('responde 503 com status degraded', async () => {
    // Opened but never migrated: the file is fine, the schema is not. This is
    // the state a process would be in if it somehow served before migrating —
    // exactly what index.ts refuses to do — and the state a restore from a
    // truncated backup would produce.
    const { sqlite, db } = openDb(':memory:');
    const app = createApp({ sqlite, release: RELEASE });

    const res = await app.request('/api/health');
    expect(res.status).toBe(503);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ status: 'degraded', db: false, release: RELEASE });
    // Degraded is still not an excuse to say why: the failure path is exactly
    // where a driver error string would otherwise be tempting to include.
    expect(Object.keys(body)).toHaveLength(3);
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    await db.destroy();
  });
});
