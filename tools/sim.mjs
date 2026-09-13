/* Headless balance telemetry for Block Stack.
   Drives the real engine with a timing-error player model and reports the
   numbers the design brief asks for: attempts per level, blocks reached,
   perfect frequency, remaining width, recovery frequency, clear rate. */

import { Game, PHASE, RHYTHMS } from '../block-stack/src/engine.js';
import { LEVELS, levelConfig } from '../block-stack/src/config.js';

const DT = 1 / 60;
const HORIZON = 0.45;

/* deterministic RNG so runs are reproducible */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function gauss(r) {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* Predict when the active block next crosses its target centre. */
function crossingIn(a, horizon) {
  let pos = a.pos, dir = a.dir, u = a.u, since = a.sweepsSinceScripted;
  const span = a.range * 2, lo = a.center - a.range, hi = a.center + a.range;
  const f = RHYTHMS[a.rhythm] || RHYTHMS.constant;
  let t = 0, prev = pos - a.center;
  while (t < horizon) {
    const step = a.speed * f(Math.min(1, Math.max(0, u))) * DT;
    pos += dir * step; u += step / span;
    if (a.rhythm === 'reverse' && u >= 0.62 && since >= 3) { dir *= -1; u = 0; since = 0; }
    if (pos <= lo) { pos = lo + (lo - pos); dir = 1; u = 0; since++; }
    else if (pos >= hi) { pos = hi - (pos - hi); dir = -1; u = 0; since++; }
    t += DT;
    const cur = pos - a.center;
    if (prev === 0 || (prev < 0) !== (cur < 0)) return t;
    prev = cur;
  }
  return null;
}

function playLevel(cfg, sigma, r, maxSeconds = 420) {
  const g = new Game(cfg);
  let scheduled = null;
  let t = 0;
  while (g.phase !== PHASE.OVER && g.phase !== PHASE.COMPLETE && t < maxSeconds) {
    if (g.phase === PHASE.ENDLESS && g.endlessBlocks >= 6) { g.finish(); break; }
    if (g.active && scheduled === null) {
      const tc = crossingIn(g.active, HORIZON);
      if (tc !== null) {
        const panic = r() < 0.015 ? 3.5 : 1;
        scheduled = t + tc + gauss(r) * sigma * panic;
      }
    }
    if (scheduled !== null && t >= scheduled) { g.place(); scheduled = null; }
    g.update(DT);
    g.drain();
    t += DT;
  }
  return { s: g.summary(), seconds: t };
}

/* Timing-error tiers. Coincidence-anticipation timing against predictable
   motion sits around 20-50 ms SD for humans; skilled action-game players are at
   the low end, first-timers well above it. */
const TIERS = [
  { name: 'casual', sigma: 0.075 },
  { name: 'good', sigma: 0.045 },
  { name: 'expert', sigma: 0.026 }
];

/* The honest measure of the intended experience: one player who gets better as
   they play, rather than a fixed skill level judged at level 90. */
const journeySigma = (n) => 0.075 + (0.036 - 0.075) * Math.min(1, (n - 1) / 62);
const RUNS = 220;

const rows = [];
for (const lvl of LEVELS) {
  const row = { n: lvl.num, boss: lvl.boss };
  for (const tier of TIERS.concat([{ name: 'journey', sigma: journeySigma(lvl.num) }])) {
    const r = rng(9781 + lvl.num * 131);
    let clears = 0, attempts = 0, blocks = 0, perfects = 0, placed = 0,
        remain = 0, recov = 0, secs = 0, crowns3 = 0;
    for (let i = 0; i < RUNS; i++) {
      const { s, seconds } = playLevel(lvl, tier.sigma, r);
      attempts++;
      blocks += s.placed; placed += s.placed; perfects += s.perfects;
      recov += s.recoveries; secs += seconds;
      if (s.cleared) { clears++; remain += s.remainingPct; if (s.crowns === 3) crowns3++; }
    }
    row[tier.name] = {
      clear: clears / attempts,
      attemptsPerClear: clears ? attempts / clears : Infinity,
      avgBlocks: blocks / attempts,
      perfectRate: placed ? perfects / placed : 0,
      remain: clears ? remain / clears : 0,
      recovPerRun: recov / attempts,
      crown3: crowns3 / attempts,
      secs: secs / attempts
    };
  }
  rows.push(row);
}

const pct = (v) => (v * 100).toFixed(0) + '%';
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '--');
console.log('lvl  boss | casual clear  att/clear | good clear  att/clear  perf%  remain | expert clear att/clear perf%  3crown | journey att/clear 3crown blocks recov');
for (const r of rows) {
  if (!(r.n % 5 === 0 || r.n <= 6 || r.boss)) continue;
  console.log(
    String(r.n).padStart(3), r.boss ? 'BOSS' : '    ', '|',
    pct(r.casual.clear).padStart(5), f2(r.casual.attemptsPerClear).padStart(8), '   |',
    pct(r.good.clear).padStart(5), f2(r.good.attemptsPerClear).padStart(8),
    pct(r.good.perfectRate).padStart(6), pct(r.good.remain).padStart(7), '|',
    pct(r.expert.clear).padStart(5), f2(r.expert.attemptsPerClear).padStart(8),
    pct(r.expert.perfectRate).padStart(6), pct(r.expert.crown3).padStart(7), '|',
    pct(r.journey.clear).padStart(6), f2(r.journey.attemptsPerClear).padStart(8),
    pct(r.journey.crown3).padStart(7),
    r.journey.avgBlocks.toFixed(1).padStart(6), r.journey.recovPerRun.toFixed(2).padStart(6)
  );
}

/* Fairness guards — spikes are a bug, not difficulty. */
const bad = [];
for (let i = 1; i < rows.length; i++) {
  const a = rows[i - 1].journey.attemptsPerClear, b = rows[i].journey.attemptsPerClear;
  if (Number.isFinite(a) && Number.isFinite(b) && b > a * 2.1 && b > 2.2 && !rows[i].boss)
    bad.push(`spike at L${rows[i].n}: ${f2(a)} -> ${f2(b)} attempts/clear`);
}
for (const r of rows) {
  if (r.n <= 6 && r.casual.clear < 0.70) bad.push(`L${r.n} too hard for a first-timer (casual clear ${pct(r.casual.clear)})`);
  /* Shrink-vs-recovery is a bifurcation: above the equilibrium perfect rate a
     run is near-certain, below it near-hopeless. Clear rate on ordinary levels
     is therefore a blunt instrument -- they are practice grounds, and the real
     late-game progression is the crown chase. Guard that instead. */
  if (r.n >= 55 && !r.boss && r.journey.crown3 > 0.80)
    bad.push(`L${r.n} hands out 3 crowns too freely (${pct(r.journey.crown3)})`);
  const cap = r.boss ? 9 : 4.5;
  if (r.journey.attemptsPerClear > cap)
    bad.push(`L${r.n}${r.boss ? ' BOSS' : ''} grind: ${f2(r.journey.attemptsPerClear)} attempts/clear for a player who has played this far (cap ${cap})`);
  // Experts are meant to clear ordinary late levels; crowns are where they compete.
  if (r.n >= 90 && r.expert.crown3 > 0.85) bad.push(`L${r.n} 3-crown too easy for an expert (${pct(r.expert.crown3)})`);
  if (r.boss && r.n <= 10 && r.casual.clear < 0.35) bad.push(`L${r.n} boss walls new players (casual ${pct(r.casual.clear)})`);
  if (r.good.secs > 95) bad.push(`L${r.n} run length ${r.good.secs.toFixed(0)}s is too long`);
}
console.log('\nmonotonic difficulty check:', bad.length ? '\n  - ' + bad.join('\n  - ') : 'OK');
console.log('L100 expert clear:', pct(rows[99].expert.clear),
  '| L100 journey att/clear:', f2(rows[99].journey.attemptsPerClear),
  '| L1 casual clear:', pct(rows[0].casual.clear));
const worst = rows.reduce((a, b) => (b.journey.attemptsPerClear > a.journey.attemptsPerClear ? b : a));
console.log('hardest level for the journey player: L' + worst.n, f2(worst.journey.attemptsPerClear), 'attempts/clear');
