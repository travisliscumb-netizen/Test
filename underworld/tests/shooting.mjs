/* Firearms: the shot goes where the crosshair points (camera ray -> aim point -> muzzle -> aim point),
   at every pitch, facing and distance, right after a fast turn and after leaving a car; hip fire never
   defaults into the pavement; move + aim + fire work together with three simultaneous touches; aim
   assist only helps near the crosshair and never reaches behind the player; recoil kicks up and
   recovers; ADS tightens the spread; weapon switching cancels a reload without breaking aim. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const t = await open(b, { hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });
const page = t.page;
const ev = (f, a) => page.evaluate(f, a);
await startNew(page);
await ev(() => window.game.quality.setMode(0));

// a quiet stretch of straight road: no traffic, no pedestrians, no police
const setup = async (x, z, h) => {
  await ev(([x, z, h]) => {
    const g = window.game, s = g.save;
    g.events.cool = 1e9; g.traffic.enabled = false; g.peds.enabled = false; g.police.enabled = false; g.police.clear();
    for (const v of g.vehicles.list.slice()) if (v !== g.player.vehicle) g.vehicles.despawn(v);
    g.peds.peds.length = 0;
    g.resetPlayerState(x, z, h);
    s.weapons.pistol = true; s.weapons.smg = true; s.weapons.shotgun = true;
    s.ammo.pistol = 500; s.ammo.smg = 900; s.ammo.shotgun = 200;
    g.player.mag = { pistol: 12, smg: 30, shotgun: 6 };
    g.player.selectWeapon(2);
    g.save.settings.aimAssist = 0;
    g.debug.god = true; g.__tg = [];
  }, [x, z, h]);
  await frames(page, 12);
};
const dummy = (x, z, hp = 1e6) => ev(([x, z, hp]) => {
  const g = window.game, q = g.peds.make('dummy');
  q.x = x; q.z = z; q.y = window.__pv.groundY(x, z); q.state = 'free'; q.keep = true; q.health = hp; q.hostile = true;
  q.brain = (c) => { c.vx = 0; c.vz = 0; }; g.peds.peds.push(q); g.__tg.push(q); return g.__tg.length - 1;
}, [x, z, hp]);
// steer the real camera (yaw/pitch) until the screen centre points at a world point
const aimAt = async (x, y, z) => {
  let err = 9;
  for (let k = 0; k < 8 && err > 0.0015; k++) {
    err = await ev(([x, y, z]) => {
      const g = window.game, c = g.camera, cr = g.cam;
      const d = c.getWorldDirection(new (c.position.constructor)());
      const tx = x - c.position.x, ty = y - c.position.y, tz = z - c.position.z, tl = Math.hypot(tx, ty, tz);
      const cy = Math.atan2(d.x, d.z), cp = Math.asin(d.y), wy = Math.atan2(tx, tz), wp = Math.asin(ty / tl);
      let dy = wy - cy; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      cr.yaw += dy; cr.pitch += wp - cp;
      return Math.acos(Math.min(1, (d.x * tx + d.y * ty + d.z * tz) / tl));
    }, [x, y, z]);
    await frames(page, 2);
  }
  return err;
};
const fire = async () => {
  await ev(() => { const i = window.game.input; i.down.add('attack'); i.pressedSet.add('attack'); });
  await frames(page, 1);
  await ev(() => window.game.input.down.delete('attack'));
  await frames(page, 2);
  return ev(() => { const s = window.game.combat.lastShot; return s ? JSON.parse(JSON.stringify({ ...s, char: s.char ? s.char.id : null, veh: s.veh ? s.veh.id : null })) : null; });
};
const ads = on => ev(on => { const i = window.game.input; if (on) i.toggles.add('aim'); else i.clearToggle('aim'); }, on);
const dist3 = (a, b2) => Math.hypot(a.x - b2.x, a.y - b2.y, a.z - b2.z);

// ---------------------------------------------------------------- 1. reticle -> hit alignment
// node (5,6) looking north along a straight avenue
const X0 = 5 * 80, Z0 = 6 * 80;
await setup(X0, Z0 - 4, Math.PI);
const facing = await ev(() => window.game.player.h);
await ads(true); await frames(page, 15);
for (const [dist, label] of [[4, 'close'], [14, 'medium'], [34, 'distant']]) {
  await ev(() => { const g = window.game; g.peds.peds.length = 0; g.__tg = []; g.player.mag.pistol = 12; });
  const x = X0 + Math.sin(facing) * dist, z = Z0 - 4 + Math.cos(facing) * dist;
  const id = await dummy(x, z);
  const chest = { x, y: (await ev(([x, z]) => window.__pv.groundY(x, z), [x, z])) + 1.25, z };
  const err = await aimAt(chest.x, chest.y, chest.z);
  const shot = await fire();
  const tid = await ev(i => window.game.__tg[i].id, id);
  check(`ADS ${label} target (${dist} m): crosshair on the chest, shot hits that person`, shot && shot.char === tid, `aimErr ${(err * 57.3).toFixed(2)}° hit ${shot && shot.char} want ${tid}`);
  // the impact lies on the crosshair ray (camera -> chest): off it by no more than the ADS spread
  const offRay = shot ? (() => { const o = shot.o, vx = chest.x - o.x, vy = chest.y - o.y, vz = chest.z - o.z, vl = Math.hypot(vx, vy, vz), hx = shot.hit.x - o.x, hy = shot.hit.y - o.y, hz = shot.hit.z - o.z, tt = (hx * vx + hy * vy + hz * vz) / vl; return Math.sqrt(Math.max(0, hx * hx + hy * hy + hz * hz - tt * tt)); })() : 99;
  check(`ADS ${label}: impact sits on the crosshair ray`, offRay < 0.06 + (dist + 4) * 0.007, offRay.toFixed(3) + ' m');
}
await ev(() => { const g = window.game; g.peds.peds.length = 0; g.__tg = []; });

// ---------------------------------------------------------------- 2. a wall at chest / low / high
const wall = await ev(() => {
  const g = window.game, p = g.player;
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const h = g.world.grid.raycast(p.pos.x, p.pos.y + 1.3, p.pos.z, Math.sin(a), 0, Math.cos(a), 40, 0); if (h && h.t > 6 && h.t < 30) return { a, t: h.t }; }
  return null;
});
check('test setup: a wall 6-30 m away', !!wall, JSON.stringify(wall));
if (wall) {
  for (const [hy, label] of [[1.3, 'chest height'], [0.5, 'low (aim down)'], [3.2, 'high (aim up)']]) {
    await ev(() => { window.game.player.mag.pistol = 12; });
    const pt = await ev(([a, tt, hy]) => { const p = window.game.player; return { x: p.pos.x + Math.sin(a) * (tt - 0.05), y: p.pos.y + hy, z: p.pos.z + Math.cos(a) * (tt - 0.05) }; }, [wall.a, wall.t, hy]);
    await aimAt(pt.x, pt.y, pt.z);
    const shot = await fire();
    const off = shot ? dist3(shot.hit, pt) : 99;
    check(`wall at ${label}: shot lands where the crosshair is (not the ground)`, shot && off < 0.45 && !shot.ground, `off ${off.toFixed(2)} m, hitY ${shot && shot.hit.y.toFixed(2)} want ${pt.y.toFixed(2)}`);
  }
}

// ---------------------------------------------------------------- 3. hip fire: bullet follows the spread ray, every pitch and facing
await ads(false); await frames(page, 10);
let worst = 0, n = 0, grounded = 0, occluded = 0;
for (let k = 0; k < 8; k++) for (const pitch of [-0.35, -0.1, 0.05, 0.3]) {
  await ev(([k, pitch]) => { const g = window.game; g.cam.yaw = k / 8 * Math.PI * 2; g.cam.pitch = pitch; g.player.mag.pistol = 12; g.player.attackT = 0; }, [k, pitch]);
  await frames(page, 3);
  const shot = await fire(); if (!shot) continue;
  n++;
  // the bullet ends where the camera ray (with its spread) met the world: muzzle and crosshair agree
  // something that stepped into the line of fire (a passer-by, a passing car, a corner by the muzzle)
  // stops the bullet on the muzzle -> aim-point segment: correct. Anywhere else is a misalignment.
  const segD = (q, a, b) => { const vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z, l2 = vx * vx + vy * vy + vz * vz || 1; const t = Math.max(0, Math.min(1, ((q.x - a.x) * vx + (q.y - a.y) * vy + (q.z - a.z) * vz) / l2)); return Math.hypot(q.x - a.x - vx * t, q.y - a.y - vy * t, q.z - a.z - vz * t); };
  let dd = dist3(shot.hit, shot.aim);
  if (dd >= 0.6 && shot.muzzle && segD(shot.hit, shot.muzzle, shot.aim) < 0.3) { occluded++; dd = 0; }
  worst = Math.max(worst, dd);
  const cosA = await ev(s => { const c = window.game.camera; const d = c.getWorldDirection(new (c.position.constructor)()); const l = Math.hypot(s.dir.x, s.dir.y, s.dir.z); return (d.x * s.dir.x + d.y * s.dir.y + d.z * s.dir.z) / l; }, shot);
  if (pitch > -0.05 && shot.ground) grounded++;
  if (Math.acos(Math.min(1, cosA)) > 0.09) worst = 99; // shot ray far outside the reticle cone
}
check('hip fire at 8 facings x 4 pitches: every bullet lands on its crosshair ray (muzzle-to-aim-point)', n >= 28 && worst < 0.6, `n ${n} worst ${worst.toFixed(2)} m, stopped by something in the line of fire ${occluded}`);
check('hip fire aimed level or up never goes into the ground', grounded === 0, `${grounded} ground hits`);

// ---------------------------------------------------------------- 4. default camera: drawing a gun levels the view
await ev(() => { const g = window.game; g.player.selectWeapon(0); g.cam.pitch = -0.2; g.input.lastLookInput = 0; });
await frames(page, 10);
await ev(() => { const g = window.game; g.player.selectWeapon(2); g.player.mag.pistol = 12; g.input.lastLookInput = 0; });
await frames(page, 40);
const lvl = await fire();
const lvlPitch = await ev(() => window.game.cam.pitch);
check('drawing the pistol with the camera tilted down levels the aim (no constant ground shots)', lvl && (!lvl.ground || Math.hypot(lvl.aim.x - lvl.muzzle.x, lvl.aim.z - lvl.muzzle.z) > 25), `pitch ${lvlPitch.toFixed(3)} ground ${lvl && lvl.ground} aimDist ${lvl && Math.hypot(lvl.aim.x - lvl.muzzle.x, lvl.aim.z - lvl.muzzle.z).toFixed(1)}`);

// ---------------------------------------------------------------- 5. fast turn then fire; player facing away
await ev(() => { const g = window.game; g.peds.peds.length = 0; g.__tg = []; });
{
  const p0 = await ev(() => { const p = window.game.player; return { x: p.pos.x, z: p.pos.z, h: p.h }; });
  const ang = p0.h + Math.PI * 0.9;
  const x = p0.x + Math.sin(ang) * 10, z = p0.z + Math.cos(ang) * 10;
  const id = await dummy(x, z);
  await ads(true);
  // the player still faces the old way; the camera whips round to the target, fire on the next frame
  const gy = await ev(([x, z]) => window.__pv.groundY(x, z), [x, z]);
  await ev(([x, z, gy]) => { const g = window.game, c = g.camera; g.cam.yaw = Math.atan2(x - g.player.pos.x, z - g.player.pos.z); g.player.mag.pistol = 12; g.player.h = g.cam.yaw + Math.PI; }, [x, z, gy]);
  await frames(page, 1);
  await aimAt(x, gy + 1.25, z);
  await ev(() => { const g = window.game; g.player.h = g.cam.yaw + Math.PI; });
  const shot = await fire();
  const tid = await ev(i => window.game.__tg[i].id, id);
  check('fire right after a 160° camera turn (player still facing away) hits the target under the crosshair', shot && shot.char === tid, `hit ${shot && shot.char}`);
  const ph = await ev(() => window.game.player.h);
  check('the player snaps round to face the shot', Math.abs(Math.atan2(Math.sin(ph - ang), Math.cos(ph - ang))) < 0.6, ph.toFixed(2));
}

// ---------------------------------------------------------------- 6. recoil kicks up and recovers
await ads(false); await ev(() => { const g = window.game; g.peds.peds.length = 0; g.__tg = []; g.player.selectWeapon(3); g.player.mag.smg = 30; g.cam.pitch = 0; });
await frames(page, 8);
const pitch0 = await ev(() => window.game.cam.pitch);
await ev(() => { const i = window.game.input; i.down.add('attack'); i.pressedSet.add('attack'); });
let maxRec = 0;
for (let k = 0; k < 14; k++) { await frames(page, 1); maxRec = Math.max(maxRec, await ev(() => window.game.cam.recoilP)); }
await ev(() => window.game.input.down.delete('attack'));
await frames(page, 45);
const rec = await ev(() => ({ r: window.game.cam.recoilP, p: window.game.cam.pitch, shots: window.game.save.stats.shots }));
check('SMG burst: recoil kicks the view upward (never downward)', maxRec > 0.01, maxRec.toFixed(3));
check('recoil recovers: the aim settles back where it was', Math.abs(rec.r) < 0.004 && Math.abs(rec.p - pitch0) < 0.02, `recoil ${rec.r.toFixed(4)} pitch ${rec.p.toFixed(3)} vs ${pitch0.toFixed(3)}`);

// ---------------------------------------------------------------- 7. ADS tightens spread; crosshair reflects it
const sp = await ev(() => { const g = window.game, p = g.player, w = p.wep; p.ads = false; const hip = g.combat.spreadOf(w); p.ads = true; const ad = g.combat.spreadOf(w); p.ads = false; return { hip, ad }; });
check('ADS spread is tighter than hip fire', sp.ad < sp.hip * 0.6, JSON.stringify(sp));
await ads(true); await frames(page, 12);
const gapA = await ev(() => parseFloat(getComputedStyle(document.getElementById('crosshair')).getPropertyValue('--g')));
await ads(false); await frames(page, 12);
const gapH = await ev(() => parseFloat(getComputedStyle(document.getElementById('crosshair')).getPropertyValue('--g')));
await ev(() => window.game.input.down.add('up')); await frames(page, 20);
const gapM = await ev(() => parseFloat(getComputedStyle(document.getElementById('crosshair')).getPropertyValue('--g')));
await ev(() => window.game.input.down.delete('up')); await frames(page, 10);
check('crosshair: tight in ADS, wider at the hip, wider still when moving', gapA < gapH && gapH < gapM, `ads ${gapA} hip ${gapH} moving ${gapM}`);

// ---------------------------------------------------------------- 8. weapon switch cancels the reload, aim still works
await ev(() => { const g = window.game, p = g.player; p.selectWeapon(2); p.mag.pistol = 3; g.input.pressedSet.add('reload'); });
await frames(page, 3);
const r1 = await ev(() => ({ t: window.game.player.reloadT, w: window.game.player.reloadW }));
await ev(() => { const g = window.game; g.input.pressedSet.add('w4'); }); await frames(page, 3);
await frames(page, 90);
const r2 = await ev(() => ({ t: window.game.player.reloadT, pm: window.game.player.mag.pistol, sm: window.game.player.mag.smg, w: window.game.player.wep.id }));
check('switching weapons mid-reload cancels it (no free refill for either gun)', r1.t > 0 && r1.w === 'pistol' && r2.t <= 0 && r2.pm === 3 && r2.w === 'smg', JSON.stringify([r1, r2]));
{
  await ev(() => { const g = window.game; g.peds.peds.length = 0; g.__tg = []; g.player.mag.smg = 30; });
  const p0 = await ev(() => { const p = window.game.player; return { x: p.pos.x, z: p.pos.z, h: window.game.cam.yaw }; });
  const x = p0.x + Math.sin(p0.h) * 9, z = p0.z + Math.cos(p0.h) * 9, id = await dummy(x, z);
  const gy = await ev(([x, z]) => window.__pv.groundY(x, z), [x, z]);
  await ads(true); await frames(page, 12); await aimAt(x, gy + 1.25, z);
  const shot = await fire();
  check('after switching weapons the SMG still hits what the crosshair is on', shot && shot.char === await ev(i => window.game.__tg[i].id, id), JSON.stringify(shot && shot.char));
}

// ---------------------------------------------------------------- 9. aim assist: near the crosshair only, never behind
await ads(false);
const camAngTo = (x, y, z) => ev(([x, y, z]) => { const c = window.game.camera; const d = c.getWorldDirection(new (c.position.constructor)()); const tx = x - c.position.x, ty = y - c.position.y, tz = z - c.position.z, tl = Math.hypot(tx, ty, tz); return Math.acos(Math.min(1, (d.x * tx + d.y * ty + d.z * tz) / tl)) * 57.3; }, [x, y, z]);
const assistRun = async (offDeg, behind, level) => {
  await ev(() => { const g = window.game; g.peds.peds.length = 0; g.__tg = []; g.cam.pitch = -0.04; });
  await frames(page, 2);
  // place the target offDeg off the crosshair, as seen from the camera, 12 m past the player
  const pt = await ev(([offDeg, behind]) => {
    const g = window.game, c = g.camera, p = g.player; const d = c.getWorldDirection(new (c.position.constructor)());
    const yaw = Math.atan2(d.x, d.z) + (behind ? Math.PI : 0) + offDeg / 57.3, r = Math.hypot(p.pos.x - c.position.x, p.pos.z - c.position.z) + 12;
    const ox = behind ? p.pos.x : c.position.x, oz = behind ? p.pos.z : c.position.z, rr = behind ? 12 : r;
    const x = ox + Math.sin(yaw) * rr, z = oz + Math.cos(yaw) * rr; return { x, z, y: window.__pv.groundY(x, z) + 1.15 };
  }, [offDeg, behind]);
  await dummy(pt.x, pt.z);
  await ev(lv => { const g = window.game; g.save.settings.aimAssist = lv; g.input.usingTouch = true; }, level);
  const before = await camAngTo(pt.x, pt.y, pt.z), yaw0 = await ev(() => window.game.cam.yaw);
  // the player is actively steering (a tiny touch drag each frame) but not toward the target
  for (let k = 0; k < 30; k++) { await ev(() => { window.game.input.lookX += 0.4; }); await frames(page, 1); }
  const after = await camAngTo(pt.x, pt.y, pt.z), yaw1 = await ev(() => window.game.cam.yaw);
  return { before, after, moved: Math.abs(Math.atan2(Math.sin(yaw1 - yaw0), Math.cos(yaw1 - yaw0))) * 57.3 };
};
const as1 = await assistRun(3.5, false, 2);
check('aim assist: a target 3.5° off the crosshair pulls the aim gently toward it', as1.after < as1.before - 0.4 && as1.moved < 4, JSON.stringify(as1));
const as2 = await assistRun(30, false, 2);
// the player's own drag (0.4 px a frame) turns the camera a little; the assist must add nothing beyond that
const own = await ev(() => 30 * 0.4 * window.game.save.settings.sens * 0.0024 * 57.3);
check('aim assist: a target 30° away is left alone (no dragging across the screen)', Math.abs(as2.moved - own) < 0.05, JSON.stringify(as2) + ' own ' + own.toFixed(2));
const as3 = await assistRun(0, true, 3);
check('aim assist (strong): never turns toward someone behind the player', Math.abs(as3.moved - own) < 0.05, JSON.stringify(as3));
const as4 = await assistRun(3.5, false, 0);
check('aim assist off: no pull at all', Math.abs(as4.moved - own) < 0.05, JSON.stringify(as4));
await ev(() => { const g = window.game; g.save.settings.aimAssist = 2; g.peds.peds.length = 0; g.__tg = []; });

// ---------------------------------------------------------------- 10. three simultaneous touches: move + aim + fire
await ev(() => { const g = window.game, p = g.player; p.selectWeapon(3); p.mag.smg = 30; g.save.ammo.smg = 900; g.input.usingTouch = true; });
await frames(page, 6);
const cdp = await t.ctx.newCDPSession(page);
const fb = await ev(() => { const r = document.getElementById('fireBtn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, vis: getComputedStyle(document.getElementById('fireBtn')).display !== 'none' }; });
check('gun mode on touch: the FIRE button is shown', fb.vis);
const s0 = await ev(() => { const g = window.game, p = g.player; return { x: p.pos.x, z: p.pos.z, yaw: g.cam.yaw, shots: g.save.stats.shots }; });
const L = { x: 140, y: 300, id: 1 }, Rl = { x: 520, y: 200, id: 2 }, F = { x: fb.x, y: fb.y, id: 3 };
const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id })) });
await send('touchStart', [L]); await frames(page, 1);
await send('touchStart', [L, Rl]); await frames(page, 1);
await send('touchStart', [L, Rl, F]); await frames(page, 1);
let maxTouches = 0;
for (let k = 0; k < 24; k++) {
  L.y = 300 - Math.min(50, k * 5); Rl.x = 520 + k * 3;
  await send('touchMove', [L, Rl, F]);
  await frames(page, 1);
  maxTouches = Math.max(maxTouches, await ev(() => { const i = window.game.input; return (i.stick.active ? 1 : 0) + (i.lookTouch.id !== null ? 1 : 0) + (i.isDown('attack') ? 1 : 0); }));
}
const s1 = await ev(() => { const g = window.game, p = g.player; return { x: p.pos.x, z: p.pos.z, yaw: g.cam.yaw, shots: g.save.stats.shots, aiming: p.aiming }; });
await send('touchEnd', []); await frames(page, 4);
check('three touches held at once: stick, look and fire all active together', maxTouches === 3, String(maxTouches));
check('move + aim + fire: the player moved', Math.hypot(s1.x - s0.x, s1.z - s0.z) > 1.0, Math.hypot(s1.x - s0.x, s1.z - s0.z).toFixed(2));
check('move + aim + fire: the camera turned', Math.abs(s1.yaw - s0.yaw) > 0.05, (s1.yaw - s0.yaw).toFixed(3));
check('move + aim + fire: the SMG fired the whole time', s1.shots - s0.shots >= 8, String(s1.shots - s0.shots));
const relInp = await ev(() => { const i = window.game.input; return { stick: i.stick.active, look: i.lookTouch.id, fire: i.isDown('attack') }; });
check('lifting all fingers releases stick, look and fire', !relInp.stick && relInp.look === null && !relInp.fire, JSON.stringify(relInp));

// fire button drag also aims (one-thumb fire + aim)
await send('touchStart', [F]); await frames(page, 1);
const y0 = await ev(() => window.game.cam.yaw);
for (let k = 1; k <= 10; k++) { await send('touchMove', [{ ...F, x: F.x - k * 6 }]); await frames(page, 1); }
const y1 = await ev(() => window.game.cam.yaw);
await send('touchEnd', []); await frames(page, 3);
check('dragging on FIRE steers the camera while firing', Math.abs(y1 - y0) > 0.05, (y1 - y0).toFixed(3));

// ---------------------------------------------------------------- 11. vehicle exit restores the firearm controls
await ev(() => { const g = window.game, p = g.player; const v = g.vehicles.spawn('sedan', p.pos.x + 2.4, p.pos.z, p.h, { parked: true }); v.touched = true; g.completeEnter(v); });
await frames(page, 10);
const inCar = await ev(() => ({ gm: document.body.classList.contains('gunmode'), fire: getComputedStyle(document.getElementById('fireBtn')).display, gas: getComputedStyle(document.querySelector('[data-act="gas"]')).display }));
check('in a car: firearm buttons hidden, pedals shown', !inCar.gm && inCar.fire === 'none' && inCar.gas !== 'none', JSON.stringify(inCar));
await ev(() => window.game.exitVehicle(true)); await frames(page, 12);
const outCar = await ev(() => ({ gm: document.body.classList.contains('gunmode'), fire: getComputedStyle(document.getElementById('fireBtn')).display, xh: !document.getElementById('crosshair').classList.contains('hidden'), w: window.game.player.wep.id }));
check('after getting out: gun mode, FIRE and crosshair are back', outCar.gm && outCar.fire !== 'none' && outCar.xh, JSON.stringify(outCar));
{
  await ev(() => { const g = window.game; g.peds.peds.length = 0; g.__tg = []; g.player.mag.smg = 30; });
  const p0 = await ev(() => { const p = window.game.player; return { x: p.pos.x, z: p.pos.z, h: window.game.cam.yaw }; });
  const x = p0.x + Math.sin(p0.h) * 8, z = p0.z + Math.cos(p0.h) * 8, id = await dummy(x, z);
  const gy = await ev(([x, z]) => window.__pv.groundY(x, z), [x, z]);
  await ads(true); await frames(page, 12); await aimAt(x, gy + 1.25, z);
  const shot = await fire();
  check('first shot after leaving the car hits the target under the crosshair', shot && shot.char === await ev(i => window.game.__tg[i].id, id));
}
// melee weapon: no crosshair, melee buttons back
await ev(() => window.game.player.selectWeapon(0)); await frames(page, 8);
const mel = await ev(() => ({ gm: document.body.classList.contains('gunmode'), atk: getComputedStyle(document.querySelector('.tbtn.melee[data-act="attack"]')).display, xh: document.getElementById('crosshair').classList.contains('hidden'), ads: window.game.input.toggles.has('aim') }));
check('fists: melee layout (Atk/Blk), no crosshair, ADS toggle cleared', !mel.gm && mel.atk !== 'none' && mel.xh && !mel.ads, JSON.stringify(mel));

check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
await finish(b, 'shooting');
