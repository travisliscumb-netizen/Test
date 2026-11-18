/* =====================================================================
   [CONTENT] THE SOUTHSHORE FAIRGROUND (owner, 2026-11-18; ISLAND.md §9)
   On the open plain between the airport's east fence and Longshore Drive,
   a short walk from the long beach: one level site (y FAIR.y) with
   - the midway west from the entrance arch (the Fair Office beside it),
     the car park and Fairground Way off Longshore Drive;
   - six rides: the Ferris wheel and the roller coaster (lift hill, a drop,
     a vertical loop, airtime hills, a helix) north of the midway; the
     pirate ship, the carousel and the drop tower south of it; the go-kart
     track (real karts you drive, 232/509d) in the south-west corner;
   - four carnival games in booths on the midway (509d);
   - two empty, level ride slots kept for rides to come (FAIR.spare).
   Every ride runs on the clock (a loading window, then the ride), as pure
   functions of the game's time, so the scenery (179) and the rides you
   board (509d) always agree. The structures that never move are district
   blocks (streamed like the island's); the moving parts are 179's.
   ===================================================================== */
const FAIR = {
  name: 'Southshore Fairground', y: 4.6, blend: 40,
  pad: { x0: 1490, z0: 1750, x1: 1862, z1: 2180 },
  // the midway (paved, 14 m) from the entrance arch west; the footpath from the car park up to the arch
  mid: { z: 1965, w: 14, x0: 1490, x1: 1862 },
  gate: { x: 1852, z: 1965 },
  // the car park outside the arch, beside Fairground Way's turning circle (its own level ground, at the fair's level)
  park: { x0: 1866, z0: 1984, x1: 1958, z1: 2064 },
  // the Fair Office outside the arch on the plaza's north side, its door toward the turning circle
  office: { x0: 1866, z0: 1932, x1: 1882, z1: 1946 },
  // the rides
  wheel: { x: 1785, z: 1912, r: 20, hub: 25, n: 16, period: 64, gap: 3.2 },
  coaster: { cars: 3, carLen: 2.7, lift: 5, boost: 6, dwell: 16 },
  drop: { x: 1655, z: 2012, h: 50, r: 3.6, load: 14, lift: 20, hold: 4, fall: 2.3, brake: 3.4, settle: 6 },
  carousel: { x: 1595, z: 2012, r: 8.5, n: 12, load: 14, run: 56 },
  ship: { x: 1527, z: 2012, arm: 12.5, len: 17, load: 14, run: 48, amp: 1.22, period: 6.4 },
  kart: { w: 8, step: 1, sfX: 1600, verts: [[1505, 2058, 9], [1702, 2058, 9], [1702, 2164, 9], [1645, 2164, 9], [1645, 2112, 9], [1590, 2112, 9], [1590, 2164, 9], [1505, 2164, 9]], booth: { x: 1690, z: 2040 }, grid: { x: 1640, z: 2058 } },
  // the carnival games' booths on the midway's south side (509d runs them): [id, x of the counter's middle]
  games: [['gallery', 1712], ['striker', 1738], ['rings', 1764], ['moles', 1790]],
  // level, open ground kept for the next rides (no structure, no path through them)
  spare: [[1725, 1758, 1852, 1888], [1700, 1996, 1832, 2094], [1716, 2100, 1856, 2176]]
};
// Fairground Way: off Longshore Drive north-west to a turning circle at the entrance arch, the car park beside it
const FAIR_ROAD = { id: 'fg1', name: 'Fairground Way', w: 9, grade: 0.07, ends: ['s4', 'ring'], ring: 9, ringAt: [1874, 1965], pts: [[2000, 2048], [1972, 2028], [1944, 2008], [1916, 1990], [1896, 1977], [1882, 1970]] };
ISLE_DISTRICT_ROADS.push(FAIR_ROAD); ISLE_ROADS.push(FAIR_ROAD);
function inFair(x, z, m = 0) { const p = FAIR.pad; return x > p.x0 - m && x < p.x1 + m && z > p.z0 - m && z < p.z1 + m; }
const FAIR_COL = { pave: 0xb9b1a2, path: 0xcfc6b4, asphalt: 0x2f3134, line: 0xeeeeea, kerbR: 0xc0392b, kerbW: 0xf2f2f2, red: 0xd23a2a, yellow: 0xf2c230, blue: 0x2471a3, white: 0xf4f2ec, green: 0x2e8b57, steel: 0x9aa3ab, dark: 0x2b2e33, wood: 0x8a5a33 };

/* ---------------------------------------------------------------------- the rides' clocks (pure functions of the time)
   Each returns where the ride is at time t (seconds of game time), and its phase: 'load' (stopped, boarding open,
   `left` seconds of it left) or 'run'. */
const FairClock = {
  // the Ferris wheel never stops: a turn every `period` seconds; gondola i's angle from the bottom
  wheel(t) { const W = FAIR.wheel; return { ang: (t / W.period) * Math.PI * 2 }; },
  gondolaAng(t, i) { const W = FAIR.wheel; return this.wheel(t).ang + i * Math.PI * 2 / W.n; },
  // the gondola nearest the bottom right now, and how far it is past it (radians, −π..π)
  bottomGondola(t) { const W = FAIR.wheel; let best = 0, bd = 9; for (let i = 0; i < W.n; i++) { const a = wrapPi(this.gondolaAng(t, i)); if (Math.abs(a) < Math.abs(bd)) { bd = a; best = i; } } return { i: best, off: bd }; },
  // the carousel: stopped to load, then a ride that runs up to a turn every 11 s and back down
  carousel(t) {
    const C = FAIR.carousel, cyc = C.load + C.run, c = ((t % cyc) + cyc) % cyc, n = Math.floor(t / cyc);
    // a turn takes 11 s at full speed; ramps of 6 s each end (the angle is the speed's integral)
    const w = Math.PI * 2 / 11, ramp = 6, R = C.run, perCycle = w * (R - ramp);
    if (c < C.load) return { phase: 'load', left: C.load - c, ang: n * perCycle, bob: 0, k: 0 };
    const u = c - C.load, k = u < ramp ? u / ramp : u > R - ramp ? (R - u) / ramp : 1;
    const ang = n * perCycle + (u < ramp ? w * u * u / (2 * ramp) : u > R - ramp ? w * (R - ramp) - w * (R - u) * (R - u) / (2 * ramp) : w * (u - ramp / 2));
    return { phase: 'run', left: R - u, ang, bob: u, k };
  },
  // the drop tower: load at the foot, a slow lift, a hold at the top, a free fall, the magnets, a settle back down
  drop(t) {
    const D = FAIR.drop, top = D.h - 6, low = 1.2, cyc = D.load + D.lift + D.hold + D.fall + D.brake + D.settle, c = ((t % cyc) + cyc) % cyc;
    if (c < D.load) return { phase: 'load', left: D.load - c, y: low, v: 0 };
    let u = c - D.load;
    if (u < D.lift) { const f = u / D.lift; return { phase: 'run', left: cyc - c, y: low + (top - low) * (f * f * (3 - 2 * f)), v: 0 }; }
    u -= D.lift; if (u < D.hold) return { phase: 'run', left: cyc - c, y: top, v: 0 };
    u -= D.hold; if (u < D.fall) { const y = top - 4.9 * u * u; return { phase: 'run', left: cyc - c, y, v: -9.8 * u }; }
    const yFall = top - 4.9 * D.fall * D.fall, vFall = 9.8 * D.fall;
    u -= D.fall; if (u < D.brake) { const a = vFall / D.brake, y = yFall - (vFall * u - a * u * u / 2); return { phase: 'run', left: cyc - c, y: Math.max(low + 4, y), v: -(vFall - a * u) }; }
    const yB = Math.max(low + 4, yFall - vFall * D.brake / 2);
    u -= D.brake; const f = Math.min(1, u / D.settle); return { phase: 'run', left: cyc - c, y: yB + (low - yB) * (f * f * (3 - 2 * f)), v: 0 };
  },
  // the pirate ship: load level, then the swing builds, holds and dies away (angle about its pivot, + toward +x)
  ship(t) {
    const S = FAIR.ship, cyc = S.load + S.run, c = ((t % cyc) + cyc) % cyc;
    if (c < S.load) return { phase: 'load', left: S.load - c, a: 0 };
    const u = c - S.load, up = 18, down = 14, A = S.amp * (u < up ? u / up : u > S.run - down ? (S.run - u) / down : 1);
    return { phase: 'run', left: S.run - u, a: A * Math.sin(u / S.period * Math.PI * 2) };
  },
  // the roller coaster: a dwell in the station, then the run (fairCoaster().motion: where the train is, s, by time)
  coaster(t) {
    const C = fairCoaster(), cyc = FAIR.coaster.dwell + C.runT, c = ((t % cyc) + cyc) % cyc;
    if (c < FAIR.coaster.dwell) return { phase: 'load', left: FAIR.coaster.dwell - c, s: C.s0 };
    const u = c - FAIR.coaster.dwell, i = Math.min(C.motion.length - 1, Math.floor(u / C.dt)), f = u / C.dt - i, a = C.motion[i], b = C.motion[Math.min(C.motion.length - 1, i + 1)];
    return { phase: 'run', left: C.runT - u, s: a.s + (b.s - a.s) * f, v: a.v + (b.v - a.v) * f };
  }
};

/* ---------------------------------------------------------------------- the roller coaster's track
   A closed Catmull-Rom curve through the control points (x, z, height over the pad), resampled every 0.5 m; a
   frame at every sample (the tangent, parallel-transported normal and binormal, then banked by the speed through
   the curve); the run simulated once (the chain up the lift, then gravity less rolling friction, the brakes into
   the station), tabulated every 1/20 s. */
const FAIR_COASTER_PTS = [
  [1568, 1941, 1.6], [1600, 1941, 1.6], [1628, 1941, 1.6], [1662, 1937, 1.9], [1690, 1922, 2.6], [1700, 1898, 4.5],
  [1701, 1866, 14], [1701, 1834, 24.5], [1700, 1806, 31], [1693, 1784, 32.5], [1676, 1770, 32], [1655, 1767, 28.5],
  [1632, 1770, 16], [1610, 1774, 4.2], [1596, 1777, 3.6], [1586, 1778, 3.6],
  // the vertical loop: a circle in the upright plane heading west (FAIR_LOOP), drifting 4 m south on the way round
  'loop',
  [1562, 1782, 3.6], [1550, 1786, 5],
  // airtime hills west, then south
  [1538, 1792, 10.5], [1524, 1803, 4], [1510, 1818, 5.5], [1503, 1842, 13], [1505, 1866, 4.5],
  // the helix round to the east, and the brake run into the station
  [1515, 1890, 7.5], [1538, 1902, 6], [1556, 1893, 5], [1552, 1876, 3.6], [1532, 1880, 3.2], [1516, 1903, 2.6], [1524, 1928, 2.2], [1544, 1940, 1.8]
];
// the loop: its lowest point (x, z, height over the pad) where the track enters it heading west, radius r, and how far
// south the track has drifted when it comes out at the bottom again
const FAIR_LOOP = { x: 1574, z: 1778, y: 3.6, r: 8.5, drift: 4 };
function fairLoopPts() {
  const L = FAIR_LOOP, out = [], m = Math.ceil(Math.PI * 2 * L.r / 1.2);
  for (let i = 1; i < m; i++) { const th = i / m * Math.PI * 2; out.push([L.x - L.r * Math.sin(th), L.z + L.drift * i / m, L.y + L.r - L.r * Math.cos(th)]); }
  return out;
}
let _fairCoaster = null;
function fairCoaster() {
  if (_fairCoaster) return _fairCoaster;
  const Y = FAIR.y, P0 = FAIR_COASTER_PTS.flatMap(p => p === 'loop' ? fairLoopPts() : [p]).map(p => new THREE.Vector3(p[0], Y + p[2], p[1])), curve = new THREE.CatmullRomCurve3(P0, true, 'centripetal');
  const len = curve.getLength(), n = Math.round(len / 0.5), pts = curve.getSpacedPoints(n).slice(0, n), ds = len / n;
  const T = pts.map((p, i) => pts[(i + 1) % n].clone().sub(pts[(i - 1 + n) % n]).normalize());
  // the track's up: level everywhere (the world's up, square to the track: no roll) except round the loop, where it
  // points at the loop's centre (upright at the bottom, upside down over the top: the same at both ends, so no seam)
  const up0 = new THREE.Vector3(0, 1, 0), level = t => up0.clone().sub(t.clone().multiplyScalar(up0.dot(t))).normalize(), FL = FAIR_LOOP;
  const nearest = (x, y, z) => { let b = 0, bd = Infinity; for (let i = 0; i < n; i++) { const d = Math.hypot(pts[i].x - x, pts[i].y - y, pts[i].z - z); if (d < bd) { bd = d; b = i; } } return b; };
  const la = nearest(FL.x, Y + FL.y, FL.z), lb = nearest(FL.x, Y + FL.y, FL.z + FL.drift), N = T.map(level);
  for (let i = la + 1; i < lb; i++) { const p = pts[i], u = new THREE.Vector3(FL.x - p.x, Y + FL.y + FL.r - p.y, 0); u.sub(T[i].clone().multiplyScalar(u.dot(T[i]))); if (u.lengthSq() > 1e-6) N[i] = u.normalize(); }
  // the lift: from where the track leaves the station's level on the way up to the crest
  const crest = pts.reduce((b, p, i) => p.y > pts[b].y ? i : b, 0);
  let lift0 = 0; for (let i = crest; i > 0; i--) if (pts[i].y < Y + 4.6) { lift0 = i; break; }
  // the train stands with its nose at the station's far end; a run is one lap from there back to it
  const st0 = pts.reduce((b, p, i) => Math.abs(p.z - 1941) < 1 && Math.abs(p.x - 1622) < Math.abs(pts[b].x - 1622) ? i : b, 0), s0 = st0 * ds, sEnd = s0 + len;
  // the run: out of the station on the booster tyres (FAIR.coaster.boost) round to the chain, the chain at
  // FAIR.coaster.lift, gravity less rolling friction, the brakes down to a crawl over the last 36 m and a stop exactly
  // at the platform (s as distance travelled, s0 → sEnd)
  const g = 9.81, mu = 0.018, vLift = FAIR.coaster.lift, motion = [], dt = 0.05, liftA = lift0 * ds + (lift0 < st0 ? len : 0), crestA = crest * ds + (crest < st0 ? len : 0);
  const yAt = s2 => { const f = ((s2 / ds) % n + n) % n, i = Math.floor(f), j = (i + 1) % n, k = f - i; return pts[i].y + (pts[j].y - pts[i].y) * k; };
  let s = s0, v = 0.4, time = 0;
  while (s < sEnd && time < 400) {
    motion.push({ s, v });
    if (s < liftA) v = Math.min(v + 1.4 * dt, FAIR.coaster.boost, s > liftA - 12 ? Math.max(vLift, v - 2 * dt) : Infinity);
    else if (s <= crestA) v = vLift;
    else {
      const e = v * v + 2 * g * (yAt(s) - yAt(s + v * dt)) - 2 * mu * g * v * dt;
      v = Math.sqrt(Math.max(0.81, e));
      const left = sEnd - s;
      if (left < 36) v = Math.min(v, Math.max(0.5, 1.4 * Math.min(1, left / 6)), Math.max(1.4, v - 5 * dt));
    }
    s = Math.min(sEnd, s + v * dt); time += dt;
  }
  motion.push({ s: sEnd, v: 0 });
  // bank into the turns by the speed (tan β = v²κ / g, toward the inside), smoothed along the track
  const vAt = new Float32Array(n); for (const m of motion) vAt[Math.floor(((m.s / ds) % n + n) % n) % n] = m.v;
  for (let i = 1; i < n; i++) if (!vAt[i]) vAt[i] = vAt[i - 1];
  const bank = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // the curvature in plan (the turn of the tangent over 8 samples, + to the left) banks the track toward the inside
    const a = T[(i - 4 + n) % n], b = T[(i + 4) % n], kap = (a.z * b.x - a.x * b.z) / (8 * ds), level = Math.abs(T[i].y) < 0.6 && N[i].y > 0.5;
    bank[i] = level && (i <= la - 10 || i >= lb + 10) ? clamp(Math.atan(vAt[i] * vAt[i] * kap / g), -1.05, 1.05) : 0;
  }
  const sm = new Float32Array(n); for (let i = 0; i < n; i++) { let a = 0; for (let d = -10; d <= 10; d++) a += bank[(i + d + n) % n]; sm[i] = a / 21; }
  const U = N.map((nv, i) => nv.clone().applyAxisAngle(T[i], sm[i]));
  _fairCoaster = { pts, T, U, n, ds, len, crest, lift0, la, lb, motion, dt, runT: (motion.length - 1) * dt, s0, ymax: pts[crest].y };
  return _fairCoaster;
}
// where on the track arc length s is: position, tangent and up (interpolated between samples)
function fairCoasterAt(s, out) {
  const C = fairCoaster(), f = ((s / C.ds) % C.n + C.n) % C.n, i = Math.floor(f), j = (i + 1) % C.n, k = f - i;
  out.p.copy(C.pts[i]).lerp(C.pts[j], k); out.t.copy(C.T[i]).lerp(C.T[j], k).normalize(); out.u.copy(C.U[i]).lerp(C.U[j], k).normalize();
  return out;
}
// where a rider sits on a ride at time t: { p (the seat, world), f (facing), u (up) } (THREE vectors in `out`).
// k: the gondola for the wheel; the seat on the others is fixed (the best one: the coaster's front car, the ship's
// stern row facing midships, the tower's seat facing the sea, a carousel horse on the outside ring)
const _fs = { a: null, b: null };
function fairSeat(id, t, k, out) {
  const Y = FAIR.y, V = THREE.Vector3; out.p = out.p || new V(); out.f = out.f || new V(); out.u = out.u || new V();
  if (id === 'wheel') {
    const W = FAIR.wheel, a = FairClock.gondolaAng(t, k);
    out.p.set(W.x + Math.sin(a) * W.r, Y + W.hub - Math.cos(a) * W.r - 2.65, W.z); out.f.set(1, 0, 0); out.u.set(0, 1, 0);
  } else if (id === 'carousel') {
    // (horse 1 of FAIR.carousel.n: its angle on the platform and its own phase in the up-and-down, as 179 draws it)
    const C = FAIR.carousel, st = FairClock.carousel(t), th = st.ang + Math.PI * 2 / C.n, r = C.r - 1.5;
    out.p.set(C.x + Math.sin(th) * r, Y + 0.5 + 1.4 + 0.35 + (st.phase === 'run' ? 0.32 * Math.sin(st.bob * 2.4 + 1.3) : 0), C.z + Math.cos(th) * r);
    out.f.set(Math.cos(th), 0, -Math.sin(th)); out.u.set(0, 1, 0);
  } else if (id === 'drop') {
    const D = FAIR.drop, st = FairClock.drop(t);
    out.p.set(D.x + D.r + 0.4, Y + st.y + 0.55, D.z); out.f.set(1, 0, 0); out.u.set(0, 1, 0);
  } else if (id === 'ship') {
    const S = FAIR.ship, a = FairClock.ship(t).a, py = Y + S.arm + 2.2, lx = S.len / 2 - 2.2, ly = -(S.arm - 0.9);
    // the stern row (east end) in the ship's frame, turned by the swing about the pivot (an axis along z)
    const c = Math.cos(a), sn = Math.sin(a);
    out.p.set(S.x + lx * c - ly * sn, py + lx * sn + ly * c, S.z); out.f.set(-c, -sn, 0); out.u.set(-sn, c, 0);
  } else if (id === 'coaster') {
    const st = FairClock.coaster(t); _fs.a = _fs.a || { p: new V(), t: new V(), u: new V() };
    fairCoasterAt(st.s, _fs.a); out.p.copy(_fs.a.p).addScaledVector(_fs.a.u, 0.95); out.f.copy(_fs.a.t); out.u.copy(_fs.a.u);
  }
  return out;
}
// the go-kart track's centreline (filletLoop: straights and constant-radius corners) with the start/finish sample
function fairKartLine() {
  const K = FAIR.kart, T = filletLoop(K.verts, K.step);
  if (!T.sf) { const k = T.pts.reduce((b, p, i) => Math.abs(p[1] - K.verts[0][1]) < 0.6 && Math.abs(p[0] - K.sfX) < Math.abs(T.pts[b][0] - K.sfX) ? i : b, 0); T.sf = { k, x: T.pts[k][0], z: T.pts[k][1] }; }
  return T;
}

Object.assign(World.prototype, {
  // the level site, before the roads find their level (127 calls this)
  // (after the airport's and the proving ground's: strongest last, so their easing out never tilts the fair's edges)
  _fairPad() { const p = FAIR.pad, k = FAIR.park; Island.addPad(p.x0, p.z0, p.x1, p.z1, FAIR.y, FAIR.blend); Island.addPad(p.x1, 1926, k.x1 + 4, k.z1 + 4, FAIR.y, 30); },
  _genFairground() {
    const Y = FAIR.y, F = FAIR;
    const fair = this.fair = { kart: fairKartLine(), coaster: fairCoaster(), barriers: [], rides: {}, games: [], folk: [] };
    const B = {
      gate: this._isleBlock('fair_gate', 1800, 1975, 160, F.name),
      north: this._isleBlock('fair_north', 1610, 1850, 260, F.name + ' · roller coaster'),
      wheel: this._isleBlock('fair_wheel', 1785, 1912, 140, F.name + ' · Ferris wheel'),
      south: this._isleBlock('fair_south', 1595, 2015, 200, F.name),
      kart: this._isleBlock('fair_kart', 1600, 2110, 220, F.name + ' · go-karts'),
      park: this._isleBlock('fair_park', 1912, 2024, 120, F.name + ' · car park')
    };
    const wall = (x0, z0, x1, z1, y1 = 2.2) => this.grid.add({ x0, z0, x1, z1, y0: Y - 3, y1: Y + y1, kind: 'wall' });
    const post = (b, x, z, h, col = FAIR_COL.steel, r = 0.18) => this._det(b, 'cyl', x, Y + h / 2, z, r, h, C(col), null, { x, z, r: r + 0.1, y0: Y - 1, y1: Y + h, kind: 'det' });
    // ---------------------------------------------------------------- the perimeter fence: open at the arch and the car park's way in
    {
      const p = F.pad, h = 2.1, col = C(0x3b4148), runs = [];
      runs.push([p.x0, p.z0, p.x1, p.z0], [p.x0, p.z0, p.x0, p.z1], [p.x0, p.z1, p.x1, p.z1]);
      // the east side: open only at the arch (the midway), where Fairground Way and the car park are
      runs.push([p.x1, p.z0, p.x1, F.mid.z - F.mid.w / 2 - 1], [p.x1, F.mid.z + F.mid.w / 2 + 1, p.x1, p.z1]);
      for (const [x0, z0, x1, z1] of runs) {
        const L = Math.hypot(x1 - x0, z1 - z0), ns = x0 === x1;
        // (in whichever of the fair's blocks stands nearest the run's middle: they stream with it)
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, near = Object.values(B).reduce((q, b2) => Math.hypot(b2.cx - mx, b2.cz - mz) < Math.hypot(q.cx - mx, q.cz - mz) ? b2 : q);
        this._det(near, 'box', (x0 + x1) / 2, Y + h / 2, (z0 + z1) / 2, ns ? 0.08 : L, h, ns ? L : 0.08, col);
        wall(Math.min(x0, x1) - 0.1, Math.min(z0, z1) - 0.1, Math.max(x0, x1) + 0.1, Math.max(z0, z1) + 0.1, h);
      }
    }
    // ---------------------------------------------------------------- the entrance arch over the midway, the Fair Office, the lamps
    {
      const gx = F.gate.x, z0 = F.mid.z - F.mid.w / 2 - 0.6, z1 = F.mid.z + F.mid.w / 2 + 0.6;
      for (const z of [z0, z1]) { this._det(B.gate, 'box', gx, Y + 4.5, z, 1.2, 9, 1.2, C(FAIR_COL.red), 0, { x0: gx - 0.6, x1: gx + 0.6, z0: z - 0.6, z1: z + 0.6, y0: Y - 1, y1: Y + 9, kind: 'det' }); this._det(B.gate, 'cone', gx, Y + 9.9, z, 0.9, 1.8, 0.9, C(FAIR_COL.yellow)); }
      this._det(B.gate, 'box', gx, Y + 8.2, F.mid.z, 1.0, 2.2, z1 - z0, C(FAIR_COL.blue));
      B.gate.signs.push({ text: 'SOUTHSHORE FAIR', x: gx + 0.52, y: Y + 8.2, z: F.mid.z, ry: Math.PI / 2, w: 13, h: 1.7, bg: '#2471a3', fg: '#ffd84d' });
      B.gate.signs.push({ text: 'SOUTHSHORE FAIR', x: gx - 0.52, y: Y + 8.2, z: F.mid.z, ry: -Math.PI / 2, w: 13, h: 1.7, bg: '#2471a3', fg: '#ffd84d' });
      for (let k = 0; k < 9; k++) B.gate.fx.push({ type: 'neon', x: gx + 0.56, y: Y + 9.45, z: z0 + 1.5 + k * ((z1 - z0 - 3) / 8), w: 0.12, h: 0.3, d: 0.3, c: [0xffd84d, 0xff4a4a, 0x4ab3ff][k % 3] });
      const O = F.office;
      this._bld(B.gate, O.x0, O.z0, O.x1, O.z1, 5.5, STYLE.SHOP, 0xf4f2ec, 5.5, 3, { exactH: true, y0: Y, oy: Y });
      B.gate.signs.push({ text: 'FAIR OFFICE', x: (O.x0 + O.x1) / 2, y: Y + 4.3, z: O.z1 + 0.06, ry: 0, w: 9, h: 1.1, bg: '#d23a2a', fg: '#ffffff' });
      this._det(B.gate, 'box', (O.x0 + O.x1) / 2, Y + 1.2, O.z1 + 0.06, 1.4, 2.4, 0.12, C(0x22262b));
      B.gate.place = { id: 'fair', name: F.name, kind: 'landmark', door: { x: (O.x0 + O.x1) / 2, z: O.z1 + 1.1, h: 0 }, under: { x: (O.x0 + O.x1) / 2, z: (O.z0 + O.z1) / 2 } };
      // lamps along the midway and the footpath; strings of bulbs over the midway
      for (let x = F.mid.x0 + 18; x < F.mid.x1 - 12; x += 36) for (const s of [-1, 1]) this._prop(x < 1700 ? B.north : B.gate, 'lotlamp', x, F.mid.z + s * (F.mid.w / 2 + 0.8), s > 0 ? Math.PI : 0);
      // bunting across the midway between each pair of lamps: a sagging wire with eleven pennants
      for (let x = F.mid.x0 + 18; x < F.mid.x1 - 12; x += 36) {
        const b = x < 1700 ? B.north : B.gate, za = F.mid.z - F.mid.w / 2 - 0.8, zb = F.mid.z + F.mid.w / 2 + 0.8, top = Y + 5.6, sag = 1.1, n = 12;
        const yAt = f => top - sag * 4 * f * (1 - f);
        for (let k = 0; k < n; k++) { const f0 = k / n, f1 = (k + 1) / n, z0 = za + (zb - za) * f0, z1 = za + (zb - za) * f1, y0 = yAt(f0), y1 = yAt(f1); b.det.push({ kind: 'box', x, y: (y0 + y1) / 2, z: (z0 + z1) / 2, sx: 0.03, sy: 0.03, sz: Math.hypot(z1 - z0, y1 - y0), color: C(0x2b2e33), ry: 0, rx: Math.atan2(y0 - y1, z1 - z0), rz: 0 }); }
        for (let k = 1; k < n; k++) { const f = k / n, z = za + (zb - za) * f; b.det.push({ kind: 'cone', x, y: yAt(f) - 0.28, z, sx: 0.24, sy: 0.5, sz: 0.04, color: C([0xffd84d, 0xd23a2a, 0x2471a3, 0x2e8b57, 0xe056fd][(k + Math.floor(x / 36)) % 5]), ry: 0, rx: Math.PI, rz: 0 }); }
      }
      // two food stands on the midway's north side
      for (const [x, txt, c] of [[1736, 'HOT DOGS', 0xd23a2a], [1702, 'CANDY FLOSS', 0xe056fd]]) {
        this._bld(B.gate, x - 4, F.mid.z - F.mid.w / 2 - 7, x + 4, F.mid.z - F.mid.w / 2 - 1.5, 3.2, STYLE.IND, 0xf4f2ec, 3.2, 3, { exactH: true, y0: Y, oy: Y });
        this._det(B.gate, 'box', x, Y + 3.5, F.mid.z - F.mid.w / 2 - 1.2, 8.6, 0.25, 1.4, C(c));
        B.gate.signs.push({ text: txt, x, y: Y + 2.6, z: F.mid.z - F.mid.w / 2 - 1.44, ry: 0, w: 6, h: 0.8, bg: '#' + c.toString(16).padStart(6, '0'), fg: '#ffffff' });
      }
    }
    // ---------------------------------------------------------------- the Ferris wheel: two A-frames, the platform (the wheel turns in 179)
    {
      const W = F.wheel, hubY = Y + W.hub;
      for (const dz of [-W.gap / 2 - 1.4, W.gap / 2 + 1.4]) for (const sx of [-1, 1]) {
        const fx = W.x + sx * 9, fz = W.z + dz, L = Math.hypot(9, W.hub), a = Math.atan2(9, W.hub);
        B.wheel.det.push({ kind: 'box', x: (fx + W.x) / 2, y: Y + W.hub / 2, z: fz, sx: 0.7, sy: L, sz: 0.7, color: C(FAIR_COL.white), ry: 0, rx: 0, rz: -sx * a });
        this.grid.add({ x: fx, z: fz, r: 0.6, y0: Y - 1, y1: Y + 3, kind: 'det' });
      }
      this._det(B.wheel, 'cylr', W.x, hubY, W.z, 0.9, W.gap + 4, 0.9, C(FAIR_COL.steel), Math.PI / 2);
      // the boarding platform at the bottom (its steps toward the midway) and the queue rail
      // (its top level with the bottom gondola's floor: the hub less the radius, less the cabin's 3.1 m drop)
      const ph = W.hub - W.r - 3.1;
      this._det(B.wheel, 'box', W.x, Y + ph / 2, W.z + 5, 8, ph, 6, C(0xd8d2c4), 0, { x0: W.x - 4, x1: W.x + 4, z0: W.z + 2, z1: W.z + 8, y0: Y - 1, y1: Y + ph, kind: 'det' });
      for (let k = 0; k < 6; k++) this._det(B.wheel, 'box', W.x, Y + 0.15 + k * ph / 6, W.z + 8.4 + (5 - k) * 0.35, 3, ph / 6, 0.36, C(0xd8d2c4));
      B.wheel.signs.push({ text: 'FERRIS WHEEL', x: W.x, y: Y + 3.6, z: W.z + 8.1, ry: 0, w: 7, h: 0.9, bg: '#2471a3', fg: '#ffffff' });
      this._det(B.wheel, 'box', W.x, Y + 3.0, W.z + 8.1, 0.2, 1.8, 0.2, C(FAIR_COL.steel));
      fair.rides.wheel = { id: 'wheel', name: 'Ferris Wheel', at: { x: W.x, z: W.z + 9.6, h: Math.PI }, exit: { x: W.x + 3, z: W.z + 10.4, h: 0 } };
    }
    // ---------------------------------------------------------------- the roller coaster: the station, the supports (the track and train are 179's)
    {
      const CO = fair.coaster, sx0 = 1564, sx1 = 1632, sz = 1941;
      this._bld(B.north, sx0, sz + 2.2, sx1, sz + 6.4, 1.2, STYLE.IND, 0xd8d2c4, 1.2, 3, { exactH: true, y0: Y, oy: Y });
      for (const x of [sx0 + 2, (sx0 + sx1) / 2, sx1 - 2]) for (const z of [sz - 2.4, sz + 6]) this._det(B.north, 'box', x, Y + 2.6, z, 0.35, 5.2, 0.35, C(FAIR_COL.steel), 0, true);
      this._det(B.north, 'box', (sx0 + sx1) / 2, Y + 5.4, sz + 1.8, sx1 - sx0 + 2, 0.4, 10, C(FAIR_COL.red));
      B.north.signs.push({ text: 'THE RIPTIDE', x: (sx0 + sx1) / 2, y: Y + 6.4, z: sz + 6.9, ry: 0, w: 12, h: 1.6, bg: '#d23a2a', fg: '#ffd84d' });
      // supports: a column down from the track every ~6 m where the track is right way up and above head height
      const used = [];
      for (let i = 0; i < CO.n; i += 12) {
        const p = CO.pts[i], u = CO.U[i]; if (u.y < 0.5 || p.y - Y < 2.6) continue;
        if (used.some(q => Math.hypot(q[0] - p.x, q[1] - p.z) < 3)) continue; used.push([p.x, p.z]);
        // nothing of the track passes under this point (the loop's inside, the helix)
        let under = false; for (let j = 0; j < CO.n; j += 3) { const q = CO.pts[j]; if (Math.abs(j - i) > 20 && q.y < p.y - 2 && Math.hypot(q.x - p.x, q.z - p.z) < 1.6) { under = true; break; } }
        if (under) continue;
        const h = p.y - 0.55 - Y;
        this._det(B.north, 'box', p.x, Y + h / 2, p.z, 0.42, h, 0.42, C(0xe8e4da), 0, { x: p.x, z: p.z, r: 0.35, y0: Y - 1, y1: Y + h, kind: 'det' });
        if (h > 12) for (const dx of [-1, 1]) B.north.det.push({ kind: 'box', x: p.x + dx * h * 0.09, y: Y + h * 0.3, z: p.z, sx: 0.26, sy: h * 0.62, sz: 0.26, color: C(0xe8e4da), ry: 0, rx: 0, rz: -dx * 0.28 });
      }
      // (its gate on the forecourt at the foot of the platform's steps)
      for (let k = 0; k < 4; k++) this._det(B.north, 'box', 1606, Y + 0.15 + k * 0.3, sz + 6.75 + (3 - k) * 0.35, 3, 0.3, 0.36, C(0xd8d2c4));
      fair.rides.coaster = { id: 'coaster', name: 'The Riptide', at: { x: 1606, z: sz + 8.4, h: Math.PI }, exit: { x: 1614, z: sz + 9.2, h: 0 } };
    }
    // ---------------------------------------------------------------- the pirate ship: its two A-frames (the ship swings in 179)
    {
      const S = F.ship, pivY = Y + S.arm + 2.2;
      for (const dz of [-5.2, 5.2]) for (const sx of [-1, 1]) {
        const fx = S.x + sx * 6.5, fz = S.z + dz, L = Math.hypot(6.5, S.arm + 2.2), a = Math.atan2(6.5, S.arm + 2.2);
        B.south.det.push({ kind: 'box', x: (fx + S.x) / 2, y: Y + (S.arm + 2.2) / 2, z: fz, sx: 0.6, sy: L, sz: 0.6, color: C(FAIR_COL.dark), ry: 0, rx: 0, rz: -sx * a });
        this.grid.add({ x: fx, z: fz, r: 0.5, y0: Y - 1, y1: Y + 3, kind: 'det' });
      }
      this._det(B.south, 'cylr', S.x, pivY, S.z, 0.5, 11, 0.5, C(FAIR_COL.steel), Math.PI / 2);
      this._det(B.south, 'box', S.x, Y + 0.5, S.z + 7.6, 6, 1.0, 3, C(0xd8d2c4), 0, { x0: S.x - 3, x1: S.x + 3, z0: S.z + 6.1, z1: S.z + 9.1, y0: Y - 1, y1: Y + 1, kind: 'det' });
      B.south.signs.push({ text: 'JOLLY ROGER', x: S.x, y: Y + 2.6, z: S.z + 9.2, ry: 0, w: 6, h: 0.9, bg: '#2b2e33', fg: '#ffd84d' });
      fair.rides.ship = { id: 'ship', name: 'The Jolly Roger', at: { x: S.x, z: S.z + 10.2, h: Math.PI }, exit: { x: S.x + 4, z: S.z + 10.6, h: 0 } };
    }
    // ---------------------------------------------------------------- the carousel's base (it turns in 179) and the drop tower
    {
      const R = F.carousel;
      this._det(B.south, 'cyl', R.x, Y + 0.25, R.z, R.r + 0.8, 0.5, C(0xd8d2c4), null, { x: R.x, z: R.z, r: R.r + 0.8, y0: Y - 1, y1: Y + 0.5, kind: 'det' });
      B.south.signs.push({ text: 'CAROUSEL', x: R.x, y: Y + 1.6, z: R.z + R.r + 2.4, ry: 0, w: 5, h: 0.8, bg: '#e056fd', fg: '#ffffff' });
      this._det(B.south, 'box', R.x, Y + 0.8, R.z + R.r + 2.4, 0.15, 1.6, 0.15, C(FAIR_COL.steel));
      fair.rides.carousel = { id: 'carousel', name: 'The Carousel', at: { x: R.x, z: R.z + R.r + 1.4, h: Math.PI }, exit: { x: R.x + 3, z: R.z + R.r + 2.8, h: 0 } };
      const D = F.drop;
      this._det(B.south, 'box', D.x, Y + D.h / 2, D.z, 2.4, D.h, 2.4, C(FAIR_COL.dark), 0, { x0: D.x - 1.2, x1: D.x + 1.2, z0: D.z - 1.2, z1: D.z + 1.2, y0: Y - 1, y1: Y + D.h, kind: 'det' });
      this._det(B.south, 'cyl', D.x, Y + D.h + 1, D.z, 2.2, 2, C(FAIR_COL.red));
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; B.south.fx.push({ type: 'neon', x: D.x + Math.sin(a) * 2.25, y: Y + D.h + 1.2, z: D.z + Math.cos(a) * 2.25, w: 0.3, h: 0.3, d: 0.3, c: k % 2 ? 0xffd84d : 0xff4a4a }); }
      this._det(B.south, 'cyl', D.x, Y + 0.3, D.z, D.r + 3.2, 0.6, C(0xd8d2c4), null, { x: D.x, z: D.z, r: D.r + 2.4, y0: Y - 1, y1: Y + 0.6, kind: 'det' });
      B.south.signs.push({ text: 'FREEFALL', x: D.x, y: Y + 1.6, z: D.z + D.r + 4.6, ry: 0, w: 5, h: 0.8, bg: '#2b2e33', fg: '#ff4a4a' });
      this._det(B.south, 'box', D.x, Y + 0.8, D.z + D.r + 4.6, 0.15, 1.6, 0.15, C(FAIR_COL.steel));
      fair.rides.drop = { id: 'drop', name: 'Freefall', at: { x: D.x, z: D.z + D.r + 3.6, h: Math.PI }, exit: { x: D.x + 3, z: D.z + D.r + 5, h: 0 } };
    }
    // ---------------------------------------------------------------- the carnival games' booths on the midway's south side
    for (const [id, x] of F.games) {
      const z0 = F.mid.z + F.mid.w / 2 + 1.2, z1 = z0 + 7, col = { gallery: 0x2471a3, striker: 0xd23a2a, rings: 0x2e8b57, moles: 0xe08a1e }[id];
      const label = { gallery: 'SHOOTING GALLERY', striker: 'HIGH STRIKER', rings: 'RING TOSS', moles: 'WHACK-A-MOLE' }[id];
      this._bld(B.gate, x - 4.2, z0 + 1.2, x + 4.2, z1, 3.4, STYLE.IND, 0xf4f2ec, 3.4, 3, { exactH: true, y0: Y, oy: Y });
      this._det(B.gate, 'box', x, Y + 0.55, z0 + 0.7, 8.4, 1.1, 1.0, C(col), 0, { x0: x - 4.2, x1: x + 4.2, z0: z0 + 0.2, z1: z0 + 1.2, y0: Y - 1, y1: Y + 1.1, kind: 'det' });
      for (let k = 0; k < 8; k++) this._det(B.gate, 'box', x - 3.675 + k * 1.05, Y + 3.75, z0 + 0.5, 1.05, 0.7, 1.6, C(k % 2 ? 0xffffff : col), 0);
      B.gate.signs.push({ text: label, x, y: Y + 4.45, z: z0 + 1.31 - 1.0, ry: 0, w: 7.4, h: 0.7, bg: '#' + col.toString(16).padStart(6, '0'), fg: '#ffffff' });
      fair.games.push({ id, x, z: z0 - 0.6, h: Math.PI });
    }
    // ---------------------------------------------------------------- the go-kart track: tyre walls both sides, its booth and grid
    {
      const T = fair.kart, half = F.kart.w / 2, N2 = T.pts.length;
      for (const side of [1, -1]) {
        const line = [];
        for (let k = 0; k < N2; k++) { const p = T.pts[k], nl = T.nl[k], o = half + 1.4; line.push([p[0] + nl[0] * side * o, p[1] + nl[1] * side * o]); }
        // the inside of a tight corner: the barrier pulls in to a single point; keep only samples that don't fold back
        fair.barriers.push(line);
        for (let k = 0; k < N2; k += 2) this.grid.add({ x: line[k][0], z: line[k][1], r: 0.55, y0: Y - 1, y1: Y + 0.9, kind: 'det', barrier: true });
      }
      const Kb = F.kart.booth;
      this._bld(B.kart, Kb.x - 6, Kb.z - 4, Kb.x + 6, Kb.z + 3, 3.4, STYLE.IND, 0xf2c230, 3.4, 3, { exactH: true, y0: Y, oy: Y });
      B.kart.signs.push({ text: 'GO-KARTS', x: Kb.x, y: Y + 2.7, z: Kb.z - 4.06, ry: Math.PI, w: 7, h: 1.0, bg: '#111418', fg: '#f2c230' });
      fair.rides.kart = { id: 'kart', name: 'Go-Karts', at: { x: Kb.x, z: Kb.z - 5.2, h: 0 }, exit: { x: Kb.x - 3, z: Kb.z - 6, h: Math.PI } };
      // a short path from the midway down to the booth
      fair.kartPath = [[1690, F.mid.z + F.mid.w / 2], [1690, Kb.z - 4]];
      // the grid: four boxes behind the line, heading the way the track runs
      const sf = T.sf; fair.grid = [];
      for (let k = 0; k < 4; k++) { const kk = (sf.k - 8 - k * 7 + N2) % N2, p = T.pts[kk], nl = T.nl[kk], s2 = k % 2 ? 1.8 : -1.8, nx = T.pts[(kk + 1) % N2]; fair.grid.push({ x: p[0] + nl[0] * s2, z: p[1] + nl[1] * s2, h: Math.atan2(nx[0] - p[0], nx[1] - p[1]) }); }
    }
    // ---------------------------------------------------------------- the car park: cars in the bays nearest the path
    {
      const Pk = F.park, slots = [];
      for (let r = 0; r < 2; r++) for (let k = 0; k < 26; k++) { const x = Pk.x0 + 5 + k * 3.2, z = r ? Pk.z1 - 6 : Pk.z0 + 6; if (x < Pk.x1 - 3 && hash2i(k, r, 2207) < 0.55) slots.push({ x, z, h: r ? Math.PI : 0, cls: ['sedan', 'compact', 'suv', 'estate', 'pickup', 'van', 'apex', 'crest'][(k + r * 3) % 8] }); }
      this.isle.fleet.push({ id: 'fair_park', x: (Pk.x0 + Pk.x1) / 2, z: (Pk.z0 + Pk.z1) / 2, r: 300, slots: slots.map(s => ({ ...s, y: Y })) });
      for (const [x, z] of [[Pk.x0 + 24, (Pk.z0 + Pk.z1) / 2], [Pk.x1 - 24, (Pk.z0 + Pk.z1) / 2]]) this._prop(B.park, 'lotlamp', x, z, 0);
    }
    // ---------------------------------------------------------------- visitors on the midway and in the queues
    {
      const people = [];
      for (let k = 0; k < 22; k++) { const x = F.mid.x0 + 20 + hash2i(k, 1, 2209) * (F.mid.x1 - F.mid.x0 - 40), z = F.mid.z + (hash2i(k, 2, 2209) - 0.5) * (F.mid.w - 3); people.push([x, z, hash2i(k, 3, 2209) * 6.28]); }
      for (const R of Object.values(fair.rides)) people.push([R.at.x + 1.2, R.at.z + 1.6, R.at.h + Math.PI], [R.at.x - 1.1, R.at.z + 2.4, R.at.h + Math.PI]);
      this.isle.fleet.push({ id: 'folk_fair', x: 1700, z: 1990, r: 0, slots: [], people });
    }
    this.mapPlaces.push({ id: 'fair', name: F.name, cat: 'landmark', icon: 'F', x: F.office.x0 - 4, z: (F.office.z0 + F.office.z1) / 2, sub: 'Six rides, four games and the go-kart track · Fairground Way off Longshore Drive' });
    // (the blocks' colliders are added with the rest of the island's, 127)
  }
});
// the maps: the midway, the paths and the car park, the kart track, the coaster's line, the rides' footprints
World.prototype.paintFair = function (g, X, k, view) {
  const fr = this.fair; if (!fr) return;
  const F = FAIR, p = F.pad; if (view && (p.x1 < view.x0 || p.x0 > view.x1 || p.z1 < view.z0 || p.z0 > view.z1)) return;
  const R = (x0, z0, x1, z1, col) => { g.fillStyle = col; g.fillRect(X(x0), X(z0), (x1 - x0) * k, (z1 - z0) * k); };
  R(p.x0, p.z0, p.x1, p.z1, '#7f9a5f');
  R(F.mid.x0, F.mid.z - F.mid.w / 2, F.mid.x1, F.mid.z + F.mid.w / 2, '#cfc6b4');
  R(F.park.x0, F.park.z0, F.park.x1, F.park.z1, '#55585e');
  g.lineCap = 'round'; g.lineJoin = 'round';
  const loop = (pts, w, col) => { g.strokeStyle = col; g.lineWidth = Math.max(1.4, w * k); g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(X(q[0]), X(q[1])) : g.moveTo(X(q[0]), X(q[1]))); g.closePath(); g.stroke(); };
  loop(fr.kart.pts, F.kart.w, '#3a3c40');
  loop(fr.coaster.pts.filter((q, i) => i % 4 === 0).map(q => [q.x, q.z]), 1.6, '#d23a2a');
  const circ = (x, z, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(X(x), X(z), Math.max(1.5, r * k), 0, 7); g.fill(); };
  circ(F.carousel.x, F.carousel.z, F.carousel.r + 0.8, '#e056fd'); circ(F.drop.x, F.drop.z, F.drop.r + 2.4, '#2b2e33');
  R(F.wheel.x - F.wheel.r, F.wheel.z - 3, F.wheel.x + F.wheel.r, F.wheel.z + 3, '#2471a3');
  R(F.ship.x - 9, F.ship.z - 4, F.ship.x + 9, F.ship.z + 4, '#8a5a33');
  g.fillStyle = 'rgba(0,0,0,0.34)'; for (const b of this.xblocks) if (/^fair_/.test(b.xb || '')) for (const q of b.bld) g.fillRect(X(q.x0), X(q.z0), (q.x1 - q.x0) * k, (q.z1 - q.z0) * k);
};
