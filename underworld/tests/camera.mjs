/* Camera (v6): on-foot auto-follow (a held new heading → short pause → the camera eases round behind the
   character; tiny corrections ignored; manual camera input suspends it; sprinting recentres sooner; holding a
   sideways stick never walks the character in circles; standing still you can look anywhere) and occlusion
   (a fan-ray sphere cast keeps the lens out of buildings, poles and trees on foot, aiming, sprinting, driving
   and reversing, inside interiors too; recovery outward is damped). Also the v6 on-foot pace. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);

// helpers installed in the page
await ev(() => {
  const g = window.game;
  window.__step = (n, f) => { for (let i = 0; i < n; i++) { if (f) f(i); g.update(1 / 60, 1 / 60); } };
  window.__hold = (keys) => { g.input.down.clear(); for (const k of keys) g.input.down.add(k); };
  window.__wrap = a => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
  // somewhere open: a street node with no collider within 14 m
  window.__open = () => {
    const P = 64, grid = g.world.grid, out = [];
    for (let i = 2; i < 10; i++) for (let j = 2; j < 10; j++) { const x = i * P, z = j * P; grid.query(x - 14, z - 14, x + 14, z + 14, out); if (!out.some(c => c.y1 > 1)) return { x, z }; }
    return { x: 3 * P, z: 3 * P };
  };
  window.__place = (x, z, h, yaw) => { const p = g.player; p.pos.set(x, window.__pv.groundY(x, z), z); p.vel.set(0, 0, 0); p.h = h; g.cam.reset(yaw); g.cam.lookAge = 5; g.input.lastLookInput = performance.now() - 5000; };
  // is the lens inside anything solid, or is there a wall between the lens and the player?
  window.__lensOK = () => {
    const c = g.cam, p = g.player, grid = g.world.grid, q = [];
    const cx = c.pos.x, cy = c.pos.y, cz = c.pos.z;
    grid.query(cx - 0.3, cz - 0.3, cx + 0.3, cz + 0.3, q);
    for (const k of q) { if (k.y1 - (k.base || 0) < 0.35 && k.kind !== 'int') continue; if (k.r !== undefined) { if (Math.hypot(cx - k.x, cz - k.z) < k.r + 0.05 && cy > k.y0 && cy < k.y1) return false; } else if (cx > k.x0 + 0.02 && cx < k.x1 - 0.02 && cz > k.z0 + 0.02 && cz < k.z1 - 0.02 && cy > k.y0 && cy < k.y1) return false; }
    const t = c.smTarget, dx = cx - t.x, dy = cy - t.y, dz = cz - t.z, L = Math.hypot(dx, dy, dz);
    if (L < 0.2) return true;
    const hit = grid.raycast(t.x, t.y, t.z, dx / L, dy / L, dz / L, L - 0.05, 0.35);
    return !hit; void p;
  };
});
const op = await ev(() => window.__open());

// ---- auto-follow
const follow = await ev((op) => {
  const g = window.game, c = g.cam, p = g.player, out = {};
  window.__place(op.x, op.z, 0, 0);
  window.__hold(['left']);
  window.__step(12); out.yawEarly = c.yaw; // 0.2 s: nothing yet
  window.__step(48);  // 1 s
  out.yaw1 = c.yaw;
  const heads = [];
  window.__step(240, i => { if (i % 20 === 0) heads.push(Math.atan2(p.vel.x, p.vel.z)); });
  out.yaw5 = c.yaw; out.head = Math.atan2(p.vel.x, p.vel.z);
  out.err = Math.abs(window.__wrap(out.head - c.yaw));
  out.headSpread = Math.max(...heads.slice(2).map(h => Math.abs(window.__wrap(h - heads[2]))));
  window.__hold([]); window.__step(30);
  return out;
}, op);
check('on foot: a new heading waits a moment before the camera moves (no snap)', Math.abs(follow.yawEarly) < 0.01, JSON.stringify(follow));
check('on foot: the camera then eases round behind the character', follow.err < 0.2 && Math.abs(follow.yaw5) > 1.2, JSON.stringify(follow));
check('holding the stick sideways does not walk the character in circles (heading stays put)', follow.headSpread < 0.12, JSON.stringify(follow));

const tiny = await ev((op) => {
  const g = window.game, c = g.cam;
  window.__place(op.x, op.z, 0, 0);
  // the stick a few degrees off straight ahead: a small correction
  g.input.down.clear(); g.input.stick.active = true; g.input.stick.x = 0.07; g.input.stick.y = 0.99;
  window.__step(180);
  g.input.stick.active = false; g.input.stick.x = 0; g.input.stick.y = 0;
  return { yaw: c.yaw };
}, op);
check('tiny stick corrections are ignored', Math.abs(tiny.yaw) < 0.02, JSON.stringify(tiny));

const manual = await ev((op) => {
  const g = window.game, c = g.cam, out = {};
  window.__place(op.x, op.z, 0, 0);
  window.__hold(['left']);
  // the player keeps turning the camera the other way by hand for 1.5 s
  c.ffTurned = 0;
  window.__step(90, () => { g.input.lookX += 2; });
  out.autoWhileManual = c.ffTurned;
  out.yawAfterManual = c.yaw;
  // hands off: after a pause it recentres behind the character again
  window.__step(240);
  out.autoAfter = c.ffTurned;
  out.err = Math.abs(window.__wrap(Math.atan2(g.player.vel.x, g.player.vel.z) - c.yaw));
  window.__hold([]); window.__step(30);
  return out;
}, op);
check('manual camera input suspends auto-follow', manual.autoWhileManual < 0.01, JSON.stringify(manual));
check('…and once you let go and keep moving it gently returns behind the character', manual.autoAfter > 0.2 && manual.err < 0.3, JSON.stringify(manual));

const sprint = await ev((op) => {
  const g = window.game, c = g.cam, p = g.player, out = {};
  const timeTo = (keys) => { window.__place(op.x, op.z, 0, 0); p.stamina = 1; window.__hold(keys); let n = 0; for (; n < 600; n++) { g.update(1 / 60, 1 / 60); if (Math.abs(window.__wrap(Math.atan2(p.vel.x, p.vel.z) - c.yaw)) < 0.25 && Math.hypot(p.vel.x, p.vel.z) > 1) break; } window.__hold([]); window.__step(40); return n; };
  out.walk = timeTo(['right']); out.sprint = timeTo(['right', 'sprint']);
  return out;
}, op);
check('sprinting recentres faster than walking', sprint.sprint < sprint.walk, JSON.stringify(sprint));

const lookBack = await ev((op) => {
  const g = window.game, c = g.cam;
  window.__place(op.x, op.z, 0, Math.PI); // looking back at the character's face, standing still
  window.__hold([]); window.__step(240);
  return { yaw: c.yaw };
}, op);
check('standing still you can look sideways or backwards as long as you like', Math.abs(lookBack.yaw - Math.PI) < 0.01, JSON.stringify(lookBack));

// ---- pace
const pace = await ev((op) => {
  const g = window.game, p = g.player, C = window.__pv.GAME_CONFIG, out = {};
  window.__place(op.x, op.z, 0, 0); p.stamina = 1; g.save.upgrades.stamina = 0;
  window.__hold(['up', 'sprint']); let n = 0, vmax = 0; for (; n < 60 * 30 && p.stamina > 0.03; n++) { g.update(1 / 60, 1 / 60); vmax = Math.max(vmax, Math.hypot(p.vel.x, p.vel.z)); }
  out.sprintSec = n / 60; out.vmax = vmax;
  window.__hold([]); let m = 0; for (; m < 60 * 30 && p.stamina < 0.99; m++) g.update(1 / 60, 1 / 60);
  out.refillSec = m / 60; void C;
  return out;
}, op);
check('sprint is 20–30% faster than before (7.4 m/s → 9.2)', pace.vmax > 7.4 * 1.2 - 0.05 && pace.vmax < 7.4 * 1.3 + 0.1, JSON.stringify(pace));
check('a full bar sprints about twice as long as before (5 s → ~10 s)', pace.sprintSec > 9 && pace.sprintSec < 11.5, JSON.stringify(pace));
check('stamina refills faster after stopping (it took ~6 s; now ~3 s)', pace.refillSec < 4, JSON.stringify(pace));
const upg = await ev((op) => { const g = window.game, p = g.player; window.__place(op.x, op.z, 0, 0); p.stamina = 1; g.save.upgrades.stamina = 3; window.__hold(['up', 'sprint']); let n = 0; for (; n < 60 * 40 && p.stamina > 0.03; n++) g.update(1 / 60, 1 / 60); window.__hold([]); window.__step(30); g.save.upgrades.stamina = 0; return { sec: n / 60 }; }, op);
check('the stamina upgrade still stacks on top of the new baseline', upg.sec > pace.sprintSec * 1.6, JSON.stringify({ base: pace.sprintSec, upgraded: upg.sec }));

// ---- occlusion
const walls = await ev(() => {
  const g = window.game, grid = g.world.grid, out = [];
  // building faces with open pavement in front: the player 1.2 m from the wall, facing away from it
  for (const c of grid.all) {
    if (c.kind !== 'bld' || c.y1 < 8 || out.length >= 6) continue;
    const cx = (c.x0 + c.x1) / 2, z = c.z1 + 1.2;
    if (cx < 40 || cx > 900 || z > 950) continue;
    const q = []; grid.query(cx - 1, z - 0.6, cx + 1, z + 3, q); if (q.some(k => k !== c && k.y1 > 0.5)) continue;
    out.push({ x: cx, z, yaw: 0 });
  }
  return out;
});
check('test setup: found building faces to back the player against', walls.length >= 3, String(walls.length));
const occ = await ev((walls) => {
  const g = window.game, c = g.cam, p = g.player, res = { foot: [], aim: [], sprint: [] };
  for (const w of walls) {
    // on foot, looking away from the wall: the camera would sit inside the building
    window.__place(w.x, w.z, 0, 0); window.__hold([]); window.__step(30);
    res.foot.push(window.__lensOK() ? 1 : 0);
    // aiming (over the shoulder, closer)
    p.aiming = true; p.aim = 1; window.__step(20); res.aim.push(window.__lensOK() ? 1 : 0); p.aiming = false; p.aim = 0;
    // sprinting along the wall
    let bad = 0; window.__place(w.x - 6, w.z, Math.PI / 2, Math.PI / 2 - 0.9); p.stamina = 1; window.__hold(['up', 'sprint']); window.__step(60, () => { if (!window.__lensOK()) bad++; }); window.__hold([]); window.__step(20);
    res.sprint.push(bad);
  }
  return res;
}, walls);
check('occlusion on foot: backed against buildings, the lens is never inside the wall', occ.foot.every(x => x === 1), JSON.stringify(occ.foot));
check('occlusion while aiming', occ.aim.every(x => x === 1), JSON.stringify(occ.aim));
check('occlusion while sprinting along a wall (every frame)', occ.sprint.every(x => x === 0), JSON.stringify(occ.sprint));

const thin = await ev((op) => {
  const g = window.game, grid = g.world.grid, c = g.cam;
  // a pole or tree (vertical cylinder) right behind the player
  const pole = grid.all.find(k => k.r !== undefined && k.kind === 'prop' && k.y1 > 2 && k.x > 60 && k.z > 60 && k.x < 900 && k.z < 900);
  if (!pole) return { none: true };
  let bad = 0;
  for (let a = 0; a < 8; a++) {
    const ang = a / 8 * Math.PI * 2, x = pole.x + Math.sin(ang) * 1.6, z = pole.z + Math.cos(ang) * 1.6;
    window.__place(x, z, ang, ang); window.__step(25);
    if (!window.__lensOK()) bad++;
  }
  return { bad, r: pole.r };
}, op);
check('occlusion: poles and trees right behind the player never swallow the camera', thin.none || thin.bad === 0, JSON.stringify(thin));

const recover = await ev((walls) => {
  const g = window.game, c = g.cam, w = walls[0];
  window.__place(w.x, w.z, 0, 0); window.__step(30);
  const d0 = c.lastOcc.d;
  // step out into the open (teleport 6 m away from the wall): the camera backs out smoothly
  g.player.pos.z += 6; const ds = [];
  window.__step(90, () => ds.push(c.lastOcc.d));
  let maxStep = 0; for (let i = 1; i < ds.length; i++) maxStep = Math.max(maxStep, ds[i] - ds[i - 1]);
  return { d0, end: ds[ds.length - 1], dist: c.lastOcc.dist, maxStep };
}, walls);
check('recovery after an obstruction is damped (no snap back out: < 8 cm a frame)', recover.d0 < 1.6 && recover.end > recover.d0 + 1 && recover.maxStep < 0.08, JSON.stringify(recover));

// driving and reversing next to a wall
const drive = await ev((walls) => {
  const g = window.game, p = g.player, w = walls[1] || walls[0];
  const v = g.vehicles.spawn('sedan', w.x, w.z + 2.4, 0, { parked: true }); v.parked = false; v.sleep = false;
  g.enterVehicle ? g.enterVehicle(v) : null;
  if (p.state !== 'vehicle') { p.vehicle = v; p.state = 'vehicle'; v.driver = 'player'; v.mode = 'phys'; }
  g.cam.reset(0); window.__step(40);
  const a = window.__lensOK();
  // reverse toward the wall
  let bad = 0; window.__hold(['down']); window.__step(120, () => { if (!window.__lensOK()) bad++; }); window.__hold([]);
  return { a, bad, state: p.state };
}, walls);
check('occlusion in a car parked with its tail to a wall, and while reversing toward it', drive.a && drive.bad === 0, JSON.stringify(drive));
check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await finish(b, 'camera');
