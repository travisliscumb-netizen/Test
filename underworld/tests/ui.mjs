/* Map / UI regression: minimap labels stay upright at any rotation, the big-map status line
   never covers the map, Bellcourt is distinguishable from the player's colour, no input leaks
   through the open map, nothing invisible is left on top after closing, the territory overlay
   works, and on a touch device the stick and buttons work again after map use. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
await page.evaluate(() => { const g = window.game; g.events.cool = 1e9; g.input.wantLock = false; g.input.noLock = true; g.resetPlayerState(4 * 80 + 40, 4 * 80 + 2, 0); });
await page.mouse.move(240, 135);
await frames(page, 10);

// 1. minimap labels: every label is drawn with an unrotated, unmirrored transform
const mm = await page.evaluate(() => {
  const g = window.game, ui = g.ui, c = ui.mmc, out = { calls: 0, bad: [], labels: ui.mmImg.labels.length, baseHasText: ui.mmImg !== ui.mapImg };
  const texts = new Set(ui.mmImg.labels.map(l => l.t));
  const orig = c.fillText;
  c.fillText = function (t, x, y, w) {
    if (texts.has(t)) { out.calls++; const m = c.getTransform(); if (Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6 || m.a <= 0 || m.d <= 0) out.bad.push(t + '@' + m.a.toFixed(2) + ',' + m.b.toFixed(2)); }
    return orig.call(this, t, x, y, w);
  };
  for (const yaw of [0, 0.8, 1.6, 2.4, Math.PI, -2.2, -1.1]) { g.cam.yaw = yaw; ui.drawMinimap(); }
  // walk the player through a few districts so many different labels get drawn
  for (const [x, z] of [[120, 120], [520, 300], [700, 700], [300, 760], [760, 200]]) { g.player.pos.x = x; g.player.pos.z = z; for (const yaw of [0, 2.1, Math.PI, -1.4]) { g.cam.yaw = yaw; ui.drawMinimap(); } }
  c.fillText = orig;
  g.resetPlayerState(4 * 80 + 40, 4 * 80 + 2, 0);
  return out;
});
check('minimap base image carries no baked-in text', mm.baseHasText && mm.labels > 8, JSON.stringify({ labels: mm.labels }));
check('minimap district / landmark labels are drawn upright at every rotation', mm.calls > 20 && mm.bad.length === 0, `${mm.calls} label draws, bad: ${mm.bad.slice(0, 4).join(' ')}`);

// 2. big map: status line outside the map image, overlay works, Bellcourt vs player colours
await page.keyboard.press('KeyM'); await frames(page, 4);
const bm = await page.evaluate(() => {
  const r = el => { const q = document.getElementById(el).getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; };
  const a = r('bigmapCanvas'), s = r('mapStat');
  const overlap = !(s.r <= a.l || s.l >= a.r || s.b <= a.t || s.t >= a.b);
  return { open: window.game.mapOpen, text: document.getElementById('mapStat').textContent, overlap, canvas: a, stat: s };
});
check('big map opens', bm.open);
check('big map status line is filled and never covers the map', bm.text.length > 10 && !bm.overlap && bm.stat.w > 0, JSON.stringify(bm));
const col = await page.evaluate(() => {
  const { FACTIONS } = window.__pv; const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const pc = hex('#ffb547'), d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const out = {}; for (const id in FACTIONS) out[id] = Math.round(d(pc, hex(FACTIONS[id].col))); return out;
});
check('Bellcourt is clearly distinguishable from the player colour', col.bellcourt > 150, JSON.stringify(col));
check('every faction colour is distinguishable from the player colour', Object.values(col).every(v => v > 120), JSON.stringify(col));
// overlay toggle and turf info
const ov0 = await page.evaluate(() => window.game.uw.mapOverlay);
await page.keyboard.press('KeyT'); await frames(page, 2);
const ov1 = await page.evaluate(() => window.game.uw.mapOverlay);
await page.keyboard.press('KeyT'); await frames(page, 2);
const ov2 = await page.evaluate(() => window.game.uw.mapOverlay);
check('territory overlay toggles on the open map', ov0 !== ov1 && ov2 === ov0, `${ov0} ${ov1} ${ov2}`);
if (!ov2) { await page.keyboard.press('KeyT'); await frames(page, 2); }
const info = await page.evaluate(() => { const ok = window.game.uw.ui.mapClick(5 * 80 + 40, 5 * 80 + 40); return { ok, shown: !document.getElementById('turfInfo').classList.contains('hidden'), html: document.getElementById('turfInfo').textContent.slice(0, 60) }; });
check('tapping a turf with the overlay on shows its details', info.ok && info.shown && /Controlled by/.test(await page.evaluate(() => document.getElementById('turfInfo').textContent)), JSON.stringify(info));
// no input leak while the map is open
const leak0 = await page.evaluate(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z, h: window.game.player.h, st: window.game.player.state, money: window.game.save.money }));
await page.keyboard.down('KeyW'); await frames(page, 15);
await page.keyboard.press('Space'); await page.keyboard.press('KeyE'); await page.keyboard.press('KeyV'); await page.keyboard.press('KeyG');
await frames(page, 10); await page.keyboard.up('KeyW');
const leak1 = await page.evaluate(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z, h: window.game.player.h, st: window.game.player.state, atk: window.game.player.attackT, vy: window.game.player.vel.y, open: window.game.mapOpen }));
check('no input leaks through the open map (no move, jump, attack or interact)', leak1.open && Math.hypot(leak1.x - leak0.x, leak1.z - leak0.z) < 0.05 && leak1.st === leak0.st && !(leak1.atk > 0) && Math.abs(leak1.vy) < 0.01, JSON.stringify({ leak0, leak1 }));
// close: nothing invisible left on top, the game gets input again
await page.keyboard.press('KeyM'); await frames(page, 4);
const top = await page.evaluate(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return { id: e && e.id, tag: e && e.tagName, open: window.game.mapOpen, info: document.getElementById('turfInfo').classList.contains('hidden') }; });
check('after closing, the game canvas is the top element (no invisible overlay)', top.id === 'game' && !top.open && top.info, JSON.stringify(top));
const w0 = await page.evaluate(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z }));
await page.keyboard.down('KeyW'); await frames(page, 15); await page.keyboard.up('KeyW');
const w1 = await page.evaluate(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z }));
check('keyboard movement resumes after the map closes', Math.hypot(w1.x - w0.x, w1.z - w0.z) > 0.5);
// clicking the map background (outside the image) closes it; clicking the overlay button does not
await page.keyboard.press('KeyM'); await frames(page, 3);
await page.click('#ovBtn'); await frames(page, 2);
const stillOpen = await page.evaluate(() => window.game.mapOpen);
await page.mouse.click(4, 4); await frames(page, 3);
check('overlay button keeps the map open; tapping outside closes it', stillOpen && await page.evaluate(() => !window.game.mapOpen));
await page.evaluate(() => { if (!window.game.uw.mapOverlay) window.game.uw.ui.toggleOverlay(); });
check('no console errors (desktop)', errors.length === 0, errors.slice(0, 6).join(' | '));

// 3. touch device: stick + buttons work, map via the Map button, controls resume after closing
const t = await open(b, { hasTouch: true, isMobile: true, viewport: { width: 800, height: 400 } });
const tp = t.page;
await startNew(tp);
await tp.evaluate(() => { const g = window.game; g.events.cool = 1e9; g.resetPlayerState(4 * 80 + 40, 4 * 80 + 2, 0); });
await frames(tp, 10);
const cdp = await t.ctx.newCDPSession(tp);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const stickWalk = async () => {
  const a = await tp.evaluate(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z }));
  await touch('touchStart', [{ x: 120, y: 300, id: 1 }]);
  await touch('touchMove', [{ x: 120, y: 240, id: 1 }]);
  await frames(tp, 20);
  await touch('touchEnd', []);
  await frames(tp, 3);
  const c = await tp.evaluate(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z, stick: window.game.input.stick.active }));
  return { d: Math.hypot(c.x - a.x, c.z - a.z), stick: c.stick };
};
check('touch controls are shown on a touch device', await tp.evaluate(() => !document.getElementById('touch').classList.contains('hidden') && window.game.input.usingTouch));
const s0 = await stickWalk();
check('touch stick moves the player', s0.d > 0.5 && !s0.stick, JSON.stringify(s0));
const tapBtn = async sel => { const r = await tp.evaluate(s => { const q = document.querySelector(s).getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }, sel); await touch('touchStart', [{ x: r.x, y: r.y, id: 7 }]); await frames(tp, 2); await touch('touchEnd', []); await frames(tp, 3); };
// open the map while the stick is held, then close it by tapping outside the map
await touch('touchStart', [{ x: 120, y: 300, id: 2 }]); await touch('touchMove', [{ x: 120, y: 250, id: 2 }]); await frames(tp, 4);
await tapBtn('#touch .tbtn[data-act="map"]');
const tmap = await tp.evaluate(() => ({ open: window.game.mapOpen, stick: window.game.input.stick.active }));
await touch('touchEnd', []);
check('Map button opens the map and releases the held stick', tmap.open && !tmap.stick, JSON.stringify(tmap));
await tp.mouse.click(6, 6); await frames(tp, 4); // a tap on the dark backdrop
check('tapping outside the map closes it on touch', await tp.evaluate(() => !window.game.mapOpen));
const s1 = await stickWalk();
check('touch stick works again after the map closes (no stuck stick)', s1.d > 0.5 && !s1.stick, JSON.stringify(s1));
await tapBtn('#touch .tbtn[data-act="attack"]');
check('touch attack works after the map closes', await tp.evaluate(() => window.game.player.attackT > -0.5 && window.game.player.pose.punch > 0.01 || window.game.player.attackT > 0));
check('no touch buttons left stuck on', await tp.evaluate(() => document.querySelectorAll('#touch .tbtn.on').length === 0 && window.game.input.down.size === 0));
check('no console errors (touch)', t.errors.length === 0, t.errors.slice(0, 6).join(' | '));
await finish(b, 'ui');
