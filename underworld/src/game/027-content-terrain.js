/* =====================================================================
   [CONTENT] TERRAIN: THE CEDAR FIELDS HEIGHT FIELD (Session 6C, §45.36)
   Real three-dimensional ground for the Cedar Fields strip, the land
   bridge and the countryside south of it (and nowhere else yet):
   - heights on 1 m grids, sampled bilinearly, with the slope handed to
     the physics (SURF.gx / gz through groundY): rolling hills, rises,
     dips, banks, uneven camber, the off-road course's crests, whoops and
     ruts. The strip stays flat (at kerb height) under and around
     everything already built there, so nothing floats or sinks;
   - a fine rough layer on top (centimetres, a metre or two apart, by
     surface) that the tyres really ride over: the wheels follow it, the
     springs soak up part of it and the body takes the rest;
   - surfaces by cell: grass, dirt, mud, rock, gravel, packed track.
     Each changes grip, rolling drag and how hard the bumps shake the
     tyres loose, for every vehicle; an off-road vehicle feels about a
     third of it, a pickup or a truck a little over half (TRAIL).
   Built once with the world (Terrain.build), after which groundBase
   answers from it.
   ===================================================================== */
const TSURF = { grass: 0, dirt: 1, mud: 2, rock: 3, gravel: 4, track: 5 };
// grip multiplier, rolling drag (m/s²) and rough amplitude (m) per surface
const TSURF_FX = [
  { grip: 0.82, drag: 0.35, rough: 0.035, name: 'grass' },
  { grip: 0.8, drag: 0.25, rough: 0.04, name: 'dirt' },
  { grip: 0.45, drag: 2.4, rough: 0.025, name: 'mud' },
  { grip: 0.74, drag: 0.6, rough: 0.11, name: 'rock' },
  { grip: 0.72, drag: 0.4, rough: 0.05, name: 'gravel' },
  { grip: 0.88, drag: 0.15, rough: 0.02, name: 'track' }
];
// how well each model copes off the road (0 a road car, 1 a true off-roader): it scales every terrain penalty by
// 1 − 0.65 × trail, and how much of the rough the suspension soaks up
const TRAIL = { offroad: 1, kodiak: 0.7, pickup: 0.65, utility: 0.6, suv: 0.6, truck: 0.5, crest: 0.35, van: 0.2, courier: 0.15 };
const trailOf = type => TRAIL[type] || 0;
// smooth value noise in [-1, 1]
function tNoise(x, z, seed) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2i(xi, zi, seed), b = hash2i(xi + 1, zi, seed), c = hash2i(xi, zi + 1, seed), d = hash2i(xi + 1, zi + 1, seed);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
const Terrain = {
  regions: [], ready: false,
  // left by the last height(): the slope of the baked ground, the rough layer's part of the height, and whether
  // the point was on the terrain at all (groundY reads these)
  gx: 0, gz: 0, rough: 0, hit: false,
  _fx: { grip: 1, drag: 0, bump: 0, s: 0 },
  region(x, z) { for (const R of this.regions) if (x >= R.x0 && x < R.x1 && z >= R.z0 && z < R.z1) return R; return null; },
  // baked height at (x, z) in region R, bilinear; sets this.gx / gz (the slope)
  _baked(R, x, z) {
    const u = x - R.x0, v = z - R.z0, i = Math.min(R.W - 2, Math.max(0, Math.floor(u))), j = Math.min(R.H - 2, Math.max(0, Math.floor(v)));
    const fx = clamp(u - i, 0, 1), fz = clamp(v - j, 0, 1), o = j * R.W + i, h = R.h;
    const a = h[o], b = h[o + 1], c = h[o + R.W], d = h[o + R.W + 1];
    this.gx = (b - a) * (1 - fz) + (d - c) * fz; this.gz = (c - a) * (1 - fx) + (d - b) * fx;
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  },
  _cell(R, x, z) { return Math.min(R.H - 1, Math.floor(z - R.z0)) * R.W + Math.min(R.W - 1, Math.floor(x - R.x0)); },
  surf(x, z) { const R = this.region(x, z); return R ? R.s[this._cell(R, x, z)] : -1; },
  // the fine rough layer at (x, z) for surface s and mask m (0 where the ground is held flat)
  _rough(x, z, s, m) { return m > 0 ? TSURF_FX[s].rough * m * (tNoise(x / 1.7, z / 1.7, 71) + 0.5 * tNoise(x / 0.85, z / 0.85, 73)) : 0; },
  // ground height (null where there is no terrain); the slope is left in this.gx / gz, the rough part in this.rough
  height(x, z) {
    if (!this.ready) return null;
    const R = this.region(x, z); if (!R) return null;
    const y = this._baked(R, x, z), o = this._cell(R, x, z);
    this.rough = this._rough(x, z, R.s[o], R.m[o]); this.hit = true;
    return y + this.rough;
  },
  // what the ground does to a car here (null off the terrain): grip ×, rolling drag (m/s²), bump (the rough's
  // amplitude, which costs grip with speed). `trail` is the car's off-road capability (TRAIL). A reused object.
  effect(x, z, trail) {
    const R = this.ready ? this.region(x, z) : null; if (!R) return null;
    const o = this._cell(R, x, z), s = R.s[o], F = TSURF_FX[s], k = 1 - 0.65 * (trail || 0), E = this._fx;
    // the strip's held-flat ground (the lawns and drives round the farm) is ordinary ground: it eases in with the mask
    const m = R.m[o], w = Math.min(1, m * 2);
    E.grip = 1 - (1 - F.grip) * k * w; E.drag = F.drag * k * w; E.bump = F.rough * m * k; E.s = s;
    return E;
  },
  // does the ground rise through the straight line from a to b? (Session 6C closure: hills and ridges block sight.)
  // Only the part of the line over a terrain region is looked at (a city sight line costs a bounds test per region);
  // there the baked ground (not the centimetre rough layer) is sampled every ~1.5 m, the last 0.75 m at each end left
  // out (the ground the eyes stand on), and the ground must rise 2 cm above the line to hide it
  occludes(ax, ay, az, bx, by, bz) {
    // (interiors and underground spaces are far below the ground: never under the terrain's sky)
    if (!this.ready || ay < -5 || by < -5) return false;
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 2) return false;
    const gx = this.gx, gz = this.gz;
    let hit = false;
    for (const R of this.regions) {
      // clip the segment to the region's rectangle (slabs in x and z)
      let t0 = 0, t1 = 1;
      for (const [p, d, lo, hi] of [[ax, dx, R.x0, R.x1], [az, dz, R.z0, R.z1]]) {
        if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t0 = 1; t1 = 0; } continue; }
        let u = (lo - p) / d, v = (hi - p) / d; if (u > v) [u, v] = [v, u];
        t0 = Math.max(t0, u); t1 = Math.min(t1, v);
      }
      t0 = Math.max(t0, 0.75 / L); t1 = Math.min(t1, 1 - 0.75 / L);
      if (t1 <= t0) continue;
      const n = Math.ceil((t1 - t0) * L / 1.5);
      for (let k = 0; k <= n && !hit; k++) { const t = t0 + (t1 - t0) * k / n; if (this._baked(R, ax + dx * t, az + dz * t) > ay + (by - ay) * t + 0.02) hit = true; }
      if (hit) break;
    }
    this.gx = gx; this.gz = gz;
    return hit;
  },
  // the countryside's hills before anything is stamped on them (the generator levels its pads from this)
  raw(x, z) {
    const edge = Math.min(x - CFS.x0, CFS.x1 - x, z - CFS.z0, CFS.z1 - z);
    const h = 3.4 * (tNoise(x / 150, z / 150, 21) + 1) + 2.4 * tNoise(x / 60, z / 60, 23) + 0.9 * tNoise(x / 19, z / 19, 25) + 0.22 * tNoise(x / 6, z / 6, 27);
    return Math.max(0.3, h) * smoothstep(0, 35, edge) + 0.1;
  },
  // ---------------------------------------------------------------- building the grids
  // a region: a rect of 1 m cells with heights, surfaces and a mask (0 = held flat, no rough; 1 = free)
  _region(id, x0, z0, x1, z1) {
    const W = Math.ceil(x1 - x0) + 1, H = Math.ceil(z1 - z0) + 1;
    const R = { id, x0, z0, x1, z1, W, H, h: new Float32Array(W * H), s: new Uint8Array(W * H), m: new Float32Array(W * H) };
    this.regions.push(R);
    return R;
  },
  build(world) {
    this.regions = []; this.ready = false;
    const cf = world.cfs; if (!cf) return;
    // ---- the strip: gentle rough fields around what is built there (the kerb height is the floor)
    {
      const S = CF_STRIP, R = this._region('strip', S.x0 + ROAD_HALF, S.z0 + ROAD_HALF, S.x1 - ROAD_HALF, S.z1 - ROAD_HALF);
      const blocked = [];
      for (const b of world.blocks) if (b.superblock && b.superblock.id === 'fields') {
        for (const r of b.bld) blocked.push([r.x0 - 3, r.z0 - 3, r.x1 + 3, r.z1 + 3]);
        // details by their real (rotated) footprint: a long rail fence holds a narrow band flat, not a square
        for (const d of b.det) { const c = Math.abs(Math.cos(d.ry || 0)), sn = Math.abs(Math.sin(d.ry || 0)), hx = (c * d.sx + sn * d.sz) / 2 + 1, hz = (sn * d.sx + c * d.sz) / 2 + 1; blocked.push([d.x - hx, d.z - hz, d.x + hx, d.z + hz]); }
        for (const p of b.props) blocked.push([p.x - 1.5, p.z - 1.5, p.x + 1.5, p.z + 1.5]);
        for (const c of b.parked) blocked.push([c.x - 3.5, c.z - 3.5, c.x + 3.5, c.z + 3.5]);
      }
      for (const h of world.homes || []) if (h.door && h.door.z > S.z0 && h.door.z < S.z1 && h.door.x < S.x1) blocked.push([h.door.x - 8, h.door.z - 8, h.door.x + 8, h.door.z + 8]);
      for (let j = 0; j < R.H; j++) for (let i = 0; i < R.W; i++) {
        const x = R.x0 + i, z = R.z0 + j, o = j * R.W + i;
        // distance to anything built or paved: held flat there, easing in over 3 m (the sidewalk band, 5 m in
        // from the kerb, stays flat too)
        let d = Math.min(x - R.x0, R.x1 - x, z - R.z0, R.z1 - z) - 5;
        for (const q of blocked) { const dx = Math.max(q[0] - x, 0, x - q[2]), dz = Math.max(q[1] - z, 0, z - q[3]); d = Math.min(d, Math.hypot(dx, dz)); }
        const road = localSurfaceAt(x, z); if (road) d = Math.min(d, 0);
        for (let a = -3; a <= 3 && d > 0; a += 3) for (let c = -3; c <= 3; c += 3) if (localSurfaceAt(x + a, z + c)) d = Math.min(d, Math.hypot(a, c) - 1.5);
        const m = smoothstep(0, 3, d);
        const hills = 0.55 * (tNoise(x / 26, z / 26, 11) + 1) + 0.25 * (tNoise(x / 9, z / 9, 13) + 1);
        R.h[o] = CURB_H + hills * m; R.m[o] = m;
        R.s[o] = road === 2 ? TSURF.dirt : tNoise(x / 14, z / 14, 17) > 0.55 ? TSURF.dirt : TSURF.grass;
      }
    }
    // ---- the land bridge: a dirt road on an embankment from the perimeter road out to the fields
    {
      const L = CFS.lb, R = this._region('bridge', L.x - L.half, L.z0, L.x + L.half, CFS.z0), y1 = cf.landY, ramp0 = CITY + EDGE_MARGIN;
      for (let j = 0; j < R.H; j++) for (let i = 0; i < R.W; i++) {
        const x = R.x0 + i, z = R.z0 + j, o = j * R.W + i, dx = Math.abs(x - L.x);
        const yr = y1 * smoothstep(ramp0, CFS.z0, z);
        // the verges fall away a little from the seawall out (level with the road through the promenade gap)
        R.h[o] = yr - (dx > L.road + 0.5 ? 0.08 * (dx - L.road - 0.5) * smoothstep(ramp0 - 1, ramp0 + 4, z) : 0) - (Math.abs(dx - 1) < 0.35 && z > ramp0 ? 0.05 : 0);
        R.s[o] = dx <= L.road + 0.5 ? TSURF.track : TSURF.grass;
        // smooth through the promenade gap; rough from the seawall out
        R.m[o] = smoothstep(ramp0, ramp0 + 8, z) * 0.7;
      }
    }
    // ---- the countryside: hills, the course's features, the tracks and level pads
    {
      const R = this._region('country', CFS.x0, CFS.z0, CFS.x1, CFS.z1);
      const pads = cf.pads, tracks = cf.tracks, course = cf.course;
      for (let j = 0; j < R.H; j++) for (let i = 0; i < R.W; i++) {
        const x = R.x0 + i, z = R.z0 + j, o = j * R.W + i;
        let h = this.raw(x, z), pad = null;
        // level pads (the compound, the course paddock, the bridge landing) ease in over 18 m
        for (const P of pads) { const dx = Math.max(P.x0 - x, 0, x - P.x1), dz = Math.max(P.z0 - z, 0, z - P.z1), dd = Math.hypot(dx, dz); if (dd < 18) { const t = smoothstep(0, 18, dd); h = P.y * (1 - t) + h * t; } if (dd === 0) pad = P; }
        R.h[o] = h; R.m[o] = 1;
        // surfaces: grass with rocky outcrops on the high ground and mud in the hollows
        const rocky = tNoise(x / 30, z / 30, 31) > 0.45 && h > 4.5, wet = tNoise(x / 25, z / 25, 33) > 0.62 && h < 2.2;
        R.s[o] = rocky ? TSURF.rock : wet ? TSURF.mud : TSURF.grass;
        if (pad) { R.s[o] = TSURF.gravel; R.m[o] = 0.2; }
      }
      // dirt tracks: packed surface and two wheel ruts, a full cell each side where the wheels run (0.5–1.5 m out; a
      // pad keeps its gravel)
      for (const T of tracks) this._stampLine(R, T.pts, T.w, (o, along, off) => { if (R.s[o] === TSURF.gravel) return; R.s[o] = TSURF.track; if (Math.abs(Math.abs(off) - 1.0) <= 0.5) R.h[o] -= 0.07; });
      // the course: dirt, with its features by distance along it
      this._stampLine(R, course.pts, course.w, (o, along, off) => {
        R.s[o] = TSURF.dirt; R.m[o] = 1;
        for (const F of course.features) {
          const t = (along - F.at) / F.len; if (t < 0 || t > 1) continue;
          if (F.kind === 'jump') R.h[o] += F.h * (t < 0.62 ? Math.sin(Math.PI / 2 * t / 0.62) : Math.max(0, 1 - (t - 0.62) / 0.38) ** 2);
          else if (F.kind === 'whoops') R.h[o] += F.h * (0.5 - 0.5 * Math.cos(t * Math.PI * 2 * F.n));
          else if (F.kind === 'mud') { R.s[o] = TSURF.mud; R.h[o] -= F.h * Math.sin(Math.PI * t); }
          else if (F.kind === 'rock') R.s[o] = TSURF.rock;
          else if (F.kind === 'camber') R.h[o] += F.h * off / course.w * 2 * Math.sin(Math.PI * t);
        }
      }, true);
    }
    this.ready = true;
  },
  // every cell within w/2 of a polyline: fn(cellIndex, distance along, signed offset (+ on the left of travel)).
  // Each cell takes its nearest segment, so features and offsets run on smoothly through the bends
  _stampLine(R, pts, w, fn, closed) {
    const P2 = closed ? [...pts, pts[0]] : pts;
    const cum = [0]; for (let k = 1; k < P2.length; k++) cum.push(cum[k - 1] + Math.hypot(P2[k][0] - P2[k - 1][0], P2[k][1] - P2[k - 1][1]));
    const best = new Map();
    for (let k = 0; k < P2.length - 1; k++) {
      const a = P2[k], b = P2[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, nx = dz / L, nz = -dx / L;
      const x0 = Math.floor(Math.min(a[0], b[0]) - w), x1 = Math.ceil(Math.max(a[0], b[0]) + w), z0 = Math.floor(Math.min(a[1], b[1]) - w), z1 = Math.ceil(Math.max(a[1], b[1]) + w);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const i = x - R.x0, j = z - R.z0; if (i < 0 || j < 0 || i >= R.W || j >= R.H) continue;
        const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (L * L), 0, 1), px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(x - px, z - pz);
        if (d > w / 2) continue;
        const o = j * R.W + i, cur = best.get(o);
        if (!cur || d < cur[0]) best.set(o, [d, cum[k] + L * t, (x - a[0]) * nx + (z - a[1]) * nz]);
      }
    }
    for (const [o, q] of best) fn(o, q[1], q[2]);
  }
};
