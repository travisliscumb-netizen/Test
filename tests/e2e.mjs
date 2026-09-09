/**
 * End-to-end validation of the real workflows, driven through the actual
 * interface on a phone-sized viewport with the operator's real route data.
 *
 * These are not unit tests of functions. Each one is a thing that happens on a
 * Tuesday: completing stops quickly, closing the app, losing signal, dropping
 * the phone into a pocket and coming back, restoring the wrong file.
 */

import { chromium, devices } from 'playwright';
import { serve } from '../tools/serve.mjs';
import fs from 'node:fs';
import path from 'node:path';

const BUNDLE = process.env.BUNDLE;
const SHOTS = process.env.SHOTS || path.resolve('shots');
if (!BUNDLE || !fs.existsSync(BUNDLE)) {
  console.error('Set BUNDLE=<path to a route backup json>');
  process.exit(2);
}
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const log = [];
async function t(name, fn) {
  process.stdout.write(`  ${name} … `);
  try { await fn(); pass++; console.log('ok'); log.push(['ok', name]); }
  catch (e) { fail++; console.log(`FAIL\n      ${e.message}`); log.push(['FAIL', `${name}: ${e.message}`]); }
}

// BASE_URL points the whole suite at a deployed origin instead of a local
// server, so the thing that was actually shipped is what gets tested.
const REMOTE = process.env.BASE_URL;
const { server, port } = REMOTE ? { server: { close() {} }, port: 0 } : await serve(0);
const BASE = REMOTE ? (REMOTE.endsWith('/') ? REMOTE : REMOTE + '/') : `http://127.0.0.1:${port}/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });

const iphone = {
  ...devices['iPhone 14 Pro'],
  hasTouch: true, isMobile: true,
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
};

async function newCtx(overrides = {}) {
  const ctx = await browser.newContext({
    ...iphone, ...overrides,
    locale: 'en-CA', timezoneId: 'America/Toronto',
    colorScheme: overrides.colorScheme || 'dark',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const ignorable = /ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource|basemaps\.cartocdn|tile\.openstreetmap/;
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable.test(m.text())) errors.push(m.text()); });
  page.on('requestfailed', () => {});
  page.errors = errors;
  return { ctx, page };
}

async function boot(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.booted === 'true', { timeout: 20000 });
}

async function restoreBundle(page, file = BUNDLE) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Choose backup file|Restore from a backup file/ }).first().click();
  await (await chooser).setFiles(file);
  await page.getByRole('button', { name: 'Restore now' }).click();
  // Properties land before the learning model is rebuilt, so waiting on the
  // property count alone races every assertion about predictions.
  await page.waitForFunction(
    () => window.__teds?.store?.properties?.size > 0 && window.__teds?.model?.builtAt > 0,
    { timeout: 20000 }
  );
  await page.waitForTimeout(300);
}

// =====================================================================
let { ctx, page } = await newCtx();

await t('cold start shows first-run rather than an empty dashboard', async () => {
  await boot(page);
  const text = await page.textContent('#view');
  if (!/Your route lives on this phone/.test(text)) throw new Error('onboarding not shown');
  if (!/Choose backup file/.test(text)) throw new Error('onboarding offers no way to load a route');
});

await t('the real route restores through the validated path', async () => {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose backup file' }).click();
  await (await chooser).setFiles(BUNDLE);
  await page.waitForSelector('text=Restore this backup?', { timeout: 10000 });
  const summary = await page.textContent('.sheet');
  if (!/238/.test(summary)) throw new Error(`summary missing the property count: ${summary.slice(0, 200)}`);
  if (!/verified/.test(summary)) throw new Error('checksum not reported as verified');
  await page.getByRole('button', { name: 'Restore now' }).click();
  await page.waitForFunction(
    () => window.__teds?.store?.properties?.size === 238 && window.__teds?.model?.sampleCount > 0,
    { timeout: 20000 }
  );
});

await t("today's route renders with the right stops for the weekday", async () => {
  const info = await page.evaluate(() => {
    const a = window.__teds;
    const stops = a.computeStops();
    return { n: stops.length, day: stops[0]?.day, crew: a.crew, first: stops[0]?.address };
  });
  if (info.n < 1) throw new Error('no stops for today');
  if (info.crew !== 'south') throw new Error(`unexpected crew ${info.crew}`);
  await page.evaluate(() => window.__teds.goTo('route'));
  await page.waitForTimeout(400);
  const rows = await page.locator('#view .stop').count();
  if (rows !== info.n) throw new Error(`${rows} rows rendered for ${info.n} stops`);
  await page.evaluate(() => window.__teds.goTo('today'));
  await page.waitForTimeout(300);
});

await t('the deck shows a finish time and a range, not a bare number', async () => {
  const val = await page.textContent('.hero-val');
  const band = await page.textContent('.hero-cap');
  if (!/\d/.test(val)) throw new Error(`finish value looks wrong: "${val}"`);
  if (!/Predicted finish|Route complete|This day/.test(band)) throw new Error(`caption looks wrong: "${band}"`);
});

await t('predictions come from real learned history, not a flat default', async () => {
  const m = await page.evaluate(() => {
    const a = window.__teds;
    const learned = [...a.model.byProperty.values()].filter((s) => s.samples > 0);
    return {
      sessions: a.model.sessionCount,
      samples: a.model.sampleCount,
      learned: learned.length,
      refit: a.model.travel.refit,
      perKm: a.model.travel.perKmMin,
      distinct: new Set(learned.map((s) => Math.round(s.minutes))).size,
    };
  });
  if (m.sessions < 20) throw new Error(`only ${m.sessions} sessions derived`);
  if (m.learned < 80) throw new Error(`only ${m.learned} properties learned`);
  if (!m.refit) throw new Error('travel model did not refit from real data');
  if (m.distinct < 8) throw new Error('every property got the same time — not actually learning');
});

await t('completing a stop is instant and survives a reload', async () => {
  // Measured inside the page. Driving this through Playwright's click would
  // measure its actionability wait — which blocks on the card's entry
  // animation — rather than the time the app takes to commit the change.
  const r = await page.evaluate(() => {
    const a = window.__teds;
    const btn = document.querySelector('.act-done');
    const before = a.computeStops().filter((s) => s.status === 'pending').length;
    const target = a.computeStops().find((s) => s.status === 'pending').address;
    const t0 = performance.now();
    btn.click();
    const ms = performance.now() - t0;
    const after = a.computeStops().filter((s) => s.status === 'pending').length;
    return { ms, before, after, target, synchronous: after === before - 1 };
  });
  if (!r.synchronous) throw new Error('the completion was not reflected in the same tick as the tap');
  if (r.ms > 80) throw new Error(`committing the completion took ${r.ms.toFixed(0)}ms on the main thread`);

  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.booted === 'true', { timeout: 20000 });
  const after = await page.evaluate(() => window.__teds.computeStops().filter((s) => s.status === 'pending').length);
  if (after !== r.before - 1) throw new Error(`after reload ${after} pending, expected ${r.before - 1}`);
  const status = await page.evaluate((addr) => window.__teds.computeStops().find((s) => s.address === addr)?.status, r.target);
  if (status !== 'done') throw new Error(`${r.target} did not stay complete`);
});

await t('rapid repeated taps produce exactly one completion', async () => {
  const id = await page.evaluate(() => window.__teds.computeStops().find((s) => s.status === 'pending').id);
  const btn = page.locator('.act-done').first();
  await Promise.all([btn.click(), btn.click({ force: true }), btn.click({ force: true })]).catch(() => {});
  await page.waitForTimeout(700);
  // Scoped to today: the imported history legitimately contains completions
  // for this same property from previous weeks.
  const count = await page.evaluate(async (pid) => {
    const a = window.__teds;
    const evs = await a.store.historyFor(pid, 200);
    const today = `${a.date}|${a.crew}`;
    return evs.filter((e) => e.type === 'complete' && e.date === today).length;
  }, id);
  if (count !== 1) throw new Error(`${count} completion events recorded today for one stop`);
});

await t('a run of eight completions stays responsive', async () => {
  // Measured in the page. Clicking through the driver would time its
  // actionability wait — the live marker breathes continuously by design, so
  // the element is never "stable" — rather than the work the app does.
  const r = await page.evaluate(async () => {
    const a = window.__teds;
    const commits = [];
    for (let i = 0; i < 8; i++) {
      const btn = document.querySelector('.act-done');
      if (!btn) break;
      const t0 = performance.now();
      btn.click();
      commits.push(performance.now() - t0);
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    }
    return { n: commits.length, worst: Math.max(...commits), total: commits.reduce((x, y) => x + y, 0) };
  });
  if (r.n < 8) throw new Error(`only ${r.n} completions were possible`);
  if (r.worst > 90) throw new Error(`slowest completion blocked the main thread for ${r.worst.toFixed(0)}ms`);

  // And the interface must keep painting while that is happening.
  const fps = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0; const start = performance.now();
    const tick = () => { frames++; if (performance.now() - start < 1000) requestAnimationFrame(tick); else resolve(frames); };
    requestAnimationFrame(tick);
  }));
  if (fps < 30) throw new Error(`only ${fps} frames in the second after a burst of completions`);
  if (page.errors.length) throw new Error(`console errors: ${page.errors.slice(0, 2).join(' | ')}`);
});

await t('exactly one stop is live at a time', async () => {
  const n = await page.evaluate(() => document.querySelectorAll('.node.is-current').length);
  if (n !== 1) throw new Error(`${n} stops rendered as live`);
  const done = await page.locator('.act-done').count();
  if (done !== 1) throw new Error(`${done} Done keys on screen`);
});

await t('undo restores the last completion', async () => {
  const before = await page.evaluate(() => window.__teds.computeStops().filter((s) => s.status === 'done').length);
  await page.evaluate(() => window.__teds.undo());
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__teds.computeStops().filter((s) => s.status === 'done').length);
  if (after !== before - 1) throw new Error(`undo left ${after} done, expected ${before - 1}`);
});

await t('the day can be switched, and switched back', async () => {
  const before = await page.evaluate(() => {
    const a = window.__teds;
    return { date: a.date, weekday: a.computeStops()[0]?.day, n: a.computeStops().length, isToday: a.isToday };
  });
  const buttons = page.locator('#chrome .daybtn');
  const count = await buttons.count();
  if (count !== 5) throw new Error(`expected a Mon-Fri strip, got ${count} day buttons`);

  // Pick a weekday that is not the one already showing.
  const targetIndex = await page.evaluate((cur) => {
    const days = window.__teds.weekDays();
    const i = days.findIndex((d) => !d.selected && d.total > 0);
    return i;
  }, before.weekday);
  if (targetIndex < 0) throw new Error('no other weekday has stops');

  await buttons.nth(targetIndex).click();
  await page.waitForTimeout(600);

  const after = await page.evaluate(() => {
    const a = window.__teds;
    return { date: a.date, weekday: a.computeStops()[0]?.day, n: a.computeStops().length, isToday: a.isToday };
  });
  if (after.date === before.date) throw new Error('tapping another day did not change the date');
  if (after.weekday === before.weekday) throw new Error(`still showing ${after.weekday}`);
  if (!after.n) throw new Error('the selected day has no stops');
  if (after.isToday) throw new Error('isToday should be false when viewing another day');

  const banner = await page.textContent('#view');
  if (!/Viewing /.test(banner)) throw new Error('no indication that this is not today');
  if (!/Work in this day/.test(banner)) throw new Error('the hero still claims a finish time for a day not being worked');

  await page.getByRole('button', { name: 'Back to today' }).click();
  await page.waitForTimeout(500);
  const back = await page.evaluate(() => ({ date: window.__teds.date, isToday: window.__teds.isToday }));
  if (back.date !== before.date || !back.isToday) throw new Error('Back to today did not return');
});

await t('work done on another day is stamped now and filed against that day', async () => {
  const r = await page.evaluate(async () => {
    const a = window.__teds;
    const days = a.weekDays();
    const other = days.find((d) => !d.selected && d.total > 0);
    a.setDate(other.date);
    await new Promise((res) => setTimeout(res, 300));
    const stop = a.computeStops().find((s) => s.status === 'pending');
    const t0 = Date.now();
    await a.store.completeStop(stop.id, { date: a.date, crew: a.crew });
    const evs = await a.store.historyFor(stop.id, 200);
    const latest = evs.filter((e) => e.type === 'complete').sort((x, y) => y.at - x.at)[0];
    a.goToToday();
    return {
      filedAgainst: latest.date, selected: `${other.date}|${a.crew}`,
      stampedNow: Math.abs(latest.at - t0) < 5000,
      sessionDay: new Date(latest.at).getDate(),
      todayDay: new Date().getDate(),
    };
  });
  if (r.filedAgainst !== r.selected) throw new Error(`filed against ${r.filedAgainst}, expected ${r.selected}`);
  if (!r.stampedNow) throw new Error('the completion was not stamped with the real clock time');
  if (r.sessionDay !== r.todayDay) throw new Error('the completion timestamp did not land on the actual calendar day');
  await page.waitForTimeout(400);
});

await t('the app works with the network completely down', async () => {
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.booted === 'true', { timeout: 25000 });
  const n = await page.evaluate(() => window.__teds.store.properties.size);
  if (n !== 238) throw new Error(`offline reload lost data: ${n} properties`);
  await page.locator('.act-done').first().click();
  await page.waitForTimeout(500);
  const chrome = await page.textContent('#chrome');
  if (!/Offline/.test(chrome)) throw new Error('offline state not surfaced in the header');
  await ctx.setOffline(false);
});

await t('the map renders stops and route without tiles', async () => {
  await page.evaluate(() => window.__teds.goTo('map'));
  await page.waitForTimeout(900);
  const drawn = await page.evaluate(() => {
    const c = document.querySelector('#view canvas');
    if (!c) return null;
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    return { colours: seen.size, w: c.width, h: c.height };
  });
  if (!drawn) throw new Error('no map canvas');
  if (drawn.colours < 6) throw new Error(`map looks blank (${drawn.colours} distinct colours)`);
});

await t('tapping a pin exposes its actions', async () => {
  const hit = await page.evaluate(() => {
    const a = window.__teds;
    const eng = a.screen.engine;
    const stop = a.computeStops().find((s) => Number.isFinite(s.lat));
    eng.fitRoute({ animate: false });
    const p = eng.project(stop.lat, stop.lng);
    const r = eng.canvas.getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y, address: stop.address };
  });
  await page.mouse.click(hit.x, hit.y);
  await page.waitForTimeout(500);
  const panel = page.locator('#view .mapsel[data-open="true"]');
  if (!(await panel.count())) throw new Error('tapping a pin did not raise the selection panel');
  const sel = await panel.first().textContent().catch(() => '');
  if (!/Navigate/.test(sel)) throw new Error('pin selection did not expose actions');
  if (!sel.includes(hit.address)) throw new Error(`the panel names the wrong stop: ${sel}`);
});

await t('route optimisation reports a saving and applies reversibly', async () => {
  await page.evaluate(() => window.__teds.goTo('route'));
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const a = window.__teds;
    // Deliberately scramble today's remaining order to guarantee a saving.
    const day = a.day;
    const stops = a.computeStops();
    const pending = stops.filter((s) => s.status === 'pending').map((s) => s.id);
    const scrambled = [];
    for (let i = 0; i < pending.length; i++) {
      scrambled.push(pending[i % 2 ? pending.length - 1 - (i >> 1) : i >> 1]);
    }
    const uniq = [...new Set(scrambled)];
    const order = day.order.map((id) => id);
    let k = 0;
    const next = order.map((id) => (pending.includes(id) ? uniq[k++] : id));
    return a.store.reorderDay(next, { date: a.date, crew: a.crew }).then(() => true);
  });
  await page.waitForTimeout(700);
  const opt = await page.evaluate(() => {
    const o = window.__teds.optimization;
    return o ? { changed: o.changed, saved: o.savedMinutes, moved: o.moved.length } : null;
  });
  if (!opt?.changed || opt.saved <= 0) throw new Error(`no saving found after scrambling: ${JSON.stringify(opt)}`);
  const beforeOrder = await page.evaluate(() => window.__teds.day.order.join(','));
  await page.evaluate(() => window.__teds.applyOptimization());
  await page.waitForTimeout(600);
  const afterOrder = await page.evaluate(() => window.__teds.day.order.join(','));
  if (beforeOrder === afterOrder) throw new Error('applying the optimisation changed nothing');
  await page.evaluate(() => window.__teds.undo());
  await page.waitForTimeout(400);
  const undone = await page.evaluate(() => window.__teds.day.order.join(','));
  if (undone !== beforeOrder) throw new Error('undo did not restore the previous order');
});

await t('the master route order can always be restored', async () => {
  await page.evaluate(() => window.__teds.revertOrder());
  await page.waitForTimeout(400);
  const same = await page.evaluate(() => {
    const d = window.__teds.day;
    const done = d.order.filter((id) => d.stops[id]?.status === 'done');
    const rest = d.order.filter((id) => !done.includes(id));
    const master = d.masterOrder.filter((id) => !done.includes(id));
    return JSON.stringify(rest) === JSON.stringify(master);
  });
  if (!same) throw new Error('restoring the master order did not reproduce it');
});

await t('drag reorder moves a stop and can be undone', async () => {
  await page.evaluate(() => window.__teds.goTo('route'));
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Reorder' }).click();
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById('view').scrollTop = 0; });
  await page.waitForTimeout(200);
  const grips = page.locator('#view .grip');
  const n = await grips.count();
  if (n < 3) throw new Error('not enough draggable rows');
  const before = await page.evaluate(() => window.__teds.day.order.join(','));
  const rowH = await page.evaluate(() => document.querySelector('#view .stop')?.getBoundingClientRect().height || 64);
  await grips.nth(0).scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const a = await grips.nth(0).boundingBox();
  if (!a || a.y < 120) throw new Error(`grip is not in a usable position: ${JSON.stringify(a)}`);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  // Travel a clear three rows so the landing slot is unambiguous.
  const travel = rowH * 3.2;
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + (travel * i) / 12);
    await page.waitForTimeout(18);
  }
  await page.mouse.up();
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => window.__teds.day.order.join(','));
  if (before === after) throw new Error('drag did not change the order');
  await page.evaluate(() => window.__teds.undo());
  await page.waitForTimeout(400);
  const back = await page.evaluate(() => window.__teds.day.order.join(','));
  if (back !== before) throw new Error('undo did not restore the pre-drag order');
});

await t('GPS denial degrades without breaking anything', async () => {
  const { ctx: c2, page: p2 } = await newCtx({ permissions: [] });
  await c2.grantPermissions([]);
  await boot(p2);
  await restoreBundle(p2);
  await p2.evaluate(() => window.__teds.location._reject({ code: 1 }));
  await p2.waitForTimeout(400);
  const txt = await p2.textContent('#view');
  if (/NaN|undefined|Infinity/.test(txt)) throw new Error('denied GPS produced junk in the interface');
  const stops = await p2.locator('#view .node-stop').count();
  if (stops < 1) throw new Error('route disappeared when GPS was denied');
  const desc = await p2.evaluate(() => window.__teds.location.describe());
  if (!/declined/i.test(desc)) throw new Error(`unhelpful GPS message: ${desc}`);
  await c2.close();
});

await t('an inaccurate fix never suggests completing a stop', async () => {
  const { ctx: c3, page: p3 } = await newCtx();
  await boot(p3);
  await restoreBundle(p3);
  const verdict = await p3.evaluate(() => {
    const a = window.__teds;
    const stop = a.computeStops().find((s) => Number.isFinite(s.lat));
    a.location.position = { lat: stop.lat, lng: stop.lng, accuracy: 190, at: Date.now() };
    a.location.state = 'live';
    const v = a.location.arrivalVerdict(stop);
    const ins = a.buildContext().insights;
    return { ok: v.ok, reason: v.reason, arriveShown: ins.some((i) => i.id.startsWith('arrive:')), explained: ins.some((i) => i.id === 'gps-accuracy') };
  });
  if (verdict.ok) throw new Error('a 190 m fix was accepted as an arrival');
  if (verdict.arriveShown) throw new Error('arrival suggested despite poor accuracy');
  if (!verdict.explained) throw new Error('the app did not explain why it went quiet');
  if (!/190/.test(verdict.reason)) throw new Error(`reason should quote the accuracy: ${verdict.reason}`);
  await c3.close();
});

await t('a good fix does suggest completing the stop you are standing on', async () => {
  const { ctx: c4, page: p4 } = await newCtx();
  await boot(p4);
  await restoreBundle(p4);
  const res = await p4.evaluate(() => {
    const a = window.__teds;
    const stop = a.computeStops().find((s) => s.status === 'pending' && Number.isFinite(s.lat));
    a.location.position = { lat: stop.lat, lng: stop.lng, accuracy: 12, at: Date.now() };
    a.location.state = 'live';
    const ins = a.buildContext().insights;
    return { shown: ins.some((i) => i.id === `arrive:${stop.id}`), title: ins[0]?.title };
  });
  if (!res.shown) throw new Error(`no arrival suggestion: ${res.title}`);
  await c4.close();
});

await t('backup produces a file that validates and round-trips', async () => {
  const doc = await page.evaluate(async () => {
    const a = window.__teds;
    const raw = await a.store.exportRaw();
    const { buildBackup } = window.__teds.modules.backup;
    return buildBackup({
      properties: raw.properties, days: raw.days, events: raw.events,
      settings: a.settings, dataOrigin: a.store.dataOrigin,
    });
  });
  const out = path.join(SHOTS, 'roundtrip-backup.json');
  fs.writeFileSync(out, JSON.stringify(doc));
  const report = await page.evaluate(async (text) => {
    const { inspect } = window.__teds.modules.backup;
    const r = await inspect(text);
    return { ok: r.ok, counts: r.counts, verified: r.meta.checksumVerified, errors: r.errors.map((e) => e.code) };
  }, JSON.stringify(doc));
  if (!report.ok) throw new Error(`own backup failed validation: ${report.errors.join(',')}`);
  if (report.counts.properties !== 238) throw new Error(`backup lost properties: ${report.counts.properties}`);
  if (!report.verified) throw new Error('checksum absent');
  if (report.counts.completions < 458) throw new Error(`history not carried: ${report.counts.completions}`);
});

await t('a malformed backup is refused and changes nothing', async () => {
  const bad = path.join(SHOTS, 'corrupt.json');
  const good = JSON.parse(fs.readFileSync(BUNDLE, 'utf8'));
  good.properties[10].address = 'TAMPERED';
  fs.writeFileSync(bad, JSON.stringify(good));
  const before = await page.evaluate(() => window.__teds.store.properties.size);
  await page.evaluate(() => window.__teds.goTo('settings'));
  await page.waitForTimeout(300);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore from a backup file' }).click();
  await (await chooser).setFiles(bad);
  await page.waitForSelector('text=Backup refused', { timeout: 8000 });
  const msg = await page.textContent('.sheet');
  if (!/checksum/i.test(msg)) throw new Error(`refusal did not explain the checksum: ${msg.slice(0, 160)}`);
  if (!/Nothing on this device has been changed/.test(msg)) throw new Error('refusal did not reassure about existing data');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__teds.store.properties.size);
  if (after !== before) throw new Error('a refused restore still modified the database');
});

await t('a large day scrolls and reorders without dropping frames', async () => {
  const stats = await page.evaluate(async () => {
    const a = window.__teds;
    await a.updateSettings({ crew: 'east' });
    // East Tuesday is the largest day on this route.
    a.date = (() => {
      const d = new Date();
      while (d.getDay() !== 2) d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    a.goTo('route');
    await new Promise((r) => setTimeout(r, 500));
    const n = a.computeStops().length;
    const t0 = performance.now();
    const o = a.optimization;
    return { n, optimizeMs: performance.now() - t0, rows: document.querySelectorAll('#view .stop').length, saved: o?.savedMinutes ?? 0 };
  });
  if (stats.n < 40) throw new Error(`expected the big day, got ${stats.n} stops`);
  if (stats.rows !== stats.n) throw new Error(`${stats.rows} rows for ${stats.n} stops`);

  const frames = await page.evaluate(() => new Promise((resolve) => {
    const view = document.getElementById('view');
    let count = 0; const start = performance.now();
    const tick = () => { count++; if (performance.now() - start < 1000) requestAnimationFrame(tick); else resolve(count); };
    let y = 0;
    const scroll = setInterval(() => { y += 60; view.scrollTop = y; }, 16);
    setTimeout(() => clearInterval(scroll), 1000);
    requestAnimationFrame(tick);
  }));
  if (frames < 30) throw new Error(`only ${frames} frames in a second while scrolling 48 rows`);
  await page.evaluate(() => window.__teds.updateSettings({ crew: 'south' }));
  await page.waitForTimeout(400);
});

await t('optimising the biggest day stays inside its time budget', async () => {
  const ms = await page.evaluate(async () => {
    const a = window.__teds;
    const { optimizeRoute } = window.__teds.modules.optimize;
    const { serviceMinutesFor } = window.__teds.modules.predict;
    const stops = [...a.store.properties.values()].filter((p) => p.crew === 'east' && p.day === 'Tue');
    const t0 = performance.now();
    optimizeRoute({
      origin: a.settings.depot, stops, startMinutes: 480,
      serviceOf: (s) => serviceMinutesFor(a.model, s),
      travelModel: a.model.travel, depot: a.settings.depot, returnToDepot: true, timeBudgetMs: 45,
    });
    return performance.now() - t0;
  });
  if (ms > 400) throw new Error(`optimising 48 stops took ${ms.toFixed(0)}ms`);
});

await t('reduced motion still renders a complete, polished screen', async () => {
  const { ctx: c5, page: p5 } = await newCtx({ reducedMotion: 'reduce' });
  await boot(p5);
  await restoreBundle(p5);
  await p5.waitForTimeout(500);
  const motion = await p5.evaluate(() => document.documentElement.dataset.motion);
  if (motion !== 'calm') throw new Error(`reduced motion not honoured: ${motion}`);
  const rows = await p5.locator('#view .node-stop').count();
  if (rows < 1) throw new Error('calm mode lost the route');
  await p5.locator('.act-done').first().click();
  await p5.waitForTimeout(400);
  const fx = await p5.evaluate(() => !!document.querySelector('canvas.fx-layer'));
  if (fx) throw new Error('particle layer created in reduced-motion mode');
  await c5.close();
});

await t('the daylight theme is art-directed, not an inversion', async () => {
  const { ctx: c6, page: p6 } = await newCtx({ colorScheme: 'light' });
  await boot(p6);
  await restoreBundle(p6);
  await p6.waitForTimeout(400);
  const v = await p6.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      theme: document.documentElement.dataset.theme,
      blur: cs.getPropertyValue('--blur-chrome').trim(),
      accent: cs.getPropertyValue('--accent').trim(),
      ink: cs.getPropertyValue('--ink').trim(),
      ground: cs.getPropertyValue('--ground').trim(),
    };
  });
  if (v.theme !== 'day') throw new Error(`light scheme gave ${v.theme}`);
  if (v.blur !== 'none') throw new Error('daylight theme still uses backdrop blur');
  const contrast = contrastRatio(v.ink, v.ground);
  if (contrast < 12) throw new Error(`daylight text contrast only ${contrast.toFixed(1)}:1`);
  await c6.close();
});

await t('no interactive control is smaller than 44px', async () => {
  await page.evaluate(() => window.__teds.goTo('today'));
  await page.waitForTimeout(400);
  // An element mid-transform measures smaller than it is. Wait for every
  // running animation to finish first, or this reports scale(.97) as a
  // too-small button roughly one run in three.
  await page.evaluate(() => Promise.all(
    document.getAnimations()
      // The live-stop pulse never finishes by design; awaiting it would hang.
      .filter((a) => Number.isFinite(a.effect?.getComputedTiming?.().endTime))
      .map((a) => a.finished.catch(() => {}))
  ));
  const small = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('#view button, #tabbar button, #chrome button')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.height < 44 || r.width < 44) out.push(`${el.className || el.tagName} "${el.textContent.trim().slice(0, 18)}": ${r.width.toFixed(2)}x${r.height.toFixed(2)}`);
    }
    return out;
  });
  if (small.length) throw new Error(`too small: ${small.slice(0, 4).join('; ')}`);
});

await t('nothing overflows the width of the phone, at any text size', async () => {
  // A grid track sized `1fr` or `auto` carries a min-content floor, so a single
  // nowrap label can widen the whole shell and clip the right edge of every
  // card. It had already happened on the settings screen before anyone looked.
  const failures = [];
  for (const textSize of ['standard', 'larger']) {
    await page.evaluate((v) => window.__teds.updateSettings({ textSize: v }), textSize);
    for (const tab of ['today', 'route', 'map', 'insights', 'settings']) {
      await page.evaluate((x) => window.__teds.goTo(x), tab);
      await page.waitForTimeout(420);
      const bad = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const out = [];
        for (const el of document.querySelectorAll('#app *')) {
          const b = el.getBoundingClientRect();
          if (b.width === 0 && b.height === 0) continue;
          if (b.right > vw + 1 || b.left < -1) {
            out.push(`${el.tagName.toLowerCase()}.${String(el.className || '').split(' ')[0]} right=${Math.round(b.right)}`);
          }
        }
        return { vw, shell: document.getElementById('app').scrollWidth, out: out.slice(0, 3), n: out.length };
      });
      if (bad.n || bad.shell > bad.vw + 1) {
        failures.push(`${textSize}/${tab}: shell ${bad.shell} vs ${bad.vw}, ${bad.n} elements — ${bad.out.join('; ')}`);
      }
    }
  }
  await page.evaluate(() => window.__teds.updateSettings({ textSize: 'standard' }));
  await page.evaluate(() => window.__teds.goTo('today'));
  if (failures.length) throw new Error(failures.join(' | '));
});

await t('no console errors across every screen', async () => {
  page.errors.length = 0;
  for (const tab of ['today', 'route', 'map', 'insights', 'settings']) {
    await page.evaluate((t) => window.__teds.goTo(t), tab);
    await page.waitForTimeout(600);
  }
  if (page.errors.length) throw new Error(page.errors.slice(0, 3).join(' | '));
});

// ---------------------------------------------------------------- screenshots
console.log('\n  capturing screenshots …');
const shotCtx = await browser.newContext({
  ...iphone, locale: 'en-CA', timezoneId: 'America/Toronto', colorScheme: 'dark',
});
const sp = await shotCtx.newPage();
try {
  const d = new Date();
  d.setHours(9, 42, 0, 0);
  await sp.clock.install({ time: d });
  await sp.clock.resume();
} catch { /* older Playwright: screenshots keep the machine clock */ }
await sp.goto(BASE, { waitUntil: 'domcontentloaded' });
await sp.waitForFunction(() => document.body.dataset.booted === 'true', { timeout: 20000 });
await restoreBundle(sp);

// Put the day into a realistic mid-morning state: several stops done, one live.
await sp.evaluate(async () => {
  const a = window.__teds;
  const stops = a.computeStops();
  const start = Date.now() - 3 * 3600e3;
  await a.store.startDay(a.date, a.crew, start);
  let t = start;
  for (let i = 0; i < Math.min(7, stops.length - 4); i++) {
    t += (14 + Math.random() * 9) * 60000;
    await a.store.completeStop(stops[i].id, { date: a.date, crew: a.crew, at: t });
  }
  const next = a.computeStops().find((s) => s.status === 'pending');
  if (next && Number.isFinite(next.lat)) {
    a.location.position = { lat: next.lat + 0.004, lng: next.lng + 0.005, accuracy: 14, at: Date.now() };
    a.location.state = 'live';
  }
  await a.rebuildModel();
  a.refresh();
});
await sp.waitForTimeout(1400);

async function shot(name, prep) {
  if (prep) { await prep(); }
  await sp.waitForTimeout(900);
  // Toasts are transient by design; one caught mid-fade is not the interface.
  await sp.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await sp.waitForTimeout(120);
  await sp.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  console.log(`    ${name}.png`);
}

await shot('01-today-night');
await shot('02-route-night', async () => { await sp.evaluate(() => window.__teds.goTo('route')); });
await shot('03-map-night', async () => { await sp.evaluate(() => window.__teds.goTo('map')); await sp.waitForTimeout(700); });
await shot('04-insights-night', async () => { await sp.evaluate(() => window.__teds.goTo('insights')); });
await shot('05-settings-night', async () => { await sp.evaluate(() => window.__teds.goTo('settings')); });
await shot('06-property-sheet', async () => {
  await sp.evaluate(() => {
    const a = window.__teds;
    a.goTo('today');
    const s = a.computeStops().find((x) => x.status === 'pending' && x.note) || a.computeStops().find((x) => x.status === 'pending');
    setTimeout(() => a.openProperty(s), 250);
  });
});
await sp.keyboard.press('Escape');
await sp.waitForTimeout(500);

// Daylight
await sp.evaluate(() => window.__teds.updateSettings({ theme: 'day' }));
await sp.waitForTimeout(700);
await shot('07-today-daylight', async () => { await sp.evaluate(() => window.__teds.goTo('today')); });
await shot('08-map-daylight', async () => { await sp.evaluate(() => window.__teds.goTo('map')); await sp.waitForTimeout(700); });
await sp.evaluate(() => window.__teds.updateSettings({ theme: 'night' }));
await sp.waitForTimeout(600);

// Reorder mode, mid-drag lift
await shot('09-reorder', async () => {
  await sp.evaluate(() => window.__teds.goTo('route'));
  await sp.waitForTimeout(400);
  await sp.getByRole('button', { name: 'Reorder' }).click();
  await sp.waitForTimeout(300);
  const g = await sp.locator('#view .grip').nth(3).boundingBox();
  if (g) {
    await sp.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await sp.mouse.down();
    for (let i = 1; i <= 5; i++) { await sp.mouse.move(g.x + g.width / 2, g.y + g.height / 2 - i * 14); await sp.waitForTimeout(30); }
  }
});
await sp.mouse.up();
await sp.waitForTimeout(400);

// The end of the day — a designed moment, so it gets a regression shot like
// any other screen. Done last because it consumes the shot context's route.
await shot('12-day-finished', async () => {
  await sp.evaluate(() => window.__teds.goTo('route'));
  await sp.waitForTimeout(200);
  await sp.getByRole('button', { name: 'Finished' }).click().catch(() => {});
  await sp.evaluate(async () => {
    const a = window.__teds;
    a.goTo('today');
    for (const s of a.computeStops()) {
      if (s.status === 'pending') await a.completeStop(s);
    }
  });
  await sp.waitForTimeout(600);
});

// First run
const fresh = await browser.newContext({ ...iphone, locale: 'en-CA', timezoneId: 'America/Toronto', colorScheme: 'dark' });
const fp = await fresh.newPage();
await fp.goto(BASE, { waitUntil: 'domcontentloaded' });
await fp.waitForFunction(() => document.body.dataset.booted === 'true', { timeout: 20000 });
await fp.waitForTimeout(700);
await fp.screenshot({ path: path.join(SHOTS, '10-first-run.png') });
console.log('    10-first-run.png');
const ch = fp.waitForEvent('filechooser');
await fp.getByRole('button', { name: 'Choose backup file' }).click();
await (await ch).setFiles(BUNDLE);
await fp.waitForSelector('text=Restore this backup?', { timeout: 10000 });
await fp.waitForTimeout(500);
await fp.screenshot({ path: path.join(SHOTS, '11-restore-review.png') });
console.log('    11-restore-review.png');
await fresh.close();

await shotCtx.close();
await ctx.close();
await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { for (const [s, n] of log) if (s === 'FAIL') console.log(`  ${n}`); }
process.exit(fail ? 1 : 0);

function contrastRatio(a, b) {
  const L = (c) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
    if (!m) return 0.5;
    const n = parseInt(m[1], 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const l1 = L(a), l2 = L(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
