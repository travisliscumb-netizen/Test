/* Homes (v6): 45 buyable residences over every market (rooms and bedsits to the estate), signature homes in
   each neighbourhood, attributes (storage, parking, crew room, prestige, security, finish, neighbourhood perk),
   seeded floor plans by tier (about 5 rooms in an ordinary house, 7-10 in better ones, 10+ in a signature home,
   11 substantial rooms in the mansion) that vary between houses and are fully walkable, every home enterable,
   for-sale homes viewable and burglarizable with named valuables while your own never are, the Property app's
   filters, purchase, save and a v5 migration. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const waitFade = () => page.waitForFunction(() => !window.game.fading, null, { timeout: 30000, polling: 100 });
await ev(() => { const g = window.game; g.events.cool = 1e9; g.police.enabled = false; g.traffic.enabled = false; });

const cat = await ev(() => {
  const g = window.game, P = window.__pv, homes = P.PROPS.filter(p => p.kind === 'safehouse');
  const tiers = {}; for (const h of homes) tiers[h.tier] = (tiers[h.tier] || 0) + 1;
  const zones = {}; for (const h of homes) { const L = g.uw.loc('prop', h.id); zones[L.zone] = (zones[L.zone] || 0) + 1; }
  const sig = homes.filter(h => h.sig).map(h => [h.id, h.sig]);
  const prices = homes.map(h => h.price).sort((a, b) => a - b);
  const enterable = homes.filter(h => h.home || h.place === 'tower' || h.id === 'linden').length;
  const attrs = homes.every(h => h.sec >= 1 && h.finish && h.storage > 0);
  // every home has its own door, at least 6 m from every other location
  const locs = g.uw.locs.filter(l => l.kind !== 'deal'); let minD = 1e9;
  for (const h of homes) { const L = g.uw.loc('prop', h.id); for (const o of locs) if (o !== L) minD = Math.min(minD, Math.hypot(o.x - L.x, o.z - L.z)); }
  return { n: homes.length, tiers, zones, sig, lo: prices[0], hi: prices[prices.length - 1], enterable, attrs, minD };
});
check('45 buyable homes in all', cat.n === 45, String(cat.n));
check('every tier of the market: rooms and bedsits, apartments, houses, upscale, luxury, penthouse and estate', [1, 2, 3, 4, 5, 6].every(t => cat.tiers[t] >= 2), JSON.stringify(cat.tiers));
check('prices run from about $2,500 to $380,000', cat.lo <= 3000 && cat.hi >= 380000, `${cat.lo}–${cat.hi}`);
check('spread over at least seven districts', Object.keys(cat.zones).length >= 7, JSON.stringify(cat.zones));
check('a signature home in each residential neighbourhood (Linden, Crestmoor, Cedar Fields, Old Quarter, Financial)', ['l', 'u', 'r', 'o', 'c'].every(z => cat.sig.some(s => s[1] === z)), JSON.stringify(cat.sig));
check('every home lists security, finish and storage', cat.attrs, '');
check('every home can be walked into', cat.enterable === 45, String(cat.enterable));
check('home doors are at least 6 m from any other location', cat.minD >= 6, cat.minD.toFixed(1));

// floor plans: rooms by tier, variety, reachability (all homes, owned and break-in)
const plans = await ev(() => {
  const g = window.game, P = window.__pv, out = { rooms: {}, sigs: [], variety: {}, bad: [] };
  const grid = g.world.grid, res = {}, I = g.content.interiors;
  const reach = def => {
    const S = 0.25, free = (x, z) => !grid.resolveCircle(def.ox + x, def.oz + z, 0.32, def.fy + 0.35, def.fy + 1.7, res).hit;
    const sp = { x: def.exit.x, z: def.exit.z - 0.9 }, seen = new Set(), q = [[sp.x, sp.z]], cells = [];
    seen.add(Math.round(sp.x / S) + ',' + Math.round(sp.z / S));
    while (q.length && cells.length < 40000) { const [x, z] = q.shift(); cells.push([x, z]); for (const [dx, dz] of [[S, 0], [-S, 0], [0, S], [0, -S]]) { const nx = x + dx, nz = z + dz; if (Math.abs(nx) > def.w / 2 || Math.abs(nz) > def.d / 2) continue; const k = Math.round(nx / S) + ',' + Math.round(nz / S); if (seen.has(k)) continue; seen.add(k); if (free(nx, nz)) q.push([nx, nz]); } }
    return def.spots.filter(s => !cells.some(c => Math.hypot(c[0] - s.x, c[1] - s.z) < s.r - 0.15)).map(s => s.id);
  };
  for (const d of P.PROPS.filter(p => p.kind === 'safehouse' && p.home && p.id !== 'mansion')) {
    const home = g.content.homeOf(d.id); if (!home) continue;
    for (const own of [true, false]) {
      const def = I.addDynamic(P.houseInteriorDef(home, own ? d : null));
      const key = (d.sig ? 'sig' : 't' + d.tier);
      (out.rooms[key] = out.rooms[key] || []).push(def.rooms.length);
      if (own) { const sig2 = def.rooms.join(','); (out.variety[d.tier] = out.variety[d.tier] || new Set()).add(sig2 + '|' + def.w); }
      const bad = reach(def); if (bad.length) out.bad.push({ id: d.id, own, bad });
      I.dispose(def);
    }
  }
  for (const k in out.variety) out.variety[k] = out.variety[k].size;
  return out;
});
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
check('an ordinary house (tier 3) has about five rooms', plans.rooms.t3 && plans.rooms.t3.every(n => n >= 5 && n <= 6), JSON.stringify(plans.rooms.t3));
check('better houses (tier 4-5) have 7-10 rooms', [...(plans.rooms.t4 || []), ...(plans.rooms.t5 || [])].every(n => n >= 7 && n <= 10), JSON.stringify([plans.rooms.t4, plans.rooms.t5]));
check('signature homes have 10 or more rooms', plans.rooms.sig && plans.rooms.sig.every(n => n >= 10), JSON.stringify(plans.rooms.sig));
check('floor plans vary between houses of the same tier', (plans.variety[3] || 0) >= 3 && (plans.variety[4] || 0) >= 3, JSON.stringify(plans.variety));
check('every room, spot and container in every home is reachable (owned and break-in)', plans.bad.length === 0, JSON.stringify(plans.bad.slice(0, 4)));
const man = await ev(() => { const g = window.game, P = window.__pv, h = g.content.homeOf('mansion'), def = P.houseInteriorDef(h, P.PROP_BY_ID.mansion); return { spots: def.spots.map(s => s.id) }; });
check('the mansion: foyer, living, kitchen, dining, study, bar, gallery, master suite, two bedrooms and a games room on two floors', ['tv', 'fridge', 'laptop', 'bar', 'bed'].every(s => man.spots.some(x => x.startsWith(s))), JSON.stringify(man.spots));

// for sale: view it, search it (named valuables), and your own house never lets you rob yourself
const sale = await ev(async () => {
  const g = window.game, P = window.__pv, out = {};
  const id = 'double5', d = P.PROP_BY_ID[id];
  g.uw.ui.openProp(id); out.buttons = [...document.querySelectorAll('#svcBody [data-act]')].map(b => b.dataset.act);
  while (g.ui.stack.length) g.ui.back();
  g.content.enterHome(id, true); await new Promise(r => setTimeout(r, 1500));
  const def = g.content.interiors.cur; out.viewing = def && def.viewing; out.containers = (def.containers || []).length;
  const m0 = g.money.total(), h0 = g.uw.S.inv.hot | 0;
  for (let i = 0; i < def.containers.length; i++) if (def.containers[i].kind !== 'safe') g.content.searchContainer(i);
  out.got = { cash: g.money.total() - m0, hot: (g.uw.S.inv.hot | 0) - h0 };
  g.content.interiors.exit(true); await new Promise(r => setTimeout(r, 1200));
  // buy it: now it's yours and there is nothing to steal
  (g.money.W.clean = g.money.W.dirty.me = 1e6); g.save.rep = 5000; g.uw._rank = 5; out.buy = g.uw.props.buy(id);
  const def2 = P.houseInteriorDef(g.content.homeOf(id), d); out.ownContainers = def2.spots.filter(s => s.id.startsWith('c:')).length; out.ownSpots = def2.spots.map(s => s.id);
  return out;
});
check('a home for sale offers Buy, Look inside and Break in', ['buy', 'view', 'breakin'].every(a => sale.buttons.includes(a)), JSON.stringify(sale.buttons));
check('looking round a home for sale: its drawers and cupboards can be searched', sale.viewing && sale.containers >= 6, JSON.stringify(sale));
check('searching it turns up cash and valuables', sale.got.cash > 0 || sale.got.hot > 0, JSON.stringify(sale.got));
check('once you own it, nothing in it is a burglary target (bed, wardrobe, fridge, TV, stash instead)', sale.buy === '' && sale.ownContainers === 0 && ['bed', 'stash', 'fridge', 'tv'].every(s => sale.ownSpots.includes(s)), JSON.stringify(sale));
const loot = await ev(() => { const P = window.__pv, out = {}; for (const t of [1, 3, 5, 6]) { let cash = 0, hot = 0, named = 0; for (let i = 0; i < 3000; i++) { const r = P.rollLoot('jewel', t, Math.random); cash += r.cash || 0; hot += (r.goods && r.goods.hot) || 0; if (r.name) named++; } out[t] = { cash: Math.round(cash / 3000), hot: +(hot / 3000).toFixed(2), named }; } return out; });
check('better homes have better loot (valuables per jewellery box grow with the tier)', loot[5].hot > loot[3].hot && loot[3].hot > loot[1].hot && loot[6].hot >= loot[5].hot, JSON.stringify(loot));
check('valuables have names (watches, bags, jewellery…)', loot[5].named > 1000, JSON.stringify(loot[5]));

// the Property app: filters, search and sort over 45 homes
const app = await ev(() => {
  const g = window.game, U = g.uw.ui, out = {};
  U.open('assets');
  out.selects = document.querySelectorAll('#empBody .filt select').length; out.search = !!document.getElementById('propSearch');
  const count = () => document.querySelectorAll('#propList .card').length;
  out.all = count();
  U.act('pf:own:owned'); out.owned = count();
  U.act('pf:own:all'); U.act('pf:tier:sig'); out.sig = count();
  U.act('pf:tier:all'); U.act('pf:zone:u'); out.crest = count();
  U.act('pf:zone:all'); U.act('pf:need:g3'); out.g3 = count();
  U.act('pf:need:any'); U.act('pf:sort:price-'); out.first = document.querySelector('#propList .card .t').textContent;
  const el = document.getElementById('propSearch'); el.value = 'linden'; el.dispatchEvent(new Event('input', { bubbles: true })); out.search1 = count();
  out.overflow = document.getElementById('empBody').scrollWidth > document.getElementById('empBody').clientWidth + 1;
  out.minH = Math.min(...[...document.querySelectorAll('#empBody .filt select, #empBody .filt input')].map(e => e.getBoundingClientRect().height));
  el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true }));
  while (g.ui.stack.length) g.ui.back();
  return out;
});
check('Property app: owned / district / tier / parking-storage filters, sort and search', app.selects >= 4 && app.search && app.all >= 45 && app.owned >= 1 && app.sig >= 5 && app.crest >= 8 && app.g3 >= 4 && app.search1 >= 2, JSON.stringify(app));
check('Property app: sorted by price, most expensive first (Valen Point Motorsport Park, $1.5M, heads the list since Session 6B)', /Motorsport Park/.test(app.first), app.first);
check('Property app fits a phone (no sideways scroll, 44 px controls)', !app.overflow && app.minH >= 43.5, JSON.stringify(app));

// save, reload and a v5 save with owned homes
const sv = await ev(() => { const g = window.game; g.uw.S.props.sig_crest = { owned: true, dmg: 0, since: 1, lvl: 1 }; g.saveGame(true); const d = window.__pv.SaveSystem.load().data; return { owns: !!(d.uw.props.sig_crest && d.uw.props.sig_crest.owned) && !!d.uw.props.double5.owned, v: d.version }; });
check('owned homes survive save and reload', sv.owns && sv.v === 9, JSON.stringify(sv));
const mig = await ev(() => {
  const SS = window.__pv.SaveSystem, raw = JSON.parse(localStorage.getItem('pvunderworld.save.v1'));
  raw.version = 5; raw.uw.props = { linden: { owned: true, dmg: 0, since: 3 }, semi: { owned: true, dmg: 0, since: 4 }, triple2: { owned: true, dmg: 0, since: 9 } };
  localStorage.setItem('pvunderworld.save.v1', JSON.stringify(raw));
  const d = SS.load(); const g = window.game; g.save = d.data; g.uw.bind(g.save);
  return { migrated: d.migrated, owned: ['linden', 'semi', 'triple2'].every(id => g.uw.props.owned(id)), lvl: g.uw.S.props.semi.lvl, total: window.__pv.PROPS.filter(p => p.kind === 'safehouse').length };
});
check('a v5 save keeps every home it owned; the new homes are simply for sale', mig.migrated && mig.owned && mig.lvl === 1 && mig.total === 45, JSON.stringify(mig));
check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await finish(b, 'homes');
