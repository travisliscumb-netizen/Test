/* Fronts (M9, §45.6): laundering Dirty Cash through businesses you own. Only an owned business with a laundering
   line takes cash; it goes through the books in person, from cash you carry; the float holds at most two days of
   capacity; each economic day washes up to the capacity into Clean Bank less the fee; level raises the capacity
   and lowers the fee; a manager adds capacity, trims the fee and can top the float up from your stashes (and keeps
   it running while you are in jail); a police raid takes half the float; the float survives save and reload; a
   front buys no Rank, influence or Rep; the business screen shows the books. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const t = await open(b);
const page = t.page;
const ev = (f, a) => page.evaluate(f, a);
await startNew(page);
await ev(() => { const g = window.game; g.events.cool = 1e9; g.police.enabled = false; g.traffic.enabled = false; });

const r = await ev(() => {
  const g = window.game, uw = g.uw, M = g.money, P = window.__pv, F = uw.fronts, out = {};
  const d = P.PROPS.find(p => p.kind === 'business' && p.launder), plain = P.PROPS.find(p => p.kind === 'business' && !p.launder);
  out.id = d.id;
  M.W.clean = 1e7; M.W.dirty.me = 0; g.save.rep = 400;
  out.notOwned = F.deposit(d.id, 5000);
  uw.computeInfluence(); const rank0 = uw.rank, rep0 = g.save.rep, infl0 = uw.influence;
  out.buy = [uw.props.buy(d.id), uw.props.buy(plain.id)].join('|');
  out.after = { rank: uw.rank === rank0, rep: g.save.rep === rep0, infl: uw.influence <= infl0 + (d.infl || 0) + (plain.infl || 0) };
  out.plainFront = F.isFront(plain.id); out.isFront = F.isFront(d.id);
  // away from the business: no
  M.W.dirty.me = 50000; const L = uw.loc('prop', d.id);
  g.resetPlayerState(L.x + 40, L.z + 40, 0); out.far = F.deposit(d.id, 5000);
  g.resetPlayerState(L.x + 2, L.z + 2, 0);
  out.small = F.deposit(d.id, 100);
  out.cap1 = F.cap(d.id); out.fee1 = F.fee(d.id);
  out.dep = F.deposit(d.id, 5000); out.float1 = F.st(d.id).float; out.dirty1 = M.W.dirty.me;
  out.depAll = F.deposit(d.id, Infinity); out.float2 = F.st(d.id).float; out.dirty2 = M.W.dirty.me;
  out.full = F.deposit(d.id, 5000);
  // the economic day: a day's capacity is washed, the fee kept, the rest lands in the bank
  const c0 = M.W.clean; F.tickDay(); out.wash1 = { clean: M.W.clean - c0, float: F.st(d.id).float, fees: F.st(d.id).fees, washed: F.st(d.id).washed };
  // a higher level washes more for less
  uw.S.props[d.id].lvl = 3; out.cap3 = F.cap(d.id); out.fee3 = F.fee(d.id);
  // a manager: more capacity, a lower fee, top-ups from your stashes
  out.autoNoMgr = F.toggleAuto(d.id);
  uw.crew.refreshCandidates(true); uw.crew.S.cand[0].fee = 1; M.W.dirty.me += 10; uw.crew.hire(0);
  const c = uw.S.crew[uw.S.crew.length - 1]; c.rank = 3; c.loyalty = 90; out.assign = uw.crew.assign(c.id, 'manager', d.id) || '';
  out.capM = F.cap(d.id); out.feeM = F.fee(d.id);
  out.auto = F.toggleAuto(d.id); out.autoOn = F.st(d.id).auto;
  M.W.dirty.me = 200000; const c1 = M.W.clean, f0 = F.st(d.id).float;
  F.tickDay(); out.wash2 = { clean: M.W.clean - c1, float: F.st(d.id).float, dirty: M.W.dirty.me, f0 };
  // the business screen shows the books
  uw.ui.openProp(d.id); out.html = document.getElementById('svcBody').textContent; while (g.ui.stack.length) g.ui.back();
  out.plainHtml = F.html(plain.id);
  // a raid takes half the float
  F.st(d.id).float = 40000; out.raid = F.raided(d.id); out.afterRaid = F.st(d.id).float;
  F.st(d.id).float = 12345; F.st(d.id).auto = true; g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true);
  return out;
});
check('a business that is not yours takes nothing', /Not a front/.test(r.notOwned), r.notOwned);
check('buying a front buys no Rank or Rep (§45.7)', r.buy === '|' && r.after.rank && r.after.rep && r.after.infl, JSON.stringify([r.buy, r.after]));
check('only a business with a laundering line is a front', r.isFront && !r.plainFront && r.plainHtml === '', JSON.stringify([r.isFront, r.plainFront]));
check('cash goes through the books in person: from across town it is refused', /in person/.test(r.far), r.far);
check('a deposit under $500 is refused', /At least/.test(r.small), r.small);
check('level 1: up to $15,000 a day at 15%', r.cap1 === 15000 && Math.abs(r.fee1 - 0.15) < 1e-9, JSON.stringify([r.cap1, r.fee1]));
check('$5,000 of carried Dirty Cash joins the float', r.dep === '' && r.float1 === 5000 && r.dirty1 === 45000, JSON.stringify(r));
check('the float holds two days of capacity at most ($30,000): “all I carry” takes only what fits', r.depAll === '' && r.float2 === 30000 && r.dirty2 === 20000 && /can’t take more/.test(r.full), JSON.stringify([r.float2, r.dirty2, r.full]));
check('an economic day washes $15,000: $12,750 lands in Clean Bank, $2,250 fee, $15,000 left in the float', r.wash1.clean === 12750 && r.wash1.float === 15000 && r.wash1.fees === 2250 && r.wash1.washed === 15000, JSON.stringify(r.wash1));
check('level 3: up to $100,000 a day at 9%', r.cap3 === 100000 && Math.abs(r.fee3 - 0.09) < 1e-9, JSON.stringify([r.cap3, r.fee3]));
check('top-ups need a manager', /Only a manager/.test(r.autoNoMgr), r.autoNoMgr);
check('a manager adds 20% capacity and trims the fee to 7%', r.assign === '' && r.capM === 120000 && Math.abs(r.feeM - 0.07) < 1e-9, JSON.stringify([r.assign, r.capM, r.feeM]));
check('with top-ups on, the manager fills the float from your cash and stashes, and the day washes it', r.autoOn && r.wash2.clean === Math.round(120000 * 0.93) && r.wash2.float === 0 && r.wash2.dirty === 200000 - (120000 - r.wash2.f0), JSON.stringify(r.wash2));
check('the business screen shows the books: capacity, fee, float, washed, deposit buttons', /The books/.test(r.html) && /Washes a day/.test(r.html) && /Waiting in the float/.test(r.html) && /Put \$/.test(r.html) && /Manager top-ups: ON/.test(r.html), r.html.slice(0, 300));
check('a police raid takes half the float as evidence', r.raid === 20000 && r.afterRaid === 20000, JSON.stringify([r.raid, r.afterRaid]));

// ---------------------------------------------------------------- save and reload; jail keeps a managed front running
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
const j = await ev((id) => {
  const g = window.game, uw = g.uw, M = g.money, F = uw.fronts, out = {};
  out.float = F.st(id).float; out.auto = F.st(id).auto;
  // a malformed save entry is dropped; one for a business that can't launder too
  out.san = window.__pv.Fronts.sanitize({ [id]: { float: -5, washed: 'x', auto: 1 }, nope: { float: 9 } }, (v, d, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d));
  // in jail: you can't deposit, but the manager's top-ups from the stashes keep the front washing
  uw.S.jail = window.__pv.Prison.fresh({ total: 10, full: 10, lines: [] }); out.inJail = uw.inJail;
  out.jailDep = F.deposit(id, 5000);
  const sh = window.__pv.PROPS.find(p => p.kind === 'safehouse' && !uw.props.owned(p.id)); M.W.clean += 1e7; uw.props.buy(sh.id);
  M.W.dirty.me = 0; M.W.dirty.prop[sh.id] = 150000; F.st(id).float = 0;
  const c0 = M.W.clean; F.tickDay(); out.jailWash = M.W.clean - c0; out.stashLeft = M.W.dirty.prop[sh.id];
  uw.S.jail = null;
  return out;
}, r.id);
check('the float and the top-up setting survive save and reload exactly', j.float === 12345 && j.auto === true, JSON.stringify(j));
check('a malformed save entry is cleaned (negatives zeroed, unknown businesses dropped)', Object.keys(j.san).length === 1 && Object.values(j.san)[0].float === 0 && Object.values(j.san)[0].auto === true, JSON.stringify(j.san));
check('in jail: no deposits from a cell, but a managed front keeps washing from your stashes', /cell/.test(j.jailDep) && j.inJail && j.jailWash === Math.round(120000 * 0.93) && j.stashLeft === 30000, JSON.stringify(j));

check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
await finish(b, 'fronts');
