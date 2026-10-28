/* Royale Billions Monte Carlo (M9: an honest machine). Runs the real slot code: the casino block of index.html
   (CASINO, the Royale ladder, royaleSpin, royaleRollMajor and the reel builder) is cut out of the file and
   evaluated in a Node VM, with a seeded random source per simulated player, so every run gives the same numbers.
   Play time is measured in spins at ROYALE.sph spins an hour (read from the game).

   - the model: which tiers are in play at a bet, chances in proportion to the bet, the jackpots' share of the stake
   - 1-hour sessions with full spins (reels, line pays and jackpots) at the qualifying $10,000 bet and at $100
   - a long run of the jackpot roll (royaleRollMajor, the same roll royaleSpin makes) at $10,000 for hundreds of
     simulated players, and the same run with the drought pressure switched off, to show what the pressure does
   Nothing here forces an outcome: the checks only read what the random runs produced.

   node underworld/tests/royale-sim.mjs            full run (a few minutes on 4 cores)
   QUICK=1 node underworld/tests/royale-sim.mjs    a smaller population for a fast look
   UW_FILE=path runs it against another build. */
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const SELF = fileURLToPath(import.meta.url);
const FILE = process.env.UW_FILE ? path.resolve(process.env.UW_FILE) : path.resolve(path.dirname(SELF), '..', 'index.html');

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// the casino block of the game, evaluated on its own; patch lets the control run switch the drought off
function loadRoyale(patch) {
  let src = fs.readFileSync(FILE, 'utf8');
  const l0 = src.indexOf('const SLOT_LINES5 ='), a = src.indexOf('const CASINO = {'), b0 = src.indexOf('function royaleClass(');
  if (l0 < 0 || a < 0 || b0 < 0) throw new Error('casino block not found in ' + FILE);
  let code = src.slice(l0, src.indexOf('\n', l0)) + '\n' + src.slice(a, src.indexOf('\n}\n', b0) + 3);
  if (patch) code = patch(code);
  const ctx = { Math: Object.create(Math), rng: Math.random };
  ctx.Math.random = () => ctx.rng();
  const R = vm.runInNewContext(code + '\n;({ CASINO, ROYALE, ROYALE_BASE_RTP, ROYALE_MAJORS, ROYALE_DROUGHT_K, royaleSpin, royaleRollMajor, royaleChances, royaleEvery })', ctx);
  R.setRng = f => { ctx.rng = f; };
  return R;
}

if (!isMainThread) {
  const { job, from, to } = workerData;
  const R = loadRoyale(job.noDrought ? c => c.replace(/drought: 4,/, 'drought: 0,') : null);
  const T = R.ROYALE_MAJORS.length, SPH = R.ROYALE.sph, out = [];
  for (let pi = from; pi < to; pi++) {
    const rnd = mulberry32(job.seed * 100003 + pi * 7919 + 1); R.setRng(rnd);
    const jp = { pr: {}, hits: {} };
    if (job.kind === 'session') {
      // full spins: per hour, wagered / won / line-only won, prize counts by tier, spins that paid nothing
      const hours = [];
      for (let h = 0; h < job.hours; h++) {
        const H = { won: 0, line: 0, lose: 0, below: 0, tiers: new Array(T).fill(0), first: [] };
        for (let i = 0; i < SPH; i++) {
          const r = R.royaleSpin(job.bet, jp, rnd);
          H.won += r.win; if (r.major < 0) H.line += r.win; else { H.tiers[r.major]++; H.first.push(i); }
          if (r.win === 0) H.lose++; if (r.win < job.bet) H.below++;
        }
        hours.push(H);
      }
      out.push(hours);
    } else {
      // jackpot roll only: every $1M+ hit with its spin index and tier; counts for the smaller tiers
      const hits = [], small = new Array(T).fill(0), n = job.hours * SPH;
      for (let i = 0; i < n; i++) {
        const t = R.royaleRollMajor(job.bet, jp, rnd);
        if (t >= 0) { if (R.ROYALE_MAJORS[t].prize >= 1e6) hits.push([i, t]); else small[t]++; }
      }
      out.push({ hits, small });
    }
  }
  parentPort.postMessage(out);
} else {
  const QUICK = !!process.env.QUICK;
  const R = loadRoyale();
  const SPH = R.ROYALE.sph, M = R.ROYALE_MAJORS, T = M.length, FULL = R.ROYALE.qualify, K = R.ROYALE_DROUGHT_K, SHARE = R.ROYALE.share;
  const NW = Math.max(1, Math.min(os.cpus().length, 8));
  const run = (job, players) => Promise.all(Array.from({ length: NW }, (_, w) => {
    const from = Math.floor(players * w / NW), to = Math.floor(players * (w + 1) / NW);
    return new Promise((res, rej) => { const wk = new Worker(SELF, { workerData: { job, from, to } }); wk.on('message', res); wk.on('error', rej); wk.on('exit', c => { if (c) rej(new Error('worker exit ' + c)); }); });
  })).then(parts => parts.flat());
  let failures = 0, total = 0;
  const check = (name, ok, detail = '') => { total++; if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };
  const pct = x => (x * 100).toFixed(1) + '%';
  const money = x => (x < 0 ? '−$' : '$') + Math.round(Math.abs(x)).toLocaleString('en-US');
  const q = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN; };
  const t0 = Date.now();
  console.log(`Royale Billions simulation · ${path.basename(FILE)} · ${SPH} spins/hour · jackpot share ${pct(SHARE)} · the billion qualifies at $${FULL.toLocaleString('en-US')} · drought K ${K.toFixed(4)} · ${NW} workers${QUICK ? ' · QUICK' : ''}`);
  // the long-run chance per spin of each tier at a bet (the drought pressure averages back to this)
  const rate = bet => R.royaleChances(bet).map(p => p / K);

  // ------------------------------------------------------------- the model itself
  const chQ = R.royaleChances(FULL), chU = R.royaleChances(FULL - 1), ch10 = R.royaleChances(10);
  check('at $10,000 every jackpot of $50,000 and up is in play, the billion included', M.every((m, t) => (chQ[t] > 0) === (m.prize >= 5 * FULL)), chQ.map(p => p.toExponential(1)).join(' '));
  check('the billion is only in play on a qualifying $10,000 spin ($9,999 and $10 cannot win it)', chU[0] === 0 && ch10[0] === 0 && chU[1] > 0 && ch10[1] > 0);
  const c1 = R.royaleChances(1000), c2 = R.royaleChances(2000);
  check('a jackpot’s chance is in proportion to the bet (twice the bet, twice the chance)', M.every((m, t) => !c1[t] || Math.abs(c2[t] / c1[t] - 2) < 1e-9), M.map((m, t) => c1[t] ? (c2[t] / c1[t]).toFixed(3) : '-').join(' '));
  const shareAt = bet => rate(bet).reduce((a, p, t) => a + p * M[t].prize / bet, 0);
  const shares = [10, 100, 1000, 5000, FULL].map(shareAt);
  check(`the jackpots return exactly ${pct(SHARE)} of the stake at every bet ($10 … $10,000): no bet size is favoured`, shares.every(x => Math.abs(x - SHARE) < 1e-9), shares.map(x => x.toFixed(4)).join(' '));
  const ladder = rate(FULL);
  check('a bigger prize is never more likely than a smaller one', ladder.every((p, t) => !t || !p || ladder[t - 1] <= p * 1.000001), ladder.map(p => p.toExponential(2)).join(' '));
  const bWait = 1 / (ladder[0] * SPH);
  console.log(`  at $10,000 a spin: the billion progressive about once per ${Math.round(bWait).toLocaleString('en-US')} h of play; $1M once per ${(1 / (ladder[7] * SPH)).toFixed(1)} h; $50,000 ${(ladder[11] * SPH).toFixed(2)} an hour`);
  check('the progressive is a rare windfall: over 1,000 hours of $10,000 spins between billions on average', bWait > 1000, `${Math.round(bWait)} h`);

  // ------------------------------------------------------------- 1. one-hour sessions, full spins
  const sessions = async (bet, players, hours, seed) => {
    const data = await run({ kind: 'session', bet, hours, seed }, players);
    const S = data.flat(), wag = bet * SPH;
    const net = S.map(h => h.won - wag), lineRtp = S.reduce((a, h) => a + h.line, 0) / (wag * S.length);
    const tierPerH = new Array(T).fill(0); for (const h of S) h.tiers.forEach((n, t) => { tierPerH[t] += n; });
    const lose = S.reduce((a, h) => a + h.lose, 0) / (SPH * S.length), below = S.reduce((a, h) => a + h.below, 0) / (SPH * S.length);
    const b2b = S.filter(h => h.first.some((x, i) => i && x === h.first[i - 1] + 1)).length;
    const anyPrize = S.filter(h => h.tiers.some(n => n)).length / S.length;
    return { bet, n: S.length, meanNet: net.reduce((a, x) => a + x, 0) / S.length, medNet: q(net, 0.5), p10: q(net, 0.1), p90: q(net, 0.9), profitable: net.filter(x => x > 0).length / S.length,
      rtp: S.reduce((a, h) => a + h.won, 0) / (wag * S.length), lineRtp, tierPerH: tierPerH.map(n => n / S.length), tierN: tierPerH, lose, below, b2b, anyPrize, best: Math.max(...net), worst: Math.min(...net) };
  };
  const sQ = await sessions(FULL, QUICK ? 40 : 200, 30, 11);
  const s100 = await sessions(100, QUICK ? 20 : 100, 30, 12);
  for (const s of [sQ, s100]) {
    console.log(`\n1-HOUR SESSIONS at ${money(s.bet)} a spin (${s.n.toLocaleString('en-US')} sessions, ${(s.n * SPH / 1e6).toFixed(1)}M full spins)`);
    console.log(`  wagered per hour ${money(s.bet * SPH)} · return ${pct(s.rtp)} (line game alone ${pct(s.lineRtp)})`);
    console.log(`  net per session: mean ${money(s.meanNet)} · median ${money(s.medNet)} · 10th pct ${money(s.p10)} · 90th pct ${money(s.p90)} · best ${money(s.best)} · worst ${money(s.worst)}`);
    console.log(`  profitable sessions ${pct(s.profitable)} · with a jackpot ${pct(s.anyPrize)} · spins paying nothing ${pct(s.lose)} · spins paying less than the bet ${pct(s.below)} · jackpots on consecutive spins ${s.b2b}`);
    console.log('  prizes per hour: ' + M.map((m, t) => s.tierN[t] ? `${money(m.prize)} ${s.tierPerH[t].toFixed(3)}` : null).filter(Boolean).join(' · '));
  }
  const lineTarget = R.ROYALE_BASE_RTP * R.ROYALE.baseK;
  check(`the line game returns about ${pct(lineTarget)} at both bets (±1.5%)`, Math.abs(sQ.lineRtp - lineTarget) < 0.015 && Math.abs(s100.lineRtp - lineTarget) < 0.015, `${pct(sQ.lineRtp)} / ${pct(s100.lineRtp)}`);
  check('spins lose often (≥ 35% pay nothing)', sQ.lose >= 0.35 && s100.lose >= 0.35, `${pct(sQ.lose)} / ${pct(s100.lose)}`);
  check('the house wins over time: most one-hour sessions lose money at both bets', sQ.profitable < 0.5 && s100.profitable < 0.5, `profitable ${pct(sQ.profitable)} / ${pct(s100.profitable)}`);
  check('but good nights happen: some one-hour sessions finish ahead', sQ.profitable > 0.02 && s100.profitable > 0.02, `${pct(sQ.profitable)} / ${pct(s100.profitable)}`);
  const tierOkS = M.every((m, t) => { const e = rate(FULL)[t] * SPH * sQ.n; return e < 400 || Math.abs(sQ.tierN[t] / e - 1) < 4 / Math.sqrt(e); });
  check('at $10,000 every common jackpot lands at its long-run rate (within 4σ)', tierOkS, M.map((m, t) => { const e = rate(FULL)[t] * SPH * sQ.n; return e >= 400 ? `${money(m.prize)} ${sQ.tierN[t]}/${e.toFixed(0)}` : null; }).filter(Boolean).join(' · '));
  check('jackpots on back-to-back spins occur (independent rolls)', sQ.b2b + s100.b2b > 0, String(sQ.b2b + s100.b2b));

  // ------------------------------------------------------------- 2. long run of the jackpot roll at $10,000
  const LP = QUICK ? 120 : 400, LH = QUICK ? 300 : 400, totalH = LP * LH;
  const L = await run({ kind: 'long', bet: FULL, hours: LH, seed: 21, noDrought: false }, LP);
  const C = await run({ kind: 'long', bet: FULL, hours: LH, seed: 22, noDrought: true }, QUICK ? 60 : 200);
  const gaps = (data, pred) => { const g = []; for (const p of data) { let last = 0; for (const [i, t] of p.hits) if (pred(t)) { g.push((i - last) / SPH); last = i; } } return g; };
  const hitsN = (data, pred) => data.reduce((a, p) => a + p.hits.filter(([, t]) => pred(t)).length, 0);
  const surv = (data, pred, x) => { let n = 0, dry = 0; for (const p of data) { const hs = p.hits.filter(([, t]) => pred(t)).map(([i]) => i / SPH); for (let w = 0; w + x <= LH; w++) { n++; if (!hs.some(h => h >= w && h < w + x)) dry++; } } return dry / Math.max(1, n); };
  console.log(`\nLONG RUN (jackpot roll at ${money(FULL)}: ${LP.toLocaleString('en-US')} players × ${LH} h = ${totalH.toLocaleString('en-US')} h, ${(totalH * SPH / 1e6).toFixed(0)}M spins)`);
  const exp = t => rate(FULL)[t] * SPH * totalH;
  console.log('  $1M+ tiers (hits / expected): ' + M.map((m, t) => m.prize >= 1e6 ? `${money(m.prize)} ${hitsN(L, x => x === t)}/${exp(t).toFixed(1)}` : null).filter(Boolean).join(' · '));
  const tierOkL = M.every((m, t) => m.prize < 1e6 || Math.abs(hitsN(L, x => x === t) - exp(t)) < 4 * Math.sqrt(exp(t)) + 2);
  check('every $1M+ tier lands at its long-run rate, pressure included (within 4σ)', tierOkL);
  const bN = hitsN(L, x => x === 0);
  check('the billion is rare but real: it was seen in the long run, about as often as the model says', bN > 0 && Math.abs(bN - exp(0)) < 4 * Math.sqrt(exp(0)) + 2, `${bN} vs ${exp(0).toFixed(1)} expected in ${totalH.toLocaleString('en-US')} h`);
  // droughts, read on the $1M tier (enough hits to see the shape)
  const isM = t => t === 7, mean1m = 1 / (rate(FULL)[7] * SPH), gG = gaps(L, isM), gC = gaps(C, isM);
  const dr = [1, 2, 3].map(k => [k * mean1m, surv(L, isM, Math.round(k * mean1m)), surv(C, isM, Math.round(k * mean1m))]);
  console.log(`\nDROUGHTS ($1M, one per ${mean1m.toFixed(1)} h on average): chance a stretch has none — ${dr.map(([x, a, c]) => `${x.toFixed(0)} h: ${pct(a)} with pressure / ${pct(c)} without`).join(' · ')}`);
  console.log(`  99th-percentile gap ${q(gG, 0.99).toFixed(0)} h with pressure, ${q(gC, 0.99).toFixed(0)} h without`);
  check('droughts get steadily less likely the longer they run', dr[0][1] > dr[1][1] && dr[1][1] > dr[2][1], dr.map(d => pct(d[1])).join(' > '));
  check('drought pressure shortens the long dry runs (99th percentile gap lower than without it)', q(gG, 0.99) < q(gC, 0.99) * 0.85, `${q(gG, 0.99).toFixed(0)} h vs ${q(gC, 0.99).toFixed(0)} h`);
  check('long droughts stay possible (some gap over 1.5× the average was seen)', Math.max(...gG) > mean1m * 1.5, `longest ${Math.max(...gG).toFixed(1)} h`);

  console.log(`\nroyale-sim: ${total - failures} / ${total} passed · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (failures) { console.log('FAILED'); process.exitCode = 1; } else console.log('ALL CHECKS PASSED');
}
