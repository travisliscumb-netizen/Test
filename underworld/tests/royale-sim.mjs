/* Royale Billions Monte Carlo (v7). Runs the real slot code: the casino block of index.html (CASINO, the
   Royale ladder, royaleSpin, royaleRollMajor and the reel builder) is cut out of the file and evaluated in a
   Node VM, with a seeded random source per simulated player, so every run gives the same numbers.
   Play time is measured in spins at ROYALE.sph spins an hour (read from the game).

   - 1-hour sessions with full spins (reels, line pays and jackpots) at the full-odds bet and at $100
   - 7-hour weeks and 30-hour months out of a long run of the jackpot roll (royaleRollMajor, the same roll
     royaleSpin makes), for thousands of simulated players
   - the same long run with the drought pressure switched off, to show what the pressure does
   Nothing here forces an outcome: the checks only read what the random runs produced.

   node underworld/tests/royale-sim.mjs            full run (about 3 minutes on 4 cores)
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
  const R = vm.runInNewContext(code + '\n;({ CASINO, ROYALE, ROYALE_MAJORS, ROYALE_DROUGHT_K, royaleSpin, royaleRollMajor, royaleChances, royaleEvery })', ctx);
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
  const SPH = R.ROYALE.sph, M = R.ROYALE_MAJORS, T = M.length, FULL = R.ROYALE.fullBet;
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
  console.log(`Royale Billions simulation · ${path.basename(FILE)} · ${SPH} spins/hour · full odds from $${FULL.toLocaleString('en-US')} · drought K ${R.ROYALE_DROUGHT_K.toFixed(4)} · ${NW} workers${QUICK ? ' · QUICK' : ''}`);

  // ------------------------------------------------------------- the model itself
  const ch = R.royaleChances(FULL);
  check('every tier is in play from the first spin at the full-odds bet (none is ever switched off)', ch.every(p => p > 0), ch.map(p => p.toExponential(2)).join(' '));
  const chSmall = R.royaleChances(10);
  check('a $10 spin can still hit every tier up to $1B (smaller chance, never zero)', chSmall.every(p => p > 0) && Math.abs(chSmall[0] / ch[0] - 10 / FULL) < 1e-9, chSmall[0].toExponential(2));
  const ladder = [100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8].map(b => R.royaleChances(b)[0]);
  check('the $1B chance never drops as the bet rises (flat at full odds, then the old share rule for high rollers)', ladder.every((p, i) => !i || p >= ladder[i - 1] - 1e-15), ladder.map(p => p.toExponential(2)).join(' '));

  // ------------------------------------------------------------- 1. one-hour sessions, full spins
  const sessions = async (bet, players, hours, seed) => {
    const data = await run({ kind: 'session', bet, hours, seed }, players);
    const S = data.flat(), wag = bet * SPH;
    const net = S.map(h => h.won - wag), lineRtp = S.reduce((a, h) => a + h.line, 0) / (wag * S.length);
    const tierPerH = new Array(T).fill(0); for (const h of S) h.tiers.forEach((n, t) => { tierPerH[t] += n; });
    const meaningful = S.filter(h => h.tiers.some((n, t) => n && M[t].prize >= 1e4 && M[t].prize < 1e6)).length / S.length;
    const big100k = S.filter(h => h.tiers.some((n, t) => n && M[t].prize >= 1e5)).length / S.length;
    const several = S.filter(h => h.tiers.reduce((a, n, t) => a + (M[t].prize < 1e6 ? n : 0), 0) >= 3).length / S.length;
    const lose = S.reduce((a, h) => a + h.lose, 0) / (SPH * S.length), below = S.reduce((a, h) => a + h.below, 0) / (SPH * S.length);
    // back-to-back: two jackpots on consecutive spins inside one session
    const b2b = S.filter(h => h.first.some((x, i) => i && x === h.first[i - 1] + 1)).length;
    return { bet, n: S.length, meanNet: net.reduce((a, x) => a + x, 0) / S.length, medNet: q(net, 0.5), p10: q(net, 0.1), p90: q(net, 0.9), profitable: net.filter(x => x > 0).length / S.length,
      rtp: S.reduce((a, h) => a + h.won, 0) / (wag * S.length), lineRtp, tierPerH: tierPerH.map(n => n / S.length), meaningful, big100k, several, lose, below, b2b, worst: Math.min(...net) };
  };
  const sFull = await sessions(FULL, QUICK ? 40 : 200, 30, 11);
  const s100 = await sessions(100, QUICK ? 20 : 100, 30, 12);
  for (const s of [sFull, s100]) {
    console.log(`\n1-HOUR SESSIONS at ${money(s.bet)} a spin (${s.n.toLocaleString('en-US')} sessions, ${(s.n * SPH / 1e6).toFixed(1)}M full spins)`);
    console.log(`  wagered per hour ${money(s.bet * SPH)} · return ${pct(s.rtp)} (line game alone ${pct(s.lineRtp)})`);
    console.log(`  net per session: mean ${money(s.meanNet)} · median ${money(s.medNet)} · 10th pct ${money(s.p10)} · 90th pct ${money(s.p90)} · worst ${money(s.worst)}`);
    console.log(`  profitable sessions ${pct(s.profitable)} · spins paying nothing ${pct(s.lose)} · spins paying less than the bet ${pct(s.below)}`);
    console.log(`  sessions with a $10K–$500K prize ${pct(s.meaningful)} · with $100K or more ${pct(s.big100k)} · with 3+ prizes under $1M ${pct(s.several)} · sessions with jackpots on consecutive spins ${s.b2b}`);
    console.log('  prizes per hour: ' + M.map((m, t) => `${money(m.prize)} ${s.tierPerH[t].toFixed(3)}`).join(' · '));
  }
  check('full odds: individual spins still lose often (≥ 35% of spins pay nothing)', sFull.lose >= 0.35, `${pct(sFull.lose)} pay nothing · ${pct(sFull.below)} pay less than the bet`);
  check('full odds: the line game alone stays near break-even (95–101%), the prizes make the money', sFull.lineRtp > 0.95 && sFull.lineRtp < 1.01, pct(sFull.lineRtp));
  check('full odds: a $10K–$500K prize in most one-hour sessions (≥ 90%)', sFull.meaningful >= 0.9, pct(sFull.meaningful));
  check('full odds: sessions differ: some losing sessions exist and some have 3+ prizes', sFull.profitable < 0.995 && sFull.several > 0.2, `profitable ${pct(sFull.profitable)} · 3+ prizes ${pct(sFull.several)}`);
  check('$100 bets: a tenth of the jackpot rate, plenty of losing sessions, still player-favoured overall', s100.profitable < 0.8 && s100.rtp > 1, `profitable ${pct(s100.profitable)} · return ${pct(s100.rtp)}`);
  const firstB = sFull.tierPerH[0];
  check('a fresh save gets the long-run $1B rate from its first hour (first 30 h of every player: 0.026–0.041 per hour)', firstB > 0.026 && firstB < 0.041, `${firstB.toFixed(4)}/h vs ${M[0].perH.toFixed(4)}`);
  const minorTarget = M.map(m => m.perH), minorOk = M.every((m, t) => m.prize >= 1e6 || Math.abs(sFull.tierPerH[t] / m.perH - 1) < 0.12);
  check('full odds: every prize under $1M lands at its target rate per hour (±12%)', minorOk, M.filter(m => m.prize < 1e6).map((m, i) => `${money(m.prize)} ${sFull.tierPerH[M.indexOf(m)].toFixed(3)} vs ${minorTarget[M.indexOf(m)]}`).join(' · '));

  // ------------------------------------------------------------- 2. long run of the jackpot roll
  const longRun = async (players, hours, seed, noDrought) => {
    const data = await run({ kind: 'long', bet: FULL, hours, seed, noDrought }, players);
    return data;
  };
  // long runs per player, so a fresh start (no pressure yet) and the cut-off at the end barely affect the averages
  const LP = QUICK ? 120 : 400, LH = QUICK ? 300 : 400;
  const L = await longRun(LP, LH, 21, false);
  const C = await longRun(QUICK ? 60 : 200, LH, 22, true);
  const totalH = LP * LH;
  const gaps = (data, pred) => { const g = [], first = []; for (const p of data) { let last = 0, seen = false; for (const [i, t] of p.hits) if (pred(t)) { g.push((i - last) / SPH); if (!seen) first.push(i / SPH); seen = true; last = i; } } return { g, first }; };
  const hitsPerH = (data, pred, H) => data.reduce((a, p) => a + p.hits.filter(([, t]) => pred(t)).length, 0) / (data.length * H);
  const isB = t => t === 0, ge = v => t => M[t].prize >= v;
  const bG = gaps(L, isB), bC = gaps(C, isB);
  // the chance that a stretch of x hours of play (every whole-hour start in every player's run) has no hit
  const surv = (data, pred, x) => { let n = 0, dry = 0; for (const p of data) { const hs = p.hits.filter(([, t]) => pred(t)).map(([i]) => i / SPH); for (let w = 0; w + x <= LH; w++) { n++; if (!hs.some(h => h >= w && h < w + x)) dry++; } } return dry / Math.max(1, n); };
  console.log(`\nLONG RUN (jackpot roll at ${money(FULL)}: ${LP.toLocaleString('en-US')} players × ${LH} h = ${totalH.toLocaleString('en-US')} h, ${(totalH * SPH / 1e6).toFixed(0)}M spins)`);
  const rows = [['$1M+', ge(1e6)], ['$10M+', ge(1e7)], ['$100M+', ge(1e8)], ['$1B', isB]];
  for (const [name, pred] of rows) {
    const G = gaps(L, pred);
    console.log(`  ${name.padEnd(7)} ${hitsPerH(L, pred, LH).toFixed(4)}/h · average time between ${(1 / hitsPerH(L, pred, LH)).toFixed(1)} h · median gap ${q(G.g, 0.5).toFixed(1)} h · 90th ${q(G.g, 0.9).toFixed(1)} h · 99th ${q(G.g, 0.99).toFixed(1)} h · longest ${Math.max(...G.g).toFixed(1)} h`);
  }
  console.log('  per tier (hits/h vs target): ' + M.map((m, t) => m.prize >= 1e6 ? `${money(m.prize)} ${hitsPerH(L, x => x === t, LH).toFixed(4)}/${m.perH.toFixed(4)}` : null).filter(Boolean).join(' · '));
  console.log('  smaller tiers (hits/h vs target): ' + M.map((m, t) => m.prize < 1e6 ? `${money(m.prize)} ${(L.reduce((a, p) => a + p.small[t], 0) / totalH).toFixed(3)}/${m.perH}` : null).filter(Boolean).join(' · '));
  const bRate = hitsPerH(L, isB, LH), bMean = 1 / bRate;
  check('$1B: about one per 30 hours of play on average (28–32 h measured)', bMean > 28 && bMean < 32, `${bMean.toFixed(2)} h per $1B (${L.reduce((a, p) => a + p.hits.filter(([, t]) => t === 0).length, 0)} hits)`);
  const tierOk = M.every((m, t) => m.prize < 1e6 || Math.abs(hitsPerH(L, x => x === t, LH) / m.perH - 1) < 0.08);
  check('every $1M+ tier lands at its target long-run rate (±8%)', tierOk);
  const smallOk = M.every((m, t) => m.prize >= 1e6 || Math.abs(L.reduce((a, p) => a + p.small[t], 0) / totalH / m.perH - 1) < 0.05);
  check('every tier under $1M lands at its target long-run rate (±5%)', smallOk);
  const ladderOk = M.every((m, t) => !t || hitsPerH(L, x => x === t - 1, LH) <= hitsPerH(L, x => x === t, LH) * 1.08 || m.prize < 1e6);
  check('a bigger prize is never more common than a smaller one ($1M … $1B ladder)', ladderOk);

  // weeks of 7 hours and months of 30 hours, cut out of each player's run
  const windows = (data, W, pred) => { const counts = []; for (const p of data) for (let w = 0; w + W <= LH; w += W) counts.push(p.hits.filter(([i, t]) => pred(t) && i >= w * SPH && i < (w + W) * SPH).length); return counts; };
  const dist = c => { const n = c.length, f = k => c.filter(x => x === k).length / n; return { n, p0: f(0), p1: f(1), p2: f(2), p3: c.filter(x => x >= 3).length / n, mean: c.reduce((a, x) => a + x, 0) / n }; };
  const wk = dist(windows(L, 7, ge(1e6))), wk10 = dist(windows(L, 7, ge(1e7))), mo = dist(windows(L, 30, isB)), mo100 = dist(windows(L, 30, ge(1e8)));
  console.log(`\n7-HOUR WEEKS (${wk.n.toLocaleString('en-US')}): $1M+ jackpots per week: none ${pct(wk.p0)} · one ${pct(wk.p1)} · two ${pct(wk.p2)} · three or more ${pct(wk.p3)} · mean ${wk.mean.toFixed(2)}`);
  console.log(`  $10M+ per week: none ${pct(wk10.p0)} · one ${pct(wk10.p1)} · two+ ${pct(1 - wk10.p0 - wk10.p1)}`);
  const firstMo = L.map(p => p.hits.filter(([i, t]) => t === 0 && i < 30 * SPH).length), fm = firstMo.reduce((a, x) => a + x, 0) / firstMo.length;
  console.log(`FIRST 30 HOURS OF A FRESH SAVE (${L.length} players): $1B mean ${fm.toFixed(3)} · none ${pct(firstMo.filter(x => !x).length / L.length)} · two or more ${pct(firstMo.filter(x => x >= 2).length / L.length)}`);
  console.log(`30-HOUR MONTHS (${mo.n.toLocaleString('en-US')}): $1B jackpots: none ${pct(mo.p0)} · one ${pct(mo.p1)} · two ${pct(mo.p2)} · three or more ${pct(mo.p3)} · mean ${mo.mean.toFixed(3)}`);
  console.log(`  $100M+ per month: none ${pct(mo100.p0)} · one ${pct(mo100.p1)} · two ${pct(mo100.p2)} · three+ ${pct(mo100.p3)}`);
  check('7 hours of play: usually at least one $1M+ jackpot, but weeks with none, one and several all occur', wk.p0 > 0.02 && wk.p0 < 0.25 && wk.p1 > 0.1 && wk.p3 > 0.1, `none ${pct(wk.p0)} · one ${pct(wk.p1)} · 3+ ${pct(wk.p3)}`);
  check('30 hours of play: months with no $1B, one, two and three or more all occur naturally', mo.p0 > 0.05 && mo.p1 > 0.2 && mo.p2 > 0.05 && mo.p3 > 0.005, `0: ${pct(mo.p0)} · 1: ${pct(mo.p1)} · 2: ${pct(mo.p2)} · 3+: ${pct(mo.p3)}`);

  // the cases the brief asks to see happen (counted, never forced)
  let firstHourB = 0, sameHourBB = 0, b250After = 0, consecDays = 0, fastestBB = Infinity;
  for (const p of L) {
    const B = p.hits.filter(([, t]) => t === 0).map(([i]) => i), big = p.hits;
    if (B.length && B[0] < SPH) firstHourB++;
    for (let k = 1; k < B.length; k++) { fastestBB = Math.min(fastestBB, (B[k] - B[k - 1]) / SPH); if (Math.floor(B[k] / SPH) === Math.floor(B[k - 1] / SPH)) sameHourBB++; if (Math.floor(B[k] / SPH) === Math.floor(B[k - 1] / SPH) + 1) consecDays++; }
    for (const b of B) if (big.some(([i, t]) => t === 1 && i > b && i - b <= SPH)) b250After++;
  }
  console.log(`\nSEEN IN THE LONG RUN: $1B in the very first hour ${firstHourB} times (of ${LP} players, ${pct(firstHourB / LP)}) · two $1B in the same hour ${sameHourBB} · $1B on consecutive one-hour days ${consecDays} · a $250M within an hour after a $1B ${b250After} · shortest gap between two $1B ${(fastestBB * 60).toFixed(1)} min`);
  check('a $1B can land in the very first hour of play', firstHourB > 0, `${firstHourB} players`);
  check('two $1B jackpots close together happen (same hour, consecutive days)', sameHourBB > 0 && consecDays > 0, `${sameHourBB} / ${consecDays}`);
  check('a $250M can land right after a $1B (no lockout after a win)', b250After > 0, String(b250After));
  check('sessions with jackpots on back-to-back spins occur', sFull.b2b > 0, String(sFull.b2b));

  // ------------------------------------------------------------- 3. droughts and what the pressure does
  const meanC = bC.g.length ? 1 / hitsPerH(C, isB, LH) : NaN;
  const dr = [30, 60, 90].map(x => [x, surv(L, isB, x), surv(C, isB, x)]);
  console.log(`\nDROUGHTS ($1B): chance a stretch of play has no $1B — ${dr.map(([x, a, c]) => `${x} h: ${pct(a)} with pressure / ${pct(c)} without`).join(' · ')}`);
  console.log(`  without pressure the same base chance would give one $1B per ${meanC.toFixed(1)} h; the pressure brings it to ${bMean.toFixed(1)} h and cuts the 99th-percentile gap from ${q(bC.g, 0.99).toFixed(0)} h to ${q(bG.g, 0.99).toFixed(0)} h`);
  console.log(`  first $1B of a fresh player: median after ${q(bG.first, 0.5).toFixed(1)} h · 90% within ${q(bG.first, 0.9).toFixed(1)} h`);
  check('droughts get steadily less likely the longer they run (30 h > 60 h > 90 h)', dr[0][1] > dr[1][1] && dr[1][1] > dr[2][1] && dr[2][1] < 0.05, dr.map(d => pct(d[1])).join(' > '));
  check('drought pressure shortens the long dry runs (99th percentile gap lower than without it)', q(bG.g, 0.99) < q(bC.g, 0.99) * 0.8, `${q(bG.g, 0.99).toFixed(0)} h vs ${q(bC.g, 0.99).toFixed(0)} h`);
  check('long droughts stay possible (some gap over 1.5× the average was seen)', Math.max(...bG.g) > bMean * 1.5, `longest ${Math.max(...bG.g).toFixed(1)} h`);

  console.log(`\nroyale-sim: ${total - failures} / ${total} passed · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (failures) { console.log('FAILED'); process.exitCode = 1; } else console.log('ALL CHECKS PASSED');
}
