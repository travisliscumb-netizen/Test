/* =====================================================================
   [CORE] GEOMETRY BUILDER (merges transformed templates into one BufferGeometry)
   ===================================================================== */
const _m4 = new THREE.Matrix4(), _nm3 = new THREE.Matrix3(), _q = new THREE.Quaternion(), _eu = new THREE.Euler();
const _vs = new THREE.Vector3(), _vp = new THREE.Vector3(), _v3a = new THREE.Vector3();
function M(x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) {
  _eu.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_eu);
  return _m4.compose(_vp.set(x, y, z), _q, _vs.set(sx, sy, sz));
}
function templateFrom(geo) {
  const g = geo.index ? geo : geo;
  return {
    pos: g.attributes.position.array, nor: g.attributes.normal.array,
    uv: g.attributes.uv ? g.attributes.uv.array : null,
    idx: g.index ? g.index.array : null, count: g.attributes.position.count
  };
}
function prismGeometry() {
  // gable roof: ridge along x, base -0.5..0.5 in x & z at y=0, ridge at y=1, z=0
  const g = new THREE.BufferGeometry();
  const v = [
    // slope +z
    -.5, 0, .5, .5, 0, .5, .5, 1, 0, -.5, 0, .5, .5, 1, 0, -.5, 1, 0,
    // slope -z
    .5, 0, -.5, -.5, 0, -.5, -.5, 1, 0, .5, 0, -.5, -.5, 1, 0, .5, 1, 0,
    // gable ends
    .5, 0, .5, .5, 0, -.5, .5, 1, 0,
    -.5, 0, -.5, -.5, 0, .5, -.5, 1, 0
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}
// a lumpy clump of leaves: an icosphere pushed in and out by smooth position noise, its normals half way between
// the facets and the sphere's, so a canopy of them reads soft but not blobby (G3)
function blobGeometry(detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position;
  const bump = (x, y, z) => 1 + 0.17 * Math.sin(3.1 * x + 1.7 * y + 0.4) * Math.cos(2.3 * z + 0.9 * x) + 0.09 * Math.sin(5.3 * y + 2.1 * z + 1.3) - 0.05 * Math.cos(4.1 * x - 3.7 * z);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = bump(x, y, z); p.setXYZ(i, x * k, y * k * 0.92, z * k); }
  g.computeVertexNormals();
  const n = g.attributes.normal, v = new THREE.Vector3(), r = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { r.set(p.getX(i), p.getY(i), p.getZ(i)).normalize(); v.set(n.getX(i), n.getY(i), n.getZ(i)).multiplyScalar(0.45).addScaledVector(r, 0.55).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
  return g;
}
// one tier of a fir: a cone whose rim zig-zags in and out, so a stack of them looks like boughs (G3)
function firTierGeometry() {
  const g = new THREE.CylinderGeometry(0, 1, 1, 12, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), x = p.getX(i), z = p.getZ(i); if (y < 0 && Math.hypot(x, z) > 0.5) { const a = Math.atan2(z, x), k = 0.8 + 0.2 * Math.round((Math.sin(a * 6) + 1) / 2); p.setXYZ(i, x * k, y - (1 - k) * 0.6, z * k); } }
  g.computeVertexNormals();
  return g;
}
const TPL = {};
function initTemplates() {
  TPL.box = templateFrom(new THREE.BoxGeometry(1, 1, 1));
  TPL.cyl = templateFrom(new THREE.CylinderGeometry(1, 1, 1, 12));
  TPL.cyl6 = templateFrom(new THREE.CylinderGeometry(1, 1, 1, 6));
  TPL.cone = templateFrom(new THREE.CylinderGeometry(0, 1, 1, 8));
  TPL.sphere = templateFrom(new THREE.IcosahedronGeometry(1, 1));
  TPL.sphere0 = templateFrom(new THREE.IcosahedronGeometry(1, 0));
  TPL.prism = templateFrom(prismGeometry());
  TPL.plane = templateFrom(new THREE.PlaneGeometry(1, 1));
  TPL.disc = templateFrom(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2));
  TPL.blob = templateFrom(blobGeometry(1));
  TPL.fir = templateFrom(firTierGeometry());
}
class GeoBuilder {
  constructor(opts = {}) {
    this.pos = []; this.nor = []; this.col = []; this.idx = []; this.uv = opts.uv ? [] : null;
    this.b = opts.bld ? [] : null; this.o = opts.bld ? [] : null; this.part = opts.part ? [] : null;
    this.n = 0;
  }
  add(t, m, color, extra) {
    _nm3.getNormalMatrix(m);
    const e = m.elements, base = this.n;
    const r = color ? color.r : 1, g = color ? color.g : 1, b = color ? color.b : 1;
    for (let i = 0; i < t.count; i++) {
      const x = t.pos[i * 3], y = t.pos[i * 3 + 1], z = t.pos[i * 3 + 2];
      this.pos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
      _v3a.set(t.nor[i * 3], t.nor[i * 3 + 1], t.nor[i * 3 + 2]).applyMatrix3(_nm3).normalize();
      this.nor.push(_v3a.x, _v3a.y, _v3a.z);
      this.col.push(r, g, b);
      if (this.uv) { if (extra && extra.uv) { const uv = extra.uv; this.uv.push(uv[0] + t.uv[i * 2] * uv[2], uv[1] + t.uv[i * 2 + 1] * uv[3]); } else this.uv.push(t.uv ? t.uv[i * 2] : 0, t.uv ? t.uv[i * 2 + 1] : 0); }
      if (this.b) { const B = extra.b, O = extra.o; this.b.push(B[0], B[1], B[2], B[3]); this.o.push(O[0], O[1], O[2], O[3]); }
      if (this.part) this.part.push(extra && extra.part !== undefined ? extra.part : 0);
    }
    if (t.idx) for (let i = 0; i < t.idx.length; i++) this.idx.push(base + t.idx[i]);
    else for (let i = 0; i < t.count; i++) this.idx.push(base + i);
    this.n += t.count;
  }
  box(x, y, z, w, h, d, color, ry = 0, extra) { this.add(TPL.box, M(x, y, z, w, h, d, ry), color, extra); }
  cyl(x, y, z, r, h, color, extra, tpl = TPL.cyl) { this.add(tpl, M(x, y, z, r, h, r), color, extra); }
  get empty() { return this.n === 0; }
  // bake shading into the vertex colours added since vertex `from`: fn(x, y, z) returns a multiplier (G3: canopy
  // depth, leaf undersides, the dark foot of a wall)
  shade(from, fn) { for (let i = from; i < this.n; i++) { const k = fn(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]); this.col[i * 3] *= k; this.col[i * 3 + 1] *= k; this.col[i * 3 + 2] *= k; } }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.b) { g.setAttribute('aB', new THREE.Float32BufferAttribute(this.b, 4)); g.setAttribute('aO', new THREE.Float32BufferAttribute(this.o, 4)); }
    if (this.part) g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
const C = hex => new THREE.Color(hex);

