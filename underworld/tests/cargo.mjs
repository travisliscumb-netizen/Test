/* Cargo and inventory transfers (v7).
   Cargo: every model has its own capacity in pounds set by its body (sports cars small, box truck biggest); goods
   weigh what they are (Green/Pharma/Snow by the pound, a hot-goods item or a carton about a pound, hardware five);
   mixed loads stay coherent and whole lots never split; the dealership inspect screen, the dealer list, the garage
   menu and the Garage app all show cargo capacity; stolen cars haul too.
   Inventory: the phone Inventory app moves goods by hand between places within reach only (pockets, the car you
   are in or beside, the stash and garage of the property you are at, a car out front while you are indoors) with
   1 / 5 / 10 / Max buttons sized for a thumb; everything else is a dimmed read-only ledger; a property across town
   refuses a direct move. A fuzz of random transfers conserves every lot and every cent of cost basis. Selling a car
   never throws cargo away silently. Save/reload and a v6 save keep every trunk to the lot. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const t = await open(b, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = t.page;
const ev = (f, a) => page.evaluate(f, a);
const fadeDone = () => page.waitForFunction(() => !window.game.fading, null, { timeout: 30000, polling: 100 });
await startNew(page);
await ev(() => { const g = window.game; g.quality.setMode(0); g.events.cool = 1e9; g.police.enabled = false; g.traffic.enabled = false; g.save.money = 5e6; g.save.rep = 3000; if (g.tutorial) g.tutorial.off = true; });

// every lot of every good everywhere (pockets, stashes, every trunk, runs), with its cost basis
const census = () => ev(() => {
  const g = window.game, S = g.uw.S, G = window.__pv.GOODS, tot = {}, cost = {}, seen = new Set();
  const add = o => { if (!o || seen.has(o)) return; seen.add(o); for (const k in G) { tot[k] = (tot[k] || 0) + (o[k] | 0); cost[k] = (cost[k] || 0) + (o.$cb && o.$cb[k] || 0); } };
  add(S.inv); for (const id in S.storage) add(S.storage[id]);
  for (const e of g.save.garage) add(e.trunk);
  for (const v of g.vehicles.list) add(v.trunk);
  for (const r of S.runs) { tot[r.good] = (tot[r.good] || 0) + r.n; cost[r.good] = (cost[r.good] || 0) + r.cost; }
  return { tot, cost: Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, Math.round(v * 100) / 100])) };
});

// ---------------------------------------------------------------- 1. capacities by body
const caps = await ev(() => {
  const P = window.__pv, out = { missing: Object.keys(P.VEHICLES).filter(k => P.CARGO_LB[k] === undefined), lb: P.CARGO_LB };
  return out;
});
const L = caps.lb;
check('every vehicle model has its own cargo capacity', caps.missing.length === 0, caps.missing.join(','));
check('sports cars 50–100 lb, compact 150, muscle 200, sedan 250, SUV 500, pickup 1,000, utility 1,250, van 2,000, box truck 5,000',
  L.sports >= 50 && L.sports <= 100 && L.supercar >= 50 && L.supercar <= 100 && L.coupe <= 100 && L.compact === 150 && L.muscle === 200 && L.sedan === 250 && L.suv === 500 && L.pickup === 1000 && L.utility === 1250 && L.van === 2000 && L.truck === 5000, JSON.stringify(L));
check('the box truck hauls five times a pickup; a sports car carries a fraction of a sedan', L.truck >= 5 * L.pickup && L.sports * 2 < L.sedan && L.valkyr < L.compact, `${L.truck} vs ${L.pickup}; ${L.sports} vs ${L.sedan}`);
check('the v6 models have real trunks now (they had none)', ['metro', 'regent', 'crest', 'estate', 'courier', 'apex', 'hellion', 'revenant', 'tempest', 'kodiak', 'monarch', 'valkyr', 'obsidian'].every(k => L[k] > 0), JSON.stringify(['metro', 'courier', 'estate'].map(k => L[k])));
check('cars that drive like a sports car carry like one; wagons and vans carry like workhorses', L.tempest < L.apex && L.apex < L.estate && L.estate < L.courier && L.courier < L.van, '');

// ---------------------------------------------------------------- 2. weight: mixed loads, whole lots, stolen cars haul
const mix = await ev(() => {
  const g = window.game, uw = g.uw, P = window.__pv, p = g.player, out = {};
  const x = p.pos.x + 4, z = p.pos.z;
  const v = g.vehicles.spawn('sedan', x, z, 0, { parked: true }); v.touched = true; v.trunk = {};
  g.completeEnter(v);
  out.inCar = p.state === 'vehicle' && uw.nearVehicle() === v;
  // fill the 250 lb sedan with a mix through the ordinary purchase path (pockets first, then the trunk)
  const got1 = uw.give({ hardware: 30 }, 'buy', { hardware: 900 });   // 30 × 5 lb = 150 lb (pockets take 6 of them first: 12 space)
  const got2 = uw.give({ green: 400 }, 'buy', { green: 60 });         // 0.5 lb lots
  const got3 = uw.give({ snow: 5000 }, 'buy', { snow: 300 });         // 0.1 lb lots: tops it up to the pound
  out.got = [got1, got2, got3];
  out.c = P.cargoC(v.trunk); out.cap = P.cargoCapC('sedan');
  out.fitHw = uw.trunkFit(v, 'hardware'); out.fitSnow = uw.trunkFit(v, 'snow');
  out.whole = Object.keys(v.trunk).filter(k => k !== '$cb').every(k => Number.isInteger(v.trunk[k]));
  out.label = P.fmtLb(out.c);
  out.trunk = { ...v.trunk }; delete out.trunk.$cb;
  out.cbOk = Math.abs((v.trunk.$cb.hardware || 0) - (v.trunk.hardware | 0) * 900) < 0.01;
  // nothing more fits once full
  out.extra = uw.give({ hot: 1 }, 'pickup');
  out.stolen = !v.owned && !v.garageUid;
  return out;
});
await frames(page, 30);
mix.hud = await ev(() => { const g = window.game, txt = document.getElementById('carry').textContent; g.exitVehicle(true); return txt; });
check('a stolen sedan hauls cargo: you are in it, it is the car "with you"', mix.inCar && mix.stolen, JSON.stringify({ inCar: mix.inCar }));
check('a mixed load fills the sedan to its 250 lb exactly and no further', mix.c === mix.cap && mix.fitHw === 0 && mix.fitSnow === 0 && mix.extra === null, `${mix.label} of 250 lb · ${JSON.stringify(mix.trunk)}`);
check('mixed goods stay whole lots, each with its own cost basis', mix.whole && mix.cbOk, JSON.stringify(mix.trunk));
check('the HUD shows the trunk load in pounds', /trunk 250 lb/.test(mix.hud), mix.hud);

// ---------------------------------------------------------------- 3. capacity shown before you buy, and for owned cars
await ev(() => { const g = window.game; while (g.ui.stack.length) g.ui.back(); });
const dealer = await ev(async () => {
  const g = window.game, DL = g.dealers, P = window.__pv, out = { lots: {} };
  DL.restock();
  for (const lot in P.DEALERSHIPS) {
    const st = DL.state(lot), rows = [];
    st.cars.forEach((c, i) => {
      if (!c) return;
      g.content.openLotCar(lot, i);
      const body = document.getElementById('svcBody'), txt = body.textContent;
      const m = txt.match(/Cargo Capacity\s*([\d,.]+) lb/);
      rows.push({ type: c.type, shown: m ? +m[1].replace(/,/g, '') : null, want: P.CARGO_LB[c.type], price: /Price/.test(txt), weight: /Weight · seats/.test(txt), cond: /Condition/.test(txt), perf: /Top speed/.test(txt), mileage: lot !== 'used' || /Mileage/.test(txt), w: body.querySelector('.cargoCap') ? body.querySelector('.cargoCap').getBoundingClientRect().width : 0 });
      while (g.ui.stack.length) g.ui.back();
    });
    g.content.openDealer(lot); const list = document.getElementById('svcBody').textContent; out.lots[lot] = { rows, listCargo: (list.match(/Cargo Capacity/g) || []).length, cars: st.cars.filter(Boolean).length };
    while (g.ui.stack.length) g.ui.back();
  }
  return out;
});
const allRows = Object.values(dealer.lots).flatMap(l => l.rows);
check('every dealership inspect screen shows "Cargo Capacity: X lb" with the model\'s own value', allRows.length > 10 && allRows.every(r => r.shown === r.want), JSON.stringify(allRows.filter(r => r.shown !== r.want).slice(0, 3)) + ` (${allRows.length} cars)`);
check('…beside price, condition, mileage, performance, weight and seats', allRows.every(r => r.price && r.cond && r.perf && r.weight && r.mileage), '');
check('the dealer\'s list shows cargo capacity on every car', Object.values(dealer.lots).every(l => l.listCargo === l.cars), JSON.stringify(Object.fromEntries(Object.entries(dealer.lots).map(([k, l]) => [k, [l.listCargo, l.cars]]))));
check('the cargo line fits a 390 px phone', allRows.every(r => r.w > 0 && r.w <= 390), '');
const garageUI = await ev(() => {
  const g = window.game, uw = g.uw, out = {};
  if (!uw.props.owned('linden')) uw.props.buy('linden');
  const e = g.content.addToGarage('van', 'bought', 0xffffff, true); e.trunk = { green: 40 };
  uw.ui.open('garage'); out.app = document.getElementById('empBody').textContent;
  g.ui.closeAll();
  const gp = uw.props.garagePoints().find(p => p.id === 'linden'); g.content.openGarage(gp); out.menu = document.getElementById('svcBody').textContent;
  while (g.ui.stack.length) g.ui.back();
  out.uid = e.uid;
  return out;
});
check('Garage app: cargo capacity and the trunk load for every owned car', /Cargo Capacity\s*2,000 lb/.test(garageUI.app) && /Green · 20 lb/.test(garageUI.app), garageUI.app.slice(0, 300));
check('Garage menu at the property: cargo load of capacity per car', /Cargo\s*20 lb of 2,000 lb/.test(garageUI.menu), garageUI.menu.slice(0, 300));

// ---------------------------------------------------------------- 4. proximity: what is within reach
const reach = await ev(async () => {
  const g = window.game, uw = g.uw, S = uw.S, P = window.__pv, out = {};
  for (const id of ['flop', 'whse_w']) if (!uw.props.owned(id)) uw.props.buy(id);
  const F = uw.loc('prop', 'flop');
  g.resetPlayerState(F.x, F.z, 0);
  // our own car parked beside the flop, and a stolen one we just drove up in
  const v = g.vehicles.spawn('van', F.x + 4, F.z + 3, 0, { parked: true }); v.touched = true; v.trunk = { smokes: 10 }; g.player.lastVehicle = v;
  const keys = () => uw.locations({ all: true }).map(L => (L.here ? '+' : '-') + L.key);
  out.atFlop = keys();
  // standing beside the van out on the street, away from any property
  g.resetPlayerState(F.x + 4, F.z + 40, 0); v.pos.set(F.x + 6, v.pos.y, F.z + 40);
  out.street = keys();
  // walked away from it
  g.resetPlayerState(F.x + 60, F.z + 60, 0);
  out.away = keys();
  // the warehouse across town is listed but not within reach, and a direct move is refused
  S.storage.whse_w = { green: 8, $cb: { green: 400 } };
  S.inv.snow = 4;
  out.remoteMove = uw.transfer('inv', 'p:whse_w', 'snow', 4) + uw.transfer('p:whse_w', 'inv', 'green', 8);
  out.after = { inv: S.inv.snow | 0, whse: S.storage.whse_w.green | 0, whseSnow: S.storage.whse_w.snow | 0 };
  g.vehicles.despawn(v);
  return out;
});
check('at a property with your car beside it: pockets, the car and the stash are all within reach', reach.atFlop.includes('+inv') && reach.atFlop.includes('+veh') && reach.atFlop.includes('+p:flop'), reach.atFlop.join(' '));
check('…and the warehouse across town is listed read-only', reach.atFlop.includes('-p:whse_w'), reach.atFlop.join(' '));
check('beside your car on the street: pockets ↔ car only', reach.street.includes('+inv') && reach.street.includes('+veh') && !reach.street.includes('+p:flop'), reach.street.join(' '));
check('walk away and the car drops out of reach, but its cargo stays listed (read-only, "where you left it")', !reach.away.includes('+veh') && reach.away.filter(k => k[0] === '+').length === 1 && reach.away.includes('-last'), reach.away.join(' '));
check('no teleporting: a direct move to or from a stash across town is refused and nothing changes', reach.remoteMove === 0 && reach.after.inv === 4 && reach.after.whse === 8 && reach.after.whseSnow === 0, JSON.stringify(reach.after));

// inside a house, with a car parked out front, and the house's own garage
await ev(() => {
  const g = window.game, home = g.content.homeOf('linden'), d = home.door;
  g.resetPlayerState(d.x + Math.sin(d.h) * 3, d.z + Math.cos(d.h) * 3, 0);
  const v = g.vehicles.spawn('pickup', d.x + Math.sin(d.h) * 9, d.z + Math.cos(d.h) * 9, 0, { parked: true }); v.touched = true; v.trunk = {}; g.player.lastVehicle = v;
});
await ev(uid => { window.__garUid = uid; }, garageUI.uid);
await ev(() => window.game.content.enterHome('linden')); await fadeDone(); await frames(page, 4);
const inside = await ev(() => {
  const g = window.game, uw = g.uw, out = {};
  out.interior = !!g.player.interior;
  const e = g.save.garage.find(x => x.uid === window.__garUid);
  out.bay = e && e.at ? e.at.p : null;
  out.keys = uw.locations({ all: true }).map(L => (L.here ? '+' : '-') + L.key);
  return out;
});
check('inside the house with the pickup out front: pockets, the house stash and the pickup are within reach', inside.interior && inside.keys.includes('+inv') && inside.keys.includes('+p:linden') && inside.keys.includes('+veh'), inside.keys.join(' '));
check('the cars stored in that house\'s own garage are within reach too', inside.bay === 'linden' && inside.keys.includes('+car:' + garageUI.uid), inside.keys.join(' '));
check('…but the flop and the warehouse are not', inside.keys.includes('-p:flop') && inside.keys.includes('-p:whse_w'), '');

// ---------------------------------------------------------------- 5. the Inventory app: tap to move, thumb-sized, conserving
const ui = await ev(async () => {
  const g = window.game, uw = g.uw, S = uw.S, E = uw.ui, out = {};
  S.inv = { green: 6, $cb: { green: 330 } };
  E.open('inventory'); E.tab = 'stash'; E.render();
  const body = document.getElementById('empBody');
  const chips = [...body.querySelectorAll('[data-act^="xf:from:"]')].map(b => b.dataset.act);
  out.chips = chips;
  out.btns = [...body.querySelectorAll('[data-act^="xm:green:"]')].map(b => ({ t: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) }));
  out.overflow = body.scrollWidth > body.clientWidth + 1;
  out.remoteCards = [...body.querySelectorAll('.card.remote')].map(c => c.dataset.loc);
  out.reachCards = [...body.querySelectorAll('.card.reach')].map(c => c.dataset.loc);
  out.remoteOpacity = body.querySelector('.card.remote') ? +getComputedStyle(body.querySelector('.card.remote')).opacity : 1;
  out.remoteBtns = [...body.querySelectorAll('.card.remote button')].filter(b => /xm:|xf:/.test(b.dataset.act || '')).length;
  // pockets → the house stash: 1 lb, then Max
  E.act('xf:from:inv'); E.act('xf:to:p~linden');
  E.act('xm:green:2'); out.one = { inv: S.inv.green | 0, st: S.storage.linden.green | 0, cbInv: S.inv.$cb && S.inv.$cb.green, cbSt: S.storage.linden.$cb && S.storage.linden.$cb.green };
  E.act('xm:green:-1'); out.max = { inv: S.inv.green | 0, st: S.storage.linden.green | 0 };
  // swap: stash → pockets, 1 lb
  E.act('xf:swap'); E.act('xm:green:2'); out.back = { inv: S.inv.green | 0, st: S.storage.linden.green | 0, from: E.xfer.from };
  out.msg = E.msg;
  return out;
});
check('Inventory app lists every place within reach as a "from" choice (pockets, house, its garage car, the pickup)', ui.chips.length >= 4, ui.chips.join(' '));
check('Inventory app: 1 lb / 5 lb / 10 lb / Max buttons, thumb-sized (≥ 44 px), no sideways scroll at 390 px', ui.btns.map(b => b.t).join('|') === '1 lb|5 lb|10 lb|Max' && ui.btns.every(b => b.h >= 44) && !ui.overflow, JSON.stringify(ui.btns));
check('remote places are dimmed read-only cards with no transfer buttons', ui.remoteCards.includes('p:flop') && ui.remoteCards.includes('p:whse_w') && ui.remoteOpacity < 0.7 && ui.remoteBtns === 0 && ui.reachCards.includes('p:linden'), JSON.stringify({ r: ui.remoteCards, o: ui.remoteOpacity }));
check('tap "1 lb": exactly two 0.5 lb lots move, with their share of the cost basis', ui.one.inv === 4 && ui.one.st === 2 && Math.abs(ui.one.cbInv - 220) < 0.01 && Math.abs(ui.one.cbSt - 110) < 0.01, JSON.stringify(ui.one));
check('tap "Max": the rest moves; swap and move back works', ui.max.inv === 0 && ui.max.st === 6 && ui.back.inv === 2 && ui.back.st === 4 && ui.back.from === 'p:linden', JSON.stringify([ui.max, ui.back]));
const fuzz = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, P = window.__pv;
  // a busy mixed inventory spread over everything within reach
  S.inv = { hardware: 2, snow: 7, $cb: { hardware: 1800, snow: 2100 } };
  S.storage.linden = { green: 40, pills: 15, hot: 10, smokes: 10, hardware: 5, $cb: { green: 2400, pills: 1800, hot: 250, smokes: 200, hardware: 4500 } };
  const near = uw.locations().filter(L => L.here).map(L => L.key);
  const overNow = () => uw.locations().filter(L => L.here).filter(L => L.lb ? P.cargoC(L.o) > L.capC : L.key === 'inv' ? uw.pocketFree() < 0 : uw.props.storageFree(L.prop) < 0).length;
  const over0 = overNow();
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const ids = Object.keys(P.GOODS); let moved = 0, refused = 0, over = 0;
  for (let i = 0; i < 400; i++) {
    const a = near[Math.floor(rnd() * near.length)], bb = near[Math.floor(rnd() * near.length)], k = ids[Math.floor(rnd() * ids.length)];
    const n = [1, 2, 5, 10, 20, 1e6][Math.floor(rnd() * 6)];
    const r = uw.transfer(a, bb, k, n); if (r) moved += r; else refused++;
    over += overNow();
  }
  return { near, moved, refused, over, over0 };
});
check('400 random transfers between every reachable place: lots moved, nothing ever over capacity', fuzz.moved > 100 && fuzz.over0 === 0 && fuzz.over === 0, JSON.stringify(fuzz));
// conservation across the fuzz itself: re-run it against a census taken right before
const fz2 = await ev(() => { const g = window.game, uw = g.uw, S = uw.S, P = window.__pv, G = P.GOODS; const sum = () => { const seen = new Set(), tot = {}, cb = {}; const add = o => { if (!o || seen.has(o)) return; seen.add(o); for (const k in G) { tot[k] = (tot[k] || 0) + (o[k] | 0); cb[k] = (cb[k] || 0) + (o.$cb && o.$cb[k] || 0); } }; add(S.inv); for (const id in S.storage) add(S.storage[id]); for (const e of g.save.garage) add(e.trunk); for (const v of g.vehicles.list) add(v.trunk); return { tot, cb }; };
  const a = sum(); const near = uw.locations().filter(L => L.here).map(L => L.key), ids = Object.keys(G); let s2 = 99;
  const rnd = () => { s2 = (s2 * 1103515245 + 12345) & 0x7fffffff; return s2 / 0x7fffffff; };
  for (let i = 0; i < 600; i++) uw.transfer(near[Math.floor(rnd() * near.length)], near[Math.floor(rnd() * near.length)], ids[Math.floor(rnd() * ids.length)], [1, 3, 10, 1e6][Math.floor(rnd() * 4)]);
  const z = sum(); return { lots: ids.every(k => a.tot[k] === z.tot[k]), cost: ids.every(k => Math.abs(a.cb[k] - z.cb[k]) < 0.01), a: a.tot, z: z.tot };
});
check('600 more random transfers: every lot and every cent of cost basis conserved exactly', fz2.lots && fz2.cost, JSON.stringify([fz2.a, fz2.z]));
await ev(() => { const g = window.game; g.ui.closeAll(); });

// ---------------------------------------------------------------- 6. selling a car never throws cargo away silently
await ev(() => window.game.content.interiors.exit(true)); await frames(page, 3);
const sale = await ev(async () => {
  const g = window.game, uw = g.uw, S = uw.S, out = {};
  const e = g.save.garage.find(x => x.uid === window.__garUid);
  e.trunk.green = 3000; // 1,500 lb: far more than the house stash and pockets can take
  const gp = uw.props.garagePoints().find(p => p.id === 'linden'); g.content.openGarage(gp);
  const n0 = g.save.garage.length;
  g.content._svcAct('sell:' + e.uid);
  out.blocked = g.save.garage.length === n0 && document.getElementById('svcHint').textContent;
  while (g.ui.stack.length) g.ui.back();
  // chop shop: a stolen car with cargo asks first
  const v = g.vehicles.spawn('sedan', g.player.pos.x + 3, g.player.pos.z, 0, { parked: true }); v.trunk = { smokes: 5 };
  let asked = null; const keep = g.ui.ask; g.ui.ask = (title, text) => { asked = title + ' / ' + text; };
  uw.sellCar(v); g.ui.ask = keep;
  out.chopAsked = asked; out.chopKept = g.vehicles.list.includes(v) && v.trunk.smokes === 5;
  g.vehicles.despawn(v);
  e.trunk.green = 40;
  return out;
});
check('a garage sale that would lose cargo is refused with the reason', /Empty the trunk first/.test(sale.blocked || ''), String(sale.blocked));
check('the chop shop asks before keeping a loaded trunk (nothing taken until you agree)', /cargo/i.test(sale.chopAsked || '') && sale.chopKept, String(sale.chopAsked));

// ---------------------------------------------------------------- 7. save / reload and a v6 save
const pre = await ev(() => { const g = window.game, e = g.save.garage.find(x => x.uid === window.__garUid); e.trunk = { green: 41, snow: 17, $cb: { green: 2460.5, snow: 5100 } }; g.uw.S.inv = { pills: 3, $cb: { pills: 300 } }; g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true); return JSON.stringify(e.trunk); });
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.waitForFunction(() => { const b = document.getElementById('btnContinue'); return b && !b.disabled && b.offsetParent; }, null, { timeout: 120000 }); await ev(() => document.getElementById('btnContinue').click()); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
const post = await ev(uid => { const g = window.game, e = g.save.garage.find(x => x.uid === uid); return { t: JSON.stringify(e.trunk), inv: g.uw.S.inv.pills, v: g.save.version }; }, garageUI.uid);
check('trunk contents and cost basis survive a save and reload exactly', post.t === pre && post.inv === 3, `${post.t} vs ${pre}`);
await ev(uid => {
  const g = window.game, raw = JSON.parse(localStorage.getItem(window.__pv.GAME_CONFIG.save.key));
  raw.version = 6; const e = raw.garage.find(x => x.uid === uid); e.trunk = { hardware: 12, hot: 30, $cb: { hardware: 10800 } };
  if (raw.uw && raw.uw.factions) for (const k in raw.uw.factions) { delete raw.uw.factions[k].aggro; delete raw.uw.factions[k].trouble; }
  if (raw.gamble && raw.gamble.jp) raw.gamble.jp.pr = { m1b: 0.3, m10k: 2 };
  localStorage.setItem(window.__pv.GAME_CONFIG.save.key, JSON.stringify(raw)); g.wiped = true;
}, garageUI.uid);
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.waitForFunction(() => { const b = document.getElementById('btnContinue'); return b && !b.disabled && b.offsetParent; }, null, { timeout: 120000 }); await ev(() => document.getElementById('btnContinue').click()); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
const mig = await ev(uid => { const g = window.game, e = g.save.garage.find(x => x.uid === uid), P = window.__pv; return { v: g.save.version, from: g.save.flags.migratedFrom, t: { hardware: e.trunk.hardware, hot: e.trunk.hot, cb: e.trunk.$cb && e.trunk.$cb.hardware }, lb: P.fmtLb(P.cargoC(e.trunk)), aggro: Object.values(g.uw.S.factions).map(f => f.aggro), pr: g.save.gamble.jp.pr }; }, garageUI.uid);
check('a v6 save loads as v7 with its trunk to the lot and its cost basis (now weighed: 90 lb)', mig.v === 7 && mig.from === 6 && mig.t.hardware === 12 && mig.t.hot === 30 && mig.t.cb === 10800 && mig.lb === '90 lb', JSON.stringify(mig));
check('v6 → v7: factions start calm; old jackpot pressure (old units) is reset to start fresh from the steady state', mig.aggro.every(a => a === 0) && JSON.stringify(mig.pr) === '{}', JSON.stringify(mig));

check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
await finish(b, 'cargo');
