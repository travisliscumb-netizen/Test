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
// the lanes lined with new frontage where they cut a block (the organic downtown; Tanner's Row stays as it was laid)
const CURVED_REFILL = new Set(['0,4', '0,5', '0,6', '2,4', '1,5', '1,6', '2,6', '1,7', '2,7', '2,8', '2,9', '3,6', '9,5', '9,6']);
const CURVED_STREETS = {
  '10,2': { kind: 'works', roads: [{ name: 'Saltmarsh Way', w: 12, line: [[805.4, 178], [852, 234.6]], park: [1, -1] }] },
  '10,3': { kind: 'works', roads: [{ name: 'Saltmarsh Way', w: 12, ctrl: SALT_B, park: [-1] }, { name: 'Kiln Lane', w: 8, fork: 0, at: 4, ctrl: [[862, 268], [858, 290], [846, 314.6]] }] },
  '3,10': { kind: 'lane', roads: [{ name: 'Tanner’s Row', w: 7, ctrl: [[262, 805.4], [266, 818], [280, 832], [300, 839], [314.6, 842]] }] },
  // where the layout parts the two blocks (island: the Strip on the bay's south shore) this half is its own lane
  '4,10': { kind: 'lane', roads: [{ name: 'Tanner’s Row', apart: { of: '3,10', name: 'Cooper’s Lane' }, w: 7, ctrl: [[325.4, 842], [340, 845], [356, 855], [366, 866], [372, 874.6]] }] },
  // ---- the organic downtown (owner, 2026-11-18). The Old Quarter: historic lanes winding through the terraces'
  // courtyards, block to block across the streets (Saint Ivo Lane runs three blocks north to south), a crescent
  '0,4': { kind: 'lane', roads: [{ name: 'Saint Ivo Lane', w: 7, ctrl: [[34, 325.4], [38, 340], [48, 356], [52, 372], [50, 394.6]] }] },
  '0,5': { kind: 'lane', roads: [{ name: 'Saint Ivo Lane', w: 7, ctrl: [[50, 405.4], [44, 422], [34, 440], [30, 458], [32, 474.6]] }] },
  '0,6': { kind: 'lane', roads: [{ name: 'Saint Ivo Lane', w: 7, ctrl: [[32, 485.4], [38, 500], [52, 516], [58, 536], [52, 554.6]] }] },
  '2,4': { kind: 'lane', roads: [{ name: 'Abbey Steps', w: 7, ctrl: [[196, 325.4], [200, 340], [212, 356], [226, 366], [234.6, 372]] }] },
  '1,5': { kind: 'lane', roads: [{ name: 'Cobble Row', w: 7, ctrl: [[136, 405.4], [132, 420], [118, 436], [100, 448], [85.4, 454]] }] },
  '1,6': { kind: 'lane', roads: [{ name: 'Cutler’s Crescent', w: 7, ctrl: [[98, 485.4], [96, 500], [104, 516], [120, 522], [136, 516], [144, 500], [142, 485.4]] }] },
  '2,6': { kind: 'lane', roads: [{ name: 'Wick Lane', w: 7, ctrl: [[234.6, 498], [220, 503], [204, 516], [186, 528], [165.4, 532]] }] },
  '1,7': { kind: 'lane', roads: [{ name: 'Lantern Lane', w: 7, ctrl: [[85.4, 596], [100, 600], [118, 610], [136, 612], [154.6, 606]] }] },
  '2,7': { kind: 'lane', roads: [{ name: 'Lantern Lane', w: 7, ctrl: [[165.4, 606], [182, 598], [200, 596], [218, 602], [234.6, 604]] }] },
  // the Old Quarter's blocks in Linden Hills
  '2,8': { kind: 'lane', roads: [{ name: 'Mason’s Walk', w: 7, ctrl: [[186, 645.4], [190, 660], [204, 676], [220, 684], [234.6, 688]] }] },
  '2,9': { kind: 'lane', roads: [{ name: 'Ropewalk', w: 7, ctrl: [[165.4, 752], [180, 756], [194, 766], [204, 782], [206, 794.6]] }] },
  // the commercial core: a diagonal avenue across the Glass Mile (the towers it displaces are rebuilt beside it);
  // Diner Row: a crescent and a lane
  '3,4': { kind: 'avenue', roads: [{ name: 'Glass Mile', w: 12, ctrl: [[262, 325.4], [270, 336], [286, 344], [302, 347], [314.6, 347]], park: [1, -1] }] },
  '4,4': { kind: 'avenue', roads: [{ name: 'Glass Mile', w: 12, ctrl: [[325.4, 347], [336, 351], [344, 362], [346, 380], [344, 394.6]], park: [1, -1] }] },
  '4,5': { kind: 'avenue', roads: [{ name: 'Glass Mile', w: 12, ctrl: [[344, 405.4], [354, 418], [372, 438], [394.6, 456]], park: [1, -1] }] },
  '3,6': { kind: 'lane', roads: [{ name: 'Tallow Lane', w: 7, ctrl: [[245.4, 500], [262, 506], [280, 520], [292, 538], [296, 554.6]] }] },
  '7,6': { kind: 'avenue', roads: [{ name: 'Kestrel Way', w: 10, ctrl: [[565.4, 500], [584, 504], [604, 520], [620, 536], [634.6, 540]], park: [1] }] },
  '6,4': { kind: 'avenue', roads: [{ name: 'Bourse Lane', w: 8, ctrl: [[500, 325.4], [506, 342], [520, 360], [536, 372], [554.6, 376]] }] },
  '8,4': { kind: 'avenue', roads: [{ name: 'Harbour Steps', w: 8, ctrl: [[656, 325.4], [662, 342], [674, 360], [686, 380], [690, 394.6]] }] },
  '9,5': { kind: 'lane', roads: [{ name: 'Fry Lane', w: 7, ctrl: [[725.4, 428], [740, 432], [756, 444], [766, 460], [770, 474.6]] }] },
  '9,6': { kind: 'lane', roads: [{ name: 'Marigold Crescent', w: 8, ctrl: [[744, 485.4], [748, 500], [760, 514], [776, 522], [794.6, 526]] }] },
  // the port strip: works roads curving through the yards
  '11,2': { kind: 'works', roads: [{ name: 'Brine Lane', w: 10, ctrl: [[885.4, 182], [900, 190], [916, 206], [924, 224], [926, 234.6]], park: [1] }] },
  '11,3': { kind: 'works', roads: [{ name: 'Brine Lane', w: 10, ctrl: [[926, 245.4], [928, 262], [938, 280], [954.6, 292]] }] },
  '10,8': { kind: 'works', roads: [{ name: 'Cannery Cut', w: 10, ctrl: [[818, 645.4], [826, 664], [842, 690], [856, 714.6]], park: [-1] }] },
  '10,9': { kind: 'works', roads: [{ name: 'Cannery Cut', w: 10, ctrl: [[856, 725.4], [858, 738], [864, 750], [874.6, 758]] }] }
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
      if (CURVED_REFILL.has(b.bx + ',' + b.bz)) this._laneFrontage(b, new RNG(b.i * 2203 + 17), roads);
      b.roadKind = 'lane';
      return;
    }
    if (spec.kind === 'avenue') {
      // the block as it was, the avenue cut through it, and offices rebuilt in what the cut left open
      base.call(this, b);
      const roads = this._curvedRoads(b, spec);
      for (const r of roads) this._carveFor(b, r, 2);
      this._refillOffices(b, new RNG(b.i * 4447 + 71), roads);
      const rng = new RNG(b.i * 3331 + 9);
      for (const r of roads) this._kerbCars(b, rng, r, roads);
      b.roadKind = 'avenue';
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
      if (R.apart) out[out.length - 1].apart = { at: b.bx + ',' + b.bz, of: R.apart.of, name: R.apart.name };
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
  // offices set in the space a cut left: the biggest footprint that fits clear of the roads and the buildings left
  // standing, again and again, each a mid-rise with the district's styles and its frontage dressed
  _refillOffices(b, rng, roads) {
    const clear = (x0, z0, x1, z1) => roads.every(r => rectPolyDist(x0, z0, x1, z1, r.pts) > r.w / 2 + 4) && !b.bld.some(q => x0 < q.x1 + 3 && x1 > q.x0 - 3 && z0 < q.z1 + 3 && z1 > q.z0 - 3);
    const sizes = [[26, 20], [22, 16], [18, 14], [14, 12], [12, 10]];
    for (let n = 0; n < 4; n++) {
      let best = null;
      for (const [w0, d0] of sizes) {
        for (const rot of [0, 1]) {
          const w = rot ? d0 : w0, d = rot ? w0 : d0;
          for (let x = b.x0 + 1; x + w <= b.x1 - 1; x += 2) for (let z = b.z0 + 1; z + d <= b.z1 - 1; z += 2) {
            if (!clear(x, z, x + w, z + d)) continue;
            const score = w * d + rng.next();
            if (!best || score > best.score) best = { x0: x, z0: z, x1: x + w, z1: z + d, score };
          }
        }
        if (best) break;
      }
      if (!best) break;
      const style = rng.pick([STYLE.GLASS, STYLE.OFFICE, STYLE.DECO]), col = rng.pick(style === STYLE.GLASS ? PAL.glass : style === STYLE.DECO ? PAL.deco : PAL.office);
      const t = this._bld(b, best.x0, best.z0, best.x1, best.z1, rng.range(24, 46), style, col, 3.6, 3.2, { gtype: 2 });
      this._towerTiers(b, t, rng); this._dressBox(b, t, rng, 'tower');
    }
  },
  // houses and shops lining a lane cut through a block, so it is a street of its own and the block keeps its density:
  // small fronts (axis-aligned, so they step along a curve the way old frontage does) on both sides of the lane, set
  // back across a narrow pavement, each the size that fits clear of the roads, the buildings left and each other;
  // whatever stood in the courtyard where one goes is cleared
  _laneFrontage(b, rng, roads) {
    const R = roads[0], pts = R.pts, cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const L = cum[cum.length - 1], placed = [];
    const roadClear = (x0, z0, x1, z1) => roads.every(r => rectPolyDist(x0, z0, x1, z1, r.pts) > r.w / 2 + 1.6);
    const free = (x0, z0, x1, z1) => x0 >= b.x0 + 0.5 && z0 >= b.z0 + 0.5 && x1 <= b.x1 - 0.5 && z1 <= b.z1 - 0.5 && roadClear(x0, z0, x1, z1) && ![...b.bld, ...placed].some(q => x0 < q.x1 + 0.6 && x1 > q.x0 - 0.6 && z0 < q.z1 + 0.6 && z1 > q.z0 - 0.6);
    const styles = [STYLE.BRICK, STYLE.BRICK, STYLE.SHOP, STYLE.HOUSE, STYLE.APT], pal = { [STYLE.BRICK]: PAL.brick, [STYLE.SHOP]: PAL.shop, [STYLE.HOUSE]: PAL.house, [STYLE.APT]: PAL.apt };
    for (let d = 7; d < L - 7; d += 3) {
      let k = 0; while (k < pts.length - 2 && cum[k + 1] < d) k++;
      const a = pts[k], c = pts[k + 1], sl = (cum[k + 1] - cum[k]) || 1, t = (d - cum[k]) / sl, tx = (c[0] - a[0]) / sl, tz = (c[1] - a[1]) / sl;
      const px = a[0] + (c[0] - a[0]) * t, pz = a[1] + (c[1] - a[1]) * t;
      for (const side of [1, -1]) {
        let got = null;
        // (beside a lane that runs on the skew a square front's corner comes nearer than its face: it steps back)
        for (const [w0, d0] of [[9, 8], [8, 7], [7, 6.5], [6, 6]]) {
          for (let back = 0; back <= 4 && !got; back += 0.5) {
            const off = R.w / 2 + 1.7 + d0 / 2 + back, cx = px - tz * off * side, cz = pz + tx * off * side;
            // the front faces the lane: its long side across the lane's main direction
            const alongX = Math.abs(tx) >= Math.abs(tz), wx = alongX ? w0 : d0, wz = alongX ? d0 : w0;
            const q = [cx - wx / 2, cz - wz / 2, cx + wx / 2, cz + wz / 2];
            if (free(...q)) got = q;
          }
          if (!got) continue;
          const [x0, z0, x1, z1] = got;
          const style = rng.pick(styles), h = rng.range(7, 13), fh = style === STYLE.SHOP ? 3.6 : 3.1;
          const r = this._bld(b, x0, z0, x1, z1, h, style, rng.pick(pal[style]), fh, style === STYLE.BRICK ? 2.6 : 3.2, { gtype: style === STYLE.SHOP ? 1 : 0 });
          this._rooftop(b, r, rng, 'old'); placed.push(r);
          // clear the courtyard's dressing out of its footprint
          const inR = (x, z, m = 0.4) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m;
          b.det = b.det.filter(q => !(q.col && q.col.x0 !== undefined ? q.col.x0 < x1 && q.col.x1 > x0 && q.col.z0 < z1 && q.col.z1 > z0 : inR(q.x, q.z)));
          for (let i = b.props.length - 1; i >= 0; i--) { const p = b.props[i]; if (!inR(p.x, p.z, 0.8)) continue; const list = this.propTypes[p.type], li = list ? list.indexOf(p) : -1; if (li >= 0) list.splice(li, 1); b.props.splice(i, 1); }
          for (const key of ['seats', 'parked', 'secrets', 'signs', 'fx']) if (b[key]) b[key] = b[key].filter(o => o.x === undefined || !inR(o.x, o.z, 1));
          if (b.water) b.water = b.water.filter(o => !inR(o.x, o.z, o.r || 0));
          break;
        }
      }
    }
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
// a curved street laid across two blocks keeps one name only while the layout keeps the blocks together; run after
// the bake, under the real layout
World.prototype._nameApart = function () {
  const off = k => { const [x, z] = k.split(',').map(Number), p = CityLayout.precinctOf(x, z); return p.ox + ',' + p.oz; };
  for (const r of this.localRoads) if (r.apart && off(r.apart.at) !== off(r.apart.of)) r.link = r.apart.name;
};
