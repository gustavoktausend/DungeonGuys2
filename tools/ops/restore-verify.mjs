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
// answer.
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
const PROBE = "select count(*) || '|' || coalesce(sum(amount), 0) from gold_entry;";

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

function main() {
  // A fresh directory every run: litestream refuses to write over an existing
  // file, and a stale leftover would turn that refusal into a confusing error
  // about the wrong thing.
  const dir = mkdtempSync(join(tmpdir(), 'dg2-restore-'));
  const restored = join(dir, 'dg2.db');
  const started = Date.now();

  try {
    run('litestream', ['restore', '-config', CONFIG, '-o', restored, LIVE],
        'litestream restore');

    const probe = (db) => run('sqlite3', [db, PROBE], `sqlite3 ${db}`).trim();
    const live = probe(LIVE);
    const back = probe(restored);

    if (live !== back) {
      // Not thrown: this is the ANSWER, not an accident, and it deserves its
      // own pointer instead of being wrapped as an internal error.
      console.error(`${SELF}:/gold_entry: vivo=${live} restaurado=${back} — NÃO CONFERE`);
      return 1;
    }

    // The elapsed time is part of what D2-03 asks to be written down: "how long
    // it took to restore" is the number that turns a backup into a recovery
    // plan, and it is only knowable by having done it.
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`restauração ok: gold_entry ${live} idêntico ao vivo, em ${secs}s`);
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
