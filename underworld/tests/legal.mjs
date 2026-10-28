/* The law (M7, prompt Session 7): the case file, warrants and the court.
   - Only crimes somebody saw go on file: an officer's report or a witness whose call got through; evidence goes stale.
   - A heavy file brings a warrant; an officer who gets a clear look may recognise you (a 1★ stop); a lawyer can get it
     quashed (Clean Bank, not certain); it lapses when the case goes cold.
   - Arrest → booking (confiscation) → arraignment: plead, public defender, a firm or a QC (Clean Bank); witness-only
     counts are thrown out far more often than an officer's; a small case is a fine; fixing a case needs influence,
     Rank or a friend on the force and is never certain; a crew envelope is Dirty Cash and riskier.
   - Escaped prisoners get a modest enhancement, not the unserved rest. A reload during the hearing returns to it. */
import { launch, open, check, startNew, finish, frames } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const helpers = () => ev(() => {
  const g = window.game;
  g.events.cool = 1e9; g.debug.god = true; g.env.time = 13;
  window.__calm = () => { g.police.clear(); g.police.units.length = 0; for (const c of g.police.cops.slice()) { const i = g.peds.peds.indexOf(c); if (i >= 0) g.peds.peds.splice(i, 1); } g.police.cops.length = 0; g.hotwatch.cool = 1e9; };
  window.__L = () => g.uw.legal.L;
});
await helpers();
const reload = async () => {
  await ev(() => { const g = window.game; g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true); });
  await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
  await ev(() => window.game.quality.setMode(0));
  await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
  await helpers();
};
const bust = async () => {
  await ev(() => { const g = window.game; if (g.police.level === 0) g.police.setLevel(1); g.onBusted(); });
  await page.waitForFunction(() => { const g = window.game; return g.uw.S.jail || (g.uw.legal.L.hearing && g.state === 'playing' && !g.fading); }, null, { timeout: 120000, polling: 100 });
};

// ---------------------------------------------------------------- 1. what goes on file
const file = await ev(() => {
  const g = window.game, uw = g.uw, x = g.player.pos.x, z = g.player.pos.z;
  uw.cops.crime('theft', 1, false, x, z);
  const unseen = uw.legal.L.items.length;
  uw.cops.crime('assault', 1.5, true, x, z);
  uw.cops.crime('pickpocket', 1, true, x, z, 'witness');
  return { unseen, items: uw.legal.L.items.map(i => i.t + ':' + i.q), w: uw.legal.weight(), warrant: uw.legal.L.warrant };
});
check('a crime nobody saw is never on file', file.unseen === 0, JSON.stringify(file));
check('an officer’s report and a witness’s call go on file, weighted (officer 3, witness 1.5); no warrant yet', file.items.join() === 'assault:police,pickpocket:witness' && file.w === 4.5 && !file.warrant, JSON.stringify(file));

// ---------------------------------------------------------------- 2. the warrant and recognition
const warrant = await ev(() => {
  const g = window.game, uw = g.uw, x = g.player.pos.x, z = g.player.pos.z, n0 = g.save.messages.length;
  uw.cops.crime('hitped', 2, true, x, z); uw.cops.crime('theft', 1, true, x, z, 'witness');
  return { warrant: uw.legal.L.warrant, w: uw.legal.weight(), radio: g.uw.S.decisions !== undefined };
});
check('a heavy enough file (weight ≥ 8) brings a warrant', warrant.warrant && warrant.w >= 8, JSON.stringify(warrant));
const recog = await ev(() => {
  const g = window.game, uw = g.uw, p = g.player; window.__calm();
  const out = {};
  // nobody about: nothing happens
  for (const v of g.vehicles.list) v.patrol = false;
  for (let k = 0; k < 40; k++) { uw.legal.recT = 0; uw.legal.update(0.1); }
  out.alone = g.police.level;
  // a patrol car close by with a clear line of sight
  const car = g.vehicles.spawn('police', p.pos.x + 8, p.pos.z, 0, { parked: true }); car.patrol = true; car.touched = true;
  out.sees = uw.legal.sighted();
  let tries = 0; while (g.police.level === 0 && tries < 200) { uw.legal.recT = 0; uw.legal.update(0.1); tries++; }
  out.level = g.police.level; out.tries = tries; car.patrol = false; g.vehicles.despawn(car); window.__calm();
  return out;
});
check('with a warrant out, nobody about means nothing happens; an officer with a clear look recognises you (1★)', recog.alone === 0 && recog.sees && recog.level === 1 && recog.tries < 200, JSON.stringify(recog));
const quash = await ev(() => {
  const g = window.game, uw = g.uw, L = uw.legal; g.money.W.clean = 100000; g.money.W.dirty.me = 50000;
  const c0 = g.money.W.clean, d0 = g.money.W.dirty.me, price = L.quashPrice();
  const fail = L.quash(() => 0.999), afterFail = { warrant: L.L.warrant, paid: c0 - g.money.W.clean };
  const c1 = g.money.W.clean, ok = L.quash(() => 0), after = { warrant: L.L.warrant, items: L.L.items.map(i => i.q), paid: c1 - g.money.W.clean, dirty: d0 - g.money.W.dirty.me };
  return { price, fail, afterFail, ok, after };
});
check('quashing the warrant: a lawyer’s fee from the bank, not certain (a refusal keeps the warrant and the fee)', /refused/.test(quash.fail) && quash.afterFail.warrant && quash.afterFail.paid === quash.price, JSON.stringify(quash));
check('quashed: the witness statements leave the file, the officers’ reports stay; no Dirty Cash touched', /quashed/.test(quash.ok) && !quash.after.warrant && quash.after.items.every(q => q === 'police') && quash.after.dirty === 0, JSON.stringify(quash.after));
const cold = await ev(() => {
  const g = window.game, uw = g.uw, x = g.player.pos.x, z = g.player.pos.z;
  for (let k = 0; k < 4; k++) uw.cops.crime('assault', 1.5, true, x, z, 'witness');
  uw.cops.crime('assault', 1.5, true, x, z);
  const before = { warrant: uw.legal.L.warrant, n: uw.legal.live().length };
  uw.S.econH += 24 * 12; uw.legal.tickDay();
  const mid = { n: uw.legal.live().length, qs: uw.legal.live().map(i => i.q) };
  uw.S.econH += 24 * 30; uw.legal.tickDay();
  return { before, mid, after: { n: uw.legal.live().length, warrant: uw.legal.L.warrant } };
});
check('evidence goes stale: witness statements after 10 days, officers’ reports after 30; the warrant lapses as the case goes cold', cold.before.warrant && cold.mid.qs.every(q => q === 'police') && cold.after.n === 0 && !cold.after.warrant, JSON.stringify(cold));

// ---------------------------------------------------------------- 3. a small case: a fine
await ev(() => { const g = window.game; window.__calm(); g.uw.S.rap.priors = 0; g.money.W.clean = 100000; g.money.W.dirty.me = 2000; });
await bust();
const small = await ev(() => {
  const g = window.game, uw = g.uw, H = uw.legal.L.hearing;
  const html = document.getElementById('svcBody').innerHTML;
  const c0 = g.money.W.clean, r = uw.legal.verdict('plead', () => 0.99);
  return { counts: H.counts.map(c => c.name), panel: /Arraignment|Magistrates/.test(document.getElementById('svcTitle').textContent + document.getElementById('svcHint').textContent), fixOffer: /Make it go away/.test(html), r, fine: c0 - g.money.W.clean, jail: !!uw.S.jail, priors: uw.S.rap.priors, hearing: uw.legal.L.hearing, dirty: g.money.W.dirty.me };
});
check('arrest → the court: an arraignment with the counts and the evidence behind each', small.panel && small.counts.length >= 1, JSON.stringify(small));
check('a small case (1★, nothing else) ends in a Clean Bank fine, not jail; a conviction on record; no fixing for a nobody', small.fine > 0 && !small.jail && /Fined/.test(small.r) && small.priors === 1 && small.hearing === null && !small.fixOffer, JSON.stringify(small));
check('booking took the Dirty Cash you carried (the court never touches the bank beyond its fine)', small.dirty === 0, String(small.dirty));
await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 60000 });
await ev(() => { const g = window.game; g.ui.closeAll(); window.__calm(); });

// ---------------------------------------------------------------- 4. contesting: witness counts fall far more often
const odds = await ev(() => {
  const L = window.game.uw.legal, D = L.defences();
  const ch = (q, id) => L.dismissChance({ q, t: 'assault' }, D.find(d => d.id === id).add);
  return { pdW: ch('witness', 'pd'), pdP: ch('police', 'pd'), qcW: ch('witness', 'silk'), qcP: ch('police', 'silk'), fees: D.map(d => d.fee) };
});
check('contesting: a witness-only count is thrown out far more often than an officer’s; a QC does better than the public defender (who is free)', odds.pdW > odds.pdP * 3 && odds.qcW > odds.pdW && odds.qcP > odds.pdP && odds.fees[1] === 0, JSON.stringify(odds));

// ---------------------------------------------------------------- 5. a big case: jail, and a contested one
await ev(() => { const g = window.game, uw = g.uw; uw.S.rap.maxLvl = 4; for (let k = 0; k < 3; k++) uw.legal.add('assault', 'witness'); uw.legal.add('robbery', 'police'); });
await bust();
const big = await ev(() => {
  const g = window.game, uw = g.uw, H = uw.legal.L.hearing, n = H.counts.length, before = uw.legal.sentenceOf(H.counts, H.mul, H.fugitive);
  // the dice: every witness count thrown out, no officer count
  const rnd = (() => { const qs = H.counts.map(c => c.q); let i = 0; return () => (qs[i++] === 'witness' ? 0 : 0.99); })();
  const r = uw.legal.verdict('pd', rnd);
  return { n, before, r, jail: uw.S.jail && uw.S.jail.total, thrown: /3 counts thrown out/.test(r) };
});
check('a big case (4★, an armed robbery an officer saw): the public defender gets the three witness-only counts thrown out, the rest stands: jail', big.thrown && big.jail > 0 && big.jail < big.before, JSON.stringify(big));
await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });
await ev(() => { const j = window.game.uw.S.jail; j.total = j.served + 1; });
await page.waitForFunction(() => !window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 180000, polling: 100 });

// ---------------------------------------------------------------- 6. fixing a case
await ev(() => { const g = window.game, uw = g.uw; g.ui.closeAll(); window.__calm(); uw.S.rap.maxLvl = 3; uw.legal.add('assault', 'police'); uw.legal.add('robbery', 'police'); });
await bust();
const fix = await ev(() => ({ nobody: window.game.uw.legal.fixChance(false) }));
const fix2 = await ev(() => {
  const g = window.game, uw = g.uw, L = uw.legal, O = window.__pv.OFFICERS[0];
  uw.S.cops[O.id] = { st: 'paid', due: uw.S.day + 7 }; uw._infl = 400;
  const p = L.fixChance(false), pd = L.fixChance(true), price = L.fixPrice(false);
  g.money.W.clean = 500000; const c0 = g.money.W.clean;
  const r = L.fix(false, () => 0);
  return { p, pd, price, r, paid: c0 - g.money.W.clean, jail: !!uw.S.jail, hearing: L.L.hearing, fixed: L.L.fixed };
});
check('fixing a case needs somebody: nobody → no offer; with a friend on the force and influence it is offered, strong but never certain (≤ 95%), and a crew envelope is a little riskier', fix.nobody === 0 && fix2.p > 0.3 && fix2.p <= 0.95 && fix2.pd < fix2.p, JSON.stringify(fix2));
check('fixed: the case falls apart (no jail), the donation came from the bank', /fell apart/.test(fix2.r) && !fix2.jail && fix2.hearing === null && fix2.paid >= fix2.price && fix2.fixed === 1, JSON.stringify(fix2));
await ev(() => { const g = window.game; g.ui.closeAll(); window.__calm(); g.uw.S.rap.maxLvl = 3; g.uw.legal.add('robbery', 'police'); });
await bust();
const fixFail = await ev(() => {
  const g = window.game, uw = g.uw, L = uw.legal, n0 = L.L.hearing.counts.length;
  const r = L.fix(false, () => 0.999);
  return { r, jail: uw.S.jail && uw.S.jail.charges, n0 };
});
check('a fix that fails: obstruction is added and the public defender takes the case (here: jail)', fixFail.jail && /Obstruction/.test(fixFail.jail), JSON.stringify(fixFail));
await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });

// ---------------------------------------------------------------- 7. the escaped prisoner: a modest enhancement
const fug = await ev(() => {
  const g = window.game, uw = g.uw, L = uw.legal;
  const base = L.sentenceOf([{ days: 60 }], 1, false), withF = L.sentenceOf([{ days: 60 }], 1, true), bigF = L.sentenceOf([{ days: 1500 }], 1, true) - L.sentenceOf([{ days: 1500 }], 1, false);
  return { base, withF, extra: withF - base, bigF };
});
check('a recaptured escapee: a fifth of the new sentence on top (7–60 days), not the whole unserved sentence', fug.extra >= 7 && fug.extra <= 60 && fug.bigF === 60, JSON.stringify(fug));

// ---------------------------------------------------------------- 8. reloads, walking away, old saves
await ev(() => { const j = window.game.uw.S.jail; j.total = j.served + 1; });
await page.waitForFunction(() => !window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 180000, polling: 100 });
await ev(() => { const g = window.game; g.ui.closeAll(); window.__calm(); g.uw.S.rap.maxLvl = 3; g.uw.legal.add('assault', 'police'); });
await bust();
await reload();
await page.waitForFunction(() => window.game.uw.legal.open || window.game.uw.S.jail, null, { timeout: 60000, polling: 100 });
const back = await ev(() => { const g = window.game; return { open: g.uw.legal.open, hearing: !!g.uw.legal.L.hearing, svc: g.ui.modal }; });
check('save → reload during the hearing: you are back in front of the judge (no walking away from a case by reloading)', back.open && back.hearing && back.svc === 'svcScreen', JSON.stringify(back));
await ev(() => window.game.ui.closeAll());
await page.waitForFunction(() => !window.game.uw.legal.L.hearing, null, { timeout: 30000, polling: 100 });
const walked = await ev(() => { const g = window.game; return { hearing: g.uw.legal.L.hearing, news: g.save.messages.slice(-3).map(m => m.text).join(' | ') }; });
check('closing the court screen is the public defender: the case is still decided', walked.hearing === null && /Public defender/.test(walked.news), JSON.stringify(walked));
const mig = await ev(() => {
  const P = window.__pv, L = P.Legal || null;
  const num = (v, d, lo, hi) => typeof v === 'number' && isFinite(v) ? Math.min(hi ?? 1e15, Math.max(lo ?? -1e15, v)) : d;
  const rap = { priors: 2, cur: { assault: 2, theft: 1 } };
  const out = window.game.uw.legal.constructor.sanitize(null, num, rap);
  return { items: out.items.map(i => i.t + ':' + i.q).join(), cur: rap.cur };
});
check('an old save’s rap sheet becomes officer evidence on the case file (and the old field goes)', mig.items === 'assault:police,assault:police,theft:police' && mig.cur === undefined, JSON.stringify(mig));
const ui = await ev(() => { const g = window.game; g.uw.legal.add('assault', 'police'); return g.uw.ui.t_police(); });
check('the phone’s Police page shows the case file and the warrant state', /Your case file/.test(ui) && /Warrant/.test(ui), '');

check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await finish(b, 'legal');
