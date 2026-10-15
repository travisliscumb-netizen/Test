/* Wealth-aware pickpocketing (v6): who you rob depends on where you are (locals and workers in poor districts,
   executives, business owners and wealthy tourists in rich ones); what they carry is strongly skewed (mostly
   small, sometimes good, rarely a $10K / $40K / $100K score, the biggest only in the richest districts); a lift in
   the game pays the cash, names what was taken and from whom, and records the best take. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
await ev(() => { const g = window.game; g.events.cool = 1e9; g.police.enabled = false; });

const sim = await ev(() => {
  const P = window.__pv; let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const out = {};
  for (const zk of ['r', 'o', 'c', 'u']) {
    const cash = [], types = {}; let jp = 0, j10 = 0, j40 = 0, j100 = 0, hot = 0, maxNJ = 0;
    const N = 60000;
    for (let i = 0; i < N; i++) {
      const L = P.pocketLoot({ id: i }, zk, rnd);
      cash.push(L.cash); if (!L.jackpot) maxNJ = Math.max(maxNJ, L.cash); types[L.type] = (types[L.type] || 0) + 1; if (L.hot) hot++;
      if (L.jackpot) { jp++; if (L.jackpot >= 80000) j100++; else if (L.jackpot >= 32000) j40++; else j10++; }
    }
    cash.sort((a, c) => a - c);
    const q = f => cash[Math.floor(f * (N - 1))], mean = cash.reduce((a, c) => a + c, 0) / N;
    out[zk] = { median: q(0.5), p90: q(0.9), p99: q(0.99), max: cash[N - 1], mean: Math.round(mean), under100: +(cash.filter(c => c < 100).length / N).toFixed(3), jpRate: +(jp / N).toFixed(4), maxNJ, j10, j40, j100, hot: +(hot / N).toFixed(2), types };
  }
  return out;
});
const { r, o, c, u } = sim;
console.log(JSON.stringify(sim));
check('poor districts: mostly small change (most pockets under $100)', r.under100 > 0.6 && r.median < 60, JSON.stringify(r));
check('richer districts carry more: median and mean rise with wealth', r.median < o.median && o.median <= c.median && c.median <= u.median && r.mean < c.mean && c.mean < u.mean * 1.05, JSON.stringify([r.mean, o.mean, c.mean, u.mean]));
check('the curve is skewed: the mean sits well above the median everywhere', [r, o, c, u].every(z => z.mean > z.median * 1.8), JSON.stringify([r, o, c, u].map(z => [z.median, z.mean])));
check('who you meet depends on where you are (executives and wealthy tourists in the rich districts)', (u.types.exec || 0) + (u.types.highroller || 0) > 5 * ((r.types.exec || 0) + (r.types.highroller || 0) + 1) && (r.types.local || 0) > (u.types.local || 0) * 2, JSON.stringify([r.types, u.types]));
check('big scores are rare: under 1 in 100 lifts even in the richest district', u.jpRate > 0 && u.jpRate < 0.01 && r.jpRate < 0.002, JSON.stringify([r.jpRate, o.jpRate, c.jpRate, u.jpRate]));
check('$10K is the usual big score, $40K rarer, $100K rarest', u.j10 > u.j40 && u.j40 > u.j100 && u.j100 > 0, JSON.stringify([u.j10, u.j40, u.j100]));
check('outside the big-score roll nobody carries $10K (the payroll envelope and the high roller stay under it)', [r, o, c, u].every(z => z.maxNJ < 10000), JSON.stringify([r, o, c, u].map(z => z.maxNJ)));
check('the $100K pocket only exists in the richest districts', r.j100 === 0 && o.j100 === 0 && r.j40 === 0, JSON.stringify([r, o].map(z => [z.j10, z.j40, z.j100])));
check('valuables turn up more often on richer marks', r.hot < u.hot, JSON.stringify([r.hot, u.hot]));

// a lift in the game
const lift = await ev(() => {
  const g = window.game, uw = g.uw, P = window.__pv;
  const toasts = []; const T = g.ui.toast.bind(g.ui); g.ui.toast = (m, t) => { toasts.push(m); return T(m, t); };
  const R = Math.random; Math.random = () => 0.01; // they never feel it
  const m0 = g.save.money, q = { id: 4242, x: 7 * 80 + 40, z: 4 * 80 + 40, h: 0, state: 'walk' };
  try { uw.pickpocket(q); } finally { Math.random = R; g.ui.toast = T; }
  return { got: g.save.money - m0, toast: toasts.join(' | '), best: uw.S.st.bestPick, picks: uw.S.st.picks, picked: q.picked };
});
check('a lift pays out, says from whom, and counts', lift.got > 0 && /^Lifted \$[\d,]+.* from (a|an) /.test(lift.toast) && lift.best >= lift.got && lift.picks >= 1 && lift.picked, JSON.stringify(lift));

check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await finish(b, 'street');
