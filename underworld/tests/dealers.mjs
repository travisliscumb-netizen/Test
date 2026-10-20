/* Dealerships and the vehicle roster (v6): 25-30 civilian models with their own silhouettes; three physical
   dealerships (a used lot beside the chop shop, Meridian Motors for new cars, a glass performance & luxury
   showroom); stock stands on the lot as real locked cars you inspect and buy where they stand; used cars
   have condition, mileage and varied prices; stock rotates on the street calendar; purchases, sold stalls and
   stock survive a save + reload; the map tells the three apart. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
await ev(() => { const g = window.game; g.events.cool = 1e9; g.police.enabled = false; (g.money.W.clean = g.money.W.dirty.me = 5e6); g.save.rep = 50; });

// 1. the roster
const ros = await ev(() => {
  const V = window.game.vehicles.specs ? window.game.vehicles.specs : null;
  const P = window.__pv, specs = window.__pvDebug ? null : null; void specs;
  const all = Object.entries(P.VEHICLES), civ = all.filter(([k, s]) => !s.police && !s.unmarked);
  const out = { n: civ.length, names: new Set(civ.map(([, s]) => s.name)).size, profiles: {}, tris: {}, bad: [] };
  for (const [k, s] of civ) {
    (out.profiles[s.profile] = out.profiles[s.profile] || []).push(k);
    try { const g = window.game.vehicles.spawn(k, 10, 10, 0, { parked: true }); out.tris[k] = Math.round((g.mesh.geometry.index ? g.mesh.geometry.index.count : g.mesh.geometry.attributes.position.count) / 3); window.game.vehicles.despawn(g); } catch (e) { out.bad.push(k + ': ' + e.message); }
  }
  // the fast cars must not share a body: every sports / super / GT / muscle model has its own profile
  const fast = civ.filter(([, s]) => ['sport', 'rare', 'luxury'].includes(s.tier) && s.profile !== 'offroad' && s.profile !== 'lsuv').map(([k, s]) => s.profile);
  out.fastN = fast.length; out.fastUnique = new Set(fast).size;
  out.keep = ['Pico', 'Meridian', 'Vireo GT', 'Bastion', 'Haulmark', 'Ridgeback', 'Cabline', 'Brakken', 'Zephyr', 'Corsair 68', 'Aurel RS', 'Mesa Trail', 'Boxline', 'Sovereign LX', 'Cortez Lowline', 'Workhorse'].filter(n => !civ.some(([, s]) => s.name === n));
  out.maxTris = Math.max(...Object.values(out.tris));
  out.dims = civ.map(([k, s]) => [k, s.l, s.h]);
  return out;
});
check('25-30 civilian models (police cars not counted), every one named', ros.n >= 25 && ros.n <= 30 && ros.names === ros.n, `${ros.n} models, ${ros.names} names`);
check('the sixteen established names are all still there', !ros.keep.length, ros.keep.join(','));
check('every model builds and spawns', !ros.bad.length, ros.bad.join(' | '));
check('every fast car (sport, luxury, rare) has its own silhouette', ros.fastUnique === ros.fastN, `${ros.fastUnique} profiles for ${ros.fastN} cars`);
check('meshes stay mobile-sized (under 3,000 triangles a car)', ros.maxTris < 3000, ros.maxTris + ' max');

// 2. three places, the used lot next to the chop shop, three map categories
const where = await ev(() => {
  const g = window.game, pl = g.world.places, U = g.ui;
  const d = (a, b2) => Math.round(Math.hypot(a.x - b2.x, a.z - b2.z));
  const idx = g.ui.map && g.ui.map.index ? g.ui.map.index() : null; void idx;
  const out = { used: !!pl.usedlot, neu: !!pl.dealer, lux: !!pl.prestige, chop: (() => { const ub = g.world.block(Math.floor(pl.usedlot.door.x / 80), Math.floor(pl.usedlot.door.z / 80)), cb = g.world.block(10, 6); return { adj: ub.bx === cb.bx && ub.bz === cb.bz - 1, gate: Math.round(cb.z0 - ub.z1) }; })(), slots: [pl.usedlot.slots.length, pl.dealer.slots.length, pl.prestige.slots.length] };
  out.cats = ['carsUsed', 'carsNew', 'carsLux'].filter(k => window.__pv.MAP_CATS[k]);
  void U;
  return out;
});
check('three dealerships: used, new, performance & luxury', where.used && where.neu && where.lux, JSON.stringify(where));
check('the used lot faces the Saltworks chop shop across one street', where.chop.adj && where.chop.gate < 30, JSON.stringify(where.chop));
check('8-12 used cars, more new ones, fewer and roomier in the showroom', where.slots[0] >= 8 && where.slots[0] <= 12 && where.slots[1] >= 12 && where.slots[2] <= 8, JSON.stringify(where.slots));
check('the map has a category for each', where.cats.length === 3, where.cats.join(','));
const mapIdx = await ev(() => { const g = window.game; g.ui.map.open && g.ui.map.open(); const L = g.ui.map.buildIndex ? g.ui.map.buildIndex() : null; return L ? L.filter(e => /^cars/.test(e.cat)).map(e => e.cat + ':' + e.name) : null; }).catch(() => null);

// 3. stock
const stock = await ev(() => {
  const g = window.game, DL = g.dealers; DL.restock();
  const st = k => DL.state(k).cars;
  const used = st('used'), neu = st('new'), lux = st('lux'), P = window.__pv;
  return {
    used: used.map(c => c && [c.type, c.cond, c.km, c.price, P.CAR_MSRP ? P.CAR_MSRP[c.type] : 0, c.bargain]),
    neu: neu.map(c => c && [c.type, c.cond, c.price]), lux: lux.map(c => c && c.type),
    luxUnique: new Set(lux.map(c => c.type)).size
  };
});
const u = stock.used.filter(Boolean);
check('used cars: condition 48-97 %, mileage, prices below new, all different', u.length === stock.used.length && u.every(c => c[1] >= 48 && c[1] <= 97 && c[2] > 0 && c[3] < c[4]) && new Set(u.map(c => c[3])).size >= u.length - 1, JSON.stringify(u));
check('no more than two of one model on the used lot', Object.values(u.reduce((a, c) => (a[c[0]] = (a[c[0]] || 0) + 1, a), {})).every(n => n <= 2), JSON.stringify(u.map(c => c[0])));
check('new cars are new: full condition, sticker price', stock.neu.every(c => c && c[1] === 100 && c[2] > 0), JSON.stringify(stock.neu.slice(0, 4)));
check('the showroom shows six different cars', stock.lux.length === 6 && stock.luxUnique === 6, JSON.stringify(stock.lux));

// 4. rotation on the street calendar
const rot = await ev(() => {
  const g = window.game, DL = g.dealers, S = g.uw.S, key = k => DL.state(k).cars.map(c => c ? c.type + c.price + c.color : '-').join('|');
  const u0 = key('used'), l0 = DL.state('lux').cars.slice(0, 3).map(c => c.type).join(), n0 = key('new');
  S.day += 1; DL.restock(); const u1 = key('used');
  S.day += 1; DL.restock(); const u2 = key('used');
  S.day += 2; DL.restock(); const l1 = DL.state('lux').cars.slice(0, 3).map(c => c.type).join();
  return { sameAfter1: u0 === u1, changed2: u2 !== u1, l0, l1, newSame: n0.split('|').map(x => x.replace(/\d+$/, '')).length === key('new').split('|').length };
});
check('the used lot keeps its stock between deliveries and turns over every two days', rot.sameAfter1 && rot.changed2, JSON.stringify(rot));
check('the showroom’s flagship stalls rotate', rot.l0 !== rot.l1, `${rot.l0} -> ${rot.l1}`);

// 5. walk the lot: cars stand in their stalls, locked; walking up to one offers to inspect it
await ev(() => { const g = window.game, pl = g.world.places.usedlot; g.resetPlayerState(pl.door.x, pl.door.z + 4, 0); });
await frames(page, 90);
const lot = await ev(() => {
  const g = window.game, DL = g.dealers, pl = g.world.places.usedlot, st = DL.state('used');
  const cars = st.cars.map((c, i) => { const v = DL.carAt('used', i); return c ? (v ? [v.type === c.type, +Math.hypot(v.pos.x - pl.slots[i].x, v.pos.z - pl.slots[i].z).toFixed(2), v.locked] : 'missing') : null; });
  return { cars };
});
check('every car in stock stands in its stall on the lot, locked', lot.cars.filter(Boolean).every(c => Array.isArray(c) && c[0] && c[1] < 0.6 && c[2]), JSON.stringify(lot.cars));
// own somewhere to park first (a double garage)
await ev(() => { const g = window.game; g.save.rep = 50; g.uw.props.buy('double1'); });
const insp = await ev(() => {
  const g = window.game, DL = g.dealers, i = DL.state('used').cars.findIndex(Boolean), v = DL.carAt('used', i), p = g.player;
  const side = v.toWorld(v.spec.w / 2 + 0.7, 0); g.resetPlayerState(side.x, side.z, 0);
  const a = g.content.findAction(); const label = a && a.label;
  if (a) a.act();
  const body = document.getElementById('svcBody').textContent;
  g.ui.closeAll();
  return { i, label, body: body.slice(0, 400), promptLocked: g.nearestVehicle(1.8) === v };
});
check('walking up to a used car offers to inspect it with its price and condition', /^Inspect .+ · \$[\d,]+ · (excellent|good|fair|rough)$/.test(insp.label), insp.label);
check('the inspection shows price, condition, mileage and performance', /Condition/.test(insp.body) && /Mileage/.test(insp.body) && /Top speed/.test(insp.body) && /Buy/.test(insp.body), insp.body);
// the same panel on a phone held sideways (844 × 390): nothing runs off the side, the Buy button is thumb-sized
await page.setViewportSize({ width: 844, height: 390 });
await frames(page, 10);
const phone = await ev(i => {
  const g = window.game; g.content.openLotCar('used', i);
  const body = document.getElementById('svcBody'), btn = body.querySelector('button[data-act="buy"]'), r = btn.getBoundingClientRect();
  const out = { overflow: body.scrollWidth > body.clientWidth + 1, btnH: Math.round(r.height), btnIn: r.right <= window.innerWidth && r.left >= 0 };
  g.ui.closeAll(); return out;
}, insp.i);
await page.setViewportSize({ width: 480, height: 270 });
check('on a phone the inspection panel fits and the Buy button is thumb-sized', !phone.overflow && phone.btnH >= 36 && phone.btnIn, JSON.stringify(phone));
const buy = await ev(i => {
  const g = window.game, DL = g.dealers, s = g.save, c = DL.state('used').cars[i], v = DL.carAt('used', i);
  const m0 = window.game.money.total(), n0 = s.garage.length;
  const r = DL.buy('used', i);
  const e = s.garage[s.garage.length - 1];
  return { r, paid: m0 - window.game.money.total(), price: c.price, n: s.garage.length - n0, dmg: e.dmg, cond: c.cond, sameCar: v.garageUid === e.uid, locked: v.locked, owned: v.owned, slot: DL.state('used').cars[i] };
}, insp.i);
check('buying takes the price and puts that very car in your garage, unlocked and yours', buy.r === '' && buy.paid === buy.price && buy.n === 1 && buy.sameCar && !buy.locked && buy.owned, JSON.stringify(buy));
check('a used car keeps its condition (garage damage = 100 − condition)', buy.dmg === 100 - buy.cond, JSON.stringify([buy.dmg, buy.cond]));
check('its stall stays empty until new stock arrives', buy.slot === null, JSON.stringify(buy.slot));
const drive = await ev(() => { const g = window.game, v = g.vehicles.list.find(x => x.garageUid && x.origin === 'bought' && !x.locked); const side = v.toWorld(v.spec.w / 2 + 0.6, 0); g.resetPlayerState(side.x, side.z, 0); g.interact(); return { ok: !!v }; });
await frames(page, 90);
const inCar = await ev(() => ({ st: window.game.player.state }));
check('you can get in and drive it off the lot', drive.ok && inCar.st === 'vehicle', JSON.stringify(inCar));
await ev(() => { const g = window.game; if (g.player.state === 'vehicle') g.exitVehicle(true); });
await frames(page, 30);

// 6. what stops a sale
const deny = await ev(() => {
  const g = window.game, DL = g.dealers, s = g.save, lux = DL.state('lux').cars, c = lux.find(x => x && ['supercar', 'valkyr', 'obsidian', 'coupe'].includes(x.type)) || lux[0];
  s.rep = 0; const rep = DL.cantBuy('lux', c);
  s.rep = 99999; const W = window.game.money.W, m = [W.clean, W.dirty.me]; W.clean = W.dirty.me = 10; const cash = DL.cantBuy('lux', c); [W.clean, W.dirty.me] = m;
  const usedC = DL.state('used').cars.find(Boolean); s.rep = 0; const usedRep = DL.cantBuy('used', usedC);
  const g0 = s.garage.slice(); while (s.garage.length < g.content.garageCap) s.garage.push({ ...g0[0], uid: 9000 + s.garage.length, at: null }); const full = DL.cantBuy('used', usedC); s.garage = g0;
  s.rep = 99999;
  return { rep, cash, usedRep, full };
});
check('prestige cars need the reputation; the cash lot sells to anyone', /reputation/i.test(deny.rep) && deny.usedRep === '', JSON.stringify(deny));
check('no sale without the money or a free parking space', /Costs/.test(deny.cash) && /Garage full/.test(deny.full), JSON.stringify(deny));

// 7. the showroom: walk in through the glass front, the camera sees through glass, cars have room
await ev(() => { const g = window.game, pl = g.world.places.prestige; g.resetPlayerState(pl.door.x, pl.door.z + 6, Math.PI); });
await frames(page, 60);
const show = await ev(() => {
  const g = window.game, pl = g.world.places.prestige, grid = g.world.grid, DL = g.dealers;
  const blockedIn = grid.raycast(pl.door.x, 1.0, pl.door.z + 3, 0, 0, -1, 12, 0, false);
  const glassHit = grid.raycast(pl.door.x - 14, 1.5, pl.door.z + 3, 0, 0, -1, 8, 0, false);
  const glassSee = grid.raycast(pl.door.x - 14, 1.5, pl.door.z + 3, 0, 0, -1, 8, 0, true);
  const cars = pl.slots.map((s, i) => DL.carAt('lux', i)).filter(Boolean);
  let minGap = 99; for (let i = 0; i < pl.slots.length; i++) for (let j = i + 1; j < pl.slots.length; j++) minGap = Math.min(minGap, Math.hypot(pl.slots[i].x - pl.slots[j].x, pl.slots[i].z - pl.slots[j].z));
  const turn = cars.find(v => v.dealer && v.dealer.turn), h0 = turn ? turn.h : 0;
  return { walkIn: !blockedIn || blockedIn.t > 10, glass: !!glassHit && glassHit.col.see === true, see: !glassSee || glassSee.col.see !== true, cars: cars.length, minGap: +minGap.toFixed(1), turnH: h0 };
});
await frames(page, 60);
const turned = await ev(() => { const g = window.game, v = [...g.dealers.cars.values()].find(x => x.dealer && x.dealer.turn); return v ? v.h : null; });
check('the showroom front opens in the middle: you can walk straight in', show.walkIn, JSON.stringify(show));
check('the glass walls are solid to walk into but the camera and sight lines see through', show.glass && show.see, JSON.stringify(show));
check('six cars on the showroom floor with lots of space between them', show.cars === 6 && show.minGap >= 9, JSON.stringify(show));
check('the flagship turns on its turntable', turned !== null && Math.abs(turned - show.turnH) > 0.05, JSON.stringify([show.turnH, turned]));

// 8. the buyer drives out: nothing solid between each lot's centre aisle and the street
const exits = await ev(() => {
  const g = window.game, grid = g.world.grid, out = {};
  for (const id of ['usedlot', 'dealer', 'prestige']) {
    const pl = g.world.places[id], sl = pl.slots, cz = sl.reduce((a, s) => a + s.z, 0) / sl.length, b = g.world.block(Math.floor(pl.door.x / 80), Math.floor(pl.door.z / 80));
    const x = id === 'usedlot' ? b.cx : b.cx, z0 = Math.min(...sl.map(s => s.z)), hit = grid.raycast(x, 0.9, z0, 0, 0, 1, b.z1 + 6 - z0, 0.3, false);
    out[id] = hit ? +hit.t.toFixed(1) + ' (' + (hit.col.kind || '') + ')' : 'clear';
    void cz;
  }
  return out;
});
check('every lot has a clear drive-out to the street', Object.values(exits).every(x => x === 'clear'), JSON.stringify(exits));

// 9. persistence and a damaged save
const before = await ev(() => { const g = window.game; g.save.stats.playTime = Math.max(60, g.save.stats.playTime); g.saveGame(true); const st = g.dealers.state('used'); return { cars: st.cars.map(c => c ? c.type + ':' + c.price : null), garage: g.save.garage.length }; });
await page.reload();
await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue');
await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
await frames(page, 5);
const after = await ev(() => { const g = window.game, st = g.dealers.state('used'); return { cars: st.cars.map(c => c ? c.type + ':' + c.price : null), garage: g.save.garage.length }; });
check('stock, prices, the sold stall and the bought car survive save + reload', JSON.stringify(before) === JSON.stringify(after), JSON.stringify([before, after]));
const bad = await ev(() => {
  const SS = window.__pv.SaveSystem, raw = JSON.parse(localStorage.getItem('pvunderworld.save.v1'));
  raw.dealers = { used: { d: 'x', cars: [{ type: 'nope', price: 5 }, { type: 'sedan', price: -1 }, { type: 'sedan', price: 900, cond: 999 }, 7] }, bogus: { cars: [] }, lux: 'junk' };
  localStorage.setItem('pvunderworld.save.v1', JSON.stringify(raw)); const r = SS.load(); const d = r.data.dealers;
  const v5 = JSON.parse(JSON.stringify(raw)); v5.version = 5; delete v5.dealers; localStorage.setItem('pvunderworld.save.v1', JSON.stringify(v5)); const r5 = SS.load();
  return { keys: Object.keys(d), cars: d.used && d.used.cars, day: d.used && d.used.d, v5: r5.data.version, v5d: JSON.stringify(r5.data.dealers) };
});
check('a damaged dealership save is repaired (bad cars dropped, condition clamped, unknown lots removed)', JSON.stringify(bad.keys) === '["used"]' && bad.cars[0] === null && bad.cars[1] === null && bad.cars[2].cond === 100 && bad.cars[3] === null && bad.day === -999, JSON.stringify(bad));
check('a v5 save loads with empty lots that stock themselves', bad.v5 === 8 && bad.v5d === '{}', JSON.stringify(bad));

check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
void mapIdx;
await finish(b, 'dealers');
