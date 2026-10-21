/* Warehouses, vault and logistics (overhaul Session 3A, handoff §5-§8, §45.22).
   - Four security categories bought in tiers from Clean Bank; the level (1-5) is 1 + the weakest; the vault tier sets
     the Dirty Cash vault capacity and the product storage.
   - 15 crew slots: at most 10 Enforcers, 4 Drivers, 1 Lieutenant. A Driver is based at a warehouse.
   - The vault caps cash moved in by hand, and remote income that finds the vault full passes on down the §45.22
     order. The Treasury Warehouse is designated from the warehouse screen.
   - Dealers sell only the stock on their corner, brought by hand or by a Driver; the takings go to the warehouse
     that supplies them. Only Drivers make runs; supply runs buy at a supplier with vault cash.
   - Route risk by who holds each stretch (own, friendly, neutral, rival, hostile/war), police risk separate.
   - A Lieutenant automates corner resupply and reorders from suppliers.
   - Maximum Security plus 4 Enforcers and a Lieutenant: ordinary rival raids can't knock it off.
   - City Kingpin needs an operating warehouse. State survives save and reload. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
await ev(() => {
  const g = window.game, uw = g.uw, M = g.money;
  g.events.cool = 1e9; g.debug.god = true; g.save.rep = 3000; g.police.enabled = false;
  M.W.clean = 1e7; M.W.dirty.me = 0;
  // crew to work with: eight hires, all made Captains so any of them can be a Lieutenant
  window.__hire = n => { const out = []; for (let k = 0; k < n; k++) { uw.crew.refreshCandidates(true); uw.crew.S.cand[0].fee = 1; M.W.dirty.me += 10; uw.crew.hire(0); const c = uw.S.crew[uw.S.crew.length - 1]; c.rank = 3; c.loyalty = 90; c.traits = []; c.skill = 70; out.push(c.id); } return out; };
});

// ---------------------------------------------------------------- 1. buying and the security path
const sec = await ev(() => {
  const g = window.game, uw = g.uw, W = uw.whse, M = g.money, out = {};
  out.buy = uw.props.buy('whse_w');
  out.l1 = { level: W.level('whse_w'), name: W.levelName('whse_w'), vault: W.vaultCap('whse_w'), store: uw.props.storageCap('whse_w') };
  out.cost1 = W.upgradeCost('whse_w', 'perimeter'); const c0 = M.W.clean; out.e1 = W.upgrade('whse_w', 'perimeter'); out.paid = c0 - M.W.clean;
  out.oneCat = W.level('whse_w');
  for (const k of ['surveillance', 'access', 'vault']) W.upgrade('whse_w', k);
  out.l2 = { level: W.level('whse_w'), name: W.levelName('whse_w'), vault: W.vaultCap('whse_w'), store: uw.props.storageCap('whse_w') };
  // the rest of the way to Maximum Security
  for (let t = 0; t < 3; t++) for (const k of ['perimeter', 'surveillance', 'access', 'vault']) W.upgrade('whse_w', k);
  out.l5 = { level: W.level('whse_w'), name: W.levelName('whse_w'), vault: W.vaultCap('whse_w'), store: uw.props.storageCap('whse_w'), more: W.upgrade('whse_w', 'vault') };
  M.W.clean = 0; out.broke = W.upgrade('whse_d', 'vault'); M.W.clean = 1e7;
  return out;
});
check('a new warehouse is level 1 Basic: $100,000 vault, its base storage', sec.buy === '' && sec.l1.level === 1 && sec.l1.name === 'Basic' && sec.l1.vault === 100000 && sec.l1.store === 600, JSON.stringify(sec));
check('an upgrade is paid from Clean Bank (tier 1: 15% of the price, to the $500); one category alone does not raise the level', sec.e1 === '' && sec.cost1 === 5000 && sec.paid === sec.cost1 && sec.oneCat === 1, JSON.stringify(sec));
check('all four categories at tier 1: level 2 Reinforced, a bigger vault and floor', sec.l2.level === 2 && sec.l2.name === 'Reinforced' && sec.l2.vault === 500000 && sec.l2.store === 750, JSON.stringify(sec));
check('all four at the top: level 5 Maximum Security, $50M vault, double floor, nothing more to buy', sec.l5.level === 5 && sec.l5.name === 'Maximum Security' && sec.l5.vault === 50000000 && sec.l5.store === 1200 && /best/.test(sec.l5.more), JSON.stringify(sec));
check('you can only upgrade a warehouse you own', /own/.test(sec.broke), sec.broke);

// ---------------------------------------------------------------- 2. the vault and the treasury
const vault = await ev(() => {
  const g = window.game, uw = g.uw, M = g.money, out = {};
  uw.props.buy('whse_d'); uw.props.buy('flop'); g.save.home = 'flop';
  // stand at Tidewater Shed 4 (level 1: $100,000 vault)
  const L = uw.loc('prop', 'whse_d'); g.resetPlayerState(L.x, L.z, 0);
  M.W.dirty.me = 250000;
  uw.ui.openProp('whse_d'); uw.ui.whTab = 'cash'; g.content.refreshSvc();
  g.content._svcAct('wcash:in:-1');
  out.deposit = { me: M.W.dirty.me, vault: M.dirtyAtProp('whse_d') };
  // designate it the treasury from its screen
  g.content._svcAct('wtreas'); out.treasury = M.treasury;
  while (g.ui.stack.length) g.ui.back();
  // remote income with the treasury full: the rest goes on to your home
  M.W.dirty.prop.flop = 0; M.earn(30000, 'royalty');
  out.overflow = { vault: M.dirtyAtProp('whse_d'), home: M.dirtyAtProp('flop') };
  // room in it again: income lands there
  M.W.dirty.prop.whse_d = 60000; M.earn(30000, 'royalty'); out.room = M.dirtyAtProp('whse_d');
  return out;
});
check('depositing more than the vault holds stops at its capacity; the rest stays on you', vault.deposit.vault === 100000 && vault.deposit.me === 150000, JSON.stringify(vault));
check('the Treasury Warehouse is designated from the warehouse screen', vault.treasury === 'whse_d', JSON.stringify(vault));
check('income with the treasury full passes on to your home safehouse, none lost', vault.overflow.vault === 100000 && vault.overflow.home === 30000, JSON.stringify(vault));
check('with room again, income lands in the treasury', vault.room === 90000, JSON.stringify(vault));

// ---------------------------------------------------------------- 3. 15 slots, roles
const slots = await ev(() => {
  const g = window.game, uw = g.uw, CM = uw.crew, out = {};
  const ids = window.__hire(17), crew = ids.map(id => CM.find(id));
  const at = (c, role) => CM.assign(c.id, role, 'w:whse_w');
  out.enf = crew.slice(0, 11).map(c => at(c, 'enforcer'));
  out.drv = crew.slice(11, 16).map(c => at(c, 'driver'));
  out.lt = at(crew[16], 'lieutenant');
  out.used = uw.whse.slotsUsed('whse_w');
  out.counts = { enf: uw.whse.crewAt('whse_w', 'enforcer').length, drv: uw.whse.crewAt('whse_w', 'driver').length, lt: uw.whse.crewAt('whse_w', 'lieutenant').length };
  // full house: a sixteenth person can't come in
  const extra = window.__hire(1)[0]; out.full = CM.assign(extra, 'enforcer', 'w:whse_w');
  out.noBase = CM.assign(extra, 'driver', null);
  out.ltZone = CM.ltZone(crew[16]); out.whZone = uw.loc('prop', 'whse_w').zone;
  out.cap = CM.cap();
  return out;
});
check('a warehouse takes at most 10 Enforcers, 4 Drivers and 1 Lieutenant', slots.enf.slice(0, 10).every(r => r === '') && /10/.test(slots.enf[10]) && slots.drv.slice(0, 4).every(r => r === '') && /4/.test(slots.drv[4]) && slots.lt === '' && JSON.stringify(slots.counts) === JSON.stringify({ enf: 10, drv: 4, lt: 1 }), JSON.stringify(slots));
check('15 people fill it; nobody else fits', slots.used === 15 && /full/.test(slots.full), JSON.stringify(slots));
check('a Driver must be based at a warehouse', /warehouse/i.test(slots.noBase), slots.noBase);
check('a warehouse’s Lieutenant runs its district', slots.ltZone === slots.whZone, JSON.stringify(slots));

// ---------------------------------------------------------------- 4. Dealers sell only their corner's stock
const sell = await ev(() => {
  const g = window.game, uw = g.uw, CM = uw.crew, M = g.money, S = uw.S, Inv = window.__pv.Inv, out = {};
  const i = uw.T.findIndex((t, n) => uw.owner[n] !== 'pc' && t.zone === uw.loc('prop', 'whse_w').zone) >= 0 ? uw.T.findIndex((t, n) => t.zone === uw.loc('prop', 'whse_w').zone) : 0;
  const dl = CM.find(window.__hire(1)[0]); out.assign = CM.assign(dl.id, 'dealer', i); dl.from = 'whse_w';
  S.storage.whse_w = {}; Inv.add(S.storage.whse_w, 'green', 100, 100 * 120);
  for (const k in uw.whse.turfStock(i)) delete uw.whse.turfStock(i)[k];
  const r0 = Math.random; Math.random = () => 0.99;
  try { CM.work(dl); } finally { Math.random = r0; }
  out.empty = { whse: Inv.has(S.storage.whse_w, 'green'), corner: Inv.has(uw.whse.turfStock(i), 'green') };
  // hand it over at the corner yourself (Inventory)
  const t = uw.T[i]; g.resetPlayerState(t.deal.x, t.deal.z, 0); S.inv = {}; Inv.add(S.inv, 'green', 20, 20 * 120);
  const loc = uw.locations().find(L => L.key === 'turf:' + i);
  out.loc = !!(loc && loc.here);
  out.moved = uw.transfer('inv', 'turf:' + i, 'green', 20);
  out.hotRefused = (() => { Inv.add(S.inv, 'hot', 2, 100); return uw.transfer('inv', 'turf:' + i, 'hot', 2); })();
  const v0 = M.dirtyAtProp('whse_w'), m0 = M.W.dirty.me;
  Math.random = () => 0.99; let res;
  try { res = CM.work(dl); } finally { Math.random = r0; }
  out.sold = res && res.units; out.cornerLeft = Inv.has(uw.whse.turfStock(i), 'green');
  out.toVault = M.dirtyAtProp('whse_w') - v0; out.toMe = M.W.dirty.me - m0;
  out.turf = i; out.dealer = dl.id;
  return out;
});
check('with product only in the warehouse, a Dealer sells nothing (no teleporting stock)', sell.assign === '' && sell.empty.whse === 100 && sell.empty.corner === 0, JSON.stringify(sell));
check('at the corner you can hand stock over yourself, but not hot goods', sell.loc && sell.moved === 20 && sell.hotRefused === 0, JSON.stringify(sell));
check('the Dealer sells from the corner, and the takings go to the warehouse that supplies it', sell.sold > 0 && sell.cornerLeft === 20 - sell.sold && sell.toVault > 0 && sell.toMe === 0, JSON.stringify(sell));

// ---------------------------------------------------------------- 5. Drivers, supply runs and route risk
const runs = await ev(arg => {
  const g = window.game, uw = g.uw, CM = uw.crew, R = uw.runs, M = g.money, S = uw.S, Inv = window.__pv.Inv, out = {};
  const enf = uw.whse.crewAt('whse_w', 'enforcer')[0];
  out.notDriver = R.dispatch(enf.id, 'whse_w', 'turf:' + arg.turf, 'green', 5);
  const drv = uw.whse.crewAt('whse_w', 'driver').find(c => !S.runs.some(r => r.crew === c.id));
  // a supply run: buy at Dockside Sully with the vault's cash
  M.W.dirty.prop.whse_w = 20000; M.W.dirty.me = 0;
  const st0 = Inv.has(S.storage.whse_w, 'smokes'), v0 = M.dirtyAtProp('whse_w');
  out.supply = R.dispatch(drv.id, 'spot:sully', 'whse_w', 'smokes', 10);
  const run = S.runs.find(r => r.crew === drv.id);
  out.paid = v0 - M.dirtyAtProp('whse_w'); out.cost = run && run.cost; out.fee = run ? run.fee : 'none';
  out.inTransit = Inv.has(S.storage.whse_w, 'smokes') === st0;
  const rep = run ? R.resolve(run, 0) : null; out.outcome = rep && rep.outcome;
  out.arrived = Inv.has(S.storage.whse_w, 'smokes') - st0; out.basis = Math.round(Inv.cost(S.storage.whse_w, 'smokes'));
  // route risk tiers: classify stretches and compare the same run over different ground
  const kinds = {}; for (let i = 0; i < uw.T.length; i++) { const k = R.stretch(i); kinds[k] = kinds[k] || i; }
  out.kinds = Object.keys(kinds).sort();
  const risk = k => window.__pv.GAME_CONFIG.underworld.routeRisk ? window.__pv.GAME_CONFIG.underworld.routeRisk[k] : null;
  out.tiers = ['own', 'friendly', 'neutral', 'rival', 'hostile'].map(risk);
  return out;
}, { turf: sell.turf });
check('only a Driver makes deliveries', /Driver/.test(runs.notDriver), runs.notDriver);
check('a supply run buys at the supplier with the vault’s cash; the product is on the road, then arrives with its cost basis', runs.supply === '' && runs.paid === runs.cost && runs.fee === undefined && runs.inTransit && runs.outcome === 'success' && runs.arrived === 10 && runs.basis >= runs.cost, JSON.stringify(runs));
check('route risk tiers rise from own turf to hostile ground (own < friendly < neutral < rival < hostile)', runs.tiers.every((x, i, a) => typeof x === 'number' && (i === 0 || x > a[i - 1])), JSON.stringify(runs.tiers));
const routes = await ev(() => {
  const g = window.game, uw = g.uw, R = uw.runs, S = uw.S, out = {};
  const drv = uw.whse.crewAt('whse_w', 'driver')[0];
  // the same run, with the whole route's turfs made the player's, then a rival's at war
  const keep = S.turfs.map(t => ({ own: t.own, war: t.war }));
  for (const t of S.turfs) { t.own = 'pc'; t.war = null; } uw.recompute();
  const a = R.assess(drv, 'whse_w', 'whse_d', 'green', 5);
  for (const t of S.turfs) { t.own = 'vipers'; t.war = { a: 'tidewater', d: 'vipers', hrs: 10 }; } uw.recompute();
  const z = R.assess(drv, 'whse_w', 'whse_d', 'green', 5);
  S.turfs.forEach((t, i) => { t.own = keep[i].own; t.war = keep[i].war; }); uw.recompute();
  return { own: { p: +a.p.toFixed(3), rival: +a.rival.toFixed(3), police: +a.police.toFixed(3), kinds: a.kinds }, war: { p: +z.p.toFixed(3), rival: +z.rival.toFixed(3), police: +z.police.toFixed(3), kinds: z.kinds } };
});
check('a route over your own turf has almost no hijack risk; over a war zone a lot more; police risk is counted separately', routes.own.kinds.every(k => k === 'own') && routes.war.kinds.every(k => k === 'hostile') && routes.own.rival < 0.01 && routes.war.rival > 0.3 && routes.war.p < routes.own.p && routes.own.police >= 0, JSON.stringify(routes));

// ---------------------------------------------------------------- 6. the Lieutenant automates resupply
const auto = await ev(arg => {
  const g = window.game, uw = g.uw, S = uw.S, Inv = window.__pv.Inv, M = g.money, out = {};
  for (const r of S.runs.slice()) uw.runs.resolve(r, 0);
  const i = arg.turf, corner = uw.whse.turfStock(i); for (const k in corner) delete corner[k];
  S.storage.whse_w = {}; Inv.add(S.storage.whse_w, 'green', 200, 200 * 120);
  M.W.dirty.prop.whse_w = 50000;
  const sent = uw.whse.automate();
  out.sent = sent; out.runs = S.runs.filter(r => r.auto).map(r => ({ from: r.from, to: r.to, good: r.good, n: r.n }));
  for (const r of S.runs.slice()) uw.runs.resolve(r, 0);
  out.corner = units(corner);
  // with the warehouse nearly empty, the Lieutenant reorders from a supplier
  S.storage.whse_w = {}; for (const k in corner) delete corner[k]; Inv.add(corner, 'green', 50, 50 * 120);
  out.reorder = uw.whse.automate();
  out.reorderRuns = S.runs.filter(r => r.auto && r.from.startsWith('spot:')).map(r => ({ from: r.from, to: r.to, n: r.n }));
  for (const r of S.runs.slice()) uw.runs.resolve(r, 0);
  // automation off: nothing is sent
  uw.whse.st('whse_w').auto = false; for (const k in corner) delete corner[k]; Inv.add(S.storage.whse_w, 'green', 50, 50 * 120);
  out.off = uw.whse.automate().length; uw.whse.st('whse_w').auto = true;
  return out;
  function units(o) { let n = 0; for (const k in o) if (k !== '$cb') n += o[k] * window.__pv.GOODS[k].size; return n; }
}, { turf: sell.turf });
check('each day the Lieutenant sends a free Driver to top up the Dealer’s corner from the warehouse', auto.runs.length >= 1 && auto.runs[0].from === 'whse_w' && auto.runs[0].to === 'turf:' + sell.turf && auto.corner >= 39, JSON.stringify(auto));
check('when the warehouse runs low, the Lieutenant reorders from a supplier', auto.reorderRuns.length >= 1 && auto.reorderRuns[0].to === 'whse_w', JSON.stringify(auto));
check('with automatic resupply off, nothing is sent', auto.off === 0, JSON.stringify(auto));

// ---------------------------------------------------------------- 7. raids and immunity
const raid = await ev(() => {
  const g = window.game, uw = g.uw, PM = uw.props, S = uw.S, out = {};
  const near = uw.turfNeighbors(window.__pv.turfAt(uw.loc('prop', 'whse_w').x, uw.loc('prop', 'whse_w').z)).concat([window.__pv.turfAt(uw.loc('prop', 'whse_w').x, uw.loc('prop', 'whse_w').z)]);
  for (const i of near) S.turfs[i].own = 'vipers'; uw.recompute();
  const f = S.factions.vipers; f.rel = -90; f.truce = 0; f.broken = 0; f.strength = 80;
  out.immune = uw.whse.immune('whse_w');
  for (const id in S.props) S.props[id].dmg = 0;
  const r0 = Math.random; Math.random = () => 0;
  try { PM.rivalAttacks(true); } finally { Math.random = r0; }
  out.immuneDmg = S.props.whse_w.dmg;
  // pull the Enforcers out: now an ordinary raid can land
  const enf = uw.whse.crewAt('whse_w', 'enforcer'); for (const c of enf) c.status = 'hurt';
  out.notImmune = uw.whse.immune('whse_w');
  Math.random = () => 0; try { PM.rivalAttacks(true); } finally { Math.random = r0; }
  out.dmg = S.props.whse_w.dmg; for (const c of enf) c.status = 'active'; S.props.whse_w.dmg = 0;
  return out;
});
check('Maximum Security, 4+ Enforcers and a Lieutenant: an ordinary raid can’t knock it off', raid.immune && raid.immuneDmg === 0, JSON.stringify(raid));
check('without the minimum staff the same raid lands', !raid.notImmune && raid.dmg === 1, JSON.stringify(raid));

// ---------------------------------------------------------------- 8. Kingpin needs an operating warehouse
const kp = await ev(() => {
  const g = window.game, uw = g.uw, P = window.__pv;
  return { need: P.RANKS[6].need.wh, ops: uw.whse.operatingCount(), power: uw.power().wh };
});
check('City Kingpin needs an operating warehouse (a Lieutenant and a Driver); this one counts', kp.need === 1 && kp.ops >= 1 && kp.power === kp.ops, JSON.stringify(kp));

// ---------------------------------------------------------------- 9. the warehouse screen
const ui = await ev(() => {
  const g = window.game, uw = g.uw, out = {};
  uw.ui.openProp('whse_w');
  for (const t of ['product', 'weapons', 'cash', 'security', 'crew', 'logistics']) { uw.ui.whTab = t; g.content.refreshSvc(); out[t] = document.getElementById('svcBody').textContent.length; }
  uw.ui.whTab = 'security'; g.content.refreshSvc(); out.secText = /Maximum Security/.test(document.getElementById('svcBody').textContent);
  while (g.ui.stack.length) g.ui.back();
  return out;
});
check('the warehouse screen has Product, Weapons, Dirty Cash, Security, Crew and Logistics', ['product', 'weapons', 'cash', 'security', 'crew', 'logistics'].every(k => ui[k] > 100) && ui.secText, JSON.stringify(ui));

// ---------------------------------------------------------------- 10. save and reload
const pre = await ev(arg => { const g = window.game, uw = g.uw; g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true); return { whse: JSON.stringify(uw.S.whse), crew: uw.S.crew.map(c => c.id + ':' + c.role + ':' + c.assign + ':' + (c.from || '')).join(','), corner: JSON.stringify(uw.whse.turfStock(arg.turf)), treasury: g.money.treasury, vault: g.money.dirtyAtProp('whse_d') }; }, { turf: sell.turf });
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
const post = await ev(arg => { const g = window.game, uw = g.uw; return { whse: JSON.stringify(uw.S.whse), crew: uw.S.crew.map(c => c.id + ':' + c.role + ':' + c.assign + ':' + (c.from || '')).join(','), corner: JSON.stringify(uw.whse.turfStock(arg.turf)), treasury: g.money.treasury, vault: g.money.dirtyAtProp('whse_d') }; }, { turf: sell.turf });
check('save → reload: security, crew posts, dealer links, the corner, the treasury and the vault are identical', JSON.stringify(pre) === JSON.stringify(post), JSON.stringify({ pre, post }));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'warehouse');
