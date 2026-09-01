// sw.js — DungeonGuys2 service worker (TEMPLATE).
//
// Three things to read before changing this file.
//
// 1. THE HASH COVERS EVERY FILE IN dist/ EXCEPT THIS ONE.
//    It cannot cover itself: writing the digest in changes the very bytes that
//    produced it. tools/sim-version/emit.mjs documents the same property and
//    resolves it from the other side — there the value goes to a SIBLING file,
//    so the artifact stays clean; here the value has to live inside the
//    artifact, so the BOUNDARY moves instead. Anyone who "fixes" emit.mjs to
//    hash dist/sw.js as well makes the build irreproducible.
//
// 2. FILTER BY OUR OWN PREFIX, NEVER DELETE OVER THE WHOLE caches.keys().
//    Cache Storage is per ORIGIN, not per scope. The activate handler of the
//    original DungeonGuys — live at gustavoktausend.github.io/DungeonGuys/sw.js
//    with CACHE = 'dungeonguys-v3' — is literally a delete-everything over
//    keys(), so keeping that shape here would wipe the sibling game's cache on
//    any shared origin. src/app/save.ts settled the same collision one storage
//    down, in localStorage, by taking a key of its own, and it saw only half of
//    the problem: the Cache Storage half has no fix by name, only by prefix
//    discipline inside the worker (DM-3, P-11).
//
// 3. THE TWO SENTINELS BELOW ARE REPLACED BY tools/sw/emit.mjs AFTER
//    `vite build`. Vite copies public/ verbatim, so this file never passes
//    through a transform and define() cannot reach it — the substitution is a
//    post-build step. A bare `vite build` leaves the sentinels standing and
//    tools/sw/verify.mjs fails the build on purpose: a service worker that
//    precaches nothing only shows its defect offline, weeks later. Both
//    sentinels are valid identifiers, which is what lets `node --check` verify
//    the syntax of the template before anything is substituted.
//
// Two absences here are deliberate and are asserted by tests/build-base.test.ts,
// so read them now instead of reintroducing them later (D2-09): this worker
// never swaps version by itself on install, and never takes control of pages it
// did not load. The page asks for the swap, outside a run, by posting
// SKIP_WAITING to the waiting worker — wired up in plan 02-07.
const CACHE = 'dg2-__BUILD_HASH__';

// The ONE cache name this game used before D2-10 made the name derive from the
// build. A prefix filter cannot match a name written before the prefix existed,
// so without this literal every installation made before the rewrite keeps a
// whole dead build in Cache Storage forever, and the activate handler below has
// nothing to clean on the very upgrade that most needs cleaning
// (T-2-STALECACHE, measured by tests/pwa/update.spec.ts).
//
// This is a closed list of one, not a widening of item 2 above: the name is
// ours, it was only ever used by DungeonGuys2, and the sibling game's
// 'dungeonguys-v3' is deliberately NOT on it. Nothing new is ever added here —
// every name from D2-10 onwards carries the `dg2-` prefix by construction.
const LEGACY_CACHE = 'dungeonguys2-v1';

const PRECACHE = __PRECACHE__;
const PRECACHE_SET = new Set(PRECACHE);

// THE INSTALL IS IN TWO HALVES, AND THAT IS THE POINT.
//
// `cache.addAll` rejects the ENTIRE install if a single URL fails — the very
// incident tools/sw/emit.mjs documents in its own header. Deriving the list
// from dist/ removed the STALE NAME cause of that failure; it did not remove
// the failure. A dropped connection, a 503 in the middle of a deploy, or one
// asset over quota still aborts everything, and nothing retries.
//
// The exclusion rule is deliberately total — EVERYTHING under dist/ — and
// phase-2 constraints say the sprite sheets and animation sets arrive from a
// separate repository. dist/ is ~350 KB today; at tens of megabytes an install
// that must complete atomically over a mobile connection is a coin flip, and
// every failure leaves the player with no offline capability at all and no
// diagnostic anywhere (WR-11).
//
// So: the shell is mandatory, the bulk is best-effort. The shell is the
// document, the manifest and the two hashed bundles Vite emits — without any
// one of them there is no game to open offline, so failing the install is the
// honest outcome. A missing sprite sheet is a worse picture, not a dead game.
const SHELL = PRECACHE.filter(url =>
  url === '/index.html' || url === '/manifest.json' || url.startsWith('/assets/index-'));
const SHELL_SET = new Set(SHELL);
const REST = PRECACHE.filter(url => !SHELL_SET.has(url));

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // `{cache:'reload'}` bypasses the HTTP cache. index.html, manifest.json and
    // this worker have stable names, so without it a proxy or an intermediate
    // cache could feed the PREVIOUS build straight into the "new" precache
    // (P-4). The other half of the fix is the `Cache-Control: no-cache` that
    // the @shell matcher of ops/Caddyfile sends for exactly those names.
    // Mandatory: without these the game cannot boot offline at all, so a
    // failure here SHOULD reject the install rather than leave a cache that
    // cannot open the game and reports nothing.
    await cache.addAll(SHELL.map(url => new Request(url, { cache: 'reload' })));
    // Best-effort: one sprite that 404s must not cost the whole install.
    // allSettled and not all — the point is precisely that rejections here are
    // absorbed, and `cache.add` per URL so one loss costs one file.
    await Promise.allSettled(REST.map(url => cache.add(new Request(url, { cache: 'reload' }))));
    // Nothing else belongs here on purpose — D2-09, see the header.
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    // Ours only, and never the current name — item 2 of the header. "Ours" is
    // the prefix plus the single pre-prefix name, and nothing else on the
    // origin is touched.
    const ours = k => k.startsWith('dg2-') || k === LEGACY_CACHE;
    await Promise.all(keys.filter(k => ours(k) && k !== CACHE).map(k => caches.delete(k)));
    // Nothing else belongs here on purpose — D2-09, see the header.
  })());
});

// The only path to a version swap. The page decides when it is safe (outside a
// run; from phase 3 on, outside a room too) and posts the message.
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // never ours to answer

  // Belt and braces. The allowlist below already excludes both of these, and
  // that redundancy is the point: two lines that cost nothing and document the
  // intent for whoever reviews this next (INFRA-03; /ws lands in phase 3).
  if (url.pathname.startsWith('/api/') || url.pathname === '/ws') return;

  // ALLOWLIST, NOT DENYLIST. Only paths this build actually emitted are ever
  // answered from the cache. A denylist is always one forgotten route away from
  // storing an authenticated response in a storage that ignores Cache-Control
  // and is not cleared on logout; this rule cannot forget, because it only
  // knows the files the build produced.
  const path = url.pathname;
  const key = PRECACHE_SET.has(path) ? path
    : (path === '/' && PRECACHE_SET.has('/index.html')) ? '/index.html'
      : null;
  if (!key) return; // straight to the network, with no respondWith at all

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(key);
    if (hit) return hit;
    const res = await fetch(e.request);
    // Never store a response that is not ok: thirty seconds of 502 during a
    // deploy would otherwise become the cached index.html forever, because
    // Cache Storage ignores Cache-Control by design (P-2).
    //
    // And the write is held open by the EVENT, not merely started. Returning
    // the response settles the respondWith promise, and the browser is free to
    // terminate this worker the moment it does — a bare `cache.put` would be
    // killed mid-write, leaving a hole in the cache that nothing reports and
    // that only shows itself offline. `waitUntil` is callable from in here
    // because respondWith was already handed this promise synchronously, so
    // the event is still active (WR-08).
    if (res.ok) e.waitUntil(cache.put(key, res.clone()));
    return res;
  })());
});
