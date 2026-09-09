/**
 * Records a real working session, on the built artifact, with real route data.
 *
 * Not a mockup and not a storyboard: this drives the actual interface through
 * a plausible mid-morning on the route — completing stops, opening a property,
 * reordering, applying an optimisation, working the map, switching themes —
 * and records what the browser actually painted.
 */

import { chromium, devices } from 'playwright';
import { serve } from '../tools/serve.mjs';
import fs from 'node:fs';
import path from 'node:path';

const BUNDLE = process.env.BUNDLE;
const OUT = process.env.OUT || path.resolve('recording');
if (!BUNDLE || !fs.existsSync(BUNDLE)) { console.error('Set BUNDLE=<route backup json>'); process.exit(2); }
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const { server, port } = await serve(0);
const BASE = `http://127.0.0.1:${port}/`;
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

// Even dimensions on purpose: an odd width makes the video encoder rescale the
// frame, which letterboxes the bottom of the page into a grey band.
const VIEW = { width: 390, height: 844 };
const ctx = await browser.newContext({
  ...devices['iPhone 14 Pro'],
  viewport: VIEW,
  deviceScaleFactor: 2,
  locale: 'en-CA',
  timezoneId: 'America/Toronto',
  colorScheme: 'dark',
  recordVideo: { dir: OUT, size: VIEW },
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const beat = (ms = 900) => page.waitForTimeout(ms);
const step = async (label, fn) => { console.log(`  ${label}`); await fn(); };

// 09:41 in the operator's timezone, not the container's. Node runs in UTC
// here, so setHours() would have put the demo day at 05:41 Toronto and made
// every completion read as the small hours of the morning.
try {
  const d = new Date();
  d.setUTCHours(13, 41, 0, 0);          // 09:41 EDT
  await page.clock.install({ time: d });
  await page.clock.resume();
} catch { /* older Playwright: uses the machine clock */ }

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.dataset.booted === 'true', { timeout: 20000 });

// Chromium's screencast — which is what Playwright records video from — does
// not paint the last ~87 CSS px of the viewport, so the tab bar came out as a
// grey band. Screenshots of the same page are correct, so this is a capture
// limitation rather than a layout bug. Confining the app to the region that
// does get captured makes the recording show the whole interface; it changes
// nothing but the height of the simulated phone.
const LOST_STRIP = 88;
await page.addStyleTag({ content: `#app { inset: 0 0 ${LOST_STRIP}px 0 !important; }` });
await page.waitForTimeout(300);
await beat(1400);

await step('first run -> restore the real route', async () => {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose backup file' }).click();
  await (await chooser).setFiles(BUNDLE);
  await page.waitForSelector('text=Restore this backup?', { timeout: 10000 });
  await beat(2600);                       // let the reconciliation be readable
  await page.getByRole('button', { name: 'Restore now' }).click();
  await page.waitForFunction(() => window.__teds?.model?.builtAt > 0, { timeout: 20000 });
  await beat(1200);
});

await step('put the day mid-morning', async () => {
  await page.evaluate(async () => {
    const a = window.__teds;
    const stops = a.computeStops();
    const start = Date.now() - 2.2 * 3600e3;
    await a.store.startDay(a.date, a.crew, start);
    let t = start;
    for (let i = 0; i < Math.min(6, stops.length - 6); i++) {
      t += (13 + Math.random() * 8) * 60000;
      await a.store.completeStop(stops[i].id, { date: a.date, crew: a.crew, at: t });
    }
    const next = a.computeStops().find((s) => s.status === 'pending');
    if (next && Number.isFinite(next.lat)) {
      a.location.position = { lat: next.lat + 0.0035, lng: next.lng + 0.0045, accuracy: 13, at: Date.now() };
      a.location.state = 'live';
    }
    await a.rebuildModel();
    a.refresh();
  });
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await beat(2200);
});

await step('complete the current stop', async () => {
  await page.locator('.nextcard button:has-text("Done")').click();
  await beat(2400);                        // particles, counter, card change
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await beat(700);
});

await step('open the property sheet', async () => {
  await page.locator('#view .stop').nth(9).click();
  await beat(2400);
  await page.locator('.sheet .scroll').evaluate((el) => el.scrollTo({ top: 320, behavior: 'smooth' }));
  await beat(1800);
  await page.keyboard.press('Escape');
  await beat(1000);
});

await step('reorder a stop by dragging', async () => {
  await page.evaluate(() => window.__teds.goTo('route'));
  await beat(1200);
  await page.getByRole('button', { name: 'Reorder' }).click();
  await beat(900);
  await page.evaluate(() => { document.getElementById('view').scrollTop = 0; });
  await beat(400);
  const rowH = await page.evaluate(() => document.querySelector('#view .stop')?.getBoundingClientRect().height || 64);
  const g = await page.locator('#view .grip').nth(0).boundingBox();
  if (g) {
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await beat(450);
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2 + (rowH * 3.1 * i) / 20);
      await page.waitForTimeout(26);
    }
    await beat(400);
    await page.mouse.up();
  }
  await beat(1600);
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await page.getByRole('button', { name: 'Done' }).first().click().catch(() => {});
  await beat(900);
});

await step('apply the route optimisation', async () => {
  const has = await page.evaluate(() => !!(window.__teds.optimization?.changed));
  if (has) {
    await page.evaluate(() => { document.getElementById('view').scrollTop = 99999; });
    await beat(1400);
    await page.getByRole('button', { name: 'Apply' }).first().click().catch(() => {});
    await beat(2200);
    await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  }
  await beat(600);
});

await step('work the map', async () => {
  await page.evaluate(() => window.__teds.goTo('map'));
  await beat(2200);
  const box = await page.locator('#view canvas').boundingBox();
  if (box) {
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 14; i++) { await page.mouse.move(cx - i * 6, cy + i * 4); await page.waitForTimeout(20); }
    await page.mouse.up();
    await beat(1200);
    await page.locator('#view .mapctl .iconbtn').nth(2).click();   // zoom in
    await beat(1400);
    const hit = await page.evaluate(() => {
      const a = window.__teds, eng = a.screen.engine;
      const stop = a.computeStops().find((s) => s.status === 'pending' && Number.isFinite(s.lat));
      const p = eng.project(stop.lat, stop.lng), r = eng.canvas.getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    });
    await page.mouse.click(hit.x, hit.y);
    await beat(2400);
    await page.locator('#view .mapctl .iconbtn').nth(1).click();   // fit whole route
    await beat(2000);
  }
});

await step('what it has learned', async () => {
  await page.evaluate(() => window.__teds.goTo('insights'));
  await beat(2400);
  await page.evaluate(() => document.getElementById('view').scrollTo({ top: 760, behavior: 'smooth' }));
  await beat(2600);
});

await step('daylight theme', async () => {
  await page.evaluate(() => window.__teds.goTo('settings'));
  await beat(1200);
  await page.evaluate(() => window.__teds.updateSettings({ theme: 'day' }));
  await beat(1600);
  await page.evaluate(() => window.__teds.goTo('today'));
  await beat(2600);
});

await step('larger text', async () => {
  await page.evaluate(() => window.__teds.updateSettings({ textSize: 'larger' }));
  await beat(2400);
  await page.evaluate(() => window.__teds.updateSettings({ textSize: 'standard', theme: 'night' }));
  await beat(2000);
});

await step('back to the day', async () => {
  await page.evaluate(() => window.__teds.goTo('today'));
  await beat(2600);
});

console.log(errors.length ? `  CONSOLE ERRORS: ${errors.slice(0, 3).join(' | ')}` : '  no page errors');
const video = page.video();
await ctx.close();
await browser.close();
server.close();
const src = await video.path();
const dest = path.join(OUT, 'teds-route-session.webm');
if (src !== dest) fs.renameSync(src, dest);
console.log(`\n  ${dest}  ${(fs.statSync(dest).size / 1048576).toFixed(1)} MB`);
