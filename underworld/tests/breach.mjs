/* Warehouse breaches and task passes (§45.26, DC-32 rulings).
   - A rammed gate or fence stays breached, in the save, through a reload: still physically open.
   - With nobody assigned to the warehouse it stays open, however long you wait.
   - Assigned crew patch it after an economic hour (it holds again, but a patch breaks easily) and repair it fully
     after eight, paid from the warehouse's vault; a full repair restores the tier's strength. No money, no repair.
   - You can patch it yourself on site (not from across town), or pay contractors from the bank to repair it today.
   - Buying the next tier of that category replaces the breached part.
   - A crew member who doesn't work at a warehouse can be given a pass for one job; it persists and expires. */
import { launch, open, check, startNew, finish, frames } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const ID = 'whse_d';
const helpers = () => ev(() => {
  const g = window.game, uw = g.uw, M = g.money;
  g.events.cool = 1e9; g.debug.god = true; g.save.rep = 5000; g.police.enabled = false; g.env.time = 13;
  window.__T = (t) => { const st = uw.whse.st('whse_d'); for (const k of ['perimeter', 'surveillance', 'access', 'vault']) st.up[k] = t[k] || 0; uw.compounds.build('whse_d'); };
  window.__away = () => { const C = g.world.compounds.whse_d; g.resetPlayerState(C.gate.x - C.gate.n[0] * 45, C.gate.z - C.gate.n[1] * 45, 0); };
  window.__lot = (x, z) => { const L = g.world.compounds.whse_d.lot; return x > L.x0 + 0.2 && x < L.x1 - 0.2 && z > L.z0 + 0.2 && z < L.z1 - 0.2; };
  window.__hours = n => { for (let k = 0; k < n; k++) uw.tickHours(1, (uw.S.lastHour + k) % 24); };
  window.__gate = () => { const R = uw.compounds.R.whse_d; return { state: R.gate.state, ram: R.gate.ram, col: R.gate.col.on, saved: uw.whse.st('whse_d').breach.gate ? uw.whse.st('whse_d').breach.gate.s : 'none' }; };
  // a car driven straight at the gate at a set speed (no throttle under 6 m/s, so a push stays a push)
  window.__ram = (speed, drive) => { const C = g.world.compounds.whse_d, nx = C.gate.n[0], nz = C.gate.n[1], h = Math.atan2(nx, nz); const v = g.vehicles.spawn('pickup', C.gate.x - nx * 9, C.gate.z - nz * 9, h, { driver: 'npc' }); v.touched = true; v.mission = 'test'; v.health = 1e6; v.vel.set(Math.sin(h) * speed, Math.cos(h) * speed); const thr = drive ? 0.5 : speed > 6 ? 1 : 0; v.drive = { update() { v.ctl.throttle = thr; v.ctl.steer = 0; v.ctl.handbrake = false; } }; window.__rv = v; };
  window.__past = () => { const C = g.world.compounds.whse_d, v = window.__rv, p = (v.pos.x - C.gate.x) * C.gate.n[0] + (v.pos.z - C.gate.z) * C.gate.n[1]; g.vehicles.despawn(v); return +p.toFixed(1); };
});
await helpers();
await ev(() => { const g = window.game, uw = g.uw; g.money.W.clean = 1e8; uw.props.buy('whse_d'); window.__T({ perimeter: 1, access: 2 }); window.__away(); });

// ---------------------------------------------------------------- 1. a breach persists, and stays open
await ev(() => window.__ram(16)); await frames(page, 60);
const b1 = await ev(() => ({ past: window.__past(), ...window.__gate(), status: window.game.uw.compounds.status('whse_d') }));
check('a car rams the motorised gate down: the breach is recorded in the save', b1.state === 'broken' && b1.saved === 'broken' && !b1.col && b1.past > 0 && b1.status.breaches === 1, JSON.stringify(b1));
await ev(() => { const g = window.game; g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true); });
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
await helpers(); await ev(() => window.__away()); await frames(page, 4);
const b2 = await ev(() => window.__gate());
await ev(() => window.__ram(4, true)); await frames(page, 90);
const b2p = await ev(() => window.__past());
check('save → reload: the gate is still down, and a car rolls straight through the gap', b2.state === 'broken' && b2.saved === 'broken' && !b2.col && b2p > 0, JSON.stringify({ b2, b2p }));

// ---------------------------------------------------------------- 2. nobody assigned: it stays open
const b3 = await ev(() => { window.__hours(30); return window.__gate(); });
check('with nobody assigned to the warehouse the breach is still open 30 economic hours later', b3.state === 'broken' && b3.saved === 'broken', JSON.stringify(b3));

// ---------------------------------------------------------------- 3. assigned crew patch, then repair, paid from the vault
const b4 = await ev(() => {
  const g = window.game, uw = g.uw, M = g.money, PV = window.__pv;
  uw.crew.refreshCandidates(true); uw.crew.S.cand[0].fee = 1; M.W.dirty.me += 10; uw.crew.hire(0); const c = uw.S.crew[uw.S.crew.length - 1]; c.rank = 3; c.loyalty = 90;
  uw.crew.assign(c.id, 'enforcer', 'w:whse_d');
  // the vault's cash pays: nothing on you, nothing in the bank to blur the sums
  const D = M.W.dirty; D.me = 0; for (const k in D.veh) D.veh[k] = 0; for (const k in D.prop) D.prop[k] = 0; D.prop.whse_d = 5000; M.W.clean = 0;
  const L = D.prop;
  // the crew start on it the hour they are assigned, and patch it an hour later
  const v0 = L.whse_d; window.__hours(1); const early = window.__gate().state; window.__hours(1); const v1 = L.whse_d;
  return { early, gate: window.__gate(), paid: v0 - v1, repairCost: uw.compounds.repairCost('whse_d', 'gate') };
});
await ev(() => window.__ram(4)); await frames(page, 90);
const push = await ev(() => window.__past());
await ev(() => window.__ram(9)); await frames(page, 60);
const ram9 = await ev(() => ({ past: window.__past(), ...window.__gate() }));
check('assigned crew patch the gate within the hour, paid from the vault; the patch holds a push…', b4.early === 'broken' && b4.gate.state === 'patched' && b4.gate.saved === 'patched' && b4.gate.col && b4.gate.ram === 6 && b4.paid === 400 && push < 0, JSON.stringify({ b4, push }));
check('…but breaks under a 9 m/s ram that the motorised gate itself (12 m/s) would have held', ram9.state === 'broken' && ram9.past > 0, JSON.stringify(ram9));
const b5 = await ev(() => {
  const g = window.game, uw = g.uw, L = g.money.W.dirty.prop;
  window.__hours(1); const patched = window.__gate().state;
  const v0 = L.whse_d, cost = uw.compounds.repairCost('whse_d', 'gate'); window.__hours(8); const v1 = L.whse_d;
  return { patched, after: window.__gate(), paid: v0 - v1, cost, status: uw.compounds.status('whse_d') };
});
await ev(() => window.__ram(9)); await frames(page, 60);
const held = await ev(() => ({ past: window.__past(), ...window.__gate() }));
check('eight hours after the breach the crew repair it fully (paid from the vault): back to a 12 m/s gate that holds a 9 m/s ram', b5.patched === 'patched' && b5.after.state === 'ok' && b5.after.saved === 'none' && b5.after.ram === 12 && b5.paid === b5.cost && b5.cost > 0 && held.state === 'ok' && held.past < 0, JSON.stringify({ b5, held }));

// ---------------------------------------------------------------- 4. no money, no repair
await ev(() => window.__ram(16)); await frames(page, 60);
const b6 = await ev(() => { const g = window.game, M = g.money; window.__past(); const D = M.W.dirty; D.me = 0; for (const k in D.veh) D.veh[k] = 0; for (const k in D.prop) D.prop[k] = 0; M.W.clean = 0; window.__hours(10); return window.__gate(); });
check('with no Dirty Cash anywhere, the crew can’t patch or repair: the breach stays open', b6.state === 'broken', JSON.stringify(b6));

// ---------------------------------------------------------------- 5. you on site, contractors from the bank, upgrades
const b7 = await ev(() => {
  const g = window.game, uw = g.uw, M = g.money, C = g.world.compounds.whse_d, out = {};
  M.W.dirty.me = 2000;
  window.__away(); out.far = uw.compounds.patchNow('whse_d');
  g.resetPlayerState(C.gate.x - C.gate.n[0] * 3, C.gate.z - C.gate.n[1] * 3, 0);
  const d0 = M.W.dirty.me; out.here = uw.compounds.patchNow('whse_d'); out.paid = d0 - M.W.dirty.me; out.gate = window.__gate();
  M.W.clean = 1e6; const c0 = M.W.clean, cost = Math.round(uw.compounds.repairCost('whse_d', 'gate') * 1.5 / 10) * 10; out.fix = uw.compounds.repairNow('whse_d'); out.clean = c0 - M.W.clean; out.cost = cost; out.fixed = window.__gate();
  window.__away();
  return out;
});
check('you can patch it yourself on site (not from across town), paying the patch', /there/.test(b7.far) && b7.here === '' && b7.paid === 400 && b7.gate.state === 'patched', JSON.stringify(b7));
check('contractors repair it today from the bank at 1.5× the crew’s repair', b7.fix === '' && b7.clean === b7.cost && b7.fixed.state === 'ok' && b7.fixed.saved === 'none', JSON.stringify(b7));
await ev(() => window.__ram(16)); await frames(page, 60);
const b8 = await ev(() => { const g = window.game, uw = g.uw; window.__past(); const before = window.__gate().state; g.money.W.clean = 1e8; const e = uw.whse.upgrade('whse_d', 'access'); return { before, e, after: window.__gate(), kind: uw.compounds.status('whse_d').gate }; });
check('buying the next access tier replaces the rammed gate (the breach goes with the old one)', b8.before === 'broken' && b8.e === '' && b8.after.state === 'ok' && b8.after.saved === 'none' && b8.kind === 'reinforced', JSON.stringify(b8));

// ---------------------------------------------------------------- 6. task passes
const p1 = await ev(() => {
  const g = window.game, uw = g.uw, M = g.money, out = {};
  M.W.clean = 1e8; uw.props.buy('whse_w'); M.W.dirty.me += 10; uw.crew.refreshCandidates(true); uw.crew.S.cand[0].fee = 1; uw.crew.hire(0); const c = uw.S.crew[uw.S.crew.length - 1]; c.rank = 3; c.loyalty = 90;
  const turf = uw.T.findIndex(t => uw.owner[t.i] === 'pc'); window.__dl = c.id;
  if (turf >= 0) uw.crew.assign(c.id, 'dealer', turf);
  out.role = c.role; out.before = uw.compounds.why('whse_d', { crewId: c.id });
  out.grant = uw.compounds.grantPass('whse_d', c.id, 3, 'collect a load');
  out.during = uw.compounds.why('whse_d', { crewId: c.id });
  out.other = uw.compounds.why('whse_w', { crewId: c.id });
  g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true);
  return out;
});
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
await helpers();
const p2 = await ev(() => { const uw = window.game.uw, id = uw.whse.st('whse_d').passes[0] && uw.whse.st('whse_d').passes[0].crew, out = {}; out.loaded = uw.compounds.why('whse_d', { crewId: id }); out.pass = uw.whse.st('whse_d').passes.length; window.__hours(4); out.expired = uw.compounds.why('whse_d', { crewId: id }); return out; });
check('a crew member who doesn’t work at the warehouse is refused…', p1.before === 'works somewhere else', JSON.stringify(p1));
check('…let in with a task pass for that warehouse only, which survives a reload and expires after its hours', p1.grant === '' && p1.during === '' && p1.other === 'works somewhere else' && p2.loaded === '' && p2.pass === 1 && p2.expired === 'works somewhere else', JSON.stringify({ p1, p2 }));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'breach');
