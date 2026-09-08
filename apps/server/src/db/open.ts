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

/**
 * How one ICE negotiation ended, as db/migrations.ts `002_ice_outcome` stores
 * it. The five nullable columns mirror `IceOutcome` in @dg2/protocol field for
 * field: a connection that failed found no candidate pair, so it knows neither
 * the pair, nor its transport, nor a round trip.
 *
 * `room_code`, `slot` and `account_id` are the three the SERVER fills in from
 * the socket rather than from the message body (T-3-24). They are typed the
 * same as any other column, so nothing here enforces that — signaling/outcome.ts
 * is where it is enforced, and this comment is what points at it.
 *
 * There is no field for a player's public network endpoint, and its absence is
 * a decision rather than an omission; the migration says why.
 */
export interface IceOutcomeTable {
  id: string;
  room_code: string;
  slot: string;
  account_id: string;
  route: string;
  local_candidate: string | null;
  remote_candidate: string | null;
  protocol: string | null;
  relay_protocol: string | null;
  rtt_ms: number | null;
  result: string;
  at: number;
}

/**
 * Every table this server knows about. Two, and the second one arrived with a
 * reason worth writing down next to it.
 *
 * `ice_outcome` is here because the relay rate has to be MEASURED (D3-14): the
 * alternative is a published average from somebody else's user base, and the
 * bandwidth this deployment budgets for coturn would be sized against it.
 *
 * A ROOM IS STILL NEVER PERSISTED, and that is the line this table does not
 * cross (C-12). A room is ephemeral state that dies with the process on
 * purpose: persisted, it would come back from a restart naming peers that no
 * longer exist, holding slots nobody can claim, in a lobby nobody can start.
 * What reaches SQLite is the OUTCOME of a connection — a fact that stays true
 * after everyone involved has gone home.
 */
export interface Schema {
  gold_entry: GoldEntryTable;
  ice_outcome: IceOutcomeTable;
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
