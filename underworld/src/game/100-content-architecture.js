/* =====================================================================
   [CONTENT] ARCHITECTURE: modular facade dressing, rooftops, street furniture,
   landmarks, drivable ramps/rooftops, hidden packages, stunt jumps.
   Everything here is deterministic per block and merged into the
   block's detail mesh, so it costs no extra draw calls.
   ===================================================================== */
const LANDMARK_BLOCKS = {
  '6,5': { gen: '_genLandmark', name: 'Valen Tower', icon: 'T', ground: 'D' },
  '10,4': { gen: '_genGasStation', name: 'Fuel & Go', icon: 'G', ground: 'K', station: 1, short: 'Harbor Road' },
  // more Fuel & Go stations spread over the city: never far from fuel, scratch cards or a quick robbery
  '5,1': { gen: '_genGasStation', name: 'Fuel & Go · Northgate', icon: 'G', ground: 'K', station: 2, short: 'Northgate', mirror: true, accent: 0x2a6ac8 },
  '3,7': { gen: '_genGasStation', name: 'Fuel & Go · Westside', icon: 'G', ground: 'K', station: 3, short: 'Westside', accent: 0x2f8a4a },
  '9,7': { gen: '_genGasStation', name: 'Fuel & Go · Eastgate', icon: 'G', ground: 'K', station: 4, short: 'Eastgate', mirror: true, accent: 0xd8a227 },
  '5,10': { gen: '_genGasStation', name: 'Fuel & Go · Southbank', icon: 'G', ground: 'K', station: 5, short: 'Southbank', accent: 0x8a3ad2 },
  '2,5': { gen: '_genGarage', name: 'Quarter Garage', icon: 'P', ground: 'K' },
  '6,8': { gen: '_genMall', name: 'Harborview Mall', icon: 'M', ground: 'K' },
  '10,1': { gen: '_genPlant', name: 'Saltworks Plant', icon: 'I', ground: 'I' },
  '5,6': { gen: '_genParkade', name: 'Central Parkade', icon: 'G', ground: 'K', mapCat: 'garage', sub: 'Four levels and a roof · drive up the ramps' }
};
const IRON = 0x2a2c30, CONCRETE = 0x9c978e;

// drivable surfaces (ramps, rooftops, parking decks) consulted by groundY(). With a reference
// height y only surfaces at most SURF_STEP above it count, so a car on the ground floor of a
// parking structure drives under the decks instead of snapping onto the roof.
const SURF = { lists: null, gx: 0, gz: 0 };
const SURF_STEP = 1.25;
function surfaceY(x, z, y, step = SURF_STEP) {
  const maxH = y === undefined ? Infinity : y + step;
  const L = SURF.lists;
  if (!L) return -1e9;
  const bx = Math.floor(x / P), bz = Math.floor(z / P);
  if (bx < 0 || bz < 0 || bx >= N || bz >= N) return -1e9;
  const list = L[bz * N + bx];
  if (!list) return -1e9;
  let best = -1e9;
  for (const s of list) {
    if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
    let h;
    if (s.h !== undefined) h = s.h;
    else {
      let t = s.axis === 'x' ? (x - s.x0) / (s.x1 - s.x0) : (z - s.z0) / (s.z1 - s.z0);
      if (s.dir < 0) t = 1 - t;
      h = s.h0 + (s.h1 - s.h0) * t;
    }
    if (h > best && h <= maxH) {
      best = h;
      // gradient of the winning surface (a ramp's slope; 0 for flat decks)
      if (s.h !== undefined) { SURF.gx = 0; SURF.gz = 0; }
      else { const k = (s.h1 - s.h0) / (s.axis === 'x' ? s.x1 - s.x0 : s.z1 - s.z0) * (s.dir < 0 ? -1 : 1); SURF.gx = s.axis === 'x' ? k : 0; SURF.gz = s.axis === 'x' ? 0 : k; }
    }
  }
  return best;
}

Object.assign(World.prototype, {
  // ---------- small geometric helpers on a street facade ----------
  _faceBox(b, r, f, t, y, along, height, out, depth, color, ry = 0, rx = 0, rz = 0) {
    // t: distance along the facade from its start; out: offset outward from the wall plane
    const c = typeof color === 'number' ? C(color) : color;
    if (f.ax === 'x') {
      const fzp = f.dir > 0 ? r.z0 : r.z1;
      b.det.push({ kind: 'box', x: r.x0 + t, y, z: fzp + f.fz * out, sx: along, sy: height, sz: depth, color: c, ry, rx, rz });
    } else {
      const fxp = f.dir > 0 ? r.x0 : r.x1;
      b.det.push({ kind: 'box', x: fxp + f.fx * out, y, z: r.z0 + t, sx: depth, sy: height, sz: along, color: c, ry, rx, rz });
    }
  },
  _ring(b, r, y, h, proj, color) {
    const c = typeof color === 'number' ? C(color) : color;
    const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    b.det.push({ kind: 'box', x: cx, y, z: r.z0 - proj / 2, sx: w + proj * 2, sy: h, sz: proj, color: c, ry: 0 });
    b.det.push({ kind: 'box', x: cx, y, z: r.z1 + proj / 2, sx: w + proj * 2, sy: h, sz: proj, color: c, ry: 0 });
    b.det.push({ kind: 'box', x: r.x0 - proj / 2, y, z: cz, sx: proj, sy: h, sz: d, color: c, ry: 0 });
    b.det.push({ kind: 'box', x: r.x1 + proj / 2, y, z: cz, sx: proj, sy: h, sz: d, color: c, ry: 0 });
  },
  // ---------- facade dressing by architectural family ----------
  _dress(b, r, rng, f) {
    const st = r.style, top = r.y0 + r.h;
    const floors = Math.round(r.h / r.fh);
    const L = f.ax === 'x' ? r.x1 - r.x0 : r.z1 - r.z0;
    const trim = r.color.clone().lerp(C(0xe8e2d4), 0.45);
    const dark = r.color.clone().multiplyScalar(0.55);
    if (st !== STYLE.GLASS && st !== STYLE.HOUSE) this._ring(b, r, top - 0.3, 0.55, 0.32, st === STYLE.BRICK ? C(0xcfc6b2) : trim);
    if (st === STYLE.BRICK || st === STYLE.SHOP || st === STYLE.DECO || st === STYLE.APT) this._ring(b, r, CURB_H + 0.32, 0.64, 0.07, dark);
    if (st === STYLE.BRICK || st === STYLE.DECO) for (let k = 2; k < floors - 1; k += 3) this._ring(b, r, r.y0 + k * r.fh, 0.18, 0.09, C(0xcfc6b2));
    // downspouts on the street corners
    if (st === STYLE.BRICK || st === STYLE.SHOP || st === STYLE.APT) for (const t of [0.22, L - 0.22]) this._faceBox(b, r, f, t, r.y0 + r.h / 2, 0.12, r.h, 0.12, 0.12, 0x3c3f42);
    if (st === STYLE.BRICK && floors >= 3 && L > 6 && rng.chance(0.6)) this._fireEscape(b, r, f, rng, floors, L);
    if (st === STYLE.APT && floors >= 2) this._balconies(b, r, f, rng, floors, L);
    // window air-conditioners
    if ((st === STYLE.BRICK || st === STYLE.APT) && floors >= 2) {
      const bay = f.ax === 'x' ? r.bayX : r.bayZ, nb = Math.max(1, Math.round(L / bay));
      for (let k = 0, n = rng.int(1, 4); k < n; k++) {
        const fl = rng.int(1, floors - 1), bi = rng.int(0, nb - 1);
        this._faceBox(b, r, f, (bi + 0.5) * bay, r.y0 + fl * r.fh + r.fh * 0.18, 0.62, 0.42, 0.25, 0.5, 0xb8bcbf);
      }
    }
    // shopfront: blade sign hanging off the facade plus a canopy light strip
    if (f.shop && rng.chance(0.35) && L > 5) {
      const t = rng.chance(0.5) ? 0.8 : L - 0.8;
      this._faceBox(b, r, f, t, CURB_H + 5.2, 0.12, 1.6, 0.7, 0.9, rng.pick(PAL.awning));
      this._faceBox(b, r, f, t, CURB_H + 6.05, 0.06, 0.06, 0.6, 1.0, IRON);
    }
    if (st === STYLE.HOUSE && floors >= 1) this._faceBox(b, r, f, L / 2, CURB_H + 2.4, Math.min(3, L - 1), 0.1, 0.75, 1.5, dark);
  },
  _fireEscape(b, r, f, rng, floors, L) {
    const w = Math.min(3.2, L - 1.5), t0 = clamp(L * rng.range(0.3, 0.7), w / 2 + 0.4, L - w / 2 - 0.4);
    const rise = r.fh;
    for (let k = 1; k < floors; k++) {
      const y = r.y0 + k * r.fh;
      this._faceBox(b, r, f, t0, y, w, 0.06, 0.6, 1.1, IRON);
      this._faceBox(b, r, f, t0, y + 1.0, w, 0.05, 1.12, 0.05, IRON);
      this._faceBox(b, r, f, t0, y + 0.5, w, 0.04, 1.12, 0.04, IRON);
      for (const s of [-1, 1]) {
        this._faceBox(b, r, f, t0 + s * w / 2, y + 0.5, 0.05, 1.0, 1.12, 0.05, IRON);
        this._faceBox(b, r, f, t0 + s * w / 2, y + 1.0, 0.05, 0.05, 0.6, 1.1, IRON);
      }
      if (k < floors - 1) {
        const run = w * 0.75, ang = Math.atan2(rise, run);
        const len = Math.hypot(rise, run);
        const dirSign = k % 2 ? 1 : -1;
        const along = f.ax === 'x' ? 0 : Math.PI / 2;
        this._faceBox(b, r, f, t0, y + rise / 2, f.ax === 'x' ? len : 0.7, 0.05, 0.85, f.ax === 'x' ? 0.7 : len, IRON, along, 0, 0);
        const d = b.det[b.det.length - 1];
        if (f.ax === 'x') { d.sx = len; d.sz = 0.7; d.rz = ang * dirSign; }
        else { d.sx = 0.7; d.sz = len; d.rx = -ang * dirSign; }
      }
    }
    // drop ladder
    this._faceBox(b, r, f, t0 + w / 2 - 0.3, r.y0 + r.fh - 1.3, 0.4, 2.4, 1.0, 0.05, IRON);
  },
  _balconies(b, r, f, rng, floors, L) {
    const bay = f.ax === 'x' ? r.bayX : r.bayZ, nb = Math.max(1, Math.round(L / bay));
    const rail = rng.chance(0.5) ? C(0x7f97a6) : C(0x2f3337);
    const pattern = rng.int(0, 1);
    for (let k = 1; k < floors; k++) for (let i = 0; i < nb; i++) {
      if ((i + k * pattern) % 2) continue;
      const t = (i + 0.37) * bay, y = r.y0 + k * r.fh, bw = bay * 0.7;
      this._faceBox(b, r, f, t, y, bw, 0.16, 0.65, 1.3, 0xc9c4ba);
      this._faceBox(b, r, f, t, y + 0.55, bw, 0.9, 1.28, 0.05, rail);
      this._faceBox(b, r, f, t - bw / 2, y + 0.55, 0.05, 0.9, 0.65, 1.3, rail);
      this._faceBox(b, r, f, t + bw / 2, y + 0.55, 0.05, 0.9, 0.65, 1.3, rail);
    }
  },
  // whole-building dressing (towers, podiums, warehouses)
  _dressBox(b, r, rng, kind) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    if (kind === 'tower') {
      // entrance canopy on the side nearest the street
      const sides = [[r.z0 - b.z0, 0], [b.z1 - r.z1, 1], [r.x0 - b.x0, 2], [b.x1 - r.x1, 3]].sort((a, c) => a[0] - c[0]);
      const s = sides[0][1];
      const cw = Math.min(10, (s < 2 ? w : d) * 0.5);
      const pos = s === 0 ? [cx, r.z0 - 1.6] : s === 1 ? [cx, r.z1 + 1.6] : s === 2 ? [r.x0 - 1.6, cz] : [r.x1 + 1.6, cz];
      this._det(b, 'box', pos[0], CURB_H + 4.4, pos[1], s < 2 ? cw : 3.2, 0.35, s < 2 ? 3.2 : cw, C(0x2a2d33));
      b.fx.push({ type: 'canopy', x: pos[0], y: CURB_H + 4.2, z: pos[1], w: s < 2 ? cw : 3.2, d: s < 2 ? 3.2 : cw });
      for (const k of [-1, 1]) {
        const px = s < 2 ? pos[0] + k * (cw / 2 - 0.3) : pos[0] + (s === 2 ? -1.4 : 1.4), pz = s < 2 ? pos[1] + (s === 0 ? -1.4 : 1.4) : pos[1] + k * (cw / 2 - 0.3);
        this._det(b, 'cyl', px, CURB_H + 2.2, pz, 0.15, 4.4, 0x8c9096, null, { x: px, z: pz, r: 0.2, y0: 0, y1: 4.4, kind: 'det' });
      }
      // vertical fins on glass towers
      if (r.style === STYLE.GLASS && rng.chance(0.5)) {
        const fin = C(0xb8c0c8), n = Math.floor(w / 6);
        for (let i = 0; i <= n; i++) { const x = r.x0 + i * (w / n); this._det(b, 'box', x, r.y0 + r.h / 2, r.z0 - 0.2, 0.18, r.h, 0.4, fin); this._det(b, 'box', x, r.y0 + r.h / 2, r.z1 + 0.2, 0.18, r.h, 0.4, fin); }
      }
      if (r.style !== STYLE.GLASS) this._ring(b, r, CURB_H + 4.9, 0.4, 0.12, r.color.clone().multiplyScalar(0.7));
    } else if (kind === 'podium') {
      this._ring(b, r, r.y0 + r.h - 0.3, 0.5, 0.35, C(0xd6d0c4));
      this._ring(b, r, CURB_H + 3.9, 0.12, 0.9, rng.pick(PAL.awning));
    } else if (kind === 'warehouse') {
      // loading dock with bumpers and a ramp along the yard side
      const dw = Math.min(w - 4, 24), dx = cx;
      this._det(b, 'box', dx, CURB_H + 0.6, r.z1 + 1.3, dw, 1.2, 2.6, C(CONCRETE), 0, true);
      for (let i = 0; i < Math.floor(dw / 4); i++) this._det(b, 'box', dx - dw / 2 + 2 + i * 4, CURB_H + 0.7, r.z1 + 2.62, 0.45, 0.45, 0.12, C(0x151515));
      this._det(b, 'box', dx + dw / 2 + 1.2, CURB_H + 0.3, r.z1 + 1.3, 2.4, 0.6, 2.4, C(CONCRETE));
      this._ring(b, r, r.y0 + r.h - 0.25, 0.5, 0.2, C(0x6f767c));
      b.fx.push({ type: 'docklight', x: dx, y: CURB_H + 4.8, z: r.z1 + 0.3, w: dw });
    }
  },
  // ---------- rooftops: parapets, HVAC, ducts, bulkheads, tanks, dishes ----------
  _rooftop(b, r, rng, kind) {
    const top = r.y0 + r.h, w = r.x1 - r.x0, d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const par = r.color.clone().multiplyScalar(0.72), cap = r.color.clone().lerp(C(0xd8d4cc), 0.5);
    if (r.roof === 'flat') {
      for (const [x, z, sx, sz] of [[cx, r.z0 + 0.15, w, 0.3], [cx, r.z1 - 0.15, w, 0.3], [r.x0 + 0.15, cz, 0.3, d - 0.6], [r.x1 - 0.15, cz, 0.3, d - 0.6]]) {
        this._det(b, 'box', x, top + 0.45, z, sx, 0.9, sz, par);
        this._det(b, 'box', x, top + 0.93, z, sx + (sx > sz ? 0 : 0.08), 0.06, sz + (sz > sx ? 0 : 0.08), cap);
      }
    }
    if (r.roof !== 'flat' || w < 5 || d < 5) return;
    const inX = (m) => rng.range(r.x0 + m, Math.max(r.x0 + m, r.x1 - m)), inZ = (m) => rng.range(r.z0 + m, Math.max(r.z0 + m, r.z1 - m));
    const hvac = C(0xa9aeb2), fan = C(0x26292c);
    // HVAC units with fan grilles
    const n = rng.int(1, Math.min(5, Math.floor(w * d / 70) + 1));
    for (let i = 0; i < n; i++) {
      const ux = inX(2.2), uz = inZ(2.2), sx = rng.range(1.4, 2.6), sz = rng.range(1.2, 2.2), sh = rng.range(0.9, 1.4);
      this._det(b, 'box', ux, top + sh / 2, uz, sx, sh, sz, hvac.clone().multiplyScalar(rng.range(0.8, 1.05)));
      this._det(b, 'box', ux, top + sh * 0.35, uz, sx + 0.02, sh * 0.25, sz + 0.02, C(0x6e7378));
      this._det(b, 'cyl', ux, top + sh + 0.03, uz, Math.min(sx, sz) * 0.32, 0.06, fan);
      if (rng.chance(0.6)) { // duct running away from the unit
        const len = rng.range(3, 7), alongX = rng.chance(0.5);
        this._det(b, 'box', ux + (alongX ? len / 2 : 0), top + 0.35, uz + (alongX ? 0 : len / 2), alongX ? len : 0.6, 0.6, alongX ? 0.6 : len, C(0xb5b9bc));
      }
    }
    // stair / elevator bulkhead
    if (w > 10 && d > 10 && rng.chance(0.7)) {
      const bx = inX(3), bz = inZ(3);
      this._det(b, 'box', bx, top + 1.5, bz, 3.2, 3, 3.6, r.color.clone().multiplyScalar(0.8));
      this._det(b, 'box', bx, top + 3.05, bz, 3.5, 0.12, 3.9, cap);
      this._det(b, 'box', bx + 1.62, top + 1.1, bz, 0.04, 2.0, 1.0, C(0x3a3d40));
    }
    // vent stacks and pipes
    for (let i = 0, m = rng.int(1, 4); i < m; i++) this._det(b, 'cyl', inX(1), top + 0.6, inZ(1), 0.12, 1.2, 0x8a8f94);
    if (kind === 'tower' && rng.chance(0.6)) {
      const ah = rng.range(8, 22);
      this._det(b, 'cyl', cx + rng.range(-2, 2), top + ah / 2, cz + rng.range(-2, 2), 0.18, ah, 0xb0b4b8);
      b.fx.push({ type: 'beacon', x: cx, y: top + ah, z: cz });
    }
    if (kind === 'tower' && rng.chance(0.35) && w > 18 && d > 18) {
      this._det(b, 'disc', cx, top + 0.05, cz, 6, 1, 6, 0x3a3f46);
      this._det(b, 'disc', cx, top + 0.07, cz, 4.6, 1, 4.6, 0xd8d8d8);
      this._det(b, 'disc', cx, top + 0.09, cz, 4.3, 1, 4.3, 0x3a3f46);
      b.fx.push({ type: 'helipad', x: cx, y: top + 0.12, z: cz });
    }
    if ((kind === 'old' || kind === 'mid') && rng.chance(0.25)) { // satellite dish
      const dx = inX(1.5), dz = inZ(1.5);
      this._det(b, 'cyl', dx, top + 0.5, dz, 0.05, 1.0, 0x8a8f94);
      b.det.push({ kind: 'disc', x: dx, y: top + 1.05, z: dz, sx: 0.55, sy: 1, sz: 0.55, color: C(0xd8dadc), ry: rng.range(0, 6), rx: -1.0, rz: 0 });
    }
    if (kind === 'mid' && rng.chance(0.25) && w > 12) { // solar array
      const sx = inX(4), sz = inZ(4);
      for (let i = 0; i < 4; i++) b.det.push({ kind: 'box', x: sx + (i - 1.5) * 1.8, y: top + 0.6, z: sz, sx: 1.6, sy: 0.05, sz: 2.6, color: C(0x1d2a44), ry: 0, rx: 0.45, rz: 0 });
    }
    if (kind === 'old' && rng.chance(0.4)) {
      const tx = inX(3), tz = inZ(3);
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this._det(b, 'box', tx + lx * 1.2, top + 1.5, tz + lz * 1.2, 0.2, 3, 0.2, 0x3b3530);
      this._det(b, 'cyl', tx, top + 4.4, tz, 1.8, 3, 0x7a5a3c);
      this._det(b, 'cone', tx, top + 6.4, tz, 1.9, 1, 1.9, 0x4a3a2c);
      for (let k = 0; k < 4; k++) this._det(b, 'cyl', tx, top + 3.1 + k * 0.75, tz, 1.83, 0.05, 0x2a2420);
    }
  },
  // ---------- street furniture along one block side ----------
  _streetFurniture(b, rng, s, si, at, o) {
    const t = b.t;
    const commercial = t === 'C' || t === 'D' || b.special === 'hospital' || b.special === 'police';
    const roadIdx = si === 0 ? b.bz : si === 1 ? b.bz + 1 : si === 2 ? b.bx : b.bx + 1;
    const blvd = isBoulevard(roadIdx);
    if (commercial && !blvd) for (const al of [22, 30, 46, 54]) if (rng.chance(0.7)) { const [x, z] = at(al, 6.45); this._prop(b, 'meter', x, z, s.ry); }
    if (commercial || t === 'R') {
      if (si === 0 && rng.chance(0.8)) { const [x, z] = at(70, 9.3); this._prop(b, 'mailbox', x, z, s.ry); }
      if (rng.chance(0.35)) { const [x, z] = at(50 + rng.range(-2, 2), 9.45); this._prop(b, 'vending', x, z, s.ry); }
      if (rng.chance(0.5)) { const al = rng.pick([26, 34, 58]); for (let k = 0; k < rng.int(2, 4); k++) { const [x, z] = at(al + k * 0.7, 7.1 + rng.range(-0.2, 0.3)); this._prop(b, 'bags', x, z, rng.range(0, 6)); } }
      if (commercial && rng.chance(0.3)) { const [x, z] = at(58, 9.35); this._prop(b, 'bikerack', x, z, s.ry); }
    }
    if (t === 'D' && rng.chance(0.7)) for (const al of [11.5, 68.5]) for (let k = 0; k < 3; k++) { const [x, z] = at(al, 6.5 + k * 0.9); this._prop(b, 'bollard', x, z, 0); }
    // overhead power lines in the residential and industrial edges
    if ((t === 'H' || t === 'I' || (t === 'R' && si < 2)) && !blvd) {
      const poles = [];
      // poles stay on this block's own sidewalk: the cross streets start 6 m from each corner node,
      // so a pole at along < 10 or > 70 would stand on (or in) the crossing road
      for (const al of [13, 31, 49, 67]) { const [x, z] = at(al, 9.65); poles.push([x, z]); this._prop(b, 'upole', x, z, s.ry); }
      for (let k = 0; k < poles.length - 1; k++) for (const off of [-0.7, 0, 0.7]) {
        const [ax, az] = poles[k], [bx2, bz2] = poles[k + 1];
        const ox = Math.cos(s.ry) * off, oz = -Math.sin(s.ry) * off;
        b.wires.push([ax + ox, CURB_H + 8.3, az + oz, bx2 + ox, CURB_H + 8.3, bz2 + oz]);
      }
      if (rng.chance(0.3)) { const [x, z] = at(42, 9.3); this._prop(b, 'transformer', x, z, s.ry); }
    }
  },
  _driveway(b, rng, face, lx0, lz0, lot, hx, hz, w, d) {
    const conc = C(0xa29d94);
    let x0, z0, x1, z1, h;
    if (face === 0) { x0 = lx0 + lot / 2 - 1.5; x1 = x0 + 3; z0 = lz0; z1 = hz - d / 2; h = Math.PI; }
    else if (face === 1) { x0 = lx0 + lot / 2 - 1.5; x1 = x0 + 3; z0 = hz + d / 2; z1 = lz0 + lot; h = 0; }
    else if (face === 2) { z0 = lz0 + lot / 2 - 1.5; z1 = z0 + 3; x0 = lx0; x1 = hx - w / 2; h = -Math.PI / 2; }
    else { z0 = lz0 + lot / 2 - 1.5; z1 = z0 + 3; x0 = hx + w / 2; x1 = lx0 + lot; h = Math.PI / 2; }
    if (x1 - x0 < 1 || z1 - z0 < 1) return;
    // keep the apron clear of the fixed streetlight positions (the ground shader lights those spots)
    if (face < 2) { const al = (x0 + x1) / 2 - b.bx * P; for (const o of LAMP_OFFS) if (Math.abs(al - o) < 2.6) { const sh = (al < o ? -1 : 1) * (2.7 - Math.abs(al - o)); x0 += sh; x1 += sh; } }
    else { const al = (z0 + z1) / 2 - b.bz * P; for (const o of LAMP_OFFS) if (Math.abs(al - o) < 2.6) { const sh = (al < o ? -1 : 1) * (2.7 - Math.abs(al - o)); z0 += sh; z1 += sh; } }
    this._det(b, 'box', (x0 + x1) / 2, CURB_H + 0.012, (z0 + z1) / 2, x1 - x0, 0.025, z1 - z0, conc);
    // apron across the sidewalk down to the curb, so every driveway visibly meets the street
    const sw = WALK_W;
    let ax0 = x0, az0 = z0, ax1 = x1, az1 = z1;
    if (face === 0) { az1 = z0; az0 = z0 - sw; } else if (face === 1) { az0 = z1; az1 = z1 + sw; } else if (face === 2) { ax1 = x0; ax0 = x0 - sw; } else { ax0 = x1; ax1 = x1 + sw; }
    this._det(b, 'box', (ax0 + ax1) / 2, CURB_H + 0.01, (az0 + az1) / 2, ax1 - ax0, 0.02, az1 - az0, C(0x9a958c));
    (b.drives || (b.drives = [])).push({ x0: Math.min(x0, ax0), z0: Math.min(z0, az0), x1: Math.max(x1, ax1), z1: Math.max(z1, az1) });
    const mx = face === 0 ? x0 - 0.6 : face === 1 ? x1 + 0.6 : (x0 + x1) / 2, mz = face < 2 ? (face === 0 ? z0 + 0.6 : z1 - 0.6) : (face === 2 ? z0 - 0.6 : z1 + 0.6);
    this._prop(b, 'mailbox', face < 2 ? mx : (face === 2 ? x0 + 0.6 : x1 - 0.6), face < 2 ? mz : z0 - 0.6, h);
    const len = face < 2 ? z1 - z0 : x1 - x0;
    if (len > 5.5 && rng.chance(0.45)) b.parked.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, h: h + Math.PI, cls: null });
  },
  // ---------- drivable surfaces ----------
  _ramp(b, x0, z0, x1, z1, axis, dir, h0, h1, opts = {}) {
    const s = { x0, z0, x1, z1, axis, dir, h0, h1, block: b.i, unique: !!opts.unique, id: opts.id };
    const d0 = b.det.length;
    (this.surfaces || (this.surfaces = [])).push(s);
    const len = axis === 'x' ? x1 - x0 : z1 - z0, wid = axis === 'x' ? z1 - z0 : x1 - x0;
    const ang = Math.atan2(h1 - h0, len), slen = Math.hypot(len, h1 - h0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cy = (h0 + h1) / 2 - 0.12;
    const col = C(opts.color || 0x8c8780);
    if (axis === 'x') b.det.push({ kind: 'box', x: cx, y: cy, z: cz, sx: slen, sy: 0.24, sz: wid, color: col, ry: 0, rx: 0, rz: ang * dir });
    else b.det.push({ kind: 'box', x: cx, y: cy, z: cz, sx: wid, sy: 0.24, sz: slen, color: col, ry: 0, rx: -ang * dir, rz: 0 });
    // stripes on the lip and supports under the high end
    const hx = axis === 'x' ? (dir > 0 ? x1 : x0) : cx, hz = axis === 'z' ? (dir > 0 ? z1 : z0) : cz;
    if (opts.stripes !== false) b.det.push({ kind: 'box', x: hx - (axis === 'x' ? dir * 0.3 : 0), y: h1 - 0.02, z: hz - (axis === 'z' ? dir * 0.3 : 0), sx: axis === 'x' ? 0.6 : wid, sy: 0.06, sz: axis === 'x' ? wid : 0.6, color: C(0xf2c230), ry: 0, rx: axis === 'z' ? -ang * dir : 0, rz: axis === 'x' ? ang * dir : 0 });
    if (h1 > 0.6 && opts.support !== false) {
      const sw = axis === 'x' ? 0.4 : wid, sd = axis === 'x' ? wid : 0.4;
      this._det(b, 'box', hx - (axis === 'x' ? dir * 0.2 : 0), (h1 - 0.2) / 2, hz - (axis === 'z' ? dir * 0.2 : 0), sw, h1 - 0.2, sd, C(0x6f6a62), 0,
        { x0: hx - (axis === 'x' ? dir * 0.4 : wid / 2) - (axis === 'x' && dir < 0 ? 0 : 0), x1: hx + (axis === 'x' ? 0.05 : wid / 2), z0: hz - (axis === 'z' ? 0.4 : wid / 2), z1: hz + (axis === 'z' ? 0.05 : wid / 2), y0: 0, y1: Math.max(0.5, h1 - 1.0), kind: 'det' });
      const c = b.det[b.det.length - 1].col;
      if (axis === 'x') { c.x0 = Math.min(hx, hx - dir * 0.4); c.x1 = Math.max(hx, hx - dir * 0.4); }
      else { c.z0 = Math.min(hz, hz - dir * 0.4); c.z1 = Math.max(hz, hz - dir * 0.4); }
    }
    this._rampSides(b, s, opts);
    for (let k = d0; k < b.det.length; k++) b.det[k].ramp = s;
    return s;
  },
  // A stunt jump needs a straight run-up and somewhere to come down. Ground-level clutter (pallets,
  // piles, containers, parked cars, props) in the lane before the ramp and in the landing zone after
  // it is removed, and a fence across the lane gets a gate. Buildings are left alone.
  _clearJumpLane(s, run = 30, land = 24) {
    const ax = s.axis === 'x', lo = ax ? s.x0 : s.z0, hi = ax ? s.x1 : s.z1;
    const aLow = s.dir > 0 ? lo : hi, aHigh = s.dir > 0 ? hi : lo, c = ax ? (s.z0 + s.z1) / 2 : (s.x0 + s.x1) / 2;
    const lanes = [[aLow, aHigh, (ax ? s.z1 - s.z0 : s.x1 - s.x0) / 2 + 0.6], [aHigh, aHigh + s.dir * land, 3.6]];
    if (run > 0) lanes.push([aLow - s.dir * run, aLow, 3.2]);
    const grid = this.grid;
    for (const [a0, a1, hw] of lanes) {
      const R = ax ? { x0: Math.min(a0, a1), x1: Math.max(a0, a1), z0: c - hw, z1: c + hw } : { x0: c - hw, x1: c + hw, z0: Math.min(a0, a1), z1: Math.max(a0, a1) };
      const hitBox = (x0, z0, x1, z1) => x0 < R.x1 && x1 > R.x0 && z0 < R.z1 && z1 > R.z0;
      for (const b of this.blocks) {
        if (b.x1 + 12 < R.x0 || b.x0 - 12 > R.x1 || b.z1 + 12 < R.z0 || b.z0 - 12 > R.z1) continue;
        const keep = [];
        for (const d of b.det) {
          if (d.ramp) { keep.push(d); continue; }
          const k = d.col;
          let ex;
          if (k && k.r !== undefined) ex = [k.x - k.r, k.z - k.r, k.x + k.r, k.z + k.r];
          else if (k) ex = [k.x0, k.z0, k.x1, k.z1];
          else ex = [d.x - d.sx / 2, d.z - d.sz / 2, d.x + d.sx / 2, d.z + d.sz / 2];
          const bottom = k ? k.y0 : d.y - d.sy / 2, top = k ? k.y1 : d.y + d.sy / 2;
          // only things standing on the ground in the way (not decals, overhead wires, high signs)
          if (!hitBox(...ex) || top < CURB_H + 0.3 || bottom > CURB_H + 2.5 || (!k && d.sy < 0.25)) { keep.push(d); continue; }
          const fence = k && k.r === undefined && (ax ? (k.x1 - k.x0 < 1.2 && k.z1 - k.z0 > hw * 2) : (k.z1 - k.z0 < 1.2 && k.x1 - k.x0 > hw * 2));
          if (k && grid && k.on !== undefined) grid.remove(k);
          if (fence) {
            // cut a gate: keep the two ends of the fence either side of the lane
            for (const [p0, p1] of ax ? [[k.z0, R.z0], [R.z1, k.z1]] : [[k.x0, R.x0], [R.x1, k.x1]]) {
              if (p1 - p0 < 0.3) continue;
              const nd = { ...d }, nc = { ...k };
              delete nc.stamp; delete nc.on; delete nc.__reg;
              if (ax) { nc.z0 = p0; nc.z1 = p1; nd.z = (p0 + p1) / 2; nd.sz = p1 - p0; } else { nc.x0 = p0; nc.x1 = p1; nd.x = (p0 + p1) / 2; nd.sx = p1 - p0; }
              nd.col = nc; keep.push(nd); if (grid && k.on !== undefined) { grid.add(nc); nc.__reg = true; }
            }
          }
        }
        b.det = keep;
        b.props = b.props.filter(p => { const r = p.col && p.col.r !== undefined ? p.col.r : 0.6; const out = !hitBox(p.x - r, p.z - r, p.x + r, p.z + r); if (!out && p.col && grid) grid.remove(p.col); return out; });
        b.parked = b.parked.filter(p => !hitBox(p.x - 2.6, p.z - 2.6, p.x + 2.6, p.z + 2.6));
      }
    }
  },
  // The long sides of a ramp. A car beside a ramp used to climb its side as if it were a kerb (up
  // to 1.25 m in one step) and pop up onto it. Now, wherever the ramp stands more than a kerb above
  // the ground it was built on, its sides are solid: a closed skirt (kickers, dirt ramps) or a guard
  // wall that also keeps cars on the ramp ('guard': parking ramps). The low end and the lip stay open.
  _rampSides(b, s, opts) {
    const mode = opts.sides || 'skirt';
    if (mode === 'none') return;
    const along = s.axis === 'x' ? s.x1 - s.x0 : s.z1 - s.z0, base = opts.base !== undefined ? opts.base : Math.min(s.h0, s.h1);
    const hAt = t => s.dir > 0 ? s.h0 + (s.h1 - s.h0) * t : s.h1 - (s.h1 - s.h0) * t; // t: 0..1 from the axis minimum
    const n = Math.max(1, Math.ceil(along / 2)), col = C(opts.sideColor || (mode === 'guard' ? 0xa8a296 : 0x55524c)), th = mode === 'guard' ? 0.25 : 0.2;
    if (mode === 'guard') {
      // one sloped wall per side, 1 m above the ramp surface, with stepped colliders under it
      const len = along, ang = Math.atan2(s.h1 - s.h0, len), slen = Math.hypot(len, s.h1 - s.h0), cy = (s.h0 + s.h1) / 2 + 0.5;
      for (const side of [0, 1]) {
        if (opts.guardSides && !opts.guardSides.includes(side)) continue;
        if (s.axis === 'z') { const x = side ? s.x1 - th / 2 : s.x0 + th / 2; b.det.push({ kind: 'box', x, y: cy, z: (s.z0 + s.z1) / 2, sx: th, sy: 1.0, sz: slen, color: col, ry: 0, rx: -ang * s.dir, rz: 0 }); }
        else { const z = side ? s.z1 - th / 2 : s.z0 + th / 2; b.det.push({ kind: 'box', x: (s.x0 + s.x1) / 2, y: cy, z, sx: slen, sy: 1.0, sz: th, color: col, ry: 0, rx: 0, rz: ang * s.dir }); }
      }
    }
    for (let k = 0; k < n; k++) {
      const ta = k / n, tb = (k + 1) / n, ha = hAt(ta), hb = hAt(tb), lo = Math.min(ha, hb), hi = Math.max(ha, hb);
      if (mode === 'skirt' && lo - base < 0.45) continue; // low end: a kerb a wheel can ride onto
      const a0 = (s.axis === 'x' ? s.x0 : s.z0) + along * ta, a1 = (s.axis === 'x' ? s.x0 : s.z0) + along * tb;
      for (const side of [0, 1]) {
        if (mode === 'guard' && opts.guardSides && !opts.guardSides.includes(side)) continue;
        const y0 = base - 0.3, y1 = mode === 'guard' ? hi + 1.0 : lo - 0.04;
        let c;
        if (s.axis === 'z') { const xa = side ? s.x1 - (mode === 'guard' ? th : 0) : s.x0 - (mode === 'guard' ? 0 : th), xb = xa + th; c = { x0: xa, x1: xb, z0: a0, z1: a1, y0, y1, kind: 'det' }; }
        else { const za = side ? s.z1 - (mode === 'guard' ? th : 0) : s.z0 - (mode === 'guard' ? 0 : th), zb = za + th; c = { x0: a0, x1: a1, z0: za, z1: zb, y0, y1, kind: 'det' }; }
        // a skirt is also drawn: the dark side of the wedge down to the ground
        const ix = s.axis === 'z' ? (side ? -th : th) : 0, iz = s.axis === 'x' ? (side ? -th : th) : 0; // drawn just inside the edge, under the deck
        const vis = mode === 'skirt' ? { kind: 'box', x: (c.x0 + c.x1) / 2 + ix, y: (base + lo) / 2, z: (c.z0 + c.z1) / 2 + iz, sx: c.x1 - c.x0, sy: lo - base, sz: c.z1 - c.z0, color: col, ry: 0 } : { kind: 'box', x: 0, y: 0, z: 0, sx: 0, sy: 0, sz: 0, color: col, ry: 0 };
        vis.col = c; b.det.push(vis);
      }
    }
  },
  _platform(b, x0, z0, x1, z1, h) { (this.surfaces || (this.surfaces = [])).push({ x0, z0, x1, z1, h, block: b.i }); },
  _kicker(b, x, z, axis, dir, len = 7, h = 1.5, unique = false) {
    const hw = 2.4;
    if (axis === 'x') return this._ramp(b, x - len / 2, z - hw, x + len / 2, z + hw, 'x', dir, 0.15, h, { unique, id: 'jump' + b.i + '_' + Math.round(x), color: 0x6c6f74 });
    return this._ramp(b, x - hw, z - len / 2, x + hw, z + len / 2, 'z', dir, 0.15, h, { unique, id: 'jump' + b.i + '_' + Math.round(z), color: 0x6c6f74 });
  },
  // ---------- landmark blocks ----------
  _genLandmark(b, rng) {
    this._sidewalk(b, rng, { trees: 0.5, benches: true, news: true, busStop: true, park: 0 });
    const cx = b.cx, cz = b.cz;
    // plaza with fountain around a 260 m tower
    const fw = [36, 34, 30, 24, 18], fh = [96, 70, 50, 30, 14];
    let y = CURB_H, base = null, top = null;
    fw.forEach((wd, i) => {
      const r = this._bld(b, cx - wd / 2, cz - wd / 2 - 4, cx + wd / 2, cz + wd / 2 - 4, fh[i], STYLE.GLASS, i % 2 ? 0x3e5c78 : 0x4f6f86, 3.8, 3.4, { y0: y, oy: CURB_H, gtype: i === 0 ? 2 : 0, noCol: i > 0, far: i === 0, exactH: true });
      if (i === 0) base = r;
      this._ring(b, r, y + fh[i] - 0.4, 0.8, 0.4, C(0xd8dde2));
      y += fh[i]; top = r;
    });
    base.totalH = y - CURB_H;
    const sp = 42;
    this._det(b, 'cyl', cx, y + sp / 2, cz - 4, 0.6, sp, 0xc8ccd0);
    this._det(b, 'cyl', cx, y + 1.2, cz - 4, 5, 2.4, 0x2c3036);
    b.fx.push({ type: 'beacon', x: cx, y: y + sp + 0.5, z: cz - 4 }, { type: 'crown', x0: top.x0, z0: top.z0, x1: top.x1, z1: top.z1, y: y - 1.5 });
    for (let k = 1; k < 5; k++) b.fx.push({ type: 'crown', x0: cx - fw[k] / 2, z0: cz - fw[k] / 2 - 4, x1: cx + fw[k] / 2, z1: cz + fw[k] / 2 - 4, y: CURB_H + fh.slice(0, k).reduce((a, c) => a + c, 0) - 1.2 });
    this._dressBox(b, base, rng, 'tower');
    const fx0 = cx, fz0 = b.z1 - 6;
    this._det(b, 'cyl', fx0, CURB_H + 0.35, fz0, 4, 0.7, 0x8d8a84, null, { x: fx0, z: fz0, r: 4, y0: 0, y1: 0.75, kind: 'det' });
    b.water.push({ x: fx0, z: fz0, r: 3.6, y: CURB_H + 0.62 });
    b.fx.push({ type: 'fountain', x: fx0, y: CURB_H + 0.9, z: fz0 });
    for (let i = 0; i < 6; i++) this._prop(b, 'planter', b.x0 + 4 + i * 10.4, b.z1 - 2, 0);
    b.signs.push({ text: 'VALEN TOWER', x: cx, y: CURB_H + 6, z: base.z1 + 0.02, ry: 0, w: 14, h: 1.6, bg: '#10161f', fg: '#e8eef6' });
    // the penthouse occupies the top tier; its terrace is the roof of the tier below
    this.towerTop = { x: cx, z: cz - 4, y: CURB_H + fh.slice(0, 4).reduce((a, c) => a + c, 0), w: fw[4], terrace: fw[3] };
    // residents' garage: a ramp portal on the east side, entered from the street
    const gx0 = b.x1 - 11, gx1 = b.x1, gz0 = cz - 8, gz1 = cz + 8;
    const portal = this._bld(b, gx0, gz0, gx1, gz1, 4.6, STYLE.GLASS, 0x2f4a66, 4.6, 3, { exactH: true });
    this._rooftop(b, portal, rng, 'mid');
    b.signs.push({ text: 'RESIDENTS · GARAGE', x: gx1 + 0.06, y: CURB_H + 3.9, z: cz, ry: Math.PI / 2, w: 6, h: 0.7, bg: '#10161f', fg: '#e8c04a' });
    this._road([[b.x1 + 4.6, cz], [gx1 + 3.4, cz]], 6.5);
    this._door(b, { id: 'towerGarage', x: gx1 + 0.12, z: cz, w: 5.6, h: 3.4, axis: 'z', face: 3, y: CURB_H, color: 0x2a2d33, block: b.i, kind: 'vspace', space: 'penthouse', prop: 'penthouse' });
    // the penthouse's reserved space on the forecourt
    this._road([[cx + 14, b.z1 + 4.6], [cx + 14, b.z1 - 7]], 3.6);
    this._det(b, 'box', cx + 14, CURB_H + 0.02, b.z1 - 4.5, 2.8, 0.02, 5.2, C(0xd8b04a));
    this._det(b, 'box', cx + 14, CURB_H + 0.03, b.z1 - 4.5, 2.4, 0.02, 4.8, C(0x23262b));
    b.signs.push({ text: 'RESERVED · PH', x: cx + 15.8, y: CURB_H + 1.2, z: b.z1 - 4.5, ry: -Math.PI / 2, w: 1.6, h: 0.5, bg: '#d8b04a', fg: '#10161f' });
    this.towerDrive = { x: cx + 14, z: b.z1 - 4.5, h: 0, y: CURB_H };
    b.secrets.push({ x: b.x0 + 3, z: b.z0 + 3 });
  },
  // a Fuel & Go: canopy over four pump islands, the shop (its interior is under it), a price pylon.
  // Variants (LANDMARK_BLOCKS: station, mirror, accent) flip the plot and change the trim colour.
  _genGasStation(b, rng) {
    const V = LANDMARK_BLOCKS[b.bx + ',' + b.bz] || {}, n = V.station || 1;
    const mx = x => V.mirror ? b.x0 + b.x1 - x : x, ry = r => V.mirror ? -r : r, acc = V.accent || 0xd23a2a, accHex = '#' + new THREE.Color(acc).getHexString();
    this._sidewalk(b, rng, { trees: 0.2, park: 0 });
    const cx = b.cx, cz = b.cz;
    const cw = 26, cd = 16, cy = CURB_H + 5.2;
    this._det(b, 'box', cx, cy, cz + 6, cw, 0.7, cd, C(0xf4f4f2));
    this._det(b, 'box', cx, cy + 0.36, cz + 6, cw + 0.1, 0.18, cd + 0.1, C(acc));
    this._det(b, 'box', cx, cy - 0.38, cz + 6, cw - 1, 0.04, cd - 1, C(0xe8e8e8));
    b.fx.push({ type: 'canopy', x: cx, y: cy - 0.42, z: cz + 6, w: cw - 2, d: cd - 2 });
    for (const [ix, iz] of [[-6.5, 2.5], [6.5, 2.5], [-6.5, 9.5], [6.5, 9.5]]) {
      this._det(b, 'cyl', cx + ix, (cy) / 2, cz + iz + 3.2, 0.25, cy, 0xe0e0e0, null, { x: cx + ix, z: cz + iz + 3.2, r: 0.3, y0: 0, y1: cy, kind: 'det' });
      this._det(b, 'box', cx + ix, CURB_H + 0.12, cz + iz, 1.4, 0.24, 6.2, C(0xb8b4ac));
      for (const k of [-1.5, 1.5]) this._prop(b, 'pump', cx + ix, cz + iz + k, 0);
    }
    // convenience store
    const sx0 = Math.min(mx(b.x0 + 4), mx(b.x0 + 30)), sx1 = Math.max(mx(b.x0 + 4), mx(b.x0 + 30));
    const st = this._bld(b, sx0, b.z0 + 3, sx1, b.z0 + 17, 4.6, STYLE.SHOP, n % 2 ? 0xe9e4d8 : 0xdde4e8, 4.6, 3.2, { gtype: 1, exactH: true });
    this._ring(b, st, st.y0 + st.h - 0.3, 0.6, 0.3, C(acc));
    this._rooftop(b, st, rng, 'mid');
    b.signs.push({ text: n > 1 ? `FUEL & GO · ${V.short.toUpperCase()}` : 'FUEL & GO  ·  24 HRS', x: (st.x0 + st.x1) / 2, y: CURB_H + 4.0, z: st.z1 + 0.04, ry: 0, w: 14, h: 1.2, bg: accHex, fg: '#ffffff' });
    // price pylon
    const px = mx(b.x1 - 3), pz = b.z1 - 4;
    this._det(b, 'box', px, CURB_H + 3, pz, 0.4, 6, 0.4, C(0x555a60), 0, { x: px, z: pz, r: 0.4, y0: 0, y1: 6, kind: 'det' });
    b.signs.push({ text: ['3.49  3.79  4.05', '3.45  3.75  3.99', '3.55  3.85  4.09', '3.39  3.69  3.95', '3.59  3.89  4.15'][(n - 1) % 5], x: px, y: CURB_H + 6.6, z: pz + 0.25, ry: 0, w: 3.6, h: 1.6, bg: '#101418', fg: '#ffd84d' });
    b.signs.push({ text: 'FUEL & GO', x: px, y: CURB_H + 8.0, z: pz + 0.25, ry: 0, w: 3.6, h: 1.0, bg: accHex, fg: '#fff' });
    for (let i = 0; i < 3; i++) this._prop(b, 'bags', mx(b.x0 + 32 + i * 0.8), b.z0 + 4, rng.range(0, 6));
    this._prop(b, 'dumpster', mx(b.x0 + 36), b.z0 + 4, 0);
    this._prop(b, 'vending', V.mirror ? st.x0 - 0.8 : st.x1 + 0.8, st.z1 - 1.2, ry(Math.PI / 2));
    b.parked.push({ x: mx(b.x0 + 10), z: b.z0 + 22, h: Math.PI, cls: null }, { x: mx(b.x0 + 16), z: b.z0 + 22, h: Math.PI, cls: null });
    b.secrets.push({ x: mx(b.x0 + 34), z: b.z0 + 2.5 });
    if (n === 1) this._kicker(b, b.x1 - 10, b.z0 + 12, 'z', 1, 7, 1.4, true);
    // every station after the first registers its own place (the first is 'store', set in _placesGen)
    const door = { x: (st.x0 + st.x1) / 2, z: st.z1 + 1.1, h: 0 };
    if (n > 1) b.place = { id: 'store' + n, name: V.name, kind: 'shop', door, under: { x: (st.x0 + st.x1) / 2, z: (st.z0 + st.z1) / 2 }, station: n };
    (this.stations || (this.stations = [])).push({ id: n > 1 ? 'store' + n : 'store', name: V.name || 'Fuel & Go', door, block: b.i });
  },
  _genGarage(b, rng) {
    this._sidewalk(b, rng, { trees: 0.3, park: 0.2 });
    // three-level open parking structure; drive up the side ramp to a landing level with the roof,
    // then turn onto the roof through the opening in its barrier
    const x0 = b.x0 + 2, z0 = b.z0 + 2, x1 = b.x1 - 12, z1 = b.z1 - 4;
    const H = 10;
    const g = this._bld(b, x0, z0, x1, z1, H, STYLE.PARKING, 0xb3ada2, 3.33, 4.5, { exactH: true });
    const top = g.y0 + g.h;
    this._platform(b, x0, z0, x1, z1, top);
    const rx0 = x1 + 0.4, rx1 = x1 + 7.8, land0 = z0 + 2, land1 = z0 + 14;
    // roof barriers, open along the landing where the ramp arrives
    const bc = C(0xc8c2b6);
    const wall = (ax0, az0, ax1, az1, y = top) => this._det(b, 'box', (ax0 + ax1) / 2, y + 0.55, (az0 + az1) / 2, Math.max(0.3, ax1 - ax0), 1.1, Math.max(0.3, az1 - az0), bc, 0, { x0: ax0, z0: az0, x1: ax1, z1: az1, y0: y - 0.3, y1: y + 1.1, kind: 'det' });
    wall(x0, z0, x1, z0 + 0.3); wall(x0, z1 - 0.3, x1, z1); wall(x0, z0, x0 + 0.3, z1);
    wall(x1 - 0.3, land1, x1, z1);
    // ramp along the east side, rising toward the north, guard walls on both sides
    this._ramp(b, rx0, land1, rx1, z1, 'z', -1, CURB_H, top, { color: 0x8a857c, stripes: false, sides: 'guard', base: CURB_H });
    // the landing: flat, level with the roof, railed on its outer and north edges
    this._platform(b, x1 - 0.2, land0, rx1, land1, top);
    this._det(b, 'box', (x1 + rx1) / 2, top - 0.17, (land0 + land1) / 2, rx1 - x1, 0.34, land1 - land0, C(0x8a857c), 0, { x0: x1, x1: rx1, z0: land0, z1: land1, y0: top - 0.34, y1: top - 0.06, kind: 'det' });
    wall(x1, land0, rx1, land0 + 0.3); wall(rx1 - 0.3, land0, rx1, land1);
    for (const [px, pz] of [[rx0 + 0.6, land0 + 0.6], [rx1 - 0.6, land0 + 0.6], [rx1 - 0.6, land1 - 0.6]]) this._det(b, 'box', px, (top - 0.34 + CURB_H) / 2, pz, 0.6, top - 0.34 - CURB_H, 0.6, C(0x8a857c), 0, true);
    b.signs.push({ text: 'ROOF PARKING →', x: rx1 - 0.35, y: top + 1.7, z: (land0 + land1) / 2, ry: -Math.PI / 2, w: 3.8, h: 0.6, bg: '#1d4fa0', fg: '#ffffff' });
    b.signs.push({ text: 'P  QUARTER GARAGE', x: (x0 + x1) / 2, y: CURB_H + 7.6, z: z1 + 0.04, ry: 0, w: 12, h: 1.4, bg: '#1d4fa0', fg: '#ffffff' });
    for (let k = 0; k < 4; k++) b.parked.push({ x: x0 + 14 + k * 6, z: z0 + 6, h: 0, cls: null, y: top }); // clear of the roof kicker's run-up
    b.parked.push({ x: x1 - 12, z: z1 - 8, h: Math.PI, cls: 'supercar', y: top, rare: true });
    b.lampsRoof = [[x0 + 4, z0 + 4], [x1 - 4, z1 - 4], [x0 + 4, z1 - 4], [x1 - 4, z0 + 4]];
    for (const [lx, lz] of b.lampsRoof) this._det(b, 'cyl', lx, top + 2.5, lz, 0.09, 5, 0x2c3035);
    for (const [lx, lz] of b.lampsRoof) b.fx.push({ type: 'rooflamp', x: lx, y: top + 5.0, z: lz });
    this.packageSpots.push({ x: x0 + 3, y: top, z: z1 - 3 });
    // a kicker at the far end of the roof launches you over the street
    this._ramp(b, x0 + 2, z0 + 0.4, x0 + 7, z0 + 7, 'z', -1, top, top + 1.4, { unique: true, id: 'garage_leap', color: 0x6c6f74 });
    this.quarterGarage = { x0, z0, x1, z1, top, rx0, rx1, land0, land1 };
  },
  _genMall(b, rng) {
    this._sidewalk(b, rng, { trees: 0.4, benches: true, news: true, park: 0 });
    const m = this._bld(b, b.x0 + 3, b.z0 + 2, b.x1 - 3, b.z0 + 26, 13, STYLE.SHOP, 0xd9d0c0, 6.5, 6, { gtype: 2, exactH: true });
    this._ring(b, m, m.y0 + m.h - 0.4, 0.8, 0.5, C(0x2c5f8a));
    this._rooftop(b, m, rng, 'mid');
    const ex = b.cx, ez = m.z1;
    this._det(b, 'box', ex, CURB_H + 6.2, ez + 3, 16, 0.5, 6, C(0x2c5f8a));
    for (const k of [-7.5, 7.5]) this._det(b, 'cyl', ex + k, CURB_H + 3, ez + 5.6, 0.3, 6, 0xd0d4d8, null, { x: ex + k, z: ez + 5.6, r: 0.35, y0: 0, y1: 6, kind: 'det' });
    b.fx.push({ type: 'canopy', x: ex, y: CURB_H + 5.9, z: ez + 3, w: 15, d: 5 });
    b.signs.push({ text: 'HARBORVIEW MALL', x: ex, y: CURB_H + 9.5, z: ez + 0.05, ry: 0, w: 20, h: 2.2, bg: '#f4f1ea', fg: '#2c5f8a' });
    for (let i = 0; i < 6; i++) b.signs.push({ x: b.x0 + 8 + i * 10, y: CURB_H + 4.6, z: ez + 0.05, ry: 0, w: 6, h: 1.0, ad: (i * 3) % 8 });
    // car park in front (matches the stall rows painted by the ground shader)
    const cx = b.cx, cz = b.cz;
    for (const [rz, ry] of [[13.4, 0], [19.0, Math.PI]]) for (let k = 0; k < 18; k++) if (rng.chance(0.55)) b.parked.push({ x: cx - 26 + 1.4 + k * 2.8, z: cz + rz, h: ry, cls: null });
    for (const [lx, lz] of [[-14, 10], [14, 10], [0, 24]]) this._prop(b, 'lotlamp', cx + lx, cz + lz, 0);
    this._prop(b, 'cart', cx - 20, cz + 8, 0.3); this._prop(b, 'cart', cx + 18, cz + 25, 1.2);
    b.secrets.push({ x: m.x1 - 2, z: m.z0 + 2 });
    this._kicker(b, cx + 22, cz + 6, 'x', -1, 7, 1.5, true);
  },
  _genStadium(b, rng) {
    this._sidewalk(b, rng, { trees: 0.3, benches: true, park: 0 });
    const cx = b.cx, cz = b.cz, ra = 27, rb = 21, segs = 36;
    const seat = [C(0x2c5f8a), C(0xd8d0c0)], wallC = C(0xc9c4ba);
    for (let i = 0; i < segs; i++) {
      const a0 = i / segs * Math.PI * 2, a1 = (i + 1) / segs * Math.PI * 2, am = (a0 + a1) / 2;
      const x0 = cx + Math.cos(a0) * ra, z0 = cz + Math.sin(a0) * rb, x1 = cx + Math.cos(a1) * ra, z1 = cz + Math.sin(a1) * rb;
      const len = Math.hypot(x1 - x0, z1 - z0) + 0.2, ry = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
      const gate = i % 9 === 0;
      if (!gate) {
        b.det.push({ kind: 'box', x: (x0 + x1) / 2, y: CURB_H + 6, z: (z0 + z1) / 2, sx: len, sy: 12, sz: 0.6, color: wallC, ry, rx: 0, rz: 0 });
        this.grid && 0;
        b.det.push({ kind: 'box', x: (x0 + x1) / 2, y: CURB_H + 11.7, z: (z0 + z1) / 2, sx: len, sy: 0.6, sz: 0.9, color: C(0x8c949c), ry, rx: 0, rz: 0 });
        for (let k = 0; k < 2; k++) {
          const t = 0.35 + k * 0.3; const mx = cx + Math.cos(am) * ra * (1 - t * 0.35), mz = cz + Math.sin(am) * rb * (1 - t * 0.35);
          b.det.push({ kind: 'box', x: mx, y: CURB_H + 4 + k * 3.2, z: mz, sx: len * (1 - t * 0.3), sy: 0.4, sz: 3.6, color: seat[(i + k) % 2], ry, rx: 0.5, rz: 0 });
        }
        // roof canopy over the upper stand
        b.det.push({ kind: 'box', x: cx + Math.cos(am) * (ra - 3), y: CURB_H + 13.2, z: cz + Math.sin(am) * (rb - 3), sx: len, sy: 0.25, sz: 7, color: C(0xe8e8ea), ry, rx: -0.12, rz: 0 });
        for (let k = 0; k <= 2; k++) { const t = k / 2; const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t; b.det.push({ kind: 'box', x: px, y: CURB_H, z: pz, sx: 0.01, sy: 0.01, sz: 0.01, color: wallC, ry: 0, col: { x: px, z: pz, r: 1.4, y0: 0, y1: 13, kind: 'det' } }); }
      }
    }
    // pitch markings and goals
    this._det(b, 'box', cx, CURB_H + 0.03, cz, 30, 0.02, 0.15, C(0xf2f2f2));
    for (const s of [-1, 1]) { this._det(b, 'box', cx + s * 15, CURB_H + 1.2, cz, 0.15, 2.4, 6, C(0xffffff)); }
    // floodlight towers
    for (const [fx, fz] of [[-30, -24], [30, -24], [-30, 24], [30, 24]]) {
      const x = cx + fx, z = cz + fz;
      this._det(b, 'box', x, CURB_H + 15, z, 0.8, 30, 0.8, C(0x8c949c), 0, { x, z, r: 0.6, y0: 0, y1: 30, kind: 'det' });
      this._det(b, 'box', x, CURB_H + 30, z, 4, 2.4, 0.5, C(0x2c3036), Math.atan2(-fx, -fz));
      b.fx.push({ type: 'flood', x, y: CURB_H + 30, z, ry: Math.atan2(-fx, -fz) });
    }
    b.signs.push({ text: 'VALEN STADIUM', x: cx, y: CURB_H + 9, z: cz + rb + 0.7, ry: 0, w: 16, h: 2, bg: '#2c5f8a', fg: '#ffffff' });
    this.packageSpots.push({ x: cx, y: CURB_H, z: cz });
  },
  _genPlant(b, rng) {
    this._sidewalk(b, rng, { trees: 0, park: 0.1 });
    const hall = this._bld(b, b.x0 + 3, b.z0 + 3, b.x0 + 30, b.z0 + 24, 14, STYLE.IND, 0x8d9296, 5, 4.5, { gtype: 3 });
    this._dressBox(b, hall, rng, 'warehouse'); this._rooftop(b, hall, rng, 'ind');
    // cooling tower
    const tx = b.x1 - 14, tz = b.z0 + 14;
    this._det(b, 'cone', tx, CURB_H + 12, tz, 9, 24, 9, C(0xb8b4ac));
    this._det(b, 'cyl', tx, CURB_H + 24, tz, 5.2, 2, 0xb0aca4);
    b.det[b.det.length - 2].col = { x: tx, z: tz, r: 8, y0: 0, y1: 24, kind: 'det' };
    b.fx.push({ type: 'steam', x: tx, y: CURB_H + 25, z: tz });
    // stacks and tanks connected by pipe runs
    const stacks = [[b.x0 + 36, b.z0 + 6], [b.x0 + 41, b.z0 + 6]];
    for (const [sx, sz] of stacks) {
      const sh = rng.range(32, 42);
      this._det(b, 'cyl', sx, CURB_H + sh / 2, sz, 1.3, sh, 0x8a5a48, null, { x: sx, z: sz, r: 1.4, y0: 0, y1: sh, kind: 'det' });
      for (let k = 1; k < 4; k++) this._det(b, 'cyl', sx, CURB_H + sh * k / 4, sz, 1.4, 0.5, 0xd8d8d8);
      b.fx.push({ type: 'smoke', x: sx, y: CURB_H + sh + 0.5, z: sz }, { type: 'beacon', x: sx, y: CURB_H + sh + 0.3, z: sz });
    }
    const tanks = [];
    for (let k = 0; k < 3; k++) { const x = b.x0 + 12 + k * 11, z = b.z1 - 12, r = 4.2, h = 10; tanks.push([x, z]); this._det(b, 'cyl', x, CURB_H + h / 2, z, r, h, 0xc8c8c0, null, { x, z, r, y0: 0, y1: h + 1, kind: 'det' }); this._det(b, 'cone', x, CURB_H + h + 0.6, z, r, 1.2, r, C(0xb8b8b0)); }
    for (let k = 0; k < tanks.length - 1; k++) { const [ax, az] = tanks[k], [bx2] = tanks[k + 1]; b.det.push({ kind: 'cylr', x: (ax + bx2) / 2, y: CURB_H + 7, z: az, sx: 0.35, sy: bx2 - ax, sz: 0.35, color: C(0x9a9fa4), ry: 0, rx: 0, rz: Math.PI / 2 }); }
    b.det.push({ kind: 'cylr', x: b.x0 + 30, y: CURB_H + 8, z: (b.z0 + 24 + b.z1 - 12) / 2, sx: 0.5, sy: b.z1 - 12 - (b.z0 + 24), sz: 0.5, color: C(0x9a9fa4), ry: 0, rx: Math.PI / 2, rz: 0 });
    b.signs.push({ text: 'SALTWORKS ENERGY', x: (hall.x0 + hall.x1) / 2, y: CURB_H + 11, z: hall.z1 + 0.05, ry: 0, w: 14, h: 1.6, bg: '#1b1b1b', fg: '#d8a227' });
    for (let k = 0; k < 6; k++) this._prop(b, k % 2 ? 'barrel' : 'pallet', b.x0 + 34 + k * 2, b.z0 + 30, rng.range(0, 3));
    this._containers(b, rng, b.x0 + 34, b.z0 + 34, b.x1 - 4, b.z1 - 20);
    b.secrets.push({ x: tx + 9, z: tz + 9 });
  },
  // ---------- post-generation: surfaces, packages, jumps ----------
  _postGen() {
    // a few extra kicker jumps in lots, yards and the waterfront
    for (const b of this.blocks) {
      const rng = new RNG(b.i * 31 + 7);
      if (b.landmark) continue;
      if (b.t === 'K' && rng.chance(0.8)) this._kicker(b, b.cx + rng.range(-10, 10), b.cz - 11.8, 'x', rng.chance(0.5) ? 1 : -1, 7, 1.4, true);
      if (b.t === 'X') this._ramp(b, b.cx - 6, b.z1 - 16, b.cx + 4, b.z1 - 11, 'x', 1, CURB_H, 2.6, { unique: true, id: 'dirt' + b.i, color: 0x6b5b45 });
      if (b.t === 'I' && rng.chance(0.3)) this._kicker(b, b.cx + 18, b.cz + 22, 'z', -1, 8, 1.6, true);
    }
    // every stunt jump at ground level gets a clear run-up and landing (rooftop leaps are laid out by hand)
    // rooftop leaps keep their decks as built and only get the street below their flight path cleared
    for (const s of this.surfaces || []) if (s.unique) { const roof = Math.min(s.h0, s.h1) > 1; this._clearJumpLane(s, roof ? 0 : 30, roof ? 30 : 24); }
    SURF.lists = new Array(N * N).fill(null);
    // a surface is listed in every block it overlaps (superblock decks and ramps cross block lines)
    for (const s of this.surfaces || []) {
      for (let bx = clamp(Math.floor(s.x0 / P), 0, N - 1); bx <= clamp(Math.floor(s.x1 / P), 0, N - 1); bx++)
        for (let bz = clamp(Math.floor(s.z0 / P), 0, N - 1); bz <= clamp(Math.floor(s.z1 / P), 0, N - 1); bz++) { const k = bz * N + bx; (SURF.lists[k] || (SURF.lists[k] = [])).push(s); }
    }
    this.jumps = (this.surfaces || []).filter(s => s.unique);
    // hidden packages: alleys, courtyards, rooftops, parks, construction sites, the waterfront
    const spots = this.packageSpots.slice();
    const rng = new RNG(4242);
    const pool = [];
    for (const b of this.blocks) for (const s of b.secrets) pool.push({ x: s.x, y: groundY(s.x, s.z), z: s.z });
    pool.push({ x: -12, y: CURB_H, z: 4 * P + 30 }, { x: CITY + 12, y: CURB_H, z: 9 * P + 20 }, { x: 3 * P + 30, y: CURB_H, z: -12 }, { x: 8 * P + 50, y: CURB_H, z: CITY + 12 });
    while (spots.length < 30 && pool.length) spots.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
    this.packages = spots.slice(0, 30).map((s, i) => ({ id: i, x: s.x, y: s.y, z: s.z }));
  }
});
// wrap the base generator so the extra passes run after every block is built
{
  const base = World.prototype.generate;
  World.prototype.generate = function () {
    this.packageSpots = []; this.surfaces = [];
    for (const b of []) void b;
    const origBlockInit = this._genBlock;
    this._genBlock = function (b) { b.wires = b.wires || []; return origBlockInit.call(this, b); };
    base.call(this);
    this._postGen();
    // extra colliders created after the base registration (e.g. ramps added in _postGen)
    for (const b of this.blocks) for (const d of b.det) if (d.col && !d.col.__reg) { if (this.grid.all.indexOf(d.col) < 0) this.grid.add(d.col); d.col.__reg = true; }
  };
}

