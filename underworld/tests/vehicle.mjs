/* The vehicle registry (Session 5A: §14, §39 scenarios 9, 12 and 13, §45.29).
   - Physical parking only: every owned car holds a home space at a property you own, kept for it even while it is
     out. The fleet never outgrows your parking; there is no "storage" overflow and no free space to exploit while a
     car is out. A gift with nowhere to go waits with the giver until you have a free space.
   - Street parking is saved: a car you leave somewhere stays exactly there (no towing home), through reloads.
   - Stolen cars you drove, and anything carrying your cargo (a hijacked van), persist with position, condition,
     HOT, trunk and cash. A day unattended on the economic clock and police recover it: an explicit, logged event.
     The registry is bounded; a full one lets go of a car with nothing of yours first, and never just drops cargo.
   - Wrecks come home: a burned owned car is towed to its space as a wreck needing a repair; a wreck left out is
     towed home by your people. Rare cars survive all of it. Nothing is duplicated by a reload. */
import { launch, open, check, startNew, finish, frames } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const helpers = first => ev(first => {
  const g = window.game, uw = g.uw, R = g.vreg;
  g.events.cool = 1e9; g.debug.god = true; g.police.enabled = false; if (first) g.env.time = 13;
  window.__tick = (n = 1) => { for (let k = 0; k < n; k++) { R.t = 0; R.update(0.5); } };
  window.__far = () => g.resetPlayerState(g.player.pos.x + 900 > 950 ? 100 : g.player.pos.x + 900, g.player.pos.z, 0);
  window.__u = o => Object.keys(o || {}).reduce((a, k) => a + (window.__pv.GOODS[k] ? o[k] * window.__pv.GOODS[k].size : 0), 0);
  window.__liveOf = uid => g.vehicles.list.filter(v => v.garageUid === uid).length;
  window.__liveT = id => g.vehicles.list.filter(v => v.trackId === id).length;
}, first);
await helpers(true);
const reload = async () => {
  await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
  await ev(() => window.game.quality.setMode(0));
  await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
  await helpers();
};
const save = () => ev(() => { const g = window.game; g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.exitVehicle && g.player.state === 'vehicle' && g.exitVehicle(true); return g.saveGame(true); });

// ---------------------------------------------------------------- 1. physical slots, no overflow
const slots = await ev(() => {
  const g = window.game, uw = g.uw, s = g.save, C = g.content, R = g.vreg;
  g.money.W.clean = 1e8; uw.props.buy('docklock');
  const cap = C.garageCap, free0 = R.freeBays();
  const a = C.addToGarage('sedan', 'bought', undefined, true), b2 = C.addToGarage('pickup', 'bought', undefined, true);
  const third = C.addToGarage('muscle', 'bought', undefined, true);
  // a dealer won't sell you a car you have nowhere to put
  const lot = g.dealers.state('used'); const c = lot.cars.find(Boolean);
  const dealer = c ? g.dealers.cantBuy('used', c) : 'no stock';
  window.__A = a.uid; window.__B = b2.uid;
  return { cap, free0, a: !!a, b: !!b2, third, freeNow: R.freeBays(), fleet: s.garage.length, dealer, homes: [a.at, b2.at] };
});
check('every owned car takes a real space; with the spaces full a new one has nowhere to go (no storage)', slots.cap === 2 && slots.free0 === 2 && slots.a && slots.b && slots.third === null && slots.freeNow === 0 && slots.fleet === 2, JSON.stringify(slots));
check('…and a dealer won’t sell you one', /No free parking/.test(slots.dealer), JSON.stringify(slots));
// take one out: its space stays its own
const outA = await ev(() => {
  const g = window.game, s = g.save, R = g.vreg, e = s.garage.find(x => x.uid === window.__A), bay = R.bayPos(e);
  g.resetPlayerState(bay.x + 4, bay.z + 4, 0); window.__tick(2);
  const v = R.live(e); g.completeEnter(v);
  v.pos.x += 30; v.pos.z += 0; v.syncMesh(0); window.__tick(2);
  g.exitVehicle(true); window.__tick(1);
  const pc = g.vehicles.spawn('coupe', bay.x, bay.z, bay.h, { parked: true });
  const offer = g.uw.props.nearFreeBay(bay.x, bay.z, bay.y ?? 0);
  const store = g.content.storeVehicle(pc, { id: e.at.p, def: window.__pv.PROP_BY_ID[e.at.p], bay });
  g.vehicles.despawn(pc);
  return { out: e.out, loc: !!e.loc, reserved: g.uw.props.carAt(e.at.p, e.at.i) === e, offer: !!offer, store, free: R.freeBays(), fleet: s.garage.length };
});
check('a car out on the street keeps its space: nothing else can be parked, bought or kept into it', outA.out && outA.loc && outA.reserved && !outA.offer && outA.store === false && outA.free === 0 && outA.fleet === 2, JSON.stringify(outA));
// a gift with nowhere to go waits with the giver, then is collected into a free space
const gift = await ev(() => {
  const g = window.game, R = g.vreg, s = g.save;
  const e = R.give('offroad', 'reward', 0xa0381e, 'Tull');
  const waiting = (s.pendingCars || []).length, fleet = s.garage.length, early = R.collect(0);
  return { given: e, waiting, fleet, early };
});
check('a car given to you with nowhere to park waits with the giver (not in your fleet) and can’t be collected without a space', gift.given === null && gift.waiting === 1 && gift.fleet === 2 && /No free parking/.test(gift.early), JSON.stringify(gift));

// ---------------------------------------------------------------- 2. street parking is saved, nothing tows it home
const park = await ev(() => {
  const g = window.game, s = g.save, R = g.vreg, e = s.garage.find(x => x.uid === window.__A), v = R.live(e);
  const at = { x: Math.round(v.pos.x), z: Math.round(v.pos.z) };
  window.__far(); window.__tick(2);
  return { at, live: window.__liveOf(e.uid), out: e.out, loc: e.loc && { x: Math.round(e.loc.x), z: Math.round(e.loc.z) }, home: R.bayPos(e) && { x: Math.round(R.bayPos(e).x), z: Math.round(R.bayPos(e).z) } };
});
check('leave it on the street and go far away: it leaves the world but stays parked there (not towed home)', park.live === 0 && park.out && park.loc.x === park.at.x && park.loc.z === park.at.z && (park.home.x !== park.at.x || park.home.z !== park.at.z), JSON.stringify(park));
await save();
await reload();
const park2 = await ev(() => {
  const g = window.game, s = g.save, R = g.vreg, e = s.garage.find(x => x.uid === window.__A);
  const before = { out: e.out, loc: e.loc && { x: Math.round(e.loc.x), z: Math.round(e.loc.z) } };
  g.resetPlayerState(e.loc.x + 12, e.loc.z + 12, 0); window.__tick(2);
  const v = R.live(e);
  return { before, live: window.__liveOf(e.uid), at: v && { x: Math.round(v.pos.x), z: Math.round(v.pos.z) }, reserved: g.uw.props.carAt(e.at.p, e.at.i) === e, fleet: s.garage.length };
});
check('save → reload: it is still parked on that street; come back and it stands exactly there, once, its space still kept', park2.before.out && park2.live === 1 && Math.abs(park2.at.x - park2.before.loc.x) <= 1 && Math.abs(park2.at.z - park2.before.loc.z) <= 1 && park2.reserved && park2.fleet === 2, JSON.stringify(park2));

// ---------------------------------------------------------------- 3. stolen cars and their cargo persist
const steal = await ev(() => {
  const g = window.game, uw = g.uw, R = g.vreg, P = window.__pv;
  const x = g.player.pos.x + 40, z = g.player.pos.z;
  const v = g.vehicles.spawn('van', x, z, 0, { parked: true }); v.looted = true;
  g.resetPlayerState(x + 3, z, 0); g.completeEnter(v); window.__tick(1);
  const r = R.rec(v.trackId);
  // your cargo and some cash in the back
  P.Inv.add(v.trunk, 'green', 30, 900); g.money.W.dirty.me += 500;
  const L = uw.locations().find(l => l.o === v.trunk), M = uw.locations().find(l => l.key === 'inv');
  const moved = L && M ? g.money.move(M, L, 500) : 0;
  g.exitVehicle(true); window.__tick(1);
  window.__T = r && r.id;
  return { tracked: !!r, hot: r && r.hot, same: r && r.trunk === v.trunk, n: window.__u(r && r.trunk), cash: g.money.carCash(v), moved };
});
check('a stolen car you drive is kept track of (HOT), its trunk is the record’s own', steal.tracked && steal.hot && steal.same && steal.n === 30, JSON.stringify(steal));
check('…and cash you leave in it is kept with it in the wallet', steal.cash === 500, JSON.stringify(steal));
// a hijacked van with your load: the Session 4B gap closed
const jack = await ev(() => {
  const g = window.game, uw = g.uw, R = g.vreg, P = window.__pv;
  const x = g.player.pos.x + 60, z = g.player.pos.z + 20;
  const van = g.vehicles.spawn('van', x, z, 0, { driver: 'npc' }); van.fac = 'vipers'; van.trunk = { snow: 25 }; van.mission = null;
  g.resetPlayerState(x + 3, z, 0); g.completeEnter(van); window.__tick(1);
  g.exitVehicle(true); window.__tick(1);
  window.__J = van.trackId;
  const r = R.rec(van.trackId);
  return { tracked: !!r, origin: r && r.origin, n: r && window.__u(r.trunk) };
});
check('a van you hijack with a load in it is kept with its load', jack.tracked && jack.origin === 'hijack' && jack.n === 25, JSON.stringify(jack));
await ev(() => window.__far());
await save();
await reload();
const steal2 = await ev(() => {
  const g = window.game, R = g.vreg, r = R.rec(window.__T), j = R.rec(window.__J);
  const before = { n: r && window.__u(r.trunk), jn: j && window.__u(j.trunk), cash: g.money.dirtyInCar('t' + window.__T) };
  g.resetPlayerState(r.x + 10, r.z + 10, 0); window.__tick(2);
  const v = g.vehicles.list.find(q => q.trackId === r.id);
  return { before, live: window.__liveT(r.id), trunk: v && window.__u(v.trunk), same: v && v.trunk === r.trunk, cash: v && g.money.carCash(v), hot: r.hot, count: R.tracked.length };
});
check('save → reload: the stolen car and the hijacked van come back with exactly their cargo and cash, once each', steal2.before.n === 30 && steal2.before.jn === 25 && steal2.before.cash === 500 && steal2.live === 1 && steal2.trunk === 30 && steal2.same && steal2.cash === 500 && steal2.hot, JSON.stringify(steal2));
// a day unattended: police recover it, explicitly
const recov = await ev(() => {
  const g = window.game, uw = g.uw, R = g.vreg, r = R.rec(window.__T);
  window.__far(); window.__tick(1);
  r.seen = uw.S.econH - 25; window.__tick(1);
  const L = g.save.vlog.filter(x => x.what === 'recovered by police');
  return { gone: !R.rec(window.__T), log: L.length && L[L.length - 1], cash: g.money.dirtyInCar('t' + window.__T) };
});
check('left unattended for a day (economic clock), police recover it: a logged event with what was seized, never a silent loss', recov.gone && recov.log && recov.log.n === 30 && /Green/.test(recov.log.cargo) && recov.log.cash === 500 && recov.cash === 0, JSON.stringify(recov));
const bound = await ev(() => {
  const g = window.game, R = g.vreg, VREG = window.__pv.VREG;
  const ids = [];
  for (let k = 0; k < VREG.max + 2; k++) {
    const v = g.vehicles.spawn('sedan', g.player.pos.x + 30 + k * 6, g.player.pos.z + 30, 0, { parked: true }); v.looted = true;
    if (k < 2) v.trunk = { smokes: 3 };
    R.track(v); ids.push(v.trackId); g.vehicles.despawn(v);
  }
  const lefts = g.save.vlog.filter(x => x.what === 'left behind').length;
  return { n: R.tracked.length, max: VREG.max, cargoKept: R.tracked.filter(r => window.__u(r.trunk) > 0).length, lefts };
});
check('the registry is bounded: when full, a car with nothing of yours in it gives way first; cargo is never just dropped', bound.n === bound.max && bound.cargoKept >= 2 && bound.lefts >= 1, JSON.stringify(bound));

// ---------------------------------------------------------------- 4. into the fleet, and to the chop shop
const own = await ev(() => {
  const g = window.game, R = g.vreg, s = g.save, C = g.content, PM = g.uw.props;
  // make a space: sell car B
  const eb = s.garage.find(x => x.uid === window.__B); s.garage.splice(s.garage.indexOf(eb), 1); for (const v of g.vehicles.list.slice()) if (v.garageUid === eb.uid) g.vehicles.despawn(v); R.cars.delete(eb.uid);
  const bay = PM.bays(window.__pv.PROP_BY_ID.docklock).find(b => !PM.carAt('docklock', b.i));
  const v = g.vehicles.spawn('estate', bay.x + 2, bay.z, bay.h, { parked: true }); v.looted = true;
  g.resetPlayerState(bay.x + 4, bay.z, 0); g.completeEnter(v); window.__tick(1);
  const id = v.trackId; window.__pv.Inv.add(v.trunk, 'pills', 6, 0); g.money.W.dirty.me += 80;
  const L = g.uw.locations().find(l => l.o === v.trunk), M = g.uw.locations().find(l => l.key === 'inv'); g.money.move(M, L, 80);
  const ok = C.storeVehicle(v, { id: 'docklock', def: window.__pv.PROP_BY_ID.docklock, bay });
  const e = s.garage.find(x => x.uid === v.garageUid);
  return { ok, wasTracked: !!id, still: !!R.rec(id), owned: !!e, trunk: e && window.__u(e.trunk), cash: e && g.money.dirtyInCar(e.uid), oldKey: g.money.dirtyInCar('t' + id), fleet: s.garage.length };
});
check('park a stolen car into a free space and it joins your fleet: one record, its trunk and cash moved with it', own.ok && own.wasTracked && !own.still && own.owned && own.trunk === 6 && own.cash === 80 && own.oldKey === 0 && own.fleet === 2, JSON.stringify(own));
const chop = await ev(() => {
  const g = window.game, R = g.vreg, uw = g.uw;
  const v = g.vehicles.spawn('sedan', g.player.pos.x + 20, g.player.pos.z, 0, { parked: true }); v.looted = true;
  g.resetPlayerState(v.pos.x + 3, v.pos.z, 0); g.completeEnter(v); window.__tick(1);
  const id = v.trackId; uw.sellCar(v, true);
  return { id, still: !!R.rec(id), log: g.save.vlog.some(x => x.what === 'sold to the chop shop') };
});
check('sold to the chop shop: it leaves the registry (logged)', chop.id && !chop.still && chop.log, JSON.stringify(chop));

// ---------------------------------------------------------------- 5. wrecks come home; rare cars survive
const wreck = await ev(() => {
  const g = window.game, R = g.vreg, s = g.save, e = s.garage.find(x => x.uid === window.__A);
  g.resetPlayerState(e.loc.x + 10, e.loc.z + 10, 0); window.__tick(2);
  const v = R.live(e); window.__pv.Inv.add(e.trunk, 'smokes', 4, 0);
  g.fx.explodeVehicle(v); window.__tick(1);
  const hulk = g.vehicles.list.includes(v) ? { uid: v.garageUid, owned: v.owned } : null;
  return { dmg: e.dmg, out: e.out, loc: e.loc, home: g.uw.props.carAt(e.at.p, e.at.i) === e, cargo: window.__u(e.trunk), hulk, log: s.vlog.some(x => x.what === 'wrecked, towed home'), fleet: s.garage.length };
});
check('a burned owned car is not lost: towed home to its space as a wreck that needs a repair (the hulk is no longer it)', wreck.dmg === 100 && !wreck.out && !wreck.loc && wreck.home && wreck.cargo === 0 && wreck.log && wreck.fleet === 2 && (!wreck.hulk || (wreck.hulk.uid === 0 && !wreck.hulk.owned)), JSON.stringify(wreck));
const rare = await ev(() => {
  const g = window.game, R = g.vreg, s = g.save, C = g.content;
  // a rare car of yours, wrecked (not burned) and left out on the street
  const e = s.garage.find(x => x.uid !== window.__A); e.vtier = 'rare';
  const b0 = R.bayPos(e); g.resetPlayerState(b0.x + 3, b0.z + 3, 0); window.__tick(2);
  const v = R.live(e); g.completeEnter(v); v.pos.x += 40; v.syncMesh(0); window.__tick(1); g.exitVehicle(true);
  v.health = 0; window.__tick(1);
  window.__far(); window.__tick(2);
  return { uid: e.uid, dmg: e.dmg, out: e.out, home: g.uw.props.carAt(e.at.p, e.at.i) === e, log: s.vlog.some(x => x.what === 'towed home wrecked'), fleet: s.garage.length };
});
check('a rare car wrecked and left out is towed home by your people (a recovery, not a police matter); never lost', rare.dmg === 100 && !rare.out && rare.home && rare.log && rare.fleet === 2, JSON.stringify(rare));
await save();
await reload();
const after = await ev((uid) => {
  const g = window.game, s = g.save, R = g.vreg, e = s.garage.find(x => x.uid === uid), b0 = R.bayPos(e);
  g.resetPlayerState(b0.x + 3, b0.z + 3, 0); window.__tick(3);
  const dup = s.garage.map(x => window.__liveOf(x.uid));
  return { vtier: e.vtier, dmg: e.dmg, fleet: s.garage.length, dup, tracked: R.tracked.length, trackedLive: R.tracked.map(r => window.__liveT(r.id)) };
}, rare.uid);
check('save → reload: the rare wreck is still yours at home; no car exists twice', after.vtier === 'rare' && after.dmg === 100 && after.fleet === 2 && after.dup.every(n => n <= 1) && after.trackedLive.every(n => n <= 1), JSON.stringify(after));

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await finish(b, 'vehicle');
