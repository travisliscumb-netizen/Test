/* The phone as apps: a home screen of app tiles in three groups (no wall of tiny icons), every app
   opens at phone width with a back button and nothing spilling sideways; the Market app shows
   cost basis, value now and profit; Street Connect lists who sells and who buys each product,
   respects discovery and sets a real waypoint; the map has separate BUY and SELL layers. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b, { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
await ev(() => { const g = window.game; g.events.cool = 1e9; (g.money.W.clean = g.money.W.dirty.me = 250000); g.save.rep = 50; });

// home screen
const home = await ev(() => {
  const g = window.game; g.uw.ui.open();
  const tiles = [...document.querySelectorAll('#empBody .app')], W = innerWidth;
  const rects = tiles.map(t => t.getBoundingClientRect());
  return { modal: g.ui.modal, title: document.getElementById('empTitle').textContent, n: tiles.length, groups: [...document.querySelectorAll('#empBody .appHome h4')].map(h => h.textContent), tabsHidden: document.getElementById('empTabs').classList.contains('hidden'), minW: Math.min(...rects.map(r => r.width)), minH: Math.min(...rects.map(r => r.height)), inside: rects.every(r => r.left >= 0 && r.right <= W + 0.5), names: tiles.map(t => t.querySelector('b').textContent) };
});
check('opening the phone shows the app home screen (no tab wall)', home.modal === 'empireScreen' && home.title === 'Phone' && home.tabsHidden && home.n >= 10 && home.n <= 15, JSON.stringify(home));
check('apps are grouped (Empire / Operations / Trade / Assets / City / Messages) with big touch targets inside the screen', home.groups.join() === 'EMPIRE,OPERATIONS,TRADE,ASSETS,CITY,MESSAGES' && home.minW >= 64 && home.minH >= 64 && home.inside, JSON.stringify(home));
check('the home screen has every app the job needs', ['Empire', 'Market', 'Street Connect', 'Inventory', 'Stashes', 'Crew', 'Property', 'Garage', 'Armory', 'Police', 'Messages', 'Map', 'Cabline'].every(n => home.names.includes(n)), JSON.stringify(home.names));

// every app: opens, has a back button, its pages render, no sideways overflow, back returns home
const apps = await ev(() => {
  const g = window.game, out = [];
  const ids = [...document.querySelectorAll('#empBody .app')].map(t => t.dataset.act.split(':')[1]).filter(id => id !== 'map' && id !== 'taxi');
  for (const id of ids) {
    g.uw.ui.open(); document.querySelector(`#empBody [data-act="app:${id}"]`).click();
    const segs = [...document.querySelectorAll('#empTabs .etab:not(.back)')].map(s => s.dataset.tab);
    const pages = [];
    for (const t of segs.length ? segs : [g.uw.ui.tab]) {
      const s = document.querySelector(`#empTabs [data-tab="${t}"]`); if (s) s.click();
      const body = document.getElementById('empBody'), panel = body.closest('.panel');
      pages.push({ t, len: body.innerHTML.length, over: Math.max(document.documentElement.scrollWidth - innerWidth, panel.getBoundingClientRect().right - innerWidth), smallBtns: [...body.querySelectorAll('button')].filter(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height < 30; }).length });
    }
    const bk = document.querySelector('#empTabs .back'), r = bk.getBoundingClientRect();
    bk.click();
    out.push({ id, title: null, back: Math.round(r.height), pages, home: g.uw.ui.tab === 'home' && document.querySelectorAll('#empBody .app').length > 0 });
  }
  while (g.ui.stack.length) g.ui.back();
  return out;
});
check('every app opens with a back button (≥44 px) and returns to the home screen', apps.length >= 11 && apps.every(a => a.back >= 44 && a.home), JSON.stringify(apps.map(a => [a.id, a.back, a.home])));
check('every app page renders and nothing spills off the side of a 390 px screen', apps.every(a => a.pages.every(p => p.len > 60 && p.over <= 1)), JSON.stringify(apps.map(a => [a.id, a.pages.map(p => [p.t, p.len, Math.round(p.over)])])));
// multi-page apps keep their pages under one app
const segs = await ev(() => { const g = window.game; g.uw.ui.open('runs'); const r = { title: document.getElementById('empTitle').textContent, segs: [...document.querySelectorAll('#empTabs .etab:not(.back)')].map(s => s.textContent), on: document.querySelector('#empTabs .etab.on').textContent }; while (g.ui.stack.length) g.ui.back(); return r; });
check('pages live inside their app (Crew › Deliveries), opened by name', segs.title === 'Crew' && segs.segs.join() === 'Crew,Deliveries' && segs.on === 'Deliveries', JSON.stringify(segs));

// the Map and Cabline apps leave the phone
const goMap = await ev(() => { const g = window.game; g.uw.ui.open(); document.querySelector('#empBody [data-act="app:map"]').click(); const r = { modal: g.ui.modal, map: !!g.mapOpen }; g.ui.toggleMap(false); return r; });
check('Map app closes the phone and opens the city map', !goMap.modal && goMap.map, JSON.stringify(goMap));
const goCab = await ev(() => { const g = window.game, P = window.__pv, kp = P.nearestRoadPoint(5 * 80 + 40, 5 * 80); g.resetPlayerState(kp.x, kp.z, 0); g.uw.ui.open(); document.querySelector('#empBody [data-act="app:taxi"]').click(); const r = { modal: g.ui.modal, state: g.taxi.state }; g.taxi.release(); return r; });
check('Cabline app calls a real cab', !goCab.modal && goCab.state === 'coming', JSON.stringify(goCab));

// MARKET: cost basis, value now, unrealised P/L that follows the price, realised P/L after a sale
const mk = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, P = window.__pv, z = 'o';
  const L = uw.loc('spot', 'sully'); g.resetPlayerState(L.x, L.z, 0);
  const lots = P.lotsFor('smokes', 5) || 5, pr = uw.market.wholesale(L.zone, 'smokes');
  uw.give({ smokes: lots }, 'buy', { smokes: pr });
  const cost = lots * pr;
  const read = () => { uw.ui.open('pnl'); const t = document.getElementById('empBody').textContent; while (g.ui.stack.length) g.ui.back(); return t; };
  const before = read(); const val0 = uw.locations({ all: true }).reduce((a, Lc) => a + P.holdings(Lc.o, Lc.zone).filter(r => r.k === 'smokes').reduce((x, r) => x + r.value, 0), 0);
  // the market rises 50% everywhere for smokes
  const old = {}; for (const zz in S.market) { old[zz] = S.market[zz].smokes[1]; S.market[zz].smokes[1] *= 1.5; }
  const after = read();
  const val = uw.locations({ all: true }).reduce((a, Lc) => a + P.holdings(Lc.o, Lc.zone).filter(r => r.k === 'smokes').reduce((x, r) => x + r.value, 0), 0);
  // sell two lots at a known price: realised P/L by product
  uw.take('smokes', 2); const cash = 2 * Math.round(pr * 1.4); g.earn(cash, 'deal'); uw.realize(cash, 'smokes');
  const sold = read();
  for (const zz in old) S.market[zz].smokes[1] = old[zz];
  return { val0: Math.round(val0), lots, cost, before: before.slice(0, 900), after: after.slice(0, 900), hasCost: before.includes('Cost basis') && before.includes('Average paid') && before.includes('Unrealised P/L') && before.includes('Realised P/L') && before.includes('Worth now'), costShown: before.includes('$' + cost.toLocaleString('en-US')), val: Math.round(val), cost2: cost, realBy: S.realBy.smokes, soldTxt: sold.includes('Realised') };
});
check('Market › My stock: quantity, average paid, cost basis, sale price here, best price, value now, unrealised and realised P/L', mk.hasCost && mk.costShown, JSON.stringify({ lots: mk.lots, cost: mk.cost, t: mk.before.slice(0, 500) }));
check('when the market rises, the same stock is worth more than it cost (shown in green)', mk.val > mk.val0 * 1.25 && /UnrealisedP\/L\+/.test(mk.after.replace(/\s+/g, '')) && mk.after.length > 0, JSON.stringify({ val0: mk.val0, val: mk.val, cost: mk.cost2, t: mk.after.slice(0, 600) }));
check('a sale books realised profit against what that stock cost, per product', mk.realBy > 0 && mk.soldTxt, JSON.stringify(mk.realBy));

// STREET CONNECT
const sc = await ev(() => {
  const g = window.game, uw = g.uw;
  g.save.rep = 50; g.save.discovered.zones = { o: 1 };
  uw.ui.open('connect');
  document.querySelector('#empBody [data-act="cc:good:green"]').click();
  const t = document.getElementById('empBody').textContent;
  const r = { unknownGus: t.includes('Unknown supplier') && !t.includes('Greenhouse Gus'), buyHdr: t.includes('BUY FROM'), sellHdr: t.includes('SELL TO'), oldQuarter: t.includes('Street buyers · ' + window.__pv.ZONES.o.name), undiscovered: /district\(s\) not discovered/.test(t) };
  g.save.rep = 150; uw.ui.render();
  const t2 = document.getElementById('empBody').textContent; r.knownGus = t2.includes('Greenhouse Gus');
  // tap waypoint on the first known buyer
  const sellRows = [...document.querySelectorAll('#empBody .ccRole.sell + .jobs .job:not(.locked)')];
  const btn = sellRows[0] && sellRows[0].querySelector('[data-act^="wp:"]'); r.hasBtn = !!btn;
  if (btn) btn.click();
  const wp = g.content.waypoint; r.wp = wp && { label: wp.label, key: wp.key, x: Math.round(wp.x), z: Math.round(wp.z) };
  r.msg = (document.querySelector('#empBody .empMsg') || {}).textContent;
  while (g.ui.stack.length) g.ui.back();
  // the GPS follows it: the objective line names the waypoint after a frame
  for (let k = 0; k < 30; k++) g.update(1 / 60, 1 / 60);
  r.obj = document.getElementById('objective').textContent;
  return r;
});
check('Street Connect: for each product, who sells it to you and who buys it from you', sc.buyHdr && sc.sellHdr && sc.oldQuarter, JSON.stringify(sc));
check('it respects discovery: suppliers stay unknown below their reputation, unexplored districts stay hidden', sc.unknownGus && sc.knownGus && sc.undiscovered, JSON.stringify(sc));
check('“Waypoint” sets normal GPS tracking to the contact', sc.hasBtn && sc.wp && /Street buyers/.test(sc.wp.label) && /^deal:/.test(sc.wp.key) && sc.obj.includes('Street buyers'), JSON.stringify(sc));

// STASHES, GARAGE, ARMORY say what is where
const where = await ev(() => {
  const g = window.game, uw = g.uw, s = g.save;
  uw.props.grant ? uw.props.grant('linden') : (uw.S.props.linden = uw.S.props.linden || { dmg: 0 });
  const owned = uw.props.owned('linden');
  s.weapons.pistol = true; s.wloc.pistol = owned ? 'linden' : null;
  uw.ui.open('stashes'); const st = document.getElementById('empBody').textContent;
  uw.ui.open('garage'); const ga = document.getElementById('empBody').textContent;
  uw.ui.open('loadout'); const ar = document.getElementById('empBody').textContent;
  while (g.ui.stack.length) g.ui.back();
  return { owned, stash: owned ? st.includes('Pistol') && st.includes('Space') : st.includes('No property'), garage: s.garage.length ? s.garage.every(e => ga.includes(window.__pv.VEHICLES[e.type].name)) && /Condition/.test(ga) : /don’t own a car/.test(ga), armory: ar.length > 100 };
});
check('Stashes shows product, guns, rounds and vests per property; Garage shows each car and where it is', where.stash && where.garage && where.armory, JSON.stringify(where));

// MAP: separate BUY and SELL layers with distinct symbols, sell points only where you've been
const mp = await ev(() => {
  const g = window.game, v = g.ui.mapView, C = window.__pv.MAP_CATS;
  g.save.discovered.zones = { o: 1, c: 1 };
  v.buildIndex();
  const buy = v.entries.filter(e => e.cat === 'buy'), sell = v.entries.filter(e => e.cat === 'sell');
  const layers = window.__pv.MAP_CATS.buy.layer === 'buy' && window.__pv.MAP_CATS.sell.layer === 'sell';
  v.setLayer('sell', false); const vis = v.visibleEntries().filter(e => e.cat === 'sell').length; v.setLayer('sell', true);
  return { buy: buy.map(e => e.name), sell: sell.map(e => e.name), buyIcon: C.buy.icon, sellIcon: C.sell.icon, buyCol: C.buy.col, sellCol: C.sell.col, layers, hidden: vis, subs: buy.every(e => /^BUY/.test(e.sub)) && sell.every(e => /SELL/.test(e.sub)) };
});
check('map: suppliers are a BUY layer and buyers a SELL layer, with different symbols and colours', mp.layers && mp.buy.length >= 3 && mp.sell.length >= 2 && mp.buyIcon !== mp.sellIcon && mp.buyCol !== mp.sellCol && mp.subs, JSON.stringify(mp));
check('sell points appear only for districts you have discovered, and the layer can be switched off', mp.sell.filter(n => /Street buyers/.test(n)).length === 2 && mp.hidden === 0, JSON.stringify(mp));

// jail: only Empire and Feed answer without a phone
const jail = await ev(() => {
  const g = window.game, uw = g.uw; uw.S.jail = { total: 30, served: 0, charges: 'test', speed: 1 }; uw.S.jailPhone = false;
  uw.ui.open(); const locked = [...document.querySelectorAll('#empBody .app.locked')].map(t => t.querySelector('b').textContent);
  document.querySelector('#empBody [data-act="app:market"]').click(); const t = document.getElementById('empBody').textContent;
  while (g.ui.stack.length) g.ui.back(); uw.S.jail = null;
  return { locked, blocked: t.includes('can’t reach anyone') };
});
check('in jail without a phone, every app but Messages (Empire included) is greyed out and locked', jail.locked.includes('Market') && jail.locked.includes('Empire') && !jail.locked.includes('Messages') && jail.blocked, JSON.stringify(jail));
// ---------------------------------------------------------------- M11: the header, the direct Map, the inbox and its deep links
const m11 = await ev(() => {
  const g = window.game, uw = g.uw, out = {};
  uw.ui.open();
  out.header = [...document.querySelectorAll('#empStats > span')].map(e => e.textContent.replace(/[^A-Za-z ]/g, '').trim().split(' ')[0]);
  out.sub = /Rep/.test(document.querySelector('#empStats .empSub').textContent);
  out.mapBtn = !!document.querySelector('#empBody .appTop [data-act="app:map"]');
  out.calm = /Nothing urgent/.test(document.querySelector('#empBody .appTop').textContent);
  // a warrant: it shows on the home strip and in Messages, and its link opens the case file
  uw.legal.L.warrant = true; uw.ui.render();
  out.strip = document.querySelector('#empBody .appTop').textContent;
  document.querySelector('#empBody [data-act="app:feed"]').click();
  const body = document.getElementById('empBody'); out.inbox = /Needs you/.test(body.textContent) && /warrant/.test(body.textContent);
  const go = body.querySelector('[data-act="go:police"]'); out.go = !!go; if (go) go.click();
  out.tab = uw.ui.tab; out.title = document.getElementById('empTitle').textContent;
  uw.legal.L.warrant = false;
  while (g.ui.stack.length) g.ui.back();
  return out;
});
check('the phone header leads with Rank · Dirty · Bank · Pressure (Rep, influence and day below)', m11.header.length === 4 && m11.header[1] === 'Dirty' && m11.header[2] === 'Bank' && m11.header[3] === 'Pressure' && m11.sub, JSON.stringify(m11));
check('the Map is one tap from the top of the home screen, which says when nothing is urgent', m11.mapBtn && m11.calm, JSON.stringify(m11));
check('a warrant shows as “needs you”; in Messages its link opens the Police case file', /1 needs you/.test(m11.strip) && m11.inbox && m11.go && m11.tab === 'police' && m11.title === 'Police', JSON.stringify(m11));
const intel = await ev(() => {
  const g = window.game, uw = g.uw, v = g.ui.mapView, out = {};
  for (const z in window.__pv.ZONES) g.save.discovered.zones[z] = false;
  v.buildIndex(); out.none = v.entries.filter(e => e.cat === 'rivalwh').length;
  for (const z in window.__pv.ZONES) g.save.discovered.zones[z] = true;
  v.buildIndex(); out.all = v.entries.filter(e => e.cat === 'rivalwh').length; out.layer = v.layerOn('intel');
  return out;
});
check('map intel: a rival stash house appears only once you know its district; the Intel layer is on by default', intel.none === 0 && intel.all >= 3 && intel.layer, JSON.stringify(intel));
const cab = await ev(() => {
  const g = window.game, uw = g.uw, T = g.taxi, P = window.__pv, out = {};
  const kp = P.nearestRoadPoint(5 * 80 + 40, 5 * 80); g.resetPlayerState(kp.x, kp.z, 0); g.police.clear();
  uw.S.inv = {}; out.clean = T.canHail();
  uw.S.inv = { green: 5 }; out.load = T.canHail();
  uw.S.inv = { green: 1 }; out.small = T.canHail();
  g.police.setLevel(1); out.wanted = T.canHail(); g.police.clear();
  // a ride with a little product: no Skip
  T.state = 'riding'; T.cab = g.vehicles.list[0] || {}; T.dest = { x: kp.x + 300, z: kp.z, name: 'x' }; const t0 = g.env.time; T.skip(); out.skipped = g.fading || g.env.time !== t0;
  T.state = 'idle'; T.cab = null; T.dest = null; uw.S.inv = {};
  return out;
});
check('taxi rules: no cab while wanted or with a load of product; a little product rides but cannot Skip', cab.clean === null && /deliveries/.test(cab.load || '') && cab.small === null && /police/.test(cab.wanted || '') && !cab.skipped, JSON.stringify(cab));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'phoneapps');
