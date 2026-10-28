/* The early laundering fixer (overhaul Session 2.5, handoff §45.6, §45.22, §45.9).
   - Dina Vance takes Dirty Cash you carry, keeps a 32% fee and puts the rest in your Clean Bank 12 economic hours
     later, at most $5,000 a day, at least $100 a time; stashed cash and the bank are never used.
   - Time is the economic clock: the day-length setting doesn't change how much she washes per hour of play; in jail
     the clock runs at world time.
   - Cash with her isn't on you: an arrest doesn't take it, and it arrives while you are inside.
   - Batches survive save and reload and are delivered exactly once; a corrupt fixer state loads clean.
   - No Clean Bank comes from a stolen car, through the garage or the chop shop. */
import { launch, open, check, startNew, finish, throughCourt } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
await ev(() => { const g = window.game; g.events.cool = 1e9; g.debug.god = true; g.save.settings.dayLength = 30; });

// ---------------------------------------------------------------- 1. where she is, what she says
const where = await ev(() => {
  const g = window.game, uw = g.uw, L = uw.loc('spot', 'fixer');
  g.ui.mapView.buildIndex(); const places = g.ui.mapView.entries;
  g.resetPlayerState(L.x, L.z, 0);
  const act = uw.findAction();
  uw.ui.openSpot(L); const html = document.getElementById('svcBody').innerHTML; while (g.ui.stack.length) g.ui.back();
  return { found: !!L, zone: L && L.zone, html: /32%/.test(html) && /\$5,000/.test(html) && /data-act="wash:/.test(html), places: places.some(p => p.key === 'spot:fixer' && /32%/.test(p.sub)), act: act && act.label };
});
check('the fixer is a place in the Old Quarter, on the map, at her door, with a screen that states her fee and daily limit', where.found && where.zone === 'o' && where.html && where.places && /Dina Vance/.test(where.act || ''), JSON.stringify(where));

// ---------------------------------------------------------------- 2. fee, minimum, carried cash only, delay
const wash = await ev(() => {
  const g = window.game, uw = g.uw, M = g.money, S = uw.S, out = {};
  M.W.dirty.me = 2000; M.W.clean = 0; M.W.debt = 0; M.W.dirty.prop = {}; S.fixer = window.__pv.LaunderFixer.fresh();
  uw.ui.openSpot(uw.loc('spot', 'fixer')); const act = g.content._svcAct;
  act('wash:1000');
  out.afterHand = { me: M.W.dirty.me, clean: M.W.clean, batches: S.fixer.batches.map(x => ({ d: x.dirty, c: x.clean })) };
  out.small = uw.fixer.hand(50);
  while (g.ui.stack.length) g.ui.back();
  // nothing in the bank until the delay has passed
  for (let h = 0; h < 11; h++) uw.tickHours(1, h);
  out.at11 = M.W.clean;
  uw.tickHours(1, 11);
  out.at12 = M.W.clean; out.left = S.fixer.batches.length; out.washed = S.fixer.washed; out.fees = S.fixer.fees;
  out.news = (g.save.messages || []).slice(-3).map(m => m.text).filter(t => /in your bank/.test(t)).length;
  // only cash on you counts: a stash or the bank doesn't
  M.W.dirty.me = 0; M.W.dirty.prop = { flop: 9000 }; M.W.clean = 9000; out.noCarry = uw.fixer.hand(1000);
  M.W.dirty.prop = {};
  return out;
});
check('handing her $1,000 takes it off you at once; the bank gets nothing yet', wash.afterHand.me === 1000 && wash.afterHand.clean === 0 && JSON.stringify(wash.afterHand.batches) === JSON.stringify([{ d: 1000, c: 680 }]), JSON.stringify(wash));
check('less than $100 is refused', typeof wash.small === 'string' && /\$100/.test(wash.small), JSON.stringify(wash.small));
check('after 11 hours nothing; at 12 hours $680 lands in Clean Bank (32% fee), once, with a message', wash.at11 === 0 && wash.at12 === 680 && wash.left === 0 && wash.washed === 1000 && wash.fees === 320 && wash.news >= 1, JSON.stringify(wash));
check('only Dirty Cash on you can be washed: stash cash and the bank are not used', typeof wash.noCarry === 'string', JSON.stringify(wash.noCarry));

// ---------------------------------------------------------------- 3. the daily limit
const cap = await ev(() => {
  const g = window.game, uw = g.uw, M = g.money, S = uw.S, out = {};
  M.W.dirty.me = 20000; M.W.clean = 0; S.fixer = window.__pv.LaunderFixer.fresh();
  const day0 = uw.fixer.econDay();
  const a = uw.fixer.hand(3000), b2 = uw.fixer.hand(3000), c = uw.fixer.hand(3000);
  out.first = a.dirty; out.second = b2.dirty; out.third = c; out.left = uw.fixer.capacityLeft(); out.me = M.W.dirty.me;
  // the next economic day she has room again
  const need = (day0 + 1) * 24 - S.econH; for (let h = 0; h < Math.ceil(need); h++) uw.tickHours(1, h % 24);
  out.nextDay = uw.fixer.capacityLeft();
  out.delivered = M.W.clean;
  return out;
});
check('at most $5,000 a day: $3,000, then the $2,000 left, then nothing', cap.first === 3000 && cap.second === 2000 && typeof cap.third === 'string' && cap.left === 0 && cap.me === 15000, JSON.stringify(cap));
check('the limit resets the next economic day, and both batches arrive (68% of $5,000)', cap.nextDay === 5000 && cap.delivered === 3400, JSON.stringify(cap));

// ---------------------------------------------------------------- 4. the day-length setting doesn't change the pace per hour of play
const pace = await ev(() => {
  const g = window.game, uw = g.uw, M = g.money, S = uw.S, out = {};
  S.fixer = window.__pv.LaunderFixer.fresh(); M.W.dirty.me = 1000; M.W.clean = 0;
  g.save.settings.dayLength = 4;
  uw.fixer.hand(1000);
  // a 4-minute day: a world hour is 10 real seconds, so 12 world hours are 2 real minutes: not yet
  for (let h = 0; h < 12; h++) uw.tickHours(1, h % 24);
  out.at12 = M.W.clean;
  // 12 economic hours are 90 world hours at this setting: the same 15 real minutes as at the default 30-minute day
  for (let h = 12; h < 89; h++) uw.tickHours(1, h % 24);
  out.at89 = M.W.clean;
  uw.tickHours(1, 89 % 24); uw.tickHours(1, 90 % 24);
  out.at91 = M.W.clean;
  out.rate4 = uw.econRate(); g.save.settings.dayLength = 60; out.rate60 = uw.econRate(); g.save.settings.dayLength = 30; out.rate30 = uw.econRate();
  return out;
});
check('on a 4-minute day she still takes the same real time: not after 12 world hours, done after 90', pace.at12 === 0 && pace.at89 === 0 && pace.at91 === 680, JSON.stringify(pace));
check('the economic clock is the day length over 30 minutes per world hour (4 → 0.13, 30 → 1, 60 → 2)', Math.abs(pace.rate4 - 4 / 30) < 1e-9 && pace.rate30 === 1 && pace.rate60 === 2, JSON.stringify(pace));

// ---------------------------------------------------------------- 5. arrested while the money is with her
const pre = await ev(() => {
  const g = window.game, uw = g.uw, M = g.money, S = uw.S;
  S.fixer = window.__pv.LaunderFixer.fresh(); M.W.dirty.me = 3000; M.W.clean = 0; M.W.debt = 0;
  uw.fixer.hand(2000);
  return { me: M.W.dirty.me, batches: S.fixer.batches.length };
});
await ev(() => { const g = window.game; g.police.enabled = true; g.police.setLevel(1); g.uw.S.rap.maxLvl = Math.max(g.uw.S.rap.maxLvl || 0, 3); g.uw.legal.add('assault', 'police'); g.onBusted(); });
await throughCourt(page);
await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });
const jail = await ev(() => {
  const g = window.game, uw = g.uw, M = g.money, S = uw.S;
  const out = { me: M.W.dirty.me, seized: S.st.seizedCash, batches: S.fixer.batches.length, rate: uw.econRate(), refused: uw.fixer.hand(500) };
  // a day inside: world time 1:1, so 12 hours deliver it
  for (let h = 0; h < 12; h++) uw.tickHours(1, h);
  out.clean = M.W.clean; out.left = S.fixer.batches.length;
  return out;
});
check('an arrest takes the $1,000 on you, not the $2,000 with her', pre.me === 1000 && pre.batches === 1 && jail.me === 0 && jail.seized >= 1000 && jail.batches === 1, JSON.stringify({ pre, jail }));
check('in jail the clock runs at world time and the money arrives anyway ($1,360); nothing new can be handed over', jail.rate === 1 && jail.clean === 1360 && jail.left === 0 && /cell/.test(jail.refused), JSON.stringify(jail));
await ev(() => { const g = window.game; g.uw.prison.release ? g.uw.prison.release('test') : null; });

// ---------------------------------------------------------------- 6. save, reload, exactly once
const saved = await ev(() => {
  const g = window.game, uw = g.uw, M = g.money, S = uw.S;
  if (S.jail) { S.jail = null; }
  S.fixer = window.__pv.LaunderFixer.fresh(); M.W.dirty.me = 1500; M.W.clean = 0;
  uw.fixer.hand(1500);
  for (let h = 0; h < 6; h++) uw.tickHours(1, h);
  g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true);
  return { econH: S.econH, batch: { ...S.fixer.batches[0] }, used: S.fixer.used };
});
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
const loaded = await ev(() => {
  const g = window.game, uw = g.uw, M = g.money, S = uw.S, out = { econH: S.econH, batch: { ...S.fixer.batches[0] }, used: S.fixer.used, clean0: M.W.clean };
  for (let h = 0; h < 30; h++) uw.tickHours(1, h % 24);
  out.clean = M.W.clean; out.left = S.fixer.batches.length;
  // corrupt state loads clean
  const bad = window.__pv.LaunderFixer.sanitize({ day: -4, used: 1e12, next: 'x', batches: [{ dirty: -5, clean: 10 }, { dirty: 1e9, clean: 2e9, due: NaN }, null, { id: 3, dirty: 100, clean: 68, due: 5 }] }, (v, d, lo, hi) => (typeof v === 'number' && isFinite(v)) ? Math.min(hi, Math.max(lo, v)) : d);
  out.bad = bad;
  return out;
});
check('save → reload: the batch with her, the clock and the day’s limit are identical', Math.abs(loaded.econH - saved.econH) < 1e-6 && JSON.stringify(loaded.batch) === JSON.stringify(saved.batch) && loaded.used === saved.used && loaded.clean0 === 0, JSON.stringify({ saved, loaded }));
check('after reload it is delivered exactly once ($1,020)', loaded.clean === 1020 && loaded.left === 0, JSON.stringify(loaded));
check('a corrupt fixer state loads clean (no negative, impossible or oversized batch)', loaded.bad.used === 5000 && loaded.bad.day === 0 && loaded.bad.batches.every(x => x.clean > 0 && x.clean <= Math.round(x.dirty * 0.68) && x.dirty <= 5000), JSON.stringify(loaded.bad));

// ---------------------------------------------------------------- 7. no Clean Bank from a stolen car
const stolen = await ev(() => {
  const g = window.game, uw = g.uw, M = g.money, S = uw.S, C2 = g.content, out = {};
  // through the garage of a house you own: a car you parked in your bay after stealing it, sold from the garage screen
  M.W.clean = 20000; g.save.rep = 500; const bought = uw.props.buy('linden');
  M.W.clean = 0; M.W.dirty.me = 0;
  const gp = C2.garagePoints()[0], ask = g.ui.ask; g.ui.ask = (t, d, ok, fn) => fn();
  const e = C2.addToGarage('sedan', 'stolen', undefined, true), price = C2.sellPrice(e);
  if (gp) { C2.openGarage(gp); C2._svcAct('sell:' + e.uid); while (g.ui.stack.length) g.ui.back(); }
  g.ui.ask = ask;
  out.garage = { bought, gp: !!gp, price, clean: M.W.clean, dirty: M.W.dirty.me };
  // through the chop shop
  const ch = uw.loc('spot', 'chop'); M.W.dirty.me = 0;
  const v = g.vehicles.spawn('sedan', ch.x + 3, ch.z, 0, { parked: true }); v.touched = true; v.looted = true; g.completeEnter(v);
  uw.sellCar(v, true);
  out.chop = { clean: M.W.clean, dirty: M.W.dirty.me };
  return out;
});
check('a stolen car sold through the garage pays Dirty Cash, not Clean Bank', stolen.garage.gp && stolen.garage.price > 0 && stolen.garage.clean === 0 && stolen.garage.dirty === stolen.garage.price, JSON.stringify(stolen));
check('a stolen car sold to the chop shop pays Dirty Cash, not Clean Bank', stolen.chop.clean === 0 && stolen.chop.dirty > 0, JSON.stringify(stolen));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'fixer');
