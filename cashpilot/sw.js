// Cashpilot service worker.
//
// Strategy: network-first for the app shell (so a deploy is picked up on the
// next load rather than being pinned to a stale cache), cache-first for static
// assets. API and Dropbox traffic is never cached — stale financial data or a
// replayed auth response would be worse than being offline.

const VERSION = 'cashpilot-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/styles.css',
  './src/app.js',
  './src/config.js',
  './src/util.js',
  './src/model.js',
  './src/analytics.js',
  './src/insights.js',
  './src/charts.js',
  './src/store.js',
  './src/actions.js',
  './src/idb.js',
  './src/blobs.js',
  './src/camera.js',
  './src/dropbox.js',
  './src/anthropic.js',
  './src/agent.js',
  './src/tools.js',
  './icons/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      // addAll rejects the whole install if any single file 404s; tolerate that
      // so one missing icon cannot leave the app with no worker at all.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never cache credentials, API responses, or user files.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }
        return new Response('Offline and not cached.', { status: 503, statusText: 'Offline' });
      }),
  );
});
