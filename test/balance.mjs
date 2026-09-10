/*
 * Block Stack 3D - difficulty balance simulation.
 *
 * Plays thousands of runs with a modelled human player to prove the curve is
 * hard but honest: early levels forgiving, late levels brutal, nothing
 * mathematically impossible.
 *
 * The player model is a timing error drawn from a normal distribution. Real
 * human tap timing has a standard deviation of roughly 20-30 ms for a trained
 * player on a rhythmic target and 60-90 ms for a casual one, so the positional
 * error is (timing error x current slide speed), scaled by the level's velocity
 * modulation because a swaying block is harder to predict.
 *
 *   node test/balance.mjs            # assert the curve, print a report
 *   node test/balance.mjs --quiet    # assert only
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require2 = createRequire(import.meta.url);
const L = require2('../src/logic.js');
const QUIET = process.argv.includes('--quiet');

/* deterministic RNG so the report is reproducible */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Play one run.
 * @param level level number
 * @param sigma player timing standard deviation, seconds
 * @param rand  rng
 * @param maxDrops stop after this many successful stacks
 * @returns {{height:number, cleared:boolean, perfects:number, recoveries:number}}
 */
function simulate(level, sigma, rand, maxDrops) {
  const cfg = L.levelConfig(level);
  const goal = cfg.isBoss ? cfg.bossTarget : cfg.goal;
  const cap = maxDrops || goal;
  let sizeX = cfg.baseSize, sizeZ = cfg.baseSize;
  let posX = 0, posZ = 0;
  let height = 0, streak = 0, perfects = 0, recoveries = 0;

  while (height < cap) {
    const horiz = height % 2 === 0;
    const size = horiz ? sizeX : sizeZ;
    const anchor = horiz ? posX : posZ;
    const speed = L.speedAt(cfg, height);

    // a swaying block is moving at an unpredictable speed at the moment of the
    // tap, so the same timing error translates into a larger positional error
    const swayFactor = 1 + cfg.sway * (rand() * 2 - 1);
    const err = gauss(rand) * sigma * speed * swayFactor;

    const r = L.resolveDrop({
      movingPos: anchor + err, movingSize: size,
      anchorPos: anchor, anchorSize: size,
      perfectTol: cfg.perfectTol, minSize: cfg.minSize
    });
    if (r.missed) return { height, cleared: false, perfects, recoveries };

    if (horiz) { sizeX = r.size; posX = r.pos; } else { sizeZ = r.size; posZ = r.pos; }
    height++;

    if (r.perfect) {
      streak++; perfects++;
      if (streak % L.RECOVERY_STREAK === 0) {
        const rec = L.applyRecovery(sizeX, sizeZ, cfg.baseSize);
        if (rec.gained) recoveries++;
        sizeX = rec.x; sizeZ = rec.z;
      }
    } else {
      streak = 0;
    }
  }
  return { height, cleared: height >= goal, perfects, recoveries };
}

function trial(level, sigma, runs, seed) {
  const rand = rng(seed || (level * 7919 + Math.round(sigma * 1e5)));
  let wins = 0, heightSum = 0, perfSum = 0, recSum = 0, dropSum = 0;
  for (let i = 0; i < runs; i++) {
    const r = simulate(level, sigma, rand);
    if (r.cleared) wins++;
    heightSum += r.height; perfSum += r.perfects; recSum += r.recoveries;
    dropSum += r.height;
  }
  return {
    clearRate: wins / runs,
    avgHeight: heightSum / runs,
    perfectRate: dropSum ? perfSum / dropSum : 0,
    avgRecoveries: recSum / runs
  };
}

const PLAYERS = [
  { name: 'expert  (σ 25ms)', sigma: 0.025 },
  { name: 'good    (σ 45ms)', sigma: 0.045 },
  { name: 'casual  (σ 75ms)', sigma: 0.075 }
];

const RUNS = 2000;
const results = {};
for (const p of PLAYERS) {
  results[p.name] = {};
  for (const lvl of [1, 5, 10, 15, 25, 35, 45, 50, 65, 75, 85, 90, 95, 99, 100]) {
    results[p.name][lvl] = trial(lvl, p.sigma, RUNS);
  }
}

if (!QUIET) {
  console.log('\nClear rate by level (' + RUNS + ' simulated runs each)\n');
  const levels = Object.keys(results[PLAYERS[0].name]).map(Number);
  console.log('player'.padEnd(18) + levels.map(l => (L.isBossLevel(l) ? '*' : '') + l).map(s => s.padStart(6)).join(''));
  for (const p of PLAYERS) {
    console.log(p.name.padEnd(18) +
      levels.map(l => (results[p.name][l].clearRate * 100).toFixed(0).padStart(5) + '%').join(''));
  }
  console.log('\n(* = boss level, must be climbed in one unbroken run)\n');
  console.log('Expert detail:');
  for (const l of [1, 25, 50, 75, 99, 100]) {
    const r = results['expert  (σ 25ms)'][l];
    const c = L.levelConfig(l);
    console.log(`  L${String(l).padStart(3)}  ${c.isBoss ? 'boss' : 'norm'}  window ${(c.perfectWindow * 1000).toFixed(0)}ms` +
      `  perfect-drop rate ${(r.perfectRate * 100).toFixed(0)}%` +
      `  avg height ${r.avgHeight.toFixed(1)}/${c.isBoss ? c.bossTarget : c.goal}` +
      `  refunds/run ${r.avgRecoveries.toFixed(1)}` +
      `  clear ${(r.clearRate * 100).toFixed(1)}%`);
  }
  console.log('');
}

/* ---------------------------------------------------------------- *
 * assertions: the curve must be fair early, brutal late, never impossible
 * ---------------------------------------------------------------- */
const fails = [];
const check = (cond, msg) => { if (!cond) fails.push(msg); };
const R = (player, lvl) => results[player][lvl];
const EXPERT = 'expert  (σ 25ms)', GOOD = 'good    (σ 45ms)', CASUAL = 'casual  (σ 75ms)';

check(R(CASUAL, 1).clearRate > 0.85, `level 1 must be easy for a casual player (got ${(R(CASUAL, 1).clearRate * 100).toFixed(0)}%)`);
check(R(CASUAL, 5).clearRate > 0.70, 'level 5 stays friendly for a casual player');
check(R(GOOD, 15).clearRate > 0.80, 'level 15 is comfortable for a decent player');
check(R(GOOD, 10).clearRate > 0.55, 'the first boss is a fair test, not a wall');
check(R(EXPERT, 25).clearRate > 0.85, 'level 25 is routine for an expert');

/* difficulty must actually rise */
check(R(GOOD, 75).clearRate < R(GOOD, 25).clearRate, 'level 75 is harder than level 25');
check(R(EXPERT, 99).clearRate < R(EXPERT, 45).clearRate, 'level 99 is harder than level 45');
check(R(CASUAL, 90).clearRate < 0.25, 'boss 90 is not a casual walkover');

/* ... but nothing may be impossible or a coin flip at the very end */
check(R(GOOD, 99).clearRate > 0.05, `level 99 must be beatable by a good player (got ${(R(GOOD, 99).clearRate * 100).toFixed(1)}%)`);
check(R(GOOD, 99).clearRate < 0.70, `level 99 must be a real test for a good player (got ${(R(GOOD, 99).clearRate * 100).toFixed(1)}%)`);
// a normal level is only 5-19 drops, so an expert should clear it; the tower
// still has to shrink under them, or the level is not asking anything
check(R(EXPERT, 99).perfectRate < 0.72, `level 99 must break an expert's perfect streaks (got ${(R(EXPERT, 99).perfectRate * 100).toFixed(0)}%)`);
check(R(EXPERT, 100).clearRate > 0.02, `boss 100 must be possible (got ${(R(EXPERT, 100).clearRate * 100).toFixed(2)}%)`);
check(R(EXPERT, 100).clearRate < 0.60, 'boss 100 must be a genuine achievement');
check(R(EXPERT, 90).clearRate > 0.02, 'boss 90 must be possible for an expert');
check(R(EXPERT, 50).clearRate > 0.15, 'boss 50 must be a realistic target for an expert');
check(R(GOOD, 100).clearRate < 0.35, 'boss 100 is the hardest thing in the game');

/* the recovery mechanic has to be doing real work in the late game */
check(R(EXPERT, 100).avgRecoveries > 3, `recovery matters on long boss climbs (got ${R(EXPERT, 100).avgRecoveries.toFixed(1)} per run)`);
check(R(EXPERT, 1).avgRecoveries < 1.5, 'recovery is not spammed on easy levels');

/* Normal levels must not spike: neighbouring normal levels stay comparable.
 * (Boss levels are deliberately a different kind of test - a survival climb of
 * N consecutive drops - so they are checked separately below.) */
for (const [a, b] of [[25, 35], [35, 45], [45, 65], [65, 75], [75, 85], [85, 95], [95, 99]]) {
  const ra = R(GOOD, a).clearRate, rb = R(GOOD, b).clearRate;
  check(!(ra > 0.5 && rb < ra * 0.15),
    `no difficulty spike between normal levels ${a} (${(ra * 100).toFixed(0)}%) and ${b} (${(rb * 100).toFixed(0)}%)`);
}

/* The boss ladder must only ever get harder, and every rung must be reachable.
 * A boss asks for N drops in an unbroken run, so its difficulty compounds by
 * design - that is the point of a boss, not a spike. */
const bossLadder = [10, 50, 90, 100];
for (let i = 1; i < bossLadder.length; i++) {
  const prev = R(EXPERT, bossLadder[i - 1]).clearRate, cur = R(EXPERT, bossLadder[i]).clearRate;
  check(cur <= prev + 0.02, `boss ${bossLadder[i]} is at least as hard as boss ${bossLadder[i - 1]}`);
}
for (const b of bossLadder) check(R(EXPERT, b).clearRate > 0.02, `boss ${b} is reachable for an expert`);

/* A boss is a harder test than the normal levels it sits next to */
check(R(CASUAL, 50).clearRate < R(CASUAL, 45).clearRate, 'boss 50 is a step up from level 45');
check(R(GOOD, 90).clearRate < R(GOOD, 85).clearRate, 'boss 90 is a step up from level 85');

if (fails.length) {
  console.log('BALANCE FAILURES:');
  fails.forEach((f, i) => console.log(`${i + 1}. ${f}`));
  process.exit(1);
}
console.log(`Balance OK — ${PLAYERS.length * 15} scenarios, ${RUNS} runs each.`);
