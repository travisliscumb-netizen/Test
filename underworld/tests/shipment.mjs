/* Physical shipments and hijacking (Session 4B: §8, §9, §45.27).
   - A rival's restock leaves its street stock and is cargo in one saved shipment record until it arrives. Out of
     your sight it simply arrives; with you near it is a real van whose trunk IS the record's cargo. Only an arrival
     puts it on their shelves (overflow to their street stock).
   - Take the van and the load moves out of the record into the van for good: their shelves and street stock don't
     get it, and a reload can't give it to them (or you) twice. Wreck it and the load is lost.
   - A reload with a van on the road resolves that drive once (it arrived), never twice.
   - The Tidewater boat is one of these records: one at a time, seizable by customs, delivered to their warehouse.
     An old save's boat (save.uw.shipment) becomes a boat record.
   - Your imports: rank-gated, one at a time, paid up front; they land at the docks and wait a day. Only a Driver
     run from the quay or a van/box truck of yours brings them in; on foot or in a car you can't take them. They are
     impounded if nobody comes. Every lot is accounted for: quay, trunk, run or warehouse, never two at once. */
import { launch, open, check, startNew, finish, frames } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
// (the clock is set once, before the first save: setting it after a reload would run the hours in between)
const helpers = first => ev(first => {
  const g = window.game, uw = g.uw;
  g.events.cool = 1e9; g.debug.god = true; g.save.rep = 5000; g.police.enabled = false; if (first) g.env.time = 13;
  window.__canon = () => JSON.stringify(uw.shipments.D.list.map(r => [r.id, r.kind, r.fid, r.state, r.at, r.until || 0, r.to, Object.keys(r.cargo).sort().map(k => [k, r.cargo[k]])]));
  window.__u = o => Object.keys(o || {}).reduce((a, k) => a + (window.__pv.GOODS[k] ? o[k] * window.__pv.GOODS[k].size : 0), 0);
  window.__shelf = f => window.__u(uw.rivalwh.st(f).stock);
  window.__recs = (kind, fid) => uw.shipments.D.list.filter(r => r.kind === kind && (!fid || r.fid === fid));
  window.__far = () => { const C = g.world.compounds.rwh_vipers, hq = uw.loc('hq', 'vipers'); let best = null; for (const t of uw.T) { const d = Math.min(Math.hypot(t.hang.x - C.center.x, t.hang.z - C.center.z), Math.hypot(t.hang.x - hq.x, t.hang.z - hq.z)); if (!best || d > best.d) best = { d, x: t.hang.x, z: t.hang.z }; } return best; };
}, first);
await helpers(true);
const reload = async () => {
  await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
  await ev(() => window.game.quality.setMode(0));
  await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
  await helpers();
};

// ---------------------------------------------------------------- 1. a restock is on the road, not on the shelves
const sched = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, f = S.factions.vipers, w = uw.rivalwh.st('vipers'), Sh = uw.shipments;
  Sh.D.list = []; f.stock = 200; f.broken = 0; w.raid = null; w.alert = 0; w.stock = { green: 20 };
  const far = window.__far(); g.resetPlayerState(far.x, far.z, 0);
  const shelf0 = window.__shelf('vipers');
  uw.rivalwh.tickDay();
  const r = window.__recs('supply', 'vipers')[0];
  uw.rivalwh.tickDay(); // a second day before it lands sends no second van
  return { shelf0, shelf: window.__shelf('vipers'), cargo: r ? window.__u(r.cargo) : 0, fStock: f.stock, n: window.__recs('supply', 'vipers').length, state: r && r.state, due: r && r.at > Sh.absHour() };
});
check('a gang’s restock leaves its street stock and is cargo in one shipment record; nothing is on the shelves yet, and no second van stacks', sched.cargo > 0 && sched.shelf === sched.shelf0 && sched.fStock === 200 - sched.cargo && sched.n === 1 && sched.state === 'due' && sched.due, JSON.stringify(sched));

// save → reload with it due: the record (and its cargo) exactly as saved, nothing delivered by the reload
const s1 = await ev(() => { const g = window.game, uw = g.uw; g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true); return { recs: window.__canon(), shelf: window.__shelf('vipers'), fStock: uw.S.factions.vipers.stock }; });
await reload();
const l1 = await ev(() => { const uw = window.game.uw; return { recs: window.__canon(), shelf: window.__shelf('vipers'), fStock: uw.S.factions.vipers.stock, state: window.game.state }; });
check('save → reload while it is due: the shipment and its cargo come back exactly; the reload delivers nothing', l1.recs === s1.recs && l1.shelf === s1.shelf && l1.fStock === s1.fStock, JSON.stringify({ s1, l1 }));

// out of your sight it simply arrives: the shelves get exactly the cargo, the record is finished and logged once
const arr1 = await ev(() => {
  const g = window.game, uw = g.uw, Sh = uw.shipments, r = window.__recs('supply', 'vipers')[0], n = window.__u(r.cargo), shelf0 = window.__shelf('vipers');
  const far = window.__far(); g.resetPlayerState(far.x, far.z, 0);
  uw.S.day = Math.floor(r.at / 24); g.env.time = r.at % 24 + 0.5; uw.S.lastHour = Math.floor(g.env.time) % 24;
  Sh.tickHours(); Sh.tickHours();
  return { n, shelf0, shelf: window.__shelf('vipers'), left: window.__recs('supply', 'vipers').length, log: Sh.D.log.filter(e => e.id === r.id).map(e => e.end), live: [...Sh.live.values()].filter(L => L.r.fid === 'vipers').length };
});
check('out of your sight it arrives when due: exactly its cargo goes on their shelves, once', arr1.shelf === arr1.shelf0 + arr1.n && arr1.left === 0 && arr1.log.length === 1 && arr1.log[0] === 'delivered' && arr1.live === 0, JSON.stringify(arr1));

// ---------------------------------------------------------------- 2. with you near: a real van, carrying the record's cargo
const mk = () => ev(() => {
  const g = window.game, uw = g.uw, Sh = uw.shipments, S = uw.S, hq = uw.loc('hq', 'vipers');
  for (const L of [...Sh.live.values()]) { Sh.live.delete(L.r.id); if (g.vehicles.list.includes(L.van)) g.vehicles.despawn(L.van); }
  Sh.D.list = Sh.D.list.filter(r => r.fid !== 'vipers'); uw.rivalwh.st('vipers').raid = null; uw.rivalwh.st('vipers').stock = { green: 10 }; // room on their shelves
  g.exitVehicle && g.player.state === 'vehicle' && g.exitVehicle(true);
  g.resetPlayerState(hq.x + 20, hq.z + 20, 0);
  Sh.rivalDelivery('vipers', { green: 30, pills: 12 });
  const r = window.__recs('supply', 'vipers')[0]; Sh.due(r);
  const L = Sh.live.get(r.id);
  window.__R = r; window.__L = L;
  return { state: r.state, live: !!L, same: !!L && L.van.trunk === r.cargo, fac: L && L.van.fac, n: window.__u(r.cargo) };
});
const roll = await mk();
check('with you near, the restock is a real van; its trunk is the shipment’s own cargo (one place for it)', roll.state === 'rolling' && roll.live && roll.same && roll.fac === 'vipers' && roll.n === 42, JSON.stringify(roll));

// the van reaches their gate, takes a dock, and only then is the load on their shelves
const drive = await ev(async () => {
  const g = window.game, uw = g.uw, L = window.__L, r = window.__R, C = g.world.compounds.rwh_vipers, ln = C.lanes.in[0];
  const shelf0 = window.__shelf('vipers');
  // start it just short of the gate, on its approach
  const a = ln[0], b2 = ln[1], dx = a.x - b2.x, dz = a.z - b2.z, d = Math.hypot(dx, dz);
  L.van.pos.x = a.x + dx / d * 16; L.van.pos.z = a.z + dz / d * 16; L.van.heading = Math.atan2(-dx, -dz); L.van.vel && L.van.vel.set && L.van.vel.set(0, 0, 0);
  L.van.drive.setGoal(a.x, a.z);
  g.resetPlayerState(a.x + dx / d * 40, a.z + dz / d * 40, 0);
  const onShelfEarly = [];
  for (let k = 0; k < 900 && r.state !== 'done'; k++) { await new Promise(res => requestAnimationFrame(res)); if (k % 30 === 0) onShelfEarly.push(window.__shelf('vipers') - shelf0); }
  const atDock = L.V && L.V.phase, trunk = window.__u(L.van.trunk);
  // and it leaves: unloads, drives back out of their gate (its lane, no manifest of yours) onto the street
  if (L.V && L.V.phase === 'unload') L.V.t = 99; // the 20 s unload itself isn't what is tested here
  for (let k = 0; k < 2400 && L.V && L.V.phase !== 'gone'; k++) await new Promise(res => requestAnimationFrame(res));
  // gate.n points into the yard: how far past the gate, on the street side
  const outside = L.V ? -((L.van.pos.x - C.gate.x) * C.gate.n[0] + (L.van.pos.z - C.gate.z) * C.gate.n[1]) : 0;
  return { shelf0, shelf: window.__shelf('vipers'), state: r.state, end: r.end, docked: !!L.V, phase: atDock, left: L.V && L.V.phase, outside: +outside.toFixed(1), early: onShelfEarly.slice(0, 3), trunk };
});
check('the van drives into their compound and docks; the cargo reaches their shelves on arrival (not before), and the van leaves empty', drive.state === 'done' && drive.end === 'delivered' && drive.docked && drive.shelf === drive.shelf0 + 42 && drive.early[0] === 0 && drive.trunk === 0, JSON.stringify(drive));
check('…then it unloads and drives back out through their gate onto the street', drive.left === 'gone' && drive.outside > 0, JSON.stringify(drive));

// ---------------------------------------------------------------- 3. hijack: the load is yours, not theirs, for good
await mk();
const jack = await ev(() => {
  const g = window.game, uw = g.uw, Sh = uw.shipments, L = window.__L, r = window.__R, f = uw.S.factions.vipers, v = L.van;
  const shelf0 = window.__shelf('vipers'), fs0 = f.stock, p0 = f.press || 0, rel0 = f.rel;
  g.resetPlayerState(v.pos.x + 3, v.pos.z, 0); v.locked = false; g.completeEnter(v);
  Sh.update(0.1);
  return { mine: g.player.vehicle === v, trunk: window.__u(v.trunk), rec: window.__u(r.cargo), end: r.end, inList: Sh.D.list.includes(r), shelf: window.__shelf('vipers'), shelf0, fStock: f.stock, fs0, press: (f.press || 0) - p0, rel: f.rel - rel0, fac: v.fac };
});
check('take the van: the load is in your trunk and nowhere else (the record is empty and finished, their shelves and street stock unchanged)', jack.mine && jack.trunk === 42 && jack.rec === 0 && jack.end === 'stolen' && !jack.inList && jack.shelf === jack.shelf0 && jack.fStock === jack.fs0 && jack.fac === null, JSON.stringify(jack));
check('…and they take it personally: real pressure (a stolen shipment) and relations drop', jack.press >= 29 && jack.rel <= -24, JSON.stringify(jack));
const jack2 = await ev(() => { const uw = window.game.uw, Sh = uw.shipments; const shelf = window.__shelf('vipers'); for (let k = 0; k < 5; k++) Sh.update(0.5); Sh.reset(); return { shelf, after: window.__shelf('vipers'), recs: window.__recs('supply', 'vipers').length }; });
check('a stolen load can’t come back to them: more updates or a reload-reset deliver nothing', jack2.after === jack2.shelf && jack2.recs === 0, JSON.stringify(jack2));

// wreck it on the way: the load is lost with it
await ev(() => { const g = window.game; if (g.player.state === 'vehicle') g.exitVehicle(true); });
await mk();
const wreck = await ev(() => {
  const g = window.game, uw = g.uw, Sh = uw.shipments, L = window.__L, r = window.__R, f = uw.S.factions.vipers;
  const shelf0 = window.__shelf('vipers'), fs0 = f.stock; L.van.health = 0; Sh.update(0.1);
  return { end: r.end, rec: window.__u(r.cargo), shelf: window.__shelf('vipers'), shelf0, fStock: f.stock, fs0 };
});
check('wreck the van: the load is lost (not on their shelves, not in their street stock, not in the record)', wreck.end === 'lost' && wreck.rec === 0 && wreck.shelf === wreck.shelf0 && wreck.fStock === wreck.fs0, JSON.stringify(wreck));

// ---------------------------------------------------------------- 4. a save with the van on the road: resolved once on load
await mk();
const s2 = await ev(() => { const g = window.game, uw = g.uw; g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true); const r = window.__R; return { id: r.id, n: window.__u(r.cargo), shelf: window.__shelf('vipers'), state: r.state }; });
await reload();
const l2 = await ev((id) => { const uw = window.game.uw, Sh = uw.shipments; const a = window.__shelf('vipers'); Sh.reset(); uw.bind(window.game.save); const b2 = window.__shelf('vipers'); return { shelf: a, again: b2, recs: window.__recs('supply', 'vipers').length, log: Sh.D.log.filter(e => e.id === id).map(e => e.end), live: Sh.live.size }; }, s2.id);
check('save with the van on the road → reload: it arrived, exactly once (a second reset/bind adds nothing)', s2.state === 'rolling' && l2.shelf === s2.shelf + s2.n && l2.again === l2.shelf && l2.recs === 0 && l2.log.length === 1 && l2.log[0] === 'delivered' && l2.live === 0, JSON.stringify({ s2, l2 }));

// ---------------------------------------------------------------- 5. the Tidewater boat
const boat = await ev(() => {
  const g = window.game, uw = g.uw, Sh = uw.shipments, S = uw.S, f = S.factions.tidewater, w = uw.rivalwh.st('tidewater');
  Sh.D.list = Sh.D.list.filter(r => r.kind !== 'boat'); f.broken = 0;
  const far = window.__far(); g.resetPlayerState(far.x, far.z, 0); Sh.watching = () => false;
  const a = Sh.scheduleBoat(), b2 = Sh.scheduleBoat();
  const one = window.__recs('boat').length;
  // customs take it
  const R0 = Math.random; Math.random = () => 0; Sh.due(a); Math.random = R0;
  const seized = a.end, after = window.__recs('boat').length;
  // the next one lands and goes to their warehouse (what the shelves can't hold, to their street stock)
  const c = Sh.scheduleBoat(); w.stock = {}; const n = window.__u(c.cargo), fs0 = f.stock, s0 = window.__shelf('tidewater');
  Math.random = () => 0.99; Sh.due(c); Math.random = R0;
  delete Sh.watching;
  return { two: !!b2, one, seized, after, end: c.end, shelf: window.__shelf('tidewater') - s0, street: f.stock - fs0, n };
});
check('the Tidewater boat is one shipment at a time; customs can seize it; otherwise its cargo goes to their warehouse, the overflow to their street stock', !boat.two && boat.one === 1 && boat.seized === 'seized' && boat.after === 0 && boat.end === 'delivered' && boat.shelf + boat.street === boat.n && boat.shelf > 0, JSON.stringify(boat));
const mig = await ev(() => {
  const uw = window.game.uw, SS = window.__pv.ShipmentSystem;
  const S = { ships: SS.fresh(), shipment: { at: 500, turf: 3, cargo: { snow: 20, smokes: 30 }, done: false, x: 10, z: 20 } };
  SS.migrate(S);
  const S2 = { ships: SS.fresh(), shipment: { at: 500, cargo: { snow: 20 }, done: true, x: 1, z: 1 } }; SS.migrate(S2);
  return { has: 'shipment' in S, rec: S.ships.list[0] && { kind: S.ships.list[0].kind, fid: S.ships.list[0].fid, n: window.__u(S.ships.list[0].cargo), at: S.ships.list[0].at }, done: S2.ships.list.length, has2: 'shipment' in S2 };
});
check('an old save’s boat (save.uw.shipment) becomes a boat record with the same cargo; a finished one is dropped', !mig.has && mig.rec && mig.rec.kind === 'boat' && mig.rec.fid === 'tidewater' && mig.rec.n === 50 && mig.rec.at === 500 && mig.done === 0 && !mig.has2, JSON.stringify(mig));

// ---------------------------------------------------------------- 6. your imports
const gate = await ev(() => {
  const g = window.game, uw = g.uw, Sh = uw.shipments;
  Sh.D.list = Sh.D.list.filter(r => r.kind !== 'import');
  uw._rank = 2; const low = Sh.importBlock('snow');
  uw._rank = 4; const noWh = uw.whse.list().length ? '' : Sh.importBlock('snow');
  g.money.W.clean = 1e8; uw.props.buy('whse_w');
  window.game.money.W.dirty.me = 5e6; uw._rank = 4;
  const ok = Sh.importBlock('snow'), price = Sh.importPrice('snow');
  return { low, noWh, ok, price };
});
check('imports are rank-gated (Territory Holder) and need a warehouse to come into', /Territory Holder/.test(gate.low) && gate.ok === '' && gate.price > 0, JSON.stringify(gate));
const order = await ev(() => {
  const g = window.game, uw = g.uw, Sh = uw.shipments, M = window.game.money;
  uw._rank = 4; const before = M.payrollReserve ? M.payrollReserve() : 0;
  const e = Sh.orderImport('snow'), r = Sh.importOpen(), second = Sh.importBlock('green');
  return { e, paid: before - M.payrollReserve(), price: r && r.paid, n: r && r.cargo.snow, state: r && r.state, second, cost: r && window.__pv.Inv.cost(r.cargo, 'snow') };
});
check('ordering pays the whole price up front (from a vault first); one import at a time; the cost goes with the goods', order.e === '' && order.paid === order.price && order.n === 120 && order.state === 'due' && /already/.test(order.second) && Math.abs(order.cost - order.price) < 1, JSON.stringify(order));
const land = await ev(() => {
  const uw = window.game.uw, Sh = uw.shipments, r = Sh.importOpen(), R0 = Math.random; uw._rank = 4;
  Math.random = () => 0.99; Sh.due(r); Math.random = R0;
  return { state: r.state, crate: Sh.crates.has(r.id), until: r.until - Sh.absHour() };
});
check('it lands at the docks and waits there a day (a stack of crates on the quay)', land.state === 'landed' && land.crate && land.until === 24, JSON.stringify(land));
// you can't take it on foot or in a car; a box truck takes it
const take = await ev(() => {
  const g = window.game, uw = g.uw, Sh = uw.shipments, r = Sh.importOpen(), P = r.from;
  g.resetPlayerState(P.x + 2, P.z, 0); const foot = uw.findAction();
  const car = g.vehicles.spawn('sedan', P.x + 3, P.z, 0, {}); g.completeEnter(car); car.speed = 0;
  const inCar = Sh.loadImport(r, car), carTrunk = window.__u(car.trunk);
  g.exitVehicle(true); g.vehicles.despawn(car);
  const truck = g.vehicles.spawn('truck', P.x + 3, P.z, 0, {}); g.completeEnter(truck); truck.speed = 0;
  const act = uw.findAction(); const label = act && act.label; act && act.act();
  window.__truck = truck;
  return { foot: foot && foot.label, inCar, carTrunk, label, trunk: truck.trunk.snow || 0, rec: window.__u(r.cargo), end: r.end, inList: Sh.D.list.includes(r), cost: window.__pv.Inv.cost(truck.trunk, 'snow'), paid: r.paid };
});
check('on foot or in a car you can’t take it; in a box truck it all goes in the back with its cost, and the quay is empty', /Your import/.test(take.foot) && take.inCar === 0 && take.carTrunk === 0 && /Load your import/.test(take.label) && take.trunk === 120 && take.rec === 0 && take.end === 'collected' && !take.inList && Math.abs(take.cost - take.paid) < 1, JSON.stringify(take));
// …and it becomes warehouse stock at your loading bay
await ev(() => { const g = window.game, t = window.__truck, dk = g.world.compounds.whse_w.docks[0].bay; t.pos.x = dk.x; t.pos.z = dk.z; t.heading = dk.h; t.speed = 0; });
await frames(page, 6);
const unload = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, t = window.__truck, before = window.__pv.Inv.has(S.storage.whse_w, 'snow');
  const locs = uw.locations(); const mine = locs.find(l => l.key === 'p:whse_w' && l.here), tr = locs.find(l => l.o === t.trunk);
  const moved = mine && tr ? uw.transfer(tr.key, 'p:whse_w', 'snow', 120) : -1;
  return { here: !!mine, tr: !!tr, moved, wh: window.__pv.Inv.has(S.storage.whse_w, 'snow') - before, trunk: t.trunk.snow || 0, dock: uw.compounds.dockAt(t.pos.x, t.pos.z), keys: locs.map(l => l.key + (l.here ? '*' : '')).join(',') };
});
check('drive it to your warehouse’s loading bay and unload: it is warehouse stock now', unload.here && unload.wh === 120 && unload.trunk === 0, JSON.stringify(unload));

// a Driver brings the next one in from the quay: the lots are in the run, then the warehouse
await ev(() => { const g = window.game; if (g.player.state === 'vehicle') g.exitVehicle(true); g.vehicles.despawn(window.__truck); });
const drv = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, Sh = uw.shipments, CM = uw.crew, M = g.money;
  uw._rank = 4; M.W.dirty.me = 5e6;
  Sh.orderImport('green'); const r = Sh.importOpen(); const R0 = Math.random; Math.random = () => 0.99; Sh.due(r); Math.random = R0;
  CM.refreshCandidates(true); CM.S.cand[0].fee = 1; M.W.dirty.me += 10; CM.hire(0); const c = S.crew[S.crew.length - 1]; c.rank = 3; c.loyalty = 90; c.traits = []; c.skill = 70;
  CM.assign(c.id, 'driver', 'w:whse_w');
  const toHouse = uw.runs.dispatch(c.id, 'import:' + r.id, 'turf:0', 'green', 10);
  S.storage.whse_w = {}; // room for it
  const e = uw.runs.dispatch(c.id, 'import:' + r.id, 'whse_w', 'green', 240);
  const run = S.runs.find(x => x.from === 'import:' + r.id);
  const quay = window.__u(r.cargo), end = r.end;
  // the drop
  const rep = run ? uw.runs.resolve(run, 0) : null;
  return { toHouse, e, inRun: run && run.n, quay, end, delivered: rep && rep.delivered, wh: window.__pv.Inv.has(S.storage.whse_w, 'green'), cost: window.__pv.Inv.cost(S.storage.whse_w, 'green'), paid: r.paid };
});
check('a Driver can bring it in (only to a warehouse): the lots leave the quay into the run, then land in the warehouse with their cost', drv.toHouse !== '' && drv.e === '' && drv.inRun === 240 && drv.quay === 0 && drv.end === 'collected' && drv.delivered === 240 && drv.wh === 240 && Math.abs(drv.cost - drv.paid) < 1, JSON.stringify(drv));
const exp = await ev(() => {
  const g = window.game, uw = g.uw, Sh = uw.shipments, M = g.money; uw._rank = 4; M.W.dirty.me = 5e6;
  Sh.orderImport('pills'); const r = Sh.importOpen(); const R0 = Math.random; Math.random = () => 0.99; Sh.due(r); Math.random = R0;
  uw.S.day += 2; Sh.tickHours();
  return { end: r.end, n: window.__u(r.cargo), open: !!Sh.importOpen(), crate: Sh.crates.has(r.id) };
});
check('nobody comes for it within the day: the port impounds it (nothing left anywhere, no crates)', exp.end === 'expired' && exp.n === 0 && !exp.open && !exp.crate, JSON.stringify(exp));
const seize = await ev(() => {
  const g = window.game, uw = g.uw, Sh = uw.shipments, M = g.money; uw._rank = 4; M.W.dirty.me = 5e6;
  Sh.orderImport('snow'); const r = Sh.importOpen(); const R0 = Math.random; Math.random = () => 0; Sh.due(r); Math.random = R0;
  return { end: r.end, n: window.__u(r.cargo), open: !!Sh.importOpen() };
});
check('customs can open the container when it lands: seized, gone, no refund', seize.end === 'seized' && seize.n === 0 && !seize.open, JSON.stringify(seize));

// save → reload with an import on the quay: it is still there, once; a reload never doubles it
const s3 = await ev(() => {
  const g = window.game, uw = g.uw, Sh = uw.shipments, M = g.money; uw._rank = 4; M.W.dirty.me = 5e6;
  Sh.orderImport('green'); const r = Sh.importOpen(); const R0 = Math.random; Math.random = () => 0.99; Sh.due(r); Math.random = R0;
  g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true); return { id: r.id, n: window.__u(r.cargo), state: r.state };
});
await reload();
const l3 = await ev((id) => { const uw = window.game.uw, Sh = uw.shipments; Sh.reset(); const r = Sh.find(id); return { state: r && r.state, n: r ? window.__u(r.cargo) : 0, imports: window.__recs('import').length, crate: Sh.crates.has(id) }; }, s3.id);
check('save → reload with your import on the quay: it is still there, exactly once, crates and all', l3.state === 'landed' && l3.n === s3.n && l3.imports === 1 && l3.crate, JSON.stringify({ s3, l3 }));

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await finish(b, 'shipment');
