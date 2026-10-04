/* Offline support. Network-first for everything: the game is a set of ES
   modules that must all come from the same deploy, so serving fresh files
   whenever the network is up avoids ever mixing versions. The cache is only
   the offline fallback, refreshed on every successful fetch. */

const CACHE = 'pacman-v1';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'src/ui.css',
  'src/main.js',
  'src/engine.js',
  'src/maze.js',
  'src/mazeshape.js',
  'src/bot.js',
  'src/render.js',
  'src/sprites.js',
  'src/audio.js',
  'src/input.js',
  'src/save.js',
  'src/fonts/press-start-2p-latin.woff2',
  'icons/favicon-32.png',
  'icons/favicon-16.png',
  'icons/apple-touch-icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
