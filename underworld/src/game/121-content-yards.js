/* =====================================================================
   [CONTENT] YARDS, HOUSE FRONTS AND STREET DETAIL (owner, 2026-11-16:
   "add more detail to the houses and the streets, bring more realism to
   everything, make the yards more complete with everything a yard has").
   - Back yards: a patio (table, chairs, a parasol, loungers), a barbecue,
     a garden shed, a swing set or a trampoline, a washing line, raised
     vegetable beds, a sandpit, a kennel, a fire pit; a pool behind the
     bigger houses; a flower border and a back fence where there is room.
   - House fronts: flower beds along the front wall, a path from the porch
     to the pavement, porch posts and a lamp, the house number, wheelie bins.
   - Streets: stop signs with a street-name blade where a residential
     street meets another, manhole covers and kerb drains along it.
   Everything is static detail geometry merged into its block's mesh (no
   draw calls of its own). Each house is dressed from its own seed (its
   position), so the rest of the world's generation is untouched, and
   every item is fitted into a clearance grid of the yard (buildings,
   drives, parking bays, trees, roads, the neighbours' items).
   ===================================================================== */
const YARD_CELL = 0.5;
// footprint: w along the house, d away from it; p: chance in an ordinary yard, in a rich one; at: 'near' the
// house or 'far' from it
const YARD_ITEMS = {
  patio: { w: 5.0, d: 3.8, p: [0.8, 0.95], at: 'near' },
  pool: { w: 10, d: 5.6, p: [0, 0.75], at: 'near', rich: true },
  bbq: { w: 1.6, d: 1.2, p: [0.65, 0.85], at: 'near' },
  shed: { w: 3.2, d: 2.8, p: [0.5, 0.3], at: 'far' },
  swing: { w: 4.2, d: 2.2, p: [0.35, 0.3], at: 'far' },
  tramp: { w: 4.2, d: 4.2, p: [0.25, 0.25], at: 'far' },
  line: { w: 5.0, d: 1.2, p: [0.45, 0.1], at: 'mid' },
  beds: { w: 3.4, d: 3.2, p: [0.45, 0.5], at: 'far' },
  sandbox: { w: 2.2, d: 2.2, p: [0.2, 0.1], at: 'mid' },
  kennel: { w: 1.6, d: 1.6, p: [0.25, 0.2], at: 'mid' },
  firepit: { w: 4.0, d: 4.0, p: [0.12, 0.45], at: 'far' }
};
const YARD_ORDER = ['pool', 'patio', 'shed', 'tramp', 'swing', 'firepit', 'beds', 'line', 'bbq', 'sandbox', 'kennel'];
const FLOWERS = [0xd23a5a, 0xf2c230, 0xe8e8f0, 0xb05ad8, 0xf28a3a, 0xe86a8a];

Object.assign(World.prototype, {
  // the frame helpers: F = { o: [x, z], u: [ux, uz], v: [vx, vz], y } with u and v along the world axes
  _yw(F, a, c) { return [F.o[0] + F.u[0] * a + F.v[0] * c, F.o[1] + F.u[1] * a + F.v[1] * c]; },
  _ybox(b, F, a, c, y0, w, h, d, col, solid) {
    const [x, z] = this._yw(F, a, c), sx = Math.abs(F.u[0]) * w + Math.abs(F.v[0]) * d, sz = Math.abs(F.u[1]) * w + Math.abs(F.v[1]) * d;
    return this._det(b, 'box', x, F.y + y0 + h / 2, z, sx, h, sz, col, 0, solid ? true : undefined);
  },
  // an upright cylinder of radius r from y0 up h; colR: a round collider of that radius from the ground to its top
  _ycyl(b, F, a, c, y0, r, h, col, colR) {
    const [x, z] = this._yw(F, a, c);
    return this._det(b, 'cylr', x, F.y + y0 + h / 2, z, r, h, r, col, 0, colR ? { x, z, r: colR, y0: F.y, y1: F.y + y0 + h, kind: 'det' } : undefined);
  },
  _yblob(b, F, a, c, y, rx, ry, col) { const [x, z] = this._yw(F, a, c); return this._det(b, 'blob', x, F.y + y, z, rx, ry, rx, col); },

  // ---------------------------------------------------------------- the yard items, built in the frame round (a, c)
  _yardItem(b, F, kind, a, c, rng) {
    const B = (a2, c2, y0, w, h, d, col, s) => this._ybox(b, F, a2, c2, y0, w, h, d, col, s);
    const Cy = (a2, c2, y0, r, h, col, cr) => this._ycyl(b, F, a2, c2, y0, r, h, col, cr);
    const Bl = (a2, c2, y, rx, ry, col) => this._yblob(b, F, a2, c2, y, rx, ry, col);
    switch (kind) {
      case 'patio': {
        B(a, c, 0, 4.6, 0.06, 3.6, rng() < 0.5 ? 0xc8c0b0 : 0xb8a890);
        for (let i = 1; i < 5; i++) B(a - 2.3 + i * 0.92, c, 0.06, 0.03, 0.004, 3.6, 0x9a9288);
        const tx = a + 0.9;
        Cy(tx, c, 0.06, 0.06, 0.68, 0x2a2c30, 0.7); Cy(tx, c, 0.74, 0.62, 0.04, 0xf2f2ee);
        for (const [da, dc] of [[-0.9, 0], [0.9, 0], [0, -0.9], [0, 0.9]]) { B(tx + da, c + dc, 0.06, 0.46, 0.42, 0.46, 0x3a3d42); B(tx + da * 1.35, c + dc * 1.35, 0.48, da ? 0.06 : 0.46, 0.42, da ? 0.46 : 0.06, 0x3a3d42); }
        Cy(tx, c, 0.06, 0.035, 2.3, 0xd8d8d8); Bl(tx, c, 2.36, 1.5, 0.26, [0xf2f2ee, 0xd23a2a, 0x2a6fd6, 0x2e7a4a, 0xe8c040][Math.floor(rng() * 5)]);
        for (const la of [a - 1.25, a - 2.0]) { B(la, c, 0.06, 0.66, 0.26, 1.9, 0xf2f2ee); B(la, c - 0.78, 0.32, 0.66, 0.34, 0.3, 0xf2f2ee); B(la, c + 0.1, 0.33, 0.6, 0.06, 1.3, 0x2a6fd6); }
        break;
      }
      case 'pool': {
        B(a, c, 0, 10, 0.03, 5.6, 0xd8d0c0);
        for (const s of [-1, 1]) { B(a, c + s * 2.45, 0.03, 9.2, 0.1, 0.3, 0xe8e2d4); B(a + s * 4.45, c, 0.03, 0.3, 0.1, 5.2, 0xe8e2d4); }
        B(a, c, 0.02, 8.6, 0.05, 4.6, 0x35a6cf); B(a + 2, c - 0.6, 0.071, 2.6, 0.004, 1.2, 0x5ac0e0);
        for (const s of [-0.3, 0.3]) B(a + 3.7 + s, c - 2.05, 0.1, 0.05, 0.9, 0.05, 0xd8dcdc);
        break;
      }
      case 'bbq': {
        B(a, c, 0, 0.9, 0.82, 0.56, 0x1e2024, true); B(a, c, 0.82, 0.94, 0.28, 0.58, 0x2a2c30); B(a, c, 1.1, 0.5, 0.05, 0.06, 0x8a8e92);
        B(a + 0.66, c, 0.78, 0.4, 0.04, 0.46, 0x8a6440); B(a - 0.66, c, 0.78, 0.4, 0.04, 0.46, 0x8a6440); Cy(a - 0.62, c, 0, 0.15, 0.5, 0xd8dcdc);
        break;
      }
      case 'shed': {
        const col = [0x6a8a5a, 0x8a6a48, 0xc8b8a0, 0x5a6a7a, 0xa85a3a][Math.floor(rng() * 5)], roof = [0x3a3d40, 0x5a4a3a, 0x2e3438][Math.floor(rng() * 3)];
        B(a, c, 0, 2.6, 2.1, 2.2, col, true); B(a, c, 2.1, 3.0, 0.16, 2.6, roof); B(a, c, 2.26, 3.0, 0.22, 1.5, roof); B(a, c, 2.48, 3.0, 0.16, 0.6, roof);
        B(a + 0.5, c - 1.11, 0.05, 0.9, 1.85, 0.04, 0x4a3a2a); B(a + 0.82, c - 1.14, 0.95, 0.06, 0.06, 0.04, 0xc8c0a8); B(a - 0.6, c - 1.11, 1.1, 0.7, 0.5, 0.04, 0x9fc4d8);
        B(a + 1.55, c - 0.6, 0, 0.5, 0.5, 0.5, 0x8a6440); // (a tub of tools by the door)
        break;
      }
      case 'swing': {
        const cl = [0x3a6a9a, 0x2e7a4a, 0xd23a2a][Math.floor(rng() * 3)];
        for (const sa of [-1.8, 1.8]) for (const sc of [-0.8, 0.8]) B(a + sa, c + sc * 0.9, 0, 0.12, 2.3, 0.12, cl, true);
        B(a, c, 2.3, 3.8, 0.14, 0.14, cl);
        for (const s of [-0.7, 0.7]) { for (const r of [-0.22, 0.22]) B(a + s + r, c, 0.5, 0.025, 1.8, 0.025, 0x9a9a9a); B(a + s, c, 0.45, 0.52, 0.05, 0.26, s < 0 ? 0xd23a2a : 0xf2c230); }
        break;
      }
      case 'tramp': {
        for (const [da, dc] of [[1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2]]) Cy(a + da, c + dc, 0, 0.05, 0.84, 0x8a8e92);
        Cy(a, c, 0.82, 1.9, 0.06, [0x2a6fd6, 0x2e8a4a, 0xd23a2a][Math.floor(rng() * 3)], 1.9); Cy(a, c, 0.86, 1.62, 0.03, 0x15171a);
        for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2; Cy(a + Math.cos(t) * 1.85, c + Math.sin(t) * 1.85, 0.85, 0.03, 1.6, 0x2a2c30); }
        break;
      }
      case 'line': {
        for (const s of [-2.2, 2.2]) { B(a + s, c, 0, 0.08, 2.0, 0.08, 0x8a8e92, true); B(a + s, c, 1.95, 0.08, 0.06, 1.0, 0x8a8e92); }
        for (const k of [-0.36, 0, 0.36]) B(a, c + k, 1.92, 4.4, 0.015, 0.015, 0xe8e8e8);
        const n = 3 + Math.floor(rng() * 4);
        for (let i = 0; i < n; i++) { const w = 0.35 + rng() * 0.45; B(a - 1.8 + i * (3.6 / n) + rng() * 0.2, c + [-0.36, 0, 0.36][i % 3], 1.92 - (0.4 + rng() * 0.35), w, 0.4 + rng() * 0.35, 0.02, [0xf2f2ee, 0x2a6fd6, 0xd23a5a, 0xf2c230, 0x3a3d42, 0x8ac0e8][Math.floor(rng() * 6)]); }
        break;
      }
      case 'beds': {
        for (const s of [-0.85, 0.85]) {
          B(a, c + s, 0, 3.0, 0.38, 1.1, 0x7a5636, true); B(a, c + s, 0.38, 2.86, 0.02, 0.96, 0x4a3424);
          for (let i = 0; i < 5; i++) { Bl(a - 1.15 + i * 0.58, c + s, 0.56, 0.24, 0.22, i % 2 ? 0x3d7a2c : 0x4a8a34); if (rng() < 0.5) Bl(a - 1.0 + i * 0.58, c + s + 0.2, 0.62, 0.07, 0.07, rng() < 0.5 ? 0xd23a2a : 0xf28a3a); }
        }
        break;
      }
      case 'sandbox': {
        B(a, c, 0, 1.9, 0.25, 1.9, 0x8a6a48); B(a, c, 0.2, 1.7, 0.06, 1.7, 0xe8d8a8);
        Cy(a + 0.45, c + 0.3, 0.26, 0.12, 0.2, 0xd23a2a); Bl(a - 0.4, c - 0.3, 0.42, 0.2, 0.2, 0x2a6fd6); Bl(a + 1.4, c + 0.6, 0.15, 0.15, 0.15, 0xf2c230);
        break;
      }
      case 'kennel': {
        B(a, c, 0, 1.0, 0.8, 1.2, [0xa8744a, 0x8a5a3a, 0xc8a878][Math.floor(rng() * 3)], true); B(a, c, 0.8, 1.2, 0.12, 1.4, 0x7a2a22); B(a, c, 0.92, 1.2, 0.1, 0.6, 0x7a2a22);
        B(a, c - 0.61, 0.02, 0.42, 0.5, 0.02, 0x1a1410); Cy(a + 0.5, c - 0.9, 0, 0.16, 0.08, 0xd23a2a);
        break;
      }
      case 'firepit': {
        Cy(a, c, 0, 0.65, 0.35, 0x8a8580, 0.75); Cy(a, c, 0.3, 0.5, 0.06, 0x2a2420);
        B(a, c, 0.36, 0.9, 0.12, 0.14, 0x5a3a24); B(a, c, 0.4, 0.14, 0.12, 0.9, 0x5a3a24);
        B(a, c - 1.5, 0, 1.8, 0.42, 0.42, 0x7a5636); B(a - 1.5, c, 0, 0.42, 0.42, 1.8, 0x7a5636); B(a + 1.5, c, 0, 0.42, 0.42, 1.8, 0x7a5636);
        break;
      }
    }
  },

  /* dress a yard. F: the frame (v points away from the house); [a0, a1] x [c0, c1]: the yard in frame units; ok(x, z):
     the ground there is free (no building, drive, bay, road, tree). rich: a bigger house (a pool, a fire pit). fence:
     run a back fence along c1 where the ground allows. Returns how many items were placed. */
  _dressYard(b, F, a0, a1, c0, c1, ok, rng, rich, fence) {
    const S = YARD_CELL, na = Math.floor((a1 - a0) / S), nc = Math.floor((c1 - c0) / S);
    if (na < 3 || nc < 3) return 0;
    const free = new Uint8Array(na * nc);
    for (let i = 0; i < na; i++) for (let j = 0; j < nc; j++) { const [x, z] = this._yw(F, a0 + (i + 0.5) * S, c0 + (j + 0.5) * S); free[i * nc + j] = ok(x, z) ? 1 : 0; }
    const fits = (i0, j0, wi, dj) => { if (i0 < 0 || j0 < 0 || i0 + wi > na || j0 + dj > nc) return false; for (let i = i0; i < i0 + wi; i++) for (let j = j0; j < j0 + dj; j++) if (!free[i * nc + j]) return false; return true; };
    const take = (i0, j0, wi, dj) => { for (let i = Math.max(0, i0 - 1); i < Math.min(na, i0 + wi + 1); i++) for (let j = Math.max(0, j0 - 1); j < Math.min(nc, j0 + dj + 1); j++) free[i * nc + j] = 0; };
    let placed = 0;
    for (const kind of YARD_ORDER) {
      const I = YARD_ITEMS[kind]; if (rng() >= I.p[rich ? 1 : 0]) continue;
      if (kind === 'tramp' && placed && rng() < 0.4) continue;
      const wi = Math.ceil(I.w / S), dj = Math.ceil(I.d / S);
      // candidate cells in the order the item prefers: near the house, far from it, or anywhere in the middle
      const cands = [];
      for (let j = 0; j + dj <= nc; j++) for (let i = 0; i + wi <= na; i++) cands.push([i, j]);
      const mid = (na - wi) / 2;
      if (I.at === 'near') cands.sort((p, q) => p[1] - q[1] || Math.abs(p[0] - mid) - Math.abs(q[0] - mid));
      else if (I.at === 'far') cands.sort((p, q) => q[1] - p[1] || Math.abs(q[0] - mid) - Math.abs(p[0] - mid));
      else { const r = rng(); cands.sort((p, q) => Math.abs(p[1] - nc * r) - Math.abs(q[1] - nc * r)); }
      const hit = cands.find(([i, j]) => fits(i, j, wi, dj)); if (!hit) continue;
      take(hit[0], hit[1], wi, dj);
      this._yardItem(b, F, kind, a0 + (hit[0] + wi / 2) * S, c0 + (hit[1] + dj / 2) * S, rng); placed++;
    }
    // a flower border along the back where it is still free
    const jb = nc - 2;
    if (jb > 3) for (let i = 1; i < na - 1; i++) if (free[i * nc + jb] && free[i * nc + jb + 1] && rng() < 0.7) {
      const a = a0 + (i + 0.5) * S, c = c0 + (jb + 1) * S;
      this._yblob(b, F, a, c, 0.25, 0.3 + rng() * 0.12, 0.28, rng() < 0.45 ? FLOWERS[Math.floor(rng() * FLOWERS.length)] : 0x3d6a2c);
    }
    // the back fence along c1, run by run where the ground is free
    if (fence) {
      const col = rng() < 0.5 ? 0xf0eee8 : 0x8a7050, h = 1.2;
      let start = -1;
      const flush = end => { if (start < 0) return; const s0 = a0 + start * S, s1 = a0 + end * S; if (s1 - s0 > 2) { this._ybox(b, F, (s0 + s1) / 2, c1 - 0.1, 0, s1 - s0, h, 0.08, col, true); for (let a = s0; a <= s1 + 0.01; a += 2.4) this._ybox(b, F, Math.min(a, s1), c1 - 0.1, 0, 0.12, h + 0.12, 0.12, col); } start = -1; };
      for (let i = 0; i < na; i++) { const [x, z] = this._yw(F, a0 + (i + 0.5) * S, c1 - 0.1); if (ok(x, z)) { if (start < 0) start = i; } else flush(i); }
      flush(na);
    }
    return placed;
  },

  // ---------------------------------------------------------------- the lattice's houses: the back yard, the front
  _dressHomes(b) {
    const homes = this.homes.filter(h => h.block === b.i && h.type !== 'apartment');
    if (!homes.length) return;
    const pad = 16, near = this.localRoads.filter(r => {
      if (r.k === 'disc') return r.x > b.x0 - pad - r.r && r.x < b.x1 + pad + r.r && r.z > b.z0 - pad - r.r && r.z < b.z1 + pad + r.r;
      return r.pts.some(p => p[0] > b.x0 - pad && p[0] < b.x1 + pad && p[1] > b.z0 - pad && p[1] < b.z1 + pad);
    });
    const rd = (x, z) => {
      let best = 1e9;
      for (const r of near) {
        if (r.k === 'line') { for (let i = 0; i < r.pts.length - 1; i++) { const d = segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]) - r.w / 2; if (d < best) best = d; } }
        else if (r.k === 'disc') { const d = Math.hypot(x - r.x, z - r.z) - r.r; if (d < best) best = d; }
        else if (pointInPoly(x, z, r.pts)) best = Math.min(best, -1);
        else for (let i = 0; i < r.pts.length; i++) { const a = r.pts[i], q = r.pts[(i + 1) % r.pts.length], d = segDist(x, z, a[0], a[1], q[0], q[1]); if (d < best) best = d; }
      }
      return best;
    };
    const bays = []; for (const h of this.homes) if (h.block === b.i) for (const q of h.bays) bays.push(q);
    const drives = b.drives || [];
    b.yardTaken = b.yardTaken || [];
    const ok = (x, z, m = 0.45) => {
      if (x < b.x0 + 1 || x > b.x1 - 1 || z < b.z0 + 1 || z > b.z1 - 1) return false;
      if (this._inBld(b, x, z, m + 0.3)) return false;
      if (rd(x, z) < m + 0.3) return false;
      for (const r of drives) if (x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m) return false;
      for (const q of bays) if (Math.hypot(x - q.x, z - q.z) < 3.4) return false;
      for (const p of b.props) if (Math.hypot(x - p.x, z - p.z) < (p.col && p.col.r ? p.col.r : 0.6) + m + 0.4) return false;
      for (const r of b.yardTaken) if (x > r[0] && x < r[2] && z > r[1] && z < r[3]) return false;
      return true;
    };
    for (const h of homes) {
      const rng = mulberry32(((Math.round(h.x0 * 7.3) * 73856093) ^ (Math.round(h.z0 * 5.1) * 19349663) ^ 0x9e3779b9) >>> 0);
      const f = FACE_V[h.face], ns = h.face < 2, u = ns ? [1, 0] : [0, 1], v = [-f[0], -f[1]];
      const cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2, hw = ns ? (h.x1 - h.x0) / 2 : (h.z1 - h.z0) / 2, hd = ns ? (h.z1 - h.z0) / 2 : (h.x1 - h.x0) / 2;
      const rich = h.type === 'large' || h.type === 'mansion' || h.district === 'u';
      // ---- the back yard: as deep as the ground stays free behind the house (at most 16 m), as wide as the house
      const Fb = { o: [cx + v[0] * hd, cz + v[1] * hd], u, v, y: CURB_H };
      let depth = 0;
      for (let c = 0.6; c < 16; c += 0.5) { let all = true; for (const a of [-hw + 0.5, 0, hw - 0.5]) { const [x, z] = this._yw(Fb, a, c); if (!ok(x, z, 0.2)) { all = false; break; } } if (!all) break; depth = c; }
      if (depth > 3) {
        const extra = Math.min(3, Math.max(0, depth - 8) * 0.5);
        this._dressYard(b, Fb, -hw - extra, hw + extra, 0.6, depth, (x, z) => ok(x, z), rng, rich, depth > 7);
        const [x0, z0] = this._yw(Fb, -hw - extra, 0), [x1, z1] = this._yw(Fb, hw + extra, depth);
        b.yardTaken.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
      }
      // ---- the front: porch posts and a lamp, the house number, flower beds, a path, the bins
      const door = h.inner, Ff = { o: [door.x, door.z], u, v: [f[0], f[1]], y: CURB_H };
      const doorA = (door.x - cx) * u[0] + (door.z - cz) * u[1];
      for (const s of [-1.12, 1.12]) this._ybox(b, Ff, s, 1.62, 0.24, 0.14, 2.36, 0.14, 0xf0eee8, true);
      this._ybox(b, Ff, 0.86, 0.06, 1.8, 0.16, 0.26, 0.1, 0x2a2c30); this._ybox(b, Ff, 0.86, 0.12, 1.84, 0.1, 0.16, 0.05, 0xffe6a0);
      this._ybox(b, Ff, -0.86, 0.06, 1.55, 0.36, 0.16, 0.03, 0x2a2c30); this._ybox(b, Ff, -0.86, 0.075, 1.58, 0.26, 0.08, 0.02, 0xf2f2ee);
      // flower beds along the front wall, either side of the porch, as far as the ground is free
      for (const sd of [-1, 1]) {
        const from = doorA + sd * 1.5, to = sd > 0 ? hw - 0.3 : -hw + 0.3, n = Math.floor(Math.abs(to - from) / 0.6);
        for (let k = 0; k < n; k++) {
          const a = from + sd * (k + 0.5) * 0.6 - doorA, [x, z] = this._yw(Ff, a, 0.55);
          if (!ok(x, z, 0.05)) continue;
          this._ybox(b, Ff, a, 0.55, 0, 0.62, 0.18, 0.8, 0x5a4030);
          this._yblob(b, Ff, a, 0.55, 0.32, 0.26, 0.22, rng() < 0.55 ? FLOWERS[Math.floor(rng() * FLOWERS.length)] : 0x3d6a2c);
        }
      }
      // a path from the porch to the pavement, if it gets there clear of the drive
      let L = 0; for (let t = 1.75; t < 14; t += 0.25) { const [x, z] = this._yw(Ff, 0, t); if (rd(x, z) < 0.05) { L = t - 1.75; break; } let inDrive = false; for (const r of drives) if (x > r.x0 - 0.3 && x < r.x1 + 0.3 && z > r.z0 - 0.3 && z < r.z1 + 0.3) inDrive = true; if (inDrive) break; }
      if (L > 0.5) this._ybox(b, Ff, 0, 1.75 + L / 2, 0, 1.1, 0.03, L, 0xc8c0b0);
      // the bins, by the side of the house away from the garage
      const bs = h.garageRect ? -Math.sign(((h.garageRect.x0 + h.garageRect.x1) / 2 - cx) * u[0] + ((h.garageRect.z0 + h.garageRect.z1) / 2 - cz) * u[1]) || 1 : 1;
      const ba = bs * (hw + 0.6), Fs = { o: [cx, cz], u, v: [f[0], f[1]], y: CURB_H };
      const [bx, bz] = this._yw(Fs, ba, hd - 1.2);
      if (ok(bx, bz, 0.5)) for (const [k, col] of [[0, 0x2e6a3a], [1, 0x2a5aa8]]) { this._ybox(b, Fs, ba + bs * k * 0.7, hd - 1.2, 0, 0.6, 1.0, 0.72, col, true); this._ybox(b, Fs, ba + bs * k * 0.7, hd - 1.2, 1.0, 0.64, 0.06, 0.76, 0x1a1c20); }
    }
  },

  // ---------------------------------------------------------------- the island districts' lots (128): house, villa, cabin
  // L: the lot (centre, u across it, v from the street to the back, W x D); y: its level; house: the house's local
  // rect [a0, c0, a1, c1]; keep: local circles [a, c, r] that stay clear (the car, a tree, the villa's pool)
  _dressLot(b, L, y, kind, house, keep) {
    const rng = mulberry32((L.seed * 2654435761 + 97) >>> 0);
    const loc = (x, z) => [(x - L.x) * L.ux + (z - L.z) * L.uz, (x - L.x) * L.vx + (z - L.z) * L.vz];
    const ok = (x, z) => {
      const [a, c] = loc(x, z);
      if (Math.abs(a) > L.W / 2 - 1.6 || c > L.D / 2 - 1.6 || c < -L.D / 2 + 1) return false;
      if (a > house[0] - 0.8 && a < house[2] + 0.8 && c > house[1] - 0.8 && c < house[3] + 0.8) return false;
      for (const [ka, kc, kr] of keep) if (Math.hypot(a - ka, c - kc) < kr) return false;
      return !this._inBld(b, x, z, 0.6);
    };
    const F = { o: [L.x, L.z], u: [L.ux, L.uz], v: [L.vx, L.vz], y };
    // the yard: behind the house's front, round its sides and back (the front lawn stays a lawn)
    this._dressYard(b, F, -L.W / 2 + 1.6, L.W / 2 - 1.6, house[1] + 1, L.D / 2 - 1.6, ok, rng, kind === 'villa', false);
    // the front: a door, a porch with posts and a lamp, flower beds along the wall, a path and a mailbox at the street
    const fa = (house[0] + house[2]) / 2 + (kind === 'villa' ? 0 : (rng() - 0.5) * 2), fc = house[1];
    const Ff = { o: this._yw(F, fa, fc), u: [-L.ux, -L.uz], v: [-L.vx, -L.vz], y };
    this._ybox(b, Ff, 0, 0.03, 0, kind === 'villa' ? 1.8 : 1.1, 2.3, 0.08, [0x3a2a1e, 0x2a3f5a, 0x7a2a2a, 0x2a4a3a][Math.floor(rng() * 4)]);
    this._ybox(b, Ff, 0, 0.9, 0, 2.6, 0.2, 1.6, 0xd8d2c4);
    this._ybox(b, Ff, 0, 0.95, 2.6, 2.9, 0.12, 1.9, 0x5a5e64);
    for (const s2 of [-1.25, 1.25]) this._ybox(b, Ff, s2, 1.7, 0.2, 0.14, 2.4, 0.14, 0xf0eee8, true);
    this._ybox(b, Ff, 0.9, 0.06, 1.8, 0.16, 0.26, 0.1, 0x2a2c30); this._ybox(b, Ff, 0.9, 0.12, 1.84, 0.1, 0.16, 0.05, 0xffe6a0);
    // (in the lot's frame: the front wall is at c = house[1], the street at c = -D/2)
    for (let aa = house[0] + 0.6; aa < house[2] - 0.3; aa += 0.6) {
      if (Math.abs(aa - fa) < 1.6) continue;
      this._ybox(b, F, aa, fc - 0.55, 0, 0.62, 0.18, 0.8, 0x5a4030); this._yblob(b, F, aa, fc - 0.55, 0.32, 0.26, 0.22, rng() < 0.55 ? FLOWERS[Math.floor(rng() * FLOWERS.length)] : 0x3d6a2c);
    }
    const p0 = fc - 1.7, p1 = -L.D / 2 + 0.6;
    if (p0 - p1 > 1.5) this._ybox(b, F, fa, (p0 + p1) / 2, 0, 1.1, 0.03, p0 - p1, 0xc8c0b0);
    const [mx, mz] = this._yw(F, fa - 1.4, -L.D / 2 + 1.2);
    this._det(b, 'box', mx, y + 0.6, mz, 0.1, 1.2, 0.1, C(0x4a4e54)); this._det(b, 'box', mx, y + 1.25, mz, Math.abs(L.ux) ? 0.5 : 0.25, 0.28, Math.abs(L.ux) ? 0.25 : 0.5, C([0x2a3f5a, 0x3a3d42, 0x7a2a22][Math.floor(rng() * 3)]));
  },

  // ---------------------------------------------------------------- the streets: stop signs, manholes, drains
  _stopSign(b, x, y, z, tx, tz, name) {
    // a post on the verge, the octagon facing the traffic that has to stop, a street-name blade on top
    this._det(b, 'cylr', x, y + 1.25, z, 0.04, 2.5, 0.04, C(0x8a8e92), 0, { x, z, r: 0.08, y0: y, y1: y + 2.5, kind: 'det' });
    const fx = -tx, fz = -tz, ry = Math.atan2(fx, fz);
    // the octagon: a white rim behind the red face, and the white word as a band of four letters
    const s = this._det(b, 'cyl8', x + fx * 0.05, y + 2.15, z + fz * 0.05, 0.4, 0.03, 0.4, C(0xf2f2ee)); s.rx = Math.PI / 2; s.ry = ry;
    const r = this._det(b, 'cyl8', x + fx * 0.07, y + 2.15, z + fz * 0.07, 0.36, 0.03, 0.36, C(0xc8102e)); r.rx = Math.PI / 2; r.ry = ry;
    const lx = Math.cos(ry), lz = -Math.sin(ry);
    for (let i = 0; i < 4; i++) { const o = (i - 1.5) * 0.13; this._det(b, 'box', x + fx * 0.09 + lx * o, y + 2.15, z + fz * 0.09 + lz * o, 0.08, 0.13, 0.01, C(0xf2f2ee), ry); }
    if (name) { this._det(b, 'box', x, y + 2.68, z, 1.3, 0.2, 0.03, C(0x1c6b3a), ry + Math.PI / 2); this._det(b, 'box', x, y + 2.68, z, 0.04, 0.16, 1.24, C(0xe8f2e8), ry + Math.PI / 2); }
  },
  // b: the block (or a superblock's first member) that laid the roads from `from` on; M: the blocks it spans. Each
  // piece goes to the block it stands in (a superblock's members stream on their own)
  _dressStreets(b, from, M) {
    const roads = this.localRoads.slice(from).filter(r => r.k === 'line' && r.st === 'asphalt' && r.w >= 5);
    const E = { x0: Math.min(...M.map(q => q.x0)), z0: Math.min(...M.map(q => q.z0)), x1: Math.max(...M.map(q => q.x1)), z1: Math.max(...M.map(q => q.z1)) };
    const at = (x, z) => M.reduce((m, q) => Math.hypot(q.cx - x, q.cz - z) < Math.hypot(m.cx - x, m.cz - z) ? q : m);
    const clear = (x, z) => M.every(q => !this._inBld(q, x, z, 0.6) && !(q.drives || []).some(r => x > r.x0 - 0.5 && x < r.x1 + 0.5 && z > r.z0 - 0.5 && z < r.z1 + 0.5));
    for (const R of roads) {
      const P = R.pts, n = P.length;
      // a stop sign where the street meets the block's edge streets (the right-hand verge, 3 m short of the junction)
      for (const [e, pr] of [[P[0], P[1]], [P[n - 1], P[n - 2]]]) {
        const edge = Math.min(Math.abs(e[0] - E.x0), Math.abs(e[0] - E.x1), Math.abs(e[1] - E.z0), Math.abs(e[1] - E.z1));
        if (edge > 4) continue;
        const l = Math.hypot(e[0] - pr[0], e[1] - pr[1]) || 1, tx = (e[0] - pr[0]) / l, tz = (e[1] - pr[1]) / l;
        for (const side of [1, -1]) {
          const x = e[0] - tx * 3 + -tz * side * (R.w / 2 + 0.9), z = e[1] - tz * 3 + tx * side * (R.w / 2 + 0.9);
          if (!clear(x, z)) continue;
          this._stopSign(at(x, z), x, CURB_H, z, tx, tz, true); break;
        }
      }
      // manhole covers down the middle, drains at the kerb
      let acc = 0, k = 0;
      for (let i = 0; i < n - 1; i++) {
        const a = P[i], q = P[i + 1], l = Math.hypot(q[0] - a[0], q[1] - a[1]); if (l < 0.01) continue;
        const tx = (q[0] - a[0]) / l, tz = (q[1] - a[1]) / l;
        for (let s = (18 - acc % 18 + 18) % 18; s < l; s += 18) {
          const x = a[0] + tx * s, z = a[1] + tz * s; k++;
          const q = at(x, z);
          if (k % 2) this._det(q, 'disc', x + -tz * 0.9, CURB_H + 0.014, z + tx * 0.9, 0.36, 1, 0.36, C(0x3a3c40));
          else { const sd = (k / 2) % 2 ? 1 : -1, ry = Math.atan2(tx, tz); this._det(q, 'box', x + -tz * sd * (R.w / 2 - 0.35), CURB_H + 0.012, z + tx * sd * (R.w / 2 - 0.35), 0.4, 0.02, 0.9, C(0x2a2c30), ry); }
        }
        acc += l;
      }
    }
  }
});
