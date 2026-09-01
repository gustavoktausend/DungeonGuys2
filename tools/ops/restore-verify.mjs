// restore-verify.mjs — INFRA-04 says the backup is "verified by restoring it,
// not merely by generating it". This is that verification.
//
// RULE OF THE SCRIPT, and it is not decoration:
//
//   WHAT PROVES A RESTORE IS THE CONTENT, NOT THE BYTES.
//
// Two semantically identical SQLite files differ on disk — free pages, page
// ordering, WAL state, the header's change counter. A binary diff here would be
// red every single time and would prove nothing on the day it was green. So the
// check is a query run against both databases, and the comparison is of its
// answer — over a FIXED WINDOW rather than against the live total, because the
// live database moves while the drill runs and a comparison that ignores that
// is red for the wrong reason. See the note on probeUpTo below.
//
// IT DOES NOT TOUCH THE LIVE DATABASE, and that is a requirement rather than a
// courtesy (D2-03). `litestream restore -o` writes somewhere else; litestream
// also refuses to overwrite an existing file, which is why the destination is a
// directory that did not exist a moment ago. There is no --confirm flag here
// precisely because there is nothing to confirm: the script changes nothing
// that anyone would want back.
//
// IT IS DELIBERATELY NOT A TIMER (D2-03). On a box with nobody on call, silent
// automation is one more thing that breaks without telling you — and a restore
// drill that has been quietly failing for four months is worse than no drill,
// because it was counted as one. It runs by hand, and the result gets written
// down. The day the database holds real player data is the day to reconsider;
// the machinery is here and ready for it.
//
// EXCEPTION TO tools/README.md §2, on purpose: this script gets NO entry in
// package.json. It runs on the VPS, where the repository — and therefore
// `npm run` — does not exist. It is invoked as `node tools/ops/restore-verify.mjs`,
// and 02-VALIDATION.md documents it that way.
//
// Failure contract from tools/README.md §3: `file:pointer: message` on stderr
// with exit 1; success is ONE line on stdout with exit 0.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SELF = 'tools/ops/restore-verify.mjs';

/** The same default apps/server/src/index.ts uses, so the two cannot drift. */
const LIVE = process.env.DG2_DB ?? '/var/lib/dg2/dg2.db';

/**
 * The INSTALLED copy, not ops/litestream.yml from a checkout. Restoring through
 * the very file the replication runs from is what makes this a test of the
 * backup that exists rather than of one that would be nice to have.
 */
const CONFIG = process.env.LITESTREAM_CONFIG ?? '/etc/litestream.yml';

/**
 * The probe.
 *
 * `count(*)` alone would pass against a restore that lost every value; the sum
 * alone would pass against a restore that merged two rows into one. Together
 * they catch both, and they stay cheap when the table is large.
 *
 * The column is `amount`. The sketch in 02-RESEARCH.md:1243 says `delta`, and it
 * is wrong: the canonical name comes from `LedgerEvent` in src/app/ledger.ts and
 * from docs/adr/0010, which is what apps/server/src/db/migrations.ts implements.
 * A probe naming a column that does not exist fails with "no such column" — the
 * good outcome, but only after somebody has spent the outage reading SQL.
 *
 * `coalesce` because an empty ledger must compare 0 against 0. Without it SQLite
 * answers NULL, the concatenation collapses the whole expression to NULL, and
 * two empty databases compare '' against '' — which is equal, so it would pass,
 * but it would pass by comparing nothing to nothing.
 */
const PROBE = "select count(*) || '|' || coalesce(sum(amount), 0) || '|' || coalesce(max(rowid), 0) from gold_entry;";

/**
 * The second half of the probe, and the reason the first one grew a `max(rowid)`.
 *
 * THE LIVE DATABASE IS A MOVING TARGET, BY DESIGN. `litestream restore` answers
 * with whatever has already been shipped to the bucket, and replication is
 * asynchronous — that is the point of it. Comparing that against the live
 * database with no tolerance means any write in the seconds before the drill
 * runs prints `NÃO CONFERE` and exits 1. Measured with three rows appended
 * after the copy: exactly that, a red result over a perfectly healthy backup.
 *
 * Today nothing writes to gold_entry, so the drill is always green and the
 * defect is invisible. From phase 6 on it fires whenever the drill is run
 * during play — which trains the operator to disbelieve the one check whose
 * entire value is being believed.
 *
 * The fix is to compare a FIXED window instead of hoping the target holds
 * still. The ledger is append-only (D-28), so a restore is a prefix of the
 * live table in rowid order, and rowids survive the restore because litestream
 * replicates pages rather than rows. So: ask the restored copy how far it goes,
 * and ask the live database for the same range. That comparison is EXACT no
 * matter how many rows arrive while the drill runs.
 *
 * `sum` deliberately carries no inequality. Amounts are SIGNED — a spend is a
 * negative entry — so the sum is not monotonic and "restored <= live" would be
 * a false invariant. Only the count is monotonic, and it is not what proves
 * content.
 *
 * If gold_entry is ever declared WITHOUT ROWID this fails loudly with "no such
 * column: rowid", which is the right way for it to break.
 */
const probeUpTo = (upTo) =>
  `select count(*) || '|' || coalesce(sum(amount), 0) from gold_entry where rowid <= ${upTo};`;

/**
 * Splits a probe answer into its three numbers, and refuses anything else.
 *
 * The refusal is not defensive padding: `back.maxRowid` is interpolated into
 * the SQL of probeUpTo, and it arrives from a database file the operator just
 * restored from a bucket. Validating it as an integer here is what keeps that
 * interpolation from being a way in. A probe that answers something unexpected
 * is a broken drill, and a broken drill has to say so rather than carry on.
 */
function parseProbe(answer, where) {
  const parts = answer.split('|');
  if (parts.length !== 3 || !parts.every((p) => /^-?\d+$/.test(p))) {
    throw new Error(`${where}: a sonda respondeu algo que não são três inteiros: ${JSON.stringify(answer)}`);
  }
  const [count, sum, maxRowid] = parts.map(Number);
  return { count, sum, maxRowid };
}

/** Failure: `file:pointer: message` on stderr, exit 1. */
function fail(file, pointer, message) {
  console.error(`${file}:${pointer}: ${message}`);
  process.exit(1);
}

/**
 * Runs an external command and returns its stdout. Throws rather than exiting,
 * so that the cleanup block below always gets to remove the temporary
 * directory — a process.exit() inside the try would skip it and leave a copy of
 * the ledger sitting in /tmp.
 */
function run(bin, argv, label) {
  try {
    return execFileSync(bin, argv, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`${label}: ${bin} não está instalado nesta máquina`);
    }
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
    throw new Error(`${label} falhou${output ? `:\n${output}` : ` (${error.message})`}`);
  }
}

/**
 * Runs one query against one database.
 *
 * `-readonly` IS THE REQUIREMENT, not a nicety. The sqlite3 CLI opens a
 * database READ-WRITE by default, and against a WAL database that means it
 * creates the -shm file if it is absent and performs a passive checkpoint on
 * close. Two consequences, both of which turn the verification of the backup
 * into the outage it was meant to prevent:
 *
 *   1. ops/README.md §11 documents this as an operator-run command, and an
 *      operator runs it as root or as themselves. Any -wal or -shm created
 *      under that identity is owned by the wrong user, and the dg2 user can no
 *      longer write to its own database.
 *   2. Litestream has to be the only checkpointer. An external checkpoint is
 *      the standard way to make it start a new generation or lose frames —
 *      this script exists to prove the backup works and could perturb it in
 *      the act.
 *
 * The header of this file has claimed in capitals since it was written that it
 * does not touch the live database. This is the line that makes the claim true.
 *
 * Known cost, written down rather than discovered: opening a WAL database
 * read-only needs the -shm file to already exist, which it does while
 * dg2.service holds the database open. Run against a stopped service with a
 * leftover -wal, sqlite3 refuses — an honest exit 1 with a message, which is
 * the right way for it to fail. `file:${db}?mode=ro` with `-uri` is the
 * portable spelling if a box ever ships a CLI without the flag.
 */
const ask = (db, query) => run('sqlite3', ['-readonly', db, query], `sqlite3 ${db}`).trim();

function main() {
  // A fresh directory every run: litestream refuses to write over an existing
  // file, and a stale leftover would turn that refusal into a confusing error
  // about the wrong thing.
  const dir = mkdtempSync(join(tmpdir(), 'dg2-restore-'));
  const restored = join(dir, 'dg2.db');
  const started = Date.now();

  try {
    // Taken BEFORE the restore, and used for exactly one thing: telling "the
    // replica shipped nothing" apart from "the ledger really was empty".
    const before = parseProbe(ask(LIVE, PROBE), 'banco vivo, antes da restauração');

    run('litestream', ['restore', '-config', CONFIG, '-o', restored, LIVE],
        'litestream restore');

    const back = parseProbe(ask(restored, PROBE), 'banco restaurado');

    // An empty restore against a non-empty live database is never the right
    // answer, and the prefix comparison below cannot see it: an empty restore
    // has no prefix, so it agrees with the empty prefix of anything.
    //
    // The honest caveat, since this is the one rule here that is a judgement
    // rather than an identity: a ledger that went from empty to non-empty
    // INSIDE the drill window would trip this. The message says how many rows
    // the live database had before the restore even started, which is enough
    // for an operator to recognise that case in two seconds.
    if (back.count === 0 && before.count > 0) {
      console.error(`${SELF}:/gold_entry: a réplica devolveu um ledger vazio, e o vivo já tinha ${before.count} linha(s) antes da restauração — NÃO CONFERE`);
      return 1;
    }

    // THE COMPARISON, and it is exact rather than hopeful. The restored copy
    // is a prefix of the live table in rowid order, so the live database is
    // asked for that same prefix instead of for its current total. Rows
    // arriving while the drill runs land above the watermark and cannot move
    // either side of this equality.
    const prefix = ask(LIVE, probeUpTo(back.maxRowid));
    const expected = `${back.count}|${back.sum}`;
    if (prefix !== expected) {
      // Not thrown: this is the ANSWER, not an accident, and it deserves its
      // own pointer instead of being wrapped as an internal error.
      console.error(`${SELF}:/gold_entry: até rowid ${back.maxRowid} o vivo tem ${prefix} e o restaurado tem ${expected} — NÃO CONFERE`);
      return 1;
    }

    // The lag is REPORTED, never asserted. D2-03 asks for the drill to be
    // written down, and "identical" and "identical as of 3 seconds ago" are
    // different facts about a backup — the second one is the recovery point,
    // and it is only knowable by having measured it.
    const after = parseProbe(ask(LIVE, PROBE), 'banco vivo, depois da restauração');
    const lag = after.count - back.count;

    // The elapsed time is the other half of what D2-03 asks to be written down:
    // "how long it took to restore" is the number that turns a backup into a
    // recovery plan, and it is only knowable by having done it.
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`restauração ok: gold_entry ${expected} confere com o vivo até rowid ${back.maxRowid}, ${lag} linha(s) de defasagem, em ${secs}s`);
    return 0;
  } finally {
    // Always, including on failure: the restored file is a full copy of the
    // ledger, and leaving it behind in a world-readable temporary directory
    // would make this script the leak.
    rmSync(dir, { recursive: true, force: true });
  }
}

try {
  process.exit(main());
} catch (error) {
  fail(SELF, '/', error.message);
}
