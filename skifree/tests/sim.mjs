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
function yetiTrial(seed, brain, at = 30, level = 1) {
  const g = new Game({ seed });
  g.setViewSize(1100, 640);
  g.nextYetiAt = at; // skip the 1 km warm-up
  g.stats.yetiEscapes = level - 1; // modern mode: escapes so far set its pace
  let spawnT = null, caughtT = null;
  const log = run(g, 120, (gg, i) => brain(gg, i));
  for (const e of log) {
    if (e.type === 'yeti' && spawnT === null) spawnT = e.t;
    if (e.type === 'caught') caughtT = e.t;
  }
  return { g, log, spawnT, caughtT, escapes: g.stats.yetiEscapes - (level - 1) };
}
{
  const seeds = QUICK ? [31, 32, 33, 34] : [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42];
  // 1. Standing still: eaten fast, even by the slow first yeti.
  const still = seeds.map((s) => yetiTrial(s, () => ({ left: true }), 0));
  const stillOk = still.every((r) => r.caughtT !== null && r.caughtT - r.spawnT < 25);
  check('a skier who stops gets eaten', stillOk, still.map((r) => (r.caughtT === null ? 'never' : (r.caughtT - r.spawnT).toFixed(1) + 's')).join(' '));
  check('eating ends the run', still.every((r) => r.g.over));

  // 2. The first yeti is easy: plain cruising loses it.
  const easy = seeds.map((s) => yetiTrial(s, (g) => autopilot(g, { turbo: 'never' })));
  const easyCaught = easy.filter((r) => r.caughtT !== null).length;
  const easyEsc = easy.filter((r) => r.escapes > 0).length;
  check('level 1: cruising (no turbo) loses the yeti', easyCaught === 0 && easyEsc >= Math.ceil(seeds.length * 0.75), `${easyEsc}/${seeds.length} escaped, ${easyCaught} eaten`);

  // 3. After many escapes it out-runs cruising: you need turbo.
  const hard = seeds.map((s) => yetiTrial(s, (g) => autopilot(g, { turbo: 'never' }), 30, 9));
  const hardCaught = hard.filter((r) => r.caughtT !== null).length;
  check('level 9: cruising alone gets caught', hardCaught >= Math.ceil(seeds.length * 0.75), `${hardCaught}/${seeds.length} eaten`);
  const turbo = seeds.map((s) => yetiTrial(s, (g) => autopilot(g, { turbo: 'yeti' }), 30, 9));
  const escaped = turbo.filter((r) => r.escapes > 0).length;
  check('level 9: with turbo you can still escape', escaped >= Math.ceil(seeds.length * 0.3), `${escaped}/${seeds.length} escaped; ${turbo.filter((r) => r.caughtT !== null).length} eaten`);

  // 4. The pace ramp: slow, a little faster per escape, capped under turbo.
  const g0 = new Game({ seed: 1 });
  const tops = Array.from({ length: 20 }, (_, i) => g0.yetiTopSpeed(i + 1));
  const rising = tops.every((v, i) => i === 0 || v >= tops[i - 1]);
  check('yeti pace rises with every escape, from slow to under-turbo', rising && tops[0] < CONFIG.PLAYER_SPEED * 0.7 && tops[19] < CONFIG.TURBO_SPEED && tops.some((v) => v > CONFIG.PLAYER_SPEED),
    tops.filter((_, i) => i % 3 === 0).map((v) => (v / METER).toFixed(1)).join(' ') + ' m/s');
  const live = turbo.find((r) => r.g.yeti) || turbo[0];
  if (live.g.yeti) check('a spawned yeti takes the pace for its level', Math.abs(live.g.yeti.topSpeed - live.g.yetiTopSpeed(9 + live.escapes)) < 1e-6);

  // 5. Schedule: every 1000 m mark; an escape books the next mark at least
  // YETI_MIN_GAP ahead; classic keeps the original 2000 m.
  const sched = new Game({ seed: 2 });
  const marks = [];
  check('modern: the first yeti is due at 1000 m', new Game({ seed: 2 }).nextYetiAt === 1000);
  check('classic: the first yeti is due at 2000 m', new Game({ seed: 2, modern: false }).nextYetiAt === CONFIG.YETI_TRIGGER_DISTANCE);
  for (const d of [1450, 1900, 2300]) {
    sched.stats.distance = d;
    sched.nextYetiAt = Math.min(sched.nextYetiAt, d); // the arrival has passed
    marks.push(sched.yetiReturnAt());
  }
  check('after an escape it returns at the next 1000 m mark', marks.join() === '2000,3000,3000', marks.join(', '));
  const stallEsc = new Game({ seed: 2 });
  stallEsc.stats.distance = 100; // escaped an early stall yeti
  check('an early escape keeps the 1000 m arrival', stallEsc.yetiReturnAt() === 1000, String(stallEsc.yetiReturnAt()));
  const back = turbo.filter((r) => r.log.filter((e) => e.type === 'yeti').length > 1).length;
  const firstEsc = easy.find((r) => r.escapes > 0);
  if (firstEsc) {
    const g = firstEsc.g;
    check('a live escape books the next 1000 m mark ahead', g.nextYetiAt % CONFIG.YETI_INTERVAL === 0 && (g.yeti || g.nextYetiAt > g.stats.distance || back > 0), `next at ${g.nextYetiAt} m, now ${g.stats.distance.toFixed(0)} m; ${back} turbo runs saw a second yeti`);
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

// ------------------------------------------------ original-game mechanics
{
  // Stalling summons the yeti (with a roar of warning first).
  const g = new Game({ seed: 50 });
  g.setViewSize(1100, 640);
  g.player.grace = 999;
  run(g, 0.01, () => ({}));
  g.player.y = 80 * METER; // below the trailhead grace zone
  const slog = run(g, CONFIG.YETI_STALL_TIME + 10, () => ({ left: true }));
  const warnT = slog.find((e) => e.type === 'yetiwarn')?.t ?? null;
  const ye = slog.find((e) => e.type === 'yeti');
  const yetiT = ye?.t ?? null, reason = ye?.reason ?? null;
  check('stalling summons the yeti, with a warning first', reason === 'stall' && warnT !== null && warnT < yetiT && Math.abs(yetiT - CONFIG.YETI_STALL_TIME) < 3, `warn ${warnT?.toFixed(1)} s, yeti ${yetiT?.toFixed(1)} s (${reason})`);

  // Walking across the trailhead to Tree Slalom is not dawdling.
  const walk = new Game({ seed: 12345 });
  walk.setViewSize(1100, 640);
  walk.player.grace = 999;
  const wlog = run(walk, 45, (gg) => (gg.player.x > CONFIG.TREE_SLALOM_X ? { left: true } : { up: true }));
  check('walking over to Tree Slalom does not summon the yeti', !wlog.some((e) => e.type === 'yeti' || e.type === 'yetiwarn'), `x ${(walk.player.x / METER).toFixed(0)} m`);

  // Wandering off the side of the mountain summons it too.
  const w = new Game({ seed: 51 });
  w.setViewSize(1100, 640);
  w.player.x = CONFIG.YETI_WANDER_X + 100;
  w.player.grace = 999;
  const wr = run(w, 6, () => ({ up: true })).find((e) => e.type === 'yeti')?.reason ?? null;
  check('wandering off the mountain summons the yeti', wr === 'wander', String(wr));

  // Skiing normally does not trigger it early.
  const n = new Game({ seed: 52 });
  n.setViewSize(1100, 640);
  const early = run(n, 40, (gg) => autopilot(gg, { turbo: 'never' })).some((e) => e.type === 'yeti');
  check('normal skiing does not summon the yeti early', !early && n.stats.distance < CONFIG.YETI_INTERVAL, `${n.stats.distance.toFixed(0)} m in 40 s`);
}
{
  // Air tricks off a ramp.
  const trial = (pressAt, key) => {
    const g = new Game({ seed: 3, demo: true });
    const p = g.player;
    p.grace = 999;
    p.speed = 300;
    p.rampLaunch(g.events);
    let pressed = false;
    const log = run(g, 2.5, (gg) => {
      const inp = {};
      if (!pressed && gg.player.state === 'air' && gg.player.airTime >= pressAt) {
        inp[key] = true;
        pressed = true;
      }
      return inp;
    });
    return { g, land: log.find((e) => e.type === 'land'), wipe: log.find((e) => e.type === 'wipeout'), styleEv: log.find((e) => e.type === 'style') };
  };
  const flip = trial(0.1, 'up');
  check('Up in the air does a backflip, landed clean it scores', flip.land && flip.land.tricks.includes('flip') && flip.g.style >= CONFIG.TRICKS.flip.style, `style ${flip.g.style.toFixed(0)}, "${flip.styleEv?.label}"`);
  const eagle = trial(0.1, 'down');
  check('Down in the air does a spread eagle', eagle.land && eagle.land.tricks.includes('eagle'));
  const spin = trial(0.1, 'jump');
  check('Space in the air does a helicopter spin', spin.land && spin.land.tricks.includes('spin'));
  const late = trial(0.9, 'up'); // air lasts ~1.1 s at this speed: no time to finish
  check('landing mid-trick is a wipeout', !!late.wipe && !late.land, late.wipe ? `wiped out mid-${late.wipe.trick}` : 'landed');
  // A hop can't farm tricks.
  const h = new Game({ seed: 3, demo: true });
  h.player.grace = 999;
  run(h, 0.05, () => ({ jump: false }));
  run(h, 2, (gg, i) => ({ jump: i < 3, down: i > 10 && i < 13 }));
  check('tricks off a mere hop score nothing', h.style === 0, `style ${h.style}`);
  // A stray Up/Down/Space during a hop or mogul bounce must not doom the landing.
  for (const key of ['up', 'down', 'jump']) {
    const q = new Game({ seed: 3, demo: true });
    q.player.grace = 999;
    run(q, 0.05, () => ({}));
    q.player.hop(q.events);
    let pressed = false;
    const log = run(q, 1.5, (gg) => {
      if (!pressed && gg.player.state === 'air' && gg.player.airTime > 0.05) { pressed = true; return { [key]: true }; }
      return {};
    });
    check(`tapping ${key} during a hop does not cause a wipeout`, !log.some((e) => e.type === 'wipeout' || e.type === 'trick'));
  }
}
{
  // Timed courses: ski the slalom through every gate, and again straight down.
  const lane = (id, brain) => {
    const g = new Game({ seed: 8, demo: true });
    const def = g.courses.find((c) => c.id === id);
    g.player.x = def.x;
    g.player.y = def.startY - 60;
    g.player.grace = 1e9;
    const log = run(g, 120, (gg) => { gg.player.grace = 1e9; return brain(gg, def); });
    return { start: log.find((e) => e.type === 'coursestart'), done: log.find((e) => e.type === 'course'), misses: log.filter((e) => e.type === 'gatemiss').length };
  };
  // Aim at the next gate below us.
  const threader = (gg, def) => {
    const p = gg.player;
    let next = null;
    gg.world.forEachInRect(def.x - def.half - 100, p.y + 5, def.x + def.half + 100, p.y + 900, (o) => {
      if (o.t === 'gate' && (!next || o.y < next.y)) next = o;
    });
    const tx = next ? next.x : def.x;
    const ty = next ? next.y : p.y + 400;
    return { aim: Math.atan2(tx - p.x, Math.max(20, ty - p.y)) };
  };
  const clean = lane('slalom', threader);
  check('slalom: crossing START starts the clock', !!clean.start && clean.start.id === 'slalom');
  check('slalom: threading every gate finishes with no misses', clean.done && clean.done.missed === 0 && clean.done.passed > 20, clean.done ? `${clean.done.time.toFixed(1)} s, ${clean.done.passed} gates` : 'no finish');
  const sloppy = lane('slalom', () => ({ up: true }));
  check('slalom: missed gates add a time penalty', sloppy.done && sloppy.done.missed > 5 && Math.abs(sloppy.done.total - (sloppy.done.time + sloppy.done.missed * CONFIG.COURSE_MISS_PENALTY)) < 1e-6, sloppy.done ? `${sloppy.done.missed} missed, ${sloppy.done.total.toFixed(1)} s total` : 'no finish');
  const tree = lane('tree', threader);
  check('tree slalom is timed too', tree.done && tree.done.id === 'tree', tree.done ? `${tree.done.total.toFixed(1)} s, ${tree.done.missed} missed` : 'no finish');
  const free = lane('freestyle', () => ({ up: true }));
  check('freestyle is timed and scores style', free.done && free.done.id === 'freestyle', free.done ? `${free.done.time.toFixed(1)} s, ${free.done.style} style` : 'no finish');
  // Leaving the lane voids the run.
  const g = new Game({ seed: 8, demo: true });
  const def = g.courses[0];
  g.player.x = def.x;
  g.player.y = def.startY - 60;
  const log = run(g, 6, (gg, i) => {
    gg.player.grace = 1e9;
    if (i === 300) gg.player.x += CONFIG.COURSE_LANE_HALF + 100; // veer well off the lane
    return { up: true };
  });
  check('leaving the course voids the run', log.some((e) => e.type === 'courseabort'));
}

// ------------------------------------------------------- steering assist
{
  // Ski straight down with no input through real terrain: assist should
  // avoid most of what an unassisted skier hits.
  const crashes = (assist) => {
    let n = 0;
    for (const seed of [91, 92, 93, 94]) {
      const g = new Game({ seed, demo: true, assist });
      g.player.x = -3500 + seed * 400; // well away from the courses and lift
      g.player.y = 6000; // past the friendly start, into real terrain
      n += run(g, 40, () => ({ up: true })).filter((e) => e.type === 'hit').length;
    }
    return n;
  };
  const off = crashes(false), on = crashes(true);
  check('steering assist avoids most crashes for a hands-off skier', on < off * 0.5, `${off} crashes without, ${on} with`);
}

// ------------------------------------------------------- modern systems
{
  const { Actor } = await import('../src/actors.js');
  // Setup: yeti right behind the player, a skier sitting between them.
  const bait = (modern) => {
    const g = new Game({ seed: 71, modern });
    g.setViewSize(1100, 640);
    g.player.grace = 1e9;
    g.nextYetiAt = 0;
    run(g, 0.01, () => ({}));
    const y = g.yeti;
    y.x = g.player.x; y.y = g.player.y - 420; y.heading = 0;
    const npc = new Actor('skier', g.player.x + 10, y.y + 90, g.rng);
    npc.baseSpeed = 20; npc.beginner = false;
    g.actors.push(npc);
    const log = run(g, 12, () => ({ up: true, turbo: true }));
    return { g, npc, log };
  };
  let ate = 0, classicAte = 0;
  for (let i = 0; i < 6; i++) {
    const m = bait(true);
    if (m.log.some((e) => e.type === 'yetieat')) ate++;
    const c = bait(false);
    if (c.log.some((e) => e.type === 'yetieat')) classicAte++;
  }
  check('modern: the yeti can switch to a nearby skier and eat them', ate >= 2, `${ate}/6 runs`);
  check('classic: the yeti only ever wants you', classicAte === 0);
  const m = bait(true);
  const eat = m.log.find((e) => e.type === 'yetieat');
  if (eat) check('after its snack the yeti comes back for you', m.npc.gone && (m.g.yeti === null || m.g.yeti.state !== 'eat' || m.g.yeti.victim === null));

  // Dog poop.
  const pg = new Game({ seed: 3, demo: true });
  run(pg, 0.01, () => ({}));
  pg.player.speed = 150;
  pg.addPoop(pg.player.x, pg.player.y + 30);
  const h0 = pg.player.heading;
  const plog = run(pg, 0.5, () => ({}));
  check('dog poop sends the skis sideways', plog.some((e) => e.type === 'poop') && Math.abs(pg.player.travel - h0) > 0.3);
  const pf = new Game({ seed: 3, demo: true });
  run(pf, 0.01, () => ({}));
  pf.player.speed = 380;
  pf.addPoop(pf.player.x, pf.player.y + 60);
  run(pf, 0.4, () => ({ turbo: true }));
  check('dog poop at speed is a wipeout', pf.player.state === 'tumble' || pf.player.state === 'recover' || pf.player.state === 'crash');
  const pc = new Game({ seed: 3, demo: true, modern: false });
  run(pc, 0.01, () => ({}));
  pc.addPoop(pc.player.x, pc.player.y + 30);
  check('classic mode has no poop hazard', !run(pc, 0.5, () => ({})).some((e) => e.type === 'poop'));

  // Polar bear.
  const bg = new Game({ seed: 3, demo: true });
  run(bg, 0.01, () => ({}));
  bg.player.grace = 0;
  const bear = new Actor('bear', bg.player.x, bg.player.y + 70, bg.rng);
  bear.state = 'sit'; bear.timer = 99;
  bg.actors.push(bear);
  const blog = run(bg, 1, () => ({ up: true }));
  check('skiing into a polar bear is a big wipeout', blog.some((e) => e.type === 'bearhit') && blog.some((e) => e.type === 'bear'));
  let bears = 0, chunks = 0;
  for (const seed of [1, 2, 3, 4]) {
    const w = new World(seed);
    for (let cy = 20; cy < 200; cy++) for (let cx = -4; cx <= 4; cx++) {
      chunks++;
      const { spawnActors } = await import('../src/actors.js');
      bears += spawnActors(w.chunk(cx, cy), w, new Rng(seed * 7919 + cx * 131 + cy), null, CONFIG, true).filter((a) => a.kind === 'bear').length;
    }
  }
  const perKm = bears / ((chunks / 9) * CONFIG.CHUNK_SIZE / METER / 1000) / 4 * 4;
  check('polar bears are rare', bears > 0 && bears / chunks < 0.02, `${bears} bears in ${chunks} chunks`);

  // Snow pile.
  const sg = new Game({ seed: 3, demo: true });
  run(sg, 0.01, () => ({}));
  sg.player.speed = 240;
  sg.world.chunk(0, 0).objects.push({ id: 424242, t: 'snowpile', x: sg.player.x, y: sg.player.y + 40, v: 0, state: 0, timer: 0 });
  const slog2 = run(sg, 0.4, () => ({ up: true }));
  check('snow piles slow you and pop you up', slog2.some((e) => e.type === 'pile'));

  // NPCs pile into each other.
  const cg = new Game({ seed: 3, demo: true });
  run(cg, 0.01, () => ({}));
  const a1 = new Actor('skier', cg.player.x + 300, cg.player.y + 200, cg.rng);
  const a2 = new Actor('skier', cg.player.x + 300, cg.player.y + 208, cg.rng);
  a1.state = a2.state = 'go';
  cg.actors.push(a1, a2);
  const clog = run(cg, 0.1, () => ({}));
  check('NPCs collide with each other', clog.some((e) => e.type === 'pileup') && (a1.fallen || a2.fallen));
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
  const s4 = new Save(store);
  check('a zero-style freestyle run is not a "best"', s4.recordCourse('freestyle', 0) === false && !('freestyle' in s4.data.courses));
}

function median(a) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
process.exit(failures ? 1 : 0);
