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

