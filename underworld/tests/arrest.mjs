/* Arrest + prison regression. Arrests while standing, running, fighting, right after a
   vehicle exit, during a pursuit and repeatedly; each one goes through sentencing, the jail
   block (accelerated clock, frozen street clock, world still ticking) and release. After
   every release: hands down, clean pose, and walk / run / sprint / punch / jump / enter /
   exit all work. */
import { launch, open, check, frames, startNew, summary, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
await page.evaluate(() => { const g = window.game; g.events.cool = 1e9; g.input.wantLock = false; g.input.noLock = true; g.save.money = 50000; });
await page.mouse.move(240, 135);
const pose = () => page.evaluate(() => { const g = window.game, p = g.player, ps = p.pose; return { sur: +(ps.surrender || 0).toFixed(3), crouch: +(ps.crouch || 0).toFixed(3), down: +(ps.down || 0).toFixed(3), block: +(ps.block || 0).toFixed(2), state: p.state, gs: g.state, trans: !!p.trans, knock: p.knockT, bust: g.police.bust, lvl: g.police.level, jail: !!g.uw.S.jail, interior: p.interior ? p.interior.id : null }; });
async function arrestAndServe(tag, setup) {
  await page.evaluate(setup);
  await frames(page, 4);
  const before = await page.evaluate(() => ({ t: window.game.env.time, day: window.game.uw.S.day }));
  await page.evaluate(() => { const g = window.game; if (g.police.level === 0) g.police.setLevel(1); g.onBusted(); });
  let mid = 0;
  for (let k = 0; k < 40 && mid < 0.6; k++) { await frames(page, 1); mid = Math.max(mid, await page.evaluate(() => window.game.player.pose.surrender || 0)); }
  check(`${tag}: hands-up arrest pose plays`, mid > 0.5, mid.toFixed(2));
  await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });
  await frames(page, 5);
  let s = await pose();
  check(`${tag}: in the jail block with a clean pose`, s.jail && s.interior === 'prison' && s.sur === 0 && s.down === 0 && s.state === 'foot', JSON.stringify(s));
  const jail = await page.evaluate(() => ({ total: window.game.uw.S.jail.total, ch: window.game.uw.S.jail.charges }));
  check(`${tag}: sentenced`, jail.total >= 7, `${jail.total} days · ${jail.ch.slice(0, 80)}`);
  // walk in the cell block
  const c0 = await page.evaluate(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z }));
  await page.keyboard.down('KeyW'); await frames(page, 12); await page.keyboard.up('KeyW');
  const c1 = await page.evaluate(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z }));
  check(`${tag}: can walk around inside`, Math.hypot(c1.x - c0.x, c1.z - c0.z) > 0.3);
  // serve fast: 20x and a short remaining sentence
  await page.evaluate(() => { const j = window.game.uw.S.jail; j.total = Math.min(j.total, j.served + 40); window.game.uw.prison.setSpeed(20); });
  await page.waitForFunction(() => !window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 180000, polling: 100 });
  await frames(page, 6);
  const after = await page.evaluate(() => ({ t: window.game.env.time, day: window.game.uw.S.day }));
  check(`${tag}: street clock stood still in jail`, Math.abs(after.t - before.t) < 0.25, `${before.t.toFixed(2)} -> ${after.t.toFixed(2)}`);
  check(`${tag}: the world kept running (days passed)`, after.day > before.day, `${before.day} -> ${after.day}`);
  s = await pose();
  check(`${tag}: released clean (hands down, no knock, no wanted)`, s.sur === 0 && s.crouch === 0 && s.down === 0 && !s.jail && !s.interior && s.lvl === 0 && s.bust === 0 && s.state === 'foot' && !s.knock, JSON.stringify(s));
  // movement set
  const p0 = await page.evaluate(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z }));
  await page.keyboard.down('KeyW'); await frames(page, 8); await page.keyboard.down('ShiftLeft'); await frames(page, 14); await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
  const p1 = await page.evaluate(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z }));
  check(`${tag}: walk / run / sprint`, Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1.0);
  await page.keyboard.press('Space'); await frames(page, 2);
  check(`${tag}: jump`, await page.evaluate(() => !window.game.player.onGround || window.game.player.vel.y > 0));
  await frames(page, 25);
  await page.mouse.down(); await frames(page, 2); await page.mouse.up(); await frames(page, 3);
  const punch = await page.evaluate(() => ({ p: window.game.player.pose.punch, sur: window.game.player.pose.surrender || 0 }));
  check(`${tag}: punch animates, hands never stuck up`, punch.sur === 0, JSON.stringify(punch));
  await frames(page, 20);
  // enter and exit a car
  await page.evaluate(() => { const g = window.game, p = g.player; const v = g.vehicles.spawn('compact', p.pos.x + Math.cos(p.h) * 2.3, p.pos.z - Math.sin(p.h) * 2.3, p.h + Math.PI / 2, { parked: true }); v.touched = true; });
  await frames(page, 3);
  await page.keyboard.press('KeyE'); await frames(page, 35);
  const inCar = await page.evaluate(() => window.game.player.state);
  await page.keyboard.press('KeyE'); await frames(page, 8);
  const out = await pose();
  check(`${tag}: enter + exit car`, inCar === 'vehicle' && out.state === 'foot' && out.sur === 0, inCar + ' -> ' + out.state);
  await page.evaluate(() => { const g = window.game; g.police.clear(); g.police.setLevel(0); });
}
await arrestAndServe('standing', () => { const g = window.game; g.resetPlayerState(4 * 80, 4 * 80 + 30, 0); });
await arrestAndServe('running', () => { const g = window.game; g.resetPlayerState(4 * 80, 4 * 80 + 30, 0); g.player.vel.set(0, 0, 7); g.player.pose.amp = 1; });
await arrestAndServe('mid-fight', () => { const g = window.game; g.resetPlayerState(4 * 80, 4 * 80 + 30, 0); g.player.selectWeapon(0); g.player.punchT = 0.2; g.player.attackT = 0.2; g.player.blocking = true; g.player.knockT = 0.6; });
await arrestAndServe('after vehicle exit', () => { const g = window.game, p = g.player; g.resetPlayerState(4 * 80, 4 * 80 + 30, 0); const v = g.vehicles.spawn('sedan', p.pos.x + 2.2, p.pos.z, Math.PI / 2, { parked: true }); g.completeEnter(v); g.exitVehicle(true); });
await arrestAndServe('during pursuit', () => { const g = window.game; g.resetPlayerState(4 * 80, 4 * 80 + 30, 0); g.police.setLevel(2); });
await arrestAndServe('repeated', () => { const g = window.game; g.resetPlayerState(4 * 80, 4 * 80 + 30, 0); });
// sentencing scales with record and what you carry
const sent = await page.evaluate(() => {
  const g = window.game, uw = g.uw;
  uw.S.inv = {}; const clean = uw.prison.charges().total;
  uw.S.inv = { snow: 5 }; g.save.weapons.pistol = true; const loaded = uw.prison.charges().total;
  uw.S.inv = {}; g.save.weapons.pistol = false;
  return { clean, loaded, priors: uw.S.rap.priors };
});
check('carried product and guns lengthen the sentence', sent.loaded > sent.clean + 60, JSON.stringify(sent));
check('six priors on record', sent.priors === 6, JSON.stringify(sent));
// jail persists through save + reload
await page.evaluate(() => { const g = window.game; g.police.setLevel(1); g.onBusted(); });
await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000 });
await frames(page, 5);
await page.reload();
await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await page.evaluate(() => window.game.quality.setMode(0));
await page.click('#btnContinue');
await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
await frames(page, 10);
const back = await pose();
check('reloading a save made in jail puts you back in your cell', back.jail && back.interior === 'prison', JSON.stringify(back));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'arrest');
