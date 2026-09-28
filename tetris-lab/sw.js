/* Offline support. The whole game is static text files plus icons, so it is
   precached on install and served cache-first; the web font is cached on
   first use. tests/engine.test.mjs asserts that SHELL lists every shipped
   file, so this list cannot silently drift. */

const VERSION = 'prismfall-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './src/audio/audio.js',
  './src/engine/assist.js',
  './src/engine/board.js',
  './src/engine/bot.js',
  './src/engine/clearing.js',
  './src/engine/game.js',
  './src/engine/lattice.js',
  './src/engine/pieces.js',
  './src/engine/randomizer.js',
  './src/engine/rng.js',
  './src/engine/rules.js',
  './src/input.js',
  './src/lab/claude.js',
  './src/lab/critic.js',
  './src/lab/designer.js',
  './src/lab/generator.js',
  './src/lab/refine.js',
  './src/lab/simulate.js',
  './src/lab/validate.js',
  './src/lab/worker.js',
  './src/main.js',
  './src/render/background.js',
  './src/render/blocks.js',
  './src/render/board.js',
  './src/render/fx.js',
  './src/render/theme.js',
  './src/save.js',
  './src/styles.css',
  './src/ui/app.js',
  './src/ui/debug.js',
  './src/ui/demo.js',
  './src/ui/dom.js',
  './src/ui/labplay.js',
  './src/ui/labworker.js',
  './src/ui/screens/classic.js',
  './src/ui/screens/detail.js',
  './src/ui/screens/editor.js',
  './src/ui/screens/help.js',
  './src/ui/screens/lab.js',
  './src/ui/screens/play.js',
  './src/ui/screens/progress.js',
  './src/ui/screens/settings.js',
  './src/ui/screens/title.js',
  './src/ui/thumbs.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
  if (url.hostname === 'api.anthropic.com') return; // never cache API traffic
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !isFont) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: url.origin === location.origin }).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
      return hit || net;
    })
  );
});
