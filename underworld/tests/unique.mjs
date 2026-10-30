/* The ten one-offs (Session 6D): permanent unique hidden cars.
   - All ten exist, each its own model with a unique id, its own body, finish and handling (no reskins), valued and
     carried like the one-off it is, and never in traffic, on a parked stall, on a dealer's lot, in a race field or
     staked by a rival.
   - Staged discovery: each has a clue (and, for a car that stands somewhere, a search area on the map before the
     exact marker); clues and stages persist and never reset.
   - Acquisition: by finding it (it needs a free parking space; it can't be taken twice), as a one-time reward (once,
     into a free space or waiting with the giver), by paid intel (charged once), or in Vance's pink slip.
   - Protection: it is a fleet entry like any other (parking capacity holds, it is saved where you left it, recovered
     from the impound and towed home as a wreck), it is never sold, chopped or staked, a reload never duplicates or
     respawns it, and a damaged save can never hold two of one or lose one silently. The stolen one is HOT until the
     Chop Shop cleans it. */
import { launch, open, check, startNew, finish, frames } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const helpers = first => ev(first => {
  const g = window.game;
  g.events.cool = 1e9; g.debug.god = true; if (first) g.env.time = 13;
  window.__calm = () => { g.police.clear(); g.police.units.length = 0; for (const c of g.police.cops.slice()) { const i = g.peds.peds.indexOf(c); if (i >= 0) g.peds.peds.splice(i, 1); } g.police.cops.length = 0; g.hotwatch.cool = 1e9; };
  window.__to = (x, z) => { if (g.player.state === 'vehicle') g.exitVehicle(true); g.resetPlayerState(x, z, 0); };
  window.__tick = (n = 3) => { for (let k = 0; k < n; k++) { g.uniques.t = 0; g.uniques.update(0.01); } };
  window.__copies = type => g.vehicles.list.filter(v => v.type === type).length;
  window.__U = id => ({ ...g.save.uniques[id] });
  window.__tull = () => g.missions.contacts.find(c => c.id === 'tull');
  window.__offer = () => { for (let k = 0; k < 20; k++) { const o = g.campaign.raceOffer(window.__tull()); if (o.pink && !o.race.offroad) return o; } return null; };
  window.__car = (type, x, z) => { const e = g.content.addToGarage(type, 'bought', undefined, true); e.prov = { dirty: 0, clean: Math.round(window.__pv.CAR_MSRP[type] * 0.8) }; if (g.player.state === 'vehicle') g.exitVehicle(true); const v = g.vreg.spawnFor(e, { x, z, h: 0, y: 0.15 }); v.display = false; e.out = true; e.loc = { x, z, h: 0, y: v.pos.y }; g.resetPlayerState(x + 2, z, 0); g.completeEnter(v); return e; };
}, first);
await helpers(true);
const reload = async () => {
  await ev(() => { const g = window.game; g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true); });
  await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
  await ev(() => window.game.quality.setMode(0));
  await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
  await helpers();
};
const race = async (place) => {
  const st = await ev(() => { const g = window.game, o = window.__offer(); if (!o) return { err: 'no offer' }; const v = g.player.vehicle; g.missions.start(o); const A = g.race.active; if (!A) return { err: 'not started: ' + (g.ui.lastToast || '') }; v.pos.x = A.R.start.x; v.pos.z = A.R.start.z; v.h = A.R.start.h; v.vel.set(0, 0); v.syncMesh(0); return {}; });
  if (st.err) return st;
  await page.waitForFunction(() => { const A = window.game.race.active; return A && (A.phase === 'count' || A.phase === 'run'); }, null, { timeout: 60000, polling: 50 });
  await ev(() => { window.game.race.active.count = 0.01; });
  await page.waitForFunction(() => window.game.race.active && window.game.race.active.phase === 'run', null, { timeout: 30000, polling: 50 });
  const opp = await ev(() => { const r = window.game.race.active.racers[0]; return r ? { type: r.v.type, locked: r.v.locked } : null; });
  await ev(place => { const g = window.game, A = g.race.active, v = g.player.vehicle, c = A.R.cps[A.R.cps.length - 1]; A.finished = place - 1; A.cp = A.R.cps.length - 1; v.pos.x = c.x; v.pos.z = c.z; v.vel.set(0, 0); v.syncMesh(0); }, place);
  await page.waitForFunction(() => !window.game.missions.active, null, { timeout: 30000, polling: 50 });
  await frames(page, 2);
  return { opp };
};

// ---------------------------------------------------------------- 1. ten models, each its own
const defs = await ev(() => {
  const P = window.__pv, V = P.VEHICLES, U = window.__pv.UNIQUE_CARS;
  return U.map(u => { const s = V[u.type]; return { id: u.id, type: u.type, kind: u.kind, how: u.how, name: s.name, unique: s.unique, tier: s.tier, profile: s.profile, l: s.l, w: s.w, h: s.h, wheelR: s.wheelR, mass: s.mass, power: s.power, vmax: s.vmax, grip: s.grip, brake: s.brake, steer: s.steer, soft: s.soft, drift: s.drift, armorK: s.armorK || 1, finish: s.finish, msrp: P.CAR_MSRP[u.type], cargo: P.CARGO_LB[u.type] }; });
});
check('ten one-offs are defined', defs.length === 10, String(defs.length));
check('each has a permanent unique id, its own model (type) and its own name', new Set(defs.map(d => d.id)).size === 10 && new Set(defs.map(d => d.type)).size === 10 && new Set(defs.map(d => d.name)).size === 10 && defs.every(d => d.unique === d.id && d.tier === 'unique'), JSON.stringify(defs.map(d => [d.id, d.type, d.name])));
check('the ten identities: classic, coupe, luxury, supercar, off-road, muscle, track, GT, vintage, ultimate', defs.map(d => d.kind).join() === 'Classic,Coupe,Luxury,Supercar,Off-road,Muscle,Track,GT,Vintage,Ultimate', defs.map(d => d.kind).join());
check('each has a body of its own (no two share a profile)', new Set(defs.map(d => d.profile)).size === 10, defs.map(d => d.profile).join());
// handling: no two have the same performance (a reskin would match on every number)
const perf = d => [d.mass, d.power, d.vmax, d.grip, d.brake, d.steer, d.soft, d.drift];
let close = [];
for (let i = 0; i < defs.length; i++) for (let j = i + 1; j < defs.length; j++) { const a = perf(defs[i]), c = perf(defs[j]), diff = a.filter((x, k) => Math.abs(x - c[k]) / Math.max(Math.abs(x), Math.abs(c[k]), 1e-6) > 0.04).length; if (diff < 4) close.push(defs[i].id + '/' + defs[j].id); }
check('each handles differently: every pair differs by more than 4% on at least four of mass, power, top speed, grip, brakes, steering, suspension, drift', close.length === 0, close.join());
const stock = await ev(() => { const P = window.__pv, V = P.VEHICLES; const near = []; for (const u of window.__pv.UNIQUE_CARS) { const s = V[u.type]; for (const k in V) { if (V[k].unique) continue; const o = V[k]; const same = ['mass', 'power', 'vmax', 'grip', 'brake', 'soft'].every(f => Math.abs(o[f] - s[f]) / Math.max(o[f], s[f]) < 0.02); if (same) near.push(u.id + '~' + k); } } return near; });
check('none is a stock model with new paint (no stock car within 2% on mass, power, top speed, grip, brakes and suspension)', stock.length === 0, stock.join());
check('a range from early/mid-game to the top: the ultimate is the fastest car on the island, the vintage tourer the slowest one-off', (() => { const top = Math.max(...defs.map(d => d.vmax)); return defs.find(d => d.id === 'aeterna').vmax === top && defs.find(d => d.id === 'tourer').vmax === Math.min(...defs.map(d => d.vmax)); })(), defs.map(d => d.id + ':' + d.vmax).join());
const fastest = await ev(() => { const V = window.__pv.VEHICLES; let m = 0; for (const k in V) if (!V[k].unique) m = Math.max(m, V[k].vmax); return m; });
check('the ultimate tops every ordinary car; the early/mid finds (Corsair, Baja, Tourer, Ambassador, Widowmaker) stay below the stock supercars', defs.find(d => d.id === 'aeterna').vmax > fastest && ['corsair', 'baja', 'tourer', 'ambassador', 'widow'].every(id => defs.find(d => d.id === id).vmax < 72), `stock top ${fastest}`);
check('each is valued and carries cargo like its kind (a value for fees and classes, a trunk)', defs.every(d => d.msrp > 20000 && d.cargo > 0), JSON.stringify(defs.map(d => [d.id, d.msrp, d.cargo])));
check('acquisition is a mix: cars to find, one-time rewards and a pink slip (not all simple pickups)', defs.filter(d => d.how === 'find').length === 7 && defs.filter(d => d.how === 'reward').length === 2 && defs.filter(d => d.how === 'pink').length === 1, defs.map(d => d.how).join());
const pools = await ev(() => {
  const P = window.__pv, uq = t => P.VEHICLES[t] && P.VEHICLES[t].unique, out = [];
  const D = P.DEALERSHIPS; for (const k in D) for (const t of [...(D[k].pool || []).map(x => x[0]), ...(D[k].line || []), ...(D[k].flagship || []), ...(D[k].core || []), ...(D[k].rare || [])]) if (uq(t)) out.push('dealer:' + t);
  for (const r of P.RACES) for (const t of r.cls) if (uq(t)) out.push('race:' + t);
  for (const r of [...P.VP_EVENTS, ...P.OR_EVENTS]) for (const t of r.cls) if (uq(t)) out.push('event:' + t);
  const g = window.game; for (let k = 0; k < 200; k++) { const r = g.pinks.rival({ type: 'sports', vtier: 'sport' }); if (uq(r.type)) out.push('pink:' + r.type); }
  for (const z in P.ZONES) for (const t in P.ZONES[z].traffic || {}) if (uq(t)) out.push('traffic:' + t);
  if (g.vehicles.list.some(v => uq(v.type))) out.push('in the world at the start');
  return out;
});
check('never on a dealer’s lot, in a race field, in an event, in traffic or staked by a rival; none in the world at the start', pools.length === 0, pools.join());
const looks = await ev(() => {
  const g = window.game, out = [];
  for (const u of window.__pv.UNIQUE_CARS) { const v = g.vehicles.spawn(u.type, 40, 40, 0, { parked: true, vtier: 'unique' }); const f = v.mat.userData.u.uFinish.value, F = window.__pv.VEHICLES[u.type].finish; out.push({ id: u.id, ok: Math.abs(f.x - F.flake) < 1e-6 && Math.abs(f.y - F.gloss) < 1e-6 && v.rim === F.rim, rim: v.rim, gloss: f.y, verts: v.vg.geo.attributes.position.count }); g.vehicles.despawn(v); }
  return out;
});
check('each wears its own finish and wheels (matte, satin or mirror paint; four rim styles between them)', looks.every(l => l.ok) && new Set(looks.map(l => l.rim)).size >= 4 && new Set(looks.map(l => l.gloss)).size >= 6, JSON.stringify(looks));
check('each has its own geometry (vertex counts and outlines differ)', new Set(looks.map(l => l.verts)).size >= 7, looks.map(l => l.verts).join());

// ---------------------------------------------------------------- 2. where they stand
const spots = await ev(() => {
  const g = window.game, U = g.uniques, P = window.__pv, out = [];
  for (const u of window.__pv.UNIQUE_CARS) { if (u.how !== 'find') continue; const sp = U.spotOf(u.id), a = U.areaOf(u.id); out.push({ id: u.id, sp: !!sp, clear: sp ? !P.kerbBlocked(g.world, sp.x, sp.z, P.groundY(sp.x, sp.z), sp.h) : false, inArea: sp && a ? Math.hypot(sp.x - a.x, sp.z - a.z) < a.r * 0.8 : false, offCentre: sp && a ? Math.hypot(sp.x - a.x, sp.z - a.z) > a.r * 0.3 : false, zone: sp ? (P.inCedarSouth(sp.x, sp.z) ? 'r' : P.zoneKey(sp.x, sp.z)) : null }); }
  return out;
});
check('every car that stands somewhere has a place: clear of buildings and walls, inside its search area but never at its centre', spots.every(s => s.sp && s.clear && s.inArea && s.offCentre), JSON.stringify(spots));
const Z = Object.fromEntries(spots.map(s => [s.id, s.zone]));
check('placed where it makes sense: Docklands (Corsair), Crestmoor Heights (Ambassador), Warehouse District (Prototype), Cedar Fields (Baja), Linden Hills (Riviera), Old Quarter shore (Tourer), Financial District at Valen Tower (Aeterna)', Z.corsair === 'h' && Z.ambassador === 'u' && Z.proto === 'w' && Z.baja === 'r' && Z.riviera === 'l' && Z.tourer === 'o' && Z.aeterna === 'c', JSON.stringify(Z));

// ---------------------------------------------------------------- 3. staged discovery: the Golden Corsair (fifteen packages)
const fresh = await ev(() => { const g = window.game; return { all0: window.__pv.UNIQUE_CARS.every(u => g.save.uniques[u.id].st === 0), map: g.uniques.mapEntries().length, live: g.uniques.live.size }; });
check('a new game: every one undiscovered, nothing on the map, nothing standing anywhere', fresh.all0 && fresh.map === 0 && fresh.live === 0, JSON.stringify(fresh));
const clue = await ev(() => {
  const g = window.game, s = g.save, msgs = s.messages.length;
  // fifteen packages, collected the ordinary way
  for (const pk of g.world.packages.slice(0, 15)) g.content.collectPackage(pk);
  window.__tick();
  const sp = g.uniques.spotOf('corsair'), me = g.uniques.mapEntries().find(e => e.key === 'uq:corsair');
  return { st: s.uniques.corsair.st, phone: s.messages.slice(msgs).some(m => /Docklands/.test(m.text)), entry: me && { icon: me.icon, d: Math.hypot(me.x - sp.x, me.z - sp.z), r: me.area && me.area.r }, areas: g.uniques.areas().length, live: g.uniques.live.size };
});
check('the clue: fifteen packages, a phone tip, a search area on the map (not the exact place); nothing appears while you are far away', clue.st === 1 && clue.phone && clue.entry && clue.entry.icon === '?' && clue.entry.d > 20 && clue.areas === 1 && clue.live === 0, JSON.stringify(clue));
await ev(() => { window.game.ui.mapView.buildIndex(); });
const bigmap = await ev(() => { const e = window.game.ui.mapView.entries.find(x => x.key === 'uq:corsair'); return e ? { icon: e.icon, cat: e.cat } : null; });
check('the big map lists the search area as a one-off lead', bigmap && bigmap.icon === '?' && bigmap.cat === 'unique', JSON.stringify(bigmap));
const exact = await ev(() => {
  const g = window.game, sp = g.uniques.spotOf('corsair');
  window.__to(sp.x + 90, sp.z); window.__tick();
  const mid = { st: g.save.uniques.corsair.st, live: !!g.uniques.liveOf('corsair') };
  window.__to(sp.x + 20, sp.z + 3); window.__tick();
  const v = g.uniques.liveOf('corsair'), me = g.uniques.mapEntries().find(e => e.key === 'uq:corsair');
  return { mid, st: g.save.uniques.corsair.st, live: !!v, at: v ? Math.hypot(v.pos.x - sp.x, v.pos.z - sp.z) : -1, icon: me && me.icon, copies: window.__copies('u_corsair'), found: v && v.origin === 'found' };
});
check('closer: it stands at its place (one car, legally abandoned) once you are near; close enough, its exact place is known (◆ on the map)', exact.mid.live && exact.mid.st === 1 && exact.st === 2 && exact.live && exact.at < 1 && exact.icon === '◆' && exact.copies === 1 && exact.found, JSON.stringify(exact));
const nobay = await ev(() => {
  const g = window.game, v = g.uniques.liveOf('corsair'), cap = g.content.garageCap, n = g.save.garage.length;
  // fill every space you have first
  const fill = []; while (g.vreg.freeBays() > 0) { const e = g.content.addToGarage('compact', 'bought', undefined, true); if (!e) break; fill.push(e.uid); }
  const why = g.uniques.claimBlock(v), r = g.uniques.claim(v);
  const out = { cap, why, r, st: g.save.uniques.corsair.st, entries: g.save.garage.filter(e => e.type === 'u_corsair').length, owned: !!v.garageUid };
  g.save.garage = g.save.garage.filter(e => !fill.includes(e.uid));
  return out;
});
check('no free parking space: you can’t take it (the fleet never outgrows your parking); it stays where it is', /free parking space/.test(nobay.why) && nobay.r && nobay.st === 2 && nobay.entries === 0 && !nobay.owned, JSON.stringify(nobay));
await ev(() => { const g = window.game; g.money.W.clean = 5e6; g.money.W.dirty.me = 5e5; g.uw.props.buy('qgarage'); g.uw.props.buy('loft'); window.__calm(); });
const take = await ev(() => {
  const g = window.game, v = g.uniques.liveOf('corsair');
  const prompt = (() => { window.__to(v.pos.x + 1.6, v.pos.z); g.updatePrompt(); return document.getElementById('prompt') ? document.getElementById('prompt').textContent : ''; })();
  g.interact(); const asked = !document.getElementById('confirmScreen').classList.contains('hidden') && /Golden Corsair/.test(document.getElementById('confirmTitle').textContent); g.ui.closeAll ? g.ui.closeAll() : g.ui.show('confirmScreen', false);
  const r = g.uniques.claim(v), e = g.save.garage.find(x => x.type === 'u_corsair');
  return { prompt, asked, r, st: g.save.uniques.corsair.st, n: g.save.garage.filter(x => x.type === 'u_corsair').length, uid: e && e.uid, origin: e && e.origin, hot: e && e.hot, vtier: e && e.vtier, at: !!(e && e.at), out: e && e.out, live: v.garageUid === (e && e.uid), count: g.uniques.count(), again: g.uniques.claim(v) };
});
check('taking it: “Take the Golden Corsair”, one question, then it is yours where it stands, with its own space reserved (found, legal, not HOT)', /Take the Golden Corsair/.test(take.prompt) && take.asked && take.r === '' && take.st === 3 && take.n === 1 && take.origin === 'found' && !take.hot && take.vtier === 'unique' && take.at && take.out && take.live && take.count === 1, JSON.stringify(take));
check('it can’t be taken twice', take.again !== '' && take.n === 1, take.again);
const after = await ev(() => { const g = window.game, sp = g.uniques.spotOf('corsair'); window.__to(sp.x + 30, sp.z); window.__tick(5); return { copies: window.__copies('u_corsair'), map: g.uniques.mapEntries().some(e => e.key === 'uq:corsair'), owned: g.vehicles.list.filter(v => v.type === 'u_corsair').every(v => v.garageUid) }; });
check('acquired: off the map, and no second one ever stands at its place', after.copies === 1 && after.owned && !after.map, JSON.stringify(after));
const secret = await ev(() => { const g = window.game, e = g.save.garage.find(x => x.type === 'u_corsair'), v = g.vreg.live(e); window.__to(v.pos.x + 2, v.pos.z); g.completeEnter(v); window.__tick(); return !!g.save.secrets.gold; });
check('driving it is still the city’s “Golden Corsair” secret', secret);

// ---------------------------------------------------------------- 4. reload: no duplicate, no respawn, nothing lost
const before = await ev(() => { const g = window.game; return { uid: g.save.garage.find(x => x.type === 'u_corsair').uid, n: g.save.garage.length }; });
await reload();
const re1 = await ev(b0 => { const g = window.game, sp = g.uniques.spotOf('corsair'); window.__to(sp.x + 25, sp.z); window.__tick(5); for (let k = 0; k < 4; k++) g.vreg.update(1); const e = g.save.garage.filter(x => x.type === 'u_corsair'); return { n: e.length, same: e[0] && e[0].uid === b0.uid, total: g.save.garage.length === b0.n, st: g.save.uniques.corsair.st, copies: window.__copies('u_corsair'), standing: !!g.uniques.liveOf('corsair'), vtier: e[0] && e[0].vtier }; }, before);
check('save → reload: still one Corsair (the same entry), still acquired; none respawns at its place', re1.n === 1 && re1.same && re1.total && re1.st === 3 && re1.copies <= 1 && !re1.standing && re1.vtier === 'unique', JSON.stringify(re1));
const spec = await ev(() => { const g = window.game, e = g.save.garage.find(x => x.type === 'u_corsair'), v = g.vreg.live(e) || g.vreg.spawnFor(e, g.vreg.where(e)); return { vmax: v.spec.vmax, power: v.spec.power, tier: v.vtier, gloss: v.mat.userData.u.uFinish.value.y }; });
check('its spec and finish are kept', spec.vmax === 67 && spec.power === 16400 && spec.tier === 'unique' && spec.gloss === 1, JSON.stringify(spec));

// ---------------------------------------------------------------- 5. protection: sale, chop shop, pink slip, stray copies
const prot = await ev(() => {
  const g = window.game, e = g.save.garage.find(x => x.type === 'u_corsair'), v = g.vreg.live(e) || g.vreg.spawnFor(e, g.vreg.where(e));
  g.content.openGarage(g.content.garagePoints()[0]); const html = document.getElementById('svcBody') ? document.getElementById('svcBody').innerHTML : document.body.innerHTML;
  const sellBtn = html.includes(`data-act="sell:${e.uid}"`), notForSale = /not for sale/.test(html); g.ui.closeAll && g.ui.closeAll();
  g.uw.sellCar(v);
  const stake = g.pinks.canStake(v, g.pinks.def(false));
  // a stray copy (never acquired): can't be parked into your fleet or kept track of as a stolen car
  const stray = g.vehicles.spawn('u_aeterna', v.pos.x + 12, v.pos.z, 0, { parked: true }); window.__to(stray.pos.x + 2, stray.pos.z); g.completeEnter(stray);
  const gp = g.content.garagePoints()[0], stored = g.content.storeVehicle(stray, gp), tracked = g.vreg.track(stray);
  g.exitVehicle(true); g.vehicles.despawn(stray);
  return { sellBtn, notForSale, still: g.save.garage.filter(x => x.type === 'u_corsair').length, stake, stored, tracked: !!tracked, aeterna: g.save.garage.some(x => x.type === 'u_aeterna') };
});
check('it can’t be sold: no Sell button, “One of a kind · not for sale”', !prot.sellBtn && prot.notForSale, JSON.stringify(prot));
check('the chop shop won’t touch it and it can’t be put up in a pink slip', prot.still === 1 && /one of a kind/i.test(prot.stake), prot.stake);
check('a stray copy (never acquired) can’t be parked into your fleet or kept as a stolen car', prot.stored === false && !prot.tracked && !prot.aeterna, JSON.stringify(prot));

// ---------------------------------------------------------------- 6. the impound and a wreck
const imp = await ev(() => { const g = window.game, e = g.save.garage.find(x => x.type === 'u_corsair'); g.impound.seize(e, 'abandoned'); return { imp: !!e.imp, slot: e.imp.slot, where: g.uniques.whereText('corsair') }; });
await reload();
const imp2 = await ev(() => { const g = window.game, e = g.save.garage.filter(x => x.type === 'u_corsair'); return { n: e.length, imp: !!(e[0] && e[0].imp), st: g.save.uniques.corsair.st }; });
check('impounded: it is held at the impound (one entry, still acquired), across a reload', imp.imp && imp.slot >= 0 && /impound/i.test(imp.where) && imp2.n === 1 && imp2.imp && imp2.st === 3, JSON.stringify([imp, imp2]));
const rel = await ev(() => {
  const g = window.game, e = g.save.garage.find(x => x.type === 'u_corsair'), sp = g.impound.slotPos(e);
  e.imp.paid = true; window.__to(sp.x + 3, sp.z); g.impound.update(0.1);
  const v = g.vreg.live(e); if (!v) return { err: 'not at the lot' };
  const W = g.world.compounds[g.impound.lotOf(e)];
  v.pos.x = W.gate.x + 40; v.pos.z = W.gate.z + 40; g.impound.update(0.1);
  return { imp: !!e.imp, out: e.out, n: g.save.garage.filter(x => x.type === 'u_corsair').length };
});
check('released and driven out of the impound: yours again, out on the street', rel.imp === false && rel.out && rel.n === 1, JSON.stringify(rel));
const wreck = await ev(() => {
  const g = window.game, e = g.save.garage.find(x => x.type === 'u_corsair'), v = g.vreg.live(e);
  g.vreg.towHome(e, v);
  const w = { dmg: e.dmg, out: e.out, n: g.save.garage.filter(x => x.type === 'u_corsair').length };
  return w;
});
check('wrecked: your people tow it home as a wreck to repair (the existing wreck rule; never deleted)', wreck.dmg === 100 && !wreck.out && wreck.n === 1, JSON.stringify(wreck));
await reload();
const wreck2 = await ev(() => { const g = window.game, e = g.save.garage.filter(x => x.type === 'u_corsair'); return { n: e.length, dmg: e[0] && e[0].dmg, st: g.save.uniques.corsair.st }; });
check('the wreck survives a reload, one entry, still acquired', wreck2.n === 1 && wreck2.dmg === 100 && wreck2.st === 3, JSON.stringify(wreck2));

// ---------------------------------------------------------------- 7. paid intel and a stolen one-off: the Ambassador
const intel = await ev(() => {
  const g = window.game, s = g.save, msgs = s.messages.length;
  s.rep = 900; window.__tick();
  const lead = { lead: s.uniques.ambassador.lead, st: s.uniques.ambassador.st, phone: s.messages.slice(msgs).some(m => m.from === 'lucky') };
  const q = g.uniques.intelSpot(); window.__to(q.x, q.z);
  const act = g.uniques.findAction();
  const cash = g.money.W.dirty.me; g.money.W.dirty.me = 100;
  const broke = g.uniques.buyIntel(), st0 = s.uniques.ambassador.st;
  g.money.W.dirty.me = cash; const c0 = g.money.cash ? g.money.cash() : null;
  const paid = g.uniques.buyIntel(), after = g.money.W.dirty.me, again = g.uniques.buyIntel(), after2 = g.money.W.dirty.me;
  return { lead, label: act && act.label, broke, st0, paid, charged: cash - after, again, twice: after - after2, st: s.uniques.ambassador.st, area: g.uniques.areas().length, actNow: !!g.uniques.findAction(), c0 };
});
check('Rep 800: Lucky phones about a diplomat’s car (a lead, not yet a clue)', intel.lead.lead && intel.lead.st === 0 && intel.lead.phone, JSON.stringify(intel.lead));
check('paid intel at the pawn shop: not without the cash; paid once ($3,000 Dirty Cash), it gives the clue and a search area', /Lucky/.test(intel.label) && intel.broke && intel.st0 === 0 && intel.paid === '' && intel.charged === 3000 && intel.st === 1 && intel.area >= 1, JSON.stringify(intel));
check('the tip is sold once: no second charge, no second offer', intel.again !== '' && intel.twice === 0 && !intel.actNow, JSON.stringify(intel));
const amb = await ev(() => {
  const g = window.game, sp = g.uniques.spotOf('ambassador'); window.__calm(); g.police.enabled = true;
  const crimes = []; const crime0 = g.police.crime; g.police.crime = function (t, x, z) { crimes.push(t); return crime0.call(this, t, x, z); };
  window.__to(sp.x + 15, sp.z); window.__tick(); const v = g.uniques.liveOf('ambassador'); if (!v) return { err: 'not standing' };
  const r = g.uniques.claim(v), e = g.save.garage.find(x => x.type === 'u_ambassador');
  return { r, st: g.save.uniques.ambassador.st, origin: e.origin, hot: e.hot, isHot: g.vreg.isHot(v), theft: crimes.includes('theft'), uid: e.uid };
});
check('taking the Ambassador is theft: it joins your fleet stolen and HOT (existing provenance), and the police hear of it', amb.r === '' && amb.st === 3 && amb.origin === 'stolen' && amb.hot && amb.isHot && amb.theft, JSON.stringify(amb));
const clean = await ev(() => { const g = window.game, e = g.save.garage.find(x => x.type === 'u_ambassador'), v = g.vreg.live(e); window.__calm(); g.police.clear(); const why = g.chop.cleanBlock(v), r = g.chop.clean(v); return { why, r, hot: e.hot, n: g.save.garage.filter(x => x.type === 'u_ambassador').length }; });
check('the Chop Shop cleans its papers like any stolen car: HOT gone, still the one Ambassador', clean.r === '' && clean.hot === false && clean.n === 1, JSON.stringify(clean));

// ---------------------------------------------------------------- 8. one-time rewards: the Spectre and the Clubsport
const rew = await ev(() => {
  const g = window.game, s = g.save, U = g.uniques, city = window.__pv.RACES.filter(r => !r.storyOnly && !r.country);
  // no free space: a reward waits with whoever gave it
  const fill = []; while (g.vreg.freeBays() > 0) { const e = g.content.addToGarage('compact', 'bought', undefined, true); if (!e) break; fill.push(e.uid); }
  s.races[city[0].id] = { best: 60, won: 1 }; window.__tick(); const lead = s.uniques.spectre.st;
  for (const r of city) s.races[r.id] = { best: 60, won: 1 };
  window.__tick(); window.__tick();
  const pend = (s.pendingCars || []).filter(P => P.type === 'u_spectre').length, inFleet = s.garage.filter(e => e.type === 'u_spectre').length, st = s.uniques.spectre.st;
  U.grant('spectre'); U.check(); U.onRaceWin(city[0].id);
  const twice = (s.pendingCars || []).filter(P => P.type === 'u_spectre').length + s.garage.filter(e => e.type === 'u_spectre').length;
  s.garage = s.garage.filter(e => !fill.includes(e.uid));
  const i = s.pendingCars.findIndex(P => P.type === 'u_spectre'), c = g.vreg.collect(i);
  const fleet = s.garage.filter(e => e.type === 'u_spectre');
  return { lead, pend, inFleet, st, twice, c, fleet: fleet.length, vtier: fleet[0] && fleet[0].vtier, origin: fleet[0] && fleet[0].origin, waiting: s.pendingCars.filter(P => P.type === 'u_spectre').length };
});
check('the Spectre: a lead after the first city race win; all five won, Tull gives it once (no space: it waits with him)', rew.lead === 1 && rew.st === 3 && rew.pend === 1 && rew.inFleet === 0, JSON.stringify(rew));
check('a one-time reward can’t be claimed twice (granting again, rechecking, winning again)', rew.twice === 1, JSON.stringify(rew));
check('collected into a free space: one Spectre in the fleet, nothing left waiting', rew.c === '' && rew.fleet === 1 && rew.waiting === 0 && rew.vtier === 'unique' && rew.origin === 'reward', JSON.stringify(rew));
const club = await ev(() => { const g = window.game, s = g.save; g.uniques.onRaceWin('vp_gt'); g.uniques.onRaceWin('vp_gt'); g.uniques.grant('club'); return { n: s.garage.filter(e => e.type === 'u_club').length + s.pendingCars.filter(P => P.type === 'u_club').length, st: s.uniques.club.st, origin: (s.garage.find(e => e.type === 'u_club') || {}).origin }; });
check('the Clubsport: the GT Cup won at Valen Point, once (prize car, never twice)', club.n === 1 && club.st === 3 && club.origin === 'prize', JSON.stringify(club));

// ---------------------------------------------------------------- 9. Vance's Widowmaker: a pink-slip challenge
const bays = await ev(() => { const g = window.game, r = {}; for (const id of ['docklock', 'linden', 'offroad']) r[id] = g.uw.props.buy(id); window.__calm(); return { r, free: g.vreg.freeBays(), cap: g.content.garageCap, n: g.save.garage.length }; });
const ord = await ev(() => {
  const g = window.game, s = g.save, out = [];
  for (let k = 0; k < 3; k++) { const e = g.content.addToGarage('sports', 'bought', undefined, true); e.prov = { dirty: 0, clean: 15000 }; s.pink = { uid: e.uid, rival: g.pinks.rival(e, g.pinks.def(false)) }; out.push(s.pink.rival.type); g.pinks.resolve(true); }
  return { types: out, st: s.uniques.widow.st, n: s.uniques.widow.n, due: g.uniques.widowDue(), msg: s.messages.slice(-3).some(m => m.from === 'vance' && /Widowmaker/.test(m.text)) };
});
check('three ordinary pink slips won (none of them for a one-off): Vance offers the Widowmaker', ord.types.every(t => !t.startsWith('u_')) && ord.st === 2 && ord.n === 3 && ord.due && ord.msg, JSON.stringify(ord));
const stakeRule = await ev(() => { const g = window.game, e = g.content.addToGarage('compact', 'bought', undefined, true); e.prov = { dirty: 0, clean: 1500 }; const v = g.vreg.spawnFor(e, { x: 300, z: 300, h: 0, y: 0.15 }); const why = g.pinks.canStake(v, g.pinks.def(false)), dirt = g.pinks.rival({ type: 'pickup', vtier: 'common' }, g.pinks.def(true)).type; g.vehicles.despawn(v); g.save.garage.splice(g.save.garage.indexOf(e), 1); return { why, dirt }; });
check('he only stakes it against a car worth $24,000 or more, and never in the off-road pink slip', /24,000/.test(stakeRule.why) && !stakeRule.dirt.startsWith('u_'), JSON.stringify(stakeRule));
await ev(() => { const g = window.game; g.uw.S.day += 1; window.__E = window.__car('muscle', 320, 330).uid; window.__calm(); });
const lose = await race(2);
const lost = await ev(() => { const g = window.game, s = g.save; return { mine: s.garage.some(e => e.uid === window.__E), widow: s.garage.some(e => e.type === 'u_widow') || s.pendingCars.some(P => P.type === 'u_widow'), st: s.uniques.widow.st, strays: g.vehicles.list.filter(v => v.type === 'u_widow' && !v.garageUid).every(v => v.locked) }; });
check('racing for it: his Widowmaker lines up against you, locked (nobody takes it from the grid)', lose.opp && lose.opp.type === 'u_widow' && lose.opp.locked, JSON.stringify(lose));
check('lost: your car is his (ordinary pink-slip rules); the Widowmaker stays his and on offer, and nobody can drive off in it', !lost.mine && !lost.widow && lost.st === 2 && lost.strays, JSON.stringify(lost));
await ev(() => { const g = window.game; g.uw.S.day += 1; window.__E = window.__car('muscle', 320, 330).uid; window.__calm(); });
const won = await race(1);
const wonS = await ev(() => { const g = window.game, s = g.save, e = s.garage.filter(x => x.type === 'u_widow'); const v = e[0] && g.vreg.live(e[0]); return { uid: e[0] && e[0].uid, out: !!(e[0] && e[0].out), loc: e[0] && e[0].loc, inBay: !!(e[0] && !e[0].out && e[0].at), n: e.length, origin: e[0] && e[0].origin, vtier: e[0] && e[0].vtier, st: s.uniques.widow.st, mine: s.garage.some(x => x.uid === window.__E), live: !!(v && v.owned && !v.locked), due: g.uniques.widowDue(), next: g.pinks.rival(s.garage.find(x => x.uid === window.__E), g.pinks.def(false)).type }; });
// where it stopped: as with any pink slip, a finish that leaves his car beyond the registry's 340 m keep radius puts it
// away on the street there; go there and it is in the world again, yours and unlocked
if (!wonS.live && !wonS.inBay && wonS.out && wonS.loc) wonS.there = await ev(r => {
  const g = window.game; if (g.player.state === 'vehicle') g.exitVehicle(true); g.resetPlayerState(r.loc.x + 3, r.loc.z + 3, 0);
  for (let n = 0; n < 120; n++) g.update(1 / 60, 1 / 60);
  const e = g.save.garage.find(x => x.uid === r.uid), v = e && g.vreg.live(e);
  return { live: !!(v && v.owned && !v.locked), d: v ? Math.round(Math.hypot(v.pos.x - r.loc.x, v.pos.z - r.loc.z)) : null };
}, wonS);
check('won: the Widowmaker is yours (where it stopped, unlocked, or in its space if his car was gone), your car stays yours, and he never stakes it again', won.opp && won.opp.type === 'u_widow' && wonS.n === 1 && wonS.origin === 'pinkslip' && wonS.vtier === 'unique' && wonS.st === 3 && wonS.mine && (wonS.live || wonS.inBay || (wonS.there && wonS.there.live && wonS.there.d < 40)) && !wonS.due && wonS.next !== 'u_widow', JSON.stringify(wonS));
const widowStake = await ev(() => { const g = window.game, e = g.save.garage.find(x => x.type === 'u_widow'), v = g.vreg.live(e) || g.vreg.spawnFor(e, g.vreg.where(e)); return g.pinks.canStake(v, g.pinks.def(false)); });
check('a one-off is never staked: the Widowmaker can’t be put up', /one of a kind/i.test(widowStake), widowStake);

// ---------------------------------------------------------------- 10. every car that stands somewhere: streamed, not simulated
const stream = {};
await ev(() => { for (const id of ['proto', 'baja', 'riviera', 'tourer']) window.game.save.uniques[id].st = 1; });
for (const id of ['proto', 'baja', 'riviera', 'tourer']) {
  await ev(id => { const sp = window.game.uniques.spotOf(id); window.__to(sp.x + 90, sp.z + 2); }, id); await frames(page, 3); await ev(() => window.__tick(2));
  await ev(id => { const sp = window.game.uniques.spotOf(id); window.__to(sp.x + 20, sp.z + 2); }, id); await frames(page, 3);
  stream[id] = await ev(id => { const g = window.game, U = g.uniques, sp = U.spotOf(id); window.__tick(2); const v = U.liveOf(id); return { live: !!v, st: g.save.uniques[id].st, standing: [...U.live.values()].every(o => Math.hypot(o.pos.x - g.player.pos.x, o.pos.z - g.player.pos.z) < 340), type: v && v.type, y: v ? Math.abs(v.pos.y - window.__pv.groundY(sp.x, sp.z)) < 1.2 : false }; }, id);
}
await ev(() => window.__to(600, 600)); await frames(page, 4);
stream.far = await ev(() => { const g = window.game; window.__tick(2); return { standing: g.uniques.live.size, cars: g.vehicles.list.filter(v => v.uniqueId).length }; });
check('each stands at its place, on the ground, once its clue is known and you are near; only the ones within reach of you exist', ['proto', 'baja', 'riviera', 'tourer'].every(id => stream[id].live && stream[id].st === 2 && stream[id].standing && stream[id].y), JSON.stringify(stream));
check('away from them, none is in the world (streamed, never simulated)', stream.far.standing === 0 && stream.far.cars === 0, JSON.stringify(stream.far));
await reload();
const keep = await ev(() => { const g = window.game, s = g.save.uniques; return Object.fromEntries(Object.entries(s).map(([k, r]) => [k, r.st])); });
check('save → reload: every clue and stage is kept (nothing resets), and the search areas with them', keep.corsair === 3 && keep.ambassador === 3 && keep.spectre === 3 && keep.club === 3 && keep.widow === 3 && keep.proto === 2 && keep.baja === 2 && keep.riviera === 2 && keep.tourer === 2 && keep.aeterna === 0, JSON.stringify(keep));
const stats = await ev(() => { const g = window.game; g.content.renderProgress(); const h = document.getElementById('progressBody').innerHTML; return { one: /One-offs · 5 of 10/.test(h), hidden: (h.match(/\?\?\?/g) || []).length, garage: g.content.collection().models }; });
check('the collection: “One-offs · 5 of 10” with each one’s state; the undiscovered stay unnamed', stats.one && stats.hidden === 1, JSON.stringify(stats));

// ---------------------------------------------------------------- 11. a damaged save: never two of one, never one lost
const dup = await ev(() => {
  const g = window.game, s = g.save, e = s.garage.find(x => x.type === 'u_corsair');
  s.garage.push({ ...JSON.parse(JSON.stringify(e)), uid: s.nextUid++, at: null });
  s.pendingCars.push({ type: 'u_spectre', origin: 'reward', color: 0, from: 'x' });
  s.uniques.club.st = 3; const ci = s.garage.findIndex(x => x.type === 'u_club'); s.garage.splice(ci, 1);
  return true;
});
await reload();
const dup2 = await ev(() => { const g = window.game, s = g.save; return { corsair: s.garage.filter(e => e.type === 'u_corsair').length, spectre: s.garage.filter(e => e.type === 'u_spectre').length + s.pendingCars.filter(P => P.type === 'u_spectre').length, club: s.garage.filter(e => e.type === 'u_club').length + s.pendingCars.filter(P => P.type === 'u_club').length, log: s.vlog.some(l => l.what === 'duplicate one-off removed') }; });
check('a save holding two of one: one is kept (and the duplicate logged)', dup && dup2.corsair === 1 && dup2.spectre === 1 && dup2.log, JSON.stringify(dup2));
check('a save that lost an acquired one: it is never silently gone, it waits for you to collect it', dup2.club === 1, JSON.stringify(dup2));
const mig = await ev(() => {
  const g = window.game, d = window.__pv.SaveSystem.defaults();
  d.secrets.gold = 1; d.flags.goldHint = true; d.garage.push({ uid: 7, type: 'classic', color: 0xc9a227, origin: 'found', dmg: 0, tune: {}, at: null, out: false, loc: null });
  window.__pv.SaveSystem.sanitize(d);
  return { type: d.garage[0].type, vtier: d.garage[0].vtier, st: d.uniques.corsair.st };
});
check('an old save’s gold Corsair 68 (the Golden Corsair before Session 6D) becomes the real one-off', mig.type === 'u_corsair' && mig.vtier === 'unique' && mig.st === 3, JSON.stringify(mig));

// ---------------------------------------------------------------- 12. the last one: the other nine first
const last = await ev(() => {
  const g = window.game, s = g.save; window.__tick(); const before = s.uniques.aeterna.st;
  for (const u of window.__pv.UNIQUE_CARS) if (u.id !== 'aeterna' && s.uniques[u.id].st < 3) s.uniques[u.id].st = 3;
  window.__tick();
  return { before, after: s.uniques.aeterna.st, area: g.uniques.areas().some(a => true) };
});
check('the Aeterna V16: nothing until the other nine are yours, then its clue and search area', last.before === 0 && last.after === 1 && last.area, JSON.stringify(last));

// ---------------------------------------------------------------- 13. the rooftop Zephyr: a one-time find (§45.39)
const roof = await ev(() => {
  const g = window.game, V = g.vehicles, R = g.world.places.garageRoof.roof;
  const stream = () => { for (const [bi, cars] of V.parkedBlocks) { for (const v of cars) if (V.list.includes(v) && v !== g.player.vehicle && !v.garageUid) V.despawn(v); } V.parkedBlocks.clear(); V.updateParked(R.x, R.z, 120); return V.list.filter(v => v.rareFind && !v.garageUid).length; };
  g.save.flags.rooftopTaken = false; delete g.save.secrets.rooftop;
  const before = stream();
  const v = V.list.find(x => x.rareFind); if (!v) return { before, err: 'no rooftop car' };
  window.__to(v.pos.x + 2, v.pos.z); g.player.pos.y = v.pos.y; g.completeEnter(v); g.content.checkT = 0; g.content.update(0.016, 0.6);
  const flag = g.save.flags.rooftopTaken; g.exitVehicle(true);
  V.despawn(v); const after = stream(), after2 = stream();
  return { before, flag, after, after2 };
});
check('the rooftop Zephyr is a one-time find: there until taken; once taken it never stands on the roof again, however often the block reloads', roof.before === 1 && roof.flag === true && roof.after === 0 && roof.after2 === 0, JSON.stringify(roof));

check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await finish(b, 'unique');
