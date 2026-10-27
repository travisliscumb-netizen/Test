/* =====================================================================
   [CONTENT] CURVED STREETS (the Curved Roads pass)
   New streets that leave the grid at an angle, laid into blocks that hold nothing a save depends on
   (no house on the home ladder, no property, contact or headquarters; each block has its own random
   stream, so nothing else in the city moves). Each is a Link, a real through-road: traffic, the GPS,
   AI drivers, taxis and police all use it, through the road graph (135).
   - The Saltmarsh estate (Industrial Belt, blocks 10,2 and 10,3). Saltmarsh Way, a 12 m collector,
     leaves Juniper St on a straight diagonal, crosses 3rd Ave at a skew and sweeps east onto Kestrel
     St; Kiln Lane forks off it at a shallow Y and curves down to 4th Ave. Warehouses, container stacks
     and fences are set round the roads; cars park along the kerbs, nose to tail with the curve.
   - Tanner's Row (Old Quarter, blocks 3,10 and 4,10): a winding lane through the terraces, in off
     10th Ave, across Dock St and out onto 11th Ave. The terraces are built as before and the lane is
     cut through them: the houses in its way and whatever stood in the courtyards it crosses are gone.
   ===================================================================== */
// a straight road as a dense polyline (sampled every 2.5 m like the splines)
function linePts(a, b, step = 2.5) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)), out = [];
  for (let k = 0; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  return out;
}
// distance from a point to a polyline
function polyDist(x, z, pts) {
  let best = Infinity;
  for (let k = 0; k < pts.length - 1; k++) { const d = segDist(x, z, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]); if (d < best) best = d; }
  return best;
}
// distance from an axis-aligned rectangle to a polyline (0 when they cross)
function rectPolyDist(x0, z0, x1, z1, pts) {
  let best = Infinity;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    // a segment end inside the rectangle, or the segment crossing one of its sides
    const inside = q => q[0] >= x0 && q[0] <= x1 && q[1] >= z0 && q[1] <= z1;
    if (inside(a) || inside(b)) return 0;
    const box = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    for (let s = 0; s < 4; s++) if (segCross(a, b, box[s], box[(s + 1) % 4])) return 0;
    for (const q of [a, b]) { const dx = Math.max(x0 - q[0], 0, q[0] - x1), dz = Math.max(z0 - q[1], 0, q[1] - z1); best = Math.min(best, Math.hypot(dx, dz)); }
    for (const c of box) best = Math.min(best, segDist(c[0], c[1], a[0], a[1], b[0], b[1]));
  }
  return best;
}
function segCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
// the blocks and their streets: `line` a straight road between two points, `ctrl` a spline through control points,
// `fork` the road a Y-junction branches off (its first control point is a sample of that road: `at`), `park` the
// kerbs that take parked cars (+1 the right-hand side of the road's direction, -1 the left)
const SALT_B = [[852, 245.4], [857.73, 252.35], [866, 258], [874.6, 261]];
const CURVED_STREETS = {
  '10,2': { kind: 'works', roads: [{ name: 'Saltmarsh Way', w: 12, line: [[805.4, 178], [852, 234.6]], park: [1, -1] }] },
  '10,3': { kind: 'works', roads: [{ name: 'Saltmarsh Way', w: 12, ctrl: SALT_B, park: [-1] }, { name: 'Kiln Lane', w: 8, fork: 0, at: 4, ctrl: [[862, 268], [858, 290], [846, 314.6]] }] },
  '3,10': { kind: 'lane', roads: [{ name: 'Tanner’s Row', w: 7, ctrl: [[262, 805.4], [266, 818], [280, 832], [300, 839], [314.6, 842]] }] },
  '4,10': { kind: 'lane', roads: [{ name: 'Tanner’s Row', w: 7, ctrl: [[325.4, 842], [340, 845], [356, 855], [366, 866], [372, 874.6]] }] }
};
{
  const base = World.prototype._genBlock;
  World.prototype._genBlock = function (b) {
    const spec = CURVED_STREETS[b.bx + ',' + b.bz];
    if (!spec || b.superblock || b.special) return base.call(this, b);
    if (spec.kind === 'lane') {
      // the block as it always was, then the lane cut through it
      base.call(this, b);
      const roads = this._curvedRoads(b, spec);
      for (const r of roads) this._carveFor(b, r, 1.2);
      b.roadKind = 'lane';
      return;
    }
    this._genWorks(b, new RNG(b.i * 7919 + 1337), spec);
    b.name = DNAME[b.t] || 'Port Valen';
  };
}
Object.assign(World.prototype, {
  _curvedRoads(b, spec) {
    const out = [];
    for (const R of spec.roads) {
      let pts;
      if (R.line) pts = linePts(R.line[0], R.line[1]);
      else if (R.fork !== undefined) pts = splinePts([out[R.fork].pts[R.at], ...R.ctrl]);
      else pts = splinePts(R.ctrl);
      out.push(this._road(pts, R.w, R.st || 'asphalt', { link: R.name }));
      out[out.length - 1].park = R.park || null;
    }
    return out;
  },
  // take out what stands in a new road's way (buildings and their dressing, props, signs, parked cars, seats)
  _carveFor(b, r, m) {
    const near = (x, z, pad = 0) => polyDist(x, z, r.pts) < r.w / 2 + m + pad;
    const hitR = (x0, z0, x1, z1) => rectPolyDist(x0, z0, x1, z1, r.pts) < r.w / 2 + m;
    b.bld = b.bld.filter(q => !hitR(q.x0, q.z0, q.x1, q.z1));
    b.det = b.det.filter(d => {
      if (d.col && d.col.x0 !== undefined) return !hitR(d.col.x0, d.col.z0, d.col.x1, d.col.z1);
      const h = Math.max(d.sx || 0, d.sz || 0) / 2;
      return !hitR(d.x - h, d.z - h, d.x + h, d.z + h);
    });
    for (let i = b.props.length - 1; i >= 0; i--) {
      const p = b.props[i]; if (!near(p.x, p.z, 0.8)) continue;
      const list = this.propTypes[p.type], li = list ? list.indexOf(p) : -1; if (li >= 0) list.splice(li, 1);
      b.props.splice(i, 1);
    }
    for (const k of ['signs', 'billboards', 'fx', 'seats', 'parked', 'secrets']) if (b[k]) b[k] = b[k].filter(o => o.x === undefined || !near(o.x, o.z, 1.5));
    if (b.water) b.water = b.water.filter(o => !near(o.x, o.z, o.r || 0));
  },
  // cars parked along a road's kerbs, nose to tail with it (clear of its two ends and of any other road)
  _kerbCars(b, rng, r, others) {
    if (!r.park) return;
    const pts = r.pts, cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const L = cum[cum.length - 1];
    for (const side of r.park) for (let d = 16; d < L - 16; d += 6.4) {
      if (!rng.chance(0.55)) continue;
      let k = 0; while (k < pts.length - 2 && cum[k + 1] < d) k++;
      const a = pts[k], c = pts[k + 1], t = (d - cum[k]) / ((cum[k + 1] - cum[k]) || 1), tx = (c[0] - a[0]) / ((cum[k + 1] - cum[k]) || 1), tz = (c[1] - a[1]) / ((cum[k + 1] - cum[k]) || 1);
      const o = (r.w / 2 - 1.15) * side, x = a[0] + (c[0] - a[0]) * t - tz * o, z = a[1] + (c[1] - a[1]) * t + tx * o;
      if (others.some(q => q !== r && polyDist(x, z, q.pts) < q.w / 2 + 4)) continue;
      // on the right-hand kerb a car faces the way the road runs; on the left, the other way (with the traffic)
      b.parked.push({ x, z, h: side > 0 ? Math.atan2(tx, tz) : Math.atan2(-tx, -tz), cls: null, kerb: true });
    }
  },
  // an industrial block threaded by the new roads: warehouses, tanks and container stacks set clear of them
  _genWorks(b, rng, spec) {
    this._sidewalk(b, rng, { trees: 0, park: 0.2 });
    const roads = this._curvedRoads(b, spec);
    const clear = (x0, z0, x1, z1, m) => roads.every(r => rectPolyDist(x0, z0, x1, z1, r.pts) > r.w / 2 + m);
    const fenceC = C(0x5c6166), fy = CURB_H + 1.1, e = 0.6;
    // chain-link round the block's edge, open where a road passes
    const fence = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / 0.5), runs = [];
      let s0 = null;
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, open = roads.some(r => polyDist(x, z, r.pts) < r.w / 2 + 1.2);
        if (!open && s0 === null) s0 = t;
        if ((open || k === n) && s0 !== null) { runs.push([s0, t]); s0 = null; }
      }
      for (const [ta, tb] of runs) {
        const ax = x0 + (x1 - x0) * ta, az = z0 + (z1 - z0) * ta, bx = x0 + (x1 - x0) * tb, bz = z0 + (z1 - z0) * tb, l = Math.hypot(bx - ax, bz - az); if (l < 1) continue;
        const cx = (ax + bx) / 2, cz = (az + bz) / 2, alongX = Math.abs(bx - ax) > Math.abs(bz - az);
        this._det(b, 'box', cx, fy, cz, alongX ? l : 0.06, 2.2, alongX ? 0.06 : l, fenceC, 0, true);
        this._det(b, 'box', cx, CURB_H + 2.25, cz, alongX ? l : 0.1, 0.08, alongX ? 0.1 : l, C(0x3a3d40));
      }
    };
    fence(b.x0 + e, b.z0 + e, b.x1 - e, b.z0 + e); fence(b.x0 + e, b.z1 - e, b.x1 - e, b.z1 - e);
    fence(b.x0 + e, b.z0 + e, b.x0 + e, b.z1 - e); fence(b.x1 - e, b.z0 + e, b.x1 - e, b.z1 - e);
    // warehouses: the biggest that fits, five times over, each with its roll-up doors on the side nearest a road
    const placed = [], sizes = [[40, 24], [34, 22], [28, 18], [22, 16], [18, 13], [14, 11], [11, 9]];
    for (let n = 0; n < 5; n++) {
      let best = null;
      for (const [w0, d0] of sizes) {
        for (const rot of [0, 1]) {
          const w = rot ? d0 : w0, d = rot ? w0 : d0;
          for (let x = b.x0 + 3; x + w <= b.x1 - 3; x += 2) for (let z = b.z0 + 3; z + d <= b.z1 - 3; z += 2) {
            if (placed.some(p => x < p.x1 + 4 && x + w > p.x0 - 4 && z < p.z1 + 4 && z + d > p.z0 - 4) || !clear(x, z, x + w, z + d, 3)) continue;
            const score = w * d + rng.next();
            if (!best || score > best.score) best = { x0: x, z0: z, x1: x + w, z1: z + d, score };
          }
        }
        if (best) break;
      }
      if (!best) break;
      placed.push(best);
      const ware = rng.chance(0.3), h = rng.range(8, 13);
      const r = this._bld(b, best.x0, best.z0, best.x1, best.z1, h, ware ? STYLE.WARE : STYLE.IND, rng.pick(ware ? PAL.brick : PAL.ind), 5, 4.5, { gtype: 3 });
      this._dressBox(b, r, rng, 'warehouse');
      this._rooftop(b, r, rng, 'ind');
      const faces = [[(r.x0 + r.x1) / 2, r.z0, 0], [(r.x0 + r.x1) / 2, r.z1, 1], [r.x0, (r.z0 + r.z1) / 2, 2], [r.x1, (r.z0 + r.z1) / 2, 3]];
      const face = faces.reduce((p, q) => Math.min(...roads.map(rd => polyDist(q[0], q[1], rd.pts))) < Math.min(...roads.map(rd => polyDist(p[0], p[1], rd.pts))) ? q : p)[2];
      const along = face < 2 ? r.x1 - r.x0 : r.z1 - r.z0, nd = Math.floor(along / 8);
      for (let k = 0; k < nd; k++) {
        const a = 4 + k * 8 + (along - nd * 8) / 2;
        if (face === 0) this._det(b, 'box', r.x0 + a, CURB_H + 2.2, r.z0 - 0.06, 4, 4.4, 0.1, 0x55595e);
        else if (face === 1) this._det(b, 'box', r.x0 + a, CURB_H + 2.2, r.z1 + 0.06, 4, 4.4, 0.1, 0x55595e);
        else this._det(b, 'box', face === 2 ? r.x0 - 0.06 : r.x1 + 0.06, CURB_H + 2.2, r.z0 + a, 0.1, 4.4, 4, 0x55595e);
      }
    }
    const free = (x0, z0, x1, z1, m = 1.5) => x0 >= b.x0 + 1.5 && z0 >= b.z0 + 1.5 && x1 <= b.x1 - 1.5 && z1 <= b.z1 - 1.5 && clear(x0, z0, x1, z1, 2.5) && !placed.some(p => x0 < p.x1 + m && x1 > p.x0 - m && z0 < p.z1 + m && z1 > p.z0 - m);
    // a pair of tanks where there is room
    for (let tries = 0, n = 0; tries < 40 && n < 2; tries++) {
      const r0 = rng.range(3.2, 4.2), tx = rng.range(b.x0 + 6, b.x1 - 6), tz = rng.range(b.z0 + 6, b.z1 - 6), h = rng.range(8, 12);
      if (!free(tx - r0, tz - r0, tx + r0, tz + r0, 2)) continue;
      this._det(b, 'cyl', tx, CURB_H + h / 2, tz, r0, h, rng.pick([0xc8c8c0, 0xaab4bb, 0x9ea38a]), null, { x: tx, z: tz, r: r0, y0: 0, y1: h + 1, kind: 'det' });
      this._det(b, 'cyl', tx, CURB_H + h + 0.3, tz, r0 * 0.92, 0.6, 0x8a8f94);
      placed.push({ x0: tx - r0, z0: tz - r0, x1: tx + r0, z1: tz + r0 }); n++;
    }
    // container stacks
    for (let tries = 0, n = 0; tries < 60 && n < 7; tries++) {
      const rot = rng.chance(0.5), w = rot ? 2.5 : 6.1, d = rot ? 6.1 : 2.5, x = rng.range(b.x0 + 3, b.x1 - 3), z = rng.range(b.z0 + 3, b.z1 - 3);
      if (!free(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 1.2)) continue;
      const stack = rng.int(1, 3);
      for (let s = 0; s < stack; s++) this._det(b, 'box', x, CURB_H + 1.3 + s * 2.6, z, w, 2.6, d, rng.pick(PAL.container), 0, s === 0 ? { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0: 0, y1: CURB_H + 2.6 * stack, kind: 'det' } : null);
      placed.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 }); n++;
    }
    for (let tries = 0, n = 0; tries < 30 && n < 5; tries++) {
      const x = rng.range(b.x0 + 3, b.x1 - 3), z = rng.range(b.z0 + 3, b.z1 - 3);
      if (!free(x - 0.8, z - 0.8, x + 0.8, z + 0.8, 0.6)) continue;
      this._prop(b, rng.chance(0.5) ? 'pallet' : 'barrel', x, z, rng.range(0, 3)); n++;
    }
    for (const r of roads) this._kerbCars(b, rng, r, roads);
    for (let tries = 0; tries < 30; tries++) { const x = rng.range(b.x0 + 3, b.x1 - 3), z = rng.range(b.z0 + 3, b.z1 - 3); if (free(x - 1, z - 1, x + 1, z + 1, 1)) { b.secrets.push({ x, z }); break; } }
    b.roadKind = 'works';
  }
});
