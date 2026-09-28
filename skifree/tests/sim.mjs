// Headless test suite: drives the real simulation modules (no browser).
//   node tests/sim.mjs            full run
//   node tests/sim.mjs --quick    fewer seeds
import { CONFIG, METER, toKmh } from '../src/config.js';
import { OBJECTS } from '../src/objects.js';
import { World } from '../src/world.js';
import { Game } from '../src/game.js';
import { autopilot } from '../src/autopilot.js';
import { sanitize, Save } from '../src/save.js';
import { Rng } from '../src/rng.js';

const QUICK = process.argv.includes('--quick');
let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}
const STEP = CONFIG.SIM_STEP;

function collect(world, x0, y0, x1, y1) {
  const out = [];
  const S = CONFIG.CHUNK_SIZE;
  for (let cy = Math.floor(y0 / S); cy <= Math.floor(y1 / S); cy++) {
    for (let cx = Math.floor(x0 / S); cx <= Math.floor(x1 / S); cx++) out.push(...world.generateChunk(cx, cy).objects);
  }
  return out;
}

// ------------------------------------------------------------ world: determinism
{
  const a = new World(123), b = new World(123), c = new World(124);
  const order = [];
  for (let cy = -1; cy < 12; cy++) for (let cx = -4; cx <= 4; cx++) order.push([cx, cy]);
  const sig = (w, list) => list.map(([cx, cy]) => w.chunk(cx, cy).objects.map((o) => `${o.t}@${o.x.toFixed(2)},${o.y.toFixed(2)}`).join('|'));
  const sa = sig(a, order);
  const sb = sig(b, [...order].reverse()).reverse();
  const sc = sig(c, order);
  check('world is deterministic for a seed, in any generation order', JSON.stringify(sa) === JSON.stringify(sb));
  check('different seeds make different worlds', JSON.stringify(sa) !== JSON.stringify(sc));
  // Evict and regenerate.
  const w = new World(55);
  const before = sig(w, order);
  w.chunks.clear();
  w.regions.clear();
  check('evicted chunks regenerate identically', JSON.stringify(before) === JSON.stringify(sig(w, order)));
}

// --------------------------------------------------- world: spacing + no walls
{
  const seeds = QUICK ? [1, 2] : [1, 2, 3, 4, 5, 6, 7, 8];
  let minGap = Infinity, worst = null, count = 0, overlaps = 0;
  const skier = CONFIG.COLLISION_RADIUS * 2;
  for (const seed of seeds) {
    const w = new World(seed);
    const objs = collect(w, -4000, -600, 4000, QUICK ? 12000 : 30000).filter((o) => OBJECTS[o.t].solid);
    count += objs.length;
    const grid = new Map();
    const key = (x, y) => `${Math.floor(x / 64)},${Math.floor(y / 64)}`;
    for (const o of objs) {
      const k = key(o.x, o.y);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(o);
    }
    for (const o of objs) {
      const gx = Math.floor(o.x / 64), gy = Math.floor(o.y / 64);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        for (const q of grid.get(`${gx + dx},${gy + dy}`) || []) {
          if (q === o) continue;
          const gap = Math.hypot(q.x - o.x, q.y - o.y) - OBJECTS[o.t].r - OBJECTS[q.t].r;
          if (gap < 0) overlaps++;
          if (gap < minGap) {
            minGap = gap;
            worst = `${o.t}@(${o.x | 0},${o.y | 0}) vs ${q.t}@(${q.x | 0},${q.y | 0}) seed ${seed}`;
          }
        }
      }
    }
  }
  check(`every gap between solid objects fits the skier (${skier}u)`, minGap >= skier, `min gap ${minGap.toFixed(1)}u over ${count} objects; tightest ${worst}`);
  check('no two solid objects overlap', overlaps === 0, `${overlaps} overlaps`);
}

// -------------------------------------------------- world: start area + path BFS
{
  let bad = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const w = new World(seed);
    for (const o of collect(w, -600, -600, 600, 900)) {
      const def = OBJECTS[o.t];
      if (def.hit === 'none') continue;
      if (Math.abs(o.x) < 60 && o.y > -60 && o.y < 400) bad++;
    }
  }
  check('start corridor is clear', bad === 0, `${bad} objects in the opening lane`);

  // Rasterise solid footprints (inflated by the skier's radius) and flood-fill
  // from the top of a band to the bottom. Any fully blocked row fails.
  const cell = 2;
  const W = 1400, H = QUICK ? 5000 : 12000;
  let blockedSeeds = [];
  for (const seed of QUICK ? [11, 12] : [11, 12, 13, 14]) {
    const w = new World(seed);
    const x0 = -700, y0 = 600;
    const cols = W / cell, rows = H / cell;
    const grid = new Uint8Array(cols * rows);
    for (const o of collect(w, x0 - 40, y0 - 40, x0 + W + 40, y0 + H + 40)) {
      const def = OBJECTS[o.t];
      if (!def.solid) continue;
      const r = def.r + CONFIG.COLLISION_RADIUS - 0.5;
      const c0 = Math.max(0, Math.floor((o.x - r - x0) / cell)), c1 = Math.min(cols - 1, Math.floor((o.x + r - x0) / cell));
      const r0 = Math.max(0, Math.floor((o.y - r - y0) / cell)), r1 = Math.min(rows - 1, Math.floor((o.y + r - y0) / cell));
      for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
        const cx = x0 + (cc + 0.5) * cell, cy = y0 + (rr + 0.5) * cell;
        if (Math.hypot(cx - o.x, cy - o.y) < r) grid[rr * cols + cc] = 1;
      }
    }
    const seen = new Uint8Array(cols * rows);
    const q = new Int32Array(cols * rows);
    let qh = 0, qt = 0;
    for (let cc = 0; cc < cols; cc++) if (!grid[cc]) { seen[cc] = 1; q[qt++] = cc; }
    let reached = false;
    while (qh < qt) {
      const i = q[qh++];
      const rr = (i / cols) | 0, cc = i % cols;
      if (rr === rows - 1) { reached = true; break; }
      for (const [dr, dc] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) {
        const nr = rr + dr, nc = cc + dc;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
        const j = nr * cols + nc;
        if (!seen[j] && !grid[j]) { seen[j] = 1; q[qt++] = j; }
      }
    }
    if (!reached) blockedSeeds.push(seed);
  }
  check('a skiable path always exists top to bottom', blockedSeeds.length === 0, blockedSeeds.length ? `blocked: ${blockedSeeds}` : `${W}x${H}u bands`);
}

// ---------------------------------------------------------- generation speed
{
  const w = new World(9);
  const t0 = performance.now();
  let n = 0;
  for (let cy = 0; cy < 60; cy++) for (let cx = -3; cx <= 3; cx++) { w.generateChunk(cx, cy); n++; }
  const ms = (performance.now() - t0) / n;
  check('chunk generation is cheap (< 2 ms / chunk)', ms < 2, `${ms.toFixed(3)} ms per chunk`);
}

// -------------------------------------------------------------- helpers
function run(game, seconds, brain) {
  const log = [];
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n && !game.over; i++) {
    game.update(STEP, brain(game, i));
    for (const e of game.events) log.push({ ...e, t: game.time });
    game.events.length = 0;
  }
  return log;
}
const idle = () => ({});
const finite = (g) => [g.player.x, g.player.y, g.player.speed, g.player.heading, g.camX, g.camY].every(Number.isFinite);

// ------------------------------------------------ long bot runs: no stalls
{
  const seeds = QUICK ? [21, 22] : [21, 22, 23, 24, 25, 26];
  let stalls = 0, nan = 0, worstActors = 0, worstChunks = 0, totalDist = 0, totalTime = 0, hits = 0;
  let stepMs = 0, steps = 0;
  for (const seed of seeds) {
    const g = new Game({ seed, demo: true }); // no yeti: pure skiing
    g.setViewSize(1100, 640);
    let lastD = 0, window = 0;
    const secs = QUICK ? 120 : 300;
    for (let i = 0; i < secs / STEP; i++) {
      const t0 = performance.now();
      g.update(STEP, autopilot(g, { skill: 0.9, turbo: 'never' }));
      stepMs += performance.now() - t0;
      steps++;
      g.events.length = 0;
      window += STEP;
      if (window >= 20) {
        if (g.stats.distance - lastD < 60) stalls++;
        lastD = g.stats.distance;
        window = 0;
      }
      if (!finite(g)) { nan++; break; }
      worstActors = Math.max(worstActors, g.actors.length);
      worstChunks = Math.max(worstChunks, g.world.chunks.size);
    }
    totalDist += g.stats.distance;
    totalTime += g.time;
    hits += g.stats.hits;
  }
  check('bot never stalls (>= 60 m every 20 s)', stalls === 0, `${stalls} stalls; avg ${(totalDist / totalTime).toFixed(1)} m/s, ${hits} hits over ${(totalDist / 1000).toFixed(1)} km`);
  check('state stays finite', nan === 0);
  check('actors stay bounded', worstActors < 150, `peak ${worstActors}`);
  check('generated chunks stay bounded', worstChunks < 150, `peak ${worstChunks}`);
  check('simulation step is cheap (< 0.25 ms)', stepMs / steps < 0.25, `${(stepMs / steps).toFixed(4)} ms per step`);
}

// ---------------------------------------------------------- the player
{
  // Straight down, no input: reaches cruising speed, never exceeds it.
  const g = new Game({ seed: 3, demo: true });
  const p = g.player;
  let top = 0;
  for (let i = 0; i < 6 / STEP; i++) {
    g.update(STEP, { up: true });
    g.events.length = 0;
    p.grace = 1; // ghost everything: we're measuring pure physics
    top = Math.max(top, p.speed);
  }
  check('cruising speed tops out at PLAYER_SPEED', Math.abs(top - CONFIG.PLAYER_SPEED) < 1, `${toKmh(top).toFixed(1)} km/h`);
  let t2 = 0;
  for (let i = 0; i < 6 / STEP; i++) {
    g.update(STEP, { turbo: true, up: true });
    g.events.length = 0;
    p.grace = 1;
    t2 = Math.max(t2, p.speed);
  }
  check('turbo reaches TURBO_SPEED', Math.abs(t2 - CONFIG.TURBO_SPEED) < 1, `${toKmh(t2).toFixed(1)} km/h`);

  // Turn rate falls with speed.
  const turnAt = (speed, turbo) => {
    const h = new Game({ seed: 3, demo: true });
    h.player.speed = speed;
    h.player.grace = 5;
    h.update(0.1, { right: true, turbo });
    return h.player.heading;
  };
  check('steering is harder at speed, hardest on turbo', turnAt(40) > turnAt(240) && turnAt(240) > turnAt(380, true), `${turnAt(40).toFixed(3)} > ${turnAt(240).toFixed(3)} > ${turnAt(380, true).toFixed(3)} rad per 0.1 s`);

  // Across the hill: stop, then sidestep.
  const s = new Game({ seed: 3, demo: true });
  s.player.grace = 99;
  run(s, 3, () => ({ left: true }));
  const x0 = s.player.x;
  run(s, 1, () => ({ left: true }));
  check('pointing across the hill stops you, then you can sidestep', s.player.speed < 5 && s.player.x < x0 - 20, `speed ${s.player.speed.toFixed(1)}, walked ${(x0 - s.player.x).toFixed(0)}u`);

  // Brake.
  const b = new Game({ seed: 3, demo: true });
  b.player.grace = 99;
  b.player.speed = 240;
  run(b, 1.2, () => ({ down: true }));
  check('braking scrubs speed', b.player.speed < 120, `${toKmh(b.player.speed).toFixed(0)} km/h after 1.2 s`);

  // Hop clears a small rock but not a tree.
  const j = new Game({ seed: 3, demo: true });
  let peak = 0, air = 0;
  j.update(STEP, { jump: false });
  const log = run(j, 1, (g) => {
    peak = Math.max(peak, g.player.z);
    if (g.player.state === 'air') air += STEP;
    return { jump: true };
  });
  check('space hop gives a short, readable hop', peak > OBJECTS.rock_l.h && peak < OBJECTS.snowman.h + 5 && air > 0.3 && air < 0.6, `peak ${peak.toFixed(1)}u, ${air.toFixed(2)} s air`);
  check('holding space does not bunny-hop', log.filter((e) => e.type === 'jump').length === 1);
}

// ----------------------------------------------------- collisions recover
{
  // Aim a skier straight at a tree and do nothing: must never be trapped.
  const g = new Game({ seed: 3, demo: true });
  const p = g.player;
  const tree = { id: 999999, t: 'tree_l', x: p.x, y: p.y + 120, v: 0, state: 0, timer: 0 };
  g.world.chunk(0, 0).objects.push(tree);
  const log = run(g, 8, idle);
  // Only count impacts with this tree; the slope below has its own.
  const crashes = log.filter((e) => e.type === 'hit' && Math.hypot(e.x - tree.x, e.y - tree.y) < 40).length;
  check('hitting a tree knocks you down briefly', crashes >= 1 && log.find((e) => e.type === 'hit').obj === 'tree_l');
  check('a skier who does nothing is never trapped by one tree', crashes === 1 && p.y > tree.y + 100, `${crashes} crashes, now ${(p.y - tree.y).toFixed(0)}u past it`);
  const down = log.find((e) => e.type === 'hit').t;
  // Time from impact until skiing again.
  const g2 = new Game({ seed: 3, demo: true });
  g2.world.chunk(0, 0).objects.push({ ...tree });
  let hitAt = null, upAt = null;
  run(g2, 5, (gg) => {
    if (hitAt === null && gg.player.state === 'crash') hitAt = gg.time;
    if (hitAt !== null && upAt === null && gg.player.state === 'ski') upAt = gg.time;
    return {};
  });
  check('crash recovery is quick (< 1.8 s)', upAt !== null && upAt - hitAt < 1.8, `${(upAt - hitAt).toFixed(2)} s down (hit at ${down.toFixed(2)} s)`);
}

// -------------------------------------------------------------- the yeti
function yetiTrial(seed, brain, at = 30) {
  const g = new Game({ seed });
  g.setViewSize(1100, 640);
  g.nextYetiAt = at; // skip the 2 km warm-up
  let spawnT = null, caughtT = null;
  const log = run(g, 120, (gg, i) => brain(gg, i));
  for (const e of log) {
    if (e.type === 'yeti' && spawnT === null) spawnT = e.t;
    if (e.type === 'caught') caughtT = e.t;
  }
  return { g, log, spawnT, caughtT, escapes: g.stats.yetiEscapes };
}
{
  const seeds = QUICK ? [31, 32, 33, 34] : [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42];
  // 1. Standing still: eaten fast.
  const still = seeds.map((s) => yetiTrial(s, () => ({ left: true }), 0));
  const stillOk = still.every((r) => r.caughtT !== null && r.caughtT - r.spawnT < 25);
  check('a skier who stops gets eaten', stillOk, still.map((r) => (r.caughtT === null ? 'never' : (r.caughtT - r.spawnT).toFixed(1) + 's')).join(' '));
  check('eating ends the run', still.every((r) => r.g.over));

  // 2. Good skiing at cruising speed: the yeti catches up eventually.
  const cruise = seeds.map((s) => yetiTrial(s, (g) => autopilot(g, { turbo: 'never' })));
  const caught = cruise.filter((r) => r.caughtT !== null);
  check('cruising without turbo, the yeti catches you (mostly)', caught.length >= Math.ceil(seeds.length * 0.75), `${caught.length}/${seeds.length} caught; median ${median(caught.map((r) => r.caughtT - r.spawnT)).toFixed(1)} s`);

  // 3. Turbo is the escape.
  const turbo = seeds.map((s) => yetiTrial(s, (g) => autopilot(g, { turbo: 'yeti' })));
  const escaped = turbo.filter((r) => r.escapes > 0).length;
  check('with turbo you can escape (sometimes, not always)', escaped >= Math.ceil(seeds.length * 0.3), `${escaped}/${seeds.length} escaped at least once; ${turbo.filter((r) => r.caughtT !== null).length} eaten`);

  // 4. It returns after an escape.
  const back = turbo.filter((r) => r.log.filter((e) => e.type === 'yeti').length > 1).length;
  const firstEsc = turbo.find((r) => r.escapes > 0);
  if (firstEsc) {
    const g = firstEsc.g;
    check('after an escape the yeti comes back later', back > 0 || g.nextYetiAt > g.stats.distance || g.over, `${back} runs saw a second yeti`);
  }

  // 5. Spawn is never inside an obstacle, approach varies.
  const approaches = new Set();
  let inside = 0;
  for (let s = 100; s < 160; s++) {
    const g = new Game({ seed: s });
    g.setViewSize(1100, 640);
    g.nextYetiAt = 0;
    g.update(STEP, {});
    const y = g.yeti;
    approaches.add(y.approach);
    if (!g.world.isFree(y.x, y.y, 12)) inside++;
  }
  check('yeti never appears inside an obstacle', inside === 0, `${inside} bad spawns`);
  check('yeti approach angle varies', approaches.size === 3, [...approaches].join(', '));

  // 6. Clearing its arms with a hop at the right moment.
  const hop = new Game({ seed: 5 });
  hop.nextYetiAt = 0;
  hop.update(STEP, {});
  const y = hop.yeti;
  y.x = hop.player.x;
  y.y = hop.player.y + 60;
  y.heading = Math.PI;
  hop.player.z = 60;
  hop.player.state = 'air';
  hop.player.vz = 0;
  hop.update(STEP, {});
  check('a skier high in the air sails over the grab', y.state !== 'eat' || hop.player.z < CONFIG.YETI_REACH_HEIGHT);
}

// ----------------------------------------------------------------- save
{
  const bad = sanitize({ best: { score: -5, distance: 'x', maxSpeed: NaN }, settings: { master: 7, touch: 'weird', seed: 5 } });
  check('corrupt saves are sanitised', bad.best.score === 0 && bad.best.distance === 0 && bad.settings.master === 1 && bad.settings.touch === 'auto' && bad.settings.seed === '');
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
  const s1 = new Save(store);
  const broke = s1.recordRun({ score: 900, distance: 800, maxSpeed: 70, escapes: 1, eaten: true });
  s1.updateSettings({ music: 0.2, seedMode: 'fixed', seed: '1991' });
  const s2 = new Save(store);
  check('records and settings persist', broke.score && s2.data.best.score === 900 && s2.settings.music === 0.2 && s2.settings.seed === '1991' && s2.data.totals.runs === 1);
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const s3 = new Save(throwing);
  let ok = true;
  try { s3.recordRun({ score: 1, distance: 1, maxSpeed: 1, escapes: 0, eaten: true }); } catch { ok = false; }
  check('blocked storage never throws', ok);
}

function median(a) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
process.exit(failures ? 1 : 0);
