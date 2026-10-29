/* =====================================================================
   [CONTENT] CITY v2: local roads, superblocks, districts and the homes registry
   The lattice of arterial streets is broken up by superblocks and threaded with local
   streets: cul-de-sacs and crescents in Linden Hills, private drives in Crestmoor, the ring
   road and lot at the stadium, container lanes at the terminal, park drives and farm tracks.
   Every house that is built is registered in world.homes (door, garage, parking bays) so the
   property ladder and the enterable-house system can pick from real buildings.
   ===================================================================== */
const LOCAL_STYLE = { asphalt: 'rgb(255,0,0)', gravel: 'rgb(0,255,0)', dirt: 'rgb(0,255,0)', concrete: 'rgb(0,0,255)' };
const LOCAL_MAPCOL = { asphalt: '#6f7682', gravel: '#9a8a68', dirt: '#8a7650', concrete: '#77746e' };
// unit vector of a facing code: 0 north (-z), 1 south (+z), 2 west (-x), 3 east (+x)
const FACE_V = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const faceOf = (dx, dz) => Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? 2 : 3) : (dz < 0 ? 0 : 1);
// distance from a point to segment ab
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// points along a circular arc (centre cx,cz, radius r, from angle a0 to a1, n steps)
// Catmull-Rom through the control points, resampled about every `step` metres. A curved road is
// stored once as this polyline: the ground shader paints it, both maps draw it and traffic and the
// GPS follow it, so all four always agree.
function splinePts(pts, step = 2.5) {
  if (pts.length < 3) return pts.map(q => [q[0], q[1]]);
  const out = [[pts[0][0], pts[0][1]]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}
function arcPts(cx, cz, r, a0, a1, n = 8) { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return out; }

Object.assign(World.prototype, {
  // ---------------------------------------------------------------- local road shapes
  _road(pts, w, st = 'asphalt', o) { const r = { k: 'line', pts: o && o.smooth ? splinePts(pts) : pts, w, st }; if (o && o.link) r.link = o.link; this.localRoads.push(r); return r; },
  _areaS(pts, st = 'concrete') { const r = { k: 'poly', pts, st }; this.localRoads.push(r); return r; },
  _rectS(x0, z0, x1, z1, st = 'concrete') { return this._areaS([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], st); },
  _discS(x, z, r, st = 'asphalt') { const s = { k: 'disc', x, z, r, st }; this.localRoads.push(s); return s; },
  // signed-ish distance from (x,z) to the nearest lane (asphalt/gravel; concrete yards when yards)
  _roadDist(x, z, yards = false) {
    let best = 1e9;
    for (const r of this.localRoads) {
      if (r.st === 'concrete' && !yards) continue;
      if (r.k === 'line') { for (let i = 0; i < r.pts.length - 1; i++) { const d = segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]) - r.w / 2; if (d < best) best = d; } }
      else if (r.k === 'disc') { const d = Math.hypot(x - r.x, z - r.z) - r.r; if (d < best) best = d; }
      else if (pointInPoly(x, z, r.pts)) best = Math.min(best, -1);
      else { for (let i = 0; i < r.pts.length; i++) { const a = r.pts[i], b2 = r.pts[(i + 1) % r.pts.length]; const d = segDist(x, z, a[0], a[1], b2[0], b2[1]); if (d < best) best = d; } }
    }
    return best;
  },
  // is the axis-aligned rect clear of every local lane (by margin)?
  _rectClear(x0, z0, x1, z1, margin = 0.5, yards = false) {
    for (let x = x0; x <= x1 + 1e-6; x += Math.max(1, (x1 - x0) / 8)) for (let z = z0; z <= z1 + 1e-6; z += Math.max(1, (z1 - z0) / 8)) if (this._roadDist(x, z, yards) < margin) return false;
    return true;
  },
  _buildLocalRaster() {
    const S = LOCAL.S, c = document.createElement('canvas'); c.width = S; c.height = S;
    const g = c.getContext('2d'), k = S / 1056, X = v => (v + 48) * k;
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of this.localRoads) {
      g.fillStyle = g.strokeStyle = LOCAL_STYLE[r.st] || LOCAL_STYLE.asphalt;
      g.beginPath();
      if (r.k === 'line') { g.lineWidth = r.w * k; r.pts.forEach((q, i) => i ? g.lineTo(X(q[0]), X(q[1])) : g.moveTo(X(q[0]), X(q[1]))); g.stroke(); }
      else if (r.k === 'disc') { g.arc(X(r.x), X(r.z), r.r * k, 0, Math.PI * 2); g.fill(); }
      else { r.pts.forEach((q, i) => i ? g.lineTo(X(q[0]), X(q[1])) : g.moveTo(X(q[0]), X(q[1]))); g.closePath(); g.fill(); }
    }
    g.globalCompositeOperation = 'source-over';
    LOCAL.canvas = c; LOCAL.data = g.getImageData(0, 0, S, S).data;
    // lanes only (streets, drives, paths): what props must keep clear of. Lots and yards are
    // paved but may hold lamp islands, dumpsters and pallets, so they are not in this mask.
    const lc = document.createElement('canvas'); lc.width = S; lc.height = S;
    const lg = lc.getContext('2d'); lg.fillStyle = '#000'; lg.fillRect(0, 0, S, S); lg.lineCap = 'round'; lg.lineJoin = 'round'; lg.fillStyle = lg.strokeStyle = '#fff';
    for (const r of this.localRoads) {
      if (r.st === 'concrete' || r.k === 'poly') continue;
      lg.beginPath();
      if (r.k === 'line') { lg.lineWidth = r.w * k; r.pts.forEach((q, i) => i ? lg.lineTo(X(q[0]), X(q[1])) : lg.moveTo(X(q[0]), X(q[1]))); lg.stroke(); }
      else { lg.arc(X(r.x), X(r.z), r.r * k, 0, Math.PI * 2); lg.fill(); }
    }
    const ld = lg.getImageData(0, 0, S, S).data, lane = new Uint8Array(S * S);
    for (let i = 0; i < S * S; i++) lane[i] = ld[i * 4];
    LOCAL.lane = lane;
  },
  localTexture() {
    if (!LOCAL.canvas) this._buildLocalRaster();
    const t = new THREE.CanvasTexture(LOCAL.canvas);
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    return t;
  },
  // big map / minimap: superblock ground, local roads and ponds, drawn in map space
  paintMapExtra(g, X, k, view, phase) {
    if (phase !== 'ground') return;
    for (const sb of SUPERBLOCKS) {
      g.fillStyle = MAP_LAND_COLS[sb.land] || '#4d5c47';
      g.fillRect(X(sb.bx0 * P + ROAD_HALF), X(sb.bz0 * P + ROAD_HALF), ((sb.bx1 - sb.bx0 + 1) * P - ROAD_HALF * 2) * k, ((sb.bz1 - sb.bz0 + 1) * P - ROAD_HALF * 2) * k);
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const st of ['concrete', 'dirt', 'gravel', 'asphalt']) for (const r of this.localRoads) {
      if (r.st !== st) continue;
      g.fillStyle = g.strokeStyle = LOCAL_MAPCOL[r.st];
      g.beginPath();
      if (r.k === 'line') { g.lineWidth = Math.max(1, r.w * k); r.pts.forEach((q, i) => i ? g.lineTo(X(q[0]), X(q[1])) : g.moveTo(X(q[0]), X(q[1]))); g.stroke(); }
      else if (r.k === 'disc') { g.arc(X(r.x), X(r.z), r.r * k, 0, 7); g.fill(); }
      else { r.pts.forEach((q, i) => i ? g.lineTo(X(q[0]), X(q[1])) : g.moveTo(X(q[0]), X(q[1]))); g.closePath(); g.fill(); }
    }
    g.fillStyle = '#2f6e8a';
    for (const b of this.blocks) for (const w of b.water) if (w.r > 3) { g.beginPath(); g.arc(X(w.x), X(w.z), w.r * k, 0, 7); g.fill(); }
  },
  // ---------------------------------------------------------------- superblocks
  _sbRun(sb, rng) {
    sb.x0 = sb.bx0 * P + INNER; sb.z0 = sb.bz0 * P + INNER; sb.x1 = (sb.bx1 + 1) * P - INNER; sb.z1 = (sb.bz1 + 1) * P - INNER;
    sb.cx = (sb.x0 + sb.x1) / 2; sb.cz = (sb.z0 + sb.z1) / 2;
    const a = this.block(sb.bx0, sb.bz0);
    sb.members = []; for (let bz = sb.bz0; bz <= sb.bz1; bz++) for (let bx = sb.bx0; bx <= sb.bx1; bx++) sb.members.push(this.block(bx, bz));
    this[sb.gen](a, sb, rng);
    this._sbDistribute(sb, a);
  },
  // sidewalks, lamps and curb furniture along the superblock's outer streets
  _sbSidewalks(sb, rng, o) { for (const m of sb.members) this._sidewalk(m, rng, o); },
  // everything the generator wrote into the anchor block goes to the block it stands in,
  // so chunk streaming, parked cars and props load with the right piece of the city
  _sbDistribute(sb, a) {
    const own = (x, z) => this.block(clamp(Math.floor(x / P), sb.bx0, sb.bx1), clamp(Math.floor(z / P), sb.bz0, sb.bz1));
    const move = (key, cx, cz) => {
      const keep = [];
      for (const it of a[key]) { const t = own(cx(it), cz(it)); if (t === a) keep.push(it); else { t[key].push(it); if (key === 'props') it.block = t.i; } }
      a[key] = keep;
    };
    move('bld', r => (r.x0 + r.x1) / 2, r => (r.z0 + r.z1) / 2);
    move('det', d => d.x, d => d.z);
    move('props', p => p.x, p => p.z);
    move('parked', p => p.x, p => p.z);
    move('signs', s => s.x, s => s.z);
    move('billboards', s => s.x, s => s.z);
    move('fx', f => f.x !== undefined ? f.x : (f.x0 + f.x1) / 2, f => f.z !== undefined ? f.z : (f.z0 + f.z1) / 2);
    move('secrets', s => s.x, s => s.z);
    move('seats', s => s.x, s => s.z);
    move('water', w => w.x, w => w.z);
    if (a.wires) { for (const m of sb.members) m.wires = m.wires || []; move('wires', w => w[0], w => w[2]); }
    if (a.drives) { for (const m of sb.members) m.drives = m.drives || []; move('drives', d => (d.x0 + d.x1) / 2, d => (d.z0 + d.z1) / 2); }
  },
  // ---------------------------------------------------------------- houses
  /* One residential building with its lot furniture. spec:
     x, z      centre of the main house footprint
     face      0 N, 1 S, 2 W, 3 E: the direction the front door faces
     w, d      frontage width and depth
     type      'bungalow' | 'house' | 'semi' | 'townhouse' | 'apartment' | 'large' | 'mansion' | 'farm'
     garage    'street' | 'carport' | 'single' | 'double' | 'triple' (attached on side gs = -1/1)
     drive     how far the driveway runs from the front plane to the street (metres)
     Returns the home record (also pushed to world.homes). */
  _house(b, rng, spec) {
    const f = FACE_V[spec.face], ns = spec.face < 2;
    const lat = ns ? [1, 0] : [0, 1];
    const type = spec.type || 'house';
    const floors = spec.floors || (type === 'bungalow' ? 1 : type === 'apartment' ? 3 : type === 'mansion' ? 3 : type === 'farm' ? 2 : 2);
    const fh = type === 'apartment' ? 3.0 : 3.0;
    const w = spec.w, d = spec.d;
    const hw = ns ? w / 2 : d / 2, hd = ns ? d / 2 : w / 2;
    const x0 = spec.x - hw, x1 = spec.x + hw, z0 = spec.z - hd, z1 = spec.z + hd;
    const color = spec.color || rng.pick(type === 'apartment' ? PAL.apt : type === 'mansion' ? [0xf0ebe0, 0xe8e0d0, 0xd8d4cc] : PAL.house);
    const flat = type === 'apartment' || spec.flat;
    const r = this._bld(b, x0, z0, x1, z1, floors * fh, flat ? STYLE.APT : STYLE.HOUSE, color, fh, type === 'apartment' ? 3.2 : 2.8, flat ? {} : { roof: 'gable', roofColor: spec.roofColor || rng.pick(PAL.roof) });
    r.ridgeX = ns;
    if (flat) this._rooftop(b, r, rng, 'mid');
    else if (rng.chance(0.5)) this._det(b, 'box', spec.x + lat[0] * w * 0.28, r.y0 + r.h + 1.6, spec.z + lat[1] * w * 0.28, 0.7, 2.4, 0.7, 0x7a4a3a);
    if (type === 'apartment') this._dress(b, r, rng, { ax: ns ? 'x' : 'z', dir: spec.face === 0 || spec.face === 2 ? 1 : -1, ry: 0, fx: f[0], fz: f[1], faceX: spec.x + f[0] * hd, faceZ: spec.z + f[1] * hd, w, shop: false });
    // front plane, door, porch
    const fx = spec.x + f[0] * (ns ? hd : hw), fz = spec.z + f[1] * (ns ? hd : hw);
    const doorOff = spec.doorOff !== undefined ? spec.doorOff : (spec.garage && spec.garage !== 'street' && spec.garage !== 'carport' ? -(spec.gs || 1) * w * 0.18 : 0);
    const dx = fx + lat[0] * doorOff, dz = fz + lat[1] * doorOff;
    const trim = C(0xe8e2d4);
    this._det(b, 'box', dx + f[0] * 0.04, CURB_H + 1.1, dz + f[1] * 0.04, ns ? 1.1 : 0.08, 2.2, ns ? 0.08 : 1.1, C(spec.doorColor || rng.pick([0x3a2a1e, 0x2a3f5a, 0x7a2a2a, 0x2a4a3a])));
    this._det(b, 'box', dx + f[0] * 0.9, CURB_H + 0.12, dz + f[1] * 0.9, ns ? 2.4 : 1.6, 0.24, ns ? 1.6 : 2.4, trim.clone().multiplyScalar(0.8));
    if (type !== 'apartment' && floors >= 1) this._det(b, 'box', dx + f[0] * 0.9, CURB_H + 2.6, dz + f[1] * 0.9, ns ? 2.8 : 1.8, 0.12, ns ? 1.8 : 2.8, C(color).multiplyScalar(0.6));
    const home = { id: 'home' + this.homes.length, block: b.i, type, floors, x0, z0, x1, z1, face: spec.face, door: { x: dx + f[0] * 1.6, z: dz + f[1] * 1.6, h: Math.atan2(f[0], f[1]) }, inner: { x: dx, z: dz }, bays: [], garage: spec.garage || 'street', district: zoneKey(spec.x, spec.z), name: spec.name || null, lot: spec.lot || null };
    // attached garage / carport on one side, flush with the front. The side (and if need be the
    // size) is chosen so the garage never sits on a drive, a lane or another building.
    let gs = spec.gs || 1, gk = spec.garage || 'street';
    const NB = { single: 1, double: 2, triple: 3, carport: spec.carportN || 1 };
    const gRect = (side, n) => { const gw = n * 3.3 + 0.4, half = ns ? hw : hd, gd = 6.6; const gcx = spec.x + lat[0] * side * (half + gw / 2), gcz = spec.z + lat[1] * side * (half + gw / 2); const fcx = gcx + f[0] * ((ns ? hd : hw) - gd / 2), fcz = gcz + f[1] * ((ns ? hd : hw) - gd / 2); return [fcx - (ns ? gw / 2 : gd / 2), fcz - (ns ? gd / 2 : gw / 2), fcx + (ns ? gw / 2 : gd / 2), fcz + (ns ? gd / 2 : gw / 2)]; };
    const gFree = (side, n) => { const [a0, b0, a1, b1] = gRect(side, n); return this._rectClear(a0, b0, a1, b1, 0.5) && !b.bld.some(q => q !== r && q.y0 <= CURB_H + 0.01 && a0 < q.x1 && a1 > q.x0 && b0 < q.z1 && b1 > q.z0) && a0 > b.x0 - 0.5 && a1 < b.x1 + 0.5 && b0 > b.z0 - 0.5 && b1 < b.z1 + 0.5; };
    const order = ['triple', 'double', 'single', 'carport'];
    if (NB[gk]) {
      let ok = false;
      for (let k = order.indexOf(gk); k < order.length && !ok; k++) for (const side of [gs, -gs]) if (gFree(side, NB[order[k]])) { gk = order[k]; gs = side; ok = true; break; }
      if (!ok) gk = 'street';
      home.garage = gk;
    }
    const nb = gk === 'single' ? 1 : gk === 'double' ? 2 : gk === 'triple' ? 3 : gk === 'carport' ? (spec.carportN || 1) : 0;
    const noseIn = Math.atan2(-f[0], -f[1]);
    if (nb) {
      const gw = nb * 3.3 + 0.4, gd = 6.6, gh = gk === 'carport' ? 2.6 : 3.0;
      const side = ns ? hw : hd; // half frontage
      const gcx = spec.x + lat[0] * gs * (side + gw / 2), gcz = spec.z + lat[1] * gs * (side + gw / 2);
      const fcx = gcx + f[0] * ((ns ? hd : hw) - gd / 2), fcz = gcz + f[1] * ((ns ? hd : hw) - gd / 2); // garage centre, front flush
      const gx0 = fcx - (ns ? gw / 2 : gd / 2), gx1 = fcx + (ns ? gw / 2 : gd / 2), gz0 = fcz - (ns ? gd / 2 : gw / 2), gz1 = fcz + (ns ? gd / 2 : gw / 2);
      if (gk === 'carport') {
        const rc = C(0x5a4a3a);
        for (const [a, c2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const px = fcx + (ns ? a * (gw / 2 - 0.2) : c2 * (gd / 2 - 0.2)), pz = fcz + (ns ? c2 * (gd / 2 - 0.2) : a * (gw / 2 - 0.2)); this._det(b, 'box', px, CURB_H + gh / 2, pz, 0.18, gh, 0.18, rc, 0, { x: px, z: pz, r: 0.14, y0: 0, y1: gh, kind: 'det' }); }
        this._det(b, 'box', fcx, CURB_H + gh + 0.08, fcz, gx1 - gx0 + 0.4, 0.16, gz1 - gz0 + 0.4, C(0x6a6f74));
      } else {
        const gr = this._bld(b, gx0, gz0, gx1, gz1, gh, STYLE.HOUSE, color, gh, 3.2, { exactH: true, roof: 'flat' });
        gr.garageOf = home.id;
        this._det(b, 'box', fcx, CURB_H + gh + 0.12, fcz, gx1 - gx0 + 0.2, 0.24, gz1 - gz0 + 0.2, C(spec.roofColor || 0x4a4f54));
        home.garageRect = { x0: gx0, z0: gz0, x1: gx1, z1: gz1, h: gh, building: gr };
      }
      const doors = [];
      for (let i = 0; i < nb; i++) {
        const o = -gw / 2 + 0.2 + 3.3 * (i + 0.5);
        const bx2 = fcx + lat[0] * o, bz2 = fcz + lat[1] * o;
        const fpx = bx2 + f[0] * (gd / 2), fpz = bz2 + f[1] * (gd / 2); // on the front plane
        if (gk !== 'carport') { this._det(b, 'box', fpx + f[0] * 0.05, CURB_H + 1.15, fpz + f[1] * 0.05, ns ? 2.8 : 0.08, 2.3, ns ? 0.08 : 2.8, C(0xe4e2dc)); doors.push({ x: fpx, z: fpz, w: 2.8, h: 2.3, face: spec.face }); }
        // stored cars park nose-in inside the bay
        home.bays.push({ x: bx2 - f[0] * 0.2, z: bz2 - f[1] * 0.2, h: noseIn, kind: gk, y: CURB_H });
        // driveway in front of every bay, all the way to a street
        this._driveTo(b, fpx, fpz, spec.face, spec.drive, spec.apron);
      }
      home.garageDoors = doors;
      home.garageFront = { x: fcx + f[0] * (gd / 2), z: fcz + f[1] * (gd / 2), face: spec.face, w: gw };
    } else {
      // street parking: one spot on the driveway (or kerb) in front of the house
      // no garage: a parking pad beside the front path that reaches the street
      const sx = fx + lat[0] * (w * 0.32), sz = fz + lat[1] * (w * 0.32);
      const L = this._driveTo(b, sx, sz, spec.face, spec.drive, spec.apron);
      home.bays.push({ x: sx + f[0] * clamp(L * 0.5, 2.6, 4), z: sz + f[1] * clamp(L * 0.5, 2.6, 4), h: Math.atan2(-f[0], -f[1]), kind: 'street', y: CURB_H });
    }
    // mailbox by the drive, a tree or two in the front yard
    const mb = [fx + f[0] * 2.2 - lat[0] * (w * 0.5 - 0.6), fz + f[1] * 2.2 - lat[1] * (w * 0.5 - 0.6)];
    if (type !== 'apartment' && this._roadDist(mb[0], mb[1]) > 1) this._prop(b, 'mailbox', mb[0], mb[1], Math.atan2(f[0], f[1]));
    this.homes.push(home);
    return home;
  },
  /* driveway from a point on a front plane, facing `face`, to the nearest street:
     len number  - fixed length (then an apron across the sidewalk when apron is set)
     len 'auto'  - straight out until it meets a local road; if none is in line, a short
                   asphalt spur joins the nearest one. Returns the paved length. */
  _driveTo(b, x, z, face, len = 'auto', apron = false) {
    const f = FACE_V[face], ns = face < 2;
    const pad = (L, x2 = x, z2 = z) => {
      if (L < 0.3) return;
      const cx = x2 + f[0] * L / 2, cz = z2 + f[1] * L / 2;
      this._det(b, 'box', cx, CURB_H + 0.012, cz, ns ? 3.0 : L, 0.025, ns ? L : 3.0, C(0xa29d94));
      (b.drives || (b.drives = [])).push({ x0: cx - (ns ? 1.5 : L / 2), z0: cz - (ns ? L / 2 : 1.5), x1: cx + (ns ? 1.5 : L / 2), z1: cz + (ns ? L / 2 : 1.5) });
    };
    if (typeof len === 'number') {
      pad(len);
      if (apron) { const ax = x + f[0] * len, az = z + f[1] * len; const cx = ax + f[0] * WALK_W / 2, cz = az + f[1] * WALK_W / 2; this._det(b, 'box', cx, CURB_H + 0.01, cz, ns ? 3.0 : WALK_W, 0.02, ns ? WALK_W : 3.0, C(0x9a958c)); (b.drives || (b.drives = [])).push({ x0: cx - (ns ? 1.5 : WALK_W / 2), z0: cz - (ns ? WALK_W / 2 : 1.5), x1: cx + (ns ? 1.5 : WALK_W / 2), z1: cz + (ns ? WALK_W / 2 : 1.5) }); }
      return len;
    }
    for (let t = 0; t <= 22; t += 0.5) if (this._roadDist(x + f[0] * t, z + f[1] * t) < 0.15) { pad(t); return t; }
    // nothing straight ahead: pave 3 m, then join the closest lane
    pad(3);
    const sx = x + f[0] * 3, sz = z + f[1] * 3;
    let best = null, bd = 1e9;
    for (let r = 2; r <= 30 && !best; r += 2) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, qx = sx + Math.cos(a) * r, qz = sz + Math.sin(a) * r; if (this._roadDist(qx, qz) < -0.5) { const d = Math.hypot(qx - sx, qz - sz); if (d < bd) { bd = d; best = [qx, qz]; } } }
    if (best) this._road([[sx, sz], best], 3.2);
    return 3 + (best ? bd : 0);
  },
  // fence or hedge run between two points (axis-aligned)
  _fence(b, x0, z0, x1, z1, kind = 'picket', h) {
    const len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.4) return;
    const ax = Math.abs(x1 - x0) > Math.abs(z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const col = kind === 'hedge' ? C(0x2f5a26) : kind === 'wall' ? C(0xb8ab94) : kind === 'rail' ? C(0x8a7050) : kind === 'chain' ? C(0x5c6166) : C(0xf0eee8);
    const t = kind === 'hedge' ? 1.0 : kind === 'wall' ? 0.45 : 0.08, hh = h || (kind === 'hedge' ? 1.4 : kind === 'wall' ? 1.2 : kind === 'chain' ? 2.2 : 1.0);
    this._det(b, 'box', cx, CURB_H + hh / 2, cz, ax ? len : t, hh, ax ? t : len, col, 0, true);
    if (kind === 'wall') this._det(b, 'box', cx, CURB_H + hh + 0.06, cz, ax ? len + 0.1 : t + 0.12, 0.12, ax ? t + 0.12 : len + 0.1, C(0xd8ccb4));
  },
  // a fence run between any two points (a short run along a curved road): drawn along the line, its collider the
  // run's box (the runs are short and nearly straight with the axes, so the box is barely wider than the rail)
  _fenceSeg(b, x0, z0, x1, z1, kind = 'rail', h) {
    const len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.4) return;
    const col = kind === 'rail' ? C(0x8a7050) : kind === 'chain' ? C(0x5c6166) : C(0xf0eee8), hh = h || (kind === 'chain' ? 2.2 : 1.0), t = 0.08, ry = Math.atan2(x1 - x0, z1 - z0);
    this._det(b, 'box', (x0 + x1) / 2, CURB_H + hh / 2, (z0 + z1) / 2, t, hh, len + 0.04, col, ry, { x0: Math.min(x0, x1) - t, x1: Math.max(x0, x1) + t, z0: Math.min(z0, z1) - t, z1: Math.max(z0, z1) + t, y0: 0, y1: CURB_H + hh, kind: 'det' });
  },
  _yardTrees(b, rng, x0, z0, x1, z1, n, kinds = ['tree', 'tree', 'bush']) {
    for (let i = 0, tries = 0; i < n && tries < n * 8; tries++) {
      const x = rng.range(x0, x1), z = rng.range(z0, z1);
      if (this._roadDist(x, z, true) < 2.2 || this._inBld(b, x, z, 1.8)) continue;
      this._prop(b, rng.pick(kinds), x, z, rng.range(0, 6), rng.range(0.85, 1.2)); i++;
    }
  },
  _inBld(b, x, z, m = 0) { for (const r of b.bld) if (x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m) return true; return false; },
  // local frame for a block whose entrance is on side `s` (0 N, 1 S, 2 W, 3 E): u lateral, v inward
  _frame(b, s) {
    const v = [[0, 1], [0, -1], [1, 0], [-1, 0]][s], u = [v[1], -v[0]];
    return { s, u, v, to: (a, c) => [b.cx + u[0] * a + v[0] * c, b.cz + u[1] * a + v[1] * c], face: (da, dc) => faceOf(u[0] * da + v[0] * dc, u[1] * da + v[1] * dc) };
  }
});
// suburb blocks that get a corner-cutting curved lane (a real through road between two streets).
// Picked so no property on the home ladder moves: those houses are chosen by order of generation.
// No property may be pinned (`at`) in these blocks: a pin cancels the bend (the Linden shops stand across the street, on 2,9).
const BEND_BLOCKS = [[0, 7, 'Hawthorn Bend'], [0, 8, 'Kestrel Curve'], [1, 8, 'Millrace Lane'], [2, 10, 'Willow Bend']];
// ---------------------------------------------------------------- Linden Hills (standard suburbs)
Object.assign(World.prototype, {
  _genSuburb(b, rng) {
    this._sidewalk(b, rng, { trees: 0.75, park: 0.3 });
    const v = rng.int(0, 3);
    const bend = this._bendSide(b);
    if (bend !== null) this._bendLane(b, rng, bend);
    else if (v === 0) this._culdesac(b, rng);
    else if (v === 1) this._crescent(b, rng);
    else if (v === 2) this._streetLots(b, rng);
    else this._lowrise(b, rng);
    if (b.special === 'safehouse' && !b.safehouse) {
      // the starter safehouse: the house closest to the block's south-west corner
      const pref = x => x.garage === 'single' || x.garage === 'double' ? 0 : 1;
      const h = this.homes.filter(x => x.block === b.i && x.type !== 'apartment').sort((a, c) => pref(a) - pref(c) || Math.hypot(a.door.x - b.x0, a.door.z - b.z1) - Math.hypot(c.door.x - b.x0, c.door.z - b.z1))[0];
      if (h) { h.reserved = 'linden'; const bay = h.bays[0]; b.safehouse = { x: h.door.x, z: h.door.z, h: h.door.h, home: h, garage: bay ? { x: bay.x + Math.sin(bay.h) * -4.2, z: bay.z + Math.cos(bay.h) * -4.2, h: bay.h + Math.PI } : { x: h.door.x, z: h.door.z, h: 0 } }; }
      else b.safehouse = { x: b.x0 + 8, z: b.z1 + 1.5, garage: { x: b.x0 + 16, z: b.z1 + 5.15, h: -Math.PI / 2 } };
    }
  },
  _pickHouse(rng, rich) {
    const r = rng.next();
    if (rich) return r < 0.5 ? { type: 'large', w: 16, d: 11, garage: 'double' } : r < 0.85 ? { type: 'large', w: 18, d: 12, garage: 'triple' } : { type: 'house', w: 14, d: 10, garage: 'double' };
    return r < 0.22 ? { type: 'bungalow', w: 12, d: 9, garage: rng.chance(0.5) ? 'carport' : 'street' }
      : r < 0.5 ? { type: 'house', w: 10, d: 9, garage: 'single' }
      : r < 0.7 ? { type: 'house', w: 11, d: 9, garage: 'double' }
      : r < 0.85 ? { type: 'bungalow', w: 11, d: 8.5, garage: 'single' }
      : { type: 'house', w: 9, d: 8.5, garage: 'carport' };
  },
  // a lot of houses described in a block frame: [a, c, face (local da,dc), spec]
  _placeLocal(b, rng, F, list) {
    const out = [];
    for (const [a, c, da, dc, sp] of list) {
      const [x, z] = F.to(a, c);
      const face = F.face(da, dc);
      const spec = Object.assign({ x, z, face, drive: 'auto', gs: rng.chance(0.5) ? 1 : -1 }, sp);
      // keep the attached garage inside the block; flip it if it would poke out or hit a road
      const ns = face < 2, half = (ns ? spec.w : spec.w) / 2, gw = spec.garage === 'triple' ? 10.3 : spec.garage === 'double' ? 7 : spec.garage === 'single' || spec.garage === 'carport' ? 3.7 : 0;
      const lat = ns ? [1, 0] : [0, 1];
      const ok = gs => { const ex = x + lat[0] * gs * (half + gw), ez = z + lat[1] * gs * (half + gw); return ex > b.x0 + 1 && ex < b.x1 - 1 && ez > b.z0 + 1 && ez < b.z1 - 1 && this._roadDist(ex, ez) > 2.5; };
      if (gw && !ok(spec.gs)) { if (ok(-spec.gs)) spec.gs = -spec.gs; else spec.garage = 'street'; }
      out.push(this._house(b, rng, spec));
    }
    return out;
  },
  _culdesac(b, rng) {
    // the stem enters 28 m along the street (clear of the streetlights at 16 and 40 m) and bends
    // into a turning circle; houses face the circle, the stem and the outer streets
    const F = this._frame(b, rng.int(0, 3));
    this._road([F.to(-12, -34.6), F.to(-12, -8), F.to(-6, 2)], 7.2);
    const [ccx, ccz] = F.to(0, 7); this._discS(ccx, ccz, 10.5);
    const H = () => this._pickHouse(rng, false);
    this._placeLocal(b, rng, F, [
      [0, 24.5, 0, -1, H()],
      [-20.5, 8, 1, 0, H()], [20.5, 8, -1, 0, H()],
      [-24.5, -19, 1, 0, Object.assign(H(), { w: 10 })]
    ]);
    // houses that front the outer streets: the entrance-right lot and the two back corners
    for (const [la, lc, da] of [[21, -19, 1], [-24.5, 25, -1], [24.5, 25, 1]]) {
      const pt = F.to(la, lc), face = F.face(da, 0), f = FACE_V[face];
      const toEdge = face < 2 ? (f[1] < 0 ? pt[1] - b.z0 : b.z1 - pt[1]) : (f[0] < 0 ? pt[0] - b.x0 : b.x1 - pt[0]);
      this._house(b, rng, { x: pt[0], z: pt[1], face, type: 'bungalow', w: 9, d: 8, garage: 'street', drive: Math.max(0.5, toEdge - 4), apron: true, doorOff: 0 });
    }
    this._yardTrees(b, rng, b.x0 + 1, b.z0 + 1, b.x1 - 1, b.z1 - 1, 10);
    this._prop(b, 'parklamp', ...F.to(-6.5, -12)); this._prop(b, 'parklamp', ...F.to(-12, 9));
    b.secrets.push({ x: (b.x0 + b.x1) / 2 + 8, z: (b.z0 + b.z1) / 2 + 8 });
    b.roadKind = 'culdesac';
  },
  // which side a corner-cutting bend could enter from, or null. Chosen blocks only (BEND_BLOCKS):
  // never a block that hosts the safehouse, a property, a contact or a gang HQ, and
  // only where both streets it joins are open (so it is a real through road, not decoration)
  _bendSide(b) {
    if (b.special || b.superblock || !BEND_BLOCKS.some(([x, z]) => x === b.bx && z === b.bz)) return null;
    const used = (at) => at && at[0] === b.bx && at[1] === b.bz;
    if (PROPS.some(d => used(d.at)) || SPOTS.some(d => used(d.at)) || Object.values(HQS).some(used)) return null;
    const s0 = Math.floor(hash2i(b.bx, b.bz, 917) * 4);
    for (let k = 0; k < 4; k++) {
      const F = this._frame(b, (s0 + k) % 4), [pts] = [this._bendPts(F)];
      if (Links.attach(pts[0]) && Links.attach(pts[pts.length - 1])) return (s0 + k) % 4;
    }
    return null;
  },
  // a quarter-circle lane round the inside of the block corner between side s and the side to its right
  _bendPts(F) {
    const R = 26, t0 = Math.asin(5.4 / R), t1 = Math.PI / 2 - t0, out = [];
    for (let i = 0; i <= 12; i++) { const t = t0 + (t1 - t0) * i / 12; out.push(F.to(40 - R * Math.cos(t), -40 + R * Math.sin(t))); }
    return out;
  },
  _bendLane(b, rng, side) {
    const F = this._frame(b, side), pts = this._bendPts(F);
    const name = BEND_BLOCKS.find(([x, z]) => x === b.bx && z === b.bz)[2];
    this._road(pts, 7, 'asphalt', { smooth: true, link: name });
    const H = () => this._pickHouse(rng, false);
    // homes in the big part of the block, facing the three other streets
    this._placeLocal(b, rng, F, [
      [-22, -22, 0, -1, Object.assign(H(), { w: 10 })],
      [-22, 20, -1, 0, Object.assign(H(), { w: 10 })],
      [16, 22, 0, 1, Object.assign(H(), { w: 10 })],
      [-2, 0, 1, 0, Object.assign(H(), { w: 9, garage: 'carport' })]
    ]);
    // the corner inside the bend: a pocket green with trees, a bench and a lamp
    const [gx, gz] = F.to(31, -31);
    this._prop(b, 'bench', gx, gz, 0); b.seats.push({ x: gx, z: gz, ry: 0 });
    for (const [a, c] of [[27, -35], [35, -27], [34, -34]]) { const [tx, tz] = F.to(a, c); this._prop(b, 'tree', tx, tz, rng.range(0, 6), rng.range(0.9, 1.15)); }
    const [lx, lz] = F.to(40 - 26 * Math.cos(Math.PI / 4) - 4.6, -40 + 26 * Math.sin(Math.PI / 4) + 4.6); this._prop(b, 'parklamp', lx, lz, 0);
    this._yardTrees(b, rng, b.x0 + 1, b.z0 + 1, b.x1 - 1, b.z1 - 1, 7);
    b.roadKind = 'bend';
  },
  _crescent(b, rng) {
    // a U-shaped lane: in on one side, around a green, out on the same side
    const F = this._frame(b, rng.int(0, 3));
    const arc = []; for (let i = 0; i <= 10; i++) { const a = Math.PI - i / 10 * Math.PI; arc.push(F.to(Math.cos(a) * 17, 8 + Math.sin(a) * 13)); }
    this._road([F.to(-17, -34.6), ...arc, F.to(17, -34.6)], 7);
    const H = () => this._pickHouse(rng, false);
    // inside the U: two homes back to back facing the lanes, and a little green
    this._placeLocal(b, rng, F, [
      [-6.5, -12, -1, 0, Object.assign(H(), { w: 10, garage: 'carport' })], [6.5, -12, 1, 0, Object.assign(H(), { w: 10, garage: 'carport' })],
      // outside the U: homes facing in across the lane
      [-26, -18, 1, 0, Object.assign(H(), { w: 10 })], [-26, 2, 1, 0, Object.assign(H(), { w: 10 })],
      [26, -18, -1, 0, Object.assign(H(), { w: 10 })], [26, 2, -1, 0, Object.assign(H(), { w: 10 })]
    ]);
    const [gx, gz] = F.to(0, 6);
    this._prop(b, 'bench', gx, gz, 0); b.seats.push({ x: gx, z: gz, ry: 0 });
    for (let k = 0; k < 4; k++) { const [tx, tz] = F.to(rng.range(-5, 5), rng.range(2, 12)); this._prop(b, 'tree', tx, tz, rng.range(0, 6), rng.range(0.9, 1.2)); }
    this._yardTrees(b, rng, b.x0 + 1, b.z0 + 1, b.x1 - 1, b.z1 - 1, 8);
    this._prop(b, 'parklamp', ...F.to(-12.5, -6)); this._prop(b, 'parklamp', ...F.to(12.5, 4));
    b.secrets.push({ x: gx + 2, z: gz - 2 });
    b.roadKind = 'crescent';
  },
  // two rows of houses facing the north and south streets (or east and west), backyards meeting
  _streetLots(b, rng) {
    const alongX = rng.chance(0.5), W = b.x1 - b.x0;
    const n = 3, lot = W / n;
    for (const row of [0, 1]) for (let i = 0; i < n; i++) {
      const sp = this._pickHouse(rng, false);
      const semi = rng.chance(0.25);
      const face = alongX ? (row ? 1 : 0) : (row ? 3 : 2);
      const f = FACE_V[face];
      const setback = 6 + rng.range(0, 2.5);
      const lc = (alongX ? b.x0 : b.z0) + (i + 0.5) * lot;
      const front = alongX ? (row ? b.z1 - setback : b.z0 + setback) : (row ? b.x1 - setback : b.x0 + setback);
      const d = sp.d, cAlong = front - f[alongX ? 1 : 0] * d / 2;
      const x = alongX ? lc : cAlong, z = alongX ? cAlong : lc;
      if (semi) {
        // a semi-detached pair: two narrow homes sharing a wall, each with its own drive
        for (const s2 of [-1, 1]) this._house(b, rng, { x: alongX ? x + s2 * 3.6 : x, z: alongX ? z : z + s2 * 3.6, face, type: 'semi', w: 7.2, d: 9, garage: 'street', drive: setback - 0.3, apron: true, doorOff: s2 * 1.6, color: undefined });
      } else this._house(b, rng, Object.assign({}, sp, { x, z, face, w: Math.min(sp.w, lot - (sp.garage === 'double' ? 8.5 : sp.garage === 'street' ? 2 : 5)), drive: setback - 0.3, apron: true, gs: i === 0 ? 1 : -1 }));
      // fence between lots
      if (i > 0) { const fl = (alongX ? b.x0 : b.z0) + i * lot; if (alongX) this._fence(b, fl, row ? b.z1 - setback - 1 : b.z0 + 12, fl, row ? (b.z0 + b.z1) / 2 + 1 : b.z0 + setback + 1 + 15, rng.chance(0.5) ? 'picket' : 'hedge'); else this._fence(b, row ? (b.x0 + b.x1) / 2 + 1 : b.x0 + 12, fl, row ? b.x1 - 12 : (b.x0 + b.x1) / 2 - 1, fl, rng.chance(0.5) ? 'picket' : 'hedge'); }
    }
    // back fence down the middle and backyard trees
    if (alongX) this._fence(b, b.x0 + 2, (b.z0 + b.z1) / 2, b.x1 - 2, (b.z0 + b.z1) / 2, 'picket'); else this._fence(b, (b.x0 + b.x1) / 2, b.z0 + 2, (b.x0 + b.x1) / 2, b.z1 - 2, 'picket');
    this._yardTrees(b, rng, b.x0 + 1, b.z0 + 1, b.x1 - 1, b.z1 - 1, 9);
    b.secrets.push({ x: b.x0 + 3, z: (b.z0 + b.z1) / 2 + 3 });
    b.roadKind = 'street';
  },
  // three-storey walk-ups around a shared lot, entered from one street
  _lowrise(b, rng) {
    const F = this._frame(b, rng.int(0, 3));
    this._road([F.to(10, -34.6), F.to(10, -22)], 6.5);
    const lot = [F.to(-24, -22), F.to(24, -22), F.to(24, 2), F.to(-24, 2)];
    this._areaS(lot, 'asphalt');
    const homes = this._placeLocal(b, rng, F, [
      [-14, 15, 0, -1, { type: 'apartment', w: 22, d: 12, garage: 'street', drive: 0, flat: true }],
      [14, 15, 0, -1, { type: 'apartment', w: 22, d: 12, garage: 'street', drive: 0, flat: true }]
    ]);
    // painted stalls on the shared lot; each building gets a few
    const stalls = [];
    for (let k = 0; k < 14; k++) { const a = -21 + k * 3.1; const [sx, sz] = F.to(a, -2.4); stalls.push([sx, sz]); const [lx, lz] = F.to(a - 1.55, -2.4); this._det(b, 'box', lx, CURB_H + 0.02, lz, F.u[0] ? 0.12 : 4.6, 0.02, F.u[0] ? 4.6 : 0.12, C(0xe8e8e8)); }
    const hd = Math.atan2(-F.v[0], -F.v[1]);
    homes.forEach((h, i) => { h.bays = stalls.slice(i * 7, i * 7 + 2).map(([x, z]) => ({ x, z, h: hd, kind: 'lot', y: CURB_H })); });
    for (let k = 0; k < 6; k++) if (rng.chance(0.6)) { const [x, z] = stalls[7 + rng.int(-6, 6)] || stalls[0]; if (!b.parked.some(p => Math.hypot(p.x - x, p.z - z) < 2)) b.parked.push({ x, z, h: hd, cls: null }); }
    for (const [a, c] of [[-26, -10], [26, -10]]) { const [x, z] = F.to(a, c); this._prop(b, 'lotlamp', x, z, 0); }
    const [dx, dz] = F.to(24, -14); this._prop(b, 'dumpster', dx, dz, 0);
    this._yardTrees(b, rng, b.x0 + 1, b.z0 + 1, b.x1 - 1, b.z1 - 1, 7);
    b.roadKind = 'lowrise';
  },
  // ---------------------------------------------------------------- Crestmoor Heights (wealthy)
  _genWealthy(b, rng) {
    this._sidewalk(b, rng, { trees: 0.9, park: 0.1 });
    // stone walls along the streets with gate gaps, two big lots per block
    const alongX = rng.chance(0.5);
    const lots = alongX ? [[b.x0, b.z0, b.x1, b.cz], [b.x0, b.cz, b.x1, b.z1]] : [[b.x0, b.z0, b.cx, b.z1], [b.cx, b.z0, b.x1, b.z1]];
    lots.forEach((L, i) => {
      const [lx0, lz0, lx1, lz1] = L;
      const face = alongX ? (i ? 1 : 0) : (i ? 3 : 2), f = FACE_V[face];
      const sp = this._pickHouse(rng, true);
      const ns = face < 2;
      const lw = ns ? lx1 - lx0 : lz1 - lz0, ld = ns ? lz1 - lz0 : lx1 - lx0;
      // house sits towards the back of the lot, the drive curves in from a gate
      const back = 5.5, hcx = ns ? (lx0 + lx1) / 2 - 5 * (i ? -1 : 1) : (f[0] < 0 ? lx1 - back - sp.d / 2 : lx0 + back + sp.d / 2);
      const hcz = ns ? (f[1] < 0 ? lz1 - back - sp.d / 2 : lz0 + back + sp.d / 2) : (lz0 + lz1) / 2 - 5 * (i ? -1 : 1);
      const frontC = ns ? hcz + f[1] * sp.d / 2 : hcx + f[0] * sp.d / 2;
      const edge = ns ? (f[1] < 0 ? lz0 : lz1) : (f[0] < 0 ? lx0 : lx1);
      // curved private drive: gate on the street, a bend, then the forecourt
      const gateLat = (ns ? lx0 : lz0) + lw * (i ? 0.78 : 0.22);
      const P0 = ns ? [gateLat, edge - f[1] * 0.0] : [edge, gateLat];
      const P1 = ns ? [gateLat, (edge + frontC) / 2] : [(edge + frontC) / 2, gateLat];
      const latH = ns ? hcx : hcz;
      const P2 = ns ? [latH, frontC + f[1] * 7.2] : [frontC + f[0] * 7.2, latH];
      const outer = ns ? [gateLat, edge + f[1] * 4.6] : [edge + f[0] * 4.6, gateLat]; // down to the curb
      this._road([outer, P0, P1, [(P1[0] + P2[0]) / 2 + (ns ? 0 : 0), (P1[1] + P2[1]) / 2], P2], 4.6);
      this._discS(P2[0], P2[1], 5.6);
      const home = this._house(b, rng, Object.assign({}, sp, { x: hcx, z: hcz, face, drive: 'auto', gs: i ? -1 : 1, roofColor: rng.pick([0x3d4247, 0x4a3a32, 0x2e3438]) }));
      home.tierHint = sp.garage === 'triple' ? 5 : 4;
      // walls along the street with gate pillars
      const wy = edge - (ns ? f[1] : f[0]) * 0.6;
      const a0 = ns ? lx0 + 0.6 : lz0 + 0.6, a1 = ns ? lx1 - 0.6 : lz1 - 0.6;
      const g0 = gateLat - 3.2, g1 = gateLat + 3.2;
      const wall = (u0, u1) => ns ? this._fence(b, u0, wy, u1, wy, rng.chance(0.4) ? 'hedge' : 'wall') : this._fence(b, wy, u0, wy, u1, rng.chance(0.4) ? 'hedge' : 'wall');
      wall(a0, g0); wall(g1, a1);
      for (const gp of [g0, g1]) { const px = ns ? gp : wy, pz = ns ? wy : gp; this._det(b, 'box', px, CURB_H + 0.9, pz, 0.8, 1.8, 0.8, C(0xc8bba0), 0, true); this._det(b, 'box', px, CURB_H + 1.95, pz, 0.6, 0.3, 0.6, C(0xe8e2d4)); this._prop(b, 'parklamp', px + (ns ? 0 : -f[0] * 1), pz + (ns ? -f[1] * 1 : 0), 0); }
      // pool and patio behind the house
      const behind = ns ? [hcx, hcz - f[1] * (sp.d / 2 + 6)] : [hcx - f[0] * (sp.d / 2 + 6), hcz];
      if (behind[0] > lx0 + 5 && behind[0] < lx1 - 5 && behind[1] > lz0 + 5 && behind[1] < lz1 - 5) {
        this._det(b, 'box', behind[0], CURB_H + 0.04, behind[1], ns ? 10 : 6, 0.08, ns ? 6 : 10, C(0xd8d2c4));
        this._det(b, 'box', behind[0], CURB_H + 0.09, behind[1], ns ? 8 : 4, 0.04, ns ? 4 : 8, C(0x3fa9d0));
        b.water.push({ x: behind[0], z: behind[1], r: 1.6, y: CURB_H + 0.1 });
      }
      this._yardTrees(b, rng, lx0 + 1.5, lz0 + 1.5, lx1 - 1.5, lz1 - 1.5, 8, ['tree', 'pine', 'bush', 'bush']);
    });
    b.secrets.push({ x: b.cx, z: b.cz });
    b.roadKind = 'estate';
  }
});
// ---------------------------------------------------------------- superblocks
// ellipse polygon helper (map/raster shapes)
const ellipsePts = (cx, cz, a, b, n = 40) => { const o = []; for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; o.push([cx + Math.cos(t) * a, cz + Math.sin(t) * b]); } return o; };
Object.assign(World.prototype, {
  // a door that slides open when an allowed car comes close (see DoorSystem)
  _door(b, d) { (this.doors || (this.doors = [])).push(d); return d; },
  // ------------------------------------------------ Crestmoor Estate (the mansion)
  _genEstate(a, sb, rng) {
    this._sbSidewalks(sb, rng, { trees: 0.9, park: 0 });
    const b = a, cx = 80;
    // mansion: a three-storey centre block, two wings, a portico on the south front
    const main = this._bld(b, 58, 22, 102, 44, 10.8, STYLE.DECO, 0xefe9dc, 3.6, 3.2, { exactH: true });
    this._rooftop(b, main, rng, 'mid');
    for (const [x0, x1] of [[38, 58], [102, 122]]) { const w = this._bld(b, x0, 25, x1, 41, 7.2, STYLE.DECO, 0xe6dfd0, 3.6, 3.2, { exactH: true }); this._rooftop(b, w, rng, 'mid'); }
    for (let k = 0; k < 6; k++) { const x = 66 + k * 5.6; this._det(b, 'cyl', x, CURB_H + 3.6, 46.2, 0.45, 7.2, 0xf4f0e6, null, { x, z: 46.2, r: 0.5, y0: 0, y1: 7.2, kind: 'det' }); }
    this._det(b, 'box', 80, CURB_H + 7.6, 46.6, 32, 0.8, 5, C(0xf4f0e6));
    this._det(b, 'box', 80, CURB_H + 8.4, 46.6, 26, 0.8, 4, C(0xe8e2d4));
    this._det(b, 'box', 80, CURB_H + 0.25, 47.5, 20, 0.5, 4, C(0xd8d0c0), 0, { x0: 70, x1: 90, z0: 45.5, z1: 49.4, y0: 0, y1: 0.35, kind: 'det' });
    b.signs.push({ text: 'CRESTMOOR', x: 80, y: CURB_H + 9.6, z: 49.15, ry: 0, w: 8, h: 0.9, bg: '#1b1b1e', fg: '#d8b04a' });
    // forecourt: circular drive round a fountain, the long drive to the gate, the garage pavilion
    this._discS(cx, 59, 11);
    this._det(b, 'cyl', cx, CURB_H + 0.35, 59, 4, 0.7, 0x9a958c, null, { x: cx, z: 59, r: 4.2, y0: 0, y1: 0.8, kind: 'det' });
    this._det(b, 'cyl', cx, CURB_H + 1.5, 59, 0.6, 2.4, 0xd8d0c0);
    b.water.push({ x: cx, z: 59, r: 3.6, y: CURB_H + 0.62 }); b.fx.push({ type: 'fountain', x: cx, y: CURB_H + 2.6, z: 59 });
    this._road([[128, 75.6], [128, 67], [118, 61], [91, 59]], 5.6);
    this._road([[128, 64], [134, 55], [139, 49]], 5);
    const pav = this._bld(b, 131, 32, 147, 46, 4.6, STYLE.DECO, 0xd8d0c0, 4.6, 4, { exactH: true });
    this._rooftop(b, pav, rng, 'mid');
    b.signs.push({ text: 'MOTOR COURT', x: 139, y: CURB_H + 4.0, z: 46.08, ry: 0, w: 5.2, h: 0.6, bg: '#1b1b1e', fg: '#d8b04a' });
    this._door(b, { id: 'mansionGarage', x: 139, z: 46.05, w: 6, h: 3.4, axis: 'x', face: 1, y: CURB_H, color: 0x3a3f46, block: b.i, kind: 'vspace', space: 'mansion' });
    // gate on the south street, walls and hedges round the grounds
    for (const gx of [124.4, 131.6]) { this._det(b, 'box', gx, CURB_H + 1.2, 69.6, 1, 2.4, 1, C(0xc8bba0), 0, true); this._det(b, 'box', gx, CURB_H + 2.5, 69.6, 1.2, 0.3, 1.2, C(0xe8e2d4)); }
    this._det(b, 'box', 122.6, CURB_H + 1.0, 68.2, 0.08, 1.8, 2.8, C(0x1b1b1e), 0.6); this._det(b, 'box', 133.4, CURB_H + 1.0, 68.2, 0.08, 1.8, 2.8, C(0x1b1b1e), -0.6);
    this._fence(b, 10.6, 69.4, 123.6, 69.4, 'wall'); this._fence(b, 132.4, 69.4, 149.4, 69.4, 'wall');
    this._fence(b, 149.4, 10.6, 149.4, 69, 'hedge'); this._fence(b, 10.6, 10.6, 10.6, 69, 'hedge'); this._fence(b, 10.6, 10.6, 149.4, 10.6, 'hedge');
    // gardens: pool terrace, tennis court, a gazebo, clipped hedges
    this._det(b, 'box', 80, CURB_H + 0.04, 15.5, 26, 0.08, 8, C(0xe0d8c8));
    this._det(b, 'box', 80, CURB_H + 0.09, 15.5, 20, 0.05, 5, C(0x35a6cf)); b.water.push({ x: 80, z: 15.5, r: 2.4, y: CURB_H + 0.12 });
    this._det(b, 'box', 28, CURB_H + 0.02, 24, 12, 0.03, 22, C(0x3a7a5a));
    for (const z of [13.6, 34.4, 24]) this._det(b, 'box', 28, CURB_H + 0.04, z, 11, 0.02, 0.1, C(0xf2f2f2));
    this._det(b, 'box', 28, CURB_H + 0.5, 24, 12, 1.0, 0.05, C(0x2a2a2a));
    this._det(b, 'cyl', 120, CURB_H + 1.6, 18, 3.2, 0.2, 0xe8e2d4); this._det(b, 'cone', 120, CURB_H + 3.6, 18, 3.6, 1.6, 3.6, C(0x6a7a6a));
    for (let k = 0; k < 6; k++) { const ang = k / 6 * Math.PI * 2; this._det(b, 'cyl', 120 + Math.cos(ang) * 2.9, CURB_H + 1.6, 18 + Math.sin(ang) * 2.9, 0.12, 3.2, 0xe8e2d4, null, { x: 120 + Math.cos(ang) * 2.9, z: 18 + Math.sin(ang) * 2.9, r: 0.15, y0: 0, y1: 3.2, kind: 'det' }); }
    for (const [x0, x1] of [[40, 56], [104, 120]]) for (const z of [52, 58]) this._fence(b, x0, z, x1, z, 'hedge', 1.1);
    // trees line the drive, lamps light it
    for (let k = 0; k < 6; k++) { this._prop(b, 'pine', 140 + (k % 2) * 3, 53 + k * 2.5, rng.range(0, 6), 1.1); }
    for (const [lx, lz] of [[123.5, 70.5], [108, 65.4], [96, 64.6], [64, 66], [131, 52]]) this._prop(b, 'parklamp', lx, lz, 0);
    this._yardTrees(b, rng, 12, 12, 56, 68, 14, ['tree', 'pine', 'bush']);
    this._yardTrees(b, rng, 104, 12, 148, 30, 6, ['tree', 'bush']);
    const home = { id: 'mansion', block: b.i, type: 'mansion', floors: 3, x0: 58, z0: 22, x1: 102, z1: 44, face: 1, door: { x: 80, z: 50.2, h: 0 }, inner: { x: 80, z: 44.2 }, bays: [{ x: 120, z: 62.4, h: -Math.PI / 2, kind: 'street', y: CURB_H }], garage: 'underground', district: 'u', reserved: 'mansion', name: 'Crestmoor Estate' };
    this.homes.push(home);
    b.estate = home;
    this.mapPlaces.push({ id: 'estate', name: 'Crestmoor Estate', cat: 'landmark', icon: '♜', x: 128, z: 74, sub: 'The finest house on the island' });
    b.secrets.push({ x: 120, z: 18 }, { x: 14, z: 66 });
    sb.name = 'Crestmoor Estate';
  },
  // ------------------------------------------------ Greenway Park
  _genBigPark(a, sb, rng) {
    this._sbSidewalks(sb, rng, { trees: 0.6, park: 0.25, benches: true });
    const b = a;
    // promenades where the streets used to run: twin gravel walks under the trees
    for (const x of [240, 320]) for (const s of [-8.3, 8.3]) this._road([[x + s, sb.z0 + 1.5], [x + s, sb.z1 - 1.5]], 3, 'gravel');
    for (const s of [-8.3, 8.3]) this._road([[sb.x0 + 1.5, 240 + s], [sb.x1 - 1.5, 240 + s]], 3, 'gravel');
    // the scenic drive through the park, with a car park by the west gate
    const drive = [[165.6, 293], [192, 293], [214, 291], [236, 278], [252, 258], [266, 236], [288, 220], [318, 212], [352, 206], [394.4, 204]];
    this._road(drive, 6, 'asphalt', { smooth: true, link: 'Greenway Park Drive' });
    this._rectS(176, 297, 210, 309, 'asphalt');
    for (let k = 0; k < 11; k++) { const x = 178 + k * 3; this._det(b, 'box', x, CURB_H + 0.02, 305, 0.12, 0.02, 5, C(0xe8e8e8)); if (rng.chance(0.45)) b.parked.push({ x: x + 1.5, z: 305, h: 0, cls: null }); }
    // the pond, its rocky shore and a boardwalk overlook
    const ponds = [[284, 284, 15], [298, 293, 9.5], [271, 294, 8.5]];
    for (const [x, z, r] of ponds) b.water.push({ x, z, r, y: CURB_H + 0.03, pond: true });
    const inPond = (x, z, m) => ponds.some(([px, pz, r]) => Math.hypot(x - px, z - pz) < r + m);
    for (const [x, z, r] of ponds) for (let k = 0; k < Math.ceil(r * 2 * Math.PI / 1.7); k++) {
      const t = k / Math.ceil(r * 2 * Math.PI / 1.7) * Math.PI * 2, rx = x + Math.cos(t) * (r + 0.6), rz = z + Math.sin(t) * (r + 0.6);
      if (inPond(rx, rz, 0.2)) continue;
      const s = rng.range(0.5, 0.9); this._det(b, 'box', rx, CURB_H + s * 0.3, rz, s * 1.4, s * 0.7, s * 1.2, C(0x7a756c).multiplyScalar(rng.range(0.85, 1.1)), rng.range(0, 3), { x: rx, z: rz, r: 0.8, y0: 0, y1: 0.7, kind: 'det' });
    }
    this._platform(b, 296, 262, 306, 270, CURB_H + 0.9);
    this._det(b, 'box', 301, CURB_H + 0.75, 266, 10, 0.3, 8, C(0x8a6a4a));
    this._ramp(b, 306, 264, 312, 268, 'x', -1, CURB_H, CURB_H + 0.9, { color: 0x8a6a4a, stripes: false, support: false });
    for (const [x0, z0, x1, z1] of [[296, 262, 306, 262], [296, 270, 306, 270], [296, 262, 296, 270]]) this._det(b, 'box', (x0 + x1) / 2, CURB_H + 1.45, (z0 + z1) / 2, Math.max(0.08, x1 - x0), 1.0, Math.max(0.08, z1 - z0), C(0x6a5038), 0, { x0: Math.min(x0, x1) - 0.05, x1: Math.max(x0, x1) + 0.05, z0: Math.min(z0, z1) - 0.05, z1: Math.max(z0, z1) + 0.05, y0: CURB_H + 0.9, y1: CURB_H + 2, kind: 'det' });
    b.signs.push({ text: 'GREENWAY OVERLOOK', x: 301, y: CURB_H + 2.3, z: 270.05, ry: 0, w: 4, h: 0.5, bg: '#2a3a24', fg: '#e8e2c4' });
    // walking trails round the pond and through the woods
    const loop = []; for (let k = 0; k <= 24; k++) { const t = k / 24 * Math.PI * 2; loop.push([285 + Math.cos(t) * 22, 287 + Math.sin(t) * 16]); }
    this._road(loop, 2.4, 'gravel');
    this._road([[180, 180], [205, 200], [222, 214], [232, 232]], 2.4, 'gravel');
    this._road([[340, 255], [356, 270], [372, 290], [384, 302]], 2.4, 'gravel');
    this._road([[256, 180], [272, 196], [292, 205]], 2.4, 'gravel');
    // café kiosk, playground, a bandstand
    const caf = this._bld(b, 334, 280, 344, 288, 3.4, STYLE.SHOP, 0xe8dcc0, 3.4, 2.5, { gtype: 1, exactH: true });
    this._rooftop(b, caf, rng, 'mid');
    b.signs.push({ text: 'GREENWAY CAFÉ', x: 339, y: CURB_H + 2.9, z: 279.95, ry: Math.PI, w: 5, h: 0.7, bg: '#2a5a3a', fg: '#ffffff' });
    for (let k = 0; k < 3; k++) { const x = 358 + k * 3; this._det(b, 'box', x, CURB_H + 1.2, 286, 0.12, 2.4, 0.12, C(0xd23a2a)); }
    this._det(b, 'box', 361, CURB_H + 2.4, 286, 7, 0.14, 0.14, C(0xd23a2a)); this._det(b, 'box', 366, CURB_H + 0.9, 292, 1.2, 1.8, 4, C(0xf2c230), 0.4);
    this._det(b, 'cyl', 205, CURB_H + 0.3, 255, 5, 0.6, 0xd8d0c0, null, { x: 205, z: 255, r: 5, y0: 0, y1: 0.6, kind: 'det' });
    for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2; this._det(b, 'cyl', 205 + Math.cos(t) * 4.4, CURB_H + 2.2, 255 + Math.sin(t) * 4.4, 0.14, 3.2, 0xf4f0e6); }
    this._det(b, 'cone', 205, CURB_H + 4.4, 255, 5.6, 1.6, 5.6, C(0x2f5a3a));
    // woodland: trees everywhere except roads, walks, the pond and the promenade lanes
    const clearOf = (x, z) => this._roadDist(x, z, true) > 2.6 && !inPond(x, z, 2.5) && Math.abs(x - 240) > 11 && Math.abs(x - 320) > 11 && Math.abs(z - 240) > 11 && !this._inBld(b, x, z, 3) && Math.hypot(x - 205, z - 255) > 8 && Math.hypot(x - 301, z - 266) > 8 && !(x > 352 && x < 372 && z > 280 && z < 298);
    let n = 0;
    for (let x = sb.x0 + 3; x < sb.x1 - 2; x += 7.5) for (let z = sb.z0 + 3; z < sb.z1 - 2; z += 7.5) {
      const jx = x + rng.range(-2.6, 2.6), jz = z + rng.range(-2.6, 2.6);
      const dens = pvnCPU(jx * 0.03, jz * 0.03);
      if (dens < 0.38 || !clearOf(jx, jz)) continue;
      this._prop(b, rng.chance(0.62) ? 'tree' : rng.chance(0.6) ? 'pine' : 'bush', jx, jz, rng.range(0, 6), rng.range(0.9, 1.5)); n++;
    }
    // benches and lamps along the walks
    for (let k = 0; k < 14; k++) { const t = k / 14 * Math.PI * 2; const x = 285 + Math.cos(t) * 24.2, z = 287 + Math.sin(t) * 18.2; if (!clearOf(x, z) && this._roadDist(x, z, true) < 1) continue; if (k % 2) { this._prop(b, 'bench', x, z, Math.atan2(285 - x, 287 - z)); b.seats.push({ x, z, ry: Math.atan2(285 - x, 287 - z) }); } else this._prop(b, 'parklamp', x, z, 0); }
    for (let k = 1; k < drive.length - 1; k++) { const [x, z] = drive[k]; this._prop(b, 'parklamp', x + 4.4, z + 4.4, 0); }
    for (const x of [240, 320]) for (let z = sb.z0 + 8; z < sb.z1; z += 22) { this._prop(b, 'parklamp', x, z, 0); if (rng.chance(0.5)) { this._prop(b, 'bench', x + 4.6, z + 6, -Math.PI / 2); b.seats.push({ x: x + 4.6, z: z + 6, ry: -Math.PI / 2 }); } }
    for (const [x, z, ry] of [[165, 288, -Math.PI / 2], [395, 208, Math.PI / 2]]) b.signs.push({ text: 'GREENWAY PARK', x, y: CURB_H + 2.2, z, ry, w: 5, h: 0.9, bg: '#2a5a3a', fg: '#ffffff' });
    this.mapPlaces.push({ id: 'greenway', name: 'Greenway Park', cat: 'landmark', icon: '♣', x: 266, z: 236, sub: `${n} trees, a pond, a café and a scenic drive` });
    b.secrets.push({ x: 300, z: 266 }, { x: 186, z: 186 }, { x: 384, z: 302 });
    sb.name = 'Greenway Park';
  },
  // ------------------------------------------------ Valen Stadium district
  _genStadiumDistrict(a, sb, rng) {
    this._sbSidewalks(sb, rng, { trees: 0.3, park: 0.15, benches: true, busStop: true });
    const b = a, cx = 722, cz = 720, A = 54, B = 44;
    // plaza round the bowl, ring road, the big west lot and spurs to three streets
    this._areaS(ellipsePts(cx, cz, A + 20, B + 20, 48), 'concrete');
    const ring = ellipsePts(cx, cz, A + 10, B + 10, 48); ring.push(ring[0]);
    this._road(ring, 8);
    this._rectS(575, 655, 652, 785, 'asphalt');
    this._road([[610, 794.6], [610, 780]], 9);
    this._road([[700, 645.4], [700, 670]], 8);
    this._road([[794.6, 720], [782, 720]], 8);
    this._road([[650, 720], [660, 720]], 8);
    // stall rows only round the edge of the lot: the middle stays open for practice and drifting
    const stall = (x, z, alongX) => this._det(b, 'box', x, CURB_H + 0.02, z, alongX ? 0.12 : 5, 0.02, alongX ? 5 : 0.12, C(0xe8e8e8));
    for (let z = 660; z <= 780; z += 2.8) { stall(580, z, false); stall(647, z, false); }
    for (let z = 661.4; z < 780; z += 2.8) { if (rng.chance(0.3)) b.parked.push({ x: 580, z, h: Math.PI / 2, cls: null }); if (rng.chance(0.2)) b.parked.push({ x: 647, z, h: -Math.PI / 2, cls: null }); }
    for (const [lx, lz] of [[600, 680], [630, 680], [600, 720], [630, 720], [600, 760], [630, 760]]) this._prop(b, 'lotlamp', lx, lz, 0);
    this._kicker(b, 615, 700, 'z', 1, 7, 1.4, true);
    this._kicker(b, 622, 750, 'x', -1, 7, 1.6, true);
    // the bowl: outer wall, two seating tiers, roof canopy, pitch wall. Gaps: a vehicle tunnel
    // on the west side (doors) and pedestrian gates (bollards) north, south and east.
    const segs = 48, wallC = C(0xc9c4ba), seat = [C(0x2c5f8a), C(0xd8d0c0)];
    const gapAt = i => { const t = (i + 0.5) / segs * Math.PI * 2; return Math.abs(wrapPi(t - Math.PI)) < 0.11 ? 'tunnel' : (Math.abs(wrapPi(t - Math.PI / 2)) < 0.07 || Math.abs(wrapPi(t + Math.PI / 2)) < 0.07 || Math.abs(wrapPi(t)) < 0.07) ? 'gate' : null; };
    for (let i = 0; i < segs; i++) {
      const a0 = i / segs * Math.PI * 2, a1 = (i + 1) / segs * Math.PI * 2, am = (a0 + a1) / 2, gap = gapAt(i);
      const P0 = [cx + Math.cos(a0) * A, cz + Math.sin(a0) * B], P1 = [cx + Math.cos(a1) * A, cz + Math.sin(a1) * B];
      const len = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]) + 0.25, ry = Math.atan2(P1[0] - P0[0], P1[1] - P0[1]) + Math.PI / 2;
      const mx = (P0[0] + P1[0]) / 2, mz = (P0[1] + P1[1]) / 2;
      if (!gap) {
        b.det.push({ kind: 'box', x: mx, y: CURB_H + 7, z: mz, sx: len, sy: 14, sz: 0.7, color: wallC, ry, rx: 0, rz: 0 });
        b.det.push({ kind: 'box', x: mx, y: CURB_H + 13.7, z: mz, sx: len, sy: 0.6, sz: 1, color: C(0x8c949c), ry, rx: 0, rz: 0 });
        for (let k = 0; k <= 2; k++) { const t = k / 2, px = P0[0] + (P1[0] - P0[0]) * t, pz = P0[1] + (P1[1] - P0[1]) * t; b.det.push({ kind: 'box', x: px, y: CURB_H, z: pz, sx: 0.01, sy: 0.01, sz: 0.01, color: wallC, ry: 0, col: { x: px, z: pz, r: 1.3, y0: 0, y1: 14, kind: 'det' } }); }
      } else {
        // lintel over every opening keeps the bowl's silhouette continuous
        b.det.push({ kind: 'box', x: mx, y: CURB_H + 10.5, z: mz, sx: len, sy: 7, sz: 0.7, color: wallC, ry, rx: 0, rz: 0 });
        if (gap === 'gate') for (const t of [0.25, 0.5, 0.75]) this._prop(b, 'bollard', P0[0] + (P1[0] - P0[0]) * t - Math.cos(am) * 1.2, P0[1] + (P1[1] - P0[1]) * t - Math.sin(am) * 1.2, 0);
      }
      if (gap === 'tunnel') continue;
      // stands: lower and upper tiers raked toward the pitch, canopy on top
      for (let k = 0; k < 3; k++) { const f = 0.88 - k * 0.12; b.det.push({ kind: 'box', x: cx + Math.cos(am) * A * f, y: CURB_H + 2.2 + k * 3.4, z: cz + Math.sin(am) * B * f, sx: len * f, sy: 0.5, sz: 5.2, color: seat[(i + k) % 2], ry, rx: 0.42, rz: 0 }); }
      b.det.push({ kind: 'box', x: cx + Math.cos(am) * (A - 4), y: CURB_H + 15, z: cz + Math.sin(am) * (B - 4), sx: len, sy: 0.25, sz: 9, color: C(0xe8e8ea), ry, rx: -0.1, rz: 0 });
      // pitch wall (front of the lower tier) stops cars climbing into the seats
      const pa = [cx + Math.cos(am) * A * 0.66, cz + Math.sin(am) * B * 0.66];
      b.det.push({ kind: 'box', x: pa[0], y: CURB_H + 0.6, z: pa[1], sx: len * 0.66, sy: 1.2, sz: 0.4, color: C(0x2a2d33), ry, rx: 0, rz: 0, col: { x: pa[0], z: pa[1], r: len * 0.36, y0: 0, y1: 1.2, kind: 'det' } });
    }
    // the vehicle tunnel through the west stand: walls, roof, lights and a pair of doors
    const tx0 = cx - A - 2, tx1 = cx - A * 0.66 + 1;
    for (const s of [-1, 1]) this._det(b, 'box', (tx0 + tx1) / 2, CURB_H + 2.4, cz + s * 4.8, tx1 - tx0, 4.8, 0.6, C(0x8c8780), 0, true);
    this._det(b, 'box', (tx0 + tx1) / 2, CURB_H + 5.1, cz, tx1 - tx0, 0.6, 10.2, C(0x8c8780));
    for (let k = 0; k < 4; k++) b.fx.push({ type: 'rooflamp', x: tx0 + 3 + k * (tx1 - tx0 - 6) / 3, y: CURB_H + 4.7, z: cz });
    b.signs.push({ text: 'SERVICE TUNNEL · GATE W', x: tx0 - 0.2, y: CURB_H + 6.1, z: cz, ry: -Math.PI / 2, w: 8, h: 1.0, bg: '#2c5f8a', fg: '#ffffff' });
    this._door(b, { id: 'stadiumTunnel', x: tx0 + 0.3, z: cz, w: 9, h: 4.6, axis: 'z', face: 2, y: CURB_H, color: 0x6c7480, block: b.i, kind: 'public' });
    // the pitch, mown stripes, lines, goals
    for (let k = 0; k < 10; k++) this._det(b, 'box', cx - 27 + k * 6 + 3, CURB_H + 0.015, cz, 6, 0.02, 34, C(k % 2 ? 0x3f8a3a : 0x357a32));
    this._det(b, 'box', cx, CURB_H + 0.03, cz, 0.15, 0.02, 34, C(0xf2f2f2));
    for (const s of [-1, 1]) { this._det(b, 'box', cx + s * 30, CURB_H + 0.03, cz, 0.15, 0.02, 34, C(0xf2f2f2)); this._det(b, 'box', cx + s * 30.4, CURB_H + 1.2, cz, 0.12, 2.4, 7.3, C(0xffffff)); }
    for (const s of [-1, 1]) this._det(b, 'box', cx, CURB_H + 0.03, cz + s * 17, 60, 0.02, 0.15, C(0xf2f2f2));
    this._det(b, 'cyl', cx, CURB_H + 0.025, cz, 9, 0.02, 0x357a32); this._det(b, 'cyl', cx, CURB_H + 0.028, cz, 8.8, 0.02, 0xf2f2f2); this._det(b, 'cyl', cx, CURB_H + 0.031, cz, 8.6, 0.02, 0x3f8a3a);
    // floodlight towers outside the ring
    for (const [fx, fz] of [[-60, -52], [60, -52], [-60, 52], [60, 52]]) {
      const x = cx + fx, z = cz + fz;
      this._det(b, 'box', x, CURB_H + 19, z, 1, 38, 1, C(0x8c949c), 0, { x, z, r: 0.7, y0: 0, y1: 38, kind: 'det' });
      this._det(b, 'box', x, CURB_H + 38, z, 6, 3, 0.6, C(0x2c3036), Math.atan2(-fx, -fz));
      b.fx.push({ type: 'flood', x, y: CURB_H + 38, z, ry: Math.atan2(-fx, -fz) });
    }
    // ticket booths, fan shop, the big sign over the south gate
    for (const s of [-1, 1]) { const bx = cx + s * 12; const r = this._bld(b, bx - 2, cz + B + 13, bx + 2, cz + B + 16, 3, STYLE.SHOP, 0x2c5f8a, 3, 2, { exactH: true }); r.far = false; }
    b.signs.push({ text: 'VALEN STADIUM', x: cx, y: CURB_H + 16.5, z: cz + B + 0.8, ry: 0, w: 24, h: 3, bg: '#2c5f8a', fg: '#ffffff' });
    b.signs.push({ text: 'HOME OF THE VALEN MARINERS', x: cx, y: CURB_H + 12.4, z: cz - B - 0.8, ry: Math.PI, w: 18, h: 1.4, bg: '#d8d0c0', fg: '#2c5f8a' });
    this.packageSpots.push({ x: cx, y: CURB_H, z: cz });
    this.stadium = { cx, cz, A, B, tunnel: { x: tx0, z: cz }, lot: { x: 613, z: 720 } };
    this.mapPlaces.push({ id: 'stadium', name: 'Valen Stadium', cat: 'landmark', icon: 'S', x: cx, z: cz + B + 18, sub: 'Drive in through the service tunnel (west gate)' });
    this.mapPlaces.push({ id: 'stadiumlot', name: 'Stadium car park', cat: 'garage', icon: 'G', x: 613, z: 720, sub: 'The biggest open lot in the city: practise, drift, jump' });
    b.secrets.push({ x: cx + 26, z: cz - 14 }, { x: 590, z: 662 });
    sb.name = 'Valen Stadium';
  },
  // ------------------------------------------------ Valen Container Terminal
  _genTerminal(a, sb, rng) {
    this._sbSidewalks(sb, rng, { trees: 0, park: 0.2 });
    const b = a;
    this._rectS(sb.x0 - 0.5, sb.z0 - 0.5, sb.x1 + 0.5, sb.z1 + 0.5, 'concrete');
    this._road([[880, 794.6], [880, 822]], 10); this._road([[794.6, 900], [822, 900]], 10);
    // perimeter fence with two gates; a gatehouse and barrier on the north gate
    const e = 0.8;
    this._fence(b, sb.x0 + e, sb.z0 + e, 873, sb.z0 + e, 'chain'); this._fence(b, 887, sb.z0 + e, sb.x1 - e, sb.z0 + e, 'chain');
    this._fence(b, sb.x0 + e, sb.z0 + e, sb.x0 + e, 893, 'chain'); this._fence(b, sb.x0 + e, 907, sb.x0 + e, sb.z1 - e, 'chain');
    this._fence(b, sb.x0 + e, sb.z1 - e, sb.x1 - e, sb.z1 - e, 'chain'); this._fence(b, sb.x1 - e, sb.z0 + e, sb.x1 - e, sb.z1 - e, 'chain');
    const gh = this._bld(b, 889, 813, 894, 818, 3, STYLE.SHOP, 0xd8d0c0, 3, 2, { exactH: true }); gh.far = false;
    this._det(b, 'box', 880, CURB_H + 1.0, 818, 9, 0.12, 0.12, C(0xf2c230), 0);
    b.signs.push({ text: 'VALEN CONTAINER TERMINAL', x: 880, y: CURB_H + 4.2, z: 811.1 - 0.1, ry: Math.PI, w: 10, h: 1.2, bg: '#14181c', fg: '#e8c04a' });
    b.signs.push({ text: 'RESTRICTED AREA · AUTHORIZED VEHICLES ONLY', x: 860, y: CURB_H + 1.6, z: 811.1 - 0.1, ry: Math.PI, w: 9, h: 0.7, bg: '#b03a2e', fg: '#ffffff' });
    b.signs.push({ text: 'RESTRICTED AREA', x: sb.x0 + e - 0.1, y: CURB_H + 1.6, z: 885, ry: -Math.PI / 2, w: 5, h: 0.7, bg: '#b03a2e', fg: '#ffffff' });
    // container rows (east-west) with drivable lanes between them and a cross lane
    const rows = [836, 858, 880, 902, 924];
    for (const rz of rows) {
      for (let x = 838; x < 944; x += 6.4) {
        if (Math.abs(x - 880) < 8) continue; // the cross lane
        if (x - 3.1 < 862 && rz + 2.6 > 906) continue; // Shed 4's yard (its own fenced compound since Session 3B)
        const h = rng.int(1, 4);
        for (const dz of [-1.3, 1.3]) for (let s = 0; s < h; s++) this._det(b, 'box', x, CURB_H + 1.3 + s * 2.6, rz + dz, 6.1, 2.6, 2.5, rng.pick(PAL.container));
        b.det.push({ kind: 'box', x, y: 0, z: rz, sx: 0.01, sy: 0.01, sz: 0.01, color: C(0x000000), ry: 0, col: { x0: x - 3.1, x1: x + 3.1, z0: rz - 2.6, z1: rz + 2.6, y0: 0, y1: CURB_H + 2.6 * h, kind: 'det' } });
      }
    }
    // lane markings, truck staging, a reach stacker's worth of clutter, tall lights
    for (const z of [847, 869, 891, 913, 935]) { const x0 = z > 906 ? 862 : 839; this._det(b, 'box', (x0 + 943) / 2, CURB_H + 0.02, z, 943 - x0, 0.02, 0.15, C(0xe8c04a)); }
    for (let k = 0; k < 6; k++) b.parked.push({ x: 822, z: 830 + k * 9, h: Math.PI / 2, cls: k % 3 ? 'truck' : 'van' });
    for (const [lx, lz] of [[860, 847], [910, 847], [860, 913], [910, 913], [830, 891]]) this._prop(b, 'lotlamp', lx, lz, 0);
    for (let k = 0; k < 6; k++) this._prop(b, k % 2 ? 'barrel' : 'pallet', 826 + rng.range(-3, 3), 880 + k * 2.4, rng.range(0, 3));
    // Shed 4: the bonded store in the south-west corner, in its own yard (gate on the east side, off the lane at z 916)
    this._whCompound(b, rng, {
      id: 'whse_d', place: 'shed4', name: 'Tidewater Shed 4', color: 0x6f7a80, sign: 'TIDEWATER · SHED 4', sub: 'BONDED STORE · CUSTOMS SEAL',
      lot: { x0: 812, z0: 908, x1: 858, z1: 948 },
      gate: { side: 'e', at: 916, w: 8 },
      bld: { x0: 814, z0: 930, x1: 846, z1: 948, h: 9 }, face: 'n',
      docks: [822, 838], door: 830,
      park: [{ x: 826, z: 910.4, h: Math.PI / 2 }, { x: 832.5, z: 910.4, h: Math.PI / 2 }],
      booth: { x: 854.5, z: 909.8, w: 3, d: 2.4 },
      front: ['n', 'e'],
      lanes: {
        in: [[[868, 916], [862, 916], [858, 916], [852, 916], [832, 916.5], [825, 919], [822, 925]],
             [[868, 916], [862, 916], [858, 916], [852, 916], [845, 916.5], [840, 919.5], [838, 925]]],
        out: [[[822, 919.5, 1], [818, 915, 1], [830, 914.5], [846, 915.5], [852, 916], [858, 916], [864, 916], [870, 916]],
              [[838, 919.5, 1], [833, 915, 1], [842, 915], [852, 916], [858, 916], [864, 916], [870, 916]]]
      }
    });
    // ship-to-shore cranes on the quay and a ship alongside
    const yc = C(0xd8a227);
    for (const qz of [840, 880, 920]) {
      const x = CITY + 12;
      for (const dz of [-7, 7]) for (const dx of [-4.5, 4.5]) this._det(b, 'box', x + dx, 17, qz + dz, 1.1, 34, 1.1, yc, 0, { x: x + dx, z: qz + dz, r: 0.7, y0: 0, y1: 34, kind: 'det' });
      this._det(b, 'box', x + 14, 34.5, qz, 56, 2.4, 3.4, yc);
      this._det(b, 'box', x + 2, 37, qz, 6, 3.4, 4.6, C(0xe8e0d0));
      this._det(b, 'box', x - 12, 33, qz, 8, 4, 6, C(0x55595e));
      b.fx.push({ type: 'beacon', x: x + 40, y: 36, z: qz });
    }
    const hull = this._bld(b, 994, 820, 1020, 960, 11, STYLE.IND, 0x2a3a52, 11, 8, { y0: -2, oy: -2, exactH: true, noCol: true });
    hull.far = true;
    for (let k = 0; k < 18; k++) { const z = 830 + k * 7.2; const h2 = rng.int(1, 3); for (let s = 0; s < h2; s++) this._det(b, 'box', 1007, 9.3 + s * 2.6, z, 22, 2.6, 6.1, rng.pick(PAL.container)); }
    const br = this._bld(b, 998, 948, 1016, 958, 12, STYLE.OFFICE, 0xe8e4da, 3, 3, { y0: 9, oy: -2, exactH: true, noCol: true }); br.far = true;
    b.signs.push({ text: 'MV NORTHERN STAR', x: 993.9, y: 6, z: 900, ry: -Math.PI / 2, w: 22, h: 2.4, bg: '#2a3a52', fg: '#ffffff' });
    this.mapPlaces.push({ id: 'terminal', name: 'Valen Container Terminal', cat: 'landmark', icon: 'D', x: 880, z: 806, sub: 'Docks, cranes and container lanes · restricted' });
    b.secrets.push({ x: 940, z: 940 }, { x: 905, z: 869 });
    sb.name = 'Container Terminal';
  },
  // ------------------------------------------------ Cedar Fields (the edge of the city)
  _genFields(a, sb, rng) {
    this._sbSidewalks(sb, rng, { trees: 0.8, park: 0 });
    const b = a, zr = 920;
    const cfr = this._road([[5.4, zr], [80, zr + 2], [160, zr - 1], [240, zr + 2], [314.6, zr]], 5.4, 'dirt', { smooth: true, link: 'Cedar Fields Road' });
    this._road([[150, zr], [150, 906]], 4.2, 'dirt');
    this._road([[60, zr], [60, 938]], 4.2, 'dirt');
    // the farm track south to the perimeter road and the land bridge to Cedar Fields South (Session 6C). A curved road
    // of its own since the Curved Roads pass: it leaves Cedar Fields Road at a T (a link-to-link junction, its first
    // point a sample of that road) and meets the perimeter road straight across from the bridge track
    let ft = cfr.pts[0];
    for (let k = 0; k < cfr.pts.length - 1; k++) { const a = cfr.pts[k], c = cfr.pts[k + 1]; if ((a[0] - CFS.lb.x) * (c[0] - CFS.lb.x) <= 0 && a[0] !== c[0]) { const t = (CFS.lb.x - a[0]) / (c[0] - a[0]); ft = [CFS.lb.x, a[1] + (c[1] - a[1]) * t]; break; } }
    this._road(linePts(ft, [ft[0], CITY - ROAD_HALF + 0.6]), CFS.lb.road * 2, 'dirt', { link: 'Farm Track' });
    // the farm: house, red barn, silo, paddock
    this._house(b, rng, { x: 150, z: 897, face: 1, type: 'farm', w: 12, d: 9, garage: 'street', drive: 'auto', color: 0xf0e6c8, roofColor: 0x5a3a32, name: 'Cedar Farmhouse' });
    const barn = this._bld(b, 172, 892, 188, 906, 7.5, STYLE.WARE, 0x8a2a20, 7.5, 4, { roof: 'gable', roofColor: 0x3a3d40, exactH: true });
    barn.ridgeX = false;
    this._det(b, 'box', 180, CURB_H + 2.2, 906.05, 5, 4.4, 0.1, C(0x5a1a14));
    this._det(b, 'cyl', 198, CURB_H + 8, 898, 3, 16, 0xb8b4ac, null, { x: 198, z: 898, r: 3.1, y0: 0, y1: 16, kind: 'det' });
    this._det(b, 'cone', 198, CURB_H + 17, 898, 3.2, 2, 3.2, C(0x8a8f94));
    this._fence(b, 206, 893, 236, 893, 'rail'); this._fence(b, 206, 913, 236, 913, 'rail'); this._fence(b, 236, 893, 236, 913, 'rail'); this._fence(b, 206, 893, 206, 905, 'rail');
    for (let k = 0; k < 7; k++) { const x = 212 + rng.range(0, 20), z = 897 + rng.range(0, 12); this._det(b, 'cyl', x, CURB_H + 0.6, z, 0.75, 1.2, 0xd8b45a, null, { x, z, r: 0.8, y0: 0, y1: 1.2, kind: 'det' }); }
    // a cottage on the west field, rail fences along the track, hedgerows and an orchard
    this._house(b, rng, { x: 60, z: 944, face: 0, type: 'bungalow', w: 10, d: 7, garage: 'carport', drive: 'auto', color: 0xe8e0d0, name: 'Mill Cottage' });
    // rail fences along both sides of the road, following its bends (in runs of about 5 m; the south side opens for the
    // farm track)
    const zAt = x => { for (let k = 0; k < cfr.pts.length - 1; k++) { const a = cfr.pts[k], c = cfr.pts[k + 1]; if ((a[0] - x) * (c[0] - x) <= 0 && a[0] !== c[0]) return a[1] + (c[1] - a[1]) * (x - a[0]) / (c[0] - a[0]); } return zr; };
    for (const [x0, x1] of [[12, 52], [68, 142], [158, 240], [250, 308]]) for (const side of [-1, 1]) {
      const n = Math.ceil((x1 - x0) / 5);
      for (let k = 0; k < n; k++) {
        const xa = x0 + (x1 - x0) * k / n, xb = x0 + (x1 - x0) * (k + 1) / n;
        if (side > 0 && xb > CFS.lb.x - 6 && xa < CFS.lb.x + 6) continue;
        this._fenceSeg(b, xa, zAt(xa) + side * 4.2, xb, zAt(xb) + side * 4.2, 'rail');
      }
    }
    for (const hx of [100, 250]) for (let z = sb.z0 + 3; z < sb.z1 - 2; z += 5) if (Math.abs(z - zr) > 6) this._prop(b, rng.chance(0.7) ? 'tree' : 'bush', hx + rng.range(-1, 1), z, rng.range(0, 6), rng.range(0.9, 1.3));
    for (let x = 262; x < 306; x += 7) for (let z = 928; z < 948; z += 7) this._prop(b, 'tree', x + rng.range(-0.6, 0.6), z + rng.range(-0.6, 0.6), rng.range(0, 6), rng.range(0.75, 0.95));
    for (let k = 0; k < 10; k++) { const x = rng.range(sb.x0 + 4, sb.x1 - 4), z = rng.range(sb.z0 + 3, sb.z1 - 3); if (this._roadDist(x, z, true) > 3 && !this._inBld(b, x, z, 4)) this._prop(b, 'tree', x, z, rng.range(0, 6), rng.range(1, 1.4)); }
    b.signs.push({ text: 'CEDAR FIELDS · FRESH EGGS', x: 152, y: CURB_H + 1.4, z: zr - 4.4, ry: 0, w: 3.6, h: 0.8, bg: '#f4f0e6', fg: '#5a3a22' });
    this.mapPlaces.push({ id: 'farm', name: 'Cedar Fields Farm', cat: 'landmark', icon: 'F', x: 150, z: 916, sub: 'Farm tracks at the edge of the city' });
    b.secrets.push({ x: 196, z: 912 }, { x: 290, z: 946 });
    sb.name = 'Cedar Fields';
  },
  // ------------------------------------------------ Central Parkade (downtown, multi-level)
  // Ground floor, levels 1-2 and the roof (level 3), joined by 8 m two-way ramps that alternate
  // sides: east (ground -> 1), west (1 -> 2), east (2 -> roof). Every ramp is walled on both sides
  // and opens only at its two ends; it starts on an aisle and ends on an aisle 12 m deep, so a car
  // turns off the top of one ramp, runs along the aisle and turns into the next. The hole each
  // ramp comes up through is railed at deck level. Parking bays sit in the middle of each deck, off
  // the aisles. A kicker on the north edge of the roof is the parkade jump.
  _genParkade(b, rng) {
    this._sidewalk(b, rng, { trees: 0.3, benches: true, news: true, park: 0 });
    const x0 = b.x0 + 4, x1 = b.x1 - 4, z0 = b.z0 + 4, z1 = b.z1 - 4;
    const L = [CURB_H, CURB_H + 3.4, CURB_H + 6.8, CURB_H + 10.2];
    const RW = 8, eS = [x1 - RW, x1], wS = [x0, x0 + RW], rz0 = z0 + 12, rz1 = z1 - 12, xm = (x0 + x1) / 2;
    const conc = C(0xb3ada2), dark = C(0x8c877e), wallC = 0xa8a296;
    // entrance from the north street, with a clearance bar
    this._road([[xm, b.z0 - 4.6], [xm, z0 + 2]], 8);
    for (const sx of [-1, 1]) this._det(b, 'box', xm + sx * 4.6, CURB_H + 1.4, z0 - 0.6, 0.25, 2.8, 0.25, C(0x2c3035), 0, true);
    this._det(b, 'box', xm, CURB_H + 2.7, z0 - 0.6, 9.4, 0.22, 0.2, C(0xf2c230));
    b.signs.push({ text: 'CLEARANCE 2.6 m', x: xm, y: CURB_H + 3.1, z: z0 - 0.75, ry: Math.PI, w: 3.4, h: 0.45, bg: '#f2c230', fg: '#111' });
    // ramps (two-way), each walled on both sides from the deck it starts on to 1 m above its top
    const ramps = [
      { xs: eS, dir: 1, a: 0 }, // ground -> level 1, rising south
      { xs: wS, dir: -1, a: 1 }, // level 1 -> level 2, rising north
      { xs: eS, dir: 1, a: 2 } // level 2 -> roof, rising south
    ];
    for (const r of ramps) {
      this._ramp(b, r.xs[0], rz0, r.xs[1], rz1, 'z', r.dir, L[r.a], L[r.a + 1], { color: 0x8a857c, stripes: false, support: false, sides: 'none' });
      for (const wx of [r.xs[0], r.xs[1]]) {
        const inner = wx === r.xs[0] ? r.xs[0] + 0.125 : r.xs[1] - 0.125, y0 = L[r.a] - 0.2, y1 = L[r.a + 1] + 1.0;
        this._det(b, 'box', inner, (y0 + y1) / 2, (rz0 + rz1) / 2, 0.25, y1 - y0, rz1 - rz0, C(wallC), 0, { x0: inner - 0.125, x1: inner + 0.125, z0: rz0, z1: rz1, y0, y1, kind: 'det' });
      }
      // painted arrows up the ramp
      for (let k = 1; k <= 3; k++) {
        const t = k / 4, zc = rz0 + (rz1 - rz0) * t, yc = r.dir > 0 ? L[r.a] + 3.4 * t : L[r.a + 1] - 3.4 * t, ang = Math.atan2(3.4, rz1 - rz0);
        b.det.push({ kind: 'box', x: (r.xs[0] + r.xs[1]) / 2 + 1.8, y: yc + 0.02, z: zc, sx: 0.35, sy: 0.02, sz: 2.2, color: C(0xf2f2f0), ry: 0, rx: -ang * r.dir, rz: 0 });
        b.det.push({ kind: 'box', x: (r.xs[0] + r.xs[1]) / 2 - 1.8, y: yc + 0.02, z: zc, sx: 0.35, sy: 0.02, sz: 2.2, color: C(0xf2f2f0), ry: 0, rx: -ang * r.dir, rz: 0 });
      }
      const foot = r.dir > 0 ? rz0 : rz1, head = r.dir > 0 ? rz1 : rz0;
      b.signs.push({ text: r.a === 2 ? 'UP ↑ ROOF' : 'UP ↑ LEVEL ' + (r.a + 1), x: (r.xs[0] + r.xs[1]) / 2, y: L[r.a] + 2.6, z: foot - r.dir * 0.05, ry: r.dir > 0 ? Math.PI : 0, w: 4.2, h: 0.55, bg: '#1d4fa0', fg: '#ffffff' });
      b.signs.push({ text: r.a === 0 ? 'DOWN ↓ EXIT' : 'DOWN ↓ LEVEL ' + r.a, x: (r.xs[0] + r.xs[1]) / 2, y: L[r.a + 1] + 2.6, z: head + r.dir * 0.05, ry: r.dir > 0 ? 0 : Math.PI, w: 4.2, h: 0.55, bg: '#2c3035', fg: '#f2c230' });
    }
    // decks with an opening over the ramp that arrives from below
    const slab = (y, ax0, az0, ax1, az1) => {
      this._platform(b, ax0, az0, ax1, az1, y);
      this._det(b, 'box', (ax0 + ax1) / 2, y - 0.17, (az0 + az1) / 2, ax1 - ax0, 0.34, az1 - az0, conc, 0, { x0: ax0, x1: ax1, z0: az0, z1: az1, y0: y - 0.34, y1: y - 0.06, kind: 'det' });
    };
    const rail = (y, ax0, az0, ax1, az1) => this._det(b, 'box', (ax0 + ax1) / 2, y + 0.5, (az0 + az1) / 2, ax1 - ax0, 1.0, az1 - az0, dark, 0, { x0: ax0, x1: ax1, z0: az0, z1: az1, y0: y - 0.3, y1: y + 1.0, kind: 'det' });
    for (let k = 1; k <= 3; k++) {
      const arrive = ramps[k - 1], hole = arrive.xs;
      slab(L[k], x0, z0, x1, rz0); slab(L[k], x0, rz1, x1, z1);
      if (hole === eS) slab(L[k], x0, rz0, eS[0], rz1); else slab(L[k], wS[1], rz0, x1, rz1);
      // the far (low) end of the hole is railed at deck level; its sides are the ramp's walls
      const lowEnd = arrive.dir > 0 ? rz0 : rz1;
      rail(L[k], hole[0], arrive.dir > 0 ? lowEnd - 0.3 : lowEnd, hole[1], arrive.dir > 0 ? lowEnd : lowEnd + 0.3);
      // parapets on the outside edges (the ground floor stays open to the street)
      for (const [ax0, az0, ax1, az1] of [[x0, z0, x1, z0 + 0.3], [x0, z1 - 0.3, x1, z1], [x0, z0, x0 + 0.3, z1], [x1 - 0.3, z0, x1, z1]]) this._det(b, 'box', (ax0 + ax1) / 2, L[k] + 0.55, (az0 + az1) / 2, ax1 - ax0, 1.1, az1 - az0, dark, 0, { x0: ax0, x1: ax1, z0: az0, z1: az1, y0: L[k], y1: L[k] + 1.1, kind: 'det' });
      b.signs.push({ text: k === 3 ? 'ROOF' : 'LEVEL ' + k, x: xm, y: L[k] + 2.1, z: z0 + 0.4, ry: 0, w: 3.2, h: 0.6, bg: '#1d4fa0', fg: '#ffffff' });
    }
    // ceiling lights over the aisles
    for (let k = 0; k < 3; k++) for (const zz of [(z0 + rz0) / 2, (rz1 + z1) / 2]) for (const xx of [x0 + 16, xm, x1 - 16]) b.fx.push({ type: 'docklight', x: xx, y: L[k + 1] - 0.42, z: zz, w: 3 });
    // columns in the parking area, clear of the aisles and the ramps
    for (const cx2 of [x0 + 16, xm, x1 - 16]) for (const cz2 of [rz0 + 6, rz1 - 6]) this._det(b, 'box', cx2, (L[3] - 0.3) / 2, cz2, 0.7, L[3] - 0.3, 0.7, conc, 0, { x: cx2, z: cz2, r: 0.45, y0: 0, y1: L[3] - 0.06, kind: 'det' });
    // roof: lamps, the kicker off the north edge, the package
    for (const [lx, lz] of [[x0 + 4, z0 + 4], [x1 - 4, z1 - 4], [x0 + 4, z1 - 4], [x1 - 4, z0 + 4]]) { this._det(b, 'cyl', lx, L[3] + 2.5, lz, 0.09, 5, 0x2c3035); b.fx.push({ type: 'rooflamp', x: lx, y: L[3] + 5, z: lz }); }
    this._ramp(b, xm - 2.4, z0 + 1, xm + 2.4, z0 + 8, 'z', -1, L[3], L[3] + 1.4, { unique: true, id: 'parkade_leap', color: 0x6c6f74, support: false });
    this.packageSpots.push({ x: x1 - 6, y: L[3], z: z1 - 6 });
    // parking bays: nose-in rows facing the aisles, inside the middle of each deck
    const cols = [x0 + 16, xm, x1 - 16];
    for (let k = 0; k <= 3; k++) {
      const bx0 = (k === 1 || k === 2 ? wS[1] : x0) + 2.5, bx1 = eS[0] - 2.5;
      for (const [zz, hh] of [[rz0 + 2.8, Math.PI], [rz1 - 2.8, 0]]) for (let x = bx0 + 1.4; x <= bx1 - 1.4; x += 3.2) {
        if (cols.some(c => Math.abs(c - x) < 1.6)) continue;
        if (k === 3 && Math.abs(x - xm) < 6) continue; // the roof's run-up to the jump stays clear
        if (rng.chance(0.4)) b.parked.push({ x, z: zz, h: hh, cls: null, y: L[k] });
      }
    }
    for (let k = 0; k <= 3; k++) for (const zz of [rz0 + 0.6, rz1 - 0.6]) b.det.push({ kind: 'box', x: ((k === 1 || k === 2 ? wS[1] : x0) + eS[0]) / 2, y: L[k] + 0.012, z: zz, sx: eS[0] - (k === 1 || k === 2 ? wS[1] : x0) - 4, sy: 0.02, sz: 0.12, color: C(0xe8e4d8), ry: 0 });
    b.signs.push({ text: 'P  CENTRAL PARKADE · OPEN 24H', x: xm, y: L[1] - 0.9, z: z0 - 0.06, ry: Math.PI, w: 14, h: 1.3, bg: '#1d4fa0', fg: '#ffffff' });
    // a solid silhouette for the far skyline only (the near chunk shows the open decks)
    const far = this._bld(b, x0, z0, x1, z1, L[3] + 1.1 - CURB_H, STYLE.PARKING, 0xb3ada2, 3.4, 4.5, { exactH: true, noCol: true }); far.farOnly = true;
    this.parkade = { x0, z0, x1, z1, L, rz0, rz1, eS, wS, entrance: { x: xm, z: b.z0 - 2 } };
    b.secrets.push({ x: x0 + 3, z: z1 - 3 });
  }
});
// cheap value noise for generators (deterministic; independent of the GPU noise)
function pvnCPU(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const h = (a, c) => hash2i(a, c, 911);
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(h(xi, zi), h(xi + 1, zi), u), lerp(h(xi, zi + 1), h(xi + 1, zi + 1), u), v);
}
/* ---------------- doors that open for you ----------------
   Roll-up doors (stadium service tunnel, garage doors, the mansion motor court, the penthouse
   garage ramp). A door rises when the player, on foot or driving, comes close from either side
   and is allowed through; its collider switches off once it is mostly open. Doors with a `space`
   lead to a drive-in garage below the street (see VSpaces). */
class DoorSystem {
  constructor(g) {
    this.g = g; this.list = [];
    this.mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.45 });
    for (const d of g.world.doors || []) this.add(d);
  }
  add(d) {
    const thick = 0.22, ax = d.axis === 'x';
    const geo = new THREE.BoxGeometry(ax ? d.w : thick, d.h, ax ? thick : d.w);
    const cols = []; const c = new THREE.Color(d.color || 0x6c7480);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const k = 0.82 + 0.18 * (Math.floor((pos.getY(i) + d.h / 2) / 0.4) % 2); cols.push(c.r * k, c.g * k, c.b * k); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const mesh = new THREE.Mesh(geo, this.mat); this.mat.vertexColors = true;
    mesh.position.set(d.x, d.y + d.h / 2, d.z); mesh.castShadow = true;
    this.g.outdoor.add(mesh);
    const col = { x0: d.x - (ax ? d.w / 2 : thick), x1: d.x + (ax ? d.w / 2 : thick), z0: d.z - (ax ? thick : d.w / 2), z1: d.z + (ax ? thick : d.w / 2), y0: 0, y1: d.y + d.h, kind: 'door' };
    this.g.world.grid.add(col);
    const e = { d, mesh, col, open: 0, want: 0, sounded: false };
    this.list.push(e); return e;
  }
  byId(id) { return this.list.find(e => e.d.id === id); }
  allowed(d) {
    if (d.allow) return !!d.allow(this.g);
    if (d.kind === 'owner' || d.kind === 'vspace') return !!(this.g.uw && this.g.uw.props.owned(d.prop || (d.space === 'mansion' ? 'mansion' : 'penthouse')));
    return d.kind === 'public';
  }
  update(dt) {
    const g = this.g, p = g.player, pv = p.state === 'vehicle' ? p.vehicle : null;
    const ax = pv ? pv.pos.x : p.pos.x, az = pv ? pv.pos.z : p.pos.z, ay = pv ? pv.pos.y : p.pos.y;
    // a car reaches the door ~1.2 s after it starts to open at any speed, so the trigger range grows with speed
    const reach = pv ? clamp(13 + pv.vel.length() * 1.2, 13, 40) : 4.5;
    for (const e of this.list) {
      const d = e.d, near = Math.hypot(ax - d.x, az - d.z) < reach && Math.abs(ay - d.y) < 4 && !p.interior;
      e.want = (d.want ? d.want(g, e) : near && this.allowed(d)) || e.force ? 1 : 0;
      const prev = e.open;
      e.open = clamp(e.open + (e.want ? 1 : -1) * dt / 1.4, 0, 1);
      if (e.want && prev === 0 && e.open > 0) g.audio.play('door', { x: d.x, z: d.z });
      e.mesh.position.y = d.y + d.h / 2 + e.open * (d.h - 0.35);
      e.col.on = e.open < 0.75;
      e.mesh.visible = Math.hypot(g.camera.position.x - d.x, g.camera.position.z - d.z) < 260;
    }
  }
}
// nearest curb lane point (parked heading follows the traffic direction of that lane)
function curbNear(x, z, shift = 0) {
  const bx = clamp(Math.floor(x / P), 0, N - 1), bz = clamp(Math.floor(z / P), 0, N - 1);
  const lx = x - bx * P, lz = z - bz * P;
  // curbAt sides: 0 north, 1 east, 2 south, 3 west; skip sides whose road was absorbed by a superblock
  const open = [RoadNet.segOpen(1, bz, bx), RoadNet.segOpen(0, bx + 1, bz), RoadNet.segOpen(1, bz + 1, bx), RoadNet.segOpen(0, bx, bz)];
  const d = [lz, P - lx, P - lz, lx].map((v, k) => open[k] ? v : v + 1e4);
  let side = 0; for (let k = 1; k < 4; k++) if (d[k] < d[side]) side = k;
  const along = clamp((side === 0 || side === 2 ? lx : lz) + shift, 14, P - 14);
  return curbAt(bx, bz, side, along);
}
// curb lane spot on one side of a block: side 0 north, 1 east, 2 south, 3 west
function curbAt(bx, bz, side, along = 40) {
  const x0 = bx * P, z0 = bz * P;
  switch (side) {
    case 0: return { x: x0 + along, z: z0 + 4.6, h: Math.PI / 2 };
    case 1: return { x: x0 + P - 4.6, z: z0 + along, h: 0 };
    case 2: return { x: x0 + along, z: z0 + P - 4.6, h: -Math.PI / 2 };
    default: return { x: x0 + 4.6, z: z0 + along, h: Math.PI };
  }
}

