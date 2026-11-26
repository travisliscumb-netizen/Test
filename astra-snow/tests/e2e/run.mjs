// End-to-end tests in Chromium with iPhone emulation, against the BUILT app.
//
//   npm run build && npx vite preview --port 5181 &
//   ROUTE_KEY=$(cat private/route.key) node tests/e2e/run.mjs
//
// Needs the private route key (the sealed route is real data). Uses the
// globally installed Playwright. Screenshots go to $SHOTS (default ./.shots).

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const G = execSync('npm root -g').toString().trim();
const { chromium, devices } = await import(path.join(G, 'playwright/index.mjs'));
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5181';
const KEY = process.env.ROUTE_KEY ?? fs.readFileSync(path.resolve(import.meta.dirname, '../../private/route.key'), 'utf8').trim();
const SHOTS = process.env.SHOTS ?? path.resolve(import.meta.dirname, '../../.shots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const browser = await chromium.launch();
async function test(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`PASS  ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ name, ok: false, err: String(e?.message ?? e) });
    console.log(`FAIL  ${name}\n      ${String(e?.message ?? e).split('\n')[0]}`);
  }
}
function assert(c, msg) {
  if (!c) throw new Error(msg);
}

const HOME = { latitude: 44.40065, longitude: -79.67987, accuracy: 6 };
async function phone(device = 'iPhone 14', extra = {}) {
  const ctx = await browser.newContext({ ...devices[device], geolocation: HOME, permissions: ['geolocation'], ...extra });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // Application errors only: a third-party live feed failing (CORS-less error
    // responses, network drops) is handled by the app and tested separately.
    if (m.type() === 'error' && !/WebGL|GL Driver|Failed to load resource|blocked by CORS policy|net::ERR_/.test(m.text())) errors.push(m.text());
  });
  return { ctx, page, errors };
}
const app = (page, expr) => page.evaluate(expr);
const state = (page) =>
  app(page, () => {
    const a = window.__astra;
    return { screen: a.screen, done: a.state?.doneCount, next: a.state ? [...a.state.order].find((s) => a.state.stops.get(s).status === 'pending') : null, events: a.events.length, durable: a.store?.durable };
  });
async function begin(page) {
  await page.goto(`${BASE}/#k=${KEY}`);
  await page.waitForFunction(() => window.__astra?.screen === 'preflight' || window.__astra?.screen === 'drive', null, { timeout: 30_000 });
  if ((await state(page)).screen === 'preflight') {
    await page.getByRole('button', { name: /BEGIN SHIFT|RESUME SHIFT/ }).click();
    await page.waitForFunction(() => window.__astra.screen === 'drive');
  }
}

// ---------------------------------------------------------------- tests
await test('wrong key is refused with a reason; nothing is shown', async () => {
  const { ctx, page } = await phone();
  await page.goto(`${BASE}/#k=${'A'.repeat(43)}`);
  await page.waitForSelector('.screen.unlock.show');
  const txt = await page.locator('.screen').innerText();
  assert(/does not open this route/i.test(txt), `got: ${txt}`);
  assert(!(await page.content()).includes('Davidson'), 'route text leaked on wrong key');
  await ctx.close();
});

await test('unlock via fragment: key leaves the URL, preflight verifies 162/162', async () => {
  const { ctx, page, errors } = await phone();
  const t0 = Date.now();
  await page.goto(`${BASE}/#k=${KEY}`);
  await page.waitForFunction(() => window.__astra?.screen === 'preflight', null, { timeout: 30_000 });
  const bootMs = Date.now() - t0;
  assert((await page.evaluate(() => location.hash)) === '', 'key still in URL');
  const txt = await page.locator('.screen').innerText();
  assert(txt.includes('162/162 stops'), txt);
  await page.screenshot({ path: `${SHOTS}/e2e-preflight.png` });
  assert(errors.length === 0, errors.join('; '));
  console.log(`      boot to preflight: ${bootMs} ms`);
  await ctx.close();
});

await test('a full Done / Undo cycle, persisted across a reload', async () => {
  const { ctx, page, errors } = await phone();
  await begin(page);
  for (let i = 1; i <= 3; i++) {
    await page.locator('button.done').click();
    await page.waitForFunction((n) => window.__astra.state.doneCount === n, i);
    await page.waitForTimeout(750); // real taps are minutes apart; the debounce is 700 ms
  }
  let s = await state(page);
  assert(s.done === 3 && s.next === 4, JSON.stringify(s));
  await page.getByRole('button', { name: 'Undo last action' }).click();
  await page.waitForFunction(() => window.__astra.state.doneCount === 2);
  s = await state(page);
  assert(s.done === 2 && s.next === 3, `after undo ${JSON.stringify(s)}`);
  await page.reload();
  await page.waitForFunction(() => window.__astra?.screen === 'drive', null, { timeout: 30_000 });
  s = await state(page);
  assert(s.done === 2 && s.next === 3, `after reload ${JSON.stringify(s)}`);
  assert(s.durable === true, 'storage not durable');
  assert(errors.length === 0, errors.join('; '));
  await ctx.close();
});

await test('Done latency: tap to next stop on screen', async () => {
  const { ctx, page } = await phone();
  await begin(page);
  // Measured inside the page, from the click event to the next stop's number
  // in the DOM (Playwright's own click adds actionability waits that depend
  // on software-rendered WebGL frame times in CI, not on the app).
  const ms = await page.evaluate(async () => {
    const seqEl = document.querySelector('.next .seq');
    const before = seqEl.textContent;
    const t0 = performance.now();
    document.querySelector('button.done').click();
    while (seqEl.textContent === before) await new Promise((r) => setTimeout(r, 1));
    return performance.now() - t0;
  });
  console.log(`      Done → next stop in the DOM: ${ms.toFixed(0)} ms (incl. IndexedDB commit)`);
  assert(ms < 60, `slow: ${ms} ms`);
  await ctx.close();
});

await test('defer and blocked go to the return list; the route is not reordered', async () => {
  const { ctx, page } = await phone();
  await begin(page);
  const first = (await state(page)).next;
  await page.getByRole('button', { name: 'LATER' }).click();
  await page.waitForFunction(() => window.__astra.events.length >= 2);
  const second = (await state(page)).next;
  await page.getByRole('button', { name: 'BLOCKED' }).click();
  await page.getByRole('button', { name: 'CAR IN DRIVEWAY' }).click();
  await page.waitForFunction(() => window.__astra.events.length >= 3);
  const s = await state(page);
  assert(s.next !== first && s.next !== second, JSON.stringify(s));
  await page.locator('button.mode').click();
  await page.waitForSelector('.sheet .tab-route');
  const txt = await page.locator('.sheet-body').innerText();
  assert(/RETURN LIST · 2/.test(txt), txt.slice(0, 300));
  assert(/TED'S ROUTE \(ORIGINAL\)/.test(txt), 'order label');
  const rows = await page.locator('.sheet-body .row').count();
  assert(rows === 162 + 2, `rows ${rows}`);
  await page.screenshot({ path: `${SHOTS}/e2e-park-route.png` });
  await ctx.close();
});

await test('a double-bounce on DONE clears one driveway, not two', async () => {
  const { ctx, page } = await phone();
  await begin(page);
  await page.evaluate(() => {
    const b = document.querySelector('button.done');
    b.click();
    b.click();
  });
  await page.waitForTimeout(300);
  const s = await state(page);
  assert(s.done === 1, `done ${s.done}`);
  await ctx.close();
});

await test('street observation is recorded with the Done', async () => {
  const { ctx, page } = await phone();
  await begin(page);
  await page.locator('button.street').click(); // → plowed
  await page.waitForFunction(() => window.__astra.streetChip === 'plowed');
  await page.locator('button.done').click();
  await page.waitForFunction(() => window.__astra.state.doneCount === 1);
  const obs = await app(page, () => [...window.__astra.state.streetObs.values()].map((o) => o.state));
  assert(obs.includes('plowed'), JSON.stringify(obs));
  await ctx.close();
});

await test('offline: Done still commits; City feed is labelled, never faked live', async () => {
  const { ctx, page } = await phone();
  await begin(page);
  await page.evaluate(() => window.__astra.pollCity()); // settle any in-flight poll first
  await ctx.setOffline(true);
  await page.evaluate(() => window.__astra.pollCity());
  await page.locator('button.done').click();
  await page.waitForFunction(() => window.__astra.state.doneCount >= 1);
  const s = await state(page);
  assert(s.done >= 1, 'done not committed offline');
  const err = await app(page, () => window.__astra.city.error);
  assert(err && /offline|could not|unavailable|fetch/i.test(err), `city error: ${err}`);
  await ctx.setOffline(false);
  await ctx.close();
});

await test('GPS: arriving and dwelling at the next driveway changes the phase', async () => {
  const { ctx, page } = await phone();
  await page.clock.install();
  await begin(page);
  const target = await app(page, () => {
    const a = window.__astra;
    const seq = [...a.state.order].find((s) => a.state.stops.get(s).status === 'pending');
    return a.stop(seq).target;
  });
  for (let i = 0; i < 12; i++) {
    await page.evaluate(([lng, lat, i]) => window.__astra.onFix({ lng, lat, accuracy: 5, t: Date.now(), speed: 0.2, heading: null }), [target[0], target[1], i]);
    await page.clock.fastForward(1000);
  }
  const phase = await app(page, () => window.__astra.view.phase);
  assert(phase === 'at', `phase ${phase}`);
  await page.clock.fastForward(1000);
  const label = await page.locator('.phase').innerText();
  assert(/AT DRIVEWAY/.test(label), label);
  await page.screenshot({ path: `${SHOTS}/e2e-at-driveway.png` });
  await ctx.close();
});

await test('a wildly inaccurate fix pauses proximity and says so', async () => {
  const { ctx, page } = await phone();
  await begin(page);
  await page.evaluate(() => window.__astra.onFix({ lng: -79.68, lat: 44.4, accuracy: 120, t: Date.now(), speed: null, heading: null }));
  const v = await app(page, () => window.__astra.view.gpsUsable);
  assert(v === false, 'should be unusable');
  const pip = await page.locator('.pip').first().innerText();
  assert(/GPS 120m/.test(pip), pip);
  await ctx.close();
});

await test('park tabs render: intel semantics, plan analysis, system integrity', async () => {
  const { ctx, page, errors } = await phone();
  await begin(page);
  await page.locator('button.mode').click();
  await page.waitForSelector('.sheet .tabs');
  await page.locator('.tab[data-tab="intel"]').click({ timeout: 8000 });
  let txt = await page.locator('.sheet-body').innerText();
  assert(/plowed OR salted/.test(txt), 'missing serviced≠plowed explanation');
  await page.screenshot({ path: `${SHOTS}/e2e-intel.png` });
  await page.locator('.tab[data-tab="plan"]').click({ timeout: 8000 });
  await page.locator('.sheet-body button.wide').first().click({ timeout: 8000 });
  await page.waitForFunction(() => window.__astra.plan !== null, null, { timeout: 30_000 });
  await page.waitForTimeout(300);
  txt = await page.locator('.sheet-body').innerText();
  assert(/CURRENT ORDER/.test(txt) && /STREET-BLOCK PLAN/.test(txt), txt.slice(0, 200));
  await page.screenshot({ path: `${SHOTS}/e2e-plan.png` });
  await page.locator('.tab[data-tab="system"]').click({ timeout: 8000 });
  txt = await page.locator('.sheet-body').innerText();
  assert(/162 of 162 rows/.test(txt) && /162\/162 City points/.test(txt), txt.slice(0, 300));
  await page.screenshot({ path: `${SHOTS}/e2e-system.png` });
  assert(errors.length === 0, errors.join('; '));
  await ctx.close();
});

await test('stop sheet shows the verbatim line and offers corner-lot confirmation', async () => {
  const { ctx, page } = await phone();
  await begin(page);
  const amb = await app(page, () => window.__astra.route.stops.find((s) => s.driveways[0]?.streetConfidence === 'ambiguous')?.seq);
  assert(amb, 'no ambiguous stop in data');
  await page.locator('button.mode').click();
  await page.locator('.sheet-body .row').filter({ hasText: String(amb) }).first().click();
  await page.waitForSelector('.modal.show .card');
  const txt = await page.locator('.modal .card').innerText();
  assert(/VERBATIM/.test(txt) && /WHICH STREET IS THE DRIVEWAY ON/.test(txt), txt.slice(0, 300));
  await page.screenshot({ path: `${SHOTS}/e2e-stop-sheet.png` });
  await ctx.close();
});

await test('backup export → import round trip', async () => {
  const { ctx, page } = await phone();
  await begin(page);
  await page.locator('button.done').click();
  await page.locator('button.mode').click();
  await page.getByRole('button', { name: 'SYSTEM' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'EXPORT BACKUP' }).click()]);
  const file = path.join(SHOTS, 'backup.json');
  await dl.saveAs(file);
  const body = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert(body.schema === 'astra.backup/1' && body.events.length >= 2, 'bad backup');
  const ctx2 = await browser.newContext({ ...devices['iPhone 14'] });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/#k=${KEY}`);
  await p2.waitForFunction(() => window.__astra?.screen === 'preflight', null, { timeout: 30_000 });
  const msg = await p2.evaluate(async (text) => window.__astra.importBackup(new File([text], 'b.json')), fs.readFileSync(file, 'utf8'));
  assert(/Restored \d+ events/.test(msg), msg);
  fs.unlinkSync(file);
  await ctx2.close();
  await ctx.close();
});

await test('a damaged route file is refused, not half-loaded', async () => {
  const { ctx, page } = await phone();
  await page.route('**/data/route.sealed.json', async (r) => {
    const res = await r.fetch();
    const j = await res.json();
    j.data = j.data.slice(0, -10) + 'AAAAAAAAAA';
    await r.fulfill({ response: res, body: JSON.stringify(j) });
  });
  await page.goto(`${BASE}/#k=${KEY}`);
  await page.waitForSelector('.screen.unlock.show');
  assert(/does not open|integrity/i.test(await page.locator('.screen').innerText()), 'no refusal');
  await ctx.close();
});

for (const dev of ['iPhone SE', 'iPhone 14', 'iPhone 15 Pro Max', 'iPhone 14 landscape']) {
  await test(`layout fits without horizontal scroll: ${dev}`, async () => {
    const { ctx, page } = await phone(dev);
    await begin(page);
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => {
      const done = document.querySelector('button.done').getBoundingClientRect();
      const chips = [...document.querySelectorAll('.actions .chip')].map((c) => c.getBoundingClientRect());
      return { sw: document.documentElement.scrollWidth, w: innerWidth, h: innerHeight, doneH: done.height, doneBottom: done.bottom, minChip: Math.min(...chips.map((c) => c.height)), chipsBottom: Math.max(...chips.map((c) => c.bottom)) };
    });
    await page.screenshot({ path: `${SHOTS}/e2e-drive-${dev.replace(/\s+/g, '-')}.png` });
    // Every control inside the viewport; nothing scrolled sideways, on every screen and tab.
    const inside = async (label) => {
      const r = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('.rail > *, .hud button, .tabs .tab, .sheet-body > *, .map-ctl .ctl')) {
          const b = el.getBoundingClientRect();
          if (b.width === 0 || getComputedStyle(el).display === 'none') continue;
          if (b.left < -1 || b.right > innerWidth + 1) out.push(`${el.className || el.tagName} [${Math.round(b.left)},${Math.round(b.right)}]`);
        }
        for (const el of document.querySelectorAll('.rail .pip, .rail .mode, .rail .clock')) {
          if (getComputedStyle(el).display !== 'none' && el.scrollWidth > el.clientWidth + 1) out.push(`truncated: ${el.textContent}`);
        }
        const app = document.getElementById('app');
        const body = document.querySelector('.sheet-body');
        if (app.scrollLeft !== 0) out.push(`#app scrolled ${app.scrollLeft}`);
        if (body && body.scrollWidth > body.clientWidth + 1 && getComputedStyle(document.querySelector('.sheet')).display !== 'none') out.push(`sheet-body overflow ${body.scrollWidth}>${body.clientWidth}`);
        return out;
      });
      assert(r.length === 0, `${label}: ${r.slice(0, 4).join('; ')}`);
    };
    await inside('drive');
    await page.locator('button.mode').click();
    for (const tab of ['route', 'intel', 'plan', 'night', 'system']) {
      await page.locator(`.tab[data-tab="${tab}"]`).click();
      await page.waitForTimeout(150);
      await inside(`park/${tab}`);
    }
    assert(m.sw <= m.w, `horizontal overflow ${m.sw} > ${m.w}`);
    // Portrait: ≥ 80 px tall full-width slab. Landscape (≈ 340 px tall screen): ≥ 64 px, still ~360 px wide.
    assert(m.doneH >= (m.w > m.h ? 64 : 80), `DONE too small ${m.doneH}`);
    assert(m.minChip >= 52, `chip too small ${m.minChip}`);
    assert(m.chipsBottom <= m.h + 1, `controls cut off: ${m.chipsBottom} > ${m.h}`);
    await ctx.close();
  });
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} end-to-end tests passed`);
process.exit(failed.length ? 1 : 0);
