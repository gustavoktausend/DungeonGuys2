// sw.js — DungeonGuys2 service worker
// Code files go network-first (deploys are picked up immediately, cache is the
// offline fallback); heavy static assets go cache-first.
//
// Task 20 debt #1 (task-20-brief.md): the scaffolding task copied ORIG's
// sw.js verbatim, precaching per-file sources (`engine.js`, `combat.js`,
// `entities.js`, `items.js`, `render.js`, `ui.js`, `config.js`, `save.js`,
// `audio.js`) that don't exist in this Vite-built app — `cache.addAll`
// rejects the whole install if any single URL 404s, so this would have
// broken PWA install outright the moment something registered it.
//
// Vite bundles everything into one hashed JS + one hashed CSS file per
// build (`assets/index-<hash>.js/.css` — confirmed via `npm run build`),
// so there is no stable filename to precache for them, and no build step
// here rewrites this hand-written file with the current hash. That's
// exactly why the network-first branch below still exists: those hashed
// bundles are cached lazily, on first fetch, the same as any other
// non-precached GET. Only the paths that never change build-to-build are
// listed explicitly.
const CACHE = 'dungeonguys2-v1';

const PRECACHE = [
  '.',
  'index.html',
  'manifest.json',
  'assets/dungeon_tileset.png',
  'assets/copRobo.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

const CACHE_FIRST = /\.(png|woff2?)$|fonts\.(googleapis|gstatic)\.com/;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  if (CACHE_FIRST.test(e.request.url)) {
    e.respondWith(
      caches.match(e.request).then(hit => hit ||
        fetch(e.request).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        })
      )
    );
    return;
  }

  // network-first for everything else (html/js/css)
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
