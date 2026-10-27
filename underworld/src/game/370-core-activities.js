/* =====================================================================
   [CORE+CONTENT] ACTIVITIES: stunt tracker (jumps, drifts, near misses), authored
   street races with AI opponents, and emergent street events.
   ===================================================================== */
class StuntTracker {
  constructor(game) {
    this.g = game; this.launch = null;
    this.drift = { on: false, score: 0, t: 0, off: 0, hp: 100 };
    this.nm = new Map(); this.combo = 0; this.comboT = 0; this.popT = 0; this.lastHp = 100;
  }
  pop(title, value, cls = '') {
    const el = $('stunt');
    el.querySelector('.sk').textContent = title; el.querySelector('.sv').textContent = value;
    el.className = cls; void el.offsetWidth; el.classList.add('show');
    this.popT = 2.2;
  }
  findJump(x, z) {
    for (const s of this.g.world.jumps) if (x > s.x0 - 4 && x < s.x1 + 4 && z > s.z0 - 4 && z < s.z1 + 4) return s;
    return null;
  }
  launched(v) { this.launch = { x: v.pos.x, z: v.pos.z, y: v.pos.y, t: this.g.time, jump: this.findJump(v.pos.x, v.pos.z), hp: v.health }; }
  // street furniture flattened by the player's car (it was called but never defined: driving through a
  // lamp post or hydrant threw and cut that frame's update short)
  destroyed(type) { const st = this.g.save.stats; st.smashed = (st.smashed || 0) + 1; void type; }
  // "+$120 bank", or a note once the day's stunt cash is used up
  cashText(paid) { return paid > 0 ? `+${fmtMoney(paid)} bank` : 'daily stunt cash reached'; }
  landed(v, airT, imp) {
    const L = this.launch, g = this.g, s = g.save; this.launch = null;
    if (!L || airT < 0.6 || g.state !== 'playing') return;
    const dist = Math.hypot(v.pos.x - L.x, v.pos.z - L.z);
    if (dist < 8) return;
    const clean = imp < 9 && v.health > 0 && Math.abs(v.roll || 0) < 0.5;
    // repeatable stunt cash is Clean but capped per in-game day; a first unique jump pays its bonus in full (§45.19)
    let cash = Math.round((dist * 4 + airT * 70) * (clean ? 1.5 : 1) / 5) * 5, milestone = 0;
    s.stats.stuntJumps++;
    s.stats.bestJump = Math.max(s.stats.bestJump, dist); s.stats.bestAir = Math.max(s.stats.bestAir, airT);
    let title = clean ? 'CLEAN LANDING' : 'STUNT JUMP';
    if (L.jump && L.jump.unique && dist > 12 && airT > 0.8 && !s.jumps[L.jump.id]) {
      s.jumps[L.jump.id] = 1; milestone = 500;
      const n = Object.keys(s.jumps).length, tot = g.world.jumps.length;
      title = `UNIQUE JUMP ${n} / ${tot}`;
      g.content.addRep(15);
      if (n === 5) {
        this.g.ach('jump5');
        if (!s.flags.mesaGiven) { s.flags.mesaGiven = true; g.vreg.give('offroad', 'reward', 0xa0381e, 'Tull'); g.content.phone('tull', 'Five jumps! Kid, you’re nuts. I left a Mesa Trail in your garage — it lands like a cat.'); }
      }
      if (n >= tot) g.ach('jumpall');
    }
    const paid = g.earn(cash, 'stunt') + (milestone ? g.earn(milestone, 'stuntMilestone') : 0);
    this.pop(title, `${Math.round(dist)} m · ${airT.toFixed(1)} s · ${this.cashText(paid)}`, 'jump');
    g.audio.play('stunt');
    if (dist > 40) g.slowT = Math.max(g.slowT, 0.25);
  }
  update(dt) {
    const g = this.g, p = g.player, s = g.save;
    if (this.popT > 0) { this.popT -= dt; if (this.popT <= 0) $('stunt').classList.remove('show'); }
    const v = p.state === 'vehicle' ? p.vehicle : null;
    if (!v || g.state !== 'playing') { this.drift.on = false; this.drift.score = 0; return; }
    // drift scoring: sustained slip angle at speed, cancelled by a crash
    const lv = v.localVel(), slip = Math.atan2(Math.abs(lv.x), Math.abs(lv.z) + 0.1);
    const d = this.drift;
    const crashed = v.health < this.lastHp - 2.5; this.lastHp = v.health;
    if (crashed && d.on) { d.on = false; d.score = 0; this.pop('DRIFT LOST', 'crash', 'bad'); }
    if (!v.airborne && v.speed > 11 && slip > 0.3 && lv.z > 0) {
      if (!d.on) { d.on = true; d.score = 0; d.t = 0; }
      d.score += v.speed * slip * dt * 14; d.t += dt; d.off = 0;
      if (d.t > 0.8) { const el = $('stunt'); el.className = 'show live'; el.querySelector('.sk').textContent = 'DRIFT'; el.querySelector('.sv').textContent = Math.round(d.score).toLocaleString('en-US'); this.popT = 0.5; }
    } else if (d.on) {
      d.off += dt;
      if (d.off > 0.5) {
        d.on = false;
        if (d.score > 180 && d.t > 1.2) {
          const wet = g.env.wet > 0.4 ? 1.5 : 1;
          const cash = Math.round(d.score / 12 * wet / 5) * 5;
          s.stats.bestDrift = Math.max(s.stats.bestDrift, Math.round(d.score));
          const paid = g.earn(cash, 'stunt');
          this.pop(wet > 1 ? 'WET DRIFT' : 'DRIFT', `${Math.round(d.score).toLocaleString('en-US')} · ${this.cashText(paid)}`);
          if (d.score >= 2000) g.ach('drift');
        }
        d.score = 0;
      }
    }
    // near misses against traffic
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    if (v.speed > 16) {
      for (const o of g.vehicles.nearby(v.pos.x, v.pos.z, 12)) {
        if (o === v || o.burnt) continue;
        const lp = v.toLocal(o.pos.x, o.pos.z), along = v.spec.l / 2 + o.spec.l / 2;
        let e = this.nm.get(o.id);
        if (!e) { e = { cand: false, hp: v.health, t: g.time }; this.nm.set(o.id, e); }
        e.t = g.time;
        const gap = Math.abs(lp.x) - (v.spec.w / 2 + o.spec.w / 2);
        if (Math.abs(lp.z) < along && gap > 0.05 && gap < 0.95) { e.cand = true; e.hp = v.health; }
        if (e.cand && lp.z < -along - 1) {
          e.cand = false;
          if (v.health >= e.hp - 0.5) {
            this.combo++; this.comboT = 4; s.stats.nearMisses++;
            const cash = 10 * Math.min(this.combo, 8);
            const paid = Money.earn(cash, 'stunt');
            this.pop(this.combo > 1 ? `NEAR MISS ×${this.combo}` : 'NEAR MISS', this.cashText(paid), 'nm');
            g.audio.play('ui', { gain: 0.4 });
            if (s.stats.nearMisses >= 50) g.ach('near50');
          }
        }
      }
    }
    if (this.nm.size > 60) for (const [k, e] of this.nm) if (g.time - e.t > 3) this.nm.delete(k);
  }
}

/* ---------------- street races ---------------- */
const RACES = [
  { id: 'quayside', name: 'Quayside Sprint', nodes: [[0, 11], [0, 8], [0, 5], [0, 2], [0, 0], [3, 0], [6, 0]], laps: 1, opp: 3, cls: ['sports', 'muscle', 'sedan'], reward: 1200, rep: 40, blurb: 'West shore, north along the seawall, then hard right along North Shore Drive.' },
  { id: 'saltloop', name: 'Saltworks Circuit', nodes: [[9, 0], [12, 0], [12, 3], [9, 3]], loop: true, laps: 2, opp: 3, cls: ['sports', 'muscle', 'pickup'], reward: 1600, rep: 45, blurb: 'Two laps around the refinery. Mind the trucks.' },
  { id: 'midnight', name: 'Midnight Run', nodes: [[4, 4], [8, 4], [8, 6], [5, 6], [5, 8], [9, 8]], laps: 1, opp: 3, night: true, cls: ['sports', 'muscle', 'sports'], reward: 2200, rep: 55, blurb: 'Through the heart of the city after dark, traffic and all. 20:00–05:00 only.' },
  { id: 'industrial', name: 'Industrial Rumble', nodes: [[9, 5], [11, 5], [11, 8], [9, 8]], loop: true, laps: 2, opp: 3, cls: ['pickup', 'van', 'muscle', 'suv'], reward: 1500, rep: 45, blurb: 'Container yards and loading docks. Heavy metal only, bring something tough.' },
  { id: 'wettrack', name: 'Wet Track', nodes: [[1, 6], [1, 10], [4, 10], [4, 6]], loop: true, laps: 2, opp: 3, rain: true, cls: ['sedan', 'sports', 'muscle'], reward: 1800, rep: 50, blurb: 'Only runs when it’s pouring. Old Market cobbles, zero grip.' },
  { id: 'pinkslip', name: 'Pink Slip', nodes: [[6, 6], [6, 10], [10, 10], [10, 4], [12, 4], [12, 8]], laps: 1, opp: 1, cls: ['classic'], storyOnly: true, pink: true, reward: 0, rep: 0, blurb: 'One on one with Vance, for pink slips: winner drives home in the other car.' },
  // Cedar Fields South (Session 6C): illegal off-road races across the countryside, each run on alternate economic
  // days; and Vance's special, a pink slip across the fields every third day
  { id: 'dustdevil', name: 'Dust Devil', path: 'loop', laps: 1, opp: 3, country: true, dayOff: 0, cls: ['pickup', 'offroad', 'suv'], reward: 1700, rep: 45, blurb: 'Across the land bridge and flat out round the fields and the south hills. Dirt, ruts and nobody watching. Bring something that likes mud.' },
  { id: 'ridgerun', name: 'Ridge Run', path: 'ring', laps: 2, opp: 3, country: true, dayOff: 1, cls: ['offroad', 'pickup', 'kodiak'], reward: 2300, rep: 55, blurb: 'Two laps of the countryside loop: the west fields, the ridge and back along the farm track.' },
  { id: 'pinkdirt', name: 'Pink Slip: Dirt', path: 'loop', laps: 1, opp: 1, cls: ['offroad'], storyOnly: true, pink: true, offroad: true, reward: 0, rep: 0, blurb: 'One on one with Vance across the Cedar Fields countryside, for pink slips. Off-road cars only: winner drives home in the other one.' }
];
// a countryside race's ground (Session 6C): 'loop' is the countryside track from the land bridge round to the
// compound; 'ring' closes it along the farm track between its two ends
function cfsRacePath(def) {
  if (def.route) return routeRacePath(def);
  const cf = game.world.cfs, L = cf.loop;
  if (def.path === 'loop') return { pts: L, closed: false };
  const ia = cf.spur.findIndex(p => p[0] === L[0][0] && p[1] === L[0][1]), iz = cf.spur.findIndex(p => p[0] === L[L.length - 1][0] && p[1] === L[L.length - 1][1]);
  return { pts: [...L, ...cf.spur.slice(ia + 1, iz).reverse()], closed: true };
}
// a race laid along streets between waypoints (the Curved Roads pass): the road graph's route through them, curves,
// diagonals and junctions included, its centreline sampled every 2.5 m (a closed course when def.loop)
function routeRacePath(def) {
  const W = def.loop ? [...def.route, def.route[0]] : def.route, out = [];
  for (let k = 1; k < W.length; k++) {
    const r = RoadGraph.route(W[k - 1][0], W[k - 1][1], W[k][0], W[k][1], { kinds: RG_STREETS }); if (!r) break;
    for (const q of r.pts) { const l = out[out.length - 1]; if (!l || Math.hypot(l[0] - q.x, l[1] - q.z) > 0.05) out.push([q.x, q.z]); }
  }
  const pts = out.length > 1 ? resample(out, 2.5) : out;
  if (def.loop && pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1.5) pts.pop();
  return { pts, closed: !!def.loop };
}
// checkpoints along a path every 40 m, the start 15 m in, the racing line every 5 m with a safe speed for the dirt
// (the bend's radius, slower over mud and rock, braking back at 4 m/s²) and the left normal
function pathCheckpoints(def) {
  const { pts, closed } = cfsRacePath(def), n = pts.length, laps = def.laps || 1, k0 = 6;
  const at = k => pts[closed ? ((k % n) + n) % n : clamp(k, 0, n - 1)];
  const one = [];
  for (let k = k0 + 16; k < (closed ? n + k0 : n - 1); k += 16) one.push(at(k));
  one.push(at(closed ? k0 + n - 1 : n - 1));
  const out = []; for (let l = 0; l < laps; l++) for (const p of one) out.push({ x: p[0], z: p[1], lap: l });
  const nl = k => { const a = at(k - 1), b = at(k + 1), dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dz / l, -dx / l]; };
  const rad = k => { const a = at(k - 4), b = at(k), c = at(k + 4), ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]), A2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])); return A2 < 1e-6 ? Infinity : ab * bc * ca / (2 * A2); };
  const last = closed ? k0 + n * laps : n - 1, ai = [];
  for (let k = k0 + 2; k <= last; k += 2) {
    const p = at(k), s = Terrain.surf(p[0], p[1]), N2 = nl(k);
    ai.push({ x: p[0], z: p[1], node: true, vmax: Math.min(Math.sqrt(4.5 * rad(k)), 26, s === TSURF.mud ? 12 : s === TSURF.rock ? 16 : 26), nx: N2[0], nz: N2[1] });
  }
  for (let i = ai.length - 2; i >= 0; i--) ai[i].vmax = Math.min(ai[i].vmax, Math.sqrt(ai[i + 1].vmax ** 2 + 2 * 4 * 5));
  const s0 = at(k0), s1 = at(k0 + 1), l0 = Math.hypot(s1[0] - s0[0], s1[1] - s0[1]) || 1, dir = { x: (s1[0] - s0[0]) / l0, z: (s1[1] - s0[1]) / l0 };
  return { cps: out, perLap: one.length, start: { x: s0[0], z: s0[1], h: Math.atan2(dir.x, dir.z), dir }, aiPath: ai };
}
const RACER_NAMES = ['Vance', 'Mika "Nitro" Osei', 'Jules Ferreira', 'Big Tam', 'Lou Park', 'Danny Two-Tone'];
function raceCheckpoints(def) {
  // an official event runs on its venue's loop: Valen Point's circuit (Session 6B), the off-road course (Session 6C)
  if (def.circuit) return venueOf(def).checkpoints(def);
  // a countryside race runs along its own path (Session 6C); a race laid along streets by waypoints, along the road
  // graph's route through them (the Curved Roads pass)
  if (def.path || def.route) return pathCheckpoints(def);
  const seq = def.nodes.slice(); if (def.loop) seq.push(seq[0]);
  const one = [];
  for (let k = 1; k < seq.length; k++) {
    const [a, b] = seq[k - 1], [c, d] = seq[k];
    const di = Math.sign(c - a), dj = Math.sign(d - b);
    let i = a, j = b;
    while (i !== c || j !== d) { i += di; j += dj; one.push({ x: i * P, z: j * P }); }
  }
  const out = [];
  for (let l = 0; l < (def.laps || 1); l++) for (const p of one) out.push({ ...p, lap: l });
  const [a0, b0] = seq[0], [a1, b1] = seq[1];
  const dir = { x: Math.sign(a1 - a0), z: Math.sign(b1 - b0) };
  return { cps: out, perLap: one.length, start: { x: a0 * P + dir.x * 26, z: b0 * P + dir.z * 26, h: Math.atan2(dir.x, dir.z), dir } };
}
function raceAvailable(def, g) {
  const t = g.env.time;
  if (def.country && g.uw && (g.uw.S.day + def.dayOff) % 2) return 'Not running today: the farmers are out in the fields. Try tomorrow.';
  if (def.night && !(t >= 20 || t < 5)) return 'Only after dark (20:00–05:00).';
  if (def.rain && g.env.rain < 0.4) return 'Only runs in the rain.';
  return '';
}
class RaceManager {
  constructor(game) { this.g = game; this.active = null; }
  begin(def, opts = {}) {
    const g = this.g, R = raceCheckpoints(def);
    this.active = { def, R, cp: 0, t: 0, count: -1, racers: [], phase: 'toStart', outT: 0, place: 0, finished: 0, opts, nextMk: null, nextMk2: null, startMk: null };
    const A = this.active;
    A.startMk = g.missions.objMarker(R.start.x, R.start.z, 0xff8a3d, 6);
    g.save.stats.racesEntered++;
    return A;
  }
  lineUp() {
    const g = this.g, A = this.active, R = A.R, p = g.player, v = p.vehicle;
    const d = R.start.dir, rx = -d.z, rz = d.x;
    const slot = (k) => { const lat = (k % 2 ? 2.7 : -2.7), back = Math.floor(k / 2) * 9; return { x: R.start.x + rx * lat - d.x * back, z: R.start.z + rz * lat - d.z * back }; };
    // clear the grid
    for (const o of g.vehicles.list.slice()) if (o !== v && !o.mission && dist2(o.pos.x, o.pos.z, R.start.x, R.start.z) < 45 * 45) g.vehicles.despawn(o);
    const s0 = slot(0);
    v.pos.set(s0.x, groundY(s0.x, s0.z), s0.z); v.h = R.start.h; v.vel.set(0, 0); v.yawRate = 0; v.syncMesh(0);
    g.cam.yaw = v.h; g.cam.init = false;
    const n = A.def.opp;
    for (let k = 0; k < n; k++) {
      // on the circuit each car keeps to its own side of the racing line, as it lined up on the grid
      const lat = ((k + 1) % 2 ? 2.7 : -2.7) * 0.9, side = R.aiPath && R.aiPath[0].nx !== undefined ? (rx * R.aiPath[0].nx + rz * R.aiPath[0].nz) * lat : 0;
      const sl = slot(k + 1), cls = A.opts.opponentCls || A.def.cls[k % A.def.cls.length];
      const o = g.vehicles.spawn(cls, sl.x, sl.z, R.start.h, { driver: 'npc', vtier: A.opts.opponentTier });
      o.mission = 'race'; o.touched = true; o.critical = false;
      if (A.opts.opponentColor !== undefined) o.mat.userData.u.uPaint.value.setHex(A.opts.opponentColor);
      const ai = o.drive = new DriveAI(o, g, 'race');
      // on the circuit the racing line, with a safe speed at every point; in the street the checkpoints
      ai.path = R.aiPath ? R.aiPath.map(c => ({ ...c, x: c.x + (c.nx || 0) * side, z: c.z + (c.nz || 0) * side })) : R.cps.map((c, i) => ({ x: c.x + rand(-1.2, 1.2), z: c.z + rand(-1.2, 1.2), node: i < R.cps.length - 1 }));
      ai.pi = 0; ai.goal = R.cps[R.cps.length - 1]; ai.wait = 99;
      const base = o.spec.vmax * (A.opts.hard ? 0.86 : rand(0.74, 0.82));
      A.racers.push({ v: o, cp: 0, base, done: false, time: 0, name: A.opts.names ? A.opts.names[k] : RACER_NAMES[(k + (A.def.id.length)) % RACER_NAMES.length], stuck: 0 });
      ai.cruise = base;
    }
    if (A.startMk) { g.missions.markers.release(A.startMk); A.startMk = null; }
    A.phase = 'count'; A.count = 3.4; A.t = 0;
  }
  progress(cp, x, z) {
    const R = this.active.R, c = R.cps[Math.min(cp, R.cps.length - 1)];
    const prev = cp > 0 ? R.cps[cp - 1] : R.start;
    const seg = Math.hypot(c.x - prev.x, c.z - prev.z) || 1;
    return cp + clamp(1 - Math.hypot(c.x - x, c.z - z) / seg, 0, 1);
  }
  // returns null while running, or { win, place, reason }
  update(dt) {
    const g = this.g, A = this.active; if (!A) return null;
    const p = g.player, v = p.state === 'vehicle' ? p.vehicle : null, R = A.R;
    if (A.phase === 'toStart') {
      const d = Math.hypot(p.pos.x - R.start.x, p.pos.z - R.start.z);
      A.target = R.start;
      A.objective = v ? (d < 9 ? 'Stop on the start line' : `Drive to the start line — ${A.def.name}`) : 'Get a vehicle and drive to the start line';
      if (v && d < 9 && v.speed < 4) {
        // a pink slip: the car you stopped in is the stake; checked, then committed (and saved) here
        // an official event: scrutineering, then the entry fee from the bank (Session 6B)
        if (A.opts.official && !A.paid) {
          const V = venueOf(A.def), why = V.canEnter(v, A.def) || V.payIn(A.def); if (why) { A.objective = why; return null; }
          A.paid = true;
        }
        if (A.opts.pink) {
          const why = g.pinks.canStake(v, A.def); if (why) { A.objective = why; return null; }
          const r = g.pinks.commit(v, A.def); A.opts.opponentCls = r.type; A.opts.opponentColor = r.color; A.opts.opponentTier = r.vtier;
          g.ui.toast(`Vance puts up a ${VEHICLES[r.type].name}. Your ${v.spec.name} against it.`, 'info');
        }
        g.fade(() => { if (this.active === A) this.lineUp(); }, true); A.phase = 'lining';
      }
      return null;
    }
    if (A.phase === 'lining') return null;
    if (!v || v.burnt || v.health <= 0) {
      A.outT += dt;
      A.objective = v ? 'Your car is wrecked!' : `Get back in a car! ${Math.ceil(10 - A.outT)}`;
      if (A.outT > 10 || (v && v.burnt)) return { win: false, reason: 'You dropped out of the race.' };
    } else A.outT = 0;
    if (A.phase === 'count') {
      const prev = Math.ceil(A.count); A.count -= dt; const now = Math.ceil(A.count);
      if (now !== prev && now > 0 && now <= 3) { g.ui.banner(String(now), A.def.name, 'info', 0.8); g.audio.play('checkpoint'); }
      if (v) { v.ctl.throttle = Math.min(v.ctl.throttle, 0); v.ctl.handbrake = true; v.vel.set(0, 0); }
      A.objective = 'Get ready…';
      if (A.count <= 0) {
        A.phase = 'run'; A.t = 0; g.ui.banner('GO!', '', 'pass', 0.8); g.audio.play('pass');
        for (const r of A.racers) if (r.v.drive) r.v.drive.wait = 0;
        this._markers();
      }
      this._hud();
      return null;
    }
    // running
    A.t += dt;
    // a street (or countryside) race is illegal and draws heat when seen; an official event never does
    if (g.raceRules && !A.def.official) g.raceRules.watch(A, v);
    const cp = R.cps[A.cp];
    A.target = cp;
    if (v && Math.hypot(p.pos.x - cp.x, p.pos.z - cp.z) < 13) {
      A.cp++; g.audio.play('checkpoint');
      if (A.cp >= R.cps.length) return this._finish();
      this._markers();
    }
    // opponents: progress, rubber band, unstick
    const myProg = this.progress(A.cp, p.pos.x, p.pos.z);
    for (const r of A.racers) {
      const o = r.v;
      if (r.done || !g.vehicles.list.includes(o)) continue;
      if (o.burnt || o.health <= 0) { r.done = true; r.dnf = true; continue; }
      const c = R.cps[r.cp];
      if (Math.hypot(o.pos.x - c.x, o.pos.z - c.z) < 15) { r.cp++; if (r.cp >= R.cps.length) { r.done = true; r.time = A.t; A.finished++; continue; } }
      const prog = this.progress(r.cp, o.pos.x, o.pos.z), lead = prog - myProg;
      if (o.drive) o.drive.cruise = r.base * clamp(1 - lead * 0.07, 0.8, 1.16);
      if (o.speed < 1.2) r.stuck += dt; else r.stuck = 0;
      if (r.stuck > 5 && Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) > 45 && !g.inView(o.pos.x, 1, o.pos.z, 3)) {
        const nc = R.cps[Math.min(r.cp, R.cps.length - 1)], pc = r.cp > 0 ? R.cps[r.cp - 1] : R.start;
        const h = Math.atan2(nc.x - pc.x, nc.z - pc.z);
        o.pos.set(pc.x + Math.sin(h) * 14, groundY(pc.x, pc.z), pc.z + Math.cos(h) * 14); o.h = h; o.vel.set(Math.sin(h) * 8, Math.cos(h) * 8);
        if (o.drive) o.drive.pi = Math.min(r.cp, o.drive.path.length - 1);
        r.stuck = 0;
      }
    }
    const lap = Math.min(A.def.laps || 1, Math.floor(A.cp / R.perLap) + 1);
    A.objective = `${A.def.name} — checkpoint ${A.cp + 1} / ${R.cps.length}${(A.def.laps || 1) > 1 ? ` · lap ${lap} / ${A.def.laps}` : ''}`;
    this._hud();
    return null;
  }
  position() {
    const A = this.active, g = this.g, p = g.player;
    const my = this.progress(A.cp, p.pos.x, p.pos.z);
    let pos = 1;
    for (const r of A.racers) { if (r.dnf) continue; if (r.done || this.progress(r.cp, r.v.pos.x, r.v.pos.z) > my) pos++; }
    return pos;
  }
  _hud() {
    const A = this.active, el = $('raceHud');
    el.classList.remove('hidden');
    const n = A.racers.filter(r => !r.dnf).length + 1;
    $('rPos').textContent = (A.phase === 'run' ? this.position() : n) + ' / ' + n;
    const L = A.def.laps || 1;
    $('rLap').parentElement.style.display = L > 1 ? '' : 'none';
    $('rLap').textContent = Math.min(L, Math.floor(A.cp / A.R.perLap) + 1) + ' / ' + L;
    $('rTime').textContent = fmtRace(A.t);
  }
  _markers() {
    const g = this.g, A = this.active, R = A.R, mm = g.missions;
    if (A.nextMk) mm.markers.release(A.nextMk); if (A.nextMk2) mm.markers.release(A.nextMk2);
    A.nextMk = A.nextMk2 = null;
    const c = R.cps[A.cp]; if (!c) return;
    const last = A.cp === R.cps.length - 1;
    // on the ground (the Cedar Fields terrain has hills)
    A.nextMk = mm.markers.get(last ? 0xffd84d : 0xff8a3d, 9, true); A.nextMk.g.position.set(c.x, groundY(c.x, c.z) + 0.02, c.z);
    const c2 = R.cps[A.cp + 1];
    if (c2) { A.nextMk2 = mm.markers.get(0xff8a3d, 4, false); A.nextMk2.g.position.set(c2.x, groundY(c2.x, c2.z) + 0.02, c2.z); }
  }
  _finish() {
    const g = this.g, A = this.active, s = g.save;
    const place = A.finished + 1;
    const rec = s.races[A.def.id] || (s.races[A.def.id] = { best: 0, won: 0 });
    const best = !rec.best || A.t < rec.best;
    if (best) rec.best = Math.round(A.t * 10) / 10;
    if (place === 1) { rec.won = 1; s.stats.racesWon++; g.ach('race1'); if (RACES.filter(r => !r.storyOnly).every(r => s.races[r.id] && s.races[r.id].won)) g.ach('raceall'); }
    return { win: place === 1, place, time: A.t, record: best };
  }
  end() {
    const g = this.g, A = this.active; if (!A) return;
    const mm = g.missions;
    for (const m of [A.nextMk, A.nextMk2, A.startMk]) if (m) mm.markers.release(m);
    $('raceHud').classList.add('hidden');
    for (const r of A.racers) {
      const o = r.v;
      if (!g.vehicles.list.includes(o) || o.pinkWon) continue;
      o.mission = null; if (o.drive) { o.drive.mode = 'cruise'; o.drive.cruise = 13; const c = g.world.randomCurbSpot(o.pos.x, o.pos.z, 200, 600); o.drive.setGoal(c.x, c.z); }
    }
    this.active = null;
  }
}

/* ---------------- street events ---------------- */
const EVENT_TYPES = {
  pursuit: { w: 1.2, label: 'Police pursuit', optional: 'Wreck the fleeing car to help the cops' },
  racers: { w: 0.9, label: 'Street racers', night: true },
  accident: { w: 1.0, label: 'Traffic accident' },
  breakdown: { w: 1.0, label: 'Stranded motorist', optional: 'Give them a lift' },
  robbery: { w: 0.9, label: 'Robbery', optional: 'Stop the thief' },
  abandoned: { w: 0.45, label: 'Abandoned car', optional: 'Keys are in it' },
  drop: { w: 0.7, label: 'Dropped courier bag', optional: 'Pick it up' },
  stop: { w: 1.0, label: 'Traffic stop' },
  streetfight: { w: 0.9, label: 'Street fight', optional: 'Break it up, or pick the loser’s pocket' }
};
// two strangers trading punches (uses the gang melee code, with the other brawler as target)
function brawlBrain(p, dt) {
  if (p.state === 'down' || p.state === 'ko') return;
  const o = p.opp;
  if (!o || o.state === 'down' || o.state === 'ko' || !game.peds.peds.includes(o)) { p.brain = null; p.keep = false; p.state = 'flee'; p.timer = rand(4, 7); p.fleeFrom = { x: o ? o.x : p.x, z: o ? o.z : p.z }; return; }
  p.state = 'free';
  if (p.skill === undefined) { p.skill = rand(0.25, 0.55); p.cool = rand(0.3, 1.2); p.fireT = 1; }
  gangAttack(p, o, dt);
}
function idleBrain(p, dt) { p.state = 'free'; p.vx = damp(p.vx, 0, 6, dt); p.vz = damp(p.vz, 0, 6, dt); if (p.faceX !== undefined) p.h = dampAngle(p.h, Math.atan2(p.faceX - p.x, p.faceZ - p.z), 3, dt); }
class EventManager {
  constructor(game) { this.g = game; this.ev = null; this.cool = rand(40, 70); this.list = []; }
  pickType() {
    const g = this.g, night = g.env.night > 0.5;
    const opts = Object.entries(EVENT_TYPES).filter(([k, t]) => !t.night || night).filter(([k]) => !(k === 'robbery' && night && Math.random() < 0.5));
    const wt = (k, t) => t.w * (k === 'accident' && g.env.rain > 0.5 ? 2 : 1) * (k === 'racers' && zoneAt(g.player.pos.x, g.player.pos.z).night > 1 ? 2 : 1);
    let sum = 0; for (const [k, t] of opts) sum += wt(k, t);
    let r = Math.random() * sum;
    for (const [k, t] of opts) { r -= wt(k, t); if (r <= 0) return k; }
    return 'accident';
  }
  update(dt) {
    const g = this.g, p = g.player;
    if (this.ev) { this.tick(dt); return; }
    if (g.state !== 'playing' || p.interior || g.police.level > 1) return;
    this.cool -= dt; if (this.cool > 0) return;
    this.cool = rand(55, 110);
    this.spawn(this.pickType());
  }
  spawn(type) {
    const g = this.g, p = g.player;
    const c = g.world.randomCurbSpot(p.pos.x, p.pos.z, 110, 210);
    if (g.inView(c.x, 1, c.z, 6) && Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < 140) return;
    const ev = { type, x: c.x, z: c.z, h: c.h, t: 0, cars: [], peds: [], seen: false, done: false, label: EVENT_TYPES[type].label };
    const car = (cls, x, z, h, o = {}) => { const v = g.vehicles.spawn(cls, x, z, h, o); v.mission = 'event'; v.touched = true; ev.cars.push(v); return v; };
    const ped = (x, z, kind = 'civ', look) => { const q = g.peds.make(kind, look || (kind === 'cop' ? copLook() : null)); q.x = x; q.z = z; q.y = groundY(x, z); q.state = 'free'; q.keep = true; q.brain = idleBrain; g.peds.peds.push(q); ev.peds.push(q); return q; };
    const side = (v, d) => v.toWorld(v.spec.w / 2 + d, 0);
    switch (type) {
      case 'pursuit': {
        const s = car(pick(['sedan', 'sports', 'compact', 'muscle']), c.x, c.z, c.h, { driver: 'npc', speed: 12 });
        s.drive = new DriveAI(s, g, 'flee'); s.drive.cruise = 22; const far = g.world.randomCurbSpot(c.x, c.z, 500, 900); s.drive.setGoal(far.x, far.z);
        const back = { x: c.x - Math.sin(c.h) * 14, z: c.z - Math.cos(c.h) * 14 };
        const cp = car('police', back.x, back.z, c.h, { driver: 'cop', speed: 12 });
        cp.siren = true; cp.drive = new DriveAI(cp, g, 'pursue'); cp.drive.cruise = 24;
        cp.drive.target = () => ({ x: s.pos.x, z: s.pos.z, speed: 24 }); cp.drive.targetRef = s;
        ev.suspect = s; break;
      }
      case 'racers': {
        for (let k = 0; k < 2; k++) {
          const v = car(pick(['sports', 'muscle', 'sports']), c.x - Math.sin(c.h) * k * 9 + Math.cos(c.h) * (k ? 2.6 : -2.6) * 0, c.z - Math.cos(c.h) * k * 9, c.h, { driver: 'npc', speed: 16 });
          v.drive = new DriveAI(v, g, 'cruise'); v.drive.cruise = 30; const far = g.world.randomCurbSpot(c.x, c.z, 500, 900); v.drive.setGoal(far.x, far.z);
        }
        break;
      }
      case 'accident': {
        const a = car(pick(['sedan', 'compact', 'suv']), c.x, c.z, c.h + 0.5, { parked: true });
        const b = car(pick(['van', 'pickup', 'taxi']), c.x + Math.sin(c.h) * 4.6, c.z + Math.cos(c.h) * 4.6, c.h + Math.PI - 0.7, { parked: true });
        for (const v of [a, b]) { v.health = 35; v.hazard = true; v.deform(0, v.spec.l / 2, 0, 1, 0.7); }
        for (let k = 0; k < 4; k++) { const w = side(a, 2 + k * 0.9); const q = ped(w.x + rand(-1.5, 1.5), w.z + rand(-1.5, 1.5)); q.faceX = a.pos.x; q.faceZ = a.pos.z; q.pose.phone = k === 0; }
        ev.smoke = { x: a.pos.x, z: a.pos.z };
        break;
      }
      case 'breakdown': {
        const v = car(pick(['compact', 'sedan', 'van']), c.x, c.z, c.h, { parked: true });
        v.hazard = true; v.health = 20;
        const w = side(v, 1.4); const q = ped(w.x, w.z); q.faceX = w.x + Math.sin(c.h); q.faceZ = w.z + Math.cos(c.h); q.wave = true;
        ev.stranded = q; ev.car = v;
        break;
      }
      case 'robbery': {
        const w = { x: c.x + Math.sin(c.h + Math.PI / 2) * 5, z: c.z + Math.cos(c.h + Math.PI / 2) * 5 };
        const thief = ped(w.x, w.z, 'civ', Object.assign(randomLook(), { shirt: C(0x111111), cap: C(0x111111) }));
        thief.brain = (q, dt) => {
          if (q.state === 'down' || q.state === 'ko') { ev.caught = true; return; }
          q.state = 'free'; const pp = g.player.pos; let dx = q.x - pp.x, dz = q.z - pp.z; const d = Math.hypot(dx, dz) || 1;
          if (d < 60) { q.vx = damp(q.vx, dx / d * 5.6, 4, dt); q.vz = damp(q.vz, dz / d * 5.6, 4, dt); } else { q.vx = damp(q.vx, 0, 2, dt); q.vz = damp(q.vz, 0, 2, dt); }
        };
        ev.thief = thief;
        const vic = ped(w.x + 3, w.z + 1); vic.faceX = w.x; vic.faceZ = w.z;
        break;
      }
      case 'abandoned': {
        const v = car(pick(['muscle', 'sports', 'offroad', 'classic', 'suv']), c.x, c.z, c.h, { parked: true });
        v.hazard = true; v.free = true; v.mission = null; v.origin = 'found'; ev.car = v;
        break;
      }
      case 'drop': {
        ev.bag = { x: c.x + Math.sin(c.h + Math.PI / 2) * 6.5, z: c.z + Math.cos(c.h + Math.PI / 2) * 6.5 };
        ev.mk = g.missions.markers.get(0x7fe08f, 0.8, false); ev.mk.g.position.set(ev.bag.x, groundY(ev.bag.x, ev.bag.z), ev.bag.z);
        break;
      }
      case 'streetfight': {
        const w = { x: c.x + Math.sin(c.h + Math.PI / 2) * 6, z: c.z + Math.cos(c.h + Math.PI / 2) * 6 };
        const a = ped(w.x, w.z), b2 = ped(w.x + 1.1, w.z + 0.3);
        a.opp = b2; b2.opp = a; a.brain = brawlBrain; b2.brain = brawlBrain; a.health = b2.health = 60;
        ev.fighters = [a, b2];
        for (let k = 0; k < 3; k++) { const q = ped(w.x + rand(-4, 4), w.z + rand(-4, 4)); q.faceX = w.x; q.faceZ = w.z; q.pose.phone = k === 0; }
        break;
      }
      case 'stop': {
        const v = car(pick(['sedan', 'compact', 'pickup']), c.x, c.z, c.h, { parked: true });
        const cp = car('police', c.x - Math.sin(c.h) * 7, c.z - Math.cos(c.h) * 7, c.h, { parked: true });
        cp.siren = true; v.hazard = true;
        const w = v.toWorld(-v.spec.w / 2 - 0.9, 0.6); const q = ped(w.x, w.z, 'cop'); q.faceX = v.pos.x; q.faceZ = v.pos.z;
        g.police.cops.push(q);
        break;
      }
    }
    this.ev = ev;
  }
  tick(dt) {
    const g = this.g, ev = this.ev, p = g.player, s = g.save;
    ev.t += dt;
    const d = Math.hypot(p.pos.x - ev.x, p.pos.z - ev.z);
    if (!ev.seen && d < 120 && !p.interior) {
      ev.seen = true;
      const t = EVENT_TYPES[ev.type];
      if (t.optional && !g.missions.active) g.ui.toast(`${t.label} nearby — ${t.optional.toLowerCase()} (optional).`);
    }
    if (ev.smoke && Math.random() < dt * 6) g.fx.puff(ev.smoke.x, 1.2, ev.smoke.z, [0.4, 0.4, 0.42]);
    if (ev.stranded && ev.stranded.wave) ev.stranded.pose.phone = Math.sin(g.time * 6) > 0;
    const pv = p.state === 'vehicle' ? p.vehicle : null;
    switch (ev.type) {
      case 'pursuit': {
        const sp = ev.suspect;
        if (sp && g.vehicles.list.includes(sp)) {
          ev.x = sp.pos.x; ev.z = sp.pos.z;
          if (sp.health <= 0 && !ev.done) { ev.done = true; this.reward(400, 15, 'Suspect stopped. The police send their thanks.'); }
          if (sp.drive && sp.drive.arrived) { const far = g.world.randomCurbSpot(sp.pos.x, sp.pos.z, 400, 800); sp.drive.setGoal(far.x, far.z); }
        }
        break;
      }
      case 'breakdown': {
        const q = ev.stranded;
        if (!ev.ride && q && g.peds.peds.includes(q) && q.state !== 'down' && pv && pv !== ev.car && pv.speed < 2 && Math.hypot(pv.pos.x - q.x, pv.pos.z - q.z) < 7 && !g.missions.active) {
          ev.ride = { v: pv, dest: g.world.randomCurbSpot(q.x, q.z, 250, 480), t: 120 };
          const i = g.peds.peds.indexOf(q); if (i >= 0) g.peds.peds.splice(i, 1);
          ev.stranded = null;
          ev.mk = g.missions.markers.get(0x7fe08f, 4, true); ev.mk.g.position.set(ev.ride.dest.x, groundY(ev.ride.dest.x, ev.ride.dest.z), ev.ride.dest.z);
          g.content.say('pv', 'Passenger: “Oh thank god. Can you take me to ' + districtNameAt(ev.ride.dest.x, ev.ride.dest.z) + '?”', 3.5);
          g.audio.play('door');
        }
        if (ev.ride) {
          ev.ride.t -= dt; ev.x = ev.ride.dest.x; ev.z = ev.ride.dest.z;
          this.objective = `Drop your passenger in ${districtNameAt(ev.ride.dest.x, ev.ride.dest.z)} (${Math.ceil(ev.ride.t)}s)`;
          if (!g.vehicles.list.includes(ev.ride.v) || ev.ride.v.burnt || ev.ride.t <= 0) { g.ui.toast('Your passenger gave up on you.', 'warn'); this.finish(); return; }
          if (pv === ev.ride.v && pv.speed < 3 && Math.hypot(pv.pos.x - ev.ride.dest.x, pv.pos.z - ev.ride.dest.z) < 8) {
            const w = pv.toWorld(pv.spec.w / 2 + 0.8, 0); const q2 = g.peds.make('civ'); q2.x = w.x; q2.z = w.z; q2.y = groundY(w.x, w.z); q2.state = 'flee'; q2.timer = 1; q2.fleeFrom = { x: pv.pos.x, z: pv.pos.z }; g.peds.peds.push(q2);
            this.reward(randi(15, 30) * 10, 10, 'Passenger: “You’re a lifesaver.”');
            this.objective = null; this.finish(); return;
          }
        }
        break;
      }
      case 'robbery': {
        if (ev.thief) { ev.x = ev.thief.x; ev.z = ev.thief.z; }
        if (ev.caught && !ev.done) {
          ev.done = true; ev.thief.keep = false;
          this.reward(250, 10, 'You got the cash back. The shopkeeper insists you keep a cut.');
        }
        break;
      }
      case 'streetfight': {
        if (ev.fighters && !ev.done) {
          const [a, b2] = ev.fighters;
          ev.x = a.x; ev.z = a.z;
          const down = ev.fighters.find(f => f.state === 'down');
          if (down) {
            ev.done = true;
            // the loser's wallet hits the pavement; whoever gets there first keeps it
            if (g.uw) g.uw.pickups.drop(down.x + 0.5, down.z, rand(20, 90));
            if (g.uw && g.uw.combatT > 0 && Math.hypot(p.pos.x - down.x, p.pos.z - down.z) < 12) this.reward(120, 6, 'You broke it up. A shopkeeper slips you something.');
          }
        }
        break;
      }
      case 'abandoned': {
        if (pv === ev.car && !ev.done) { ev.done = true; g.ui.toast('Keys in the ignition and nobody around. Finders keepers — store it to keep it.'); ev.car.mission = null; s.stats.eventsDone++; ev.cars = ev.cars.filter(v => v !== ev.car); }
        break;
      }
      case 'drop': {
        if (!ev.done && p.state === 'foot' && Math.hypot(p.pos.x - ev.bag.x, p.pos.z - ev.bag.z) < 1.5) {
          ev.done = true; g.missions.markers.release(ev.mk); ev.mk = null; g.audio.play('pickup');
          if (Math.random() < 0.7) { const cash = randi(20, 50) * 10; g.earn(cash, 'event'); g.ui.toast(`The bag is stuffed with cash: ${fmtMoney(cash)}.`, 'money'); }
          else { g.ui.toast('Evidence bags. Someone saw you take it…', 'warn'); g.police.addHeat(2, p.pos.x, p.pos.z); }
          s.stats.eventsDone++;
        }
        break;
      }
    }
    // wind down: far away, timed out or resolved and out of sight
    const far = d > 300 && !ev.ride;
    if (far || ev.t > 150 && !ev.ride || (ev.done && d > 80 && ev.t > 10)) this.finish();
  }
  reward(cash, rep, line) {
    const g = this.g; g.earn(cash, 'event'); g.content.addRep(rep); g.save.stats.eventsDone++;
    g.ui.toast(`${line} +${fmtMoney(cash)}`, 'money'); g.audio.play('confirm');
    if (g.save.stats.eventsDone >= 5) g.ach('samaritan');
  }
  finish() {
    const g = this.g, ev = this.ev; if (!ev) return;
    for (const v of ev.cars) if (g.vehicles.list.includes(v) && v !== g.player.vehicle && v !== g.player.lastVehicle) { if (Math.hypot(v.pos.x - g.player.pos.x, v.pos.z - g.player.pos.z) > 60 || !g.inView(v.pos.x, 1, v.pos.z, 3)) g.vehicles.despawn(v); else v.mission = null; }
      else if (g.vehicles.list.includes(v)) v.mission = null;
    for (const q of ev.peds) { q.keep = false; if (q.brain === idleBrain) { q.brain = null; q.state = 'rejoin'; const r = g.peds.projectRing(q.x, q.z); Object.assign(q, { bx: r.bx, bz: r.bz, o: r.o, t: r.t }); } }
    if (ev.mk) g.missions.markers.release(ev.mk);
    this.ev = null; this.objective = null;
  }
  clear() { if (this.ev) this.finish(); this.cool = rand(40, 70); }
}

