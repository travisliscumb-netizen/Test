/* =====================================================================
   [CORE] STATIC COLLISION GRID (boxes + vertical cylinders, DDA raycasts)
   ===================================================================== */
class CollisionGrid {
  constructor() {
    // the city square, east of it out to Valen Point (Session 6B) and south to Cedar Fields South (Session 6C): dimX × dim cells
    this.cs = 16; this.min = -48; this.dim = Math.ceil((WORLD_Z1 + 48 - this.min) / this.cs); this.dimX = Math.ceil((WORLD_X1 + 48 - this.min) / this.cs);
    this.cells = Array.from({ length: this.dimX * this.dim }, () => []);
    this.all = []; this.stamp = 1;
  }
  _ci(x) { return clamp(Math.floor((x - this.min) / this.cs), 0, this.dimX - 1); }
  _cj(z) { return clamp(Math.floor((z - this.min) / this.cs), 0, this.dim - 1); }
  add(c) {
    c.stamp = 0; c.on = true;
    let x0, z0, x1, z1;
    if (c.r !== undefined) { x0 = c.x - c.r; x1 = c.x + c.r; z0 = c.z - c.r; z1 = c.z + c.r; }
    else { x0 = c.x0; x1 = c.x1; z0 = c.z0; z1 = c.z1; }
    for (let i = this._ci(x0); i <= this._ci(x1); i++) for (let j = this._cj(z0); j <= this._cj(z1); j++) this.cells[j * this.dimX + i].push(c);
    this.all.push(c);
    return c;
  }
  remove(c) {
    if (!c) return;
    let x0, z0, x1, z1;
    if (c.r !== undefined) { x0 = c.x - c.r; x1 = c.x + c.r; z0 = c.z - c.r; z1 = c.z + c.r; } else { x0 = c.x0; x1 = c.x1; z0 = c.z0; z1 = c.z1; }
    for (let i = this._ci(x0); i <= this._ci(x1); i++) for (let j = this._cj(z0); j <= this._cj(z1); j++) { const cell = this.cells[j * this.dimX + i], k = cell.indexOf(c); if (k >= 0) cell.splice(k, 1); }
    const k = this.all.indexOf(c); if (k >= 0) this.all.splice(k, 1);
    c.on = false;
  }
  query(x0, z0, x1, z1, out) {
    out.length = 0; const st = ++this.stamp;
    for (let i = this._ci(x0); i <= this._ci(x1); i++) for (let j = this._cj(z0); j <= this._cj(z1); j++) {
      const cell = this.cells[j * this.dimX + i];
      for (let k = 0; k < cell.length; k++) { const c = cell[k]; if (c.stamp !== st && c.on) { c.stamp = st; out.push(c); } }
    }
    return out;
  }
  // resolve a circle (x,z,r) at height range [y0,y1] against static geometry; returns push vector and normal
  resolveCircle(x, z, r, y0, y1, res) {
    const list = this.query(x - r, z - r, x + r, z + r, this._tmp || (this._tmp = []));
    res.x = x; res.z = z; res.hit = false; res.nx = 0; res.nz = 0; res.col = null; res.depth = 0;
    for (let iter = 0; iter < 2; iter++) {
      for (const c of list) {
        if (y1 < c.y0 || y0 > c.y1) continue;
        let nx, nz, d;
        if (c.r !== undefined) {
          const dx = res.x - c.x, dz = res.z - c.z; const l = Math.hypot(dx, dz); const rr = r + c.r;
          if (l >= rr) continue;
          if (l < 1e-5) { nx = 1; nz = 0; } else { nx = dx / l; nz = dz / l; }
          d = rr - l;
        } else {
          const cx = clamp(res.x, c.x0, c.x1), cz = clamp(res.z, c.z0, c.z1);
          const dx = res.x - cx, dz = res.z - cz; const l2 = dx * dx + dz * dz;
          if (l2 >= r * r) continue;
          if (l2 > 1e-8) { const l = Math.sqrt(l2); nx = dx / l; nz = dz / l; d = r - l; }
          else { // centre inside the box: push out along the smallest axis
            const pl = res.x - c.x0, pr = c.x1 - res.x, pt = res.z - c.z0, pb = c.z1 - res.z;
            const m = Math.min(pl, pr, pt, pb);
            if (m === pl) { nx = -1; nz = 0; d = pl + r; } else if (m === pr) { nx = 1; nz = 0; d = pr + r; }
            else if (m === pt) { nx = 0; nz = -1; d = pt + r; } else { nx = 0; nz = 1; d = pb + r; }
          }
        }
        res.x += nx * d; res.z += nz * d; res.hit = true;
        if (d > res.depth) { res.depth = d; res.nx = nx; res.nz = nz; res.col = c; }
      }
    }
    return res;
  }
  // 3D raycast. returns {t, nx, ny, nz, col} or null
  // see: skip see-through colliders (showroom glass) for the camera and sight lines
  raycast(ox, oy, oz, dx, dy, dz, maxT, ignoreLow = 0, see = false) {
    const st = ++this.stamp; let best = maxT, hit = null;
    const cs = this.cs;
    let ix = Math.floor((ox - this.min) / cs), iz = Math.floor((oz - this.min) / cs);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-9 ? Math.abs(cs / dx) : Infinity, tdz = Math.abs(dz) > 1e-9 ? Math.abs(cs / dz) : Infinity;
    let tmx = Math.abs(dx) > 1e-9 ? ((this.min + (ix + (sx > 0 ? 1 : 0)) * cs) - ox) / dx : Infinity;
    let tmz = Math.abs(dz) > 1e-9 ? ((this.min + (iz + (sz > 0 ? 1 : 0)) * cs) - oz) / dz : Infinity;
    let tCell = 0;
    for (let steps = 0; steps < 64 && tCell <= best; steps++) {
      if (ix >= 0 && iz >= 0 && ix < this.dimX && iz < this.dim) {
        const cell = this.cells[iz * this.dimX + ix];
        for (let k = 0; k < cell.length; k++) {
          const c = cell[k]; if (c.stamp === st || !c.on || (see && c.see)) continue; c.stamp = st;
          // low clutter is skipped; interior colliders measure height from their own floor
          if ((c.base !== undefined ? c.y1 - c.base : c.kind === 'int' ? c.y1 - IY : c.kind === 'vint' ? c.y1 - VY : c.y1) < ignoreLow) continue;
          if (c.r !== undefined) {
            const fx = ox - c.x, fz = oz - c.z;
            const a = dx * dx + dz * dz; if (a < 1e-9) continue;
            const b = fx * dx + fz * dz, cc = fx * fx + fz * fz - c.r * c.r;
            const disc = b * b - a * cc; if (disc < 0) continue;
            const t = (-b - Math.sqrt(disc)) / a;
            if (t < 0 || t >= best) continue;
            const y = oy + dy * t; if (y < c.y0 || y > c.y1) continue;
            best = t; const hx = ox + dx * t - c.x, hz = oz + dz * t - c.z, l = Math.hypot(hx, hz) || 1;
            hit = { t, nx: hx / l, ny: 0, nz: hz / l, col: c };
          } else {
            let t0 = 0, t1 = best, nx = 0, ny = 0, nz = 0, ok = true;
            const ax = [[ox, dx, c.x0, c.x1, 0], [oy, dy, c.y0, c.y1, 1], [oz, dz, c.z0, c.z1, 2]];
            for (const [o, d, lo, hi, axis] of ax) {
              if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } continue; }
              let ta = (lo - o) / d, tb = (hi - o) / d, sgn = -1;
              if (ta > tb) { const tt = ta; ta = tb; tb = tt; sgn = 1; }
              if (ta > t0) { t0 = ta; nx = axis === 0 ? sgn : 0; ny = axis === 1 ? sgn : 0; nz = axis === 2 ? sgn : 0; }
              if (tb < t1) t1 = tb;
              if (t0 > t1) { ok = false; break; }
            }
            if (!ok || t0 <= 0 || t0 >= best) continue;
            best = t0; hit = { t: t0, nx, ny, nz, col: c };
          }
        }
      }
      if (tmx < tmz) { tCell = tmx; tmx += tdx; ix += sx; } else { tCell = tmz; tmz += tdz; iz += sz; }
    }
    return hit;
  }
  // nothing solid between two points: no collider (glass hides nothing) and, on the Cedar Fields terrain (Session 6C),
  // no hill or ridge rising through the sight line
  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az; const l = Math.hypot(dx, dy, dz);
    if (l < 0.01) return true;
    if (this.raycast(ax, ay, az, dx / l, dy / l, dz / l, l - 0.3, 1.2, true)) return false;
    return !Terrain.occludes(ax, ay, az, bx, by, bz);
  }
}

