// server-migrate.test.ts — the schema of apps/server, proved against a real
// SQLite engine rather than against the source of the migration.
//
// Almost every test here opens ':memory:' through the same openDb() the process
// uses, so the pragmas and the dialect wiring are the ones production gets;
// only the path differs.
//
// The exception is the WAL block at the bottom, which is the one property that
// ':memory:' CANNOT prove: an in-memory database answers `memory` to
// `journal_mode = WAL` and always will, so asserting WAL against it would pass
// on a build that never asked for WAL at all. That block is why node:fs, node:os
// and node:path appear in a file whose header used to boast of not needing them
// — and it costs nothing, since apps/server/tsconfig.json is the one program in
// the repository with `types: ["node"]` and this file is already in it.
//
// The load-bearing assertion is idempotency. migrateToLatest() runs on EVERY
// start of dg2.service (D2-07), including the restarts systemd performs by
// itself, so "applying the same migration twice is a no-op" is not a nicety —
// it is the property that lets a deploy, a rollback and a reboot all be safe.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// The raw driver, imported ONLY by the WAL block, and only to establish that
// the refusal it tests for is a real SQLite behaviour rather than a premise.
import SQLite from 'better-sqlite3';
// 'kysely/migration', not 'kysely': 0.29 moved the migrator behind a subpath
// export and the root name is now a deprecated sentinel. See db/migrations.ts.
import { Migrator } from 'kysely/migration';
import { openDb } from '../apps/server/src/db/open';
import { provider } from '../apps/server/src/db/migrations';

/** What `PRAGMA table_info(<table>)` gives back, in the columns we read. */
interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

/**
 * The six columns of gold_entry, sorted. Mirrors `LedgerEvent` in
 * src/app/ledger.ts:41-53. Changing this list means changing the client's
 * ledger shape, which is exactly the kind of change that should not happen
 * quietly in a migration nobody re-read.
 */
const COLUMNS = ['account_id', 'amount', 'at', 'confirmed', 'id', 'reason'];

/** A migrated in-memory database, plus the handles to inspect and close it. */
function migrated(): ReturnType<typeof openDb> & { migrator: Migrator } {
  const opened = openDb(':memory:');
  return { ...opened, migrator: new Migrator({ db: opened.db, provider }) };
}

describe('migração do servidor (D2-01, D2-07)', () => {
  it('aplica exatamente uma migração, sem erro', async () => {
    const { db, migrator } = migrated();
    const { error, results } = await migrator.migrateToLatest();

    expect(error).toBeUndefined();
    // Length AND content: a provider that returned nothing would produce an
    // empty results array and no error, which is indistinguishable from
    // success unless the count is asserted.
    expect(results).toHaveLength(1);
    expect(results?.[0]?.migrationName).toBe('001_gold_entry');
    expect(results?.[0]?.direction).toBe('Up');
    expect(results?.[0]?.status).toBe('Success');

    await db.destroy();
  });

  it('rodar a migração de novo no mesmo banco não aplica nada', async () => {
    const { db, sqlite, migrator } = migrated();
    await migrator.migrateToLatest();

    // A row written between the two runs. If the second migrateToLatest() did
    // anything at all — re-created the table, re-ran the DDL — this row is the
    // thing that would disappear, and "no-op" would be a claim about the
    // results array rather than about the data.
    await db
      .insertInto('gold_entry')
      .values({
        id: '01JQ000000000000000000000R',
        account_id: 'acc-restart',
        amount: 10,
        reason: 'run',
        at: 1_756_000_000_002,
        confirmed: null,
      })
      .execute();

    // The second call is the one that matters: systemd restarts the unit for
    // reasons that have nothing to do with a deploy, and every one of those
    // restarts lands here.
    const { error, results } = await migrator.migrateToLatest();
    expect(error).toBeUndefined();
    expect(results).toEqual([]);

    const rows = await db.selectFrom('gold_entry').selectAll().execute();
    expect(rows).toHaveLength(1);
    // And exactly one migration is still recorded, not two.
    const applied = sqlite.prepare('select name from kysely_migration').all() as { name: string }[];
    expect(applied.map(r => r.name)).toEqual(['001_gold_entry']);

    await db.destroy();
  });

  it('a tabela kysely_migration existe depois da primeira migração', async () => {
    const { db, sqlite, migrator } = migrated();

    const before = sqlite
      .prepare("select name from sqlite_master where type = 'table' and name = 'kysely_migration'")
      .all() as { name: string }[];
    // Refusal half: the bookkeeping table must NOT exist beforehand, or its
    // presence afterwards would prove nothing about the migrator.
    expect(before).toHaveLength(0);

    await migrator.migrateToLatest();

    const after = sqlite
      .prepare("select name from sqlite_master where type = 'table' and name = 'kysely_migration'")
      .all() as { name: string }[];
    expect(after).toHaveLength(1);

    await db.destroy();
  });
});

describe('esquema de gold_entry', () => {
  it('tem exatamente as seis colunas do LedgerEvent do cliente', async () => {
    const { db, sqlite, migrator } = migrated();
    await migrator.migrateToLatest();

    const info = sqlite.prepare('PRAGMA table_info(gold_entry)').all() as ColumnInfo[];
    // Set equality via sorted names, plus an explicit length: a seventh column
    // has to fail, not be tolerated as "contains all six". A column the client
    // never sends is a column that either breaks INSERT (if notNull) or is
    // permanently empty — both are defects, and both are invisible without
    // this.
    expect(info).toHaveLength(COLUMNS.length);
    expect(info.map(c => c.name).sort()).toEqual(COLUMNS);

    await db.destroy();
  });

  it('confirmed é anulável e as outras cinco não são', async () => {
    const { db, sqlite, migrator } = migrated();
    await migrator.migrateToLatest();

    const info = sqlite.prepare('PRAGMA table_info(gold_entry)').all() as ColumnInfo[];
    const nullable = info.filter(c => c.notnull === 0).map(c => c.name).sort();

    // `confirmed` is the server's acknowledgement watermark: absent means "not
    // confirmed yet". Making it notNull would erase the only state it carries.
    // It is the ONLY nullable column, and `id` in particular is not: SQLite
    // lets a TEXT PRIMARY KEY hold NULL for historical compatibility, so the
    // PRIMARY KEY alone does not buy the dedup of D-27. See the refusal test
    // below for what that costs.
    expect(nullable).toEqual(['confirmed']);
    expect(info.find(c => c.name === 'id')?.pk).toBe(1);
    expect(info.find(c => c.name === 'id')?.notnull).toBe(1);

    await db.destroy();
  });

  it('recusa id nulo — NULL não colide num PRIMARY KEY de texto', async () => {
    const { db, sqlite, migrator } = migrated();
    await migrator.migrateToLatest();

    // Raw SQL and not Kysely, deliberately. open.ts declares `id: string`, so
    // the query builder would refuse this at the compiler and the test would
    // measure TypeScript instead of the schema — which is precisely the gap:
    // the type asserts an invariant that only the DDL can enforce, and any row
    // arriving through raw SQL or a future bulk path is outside the type.
    const insertNull = (): unknown =>
      sqlite
        .prepare(
          'insert into gold_entry (id, account_id, amount, reason, at) ' +
            "values (null, 'acc-nulo', 500, 'run', 1756000000003)",
        )
        .run();

    // Without `notNull`, this line inserts. Twice, it inserts twice — because
    // NULLs do not collide under the implied unique index — and the balance,
    // which D-28 defines as the sum of the column, is permanently wrong by the
    // amount with nothing to distinguish the duplicate from a real entry.
    expect(insertNull).toThrow(/NOT NULL/i);

    // The refusal left the table empty: an INSERT that failed halfway would be
    // worse than one that succeeded.
    const rows = sqlite.prepare('select count(*) as n from gold_entry').get() as { n: number };
    expect(rows.n).toBe(0);

    await db.destroy();
  });

  it('duas linhas com o mesmo id violam a unicidade', async () => {
    const { db, migrator } = migrated();
    await migrator.migrateToLatest();

    const entry = {
      id: '01JQ0000000000000000000000',
      account_id: 'acc-1',
      amount: 120,
      reason: 'run',
      at: 1_756_000_000_000,
      confirmed: null,
    };

    await db.insertInto('gold_entry').values(entry).execute();
    // The same id twice is what "syncing twice" looks like from the server's
    // side, and it has to be refused rather than duplicated — that refusal is
    // the whole reason the ULID is minted by the client (D-27).
    await expect(
      db.insertInto('gold_entry').values({ ...entry, amount: 999 }).execute(),
    ).rejects.toThrow(/UNIQUE/i);

    // And the refused write left nothing behind.
    const rows = await db.selectFrom('gold_entry').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe(120);

    await db.destroy();
  });

  it('aceita amount negativo — gasto é evento, não caso especial', async () => {
    const { db, migrator } = migrated();
    await migrator.migrateToLatest();

    await db
      .insertInto('gold_entry')
      .values({
        id: '01JQ0000000000000000000001',
        account_id: 'acc-1',
        amount: -75,
        reason: 'forge',
        at: 1_756_000_000_001,
        confirmed: null,
      })
      .execute();

    const rows = await db.selectFrom('gold_entry').selectAll().execute();
    expect(rows[0]?.amount).toBe(-75);
    // The balance is the sum and nothing else (D-28), so a spend has to survive
    // the round trip with its sign — an unsigned column would have stored 75.
    expect(rows[0]?.confirmed).toBeNull();

    await db.destroy();
  });
});

// The pragma that is not a preference. Litestream replicates by tailing the
// write-ahead log, so a database that is not in WAL is a database with NO
// continuous backup — and `PRAGMA journal_mode` is one of the handful SQLite
// ANSWERS rather than obeys: where WAL is unavailable it keeps the mode it had,
// reports it, and raises nothing. That silence is the same shape as the
// plural-`replicas` trap ops/litestream.yml warns about, and it has the same
// ending: a backup that was never running, discovered on the day it is needed
// (D2-17).
describe('journal_mode de openDb (D2-17)', () => {
  it('um banco em arquivo fica mesmo em WAL', async () => {
    // The production shape, and the ONLY case that can prove WAL was actually
    // requested: ':memory:' answers `memory` whether or not the pragma is
    // there at all, so a suite made only of in-memory databases would go on
    // passing if the WAL line were deleted tomorrow.
    const dir = mkdtempSync(join(tmpdir(), 'dg2-wal-'));
    try {
      const { sqlite, db } = openDb(join(dir, 'dg2.db'));
      expect(String(sqlite.pragma('journal_mode', { simple: true }))).toBe('wal');

      // sqlite.close() and NOT `await db.destroy()`, which is what every other
      // test in this file uses. Measured while writing this one: Kysely's
      // destroy() opens with `if (!this.#initPromise) return` (kysely 0.29,
      // dist/driver/runtime-driver.js:96-98), so on a Kysely instance that
      // never ran a query it closes NOTHING and the better-sqlite3 handle stays
      // open. This test reads a pragma off the raw handle and never touches the
      // query builder, which is exactly that case — the symptom was rmSync
      // failing with EPERM on a directory whose database was still open.
      sqlite.close();
      // Idempotent, and kept so the two closing styles in this file stay
      // interchangeable if the test later grows a query.
      await db.destroy();
    } finally {
      // WAL leaves -wal and -shm beside the file; SQLite removes them on the
      // clean close above, and `force` covers the run where it did not.
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('o SQLite realmente recusa WAL num banco temporário anônimo', () => {
    // Premise check, not a fix check. Everything below asserts that openDb
    // REFUSES a database whose WAL request was denied; this is the measurement
    // that such a database exists and is reachable in-process, so the refusal
    // test is not merely asserting that a function throws on an input chosen
    // to make it throw.
    const raw = new SQLite('');
    try {
      const mode = String(raw.pragma('journal_mode = WAL', { simple: true }));
      // Not 'wal', and not 'memory' either: an anonymous temporary database
      // reports `delete`, the default rollback journal. It is exactly the
      // healthy-looking, unreplicated database of the finding.
      expect(mode).toBe('delete');
    } finally {
      raw.close();
    }
  });

  it('openDb recusa o banco cujo WAL foi negado', () => {
    // `openDb('')` is not a hypothetical: it is what the pre-CR-02 code did
    // with `DG2_DB=` in /etc/dg2/env, and env.ts refuses that string one layer
    // up. This is the second lock on the same door, at the layer that knows
    // WHY WAL matters — and it is the layer any future caller reaches first.
    expect(() => openDb('')).toThrow(/WAL/);
    expect(() => openDb('')).toThrow(/D2-17/);
  });

  it("':memory:' continua aceito, e é por isso que a exclusão existe", () => {
    // The excluded case, asserted rather than assumed: an in-memory database
    // legitimately answers `memory`, both server test files pass ':memory:',
    // and a guard that refused it would fail this whole suite instead of the
    // deployment it is meant to protect.
    const { sqlite, db } = openDb(':memory:');
    expect(String(sqlite.pragma('journal_mode', { simple: true }))).toBe('memory');
    return db.destroy();
  });
});
