/* Power should feel like power: with the same turf map, a player who towers over the city's crews
   gets far fewer border wars and business hits than one who is merely holding ground, rivals on
   his turf pay their cut almost every day, and a lone weak gang doesn't throw itself at the
   kingpin unless it has a real grudge or a coalition behind it. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
// one seeded simulation per call; the checks use three seeds' totals, because a single seed's war count sits
// within a few wars of the threshold either way (the spread between seeds is about ±15%)
const once = sd => page.evaluate(seed0 => {
  const g = window.game, uw = g.uw, S = uw.S;
  g.events.cool = 1e9;
  let seed = seed0; const R0 = Math.random; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  // the same 18 turfs in both runs: the middle of the map
  const mine = uw.T.map(t => t.i).filter(i => { const t = uw.T[i]; const cx = t.deal.x / 80, cz = t.deal.z / 80; return cx > 1 && cx < 11 && cz > 1 && cz < 11; }).slice(0, 24);
  // every seed starts from the same state: the game keeps running between calls, at a pace that depends on load
  const snap = window.__kpSnap || (window.__kpSnap = JSON.stringify({ turfs: S.turfs, factions: S.factions, infamy: S.infamy, props: S.props, day: S.day }));
  const run = (infamy, days) => {
    const base = JSON.parse(snap); S.turfs = base.turfs; S.factions = base.factions; S.props = base.props; S.infamy = infamy; S.day = base.day;
    // the top Rank needs the whole empire (§31): 2,500 Rep, six crew, two Lieutenants, 16 turfs and 800 influence. Both runs
    // have the same people; only infamy (and so influence) differs
    g.save.rep = 2500;
    // ...and an operating warehouse (Session 3): one of the Lieutenants runs Cannery Row, with a Driver
    S.props.whse_w = { owned: true, dmg: 0, since: 1, lvl: 1 };
    S.crew = [1, 2].map(n => uw.crew.sanitizeMember({ id: 900 + n, name: 'Test Lieutenant' + n, role: 'lieutenant', rank: 3, skill: 50, loyalty: 90, pay: 100, traits: [], status: 'active', assign: n === 1 ? 'w:whse_w' : null }));
    S.crew.push(uw.crew.sanitizeMember({ id: 903, name: 'Test Driver', role: 'driver', rank: 1, skill: 50, loyalty: 90, pay: 100, traits: [], status: 'active', assign: 'w:whse_w' }));
    // City Kingpin needs six active crew (M13): three more hands, unassigned, the same in both runs
    for (const n of [4, 5, 6]) S.crew.push(uw.crew.sanitizeMember({ id: 900 + n, name: 'Test Hand' + n, role: 'enforcer', rank: 1, skill: 50, loyalty: 90, pay: 100, traits: [], status: 'active', assign: null }));
    let wars = 0, over = 0, ratios = [], hits = 0, comp = [], refused = 0, paid = 0, kp = 0;
    // since Session 4A a rival comes for your turf only through a turf-takeback threat, driven by its grievance: every
    // faction is given the same strike-level grievance each day, and the takebacks aimed at you are counted
    const CR = uw.threats.create.bind(uw.threats);
    uw.threats.create = (fid, kind, target, stage) => { const o = CR(fid, kind, target, stage); if (o && kind === 'turf') { wars++; const r = uw.powerRatio(fid); ratios.push(+r.toFixed(2)); if (r > 2.5) over++; } return o; };
    for (let d = 0; d < days; d++) {
      // the map holds still: your turfs stay yours, rivals keep a toe-hold to pay royalties from
      for (const i of mine) { const T = S.turfs[i]; for (const k in T.inf) if (k !== 'pc') T.inf[k] = Math.min(T.inf[k], 20); T.inf.pc = 90; T.own = 'pc'; }
      for (const fid in S.factions) { const f = S.factions[fid]; f.strength = Math.max(f.strength, 40); f.broken = 0; f.truce = 0; f.rel = Math.max(-50, Math.min(10, f.rel)); }
      S.infamy = infamy; uw.recompute(); uw.computeInfluence();
      if (uw.kingpin()) kp++;
      // a real day: wars run their hours, then the daily decisions (new wars, raids, business hits)
      for (let h = 0; h < 24; h++) uw.factions.tickHours(1, h);
      const before = Object.values(S.props).filter(o => o.dmg > 0).length;
      const pre = new Set(S.turfs.map((t, i) => t.war && t.war.d === 'pc' ? i : -1));
      for (const fid in S.factions) S.factions[fid].press = 95;
      S.threats.list = [];
      uw.factions.tickDay();
      hits += Math.max(0, Object.values(S.props).filter(o => o.dmg > 0).length - before);
      for (const o of Object.values(S.props)) o.dmg = 0;
      for (const i of mine) { const fid = uw.royalty.payer(i); if (fid) comp.push(uw.royalty.compliance(i, fid)); }
      uw.royalty.tickDay();
      for (let i = 0; i < uw.T.length; i++) if (S.turfs[i].war && S.turfs[i].war.d === 'pc' && !pre.has(i) && S.turfs[i].war.a && !S.turfs[i].war.counted) { S.turfs[i].war.counted = 1; }
      for (const i of mine) { const r = S.roy[i]; if (r && r.payer) { if (r.status === 'refused' || r.status === 'challenge') refused++; else if (r.status === 'paid') paid++; } }
    }
    uw.threats.create = CR; S.threats.list = [];
    for (const T of S.turfs) T.war = null;
    return { wars, over, rmax: ratios.length ? Math.max(...ratios) : 0, hits, infl: uw.influence, kingpin: kp === days, kp, ratio: +Math.min(...Object.keys(S.factions).map(f => uw.powerRatio(f))).toFixed(2), compMin: comp.length ? +Math.min(...comp).toFixed(2) : 1, compAvg: comp.length ? +(comp.reduce((a, c) => a + c, 0) / comp.length).toFixed(2) : 1, refused, paid };
  };
  // own two businesses so the "rivals hit your businesses" path has targets in both runs
  for (const id of ['pawn', 'laundromat', 'diner']) if (S.props[id]) S.props[id].owned = true; else S.props[id] = { owned: true, dmg: 0 };
  const strong = run(0, 120), king = run(400, 120);
  Math.random = R0;
  return { strong, king, mine: mine.length };
}, sd);
const runs = [];
for (const sd of [12345, 101, 202]) { await page.evaluate(() => { const S = window.game.uw.S; for (const T of S.turfs) T.war = null; }); runs.push(await once(sd)); }
const sum = (side, k) => runs.reduce((a, r) => a + r[side][k], 0);
const res = {
  mine: Math.min(...runs.map(r => r.mine)), seeds: runs.length,
  strong: { wars: sum('strong', 'wars'), kingpin: runs.some(r => r.strong.kingpin), compAvg: +(runs.reduce((a, r) => a + r.strong.compAvg, 0) / runs.length).toFixed(2), refused: sum('strong', 'refused') },
  king: { wars: sum('king', 'wars'), kingpin: runs.every(r => r.king.kingpin), over: sum('king', 'over'), rmax: Math.max(...runs.map(r => r.king.rmax)), compMin: Math.min(...runs.map(r => r.king.compMin)), refused: sum('king', 'refused'), paid: sum('king', 'paid') },
  perSeed: runs.map(r => [r.strong.wars, r.king.wars])
};
check('the comparison is fair: same turfs, one ordinary boss and one kingpin', res.mine >= 20 && !res.strong.kingpin && res.king.kingpin, JSON.stringify(res));
check('with the same grievance, rival crews come for a kingpin’s turf far less often (well under half as many takebacks, over three seeds)', res.strong.wars >= 30 && res.king.wars <= res.strong.wars * 0.45, JSON.stringify({ ordinary: res.strong.wars, kingpin: res.king.wars, perSeed: res.perSeed }));
check('a crew the kingpin outweighs 2.5 to 1 never comes for his turf (no suicidal challenges)', res.king.over === 0, JSON.stringify({ over: res.king.over, ratioOfAttackers: res.king.rmax }));
check('rivals doing business on a kingpin’s turf pay their cut (compliance ≥ 88%, refusals rare)', res.king.compMin >= 0.88 && res.king.refused <= res.king.paid * 0.12, JSON.stringify(res.king));
check('lower down the ladder they still test you (it is not free money)', res.strong.compAvg < 0.85 && res.strong.refused > 0, JSON.stringify(res.strong));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'kingpin');
