/* Crime content (M10): robbable businesses (a themed interior behind every shop-front business of a robbable
   trade, the till and the back office paid by the trade, security that rises with every robbery and recovers by
   the economic day, a guard on the door at high security, your own business never robbed); lockpicks (bought at
   Sully's with Dirty Cash, carried up to five, stashed, one per break-in, taken and charged at an arrest); the
   burglary report roll (one roll as you go in, ~17.5%, the neighbour's call after a delay; searching no longer
   rolls); containment at a high-end home (the search does not give up while you hide inside); pickpocket takes by
   district and time of day; street events weighted by heat and turf. */
import { launch, open, check, startNew, finish, frames } from './lib.mjs';
const b = await launch();
const t = await open(b);
const page = t.page;
const ev = (f, a) => page.evaluate(f, a);
const waitFade = () => page.waitForFunction(() => !window.game.fading && window.game.state === 'playing', null, { timeout: 60000, polling: 100 });
await startNew(page);
await ev(() => { const g = window.game; g.events.cool = 1e9; g.traffic.enabled = false; g.save.rep = 400; g.money.W.clean = 1e7; g.money.W.dirty.me = 5000; });

// ---------------------------------------------------------------- the trades
const trades = await ev(() => {
  const P = window.__pv, out = {};
  const robbable = P.PROPS.filter(p => p.kind === 'business' && P.robTheme(p));
  out.n = robbable.length; out.cats = [...new Set(robbable.map(p => p.cat))].sort();
  out.not = P.PROPS.filter(p => p.kind === 'business' && !P.robTheme(p)).map(p => p.cat).filter((c, i, a) => a.indexOf(c) === i).sort();
  out.themes = Object.keys(P.ROB_THEMES).every(k => { const T = P.ROB_THEMES[k]; return T.till[0] < T.till[1] && T.safe[0] < T.safe[1] && T.safe[0] > T.till[1] && Object.keys(T.stock).length === 1; });
  out.jewel = P.ROB_THEMES.jewelry.sec === 2 && P.ROB_THEMES.jewelry.safe[1] > P.ROB_THEMES.shop.safe[1] * 3;
  return out;
});
check('shop-front trades are robbable (pharmacy, jewellery, electronics, pawn, boutique, bar, food, service…), offices and yards are not', trades.n >= 20 && ['pharmacy', 'jewelry', 'electronics', 'pawn', 'boutique', 'bar'].every(c => trades.cats.includes(c)) && ['law', 'accounting', 'construction', 'logistics'].every(c => trades.not.includes(c)), JSON.stringify(trades));
check('every trade pays more from the safe than the till, and the jeweller is guarded and rich', trades.themes && trades.jewel, JSON.stringify(trades));

// ---------------------------------------------------------------- walk in, rob it
const enter = async (cat) => {
  const r = await ev(c => {
    const g = window.game, uw = g.uw, P = window.__pv, d = P.PROPS.find(p => p.kind === 'business' && p.cat === c && !uw.props.owned(p.id)), L = uw.loc('prop', d.id);
    g.police.clear(); g.resetPlayerState(L.x, L.z, 0);
    const a = uw.props.doorAction(L); a.act();
    return { id: d.id, label: a.label };
  }, cat);
  await waitFade(); await frames(page, 3);
  return r;
};
const ph = await enter('pharmacy');
const in1 = await ev(() => { const g = window.game, d = g.content.interiors.cur; return { id: d && d.id, spots: d ? d.spots.map(s => s.id) : [], staff: d && d.staffOpen, guard: d && d.chars.find(c => c.id === 'guard').hidden, sec: g.content.robSecurity(d) }; });
check('a business door walks you in (“Enter … · for sale”), into its own themed shop with a till, a staff door and a back office', /^Enter /.test(ph.label) && /for sale/.test(ph.label) && in1.id === 'b:' + ph.id && ['manage', 'register', 'staff', 'safe', 'desk', 'stock', 'exit'].every(k => in1.spots.includes(k)) && in1.staff === false, JSON.stringify([ph, in1]));
check('a pharmacy starts with cameras (security 1) and no guard on the door', in1.sec === 1 && in1.guard === true, JSON.stringify(in1));
const rob = await ev(() => {
  const g = window.game, p = g.player, d = g.content.interiors.cur, T = d.rob, out = {};
  g.save.weapons.pistol = true; g.save.ammo.pistol = 30; p.weapon = 2; if (p.equip) p.equip(2);
  const R = Math.random; Math.random = () => 0.5;
  const m0 = g.money.total(); p.pos.set(d.ox + 2.4, d.fy, d.oz + 3.5);
  g.content.spotAct('register');
  try { for (let n = 0; n < 60 * 6; n++) g.update(1 / 60, 1 / 60); } finally { Math.random = R; }
  out.till = g.money.total() - m0; out.range = T.till; out.open = d.staffOpen; out.sec = g.content.robSecurity(d); out.lvl = g.police.level;
  // the back office: the safe, the stock
  const m1 = g.money.total(), inv0 = JSON.stringify(g.uw.S.inv);
  p.pos.set(d.ox + 4.6, d.fy, d.oz - 4.4); Math.random = () => 0.5; g.content.spotAct('safe');
  try { for (let n = 0; n < 60 * 10; n++) g.update(1 / 60, 1 / 60); } finally { Math.random = R; }
  out.safe = g.money.total() - m1; out.safeRange = T.safe; out.sec2 = g.content.robSecurity(d);
  g.content.spotAct('stock'); out.stock = JSON.stringify(g.uw.S.inv) !== inv0; out.pills = g.uw.S.inv.pills ? true : JSON.stringify(g.uw.S.inv);
  const m2 = g.money.total(); g.content.spotAct('register'); for (let n = 0; n < 60 * 4; n++) g.update(1 / 60, 1 / 60); out.again = g.money.total() - m2;
  out.st = g.content.storeState(d);
  return out;
});
const lo = r => Math.round(r[0] * 0.8), hi = r => Math.round(r[1] * 1.4);
check('the till: the trade’s range (×district), the clerk hands over the back-office key, the alarm brings the police', rob.till >= lo(rob.range) && rob.till <= hi(rob.range) && rob.open && rob.lvl >= 1, JSON.stringify(rob));
check('the safe: the trade’s much bigger range; the stockroom gives the trade’s goods (pharma)', rob.safe >= lo(rob.safeRange) && rob.safe <= hi(rob.safeRange) && rob.stock && rob.pills === true, JSON.stringify(rob));
check('every robbery puts the security up a step (1 → 2 → 3); the till can’t be robbed twice in a day', rob.sec === 2 && rob.sec2 === 3 && rob.again === 0, JSON.stringify(rob));
const rec = await ev(() => {
  const g = window.game, d = g.content.interiors.cur, uw = g.uw, out = {}, day0 = uw.S.day;
  out.now = g.content.robSecurity(d);
  uw.S.day = day0 + 5; out.d5 = g.content.robSecurity(d);
  uw.S.day = day0 + 10; out.d10 = g.content.robSecurity(d);
  uw.S.day = day0 + 7; out.week = g.content.storeState(d).safe; out.regNext = g.content.storeState(d).reg;
  uw.S.day = day0;
  return out;
});
check('security recovers a step every five economic days (3 → 2 → back to the trade’s 1), the back office restocks weekly', rec.now === 3 && rec.d5 === 2 && rec.d10 === 1 && rec.week === false, JSON.stringify(rec));
await ev(() => { const g = window.game; g.content.interiors.exit(true); g.police.clear(); });
await waitFade();

// ---------------------------------------------------------------- the jeweller: a guard on the door
const jw = await enter('jewelry');
const jr = await ev(() => {
  const g = window.game, p = g.player, d = g.content.interiors.cur, out = {};
  out.guard = !d.chars.find(c => c.id === 'guard').hidden; out.sec = g.content.robSecurity(d);
  p.weapon = 0; if (p.equip) p.equip(0); out.armed = !!(p.wep && !p.wep.melee);
  const m0 = g.money.total(); p.pos.set(d.ox + 2.4, d.fy, d.oz + 3.5); g.content.spotAct('register');
  for (let n = 0; n < 60 * 4; n++) g.update(1 / 60, 1 / 60);
  out.gain = g.money.total() - m0; out.lvl = g.police.level;
  return out;
});
check('a jeweller has a guard on the door: an empty hand gets nothing and the alarm goes', jr.guard && jr.sec === 2 && !jr.armed && jr.gain === 0 && jr.lvl >= 1, JSON.stringify(jr));
await ev(() => { const g = window.game; g.content.interiors.exit(true); g.police.clear(); });
await waitFade();

// ---------------------------------------------------------------- your own business
const own = await ev(() => {
  const g = window.game, uw = g.uw, P = window.__pv, d = P.PROPS.find(p => p.kind === 'business' && p.cat === 'electronics');
  const e = uw.props.buy(d.id); const L = uw.loc('prop', d.id); g.resetPlayerState(L.x, L.z, 0);
  const a = uw.props.doorAction(L); a.act(); return { id: d.id, e, label: a.label };
});
await waitFade();
const own2 = await ev(() => {
  const g = window.game, p = g.player, d = g.content.interiors.cur, out = {};
  g.save.weapons.pistol = true; p.weapon = 2; if (p.equip) p.equip(2);
  const m0 = g.money.total(); g.content.spotAct('register'); for (let n = 0; n < 60 * 4; n++) g.update(1 / 60, 1 / 60);
  out.gain = g.money.total() - m0; out.lvl = g.police.level; out.chan = !!g.content.chan;
  g.content.spotAct('manage'); out.panel = document.getElementById('svcTitle').textContent; while (g.ui.stack.length) g.ui.back();
  g.content.interiors.exit(true);
  return out;
});
check('your own business: walk in without the price tag, nothing to rob (no cash, no alarm), the counter manages it', own.e === '' && !/for sale/.test(own.label) && own2.gain === 0 && own2.lvl === 0 && !own2.chan && own2.panel.length > 0, JSON.stringify([own, own2]));
await waitFade();

// ---------------------------------------------------------------- a Fuel & Go still robs the same way
const fg = await ev(() => { const P = window.__pv; return P.STORE_ROB.till.join() === '180,460' && P.STORE_ROB.safe.join() === '1400,4200'; });
check('a Fuel & Go keeps its own take (till $180–460, safe $1,400–4,200)', fg);

// ---------------------------------------------------------------- lockpicks
const lp = await ev(() => {
  const g = window.game, uw = g.uw, T = uw.tools, P = window.__pv, out = {};
  g.money.W.dirty.me = 1000; g.money.W.clean = 1e7;
  out.buy1 = T.buy(1); out.after1 = { picks: T.picks, dirty: g.money.W.dirty.me };
  out.fill = T.buy(10); out.after2 = { picks: T.picks, dirty: g.money.W.dirty.me };
  out.full = T.buy(1);
  // the stash at a safehouse
  const sh = P.PROPS.find(p => p.kind === 'safehouse' && !uw.props.owned(p.id)); uw.props.buy(sh.id);
  out.store = T.store(sh.id, Infinity); out.stored = { me: T.picks, there: uw.S.tools.at[sh.id] };
  out.take = T.take(sh.id, 2); out.took = { me: T.picks, there: uw.S.tools.at[sh.id] };
  out.html = T.stashHTML(sh.id).includes('Lockpick sets');
  // Sully's counter shows them
  const L = uw.loc('spot', 'sully'); uw.ui.openSpot(L); out.shop = /Lockpick set/.test(document.getElementById('svcBody').textContent); while (g.ui.stack.length) g.ui.back();
  // a house door: none on you → no break-in; with one → one used
  const keep = T.picks; uw.S.tools.picks = 0;
  const hd = g.world.homes.filter(h => !h.propId && h.type !== 'farm').map(h => { g.player.pos.set(h.door.x, g.player.pos.y, h.door.z); return g.content.nearHomeDoor(g.player); }).find(a => a);
  out.noPick = hd && hd.label; uw.S.tools.picks = keep;
  // sanitize
  out.san = P.Tools.sanitize({ picks: 99, at: { nope: 3, [sh.id]: -2 } }, (v, d, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d));
  return out;
});
check('a lockpick set costs $75 cash at Sully’s; you carry five at most', lp.buy1 === '' && lp.after1.picks === 1 && lp.after1.dirty === 925 && lp.fill === '' && lp.after2.picks === 5 && lp.after2.dirty === 625 && /carry 5/.test(lp.full) && lp.shop, JSON.stringify(lp));
check('sets go into a safehouse stash and come back out', lp.store === '' && lp.stored.me === 0 && lp.stored.there === 5 && lp.take === '' && lp.took.me === 2 && lp.took.there === 3 && lp.html, JSON.stringify(lp));
check('no set on you: a house door only says it needs one', /needs a lockpick set/.test(lp.noPick || ''), lp.noPick);
check('a malformed tools save is cleaned (carry capped at 5, unknown places and negatives dropped)', lp.san.picks === 5 && Object.keys(lp.san.at).length === 0, JSON.stringify(lp.san));

// ---------------------------------------------------------------- a burglary: one report roll
const br = await ev(() => {
  const g = window.game, uw = g.uw, out = {};
  g.police.clear();
  const h = g.world.homes.filter(x => !x.propId && x.type !== 'farm').find(x => { g.player.pos.set(x.door.x, g.player.pos.y, x.door.z); const a = g.content.nearHomeDoor(g.player); return a && /Break in|Slip/.test(a.label); });
  const before = uw.tools.picks;
  window.__R = Math.random; Math.random = () => 0.9; // no neighbour this time (and no witness)
  g.player.pos.set(h.door.x, g.player.pos.y, h.door.z); const a = g.content.nearHomeDoor(g.player); a.act();
  Math.random = window.__R;
  out.used = before - uw.tools.picks; out.label = a.label;
  return out;
});
await waitFade();
const br2 = await ev(() => {
  const g = window.game, d = g.content.interiors.cur, out = {};
  out.inside = !!d; out.reported = d.reported; out.pending = g.police.pending.length;
  // search everything: searching no longer rolls for noise
  const R = Math.random; Math.random = () => 0.01;
  try { for (let i = 0; i < d.containers.length; i++) { g.content.searchContainer(i); for (let n = 0; n < 60 * 8; n++) g.update(1 / 60, 1 / 60); } } finally { Math.random = R; }
  out.searched = g.content.burgleState(d).s.length; out.after = { pending: g.police.pending.length, lvl: g.police.level };
  // the report roll itself, measured
  let n = 0; const N = 20000; for (let i = 0; i < N; i++) if (g.content.burglaryReport({ door: d.door, tier: 1 }, Math.random)) n++;
  g.police.pending.length = 0; out.rate = n / N;
  // reported: the call lands after 20–45 s
  const ok = g.content.burglaryReport(d, () => 0); const c = g.police.pending[g.police.pending.length - 1];
  out.call = { ok, t: c && c.t, contain: c && c.contain, tier: d.tier };
  g.police.pending.length = 0;
  g.content.interiors.exit(true);
  return out;
});
check('a break-in uses one lockpick set', br.used === 1, JSON.stringify(br));
check('searching every drawer and the safe raises no alarm by itself (the old per-container noise is gone)', br2.inside && br2.reported === false && br2.searched > 3 && br2.after.pending === br2.pending && br2.after.lvl === 0, JSON.stringify(br2));
check('one report roll per burglary: about 17.5% are called in (20,000 rolls, ±1%)', Math.abs(br2.rate - 0.175) < 0.01, String(br2.rate));
check('a reported burglary: the neighbour’s call lands 20–45 s later; only a tier 4+ home is contained', br2.call.ok && br2.call.t >= 20 && br2.call.t <= 45 && !!br2.call.contain === (br2.call.tier >= 4), JSON.stringify(br2.call));
await waitFade();

// ---------------------------------------------------------------- a high-end home is contained
const hi1 = await ev(() => {
  const g = window.game, uw = g.uw, out = {};
  g.police.clear();
  const h = g.world.homes.find(x => !x.propId && x.district === 'u');
  const def = g.content.interiors.addDynamic(window.__pv.houseInteriorDef(h, null)); out.tier = def.tier;
  g.content.interiors.enter(def.id); window.__hid = def.id;
  return out;
});
await waitFade();
const hi2 = await ev(() => {
  const g = window.game, P = g.police, d = g.content.interiors.cur, out = {};
  g.content.burglaryReport(d, () => 0); const c = P.pending[P.pending.length - 1]; out.contain = c.contain; c.t = 0;
  g.update(1 / 60, 1 / 60); out.lvl = P.level; out.contained = P.contained();
  // hide: no cop sees you for a long time, but the search does not end while you are inside
  P.visible = false; P.seenT = 1e4; for (let n = 0; n < 60 * 3; n++) g.update(1 / 60, 1 / 60);
  out.stillAfter = P.level;
  g.content.interiors.exit(true);
  return out;
});
await waitFade();
const hi3 = await ev(() => { const g = window.game, P = g.police; const out = { contained: P.contained() }; P.visible = false; P.seenT = 1e4; for (let n = 0; n < 60 * 2; n++) g.update(1 / 60, 1 / 60); out.lvl = P.level; return out; });
check('a high-end home (tier 4+): the call contains the house; hiding inside, the search never gives up', hi1.tier >= 4 && !!hi2.contain && hi2.lvl >= 1 && hi2.contained && hi2.stillAfter >= 1, JSON.stringify([hi1, hi2]));
check('out of the house the containment no longer holds: lose them as usual', !hi3.contained && hi3.lvl === 0, JSON.stringify(hi3));

// ---------------------------------------------------------------- an arrest takes the sets and charges them
const ar = await ev(() => {
  const g = window.game, uw = g.uw; uw.S.tools.picks = 3; g.police.setLevel(1);
  const ch = uw.legal.charges(); const line = ch.counts.find(c => c.t === 'tools');
  uw.tools.confiscate(); const out = { line: line && line.name, days: line && line.days, after: uw.S.tools.picks };
  g.police.clear(); return out;
});
check('caught with lockpicks: “Possession of burglary tools” on the charge sheet, and the sets are taken', /burglary tools/.test(ar.line || '') && ar.days === 3 && ar.after === 0, JSON.stringify(ar));

// ---------------------------------------------------------------- pickpockets by district and hour; events by heat and turf
const pk = await ev(() => {
  const P = window.__pv, K = P.pocketTimeK;
  const avg = (zk, hour) => { let s = 0; const N = 4000; let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; for (let i = 0; i < N; i++) s += P.pocketLoot({ id: i }, zk, rnd, hour).cash; return s / N; };
  return { k: [K('c', 11), K('c', 23), K('p', 23), K('p', 13), K('o', 4), K('o', 12), K('c', null)], cDay: avg('c', 11), cNight: avg('c', 23), pNight: avg('p', 23), pDay: avg('p', 13), poor: avg('w', 12), rich: avg('u', 12) };
});
check('pickpocketing: office hours pay in the Financial District, nights on the Strip, the small hours anywhere pay little', pk.k.join() === '1.2,0.8,1.35,0.9,0.6,1,1' && pk.cDay > pk.cNight * 1.3 && pk.pNight > pk.pDay * 1.3 && pk.rich > pk.poor * 2, JSON.stringify(pk));
const eb = await ev(() => {
  const g = window.game, uw = g.uw, P = window.__pv, out = {};
  uw.S.pressure = 10; out.cool = P.eventBias(g, 'stop');
  uw.S.pressure = 80; out.hot = P.eventBias(g, 'stop');
  uw.S.pressure = 10;
  const i = uw.T.findIndex(t => uw.owner[t.i] && uw.owner[t.i] !== 'pc'); const T = uw.T[i];
  g.player.pos.set(T.cx, g.player.pos.y, T.cz); out.rival = P.eventBias(g, 'streetfight');
  const keep = uw.owner[i]; uw.owner[i] = 'pc'; out.mine = P.eventBias(g, 'robbery'); uw.owner[i] = keep;
  return out;
});
check('street events follow heat and turf (more stops under pressure, more fights on rival turf, fewer robberies on yours)', eb.cool === 1 && eb.hot === 1.8 && eb.rival === 1.6 && eb.mine === 0.4, JSON.stringify(eb));

check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
await finish(b, 'crime');
