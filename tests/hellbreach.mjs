/* Hellbreach end-to-end playtest. Drives the real page in Chromium at iPhone
   sizes with genuine multi-touch input (CDP touch events -> pointer events),
   validates every map is solvable, exercises combat, doors, keys, pickups,
   barrels, death, level transitions and persistence, and fails on any console
   error or page exception.  Run: node tests/hellbreach.mjs */

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

/* ------------------------------------------------ static map validation --- */
{
  const { ctx, page, errors } = await newPage(844, 390);
  const levels = await api(page, () => window.__hellbreach.LEVELS.map((l) => l.map));
  levels.forEach((rows, li) => {
    const H = rows.length, W = rows[0].length;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '1' : rows[y][x]);
    const wall = (c) => /[1-5X]/.test(c);
    check(`level ${li + 1}: rectangular`, rows.every((r) => r.length === W));
    let closed = true;
    for (let x = 0; x < W; x++) closed &&= wall(at(x, 0)) && wall(at(x, H - 1));
    for (let y = 0; y < H; y++) closed &&= wall(at(0, y)) && wall(at(W - 1, y));
    check(`level ${li + 1}: border is sealed`, closed);
    const legal = /[1-5XDRB.Phcdw W+mabseGLruol]/;
    const bad = rows.join('').split('').filter((c) => !legal.test(c));
    check(`level ${li + 1}: only legal map characters`, bad.length === 0, bad.join(''));
    let doorsOk = true, doorDetail = '';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!/[DRB]/.test(at(x, y))) continue;
      const h = wall(at(x - 1, y)) && wall(at(x + 1, y)) && !wall(at(x, y - 1)) && !wall(at(x, y + 1));
      const v = wall(at(x, y - 1)) && wall(at(x, y + 1)) && !wall(at(x - 1, y)) && !wall(at(x + 1, y));
      if (!(h || v)) { doorsOk = false; doorDetail += `(${x},${y}) `; }
    }
    check(`level ${li + 1}: every door sits in a wall gap`, doorsOk, doorDetail);
    // Solve: BFS over (tile, keys held). Keys are picked up by walking over them.
    let start; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === 'P') start = [x, y];
    const seen = new Set(), q = [[start[0], start[1], 0]];
    const reach = new Set(); let exitReached = false;
    const blocks = (c) => wall(c) || c === 'o' || c === 'l';
    while (q.length) {
      let [x, y, k] = q.shift();
      const c = at(x, y);
      if (c === 'r') k |= 1; if (c === 'u') k |= 2;
      const id = `${x},${y},${k}`; if (seen.has(id)) continue; seen.add(id); reach.add(`${x},${y}`);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, n = at(nx, ny);
        if (n === 'X') { exitReached = true; continue; }
        if (blocks(n)) continue;
        if (n === 'R' && !(k & 1)) continue;
        if (n === 'B' && !(k & 2)) continue;
        q.push([nx, ny, k]);
      }
    }
    check(`level ${li + 1}: exit reachable with obtainable keys`, exitReached);
    let stranded = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = at(x, y);
      if (/[hcdW+mabseGLru]/.test(c) && !reach.has(`${x},${y}`)) stranded.push(`${c}@${x},${y}`);
    }
    check(`level ${li + 1}: every monster and pickup is reachable`, stranded.length === 0, stranded.join(' '));
  });
  check('no errors during map validation', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------- play session --- */
const VW = 844, VH = 390; // iPhone 14 landscape
const { ctx, page, errors, cdp } = await newPage(VW, VH);
check('boots to title screen', await page.isVisible('#title'));
check('title shows new mission button', await page.isVisible('#btn-new'));
await page.screenshot({ path: path.join(SHOTS, '01-title.png') });

await page.tap('#btn-new');
await page.waitForFunction(() => window.__hellbreach.mode === 'play');
check('new mission starts level 1 in play mode', await api(page, () => window.__hellbreach.L.idx === 0 && window.__hellbreach.mode === 'play'));
check('HUD and touch controls visible', (await page.isVisible('#hud')) && (await page.isVisible('#btn-fire')) && (await page.isVisible('#stick')));
check('render buffer matches viewport aspect', await api(page, ({ VW, VH }) => {
  const V = window.__hellbreach.V; return Math.abs(V.W / V.H - VW / VH) < 0.03;
}, { VW, VH }));

/* left-thumb stick: push up, player should move forward (east) */
let p0 = await api(page, () => ({ x: window.__hellbreach.P.x, y: window.__hellbreach.P.y, a: window.__hellbreach.P.a }));
await touch(cdp, 'touchStart', [{ x: 150, y: 300, id: 1 }]);
for (let i = 1; i <= 6; i++) await touch(cdp, 'touchMove', [{ x: 150, y: 300 - i * 10, id: 1 }]);
await page.waitForTimeout(700);
await touch(cdp, 'touchEnd', []);
let p1 = await api(page, () => ({ x: window.__hellbreach.P.x, y: window.__hellbreach.P.y, a: window.__hellbreach.P.a }));
check('stick forward moves the player forward', p1.x - p0.x > 1.0 && Math.abs(p1.a - p0.a) < 1e-6, `dx=${(p1.x - p0.x).toFixed(2)}`);
check('stick release stops input', await api(page, () => window.__hellbreach.input.stick.x === 0 && window.__hellbreach.input.stick.y === 0));

/* right-thumb drag turns */
await touch(cdp, 'touchStart', [{ x: 600, y: 200, id: 2 }]);
for (let i = 1; i <= 8; i++) await touch(cdp, 'touchMove', [{ x: 600 + i * 10, y: 200, id: 2 }]);
await touch(cdp, 'touchEnd', []);
let p2 = await api(page, () => window.__hellbreach.P.a);
check('right-side drag turns the view', Math.abs(p2 - p1.a) > 0.2, `da=${(p2 - p1.a).toFixed(3)}`);

/* simultaneous stick + look (two fingers) */
p1 = await api(page, () => ({ x: window.__hellbreach.P.x, y: window.__hellbreach.P.y, a: window.__hellbreach.P.a }));
await touch(cdp, 'touchStart', [{ x: 150, y: 300, id: 3 }]);
await touch(cdp, 'touchStart', [{ x: 150, y: 300, id: 3 }, { x: 600, y: 200, id: 4 }]);
for (let i = 1; i <= 6; i++) await touch(cdp, 'touchMove', [{ x: 150, y: 300 + i * 8, id: 3 }, { x: 600 - i * 8, y: 200, id: 4 }]);
await page.waitForTimeout(300);
await touch(cdp, 'touchEnd', []);
p2 = await api(page, () => ({ x: window.__hellbreach.P.x, y: window.__hellbreach.P.y, a: window.__hellbreach.P.a }));
check('two-finger move and look work together', Math.hypot(p2.x - p1.x, p2.y - p1.y) > 0.3 && Math.abs(p2.a - p1.a) > 0.1);

/* FIRE button: hold fires, sliding it also aims */
const fireBox = await page.locator('#btn-fire').boundingBox();
const fx = fireBox.x + fireBox.width / 2, fy = fireBox.y + fireBox.height / 2;
const ammo0 = await api(page, () => window.__hellbreach.P.ammo.bullets);
const a0 = await api(page, () => window.__hellbreach.P.a);
await touch(cdp, 'touchStart', [{ x: fx, y: fy, id: 5 }]);
for (let i = 1; i <= 5; i++) await touch(cdp, 'touchMove', [{ x: fx - i * 6, y: fy, id: 5 }]);
await page.waitForTimeout(900);
await touch(cdp, 'touchEnd', []);
const ammo1 = await api(page, () => window.__hellbreach.P.ammo.bullets);
const a1 = await api(page, () => window.__hellbreach.P.a);
check('holding FIRE auto-fires', ammo0 - ammo1 >= 2, `${ammo0} -> ${ammo1}`);
check('dragging FIRE aims', Math.abs(a1 - a0) > 0.05);
check('releasing FIRE stops firing', await api(page, () => !window.__hellbreach.input.fireTouch));

/* doors: approach the room A -> hall door at (7,3) */
/* earlier gunfire woke the hall; clear the doorway so only the door itself is under test */
await api(page, () => { const h = window.__hellbreach; h.P.god = true; for (const e of h.L.enemies) if (Math.hypot(e.x - 7.5, e.y - 3.5) < 4) e.state = 'dead'; h.teleport(6.4, 3.5, 0); h.sim(1.2); });
check('plain door opens on approach', await api(page, () => window.__hellbreach.L.doors.find((d) => d.x === 7 && d.y === 3).open >= 1));
await api(page, () => { const h = window.__hellbreach; h.input.stick.y = 1; h.sim(1.0); h.input.stick.y = 0; });
check('player walks through an open door', await api(page, () => window.__hellbreach.P.x > 8));
await api(page, () => { const h = window.__hellbreach; h.teleport(10.5, 1.5, 0); h.sim(6); });
check('door closes again after the player leaves', await api(page, () => window.__hellbreach.L.doors.find((d) => d.x === 7 && d.y === 3).open === 0));

/* locked red door at (22,13) */
await api(page, () => { const h = window.__hellbreach; h.teleport(22.5, 12.6, Math.PI / 2); h.sim(1.5); });
check('red door stays shut without the red keycard', await api(page, () => window.__hellbreach.L.doors.find((d) => d.x === 22 && d.y === 13).open === 0));
check('locked door explains itself', (await page.textContent('#msg')).includes('Red keycard'));
await api(page, () => { const h = window.__hellbreach; h.teleport(16.5, 10.5, 0); h.sim(0.2); });
check('walking onto the red keycard picks it up', await api(page, () => !!window.__hellbreach.P.keys.red));
await api(page, () => { const h = window.__hellbreach; h.teleport(22.5, 12.6, Math.PI / 2); h.sim(1.5); });
check('red door opens with the keycard', await api(page, () => window.__hellbreach.L.doors.find((d) => d.x === 22 && d.y === 13).open >= 1));

/* combat: face the nearest husk in the main hall and shoot it until dead */
const killed = await api(page, () => {
  const h = window.__hellbreach, L = h.L, P = h.P;
  const e = L.enemies.find((q) => q.type === 'husk' && q.x < 18 && q.y < 6 && q.state !== 'dead');
  P.ammo.bullets = 100; P.cur = 'pistol';
  h.teleport(e.x - 3, e.y, 0);
  for (let i = 0; i < 400 && e.state !== 'dead' && e.state !== 'dying'; i++) { P.a = Math.atan2(e.y - P.y, e.x - P.x); h.input.fireTouch = true; h.sim(1 / 60); }
  h.input.fireTouch = false; h.sim(0.6);
  return { state: e.state, kills: L.kills };
});
check('pistol hitscan kills a husk', killed.state === 'dead' && killed.kills >= 1, JSON.stringify(killed));

/* scattergun pickup and one-shot power */
await api(page, () => { const h = window.__hellbreach; h.teleport(2.5, 9.5, 0); h.sim(0.6); });
check('walking onto the scattergun gives and equips it', await api(page, () => window.__hellbreach.P.weapons.shotgun && window.__hellbreach.P.cur === 'shotgun'));
const sgKill = await api(page, () => {
  const h = window.__hellbreach, L = h.L, P = h.P;
  const e = L.enemies.find((q) => q.type === 'crawler' && q.state !== 'dead' && q.state !== 'dying');
  h.teleport(e.x - 1.6, e.y, 0); e.x = P.x + 1.6; e.y = P.y; e.state = 'idle';
  P.a = 0; P.cool = 0; h.fire();
  h.sim(0.6);
  return e.state;
});
check('point-blank scattergun drops a crawler in one shot', sgKill === 'dead', sgKill);

/* enemy AI: wakes, hunts, and damages the player */
const aiRes = await api(page, () => {
  const h = window.__hellbreach, L = h.L, P = h.P;
  P.god = false; P.health = 100; P.armor = 0;
  const e = L.enemies.find((q) => q.type === 'crawler' && q.state !== 'dead' && q.state !== 'dying');
  h.teleport(e.x - 3, e.y, Math.PI);
  const hp0 = P.health; h.sim(4);
  const r = { hp0, hp1: P.health, state: e.state, d: Math.hypot(e.x - P.x, e.y - P.y) };
  P.god = true; P.health = 100;
  return r;
});
check('crawler hunts and bites the player', aiRes.hp1 < aiRes.hp0, JSON.stringify(aiRes));

/* barrel: shooting it explodes and hurts things nearby */
const boom = await api(page, () => {
  const h = window.__hellbreach, L = h.L, P = h.P;
  const b = L.props.find((p) => p.type === 'barrel');
  const e = L.enemies.find((q) => q.state !== 'dead' && q.state !== 'dying' && q.type !== 'brute');
  e.x = b.x + 0.8; e.y = b.y; e.state = 'idle'; e.hp = 25;
  h.teleport(b.x - 3, b.y, 0); P.cur = 'pistol'; P.ammo.bullets = 50;
  for (let i = 0; i < 300 && L.props.includes(b); i++) { P.a = Math.atan2(b.y - P.y, b.x - P.x); h.input.fireTouch = true; h.sim(1 / 60); }
  h.input.fireTouch = false; h.sim(0.5);
  return { gone: !L.props.includes(b), enemyHp: e.hp, enemyState: e.state };
});
check('shot barrel explodes and is removed', boom.gone, JSON.stringify(boom));
check('barrel blast damages a monster beside it', boom.enemyHp < 25 || boom.enemyState === 'dead', JSON.stringify(boom));

await api(page, () => { const h = window.__hellbreach; h.teleport(10.5, 3.5, 0.2); h.sim(0.1); });
await page.waitForTimeout(150);
await page.screenshot({ path: path.join(SHOTS, '02-combat-hall.png') });

/* automap */
await page.tap('#btn-map');
await page.waitForTimeout(150);
check('automap opens', await page.isVisible('#map'));
await page.screenshot({ path: path.join(SHOTS, '03-automap.png') });
await page.tap('#btn-map');
check('automap closes', !(await page.isVisible('#map')));

/* pause freezes the simulation */
await page.tap('#btn-pause');
check('pause menu opens', await page.isVisible('#pause'));
const tA = await api(page, () => window.__hellbreach.L.time);
await page.waitForTimeout(400);
const tB = await api(page, () => window.__hellbreach.L.time);
check('paused game does not advance', tA === tB);
await page.tap('#btn-resume');
await page.waitForTimeout(300);
check('resume continues the level', (await api(page, () => window.__hellbreach.L.time)) > tB);

/* exit switch: walk into the green panel at (27,16) */
await api(page, () => { const h = window.__hellbreach; h.teleport(26.4, 16.5, 0); h.input.stick.y = 1; h.sim(0.5); h.input.stick.y = 0; });
await page.waitForTimeout(200);
check('touching EXIT completes the level', await page.isVisible('#inter'));
check('intermission shows kill and item stats', (await page.textContent('#inter-stats')).includes('Kills'));
await page.screenshot({ path: path.join(SHOTS, '04-intermission.png') });
const carried = await api(page, () => JSON.parse(localStorage.getItem('hellbreach.v1')).progress);
check('progress saved with carried weapons', carried && carried.level === 1 && carried.carry.weapons.shotgun === true);
await page.tap('#btn-next');
await page.waitForFunction(() => window.__hellbreach.mode === 'play');
check('next deck loads level 2 with the scattergun', await api(page, () => window.__hellbreach.L.idx === 1 && window.__hellbreach.P.weapons.shotgun));
check('keycards do not carry between levels', await api(page, () => !window.__hellbreach.P.keys.red));

/* stability soak: every level, all monsters awake, 25 simulated seconds, god mode */
for (let li = 0; li < 3; li++) {
  const r = await api(page, (li) => {
    const h = window.__hellbreach; h.start(li); const P = h.P; P.god = true;
    for (const e of h.L.enemies) { e.state = 'chase'; e.cd = 1; }
    let bad = null;
    for (let s = 0; s < 25 * 60; s++) {
      P.a += 0.01; h.input.stick.y = Math.sin(s / 90) * 0.8; h.input.fireTouch = s % 120 < 30;
      h.sim(1 / 60);
      for (const e of h.L.enemies) if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) bad = 'enemy NaN';
      if (!Number.isFinite(P.x) || !Number.isFinite(P.y)) bad = 'player NaN';
      const tx = P.x | 0, ty = P.y | 0;
      if (h.L.grid[ty * h.L.MW + tx] > 0 && h.L.grid[ty * h.L.MW + tx] < 10) bad = `player inside wall at ${tx},${ty}`;
    }
    h.input.stick.y = 0; h.input.fireTouch = false;
    const inWall = h.L.enemies.filter((e) => { const g = h.L.grid[(e.y | 0) * h.L.MW + (e.x | 0)]; return g > 0 && g < 10; }).length;
    return { bad, inWall, projs: h.L.projs.length, kills: h.L.kills };
  }, li);
  check(`level ${li + 1}: 25s all-monsters soak stays valid`, !r.bad && r.inWall === 0, JSON.stringify(r));
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(SHOTS, `05-soak-level-${li + 1}.png`) });
}

/* monsters in view for a visual check */
await api(page, () => {
  const h = window.__hellbreach; h.start(2); h.P.god = true;
  const L = h.L; const pos = [[15.2, 12], [16.6, 12.3], [17.9, 12], [19.6, 11.4]], types = ['husk', 'crawler', 'drone', 'brute'];
  L.enemies.forEach((e, i) => { if (i < 4) { e.type = types[i]; e.x = pos[i][0]; e.y = pos[i][1]; e.state = 'idle'; e.z = i === 2 ? 0.32 : 0; e.r = 0.3; } else e.state = 'dead'; });
  h.teleport(17.3, 15.5, -Math.PI / 2);
});
await page.waitForTimeout(250);
await page.screenshot({ path: path.join(SHOTS, '06-bestiary.png') });

/* death and retry */
await api(page, () => { const h = window.__hellbreach; h.start(1, { health: 77, armor: 12, ammo: { bullets: 33, shells: 9, cells: 0 }, weapons: { fist: true, pistol: true, shotgun: true }, cur: 'shotgun' }); h.P.god = false; h.hurt(999); h.sim(1.6); });
await page.waitForTimeout(150);
check('dying shows the death screen', await page.isVisible('#dead'));
await page.screenshot({ path: path.join(SHOTS, '07-dead.png') });
await page.tap('#btn-retry');
await page.waitForFunction(() => window.__hellbreach.mode === 'play');
check('retry restores the gear you entered the level with', await api(page, () => {
  const P = window.__hellbreach.P; return P.health === 77 && P.armor === 12 && P.ammo.shells === 9 && P.cur === 'shotgun' && !P.dead;
}));

/* performance: real frames at iPhone 14 landscape resolution */
await page.waitForTimeout(1500);
const perf = await api(page, () => ({ ms: window.__hellbreach.V.ms, W: window.__hellbreach.V.W, H: window.__hellbreach.V.H }));
check('frame render under 8ms (CPU, headless)', perf.ms < 8, `${perf.ms.toFixed(2)}ms at ${perf.W}x${perf.H}`);

/* persistence across reload */
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !!window.__hellbreach && !!window.__hellbreach.L);
check('title offers Continue after a reload', await page.isVisible('#btn-continue'));
check('continue names the saved level', (await page.textContent('#btn-continue')).includes('Reactor Spine'));

check('no console errors or page exceptions (landscape)', errors.length === 0, errors.join(' | '));
await ctx.close();

/* ------------------------------------------------------------ portrait --- */
{
  const { ctx, page, errors, cdp } = await newPage(390, 844);
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
    return hit(a, b) || hit(a, c) || hit(b, c);
  });
  check('portrait: HUD blocks do not overlap', !overlap);
  await page.screenshot({ path: path.join(SHOTS, '09-portrait-play.png') });
  check('no console errors or page exceptions (portrait)', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
