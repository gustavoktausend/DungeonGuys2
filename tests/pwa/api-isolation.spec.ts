// api-isolation.spec.ts — the two properties of INFRA-03 that a comment in
// public/sw.js can only promise (success criterion 3, items a and b).
//
// Both halves exist because Cache Storage IGNORES Cache-Control by design.
// Nothing the server says about a response — not `no-store`, not `max-age=0` —
// prevents a service worker from putting it in a cache that survives logout,
// survives reload, and is not cleared by anything the player can reach.
//
//   T-2-CACHE   From phase 6 on, /api/* responses carry a session. A single
//               forgotten route storing one of them is a credential written to
//               durable storage on a shared machine. The worker's defence is an
//               ALLOWLIST — only paths this build emitted are ever answered
//               from storage — plus a redundant early return; this file is
//               where "the allowlist holds" stops being a code review opinion.
//
//   T-2-STALE   `if (res.ok)` before the put. Thirty seconds of 502 during a
//               deploy would otherwise become the cached index.html forever
//               (P-2) — a game that is broken offline for everyone who happened
//               to reload during the window, with no way to recover but a
//               manual storage wipe.
//
// The second half is written in two directions on purpose. A worker that simply
// never wrote anything to the cache would pass "the 502 was not stored", so the
// 200 that follows has to be observed landing. One direction alone is a test of
// nothing (T-2-VACUOUS, the same failure mode the old-build fixture guards).
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { clearHttpCache, readCacheEntries, serveDir, waitForActivated, type StaticServer } from './helpers';

/** The name shape of the current build's cache (D2-10). */
const CACHE_SHAPE = /^dg2-[0-9a-f]{16}$/;

/** A precached path with a STABLE name — the hashed bundles are renamed every
 *  build, and half 2 has to name the same path twice across two responses. */
const STABLE_PATH = '/manifest.json';

/** The only cache the current build owns, failing loudly if that is not one. */
async function currentCache(page: Page): Promise<string> {
  const names = Object.keys(await readCacheEntries(page)).filter(name => CACHE_SHAPE.test(name));
  expect(names, 'a origem tem de ter exatamente um cache do build corrente').toHaveLength(1);
  return names[0];
}

/** Puts the page under the worker's control. The target worker does not call
 *  clients.claim() (D2-09), so the page that installed it is not controlled by
 *  it and its fetch handler — the subject of this whole file — never runs. */
async function installAndTakeControl(page: Page, origin: string): Promise<void> {
  await page.goto(origin);
  await waitForActivated(page);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller),
      { message: 'sem controller o handler de fetch do worker nem roda — o teste seria vazio' })
    .toBe(true);
}

let server: StaticServer;

test.afterEach(async () => {
  await server.close().catch(() => {});
});

test('/api/ e /ws nunca entram em cache nenhum da origem', async ({ page }) => {
  server = await serveDir('dist');

  // The same three-key body apps/server/src/health.ts publishes, with the same
  // `no-store` the route sends — so that if this ever went green for the wrong
  // reason, it would not be because the fixture answered something the real
  // server does not.
  server.route('/api/health', (_req, res) => {
    const body = JSON.stringify({ status: 'ok', db: true, release: 'test' });
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
    });
    res.end(body);
  });

  // /ws is a WebSocket upgrade in production; a plain GET is enough to ask the
  // question this file asks, which is whether the path can reach storage.
  server.route('/ws', (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('ws');
  });

  await installAndTakeControl(page, server.origin);

  // Anti-vacuity, and the reason this is asserted BEFORE the calls: "no /api/
  // in any cache" is trivially true of an origin with no caches, or with an
  // empty one. The comparison below is only worth something because there is a
  // populated cache for a leak to show up in.
  const before = await readCacheEntries(page);
  const cache = await currentCache(page);
  expect(before[cache].length, 'o precache tem de estar cheio, ou não há onde vazar')
    .toBeGreaterThan(5);

  const statuses = await page.evaluate(async () => {
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await fetch('/api/health')).status);
    codes.push((await fetch('/ws')).status);
    return codes;
  });

  // The request PASSES — it is only never stored. A worker that broke /api/
  // outright would satisfy the cache assertion below and break the game.
  expect(statuses, 'as chamadas têm de chegar ao servidor e voltar 200')
    .toEqual([200, 200, 200, 200, 200, 200]);

  // EVERY cache of the origin, not just the current one: the requirement is
  // that the response is not persisted anywhere, and a second cache left
  // behind by an older worker is exactly the place nobody would look.
  const after = await readCacheEntries(page);
  const leaked: string[] = [];
  for (const [name, pathnames] of Object.entries(after)) {
    for (const pathname of pathnames) {
      if (pathname.startsWith('/api/') || pathname === '/ws') leaked.push(`${name}: ${pathname}`);
    }
  }
  expect(leaked, 'nenhum caminho de /api/ ou /ws pode estar guardado').toEqual([]);

  // Stronger than the sweep on its own: nothing at all appeared. The sweep
  // catches a leak under /api/; this catches a worker that stored the response
  // under some other key.
  expect(after, 'as seis chamadas não podem ter mudado uma vírgula do cache').toEqual(before);
});

test('resposta não-ok nunca é gravada, e a 200 seguinte é', async ({ page }) => {
  server = await serveDir('dist');
  await installAndTakeControl(page, server.origin);

  const cache = await currentCache(page);

  // The handler is cache-first: with the entry present the network is never
  // consulted and neither direction of this test could happen. Deleting it is
  // the setup, and the throw is the anti-vacuity guard — if the entry was not
  // there, the precache is broken and this test must say so rather than sail on.
  await page.evaluate(async ([name, path]) => {
    const store = await caches.open(name);
    if (!await store.delete(path)) throw new Error(`${path} não estava no precache ${name}`);
  }, [cache, STABLE_PATH] as const);

  const body = await readFile(resolve('dist', STABLE_PATH.slice(1)));
  let broken = true;
  server.route(STABLE_PATH, (_req, res) => {
    if (broken) {
      // no-store on the failure too: a 502 sitting in Chromium's HTTP cache
      // could answer the second fetch below and fake the recovery.
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('502 — deploy em andamento');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Content-Length': body.byteLength,
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  });

  // The measurement of plan 02-05, applied here: with the HTTP cache holding a
  // copy, `fetch` inside the worker never reaches the 502 and this half would
  // pass against a worker that stores anything it is handed.
  await clearHttpCache(page);

  // ── Direção 1: a 502 não é gravada ─────────────────────────────────────
  const failed = await page.evaluate(path => fetch(path).then(r => r.status), STABLE_PATH);
  expect(failed, 'o 502 tem de chegar até a página — senão nada foi à rede').toBe(502);

  // The worker does NOT await cache.put, so "was not stored" has to be measured
  // after giving a write time to land. Without this pause the assertion would
  // also pass against a worker that stored the 502 a millisecond later, which
  // is the bug it exists to catch.
  await page.waitForTimeout(250);
  const afterFailure = await page.evaluate(async ([name, path]) => {
    const store = await caches.open(name);
    return !!await store.match(path);
  }, [cache, STABLE_PATH] as const);
  expect(afterFailure, 'uma resposta não-ok não pode virar conteúdo permanente (P-2)').toBe(false);

  // ── Direção 2: a 200 seguinte é ────────────────────────────────────────
  // Without this the test would be satisfied by a worker that never writes.
  broken = false;
  const recovered = await page.evaluate(path => fetch(path).then(r => r.status), STABLE_PATH);
  expect(recovered).toBe(200);

  await expect
    .poll(() => page.evaluate(async ([name, path]) => {
      const store = await caches.open(name);
      return !!await store.match(path);
    }, [cache, STABLE_PATH] as const),
    { message: 'a resposta ok tem de reaparecer no cache — a guarda é sobre `res.ok`, não sobre nunca gravar' })
    .toBe(true);
});
