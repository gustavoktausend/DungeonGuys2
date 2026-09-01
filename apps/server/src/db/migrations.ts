// migrations.ts — a STATIC migration provider: a literal object, deliberately
// NOT the file-reading provider Kysely ships in 'kysely/migration'.
//
// This server is bundled to a single dist-server/server.mjs and copied to
// /srv/dg2/server-releases/<sha>/. A provider that loads migrations from disk
// would have to resolve a directory path at runtime, relative to a bundle
// whose location is reached through a symlink that ops/deploy.sh swaps — three
// ways to get a path wrong in the one step that runs BEFORE the process
// accepts a request (D2-07). Getting it wrong here does not degrade the
// service, it stops the service from starting. A literal object cannot be
// misplaced, and it is bundled by definition.
//
// The migration symbols come from 'kysely/migration', NOT from 'kysely'. The
// snippet in 02-RESEARCH.md:1009 imports them from the root barrel, which was
// right for an older release: kysely 0.29 moved them behind a subpath export
// and left the root names in place as `KyselyTypeError` sentinels, so importing
// from 'kysely' fails at the compiler with a message pointing here — and, in
// the case of `Migrator`, would be plain `undefined` at runtime.
import type { Kysely } from 'kysely';
import type { Migration, MigrationProvider } from 'kysely/migration';

// D2-07: migrations are ALWAYS additive. No DROP and no rename inside a
// version, ever. ops/rollback.sh moves the `current` symlink back to a previous
// release in seconds — and that rolls the CODE back while leaving the DATABASE
// exactly where the newer code left it. A destructive migration turns a
// 10-second rollback into data that is simply gone. Additive-only is what makes
// the rollback path safe to actually use.
const migrations: Record<string, Migration> = {
  /**
   * The soul gold ledger, as docs/adr/0010-soul-gold-ledger-append-only.md
   * defines it.
   *
   * The column names come from `LedgerEvent` in src/app/ledger.ts:41-53, which
   * is the canonical source: the client mints these rows and the server only
   * receives them, so a name the client does not produce is a column nothing
   * can ever fill. The sketch in 02-RESEARCH.md:1009 predates that file and
   * disagrees with it in three places — it says `delta` where the client says
   * `amount`, `created_at` where the client says `at`, and it adds a not-null
   * per-device identifier column that the client has no concept of and never
   * sends — which would make every single INSERT fail, so that column is
   * absent here on purpose rather than by oversight. The sketch also omits the
   * `confirmed` watermark that D2-02 asks for by name. The client wins all four.
   *
   * Nothing in phase 2 writes to this table. It exists so that INFRA-04 has
   * something to restore: a backup drill against an empty file proves nothing,
   * and a schema is the smallest thing that makes "restore and compare" a real
   * exercise. The ledger keeps living in localStorage (D-29) until phase 6.
   */
  '001_gold_entry': {
    async up(db: Kysely<unknown>): Promise<void> {
      await db.schema
        .createTable('gold_entry')
        // Client-generated ULID. PRIMARY KEY is the UNIQUE(id) of D-27: it is
        // what makes syncing the same entry twice a no-op instead of duplicated
        // money, so the id is the deduplication mechanism and not just a label.
        .addColumn('id', 'text', c => c.primaryKey())
        .addColumn('account_id', 'text', c => c.notNull())
        // SIGNED. A spend is a negative entry with its own id (D-28), not an
        // UPDATE against a running total — that is what makes the balance a sum
        // and gives the audit trail a rollback would otherwise not have.
        .addColumn('amount', 'integer', c => c.notNull())
        // One of: run, mission, season, forge, compaction. Deliberately not a
        // CHECK constraint: the vocabulary is the client's (LedgerReason), and
        // pinning it in DDL would mean a migration every time a reason is
        // added, in a table this phase does not even write to yet.
        .addColumn('reason', 'text', c => c.notNull())
        // Epoch milliseconds. Ordering is carried by the ULID, not by this.
        .addColumn('at', 'integer', c => c.notNull())
        // NULLABLE, and that is the whole design: this is the server's
        // confirmation watermark, so its absence is the meaningful state —
        // "the client has this entry and the server has not acknowledged it".
        // A notNull default of 0 would erase the distinction.
        .addColumn('confirmed', 'integer')
        .execute();

      // The read this table will actually serve: one account's entries in time
      // order, for the balance and for the sync watermark.
      await db.schema
        .createIndex('gold_entry_account')
        .on('gold_entry')
        .columns(['account_id', 'at'])
        .execute();
    },

    /**
     * `down` exists for local development only — dropping a table and starting
     * over while the schema is still being designed. Production NEVER runs it:
     * index.ts only ever calls migrateToLatest(), and the additive rule above
     * is what makes the symlink rollback safe. If you find yourself wanting to
     * run this against /var/lib/dg2/dg2.db, what you want is a restore from
     * Litestream, not a down migration.
     */
    async down(db: Kysely<unknown>): Promise<void> {
      await db.schema.dropTable('gold_entry').execute();
    },
  },
};

/** The provider index.ts hands to the Kysely Migrator. */
export const provider: MigrationProvider = {
  getMigrations(): Promise<Record<string, Migration>> {
    return Promise.resolve(migrations);
  },
};
