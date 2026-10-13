/* Core feel regression: melee facing (every direction, 180° turns, toward/away from the
   camera, after a vehicle exit, soft targeting never picks people behind), combo / heavy /
   kick / block / dodge, reverse speed + brake-before-reverse, reverse camera smoothness.
   Usage: node underworld/tests/core.mjs   (THREE_DIR=... for offline) */
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
  let minV = 0, maxDelta = 0, prevYaw = await page.evaluate(() => window.game.cam.yaw);
  for (let i = 0; i < 300; i++) {
    await frames(page, 1);
    const r = await page.evaluate(() => ({ vf: window.game.player.vehicle.localVel().z, yaw: window.game.cam.yaw }));
    minV = Math.min(minV, r.vf); maxDelta = Math.max(maxDelta, Math.abs(wrap(r.yaw - prevYaw))); prevYaw = r.yaw;
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
  check(`${type} reverse camera moves smoothly (no flip)`, r.maxDelta < 0.12, 'max step ' + r.maxDelta.toFixed(3));
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
check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await finish(b, 'core');
