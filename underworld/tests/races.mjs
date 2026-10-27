/* Street racing, pink slips, the car wash and the licensed garage's work (Session 6A: §15, §16, §45.18, §45.33).
   - The purse: a street race's first win of an economic day pays the full purse and Rep, the second half the purse
     and a third of the Rep, every later win a quarter and a third; a new day resets it; the buy-in is 15% in Dirty
     Cash; winnings are Dirty Cash booked as street racing. A reload never resets the tier.
   - The police: only a cop who sees you racing (close by, at race speed, in a live race) brings 1★, once a race;
     nobody watching, nothing. Finishing wanted still pays.
   - Pink slips: once an economic day; you race the car you put up, which must be a legal car of yours with
     nothing in it, in one piece, with a free space for his; the stake is committed on the start line. Win: his car
     is yours (resells for Dirty Cash). Lose, quit or reload: yours is his. Nothing is duplicated.
   - The car wash: $40 plus the Motor Works repair rate from the bank, or free wash and a third off the repair at a
     wash you own; washes and repairs the car and changes nothing else (wanted, HOT, owner, provenance).
   - Motor Works: repairs at the repair rate and tunes legal cars from the bank, stage by stage behind Rep. */
import { launch, open, check, startNew, finish, frames } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const helpers = first => ev(first => {
  const g = window.game, uw = g.uw;
  g.events.cool = 1e9; g.debug.god = true; g.police.enabled = true; if (first) g.env.time = 13;
  window.__calm = () => { g.police.clear(); g.police.units.length = 0; for (const c of g.police.cops.slice()) { const i = g.peds.peds.indexOf(c); if (i >= 0) g.peds.peds.splice(i, 1); } g.police.cops.length = 0; g.hotwatch.cool = 1e9; };
  window.__tull = () => g.missions.contacts.find(c => c.id === 'tull');
  // a Tull offer of the kind asked for (a race by id, or the street pink slip; Vance's off-road special is offroad.mjs's)
  window.__offer = want => { const C = g.campaign; for (let k = 0; k < 20; k++) { const o = C.raceOffer(window.__tull()); if (want === 'pink' ? o.pink && !o.race.offroad : !o.pink && o.race.id === want) return o; } return null; };
  // a car of yours, standing at (x, z), you in it
  window.__car = (type, x, z) => { const e = g.content.addToGarage(type, 'bought', undefined, true); e.prov = { dirty: 0, clean: Math.round(window.__pv.CAR_MSRP[type] * 0.8) }; if (g.player.state === 'vehicle') g.exitVehicle(true); const v = g.vreg.spawnFor(e, { x, z, h: 0, y: 0.15 }); v.display = false; e.out = true; e.loc = { x, z, h: 0, y: v.pos.y }; g.resetPlayerState(x + 2, z, 0); g.completeEnter(v); return e; };
  window.__log = []; if (!window.__hooked) { g.money.on(x => window.__log.push(x)); window.__hooked = true; }
}, first);
await helpers(true);
await ev(() => { const g = window.game; g.money.W.clean = 1e7; g.money.W.dirty.me = 1e6; g.save.rep = 5000; g.uw.props.buy('qgarage'); g.uw.props.buy('loft'); g.uw.props.buy('penthouse'); window.__calm(); });
const reload = async () => {
  await ev(() => { const g = window.game; g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true); });
  await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
  await ev(() => window.game.quality.setMode(0));
  await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
  await helpers();
};
// run an offered race to the end: to the start line, the count, then cross the last checkpoint in a given place
const race = async (want, place = 1, opts = {}) => {
  const st = await ev(want => { const g = window.game, o = window.__offer(want); if (!o) return { err: 'no offer' }; const v = g.player.vehicle; g.missions.start(o); const A = g.race.active; if (!A) return { err: 'not started' }; v.pos.x = A.R.start.x; v.pos.z = A.R.start.z; v.h = A.R.start.h; v.vel.set(0, 0); v.syncMesh(0); return { fee: o.fee, reward: o.reward, rep: o.rep }; }, want);
  if (st.err) return st;
  if (opts.refuse) { await frames(page, 20); return { ...st, ...(await ev(() => { const A = window.game.race.active; return { phase: A && A.phase, obj: A && A.objective }; })) }; }
  await page.waitForFunction(() => { const A = window.game.race.active; return A && (A.phase === 'count' || A.phase === 'run'); }, null, { timeout: 60000, polling: 50 });
  if (opts.midRace) return st;
  await ev(() => { window.game.race.active.count = 0.01; });
  await page.waitForFunction(() => window.game.race.active && window.game.race.active.phase === 'run', null, { timeout: 30000, polling: 50 });
  await ev(place => { const g = window.game, A = g.race.active, v = g.player.vehicle, c = A.R.cps[A.R.cps.length - 1]; A.finished = place - 1; A.cp = A.R.cps.length - 1; v.pos.x = c.x; v.pos.z = c.z; v.vel.set(0, 0); v.syncMesh(0); }, place);
  await page.waitForFunction(() => !window.game.missions.active, null, { timeout: 30000, polling: 50 });
  await frames(page, 2);
  return st;
};

// ---------------------------------------------------------------- 1. the purse: by today's wins on that race
const E1 = await ev(() => window.__car('sports', 300, 300).uid);
const tiers = [];
for (let k = 0; k < 4; k++) {
  const before = await ev(() => { const g = window.game; window.__log = []; return { me: g.money.W.dirty.me, rep: g.save.rep }; });
  const st = await race('quayside', 1);
  tiers.push(await ev(([b0, st]) => { const g = window.game, L = window.__log; return { fee: st.fee, paid: Math.round(g.money.W.dirty.me - b0.me), rep: g.save.rep - b0.rep, src: L.filter(x => x.d > 0).map(x => x.cur + ':' + x.src).join(), buyin: L.filter(x => x.d < 0).map(x => x.cur + ':' + x.src).join() }; }, [before, st]));
}
const Q = { reward: 1200, rep: 40 };
check('a street race’s first win today pays the full purse and Rep; the second half the purse and a third of the Rep; later wins a quarter and a third', tiers[0].paid + tiers[0].fee === Q.reward && tiers[0].rep === Q.rep && tiers[1].paid + tiers[1].fee === Q.reward / 2 && tiers[1].rep === Math.round(Q.rep / 3) && tiers[2].paid + tiers[2].fee === Q.reward / 4 && tiers[3].paid + tiers[3].fee === Q.reward / 4 && tiers[3].rep === Math.round(Q.rep / 3), JSON.stringify(tiers));
check('the buy-in is 15% in Dirty Cash and the winnings are Dirty Cash booked as street racing', tiers.every(t => t.fee === 180 && t.buyin === 'dirty:raceBuyIn' && t.src === 'dirty:streetRace'), JSON.stringify(tiers));
await reload();
const after = await ev(() => { const g = window.game, d = window.__pv.RACE_T; const o = window.__offer('quayside'); return { reward: o.reward, rep: o.rep, wins: g.save.raceDay.wins.quayside }; });
check('save → reload: today’s wins on that race are kept (a reload doesn’t reset the purse)', after.reward === 300 && after.wins === 4, JSON.stringify(after));
await ev(() => { window.__calm(); window.__car('sports', 310, 330); });
const before2 = await ev(() => ({ me: window.game.money.W.dirty.me }));
await race('saltloop', 2);
const second = await ev(b0 => Math.round(window.game.money.W.dirty.me - b0.me), before2);
check('second place pays 40% of the purse (less the buy-in)', second === 1600 * 0.4 - 240, String(second));
await ev(() => { window.game.uw.S.day += 1; });
const newDay = await ev(() => { const o = window.__offer('quayside'); return { reward: o.reward, rep: o.rep }; });
check('a new economic day: the full purse again', newDay.reward === 1200 && newDay.rep === 40, JSON.stringify(newDay));

// ---------------------------------------------------------------- 2. seen racing: 1★, once, only if a cop sees it
const heat = await ev(() => {
  const g = window.game, P = g.police, RR = g.raceRules, v = g.player.vehicle, out = {};
  window.__calm();
  const A = { seen: false };
  v.vel.set(0, 25); RR.watch(A, v); out.alone = P.level;
  const c = P.spawnCop(v.pos.x + 8, v.pos.z + 3);
  v.vel.set(0, 10); RR.watch(A, v); out.slow = P.level;
  v.vel.set(0, 25); RR.watch(A, v); out.seen = P.level;
  P.clear(); RR.watch(A, v); out.again = P.level;
  window.__calm();
  P.spawnCop(v.pos.x + 70, v.pos.z + 70); const B = { seen: false }; RR.watch(B, v); out.far = P.level;
  window.__calm(); v.vel.set(0, 0);
  return out;
});
check('racing with no cop watching: nothing; under race speed beside a cop: nothing; at race speed in a cop’s sight: 1★, once a race; a cop far off: nothing', heat.alone === 0 && heat.slow === 0 && heat.seen === 1 && heat.again === 0 && heat.far === 0, JSON.stringify(heat));
const wanted = await (async () => {
  const b0 = await ev(() => { const g = window.game; window.__calm(); g.police.setLevel(1); return { me: g.money.W.dirty.me }; });
  await race('quayside', 1);
  return ev(b0 => ({ paid: Math.round(window.game.money.W.dirty.me - b0.me), lvl: window.game.police.level }), b0);
})();
check('finishing while wanted still pays the purse', wanted.paid === 1200 - 180, JSON.stringify(wanted));
await ev(() => window.__calm());

// ---------------------------------------------------------------- 3. pink slips
const offers = await ev(() => { const g = window.game, n = []; for (let k = 0; k < 14; k++) { const o = g.campaign.raceOffer(window.__tull()); n.push(o.pink && !o.race.offroad ? 1 : 0); }; return n.join(''); });
check('a pink slip comes round in Tull’s rotation, between the ordinary races (until it is raced that day)', /1/.test(offers) && !/11|101|1001/.test(offers), offers);
const vals = await ev(() => { const g = window.game, W = window.__pv.carWorth, e = g.save.garage.find(x => x.type === 'sports'), sv = W(e.type, e.vtier); let ok = 0; for (let k = 0; k < 60; k++) { const r = g.pinks.rival(e), x = W(r.type, r.vtier) / sv; if (x >= 0.8 && x <= 1.5 && !['police', 'unmarked', 'taxi'].includes(r.type)) ok++; } return ok; });
check('the rival’s stake is always worth 0.8–1.5× yours (and never a police car or a cab)', vals === 60, String(vals));
// refusals on the start line: nothing is committed, the race doesn't start
const refuse = await (async () => {
  const out = {};
  const tryOne = async (prep, undo) => { await ev(prep); const r = await race('pink', 1, { refuse: true }); const s = await ev(() => ({ pink: window.game.save.pink, day: window.game.save.pinkDay })); await ev(() => window.game.missions.fail('test')); await ev(undo); return { ...r, ...s }; };
  out.stolen = await tryOne(() => { const g = window.game; if (g.player.state === 'vehicle') g.exitVehicle(true); const v = g.vehicles.spawn('sedan', 320, 300, 0, { parked: true }); g.resetPlayerState(322, 300, 0); g.completeEnter(v); }, () => { const g = window.game, v = g.player.vehicle; g.exitVehicle(true); g.vreg.forget(v); g.vehicles.despawn(v); });
  const pickE = () => { const g = window.game, e = g.save.garage.find(x => x.type === 'sports'), v = g.vreg.live(e) || g.vreg.spawnFor(e, { x: 330, z: 300, h: 0, y: 0.15 }); if (g.player.vehicle !== v) { if (g.player.state === 'vehicle') g.exitVehicle(true); g.resetPlayerState(v.pos.x + 2, v.pos.z, 0); g.completeEnter(v); } return e; };
  await ev(`(${pickE.toString()})()`);
  out.hot = await tryOne(() => { window.game.save.garage.find(x => x.type === 'sports').hot = true; }, () => { window.game.save.garage.find(x => x.type === 'sports').hot = false; });
  out.goods = await tryOne(() => { const e = window.game.save.garage.find(x => x.type === 'sports'); window.__pv.Inv.add(e.trunk, 'green', 2, 0); }, () => { const e = window.game.save.garage.find(x => x.type === 'sports'); window.__pv.Inv.clear(e.trunk); });
  out.cash = await tryOne(() => { const g = window.game, e = g.save.garage.find(x => x.type === 'sports'); g.money.W.dirty.veh[e.uid] = 50; }, () => { const g = window.game, e = g.save.garage.find(x => x.type === 'sports'); g.money.W.dirty.veh[e.uid] = 0; });
  out.wreck = await tryOne(() => { window.game.player.vehicle.health = 40; }, () => { window.game.player.vehicle.health = 100; });
  out.unique = await tryOne(() => { window.game.save.garage.find(x => x.type === 'sports').unique = true; }, () => { delete window.game.save.garage.find(x => x.type === 'sports').unique; });
  out.full = await tryOne(() => { window.__fb = window.game.vreg.freeBays; window.game.vreg.freeBays = () => 0; }, () => { window.game.vreg.freeBays = window.__fb; });
  return out;
})();
const allRefused = Object.values(refuse).every(r => r.phase === 'toStart' && r.pink === null && r.day === -1);
check('no stake is taken from: a car not registered to you, a HOT car, one with goods or cash in it, a damaged one, a unique one, or with no free space for his; nothing is committed', allRefused && /papers/.test(refuse.stolen.obj) && /hot plates/.test(refuse.hot.obj) && /Empty it/.test(refuse.goods.obj) && /Empty it/.test(refuse.cash.obj) && /fixed/.test(refuse.wreck.obj) && /one of a kind/.test(refuse.unique.obj) && /free parking space/.test(refuse.full.obj), JSON.stringify(refuse));
// a win: his car is yours, yours stays
const win = await (async () => {
  const b0 = await ev(() => { const g = window.game; return { n: g.save.garage.length, uids: g.save.garage.map(e => e.uid) }; });
  await race('pink', 1);
  return ev(b0 => {
    const g = window.game, s = g.save, ne = s.garage.find(e => !b0.uids.includes(e.uid)), v = ne && g.vreg.live(ne), sale = ne && g.content.saleOf(ne);
    return { n: s.garage.length - b0.n, origin: ne && ne.origin, live: !!v, adopted: !!(v && v.garageUid === ne.uid && v.owned && !v.drive), sports: s.garage.some(e => e.type === 'sports'), pink: s.pink, sale, day: s.pinkDay === g.uw.S.day, log: s.vlog.some(l => l.what === 'won in a pink slip') };
  }, b0);
})();
check('pink slip won: his car joins your fleet where it stopped (one car, resells for Dirty Cash), yours stays yours, the stake is settled', win.n === 1 && win.origin === 'pinkslip' && win.live && win.adopted && win.sports && win.pink === null && win.sale && win.sale.dirty === win.sale.total && win.sale.clean === 0 && win.day && win.log, JSON.stringify(win));
const once = await ev(() => { const g = window.game, n = []; for (let k = 0; k < 14; k++) { const o = g.campaign.raceOffer(window.__tull()); n.push(o.pink && !o.race.offroad ? 1 : 0); }; return n.join(''); });
check('one pink slip a day: no second offer today', !/1/.test(once), once);
// a loss: yours is his
const lose = await (async () => {
  await ev(() => { window.game.uw.S.day += 1; const g = window.game; window.__E2 = window.__car('sedan', 340, 320).uid; });
  const b0 = await ev(() => ({ n: window.game.save.garage.length }));
  await race('pink', 2);
  return ev(b0 => { const g = window.game, s = g.save; return { n: s.garage.length - b0.n, gone: !s.garage.some(e => e.uid === window.__E2), live: g.vehicles.list.filter(v => v.garageUid === window.__E2).length, pink: s.pink, onFoot: g.player.state === 'foot', log: s.vlog.some(l => l.what === 'lost in a pink slip') }; }, b0);
})();
check('pink slip lost: your car is handed over and gone from your fleet for good; nothing of his comes to you', lose.n === -1 && lose.gone && lose.live === 0 && lose.pink === null && lose.onFoot && lose.log, JSON.stringify(lose));
// quitting after the stake is down: a loss
const quit = await (async () => {
  await ev(() => { window.game.uw.S.day += 1; window.__E3 = window.__car('compact', 360, 320).uid; });
  const b0 = await ev(() => ({ n: window.game.save.garage.length }));
  await race('pink', 1, { midRace: true });
  const mid = await ev(() => ({ pink: !!window.game.save.pink }));
  await ev(() => window.game.missions.fail('You quit.'));
  return ev(([b0, mid]) => { const g = window.game, s = g.save; return { mid: mid.pink, n: s.garage.length - b0.n, gone: !s.garage.some(e => e.uid === window.__E3), pink: s.pink }; }, [b0, mid]);
})();
check('quitting once the stake is down hands the car over', quit.mid && quit.n === -1 && quit.gone && quit.pink === null, JSON.stringify(quit));
// quitting before the start line: nothing lost, today's slip still there
const early = await ev(() => { const g = window.game; g.uw.S.day += 1; const e = window.__car('compact', 380, 320), n = g.save.garage.length; const o = window.__offer('pink'); g.missions.start(o); g.missions.fail('Changed my mind.'); return { n: g.save.garage.length - n, kept: g.save.garage.includes(e), pink: g.save.pink, again: !!window.__offer('pink') }; });
check('walking away before the start line costs nothing (the pink slip is still on offer)', early.n === 0 && early.kept && early.pink === null && early.again, JSON.stringify(early));
// a reload mid-race: the car is his; nothing duplicated
const R0 = await (async () => {
  await ev(() => { window.__E4 = window.__car('estate', 400, 320).uid; });
  const b0 = await ev(() => ({ n: window.game.save.garage.length, uids: window.game.save.garage.map(e => e.uid) }));
  await race('pink', 1, { midRace: true });
  return { b0, e4: await ev(() => window.__E4) };
})();
await reload();
const rl = await ev(R0 => { const g = window.game, s = g.save; return { n: s.garage.length - R0.b0.n, gone: !s.garage.some(e => e.uid === R0.e4), pink: s.pink, extra: s.garage.filter(e => !R0.b0.uids.includes(e.uid)).length, pending: (s.pendingCars || []).length, log: s.vlog.some(l => l.what === 'lost in a pink slip' && l.uid === R0.e4) }; }, R0);
check('a reload with the stake down: the car is his (a loss), and no car of his appears: nothing duplicated', rl.n === -1 && rl.gone && rl.pink === null && rl.extra === 0 && rl.pending === 0 && rl.log, JSON.stringify(rl));
await reload();
const rl2 = await ev(R0 => ({ n: window.game.save.garage.length - R0.b0.n }), R0);
check('…and a second reload changes nothing', rl2.n === -1, JSON.stringify(rl2));

// ---------------------------------------------------------------- 4. the car wash
const wash = await ev(() => {
  const g = window.game, W = g.wash, out = {};
  window.__calm();
  out.bays = W.bays().map(b => b.id);
  const e = window.__car('sedan', 300, 360); e.hot = true; const v = g.player.vehicle;
  const b = W.bays()[0];
  v.pos.x = b.x; v.pos.z = b.z; v.h = b.h; v.vel.set(0, 0); v.syncMesh(0);
  v.health = 55; v.dirt = 0.9; e.prov = { dirty: 100, clean: 2000 }; const prov0 = JSON.stringify(e.prov);
  g.police.setLevel(1);
  const act = g.uw.findAction(); out.label = act && act.label;
  const exp = 40 + g.content.repairCost(v.type, v.health);
  const c0 = g.money.W.clean; window.__log = [];
  act.act();
  for (let k = 0; k < 20; k++) W.update(0.5);
  out.charged = Math.round(c0 - g.money.W.clean); out.exp = exp; out.src = window.__log.filter(x => x.d < 0).map(x => x.cur + ':' + x.src).join();
  out.health = v.health; out.dirt = v.dirt; out.eDirt = e.dirt; out.level = g.police.level; out.hot = e.hot; out.origin = e.origin; out.prov = JSON.stringify(e.prov) === prov0; out.owned = g.save.garage.includes(e);
  window.__calm(); e.hot = false;
  return out;
});
check('the car wash: $40 plus the Motor Works repair rate from the bank; the car comes out washed and fully repaired', wash.bays.length === 2 && /wash & repair/.test(wash.label) && wash.charged === wash.exp && wash.src === 'clean:carWash' && wash.health === 100 && wash.dirt === 0 && wash.eDirt === 0, JSON.stringify(wash));
check('…and nothing else changes: still wanted, still HOT, still yours, provenance as it was', wash.level === 1 && wash.hot && wash.origin === 'bought' && wash.prov && wash.owned, JSON.stringify(wash));
const own = await ev(() => {
  const g = window.game, W = g.wash, out = {}, b = W.bays().find(x => x.id === 'carwash');
  g.uw.props.buy('carwash');
  const v = g.player.vehicle; v.pos.x = b.x; v.pos.z = b.z; v.vel.set(0, 0); v.syncMesh(0); v.health = 55;
  const exp = Math.round(g.content.repairCost(v.type, v.health) * 0.7 / 10) * 10, c0 = g.money.W.clean;
  W.start(v, b); for (let k = 0; k < 20; k++) W.update(0.5);
  out.charged = Math.round(c0 - g.money.W.clean); out.exp = exp; out.health = v.health;
  // clean already: a free wash
  v.dirt = 0.7; const c1 = g.money.W.clean; W.start(v, b); for (let k = 0; k < 20; k++) W.update(0.5); out.free = Math.round(c1 - g.money.W.clean); out.dirt = v.dirt;
  return out;
});
check('at a car wash you own: the wash is free and the repair a third off', own.charged === own.exp && own.health === 100 && own.free === 0 && own.dirt === 0, JSON.stringify(own));
const cancel = await ev(() => {
  const g = window.game, W = g.wash, b = W.bays().find(x => x.id === 'wash2'), v = g.player.vehicle;
  v.pos.x = b.x; v.pos.z = b.z; v.vel.set(0, 0); v.syncMesh(0); v.health = 50;
  const c0 = g.money.W.clean; W.start(v, b); W.update(1); v.pos.x += 8; v.syncMesh(0); W.update(0.5);
  const out = { job: !!W.job, charged: Math.round(c0 - g.money.W.clean), health: v.health };
  const m = g.money.W.clean; g.money.W.clean = 10; v.pos.x = b.x; v.syncMesh(0);
  const act = g.uw.findAction(); out.broke = act && act.label; g.money.W.clean = m;
  return out;
});
check('driving out mid-wash cancels it: nothing charged, nothing repaired; without the money in the bank it won’t start', !cancel.job && cancel.charged === 0 && cancel.health === 50 && /not enough/.test(cancel.broke), JSON.stringify(cancel));
const dirt = await ev(() => { const g = window.game, v = g.player.vehicle, e = g.vreg.entryOf(v); v.dirt = 0; for (let k = 0; k < 200; k++) { v.vel.set(0, 30); v.sleep = false; v.step(0.05, g); } v.vel.set(0, 0); g.vreg.sync(); return { dirt: v.dirt, e: e.dirt }; });
check('cars get dirty with distance driven (and the fleet remembers it)', dirt.dirt > 0.005 && dirt.e === dirt.dirt, JSON.stringify(dirt));

// ---------------------------------------------------------------- 5. Motor Works: repair and tuning, from the bank
const mw = await ev(() => {
  const g = window.game, C2 = g.content, bay = g.world.places.motorworks.bay, out = {};
  const e = window.__car('sedan', bay.x, bay.z); const v = g.player.vehicle; v.pos.x = bay.x; v.pos.z = bay.z; v.syncMesh(0);
  v.health = 60; const rc = C2.repairCost(v.type, v.health), c0 = g.money.W.clean; window.__log = [];
  C2.openService(); C2._svcAct('repair');
  out.repair = Math.round(c0 - g.money.W.clean) === rc && v.health === 100 && window.__log.some(x => x.cur === 'clean' && x.src === 'garage');
  const T = window.__pv ? null : null; void T;
  const p0 = v.spec.power, price = C2.tunePrice({ prices: [1500, 3500, 7000] }, 0, v.type), c1 = g.money.W.clean, prov0 = e.prov.clean;
  C2._svcAct('tune:engine');
  out.tune = e.tune.engine === 1 && Math.round(c1 - g.money.W.clean) === price && e.prov.clean === prov0 + price;
  g.save.rep = 100; C2.refreshSvc(); const c2 = g.money.W.clean; C2._svcAct('tune:engine'); out.locked = e.tune.engine === 1 && g.money.W.clean === c2;
  g.save.rep = 5000; e.hot = true; const c3 = g.money.W.clean; C2._svcAct('tune:brakes'); out.hotRefused = e.tune.brakes === 0 && g.money.W.clean === c3; e.hot = false;
  g.ui.closeAll();
  return out;
});
check('Motor Works repairs at the repair rate and tunes from the bank (its cost added to what the car cost you), stage 2 behind 800 Rep, never a HOT car', mw.repair && mw.tune && mw.locked && mw.hotRefused, JSON.stringify(mw));

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await finish(b, 'races');
