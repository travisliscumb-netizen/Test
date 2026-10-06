/* Difficulty-curve test for Crimson Realm. A fixed-skill reference player
   fights the CPU at every ladder level with exactly the modifiers the game
   applies. Passing means: level 1 is near-unlosable, the curve climbs
   steadily (no cliffs), and the late ladder is genuinely hard.          */

import { Match, rng32 } from '../crimson-realm/src/engine.js';
import { AI } from '../crimson-realm/src/ai.js';
import { difficultyFor, opponentFor, FIGHTERS, ROSTER, BOSS_ID } from '../crimson-realm/src/config.js';

const N = Number(process.env.N || 24);
const LEVELS = Array.from({ length: 16 }, (_, i) => i + 1);
/* The reference "player": a decent human. Pinned numbers, deliberately not
   derived from difficultyFor(), so retuning the curve cannot move the
   yardstick it is measured with. */
const REF = {
  reaction: 30, think: 33, aggression: 0.34, block: 0.28, antiAir: 0.26, punish: 0.27,
  combo: 0.35, special: 0.13, lows: 0.21, whiff: 0.3, finisher: 0.5
};
let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); if (!ok) failures++; };

function fight(player, level, seed) {
  const opp = opponentFor(player, level);
  const diff = difficultyFor(level, 0, opp === BOSS_ID);
  const m = new Match({
    p1: player, p2: opp, seed, p1Mods: { dmgIn: diff.aiDamage },
    p2Mods: { dmgIn: diff.playerDamage, speedMul: FIGHTERS[opp].speed * diff.speed }
  });
  const a = new AI(REF, rng32(seed * 3 + 1)), b = new AI(diff, rng32(seed * 5 + 2));
  let t = 0;
  while (!m.over && t < 60 * 60 * 10) { m.update(a.update(m.fighters[0], m), b.update(m.fighters[1], m)); m.drain(); t++; }
  const mine = m.fighters[0].hp / m.fighters[0].maxHp, theirs = m.fighters[1].hp / m.fighters[1].maxHp;
  return { won: m.winner === m.fighters[0], over: m.over, hpLeft: mine, margin: mine - theirs };
}

const rows = [];
let stuck = 0;
for (const L of LEVELS) {
  let wins = 0, hp = 0, margin = 0;
  for (let i = 0; i < N; i++) {
    const r = fight(ROSTER[i % ROSTER.length], L, 1000 * L + i);
    if (!r.over) stuck++;
    wins += r.won ? 1 : 0;
    hp += r.won ? r.hpLeft : 0;
    margin += r.margin;
  }
  rows.push({ L, rate: wins / N, hp: hp / Math.max(1, wins), margin: margin / N });
  console.log(`level ${String(L).padStart(2)}  ref win rate ${(wins / N * 100).toFixed(0).padStart(3)}%  avg health left when winning ${(hp / Math.max(1, wins) * 100).toFixed(0)}%`);
}

check('every match finishes', stuck === 0, `${stuck} stuck`);
check('level 1 is easy (ref wins >= 95%)', rows[0].rate >= 0.95, `${(rows[0].rate * 100).toFixed(0)}%`);
check('level 16 is hard (ref wins <= 35%)', rows[15].rate <= 0.35, `${(rows[15].rate * 100).toFixed(0)}%`);
// smooth: smoothed curve never rises meaningfully, and no single-level cliff
const smooth = rows.map((r, i) => (rows[Math.max(0, i - 1)].rate + r.rate + rows[Math.min(rows.length - 1, i + 1)].rate) / 3);
let rises = 0, cliff = 0;
for (let i = 1; i < smooth.length; i++) { if (smooth[i] > smooth[i - 1] + 0.06) rises++; cliff = Math.max(cliff, smooth[i - 1] - smooth[i]); }
check('difficulty climbs monotonically (smoothed)', rises === 0, `${rises} reversals`);
check('no difficulty cliff between levels (< 25 pts)', cliff < 0.25, `largest drop ${(cliff * 100).toFixed(0)} pts`);
// Spearman correlation between level and the final health margin (my health
// minus theirs). Win rate alone saturates at 100% over the deliberately easy
// opening levels, and those ties cap a win-rate correlation even when every
// level is harder than the last; the margin keeps measuring it.
const rank = (a) => a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]).reduce((r, [, i], k) => (r[i] = k, r), []);
const rl = rank(rows.map((r) => r.L)), rw = rank(rows.map((r) => r.margin));
const n = rows.length;
const rho = 1 - (6 * rl.reduce((s, v, i) => s + (v - rw[i]) ** 2, 0)) / (n * (n * n - 1));
console.log('health margin by level:', rows.map((r) => (r.margin * 100).toFixed(0)).join(' '));
check('every level harder than the last: level vs health margin (rho < -0.85)', rho < -0.85, `rho ${rho.toFixed(2)}`);
// mercy: losses ease the same level
const base = difficultyFor(8, 0), eased = difficultyFor(8, 3);
check('mercy eases a level after repeated losses', eased.d < base.d && eased.aiDamage < base.aiDamage, `d ${base.d.toFixed(2)} -> ${eased.d.toFixed(2)}`);
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
