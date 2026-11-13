/* v8 · The Climb: one weight unit everywhere, daily supplier restock, bulk freight through Pier 12 (import, the
   pier shed as a reach-only container, trucking to a stash, distributors), the rank ladder, the 24-chapter
   career, landmarks, and the bank (tellers and the vault). Phone layout at 390 px; save and reload. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const t = await open(b, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = t.page;
const ev = (f, a) => page.evaluate(f, a);
const fadeDone = () => page.waitForFunction(() => !window.game.fading, null, { timeout: 30000, polling: 100 });
await startNew(page);
await ev(() => { const g = window.game; g.quality.setMode(0); g.events.cool = 1e9; g.police.enabled = false; g.traffic.enabled = false; if (g.tutorial) g.tutorial.off = true; });

// ---------------------------------------------------------------- 1. one weight unit
const u = await ev(() => {
  const g = window.game, uw = g.uw, P = window.__pv, PM = uw.props, out = {};
  out.pocket = P.POCKET_CAP; out.sizes = Object.fromEntries(Object.keys(P.GOODS).map(k => [k, P.GOODS[k].size]));
  out.caps = Object.fromEntries(['flop', 'linden', 'penthouse', 'qgarage', 'whse_w', 'whse_d', 'pawn'].map(id => [id, PM.storageLb(P.PROP_BY_ID[id])]));
  out.minRatio = Math.min(...P.PROPS.filter(d => d.storage).map(d => PM.storageLb(d) / d.storage));
  uw.S.inv = { snow: 3, green: 2 }; out.w = P.units(uw.S.inv); out.free = uw.pocketFree();
  uw.S.inv = {};
  return out;
});
check('pockets hold 30 lb; goods weigh the same everywhere (Snow 0.1 lb a lot … hardware 5 lb)', u.pocket === 3000 && u.sizes.snow === 10 && u.sizes.green === 50 && u.sizes.hardware === 500 && u.w === 130 && u.free === 2870, JSON.stringify(u.sizes));
check('stashes in pounds: flop 200, Linden 450, penthouse 800, lock-up 200; warehouses 100,000 and 150,000 lb', u.caps.flop === 200 && u.caps.linden === 450 && u.caps.penthouse === 800 && u.caps.qgarage === 200 && u.caps.whse_w === 100000 && u.caps.whse_d === 150000, JSON.stringify(u.caps));
check('every old stash load still fits (at least 2.5 lb per old space unit)', u.minRatio >= 2.5, String(u.minRatio));

// ---------------------------------------------------------------- 2. suppliers restock, deeper with rank
const sup = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, P = window.__pv, out = {};
  g.save.money = 1e6; g.save.rep = 0;
  const L = uw.loc('spot', 'sully'); uw.ui.openSpot(L);
  out.stock0 = S.supply.sully.smokes; out.btns = [...document.querySelectorAll('#svcBody [data-act^="buy:smokes"]')].map(x => x.textContent.trim().split(' ·')[0]);
  g.content._svcAct('buy:smokes:99999'); out.bought = S.inv.smokes | 0; out.left = S.supply.sully.smokes;
  while (g.ui.stack.length) g.ui.back();
  uw.tickDay(); uw.ui.openSpot(L); out.after = S.supply.sully.smokes; while (g.ui.stack.length) g.ui.back();
  g.save.rep = 3000; uw.tickDay(); uw.ui.openSpot(L); out.ranked = S.supply.sully.smokes; while (g.ui.stack.length) g.ui.back();
  out.rank = [0, 499, 500, 3000, 20000].map(r => P.UW_RANKS[P.rankOf(r)].name);
  S.inv = {};
  return out;
});
check('a supplier sells out, then restocks the next morning (it used to stay empty for good)', sup.stock0 >= 15 && sup.bought === Math.min(30, sup.stock0) && sup.left === sup.stock0 - sup.bought && sup.after >= 15, JSON.stringify(sup));
check('Max button on supplier rows; pockets cap the purchase at 30 lb', sup.btns.includes('Max') && sup.bought <= 30, sup.btns.join('|'));
check('a bigger name gets deeper shelves (rank Shot Caller: 5.5× the stock)', sup.ranked > sup.after * 3, `${sup.after} → ${sup.ranked}`);
check('rank ladder: Nobody → Corner Boy → Runner (500) → Shot Caller (3000) → Legend', sup.rank.join('|') === 'Nobody|Corner Boy|Runner|Shot Caller|Legend', sup.rank.join('|'));

// ---------------------------------------------------------------- 3. Pier 12: locked, then import to the pier
const tr = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, T = uw.trade, P = window.__pv, out = {};
  const L = T.portLoc(); out.loc = L ? { zone: L.zone, road: P.isOnRoad(L.x, L.z) } : null;
  g.save.rep = 100; out.locked = !T.unlocked() && /Reach rank Runner/.test(T.html()) && T.order('green', 50) !== '';
  g.save.rep = 600; g.save.money = 50000; out.max = T.maxLb(); out.cap = T.capC();
  out.tooBig = T.order('green', 2000); // 1,000 lb against a 100 lb limit
  const m0 = g.save.money, pr = T.price('green');
  T.to = 'dock'; out.msg = T.order('green', 200); out.paid = m0 - g.save.money; out.price = pr; out.orders = T.T.orders.length;
  out.cheaper = pr < uw.market.wholesale('l', 'green');
  // twelve hours later it is at the pier
  T.T.orders[0].eta = uw.runs.absHour(); T.tickHours();
  out.dock = { ...T.T.dock }; out.cb = T.T.dock.$cb && T.T.dock.$cb.green; out.imported = T.T.imported;
  // not within reach from across town; listed read-only
  g.resetPlayerState(L.x + 200, L.z, 0); out.far = uw.locations({ all: true }).filter(x => x.key === 'dock').map(x => x.here);
  out.farMove = uw.transfer('dock', 'inv', 'green', 10);
  // at the pier with a van
  g.resetPlayerState(L.x, L.z, 0);
  const v = g.vehicles.spawn('van', L.x + 4, L.z + 3, 0, { parked: true }); v.touched = true; v.trunk = {}; g.player.lastVehicle = v;
  out.near = uw.locations().filter(x => x.here).map(x => x.key);
  out.intoDock = uw.transfer('inv', 'dock', 'green', 1);
  out.moved = uw.transfer('dock', 'veh', 'green', 1e6); out.van = v.trunk.green | 0; out.vanCb = v.trunk.$cb && v.trunk.$cb.green; out.dockLeft = P.units(T.T.dock);
  window.__van = v;
  return out;
});
check('Pier 12 Freight Office stands on a pavement in the docks', tr.loc && !tr.loc.road, JSON.stringify(tr.loc));
check('the freight office is closed to a nobody and opens at rank Runner (100 lb orders, 50 lb a day to distributors)', tr.locked && tr.max === 100 && tr.cap === 5000, JSON.stringify([tr.locked, tr.max, tr.cap]));
check('an order over your limit is refused; a 100 lb order is paid up front at about a third of the street, cheaper than a supplier', /good for 100 lb of Green/.test(tr.tooBig) && tr.paid === 200 * tr.price && tr.orders === 1 && tr.cheaper, JSON.stringify([tr.tooBig, tr.paid, tr.price]));
check('it lands at the pier with its cost basis', tr.dock.green === 200 && Math.abs(tr.cb - tr.paid) < 0.01 && tr.imported === 10000, JSON.stringify(tr.dock));
check('the pier shed is read-only from across town and refuses a remote move', tr.far.length === 1 && tr.far[0] === false && tr.farMove === 0, JSON.stringify(tr.far));
check('at the pier it is within reach: it loads into the van (nothing can be put into the shed)', tr.near.includes('dock') && tr.near.includes('veh') && tr.intoDock === 0 && tr.moved === 200 && tr.van === 200 && tr.dockLeft === 0 && Math.abs(tr.vanCb - tr.paid) < 0.01, JSON.stringify(tr.near));

// ---------------------------------------------------------------- 4. distributors, trucking, the three-day shed
const ex = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, T = uw.trade, P = window.__pv, out = {};
  // at the pier with the loaded van: 80% of the street, capped by the day's volume (50 lb = 100 lots of Green)
  T.src = 'carry'; const m0 = g.save.money, p80 = T.exportPrice('green', true), p62 = T.exportPrice('green', false);
  out.msg = T.sell('carry', 'green', 1e9); out.got = g.save.money - m0; out.p80 = p80; out.p62 = p62; out.left = window.__van.trunk.green | 0; out.capLeft = T.leftC();
  out.again = T.sell('carry', 'green', 10);
  out.profit = S.st.realized;
  // next day, from a stash: collected at 62%
  uw.props.buy('flop'); S.storage.flop = { green: 40, $cb: { green: 400 } };
  uw.tickDay(); const m1 = g.save.money; out.p62 = T.exportPrice('green', false); out.msg2 = T.sell('flop', 'green', 40); out.got2 = g.save.money - m1; out.flop = S.storage.flop.green | 0;
  // trucked to a stash: +8%, what does not fit waits at the pier; left three days it is seized
  g.save.rep = 3000; g.save.money = 5e6; T.to = 'flop';
  const m2 = g.save.money; T.order('smokes', 500); out.fee = (m2 - g.save.money) / (500 * T.price('smokes'));
  const keep = Math.random; Math.random = () => 0.5; T.T.orders[T.T.orders.length - 1].eta = uw.runs.absHour(); T.tickHours(); Math.random = keep;
  out.flopSm = S.storage.flop.smokes | 0; out.dockSm = T.T.dock.smokes | 0; out.flopFull = uw.props.storageFree('flop');
  const pr0 = S.pressure; uw.tickDay(); uw.tickDay(); out.day2 = T.T.dock.smokes | 0; uw.tickDay(); out.day3 = T.T.dock.smokes | 0; out.pressUp = S.pressure > pr0 - 20;
  // Snow counts ten times against the limits: at Shot Caller (5,000 lb orders) 600 lb of Snow is refused, 500 lb is fine
  out.snowBig = T.order('snow', 6000); T.to = 'dock'; g.save.money = 5e7; out.snowOk = T.order('snow', 5000);
  g.vehicles.despawn(window.__van);
  return out;
});
check('limits track value: a pound of Snow uses ten pounds of the order limit', /good for 500 lb of Snow/.test(ex.snowBig) && /^Ordered 500\.0 lb Snow/.test(ex.snowOk), JSON.stringify([ex.snowBig, ex.snowOk]));
check('hauled to the pier: 80% of the street, up to the day\'s volume; the rest stays in the van', ex.got === 100 * ex.p80 && ex.left === 100 && ex.capLeft === 0 && /all they can move today/.test(ex.again), JSON.stringify([ex.msg, ex.again]));
check('collected from a stash the next day: 62%, cost basis realised', ex.got2 === 40 * ex.p62 && ex.flop === 0 && ex.p62 < ex.p80, JSON.stringify([ex.msg2, ex.got2]));
check('trucked to a stash for +8%: fills the stash, the overflow waits at the pier', Math.abs(ex.fee - 1.08) < 0.001 && ex.flopSm === 200 && ex.dockSm === 300 && ex.flopFull === 0, JSON.stringify([ex.fee, ex.flopSm, ex.dockSm]));
check('freight left at the pier is seized after three days', ex.day2 === 300 && ex.day3 === 0, JSON.stringify([ex.day2, ex.day3]));

// ---------------------------------------------------------------- 5. the career
const car = await ev(async () => {
  const g = window.game, uw = g.uw, S = uw.S, C = uw.career, P = window.__pv, out = {};
  out.n = P.CAREER.length; out.acts = P.CAREER_ACTS.length;
  out.allEval = P.CAREER.every(ch => { const p = C.progress(ch); return p.length && p.every(x => typeof x.cur === 'number' && x.n > 0); });
  S.career = { i: 0, done: 0 }; S.st.picks = 0; C.sig = ''; C.cool = 0;
  out.line0 = C.hudLine();
  const m0 = g.save.money;
  S.st.picks = 2; C.t = 0; C.update(1); out.i2 = S.career.i; out.line2 = C.hudLine(); out.show = C.showT > 0;
  S.st.picks = 3; C.t = 0; C.cool = 0; C.update(1); out.i3 = S.career.i; out.paid = g.save.money - m0; out.next = C.current().title;
  // an old save catches up one chapter at a time (a few seconds apart), never all at once
  S.st.chopped = 1; for (let k = 0; k < 3; k++) { C.t = 0; C.update(1); } out.throttled = S.career.i === 1;
  for (let k = 0; k < 8; k++) { C.t = 0; C.update(1); } out.caught = S.career.i;
  out.html = C.html().length > 500 && /The Climb/.test(C.html());
  return out;
});
check('24 chapters in 6 acts, every goal reads a number from the live game', car.n === 24 && car.acts === 6 && car.allEval, JSON.stringify([car.n, car.acts]));
check('progress shows on the HUD line; the third pocket completes chapter 1 and pays its reward', /Light Fingers/.test(car.line0) && /2\/3/.test(car.line2) && car.show && car.i2 === 0 && car.i3 === 1 && car.paid === 150 && car.next === 'Hot Property', JSON.stringify([car.line2, car.paid]));
check('a save that is already ahead catches up chapter by chapter, a few seconds apart', car.throttled && car.caught >= 3, JSON.stringify([car.throttled, car.caught]));

// ---------------------------------------------------------------- 6. landmarks
const lm = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, T = uw.trade, out = {};
  g.save.rep = 1000; g.save.money = 5e9; out.lowRank = T.buyLandmark('ferry');
  g.save.rep = 3000; g.save.money = 1e8; out.poor = T.buyLandmark('ferry');
  g.save.money = 3e9; const i0 = uw.influence, cap0 = T.capC(), max0 = T.maxLb(), p0 = T.price('green');
  T.buyLandmark('ferry'); T.buyLandmark('stadium'); T.buyLandmark('port');
  g.save.rep = 3000; uw.computeInfluence(); // (each purchase earns reputation: measure at the same rank)
  out.own = Object.keys(T.T.landmarks); out.spent = 3e9 - g.save.money; out.infl = uw.influence - i0; out.cap = T.capC() / cap0; out.max = T.maxLb() / max0; out.price = T.price('green') / p0;
  const m = g.save.money; uw.tickDay(); out.income = g.save.money - m >= 3e5 + 9e5 + 1.5e6;
  T.T.landmarks.cityhall = 1; S.pressure = 90; uw.tickDay(); out.press = S.pressure;
  out.twice = T.buyLandmark('ferry');
  return out;
});
check('landmarks need the rank and the money', /Reach rank Fixer/.test(lm.lowRank) && /costs/.test(lm.poor), JSON.stringify([lm.lowRank, lm.poor]));
check('ferry + stadium + port: $1.75B spent once, +40 influence, export volume ×3, order limit ×2, imports 15% cheaper', lm.own.length === 3 && lm.spent === 1.75e9 && lm.infl >= 40 && lm.cap === 3 && lm.max === 2 && Math.abs(lm.price - 0.85) < 0.02 && lm.twice === '', JSON.stringify(lm));
check('landmarks pay their cut every day; City Hall caps police pressure at 40', lm.income && lm.press <= 40, JSON.stringify([lm.income, lm.press]));

// ---------------------------------------------------------------- 7. the bank
await ev(() => { const g = window.game, uw = g.uw; uw.trade.T.landmarks = {}; g.police.level = 0; const L = uw.bank.loc(); g.resetPlayerState(L.x, L.z, 0); });
await frames(page, 3);
const bk0 = await ev(() => { const g = window.game, uw = g.uw, L = uw.bank.loc(), a = uw.findAction ? null : null; void a; return { zone: L.zone, road: window.__pv.isOnRoad(L.x, L.z) }; });
check('Valen First National stands on a pavement', !bk0.road, JSON.stringify(bk0));
await ev(() => window.game.uw.bank.enter()); await fadeDone(); await frames(page, 4);
const bk = await ev(async () => {
  const g = window.game, uw = g.uw, S = uw.S, C = g.content, out = {};
  const def = C.interiors.cur; out.inside = !!def && def.id === 'bank' && !!g.player.interior;
  const fin = async () => { if (C.chan) { C.chan.t = C.chan.secs; } await new Promise(r => setTimeout(r, 50)); for (let k = 0; k < 200 && C.chan; k++) await new Promise(r => setTimeout(r, 50)); };
  // unarmed: no hold-up
  g.player.selectWeapon(0); const m0 = g.save.money; C.spotAct('bk:tellers'); out.unarmed = !C.chan && g.save.money === m0;
  // armed: the drawers, an alarm, three stars; once per three days
  g.save.weapons.pistol = true; g.save.ammo.pistol = 24; g.player.selectWeapon(window.__pv.WEAPONS.findIndex(w => w.id === 'pistol'));
  out.armed = !!(g.player.wep && !g.player.wep.melee);
  // (the suite runs with the police switched off, which clears the level at once: record what the alarm asked for)
  let asked = 0; const sl = g.police.setLevel.bind(g.police); g.police.setLevel = n => { asked = Math.max(asked, n); return sl(n); };
  C.spotAct('bk:tellers'); out.chan = !!C.chan; await fin();
  out.till = g.save.money - m0; out.stars = asked; out.jobs = S.st.bankJobs;
  C.spotAct('bk:tellers'); out.again = !C.chan;
  // the vault: needs a drill; with one, 30 s under four stars, millions, the drill is spent, two-week cooldown
  C.spotAct('bk:gate'); out.behind = g.player.pos.z < def.oz - 1.5;
  C.spotAct('bk:vault'); out.noDrill = !C.chan;
  S.flags.drill = 1; const m1 = g.save.money; C.spotAct('bk:vault'); out.drilling = !!C.chan && C.chan.secs === 30; out.stars4 = g.police.level; await fin();
  out.vault = g.save.money - m1; out.drill = S.flags.drill; out.vaults = S.st.vaults; out.hot = S.inv.hot | 0;
  S.flags.drill = 1; C.spotAct('bk:vault'); out.cool = !C.chan;
  C.spotAct('bk:back'); out.front = g.player.pos.z > def.oz - 0.5;
  // chapter 18 reads the vault
  out.ch18 = uw.career.progress(window.__pv.CAREER.find(c => c.id === 'c18'))[0].ok;
  return out;
});
check('walk into the bank: a lobby under the Financial District', bk.inside, JSON.stringify(bk));
check('no gun, no hold-up; with a gun the tellers empty $40K–$90K, the alarm brings 3 stars, drawers stay empty for 3 days', bk.unarmed && bk.armed && bk.chan && bk.till >= 40000 && bk.till <= 90000 && bk.stars >= 3 && bk.jobs === 1 && bk.again, JSON.stringify(bk));
check('the vault needs a thermal drill; drilling takes 30 s under 4 stars and pays $2.5M–$6M plus valuables', bk.behind && bk.noDrill && bk.drilling && bk.stars4 >= 4 && bk.vault >= 2.5e6 && bk.vault <= 7.3e6 && bk.drill === 0 && bk.vaults === 1 && bk.hot >= 4, JSON.stringify(bk));
check('the vault stays empty for two weeks; you can climb back over the counter; chapter “The Vault” is satisfied', bk.cool && bk.front && bk.ch18, JSON.stringify([bk.cool, bk.front, bk.ch18]));
await ev(() => { const g = window.game; g.police.level = 0; g.police.clear && g.police.clear(''); g.content.interiors.exit(true); }); await frames(page, 4);
const out = await ev(() => { const g = window.game, L = g.uw.bank.loc(); return { interior: !!g.player.interior, d: Math.hypot(g.player.pos.x - L.x, g.player.pos.z - L.z) }; });
check('leaving puts you back on the pavement outside', !out.interior && out.d < 4, JSON.stringify(out));
const arm = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, out = {};
  g.save.rep = 3000; g.save.money = 1e6; S.flags.drill = 0; uw.ui.openArmorer(uw.loc('spot', 'armorer'));
  out.row = /Thermal drill/.test(document.getElementById('svcBody').textContent);
  g.content._svcAct('drill'); out.drill = S.flags.drill; out.paid = 1e6 - g.save.money;
  while (g.ui.stack.length) g.ui.back();
  return out;
});
check('the Armorer sells the thermal drill ($25,000)', arm.row && arm.drill === 1 && arm.paid === 25000, JSON.stringify(arm));

// ---------------------------------------------------------------- 8. phone apps at 390 px, save and reload
const ph = await ev(() => {
  const g = window.game, uw = g.uw, E = uw.ui, out = {};
  const body = document.getElementById('empBody');
  for (const tab of ['career', 'legacy', 'trade']) { E.open(tab); out[tab] = { len: body.textContent.length, over: body.scrollWidth > body.clientWidth + 1, minBtn: Math.min(...[...body.querySelectorAll('button')].map(x => x.getBoundingClientRect().height).filter(h => h > 0), 99) }; }
  E.open('home'); out.apps = [...body.querySelectorAll('.app b')].map(x => x.textContent);
  E.open('trade'); E.act('ti:green:50'); out.ordered = uw.trade.T.orders.some(o => o.good === 'green' && o.n === 50);
  g.ui.closeAll();
  g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true);
  out.state = JSON.stringify([uw.S.trade, uw.S.career.i, uw.S.bank.vault, uw.S.st.vaults, uw.S.flags.drill]);
  return out;
});
check('Career, Landmarks and Trade apps render at 390 px with no sideways scroll and thumb-sized buttons', ['career', 'legacy', 'trade'].every(k => ph[k].len > 200 && !ph[k].over && ph[k].minBtn >= 40), JSON.stringify(ph));
check('the phone home screen has Career and Trade; an order can be placed from the phone', ph.apps.includes('Career') && ph.apps.includes('Trade') && ph.ordered, ph.apps.join(','));
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.waitForFunction(() => { const x = document.getElementById('btnContinue'); return x && !x.disabled; }, null, { timeout: 120000 }); await ev(() => document.getElementById('btnContinue').click());
await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
const post = await ev(() => { const uw = window.game.uw; return { v: window.game.save.version, state: JSON.stringify([uw.S.trade, uw.S.career.i, uw.S.bank.vault, uw.S.st.vaults, uw.S.flags.drill]) }; });
check('orders, the pier shed, landmarks, career, bank cooldowns and the drill survive a save and reload (schema 8)', post.v === 8 && post.state === ph.state, post.state.slice(0, 200));

check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
await finish(b, 'climb');
