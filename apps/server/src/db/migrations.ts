// migrations.ts — a STATIC migration provider: a literal object, deliberately
// NOT the file-reading provider Kysely ships in 'kysely/migration'.
//
// This server is bundled to a single dist-server/server.mjs, which ops/Dockerfile.api
// COPYs into the image. A provider that loads migrations from disk would have to
// resolve a directory path at runtime, relative to a bundle whose location is an
// image layer — a path to get wrong in the one step that runs BEFORE the process
// accepts a request (D2-07). The argument was first written against a release
// directory reached through a symlink, which D2-24 replaced with "point at the
// previous image"; the bundle moved, the reasoning did not. Getting it wrong here does not degrade the
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
// version, ever. Rolling back is pointing the image tag at the previous sha and
// redeploying (D2-24) — seconds, and no network, because the previous image is
// already on disk. That rolls the CODE back while leaving the DATABASE exactly
// where the newer code left it. A destructive migration turns a seconds-long
// rollback into data that is simply gone. Additive-only is what makes the
// rollback path safe to actually use.
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
        //
        // `notNull` is NOT redundant next to `primaryKey`, and leaving it off
        // is what would void the sentence above. SQLite permits NULL in any
        // PRIMARY KEY that is not INTEGER — a documented bug kept for backward
        // compatibility — and NULLs never collide under the implied unique
        // index. Without this word, two syncs of an entry whose id arrived
        // NULL insert twice, and the balance D-28 defines as the sum of the
        // column is permanently wrong by the amount, with nothing to tell the
        // duplicate from a legitimate second entry. Kysely's own bookkeeping
        // table spells it the same way, for the same reason.
        //
        // Corrected in the INITIAL migration rather than added by a second
        // one, and the choice is only available because nothing has shipped:
        // there is no remote, no box (ops/ has never executed) and no database
        // outside `:memory:` in the tests. SQLite cannot ALTER COLUMN to add
        // NOT NULL, so after ship the fix would be a table rebuild — exactly
        // the destructive shape D2-07 outlaws. Editing in place is safe here
        // because kysely_migration records only `name` and `timestamp`, with
        // no checksum: an already-migrated development database does not
        // error, it simply does not re-apply. Drop and re-migrate it.
        .addColumn('id', 'text', c => c.primaryKey().notNull())
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

  /**
   * How each ICE negotiation actually ended (SALA-05, D3-14).
   *
   * The relay rate of this group of friends is, today, somebody else's number:
   * 10-20% per link from published WebRTC surveys, which composes to 27-49% for
   * a room of four. This table exists to replace an estimate with a
   * measurement, so that "how many of our rooms needed relay" is a SELECT
   * rather than a guess — and so the coturn bandwidth budget is sized against
   * this deployment rather than against an average of everyone else's.
   *
   * THE FAILED ROW IS WRITTEN TOO, and that is the half that makes the number
   * mean anything. A table fed only by successful connections measures the
   * successes and nothing else, and the rate it reports is wrong upwards
   * forever, with no symptom: every row in it is true.
   *
   * Additive, per D2-07. `001_gold_entry` is untouched, so reverting to an image
   * that predates this file leaves a database with one extra table the older code
   * never looks at.
   */
  '002_ice_outcome': {
    async up(db: Kysely<unknown>): Promise<void> {
      await db.schema
        .createTable('ice_outcome')
        // Client-generated ULID, and the deduplication mechanism exactly as in
        // gold_entry: the recorder inserts with OR IGNORE, so a peer that
        // reports the same connection twice — a retry, a reconnect, a doubled
        // event handler — leaves one row instead of doubling its own weight in
        // every query the table serves.
        //
        // `notNull` is explicit for the same reason spelled out above: SQLite
        // permits NULL in any PRIMARY KEY that is not INTEGER, a documented bug
        // kept for backward compatibility, and NULLs never collide under the
        // implied unique index. Without this word the OR IGNORE ignores nothing
        // and the id stops deduplicating anything.
        .addColumn('id', 'text', c => c.primaryKey().notNull())
        // Resolved by the SERVER from the socket, never read from the body the
        // peer sent (T-3-24). A client that chose this value could file its
        // reports against somebody else's room and poison telemetry it has no
        // part in.
        .addColumn('room_code', 'text', c => c.notNull())
        // p0..p3. Server-resolved for the same reason as the line above.
        .addColumn('slot', 'text', c => c.notNull())
        // The unclaimed local ULID of ADR 0002 — the ONLY personal identifier
        // D3-14 allows into this table, and it is an opaque value the client
        // minted for itself. Phase 6 turns it into a real account by claim, and
        // the rows written before that keep pointing at the same string.
        .addColumn('account_id', 'text', c => c.notNull())
        // One of ICE_ROUTE (unknown, direct, relay), stored as its text and not
        // as an index into the frozen table: an integer here would make every
        // row depend on the ORDER of a list that append-only rules allow to
        // grow, and re-reading old rows would silently mean something else.
        // Validated against the table before the INSERT, in outcome.ts.
        .addColumn('route', 'text', c => c.notNull())
        // The two candidate types of the pair that won, from ICE_CANDIDATE_TYPE.
        //
        // WHAT IS DELIBERATELY ABSENT, AND WHY IT IS ABSENT RATHER THAN UNUSED:
        // there is no column for either peer's public network endpoint. D3-14
        // caps this telemetry at the local ULID, and an endpoint identifies a
        // person by any reading (T-3-09). The candidate TYPE plus the transport
        // below answer the entire question this table was created to ask — how
        // often is relay needed — so the identifying fields buy nothing that
        // would justify storing them. `IceOutcome` in @dg2/protocol does not
        // declare them either, so a caller that tried to send one would not
        // compile; this is the second lock, at the layer that would store it.
        //
        // NULLABLE, and that is the design: a connection that failed never
        // found a pair, so it knows neither. A notNull default would turn "we
        // never got there" into a value that reads as though it were measured.
        .addColumn('local_candidate', 'text')
        .addColumn('remote_candidate', 'text')
        // udp | tcp — the transport of the winning pair. Nullable for the same
        // reason as the pair itself.
        .addColumn('protocol', 'text')
        // udp | tcp | tls — how the client reached the relay. NULL whenever the
        // route was not relay, which is most rows and is the point.
        .addColumn('relay_protocol', 'text')
        // Round trip of the pair, in milliseconds, as the statistics reported it
        // at the moment the connection settled. NOT the ping on screen (D3-13),
        // which is a game message on the peer-to-peer channel and never reaches
        // this process.
        .addColumn('rtt_ms', 'integer')
        // connected | failed. The second value is what keeps the rate honest.
        .addColumn('result', 'text', c => c.notNull())
        // Epoch milliseconds, stamped by the SERVER. A timestamp chosen by the
        // reporter would let one peer decide where its rows land in the index
        // every other row is read through.
        .addColumn('at', 'integer', c => c.notNull())
        .execute();

      // The one read this table exists for: "what was the relay rate over the
      // last month" is a range scan on time. Without this index that question
      // is a full scan the operator writes a script around instead of asking.
      await db.schema
        .createIndex('ice_outcome_at')
        .on('ice_outcome')
        .columns(['at'])
        .execute();
    },

    /** Development only, on exactly the terms `001_gold_entry` states above. */
    async down(db: Kysely<unknown>): Promise<void> {
      await db.schema.dropTable('ice_outcome').execute();
    },
  },
};

/** The provider index.ts hands to the Kysely Migrator. */
export const provider: MigrationProvider = {
  getMigrations(): Promise<Record<string, Migration>> {
    return Promise.resolve(migrations);
  },
};
