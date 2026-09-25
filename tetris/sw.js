/* Offline support: precache the whole game (it is small and fully static),
   serve cache-first, refresh the cache in the background. Bump VERSION on
   every release so old caches are dropped. tests/e2e.mjs checks that this
   list matches the files on disk. */
const VERSION = 'tetris3d-v1';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'src/ui.css',
  'src/main.js',
  'src/engine.js',
  'src/pieces.js',
  'src/controls.js',
  'src/ai.js',
  'src/audio.js',
  'src/save.js',
  'src/render.js',
  'vendor/three.js',
  'fonts/orbitron-latin-500-normal.woff2',
  'fonts/orbitron-latin-700-normal.woff2',
  'fonts/orbitron-latin-900-normal.woff2',
  'fonts/exo-2-latin-400-normal.woff2',
  'fonts/exo-2-latin-600-normal.woff2',
  'fonts/exo-2-latin-800-normal.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon-180.png',
  'icons/favicon-32.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const refresh = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (hit) {
        e.waitUntil(refresh);
        return hit;
      }
      return (await refresh) || new Response('Offline', { status: 503, statusText: 'Offline' });
    })
  );
});
