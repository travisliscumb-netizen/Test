/* Visual inspection tour: captures every screen at several viewports into
   .shots/ and fails on any console error or page exception.

     node tools/screens.mjs            all viewports
     node tools/screens.mjs phone      one viewport by name */

import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = createRequire('/opt/node22/lib/node_modules/')('playwright'); }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.SHOT_DIR || path.join(ROOT, '.shots');
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, touch: false },
  laptop: { width: 1280, height: 720, touch: false },
  tablet: { width: 1024, height: 768, touch: true },
  phone: { width: 390, height: 844, touch: true },
  small: { width: 360, height: 640, touch: true },
  landscape: { width: 844, height: 390, touch: true }
};

const only = process.argv[2];
const list = only ? { [only]: VIEWPORTS[only] } : VIEWPORTS;
const { server, url } = await serve(ROOT);
const browser = await playwright.chromium.launch();
let problems = 0;

const IGNORE = [/fonts\.(googleapis|gstatic)/, /ERR_CERT/, /net::ERR_/];

for (const [name, vp] of Object.entries(list)) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.touch, isMobile: vp.touch && vp.width < 900 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((r) => r.test(m.text()))) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (!IGNORE.some((x) => x.test(r.url()))) errors.push(`requestfailed: ${r.url()}`); });
  await page.addInitScript(() => {
    localStorage.setItem('prismfall.save', JSON.stringify({ v: 2, settings: { seenIntro: true } }));
  });
  await page.goto(`${url}/index.html?nosw`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__prismfall?.app?.screenName === 'title');
  const shot = async (label, wait = 700) => { await page.waitForTimeout(wait); await page.screenshot({ path: path.join(OUT, `${name}-${label}.png`) }); };
  const go = async (screen, params = {}) => { await page.evaluate(([s, p]) => window.__prismfall.app.go(s, p), [screen, params]); };

  await shot('title', 2600);
  await go('classic'); await shot('classic');
  await go('play', { kind: 'classic', mode: 'marathon' });
  // Let the debug autoplay bot play so the well has content.
  await page.evaluate(() => { const d = window.__prismfall.app.debug; d.autoplay = true; });
  await shot('play', 9000);
  await page.evaluate(() => window.__prismfall.app.screen.session && (window.__prismfall.app.debug.autoplay = false));
  await page.keyboard.press('Escape');
  await shot('pause', 500);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const s = window.__prismfall.app.screen.session; s.game.gameOver('debug'); });
  await shot('gameover', 2200);
  await page.evaluate(() => document.querySelectorAll('#modal-root .overlay').forEach((o) => o.remove()));
  await go('lab'); await shot('lab-design');
  await go('settings', { tab: 'visuals' }); await shot('settings-visuals');
  await go('settings', { tab: 'controls' }); await shot('settings-controls');
  await go('progress'); await shot('progress');
  await go('help'); await shot('help');
  if (errors.length) { problems += errors.length; console.log(`${name}: ${errors.length} error(s)\n  ${errors.slice(0, 8).join('\n  ')}`); }
  else console.log(`${name}: clean`);
  await ctx.close();
}

await browser.close();
server.close();
console.log(`shots in ${OUT}`);
process.exit(problems ? 1 : 0);
