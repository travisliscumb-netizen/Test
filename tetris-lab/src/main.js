/* Bootstrap: services, screens, the frame loop, offline support and the
   last-resort error net. */

import { app } from './ui/app.js';
import * as title from './ui/screens/title.js';
import * as classic from './ui/screens/classic.js';
import * as play from './ui/screens/play.js';
import * as lab from './ui/screens/lab.js';
import * as detail from './ui/screens/detail.js';
import * as editor from './ui/screens/editor.js';
import * as progress from './ui/screens/progress.js';
import * as settings from './ui/screens/settings.js';
import * as help from './ui/screens/help.js';
import { Debug } from './ui/debug.js';

function boot() {
  app.init();
  app.register('title', title);
  app.register('classic', classic);
  app.register('play', play);
  app.register('lab', lab);
  app.register('detail', detail);
  app.register('editor', editor);
  app.register('progress', progress);
  app.register('settings', settings);
  app.register('help', help);
  app.debug = new Debug(app);
  if (new URLSearchParams(location.search).has('debug')) app.debug.toggle(true);

  document.getElementById('boot')?.remove();
  const start = new URLSearchParams(location.search).get('screen');
  app.go(start && app.screens[start] && start !== 'play' && start !== 'detail' && start !== 'editor' ? start : 'title', {}, { noHistory: true });

  let last = performance.now();
  const loop = (t) => {
    const dt = Math.min(0.1, Math.max(0, (t - last) / 1000));
    last = t;
    app.frame(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // Test / tooling hook (read-only use by the automated playtest).
  window.__prismfall = { app };

  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !location.search.includes('nosw')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is best-effort */ });
  }
}

addEventListener('error', (e) => {
  console.error('[prismfall] uncaught', e.error || e.message);
});
addEventListener('unhandledrejection', (e) => {
  console.error('[prismfall] unhandled rejection', e.reason);
});

try {
  boot();
} catch (e) {
  console.error(e);
  const b = document.getElementById('boot');
  if (b) b.innerHTML = '<p>Prismfall could not start. Please reload the page.</p>';
}
