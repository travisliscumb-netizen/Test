/* Tutorial: short contextual tips, one at a time, each shown once, triggered by what the player
   is actually doing (moving, a prompt, driving, a gun, the police...), never a forced mission;
   they can be switched off and brought back from Settings, and what was seen survives a reload. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b, { hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const run = (sec) => ev(s => { const g = window.game; for (let n = 0; n < 60 * s; n++) g.update(1 / 60, 1 / 60); }, sec);
const tip = () => ev(() => { const el = document.getElementById('tip'); return { on: !el.classList.contains('hidden'), text: el.querySelector('span').textContent, id: window.game.tutorial.cur && window.game.tutorial.cur.id }; });
await ev(() => { const g = window.game; g.events.cool = 1e9; g.police.enabled = true; g.save.tips = {}; g.tutorial.cool = 0; g.input.usingTouch = true; });

await run(5);
const t1 = await tip();
check('the first tip is about moving and looking, worded for touch', t1.on && t1.id === 'move' && /thumb/.test(t1.text), JSON.stringify(t1));
const free = await ev(() => { const g = window.game; return { mission: !!g.missions.active, state: g.state, modal: g.ui.modal }; });
check('no forced opening: the player is free to play (no mission, no modal)', !free.mission && free.state === 'playing' && !free.modal, JSON.stringify(free));
// one at a time: while a tip is up no other shows; dismissing it lets the next one come later
await ev(() => { const g = window.game, p = g.player; g.save.stats.playTime = 400; });
await run(1);
const one = await tip();
check('only one tip at a time', one.id === 'move', JSON.stringify(one));
await ev(() => document.querySelector('#tip i').click());
const gone = await tip();
check('the ✕ dismisses a tip', !gone.on, JSON.stringify(gone));
await run(10);
const t2 = await tip();
check('the next useful tip follows after a pause (money / map / phone basics)', t2.on && ['money', 'map', 'phone', 'interact'].includes(t2.id), JSON.stringify(t2));

// contextual: driving, a gun, the police
const drive = await ev(() => {
  const g = window.game, p = g.player; g.tutorial.hide(); g.tutorial.cool = 0;
  for (const id of ['move', 'interact', 'money', 'map', 'phone']) g.save.tips[id] = 1;
  const v = g.vehicles.spawn('sedan', p.pos.x + 3, p.pos.z, 0, {}); g.completeEnter(v);
  for (let n = 0; n < 120; n++) g.update(1 / 60, 1 / 60);
  const r = { id: g.tutorial.cur && g.tutorial.cur.id, text: document.querySelector('#tip span').textContent };
  g.exitVehicle(true); g.tutorial.hide(); g.tutorial.cool = 0;
  g.save.weapons.pistol = true; g.save.ammo.pistol = 24; p.selectWeapon(2);
  for (let n = 0; n < 120; n++) g.update(1 / 60, 1 / 60);
  r.gun = g.tutorial.cur && g.tutorial.cur.id; r.gunText = document.querySelector('#tip span').textContent;
  g.tutorial.hide(); g.tutorial.cool = 0; p.selectWeapon(0);
  g.police.addHeat(2, p.pos.x, p.pos.z);
  for (let n = 0; n < 120; n++) g.update(1 / 60, 1 / 60);
  r.police = g.tutorial.cur && g.tutorial.cur.id; g.police.clear(); g.tutorial.hide();
  return r;
});
check('getting into a car teaches driving', drive.id === 'drive' && /GAS|BRAKE/.test(drive.text), JSON.stringify(drive));
check('drawing a gun teaches move + aim + fire', drive.gun === 'gun' && /FIRE/.test(drive.gunText), JSON.stringify(drive));
check('the first wanted level explains the police', drive.police === 'police', JSON.stringify(drive));
// once taught, never again
const again = await ev(() => {
  const g = window.game, p = g.player; g.tutorial.cool = 0;
  const v = g.vehicles.spawn('sedan', p.pos.x + 3, p.pos.z + 3, 0, {}); g.completeEnter(v);
  for (let n = 0; n < 180; n++) g.update(1 / 60, 1 / 60);
  const id = g.tutorial.cur && g.tutorial.cur.id; g.exitVehicle(true); return id;
});
check('a tip already seen does not repeat', again !== 'drive', String(again));

// settings: off hides and stops tips; "show again" brings them back
const st = await ev(() => {
  const g = window.game; g.ui.open('settings');
  document.getElementById('setGuide').click();
  const off = g.save.settings.guide; g.tutorial.cool = 0; g.save.tips.product = undefined; delete g.save.tips.product;
  while (g.ui.stack.length) g.ui.back();
  g.uw.S.inv.smokes = 2;
  for (let n = 0; n < 120; n++) g.update(1 / 60, 1 / 60);
  const shownWhileOff = !!g.tutorial.cur;
  g.ui.open('settings'); document.getElementById('btnTips').click(); const on = g.save.settings.guide; while (g.ui.stack.length) g.ui.back();
  g.tutorial.cool = 0; for (let n = 0; n < 240; n++) g.update(1 / 60, 1 / 60);
  return { off, shownWhileOff, on, cleared: Object.keys(g.save.tips).length <= 1, now: g.tutorial.cur && g.tutorial.cur.id };
});
check('“Tutorial hints” off: no tips', st.off === false && !st.shownWhileOff, JSON.stringify(st));
check('“Show the tips again” re-enables them from the start', st.on === true && st.cleared && !!st.now, JSON.stringify(st));

// seen tips survive save + reload
await ev(() => { const g = window.game; g.save.tips = { move: 1, drive: 1, gun: 1 }; g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true); });
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
const kept = await ev(() => ({ ...window.game.save.tips }));
check('seen tips are saved and reloaded', kept.move === 1 && kept.drive === 1 && kept.gun === 1, JSON.stringify(kept));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'tutorial');
