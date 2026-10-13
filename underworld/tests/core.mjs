/* Core feel regression: melee facing (every direction, 180° turns, toward/away from the
   camera, after a vehicle exit, soft targeting never picks people behind), combo / heavy /
   kick / block / dodge, reverse speed + brake-before-reverse, reverse camera smoothness.
   Usage: node underworld/tests/core.mjs */
import { launch, open, check, frames, startNew, summary, finish } from './lib.mjs';

const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
await page.evaluate(() => { const g = window.game; g.events.cool = 1e9; g.peds.enabled = false; g.traffic.enabled = false; if (g.uw) g.uw.debugQuiet = true; g.police.enabled = false; g.input.wantLock = false; g.input.noLock = true; });
await page.mouse.move(240, 135);
await frames(page, 10);

const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
// place the player in an open plaza-free spot on a road crossing and clear the peds
async function reset(h = 0, camYaw = 0) {
  await page.evaluate(([h, cy]) => {
    const g = window.game; g.peds.peds.length = 0;
    g.resetPlayerState(6 * 80, 6 * 80, h); g.player.h = h; g.cam.yaw = cy; g.input.releaseAll();
    g.player.selectWeapon(0);
  }, [h, camYaw]);
  await frames(page, 4);
}
const keys = { W: 'KeyW', A: 'KeyA', S: 'KeyS', D: 'KeyD' };
async function sampleAttack(dirKeys, holdDuring, attackKey = 'mouse') {
  for (const k of dirKeys) await page.keyboard.down(keys[k]);
  await frames(page, 25);
  if (!holdDuring) { for (const k of dirKeys) await page.keyboard.up(keys[k]); await frames(page, 2); }
  const before = await page.evaluate(() => window.game.player.h);
  const yaw = await page.evaluate(() => window.game.cam.yaw);
  if (attackKey === 'mouse') { await page.mouse.down(); await frames(page, 1); await page.mouse.up(); }
  else await page.keyboard.press(attackKey);
  const hs = [];
  for (let i = 0; i < 24; i++) { await frames(page, 1); hs.push(await page.evaluate(() => window.game.player.h)); }
  if (holdDuring) for (const k of dirKeys) await page.keyboard.up(keys[k]);
  await frames(page, 4);
  return { before, hs, yaw };
}
await page.mouse.move(240, 135);
// 1. every direction, camera fixed at yaw 0 (so S walks toward the camera, W away from it)
const dirs = { W: 0, S: Math.PI, A: Math.PI / 2, D: -Math.PI / 2, 'W+A': Math.PI / 4, 'W+D': -Math.PI / 4, 'S+A': 3 * Math.PI / 4, 'S+D': -3 * Math.PI / 4 };
for (const [name, ang] of Object.entries(dirs)) {
  for (const hold of [true, false]) {
    await reset(name.includes('S') ? 0 : Math.PI, 0); // start facing the opposite way: forces a large turn first
    const r = await sampleAttack(name.split('+'), hold);
    const want = r.yaw; // movement is camera-relative: use the yaw the moves were made with
    // movement direction in world space for camera yaw 0
    const expect = wrap(ang + want);
    const worst = Math.max(...r.hs.slice(4).map(h => Math.abs(wrap(h - expect))));
    check(`melee facing ${name}${hold ? ' (moving)' : ' (after stop)'}: no snap back`, worst < 0.35, `expect ${expect.toFixed(2)} worst ${worst.toFixed(2)}`);
  }
}
// 2. 180° turn then attack immediately, facing the camera
await reset(0, 0);
await page.keyboard.down('KeyS'); await frames(page, 30); await page.keyboard.up('KeyS'); await frames(page, 1);
{ const r = await sampleAttack([], false); const worst = Math.max(...r.hs.map(h => Math.abs(wrap(h - Math.PI))));
  check('melee right after a 180° turn toward the camera keeps the new facing', worst < 0.35, 'worst ' + worst.toFixed(2)); }
// 3. heavy (G), kick (V), combo finisher: none of them snap toward the camera
for (const k of ['KeyG', 'KeyV']) {
  await reset(0, 0);
  const r = await sampleAttack(['S'], false, k);
  const worst = Math.max(...r.hs.map(h => Math.abs(wrap(h - Math.PI))));
  check(`${k === 'KeyG' ? 'heavy punch' : 'kick'} keeps facing`, worst < 0.35, 'worst ' + worst.toFixed(2));
}
// 4. soft targeting: a person 30° off the facing is turned toward, a person behind is ignored
await reset(0, 0);
const soft = await page.evaluate(async () => {
  const g = window.game, p = g.player;
  const mk = (ang, d) => { const q = g.peds.make('civ'); q.x = p.pos.x + Math.sin(ang) * d; q.z = p.pos.z + Math.cos(ang) * d; q.y = p.pos.y; q.state = 'free'; q.keep = true; q.brain = (c) => { c.vx = 0; c.vz = 0; }; g.peds.peds.push(q); return q; };
  p.h = 0; p.moveDir = null;
  const front = mk(0.5, 1.3), back = mk(Math.PI, 1.0);
  const h1 = g.combat.pickMeleeHeading(1.4);
  g.peds.peds.splice(g.peds.peds.indexOf(front), 1);
  const h2 = g.combat.pickMeleeHeading(1.4);
  g.peds.peds.length = 0;
  return { h1, h2, back: !!back };
});
check('soft target picks a person inside the forward cone', Math.abs(wrap(soft.h1 - 0.5)) < 0.05, soft.h1.toFixed(2));
check('soft target never picks a person behind the player', Math.abs(wrap(soft.h2 - 0)) < 0.01, soft.h2.toFixed(2));
// 5. after entering + driving + exiting a vehicle the first punch keeps the current facing
await reset(0, 0);
await page.evaluate(() => { const g = window.game, p = g.player; const v = g.vehicles.spawn('sedan', p.pos.x + 2.2, p.pos.z, Math.PI / 2, { parked: true }); v.touched = true; g.__tv = v; });
await frames(page, 2);
await page.keyboard.press('KeyE'); await frames(page, 40);
const inCar = await page.evaluate(() => window.game.player.state);
check('entered vehicle', inCar === 'vehicle', inCar);
await page.keyboard.down('KeyW'); await page.keyboard.down('KeyA'); await frames(page, 60); await page.keyboard.up('KeyA'); await page.keyboard.up('KeyW');
await page.keyboard.down('KeyS'); await frames(page, 60); await page.keyboard.up('KeyS');
await frames(page, 30);
await page.keyboard.press('KeyE'); await frames(page, 10);
{
  const h0 = await page.evaluate(() => window.game.player.h);
  await page.mouse.down(); await frames(page, 1); await page.mouse.up();
  const hs = []; for (let i = 0; i < 20; i++) { await frames(page, 1); hs.push(await page.evaluate(() => window.game.player.h)); }
  const worst = Math.max(...hs.map(h => Math.abs(wrap(h - h0))));
  check('punch after vehicle exit keeps the exit facing', worst < 0.35, `h0 ${h0.toFixed(2)} worst ${worst.toFixed(2)}`);
}
// 6. block / dodge / combo states
await reset(0, 0);
await page.mouse.down({ button: 'right' }); await frames(page, 6);
check('right mouse with fists blocks', await page.evaluate(() => window.game.player.blocking && window.game.player.pose.block > 0.3));
await page.mouse.up({ button: 'right' }); await frames(page, 8);
check('block releases', await page.evaluate(() => !window.game.player.blocking));
await page.keyboard.down('KeyD'); await frames(page, 10); await page.keyboard.press('KeyX'); await frames(page, 2);
check('dodge triggers', await page.evaluate(() => window.game.player.dodgeT > 0 || window.game.player.invuln > 0));
await page.keyboard.up('KeyD'); await frames(page, 20);
await page.evaluate(() => { const g = window.game, p = g.player; const q = g.peds.make('dummy'); q.x = p.pos.x + Math.sin(p.h) * 1.0; q.z = p.pos.z + Math.cos(p.h) * 1.0; q.y = p.pos.y; q.state = 'free'; q.keep = true; q.health = 500; q.brain = (c) => { c.vx = 0; c.vz = 0; }; g.peds.peds.push(q); g.__dummy = q; });
for (let i = 0; i < 3; i++) { await page.mouse.down(); await frames(page, 1); await page.mouse.up(); await frames(page, 9); }
await frames(page, 20);
const combo = await page.evaluate(() => ({ hp: window.game.__dummy.health }));
check('three-hit combo lands (light, light, kick finisher)', combo.hp < 500 - 35, JSON.stringify(combo));
await page.evaluate(() => { window.game.peds.peds.length = 0; });

// 6b. combo / step-in stress: every hit of the combo connects, the step-in is short, never goes
// through the target or a wall, never chases a retreating or strafing target, and with several
// people around it picks the one in front, never the one behind.
const mkDummy = (ang, d, vx = 0, vz = 0) => page.evaluate(([ang, d, vx, vz]) => {
  const g = window.game, p = g.player, q = g.peds.make('dummy'), a = p.h + ang;
  q.x = p.pos.x + Math.sin(a) * d; q.z = p.pos.z + Math.cos(a) * d; q.y = p.pos.y; q.state = 'free'; q.keep = true; q.health = 500;
  q.brain = (c) => { c.vx = vx; c.vz = vz; }; g.peds.peds.push(q); (g.__ds = g.__ds || []).push(q); return g.__ds.length - 1;
}, [ang, d, vx, vz]);
const clearDummies = () => page.evaluate(() => { const g = window.game; g.peds.peds.length = 0; g.__ds = []; });
const punchTrack = async (idx, n = 12) => {
  const p0 = await page.evaluate(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z, h: window.game.player.h }));
  await page.mouse.down(); await frames(page, 1); await page.mouse.up();
  let minD = 99, maxMove = 0, maxTurn = 0;
  for (let i = 0; i < n; i++) {
    await frames(page, 1);
    const r = await page.evaluate(i => { const g = window.game, p = g.player, q = i >= 0 ? g.__ds[i] : null; return { x: p.pos.x, z: p.pos.z, h: p.h, d: q ? Math.hypot(q.x - p.pos.x, q.z - p.pos.z) : 99, ah: p.attackH }; }, idx);
    minD = Math.min(minD, r.d); maxMove = Math.max(maxMove, Math.hypot(r.x - p0.x, r.z - p0.z)); maxTurn = Math.max(maxTurn, Math.abs(wrap(r.h - p0.h)));
  }
  const ah = await page.evaluate(() => window.game.player.attackH);
  return { minD, maxMove, maxTurn, ah, h0: p0.h };
};
{
  // every hit of a 3-hit combo connects (per-hit health check)
  await reset(0, 0); await clearDummies();
  const i0 = await mkDummy(0, 1.0);
  const hp = [500];
  for (let i = 0; i < 3; i++) { await page.mouse.down(); await frames(page, 1); await page.mouse.up(); await frames(page, 9); hp.push(await page.evaluate(i => window.game.__ds[i].health, i0)); }
  const hitsLanded = hp.slice(1).filter((h, i) => h < hp[i]).length;
  check('combo stress: each of the three combo hits connects', hitsLanded === 3, JSON.stringify(hp));
  // step-in toward a target 2.2 m away: short, and never through the target
  await reset(0, 0); await clearDummies();
  const i1 = await mkDummy(0, 2.2);
  const r1 = await punchTrack(i1);
  check('step-in is short (<= 1 m) and never passes through the target', r1.maxMove <= 1.0 && r1.minD >= 0.7, `moved ${r1.maxMove.toFixed(2)} m, closest ${r1.minD.toFixed(2)} m`);
  // a target 2.6 m away (edge of soft range) never causes a long lunge
  await reset(0, 0); await clearDummies();
  const i2 = await mkDummy(0, 2.6);
  const r2 = await punchTrack(i2);
  check('no magnetic drag at the edge of the soft range', r2.maxMove <= 1.0, `moved ${r2.maxMove.toFixed(2)} m`);
  // retreating target (3 m/s away): bounded step, no chase
  await reset(0, 0); await clearDummies();
  const i3 = await mkDummy(0, 1.6, 0, 3);
  const r3 = await punchTrack(i3, 16);
  check('retreating target: no absurd lunge', r3.maxMove <= 1.0, `moved ${r3.maxMove.toFixed(2)} m`);
  // strafing target (2.5 m/s sideways): facing locks at the swing, no spinning after it
  await reset(0, 0); await clearDummies();
  const i4 = await mkDummy(0.2, 1.3, 2.5, 0);
  const r4 = await punchTrack(i4, 16);
  check('strafing target: the swing does not track it around', r4.maxTurn < 0.6 && r4.maxMove <= 1.0, `turn ${r4.maxTurn.toFixed(2)} rad, moved ${r4.maxMove.toFixed(2)} m`);
  // crowd: front-left, right and behind -> picks the one closest to the facing; behind never
  await reset(0, 0); await clearDummies();
  await mkDummy(0.35, 1.2); await mkDummy(-1.0, 1.0); const ib = await mkDummy(Math.PI, 0.8);
  const pick = await page.evaluate(() => { const g = window.game, c = g.combat; const a = c.pickMeleeHeading(1.4); g.peds.peds.splice(g.peds.peds.indexOf(g.__ds[0]), 1); const b = c.pickMeleeHeading(1.4); g.peds.peds.splice(g.peds.peds.indexOf(g.__ds[1]), 1); const d = c.pickMeleeHeading(1.4); return { a, b, d, h: g.player.h }; });
  check('crowd: picks the person nearest the facing', Math.abs(wrap(pick.a - 0.35)) < 0.05, JSON.stringify(pick));
  check('crowd: then the next one inside the cone', Math.abs(wrap(pick.b + 1.0)) < 0.05, JSON.stringify(pick));
  check('crowd: never the one behind (keeps own facing)', Math.abs(wrap(pick.d - pick.h)) < 0.01, JSON.stringify(pick));
  const rb = await punchTrack(ib);
  check('crowd: no step toward the person behind', rb.maxMove < 0.25 && rb.maxTurn < 0.35, `moved ${rb.maxMove.toFixed(2)} turn ${rb.maxTurn.toFixed(2)}`);
  // nobody around: the swing uses the current facing in any direction
  for (const h of [0.9, -2.4, 3.0]) {
    await reset(h, 0); await clearDummies();
    const r = await punchTrack(-1, 8);
    check(`no target: swing keeps current facing ${h}`, Math.abs(wrap(r.ah - h)) < 0.02 && r.maxTurn < 0.05 && r.maxMove < 0.1, JSON.stringify(r));
  }
  // wall: a target behind a building wall never pulls the player into the wall
  await reset(0, 0); await clearDummies();
  const wall = await page.evaluate(() => {
    const g = window.game, grid = g.world.grid, res = {};
    for (const [bx, bz] of [[3, 3], [4, 5], [2, 7], [7, 3], [5, 8]]) {
      const x = bx * 80 + 40;
      for (let z = bz * 80 + 1; z < bz * 80 + 30; z += 0.2) {
        const y = window.__pv.groundY(x, z);
        if (grid.resolveCircle(x, z, 0.34, y + 0.35, y + 1.7, res).hit) return { x, z: z - 0.2, zw: z };
      }
    }
    return null;
  });
  if (!wall) check('wall test spot found', false);
  else {
    await page.evaluate(w => { const g = window.game; g.resetPlayerState(w.x, w.z - 0.6, 0); g.player.h = 0; }, wall);
    await frames(page, 3);
    const iw = await mkDummy(0, 1.6);
    await punchTrack(iw, 14);
    const after = await page.evaluate(w => { const g = window.game, p = g.player, y = p.pos.y; const r = g.world.grid.resolveCircle(p.pos.x, p.pos.z, 0.3, y + 0.35, y + 1.7, {}); return { z: p.pos.z, inside: r.hit && r.depth > 0.05, zw: w.zw }; }, wall);
    check('step-in never walks through a wall', !after.inside && after.z < wall.zw + 0.05, JSON.stringify(after));
  }
  await clearDummies();
}

// 7. reverse speed: 35-50 % of the forward top speed, reached from a standstill
async function reverseRun(type) {
  await reset(0, 0);
  await page.evaluate((type) => {
    const g = window.game, p = g.player;
    const x = 2 * 80 + 2.6, z = 6 * 80 + 12; // long straight north-south road
    const v = g.vehicles.spawn(type, x, z, 0, { parked: true }); v.touched = true;
    g.resetPlayerState(x + 2.5, z, 0); g.completeEnter(v); g.cam.yaw = v.h;
  }, type);
  await frames(page, 4);
  await page.keyboard.down('KeyS');
  let minV = 0, maxDelta = 0, prev = await page.evaluate(() => ({ yaw: window.game.cam.yaw, t: window.game.cam.time }));
  for (let i = 0; i < 300; i++) {
    await frames(page, 1);
    const r = await page.evaluate(() => ({ vf: window.game.player.vehicle.localVel().z, yaw: window.game.cam.yaw, t: window.game.cam.time }));
    // angular speed in rad/s of game time (a test poll can span more than one rendered frame)
    minV = Math.min(minV, r.vf); if (r.t > prev.t) maxDelta = Math.max(maxDelta, Math.abs(wrap(r.yaw - prev.yaw)) / (r.t - prev.t)); prev = r;
    if (i > 120 && r.vf > minV + 0.5) break;
  }
  const st = await page.evaluate(() => { const g = window.game, v = g.player.vehicle; return { vmax: v.spec.vmax, h: v.h, yaw: g.cam.yaw, rev: v.reversing }; });
  await page.keyboard.up('KeyS');
  return { minV, maxDelta, ...st };
}
for (const type of ['sedan', 'sports', 'van']) {
  const r = await reverseRun(type);
  const frac = -r.minV / r.vmax;
  check(`${type} reverse reaches ${Math.round(frac * 100)}% of forward top speed`, frac >= 0.3 && frac <= 0.52, `${(-r.minV * 3.6).toFixed(0)} km/h of ${(r.vmax * 3.6).toFixed(0)}`);
  check(`${type} reverse camera turns to face behind`, Math.abs(wrap(r.yaw - (r.h + Math.PI))) < 0.7, `yaw ${r.yaw.toFixed(2)} vs ${(r.h + Math.PI).toFixed(2)}`);
  check(`${type} reverse camera moves smoothly (no flip, <= 2.3 rad/s)`, r.maxDelta <= 2.3, 'max ' + r.maxDelta.toFixed(2) + ' rad/s');
}
// 8. brake before reverse: moving forward fast, holding reverse must brake to a stop first
{
  await page.keyboard.down('KeyW'); await frames(page, 150); await page.keyboard.up('KeyW');
  const v0 = await page.evaluate(() => window.game.player.vehicle.localVel().z);
  await page.keyboard.down('KeyS');
  const seq = [];
  for (let i = 0; i < 140; i++) { await frames(page, 1); seq.push(await page.evaluate(() => ({ vf: window.game.player.vehicle.localVel().z, rev: window.game.player.vehicle.reversing }))); }
  await page.keyboard.up('KeyS');
  const firstRev = seq.findIndex(q => q.rev);
  const bad = seq.slice(0, Math.max(0, firstRev)).some((q, i) => i > 0 && q.vf > seq[i - 1].vf + 0.4);
  check('brake-before-reverse: no reverse drive while still rolling forward', firstRev < 0 || seq[firstRev - 1 < 0 ? 0 : firstRev - 1].vf < 1.0, `v0 ${v0.toFixed(1)} firstRev ${firstRev} vf@ ${firstRev >= 0 ? seq[firstRev].vf.toFixed(2) : '-'}`);
  check('forward speed decreases monotonically under braking', !bad);
  check('eventually reverses', seq.some(q => q.vf < -2));
}
// 9. reverse camera transitions: never oscillates, never snaps, never stays stuck looking back,
// returns to normal smoothly, and is clean after a vehicle exit.
async function camCar(type = 'sedan', place = null) {
  await reset(0, 0);
  await page.evaluate(([type, place]) => {
    const g = window.game;
    const x = place ? place.x : 2 * 80 + 2.6, z = place ? place.z : 6 * 80 + 12, h = place ? place.h : 0;
    const v = g.vehicles.spawn(type, x, z, h, { parked: true }); v.touched = true;
    g.resetPlayerState(x + 2.5, z, 0); g.completeEnter(v); g.cam.yaw = v.h; g.__cv = v;
  }, [type, place]);
  await frames(page, 4);
}
async function drive(seq) {
  const S = [];
  const sample = () => page.evaluate(() => { const g = window.game, c = g.cam, v = g.player.vehicle || g.__cv; return { yaw: c.yaw, t: c.time, h: v.h, vf: v.localVel().z, y: v.pos.y, ok: [c.yaw, v.pos.x, v.pos.z, v.pos.y].every(Number.isFinite) }; });
  S.push(await sample());
  for (const [keys, n] of seq) {
    for (const k of keys) await page.keyboard.down(k);
    for (let i = 0; i < n; i++) { await frames(page, 1); S.push(await sample()); }
    for (const k of keys) await page.keyboard.up(k);
  }
  let maxRate = 0, flips = 0, lastSign = 0;
  for (let i = 1; i < S.length; i++) {
    const dt = S[i].t - S[i - 1].t; if (dt <= 0) continue;
    const r = wrap(S[i].yaw - S[i - 1].yaw) / dt; maxRate = Math.max(maxRate, Math.abs(r));
    if (Math.abs(r) > 0.4) { const sg = Math.sign(r); if (lastSign && sg !== lastSign) flips++; lastSign = sg; }
  }
  const e = S[S.length - 1];
  return { maxRate, flips, fwdErr: Math.abs(wrap(e.yaw - e.h)), rearErr: Math.abs(wrap(e.yaw - (e.h + Math.PI))), finite: S.every(q => q.ok), S };
}
const camOk = (name, r, flipsMax, end) => {
  const endOk = end === 'fwd' ? r.fwdErr < 0.35 : end === 'rear' ? r.rearErr < 0.7 : true;
  check(`reverse cam ${name}`, r.finite && r.maxRate <= 3.1 && r.flips <= flipsMax && endOk, `rate ${r.maxRate.toFixed(2)} rad/s, flips ${r.flips}, fwdErr ${r.fwdErr.toFixed(2)}, rearErr ${r.rearErr.toFixed(2)}`);
};
await camCar(); camOk('reverse -> stop: eases back to forward', await drive([[['KeyS'], 70], [[], 90]]), 1, 'fwd');
await camCar(); camOk('reverse -> brake -> forward', await drive([[['KeyS'], 70], [['KeyW'], 110]]), 1, 'fwd');
await camCar(); camOk('forward -> reverse: settles looking back', await drive([[['KeyW'], 50], [['KeyS'], 110]]), 1, 'rear');
await camCar(); camOk('reverse -> pause -> reverse again: no flapping', await drive([[['KeyS'], 55], [[], 12], [['KeyS'], 60]]), 2, 'rear');
await camCar(); camOk('rapid low-speed direction changes: no oscillation', await drive([...Array(12)].flatMap(() => [[['KeyW'], 6], [['KeyS'], 6]]).concat([[[], 90]])), 2, 'fwd');
await camCar('sports'); camOk('high-speed reverse', await drive([[['KeyS'], 160], [[], 100]]), 1, 'fwd');
// reverse into a parked truck
await camCar();
await page.evaluate(() => { const g = window.game, v = g.__cv; g.vehicles.spawn('truck', v.pos.x, v.pos.z - 14, 0, { parked: true }); });
{ const r = await drive([[['KeyS'], 110], [[], 100]]); const minVf = Math.min(...r.S.map(q => q.vf)); camOk('reverse into a collision', r, 2, 'fwd'); check('reverse-into-collision actually reversed', minVf < -3, 'min vf ' + minVf.toFixed(1)); }
// slope: reverse along a drivable ramp
const ramp = await page.evaluate(() => {
  const L = window.__pv.SURF.lists; if (!L) return null;
  for (const list of L) if (list) for (const s of list) {
    if (s.h !== undefined || s.h1 === undefined) continue;
    const len = s.axis === 'x' ? s.x1 - s.x0 : s.z1 - s.z0, wid = s.axis === 'x' ? s.z1 - s.z0 : s.x1 - s.x0;
    if (len < 12 || wid < 3.6 || Math.abs(s.h1 - s.h0) < 1) continue;
    // start at the low end, facing up the ramp: reversing then rolls back down, forward climbs
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    if (s.axis === 'x') { const up = (s.h1 > s.h0) === (s.dir >= 0) ? 1 : -1; return { x: cx - up * len * 0.15, z: cz, h: up > 0 ? Math.PI / 2 : -Math.PI / 2, rise: Math.abs(s.h1 - s.h0) }; }
    const up = (s.h1 > s.h0) === (s.dir >= 0) ? 1 : -1; return { x: cx, z: cz - up * len * 0.15, h: up > 0 ? 0 : Math.PI, rise: Math.abs(s.h1 - s.h0) };
  }
  return null;
});
if (!ramp) check('a drivable ramp exists for the slope test', false);
else {
  await camCar('sedan', ramp);
  const y0 = await page.evaluate(() => window.game.__cv.pos.y);
  const r = await drive([[['KeyW'], 40], [['KeyS'], 90], [[], 100]]);
  const ys = r.S.map(q => q.y);
  camOk('reverse on a slope', r, 2, 'any');
  check('slope test ran on the ramp (car height changed)', Math.max(...ys) - Math.min(...ys) > 0.3, `y ${Math.min(...ys).toFixed(2)}..${Math.max(...ys).toFixed(2)} start ${y0.toFixed(2)} rise ${ramp.rise.toFixed(1)}`);
}
// exit while the reverse view is active: on-foot camera is clean
await camCar();
await drive([[['KeyS'], 70]]);
await page.keyboard.press('KeyE'); await frames(page, 6);
{
  const st = await page.evaluate(() => { const g = window.game, c = g.cam; return { state: g.player.state, revCam: !!c.revCam, revBack: !!c.revBack, revT: c.revT }; });
  let maxR = 0, prev = await page.evaluate(() => ({ yaw: window.game.cam.yaw, t: window.game.cam.time }));
  for (let i = 0; i < 30; i++) { await frames(page, 1); const r = await page.evaluate(() => ({ yaw: window.game.cam.yaw, t: window.game.cam.time })); if (r.t > prev.t) maxR = Math.max(maxR, Math.abs(wrap(r.yaw - prev.yaw)) / (r.t - prev.t)); prev = r; }
  check('reverse cam after vehicle exit: state cleared, no snap on foot', st.state === 'foot' && !st.revCam && !st.revBack && st.revT === 0 && maxR <= 3.1, JSON.stringify(st) + ' rate ' + maxR.toFixed(2));
}
check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await finish(b, 'core');
