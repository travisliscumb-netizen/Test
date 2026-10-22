/* HOT cars, dealers, the Chop Shop, Pay & Spray and the police impound (Session 5B: §13, §14, §39 scenarios 8, 10,
   11 and 13, §45.30).
   - Dealer theft: about 1★ / 3★ / 5★ by lot, the car HOT from then on; HOT survives escape, parking and reloads.
   - Police recognise a HOT car only when a cop can see it close by (about 1★); nobody knows citywide.
   - Pay & Spray loses a pursuit but never cleans HOT, never makes a car yours and never adds a space.
   - The Chop Shop refuses work with the police on you; cleaning clears HOT exactly once and needs a real free space.
   - The impound lot: a car seized at an arrest keeps its ownership there while the arrest still confiscates its
     contraband; abandoned (a day of the economic clock) or recovered in a chase, it goes there too; rare ones are
     never lost. Released at the window for a fee by value (Clean Bank), or taken back by picking or ramming the
     gate (2–3★) and driving it out, which leaves it HOT. Every case survives a reload and nothing is duplicated.
   - A full registry of stolen cars that all hold your things never drops one: the new car is used but not kept,
     and you are warned. */
import { launch, open, check, startNew, finish, frames } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const helpers = first => ev(first => {
  const g = window.game, uw = g.uw;
  g.events.cool = 1e9; g.debug.god = true; g.police.enabled = true; if (first) g.env.time = 13;
  window.__tick = (n = 1) => { for (let k = 0; k < n; k++) { g.vreg.t = 0; g.vreg.update(0.5); g.impound.update(0.5); } };
  window.__u = o => Object.keys(o || {}).reduce((a, k) => a + (window.__pv.GOODS[k] ? o[k] * window.__pv.GOODS[k].size : 0), 0);
  window.__calm = () => { g.police.clear(); g.police.units.length = 0; for (const c of g.police.cops.slice()) { const i = g.peds.peds.indexOf(c); if (i >= 0) g.peds.peds.splice(i, 1); } g.police.cops.length = 0; g.hotwatch.cool = 0; };
  window.__walk = (x, z) => { if (g.player.state === 'vehicle') g.exitVehicle(true); g.resetPlayerState(x, z, 0); };
  window.__far = () => window.__walk(900, 120);
}, first);
await helpers(true);
const ids = {};
const keep = () => ev(() => window.__ids || {}).then(o => Object.assign(ids, o));
const reload = async () => {
  await keep();
  await ev(() => { const g = window.game; g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); if (g.player.state === 'vehicle') g.exitVehicle(true); g.saveGame(true); });
  await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
  await ev(() => window.game.quality.setMode(0));
  await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
  await helpers();
  await ev(o => { window.__ids = o; }, ids);
};
await ev(() => { const g = window.game, uw = g.uw; g.money.W.clean = 1e8; g.money.W.dirty.me = 1e6; g.save.rep = 99999; uw.props.buy('qgarage'); window.__ids = {}; });

// ---------------------------------------------------------------- 1. dealer theft: the stars by lot, HOT for good
const theft = await ev(() => {
  const g = window.game, DL = g.dealers, out = {};
  for (const lot of ['used', 'new', 'lux']) {
    window.__calm();
    const st = DL.state(lot), i = st.cars.findIndex(Boolean); if (i < 0) { out[lot] = 'no stock'; continue; }
    const sl = DL.place(lot).slots[i]; window.__walk(sl.x + 3, sl.z + 3);
    const r = DL.steal(lot, i), v = g.player.vehicle;
    out[lot] = { r, level: g.police.level, hot: g.vreg.isHot(v), tracked: !!v.trackId, stall: st.cars[i] === null, lot: v && v.dealer === null };
    g.exitVehicle(true);
    if (lot === 'lux') window.__ids.LUX = v.trackId;
  }
  window.__calm();
  return out;
});
check('stealing off a lot: about 1★ at the cash lot, 3★ at Meridian, 5★ at the showroom; the stall is empty and the car is HOT', theft.used.level === 1 && theft.new.level === 3 && theft.lux.level === 5 && ['used', 'new', 'lux'].every(l => theft[l].hot && theft[l].tracked && theft[l].stall), JSON.stringify(theft));
const esc = await ev(() => { const g = window.game, r = g.vreg.rec(window.__ids.LUX); g.police.setLevel(2); g.police.clear('lost them'); return { hot: r && r.hot, level: g.police.level }; });
check('losing the police leaves it HOT', esc.hot && esc.level === 0, JSON.stringify(esc));

// ---------------------------------------------------------------- 2. police recognise it only when they can see it
const recog = await ev(() => {
  const g = window.game, P = g.police, R = g.vreg, r = R.rec(window.__ids.LUX), out = {};
  window.__calm(); window.__walk(r.x + 3, r.z); window.__tick(2);
  const v = g.vehicles.list.find(q => q.trackId === r.id); g.completeEnter(v); window.__calm();
  const R0 = Math.random; Math.random = () => 0;
  // nobody looking: drive around as long as you like
  for (let k = 0; k < 20; k++) g.hotwatch.update(0.5);
  out.alone = P.level;
  // a cop on the pavement beside you runs the plates
  const c = P.spawnCop(v.pos.x + 6, v.pos.z + 2); for (let k = 0; k < 4; k++) g.hotwatch.update(0.5);
  out.seen = P.level;
  window.__calm();
  // a cop far off (and out of sight) can't
  P.spawnCop(v.pos.x + 200, v.pos.z + 200); for (let k = 0; k < 6; k++) g.hotwatch.update(0.5);
  out.far = P.level;
  window.__calm();
  // the same cop beside a car that isn't HOT: nothing
  g.exitVehicle(true);
  const clean = g.vehicles.spawn('sedan', v.pos.x + 12, v.pos.z, 0, { parked: true }); clean.legit = true; clean.origin = 'found';
  window.__walk(clean.pos.x + 3, clean.pos.z); g.completeEnter(clean); window.__calm();
  P.spawnCop(clean.pos.x + 6, clean.pos.z + 2); for (let k = 0; k < 6; k++) g.hotwatch.update(0.5);
  out.notHot = P.level; out.cleanHot = R.isHot(clean);
  Math.random = R0; window.__calm(); g.exitVehicle(true); g.vreg.forget(clean); g.vehicles.despawn(clean);
  return out;
});
check('a HOT car is recognised by a cop who can see it close by (about 1★); alone, or far from any cop, nothing happens; a car that isn’t HOT draws nothing', recog.alone === 0 && recog.seen === 1 && recog.far === 0 && recog.notHot === 0 && !recog.cleanHot, JSON.stringify(recog));

// ---------------------------------------------------------------- 3. parking keeps it HOT; it survives reloads
const park = await ev(() => {
  const g = window.game, R = g.vreg, s = g.save, PM = g.uw.props, P = window.__pv;
  const r = R.rec(window.__ids.LUX); window.__walk(r.x + 3, r.z); window.__tick(2);
  const v = g.vehicles.list.find(q => q.trackId === r.id);
  const def = P.PROP_BY_ID.qgarage, bay = PM.freeBay(def);
  const ok = g.content.storeVehicle(v, { id: 'qgarage', def, bay });
  const e = s.garage.find(x => x.uid === v.garageUid);
  window.__ids.LUXE = e && e.uid;
  return { ok, hot: e && e.hot, isHot: R.isHot(v), tracked: !!R.rec(window.__ids.LUX) };
});
check('parking a HOT car in your own space doesn’t clean it: it is still HOT in your garage', park.ok && park.hot && park.isHot && !park.tracked, JSON.stringify(park));
await reload();
const park2 = await ev(() => { const g = window.game, e = g.save.garage.find(x => x.uid === window.__ids.LUXE); return { hot: e && e.hot }; });
check('save → reload: still HOT', park2.hot === true, JSON.stringify(park2));

// ---------------------------------------------------------------- 4. Pay & Spray: loses them, never cleans HOT, never makes it yours
const pns = await ev(() => {
  const g = window.game, R = g.vreg, s = g.save, C2 = g.content, bay = g.world.places.motorworks.bay;
  window.__calm();
  // a stolen car (tracked, not yours) into Dex's bay with the police after you, unseen
  const v = g.vehicles.spawn('coupe', bay.x, bay.z, 0, { parked: true }); v.looted = true;
  window.__walk(bay.x + 3, bay.z); g.completeEnter(v); window.__tick(1);
  v.health = 60; g.police.setLevel(2); g.police.visible = false;
  const fleet0 = s.garage.length, cap0 = C2.garageCap;
  C2.openService(); C2._svcAct('pns');
  const out = { level: g.police.level, hot: R.isHot(v), tracked: !!v.trackId, owned: !!v.garageUid, fleet: s.garage.length - fleet0, cap: C2.garageCap - cap0, hp: Math.round(v.health) };
  g.ui.closeAll(); window.__ids.PNS = v.trackId;
  return out;
});
check('Pay & Spray loses the pursuit and fixes the car, but it stays HOT, stays not yours and adds no space', pns.level === 0 && pns.hot && pns.tracked && !pns.owned && pns.fleet === 0 && pns.cap === 0 && pns.hp === 100, JSON.stringify(pns));

// ---------------------------------------------------------------- 5. the Chop Shop: no work under pursuit, clean exactly once, needs a space
const chop = await ev(() => {
  const g = window.game, R = g.vreg, s = g.save, C2 = g.content, CH = g.chop, PM = g.uw.props, P = window.__pv;
  const v = g.player.vehicle, out = {};
  g.police.setLevel(1); out.under = CH.cleanBlock(v); window.__calm();
  // fill every space (the capacity rule)
  const fill = []; while (R.freeBays() > 0) { const e = C2.addToGarage('compact', 'bought', undefined, true); if (!e) break; fill.push(e.uid); }
  out.noSpace = CH.cleanBlock(v);
  // free one space: now it can be cleaned
  const u = fill.pop(); s.garage.splice(s.garage.findIndex(x => x.uid === u), 1);
  const fleet0 = s.garage.length, cash0 = g.money.W.dirty.me, price = CH.cleanPrice(v);
  out.cleaned = CH.clean(v);
  const e = s.garage.find(x => x.uid === v.garageUid);
  out.after = { hot: R.isHot(v), owned: !!e, tracked: !!R.rec(window.__ids.PNS), fleet: s.garage.length - fleet0, paid: Math.round(cash0 - g.money.W.dirty.me) === price, cleaned: e && e.cleaned, origin: e && e.origin };
  out.again = CH.clean(v);
  out.full = R.freeBays();
  for (const x of fill) { const i = s.garage.findIndex(q => q.uid === x); if (i >= 0) s.garage.splice(i, 1); }
  window.__ids.CLEAN = e && e.uid;
  g.exitVehicle(true);
  return out;
});
check('the Chop Shop won’t work with the police on you', /police/.test(chop.under), JSON.stringify(chop));
check('cleaning needs a real free space (no bypassing the fleet’s size)', /No free parking/.test(chop.noSpace), JSON.stringify(chop));
check('cleaned: HOT gone, a legal car of yours in a space of its own (paid in cash), and only once', chop.cleaned === '' && !chop.after.hot && chop.after.owned && !chop.after.tracked && chop.after.fleet === 1 && chop.after.paid && chop.after.cleaned && chop.after.origin === 'stolen' && /Already clean/.test(chop.again), JSON.stringify(chop));
const sale = await ev(() => {
  const g = window.game, R = g.vreg, uw = g.uw;
  window.__calm();
  const v = g.vehicles.spawn('sedan', g.player.pos.x + 20, g.player.pos.z, 0, { parked: true }); v.looted = true;
  window.__walk(v.pos.x + 3, v.pos.z); g.completeEnter(v); window.__tick(1); window.__calm();
  const d0 = g.money.W.dirty.me, c0 = g.money.W.clean, pay = uw.chopValue(v);
  uw.sellCar(v, true);
  return { dirty: Math.round(g.money.W.dirty.me - d0), clean: Math.round(g.money.W.clean - c0), pay };
});
check('a stolen car sold to the chop shop pays Dirty Cash', sale.dirty === sale.pay && sale.clean === 0 && sale.pay > 0, JSON.stringify(sale));

// ---------------------------------------------------------------- 6. arrest: the car to the impound, the contraband to the police
const arrest = await ev(() => {
  const g = window.game, R = g.vreg, s = g.save, uw = g.uw, P = window.__pv;
  window.__calm();
  const e = s.garage.find(x => x.uid === window.__ids.CLEAN); e.vtier = 'rare';
  const w = R.where(e); window.__walk(w.x + 3, w.z + 3); window.__tick(2);
  const v = R.live(e); g.completeEnter(v);
  P.Inv.add(v.trunk, 'snow', 20, 0); g.money.W.dirty.veh[e.uid] = 777;
  g.player.state = 'busted';
  uw.prison.pending = { ch: uw.prison.charges(), veh: v }; uw.prison.arrest();
  return { imp: e.imp && { why: e.imp.why, fee: e.imp.fee, paid: e.imp.paid }, owned: s.garage.includes(e), trunk: window.__u(e.trunk), cash: g.money.dirtyInCar(e.uid), jail: !!uw.S.jail };
});
check('arrested in your car: the car goes to the impound, still yours; its contraband and cash are confiscated (impound keeps nothing the police took)', arrest.jail && arrest.owned && arrest.imp && arrest.imp.why === 'arrest' && arrest.imp.fee > 0 && !arrest.imp.paid && arrest.trunk === 0 && arrest.cash === 0, JSON.stringify(arrest));
await ev(() => { const g = window.game, uw = g.uw; uw.prison.release('served'); window.__calm(); });
await reload();
const imp2 = await ev(() => { const g = window.game, e = g.save.garage.find(x => x.uid === window.__ids.CLEAN); return { imp: e && e.imp && { why: e.imp.why, fee: e.imp.fee, paid: e.imp.paid }, trunk: window.__u(e && e.trunk), cash: g.money.dirtyInCar(e && e.uid), vtier: e && e.vtier }; });
check('save → reload: still impounded with the same fee, the confiscation stands, the rare car is still yours', imp2.imp && imp2.imp.why === 'arrest' && imp2.imp.fee === arrest.imp.fee && !imp2.imp.paid && imp2.trunk === 0 && imp2.cash === 0 && imp2.vtier === 'rare', JSON.stringify({ arrest, imp2 }));

// ---------------------------------------------------------------- 7. legal retrieval: pay at the window, drive it out (once)
const legal = await ev(() => {
  const g = window.game, s = g.save, I = g.impound, CS = g.uw.compounds, e = s.garage.find(x => x.uid === window.__ids.CLEAN), C = I.C, G = C.gate;
  window.__calm();
  window.__walk(G.x - G.n[0] * 3, G.z - G.n[1] * 3); window.__tick(2);
  const v0 = g.vreg.live(e);
  const whyUnpaid = v0 && (g.completeEnter(v0), CS.why('impound', v0));
  g.exitVehicle(true); window.__walk(G.x - G.n[0] * 3, G.z - G.n[1] * 3);
  const act = g.uw.findAction(); const label = act && act.label;
  const c0 = g.money.W.clean, fee = e.imp.fee;
  I.openOffice(); g.content._svcAct('pay:' + e.uid); g.ui.closeAll();
  const paid = Math.round(c0 - g.money.W.clean) === fee && e.imp.paid;
  const v = g.vreg.live(e); g.completeEnter(v);
  const whyPaid = CS.why('impound', v);
  // drive it out through the gate onto the street
  v.pos.x = G.x - G.n[0] * 16; v.pos.z = G.z - G.n[1] * 16; v.syncMesh(0); window.__tick(1);
  g.exitVehicle(true);
  const live = g.vehicles.list.filter(q => q.garageUid === e.uid).length;
  return { label, whyUnpaid, paid, whyPaid, imp: e.imp, out: e.out, hot: e.hot, live, fleet: s.garage.filter(x => x.uid === e.uid).length, level: g.police.level };
});
check('legal retrieval: the window takes the fee from the bank, the gate opens only for the released car, and driving it out is the retrieval (one car, not HOT, no stars)', /Impound window/.test(legal.label) && legal.whyUnpaid === 'not released' && legal.paid && legal.whyPaid === '' && legal.imp === null && legal.out && !legal.hot && legal.live === 1 && legal.fleet === 1 && legal.level === 0, JSON.stringify(legal));

// ---------------------------------------------------------------- 8. abandoned for a day: impounded; taken back unpaid: stars and HOT
const aband = await ev(() => {
  const g = window.game, s = g.save, uw = g.uw, e = s.garage.find(x => x.uid === window.__ids.CLEAN);
  window.__calm(); window.__far(); window.__tick(2);
  e.seen = uw.S.econH - 25; window.__tick(2);
  return { imp: e.imp && e.imp.why, live: g.vehicles.list.filter(q => q.garageUid === e.uid).length, owned: s.garage.includes(e) };
});
check('left on the street for a day (economic clock): police tow it to the impound; it is still yours (rare cars included)', aband.imp === 'abandoned' && aband.owned && aband.live === 0, JSON.stringify(aband));
await reload();
const pick = await ev(() => {
  const g = window.game, s = g.save, I = g.impound, CS = g.uw.compounds, e = s.garage.find(x => x.uid === window.__ids.CLEAN), C = I.C, G = C.gate;
  window.__calm();
  const before = { imp: e.imp && e.imp.why, fee: e.imp && e.imp.fee };
  window.__walk(G.x - G.n[0] * 2.5, G.z - G.n[1] * 2.5); window.__tick(2);
  I.pick = { t: 0 }; I.update(window.__pv.IMPOUND.pick + 0.5);
  const forced = CS.R.impound.forceT > g.time, lvl = g.police.level;
  // into the yard, into the car, out through the open gate
  const v = g.vreg.live(e); window.__walk(v.pos.x + 2, v.pos.z); g.completeEnter(v);
  v.pos.x = G.x - G.n[0] * 16; v.pos.z = G.z - G.n[1] * 16; v.syncMesh(0); window.__tick(1);
  const out = { before, forced, lvl, after: g.police.level, imp: e.imp, hot: e.hot, live: g.vehicles.list.filter(q => q.garageUid === e.uid).length, fleet: s.garage.filter(x => x.uid === e.uid).length, log: s.vlog.some(x => x.what === 'taken back from the impound') };
  g.exitVehicle(true); window.__calm();
  return out;
});
check('save → reload: still impounded; picking the gate lock opens it and trips the alarm (2★); driving it out unpaid is taking it back: one car, HOT now', pick.before.imp === 'abandoned' && pick.forced && pick.lvl >= 2 && pick.after >= 2 && pick.imp === null && pick.hot && pick.live === 1 && pick.fleet === 1 && pick.log, JSON.stringify(pick));
const ram = await ev(() => {
  const g = window.game, s = g.save, I = g.impound, CS = g.uw.compounds, e = s.garage.find(x => x.uid === window.__ids.CLEAN);
  window.__calm();
  I.seize(e, 'pursuit');
  const R = CS.R.impound, G = I.C.gate;
  const v = g.vehicles.spawn('pickup', G.x - G.n[0] * 8, G.z - G.n[1] * 8, 0, { parked: true }); v.looted = true;
  window.__walk(v.pos.x + 2, v.pos.z); g.completeEnter(v);
  CS.build('impound', true);
  CS.ram('impound', R.gate, 99, v);
  const out = { level: g.police.level, gate: R.gate.state };
  g.exitVehicle(true); g.vreg.forget(v); g.vehicles.despawn(v); window.__calm();
  return out;
});
check('ramming the impound gate brings about 3★', ram.level >= 3 && ram.gate === 'broken', JSON.stringify(ram));
const chase = await ev(() => {
  const g = window.game, s = g.save, C2 = g.content, e = C2.addToGarage('sedan', 'bought', undefined, true), R = g.vreg;
  window.__calm();
  const b = R.bayPos(e); window.__walk(b.x + 3, b.z + 3); window.__tick(2);
  const v = R.live(e); g.completeEnter(v); v.pos.x += 30; v.syncMesh(0); window.__tick(1); g.exitVehicle(true);
  g.police.setLevel(2);
  g.police.spawnCop(v.pos.x + 5, v.pos.z + 2);
  window.__walk(v.pos.x + 80, v.pos.z); window.__tick(2);
  const out = { imp: e.imp && e.imp.why };
  window.__calm();
  return out;
});
check('an owned car left behind in a chase, in sight of a cop, is recovered to the impound', chase.imp === 'pursuit', JSON.stringify(chase));

// ---------------------------------------------------------------- 9. a full registry of your things never loses any of them
const full = await ev(() => {
  const g = window.game, R = g.vreg, VREG = window.__pv.VREG, P = window.__pv;
  window.__calm();
  for (const r of R.tracked.slice()) R.release(r);
  const kept = [];
  for (let k = 0; k < VREG.max; k++) { const v = g.vehicles.spawn('sedan', 100 + k * 7, 300, 0, { parked: true }); v.looted = true; v.trunk = { smokes: 2 }; R.track(v); kept.push(v.trackId); g.vehicles.despawn(v); }
  const before = R.tracked.map(r => r.id + ':' + window.__u(r.trunk)).join(',');
  const toasts0 = document.querySelectorAll('#toasts > *').length;
  const v = g.vehicles.spawn('van', 200, 340, 0, { parked: true }); v.looted = true;
  window.__walk(203, 340); g.completeEnter(v); window.__tick(1);
  const tracked = !!v.trackId, untracked = !!v.untracked;
  v.trunk = v.trunk || {}; P.Inv.add(v.trunk, 'green', 5, 0);
  g.exitVehicle(true); window.__tick(1);
  const after = R.tracked.map(r => r.id + ':' + window.__u(r.trunk)).join(',');
  const warned = !!v.warned;
  return { n: R.tracked.length, same: before === after, tracked, untracked, warned };
});
check('full registry, every car holding your things: none is dropped; the new car is used but not kept, and you are warned when you leave your goods in it', full.n === 8 && full.same && !full.tracked && full.untracked && full.warned, JSON.stringify(full));
await reload();
const full2 = await ev(() => { const g = window.game, R = g.vreg; return { n: R.tracked.length, cargo: R.tracked.every(r => window.__u(r.trunk) === 2), hotFleet: g.save.garage.filter(e => e.hot).length }; });
check('save → reload: all eight still there with their goods; HOT cars still HOT', full2.n === 8 && full2.cargo && full2.hotFleet >= 1, JSON.stringify(full2));

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await finish(b, 'hot');
