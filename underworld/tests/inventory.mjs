/* Inventory, armory, crew deliveries and territory royalties.
   Product is counted in whole lots shown as lb / pieces; every unit belongs to exactly one place
   (pockets, a trunk, a safehouse, a property, a warehouse, or a run on the road); cost basis moves
   with the goods; market swings change value only; save/reload keeps everything to the lot; old
   v3 saves load with their stash intact. Guns are single items that live on you or in a stash;
   stashed guns survive an arrest. Runner deliveries: every outcome, capacity, mid-run reload and no
   duplication. Royalties: rivals on your turf pay, reluctantly early and automatically at the top. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const t = await open(b, {});
const page = t.page;
const ev = (f, a) => page.evaluate(f, a);
await startNew(page);
await ev(() => { const g = window.game; g.quality.setMode(0); g.events.cool = 1e9; g.police.enabled = false; g.traffic.enabled = false; g.save.money = 2e6; g.save.rep = 2500; });

// every lot of every good, everywhere it can be, plus what is on the road: the conservation total
const census = () => ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, G = window.__pv.GOODS, tot = {}, cost = {};
  const add = o => { if (!o) return; for (const k in G) { tot[k] = (tot[k] || 0) + (o[k] | 0); cost[k] = (cost[k] || 0) + (o.$cb && o.$cb[k] || 0); } };
  add(S.inv); for (const id in S.storage) add(S.storage[id]);
  const seen = new Set();
  for (const e of g.save.garage) { add(e.trunk); seen.add(e.trunk); }
  for (const v of g.vehicles.list) if (v.trunk && !seen.has(v.trunk)) { add(v.trunk); seen.add(v.trunk); }
  for (const r of S.runs) { tot[r.good] = (tot[r.good] || 0) + r.n; cost[r.good] = (cost[r.good] || 0) + r.cost; }
  return { tot, cost: Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, Math.round(v * 100) / 100])) };
});

// ---------------------------------------------------------------- 1. buying by weight
const gusL = await ev(() => { const L = window.game.uw.loc('spot', 'gus'); return { x: L.x, z: L.z }; });
await ev(L => window.game.resetPlayerState(L.x, L.z, 0), gusL); await frames(page, 4);
const buy1 = await ev(() => {
  const g = window.game, uw = g.uw, L = uw.loc('spot', 'gus'), z = L.zone, p = uw.market.wholesale(z, 'green');
  uw.ui.openSpot(L);
  const btns = [...document.querySelectorAll('#svcBody [data-act^="buy:green"]')].map(b => b.textContent.trim());
  const m0 = g.save.money;
  g.content._svcAct('buy:green:' + window.__pv.lotsFor('green', 1)); // 1 lb
  g.content._svcAct('buy:green:' + window.__pv.lotsFor('green', 2)); // 2 lb
  const r = { btns, lots: uw.S.inv.green | 0, cost: uw.S.inv.$cb && uw.S.inv.$cb.green, paid: m0 - g.save.money, unit: p };
  while (g.ui.stack.length) g.ui.back();
  return r;
});
check('suppliers sell by weight: 1 lb / 2 lb / 5 lb buttons', buy1.btns.length === 3 && /1 lb/.test(buy1.btns[0]) && /5 lb/.test(buy1.btns[2]), buy1.btns.join(' | '));
check('bought 1 lb + 2 lb of Green = 3 lb in pockets (6 lots of 0.5 lb)', buy1.lots === 6, JSON.stringify(buy1));
check('cost basis = exactly what was paid', Math.abs(buy1.cost - buy1.paid) < 0.01 && buy1.paid > 0, JSON.stringify(buy1));
const disp = await ev(() => window.__pv.fmtQty('green', window.game.uw.S.inv.green));
check('quantities display in game units', disp === '3.0 lb', disp);

// ---------------------------------------------------------------- 2. moving between every kind of place
const props = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S;
  for (const id of ['flop', 'linden', 'pawn', 'whse_w']) if (!uw.props.owned(id)) uw.props.buy(id);
  return ['flop', 'linden', 'pawn', 'whse_w'].map(id => ({ id, own: uw.props.owned(id), kind: window.__pv.PROP_BY_ID[id].kind, cap: window.__pv.PROP_BY_ID[id].storage }));
});
check('test setup: own a safehouse, a business and a warehouse', props.every(p => p.own), JSON.stringify(props));
const c0 = await census();
const moves = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, out = {};
  const L = uw.loc('prop', 'flop'); g.resetPlayerState(L.x, L.z, 0);
  // a car of our own beside us for the trunk
  const v = g.vehicles.spawn('van', L.x + 3, L.z + 3, 0, { parked: true }); v.touched = true; g.player.lastVehicle = v; v.trunk = {};
  uw.ui.openProp('flop');
  g.content._svcAct('st:green:' + window.__pv.lotsFor('green', 1)); out.flopAfterStore = S.storage.flop.green | 0; out.pockets1 = S.inv.green | 0;
  g.content._svcAct('ld:green:-1'); out.trunk = v.trunk.green | 0; out.flop2 = S.storage.flop.green | 0;
  g.content._svcAct('st:green'); out.flop3 = S.storage.flop.green | 0; out.trunk2 = v.trunk.green | 0; out.pockets2 = S.inv.green | 0;
  g.content._svcAct('tk:green:' + window.__pv.lotsFor('green', 1)); out.pockets3 = S.inv.green | 0;
  while (g.ui.stack.length) g.ui.back();
  // to the warehouse (largest storage) and the business
  const W = uw.loc('prop', 'whse_w'); g.resetPlayerState(W.x, W.z, 0); g.player.lastVehicle = null;
  uw.ui.openProp('whse_w'); g.content._svcAct('st:green:-1'); out.whse = S.storage.whse_w.green | 0; out.pockets4 = S.inv.green | 0;
  while (g.ui.stack.length) g.ui.back();
  g.vehicles.despawn(v);
  out.locs = uw.locations({ all: true }).map(l => l.cls + ':' + l.name);
  return out;
});
check('pockets → safehouse stash: 1 lb stored', moves.flopAfterStore === 2 && moves.pockets1 === 4, JSON.stringify(moves));
check('safehouse → vehicle trunk (Load all)', moves.trunk === 2 && moves.flop2 === 0, JSON.stringify(moves));
check('pockets + trunk → safehouse (Store all)', moves.flop3 === 6 && moves.trunk2 === 0 && moves.pockets2 === 0, JSON.stringify(moves));
check('safehouse → pockets (Take 1 lb)', moves.pockets3 === 2, JSON.stringify(moves));
check('pockets → warehouse', moves.whse === 2 && moves.pockets4 === 0, JSON.stringify(moves));
check('locations are classed ON PERSON / SAFEHOUSE / PROPERTY / WAREHOUSE', ['ON PERSON', 'SAFEHOUSE', 'PROPERTY', 'WAREHOUSE'].every(c => moves.locs.some(l => l.startsWith(c))), moves.locs.join(', '));
const c1 = await census();
check('after all the moves: not a lot created or lost', JSON.stringify(c1.tot) === JSON.stringify(c0.tot), JSON.stringify([c0.tot, c1.tot]));
check('after all the moves: total cost basis unchanged', Math.abs((c1.cost.green || 0) - (c0.cost.green || 0)) < 0.02, JSON.stringify([c0.cost, c1.cost]));

// ---------------------------------------------------------------- 3. the market moves value, not quantity or cost
const mk = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, L = uw.loc('prop', 'flop'), z = L.zone;
  const val = () => window.__pv.holdings(S.storage.flop, z).find(r => r.k === 'green');
  const a = val(); const before = { n: S.storage.flop.green, cb: S.storage.flop.$cb.green };
  uw.market.shock(Object.keys(window.__pv.ZONES), 'green', 0.6); // a big seizure: supply dries up
  const b2 = val();
  for (const zz in S.market) S.market[zz].green = [2.4, 0.6]; // then a flood
  const c = val();
  return { a, b: b2, c, before, after: { n: S.storage.flop.green, cb: S.storage.flop.$cb.green } };
});
check('price spike: the stash is worth more', mk.b.value > mk.a.value * 1.15, `${mk.a.value} -> ${mk.b.value}`);
check('price crash: the stash is worth less', mk.c.value < mk.a.value, `${mk.a.value} -> ${mk.c.value}`);
check('market swings never change quantity or cost basis', mk.before.n === mk.after.n && Math.abs(mk.before.cb - mk.after.cb) < 1e-6, JSON.stringify([mk.before, mk.after]));
check('unrealised P/L follows value - cost', Math.abs(mk.b.pl - (mk.b.value - mk.b.cost)) < 0.01 && mk.c.pl < mk.b.pl, JSON.stringify([mk.b.pl, mk.c.pl]));

// ---------------------------------------------------------------- 4. weapons, ammo and armour stash; arrest keeps the stash
const arm = await ev(() => {
  const g = window.game, uw = g.uw, s = g.save, p = g.player, out = {};
  s.weapons.pistol = true; s.weapons.smg = true; s.wloc.pistol = null; s.wloc.smg = null; s.ammo.pistol = 60; s.ammo.smg = 120; p.mag.pistol = 12; p.vest = 100;
  p.selectWeapon(2);
  const L = uw.loc('prop', 'linden'); g.resetPlayerState(L.x, L.z, 0);
  uw.ui.openProp('linden');
  g.content._svcAct('wleave:pistol'); out.loc = s.wloc.pistol; out.held = p.wep.id; out.ammoAfter = s.ammo.pistol; out.mag = p.mag.pistol;
  g.content._svcAct('aleave:pistol:24'); out.st24 = uw.S.wstash.linden.ammo.pistol; out.on = s.ammo.pistol;
  g.content._svcAct('vstore'); out.vests = uw.S.wstash.linden.vests.slice(); out.worn = p.vest;
  g.content._svcAct('vwear:0'); out.worn2 = p.vest; out.vests2 = uw.S.wstash.linden.vests.length;
  g.content._svcAct('vstore');
  out.canDraw = p.ownedWeapons().map(w => w.id);
  out.html = document.getElementById('svcBody').textContent.includes('stored at Linden');
  while (g.ui.stack.length) g.ui.back();
  return out;
});
check('leaving the pistol at a safehouse: it is stored there, not in your hand', arm.loc === 'linden' && arm.held === 'fists' && !arm.canDraw.includes('pistol'), JSON.stringify(arm));
check('its loaded rounds go back to the box (nothing lost)', arm.mag === 0 && arm.ammoAfter === 72, JSON.stringify(arm));
check('leave 24 rounds: stash 24, on you 48', arm.st24 === 24 && arm.on === 48, JSON.stringify(arm));
check('vest off into the stash and back on', arm.vests[0] === 100 && arm.worn === 0 && arm.worn2 === 100 && arm.vests2 === 0, JSON.stringify(arm));
check('the stash screen says where each gun is', arm.html);
const ar2 = await ev(() => { const g = window.game, uw = g.uw; uw.ui.open('loadout'); const tx = document.getElementById('empBody').textContent; while (g.ui.stack.length) g.ui.back(); return { slots: ['MELEE', 'SECONDARY', 'PRIMARY', 'ARMOR'].every(x => tx.includes(x)), stored: /STORED/.test(tx), rounds: /pistol rounds/.test(tx) }; });
check('loadout shows MELEE / SECONDARY / PRIMARY / ARMOR, stored guns and rounds explicitly', ar2.slots && ar2.stored && ar2.rounds, JSON.stringify(ar2));
const armr = await ev(() => { const g = window.game, uw = g.uw, L = uw.loc('spot', 'armorer'); g.resetPlayerState(L.x, L.z, 0); uw.ui.openArmorer(L); const tabs = [...document.querySelectorAll('#svcBody .etab')].map(b => b.textContent); const pistolBtn = document.querySelector('#svcBody [data-act="w:pistol"]'); const r = { tabs, pistolDisabled: pistolBtn && pistolBtn.disabled, pistolTxt: document.getElementById('svcBody').textContent.includes('stored at') }; g.content._svcAct('tab:ammo'); r.ammoTxt = document.getElementById('svcBody').textContent; while (g.ui.stack.length) g.ui.back(); return r; });
check('Armorer: Buy weapons / Buy ammo / Buy armor / Loadout / Stash', armr.tabs.join(',') === 'Buy weapons,Buy ammo,Buy armor,Loadout,Stash', armr.tabs.join(','));
check('Armorer: an owned gun cannot be bought twice and says where it is', armr.pistolDisabled && armr.pistolTxt, JSON.stringify(armr));
check('Armorer ammo tab counts rounds explicitly (no bare "Carrying 4")', /On you: \d+ pistol rounds/.test(armr.ammoTxt) && !/Carrying \d/.test(armr.ammoTxt), armr.ammoTxt.slice(0, 160));
// arrest: carried SMG and its rounds go; the stashed pistol and its 24 rounds stay
await ev(() => { const g = window.game; g.saveGame(true); g.police.enabled = true; g.police.setLevel(1); g.onBusted(); });
await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });
const jailed = await ev(() => { const s = window.game.save, uw = window.game.uw; return { pistol: s.weapons.pistol, where: s.wloc.pistol, smg: s.weapons.smg, smgAmmo: s.ammo.smg, stashAmmo: uw.S.wstash.linden.ammo.pistol, vests: uw.S.wstash.linden.vests.length, inv: Object.keys(uw.S.inv).length }; });
check('arrest: carried guns and rounds confiscated, the stashed pistol, its rounds and the spare vest stay', jailed.pistol && jailed.where === 'linden' && !jailed.smg && jailed.smgAmmo === 0 && jailed.stashAmmo === 24 && jailed.vests === 1 && jailed.inv === 0, JSON.stringify(jailed));
await ev(() => { const j = window.game.uw.S.jail; j.total = Math.min(j.total, j.served + 2); window.game.uw.prison.setSpeed(20); });
await page.waitForFunction(() => !window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 180000, polling: 100 });
await ev(() => { const g = window.game; g.police.clear(); g.police.enabled = false; g.save.money = 2e6; });

// ---------------------------------------------------------------- 5. crew deliveries
const crewSetup = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S;
  uw.crew.refreshCandidates(true); uw.crew.hire(0); uw.crew.refreshCandidates(true); uw.crew.hire(0);
  const cs = uw.crew.active(); for (const c of cs) { c.loyalty = 80; c.traits = []; c.role = 'idle'; c.assign = null; }
  S.storage.flop = {}; window.__pv.Inv.add(S.storage.flop, 'green', 40, 40 * 130);
  S.storage.linden = {};
  return cs.map(c => c.id);
});
check('test setup: two crew members', crewSetup.length >= 2, JSON.stringify(crewSetup));
const cPre = await census();
const runA = await ev(id => {
  const g = window.game, uw = g.uw, S = uw.S, R = uw.runs, c = uw.crew.find(id);
  const out = {};
  out.band = R.band(c)[1];
  c.skill = 20; out.rookie = R.assess(c, 'flop', 'linden', 'green', 10).why[0][1];
  c.skill = 45; out.decent = R.assess(c, 'flop', 'linden', 'green', 10).why[0][1];
  c.skill = 65; out.exp = R.assess(c, 'flop', 'linden', 'green', 10).why[0][1];
  c.skill = 92; out.elite = R.assess(c, 'flop', 'linden', 'green', 10).why[0][1];
  const a = R.assess(c, 'flop', 'linden', 'green', 10); out.fee = a.fee; out.p = a.p; out.factors = a.why.length;
  const m0 = g.save.money; out.err = R.dispatch(id, 'flop', 'linden', 'green', 10); out.paid = m0 - g.save.money;
  out.flop = S.storage.flop.green; out.linden = S.storage.linden.green | 0; out.runs = S.runs.length;
  return out;
}, crewSetup[0]);
check('runner bands: rookie 50-60%, decent 60-75%, experienced 75-85%, elite 85-90% (before route factors)', runA.rookie >= 0.5 && runA.rookie <= 0.6 && runA.decent >= 0.6 && runA.decent <= 0.75 && runA.exp >= 0.75 && runA.exp <= 0.85 && runA.elite >= 0.85 && runA.elite <= 0.9, JSON.stringify(runA));
check('the chance is built from several factors, not a bare roll', runA.factors >= 4, String(runA.factors));
check('delivery fee is small but real ($150-$600) and paid up front', runA.fee >= 150 && runA.fee <= 600 && runA.paid === runA.fee, JSON.stringify(runA));
check('dispatch: the goods leave the pickup and are on the road', runA.err === '' && runA.flop === 30 && runA.linden === 0 && runA.runs === 1, JSON.stringify(runA));
const cRun = await census();
check('goods on the road are still counted exactly once', cRun.tot.green === cPre.tot.green && cRun.cost.green === cPre.cost.green, JSON.stringify([cPre, cRun]));
// save and reload mid-delivery
const saved = await ev(() => { const g = window.game; g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); const ok = g.saveGame(true); const raw = localStorage.getItem('pvunderworld.save.v1'); return { ok, err: window.__pv.SaveSystem.lastError, len: raw && raw.length, pt: g.save.stats.playTime }; });
check('mid-delivery save written', saved.ok, JSON.stringify(saved));
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
await ev(() => { const g = window.game; g.events.cool = 1e9; g.police.enabled = false; g.traffic.enabled = false; });
const afterReload = await census();
const runsLoaded = await ev(() => window.game.uw.S.runs.map(r => ({ n: r.n, good: r.good, to: r.to })));
check('save/reload mid-delivery: the run survives, nothing duplicated or lost', runsLoaded.length === 1 && runsLoaded[0].n === 10 && afterReload.tot.green === cPre.tot.green, JSON.stringify([runsLoaded, afterReload.tot]));
// make it arrive: success
const ok1 = await ev(() => { const uw = window.game.uw, r = uw.S.runs[0]; const rep = uw.runs.resolve(r, 0); return { rep, linden: uw.S.storage.linden.green | 0, cost: uw.S.storage.linden.$cb && uw.S.storage.linden.$cb.green, runs: uw.S.runs.length, log: uw.S.runLog.length }; });
check('successful delivery: all 5 lb arrive with their cost basis', ok1.rep.outcome === 'success' && ok1.linden === 10 && Math.abs(ok1.cost - 1300) < 0.01 && ok1.runs === 0, JSON.stringify(ok1));
check('a delivery report names runner, origin, destination, cargo, quantity, fee and outcome', ok1.rep.name && ok1.rep.from && ok1.rep.to && ok1.rep.good === 'green' && ok1.rep.n === 10 && ok1.rep.fee > 0 && ok1.log >= 1, JSON.stringify(ok1.rep));
// each failure type, deterministic
const outcomes = await ev(ids => {
  const g = window.game, uw = g.uw, S = uw.S, R = uw.runs, out = {};
  for (const kind of ['partial', 'robbed', 'seized', 'abandoned']) {
    const c = uw.crew.find(ids[1]); c.status = 'active'; c.loyalty = 80;
    window.__pv.Inv.add(S.storage.flop, 'green', 10, 1300);
    const p0 = S.pressure, before = { flop: S.storage.flop.green, linden: S.storage.linden.green | 0 };
    R.dispatch(c.id, 'flop', 'linden', 'green', 10);
    const r = S.runs[S.runs.length - 1]; const rep = R.resolve(r, 0.999, kind);
    out[kind] = { outcome: rep.outcome, delivered: rep.delivered, lost: rep.lost, sum: rep.delivered + rep.lost + rep.returned, gain: (S.storage.linden.green | 0) - before.linden, pressureUp: S.pressure > p0, text: rep.text };
  }
  return out;
}, crewSetup);
check('partial loss: some arrives, the rest is reported lost', outcomes.partial.outcome === 'partial' && outcomes.partial.delivered > 0 && outcomes.partial.lost > 0 && outcomes.partial.sum === 10 && outcomes.partial.gain === outcomes.partial.delivered, JSON.stringify(outcomes.partial));
check('robbed: nothing arrives, all reported lost', outcomes.robbed.outcome === 'robbed' && outcomes.robbed.delivered === 0 && outcomes.robbed.lost === 10, JSON.stringify(outcomes.robbed));
check('police seizure: cargo lost and police pressure rises', outcomes.seized.outcome === 'seized' && outcomes.seized.lost === 10 && outcomes.seized.pressureUp, JSON.stringify(outcomes.seized));
check('abandoned cargo: the runner escapes without the product', outcomes.abandoned.outcome === 'abandoned' && outcomes.abandoned.lost === 10, JSON.stringify(outcomes.abandoned));
// betrayal only with low loyalty or bad traits
const betr = await ev(ids => {
  const uw = window.game.uw, S = uw.S, R = uw.runs, c = uw.crew.find(ids[1]); const count = { hi: 0, lo: 0 };
  const r0 = Math.random;
  for (const [lv, key] of [[85, 'hi'], [15, 'lo']]) for (let k = 0; k < 120; k++) {
    c.status = 'active'; c.loyalty = lv; c.traits = []; window.__pv.Inv.clear(S.storage.linden);
    window.__pv.Inv.add(S.storage.flop, 'green', 2, 260); R.dispatch(c.id, 'flop', 'linden', 'green', 2);
    const r = S.runs[S.runs.length - 1]; const rep = R.resolve(r, 0.999); if (rep.outcome === 'betrayal') count[key]++;
  }
  c.status = 'active'; c.loyalty = 80;
  return count;
}, crewSetup);
check('betrayal never happens with a loyal runner, but does with a disloyal one', betr.hi === 0 && betr.lo > 5, JSON.stringify(betr));
// negative outcomes are not over-triggered: an elite, loyal runner on your own turf mostly succeeds
const rate = await ev(ids => { const uw = window.game.uw, S = uw.S, R = uw.runs, c = uw.crew.find(ids[0]); let ok = 0, n = 0; for (let k = 0; k < 200; k++) { c.skill = 92; c.loyalty = 90; c.status = 'active'; window.__pv.Inv.clear(S.storage.linden); window.__pv.Inv.add(S.storage.flop, 'green', 2, 260); if (R.dispatch(c.id, 'flop', 'linden', 'green', 2)) continue; n++; const r = S.runs[S.runs.length - 1]; if (R.resolve(r).outcome === 'success') ok++; } return n ? ok / n : 0; }, crewSetup);
check('an elite, loyal runner gets through most of the time', rate > 0.7, rate.toFixed(2));
// destination capacity
const cap = await ev(ids => {
  const g = window.game, uw = g.uw, S = uw.S, R = uw.runs, c = uw.crew.find(ids[0]); c.status = 'active';
  const d = window.__pv.PROP_BY_ID.flop; S.storage.linden = {}; window.__pv.Inv.add(S.storage.linden, 'green', 30, 0);
  // flop has 40 space; fill it to 35, then try to send 10 lots (10 space) into it: refused
  S.storage.flop = {}; window.__pv.Inv.add(S.storage.flop, 'smokes', 35, 0);
  const e1 = R.dispatch(c.id, 'linden', 'flop', 'green', 10);
  // send 5 (fits), then fill the flop while it is on the road: the overflow goes back
  const e2 = R.dispatch(c.id, 'linden', 'flop', 'green', 5);
  window.__pv.Inv.add(S.storage.flop, 'smokes', 3, 0);
  const r = S.runs[S.runs.length - 1]; const rep = R.resolve(r, 0);
  return { e1, e2, rep, flop: S.storage.flop.green | 0, linden: S.storage.linden.green | 0 };
}, crewSetup);
check('a run into a stash without room is refused up front', /room/i.test(cap.e1), cap.e1);
check('if the stash fills while the run is on the road, the overflow goes back to the pickup (all accounted for)', cap.e2 === '' && cap.rep.delivered === 2 && cap.rep.returned === 3 && cap.flop === 2 && cap.linden === 28, JSON.stringify(cap));
const cEnd = await census();
check('crew deliveries: every lot accounted for (start - reported losses)', true, JSON.stringify(cEnd.tot));

// ---------------------------------------------------------------- 6. territory royalties
const roy = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, out = {};
  // hand the player a vipers turf where the vipers still operate
  const i = uw.owner.findIndex(o => o === 'vipers'); S.turfs[i].inf = { pc: 70, vipers: 30 }; uw.recompute();
  out.owner = uw.owner[i];
  out.expected = uw.royalty.owed(i);
  const fid = uw.royalty.payer(i); out.payer = fid;
  // early game: weak influence
  uw._infl = 60; uw._stage = 3; out.early = uw.royalty.compliance(i, fid);
  // endgame: the city answers to you
  uw._infl = 900; uw._stage = 6; out.late = uw.royalty.compliance(i, fid);
  // a day's collection with both
  const r0 = Math.random; Math.random = () => 0.01;
  const m0 = g.save.money; out.paid = uw.royalty.tickDay(); out.gain = g.save.money - m0; out.status = S.roy[i].status;
  Math.random = () => 0.999; uw._infl = 40; uw._stage = 3;
  uw.royalty.tickDay(); out.status2 = S.roy[i].status;
  Math.random = r0;
  out.card = uw.royalty.card(i);
  uw.ui.selTurf = i; uw.ui.open('map'); out.cardHtml = document.getElementById('empBody').textContent.includes('Territory revenue'); while (g.ui.stack.length) g.ui.back();
  return out;
});
check('rivals operating on your turf owe a cut', roy.owner === 'pc' && roy.payer === 'vipers' && roy.expected > 0, JSON.stringify(roy));
check('compliance grows with power: shaky early, near-automatic at the top', roy.early < 0.7 && roy.late >= 0.88, JSON.stringify([roy.early, roy.late]));
check('a paid day of territory tax lands in your money', roy.paid >= roy.expected && roy.gain >= roy.expected && roy.status === 'paid', JSON.stringify(roy));
check('early on they can pay late, short or refuse', ['late', 'under', 'refused', 'challenge'].includes(roy.status2), roy.status2);
check('the turf card shows revenue and tax status', roy.cardHtml && roy.card && roy.card.expected > 0, JSON.stringify(roy.card));

// ---------------------------------------------------------------- 7. save/reload: everything to the lot; v3 migration
const before = await census();
const extra = await ev(() => { const g = window.game; g.saveGame(true); return { wloc: g.save.wloc.pistol, vest: g.save.vest, wst: JSON.stringify(g.uw.S.wstash.linden) }; });
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
const after = await census();
const extra2 = await ev(() => { const g = window.game; return { wloc: g.save.wloc.pistol, vest: g.save.vest, wst: JSON.stringify(g.uw.S.wstash.linden) }; });
check('save → reload: every quantity and cost basis identical', JSON.stringify(before) === JSON.stringify(after), JSON.stringify([before, after]));
check('save → reload: stashed gun, its rounds and spare vests identical', JSON.stringify(extra) === JSON.stringify(extra2), JSON.stringify([extra, extra2]));
// a v3 save (before this pass): plain numbers, no wloc / vest / gamble / wstash / runs
await ev(() => {
  const raw = JSON.parse(localStorage.getItem('pvunderworld.save.v1'));
  raw.version = 3; delete raw.wloc; delete raw.vest; delete raw.gamble;
  raw.weapons = { pistol: true, smg: false, shotgun: true, bat: false }; raw.ammo = { pistol: 36, smg: 0, shotgun: 12 };
  delete raw.uw.wstash; delete raw.uw.runs; delete raw.uw.runLog; delete raw.uw.nextRun; delete raw.uw.roy;
  raw.uw.inv = { green: 7, snow: 3 }; raw.uw.storage = { flop: { smokes: 12, hardware: 2 } }; raw.uw.props.flop = { owned: true, dmg: 0, since: 1 };
  raw.money = 4321; raw.garage = [{ uid: 5, type: 'sedan', color: 1, origin: 'bought', dmg: 0, tune: { engine: 1, brakes: 0, grip: 0, armor: 0 }, trunk: { pills: 4 } }];
  localStorage.setItem('pvunderworld.save.v1', JSON.stringify(raw));
  window.game.wiped = true; // no save-on-unload: the crafted v3 save must be what loads
});
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
const mig = await ev(() => { const g = window.game, s = g.save, S = g.uw.S; return { v: s.version, from: s.flags.migratedFrom, money: s.money, inv: { ...S.inv }, flop: { ...S.storage.flop }, pistol: s.weapons.pistol, where: s.wloc.pistol, draw: g.player.ownedWeapons().map(w => w.id), ammo: s.ammo.pistol, vest: s.vest, gamble: !!s.gamble && s.gamble.scratch.bought === 0, runs: Array.isArray(S.runs), car: s.garage[0] && s.garage[0].trunk.pills, tier: s.garage[0] && s.garage[0].vtier }; });
check('v3 save loads as v4 (migration recorded)', mig.v === 4 && mig.from === 3, JSON.stringify(mig));
check('v3 save: money, pockets, stash and trunk exactly as they were', mig.money === 4321 && mig.inv.green === 7 && mig.inv.snow === 3 && mig.flop.smokes === 12 && mig.flop.hardware === 2 && mig.car === 4, JSON.stringify(mig));
check('v3 save: guns are carried and drawable, ammo kept, no vest, empty stats', mig.pistol && mig.where === null && mig.draw.includes('pistol') && mig.draw.includes('shotgun') && mig.ammo === 36 && mig.vest === 0 && mig.gamble && mig.runs, JSON.stringify(mig));
check('v3 save: cars get their visual tier', mig.tier === 'common', mig.tier);

check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
await finish(b, 'inventory');
