/* Money ledger (overhaul Session 1): Dirty Cash by place, Clean Bank, medical debt, and every rule built on them.
   Covers the Session 1 required cases (deposit / withdraw / transfer, arrest seizure, stash survival, vehicle
   trunk seizure, save and reload, duplicate prevention, invalid and negative amounts) and the owner's rulings
   (§45.1-§45.21): payroll order, crew theft, medical debt, the stunt cash cap, the Clean-only casino, the jail
   commissary, and the v7 → v8 migration of an old single balance into Clean Bank. */
import { launch, open, check, startNew, finish, frames } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const W = () => ev(() => JSON.parse(JSON.stringify(window.game.save.wallet)));

// ---------------------------------------------------------------- 1. a fresh career
const fresh = await ev(() => { const g = window.game; g.events.cool = 1e9; g.police.enabled = false; if (g.tutorial) g.tutorial.off = true; for (let n = 0; n < 5; n++) g.update(1 / 60, 1 / 60); return { w: g.save.wallet, legacy: 'money' in g.save, v: g.save.version, hud: [document.getElementById('money').textContent, document.getElementById('bank').textContent] }; });
check('a new career starts with $0 Dirty Cash, $0 Clean Bank, no debt, schema 8, and no old single balance', fresh.w.clean === 0 && fresh.w.debt === 0 && fresh.w.dirty.me === 0 && !Object.keys(fresh.w.dirty.prop).length && fresh.legacy === false && fresh.v === 8, JSON.stringify(fresh));
check('the HUD shows the cash on you and the bank on separate lines', fresh.hud[0] === '$0' && fresh.hud[1] === 'BANK $0', JSON.stringify(fresh.hud));

// ---------------------------------------------------------------- 2. income lands where the rules say
const inc = await ev(() => { const g = window.game, M = g.money; const r = {};
  r.pick = M.earn(300, 'pickpocket'); r.biz = M.earn(2000, 'business'); r.me = M.onMe; r.clean = M.clean;
  r.passiveNoProp = (M.earn(50, 'dealers'), M.onMe); // nowhere to stash it yet: it reaches you
  return r; });
check('criminal income is Dirty Cash on you; business income is Clean Bank', inc.pick === 300 && inc.biz === 2000 && inc.me === 300 && inc.clean === 2000, JSON.stringify(inc));
check('passive criminal income with no stash yet comes to you', inc.passiveNoProp === 350, JSON.stringify(inc));

// ---------------------------------------------------------------- 3. currencies are enforced
const pol = await ev(() => { const g = window.game, M = g.money, r = {};
  r.propertyWithDirty = (() => { const c = M.clean; M.W.clean = 0; const ok = M.can(2500, 'property'); M.W.clean = c; return ok; })();
  r.armorerWithClean = (() => { const d = M.W.dirty.me; M.W.dirty.me = 0; const ok = M.can(100, 'armorer'); M.W.dirty.me = d; return ok; })();
  r.taxiEither = (() => { const d = M.W.dirty.me; M.W.dirty.me = 10; const paid = M.pay(25, 'taxi'); const left = [M.onMe, M.clean]; M.W.dirty.me = d; M.W.clean += 15; return { paid, left }; })();
  r.casinoDirty = (() => { const c = M.W.clean; M.W.clean = 0; M.W.dirty.me += 1e6; const ok = g.gamble.settle('casino', 100, 0); const can = M.can(100, 'casinoStake'); M.W.clean = c; M.W.dirty.me -= 1e6; return { ok, can }; })();
  r.wagesNoBank = (() => { const s = JSON.stringify(M.W); M.W.dirty.me = 0; M.W.clean = 1e6; const paid = M.pay(500, 'wages', { partial: true }); const clean = M.clean; Object.assign(M.W, JSON.parse(s)); return { paid, clean }; })();
  return r; });
check('property needs Clean Bank: Dirty Cash alone cannot buy it', pol.propertyWithDirty === false, JSON.stringify(pol));
check('the Armorer takes Dirty Cash only', pol.armorerWithClean === false, JSON.stringify(pol));
check('an everyday purchase (taxi) takes cash on you first, then the bank', pol.taxiEither.paid === 25 && pol.taxiEither.left[0] === 0, JSON.stringify(pol.taxiEither));
check('the casino will not take Dirty Cash: no bet without Clean Bank (§45.5)', pol.casinoDirty.ok === false && pol.casinoDirty.can === false, JSON.stringify(pol.casinoDirty));
check('crew wages never fall back to the bank (§45.17)', pol.wagesNoBank.paid === 0 && pol.wagesNoBank.clean === 1e6, JSON.stringify(pol.wagesNoBank));

// the Armorer's hardware buttons check the full price of the batch (×5 needs five units' worth of Dirty Cash)
const arm = await ev(() => { const g = window.game, uw = g.uw, M = g.money, L = uw.loc('spot', 'armorer');
  const hw = uw.market.wholesale(L.zone, 'hardware'), keep = M.W.dirty.me; (uw.S.supply.armorer || (uw.S.supply.armorer = {})).hardware = 8;
  const rep = g.save.rep; g.save.rep = 600; M.W.dirty.me = hw * 2; uw.ui.armTab = 'guns'; uw.ui.openSpot(L);
  const btn = n => { const b = document.querySelector(`#svcBody [data-act="hb:${n}"]`); return b ? !b.disabled : null; };
  const r = { hw, one: btn(1), five: btn(5) }; while (g.ui.stack.length) g.ui.back(); M.W.dirty.me = keep; g.save.rep = rep; return r; });
check('Armorer hardware (500 Rep): with cash for two units, ×1 is enabled and ×5 is not', arm.one === true && arm.five === false, JSON.stringify(arm));

// ---------------------------------------------------------------- 4. invalid and negative amounts
const bad = await ev(() => { const g = window.game, M = g.money, before = JSON.stringify(M.W), r = {};
  r.earn = [M.earn(-5, 'pickpocket'), M.earn(NaN, 'pickpocket'), M.earn(Infinity, 'pickpocket'), M.earn(1e16, 'pickpocket'), M.earn(0, 'pickpocket')];
  r.pay = [M.pay(-5, 'armorer'), M.pay(NaN, 'property'), M.pay(1e9, 'property'), M.pay(1e9, 'armorer')];
  let threw = 0; try { M.earn(5, 'nosuchsource'); } catch { threw++; } try { M.pay(5, 'nosuchsource'); } catch { threw++; }
  r.threw = threw; r.same = JSON.stringify(M.W) === before;
  r.sane = JSON.stringify(M.sanitize({ clean: -50, debt: NaN, dirty: { me: Infinity, veh: { 7: -3, x: 9, 8: 100 }, prop: { flop: 'lots', nope: 500, linden: 40 } }, stunt: 'x' }));
  return r; });
check('negative, NaN, infinite, absurd and zero amounts are refused and change nothing', bad.earn.every(x => x === 0) && bad.pay.every(x => x === 0) && bad.same, JSON.stringify(bad));
check('an unknown money source is a programming error, not a silent write', bad.threw === 2, String(bad.threw));
check('a corrupt wallet loads clean: negatives, NaN, infinities, unknown places dropped', bad.sane === JSON.stringify({ v: 1, clean: 0, debt: 0, dirty: { me: 0, veh: { 8: 100 }, prop: { linden: 40 } }, stunt: { day: -1, paid: 0 } }), bad.sane);

// ---------------------------------------------------------------- 5. deposit, withdraw and transfer at a safehouse (through the phone's Inventory)
await ev(() => { const g = window.game, M = g.money; M.W.clean = 1e6; M.W.dirty.me = 50000; M.W.dirty.prop = {}; g.save.rep = 500; g.uw.computeInfluence(); const r = g.uw.props.buy('flop'); window.__flop = r; const L = g.uw.loc('prop', 'flop'); g.resetPlayerState(L.x, L.z, 0); });
await frames(page, 3);
const dep = await ev(() => { const g = window.game, uw = g.uw, M = g.money, r = {};
  r.bought = window.__flop === '' && uw.props.owned('flop');
  r.reach = uw.locations().filter(L => L.here).map(L => L.key);
  // deposit $10,000 through the Inventory app exactly as a tap would
  uw.ui.open('stash'); uw.ui.xfer = { from: 'inv', to: 'p:flop' }; uw.ui.act('xc:10000');
  r.afterDeposit = [M.onMe, M.dirtyAtProp('flop')];
  r.ui = document.getElementById('empBody').innerHTML.includes('Dirty Cash');
  uw.ui.xfer = { from: 'p:flop', to: 'inv' }; uw.ui.act('xc:1000');
  r.afterWithdraw = [M.onMe, M.dirtyAtProp('flop')];
  r.over = uw.transferCash('p:flop', 'inv', 1e9); // more than there is: capped at what is there
  r.afterOver = [M.onMe, M.dirtyAtProp('flop')];
  uw.transferCash('inv', 'p:flop', 30000); r.end = [M.onMe, M.dirtyAtProp('flop')];
  r.total = M.dirtyTotal();
  g.ui.closeAll && g.ui.closeAll();
  return r; });
check('at your safehouse its stash is within reach for cash', dep.bought && dep.reach.includes('inv') && dep.reach.includes('p:flop'), JSON.stringify(dep.reach));
check('deposit $10,000 through the Inventory app: off you, into the stash', dep.afterDeposit[0] === 40000 && dep.afterDeposit[1] === 10000 && dep.ui, JSON.stringify(dep));
check('withdraw $1,000 back', dep.afterWithdraw[0] === 41000 && dep.afterWithdraw[1] === 9000, JSON.stringify(dep));
check('a withdrawal larger than the stash takes only what is there; nothing is created', dep.over === 9000 && dep.afterOver[0] === 50000 && dep.afterOver[1] === 0, JSON.stringify(dep));
check('cash is conserved across every move', dep.total === 50000 && dep.end[0] === 20000 && dep.end[1] === 30000, JSON.stringify(dep));
const far = await ev(() => { const g = window.game, uw = g.uw, M = g.money; g.resetPlayerState(5 * 80 + 40, 5 * 80 + 2, 0); const moved = uw.transferCash('inv', 'p:flop', 100); return { moved, at: M.dirtyAtProp('flop') }; });
check('across town the stash is out of reach: no transfer', far.moved === 0 && far.at === 30000, JSON.stringify(far));

// ---------------------------------------------------------------- 6. a car's trunk, then an arrest in that car
const car = await ev(() => { const g = window.game, uw = g.uw, M = g.money, p = g.player;
  const v = g.vehicles.spawn('sedan', p.pos.x + 2.5, p.pos.z, 0, { parked: true }); v.touched = true; g.completeEnter(v);
  const moved = uw.transferCash('inv', 'veh', 5000);
  return { inCar: p.state === 'vehicle', moved, car: M.carCash(v), me: M.onMe }; });
check('cash can ride in a car (a stolen one keeps it on the car itself)', car.inCar && car.moved === 5000 && car.car === 5000 && car.me === 15000, JSON.stringify(car));
const pre = await W();
await ev(() => { const g = window.game; g.police.enabled = true; g.police.setLevel(1); g.onBusted(); });
await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });
const post = await ev(() => { const g = window.game, M = g.money; return { w: JSON.parse(JSON.stringify(g.save.wallet)), seized: g.uw.S.st.seizedCash, news: (g.save.messages || []).map(m => m.text).filter(t => /took .* in cash/.test(t)).slice(-1)[0] || '' }; });
check('arrest seizes the Dirty Cash you carried (§2)', pre.dirty.me === 15000 && post.w.dirty.me === 0, JSON.stringify({ pre: pre.dirty, post: post.w.dirty }));
check('arrest seizes the Dirty Cash in the car you were caught in', post.seized === 20000, JSON.stringify(post));
check('the safehouse stash survives the arrest', post.w.dirty.prop.flop === 30000, JSON.stringify(post.w.dirty));
check('Clean Bank is untouched by an arrest', post.w.clean === pre.clean, JSON.stringify([pre.clean, post.w.clean]));
check('the news says what was taken and that the stash is safe', /\$20,000/.test(post.news) && /stashed/.test(post.news), post.news);
const jail = await ev(() => { const g = window.game, P = g.uw.prison, j = g.uw.S.jail, M = g.money, r = {};
  r.commissary0 = j.commissary; j.lastJob = -99; P.openWork(); g.content._svcAct('laundry');
  for (let n = 0; n < 60 * 8; n++) g.update(1 / 60, 1 / 60);
  r.commissary1 = j.commissary; r.street = M.dirtyTotal() + M.clean;
  // a guard bribe is paid from your stash outside (the arrest emptied your pockets)
  j.lastBribe = -99; j.lockUntil = 0; P.openGuard(); const st0 = M.dirtyAtProp('flop'); const R = Math.random; Math.random = () => 0.01; g.content._svcAct('perk'); Math.random = R; while (g.ui.stack.length) g.ui.back();
  r.bribeFromStash = st0 - M.dirtyAtProp('flop');
  P.release(); return r; });
check('jail work pays the commissary account, not street money (§45.18)', jail.commissary0 === 0 && jail.commissary1 > 0, JSON.stringify(jail));
check('a guard bribe in jail comes out of your Dirty Cash stash', jail.bribeFromStash === 500, JSON.stringify(jail));
await page.waitForFunction(() => !window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });

// ---------------------------------------------------------------- 7. payroll order and crew theft (§45.18, §45.21)
const pay = await ev(() => { const g = window.game, uw = g.uw, M = g.money, S = uw.S, r = {};
  S.props.whse_w = { owned: true, dmg: 0, since: 1, lvl: 1 }; if (!S.storage.whse_w) S.storage.whse_w = {};
  M.W.dirty.prop = { whse_w: 300, flop: 400 }; M.W.dirty.me = 500; M.W.clean = 9999;
  r.sources = M.payrollSources().map(s => s.key);
  r.paid = M.pay(1000, 'wages', { partial: true }); r.after = { ...M.W.dirty.prop, me: M.onMe, clean: M.clean };
  r.passive = (M.earn(250, 'royalty'), M.dirtyAtProp('whse_w'));
  M.W.dirty.prop = { whse_w: 1000, flop: 1000 }; M.W.dirty.me = 777; M.W.clean = 555;
  r.theft = M.crewTheft(0.12, 0, 60000); r.afterTheft = { ...M.W.dirty.prop, me: M.onMe, clean: M.clean };
  // the Crew screen shows payroll, reserve, days covered and the sources
  uw.ui.open('crew'); const body = document.getElementById('empBody').innerHTML; r.ui = ['Daily payroll', 'Payroll reserve', 'Days covered', 'Paid from, in order'].every(t => body.includes(t));
  return r; });
check('payroll draws warehouse vaults, then safehouses, then your pockets, and never the bank', pay.sources.join() === 'p:whse_w,p:flop,me' && pay.paid === 1000 && pay.after.whse_w === undefined && pay.after.flop === undefined && pay.after.me === 200 && pay.after.clean === 9999, JSON.stringify(pay));
check('passive criminal income goes to the warehouse vault', pay.passive === 250, JSON.stringify(pay));
check('crew theft only takes Dirty Cash from stashes, never your pockets or the bank', pay.theft === 240 && pay.afterTheft.me === 777 && pay.afterTheft.clean === 555 && pay.afterTheft.whse_w + pay.afterTheft.flop === 1760, JSON.stringify(pay));
check('the Crew screen shows daily payroll, reserve, days covered and the sources', pay.ui, '');

// ---------------------------------------------------------------- 8. medical debt and the stunt cap (§45.19, §45.20)
const med = await ev(() => { const g = window.game, M = g.money, r = {};
  M.W.clean = 300; M.W.debt = 0; M.W.dirty.me = 5000;
  r.paid = M.pay(1500, 'hospital'); r.state = [M.clean, M.debt, M.onMe];
  r.capped = (M.pay(1500, 'hospital'), M.debt);
  M.earn(1000, 'business'); r.repaid = [M.debt, M.clean];
  for (let n = 0; n < 5; n++) g.update(1 / 60, 1 / 60); r.hud = document.getElementById('bank').textContent;
  M.W.stunt = { day: -1, paid: 0 }; r.stunt = [M.earn(1000, 'stunt'), M.earn(1000, 'stunt'), M.earn(1000, 'stunt'), M.earn(500, 'stuntMilestone')];
  return r; });
check('a hospital bill the bank cannot cover becomes medical debt; Dirty Cash is never touched', med.paid === 300 && med.state[0] === 0 && med.state[1] === 1200 && med.state[2] === 5000, JSON.stringify(med));
check('medical debt is capped at one bill', med.capped === 1500, JSON.stringify(med));
check('incoming Clean income repays the debt first', med.repaid[0] === 500 && med.repaid[1] === 0, JSON.stringify(med));
check('the HUD shows the debt next to the bank', /DEBT \$500/.test(med.hud), med.hud);
check('repeatable stunt cash is capped per day ($1,500); a milestone pays in full', med.stunt.join() === '1000,500,0,500', JSON.stringify(med.stunt));

// ---------------------------------------------------------------- 8b. cash in a car you own lives in the wallet by garage uid
const owned = await ev(() => { const g = window.game, M = g.money, r = {};
  const v = { cash: 650 }; M.adoptCar(v, 41); r.adopted = [M.dirtyInCar(41), 'cash' in v];
  M.W.dirty.me = 100; r.seized = M.seize({ garageUid: 41 }); r.after = [M.onMe, M.dirtyInCar(41)];
  M.W.dirty.veh[42] = 300; r.sold = M.emptyCar(42); r.afterSale = [M.onMe, M.dirtyInCar(42)];
  return r; });
check('a stolen car you park keeps its cash, now saved with the car in your garage', owned.adopted[0] === 650 && owned.adopted[1] === false, JSON.stringify(owned));
check('caught in a car you own: its cash is seized with yours', owned.seized === 750 && owned.after[0] === 0 && owned.after[1] === 0, JSON.stringify(owned));
check('selling a car you own hands you the cash in it first', owned.sold === 300 && owned.afterSale[0] === 300 && owned.afterSale[1] === 0, JSON.stringify(owned));

// ---------------------------------------------------------------- 9. save, reload, and no duplication
const saved = await ev(() => { const g = window.game, M = g.money; M.W.debt = 0; M.W.dirty.me = 1234; M.W.clean = 5678; M.W.dirty.prop = { flop: 4000, whse_w: 2000 }; g.police.clear(); const ok = g.saveGame(true); return { ok, w: JSON.parse(JSON.stringify(M.W)) }; });
// move cash after the save, then reload without saving: the move must not survive, and nothing is duplicated
await ev(() => { const g = window.game; const L = g.uw.loc('prop', 'flop'); g.resetPlayerState(L.x, L.z, 0); g.uw.transferCash('p:flop', 'inv', 4000); window.game.wiped = true; });
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
const re = await ev(() => { const g = window.game; return { w: JSON.parse(JSON.stringify(g.save.wallet)), total: g.money.total() }; });
check('save and reload: the wallet comes back exactly as saved', saved.ok && JSON.stringify(re.w) === JSON.stringify(saved.w), JSON.stringify({ saved: saved.w, reloaded: re.w }));
check('a transfer made after the save and lost to a reload duplicates nothing', re.total === 1234 + 5678 + 4000 + 2000, String(re.total));
const twice = await ev(() => { const g = window.game, M = g.money; const L = g.uw.loc('prop', 'flop'); g.resetPlayerState(L.x, L.z, 0); g.police.enabled = false; const t0 = M.total(); g.uw.transferCash('p:flop', 'inv', 4000); g.uw.transferCash('inv', 'p:flop', 1000); g.saveGame(true); const d = window.__pv.SaveSystem.load().data.wallet; return { t0, t1: M.total(), me: d.dirty.me, flop: d.dirty.prop.flop }; });
check('transfers then a save: the saved wallet holds the same total, nothing gained or lost', twice.t0 === twice.t1 && twice.me === 1234 + 3000 && twice.flop === 1000, JSON.stringify(twice));

// ---------------------------------------------------------------- 10. a v7 save: the old balance becomes Clean Bank (§45.2)
await ev(() => {
  const raw = JSON.parse(localStorage.getItem('pvunderworld.save.v1'));
  raw.version = 7; delete raw.wallet; raw.money = 4321;
  localStorage.setItem('pvunderworld.save.v1', JSON.stringify(raw));
  window.game.wiped = true;
});
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
const mig = await ev(() => { const g = window.game; return { v: g.save.version, from: g.save.flags.migratedFrom, w: g.save.wallet, legacy: 'money' in g.save, saved: (g.saveGame(true), JSON.parse(localStorage.getItem('pvunderworld.save.v1'))) }; });
check('a v7 save migrates: its old money is Clean Bank, nothing is Dirty, no old field remains', mig.v === 8 && mig.from === 7 && mig.w.clean === 4321 && mig.w.dirty.me === 0 && !Object.keys(mig.w.dirty.prop).length && mig.legacy === false && !('money' in mig.saved), JSON.stringify({ v: mig.v, from: mig.from, w: mig.w }));

check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'ledger');
