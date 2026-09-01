// open.ts — the one place a SQLite file becomes a handle, so the pragmas are
// set in exactly one place and cannot drift between the migrator and the app.
import SQLite from 'better-sqlite3';
import type { Database as SqliteHandle } from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';

/**
 * The `gold_entry` row as SQLite stores it. This mirrors `LedgerEvent` in
 * src/app/ledger.ts, which is the canonical shape — the client mints these,
 * the server only ever receives them. The names differ from the sketch in
 * 02-RESEARCH.md on purpose; see db/migrations.ts for the reconciliation.
 *
 * `confirmed` is `number | null` and not `number | undefined`: SQLite has NULL,
 * TypeScript object shapes have absence, and Kysely reads back what the driver
 * returns. Whatever maps this row to `LedgerEvent` (phase 6, not this one) is
 * where the NULL becomes an absent key.
 */
export interface GoldEntryTable {
  id: string;
  account_id: string;
  amount: number;
  reason: string;
  at: number;
  confirmed: number | null;
}

/** Every table this server knows about. Exactly one, deliberately (D2-01). */
export interface Schema {
  gold_entry: GoldEntryTable;
}

/** A database, in the two shapes the process needs it. */
export interface OpenedDb {
  /**
   * The raw better-sqlite3 handle. Kept because `pragma()` and the cheap
   * synchronous probe in health.ts have no Kysely equivalent worth the
   * ceremony, and because closing is its job.
   */
  sqlite: SqliteHandle;
  /** The typed query builder, and what the Migrator runs against. */
  db: Kysely<Schema>;
}

/**
 * Opens `path` and applies the four pragmas this deployment depends on. It does
 * NOT migrate: migrating is a separate, awaited step in index.ts that has to be
 * able to fail the process before it serves (D2-07).
 *
 * Pass ':memory:' in tests — same code path, no file, no cleanup.
 */
export function openDb(path: string): OpenedDb {
  const sqlite = new SQLite(path);

  // REQUIRED by Litestream, not merely nice to have: Litestream replicates by
  // reading the write-ahead log, so a database in the default rollback-journal
  // mode is a database with no continuous backup at all (D2-17).
  //
  // The answer is CHECKED and not discarded, because `journal_mode` is one of
  // the handful of pragmas SQLite ANSWERS rather than obeys: where WAL is
  // unavailable — a filesystem without shared-memory support, which is some
  // network mounts and some container overlays — it keeps the mode it had,
  // reports that mode, and raises nothing. Discarding the answer makes this
  // line indistinguishable from not having written it, and the failure has the
  // same shape and the same ending as the plural-`replicas` trap in
  // ops/litestream.yml: a backup that was never running, found out on the one
  // day it is needed.
  const journalMode = String(sqlite.pragma('journal_mode = WAL', { simple: true })).toLowerCase();
  // ':memory:' is excluded by its exact name, and NOT by better-sqlite3's
  // `sqlite.memory` flag, which would read more elegantly and be wrong. That
  // flag is also true for the anonymous temporary database of `openDb('')` —
  // which answers `delete`, not `memory` (measured; see the premise test in
  // tests/server-migrate.test.ts) and is the single case that most needs
  // refusing, since it is a database whose contents vanish when the handle
  // closes. Excluding by flag would excuse exactly the database this check
  // exists to catch.
  if (path !== ':memory:' && journalMode !== 'wal') {
    // Closed before throwing: the handle is already open at this point, and a
    // process that is about to exit non-zero should not also leak a lock on the
    // file the operator is about to go and look at.
    sqlite.close();
    // The path is deliberately NOT in the message. It is the same rule the
    // health endpoint follows: the mode is what the operator can act on, and
    // the path is topology (D2-15).
    throw new Error(
      `/db/journal_mode: WAL recusado (ficou em "${journalMode}") — ` +
        'sem WAL não há replicação contínua (D2-17)',
    );
  }
  // With WAL, NORMAL means fsync at checkpoint rather than at every commit. The
  // window it opens is losing the last transactions on a power cut, and the
  // ledger tolerates that by construction: entries carry client-minted ULIDs,
  // so the client simply re-sends and UNIQUE(id) makes the replay a no-op.
  sqlite.pragma('synchronous = NORMAL');
  // Off by default in SQLite, every connection, forever. The schema has no
  // foreign key yet — the one that matters points at Better Auth's `user`
  // table and cannot be drawn before phase 6 — so this is here to be already
  // true on the day it does, instead of being remembered then.
  sqlite.pragma('foreign_keys = ON');
  // Rather than failing instantly with SQLITE_BUSY, wait. One process writes
  // today, but Litestream reads concurrently and a checkpoint can hold the
  // file briefly.
  sqlite.pragma('busy_timeout = 5000');

  const db = new Kysely<Schema>({ dialect: new SqliteDialect({ database: sqlite }) });
  return { sqlite, db };
}
