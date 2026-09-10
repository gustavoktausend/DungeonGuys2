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
// start of this process (D2-07), and since every deploy recreates the container
// and `restart: unless-stopped` restarts it by itself, "applying the same
// migration twice is a no-op" is not a nicety — it is the property that lets a
// deploy, a rollback and a reboot all be safe.
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
import type { IceOutcome } from '@dg2/protocol';
import { openDb } from '../apps/server/src/db/open';
import { provider } from '../apps/server/src/db/migrations';
import {
  createOutcomeRecorder,
  MAX_OUTCOMES_PER_PEER,
  type OutcomeSource,
} from '../apps/server/src/signaling/outcome';

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

/**
 * The twelve columns of ice_outcome, sorted. Sibling of COLUMNS above, and it
 * carries one assertion the list itself cannot say out loud: there is no column
 * for a player's network endpoint. D3-14 limits this telemetry to the local
 * ULID, and `IceOutcome` in @dg2/protocol does not even declare the fields —
 * this list is the second lock, at the layer that would actually store them.
 */
const ICE_COLUMNS = [
  'account_id',
  'at',
  'id',
  'local_candidate',
  'protocol',
  'relay_protocol',
  'remote_candidate',
  'result',
  'room_code',
  'route',
  'rtt_ms',
  'slot',
];

/** A well-formed report, as the wire spells it. Each test perturbs one field. */
const OUTCOME: IceOutcome = {
  kind: 'iceOutcome',
  id: '01JQ0000000000000000000ICE',
  // Ignored by the recorder on purpose: the server resolves both from the
  // socket (T-3-24). They are here because the wire carries them.
  code: 'ZZZZZZ',
  slot: 'p3',
  route: 'relay',
  localCandidate: 'relay',
  remoteCandidate: 'srflx',
  protocol: 'udp',
  relayProtocol: 'tls',
  rttMs: 47,
  result: 'connected',
};

/** Who the SERVER says sent it, resolved from the socket and never from the body. */
const SOURCE: OutcomeSource = {
  peerId: 'peer-a',
  code: 'ABCDEF',
  slot: 'p1',
  accountId: '01JQ00000000000000000ACCT',
};

/** A migrated in-memory database, plus the handles to inspect and close it. */
function migrated(): ReturnType<typeof openDb> & { migrator: Migrator } {
  const opened = openDb(':memory:');
  return { ...opened, migrator: new Migrator({ db: opened.db, provider }) };
}

describe('migração do servidor (D2-01, D2-07)', () => {
  it('aplica exatamente duas migrações, na ordem, sem erro', async () => {
    const { db, migrator } = migrated();
    const { error, results } = await migrator.migrateToLatest();

    expect(error).toBeUndefined();
    // Length AND content: a provider that returned nothing would produce an
    // empty results array and no error, which is indistinguishable from
    // success unless the count is asserted.
    expect(results).toHaveLength(2);
    // ORDER, not merely membership. Kysely runs migrations in the sort order of
    // their names, so the numeric prefix is the mechanism and not decoration —
    // and D2-07's additive rule only means anything if the sequence is fixed.
    expect(results?.map(r => r.migrationName)).toEqual(['001_gold_entry', '002_ice_outcome']);
    expect(results?.every(r => r.direction === 'Up')).toBe(true);
    expect(results?.every(r => r.status === 'Success')).toBe(true);

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
    // And exactly two migrations are still recorded, not four.
    const applied = sqlite.prepare('select name from kysely_migration').all() as { name: string }[];
    expect(applied.map(r => r.name).sort()).toEqual(['001_gold_entry', '002_ice_outcome']);

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

describe('esquema de ice_outcome (SALA-05, D3-14)', () => {
  it('tem exatamente as doze colunas da telemetria', async () => {
    const { db, sqlite, migrator } = migrated();
    await migrator.migrateToLatest();

    const info = sqlite.prepare('PRAGMA table_info(ice_outcome)').all() as ColumnInfo[];
    expect(info).toHaveLength(ICE_COLUMNS.length);
    expect(info.map(c => c.name).sort()).toEqual(ICE_COLUMNS);

    await db.destroy();
  });

  it('nenhuma coluna guarda o endpoint de rede de um jogador', async () => {
    const { db, sqlite, migrator } = migrated();
    await migrator.migrateToLatest();

    const info = sqlite.prepare('PRAGMA table_info(ice_outcome)').all() as ColumnInfo[];
    const names = info.map(c => c.name);
    // The assertion above already pins the set, so this one is redundant by
    // construction — and it is here anyway because it is the one that says WHY
    // out loud. D3-14 caps this table at the local ULID; a public endpoint is
    // personal data by any reading, and the day somebody widens ICE_COLUMNS to
    // make a new column pass, this line is what refuses (T-3-09).
    for (const forbidden of ['address', 'port', 'ip', 'endpoint', 'candidate_address']) {
      expect(names, `${forbidden} não pode existir nesta tabela`).not.toContain(forbidden);
    }

    await db.destroy();
  });

  it('id é PK e notNull; as cinco opcionais do protocolo são anuláveis', async () => {
    const { db, sqlite, migrator } = migrated();
    await migrator.migrateToLatest();

    const info = sqlite.prepare('PRAGMA table_info(ice_outcome)').all() as ColumnInfo[];
    const nullable = info.filter(c => c.notnull === 0).map(c => c.name).sort();

    // Exactly the five that `IceOutcome` declares as `| null`. A failed
    // connection knows none of them, and a notNull default would turn "we never
    // found a pair" into a fact the table states as though it were measured.
    expect(nullable).toEqual([
      'local_candidate',
      'protocol',
      'relay_protocol',
      'remote_candidate',
      'rtt_ms',
    ]);
    // Same reasoning as gold_entry: SQLite lets a TEXT PRIMARY KEY hold NULL,
    // and NULLs never collide — so without `notNull` the id stops being the
    // deduplication mechanism the whole design leans on.
    expect(info.find(c => c.name === 'id')?.pk).toBe(1);
    expect(info.find(c => c.name === 'id')?.notnull).toBe(1);

    await db.destroy();
  });

  it('tem um índice em (at), que é o que faz a taxa de relay ser um SELECT', async () => {
    const { db, sqlite, migrator } = migrated();
    await migrator.migrateToLatest();

    const indexes = sqlite.prepare('PRAGMA index_list(ice_outcome)').all() as { name: string }[];
    const named = indexes.find(i => i.name === 'ice_outcome_at');
    expect(named, 'o índice em (at) não existe').toBeTruthy();

    const columns = sqlite.prepare("PRAGMA index_info('ice_outcome_at')").all() as {
      name: string;
    }[];
    // The column too, and not merely the name: an index named for `at` that
    // covered something else would answer "does the index exist" and none of
    // the questions the index was created for.
    expect(columns.map(c => c.name)).toEqual(['at']);

    await db.destroy();
  });
});

describe('createOutcomeRecorder (SALA-05, T-3-24, T-3-25, T-3-26)', () => {
  /** A migrated database plus a recorder over it, with the log captured. */
  async function recorder(): Promise<{
    opened: ReturnType<typeof migrated>;
    record: ReturnType<typeof createOutcomeRecorder>['record'];
    forget: ReturnType<typeof createOutcomeRecorder>['forget'];
    lines: { event: string; fields?: Record<string, unknown> }[];
  }> {
    const opened = migrated();
    await opened.migrator.migrateToLatest();
    const lines: { event: string; fields?: Record<string, unknown> }[] = [];
    const { record, forget } = createOutcomeRecorder({
      sqlite: opened.sqlite,
      log: (event, fields) => lines.push({ event, fields }),
      // Fixed, so the `at` assertion below is about the server stamping the row
      // and not about a clock that happened to tick.
      now: () => 1_756_000_000_123,
    });
    return { opened, record, forget, lines };
  }

  it('grava um desfecho connected e o lê de volta com todas as colunas', async () => {
    const { opened, record } = await recorder();

    expect(record(OUTCOME, SOURCE)).toBe(true);

    const rows = opened.sqlite.prepare('select * from ice_outcome').all() as Record<
      string,
      unknown
    >[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: OUTCOME.id,
      // FROM THE SERVER, not from the message: OUTCOME says 'ZZZZZZ'/'p3'.
      room_code: SOURCE.code,
      slot: SOURCE.slot,
      account_id: SOURCE.accountId,
      route: 'relay',
      local_candidate: 'relay',
      remote_candidate: 'srflx',
      protocol: 'udp',
      relay_protocol: 'tls',
      rtt_ms: 47,
      result: 'connected',
      // Server-stamped. A client-chosen timestamp would let one peer decide
      // where its rows land in the index every other row is read through.
      at: 1_756_000_000_123,
    });

    await opened.db.destroy();
  });

  it('grava um desfecho failed com route unknown — a metade que corrige a taxa', async () => {
    const { opened, record } = await recorder();

    // Without this row the table measures only the successes, and the relay
    // rate it answers is wrong upwards forever (D3-14). A failed attempt knows
    // no pair, so five of the twelve columns are NULL and that is the truth.
    expect(
      record(
        {
          ...OUTCOME,
          id: '01JQ000000000000000000FAIL',
          route: 'unknown',
          localCandidate: null,
          remoteCandidate: null,
          protocol: null,
          relayProtocol: null,
          rttMs: null,
          result: 'failed',
        },
        SOURCE,
      ),
    ).toBe(true);

    const row = opened.sqlite.prepare('select * from ice_outcome').get() as Record<string, unknown>;
    expect(row.result).toBe('failed');
    expect(row.route).toBe('unknown');
    expect(row.local_candidate).toBeNull();
    expect(row.rtt_ms).toBeNull();

    await opened.db.destroy();
  });

  it('o mesmo id duas vezes deixa uma linha só (idempotência por id)', async () => {
    const { opened, record } = await recorder();

    expect(record(OUTCOME, SOURCE)).toBe(true);
    // The second report is a retry, not a second connection. Same mechanism as
    // D-27 in the ledger: the id is what makes reporting twice a no-op instead
    // of a duplicated row that doubles this peer's weight in every SELECT.
    expect(record({ ...OUTCOME, rttMs: 999 }, SOURCE)).toBe(true);

    const rows = opened.sqlite.prepare('select * from ice_outcome').all() as Record<
      string,
      unknown
    >[];
    expect(rows).toHaveLength(1);
    // And the FIRST row won: an INSERT OR IGNORE ignores, it does not overwrite.
    expect(rows[0]?.rtt_ms).toBe(47);

    await opened.db.destroy();
  });

  it('recusa uma route fora de ICE_ROUTE, antes de tocar o banco', async () => {
    const { opened, record } = await recorder();

    // `route` is compared against the frozen table and not merely stored: this
    // column is read as an enumeration by every query the table exists for, and
    // a thirteenth value would make the relay rate quietly not add up to one.
    const bogus = { ...OUTCOME, route: 'tunnel' } as unknown as IceOutcome;
    expect(record(bogus, SOURCE)).toBe(false);

    const rows = opened.sqlite.prepare('select count(*) as n from ice_outcome').get() as {
      n: number;
    };
    expect(rows.n).toBe(0);

    await opened.db.destroy();
  });

  it('recusa um result fora dos dois literais', async () => {
    const { opened, record } = await recorder();

    const bogus = { ...OUTCOME, result: 'maybe' } as unknown as IceOutcome;
    expect(record(bogus, SOURCE)).toBe(false);

    const rows = opened.sqlite.prepare('select count(*) as n from ice_outcome').get() as {
      n: number;
    };
    expect(rows.n).toBe(0);

    await opened.db.destroy();
  });

  it('recusa acima de 20 desfechos do mesmo peerId, sem lançar (T-3-25)', async () => {
    const { opened, record } = await recorder();

    expect(MAX_OUTCOMES_PER_PEER).toBe(20);
    for (let i = 0; i < MAX_OUTCOMES_PER_PEER; i++) {
      expect(record({ ...OUTCOME, id: `01JQ00000000000000000000${i}` }, SOURCE)).toBe(true);
    }
    // An honest peer reports one per connection; twenty is an order of
    // magnitude of slack and still stops one socket from filling the table.
    expect(record({ ...OUTCOME, id: '01JQ000000000000000000OVER' }, SOURCE)).toBe(false);

    const rows = opened.sqlite.prepare('select count(*) as n from ice_outcome').get() as {
      n: number;
    };
    expect(rows.n).toBe(MAX_OUTCOMES_PER_PEER);

    // Acceptance half: the cap is PER PEER, so a different socket is unaffected.
    // A cap that had leaked into a global counter would pass every assertion
    // above while letting one peer mute the telemetry of the whole room.
    expect(record({ ...OUTCOME, id: '01JQ0000000000000000OTHER1' }, { ...SOURCE, peerId: 'peer-b' }))
      .toBe(true);

    await opened.db.destroy();
  });

  it('forget devolve a cota junto com o socket, e é o que impede o vazamento', async () => {
    const { opened, record, forget } = await recorder();

    for (let i = 0; i < MAX_OUTCOMES_PER_PEER; i++) {
      record({ ...OUTCOME, id: `01JQ00000000000000000000${i}` }, SOURCE);
    }
    expect(record({ ...OUTCOME, id: '01JQ000000000000000000OVR2' }, SOURCE)).toBe(false);

    // The counter is keyed by peerId, and a peerId dies with its socket. Without
    // this call the map grows by one entry for every connection the process
    // ever accepted, which is the unbounded map the limiter refuses to be.
    forget(SOURCE.peerId);
    expect(record({ ...OUTCOME, id: '01JQ000000000000000000OVR3' }, SOURCE)).toBe(true);

    await opened.db.destroy();
  });

  it('um banco fechado não lança para o chamador: engole, loga e devolve false', async () => {
    const { opened, record, lines } = await recorder();

    // The room must survive its own telemetry (T-3-26). This is the shape
    // health.ts established: the caller gets a boolean, the reason stays in the
    // journal, and nothing about how a connection went can end one.
    opened.sqlite.close();

    expect(() => record(OUTCOME, SOURCE)).not.toThrow();
    expect(record(OUTCOME, SOURCE)).toBe(false);
    // Logged, not silent: swallowing without a line is how a table that stopped
    // being written stays green for a month.
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]?.event).toBe('ice-outcome-write');
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
    // `openDb('')` is not a hypothetical: it is what the pre-CR-02 code did with
    // `DG2_DB` defined and blank, and env.ts refuses that string one layer up. This is the second lock on the same door, at the layer that knows
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
