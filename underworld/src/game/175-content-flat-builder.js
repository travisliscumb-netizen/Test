/* =====================================================================
   [CONTENT] FLAT GROUND GEOMETRY
   FlatBuilder: flat, vertex-coloured quads merged into one mesh (the
   tracks' ground, kerbs, paint and paddocks: 126, 129b, 176). It was
   Valen Point's (Session 6B) until that district closed (2026-11-18).
   ===================================================================== */
class FlatBuilder {
  constructor() { this.p = []; this.c = []; }
  quad(a, b, c2, d, y, col) {
    const cc = new THREE.Color(col);
    for (const q of [a, b, c2, a, c2, d]) { this.p.push(q[0], y, q[1]); this.c.push(cc.r, cc.g, cc.b); }
  }
  rect(x0, z0, x1, z1, y, col) { this.quad([x0, z0], [x0, z1], [x1, z1], [x1, z0], y, col); }
  // a strip along a centreline between signed offsets o1 < o2 (along the left normal), sample k to k+1
  strip(pts, nl, k0, k1, o1, o2, y, col, closed) {
    const n = pts.length;
    for (let k = k0; k < k1; k++) {
      const a = k % n, b = (k + 1) % n; if (!closed && b === 0) break;
      const A = pts[a], B = pts[b], na = nl[a], nb = nl[b];
      const c = typeof col === 'function' ? col(a) : col; if (c === null) continue;
      const O1 = typeof o1 === 'function' ? o1(a) : o1, O2 = typeof o2 === 'function' ? o2(a) : o2;
      this.quad([A[0] + na[0] * O1, A[1] + na[1] * O1], [A[0] + na[0] * O2, A[1] + na[1] * O2], [B[0] + nb[0] * O2, B[1] + nb[1] * O2], [B[0] + nb[0] * O1, B[1] + nb[1] * O1], y, c);
    }
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    const nrm = new Float32Array(this.p.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true;
    return m;
  }
}
// normals for an open polyline
// normals for an open polyline
function lineNormals(pts) { return pts.map((p, k) => { const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dz / l, -dx / l]; }); }
