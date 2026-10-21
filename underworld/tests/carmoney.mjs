/* Car provenance and resale (handoff §45.24, DC-29). Every purchase here goes through the real dealer code
   (DealerLots.buy) and every sale through the garage screen.
   - A car bought with Dirty Cash resells for Dirty Cash; one bought with Clean Bank for Clean Bank; a mixed purchase
     pays back in the same proportions. A stolen car sells for Dirty Cash (garage and chop shop).
   - Provenance is separate from origin: a car that isn't stolen is not automatically clean-origin.
   - No ordinary car resells for more than was put into it, so buying and selling always loses money and the used lot
     is no laundering loop.
   - Provenance survives save and reload. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
await ev(() => {
  const g = window.game, uw = g.uw, M = g.money;
  g.events.cool = 1e9; g.debug.god = true; g.save.rep = 5000; g.police.enabled = false;
  // somewhere to keep cars: a house with a garage (bought with Clean Bank)
  M.W.clean = 1e6; uw.props.buy('linden'); uw.props.buy('qgarage');
  window.__buy = (lot, car) => { const DL = g.dealers, st = DL.state(lot); st.cars[0] = car; const r = DL.buy(lot, 0); return r ? null : g.save.garage[g.save.garage.length - 1]; };
  window.__sell = e => { const C = g.content, gp = C.garagePoints()[0], ask = g.ui.ask, d0 = M.W.dirty.me, c0 = M.W.clean; g.ui.ask = (t, d, ok, fn) => fn(); C.openGarage(gp); C._svcAct('sell:' + e.uid); while (g.ui.stack.length) g.ui.back(); g.ui.ask = ask; return { dirty: +(M.W.dirty.me - d0).toFixed(2), clean: +(M.W.clean - c0).toFixed(2), gone: !g.save.garage.includes(e) }; };
  window.__clear = () => { for (const e of g.save.garage.slice()) { const i = g.save.garage.indexOf(e); g.save.garage.splice(i, 1); for (const v of g.vehicles.list.slice()) if (v.garageUid === e.uid && v !== g.player.vehicle) g.vehicles.despawn(v); } };
});

// ---------------------------------------------------------------- 1. the currency a car was bought with is the currency it sells for
const one = await ev(() => {
  const g = window.game, M = g.money, out = {};
  const car = (type, price, cond = 90) => ({ type, color: 0, cond, km: 50000, price, vtier: 'common', bargain: false });
  // Saltworks with Dirty Cash only
  M.W.dirty.me = 5000; M.W.clean = 0;
  const d = window.__buy('used', car('sedan', 2000)); out.dirtyProv = d && { ...d.prov }; out.dirtySale = window.__sell(d);
  // Meridian with Clean Bank (licensed dealers take the bank only)
  M.W.dirty.me = 0; M.W.clean = 10000;
  const c = window.__buy('new', car('sedan', 3200, 100)); out.cleanProv = c && { ...c.prov }; out.cleanSale = window.__sell(c);
  // Saltworks paid partly in cash, partly from the bank (Dirty first)
  M.W.dirty.me = 500; M.W.clean = 5000;
  const m = window.__buy('used', car('sedan', 2000)); out.mixProv = m && { ...m.prov }; out.mixSale = window.__sell(m);
  return out;
});
check('a car bought with Dirty Cash records it, and resells for Dirty Cash only', one.dirtyProv && one.dirtyProv.dirty === 2000 && one.dirtyProv.clean === 0 && one.dirtySale.gone && one.dirtySale.dirty > 0 && one.dirtySale.clean === 0, JSON.stringify(one));
check('a car bought with Clean Bank records it, and resells for Clean Bank only', one.cleanProv && one.cleanProv.clean === 3200 && one.cleanProv.dirty === 0 && one.cleanSale.gone && one.cleanSale.clean > 0 && one.cleanSale.dirty === 0, JSON.stringify(one));
check('a mixed purchase ($500 cash, $1,500 bank) pays back in the same proportions', one.mixProv && one.mixProv.dirty === 500 && one.mixProv.clean === 1500 && Math.abs(one.mixSale.dirty * 3 - one.mixSale.clean) <= 3 && one.mixSale.dirty > 0, JSON.stringify(one));

// ---------------------------------------------------------------- 2. stolen cars: criminal channels, Dirty Cash
const stolen = await ev(() => {
  const g = window.game, uw = g.uw, M = g.money, C = g.content, out = {};
  M.W.dirty.me = 0; M.W.clean = 0;
  const e = C.addToGarage('sports', 'stolen', undefined, true); out.prov = 'prov' in e; out.garage = window.__sell(e);
  const ch = uw.loc('spot', 'chop'); const c0 = M.W.clean, d0 = M.W.dirty.me;
  const v = g.vehicles.spawn('sedan', ch.x + 3, ch.z, 0, { parked: true }); v.touched = true; v.looted = true; g.completeEnter(v); uw.sellCar(v, true);
  out.chop = { dirty: M.W.dirty.me - d0, clean: M.W.clean - c0 };
  return out;
});
check('a stolen car sold from the garage pays Dirty Cash', stolen.garage.gone && stolen.garage.dirty > 0 && stolen.garage.clean === 0, JSON.stringify(stolen));
check('a stolen car sold to the chop shop pays Dirty Cash', stolen.chop.dirty > 0 && stolen.chop.clean === 0, JSON.stringify(stolen));

// ---------------------------------------------------------------- 3. never above the purchase price: no flipping, no laundering loop
const flip = await ev(() => {
  const g = window.game, DL = g.dealers, M = g.money, out = { n: 0, worst: 0, cleanOut: 0, cur: true };
  // 300 real Saltworks stalls, as the lot generates them, bought with Dirty Cash and sold straight back
  for (let k = 0; k < 300; k++) {
    window.__clear();
    const c = DL.make('used', k % 8, []);
    M.W.dirty.me = c.price; M.W.clean = 0;
    const e = window.__buy('used', c); if (!e) continue;
    const s = window.__sell(e); out.n++;
    out.worst = Math.max(out.worst, (s.dirty + s.clean) / c.price);
    out.cleanOut += s.clean;
  }
  // a laundering loop: start with $50,000 Dirty, keep buying the best-value stall and selling it
  window.__clear(); M.W.dirty.me = 50000; M.W.clean = 0; let rounds = 0;
  for (; rounds < 25; rounds++) {
    const c = DL.make('used', rounds % 8, []); if (c.price > M.W.dirty.me) continue;
    const e = window.__buy('used', c); if (!e) break; window.__sell(e);
  }
  out.loop = { rounds, dirty: Math.round(M.W.dirty.me), clean: M.W.clean };
  // a Clean-bought new car resold is under its price too; tuning paid from the bank counts as Clean put in
  window.__clear(); M.W.dirty.me = 0; M.W.clean = 1e6;
  const e = window.__buy('new', { type: 'sports', color: 0, cond: 100, km: 0, price: 19500, vtier: 'common', bargain: false });
  const p0 = { ...e.prov }; out.newSale = g.content.saleOf(e); out.newProv = p0;
  return out;
});
check('300 real used-lot cars bought with Dirty Cash and sold back: each returns at most 85% of its price, none in Clean Bank', flip.n >= 250 && flip.worst <= 0.85 + 1e-9 && flip.cleanOut === 0, JSON.stringify(flip));
check('a buy-and-sell loop on the used lot only loses Dirty Cash and never makes Clean Bank', flip.loop.rounds > 5 && flip.loop.dirty < 50000 && flip.loop.clean === 0, JSON.stringify(flip.loop));
check('a new car bought with Clean Bank resells for less than it cost', flip.newSale.total > 0 && flip.newSale.total <= flip.newProv.clean * 0.85 && flip.newSale.dirty === 0, JSON.stringify(flip));

// ---------------------------------------------------------------- 4. save and reload keep provenance
const saved = await ev(() => {
  const g = window.game, M = g.money; window.__clear();
  M.W.dirty.me = 700; M.W.clean = 5000;
  const e = window.__buy('used', { type: 'pickup', color: 0, cond: 80, km: 90000, price: 2400, vtier: 'common', bargain: false });
  g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true);
  return { uid: e.uid, prov: { ...e.prov }, sale: g.content.saleOf(e) };
});
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
const loaded = await ev(uid => { const g = window.game, e = g.save.garage.find(x => x.uid === uid); return e ? { prov: { ...e.prov }, sale: g.content.saleOf(e) } : null; }, saved.uid);
check('save → reload: a car’s provenance and its resale split are identical', loaded && JSON.stringify(loaded.prov) === JSON.stringify(saved.prov) && JSON.stringify(loaded.sale) === JSON.stringify(saved.sale) && saved.prov.dirty === 700 && saved.prov.clean === 1700, JSON.stringify({ saved, loaded }));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'carmoney');
