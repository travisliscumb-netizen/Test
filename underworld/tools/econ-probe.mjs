// usage: node underworld/tools/econ-probe.mjs [path-to-index.html] [out.json]
// The M13 economy probe: boots the game and measures every money loop through the game's own functions (prices,
// loot tables, payout rules, the daily simulation), so the balance tables in ECONOMY.md come from the build, not
// from intuition. Not a test: it prints a report and writes JSON. Deterministic where the game lets it be.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
process.env.UW_FILE = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(HERE, '..', 'index.html');
const OUT = process.argv[3] ? path.resolve(process.argv[3]) : path.resolve(HERE, '..', '.runs', 'econ.json');
const { launch, open, startNew } = await import('../tests/lib.mjs');
const b = await launch();
const t = await open(b);
const page = t.page;
const ev = (f, a) => page.evaluate(f, a);
await startNew(page);
await ev(() => { const g = window.game; g.events.cool = 1e9; g.traffic.enabled = false; g.police.enabled = false; g.save.settings.guide = false; });
const R = {};

// ---------------------------------------------------------------- A. catalogue: prices and payouts as built
R.catalogue = await ev(() => {
  const P = window.__pv, g = window.game, uw = g.uw, out = {};
  const by = k => P.PROPS.filter(p => p.kind === k).map(p => p.price).sort((a, b) => a - b);
  const q = a => a.length ? { n: a.length, min: a[0], med: a[a.length >> 1], max: a[a.length - 1] } : null;
  out.props = { safehouse: q(by('safehouse')), garage: q(by('garage')), warehouse: q(by('warehouse')), business: q(by('business')), motorsport: q(by('motorsport')), offroad: q(by('offroad')) };
  // businesses: price, daily gross/net at level 1 on neutral turf, payback days, upgrade costs and their payback
  const biz = P.PROPS.filter(p => p.kind === 'business').map(d => {
    const C2 = P.BIZ_CATS[d.cat] || { inc: [1, 1, 1] }, gross = lv => d.income * 1.2 * C2.inc[lv - 1], up = lv => d.income * [0.18, 0.24, 0.3][lv - 1];
    const net1 = gross(1) - up(1), net2 = gross(2) - up(2), net3 = gross(3) - up(3), u1 = P.bizUpgradeCost(d, 1), u2 = P.bizUpgradeCost(d, 2);
    return { id: d.id, cat: d.cat, price: d.price, net1: Math.round(net1), net3: Math.round(net3), payback: Math.round(d.price / net1), up1Payback: Math.round(u1 / Math.max(1, net2 - net1)), up2Payback: Math.round(u2 / Math.max(1, net3 - net2)), launder: !!d.launder };
  });
  const pb = biz.map(x => x.payback).sort((a, b) => a - b);
  out.business = { n: biz.length, payback: { min: pb[0], med: pb[pb.length >> 1], max: pb[pb.length - 1] }, up1: biz.map(x => x.up1Payback).sort((a, b) => a - b)[biz.length >> 1], up2: biz.map(x => x.up2Payback).sort((a, b) => a - b)[biz.length >> 1], totalPrice: biz.reduce((a, x) => a + x.price, 0), totalNet1: biz.reduce((a, x) => a + x.net1, 0), totalNet3: biz.reduce((a, x) => a + x.net3, 0), fronts: biz.filter(x => x.launder).length };
  // goods: street vs wholesale (a fresh market), the dealer's 72%
  out.goods = P.GOOD_IDS.map(k => { const zs = Object.keys(uw.S.market); const st = zs.map(z => uw.market.price(z, k)), ws = zs.map(z => uw.market.wholesale(z, k)); const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length); return { k, base: P.GOODS[k].base, street: avg(st), streetMax: Math.max(...st), wholesale: avg(ws), wholesaleMin: Math.min(...ws), margin: +(avg(st) / avg(ws)).toFixed(2), dealerMargin: +(avg(st) * 0.72 / avg(ws)).toFixed(2) }; });
  out.cars = { msrp: P.CAR_MSRP, resaleCap: 0.85 };
  out.races = (P.RACES || []).filter(r => !r.storyOnly).map(r => ({ id: r.id, reward: r.reward, rep: r.rep, fee: Math.round(r.reward * 0.15 / 10) * 10 }));
  out.vp = { events: (window.__pv.VP_EVENTS || []).map(e => ({ id: e.id, fee: e.fee, reward: e.reward })), park: window.__pv.VP_PARK };
  out.or = { events: (window.__pv.OR_EVENTS || []).map(e => ({ id: e.id, fee: e.fee, reward: e.reward })), park: window.__pv.OR_PARK };
  out.ranks = P.RANKS.map(r => ({ name: r.name, need: r.need }));
  out.fixer = { fee: 0.32, cap: 5000 };
  out.fronts = window.__pv.FRONT;
  out.tools = window.__pv.TOOLS;
  out.rob = window.__pv.ROB_THEMES;
  return out;
});

// ---------------------------------------------------------------- B. active loops: expected value per action
R.active = await ev(() => {
  const P = window.__pv, g = window.game, uw = g.uw, out = {};
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  // pickpocketing: mean cash per successful lift by district and hour (4,000 pedestrians each)
  const zs = Object.keys(P.ZONES), pk = {};
  for (const z of zs) for (const h of [3, 12, 22]) { let s = 0, hot = 0; for (let i = 0; i < 4000; i++) { const L = P.pocketLoot({ id: i * 7 + 1 }, z, rnd, h); s += L.cash; hot += L.hot; } pk[z + '@' + h] = { cash: Math.round(s / 4000), hot: +(hot / 4000).toFixed(2) }; }
  const all = Object.values(pk).map(x => x.cash); out.pickpocket = { byZoneHour: pk, mean: Math.round(all.reduce((a, b) => a + b, 0) / all.length), best: Math.max(...all), worst: Math.min(...all) };
  // burglary: a house's containers by tier, Monte Carlo of the loot table (cash + hot goods at the fence's price)
  const hotP = Math.round(uw.market.price('o', 'hot') * 0.85), homes = g.world.homes.filter(h => !h.propId && h.type !== 'farm'), byTier = {};
  for (const h of homes.slice(0, 160)) {
    const def = P.houseInteriorDef(h, null); const tier = def.tier, cs = def.containers || [];
    if (!cs.length) continue;
    let cash = 0, goods = 0; const N = 40;
    for (let k = 0; k < N; k++) for (const c of cs) { const L = P.rollLoot(c.kind, tier, rnd); cash += L.cash || 0; if (L.goods) for (const gk in L.goods) goods += (L.goods[gk] || 0) * (gk === 'hot' ? hotP : uw.market.price('o', gk)); }
    const T = byTier[tier] || (byTier[tier] = { n: 0, cash: 0, goods: 0, cont: 0 }); T.n++; T.cash += cash / N; T.goods += goods / N; T.cont += cs.length;
  }
  for (const k in byTier) { const T = byTier[k]; byTier[k] = { houses: T.n, containers: +(T.cont / T.n).toFixed(1), cash: Math.round(T.cash / T.n), goodsValue: Math.round(T.goods / T.n), total: Math.round((T.cash + T.goods) / T.n) }; }
  out.burglary = { byTier, lockpick: P.TOOLS.price, report: P.BURGLARY.report };
  // business robbery: till and safe midpoints per trade (the district multiplier ×0.8–1.4 aside), stock at street price
  out.robbery = {};
  for (const k in P.ROB_THEMES) { const T = P.ROB_THEMES[k], st = Object.keys(T.stock)[0], sv = (T.stock[st][0] + T.stock[st][1]) / 2 * uw.market.price('m', st); out.robbery[k] = { till: (T.till[0] + T.till[1]) / 2, safe: (T.safe[0] + T.safe[1]) / 2, stock: Math.round(sv), sec: T.sec, total: Math.round((T.till[0] + T.till[1]) / 2 + (T.safe[0] + T.safe[1]) / 2 + sv + 130) }; }
  out.robbery.fuelGo = { till: 320, safe: 2800 };
  out.robbable = P.PROPS.filter(p => p.kind === 'business' && P.robTheme(p)).length;
  // chop shop: a car's take by type (healthy, common), and on the wanted list
  out.chop = {};
  for (const ty of ['compact', 'sedan', 'suv', 'sports', 'muscle', 'luxury', 'supercar', 'pickup', 'van']) {
    if (!P.VEHICLES[ty]) continue;
    const want = uw.S.chopWanted.slice(); uw.S.chopWanted = []; const v1 = uw.chopValue({ type: ty, vtier: 'common', health: 100 }); uw.S.chopWanted = [ty]; const v2 = uw.chopValue({ type: ty, vtier: 'common', health: 100 }); uw.S.chopWanted = want;
    out.chop[ty] = { take: v1, wanted: v2, msrp: P.CAR_MSRP[ty] };
  }
  // races: the purse for 1st by repeat tier
  out.racePurse = P.RACE_T.purse;
  return out;
});

// ---------------------------------------------------------------- C. passive: build an empire and run the economic days
R.passive = await ev(async () => {
  const P = window.__pv, g = window.game, uw = g.uw, S = uw.S, M = g.money, out = {};
  const hire = (role, assign) => { uw.crew.refreshCandidates(true); uw.crew.S.cand[0].fee = 1; M.W.dirty.me += 10; uw.crew.hire(0); const c = S.crew[S.crew.length - 1]; c.loyalty = 90; c.traits = []; if (role) uw.crew.assign(c.id, role, assign); return c; };
  const snapshot = () => ({ dirty: M.dirtyTotal(), clean: M.clean });
  const run = (days, label) => { const a = snapshot(); const books = { inc: {}, exp: {} }; for (let d = 0; d < days; d++) { uw.tickDay(); const L = S.lastLedger || { inc: {}, exp: {} }; for (const k in L.inc) books.inc[k] = (books.inc[k] || 0) + L.inc[k]; for (const k in L.exp) books.exp[k] = (books.exp[k] || 0) + L.exp[k]; } const z = snapshot(); const per = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v / days)])); return { label, days, dirtyPerDay: Math.round((z.dirty - a.dirty) / days), cleanPerDay: Math.round((z.clean - a.clean) / days), inc: per(books.inc), exp: per(books.exp) }; };
  g.save.rep = 2000; M.W.clean = 5e7; M.W.dirty.me = 2e6;
  // stage 1: a Street Hustler with two dealers stocked by hand
  const T0 = uw.T.filter(t => t.zone === 'o' || t.zone === 's').slice(0, 2);
  for (const t of T0) { hire('dealer', t.i); uw.whse.turfStock(t.i).green = 60; }
  out.dealers2 = run(4, 'two dealers, 60 green each');
  // stage 2: + a safehouse, three businesses (no manager)
  const biz = P.PROPS.filter(p => p.kind === 'business').sort((a, b2) => a.price - b2.price).slice(0, 3);
  for (const d of biz) { uw.props.buy(d.id); S.props[d.id].since = S.day - 30; }
  out.biz3 = run(4, 'three cheapest businesses (established), plus the dealers');
  // stage 3: managers on those businesses
  for (const d of biz) hire('manager', d.id);
  out.biz3m = run(4, 'the same with managers');
  // stage 4: a mid empire: 12 established businesses with managers, 6 turfs held, a Lieutenant
  const more = P.PROPS.filter(p => p.kind === 'business' && !uw.props.owned(p.id)).sort((a, b2) => a.price - b2.price).slice(0, 9);
  for (const d of more) { uw.props.buy(d.id); S.props[d.id].since = S.day - 30; hire('manager', d.id); }
  const ts = uw.T.filter(t => uw.owner[t.i] !== 'pc').slice(0, 6); for (const t of ts) { uw.owner[t.i] = 'pc'; S.turfs[t.i].owner = 'pc'; S.turfs[t.i].inf.pc = 80; }
  out.mid = run(6, '12 managed businesses, 6 turfs, 2 dealers');
  out.midState = { businesses: uw.props.ownedList().filter(d => d.kind === 'business').length, crew: uw.crew.active().length, payroll: uw.crew.payroll(), influence: uw.influence, rank: uw.rank };
  // the jail comparison: the same empire, one jail day vs one street day
  S.jail = P.Prison.fresh({ total: 30, full: 30, lines: [] });
  out.midJail = run(6, 'the same empire while you are in jail');
  S.jail = null;
  return out;
});

console.log(JSON.stringify(R, null, 1));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(R, null, 1));
console.log('wrote', OUT, '· errors:', t.errors.slice(0, 3).join(' | ') || 'none');
await Promise.race([b.close().catch(() => {}), new Promise(r => setTimeout(r, 5000))]);
process.exit(0);
