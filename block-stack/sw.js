/* Offline cache. The whole game is a handful of small text files plus icons, so
   it is precached on install and served cache-first: after one visit the game
   launches from the Home Screen with no network at all. */

const VERSION = 'block-stack-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/ui.css',
  './src/main.js',
  './src/engine.js',
  './src/config.js',
  './src/render.js',
  './src/audio.js',
  './src/save.js',
  './src/icon.js',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon-180.png',
  './icons/apple-touch-icon-167.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
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
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        // refresh in the background so a deploy lands on the next launch
        fetch(req).then((res) => {
          if (res && res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
