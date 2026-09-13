/* Captures the moment of decision on BOTH travel axes at several offsets, so
   alignment readability can be judged by eye rather than assumed. */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'block-stack');
const OUT = path.join(ROOT, '..', '.shots');
fs.mkdirSync(OUT, { recursive: true });
const { server, url } = await serve(ROOT);
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(url + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__blockstack);

// level 45 uses alternating axes, so both directions occur in one run
for (const [axis, label] of [['x', 'x'], ['z', 'z']]) {
  for (const off of [0.0, 0.10, 0.30]) {
    await page.evaluate(async ({ axis, off }) => {
      const api = window.__blockstack;
      api.start(45);
      const g = api.game();
      // build a short tower, trimming so the platform is visibly smaller
      for (let i = 0; i < 5; i++) {
        const a = g.active; if (!a) break;
        const c = a.axis === 'x' ? g.top.x : g.top.z;
        a.pos = c + (i === 2 ? 0.16 : 0);
        api.place();
      }
      // step until the active block is on the requested axis, then freeze it
      let guard = 0;
      while (g.active && g.active.axis !== axis && guard++ < 6) {
        const a = g.active;
        a.pos = (a.axis === 'x' ? g.top.x : g.top.z);
        api.place();
      }
      const a = api.game().active;
      if (a) {
        const c = a.axis === 'x' ? api.game().top.x : api.game().top.z;
        a.pos = c + off;
        a.speed = 0;             // hold still for the capture
      }
    }, { axis, off });
    // let the camera settle; speed 0 keeps the block parked where we put it
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, `read-${label}-${String(off).replace('.', '')}.png`) });
  }
}
await b.close(); server.close();
console.log('readability shots written');
