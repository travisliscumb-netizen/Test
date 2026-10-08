/* Hellbreach end-to-end playtest. Drives the real page in Chromium at iPhone
   sizes with genuine multi-touch input (CDP touch events -> pointer events),
   validates every map is solvable, and exercises the sprite sculptor, all six
   weapons, aim assist, doors, keys, secrets, lava, infighting, gibs, the boss
   gate, death, level transitions and persistence. Fails on any console error
   or page exception.  Run: node tests/hellbreach.mjs */

import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '../tools/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'hellbreach');
const SHOTS = process.env.SHOT_DIR || path.join(ROOT, '..', '.shots', 'hellbreach');
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

const { server, url } = await serve(ROOT);
const browser = await chromium.launch();

async function newPage(width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: devices['iPhone 13'].userAgent,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(url + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__hellbreach && !!window.__hellbreach.L, null, { timeout: 10000 });
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, errors, cdp };
}
const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const api = (page, fn, arg) => page.evaluate(fn, arg);
const H = 'window.__hellbreach';

/* ------------------------------------------------ static map validation --- */
{
  const { ctx, page, errors } = await newPage(844, 390);
  const levels = await api(page, () => window.__hellbreach.LEVELS.map((l) => l.map));
  levels.forEach((rows, li) => {
    const Ht = rows.length, W = rows[0].length;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= Ht ? '1' : rows[y][x]);
    const wall = (c) => /[1-7X]/.test(c);
    check(`level ${li + 1}: rectangular`, rows.every((r) => r.length === W));
    let closed = true;
    for (let x = 0; x < W; x++) closed = closed && wall(at(x, 0)) && wall(at(x, Ht - 1));
    for (let y = 0; y < Ht; y++) closed = closed && wall(at(0, y)) && wall(at(W - 1, y));
    check(`level ${li + 1}: border is sealed`, closed);
    const bad = rows.join('').split('').filter((c) => !/[1-7XDRBS.Pzfch W+maHbskeGNQIruoljtyx]/.test(c));
    check(`level ${li + 1}: only legal map characters`, bad.length === 0, bad.join(''));
    let doorsOk = true, doorDetail = '';
    for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) {
      if (!/[DRBS]/.test(at(x, y))) continue;
      const h = wall(at(x - 1, y)) && wall(at(x + 1, y)) && !wall(at(x, y - 1)) && !wall(at(x, y + 1));
      const v = wall(at(x, y - 1)) && wall(at(x, y + 1)) && !wall(at(x - 1, y)) && !wall(at(x + 1, y));
      if (!(h || v)) { doorsOk = false; doorDetail += `(${x},${y}) `; }
    }
    check(`level ${li + 1}: every door and secret sits in a wall gap`, doorsOk, doorDetail);
    let start; for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) if (at(x, y) === 'P') start = [x, y];
    const seen = new Set(), q = [[start[0], start[1], 0]], reach = new Set();
    let exitReached = false;
    const blocks = (c) => wall(c) || /[oljty]/.test(c);
    while (q.length) {
      let [x, y, k] = q.shift();
      const c = at(x, y);
      if (c === 'r') k |= 1; if (c === 'u') k |= 2;
      const id = `${x},${y},${k}`; if (seen.has(id)) continue; seen.add(id); reach.add(`${x},${y}`);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, n = at(nx, ny);
        if (n === 'X') { exitReached = true; continue; }
        if (blocks(n) || (n === 'R' && !(k & 1)) || (n === 'B' && !(k & 2))) continue;
        q.push([nx, ny, k]);
      }
    }
    check(`level ${li + 1}: exit reachable with obtainable keys`, exitReached);
    const stranded = [];
    for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) if (/[zfchW+maHbskeGNQIru]/.test(at(x, y)) && !reach.has(`${x},${y}`)) stranded.push(`${at(x, y)}@${x},${y}`);
    check(`level ${li + 1}: every monster and pickup is reachable`, stranded.length === 0, stranded.join(' '));
  });
  check('no errors during map validation', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------- play session --- */
const VW = 844, VH = 390; // iPhone 14 landscape
const { ctx, page, errors, cdp } = await newPage(VW, VH);
check('boots to title screen', await page.isVisible('#title'));
const t0 = Date.now();
await page.waitForFunction(() => window.__hellbreach.ready, null, { timeout: 30000 });
const bakeMs = Date.now() - t0;
check('sprite sculpting finishes on the title screen', true, `${bakeMs}ms`);
check('New mission is enabled once sprites are ready', await page.isEnabled('#btn-new'));
const sprites = await api(page, () => {
  const S = window.__hellbreach.SPR.mon, out = {};
  for (const [k, s] of Object.entries(S)) {
    const all = [...s.walk.flat(), ...s.atk.flat(), ...s.pain, ...s.die, ...s.gib];
    out[k] = { n: all.length, filled: all.every((p) => p && p.w > 4 && p.h > 4 && p.d.some((c) => c)), frontBackDiffer: s.walk[0][0].d.length !== s.walk[0][4].d.length || s.walk[0][0].d.some((c, i) => c !== s.walk[0][4].d[i]) };
  }
  return out;
});
for (const [k, v] of Object.entries(sprites)) {
  check(`${k}: every sprite frame rendered with pixels`, v.filled, `${v.n} frames`);
  check(`${k}: front and back views differ (8-angle sprites)`, v.frontBackDiffer);
}
await page.screenshot({ path: path.join(SHOTS, '01-title.png') });

await page.tap('#btn-new');
await page.waitForFunction(() => window.__hellbreach.mode === 'play');
check('new mission starts level 1 in play mode', await api(page, () => window.__hellbreach.L.idx === 0));
check('HUD, touch controls and weapon slots visible', (await page.isVisible('#hud')) && (await page.isVisible('#btn-fire')) && (await page.isVisible('#slots')));
check('render buffer matches viewport aspect', await api(page, ({ VW, VH }) => { const V = window.__hellbreach.V; return Math.abs(V.W / V.H - VW / VH) < 0.03; }, { VW, VH }));
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(SHOTS, '02-level-1.png') });

/* left-thumb stick */
let p0 = await api(page, () => ({ x: window.__hellbreach.P.x, a: window.__hellbreach.P.a }));
await touch(cdp, 'touchStart', [{ x: 150, y: 300, id: 1 }]);
for (let i = 1; i <= 6; i++) await touch(cdp, 'touchMove', [{ x: 150, y: 300 - i * 10, id: 1 }]);
await page.waitForTimeout(700);
await touch(cdp, 'touchEnd', []);
await page.waitForTimeout(150);
let p1 = await api(page, () => ({ x: window.__hellbreach.P.x, a: window.__hellbreach.P.a }));
check('stick forward moves the player forward', p1.x - p0.x > 1.0 && Math.abs(p1.a - p0.a) < 1e-6, `dx=${(p1.x - p0.x).toFixed(2)}`);
check('stick release stops input', await api(page, () => window.__hellbreach.input.stick.x === 0 && window.__hellbreach.input.stick.y === 0));
check('player stops quickly after release', await api(page, () => Math.hypot(window.__hellbreach.P.vx, window.__hellbreach.P.vy) < 0.2));

/* stick base follows the thumb past its rim */
await touch(cdp, 'touchStart', [{ x: 150, y: 300, id: 9 }]);
for (let i = 1; i <= 10; i++) await touch(cdp, 'touchMove', [{ x: 150, y: 300 - i * 15, id: 9 }]);
for (let i = 1; i <= 4; i++) await touch(cdp, 'touchMove', [{ x: 150, y: 150 + i * 25, id: 9 }]);
const sy = await api(page, () => window.__hellbreach.input.stick.y);
await touch(cdp, 'touchEnd', []);
check('stick reverses after a short drag back (floating base)', sy < -0.3, `stick.y=${sy.toFixed(2)}`);

/* right-thumb look */
await touch(cdp, 'touchStart', [{ x: 600, y: 200, id: 2 }]);
for (let i = 1; i <= 8; i++) await touch(cdp, 'touchMove', [{ x: 600 + i * 10, y: 200, id: 2 }]);
await touch(cdp, 'touchEnd', []);
const p2 = await api(page, () => window.__hellbreach.P.a);
check('right-side drag turns the view', Math.abs(angle(p2 - p1.a)) > 0.2);
function angle(d) { return Math.atan2(Math.sin(d), Math.cos(d)); }

/* FIRE: a quick tap fires one shot; holding auto-fires; dragging aims */
await api(page, () => { window.__hellbreach.P.fireT = 9; window.__hellbreach.P.cool = 0; });
const fireBox = await page.locator('#btn-fire').boundingBox();
const fx = fireBox.x + fireBox.width / 2, fy = fireBox.y + fireBox.height / 2;
let ammo0 = await api(page, () => window.__hellbreach.P.ammo.bullets);
await touch(cdp, 'touchStart', [{ x: fx, y: fy, id: 5 }]);
await touch(cdp, 'touchEnd', []);
await page.waitForTimeout(150);
check('a quick tap on FIRE always fires one shot', ammo0 - await api(page, () => window.__hellbreach.P.ammo.bullets) === 1);
ammo0 = await api(page, () => window.__hellbreach.P.ammo.bullets);
const a0 = await api(page, () => window.__hellbreach.P.a);
await touch(cdp, 'touchStart', [{ x: fx, y: fy, id: 6 }]);
for (let i = 1; i <= 5; i++) await touch(cdp, 'touchMove', [{ x: fx - i * 6, y: fy, id: 6 }]);
await page.waitForTimeout(900);
await touch(cdp, 'touchEnd', []);
check('holding FIRE auto-fires', ammo0 - await api(page, () => window.__hellbreach.P.ammo.bullets) >= 2);
check('dragging FIRE aims', Math.abs(angle(await api(page, () => window.__hellbreach.P.a) - a0)) > 0.05);

/* weapon slot buttons */
await api(page, () => window.__hellbreach.give());
await page.tap('#slots button[data-w="shotgun"]');
await page.waitForTimeout(400);
check('tapping a weapon slot switches weapon', await api(page, () => window.__hellbreach.P.cur === 'shotgun'));
await page.screenshot({ path: path.join(SHOTS, '03-shotgun.png') });

/* every gun renders a distinct first-person sprite and fires cleanly */
const gunInfo = await api(page, () => {
  const h = window.__hellbreach, out = {};
  for (const w of ['fist', 'pistol', 'shotgun', 'shredder', 'breacher', 'ion']) {
    const s = h.gunFrame(w, 0); let n = 0; for (const c of s.d) if (c) n++;
    out[w] = { px: n, w: s.w, h: s.h };
  }
  return out;
});
const sizes = Object.values(gunInfo).map((g) => g.px);
check('every gun sprite covers a real share of the screen', sizes.every((n) => n > 2000), JSON.stringify(gunInfo));
check('all six gun sprites have distinct shapes', new Set(sizes).size === 6);
const fired = await api(page, () => {
  const h = window.__hellbreach, r = {};
  for (const w of ['fist', 'pistol', 'shotgun', 'shredder', 'breacher', 'ion']) {
    h.select(w); h.teleport(10.5, 4.5, 0); const before = JSON.stringify(h.P.ammo); h.fire(); h.sim(0.4);
    r[w] = w === 'fist' || JSON.stringify(h.P.ammo) !== before;
  }
  return r;
});
check('all six weapons fire and spend ammo', Object.values(fired).every(Boolean), JSON.stringify(fired));

/* Shredder spins up before it fires */
const spin = await api(page, () => {
  const h = window.__hellbreach; h.select('shredder'); h.P.spin = 0; h.P.cool = 0; const b0 = h.P.ammo.bullets;
  h.input.fireTouch = true; h.sim(0.08); const early = b0 - h.P.ammo.bullets; h.sim(0.6); const later = b0 - h.P.ammo.bullets; h.input.fireTouch = false; h.sim(0.5);
  return { early, later };
});
check('Shredder spins up before firing, then sprays', spin.early === 0 && spin.later >= 4, JSON.stringify(spin));

/* doors */
await api(page, () => { const h = window.__hellbreach; h.P.god = true; for (const e of h.L.enemies) if (Math.hypot(e.x - 7.5, e.y - 3.5) < 5) e.state = 'dead'; h.select('pistol'); h.teleport(6.4, 3.5, 0); h.sim(1.2); });
check('plain door opens on approach', await api(page, () => window.__hellbreach.L.doors.find((d) => d.x === 7 && d.y === 3).open >= 1));
await api(page, () => { const h = window.__hellbreach; h.input.stick.y = 1; h.sim(0.8); h.input.stick.y = 0; });
check('player walks through an open door', await api(page, () => window.__hellbreach.P.x > 8));
await api(page, () => { const h = window.__hellbreach; h.teleport(12.5, 1.5, 0); h.sim(6); });
check('door closes again after the player leaves', await api(page, () => window.__hellbreach.L.doors.find((d) => d.x === 7 && d.y === 3).open === 0));

/* red key and red door */
await api(page, () => { const h = window.__hellbreach; h.teleport(24.5, 16.4, Math.PI / 2); h.sim(1.5); });
check('red door stays shut without the red keycard', await api(page, () => window.__hellbreach.L.doors.find((d) => d.lock === 'red').open === 0));
check('locked door explains itself', (await page.textContent('#msg')).includes('Red keycard'));
await api(page, () => { const h = window.__hellbreach; h.teleport(20.5, 12.5, 0); h.sim(0.2); });
check('walking onto the red keycard picks it up', await api(page, () => !!window.__hellbreach.P.keys.red));
await api(page, () => { const h = window.__hellbreach; h.teleport(24.5, 16.4, Math.PI / 2); h.sim(1.5); });
check('red door opens with the keycard', await api(page, () => window.__hellbreach.L.doors.find((d) => d.lock === 'red').open >= 1));

/* secret wall: push into it */
const secret = await api(page, () => {
  const h = window.__hellbreach, d = h.L.doors.find((q) => q.secret), before = h.L.secrets;
  h.teleport(d.x + 0.5, d.y - 0.62, Math.PI / 2); h.input.stick.y = 1; h.sim(0.5); h.input.stick.y = 0; h.sim(1.2);
  return { before, after: h.L.secrets, open: d.open, solidBefore: true };
});
check('pushing a secret wall opens it and counts the secret', secret.after === secret.before + 1 && secret.open >= 1, JSON.stringify(secret));
check('secret area reward is reachable', await api(page, () => { const h = window.__hellbreach; h.teleport(26.5, 8.5, 0); h.sim(0.2); return h.L.items.filter((i) => i.taken && i.y === 8.5).length > 0; }));

/* combat: pistol kills a thrall, which drops ammo */
const killed = await api(page, () => {
  const h = window.__hellbreach, L = h.L, P = h.P;
  const e = L.enemies.find((q) => q.type === 'thrall' && q.state !== 'dead' && q.state !== 'dying');
  for (const q of L.enemies) if (q !== e && Math.hypot(q.x - 12, q.y - 10.5) < 6) q.state = 'dead';
  e.x = 14.5; e.y = 10.5; e.state = 'idle'; P.cur = 'pistol'; h.teleport(11.5, 10.5, 0); const items0 = L.items.length;
  for (let i = 0; i < 400 && e.state !== 'dead'; i++) { P.a = Math.atan2(e.y - P.y, e.x - P.x); h.input.fireTouch = true; h.sim(1 / 60); }
  h.input.fireTouch = false; h.sim(0.7);
  return { state: e.state, drops: L.items.slice(items0).filter((i) => Math.hypot(i.x - e.x, i.y - e.y) < 0.4).length };
});
check('pistol hitscan kills a thrall', killed.state === 'dead', JSON.stringify(killed));
check('a dead thrall drops ammo', killed.drops === 1, JSON.stringify(killed));

/* overkill gibs */
const gib = await api(page, () => {
  const h = window.__hellbreach, L = h.L, P = h.P;
  const e = L.enemies.find((q) => q.type === 'thrall' && q.state !== 'dead' && q.state !== 'dying');
  e.x = 13.5; e.y = 10.5; e.state = 'idle'; e.hp = 24; h.teleport(12.3, 10.5, 0); P.a = 0; h.select('shotgun'); h.fire(); h.sim(0.8);
  return { state: e.state, gibbed: e.gibbed };
});
check('point-blank scattergun gibs a thrall', gib.state === 'dead' && gib.gibbed, JSON.stringify(gib));

/* aim assist pulls a near-miss onto the target */
const assist = await api(page, () => {
  const h = window.__hellbreach, L = h.L, P = h.P, out = {};
  for (const on of [false, true]) {
    h.settings.assist = on;
    const e = L.enemies.find((q) => q.type === 'fiend' && q.state !== 'dead' && q.state !== 'dying');
    for (const q of L.enemies) if (q !== e) q.state = 'dead';
    e.x = 14.5; e.y = 10.5; e.hp = 999; e.state = 'idle'; h.teleport(9.5, 10.5, 0.075); h.select('pistol'); P.fireT = 9;
    const hp0 = e.hp; h.fire(); h.sim(0.05); out[on ? 'on' : 'off'] = hp0 - e.hp; e.hp = 60;
  }
  h.settings.assist = true;
  return out;
});
check('aim assist lands a shot just off the crosshair', assist.on > 0 && assist.off === 0, JSON.stringify(assist));

/* monster AI: a maw hunts and bites */
await api(page, () => window.__hellbreach.start(1));
const ai = await api(page, () => {
  const h = window.__hellbreach, L = h.L, P = h.P;
  P.god = false; P.health = 400; P.armor = 0;
  const e = L.enemies.find((q) => q.type === 'maw');
  h.teleport(e.x - 3, e.y, Math.PI);
  const hp0 = P.health; h.sim(3);
  const r = { hp0, hp1: P.health, state: e.state };
  P.god = true; P.health = 100;
  return r;
});
check('maw charges and bites the player', ai.hp1 < ai.hp0, JSON.stringify(ai));

/* infighting: a fiend's fireball hitting a thrall turns the thrall on the fiend */
const fight = await api(page, () => {
  const h = window.__hellbreach, L = h.L;
  const t = L.enemies.find((q) => q.type === 'thrall' && q.state !== 'dead');
  const f = L.enemies.find((q) => q.type === 'fiend' && q.state !== 'dead');
  t.state = 'chase'; t.hp = 200;
  h.spawnProj('fireball', t.x - 0.6, t.y, 0.5, 0, f, 8); h.sim(0.3);
  return { target: t.target === f, hurt: t.hp < 200 };
});
check('monsters infight when one hits another', fight.target && fight.hurt, JSON.stringify(fight));

/* 8-angle sprite selection follows the viewer */
const angles = await api(page, () => {
  const h = window.__hellbreach, L = h.L, P = h.P;
  const e = L.enemies.find((q) => q.type === 'maw' && q.state !== 'dead');
  e.state = 'chase'; e.moving = false; e.face = 0; P.x = e.x + 3; P.y = e.y; const front = h.enemySprite(e);
  P.x = e.x - 3; const back = h.enemySprite(e);
  return front !== back && front === h.SPR.mon.maw.walk[0][0] && back === h.SPR.mon.maw.walk[0][4];
});
check('monsters show front, side and back views by viewing angle', angles);

/* barrel */
const boom = await api(page, () => {
  const h = window.__hellbreach, L = h.L, P = h.P;
  const b = L.props.find((p) => p.type === 'barrel');
  const e = L.enemies.find((q) => q.state !== 'dead' && q.state !== 'dying');
  const open = (x, y) => h.L.grid[(y | 0) * h.L.MW + (x | 0)] === 0;
  const [ox, oy] = [[-2.5, 0], [2.5, 0], [0, -2.5], [0, 2.5]].find(([dx, dy]) => open(b.x + dx, b.y + dy) && open(b.x + dx / 2, b.y + dy / 2) && open(b.x - dx * 0.32, b.y - dy * 0.32));
  e.x = b.x - ox * 0.32; e.y = b.y - oy * 0.32; e.state = 'idle'; e.hp = 25;
  h.settings.assist = false; h.teleport(b.x + ox, b.y + oy, 0); h.select('pistol'); P.ammo.bullets = 100;
  for (let i = 0; i < 300 && L.props.includes(b); i++) { P.a = Math.atan2(b.y - P.y, b.x - P.x); h.input.fireTouch = true; h.sim(1 / 60); }
  h.input.fireTouch = false; h.sim(0.5); h.settings.assist = true;
  return { gone: !L.props.includes(b), enemyHp: e.hp, state: e.state, mode: h.mode };
});
check('shot barrel explodes and damages a monster beside it', boom.gone && (boom.enemyHp < 25 || boom.state !== 'idle'), JSON.stringify(boom));

/* automap and pause */
await page.tap('#btn-map');
await page.waitForTimeout(150);
check('automap opens', await page.isVisible('#map'));
await page.screenshot({ path: path.join(SHOTS, '04-automap.png') });
await page.tap('#btn-map');
await page.tap('#btn-pause');
check('pause menu opens', await page.isVisible('#pause'));
const tA = await api(page, () => window.__hellbreach.L.time);
await page.waitForTimeout(400);
check('paused game does not advance', tA === await api(page, () => window.__hellbreach.L.time));
await page.tap('#btn-resume');
await page.waitForTimeout(300);
check('resume continues the level', (await api(page, () => window.__hellbreach.L.time)) > tA);

/* lava hurts (level 3) */
const lava = await api(page, () => {
  const h = window.__hellbreach; h.start(2); const P = h.P; P.god = false; P.health = 100;
  for (const e of h.L.enemies) e.state = 'dead';
  h.teleport(15.5, 2.5, 0); h.sim(1.3); const hp = P.health; P.god = true; P.health = 100; return hp;
});
check('standing in lava burns', lava < 100, `health ${lava}`);
await api(page, () => { const h = window.__hellbreach; h.teleport(15.5, 4.5, -Math.PI / 2); h.sim(0.1); });
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(SHOTS, '05-foundry.png') });

/* boss gate (level 4) */
const gate = await api(page, () => {
  const h = window.__hellbreach; h.start(3); const L = h.L;
  h.teleport(30.4, 21.5, 0); h.input.stick.y = 1; h.sim(0.4); h.input.stick.y = 0;
  const blocked = h.mode === 'play';
  h.damageEnemy(L.boss, 99999, 'player'); h.sim(1);
  h.teleport(30.4, 21.5, 0); h.input.stick.y = 1; h.sim(0.4); h.input.stick.y = 0;
  return { blocked, done: h.mode };
});
check('the final exit stays sealed while the Warden lives', gate.blocked);
check('killing the Warden lets you finish the mission', gate.done === 'win', JSON.stringify(gate));
await page.waitForTimeout(200);
check('win screen shows run stats with secrets', (await page.textContent('#win-stats')).includes('Secrets'));

/* boss up close for a visual check */
await api(page, () => { const h = window.__hellbreach; h.start(3); h.P.god = true; const b = h.L.boss; b.state = 'chase'; b.alerted = true; h.teleport(b.x, b.y + 4, -Math.PI / 2); b.face = Math.PI / 2; });
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(SHOTS, '06-warden.png') });
check('boss health bar shows during the fight', await page.isVisible('#boss'));

/* level transitions carry gear; keys reset */
await api(page, () => { const h = window.__hellbreach; h.start(0); h.give(); h.P.keys.red = true; h.completeLevel(); });
await page.waitForTimeout(200);
check('touching EXIT shows the intermission', await page.isVisible('#inter'));
check('intermission shows kills, items and secrets', (await page.textContent('#inter-stats')).includes('Secrets'));
await page.tap('#btn-next');
await page.waitForFunction(() => window.__hellbreach.mode === 'play');
check('next deck loads with carried weapons and no keys', await api(page, () => { const P = window.__hellbreach.P; return window.__hellbreach.L.idx === 1 && P.weapons.ion && !P.keys.red; }));

/* stability soak */
for (let li = 0; li < 4; li++) {
  const r = await api(page, (li) => {
    const h = window.__hellbreach; h.start(li); const P = h.P; P.god = true; h.give();
    for (const e of h.L.enemies) { e.state = 'chase'; e.cd = 1; }
    let bad = null;
    for (let s = 0; s < 25 * 60; s++) {
      P.a += 0.01; h.input.stick.y = Math.sin(s / 90) * 0.8; h.input.fireTouch = s % 120 < 30;
      if (s % 300 === 0) h.select(['pistol', 'shotgun', 'shredder', 'breacher', 'ion'][(s / 300) % 5]);
      h.sim(1 / 60);
      for (const e of h.L.enemies) if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) bad = 'enemy NaN';
      if (!Number.isFinite(P.x) || !Number.isFinite(P.y)) bad = 'player NaN';
      const g = h.L.grid[(P.y | 0) * h.L.MW + (P.x | 0)];
      if (g > 0 && g < 10) bad = `player inside wall`;
    }
    h.input.stick.y = 0; h.input.fireTouch = false;
    const inWall = h.L.enemies.filter((e) => { const g = h.L.grid[(e.y | 0) * h.L.MW + (e.x | 0)]; return g > 0 && g < 10; }).length;
    return { bad, inWall, kills: h.L.kills };
  }, li);
  check(`level ${li + 1}: 25s all-monsters soak stays valid`, !r.bad && r.inWall === 0, JSON.stringify(r));
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, `07-soak-${li + 1}.png`) });
}

/* death and retry */
await api(page, () => { const h = window.__hellbreach; h.start(1, { health: 77, armor: 12, ammo: { bullets: 33, shells: 9, rockets: 2, cells: 0 }, weapons: { fist: true, pistol: true, shotgun: true }, cur: 'shotgun' }); h.P.god = false; h.hurt(999); h.sim(1.6); });
await page.waitForTimeout(150);
check('dying shows the death screen', await page.isVisible('#dead'));
await page.tap('#btn-retry');
await page.waitForFunction(() => window.__hellbreach.mode === 'play');
check('retry restores the gear you entered the level with', await api(page, () => { const P = window.__hellbreach.P; return P.health === 77 && P.armor === 12 && P.ammo.shells === 9 && P.cur === 'shotgun' && !P.dead; }));

/* performance */
await api(page, () => { window.__hellbreach.select('shotgun'); });
await page.waitForTimeout(1500);
const perf = await api(page, () => ({ ms: window.__hellbreach.V.ms, W: window.__hellbreach.V.W, H: window.__hellbreach.V.H }));
check('frame render under 8ms (CPU, headless)', perf.ms < 8, `${perf.ms.toFixed(2)}ms at ${perf.W}x${perf.H}`);

/* persistence */
await api(page, () => { const h = window.__hellbreach; h.start(0); h.completeLevel(); });
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !!window.__hellbreach && window.__hellbreach.ready, null, { timeout: 30000 });
check('title offers Continue after a reload', await page.isVisible('#btn-continue'));
check('continue names the saved level', (await page.textContent('#btn-continue')).includes('Reactor Spine'));
check('no console errors or page exceptions (landscape)', errors.length === 0, errors.join(' | '));
await ctx.close();

/* ------------------------------------------------------------ portrait --- */
{
  const { ctx, page, errors, cdp } = await newPage(390, 844);
  await page.waitForFunction(() => window.__hellbreach.ready, null, { timeout: 30000 });
  await page.screenshot({ path: path.join(SHOTS, '08-portrait-title.png') });
  await page.tap('#btn-new');
  await page.waitForFunction(() => window.__hellbreach.mode === 'play');
  const before = await api(page, () => window.__hellbreach.P.x);
  await touch(cdp, 'touchStart', [{ x: 90, y: 700, id: 1 }]);
  for (let i = 1; i <= 6; i++) await touch(cdp, 'touchMove', [{ x: 90, y: 700 - i * 10, id: 1 }]);
  await page.waitForTimeout(500);
  await touch(cdp, 'touchEnd', []);
  check('portrait: stick moves the player', (await api(page, () => window.__hellbreach.P.x)) - before > 0.6);
  const overlap = await api(page, () => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const a = r('.hud-l'), b = r('.hud-r'), c = r('.hud-top');
    const hit = (p, q) => !(p.right <= q.left || q.right <= p.left || p.bottom <= q.top || q.bottom <= p.top);
    return { lr: hit(a, b), lt: hit(a, c), rt: hit(b, c), rightEdge: b.right <= innerWidth };
  });
  check('portrait: HUD blocks do not overlap or overflow', !overlap.lr && !overlap.lt && !overlap.rt && overlap.rightEdge, JSON.stringify(overlap));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOTS, '09-portrait-play.png') });
  check('no console errors or page exceptions (portrait)', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
