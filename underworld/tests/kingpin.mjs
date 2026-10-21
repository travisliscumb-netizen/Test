/* Power should feel like power: with the same turf map, a player who towers over the city's crews
   gets far fewer border wars and business hits than one who is merely holding ground, rivals on
   his turf pay their cut almost every day, and a lone weak gang doesn't throw itself at the
   kingpin unless it has a real grudge or a coalition behind it. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const res = await page.evaluate(() => {
  const g = window.game, uw = g.uw, S = uw.S;
  g.events.cool = 1e9;
  let seed = 12345; const R0 = Math.random; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  // the same 18 turfs in both runs: the middle of the map
  const mine = uw.T.map(t => t.i).filter(i => { const t = uw.T[i]; const cx = t.deal.x / 80, cz = t.deal.z / 80; return cx > 1 && cx < 11 && cz > 1 && cz < 11; }).slice(0, 24);
  const snap = JSON.stringify({ turfs: S.turfs, factions: S.factions, infamy: S.infamy, props: S.props });
  const run = (infamy, days) => {
    const base = JSON.parse(snap); S.turfs = base.turfs; S.factions = base.factions; S.props = base.props; S.infamy = infamy;
    // the top Rank needs the whole empire (§31): Rep, crew, two Lieutenants, 16 turfs and 800 influence. Both runs
    // have the same people; only infamy (and so influence) differs
    g.save.rep = 2500; S.crew = [1, 2].map(n => uw.crew.sanitizeMember({ id: 900 + n, name: 'Test Lieutenant' + n, role: 'lieutenant', rank: 3, skill: 50, loyalty: 90, pay: 100, traits: [], status: 'active', assign: null }));
    let wars = 0, over = 0, ratios = [], hits = 0, comp = [], refused = 0, paid = 0, kp = 0;
    const SW = uw.factions.startWar.bind(uw.factions);
    uw.factions.startWar = (att, i, why) => { const ok = SW(att, i, why); if (ok && S.turfs[i].war && S.turfs[i].war.d === 'pc') { wars++; const r = uw.powerRatio(att); ratios.push(+r.toFixed(2)); if (r > 2.5) over++; } return ok; };
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
      uw.factions.tickDay();
      hits += Math.max(0, Object.values(S.props).filter(o => o.dmg > 0).length - before);
      for (const o of Object.values(S.props)) o.dmg = 0;
      for (const i of mine) { const fid = uw.royalty.payer(i); if (fid) comp.push(uw.royalty.compliance(i, fid)); }
      uw.royalty.tickDay();
      for (let i = 0; i < uw.T.length; i++) if (S.turfs[i].war && S.turfs[i].war.d === 'pc' && !pre.has(i) && S.turfs[i].war.a && !S.turfs[i].war.counted) { S.turfs[i].war.counted = 1; }
      for (const i of mine) { const r = S.roy[i]; if (r && r.payer) { if (r.status === 'refused' || r.status === 'challenge') refused++; else if (r.status === 'paid') paid++; } }
    }
    uw.factions.startWar = SW;
    for (const T of S.turfs) T.war = null;
    return { wars, over, rmax: ratios.length ? Math.max(...ratios) : 0, hits, infl: uw.influence, kingpin: kp === days, kp, ratio: +Math.min(...Object.keys(S.factions).map(f => uw.powerRatio(f))).toFixed(2), compMin: comp.length ? +Math.min(...comp).toFixed(2) : 1, compAvg: comp.length ? +(comp.reduce((a, c) => a + c, 0) / comp.length).toFixed(2) : 1, refused, paid };
  };
  // own two businesses so the "rivals hit your businesses" path has targets in both runs
  for (const id of ['pawn', 'laundromat', 'diner']) if (S.props[id]) S.props[id].owned = true; else S.props[id] = { owned: true, dmg: 0 };
  const strong = run(0, 120), king = run(400, 120);
  Math.random = R0;
  return { strong, king, mine: mine.length };
});
check('the comparison is fair: same turfs, one ordinary boss and one kingpin', res.mine >= 20 && !res.strong.kingpin && res.king.kingpin, JSON.stringify(res));
check('as kingpin, rival crews start far fewer wars on your turf (well under half as many)', res.strong.wars >= 10 && res.king.wars <= res.strong.wars * 0.45, JSON.stringify({ ordinary: res.strong.wars, kingpin: res.king.wars }));
check('a crew the kingpin outweighs 2.5 to 1 never starts a war with him (no suicidal challenges)', res.king.over === 0, JSON.stringify({ over: res.king.over, ratioOfAttackers: res.king.rmax }));
check('rivals doing business on a kingpin’s turf pay their cut (compliance ≥ 88%, refusals rare)', res.king.compMin >= 0.88 && res.king.refused <= res.king.paid * 0.12, JSON.stringify(res.king));
check('lower down the ladder they still test you (it is not free money)', res.strong.compAvg < 0.85 && res.strong.refused > 0, JSON.stringify(res.strong));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'kingpin');
