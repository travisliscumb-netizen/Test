/* Arrest + prison regression. Arrests while standing, running, fighting, right after a
   vehicle exit, during a pursuit and repeatedly; each one goes through sentencing, the jail
   block (accelerated clock, frozen street clock, world still ticking) and release. After
   every release: hands down, clean pose, and walk / run / sprint / punch / jump / enter /
   exit all work. */
import { launch, open, check, frames, startNew, summary, finish, throughCourt } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
await page.evaluate(() => { const g = window.game; g.events.cool = 1e9; g.input.wantLock = false; g.input.noLock = true; (g.money.W.clean = g.money.W.dirty.me = 50000); });
await page.mouse.move(240, 135);
const pose = () => page.evaluate(() => { const g = window.game, p = g.player, ps = p.pose; return { sur: +(ps.surrender || 0).toFixed(3), crouch: +(ps.crouch || 0).toFixed(3), down: +(ps.down || 0).toFixed(3), block: +(ps.block || 0).toFixed(2), state: p.state, gs: g.state, trans: !!p.trans, knock: p.knockT, bust: g.police.bust, lvl: g.police.level, jail: !!g.uw.S.jail, interior: p.interior ? p.interior.id : null }; });
// every transient flag that has ever leaked out of an arrest in this codebase
const stale = () => page.evaluate(() => {
  const g = window.game, p = g.player, ps = p.pose, c = g.cam, bad = [];
  const z = (k, v) => { if (v) bad.push(k + '=' + (typeof v === 'number' ? v.toFixed(2) : v)); };
  z('surrender', (ps.surrender || 0) > 0.001); z('crouch', (ps.crouch || 0) > 0.001); z('down', (ps.down || 0) > 0.001);
  z('block', (ps.block || 0) > 0.05); z('kick', (ps.kick || 0) > 0.05); z('heavy', (ps.heavy || 0) > 0.05); z('hit', (ps.hit || 0) > 0.05); z('dodge', (ps.dodge || 0) > 0.05);
  z('blocking', p.blocking); z('dodgeT', p.dodgeT > 0); z('knockT', p.knockT > 0); z('attackT', p.attackT > 0); z('lungeLeft', p.lungeLeft > 0); z('combo', p.combo); z('trans', !!p.trans);
  z('interior', !!p.interior); z('aiming', !!p.aiming); z('vehicle', !!p.vehicle); z('reloadT', p.reloadT > 0);
  z('bust', g.police.bust); z('wanted', g.police.level); z('jail', !!g.uw.S.jail); z('fading', !!g.fading); z('state', g.state !== 'playing' && g.state);
  z('mapOpen', g.mapOpen); z('modal', g.ui.modal); z('bigmapVisible', !document.getElementById('bigmap').classList.contains('hidden'));
  z('jailHud', !document.getElementById('jailHud').classList.contains('hidden')); z('hudHidden', document.getElementById('hud').classList.contains('hidden'));
  z('inputDisabled', g.input.enabled === false); z('stuckKeys', g.input.down.size);
  z('revCam', !!c.revCam); z('camNaN', ![c.yaw, c.pitch].every(Number.isFinite)); z('timeScale', g.timeScale !== undefined && g.timeScale !== 1 && g.timeScale);
  z('posNaN', ![p.pos.x, p.pos.y, p.pos.z, p.h].every(Number.isFinite));
  return bad;
});
async function arrestAndServe(tag, setup, opts = {}) {
  await page.evaluate(setup);
  await frames(page, 4);
  const before = await page.evaluate(() => ({ t: window.game.env.time, day: window.game.uw.S.day }));
  for (const k of opts.keys || []) await page.keyboard.down(k);
  if (opts.keys) await frames(page, 12);
  if (opts.map) { await page.keyboard.press('KeyM'); await frames(page, 3); check(`${tag}: map is open before the bust`, await page.evaluate(() => window.game.mapOpen)); }
  await page.evaluate(() => { const g = window.game; if (g.police.level === 0) g.police.setLevel(1); g.uw.S.rap.maxLvl = Math.max(g.uw.S.rap.maxLvl || 0, 3); g.uw.legal.add('assault', 'police'); g.onBusted(); });
  for (const k of opts.keys || []) await page.keyboard.up(k);
  if (opts.map) check(`${tag}: the bust closes the map`, await page.evaluate(() => !window.game.mapOpen && document.getElementById('bigmap').classList.contains('hidden')));
  let mid = 0;
  for (let k = 0; k < 40 && mid < 0.6; k++) { await frames(page, 1); mid = Math.max(mid, await page.evaluate(() => window.game.player.pose.surrender || 0)); }
  check(`${tag}: hands-up arrest pose plays`, mid > 0.5, mid.toFixed(2));
  await throughCourt(page);
  await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });
  await frames(page, 5);
  let s = await pose();
  check(`${tag}: in the jail block with a clean pose`, s.jail && s.interior === 'prison' && s.sur === 0 && s.down === 0 && s.state === 'foot', JSON.stringify(s));
  const jail = await page.evaluate(() => ({ total: window.game.uw.S.jail.total, ch: window.game.uw.S.jail.charges }));
  check(`${tag}: sentenced (halved since v6: at least 3 days)`, jail.total >= 3, `${jail.total} days · ${jail.ch.slice(0, 80)}`);
  // walk in the cell block
  const c0 = await page.evaluate(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z }));
  await page.keyboard.down('KeyW'); await frames(page, 12); await page.keyboard.up('KeyW');
  const c1 = await page.evaluate(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z }));
  check(`${tag}: can walk around inside`, Math.hypot(c1.x - c0.x, c1.z - c0.z) > 0.3);
  // serve the rest quickly: 15 more days (30 s at two seconds a day; the street moves a day per week served)
  await page.evaluate(() => { const j = window.game.uw.S.jail; j.total = j.served + 15; });
  await page.waitForFunction(() => !window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 180000, polling: 100 });
  await frames(page, 6);
  const after = await page.evaluate(() => ({ t: window.game.env.time, day: window.game.uw.S.day }));
  check(`${tag}: street clock stood still in jail`, Math.abs(after.t - before.t) < 0.25, `${before.t.toFixed(2)} -> ${after.t.toFixed(2)}`);
  check(`${tag}: the world kept running (days passed)`, after.day > before.day, `${before.day} -> ${after.day}`);
  s = await pose();
  check(`${tag}: released clean (hands down, no knock, no wanted)`, s.sur === 0 && s.crouch === 0 && s.down === 0 && !s.jail && !s.interior && s.lvl === 0 && s.bust === 0 && s.state === 'foot' && !s.knock, JSON.stringify(s));
  const st0 = await stale();
  check(`${tag}: no stale state after release (pose, flags, camera, UI, map, input)`, st0.length === 0, st0.join(', '));
  // facing follows input after release: D turns the player to camera-right
  const fy = await page.evaluate(() => window.game.cam.yaw);
  await page.keyboard.down('KeyD'); await frames(page, 20); await page.keyboard.up('KeyD'); await frames(page, 2);
  const fh = await page.evaluate(() => window.game.player.h);
  const wantH = fy - Math.PI / 2, dH = Math.abs(Math.atan2(Math.sin(fh - wantH), Math.cos(fh - wantH)));
  check(`${tag}: facing follows input after release`, dH < 0.4, `h ${fh.toFixed(2)} want ${wantH.toFixed(2)}`);
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
  check(`${tag}: punch animates, hands never stuck up`, punch.sur === 0 && punch.p > 0.05, JSON.stringify(punch));
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
await arrestAndServe('standing (idle)', () => { const g = window.game; g.resetPlayerState(4 * 80, 4 * 80 + 30, 0); });
await arrestAndServe('walking', () => { const g = window.game; g.resetPlayerState(4 * 80, 4 * 80 + 30, 0); }, { keys: ['KeyW', 'ControlLeft'] });
await arrestAndServe('sprinting (keys held)', () => { const g = window.game; g.resetPlayerState(4 * 80, 4 * 80 + 30, 0); }, { keys: ['KeyW', 'ShiftLeft'] });
await arrestAndServe('map open', () => { const g = window.game; g.resetPlayerState(4 * 80, 4 * 80 + 30, 0); }, { map: true });
await arrestAndServe('running', () => { const g = window.game; g.resetPlayerState(4 * 80, 4 * 80 + 30, 0); g.player.vel.set(0, 0, 7); g.player.pose.amp = 1; });
await arrestAndServe('mid-fight', () => { const g = window.game; g.resetPlayerState(4 * 80, 4 * 80 + 30, 0); g.player.selectWeapon(0); g.player.punchT = 0.2; g.player.attackT = 0.2; g.player.blocking = true; g.player.knockT = 0.6; });
await arrestAndServe('after vehicle exit', () => { const g = window.game, p = g.player; g.resetPlayerState(4 * 80, 4 * 80 + 30, 0); const v = g.vehicles.spawn('sedan', p.pos.x + 2.2, p.pos.z, Math.PI / 2, { parked: true }); g.completeEnter(v); g.exitVehicle(true); });
await arrestAndServe('during pursuit', () => { const g = window.game; g.resetPlayerState(4 * 80, 4 * 80 + 30, 0); g.police.setLevel(2); });
await arrestAndServe('repeated', () => { const g = window.game; g.resetPlayerState(4 * 80, 4 * 80 + 30, 0); });
// death after a release: hospital respawn is just as clean
await page.evaluate(() => window.game.onPlayerDeath('test'));
await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading && window.game.player.state === 'foot', null, { timeout: 120000 });
await frames(page, 8);
{ const st = await stale(); check('death after release: hospital respawn is clean', st.length === 0, st.join(', ')); }
// the map open during a death closes too
await page.keyboard.press('KeyM'); await frames(page, 3);
await page.evaluate(() => window.game.onPlayerDeath('test'));
check('death closes the map', await page.evaluate(() => !window.game.mapOpen && document.getElementById('bigmap').classList.contains('hidden')));
await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading && window.game.player.state === 'foot', null, { timeout: 120000 });
await frames(page, 8);
{ const st = await stale(); check('death with the map open: respawn is clean', st.length === 0, st.join(', ')); }
// sentencing scales with record and what you carry
const sent = await page.evaluate(() => {
  const g = window.game, uw = g.uw, R = uw.S.rap;
  // a fixed baseline: no crimes on the current record, 1★ (whatever the steps above left behind)
  const keep = { cur: R.cur, maxLvl: R.maxLvl, lvl: g.police.level, heat: g.police.heat };
  R.cur = {}; R.maxLvl = 1; g.police.level = 1;
  uw.S.inv = {}; const clean = uw.prison.charges().total;
  uw.S.inv = { snow: 5 }; g.save.weapons.pistol = true; const loaded = uw.prison.charges().total;
  uw.S.inv = {}; g.save.weapons.pistol = false;
  R.cur = keep.cur; R.maxLvl = keep.maxLvl; g.police.level = keep.lvl; g.police.heat = keep.heat;
  return { clean, loaded, priors: R.priors };
});
// v6 halves every final sentence, so 'over a month' on the old scale is over a fortnight now
check('carried product and guns lengthen the sentence (more than double, and by over two weeks)', sent.loaded > sent.clean * 2 && sent.loaded > sent.clean + 15, JSON.stringify(sent));
check('nine priors on record', sent.priors === 9, JSON.stringify(sent));
// jail persists through save + reload
await page.evaluate(() => { const g = window.game; g.police.setLevel(1); g.uw.S.rap.maxLvl = Math.max(g.uw.S.rap.maxLvl || 0, 3); g.uw.legal.add('assault', 'police'); g.onBusted(); });
await throughCourt(page);
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
