/* The economy and progression invariants (M13). Underworld as one system: no buy/resell or tuning arbitrage, no
   Clean/Dirty laundering bypass, the laundering ladder and its limits, the economic day on the economic clock (the
   day-length setting and sleep can't speed it up), jail never a profit (§45.8), routine gambling negative EV, the
   race repeat tiers, one-time rewards one-time, money that can't buy Rank / Rep / turf / crew / influence (the early
   billion-dollar jackpot stress test), a recovery path from broke, crew wages from Dirty sources in order, the
   pickpocket wary crowd, and Rank requirements that are reachable, monotonic and explained. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const t = await open(b);
const page = t.page;
const ev = (f, a) => page.evaluate(f, a);
await startNew(page);
await ev(() => { const g = window.game; g.events.cool = 1e9; g.traffic.enabled = false; g.police.enabled = false; g.save.settings.guide = false; });

// ---------------------------------------------------------------- vehicles: no arbitrage
const cars = await ev(() => {
  const g = window.game, P = window.__pv, C = g.content, out = { worst: 0, rows: [] };
  for (const ty of ['compact', 'sedan', 'sports', 'muscle', 'luxury', 'supercar', 'valkyr']) {
    const m = P.CAR_MSRP[ty]; if (!m) continue;
    for (const tune of [{}, { engine: 3, brakes: 3, grip: 3, armor: 3 }]) {
      const tu = { engine: 0, brakes: 0, grip: 0, armor: 0, ...tune }; let put = m;
      for (const T of [{ id: 'engine', p: [1500, 3500, 7000] }, { id: 'brakes', p: [900, 2000, 4200] }, { id: 'grip', p: [1200, 2800, 5600] }, { id: 'armor', p: [1000, 2400, 5000] }]) put += T.p.slice(0, tu[T.id]).reduce((a, x) => a + x, 0);
      for (const prov of [{ dirty: 0, clean: put }, { dirty: put, clean: 0 }, { dirty: Math.round(put / 2), clean: put - Math.round(put / 2) }]) {
        const e = { type: ty, origin: 'bought', vtier: 'common', dmg: 0, tune: tu, prov };
        const s = C.saleOf(e); out.worst = Math.max(out.worst, s.total / put);
        out.rows.push([ty, put, s.total, s.dirty, s.clean, prov.dirty]);
        if (prov.dirty === 0 && s.dirty > 0) out.leak = true;      // Clean in, Dirty out
        if (prov.clean === 0 && s.clean > 0) out.launder = true;   // Dirty in, Clean out
      }
    }
  }
  return out;
});
check('no buy/resell or tuning arbitrage: a car (tuned or not) never sells for more than 85% of everything put into it', cars.worst <= 0.85 + 1e-9, String(cars.worst));
check('no laundering through cars: each currency comes back only in proportion to what paid for the car', !cars.leak && !cars.launder, JSON.stringify(cars.rows.slice(0, 4)));

// ---------------------------------------------------------------- laundering: the ladder, the limits
const lau = await ev(() => {
  const g = window.game, uw = g.uw, P = window.__pv, F = uw.fronts, out = {};
  out.fixer = uw.fixer.quote(5000); out.fixerCap = uw.fixer.capacityLeft();
  const d = P.PROPS.find(p => p.kind === 'business' && p.launder); g.save.rep = 400; g.money.W.clean = 1e7; uw.props.buy(d.id);
  const lv = n => { uw.S.props[d.id].lvl = n; }, ladder = [];
  for (const n of [1, 2, 3]) { lv(n); ladder.push([F.fee(d.id), F.cap(d.id)]); }
  uw.crew.refreshCandidates(true); uw.crew.S.cand[0].fee = 1; g.money.W.dirty.me += 10; uw.crew.hire(0); const c = uw.S.crew[uw.S.crew.length - 1]; uw.crew.assign(c.id, 'manager', d.id);
  for (const n of [1, 2, 3]) { lv(n); ladder.push([F.fee(d.id), F.cap(d.id)]); }
  out.ladder = ladder; out.notFront = F.deposit(P.PROPS.find(p => p.kind === 'business' && !p.launder).id, 5000);
  return out;
});
check('the early fixer: 32% fee, $5,000 a day', lau.fixer.fee === 1600 && lau.fixer.clean === 3400 && lau.fixerCap === 5000, JSON.stringify(lau));
check('the laundering ladder: fixer 32% → front 25% / managed 20% → 15% / 10% → 10% / 5%, capacity growing with level', JSON.stringify(lau.ladder.map(x => x[0])) === JSON.stringify([0.25, 0.15, 0.1, 0.2, 0.1, 0.05]) && lau.ladder[0][1] < lau.ladder[1][1] && lau.ladder[1][1] < lau.ladder[2][1], JSON.stringify(lau.ladder));
check('only an owned laundering business is a front', /Not a front/.test(lau.notFront), lau.notFront);

// ---------------------------------------------------------------- the economic day: the day-length setting and sleep don't speed it up
const clock = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, out = {};
  const span = (dayLen) => { g.save.settings.dayLength = dayLen; const h0 = S.econH, d0 = S.day; for (let n = 0; n < 1800; n++) g.update(0.1, 0.1); return { econ: +(S.econH - h0).toFixed(2), days: S.day - d0 }; };
  out.short = span(4); out.long = span(30); g.save.settings.dayLength = 30;
  return out;
});
check('the economic clock runs at the same pace whatever the visual day length (3 minutes of play ≈ 2.4 economic hours with 4-min and 30-min days, ±1 game-hour step)', Math.abs(clock.short.econ - 2.4) <= 1.0 && Math.abs(clock.long.econ - 2.4) <= 1.0 && clock.short.days === clock.long.days, JSON.stringify(clock));
const sleep = await ev(async () => {
  const g = window.game, uw = g.uw, S = uw.S, P = window.__pv, out = {};
  const sh = P.PROPS.find(p => p.kind === 'safehouse' && uw.props.owned(p.id)) || P.PROPS.find(p => p.kind === 'safehouse'); if (!uw.props.owned(sh.id)) uw.props.buy(sh.id);
  S.slept = false; const h0 = S.econH, d0 = S.day, t0 = g.env.time;
  uw.props.sleep(sh.id); await new Promise(r => setTimeout(r, 1800)); for (let n = 0; n < 30; n++) g.update(1 / 60, 1 / 60);
  out.first = { econ: +(S.econH - h0).toFixed(2), days: S.day - d0, clockMoved: g.env.time !== t0 };
  const h1 = S.econH; uw.props.sleep(sh.id); await new Promise(r => setTimeout(r, 1800)); out.second = +(S.econH - h1).toFixed(2); out.slept = S.slept;
  return out;
});
check('sleeping passes the night but not the economy (no payday skipping), and once an economic day', sleep.first.econ < 0.5 && sleep.first.days === 0 && sleep.first.clockMoved && sleep.second < 0.5 && sleep.slept, JSON.stringify(sleep));

// ---------------------------------------------------------------- jail is never a profit (§45.8)
const jail = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, P = window.__pv, M = g.money, out = {};
  g.save.rep = 2000; M.W.clean = 5e7; M.W.dirty.me = 2e6;
  const hire = (role, a) => { uw.crew.refreshCandidates(true); uw.crew.S.cand[0].fee = 1; M.W.dirty.me += 10; uw.crew.hire(0); const c = S.crew[S.crew.length - 1]; c.loyalty = 90; c.traits = []; if (role) uw.crew.assign(c.id, role, a); return c; };
  const biz = P.PROPS.filter(p => p.kind === 'business' && !uw.props.owned(p.id)).slice(0, 8);
  for (const [i, d] of biz.entries()) { uw.props.buy(d.id); S.props[d.id].since = S.day - 30; if (i % 2 === 0) hire('manager', d.id); }
  const worth = () => M.dirtyTotal() + M.clean;
  let a = worth(); for (let d = 0; d < 5; d++) uw.tickDay(); out.street = Math.round((worth() - a) / 5);
  S.jail = P.Prison.fresh({ total: 30, full: 30, lines: [] });
  a = worth(); for (let d = 0; d < 5; d++) uw.tickDay(); out.inside = Math.round((worth() - a) / 5);
  out.books = S.lastLedger; S.jail = null;
  return out;
});
check('outside, the empire makes money; inside, a day of it never does (managed businesses cover their upkeep, unmanaged slide, wages still due)', jail.street > 0 && jail.inside <= 0, JSON.stringify(jail));

// ---------------------------------------------------------------- the progressive stays bounded (others win it too)
const prog = await ev(() => {
  const g = window.game, P = window.__pv, J = g.gamble.G.jp, keep = { pool: J.pool, others: J.others }, news = g.uw.news, sports = g.gamble.tickSports;
  let s = 21; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  g.uw.news = () => {}; g.gamble.tickSports = null; J.pool = P.ROYALE.top; J.others = 0;
  const pools = []; try { for (let d = 0; d < 200000; d++) { g.gamble.tickDay(rnd); pools.push(J.pool); } } finally { g.uw.news = news; g.gamble.tickSports = sports; }
  const out = { others: J.others }; pools.sort((a, b) => a - b);
  out.mean = pools.reduce((a, b) => a + b, 0) / pools.length; out.p99 = pools[Math.floor(pools.length * 0.99)]; out.max = pools[pools.length - 1];
  // the billion tier's share of the 4% is priced at the $1B seed: a bigger pool adds (pool/1B − 1) × that share
  const w = P.ROYALE_MAJORS[0].w, rtpAt = pool => P.ROYALE_BASE_RTP * P.ROYALE.baseK + P.ROYALE.share + P.ROYALE.share * w * (pool / P.ROYALE.top - 1);
  out.rtpMean = rtpAt(out.mean); out.rtpP99 = rtpAt(out.p99); out.rtpMax = rtpAt(out.max);
  J.pool = keep.pool; J.others = keep.others;
  return out;
});
check('the progressive is won by others too (about once in 400 economic days): over 200,000 days it averages ~$1.25B and never drifts the machine into the player’s favour', prog.others > 350 && prog.mean > 1.1e9 && prog.mean < 1.4e9 && prog.rtpMax < 1, JSON.stringify(prog));

// ---------------------------------------------------------------- gambling: routine play loses
const gam = await ev(() => {
  const P = window.__pv, out = {}; let s = 9; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const N = 120000; let r = 0, bk = 0, cr = 0, tc = 0, tcs = 0, sb = 0, sbn = 0;
  for (let i = 0; i < N; i++) { const n = P.roulettePick({ red: 100 }, rnd); r += P.roulettePayout({ red: 100 }, n); bk += P.baccaratPay({ banker: 100 }, P.baccaratDeal(rnd).result); cr += P.crapsPay({ pass: 100 }, P.crapsDecision(rnd)); const q = P.tcpRound(100, 0, rnd); tc += q.back; tcs += q.staked; }
  for (let d = 1; d <= 6000; d++) for (const m of P.sportsDay(d)) for (let k = 0; k < 3; k++) { sbn++; if (m.result === k) sb += m.odds[k]; }
  const K = P.ROYALE_DROUGHT_K, share = P.royaleChances(10000).reduce((a, p, t) => a + p / K * P.ROYALE_MAJORS[t].prize / 10000, 0);
  out.rtp = { roulette: r / (100 * N), baccarat: bk / (100 * N), craps: cr / (100 * N), threeCard: tc / tcs, sportsbook: sb / sbn, royale: P.ROYALE_BASE_RTP * P.ROYALE.baseK + share };
  out.limits = { floor: P.CASINO.floorMax, vip: P.CASINO.vipMax, slot: P.CASINO.slotMax };
  return out;
});
check('every routine casino game returns less than it takes (roulette, baccarat, craps, 3-card, sportsbook, Royale 90–99%)', Object.values(gam.rtp).every(x => x > 0.9 && x < 0.995), JSON.stringify(gam.rtp));

// ---------------------------------------------------------------- races and one-time rewards
const race = await ev(() => {
  const g = window.game, P = window.__pv, R = g.raceRules, def = P.RACES.find(r => !r.storyOnly), out = {};
  out.tiers = []; for (let i = 0; i < 4; i++) { out.tiers.push(R.payout(def, 1).cash); R.noteWin(def.id); }
  out.official = (P.VP_EVENTS || []).filter(e => e.reward).map(e => [e.id, e.fee, e.reward, e.rep]);
  // a hidden package pays once
  const C = g.content, pk = g.world.packages.find(p => !g.save.packages[p.id]); if (pk) { const m0 = g.money.total(); C.collectPackage(pk); C.collectPackage(pk); out.pkg = g.money.total() - m0; }
  return out;
});
check('a street race pays 100% / 50% / 25% / 25% of its purse for repeat wins in an economic day', race.tiers[1] === race.tiers[0] / 2 && race.tiers[2] === race.tiers[0] / 4 && race.tiers[3] === race.tiers[2], JSON.stringify(race.tiers));
check('official events pay Clean with no criminal Rep; the top purse is $15,000 (M13)', race.official.every(e => e[3] === 0) && Math.max(...race.official.map(e => e[2])) === 15000, JSON.stringify(race.official));
check('a hidden package pays once', race.pkg === 250, String(race.pkg));

// ---------------------------------------------------------------- the early jackpot: rich, not powerful
const jp = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, P = window.__pv, M = g.money, out = {};
  // a fresh nobody wins the progressive
  g.save.rep = 0; for (const c of S.crew) c.status = 'gone'; for (let i = 0; i < uw.T.length; i++) if (S.turfs[i].own === 'pc') S.turfs[i].own = null; uw.recompute();
  M.W.dirty.me = 0; for (const k in M.W.dirty.prop) M.W.dirty.prop[k] = 0; M.W.clean = 0; M.earn(1.3e9, 'casino');
  const rep0 = g.save.rep;
  // buy everything for sale that a nobody may buy
  let bought = 0, refused = 0; for (const d of P.PROPS) { if (uw.props.owned(d.id)) continue; const e = uw.props.buy(d.id); if (e === '') bought++; else refused++; }
  for (const id in S.props) if (S.props[id].owned) S.props[id].since = S.day - 60; // and wait until every business is established
  uw.computeInfluence();
  out.after = { bought, refused, rep: g.save.rep, rank: uw.rank, turfs: uw.playerTurfs(), influence: uw.influence, bought2: uw._inflBought, crew: uw.crew.active().length };
  // crew is Dirty work: the bank can't hire, promote or pay them
  uw.crew.refreshCandidates(true); out.hireNobody = uw.crew.hire(0) || '';
  g.save.rep = 400; uw.crew.refreshCandidates(true); out.hire = uw.crew.hire(0) || ''; out.crewAfter = uw.crew.active().length; g.save.rep = 0;
  // turf can't be bought: Take Turf needs the hold on the street
  const i = uw.T.findIndex(tt => uw.owner[tt.i] && uw.owner[tt.i] !== 'pc'); out.take = uw.takeTurf(i) || '';
  out.rankMissing = uw.rankMissing();
  out.clean = Math.round(M.clean);
  return out;
});
check('a nobody who wins $1.3B can buy property and businesses (no Rep needed for the cheap ones; Rep-gated ones refuse)', jp.after.bought > 10 && jp.clean > 1e8, JSON.stringify(jp.after));
check('…but buys no Rep, no Rank, no turf and no influence (bought influence is capped by earned influence: zero)', jp.after.rep === 0 && jp.after.rank === 0 && jp.after.turfs === 0 && jp.after.influence === 0, JSON.stringify(jp.after));
check('…and can’t hire crew: nobody works for a nobody, and even known, crew is paid in Dirty Cash the bank can’t supply', jp.after.crew === 0 && jp.crewAfter === 0 && /reputation/i.test(jp.hireNobody) && /Dirty|cash/i.test(jp.hire), JSON.stringify(jp));
check('…nor take a turf without the street hold; the Rank screen still says what is missing', jp.take !== '' && jp.rankMissing.length > 0, JSON.stringify([jp.take, jp.rankMissing]));

// ---------------------------------------------------------------- broke: there is always a way back
const broke = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, M = g.money, out = {};
  M.W.clean = 0; M.W.dirty.me = 0; for (const k in M.W.dirty.prop) M.W.dirty.prop[k] = 0; M.W.debt = 25000; for (const k in S.inv) S.inv[k] = 0;
  // pickpocketing needs nothing but a street
  const R = Math.random; Math.random = () => 0.2; const q = { id: 4242, x: g.player.pos.x, z: g.player.pos.z, state: 'walk' }; uw.pickpocket(q); Math.random = R;
  out.picked = M.W.dirty.me;
  // the chop shop pays cash for a car off the street
  out.chop = uw.chopValue({ type: 'sedan', vtier: 'common', health: 80 });
  // Clean income first clears the medical debt, then the bank
  M.earn(30000, 'business'); out.debt = M.debt; out.clean = M.clean;
  return out;
});
check('broke and in medical debt: a pickpocket earns Dirty Cash at once, a stolen car sells for cash', broke.picked > 0 && broke.chop > 0, JSON.stringify(broke));
check('Clean income pays the medical debt off first, then the bank fills (no permanent hole)', broke.debt === 0 && broke.clean === 5000, JSON.stringify(broke));

// ---------------------------------------------------------------- crew wages: Dirty, in the payroll order
const pay = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, M = g.money, P = window.__pv, out = {};
  M.W.clean = 1e6; M.W.dirty.me = 500; const wh = P.PROPS.find(p => p.kind === 'warehouse'); if (!uw.props.owned(wh.id)) uw.props.buy(wh.id); M.W.dirty.prop[wh.id] = 50000;
  uw.crew.refreshCandidates(true); uw.crew.S.cand[0].fee = 1; M.W.dirty.me += 10; uw.crew.hire(0);
  const w = uw.crew.payroll(), v0 = M.W.dirty.prop[wh.id], me0 = M.W.dirty.me, c0 = M.W.clean;
  uw.crew.tickDay(); out.fromVault = v0 - M.W.dirty.prop[wh.id]; out.fromMe = me0 - M.W.dirty.me; out.fromBank = c0 - M.W.clean; out.wages = w;
  return out;
});
check('wages come out of the warehouse vault first, never the bank', pay.fromVault >= pay.wages - 1 && pay.fromMe === 0 && pay.fromBank === 0, JSON.stringify(pay));

// ---------------------------------------------------------------- the wary crowd
const wary = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, M = g.money, out = {};
  S.wary = {}; const R = Math.random; let k = 0; Math.random = () => 0.5;
  const lift = () => { const before = M.W.dirty.me; uw.pickpocket({ id: 900 + (k++), x: 2 * 80 + 40, z: 4 * 80 + 40, state: 'walk' }); return M.W.dirty.me - before; };
  const z = window.__pv.zoneKey(2 * 80 + 40, 4 * 80 + 40);
  const takes = []; for (let i = 0; i < 7; i++) takes.push(lift());
  out.wary = +S.wary[z].w.toFixed(2); S.econH += 12 * 1; out.faded = +Math.max(0, S.wary[z].w - (S.econH - S.wary[z].h) * window.__pv.PICK_WARY.fade).toFixed(2);
  Math.random = R; out.takes = takes;
  return out;
});
check('a pickpocket spree puts a district on guard (wariness ~1 after seven lifts: lower odds, smaller takes), and it fades over ~12 minutes', wary.wary >= 0.9 && wary.faded < 0.05, JSON.stringify(wary));

// ---------------------------------------------------------------- Rank: monotonic, explained, reachable, not for sale
const rk = await ev(() => {
  const P = window.__pv, out = { mono: true, hints: [] };
  const R = P.RANKS;
  for (let i = 1; i < R.length; i++) for (const k in R[i - 1].need) if (!((R[i].need[k] || 0) >= R[i - 1].need[k])) out.mono = false;
  out.top = R[R.length - 1].need; out.up = R[5].need;
  for (let i = 0; i < R.length - 1; i++) { const nx = R[i + 1].need; out.hints.push([i, Object.keys(nx).filter(k => k === 'rep' || k === 'turfs').every(k => R[i].hint.includes(String(nx[k]).replace(/\B(?=(\d{3})+(?!\d))/g, ',')) || R[i].hint.includes(String(nx[k])))]); }
  return out;
});
check('Rank requirements only ever grow from one Rank to the next', rk.mono, JSON.stringify(rk));
check('Underworld Power needs a Lieutenant and 8 turfs; City Kingpin two Lieutenants, 16 turfs, an operating warehouse, 2,500 Rep', rk.up.lts === 1 && rk.up.turfs === 8 && rk.top.lts === 2 && rk.top.turfs === 16 && rk.top.wh === 1 && rk.top.rep === 2500, JSON.stringify([rk.up, rk.top]));
check('each Rank’s hint names the next Rank’s Rep and turf numbers', rk.hints.every(h => h[1]), JSON.stringify(rk.hints));

// ---------------------------------------------------------------- suppliers restock (no soft lock on the trade)
const shelf = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, out = {};
  const st = uw.shelf('sully'); out.full = uw.supplyFull('sully', 'smokes'); out.first = st.smokes;
  st.smokes = 0; uw.restockSuppliers(); out.day1 = st.smokes; uw.restockSuppliers(); out.day2 = st.smokes; uw.restockSuppliers(); out.day3 = st.smokes;
  { const L = uw.loc('spot', 'armorer'); out.armorerSells = !!(L.def.sells && L.def.sells.length); }
  return out;
});
check('a supplier starts with a full shelf and, bought out, restocks half of it each economic day (full again in two, never over)', shelf.first === shelf.full && shelf.day1 === Math.ceil(shelf.full / 2) && shelf.day2 === shelf.full && shelf.day3 === shelf.full, JSON.stringify(shelf));
check('the Armorer sells no hardware (only buys it), so his counter is no buy-sell loop', shelf.armorerSells === false, JSON.stringify(shelf));

check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
await finish(b, 'economy');
