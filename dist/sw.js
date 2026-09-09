/**
 * Service worker.
 *
 * Two jobs, kept strictly apart:
 *
 *   1. The application shell is precached and served cache-first, so the app
 *      opens with no network at all. A version bump replaces it wholesale;
 *      there is no partial-update state to reason about.
 *   2. Map tiles are cached opportunistically as they are fetched, in a
 *      separate bounded cache. A route driven once renders offline the next
 *      day, which is the difference between a map that works in a rural dead
 *      spot and one that does not.
 *
 * Nothing else is intercepted. In particular the weather request is left alone
 * — a stale forecast served from a cache would be worse than none, and the
 * weather service does its own explicit caching with a timestamp it can check.
 */

const VERSION = 'teds-route-41c1e6a45351';
const SHELL = `${VERSION}-shell`;
const TILES = 'teds-route-tiles-v1';
const TILE_LIMIT = 900;

const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/app.js",
  "./assets/app.css",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // addAll fails the whole install if any single file 404s, which is the
    // behaviour we want: a half-cached shell is a broken offline app.
    await cache.addAll(SHELL_FILES);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== SHELL && k !== TILES ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (isTile(url)) { e.respondWith(tileStrategy(req)); return; }
  if (url.origin !== self.location.origin) return;   // weather and anything else: untouched
  e.respondWith(shellStrategy(req));
});

function isTile(url) {
  return /basemaps\.cartocdn\.com$/.test(url.hostname) ||
         /tile\.openstreetmap\.org$/.test(url.hostname);
}

/**
 * Tiles: cache first, then network, and on failure an honest error.
 *
 * It is tempting to substitute a blank placeholder image so a missing tile is
 * not a broken-image box. Do not: the image then *loads* successfully as far
 * as the page is concerned, the map engine counts it as a drawn tile, and its
 * offline fallback — the one that says imagery is missing — never runs. A
 * failed tile must fail, so the renderer can tell the truth about it.
 */
async function tileStrategy(req) {
  const cache = await caches.open(TILES);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req, { mode: 'cors', credentials: 'omit' });
    if (res && (res.ok || res.type === 'opaque')) {
      cache.put(req, res.clone()).then(() => trimTiles(cache)).catch(() => {});
      return res;
    }
    return res;
  } catch {
    return new Response(null, { status: 504, statusText: 'Tile unavailable offline' });
  }
}

/** Shell: cache first for instant open, revalidated in the background. */
async function shellStrategy(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) {
    fetch(req).then((res) => { if (res.ok) cache.put(req, res); }).catch(() => {});
    return hit;
  }
  try {
    const res = await fetch(req);
    if (res.ok && new URL(req.url).origin === self.location.origin) cache.put(req, res.clone());
    return res;
  } catch {
    const fallback = await cache.match('./index.html');
    if (fallback && req.mode === 'navigate') return fallback;
    return new Response('Offline and not cached.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

/** Keeps the tile cache bounded, oldest first. */
async function trimTiles(cache) {
  const keys = await cache.keys();
  if (keys.length <= TILE_LIMIT) return;
  const excess = keys.length - TILE_LIMIT;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}
