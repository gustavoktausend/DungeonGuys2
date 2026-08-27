// sw.js — DungeonGuys service worker
// Code files go network-first (deploys are picked up immediately, cache is the
// offline fallback); heavy static assets go cache-first.
const CACHE = 'dungeonguys-v3';

const PRECACHE = [
  '.',
  'index.html',
  'style.css',
  'save.js',
  'audio.js',
  'config.js',
  'ui.js',
  'engine.js',
  'combat.js',
  'entities.js',
  'items.js',
  'render.js',
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
