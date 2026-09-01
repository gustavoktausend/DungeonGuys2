---
phase: 02-migra-o-para-a-vps
reviewed: 2026-09-01T00:00:00Z
depth: standard
files_reviewed: 52
files_reviewed_list:
  - .github/workflows/ci.yml
  - .gitignore
  - apps/server/package.json
  - apps/server/src/app.ts
  - apps/server/src/db/migrations.ts
  - apps/server/src/db/open.ts
  - apps/server/src/health.ts
  - apps/server/src/index.ts
  - apps/server/tsconfig.json
  - docs/PARIDADE.md
  - eslint.config.js
  - index.html
  - ops/Caddyfile
  - ops/README.md
  - ops/cert-check.service
  - ops/cert-check.sh
  - ops/cert-check.timer
  - ops/deploy-forced.sh
  - ops/deploy.sh
  - ops/dg2.service
  - ops/litestream.service
  - ops/litestream.yml
  - ops/prune-releases.sh
  - ops/rollback.sh
  - package.json
  - playwright.config.ts
  - public/fonts/OFL.txt
  - public/sw.js
  - src/main.ts
  - src/style.css
  - src/ui/dom.ts
  - src/ui/screens.ts
  - tests/build-base.test.ts
  - tests/dom-ids.test.ts
  - tests/ops-config.test.ts
  - tests/pwa/api-isolation.spec.ts
  - tests/pwa/fixtures/README.md
  - tests/pwa/helpers.ts
  - tests/pwa/install.spec.ts
  - tests/pwa/offline.spec.ts
  - tests/pwa/tsconfig.json
  - tests/pwa/update.spec.ts
  - tests/server-health.test.ts
  - tests/server-migrate.test.ts
  - tests/workflows.test.ts
  - tests/workspaces.test.ts
  - tools/ops/restore-verify.mjs
  - tools/sw/emit.mjs
  - tools/sw/verify.mjs
  - tsconfig.json
  - vite.config.ts
  - vitest.config.ts
findings:
  critical: 4
  warning: 21
  info: 0
  total: 25
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-09-01
**Depth:** standard
**Files Reviewed:** 52
**Status:** issues_found

## Summary

Reviewed the 52 files of the VPS migration at standard depth: the CI pipeline that
carries the deploy key, the five `ops/` shell scripts and four systemd units, the new
`apps/server` workspace, the rewritten service worker plus its emit/verify pair, and
the test suite that gates all of it.

The prose-heavy commenting style makes intent unusually legible, and that helped the
review: several findings below are places where the code does **not** do what its own
header claims it does. Four of those rise to BLOCKER.

The concentration of defects is where the phase context predicted: nothing under `ops/`
has ever executed, and the two most consequential findings (`deploy-forced.sh`
confinement, `cert-check.service` hang) are exactly the kind that `sh -n` cannot see.
The server workspace contributes two more, both of the "silent success over a broken
state" shape that the phase's whole alarm chain is supposed to prevent.

No hardcoded domain, host, IP or credential was found anywhere in the reviewed files
(D2-15 holds in fact) — but WR-13 shows the test that claims to enforce it only
enforces a third of it.

## Critical Issues

### CR-01: `deploy-forced.sh` does not confine the deploy key to the release tree

**File:** `ops/deploy-forced.sh:38-48`, `ops/README.md:126-140`
**Issue:** The header states the threat precisely and then does not mitigate it:

> "With this wrapper the key knows how to do exactly two things, drop bytes under the
> release tree and swap a symlink, and nothing else."

That is not what the code does. The first branch matches on the prefix `rsync --server `
and then `exec $CMD` with everything after it unexamined:

```sh
case "$CMD" in
    'rsync --server '*)
        exec $CMD
```

`rsync --server` takes a destination path as its final argument, and the client
generates the whole argv. Holding the key therefore permits:

- **Writing anywhere `dg2-deploy` can write**, not only `/srv/dg2/releases/`. The
  highest-value target is `~dg2-deploy/.ssh/authorized_keys` itself — overwriting it
  removes the `command=` restriction and converts the restricted key into a full shell
  on the next connection. `/srv/dg2/node_modules/better-sqlite3/` is a second target:
  code there is loaded by `dg2.service` and runs as user `dg2`.
- **Reading anything `dg2-deploy` can read**, via `rsync --server --sender`, which the
  prefix match also admits.

`ops/README.md` §4 says `dg2-deploy` is "dono da árvore de releases e de nada mais",
but the runbook never actually instructs the operator to set the ownership and modes
that this depends on — there is no step making `~dg2-deploy/.ssh` and
`~dg2-deploy/.ssh/authorized_keys` root-owned, none for `/srv/dg2/bin/`, and none for
`/srv/dg2/node_modules/`. The confinement rests entirely on filesystem state that
nothing in the repository creates or checks.

Secondary: `exec $CMD` is unquoted with no `set -f`, so pathname expansion also applies
to the argv, not only word splitting. The comment mentions the splitting as deliberate
and does not mention the globbing.

**Fix:** Replace the pass-through with a real argv parser. `rrsync` (shipped with rsync,
`/usr/share/doc/rsync/scripts/rrsync`) exists for exactly this and is a one-line change
in `authorized_keys`:

```
command="/usr/share/doc/rsync/scripts/rrsync -wo /srv/dg2",no-port-forwarding,...
```

If the wrapper must stay, at minimum add `set -f` before the `exec`, reject
`--sender`/`--daemon`/`--rsh`, and validate that the last argument is under
`/srv/dg2/releases/` or `/srv/dg2/server-releases/` and matches `[0-9a-f]{40}`.

Independently of which, add explicit steps to `ops/README.md` §4:

```
chown -R root:root /srv/dg2/bin /srv/dg2/node_modules
chmod 755 /srv/dg2/bin; chmod 644 /srv/dg2/bin/*.sh; chmod 755 /srv/dg2/bin/*.sh
chown root:root ~dg2-deploy/.ssh ~dg2-deploy/.ssh/authorized_keys
chmod 755 ~dg2-deploy/.ssh; chmod 644 ~dg2-deploy/.ssh/authorized_keys
```

(OpenSSH accepts a root-owned `authorized_keys` under `StrictModes`; this is the
standard hardening for forced-command keys and it is what makes CR-01's primary escape
unreachable.)

---

### CR-02: empty environment values slip past `??` — `DG2_DB=` silently discards every write

**File:** `apps/server/src/index.ts:19-21`
**Issue:**

```ts
const DB_PATH = process.env.DG2_DB ?? '/var/lib/dg2/dg2.db';
const PORT = Number(process.env.DG2_PORT ?? 8080);
const RELEASE = process.env.DG2_RELEASE ?? 'dev';
```

`??` only falls back on `null`/`undefined`. A systemd `EnvironmentFile` produces an
**empty string** for `DG2_DB=` — a blank value, a trailing key, a commented-out value
left as `DG2_DB=`. All are ordinary operator edits to `/etc/dg2/env`, the one file
`ops/README.md` §5 tells the operator to hand-write.

- `DG2_DB=''` → `openDb('')`. better-sqlite3 treats an empty filename as a request for
  an **anonymous temporary on-disk database, deleted when the connection closes**. The
  process starts, `migrateToLatest()` succeeds against the throwaway file,
  `/api/health` returns `{"status":"ok","db":true,...}`, Litestream replicates
  `/var/lib/dg2/dg2.db` which nobody writes, and every ledger row is destroyed on the
  next restart. The entire alarm chain of D2-16 stays green throughout.
- `DG2_PORT=''` → `Number('') === 0` → `serve({ port: 0 })` binds an **ephemeral** port.
  The unit reports `active`, nothing listens on 8080, Caddy answers 503, and
  `systemctl status dg2` shows a healthy process — the diagnosis points at Caddy.
- `DG2_RELEASE=''` → health publishes `release: ""`, so the alert cannot say which
  release started failing, which is the field's only stated purpose.

The file's own comment claims "a missing env file fails loudly on the box rather than
silently writing a database somewhere else". A *blank* value does the opposite of that.

**Fix:** Validate, do not default:

```ts
function required(name: string, fallback: string): string {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = raw.trim();
  if (value === '') {
    console.error(`apps/server:/env/${name}: definido e vazio — corrija /etc/dg2/env`);
    process.exit(1);
  }
  return value;
}

const DB_PATH = required('DG2_DB', '/var/lib/dg2/dg2.db');
const RELEASE = required('DG2_RELEASE', 'dev');

const PORT = Number(required('DG2_PORT', '8080'));
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`apps/server:/env/DG2_PORT: porta inválida`);
  process.exit(1);
}
```

Note `PORT < 1`: port 0 must be rejected explicitly, since it is a *valid* argument to
`listen()` that means "pick anything".

The same `??` shape is in `tools/ops/restore-verify.mjs:43,50` and should get the same
treatment.

---

### CR-03: accepting the update in one tab reloads — and destroys — a run in another tab

**File:** `src/main.ts:93-101`
**Issue:**

```ts
navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (swReloading) return;
  swReloading = true;
  location.reload();
});
```

There is no `gameStarted` check here. The design assumes `controllerchange` can only
follow this tab's own button click, but that is not how `skipWaiting()` behaves. Per the
Service Worker spec's Activate algorithm, when the waiting worker activates it is set as
the active worker **for every client using the registration**, and Notify Controller
Change fires on all of them — `clients.claim()` is only needed for clients that were
never controlled.

So: tab A sits on the start screen and the player clicks `⟳ RECARREGAR AGORA`. Tab B is
in the middle of wave 12. `skipWaiting()` runs, the new worker activates, tab B receives
`controllerchange` and calls `location.reload()`. The run is gone.

This is precisely the property D2-09 was built to buy — "this worker never swaps version
by itself on install, and never takes control of pages it did not load" — defeated one
layer up, in the page. The Playwright suite cannot catch it: `update.spec.ts` drives a
single `page`, so the second client never exists.

Two tabs of a browser game is not an exotic scenario, and phase 3 makes it worse: a peer
in a room whose page reloads out from under them drops the room.

**Fix:** Gate the reload on the same flag that gates the offer, and defer it otherwise:

```ts
let swSwapped = false;

navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (swReloading) return;
  if (gameStarted) {
    // Another tab accepted the swap. This tab keeps its run; the new worker is
    // already active, so a reload at the next safe point picks it up.
    swSwapped = true;
    announce('NOVA VERSÃO ATIVA — VOLTE AO MENU PARA RECARREGAR');
    return;
  }
  swReloading = true;
  location.reload();
});
```

and in `quitGame()`, after `showScreen('start')`:

```ts
if (swSwapped && !swReloading) { swReloading = true; location.reload(); return; }
offer(swWaiting);
```

Add a two-page Playwright case to `update.spec.ts` (a second `page` from the same
`context`) that starts a run in page B, accepts the update in page A, and asserts page B
did not navigate.

---

### CR-04: `gold_entry.id` is a nullable primary key — the D-27 dedup does not hold

**File:** `apps/server/src/db/migrations.ts:56`, `apps/server/src/db/open.ts:19`
**Issue:**

```ts
.addColumn('id', 'text', c => c.primaryKey())
```

SQLite permits `NULL` in a non-`INTEGER` `PRIMARY KEY` column, for historical
compatibility — and NULLs do not collide under the implied unique index. The comment
directly above the line says:

> "PRIMARY KEY is the UNIQUE(id) of D-27: it is what makes syncing the same entry twice
> a no-op instead of duplicated money"

That guarantee is void for any row whose `id` arrives as `NULL`. Two syncs of a
malformed entry insert twice and the balance — which D-28 defines as the sum of the
column — is wrong by the amount, permanently, with no way to tell the duplicate from a
legitimate second entry.

`open.ts:19` declares `id: string` (non-nullable) to Kysely, so the type system asserts
an invariant the schema does not enforce; any row that reaches the table through raw SQL
or a future bulk path is outside Kysely's check.

`tests/server-migrate.test.ts:134-151` notices the nullability, records it in a comment,
and then defers to "the uniqueness test below, which is the property that actually
matters" — but that test only inserts non-null ids, so it never exercises the gap.

**Severity rationale:** nothing writes to this table in phase 2, but D2-07 forbids
destructive migrations, and SQLite cannot `ALTER COLUMN` to add `NOT NULL` — fixing this
after ship requires a table rebuild, which is exactly the migration shape the rollback
guarantee outlaws. The window to fix it for free is now.

**Fix:**

```ts
.addColumn('id', 'text', c => c.primaryKey().notNull())
```

and extend the test with the refusal half:

```ts
it('recusa id nulo — NULL não colide num PRIMARY KEY de texto', async () => {
  const { db, sqlite, migrator } = migrated();
  await migrator.migrateToLatest();
  expect(() => sqlite.prepare(
    "insert into gold_entry (id, account_id, amount, reason, at) values (null,'a',1,'run',0)"
  ).run()).toThrow(/NOT NULL/i);
  await db.destroy();
});
```

## Warnings

### WR-01: `rollback.sh` with no argument cannot walk back twice

**File:** `ops/rollback.sh:54-71`
**Issue:** With no argument the script picks "the newest release that is NOT the live
one, by directory mtime". Run it once from release N and it correctly lands on N-1. Run
it **again** — which is what an operator does when N-1 is also bad — and the newest
non-live release is N, the one just abandoned. The script oscillates between two
releases and can never reach N-2.

`ops/README.md` §7 advertises it as "sem argumento para o release anterior", and the
script's own header calls itself "the ONLY safety net". The first time this matters is
the second rollback of a bad night, which is the worst moment to discover it.

**Fix:** Walk back from the live release's position in the mtime ordering instead of
from the top:

```sh
SHA=''
PREV=''
for dir in $(ls -1dt "$RELEASES"/*/ 2>/dev/null || true); do
    candidate=$(readlink -f "$dir")
    if [ "$candidate" = "$LIVE" ]; then
        # the entry after the live one is the one before it in time
        continue
    fi
    if [ -z "$LIVE" ] || [ -n "$PASSED_LIVE" ]; then SHA=$(basename "$candidate"); break; fi
    PREV=$candidate
done
```

Simplest correct form: iterate the mtime-sorted list, set a flag when the live entry is
seen, and take the first entry *after* it; fall back to the newest non-live entry only
when the live release is not in the list at all.

---

### WR-02: `cert-check.service` can hang forever instead of reaching `failed`

**File:** `ops/cert-check.service:17-22`, `ops/cert-check.sh:52-53`
**Issue:** The unit is `Type=oneshot` with no `TimeoutStartSec=`. systemd disables the
start timeout for `Type=oneshot` by default. `cert-check.sh` runs `openssl s_client`
with no `-timeout` and no `timeout(1)` wrapper.

Against a host that completes the TCP connection but never finishes the TLS handshake —
a blackholing middlebox, a wedged Caddy, a half-open connection — `openssl s_client`
blocks indefinitely. The unit stays in `activating` forever. It never reaches `failed`,
so `systemctl list-units --failed` shows nothing, and systemd will not start a second
instance while the first is running, so the daily timer silently stops firing.

This is the identical failure mode the phase reasons about at length for `dg2.service`
(P-9, `StartLimitIntervalSec`/`StartLimitBurst`): "the unit NEVER reaches `failed` — so
nothing ever raises an alarm". The script's own header says "THE EXIT CODE IS THE WHOLE
MECHANISM" and "this leg goes quiet along with the box" — it does not anticipate the leg
going quiet while the box is up.

**Fix:** Bound it on both sides.

```ini
[Service]
Type=oneshot
TimeoutStartSec=60
```

and in `ops/cert-check.sh`:

```sh
CERT=$(echo | timeout 20 openssl s_client -servername "$DG2_DOMAIN" \
    -connect "$DG2_DOMAIN:443" 2>/dev/null) \
    || fail "$DG2_DOMAIN:443" 'não consegui completar o handshake TLS em 20s'
```

Add the assertion to `tests/ops-config.test.ts` next to the `Type=oneshot` check, since
that block already exists to keep this unit's shape from regressing.

Related, same file: `openssl x509 -checkend` exits 1 both when the certificate expires
inside the window *and* when the input cannot be parsed. The message emitted for the
second case ("o certificado servido expira em menos de 30 dias") is then wrong. Split
the parse from the check with a separate `openssl x509 -noout` first.

---

### WR-03: the restore drill opens the live database read-write

**File:** `tools/ops/restore-verify.mjs:111-113`
**Issue:** The header states the requirement in capitals — "IT DOES NOT TOUCH THE LIVE
DATABASE, and that is a requirement rather than a courtesy (D2-03)" — and then:

```js
const probe = (db) => run('sqlite3', [db, PROBE], `sqlite3 ${db}`).trim();
const live = probe(LIVE);
```

The `sqlite3` CLI opens a database **read-write** by default. Against a WAL database
this means it creates `-shm` if absent and, on close, performs a passive checkpoint.
Two concrete consequences:

1. The drill is documented in `ops/README.md` §11 as an operator-run command, and an
   operator runs it as root or as themselves. Any `-wal`/`-shm` file created or
   recreated under that identity is owned by the wrong user, and user `dg2` can no
   longer write to its own database. The verification of the backup becomes the outage.
2. Litestream needs to be the only checkpointer; an external checkpoint is the standard
   way to make it start a new generation or lose frames. The script exists to prove the
   backup works and can perturb it in the act.

**Fix:** Open read-only, explicitly, on both sides:

```js
const probe = (db) => run('sqlite3', ['-readonly', db, PROBE], `sqlite3 ${db}`).trim();
```

(`-readonly` is available in the Debian/Ubuntu `sqlite3` CLI; the URI form
`file:${db}?mode=ro` with `-uri` is the portable alternative.) Add
`expect(src).toContain('-readonly')` to the `restore-verify.mjs` block in
`tests/ops-config.test.ts`.

---

### WR-04: the restore drill compares against a moving target

**File:** `tools/ops/restore-verify.mjs:111-120`
**Issue:** `live` is the current content of the live database; `back` is a restore of
whatever Litestream has already shipped to the bucket. Replication is asynchronous by
construction — that is the point of it. Any write in the seconds before the drill runs
makes `live !== back` and the script prints `NÃO CONFERE` and exits 1.

Today nothing writes to `gold_entry`, so the drill is always green and the defect is
invisible. From phase 6 on it fires whenever the drill is run during play, which trains
the operator to disbelieve the one check whose whole value is being believed.

**Fix:** Make the comparison deterministic rather than hopeful. Either

- snapshot the live probe **after** the restore and require the restored answer to be a
  prefix of the live one (count and sum monotonically non-decreasing for an append-only
  ledger), or
- pin the restore to a timestamp and compare against the live database as of that
  point: `litestream restore -timestamp <t> ...` plus a probe with `where at <= t`.

The second is exact and matches the append-only design. Either way, print the lag so
"identical" and "identical as of 3s ago" are distinguishable in the record D2-03 asks
to be written down.

---

### WR-05: `openDb` never checks that WAL was actually enabled

**File:** `apps/server/src/db/open.ts:51-57`
**Issue:**

```ts
sqlite.pragma('journal_mode = WAL');
```

The return value is discarded. `PRAGMA journal_mode` is one of the pragmas SQLite can
silently refuse — it fails to switch to WAL on a filesystem without shared-memory
support (some network mounts, some container overlay configurations) and simply reports
the mode it kept. The comment two lines above states the stake exactly:

> "REQUIRED by Litestream, not merely nice to have: ... a database in the default
> rollback-journal mode is a database with no continuous backup at all (D2-17)."

A silent fallback here produces the identical outcome to P-8 (the plural-`replicas` trap
that `ops/litestream.yml` spends a paragraph warning about): a backup that was never
running, discovered on the day it is needed.

**Fix:**

```ts
const mode = sqlite.pragma('journal_mode = WAL', { simple: true });
if (path !== ':memory:' && String(mode).toLowerCase() !== 'wal') {
  throw new Error(
    `apps/server:/db/journal_mode: WAL recusado (ficou em "${mode}") — ` +
    'sem WAL não há replicação contínua (D2-17)',
  );
}
```

`:memory:` legitimately reports `memory`, hence the exclusion; the two test files pass
`:memory:` and are unaffected.

---

### WR-06: `healthBody` computes a count it never reads

**File:** `apps/server/src/health.ts:47-56`
**Issue:**

```ts
sqlite.prepare('select count(*) as n from kysely_migration').get();
```

The row is fetched and dropped. The doc comment claims:

> "it succeeds only if the file opened AND the schema was applied"

The first half holds; the second does not. A `kysely_migration` table that exists with
**zero rows** — a truncated restore, a migration that created the bookkeeping table and
then failed, a database restored from a generation predating the first migration —
answers the query successfully and the endpoint publishes `{"status":"ok","db":true}`.

The comment on line 41-45 even names the alternative it rejected ("A bare `select 1`
would prove the process is alive, which the HTTP response already proved") — but with
the count discarded, this query is a bare `select 1` against a differently-named table.

Since the external monitor of D2-21 keyword-matches `"status":"ok"`, this is the exact
state that must not read green.

**Fix:**

```ts
export function healthBody(sqlite: SqliteHandle, release: string): HealthBody {
  let db = false;
  try {
    const row = sqlite
      .prepare('select count(*) as n from kysely_migration')
      .get() as { n: number } | undefined;
    db = (row?.n ?? 0) > 0;
  } catch {
    db = false;
  }
  return { status: db ? 'ok' : 'degraded', db, release };
}
```

Add the case to `tests/server-health.test.ts`: create `kysely_migration` by hand with no
rows and assert 503.

---

### WR-07: no shutdown handling — every deploy drops in-flight requests and leaks the DB handle

**File:** `apps/server/src/index.ts:58`
**Issue:** The process installs no `SIGTERM` handler. `ops/deploy.sh:84` runs
`systemctl restart dg2` on every deploy whose server bundle changed, and systemd sends
`SIGTERM`; Node's default action terminates immediately.

Consequences: connections mid-response are severed rather than drained (Caddy surfaces
them as 502s during every deploy), and `sqlite.close()` is never called, so no clean
checkpoint happens on the way out. With `synchronous = NORMAL` the last transactions are
already at risk on a hard stop — the comment in `open.ts:58-61` accepts that for a
*power cut*, not for the routine, deliberate stop that a deploy is.

**Fix:**

```ts
function shutdown(signal: NodeJS.Signals): void {
  server.close(() => {
    try { sqlite.close(); } finally { process.exit(0); }
  });
  // A client holding a keep-alive socket must not be able to postpone the restart.
  setTimeout(() => process.exit(0), 5_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

and add `TimeoutStopSec=10` to `ops/dg2.service` so systemd's own patience matches.

---

### WR-08: the service worker's cache write is not held open by the event

**File:** `public/sw.js:108-118`
**Issue:**

```js
const res = await fetch(e.request);
if (res.ok) cache.put(key, res.clone());
return res;
```

`cache.put` is not awaited and not passed to `e.waitUntil()`. The response is returned
immediately, and the browser is free to terminate the service worker as soon as the
`respondWith` promise settles — killing the pending write. The result is a
non-deterministic hole in the cache that only manifests offline.

`tests/pwa/api-isolation.spec.ts:171-175` documents the symptom from the other side —
"The worker does NOT await cache.put" — and compensates with `page.waitForTimeout(250)`,
which is itself a defect (see WR-09).

**Fix:**

```js
e.respondWith((async () => {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch(e.request);
  if (res.ok) e.waitUntil(cache.put(key, res.clone()));
  return res;
})());
```

`e.waitUntil()` is callable from inside the async function because `respondWith` was
already invoked synchronously with the promise. This also lets the api-isolation spec
replace the sleep with a deterministic wait.

---

### WR-09: a 250 ms sleep decides whether the P-2 guard is tested

**File:** `tests/pwa/api-isolation.spec.ts:175`
**Issue:** `await page.waitForTimeout(250);` is the only thing separating "the 502 was
not stored" from "the 502 was stored 300 ms later". On a loaded CI runner the write
lands after the window and the test reports green having measured the opposite of what
it claims. The comment acknowledges the mechanism and picks the number arbitrarily.

This is the same shape as the two vacuous assertions already caught in this phase: an
assertion that cannot distinguish the passing case from the failing one.

**Fix:** With WR-08 applied the write is inside `waitUntil` and becomes observable.
Until then, invert the polarity — poll for the *presence* of the entry with a generous
timeout and assert the poll **times out**, rather than sampling once:

```ts
await expect.poll(async () => page.evaluate(async ([name, path]) => {
  const store = await caches.open(name);
  return !!await store.match(path);
}, [cache, STABLE_PATH] as const), { timeout: 3_000, intervals: [100] })
  .toBe(false);
```

`expect.poll(...).toBe(false)` against a value that starts false and must stay false for
the whole window is a real measurement; a single read after a fixed sleep is not.

---

### WR-10: precache keys are raw filesystem paths, not URLs — a space breaks offline silently

**File:** `tools/sw/emit.mjs:77-84,106`, `public/sw.js:102-106`, `tools/sw/verify.mjs:144-150`
**Issue:** `walk()` builds pathnames by string concatenation of directory entry names
and `emit.mjs` writes them verbatim via `JSON.stringify`. The worker then matches an
incoming request with:

```js
const path = url.pathname;
const key = PRECACHE_SET.has(path) ? path : ...
```

`url.pathname` is **percent-encoded**. A file named `hero walk.png` is precached under
the key `/assets/hero walk.png` (because `cache.addAll` normalises the `Request` URL) but
the incoming request's `url.pathname` is `/assets/hero%20walk.png`, and
`PRECACHE_SET.has()` returns false. The asset occupies cache storage and is never served
from it — the game is broken offline for that file, with no error anywhere.

The same applies to `#`, `?`, `%` and any non-ASCII character in a filename.

`verify.mjs` cannot catch this: its independent `walk()` produces the identical raw
strings, so both sides agree and the gate passes. The one property the duplication was
supposed to buy does not cover this axis.

Today's `dist/` is clean (checked: no filenames with spaces or specials). The risk is
scheduled, not hypothetical — `emit.mjs`'s header specifically celebrates that the rule
"will pick up the next file the build starts emitting without anyone editing this line",
and phase-2 constraints say art arrives as a PR from another repository with no human
review before CI.

**Fix:** Encode when emitting, so the precache list is a list of URLs:

```js
const pathname = `${prefix}/${encodeURIComponent(entry.name)}`;
```

and mirror it in `verify.mjs`'s copy. Add a refusal case to the gate that rejects any
emitted pathname where `encodeURI(decodeURI(p)) !== p`, so a filename shape neither side
handles fails the build instead of shipping.

---

### WR-11: `cache.addAll` over the whole of `dist/` is all-or-nothing, with no retry

**File:** `public/sw.js:63`, `tools/sw/emit.mjs:37-42`
**Issue:** `cache.addAll` rejects the entire install if a single URL fails — the
incident `emit.mjs`'s own header documents from the hand-written era. The derived list
removes the *stale name* cause of that failure, but not the failure: a dropped
connection, a 503 in the middle of a deploy, or one asset over quota still aborts the
whole install, and nothing retries.

The exclusion rule is "deliberately total: EVERYTHING under `dist/` except `dist/sw.js`".
`dist/` is ~350 KB today; the phase's own constraints say sprite sheets and animation
sets are coming from a separate repository. At tens of megabytes, a single install that
must complete atomically over a mobile connection is a coin flip, and every failure
leaves the player with no offline capability and no diagnostic.

**Fix:** Make the shell mandatory and the bulk best-effort:

```js
const SHELL = PRECACHE.filter(p => p === '/index.html' || p === '/manifest.json'
  || p.startsWith('/assets/index-'));
const REST = PRECACHE.filter(p => !SHELL.includes(p));

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Mandatory: without these the game cannot boot offline at all.
    await cache.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })));
    // Best-effort: one missing sprite must not cost the whole install.
    await Promise.allSettled(
      REST.map(u => cache.add(new Request(u, { cache: 'reload' }))),
    );
  })());
});
```

`install.spec.ts:84-86` asserts the precache equals the whole of `dist/`, which stays
true on a healthy network; keep it, and add a case that serves one asset as 404 and
asserts the shell still installed.

---

### WR-12: the update offer is dead on an uncontrolled page, and never checks the worker's state

**File:** `src/main.ts:56-91`
**Issue:** Two paths reach `offer()`, and only one of them checks for a controller:

```ts
offer(reg.waiting);                       // line 78 — no controller check
...
if (installing.state === 'installed' && navigator.serviceWorker.controller) {
  offer(reg.waiting);                     // line 86-87 — checked
}
```

A hard reload (`Ctrl+Shift+R`) loads the page **uncontrolled** while the registration
keeps its waiting worker. Line 78 then shows `⟳ RECARREGAR AGORA`. Clicking it posts
`SKIP_WAITING`; the worker activates; but this page has no controller to change, so no
`controllerchange` fires and `location.reload()` never runs. The button stays on screen
and the player clicks it repeatedly with no effect.

Separately, `applyUpdate()` posts to `swWaiting` with no state check. If the stored
worker has since become `redundant` — two deploys while the tab stayed open — the
`postMessage` is a silent no-op and the button is again inert.

**Fix:** Guard the load-time offer, and verify the target before posting:

```ts
function applyUpdate(): void {
  const w = swWaiting;
  if (!w || w.state !== 'installed') {
    // Nothing left to swap to; drop the stale offer instead of lying about it.
    hideUpdateOffer();
    location.reload();
    return;
  }
  w.postMessage({ type: 'SKIP_WAITING' });
}
```

and at line 78:

```ts
if (navigator.serviceWorker.controller) offer(reg.waiting);
```

This also gives `hideUpdateOffer` — currently exported with no caller — its first
legitimate use, without touching the behaviour `update.spec.ts` measures.

---

### WR-13: the D2-15 gate does not check for domains or hostnames

**File:** `tests/ops-config.test.ts:468-515`
**Issue:** The describe block is titled `nenhum arquivo de ops/ carrega endereço ou
segredo (D2-15)` and contains exactly three assertions:

1. no IPv4 literal other than `127.0.0.1`;
2. `AWS_SECRET_ACCESS_KEY=` never has a literal value;
3. lines naming `AWS_SECRET_ACCESS_KEY` or `AWS_ACCESS_KEY_ID` carry a `${`.

D2-15 covers "secret, domain, host, or IP". Nothing here would catch
`DG2_DOMAIN=jogo.exemplo.com.br` in `ops/Caddyfile`, `LITESTREAM_BUCKET=dg2-prod-backups`
in `ops/litestream.yml`, a `DEPLOY_HOST` written into `ops/README.md`, an IPv6 literal,
or a bare hostname in a comment — the leak vector the block's own comment says it is
guarding ("NOT comment-stripped: a domain leaked in a comment is leaked all the same").

The files are clean today; the gate that is supposed to keep them clean covers roughly a
third of the requirement.

**Fix:** Add the two missing shapes.

```ts
it('nenhum literal parecido com hostname público', () => {
  // Anything with a dot-separated TLD-shaped tail, minus the names this
  // repository legitimately references.
  const ALLOWED = /(\.md|\.sh|\.yml|\.json|\.service|\.timer|\.db|\.mjs|\.node|\.js)$/;
  const bad: string[] = [];
  for (const [path, src] of Object.entries(OPS)) {
    for (const m of src.matchAll(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi)) {
      const host = m[0];
      if (ALLOWED.test(host)) continue;
      if (['scripts.sil.org', 'github.com', 'localhost'].includes(host)) continue;
      bad.push(`${path}: ${host}`);
    }
  }
  expect(bad).toEqual([]);
});

it('toda chave de /etc/dg2/env aparece só como nome ou como ${...}', () => {
  const bad: string[] = [];
  for (const [path, src] of Object.entries(OPS)) {
    for (const line of src.split('\n')) {
      for (const key of ENV_KEYS) {
        const m = new RegExp(`${key}\\s*[=:]\\s*(.+)$`).exec(line);
        if (!m) continue;
        const value = m[1].trim();
        if (value !== '' && !/^\$\{[^}]*\}$/.test(value)) bad.push(`${path}: ${line.trim()}`);
      }
    }
  }
  expect(bad).toEqual([]);
});
```

Expect the first to need a small, explicitly-justified allowlist; keeping that list short
is the point.

---

### WR-14: `read()`/`readTool()` guard by type, not by length — ~15 negative assertions can pass vacuously

**File:** `tests/ops-config.test.ts:38-49`
**Issue:**

```ts
function read(name: string): string {
  const src = OPS[`../ops/${name}`];
  expect(src, `o glob não encontrou ops/${name}`).toBeTypeOf('string');
  return src as string;
}
```

Every sibling test file in this phase uses the length guard and says why —
`tests/dom-ids.test.ts:51-54`: "`toBeTypeOf('string')` accepts `''`, which is how plan
02-02 shipped a green test that had read no CSS at all". This file, which is the one
guarding infrastructure that has never executed, is the one that skipped it.

`''` is a string, so an empty (or comment-only, after `code()` strips) file passes the
guard and then satisfies every `not.toContain` / `not.toMatch` assertion in the file —
`route`, `try_files`, `curl`, `wget`, `git `, `npm `, `StrictHostKeyChecking=no`,
`0.0.0.0`, `User=root`, `Requires=dg2.service`, `BindsTo=`, `ReadWritePaths`,
`WantedBy=`, `^Restart=`, `sum(delta)`. Roughly fifteen assertions flip green at once.

**Fix:** Match the discipline of the other files.

```ts
function read(name: string): string {
  const src = OPS[`../ops/${name}`];
  expect(src, `o glob não encontrou ops/${name}`).toBeTypeOf('string');
  expect((src as string).length, `ops/${name} veio vazio`).toBeGreaterThan(200);
  return src as string;
}
```

and add a second floor after comment stripping, since `code()` is what most assertions
actually read:

```ts
function code(name: string): string {
  const stripped = read(name).split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
  expect(stripped.trim().length, `ops/${name} é só comentário`).toBeGreaterThan(50);
  return stripped;
}
```

---

### WR-15: no `set -o pipefail`, while the restart decision is read out of a pipeline

**File:** `ops/deploy.sh:73-77`, `ops/rollback.sh:82-86`
**Issue:** All five scripts open with `set -eu` and none adds `pipefail`. Both deploy
scripts then do:

```sh
NEW_HASH=$(sha256sum "$SERVER_REL/server.mjs" | cut -d' ' -f1)
```

If `sha256sum` fails, `cut` succeeds with empty output, the command substitution
succeeds, and `NEW_HASH` is `''`. The conditional-restart decision — the thing the
comment calls the safe/unsafe split of the deploy — is then made on an empty string.

The `[ -f ]` guard above narrows the window, and the `|| ! is-active` fallback covers the
common direction, but the failure is silent by construction and the script's own contract
says "A script that fails quietly does not count."

**Fix:** POSIX `sh` on Debian is `dash`, which supports `pipefail` since 0.5.12; if the
target `sh` cannot be relied on, avoid the pipeline instead:

```sh
NEW_HASH=$(sha256sum "$SERVER_REL/server.mjs") || fail "$SERVER_REL/server.mjs" 'sha256sum falhou'
NEW_HASH=${NEW_HASH%% *}
```

`${VAR%% *}` is pure shell, needs no `cut`, and inherits `set -e` correctly. Apply the
same in `rollback.sh`.

---

### WR-16: unquoted `$(ls)` feeds `rm -rf` in `prune-releases.sh`

**File:** `ops/prune-releases.sh:47-58`
**Issue:**

```sh
for dir in $(ls -1dt "$root"/*/ 2>/dev/null || true); do
    path=$(readlink -f "$dir")
    ...
    rm -rf "$path" || fail "$path" 'não consegui remover o release antigo'
```

`rollback.sh:57-60` states the assumption for the same construct: "Release names are 40
hex characters by construction, so parsing `ls -1dt` carries none of its usual risk —
there is no whitespace and no metacharacter to split on."

Nothing on the box enforces that. The release roots are writable by `dg2-deploy`, and
CR-01 shows the deploy key can place arbitrary paths there. A directory named `a b` splits
into two words; `readlink -f "b"` canonicalises against the process's CWD (the deploy
user's home under an SSH forced command, not `/srv/dg2`) and `rm -rf` is aimed at
whatever that resolves to.

Even setting CR-01 aside, a manual `mkdir` or a half-finished `rsync --partial` produces
the same shape, and the blast radius is `rm -rf`.

**Fix:** Use a glob loop instead of parsing `ls`, and validate the basename before
deleting anything:

```sh
for dir in "$root"/*/; do
    [ -d "$dir" ] || continue
    base=$(basename "$dir")
    case "$base" in
        *[!0-9a-f]*|"") continue ;;   # not a release directory; never touch it
    esac
    [ ${#base} -eq 40 ] || continue
    ...
done
```

The mtime ordering then has to come from `stat -c '%Y %n'` piped through `sort -rn`,
with the same basename validation applied after the split — or accept lexicographic
order and keep-by-count, which is what the KEEP=5 policy actually needs.

---

### WR-17: `deploy.sh` leaves a split release when the restart fails

**File:** `ops/deploy.sh:79-96`
**Issue:** Both symlinks are swapped, then:

```sh
if [ "$NEW_HASH" != "$OLD_HASH" ] || ! $SYSTEMCTL is-active --quiet dg2; then
    $SYSTEMCTL restart dg2
```

Under `set -e`, a failing `systemctl restart` aborts the script immediately. The prune
never runs, the success line is never printed, and — the part that matters — the script
exits without emitting anything in its own `script:pointer: message` format, violating
the failure contract stated in its header.

The state left behind is worse than the missing message: `current` points at the new
client, `current-server` points at the new server bundle, and the running process is
still the old one. Client and server are from different commits with no indication in
`/api/health` (which reports `DG2_RELEASE` from the env file, not from the symlink).

**Fix:** Catch the failure, say so in the contract's format, and put the server symlink
back — the client half is safe to leave forward, but the two must not disagree silently:

```sh
if [ "$NEW_HASH" != "$OLD_HASH" ] || ! $SYSTEMCTL is-active --quiet dg2; then
    if ! $SYSTEMCTL restart dg2; then
        [ -n "$OLD_HASH" ] && swap_symlink "$CURRENT_SERVER" "$(readlink -f "$CURRENT_SERVER")"
        fail 'systemctl restart dg2' \
            "a unit não subiu com $SHA; symlink do servidor revertido — veja journalctl -u dg2"
    fi
    RESTART_NOTE='dg2 reiniciado'
fi
```

(Capture the previous `current-server` target into a variable *before* the swap so the
revert has somewhere to go.)

---

### WR-18: the deploy job's key handling has a permissions window, no timeout, and no cleanup

**File:** `.github/workflows/ci.yml:244-249,185-286`
**Issue:** Three separate defects in the one job that carries a private key with write
access to the box:

1. **umask window.** `printf ... > "$HOME/.ssh/id_ed25519"` creates the file with the
   process umask (0644 on the runner image) and `chmod 600` follows. The key exists
   world-readable for the duration. On GitHub-hosted ephemeral runners the exposure is
   small; the reasoning that justifies pinning the host key ("fixar custa uma linha")
   applies here identically, and the fix is the same size.
2. **No `IdentitiesOnly=yes`.** If an agent is present with other identities, ssh offers
   them first and can exhaust `MaxAuthTries` before reaching the deploy key. The failure
   mode is `Permission denied (publickey)` — precisely the confusing symptom the step's
   comment says it exists to prevent.
3. **No `timeout-minutes`.** Combined with `cancel-in-progress: false`, a hung `rsync` or
   `ssh` holds the `deploy-vps` concurrency group for the full six-hour job limit,
   blocking every subsequent deploy — including the one that would fix whatever is hung.

The key is also never removed after the last step; irrelevant on hosted runners, relevant
the day this moves to a self-hosted one.

**Fix:**

```yaml
  deploy:
    needs: [test, pwa]
    timeout-minutes: 15
    ...
      - name: Chave de deploy e known_hosts
        run: |
          : "${DEPLOY_SSH_KEY:?secret DEPLOY_SSH_KEY vazio ou ausente}"
          ...
          mkdir -p "$HOME/.ssh"
          chmod 700 "$HOME/.ssh"
          # 077 BEFORE the write: chmod after the fact leaves a window where the
          # private key is world-readable.
          ( umask 077; printf '%s\n' "$DEPLOY_SSH_KEY" > "$HOME/.ssh/id_ed25519" )
          ( umask 077; printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$HOME/.ssh/known_hosts" )
```

and add `-o IdentitiesOnly=yes` to all three ssh invocations. `tests/workflows.test.ts`
already asserts `StrictHostKeyChecking=yes` per ssh-spawning command; extend the same
loop to `IdentitiesOnly=yes` so it cannot regress.

---

### WR-19: `permissions:` is set only on the deploy job

**File:** `.github/workflows/ci.yml:203-204`
**Issue:** The `deploy` job correctly narrows to `contents: read`, with a comment
explaining exactly why. The `test` and `pwa` jobs declare no `permissions:` block at all
and therefore inherit the repository default.

The phase context says the GitHub repository has not been created yet — so the default
is unknown at review time, and for repositories or organisations created before the
2023 default change it is `write-all`. Those two jobs execute the full toolchain and
download three browser engines; they are the larger attack surface of the two, and they
are the ones with the wider token.

**Fix:** Set the floor at the workflow level and let `deploy`'s block stay as the
explicit record it already is.

```yaml
name: CI

on:
  pull_request:
  push:

permissions:
  contents: read

jobs:
  ...
```

Add to `tests/workflows.test.ts`, in the `T-2-SC` describe:

```ts
it('o token do workflow é read-only por padrão', () => {
  const src = ci();
  expect(hasLine(src, 'contents: read'), 'sem permissions no topo').toBe(true);
  expect(src).not.toContain('permissions: write-all');
});
```

---

### WR-20: `ops/Caddyfile` sends no security headers, and unhashed assets get no `Cache-Control`

**File:** `ops/Caddyfile:29-95`
**Issue:** The site block sets `Cache-Control` on two matchers and nothing else. Absent:

- `X-Content-Type-Options: nosniff` — the webroot serves `/assets/CREDITS.md` and
  `/assets/100_Anims_Order_List.txt` alongside the game.
- `Content-Security-Policy` — `src/ui/screens.ts:51-63` writes `innerHTML` from data (see
  WR-21), and phase 6 puts a session cookie on this origin.
- `Strict-Transport-Security` — Caddy does **not** send HSTS by default.
- `Referrer-Policy`.

Separately: `@assets path /assets/index-*.js /assets/index-*.css` covers only the two
Vite-hashed entries. `/assets/dungeon_tileset.png`, `/assets/copRobo.png`,
`/fonts/*.woff2` and `/icons/*.png` have **stable names** and receive no `Cache-Control`
at all, so browsers apply heuristic freshness. Redeploying changed art under the same
filename can serve stale bytes to any client not yet controlled by a new worker.

**Fix:** One header block plus one matcher, inside `handle`:

```caddyfile
    handle {
        root * /srv/dg2/current

        header {
            X-Content-Type-Options nosniff
            Referrer-Policy strict-origin-when-cross-origin
            Strict-Transport-Security "max-age=31536000; includeSubDomains"
            # No unsafe-inline: index.html carries no inline script or style.
            Content-Security-Policy "default-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
        }

        @immutable path /assets/index-*.js /assets/index-*.css
        header @immutable Cache-Control "public, max-age=31536000, immutable"

        # Stable names, mutable bytes: revalidate rather than pin. The service
        # worker's per-build cache name is what makes repeat visits free.
        @stable path /assets/* /fonts/* /icons/*
        header @stable Cache-Control "public, max-age=0, must-revalidate"

        @shell path / /index.html /sw.js /manifest.json
        header @shell Cache-Control "no-cache"

        file_server
    }
```

Verify the CSP against the running game before shipping — the canvas path and the
WebAudio init are the two places an inline requirement could hide.

---

### WR-21: `renderLevelupChoices` builds HTML by concatenation, with a network source arriving next phase

**File:** `src/ui/screens.ts:51-63`
**Issue:**

```ts
dom.levelupChoices.innerHTML = choices.map((b, i) => {
  const fx = Object.entries(b.mods)
    .map(([k, v]) => `<span class="fx-pos">${fmtMod(k, v as number)}</span>`)
    .join('');
  return `... <span class="shop-icon">${b.icon}</span>
             <span class="shop-name">${b.name}</span> ...`;
}).join('');
```

`b.icon`, `b.name` and `STAT_LABELS[k]` are sim constants today, so there is no live
vulnerability. Two things make it worth fixing now rather than later: there is no CSP
(WR-20), and phase 3 makes `World` contents arrive over WebRTC from a peer. The moment a
`Blessing` can be authored remotely, this is a stored-XSS sink on the origin that will
hold the session cookie.

Every other DOM write in this file already uses `textContent`
(`paintGameOver`, `paintVictory`); this is the one that does not.

**Fix:** Build the nodes instead of the string. It is the same length:

```ts
function renderLevelupChoices(choices: Blessing[]): void {
  dom.levelupChoices.replaceChildren(...choices.map((b, i) => {
    const btn = document.createElement('button');
    btn.className = 'shop-item';
    btn.dataset.i = String(i);
    const icon = document.createElement('span');
    icon.className = 'shop-icon';
    icon.textContent = b.icon;
    const name = document.createElement('span');
    name.className = 'shop-name';
    name.textContent = b.name;
    const effects = document.createElement('span');
    effects.className = 'shop-effects';
    for (const [k, v] of Object.entries(b.mods)) {
      const fx = document.createElement('span');
      fx.className = 'fx-pos';
      fx.textContent = fmtMod(k, v as number);
      effects.append(fx);
    }
    btn.append(icon, name, effects);
    return btn;
  }));
}
```

The existing click delegation on `.shop-item[data-i]` keeps working unchanged.

---

### WR-22: `tools/` is exempted from lint on a rationale that two of its files contradict

**File:** `eslint.config.js:20,29-31`
**Issue:** The ignores list is
`['dist', 'dist-server', 'packages/*/dist', 'public', 'node_modules', 'tools', 'tests/pwa/fixtures']`.
The comment block justifies four of those in detail and the following block justifies
`tools`:

> "tools/ is ignored because it is build scaffolding that never ships; apps/server is
> product code that runs in front of a real database on a real box"

`tools/ops/restore-verify.mjs` runs on the VPS, shells out to `litestream` and `sqlite3`,
and reads the live ledger — `ops/README.md` §11 documents it as an operator command on
the box. It is product code that runs in front of a real database on a real box, by the
config's own definition, and it is unlinted.

`public` is in the list with **no justification at all**, and `public/sw.js` is the
shipped service worker — the client file this phase spent the most effort on, carrying
the cache-poisoning and `/api/` isolation logic.

**Fix:** Narrow the ignores and add the two back:

```js
{ ignores: [
    'dist', 'dist-server', 'packages/*/dist', 'node_modules',
    'tests/pwa/fixtures',
    // Build scaffolding that never leaves this machine. The two exceptions
    // below DO leave it, and are linted.
    'tools/**', '!tools/ops/**',
    // public/ is copied verbatim by Vite; only sw.js is ours to lint.
    'public/**', '!public/sw.js',
  ] },
```

`public/sw.js` needs a service-worker globals block (`self`, `caches`, `clients`,
`location`) — either `languageOptions.globals` with the `serviceworker` set, or a
`/* eslint-env serviceworker */` pragma. Expect a handful of findings on first run; that
is the point.

## Notes on what was checked and found sound

Recorded so a later reviewer does not redo the work:

- **D2-15 in fact.** No domain, hostname, IP (other than `127.0.0.1`), bucket name or
  credential literal appears in any of the 52 files. The *gate* is incomplete (WR-13),
  the *state* is clean.
- **D2-04.** Root `package.json:34` keeps `dependencies: {}`; the four server deps are
  confined to `apps/server` and none appears in the root `devDependencies`.
  `tests/workspaces.test.ts` enforces both directions correctly.
- **Cache-name collision with the sibling game.** `public/sw.js:74` filters on
  `startsWith('dg2-') || k === LEGACY_CACHE`, with exactly one `caches.delete` site.
  `'dungeonguys-v3'` cannot be reached. `build-base.test.ts:243-259` pins both the
  prefix filter and the single delete site by count.
- **`/api/` and `/ws` isolation.** The allowlist in `public/sw.js:102-106` is derived
  from the build, so no route the build did not emit can be answered from storage; the
  redundant early return at line 95 is genuinely redundant, not load-bearing.
- **Migration idempotency.** `tests/server-migrate.test.ts:60-94` proves the second
  `migrateToLatest()` is a no-op against *data*, not just against the results array —
  the right shape.
- **Loopback binding.** `index.ts:58` passes `hostname: '127.0.0.1'` explicitly, and
  `ops-config.test.ts:251-256` blocks a `0.0.0.0` from creeping into the unit.
- **`sw:verify` gate.** All four properties are independently implemented (separate
  `walk()`), and the sentinel check correctly runs before anything is parsed. The
  `indexOf('];')` heuristic in `readPrecache` is fragile against a `];` inside a
  filename, but it fails closed (JSON.parse throws, the outer catch reports it).
- **OFL compliance.** `public/fonts/OFL.txt` carries both copyright notices and the full
  SIL OFL 1.1 body, as clause 2 requires.
- **Anti-vacuity discipline** in `build-base.test.ts`, `dom-ids.test.ts`,
  `workflows.test.ts` and `workspaces.test.ts` is genuinely thorough — length floors, not
  type checks; exact counts before content assertions; `hasLine()` anchoring to defeat
  the prose-in-comments problem. `ops-config.test.ts` is the outlier (WR-14).

Two smaller items, recorded without their own finding because neither can produce a
wrong result:

- `tests/pwa/install.spec.ts:23-31` duplicates `distPathnames`, which `helpers.ts:237`
  exports and whose comment calls itself "the shared home for it". The consolidation was
  planned and not finished; two copies can drift.
- All four PWA specs declare `let server: StaticServer` and `afterEach` calls
  `server.close().catch(...)`. If `serveDir()` itself throws, `server` is `undefined` and
  the afterEach raises a `TypeError` that masks the real failure. `server?.close()`
  costs one character.

---

_Reviewed: 2026-09-01_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
