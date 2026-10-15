/* Phone layout: on real iPhone-sized touch viewports (portrait and landscape, switched live like
   a rotation) every top button is fully visible and tappable, nothing in the top HUD overlaps,
   the jail panel never sits under the Map button (in jail, with the map open, after a rotation
   and after release), and while driving the pedals never cover the speedometer, prompts or
   the arrest bar. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const SIZES = [[390, 844], [844, 390], [375, 667], [667, 375], [320, 568], [568, 320], [430, 932], [932, 430]];
const b = await launch();
const t = await open(b, { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
const page = t.page;
await startNew(page);
await page.evaluate(() => { const g = window.game; g.events.cool = 1e9; g.save.money = 1234567; g.resetPlayerState(5 * 80 + 40, 5 * 80 + 2, 0); });
await frames(page, 10);

// every visible HUD rect we care about, measured in the page
const measure = () => page.evaluate(() => {
  const R = el => { if (!el || el.classList.contains('hidden')) return null; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return null; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; };
  const out = { W: innerWidth, H: innerHeight, items: {} };
  const add = (k, el) => { const r = R(el); if (r) out.items[k] = r; };
  document.querySelectorAll('#tbar .tbtn').forEach(b => add('btn:' + b.dataset.act, b));
  document.querySelectorAll('#touch > .tbtn').forEach(b => add('ctl:' + b.dataset.act, b));
  add('minimap', document.getElementById('minimapWrap'));
  add('tr', document.querySelector('#hud .tr'));
  for (const id of ['zone', 'objective', 'toasts', 'jailHud', 'speedo', 'prompt', 'bustbar', 'subtitle', 'phone', 'zoneCard']) add(id, document.getElementById(id));
  return out;
});
const hit = (a, b) => a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
function overlaps(m, keys) {
  const ks = Object.keys(m.items).filter(k => keys(k)), bad = [];
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    const a = ks[i], c = ks[j];
    if (a.startsWith('ctl:') && c.startsWith('ctl:')) continue; // pedal cluster checked separately
    if (hit(m.items[a], m.items[c])) bad.push(a + '×' + c);
  }
  return bad;
}
const onScreen = (m, k) => { const r = m.items[k]; return r && r.l >= -0.5 && r.t >= -0.5 && r.r <= m.W + 0.5 && r.b <= m.H + 0.5; };
const settle = async () => { await frames(page, 6); await page.evaluate(() => window.game.ui.layout.tick(0, true)); await frames(page, 2); };
async function setSize(w, h) { await page.setViewportSize({ width: w, height: h }); await settle(); }
const TOP = k => k.startsWith('btn:') || ['minimap', 'tr', 'zone', 'objective', 'toasts', 'jailHud', 'phone', 'zoneCard'].includes(k);

// 1. on foot: top cluster at every size
for (const [w, h] of SIZES) {
  await setSize(w, h);
  await page.evaluate(() => { const g = window.game; g.ui.setObjective('Meet Rosa at the diner on Elm Street before the lunch rush'); g.ui.toast('Discovered: Harborview Mall — cab stop added to the map.'); const z = document.getElementById('zone'); z.innerHTML = 'Financial District<small>Central Blvd & Elm St</small>'; z.classList.add('show'); });
  await settle();
  const m = await measure();
  const btns = Object.keys(m.items).filter(k => k.startsWith('btn:'));
  check(`${w}x${h}: all ${btns.length} top buttons visible and on screen`, btns.length >= 4 && btns.every(k => onScreen(m, k)), btns.join(','));
  check(`${w}x${h}: top buttons are at least 44px (comfortable tap targets)`, btns.every(k => m.items[k].r - m.items[k].l >= 44 && m.items[k].b - m.items[k].t >= 44));
  const ov = overlaps(m, TOP);
  check(`${w}x${h}: nothing in the top HUD overlaps (buttons, minimap, money, location label, objective, toasts)`, ov.length === 0, ov.join(' '));
}
await page.evaluate(() => { window.game.ui.setObjective(null); document.getElementById('zone').classList.remove('show'); });

// 2. the top buttons all respond to a tap (the fourth one used to be hidden behind the others)
await setSize(390, 844);
const cdp = await t.ctx.newCDPSession(page);
const tap = async sel => { const r = await page.evaluate(s => { const q = document.querySelector(s).getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }, sel); const top = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && (e.dataset.act || e.id); }, [r.x, r.y]); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 9 }] }); await frames(page, 2); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await frames(page, 3); return top; };
const topMap = await tap('#tbar .tbtn[data-act="map"]');
check('portrait: the Map button is the top element at its centre and opens the map', topMap === 'map' && await page.evaluate(() => window.game.mapOpen), topMap);
await page.evaluate(() => window.game.ui.toggleMap(false)); await frames(page, 3);
const topCam = await tap('#tbar .tbtn[data-act="camera"]');
check('portrait: the Cam button is reachable (not covered)', topCam === 'camera', topCam);
const topPause = await tap('#tbar #touchPause');
check('portrait: the Pause button is reachable and pauses', topPause === 'pause' && await page.evaluate(() => window.game.state === 'paused'), topPause);
await page.evaluate(() => window.game.resume()); await frames(page, 4);

// 3. driving: pedals never cover the speedometer, the prompt or the arrest bar
await page.evaluate(() => { const g = window.game, p = g.player; g.resetPlayerState(6 * 80 + 2.6, 6 * 80 + 30, 0); const v = g.vehicles.spawn('sedan', p.pos.x + 2.2, p.pos.z, 0, { parked: true }); v.touched = true; g.completeEnter(v); });
for (const [w, h] of SIZES) {
  await setSize(w, h);
  await page.evaluate(() => { const g = window.game; g.ui.prompt('Stop the car to save'); g.ui._promptKeep = g.ui.prompt; g.ui.prompt = () => {}; g.police.bust = 0.4; });
  await settle();
  const m = await measure();
  const ctl = Object.keys(m.items).filter(k => k.startsWith('ctl:'));
  const covered = [];
  for (const k of ['speedo', 'prompt', 'bustbar']) { if (!m.items[k]) { if (k !== 'bustbar') covered.push(k + ':missing'); continue; } for (const c of ctl) if (hit(m.items[k], m.items[c])) covered.push(k + '×' + c); }
  check(`${w}x${h} driving: speed, prompt and arrest bar are clear of the pedals`, covered.length === 0 && ['speedo', 'prompt'].every(k => onScreen(m, k)), covered.join(' '));
  const ov = overlaps(m, k => TOP(k) || k === 'speedo');
  check(`${w}x${h} driving: speedometer and top HUD do not overlap`, ov.length === 0, ov.join(' '));
  check(`${w}x${h} driving: Gas, Brake, Drift, Horn on screen`, ['ctl:gas', 'ctl:brake', 'ctl:handbrake', 'ctl:horn'].every(k => onScreen(m, k)));
  const pedal = ctl.filter(k => k !== 'ctl:interact').map(k => m.items[k]); let po = 0;
  for (let i = 0; i < pedal.length; i++) for (let j = i + 1; j < pedal.length; j++) if (hit(pedal[i], pedal[j])) po++;
  check(`${w}x${h} driving: pedal buttons do not overlap each other`, po === 0);
}
await page.evaluate(() => { const g = window.game; g.ui.prompt = g.ui._promptKeep; g.ui.prompt(null); g.police.bust = 0; g.exitVehicle(true); });
await frames(page, 6);

// 4. jail: the panel and the Map button each keep their own space
await setSize(390, 844);
await page.evaluate(() => { const g = window.game; g.police.setLevel(1); g.onBusted(); });
await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });
for (const [w, h] of SIZES) {
  await setSize(w, h);
  const m = await measure();
  const ov = overlaps(m, TOP);
  check(`${w}x${h} jail: jail panel, Map button and top HUD do not overlap`, !!m.items.jailHud && !!m.items['btn:map'] && ov.length === 0 && onScreen(m, 'jailHud'), ov.join(' '));
}
await page.evaluate(() => window.game.ui.toggleMap(true)); await settle();
const jm0 = await page.evaluate(() => window.game.mapOpen);
await page.evaluate(() => { window.game.uw.S.jail.phone = true; window.game.ui.toggleMap(true); }); await settle();
const jm = await page.evaluate(() => { const r = document.getElementById('bigmapCanvas').getBoundingClientRect(); return { open: window.game.mapOpen, w: r.width, h: r.height }; });
check('jail: no map without a phone; with a smuggled phone the map opens over the jail HUD', !jm0 && jm.open && jm.w > 100, JSON.stringify({ jm0, jm }));
await page.evaluate(() => window.game.ui.toggleMap(false)); await setSize(844, 390);
const m2 = await measure();
check('jail after map + rotation: still no overlaps', overlaps(m2, TOP).length === 0, overlaps(m2, TOP).join(' '));
await page.evaluate(() => { const j = window.game.uw.S.jail; j.total = Math.min(j.total, j.served + 2); });
await page.waitForFunction(() => !window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 180000, polling: 100 });
await settle();
const m3 = await measure();
check('after release: jail panel gone, top HUD clean', !m3.items.jailHud && overlaps(m3, TOP).length === 0, overlaps(m3, TOP).join(' '));
check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
await finish(b, 'phone');
