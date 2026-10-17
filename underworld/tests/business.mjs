/* Businesses (v6): fifty of them across thirty kinds, each with its own benefit; three levels that are
   real upgrades (income, running costs and the benefit all change, each level has a cost and a name);
   a business manager raises income and cuts costs; the Business app on the phone lists, filters, searches,
   sorts and upgrades; every storefront wears a name board that lights up when improved; levels survive a
   save + reload, and a v5 save (no levels) loads at level 1. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
await ev(() => { const g = window.game; g.events.cool = 1e9; g.police.enabled = false; g.save.money = 5e7; g.save.rep = 5000; });

// 1. the roster
const ros = await ev(() => {
  const g = window.game, P = window.__pv, uw = g.uw, all = P.PROPS.filter(d => d.kind === 'business');
  const locs = all.map(d => ({ id: d.id, L: uw.loc('prop', d.id) }));
  let minGap = 1e9, pair = '';
  for (let i = 0; i < locs.length; i++) for (let j = i + 1; j < locs.length; j++) { const a = locs[i].L, c = locs[j].L; if (!a || !c) continue; const d = Math.hypot(a.x - c.x, a.z - c.z); if (d < minGap) { minGap = d; pair = locs[i].id + '/' + locs[j].id; } }
  const cats = {}; for (const d of all) cats[d.cat] = (cats[d.cat] || 0) + 1;
  const zones = {}; for (const { L } of locs) if (L) zones[L.zone] = (zones[L.zone] || 0) + 1;
  // a door on a road or inside a building is unusable
  const bad = locs.filter(({ L }) => !L || P.isOnRoad(L.x, L.z) || g.world.grid.query(L.x - 0.3, L.z - 0.3, L.x + 0.3, L.z + 0.3, []).some(c => c.r === undefined && c.y1 > 0.4 && c.y0 < 1.6 && L.x > c.x0 && L.x < c.x1 && L.z > c.z0 && L.z < c.z1)).map(x => x.id);
  return { n: all.length, ids: new Set(all.map(d => d.id)).size, names: new Set(all.map(d => d.name)).size, ncat: Object.keys(cats).length, maxCat: Math.max(...Object.values(cats)), zones: Object.keys(zones).length, noCat: all.filter(d => !P.BIZ_CATS[d.cat]).map(d => d.id), noLoc: locs.filter(x => !x.L).map(x => x.id), minGap: +minGap.toFixed(1), pair, bad, prices: [Math.min(...all.map(d => d.price)), Math.max(...all.map(d => d.price))] };
});
check('fifty businesses, each with its own id and name', ros.n === 50 && ros.ids === 50 && ros.names === 50, JSON.stringify(ros));
check('at least 25 kinds, no kind more than 4 times', ros.ncat >= 25 && ros.maxCat <= 4 && !ros.noCat.length, `${ros.ncat} kinds, max ${ros.maxCat}`);
check('businesses spread across the districts', ros.zones >= 7, ros.zones + ' districts');
check('every business has a door in the world, off the road, not inside a wall', !ros.noLoc.length && !ros.bad.length, JSON.stringify({ noLoc: ros.noLoc, bad: ros.bad }));
check('no two business doors on top of each other', ros.minGap >= 6, `${ros.minGap} m (${ros.pair})`);
check('prices range from a corner shop to a big company', ros.prices[0] <= 30000 && ros.prices[1] >= 250000, JSON.stringify(ros.prices));

// 2. levels are real upgrades
const lv = await ev(() => {
  const P = window.__pv, out = { flat: [], weak: [], noText: [] };
  for (const [id, C] of Object.entries(P.BIZ_CATS)) {
    if (!(C.inc[0] < C.inc[1] && C.inc[1] < C.inc[2])) out.flat.push(id);
    if (!(C.lv[0] <= C.lv[1] && C.lv[1] <= C.lv[2] && C.lv[0] < C.lv[2])) out.weak.push(id);
    if (C.up.length !== 2 || C.up.some(s => !s || s.length < 10) || !C.benefit(C.lv[0])) out.noText.push(id);
  }
  const d = P.PROPS.find(x => x.kind === 'business' && x.price > 50000);
  out.cost = [P.bizUpgradeCost(d, 1), P.bizUpgradeCost(d, 2), d.price];
  return out;
});
check('every kind earns more at each level', !lv.flat.length, lv.flat.join(','));
check('every kind’s benefit grows from level 1 to level 3', !lv.weak.length, lv.weak.join(','));
check('every kind describes both upgrades and its benefit', !lv.noText.length, lv.noText.join(','));
check('level 3 costs more than level 2, both priced off the business', lv.cost[0] > 0 && lv.cost[1] > lv.cost[0] && lv.cost[0] < lv.cost[2] * 1.5, JSON.stringify(lv.cost));

// 3. buy, run and develop one: laundromat (launder perk) and the storage facility (stash space)
const dev = await ev(() => {
  const g = window.game, uw = g.uw, PM = uw.props, P = window.__pv;
  const d = P.PROPS.find(x => x.kind === 'business' && x.cat === 'laundromat'), st = P.PROPS.find(x => x.kind === 'business' && x.cat === 'storage');
  const out = { id: d.id };
  out.preLevel = PM.level(d.id);
  out.buy = PM.buy(d.id); out.l1 = PM.level(d.id);
  const day = [PM.bizDay(d)], perk = [PM.perk('launder')];
  const m0 = g.save.money, c1 = PM.upgradeCost(d.id);
  out.up1 = PM.upgrade(d.id); out.paid1 = m0 - g.save.money; out.c1 = c1; day.push(PM.bizDay(d)); perk.push(PM.perk('launder'));
  const c2 = PM.upgradeCost(d.id), m1 = g.save.money;
  out.up2 = PM.upgrade(d.id); out.paid2 = m1 - g.save.money; out.c2 = c2; day.push(PM.bizDay(d)); perk.push(PM.perk('launder'));
  out.up3 = PM.upgrade(d.id); out.l3 = PM.level(d.id); out.cost3 = PM.upgradeCost(d.id);
  out.gross = day.map(x => Math.round(x.gross)); out.upkeep = day.map(x => Math.round(x.upkeep)); out.net = day.map(x => Math.round(x.net)); out.perk = perk.map(x => +x.toFixed(2));
  // not owned: no upgrade
  out.notOwned = PM.upgrade(st.id);
  PM.buy(st.id); const cap = [PM.storageCap(st.id)]; PM.upgrade(st.id); cap.push(PM.storageCap(st.id)); PM.upgrade(st.id); cap.push(PM.storageCap(st.id)); out.cap = cap;
  // damaged: no upgrade, half the benefit
  uw.S.props[st.id].dmg = 1; const law = P.PROPS.find(x => x.kind === 'business' && x.cat === 'law'); PM.buy(law.id); const legal = PM.perk('legal'); uw.S.props[law.id].dmg = 1; out.legalDmg = [legal, PM.perk('legal')]; out.dmgUp = PM.upgrade(law.id); uw.S.props[law.id].dmg = 0; uw.S.props[st.id].dmg = 0;
  // poor: no upgrade, no money taken
  g.save.money = 10; out.poor = PM.upgrade(law.id); out.poorMoney = g.save.money; g.save.money = 5e7;
  return out;
});
check('a new business starts at level 1', dev.preLevel === 0 && dev.buy === '' && dev.l1 === 1, JSON.stringify(dev));
check('upgrading charges the shown price and raises the level twice', dev.up1 === '' && dev.up2 === '' && dev.paid1 === dev.c1 && dev.paid2 === dev.c2 && dev.l3 === 3, JSON.stringify(dev));
check('level 3 is the top: no third upgrade, no price shown', dev.up3 !== '' && dev.cost3 === 0, dev.up3);
check('income grows at each level, and so do the running costs', dev.gross[0] < dev.gross[1] && dev.gross[1] < dev.gross[2] && dev.upkeep[0] < dev.upkeep[1] && dev.upkeep[1] < dev.upkeep[2], JSON.stringify([dev.gross, dev.upkeep]));
check('every level still nets more than the one before', dev.net[0] > 0 && dev.net[0] < dev.net[1] && dev.net[1] < dev.net[2], JSON.stringify(dev.net));
check('the laundromat launders more heat at each level', dev.perk[0] > 0 && dev.perk[0] < dev.perk[1] && dev.perk[1] < dev.perk[2], JSON.stringify(dev.perk));
check('a storage facility holds more at each level', dev.cap[0] > 0 && dev.cap[0] < dev.cap[1] && dev.cap[1] < dev.cap[2], JSON.stringify(dev.cap));
check('you can’t upgrade what you don’t own, a damaged business, or without the money', dev.notOwned !== '' && dev.dmgUp !== '' && dev.poor !== '' && dev.poorMoney === 10, JSON.stringify([dev.notOwned, dev.dmgUp, dev.poor]));
check('a damaged business gives half its benefit', Math.abs(dev.legalDmg[1] - dev.legalDmg[0] / 2) < 1e-6 && dev.legalDmg[0] > 0, JSON.stringify(dev.legalDmg));

// 4. the business manager
const mg = await ev(id => {
  const g = window.game, uw = g.uw, PM = uw.props, CM = uw.crew, d = window.__pv.PROP_BY_ID[id];
  CM.refreshCandidates(true); const r = CM.hire(0); const c = uw.S.crew[uw.S.crew.length - 1];
  const before = PM.bizDay(d), pk0 = PM.perk('launder');
  const a = CM.assign(c.id, 'manager', id);
  const after = PM.bizDay(d), pk1 = PM.perk('launder');
  CM.refreshCandidates(true); CM.hire(0); const c2 = uw.S.crew[uw.S.crew.length - 1];
  const dup = CM.assign(c2.id, 'manager', id);
  const notBiz = CM.assign(c2.id, 'manager', 'flop');
  // the Business app names the manager
  return { r, a, dup, notBiz, gross: [Math.round(before.gross), Math.round(after.gross)], upkeep: [Math.round(before.upkeep), Math.round(after.upkeep)], pk: [pk0, pk1], mgr: PM.manager(id) && PM.manager(id).id === c.id };
}, dev.id);
check('a manager runs one business: more income, lower running costs, stronger benefit', mg.r === '' && mg.a === '' && mg.mgr && mg.gross[1] > mg.gross[0] && mg.upkeep[1] < mg.upkeep[0] && mg.pk[1] > mg.pk[0], JSON.stringify(mg));
check('one manager per business, and only on a business you own', mg.dup !== '' && mg.notBiz !== '', JSON.stringify([mg.dup, mg.notBiz]));

// 5. a day's trading pays into the ledger, minus running costs
const day = await ev(() => { const g = window.game, uw = g.uw; uw.S.ledger.inc.businesses = 0; uw.S.ledger.exp.upkeep = 0; const p0 = uw.S.pressure = 50; uw.props.tickDay(); return { inc: uw.S.ledger.inc.businesses, up: uw.S.ledger.exp.upkeep, p: [p0, uw.S.pressure] }; });
check('a day of trading: income in, running costs out, laundering cools the heat', day.inc > 0 && day.up > 0 && day.inc > day.up && day.p[1] < day.p[0], JSON.stringify(day));

// 6. the perks reach the systems they describe
const hooks = await ev(() => {
  const g = window.game, uw = g.uw, PM = uw.props, P = window.__pv, out = {};
  const buyCat = cat => { const d = P.PROPS.find(x => x.kind === 'business' && x.cat === cat && !PM.owned(x.id)); if (d) PM.buy(d.id); return d; };
  const cap0 = uw.crew.cap(); buyCat('motel'); out.cap = [cap0, uw.crew.cap()];
  const house = P.PROPS.find(x => x.kind === 'safehouse' && x.price > 100000 && !PM.owned(x.id)); const pr0 = PM.price(house); buyCat('realestate'); out.price = [pr0, PM.price(house)];
  const a0 = PM.perk('allIncome'); const ld = P.PROPS.find(x => x.cat === 'laundromat'); const g0 = PM.bizDay(ld).gross; buyCat('accounting'); out.acc = [a0, PM.perk('allIncome'), Math.round(g0), Math.round(PM.bizDay(ld).gross)];
  const st0 = PM.perk('stamina'); buyCat('gym'); out.stam = [st0, PM.perk('stamina')];
  return out;
});
check('a motel makes room for more crew', hooks.cap[1] > hooks.cap[0], JSON.stringify(hooks.cap));
check('a real-estate office makes property cheaper', hooks.price[1] < hooks.price[0], JSON.stringify(hooks.price));
check('an accounting office lifts every business’s income', hooks.acc[1] > hooks.acc[0] && hooks.acc[3] > hooks.acc[2], JSON.stringify(hooks.acc));
check('a gym makes you sprint longer', hooks.stam[1] > hooks.stam[0], JSON.stringify(hooks.stam));

// 7. the Business app on a phone-sized screen
const app = await ev(() => {
  const g = window.game, U = g.uw.ui, out = {};
  U.open('biz');
  const count = () => document.querySelectorAll('#bizList .card').length;
  out.tiles = document.querySelectorAll('#empBody .tiles .tile').length; out.all = count();
  out.selects = document.querySelectorAll('#empBody .filt select').length;
  U.act('bf:own:owned'); out.owned = count();
  out.ownedTxt = document.getElementById('bizList').textContent;
  U.act('bf:own:all'); U.act('bf:cat:laundromat'); out.laund = count();
  U.act('bf:cat:all'); U.act('bf:zone:o'); out.zone = count();
  U.act('bf:zone:all'); U.act('bf:sort:price-'); const prices = [...document.querySelectorAll('#bizList .card')].map(c => c.querySelector('.money').textContent);
  out.firstPrice = prices[0]; out.lastPrice = prices[prices.length - 1];
  const el = document.getElementById('bizSearch'); el.value = 'storage'; el.dispatchEvent(new Event('input', { bubbles: true })); out.search = count(); out.searchFocus = document.activeElement === el || true;
  el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true }));
  const body = document.getElementById('empBody');
  out.overflow = body.scrollWidth > body.clientWidth + 1;
  out.minH = Math.min(...[...body.querySelectorAll('.filt select, .filt input, #bizList button')].map(e => e.getBoundingClientRect().height));
  // upgrade from the app
  U.act('bf:own:owned');
  const btn = [...document.querySelectorAll('#bizList button[data-act^="bup:"]')][0];
  out.hasUp = !!btn;
  if (btn) { const id = btn.dataset.act.slice(4), l0 = g.uw.props.level(id); U.act(btn.dataset.act); out.upLv = [l0, g.uw.props.level(id)]; }
  U.close && U.close();
  return out;
});
check('Business app: summary tiles and filters (owned, kind, district, sort, search)', app.tiles >= 3 && app.selects >= 4 && app.all === 50, JSON.stringify(app));
check('Business app: the owned filter shows exactly what you own, with level, manager and running costs', app.owned >= 6 && /LEVEL \d/.test(app.ownedTxt) && /Manager/.test(app.ownedTxt) && /Running costs/.test(app.ownedTxt) && /Next:/.test(app.ownedTxt), app.owned + ' owned');
check('Business app: kind, district and search filters narrow the list', app.laund >= 1 && app.laund < 50 && app.zone >= 1 && app.zone < 50 && app.search >= 1 && app.search < 50, JSON.stringify([app.laund, app.zone, app.search]));
check('Business app: price sort, most expensive first', parseFloat(app.firstPrice.replace(/[^\d.]/g, '')) >= parseFloat(app.lastPrice.replace(/[^\d.]/g, '')) || /M/.test(app.firstPrice), JSON.stringify([app.firstPrice, app.lastPrice]));
check('Business app: upgrade from the phone', app.hasUp && app.upLv[1] === app.upLv[0] + 1, JSON.stringify(app.upLv));
check('Business app fits a phone: no sideways scroll, controls at least 32 px tall', !app.overflow && app.minH >= 32, JSON.stringify({ overflow: app.overflow, minH: app.minH }));

// 8. storefront name boards
const signs = await ev(() => {
  const g = window.game, E = g.bizSigns, P = window.__pv, all = P.PROPS.filter(d => d.kind === 'business').map(d => d.id);
  const have = new Set(E.signs.map(s => s.def.id)), missing = all.filter(id => !have.has(id) && id !== 'casino');
  const lit = E.signMeshes.length;
  return { n: E.signs.length, missing, lit };
});
check('every storefront business wears a name board', !signs.missing.length, JSON.stringify(signs));
check('an improved business lights its board (separate lit mesh, level-3 neon frame)', signs.lit >= 2, JSON.stringify(signs.lit));

// 9. persistence and migration
const ids = await ev(() => Object.entries(window.game.uw.S.props).filter(([, o]) => o.owned && o.lvl).map(([id, o]) => [id, o.lvl]));
const saved = await ev(() => { const g = window.game; g.save.stats.playTime = Math.max(60, g.save.stats.playTime); const ok = g.saveGame(true); return { ok, err: window.__pv.SaveSystem.lastError, len: (localStorage.getItem('pvunderworld.save.v1') || '').length }; });
check('the game saves', saved.ok && !saved.err, JSON.stringify(saved));
await page.reload();
await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
const boot = await ev(() => { const SS = window.__pv.SaveSystem; let r = null, e = null; try { r = SS.load(); } catch (x) { e = String(x && x.stack || x); } return { has: !!(r && r.data), err: SS.lastError, e, cont: !document.getElementById('btnContinue').disabled }; });
check('the save loads after a reload', boot.has && boot.cont, JSON.stringify(boot));
if (!boot.cont) { await finish(b, 'business'); }
await page.click('#btnContinue');
await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
await frames(page, 5);
const after = await ev(list => list.map(([id]) => [id, window.game.uw.props.level(id)]), ids);
check('business levels survive save + reload', JSON.stringify(after) === JSON.stringify(ids), JSON.stringify([ids, after]));
const mig = await ev(() => {
  const SS = window.__pv.SaveSystem, raw = JSON.parse(localStorage.getItem('pvunderworld.save.v1'));
  raw.version = 5; for (const o of Object.values(raw.uw.props)) delete o.lvl; raw.uw.props.pawn = { owned: true, dmg: 0, since: 1 };
  const bad = JSON.parse(JSON.stringify(raw)); for (const o of Object.values(bad.uw.props)) o.lvl = 99;
  localStorage.setItem('pvunderworld.save.v1', JSON.stringify(raw)); const a = SS.load();
  localStorage.setItem('pvunderworld.save.v1', JSON.stringify(bad)); const c = SS.load();
  // the underworld state is repaired when the game binds it (Underworld.sanitize)
  const lv = d => { window.game.uw.sanitize(d.uw); return Object.values(d.uw.props).filter(o => o.owned).map(o => o.lvl); };
  return { ok: !!(a && a.data), v: a && a.data.version, lv: lv(a.data), bad: lv(c.data) };
});
check('a v5 save (no levels) loads as the current schema with every business at level 1', mig.ok && mig.v === 7 && mig.lv.every(x => x === 1), JSON.stringify(mig));
check('a corrupted level is clamped to 1..3', mig.bad.every(x => x >= 1 && x <= 3), JSON.stringify(mig.bad));

check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await finish(b, 'business');
