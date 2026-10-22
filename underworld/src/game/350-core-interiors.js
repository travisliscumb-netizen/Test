/* =====================================================================
   [CORE+CONTENT] INTERIORS
   Rooms are built from a tiny box kit with baked face shading and floor
   AO into one vertex-coloured mesh (plus one emissive mesh for lamps and
   screens). They live 60 m below the building they belong to, so the
   street keeps simulating around you, police lose sight of you, and the
   minimap still shows where you are. Colliders sit in the world grid at
   that depth and never touch street-level physics.
   ===================================================================== */
const IY = -60;
const KIT_FACES = [
  [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1], 0.8],
  [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1], 0.76],
  [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1], 1.0],
  [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], 0.55],
  [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], 0.9],
  [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1], 0.86]
];
class InteriorKit {
  constructor(h) { this.H = h; this.a = { p: [], c: [], i: [] }; this.g = { p: [], c: [], i: [] }; this.cols = []; this._c = new THREE.Color(); }
  // x,z: centre; y: bottom; w,h,d: size. opt.col adds a collider, opt.glow puts it in the emissive mesh.
  box(x, y, z, w, h, d, color, opt = {}) {
    const t = opt.glow ? this.g : this.a, c = this._c.set(color);
    if (opt.glow) c.multiplyScalar(opt.glow);
    const base = t.p.length / 3, hx = w / 2, hz = d / 2, H = this.H;
    for (const f of KIT_FACES) {
      const sh = opt.glow ? 1 : f[4];
      for (let k = 0; k < 4; k++) {
        const s = f[k], vx = x + s[0] * hx, vy = y + (s[1] > 0 ? h : 0), vz = z + s[2] * hz;
        let ao = 1;
        if (!opt.glow && !opt.flat) ao = (0.62 + 0.38 * smoothstep(0, 1.3, vy)) * (1 - 0.14 * smoothstep(H - 0.9, H, vy));
        t.p.push(vx, vy, vz); t.c.push(c.r * sh * ao, c.g * sh * ao, c.b * sh * ao);
      }
    }
    for (let q = 0; q < 6; q++) { const o = base + q * 4; t.i.push(o, o + 1, o + 2, o, o + 2, o + 3); }
    if (opt.col) this.cols.push({ x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz, y0: y, y1: y + h });
  }
  glow(x, y, z, w, h, d, color, k = 2.2) { this.box(x, y, z, w, h, d, color, { glow: k }); }
  // closed room: floor, ceiling, four walls (with colliders), skirting and a ceiling light grid
  room(w, d, h, o) {
    this.box(0, -0.25, 0, w + 0.8, 0.25, d + 0.8, o.floor, { flat: true });
    this.box(0, h, 0, w + 0.8, 0.25, d + 0.8, o.ceil, { flat: true });
    const t = 0.3;
    this.box(0, 0, -d / 2 - t / 2, w + 2 * t, h, t, o.wall, { col: true });
    this.box(0, 0, d / 2 + t / 2, w + 2 * t, h, t, o.wall, { col: true });
    this.box(-w / 2 - t / 2, 0, 0, t, h, d, o.wall2 || o.wall, { col: true });
    this.box(w / 2 + t / 2, 0, 0, t, h, d, o.wall2 || o.wall, { col: true });
    this.cols.push({ x0: -w / 2 - 1, x1: w / 2 + 1, z0: -d / 2 - 1, z1: d / 2 + 1, y0: h, y1: h + 1 });
    const sk = o.trim || 0x2a2622;
    this.box(0, 0, -d / 2 + 0.03, w, 0.12, 0.06, sk); this.box(0, 0, d / 2 - 0.03, w, 0.12, 0.06, sk);
    this.box(-w / 2 + 0.03, 0, 0, 0.06, 0.12, d, sk); this.box(w / 2 - 0.03, 0, 0, 0.06, 0.12, d, sk);
    if (o.band) { this.box(0, o.band[0], -d / 2 + 0.02, w, o.band[1], 0.04, o.bandC); this.box(0, o.band[0], d / 2 - 0.02, w, o.band[1], 0.04, o.bandC); this.box(-w / 2 + 0.02, o.band[0], 0, 0.04, o.band[1], d, o.bandC); this.box(w / 2 - 0.02, o.band[0], 0, 0.04, o.band[1], d, o.bandC); }
    const nl = o.lights || [2, 2];
    for (let i = 0; i < nl[0]; i++) for (let j = 0; j < nl[1]; j++) {
      const lx = (i + 0.5) / nl[0] * w - w / 2, lz = (j + 0.5) / nl[1] * d - d / 2;
      this.box(lx, h - 0.06, lz, 1.3, 0.06, 0.5, 0xd8d8d8);
      this.glow(lx, h - 0.08, lz, 1.15, 0.03, 0.38, o.lightC || 0xfff1d6, 2.6);
    }
  }
  planks(w, d, c1, c2, n = 14) { for (let k = 0; k < n; k++) this.box(-w / 2 + (k + 0.5) * w / n, -0.01, 0, w / n - 0.02, 0.012, d, k % 2 ? c1 : c2, { flat: true }); }
  tiles(w, d, c1, c2, s = 1) {
    const nx = Math.floor(w / s), nz = Math.floor(d / s);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) if ((i + j) % 2) this.box(-w / 2 + (i + 0.5) * s, -0.008, -d / 2 + (j + 0.5) * s, s - 0.03, 0.01, s - 0.03, c2, { flat: true });
    void c1;
  }
  door(x, z, ry, color = 0x3a2a1e, label = 0x46d4c4) {
    // ry 0: door on the +z wall; PI: on the -z wall; ±PI/2: on the x walls
    const sx = Math.abs(Math.sin(ry)) > 0.5, w = 1.15;
    const dx = sx ? 0.08 : w, dz = sx ? w : 0.08;
    this.box(x, 0, z, dx + (sx ? 0 : 0.24), 2.32, dz + (sx ? 0.24 : 0), 0x1d1a17);
    this.box(x, 0, z, dx, 2.15, dz, color);
    this.glow(x, 2.42, z, sx ? 0.06 : 0.6, 0.2, sx ? 0.6 : 0.06, label, 2.6);
  }
  shelfUnit(x, z, w, d, h, rows, rng, palette) {
    this.box(x, 0, z, w, h, d, 0x5c5e62, { col: true });
    for (let r = 0; r < rows; r++) {
      const y = 0.25 + r * (h - 0.3) / rows;
      this.box(x, y, z, w + 0.04, 0.04, d + 0.04, 0x8c9096);
      const n = Math.floor(w / 0.3);
      for (let k = 0; k < n; k++) {
        if (rng() < 0.12) continue;
        const bh = 0.18 + rng() * 0.2, bw = 0.22;
        for (const s of [-1, 1]) this.box(x - w / 2 + (k + 0.5) * w / n, y + 0.04, z + s * (d / 2 - 0.12), bw, bh, 0.2, palette[Math.floor(rng() * palette.length)]);
      }
    }
  }
  crate(x, z, s, color, stack = 1) { for (let k = 0; k < stack; k++) this.box(x, k * s, z, s, s * 0.98, s, k % 2 ? color : new THREE.Color(color).multiplyScalar(0.85).getHex(), { col: k === 0 }); }
  build() {
    const mk = (t, mat) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(t.p, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(t.c, 3));
      geo.setIndex(t.i); geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return m;
    };
    return { main: mk(this.a, INT_MAT()), glow: this.g.p.length ? mk(this.g, INT_GLOW()) : null };
  }
}
let _intMat = null, _intGlow = null;
function INT_MAT() { return _intMat || (_intMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })); }
function INT_GLOW() { return _intGlow || (_intGlow = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })); }

// skyline used behind interior windows: sky gradient plane + silhouette plane + lit-window plane
function makeSkylineTextures() {
  const W = 1024, H = 256;
  const sil = document.createElement('canvas'); sil.width = W; sil.height = H;
  const lit = document.createElement('canvas'); lit.width = W; lit.height = H;
  const a = sil.getContext('2d'), b = lit.getContext('2d');
  const rng = mulberry32(77);
  let x = 0;
  while (x < W) {
    const w = 30 + rng() * 70, h = 50 + rng() * 170 * (0.4 + 0.6 * Math.sin(x / W * Math.PI));
    a.fillStyle = `rgb(${18 + rng() * 14},${22 + rng() * 14},${30 + rng() * 16})`;
    a.fillRect(x, H - h, w, h);
    for (let wy = H - h + 6; wy < H - 4; wy += 7) for (let wx = x + 4; wx < x + w - 4; wx += 6) {
      if (rng() < 0.42) { b.fillStyle = rng() < 0.85 ? 'rgba(255,214,150,0.95)' : 'rgba(170,210,255,0.95)'; b.fillRect(wx, wy, 3, 3); }
    }
    x += w + rng() * 6;
  }
  const t1 = new THREE.CanvasTexture(sil), t2 = new THREE.CanvasTexture(lit);
  t1.colorSpace = t2.colorSpace = THREE.SRGBColorSpace;
  return { sil: t1, lit: t2 };
}

const OUTFITS = {
  shirt: [0x26323f, 0x8a2f3a, 0x2f5d8a, 0x3a7a4a, 0xd8d0c0, 0x22262c, 0xc9822a, 0x6a3a8a, 0x2a8a8a, 0xe8e8e8, 0xb3402a, 0xf2c94c],
  pants: [0x2b3448, 0x2a2a2e, 0x4a3a2a, 0x6a6a6a, 0x1e3a5a, 0xb8ab90, 0x3a3a46, 0x5a4a3a],
  cap: [-1, 0x111111, 0xd35400, 0x1d4f8a, 0x8a2f3a, 0xe8e8e8, 0x3a7a4a],
  shoes: [0x151515, 0xe8e8e8, 0x6a2a1a, 0x3a2a1a],
  hair: [0x1a1410, 0x5a3a22, 0xc9a66b, 0x6a6a6a, 0x7a2e1a]
};

// Fuel & Go: the shop at the front (aisles, drinks fridges, the counter and the Lucky Pump), a locked
// staff door behind the counter, and the back: an office (desk, CCTV, the safe) and a stockroom.
// Every station uses this layout; each has its own interior under its own building.
function storeInteriorDef(id, name) {
  return {
    name, place: id, w: 12, d: 11, h: 3.2, exit: { x: -3.5, z: 4.6 }, spawnH: Math.PI, store: true,
    build(k, rng, def) {
      const W = 12, D = 11, hw = W / 2, hd = D / 2;
      k.room(W, D, 3.2, { floor: 0xd9d6cf, wall: 0xe8e4da, ceil: 0xf4f2ee, trim: 0xd23a2a, band: [2.5, 0.35], bandC: 0xd23a2a, lights: [3, 3], lightC: 0xf4fbff });
      k.tiles(W, D, 0xd9d6cf, 0xbdb9b0, 0.5);
      k.door(-3.5, hd - 0.02, 0, 0x9ab4c4, 0x7fe08f);
      const pal = [0xd23a2a, 0xf2c230, 0x2a5f9e, 0x3a7a4a, 0xe67e22, 0x8e44ad, 0xecf0f1, 0x1abc9c];
      // partition between the shop and the back, with the staff door behind the counter
      iwall(k, 'x', -1.8, -hw, hw, 0, 3.2, 0xe0dcd2, [[2.6, 3.8]]);
      iwall(k, 'z', 0, -hd, -1.8, 0, 3.2, 0xd8d4ca, [[-3.6, -2.6]]);
      // the staff door itself: a collider that the robbery opens (its panel is a separate mesh)
      def.staffCol = k.cols.length; k.cols.push({ x0: 2.6, x1: 3.8, z0: -1.9, z1: -1.7, y0: 0, y1: 2.3 });
      k.box(3.2, 2.35, -1.7, 1.3, 0.22, 0.04, 0xd23a2a); k.glow(3.2, 2.38, -1.67, 1.1, 0.14, 0.01, 0xffffff, 1.6);
      // shop: two aisles, drinks fridges against the partition, the counter, snacks, the slot cabinet
      k.shelfUnit(-1.9, 1.7, 0.7, 3.4, 1.6, 3, rng, pal); k.shelfUnit(0.5, 1.7, 0.7, 3.4, 1.6, 3, rng, pal);
      for (let i = 0; i < 3; i++) {
        const x = -5.2 + i * 1.3;
        k.box(x, 0, -1.4, 1.2, 2.2, 0.7, 0xdfe3e6, { col: true }); k.glow(x, 0.15, -1.04, 1.05, 1.95, 0.02, 0xcfe8ff, 1.25);
        for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) k.box(x - 0.45 + c * 0.18, 0.25 + r * 0.38, -1.06, 0.1, 0.24, 0.02, pal[(r + c + i) % pal.length]);
      }
      k.box(3.6, 0, 2.6, 2.8, 1.0, 0.8, 0xd23a2a, { col: true }); k.box(3.6, 1.0, 2.6, 2.9, 0.05, 0.9, 0xe8e4da);
      k.box(2.7, 1.05, 2.6, 0.45, 0.3, 0.38, 0x2a2a2e); k.glow(2.7, 1.2, 2.82, 0.3, 0.12, 0.02, 0x7fe08f, 1.6);
      k.box(4.6, 1.05, 2.6, 0.7, 0.45, 0.3, 0x2a5f9e); for (let i = 0; i < 5; i++) k.box(4.32 + i * 0.14, 1.12, 2.76, 0.1, 0.32, 0.01, pal[i]);
      k.box(hw - 0.3, 0, 0.0, 0.5, 1.9, 2.4, 0x5c5e62, { col: true });
      for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) k.box(hw - 0.56, 0.3 + r * 0.42, -1.0 + c * 0.38, 0.04, 0.3, 0.3, pal[(r * 3 + c) % pal.length]);
      k.glow(3.6, 2.2, hd - 0.04, 2.4, 0.5, 0.03, 0xd23a2a, 1.4);
      k.box(-5.6, 0, 2.4, 0.7, 1.72, 0.9, 0x3a1a4a, { col: true }); k.box(-5.6, 0.7, 2.4, 0.78, 0.06, 0.94, 0xd8a227);
      k.glow(-5.6, 1.74, 2.4, 0.62, 0.32, 0.86, 0xffd84d, 1.9); k.glow(-5.245, 0.95, 2.4, 0.02, 0.52, 0.76, 0x1a0e24, 1);
      for (let i = 0; i < 3; i++) k.glow(-5.23, 1.04, 2.16 + i * 0.24, 0.02, 0.32, 0.2, 0xf4f2ee, 1.5);
      k.glow(-5.23, 1.42, 2.4, 0.02, 0.08, 0.7, 0xff4d5e, 2.2); k.box(-5.5, 0.95, 2.88, 0.06, 0.62, 0.06, 0xb0b0b0); k.box(-5.5, 1.57, 2.88, 0.15, 0.15, 0.15, 0xd23a2a);
      // back office: desk, chair, CCTV monitors, the safe
      FURN.desk(k, 3.0, 0, -4.9, 0, 1.4, false, 0x5a5e62); k.box(2.7, 0.74, -5.05, 0.5, 0.35, 0.05, 0x111111); k.glow(2.7, 0.78, -5.02, 0.44, 0.28, 0.01, 0x6a9a7a, 1.2);
      k.box(3.4, 0.74, -5.05, 0.5, 0.35, 0.05, 0x111111); k.glow(3.4, 0.78, -5.02, 0.44, 0.28, 0.01, 0x6a8ab0, 1.2);
      FURN.safe(k, 5.45, 0, -4.7, 3); k.box(hw - 0.05, 1.4, -3.4, 0.04, 0.9, 1.2, 0xb59a6a);
      // stockroom: steel racking with boxes and cartons
      for (const sx of [-5.3, -2.0]) k.shelfUnit(sx, -3.8, 0.7, 2.6, 2.0, 4, rng, [0x8a6a4a, 0x7a5a3a, 0x9a7a5a, 0xd8c8a0]);
      k.crate(-3.6, -5.0, 0.55, 0x8a6a4a, 2); k.crate(-0.8, -5.0, 0.5, 0x6a7a8a, 1);
    },
    // the staff door panel: a mesh of its own so it can swing open
    afterInstall(grp, def) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.2, 0.06), new THREE.MeshBasicMaterial({ color: 0x6a7076, fog: false }));
      m.position.set(3.2, 1.1, -1.8); grp.add(m); def.staffMesh = m;
    },
    spots: [
      { id: 'clerk', x: 4.4, z: 3.5, r: 1.0, label: 'Shop' },
      { id: 'register', x: 2.4, z: 3.5, r: 0.8, label: 'Rob the register' },
      { id: 'slot', x: -4.75, z: 2.4, r: 1.0, label: 'Play the Lucky Pump slot' },
      { id: 'staff', x: 3.2, z: -1.0, r: 0.9, label: 'Staff only · force the door' },
      { id: 'safe', x: 4.6, z: -4.4, r: 0.9, label: 'Crack the office safe' },
      { id: 'desk', x: 3.0, z: -3.6, r: 0.8, label: 'Search the desk' },
      { id: 'stock', x: -3.6, z: -3.3, r: 1.1, label: 'Search the stockroom' },
      { id: 'exit', x: -3.5, z: 4.6, r: 1.1, label: 'Leave' }
    ],
    noExit: true,
    npcs: [{ id: 'clerk', x: 3.6, z: 1.8, h: 0, look: { shirt: 0xd23a2a, pants: 0x2a2a2e, cap: 0xd23a2a } }]
  };
}
// local layouts: x/z relative to the room centre, door/exit on the +z wall unless stated
const INTERIOR_DEFS = {
  safehouse: {
    name: 'Linden Hills Safehouse', place: 'safehouse', w: 12, d: 9, h: 3.1, exit: { x: 4, z: 3.6 }, spawnH: Math.PI,
    build(k, rng) {
      k.room(12, 9, 3.1, { floor: 0x6b4f3a, wall: 0x9a8f7e, wall2: 0x8f8576, ceil: 0xd8d2c6, trim: 0x3a2a20, lights: [2, 1] });
      k.planks(12, 9, 0x6e523c, 0x654a35, 18);
      k.door(4, 4.48, 0);
      // bed
      k.box(-4.2, 0, -2.75, 2.0, 0.42, 2.6, 0x3a2a20, { col: true }); k.box(-4.2, 0.42, -2.75, 1.9, 0.22, 2.5, 0xe8e4dc);
      k.box(-4.2, 0.6, -2.35, 1.94, 0.09, 1.7, 0x2f5d8a); k.box(-4.2, 0.64, -3.65, 1.4, 0.15, 0.5, 0xf4f2ee);
      k.box(-4.2, 0, -4.15, 2.1, 1.0, 0.12, 0x2e2018); k.box(-2.75, 0, -3.8, 0.5, 0.55, 0.5, 0x4a3a2a, { col: true });
      k.glow(-2.75, 0.75, -3.8, 0.2, 0.25, 0.2, 0xffd8a0, 2);
      // couch, coffee table, TV
      k.box(2.5, 0, -0.4, 2.6, 0.45, 0.95, 0x4a5a6a, { col: true }); k.box(2.5, 0.45, 0.02, 2.6, 0.5, 0.22, 0x445262);
      for (const s of [-1, 1]) k.box(2.5 + s * 1.2, 0.45, -0.4, 0.22, 0.22, 0.95, 0x445262);
      k.box(2.5, 0, -1.9, 1.3, 0.38, 0.7, 0x5a3e2b, { col: true }); k.box(2.3, 0.38, -1.9, 0.3, 0.04, 0.2, 0xd23a2a);
      k.box(2.5, 0, -4.05, 2.2, 0.5, 0.5, 0x22201e, { col: true }); k.box(2.5, 0.55, -4.18, 1.8, 1.0, 0.08, 0x111111);
      k.glow(2.5, 0.6, -4.13, 1.66, 0.9, 0.02, 0x4a78b8, 1.6);
      // desk + laptop
      k.box(5.3, 0, -2.0, 0.8, 0.74, 1.7, 0x6a4a32, { col: true }); k.box(5.3, 0.74, -2.0, 0.42, 0.03, 0.5, 0x222428);
      k.box(5.55, 0.77, -2.0, 0.04, 0.32, 0.48, 0x222428); k.glow(5.52, 0.8, -2.0, 0.02, 0.26, 0.42, 0x7fd0ff, 1.8);
      k.box(4.45, 0, -2.0, 0.5, 0.48, 0.5, 0x2a2a2e); k.box(4.25, 0.48, -2.0, 0.08, 0.5, 0.5, 0x2a2a2e);
      // wardrobe, fridge + counter
      k.box(-5.65, 0, 1.9, 0.62, 2.15, 1.7, 0x5a3e2b, { col: true }); k.box(-5.33, 1.0, 1.9, 0.02, 0.18, 0.04, 0xc9a66b);
      k.box(-1.2, 0, -4.12, 0.8, 1.85, 0.66, 0xe8eaec, { col: true }); k.box(-0.81, 0.8, -3.95, 0.03, 0.5, 0.04, 0x9a9a9a);
      k.box(0.4, 0, -4.15, 2.2, 0.9, 0.6, 0x6a4a32, { col: true }); k.box(0.4, 0.9, -4.15, 2.24, 0.05, 0.64, 0xb8b4ac);
      // garage door on the east wall, rug, plant, posters, window frame
      k.box(5.97, 0, 2.6, 0.06, 2.3, 2.2, 0x6f7378); for (let r = 0; r < 6; r++) k.box(5.94, 0.2 + r * 0.36, 2.6, 0.02, 0.04, 2.1, 0x5a5e62);
      k.glow(5.93, 2.45, 2.6, 0.03, 0.18, 0.7, 0x8fe39b, 2.4);
      k.box(0.5, -0.004, 0.6, 4.2, 0.012, 3.0, 0x8a3a2a, { flat: true }); k.box(0.5, 0.0, 0.6, 3.8, 0.014, 2.6, 0xb5652a, { flat: true });
      k.box(-5.4, 0, -0.6, 0.5, 0.5, 0.5, 0x7a5a3a, { col: true }); k.box(-5.4, 0.5, -0.6, 0.7, 0.9, 0.7, 0x2f6a3a);
      k.box(-1.5, 1.4, 4.46, 1.0, 1.3, 0.03, 0x2a5f9e); k.box(1.0, 1.5, 4.46, 0.8, 1.0, 0.03, 0xd8a227);
      k.box(-4.5, 1.2, 4.46, 1.4, 0.9, 0.03, 0x3a7a4a);
      k.box(-1.0, 0.95, -4.47, 2.4, 1.5, 0.06, 0x3a2a20);
    },
    windows: [{ x: -1.0, y: 1.0, z: -4.43, w: 2.2, h: 1.32, ry: 0 }],
    spots: [
      { id: 'bed', x: -4.2, z: -1.1, r: 1.5, label: 'Sleep & save' },
      { id: 'tv', x: 2.5, z: -1.2, r: 1.2, label: 'Watch the news' },
      { id: 'laptop', x: 4.5, z: -2.0, r: 1.1, label: 'Run your empire' },
      { id: 'wardrobe', x: -4.85, z: 1.9, r: 1.2, label: 'Wardrobe' },
      { id: 'fridge', x: -1.2, z: -3.2, r: 1.1, label: 'Grab a snack' },
      { id: 'garage', x: 5.1, z: 2.6, r: 1.2, label: 'Garage' }
    ]
  },
  penthouse: {
    name: 'Valen Tower Penthouse', place: 'tower', w: 18, d: 12, h: 3.6, exit: { x: -6, z: 5.1 }, spawnH: Math.PI,
    build(k) {
      k.room(18, 12, 3.6, { floor: 0x2a2c30, wall: 0xd8d4cc, ceil: 0xeeeae2, trim: 0x111214, lights: [3, 2], lightC: 0xfff6e8 });
      k.tiles(18, 12, 0x2a2c30, 0x34363c, 1.5);
      // elevator doors
      k.box(-6, 0, 5.96, 1.9, 2.5, 0.08, 0x9ea4aa); k.box(-6, 0, 5.92, 0.03, 2.4, 0.04, 0x55595e); k.glow(-6, 2.65, 5.9, 0.7, 0.16, 0.03, 0xffd84d, 2.5);
      // window frames on north and east walls (glass is the skyline planes)
      for (let i = 0; i <= 6; i++) k.box(-9 + i * 3, 0, -5.95, 0.12, 3.6, 0.1, 0x1a1c20);
      for (let i = 0; i <= 4; i++) k.box(8.95, 0, -6 + i * 3, 0.1, 3.6, 0.12, 0x1a1c20);
      k.box(0, 0, -5.95, 18, 0.35, 0.12, 0x1a1c20); k.box(8.95, 0, 0, 0.12, 0.35, 12, 0x1a1c20);
      // lounge
      k.box(2.5, -0.004, 0.5, 6, 0.014, 4, 0xc8bca8, { flat: true });
      k.box(2.5, 0, 1.7, 4.2, 0.42, 1.0, 0xe6e2da, { col: true }); k.box(2.5, 0.42, 2.12, 4.2, 0.55, 0.22, 0xdcd8d0);
      k.box(0.2, 0, 0.6, 1.0, 0.42, 2.6, 0xe6e2da, { col: true });
      k.box(2.5, 0, -0.2, 1.8, 0.35, 0.9, 0x111214, { col: true }); k.glow(2.5, 0.36, -0.2, 0.3, 0.02, 0.3, 0xffb547, 1.4);
      k.box(2.5, 0.9, 5.94, 3.2, 1.8, 0.06, 0x111111); k.glow(2.5, 0.98, 5.9, 3.0, 1.64, 0.02, 0x3a6ab0, 1.4);
      // bedroom corner, wardrobe, bar, desk
      k.box(-6, 0, -3.3, 2.4, 0.4, 2.6, 0x1a1c20, { col: true }); k.box(-6, 0.4, -3.3, 2.3, 0.22, 2.5, 0xf2f0ec); k.box(-6, 0.58, -2.8, 2.34, 0.08, 1.6, 0x6a3a8a);
      k.box(-8.65, 0, 2.2, 0.62, 2.4, 2.4, 0x2c2e33, { col: true });
      k.box(0, 0, 4.4, 3.2, 1.05, 0.7, 0x1a1c20, { col: true }); k.box(0, 1.05, 4.4, 3.3, 0.05, 0.8, 0xd8c8a0);
      for (let i = 0; i < 6; i++) k.glow(-1.2 + i * 0.48, 1.1, 4.25, 0.1, 0.3, 0.1, [0xffb547, 0x46d4c4, 0xd28cff][i % 3], 1.3);
      k.box(7.3, 0, 3.6, 1.6, 0.75, 0.8, 0x2c2e33, { col: true }); k.glow(7.3, 0.95, 3.4, 0.5, 0.3, 0.03, 0x7fd0ff, 1.8);
      for (const [px, pz] of [[-8.3, -5.3], [8.3, 5.3], [4.8, -5.3]]) { k.box(px, 0, pz, 0.6, 0.6, 0.6, 0xd8d4cc, { col: true }); k.box(px, 0.6, pz, 0.8, 1.3, 0.8, 0x2f6a3a); }
    },
    windows: [{ x: 0, y: 0.35, z: -5.9, w: 18, h: 3.25, ry: 0 }, { x: 8.9, y: 0.35, z: 0, w: 12, h: 3.25, ry: -Math.PI / 2 }],
    spots: [
      { id: 'bed', x: -6, z: -1.6, r: 1.5, label: 'Sleep & save' },
      { id: 'tv', x: 2.5, z: 1.0, r: 1.2, label: 'Watch the news' },
      { id: 'laptop', x: 7.3, z: 2.8, r: 1.1, label: 'Run your empire' },
      { id: 'wardrobe', x: -7.9, z: 2.2, r: 1.2, label: 'Wardrobe' },
      { id: 'bar', x: 0, z: 3.6, r: 1.2, label: 'Mix a drink' }
    ]
  },
  motorworks: {
    name: 'Okafor Motor Works', place: 'motorworks', w: 16, d: 12, h: 5, exit: { x: -6, z: 5.1 }, spawnH: Math.PI,
    build(k, rng) {
      k.room(16, 12, 5, { floor: 0x77777a, wall: 0x8d8478, ceil: 0x55585c, trim: 0x2a2a2a, band: [0, 1.4], bandC: 0x5a6670, lights: [3, 2], lightC: 0xf4f8ff });
      for (let i = 0; i < 9; i++) k.box(-6 + rng() * 12, -0.006, -5 + rng() * 10, 0.6 + rng() * 1.4, 0.008, 0.5 + rng() * 1.1, 0x5a5a5c, { flat: true });
      k.door(-6, 5.98, 0, 0x3a4a5a);
      // big roll door on the -z wall (the street side is up there somewhere)
      k.box(2, 0, -5.97, 6, 4.0, 0.06, 0x8a9096); for (let r = 0; r < 11; r++) k.box(2, 0.2 + r * 0.36, -5.93, 5.9, 0.05, 0.02, 0x6a7076);
      // two-post lift with a car up on it
      for (const s of [-1, 1]) { k.box(2 + s * 1.6, 0, 0, 0.35, 3.4, 0.35, 0xd23a2a, { col: true }); k.box(2 + s * 1.15, 1.6, 0, 0.6, 0.1, 0.18, 0x3a3a3a); }
      k.box(2, 1.7, 0, 1.85, 0.65, 4.3, 0x2a5f9e); k.box(2, 2.35, 0.3, 1.6, 0.55, 2.0, 0x24507f); k.glow(2, 2.4, 0.3, 1.5, 0.4, 1.9, 0x0f1520, 1);
      for (const dz of [-1.35, 1.35]) for (const s of [-1, 1]) k.box(2 + s * 0.95, 1.55, dz, 0.25, 0.65, 0.65, 0x111111);
      // pegboard + benches + tyre racks + compressor + engine hoist
      k.box(-4, 1.2, -5.94, 5, 1.6, 0.04, 0xb59a6a);
      for (let i = 0; i < 18; i++) k.box(-6.2 + (i % 9) * 0.55, 1.4 + Math.floor(i / 9) * 0.7, -5.9, 0.12, 0.35 + rng() * 0.2, 0.03, 0x2a2a2e);
      k.box(-4, 0, -5.4, 5, 0.9, 0.9, 0x5a5e62, { col: true }); k.box(-4, 0.9, -5.4, 5.1, 0.06, 1.0, 0x8a6a4a);
      for (let i = 0; i < 4; i++) k.box(-6 + i * 1.1, 0.96, -5.4, 0.4, 0.25 + rng() * 0.3, 0.3, [0xd23a2a, 0x2a5f9e, 0xf2c230, 0x3a3a3a][i]);
      for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) k.box(7.5, 0.4 + r * 0.9, -4 + i * 0.85, 0.5, 0.75, 0.24, 0x161618);
      k.box(7.6, 0, -2.3, 0.6, 3.0, 4.6, 0x3a3e44, { col: true });
      k.box(-6.8, 0, 2.0, 0.9, 0.9, 0.6, 0xd23a2a, { col: true }); k.box(-6.8, 0.9, 2.0, 0.7, 0.4, 0.4, 0x6a6a6a);
      k.box(-3.8, 0, 2.5, 0.12, 2.6, 0.12, 0xf2c230); k.box(-3.1, 2.5, 2.5, 1.5, 0.12, 0.12, 0xf2c230); k.box(-2.4, 1.1, 2.5, 0.5, 0.6, 0.6, 0x3a3a3a);
      // service counter by the door
      k.box(-3.2, 0, 4.0, 2.8, 1.05, 0.7, 0x5a3e2b, { col: true }); k.box(-3.2, 1.05, 4.0, 2.9, 0.05, 0.8, 0x9a9a9a);
      k.box(-2.4, 1.1, 4.0, 0.4, 0.3, 0.3, 0x2a2a2e); k.glow(-2.4, 1.2, 3.84, 0.3, 0.16, 0.02, 0x7fe08f, 1.6);
      k.box(4.5, 1.6, 5.94, 2.2, 1.0, 0.04, 0xf4f4f2); k.box(4.5, 1.7, 5.92, 1.9, 0.12, 0.02, 0x1d4f8a);
    },
    spots: [{ id: 'counter', x: -3.2, z: 3.2, r: 1.3, label: 'Service desk' }],
    npcs: [{ id: 'mechanic', x: 5.5, z: 1.5, h: -Math.PI / 2, look: { shirt: 0x34495e, pants: 0x2c3e50, cap: 0xd23a2a } }]
  },
  store: storeInteriorDef('store', 'Fuel & Go'),
  store2: storeInteriorDef('store2', 'Fuel & Go · Northgate'),
  store3: storeInteriorDef('store3', 'Fuel & Go · Westside'),
  store4: storeInteriorDef('store4', 'Fuel & Go · Eastgate'),
  store5: storeInteriorDef('store5', 'Fuel & Go · Southbank'),
  police: {
    name: 'Police HQ Lobby', place: 'police', w: 14, d: 10, h: 3.6, exit: { x: 0, z: 4.1 }, spawnH: Math.PI,
    build(k, rng) {
      k.room(14, 10, 3.6, { floor: 0x8a8f96, wall: 0xc8ccd2, ceil: 0xe8eaec, trim: 0x1d2e4a, band: [0, 1.1], bandC: 0x2f4a6a, lights: [3, 2], lightC: 0xf4f8ff });
      k.tiles(14, 10, 0x8a8f96, 0x7e838a, 1);
      k.door(0, 4.98, 0, 0x6a7a8a, 0x4d8dff);
      // front desk with glass, flags, seal
      k.box(0, 0, -1.8, 7, 1.1, 0.9, 0x2f4a6a, { col: true }); k.box(0, 1.1, -1.8, 7.1, 0.06, 1.0, 0xc8ccd2);
      k.glow(0, 1.16, -1.82, 6.8, 1.1, 0.03, 0x6a8ab0, 0.55);
      k.box(0, 1.6, -4.96, 2.2, 2.2, 0.04, 0x1d2e4a); k.glow(0, 2.15, -4.92, 1.2, 1.2, 0.02, 0xd8a227, 1.4);
      for (const s of [-1, 1]) { k.box(s * 2.4, 0, -4.6, 0.06, 2.6, 0.06, 0xb0b0b0); k.box(s * 2.4 + 0.4, 1.8, -4.6, 0.8, 0.5, 0.02, s < 0 ? 0x1d2e4a : 0xb03a2e); }
      // benches, notice board, evidence cage
      for (const x of [-4.5, -2.0, 2.0, 4.5]) { k.box(x, 0, 2.6, 2.0, 0.45, 0.6, 0x5a5e62, { col: true }); k.box(x, 0.45, 2.9, 2.0, 0.5, 0.08, 0x5a5e62); }
      k.box(-6.96, 1.0, 0.5, 0.04, 1.4, 3.0, 0xb59a6a);
      for (let i = 0; i < 8; i++) k.box(-6.92, 1.15 + (i % 2) * 0.6, -0.7 + Math.floor(i / 2) * 0.62, 0.02, 0.48, 0.42, i % 3 ? 0xf4f2ee : 0xe8d8a8);
      k.box(5.2, 0, -3.8, 3.2, 2.6, 2.0, 0x55595e, { col: true }); k.glow(5.2, 0.2, -2.78, 3.0, 2.3, 0.02, 0x40464e, 0.6);
      for (let i = 0; i < 9; i++) k.box(3.75 + i * 0.36, 0, -2.76, 0.03, 2.6, 0.03, 0x2a2c30);
      k.crate(4.7, -4.2, 0.6, 0x7a6a4a, 2); k.crate(5.8, -4.2, 0.55, 0x4a5a6a, 1);
      k.box(-6.4, 0, 4.3, 0.6, 0.6, 0.6, 0x5a5e62, { col: true }); k.box(-6.4, 0.6, 4.3, 0.8, 1.2, 0.8, 0x2f6a3a);
    },
    spots: [{ id: 'board', x: -6.0, z: 0.5, r: 1.3, label: 'Tip line board' }, { id: 'desk', x: 0, z: -0.8, r: 1.2, label: 'Front desk' }],
    npcs: [{ id: 'officer', x: -2.2, z: -2.7, h: 0, look: 'cop' }]
  },
  depot: {
    name: 'Harbor Row Depot', place: 'depot', w: 26, d: 18, h: 7.5, exit: { x: 8, z: 8.1 }, spawnH: Math.PI, locked: true,
    build(k, rng) {
      k.room(26, 18, 7.5, { floor: 0x6a6c6e, wall: 0x5f6a70, ceil: 0x3a3e42, trim: 0x2a2a2a, band: [0, 1.2], bandC: 0xd8a227, lights: [4, 3], lightC: 0xe8f0ff });
      k.door(8, 8.98, 0, 0x2a2e33, 0xff4d5e);
      for (let i = 0; i < 9; i++) k.box(-12 + rng() * 24, -0.006, -8 + rng() * 16, 0.8 + rng() * 2, 0.008, 0.6 + rng(), 0x55575a, { flat: true });
      // racking rows with pallets of crates
      for (const rx of [-8, -2.5, 3]) {
        for (const s of [-1, 1]) for (let j = 0; j <= 4; j++) k.box(rx + s * 0.65, 0, -6 + j * 2.6, 0.12, 5.2, 0.12, 0x2a5f9e, { col: true });
        for (let lv = 0; lv < 3; lv++) {
          k.box(rx, 0.15 + lv * 1.8, -0.8, 1.45, 0.1, 10.8, 0xd8762a);
          for (let j = 0; j < 4; j++) if (rng() < 0.85) k.box(rx, 0.25 + lv * 1.8, -4.7 + j * 2.6, 1.2, 0.8 + rng() * 0.6, 1.8, rng() < 0.5 ? 0x8a6a4a : 0x6a7a8a);
        }
        k.cols.push({ x0: rx - 0.75, x1: rx + 0.75, z0: -6.2, z1: 4.6, y0: 0, y1: 5.2 });
      }
      // forklift
      k.box(8.5, 0.3, -1, 1.2, 1.1, 2.0, 0xf2c230, { col: true }); k.box(8.5, 1.4, -0.6, 1.1, 1.2, 1.0, 0x2a2a2e);
      for (const s of [-1, 1]) k.box(8.5 + s * 0.4, 0.05, -2.4, 0.12, 0.08, 1.2, 0x3a3a3a); k.box(8.5, 0, -1.9, 1.0, 2.6, 0.12, 0x3a3a3a);
      // office cage in the far corner, where the case is kept
      k.box(9.5, 0, -6.2, 6, 2.8, 0.08, 0x9aa0a6); k.box(6.5, 0, -7.6, 0.08, 2.8, 2.8, 0x9aa0a6);
      k.cols.push({ x0: 6.5, x1: 12.5, z0: -6.25, z1: -6.15, y0: 0, y1: 2.8 }, { x0: 6.45, x1: 6.55, z0: -9, z1: -7.0, y0: 0, y1: 2.8 });
      k.box(10.5, 0, -7.9, 2.0, 0.75, 0.9, 0x5a3e2b, { col: true }); k.glow(10.5, 0.95, -8.2, 0.5, 0.3, 0.03, 0x7fd0ff, 1.6);
      k.box(11.9, 0, -8.2, 1.0, 1.9, 0.6, 0x3a3e44, { col: true });
      k.crate(-11, 6.5, 1.2, 0x8a6a4a, 2); k.crate(-9.6, 6.6, 1.2, 0x6a7a8a, 1); k.crate(11, 6, 1.1, 0x8a6a4a, 2);
      for (let i = 0; i < 4; i++) k.glow(-9 + i * 6, 7.38, 0, 0.5, 0.06, 6, 0xe8f0ff, 1.8);
    },
    spots: [],
    guards: [[[-5.3, -6.5], [-5.3, 6.0], [5.8, 6.0], [5.8, -4.0]], [[11, 4.5], [0.3, 4.5], [0.3, -6.5], [11, -4.5]]]
  }
};

/* ---------------- Valen Tower lobby, the penthouse up top, house interiors ---------------- */
Object.assign(INTERIOR_DEFS, {
  lobby: {
    name: 'Valen Tower Lobby', place: 'tower', w: 18, d: 12, h: 4.6, exit: { x: 0, z: 5.1 }, spawnH: Math.PI,
    build(k) {
      k.room(18, 12, 4.6, { floor: 0xe8e2d4, wall: 0xd8d0c0, wall2: 0xcfc6b2, ceil: 0xf4f0e6, trim: 0x2a2620, band: [0, 0.3], bandC: 0x2a2620, lights: [4, 2], lightC: 0xfff4dc });
      k.tiles(18, 12, 0xe8e2d4, 0xd4ccbc, 1.5);
      k.door(0, 5.98, 0, 0x9ab4c4, 0xd8b04a);
      // reception desk, the elevator bank, sofas, plants, a big piece of art
      k.box(4.5, 0, 0.5, 4.2, 1.1, 1.0, 0x2a2620, { col: true }); k.box(4.5, 1.1, 0.5, 4.4, 0.06, 1.2, 0xd8b04a);
      k.glow(4.5, 1.2, 0.2, 0.4, 0.3, 0.02, 0x7fd0ff, 1.6);
      for (const x of [-5.5, -2.5]) { k.box(x, 0, -5.94, 2.0, 3.0, 0.1, 0xb8b4ac); k.box(x, 0, -5.88, 0.03, 2.9, 0.04, 0x55595e); k.glow(x, 3.2, -5.85, 0.8, 0.18, 0.03, 0xd8b04a, 2.4); }
      k.box(-4, 0, 1.5, 3.4, 0.45, 0.95, 0x3a3f46, { col: true }); k.box(-4, 0.45, 1.95, 3.4, 0.5, 0.2, 0x33383f);
      k.box(-4, 0, -0.2, 1.4, 0.4, 0.8, 0x2a2620, { col: true });
      for (const [x, z] of [[-8.3, 5.3], [8.3, 5.3], [8.3, -5.3]]) { k.box(x, 0, z, 0.7, 0.6, 0.7, 0xd8d0c0, { col: true }); k.box(x, 0.6, z, 0.9, 1.6, 0.9, 0x2f6a3a); }
      k.box(8.94, 1.2, -1.5, 0.04, 2.4, 4.2, 0x2a3a52); k.glow(8.9, 1.4, -1.5, 0.02, 2.0, 3.8, 0x4a78b8, 0.9);
    },
    spots: [{ id: 'elevator', x: -4, z: -4.6, r: 1.6, label: 'Elevator' }, { id: 'concierge', x: 4.5, z: 1.6, r: 1.3, label: 'Concierge' }]
  }
});
/* ---------------- interior building kit: oriented furniture, walls with doorways, upper floors ----------------
   Furniture is placed by its centre on the floor (x, y, z) and the way it faces (o: 0 +z, 1 +x, 2 -z,
   3 -x). Local x runs across the piece, local z from its back (-) to its front (+). Interiors with an
   upper storey list their walkable decks and stairs in def.levels; the player, the camera and the
   interaction spots read the floor height from there (intFloorY), with the same step limit as a
   person on the street, so walking under a balcony keeps you on the ground floor. */
function FB(k, cx, cy, cz, o, lx, ly, lz, w, h, d, col, opt) {
  let x, z, sw, sd;
  switch (o & 3) {
    case 0: x = lx; z = lz; sw = w; sd = d; break;
    case 1: x = lz; z = -lx; sw = d; sd = w; break;
    case 2: x = -lx; z = -lz; sw = w; sd = d; break;
    default: x = -lz; z = lx; sw = d; sd = w;
  }
  k.box(cx + x, cy + ly, cz + z, sw, h, sd, col, opt);
}
const FG = (k, cx, cy, cz, o, lx, ly, lz, w, h, d, col, g = 2) => FB(k, cx, cy, cz, o, lx, ly, lz, w, h, d, col, { glow: g });
function intFloorY(def, lx, lz, ly) {
  let best = 0;
  for (const s of def.levels) {
    if (lx < s.x0 || lx > s.x1 || lz < s.z0 || lz > s.z1) continue;
    let h = s.h;
    if (h === undefined) { let t = s.axis === 'x' ? (lx - s.x0) / (s.x1 - s.x0) : (lz - s.z0) / (s.z1 - s.z0); if (s.dir < 0) t = 1 - t; h = s.h0 + (s.h1 - s.h0) * t; }
    if (h > best && h <= ly + 0.75) best = h;
  }
  return best;
}
// local floor height of the interior the player is in, at world (x, z), for a body at world height y
function interiorLevel(int, x, z, y) { const d = int && int.def; return d && d.levels ? intFloorY(d, x - d.ox, z - d.oz, y - int.floor) : 0; }
const DOOR_H = 2.3;
// a wall along x (at z) or along z (at x) from a to b, with doorway gaps [g0, g1]; colliders on every piece
function iwall(k, along, c, a, b, y0, h, col, gaps = [], t = 0.15) {
  const seg = (s0, s1, yy, hh) => {
    if (s1 - s0 < 0.02 || hh <= 0.01) return;
    if (along === 'x') k.box((s0 + s1) / 2, yy, c, s1 - s0, hh, t, col, { col: true });
    else k.box(c, yy, (s0 + s1) / 2, t, hh, s1 - s0, col, { col: true });
  };
  const gs = gaps.slice().sort((p, q) => p[0] - q[0]);
  let s = a;
  for (const [g0, g1] of gs) {
    seg(s, g0, y0, h); seg(g0, g1, y0 + DOOR_H, h - DOOR_H);
    // a dark frame round the opening
    const fc = 0x2a2420, mid = (g0 + g1) / 2;
    if (along === 'x') { k.box(g0 + 0.04, y0, c, 0.08, DOOR_H, t + 0.06, fc); k.box(g1 - 0.04, y0, c, 0.08, DOOR_H, t + 0.06, fc); k.box(mid, y0 + DOOR_H - 0.08, c, g1 - g0, 0.08, t + 0.06, fc); }
    else { k.box(c, y0, g0 + 0.04, t + 0.06, DOOR_H, 0.08, fc); k.box(c, y0, g1 - 0.04, t + 0.06, DOOR_H, 0.08, fc); k.box(c, y0 + DOOR_H - 0.08, mid, t + 0.06, 0.08, g1 - g0, fc); }
    s = g1;
  }
  seg(s, b, y0, h);
}
const FURN = {
  rug(k, x, y, z, w, d, col, col2) { k.box(x, y - 0.004, z, w, 0.012, d, col, { flat: true }); if (col2 !== undefined) k.box(x, y, z, w - 0.3, 0.014, d - 0.3, col2, { flat: true }); },
  bed(k, x, y, z, o, w = 1.9, l = 2.2, sheet = 0x2f5d8a, frame = 0x3a2a20) {
    FB(k, x, y, z, o, 0, 0, 0, w, 0.42, l, frame, { col: true });
    FB(k, x, y, z, o, 0, 0.42, 0.02, w - 0.08, 0.2, l - 0.1, 0xeeeae2);
    FB(k, x, y, z, o, 0, 0.6, l * 0.16, w - 0.04, 0.08, l * 0.62, sheet);
    for (const s of w > 1.4 ? [-0.45, 0.45] : [0]) FB(k, x, y, z, o, s * (w / 1.9), 0.62, -l / 2 + 0.35, w > 1.4 ? 0.7 : 0.8, 0.14, 0.42, 0xf6f4f0);
    FB(k, x, y, z, o, 0, 0, -l / 2 - 0.05, w + 0.1, 1.15, 0.1, frame);
  },
  nightstand(k, x, y, z, o, col = 0x4a3a2a, lamp = true) {
    FB(k, x, y, z, o, 0, 0, 0, 0.5, 0.55, 0.45, col, { col: true });
    FB(k, x, y, z, o, 0, 0.3, 0.226, 0.42, 0.015, 0.01, 0x1a1410); FB(k, x, y, z, o, 0, 0.42, 0.23, 0.08, 0.025, 0.02, 0xc9a66b);
    if (lamp) { FB(k, x, y, z, o, 0, 0.55, 0, 0.06, 0.3, 0.06, 0x2a2a2a); FG(k, x, y, z, o, 0, 0.82, 0, 0.26, 0.2, 0.26, 0xffd8a0, 1.8); }
  },
  dresser(k, x, y, z, o, w = 1.4, col = 0x5a3e2b, mirror = false) {
    FB(k, x, y, z, o, 0, 0, 0, w, 0.85, 0.5, col, { col: true });
    for (let r = 0; r < 3; r++) { FB(k, x, y, z, o, 0, 0.18 + r * 0.24, 0.252, w - 0.08, 0.012, 0.01, 0x1a1410); FB(k, x, y, z, o, 0, 0.27 + r * 0.24, 0.26, 0.12, 0.025, 0.02, 0xc9a66b); }
    if (mirror) { FB(k, x, y, z, o, 0, 0.9, -0.2, w * 0.7, 0.9, 0.04, 0x3a2a20); FG(k, x, y, z, o, 0, 0.95, -0.17, w * 0.62, 0.8, 0.01, 0xb8c8d8, 0.8); }
  },
  wardrobe(k, x, y, z, o, w = 1.4, col = 0x5a3e2b) {
    FB(k, x, y, z, o, 0, 0, 0, w, 2.1, 0.62, col, { col: true });
    FB(k, x, y, z, o, 0, 0.05, 0.312, 0.012, 2.0, 0.01, 0x1a1410);
    for (const s of [-0.08, 0.08]) FB(k, x, y, z, o, s, 1.0, 0.32, 0.03, 0.22, 0.03, 0xc9a66b);
  },
  sofa(k, x, y, z, o, w = 2.4, col = 0x4a5a6a) {
    const dk = new THREE.Color(col).multiplyScalar(0.88).getHex();
    FB(k, x, y, z, o, 0, 0, 0, w, 0.44, 0.95, col, { col: true });
    FB(k, x, y, z, o, 0, 0.44, -0.37, w, 0.5, 0.22, dk);
    for (const s of [-1, 1]) FB(k, x, y, z, o, s * (w / 2 - 0.11), 0.44, 0, 0.22, 0.22, 0.95, dk);
    for (let i = 0; i < Math.max(2, Math.round(w / 0.9)); i++) { const n = Math.max(2, Math.round(w / 0.9)), cw = (w - 0.5) / n; FB(k, x, y, z, o, -w / 2 + 0.25 + cw * (i + 0.5), 0.44, 0.08, cw - 0.04, 0.1, 0.62, col); }
  },
  armchair(k, x, y, z, o, col = 0x6a4a3a) { FURN.sofa(k, x, y, z, o, 1.0, col); },
  coffeeTable(k, x, y, z, o, w = 1.3, d = 0.7, col = 0x5a3e2b) { FB(k, x, y, z, o, 0, 0, 0, w, 0.38, d, col, { col: true }); FB(k, x, y, z, o, 0.2, 0.38, 0, 0.3, 0.04, 0.2, 0xd23a2a); },
  tv(k, x, y, z, o, w = 1.6, stand = true) {
    if (stand) FB(k, x, y, z, o, 0, 0, 0, w + 0.4, 0.5, 0.45, 0x22201e, { col: true });
    const by = stand ? 0.56 : 0.9, hh = w * 0.56;
    FB(k, x, y, z, o, 0, by, stand ? -0.08 : -0.02, w, hh, 0.06, 0x111111);
    FG(k, x, y, z, o, 0, by + 0.04, stand ? -0.045 : 0.012, w - 0.08, hh - 0.08, 0.01, 0x4a78b8, 1.4);
  },
  diningSet(k, x, y, z, o, seats = 4, col = 0x5a3e2b) {
    const len = seats <= 4 ? 1.5 : seats <= 6 ? 2.2 : 3.2, per = Math.ceil(seats / 2);
    FB(k, x, y, z, o, 0, 0, 0, len, 0.75, 0.95, col, { col: true });
    FB(k, x, y, z, o, 0, 0.75, 0, len + 0.04, 0.04, 0.99, new THREE.Color(col).multiplyScalar(1.15).getHex());
    for (let i = 0; i < per; i++) for (const s of [-1, 1]) { const cx = -len / 2 + (i + 0.5) * len / per; FB(k, x, y, z, o, cx, 0, s * 0.75, 0.42, 0.45, 0.42, 0x3a2a20); FB(k, x, y, z, o, cx, 0.45, s * 0.94, 0.42, 0.5, 0.06, 0x3a2a20); }
  },
  // a run of kitchen cabinets against a wall: worktop, upper cabinets, a sink, a hob and optionally a fridge at the left end
  kitchenRun(k, x, y, z, o, len = 3, opt = {}) {
    const base = opt.base || 0x6a4a32, top = opt.top || 0xb8b4ac, fridge = opt.fridge !== false;
    const runL = fridge ? len - 0.9 : len, off = fridge ? 0.45 : 0;
    FB(k, x, y, z, o, off, 0, 0, runL, 0.9, 0.6, base, { col: true });
    FB(k, x, y, z, o, off, 0.9, 0.02, runL + 0.04, 0.05, 0.64, top);
    for (let i = 0; i < Math.floor(runL / 0.6); i++) FB(k, x, y, z, o, off - runL / 2 + 0.3 + i * 0.6, 0.45, 0.302, 0.5, 0.012, 0.01, 0x1a1410);
    FB(k, x, y, z, o, off - runL / 4, 0.92, 0.05, 0.6, 0.04, 0.42, 0x9aa0a6); // sink
    FB(k, x, y, z, o, off - runL / 4, 0.95, -0.22, 0.04, 0.3, 0.04, 0xb0b0b0);
    FB(k, x, y, z, o, off + runL / 4, 0.95, 0, 0.6, 0.02, 0.5, 0x1a1a1c); // hob
    for (const s of [-0.15, 0.15]) FG(k, x, y, z, o, off + runL / 4 + s, 0.965, s * 0.6, 0.18, 0.005, 0.18, 0xff6a3a, 0.7);
    if (opt.upper !== false) FB(k, x, y, z, o, off, 1.5, -0.12, runL, 0.7, 0.36, opt.upperC || base);
    if (opt.hood) FB(k, x, y, z, o, off + runL / 4, 1.6, -0.05, 0.8, 0.5, 0.5, 0x9aa0a6);
    if (fridge) { FB(k, x, y, z, o, -len / 2 + 0.4, 0, -0.02, 0.8, 1.9, 0.66, opt.fridgeC || 0xe8eaec, { col: true }); FB(k, x, y, z, o, -len / 2 + 0.72, 0.8, 0.32, 0.03, 0.5, 0.04, 0x9a9a9a); }
  },
  island(k, x, y, z, o, len = 2.2, col = 0x2a2c30, top = 0xe8e4dc, stools = 3) {
    FB(k, x, y, z, o, 0, 0, 0, len, 0.92, 0.9, col, { col: true });
    FB(k, x, y, z, o, 0, 0.92, 0.1, len + 0.1, 0.05, 1.15, top);
    for (let i = 0; i < stools; i++) { const sx = -len / 2 + (i + 0.5) * len / stools; FB(k, x, y, z, o, sx, 0, 0.95, 0.06, 0.66, 0.06, 0x2a2a2a); FB(k, x, y, z, o, sx, 0.66, 0.95, 0.38, 0.06, 0.38, 0x3a2a20); }
  },
  toilet(k, x, y, z, o) { FB(k, x, y, z, o, 0, 0, 0.05, 0.4, 0.42, 0.55, 0xf2f2f0, { col: true }); FB(k, x, y, z, o, 0, 0.42, -0.22, 0.42, 0.4, 0.18, 0xf2f2f0); },
  vanity(k, x, y, z, o, w = 0.9, col = 0xe8e4dc) {
    FB(k, x, y, z, o, 0, 0, 0, w, 0.85, 0.5, col, { col: true }); FB(k, x, y, z, o, 0, 0.86, 0.02, w * 0.6, 0.04, 0.34, 0xf8f8f8);
    FB(k, x, y, z, o, 0, 1.15, -0.23, w * 0.9, 0.85, 0.03, 0x8a9096); FG(k, x, y, z, o, 0, 1.18, -0.21, w * 0.84, 0.78, 0.01, 0xcfe0ec, 0.9);
  },
  tub(k, x, y, z, o, l = 1.7) { FB(k, x, y, z, o, 0, 0, 0, 0.8, 0.55, l, 0xf2f2f0, { col: true }); FB(k, x, y, z, o, 0, 0.5, 0, 0.62, 0.06, l - 0.18, 0xa8c8d8); },
  shower(k, x, y, z, o, s = 1.0) { FB(k, x, y, z, o, 0, 0, 0, s, 0.06, s, 0xd8dcdc); FB(k, x, y, z, o, 0, 0, s / 2, s, 2.0, 0.03, 0xa8c8d8); FB(k, x, y, z, o, s / 2, 0, 0, 0.03, 2.0, s, 0xa8c8d8); FB(k, x, y, z, o, -s * 0.3, 1.9, -s * 0.3, 0.2, 0.04, 0.2, 0x9aa0a6); },
  desk(k, x, y, z, o, w = 1.4, laptop = true, col = 0x6a4a32) {
    FB(k, x, y, z, o, 0, 0, 0, w, 0.74, 0.7, col, { col: true });
    if (laptop) { FB(k, x, y, z, o, 0, 0.74, 0.05, 0.42, 0.03, 0.3, 0x222428); FB(k, x, y, z, o, 0, 0.77, -0.1, 0.42, 0.28, 0.03, 0x222428); FG(k, x, y, z, o, 0, 0.79, -0.08, 0.38, 0.24, 0.01, 0x7fd0ff, 1.6); }
    FB(k, x, y, z, o, 0, 0, 0.72, 0.5, 0.48, 0.5, 0x2a2a2e); FB(k, x, y, z, o, 0, 0.48, 0.95, 0.5, 0.5, 0.08, 0x2a2a2e);
  },
  bookshelf(k, x, y, z, o, w, rng, h = 2.0) {
    FB(k, x, y, z, o, 0, 0, 0, w, h, 0.35, 0x4a3a2a, { col: true });
    const pal = [0x8a2f3a, 0x2f5d8a, 0x3a7a4a, 0xd8a227, 0x6a3a8a, 0xe8e4dc, 0x2a2a2e];
    for (let r = 0; r < 4; r++) { const yy = 0.15 + r * (h - 0.2) / 4; let px = -w / 2 + 0.08; while (px < w / 2 - 0.12) { const bw = 0.04 + rng() * 0.06, bh = 0.2 + rng() * 0.18; FB(k, x, y, z, o, px + bw / 2, yy, 0.05, bw, bh, 0.22, pal[Math.floor(rng() * pal.length)]); px += bw + 0.005; } }
  },
  safe(k, x, y, z, o) { FB(k, x, y, z, o, 0, 0, 0, 0.75, 0.9, 0.7, 0x3a3e44, { col: true }); FB(k, x, y, z, o, 0, 0.3, 0.355, 0.2, 0.2, 0.02, 0x9aa0a6); FB(k, x, y, z, o, 0.22, 0.4, 0.36, 0.05, 0.22, 0.03, 0xc8c8c8); },
  poolTable(k, x, y, z, o) {
    FB(k, x, y, z, o, 0, 0, 0, 1.45, 0.7, 2.6, 0x3a2416, { col: true });
    FB(k, x, y, z, o, 0, 0.7, 0, 1.45, 0.1, 2.6, 0x4a2c1a); FB(k, x, y, z, o, 0, 0.72, 0, 1.2, 0.09, 2.35, 0x1f6a3e);
    const bc = [0xf4f4f0, 0xf2c230, 0x2a5f9e, 0xd23a2a, 0x6a3a8a, 0xe67e22, 0x1e8449, 0x7a1a1a, 0x111111];
    for (let i = 0; i < bc.length; i++) FB(k, x, y, z, o, (i % 3 - 1) * 0.07 + (i === 0 ? 0.1 : 0), 0.81, i === 0 ? 0.7 : -0.5 - Math.floor(i / 3) * 0.07, 0.055, 0.055, 0.055, bc[i]);
    FB(k, x, y, z, o, 0.55, 0.82, 0.2, 0.025, 0.025, 1.4, 0xd8b48a);
  },
  plant(k, x, y, z, s = 1) { k.box(x, y, z, 0.5 * s, 0.45 * s, 0.5 * s, 0xd8d0c0, { col: true }); k.box(x, y + 0.45 * s, z, 0.7 * s, 1.0 * s, 0.7 * s, 0x2f6a3a); k.box(x, y + 1.2 * s, z, 0.45 * s, 0.5 * s, 0.45 * s, 0x3a7a4a); },
  lamp(k, x, y, z) { k.box(x, y, z, 0.3, 0.04, 0.3, 0x2a2a2a); k.box(x, y, z, 0.04, 1.5, 0.04, 0x2a2a2a); k.glow(x, y + 1.45, z, 0.36, 0.3, 0.36, 0xffe0b0, 1.9); },
  art(k, x, y, z, o, w = 1.2, h = 0.8, col = 0x2a5f9e) { FB(k, x, y, z, o, 0, 0, 0, w + 0.08, h + 0.08, 0.03, 0x1a1410); FB(k, x, y, z, o, 0, 0.04, 0.012, w, h, 0.02, col); FB(k, x, y, z, o, -w * 0.15, h * 0.3, 0.024, w * 0.4, h * 0.35, 0.01, new THREE.Color(col).offsetHSL(0.3, 0, 0.15).getHex()); },
  bar(k, x, y, z, o, len = 3, stools = 4, top = 0xd8c8a0, col = 0x1a1c20) {
    FB(k, x, y, z, o, 0, 0, 0, len, 1.05, 0.7, col, { col: true }); FB(k, x, y, z, o, 0, 1.05, 0, len + 0.1, 0.05, 0.8, top);
    for (let i = 0; i < stools; i++) { const sx = -len / 2 + (i + 0.5) * len / stools; FB(k, x, y, z, o, sx, 0, 0.75, 0.06, 0.74, 0.06, 0x8a8a8a); FB(k, x, y, z, o, sx, 0.74, 0.75, 0.4, 0.06, 0.4, 0x2a2a2e); }
    // the back bar: shelves of bottles behind the counter
    FB(k, x, y, z, o, 0, 0, -1.1, len, 0.9, 0.45, col, { col: true });
    for (let i = 0; i < Math.round(len / 0.35); i++) FG(k, x, y, z, o, -len / 2 + 0.2 + i * 0.35, 1.25, -1.15, 0.09, 0.3, 0.09, [0xffb547, 0x46d4c4, 0xd28cff, 0x7fe08f][i % 4], 1.3);
    FB(k, x, y, z, o, 0, 1.2, -1.28, len, 0.03, 0.25, 0x8a8a8a); FB(k, x, y, z, o, 0, 1.65, -1.28, len, 0.03, 0.25, 0x8a8a8a);
  },
  fireplace(k, x, y, z, o, w = 1.8) { FB(k, x, y, z, o, 0, 0, 0, w, 1.2, 0.5, 0xb8b0a0, { col: true }); FB(k, x, y, z, o, 0, 0.15, 0.2, w * 0.55, 0.6, 0.12, 0x111111); FG(k, x, y, z, o, 0, 0.18, 0.24, w * 0.4, 0.3, 0.05, 0xff8a3d, 2.2); FB(k, x, y, z, o, 0, 1.2, 0.02, w + 0.2, 0.08, 0.6, 0x8a8478); },
  chandelier(k, x, y, z) { k.box(x, y + 0.5, z, 0.04, 1.0, 0.04, 0x8a7a5a); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.glow(x + Math.cos(a) * 0.55, y, z + Math.sin(a) * 0.55, 0.12, 0.2, 0.12, 0xfff0c0, 2.6); } k.glow(x, y - 0.1, z, 0.3, 0.3, 0.3, 0xfff0c0, 2.4); },
  ceilingLight(k, x, y, z, w = 1.1) { k.box(x, y - 0.05, z, w + 0.15, 0.05, 0.5, 0xd8d8d8); k.glow(x, y - 0.07, z, w, 0.03, 0.38, 0xfff1d6, 2.6); },
  arcade(k, x, y, z, o, col = 0x6a3a8a) { FB(k, x, y, z, o, 0, 0, 0, 0.7, 1.75, 0.75, col, { col: true }); FG(k, x, y, z, o, 0, 1.0, 0.3, 0.55, 0.45, 0.02, 0x46d4c4, 1.6); FG(k, x, y, z, o, 0, 1.6, 0.36, 0.6, 0.12, 0.02, 0xffd84d, 2); FB(k, x, y, z, o, 0, 0.8, 0.42, 0.6, 0.06, 0.3, 0x2a2a2e); },
  window(def, x, y, z, w, h, ry) { (def.windows || (def.windows = [])).push({ x, y, z, w, h, ry }); }
};

/* ---------------- loot: what a stranger's drawers hold ----------------
   Every container is rolled from a seeded table (house, container, the week), so a house you come
   back to the next week has been restocked but searching the same drawer twice gives nothing. Most
   of it is small; safes are rare and slow. */
const LOOT_KIND = {
  nightstand: { label: 'nightstand', w: [['none', 45], ['cash', 30], ['val', 18], ['ammo', 4], ['gun', 3]] },
  dresser: { label: 'dresser drawers', w: [['none', 40], ['cash', 26], ['val', 28], ['prod', 6]] },
  wardrobe: { label: 'wardrobe', w: [['none', 50], ['cash', 16], ['val', 26], ['rare', 6], ['gun', 2]] },
  desk: { label: 'desk drawers', w: [['none', 42], ['cash', 36], ['val', 16], ['ammo', 6]] },
  kitchen: { label: 'kitchen cupboards', w: [['none', 66], ['cash', 26], ['prod', 8]] },
  bath: { label: 'bathroom cabinet', w: [['none', 70], ['pills', 30]] },
  bed: { label: 'under the mattress', w: [['none', 64], ['cash', 34], ['gun', 2]] },
  closet: { label: 'hall closet', w: [['none', 58], ['cash', 18], ['ammo', 12], ['val', 12]] },
  jewel: { label: 'jewellery box', w: [['none', 20], ['val', 55], ['rare', 25]] },
  safe: { label: 'wall safe', w: [['big', 100]], slow: 4.5 }
};
const LOOT_CASH = [25, 45, 90, 170, 320, 650];
// what the valuables are, by how good the house is: [name, hot goods it fences as]. A tier-1 bedsit has a
// cheap watch in it; a tier-6 mansion has a collector's watch. 'rare' finds come from the next band up.
const LOOT_VALUABLES = [
  [['a cheap wristwatch', 1], ['a tablet', 1], ['a pair of earrings', 1], ['a games console', 1], ['a compact camera', 1], ['a pair of headphones', 1]],
  [['a gold chain', 1], ['a laptop', 2], ['a silver watch', 2], ['a designer handbag', 2], ['a pearl necklace', 2], ['a camera and lenses', 2]],
  [['a diamond bracelet', 3], ['a designer watch', 3], ['a pair of diamond earrings', 3], ['a small oil painting', 3], ['a rare guitar', 3], ['a case of vintage wine', 2]],
  [['a collector\'s watch', 4], ['a diamond necklace', 5], ['a signed painting', 5], ['a gold bar', 4], ['a jewelled cigar box', 4], ['an antique clock', 4]]
];
const lootBand = tier => tier >= 6 ? 3 : tier >= 5 ? 2 : tier >= 3 ? 1 : 0;
function lootValuable(tier, rng, rare) {
  const band = Math.min(3, lootBand(clamp(tier, 1, 6)) + (rare ? 1 : 0)), list = LOOT_VALUABLES[band];
  const [name, hot] = list[Math.floor(rng() * list.length) % list.length];
  return { name, goods: { hot: hot + (rng() < 0.25 ? 1 : 0) }, rare: !!rare };
}
function rollLoot(kind, tier, rng) {
  const K = LOOT_KIND[kind] || LOOT_KIND.dresser;
  let tot = 0; for (const [, w] of K.w) tot += w;
  let r = rng() * tot, pick = 'none'; for (const [id, w] of K.w) { r -= w; if (r <= 0) { pick = id; break; } }
  const c = LOOT_CASH[clamp(tier, 1, 6) - 1];
  switch (pick) {
    case 'cash': return { cash: Math.round(c * (0.4 + rng() * 1.2)) };
    case 'val': return lootValuable(tier, rng, false);
    case 'rare': { const v = lootValuable(tier, rng, true); v.goods.hot += 1; return v; }
    case 'ammo': return { ammo: 8 + Math.floor(rng() * 16) };
    case 'gun': return { gun: 'pistol', ammo: 6 };
    case 'prod': return { goods: { green: 1 } };
    case 'pills': return { goods: { pills: 1 } };
    case 'big': { const v = rng() < 0.7 ? lootValuable(tier, rng, true) : null; return { cash: Math.round(c * (6 + rng() * 8)), goods: v ? v.goods : null, name: v ? v.name : undefined, gun: rng() < 0.15 ? 'pistol' : null, ammo: rng() < 0.3 ? 12 : 0 }; }
    default: return {};
  }
}
// tier of a home that is not one of the player's properties (a break-in), from what it is and where
function homeTier(home, prop) {
  if (prop && prop.tier) return prop.tier;
  if (home.ladderTier) return home.ladderTier; // a home on the property ladder (for sale) keeps its own tier
  if (home.type === 'mansion') return 6;
  if (home.district === 'u') return home.garage === 'triple' ? 5 : 4;
  if (home.type === 'apartment' || home.type === 'semi') return home.district === 'l' ? 2 : 1;
  if (home.garage === 'triple') return 5;
  if (home.garage === 'double') return 4;
  if (home.garage === 'single' || home.type === 'farm') return 3;
  return 2;
}

/* ---------------- house plans (v6) ----------------
   A house is two bands of rooms, front and back, either side of a hallway that runs its width. What goes
   in each band, in which order, how wide each room is, how deep the hallway sits, which way round the house
   is (mirrored), whether kitchen, dining and living are open to each other and which special rooms a better
   house adds are all drawn from a seed per house, so two houses of the same tier rarely share a plan.
     tier 2: living, kitchen-diner, bedroom, bathroom (4 rooms)
     tier 3: living, kitchen-diner, main bedroom, bathroom, second bedroom or office (5)
     tier 4: foyer, living, kitchen, dining, main bedroom, bathroom, second bedroom, maybe an office (7-8)
     tier 5: foyer, living, kitchen, dining, master suite + ensuite, second bedroom, bathroom, office, rec room (9)
     signature (one per neighbourhood): foyer, living, kitchen, dining, study, master + ensuite, guest suite,
       bathroom, games room, bar (10)
   Every room has a doorway onto the hallway; open-plan pairs also open into each other. */
const ROOM_LABEL = { living: 'Living room', kitchen: 'Kitchen', dining: 'Dining room', kitdin: 'Kitchen-diner', bath: 'Bathroom', master: 'Main bedroom', bed2: 'Second bedroom', office: 'Office', foyer: 'Foyer', ensuite: 'Ensuite', rec: 'Rec room', study: 'Study', guest: 'Guest suite', games: 'Games room', bar: 'Bar lounge', bed: 'Bedroom', laundry: 'Laundry', den: 'Den' };
const ROOM_WT = { living: 1.5, kitchen: 1.0, dining: 1.0, kitdin: 1.45, bath: 0.62, master: 1.3, bed2: 1.0, office: 0.85, foyer: 0.62, ensuite: 0.6, rec: 1.25, study: 0.95, guest: 1.05, games: 1.3, bar: 0.95, bed: 1.1, laundry: 0.5, den: 0.9 };
const PLAN_DIMS = { 2: [11.5, 9, 2.9], 3: [13.5, 10.5, 3.0], 4: [16.5, 12, 3.1], 5: [19.5, 13.5, 3.4], 7: [24, 15, 3.5] };
function housePlan(tier, sig, rng) {
  const T = sig ? 7 : clamp(tier, 2, 5), [W, D, H] = PLAN_DIMS[T];
  const pick2 = (a, b) => rng() < 0.5 ? a : b;
  let front, back;
  // which rooms (the entry room is always first in the front band)
  if (T === 2) { front = ['living', 'kitdin']; back = pick2(['bed', 'bath'], ['bath', 'bed']); }
  else if (T === 3) { front = ['living', 'kitdin']; back = ['master', 'bath', pick2('bed2', 'office')]; }
  else if (T === 4) { front = ['foyer', 'living', 'dining', 'kitchen']; back = ['master', 'bath', 'bed2']; if (rng() < 0.45) back.push(pick2('office', 'den')); }
  else if (T === 5) { front = ['foyer', 'living', 'dining', 'kitchen']; back = ['master', 'ensuite', 'bed2', 'bath', 'office']; if (rng() < 0.5) front.push('rec'); else back.push('rec'); }
  else { front = ['foyer', 'living', 'dining', 'kitchen', 'bar']; back = ['master', 'ensuite', 'guest', 'bath', 'study', 'games']; }
  // variants: the kitchen side and the bedroom side trade places (living stays at the front door)
  const variant = rng();
  if (T >= 3 && variant < 0.3) { // social at the back: kitchen and dining move back, a bedroom comes forward
    const soc = front.filter(r => r === 'kitchen' || r === 'dining' || r === 'kitdin'), pri = back.filter(r => r === 'bed2' || r === 'office' || r === 'guest' || r === 'den');
    front = front.filter(r => !soc.includes(r)).concat(pri.slice(0, 1)); back = soc.concat(back.filter(r => !pri.slice(0, 1).includes(r)));
  } else if (T >= 4 && variant < 0.55) { // a bedroom wing at the front end
    const mv = back.find(r => r === 'bed2' || r === 'guest'); if (mv) { back = back.filter(r => r !== mv); front.push(mv); }
  }
  // order inside a band: the entry room stays first; kitchen next to dining, ensuite next to master
  const glue = list => {
    const out = [], rest = list.slice();
    const take = r => { const i = rest.indexOf(r); if (i >= 0) rest.splice(i, 1); return i >= 0; };
    if (list === front) { out.push(rest.shift()); if (rest[0] === 'living' && out[0] === 'foyer') out.push(rest.shift()); }
    while (rest.length) {
      const i = Math.floor(rng() * rest.length), r = rest[i]; rest.splice(i, 1); out.push(r);
      if (r === 'dining' && take('kitchen')) out.push('kitchen'); else if (r === 'kitchen' && take('dining')) out.push('dining');
      if (r === 'master' && take('ensuite')) out.push('ensuite'); else if (r === 'ensuite' && take('master')) out.splice(out.length - 1, 0, 'master');
    }
    return out;
  };
  front = glue(front); back = glue(back);
  const mirror = rng() < 0.5;
  const hallD = 1.5 + rng() * 0.25, split = lerp(0.44, 0.56, rng());
  const zh0 = -D / 2 + (D - hallD) * (1 - split), zh1 = zh0 + hallD; // back band ends at zh0, front band starts at zh1
  const rooms = [];
  const lay = (list, z0, z1, band) => {
    const ws = list.map(r => ROOM_WT[r] * lerp(0.85, 1.15, rng())), sum = ws.reduce((a, b) => a + b, 0);
    let x = -W / 2;
    list.forEach((type, i) => { const w = Math.max(2.4, W * ws[i] / sum); rooms.push({ type, band, x0: x, x1: Math.min(W / 2, x + w), z0, z1 }); x += w; });
    const last = rooms[rooms.length - 1]; last.x1 = W / 2; // the last room takes up any slack
    // squeeze back if the minimum widths overflowed
    const mine = rooms.filter(r => r.band === band), over = mine[mine.length - 1].x0 - (W / 2 - 2.4);
    if (over > 0) { const k = (W - 2.4) / (W + over); let xx = -W / 2; for (const r of mine.slice(0, -1)) { const w = (r.x1 - r.x0) * k; r.x0 = xx; r.x1 = xx + w; xx += w; } mine[mine.length - 1].x0 = xx; }
  };
  lay(front, zh1, D / 2, 'f'); lay(back, -D / 2, zh0, 'b');
  if (mirror) for (const r of rooms) { const a = -r.x1, b = -r.x0; r.x0 = a; r.x1 = b; }
  // doorways onto the hall; open-plan neighbours (living / dining / kitchen / kitchen-diner / foyer) open wide
  const openSet = new Set(['living', 'dining', 'kitchen', 'kitdin', 'foyer', 'bar', 'rec']);
  for (const r of rooms) {
    const w = r.x1 - r.x0, c = (r.x0 + r.x1) / 2, off = clamp((rng() - 0.5) * (w - 2.0), -(w / 2 - 0.9), w / 2 - 0.9);
    r.door = [c + off - 0.55, c + off + 0.55];
    if (r.type === 'ensuite') r.door = null; // reached through the master bedroom
  }
  const links = [];
  for (const band of ['f', 'b']) {
    const list = rooms.filter(r => r.band === band).sort((a, b) => a.x0 - b.x0);
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i], b = list[i + 1], x = a.x1;
      const pair = (a.type === 'master' && b.type === 'ensuite') || (b.type === 'master' && a.type === 'ensuite');
      const open = openSet.has(a.type) && openSet.has(b.type);
      links.push({ x, z0: a.z0, z1: a.z1, gap: open ? [lerp(a.z0, a.z1, 0.5) - 1.2, lerp(a.z0, a.z1, 0.5) + 1.2] : pair ? [lerp(a.z0, a.z1, 0.5) - 0.5, lerp(a.z0, a.z1, 0.5) + 0.5] : null, open, pair });
    }
  }
  // the front door: in the entry room, on the outside wall, away from its partition
  const entry = rooms.find(r => r.band === 'f' && (mirror ? r.x1 === W / 2 : r.x0 === -W / 2)) || rooms[0];
  const doorX = mirror ? entry.x1 - 1.4 : entry.x0 + 1.4;
  return { T, W, D, H, rooms, links, hall: { z0: zh0, z1: zh1 }, mirror, doorX, entry };
}
// furnish one room of a plan; C(kind, x, z, r) records a searchable container; S records owner slots
function furnishRoom(k, r, plan, rng, ctx) {
  const { C, S, sheet, sofaC, pal, tier } = ctx, H = plan.H;
  const x0 = r.x0 + 0.08, x1 = r.x1 - 0.08, z0 = r.z0 + 0.08, z1 = r.z1 - 0.08, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
  const front = r.band === 'f';                                  // the hall is on this room's z0 side if front, z1 side if back
  const farZ = front ? z1 : z0, nearZ = front ? z0 : z1, inZ = front ? 1 : -1;  // inZ: from the hall into the room
  const oFar = front ? 2 : 0;                                     // furniture with its back to the far wall
  const fz = (t) => farZ - inZ * t;                               // a z measured from the far wall into the room
  const isEntry = r === plan.entry, doorX = plan.doorX;
  const clearOfDoor = x => !isEntry || Math.abs(x - doorX) > 1.4;
  const sideX = (s, t) => s < 0 ? x0 + t : x1 - t;                 // measured in from the left (s<0) or right wall
  const oSide = s => s < 0 ? 1 : 3;
  const fx = (pref) => { const xs = [cx, cx - w * 0.22, cx + w * 0.22]; for (const x of [pref, ...xs]) if (x !== undefined && clearOfDoor(x)) return x; return cx; };
  const lightC = tier >= 4;
  switch (r.type) {
    case 'living': case 'den': {
      const tvx = fx(), tvW = tier >= 5 ? 2.6 : tier >= 4 ? 2.0 : 1.6;
      FURN.tv(k, tvx, 0, fz(0.3), oFar, tvW, tier < 5); if (tier >= 5) k.box(tvx, 0, fz(0.25), tvW + 1.4, 0.45, 0.4, 0x1a1c20, { col: true });
      const sz = fz(Math.min(d - 1.6, 3.2));
      FURN.sofa(k, tvx, 0, sz, oFar === 2 ? 0 : 2, Math.min(w - 1.4, tier >= 4 ? 3.0 : 2.4), sofaC);
      FURN.coffeeTable(k, tvx, 0, (sz + fz(0.3)) / 2, 0, 1.3);
      FURN.rug(k, tvx, 0, (sz + fz(0.3)) / 2, Math.min(w - 1, 3.6), Math.min(d - 1.4, 2.6), [0x8a3a2a, 0x2a4a6a, 0x5a6a3a][Math.floor(rng() * 3)], 0xc8bca8);
      // (nothing tall goes within reach of the front door)
      if (w > 4.2 && clearOfDoor(sideX(-1, 0.55)) && Math.abs(sideX(-1, 0.55) - doorX) > 1.8) FURN.armchair(k, sideX(-1, 0.55), 0, (sz + fz(0.4)) / 2, 1, sofaC);
      if (!isEntry || Math.abs(sideX(1, 0.4) - doorX) > 1.8) FURN.lamp(k, sideX(1, 0.4), 0, fz(0.5));
      if (!isEntry || Math.abs(sideX(1, 0.45) - doorX) > 1.8) FURN.plant(k, sideX(1, 0.45), 0, (nearZ + farZ) / 2 + inZ * 0.6, 0.9);
      if (tier >= 4 && r.type === 'living') FURN.fireplace(k, sideX(-1, 0.3), 0, fz(Math.min(d - 1.2, 1.6)), 1, 1.6);
      FURN.art(k, cx, 1.4, nearZ + inZ * 0.03, front ? 0 : 2, 1.2, 0.8, pal.acc);
      C('closet', sideX(-1, 0.8), (nearZ + farZ) / 2, 0.9);
      if (r.type === 'living') S.tv = [tvx, fz(1.4)]; else C('desk', cx, fz(1.2));
      break;
    }
    case 'kitdin': case 'kitchen': {
      const len = Math.min(w - 0.6, tier >= 4 ? 4.6 : 3.6), kx = clamp(fx(cx), x0 + len / 2 + 0.05, x1 - len / 2 - 0.05);
      FURN.kitchenRun(k, kx, 0, fz(0.35), oFar, len, { upper: true, hood: tier >= 4, base: tier >= 5 ? 0x2a2c30 : 0x6a4a32, top: tier >= 5 ? 0xe8e4dc : 0xb8b4ac, fridgeC: tier >= 5 ? 0xb8bcc2 : 0xe8eaec });
      C('kitchen', kx, fz(1.25));
      S.fridge = [kx - len / 2 + 0.45, fz(1.2)];
      if (tier >= 4 && d > 4.2 && w > 3.2) FURN.island(k, kx, 0, fz(2.55), 0, Math.min(2.4, w - 1.6), tier >= 5 ? 0x1a1c20 : 0x4a3a2a, 0xe8e4dc, 3);
      if (r.type === 'kitdin') { FURN.diningSet(k, cx, 0, (nearZ + fz(1.4)) / 2, 0, 4, 0x5a3e2b); if (lightC) FURN.ceilingLight(k, cx, H, (nearZ + fz(1.4)) / 2, 1.2); }
      if (lightC) FURN.ceilingLight(k, kx, H, fz(1.6), 1.1);
      break;
    }
    case 'dining': {
      const seats = tier >= 5 || ctx.sig ? 8 : tier >= 4 ? 6 : 4;
      FURN.diningSet(k, cx, 0, cz, w > d ? 0 : 1, seats, tier >= 5 ? 0x2a2620 : 0x5a3e2b);
      if (lightC) FURN.ceilingLight(k, cx, H, cz, 1.4); else FURN.lamp(k, sideX(1, 0.4), 0, fz(0.4));
      k.box(fx(cx), 0, fz(0.3), Math.min(w - 1.2, 2.2), 0.9, 0.5, 0x4a3424, { col: true }); C('dresser', fx(cx), fz(1.0), 0.8);
      FURN.art(k, cx, 1.5, farZ - inZ * 0.02, oFar, 1.6, 0.9, pal.acc);
      break;
    }
    case 'bath': case 'ensuite': {
      FURN.toilet(k, sideX(1, 0.45), 0, fz(0.45), oFar);
      FURN.vanity(k, sideX(-1, 0.6), 0, fz(0.3), oFar, 0.9);
      if (w > 2.6 && d > 2.8 && (tier >= 4 || r.type === 'ensuite')) FURN.tub(k, cx, 0, fz(0.5), 0, 1.5);
      else FURN.shower(k, sideX(1, 0.6), 0, (nearZ + farZ) / 2 + inZ * 0.3, 3, 1.0);
      C('bath', sideX(-1, 0.6), fz(1.2), 0.9);
      break;
    }
    case 'master': case 'bed': case 'bed2': case 'guest': {
      const big = r.type === 'master' || r.type === 'guest', bw = big ? (tier >= 4 ? 2.0 : 1.8) : 1.5;
      const bx = fx(cx);
      FURN.bed(k, bx, 0, fz(1.2), oFar, bw, 2.2, r.type === 'master' ? sheet : [0x3a6a4a, 0xd8a227, 0x8a3a5a][Math.floor(rng() * 3)]);
      FURN.nightstand(k, bx - bw / 2 - 0.35, 0, fz(0.3), oFar); C('nightstand', bx - bw / 2 - 0.35, fz(1.0), 0.9);
      if (big) FURN.nightstand(k, bx + bw / 2 + 0.35, 0, fz(0.3), oFar);
      C('bed', bx + bw / 2 + 0.55, fz(2.0), 0.9);
      if (w > 3.4) { FURN.wardrobe(k, sideX(1, 0.35), 0, (fz(0) + nearZ) / 2 + inZ * 0.6, 3, 1.3); C('wardrobe', sideX(1, 1.05), (fz(0) + nearZ) / 2 + inZ * 0.6, 0.9); }
      if (big && w > 3.0) { FURN.dresser(k, sideX(-1, 0.3), 0, (fz(0) + nearZ) / 2 + inZ * 0.4, 1, 1.2, 0x5a3e2b, tier >= 4); C('dresser', sideX(-1, 1.0), (fz(0) + nearZ) / 2 + inZ * 0.4, 0.8); }
      if (r.type === 'master' && tier >= 5) { k.box(sideX(-1, 0.35), 0.86, (fz(0) + nearZ) / 2 + inZ * 0.1, 0.3, 0.15, 0.22, 0x6a1a2a); C('jewel', sideX(-1, 1.1), (fz(0) + nearZ) / 2, 0.7); }
      if (r.type === 'master' || (r.type === 'bed' && !S.bed)) { S.bed = [bx, fz(2.6)]; S.wardrobe = [sideX(1, 1.1), (fz(0) + nearZ) / 2 + inZ * 0.6]; }
      FURN.rug(k, bx, 0, fz(1.6), bw + 1.0, 2.4, 0xc8bca8);
      break;
    }
    case 'office': case 'study': {
      const dx = fx(cx);
      FURN.desk(k, dx, 0, fz(0.45), oFar, 1.4, true); C('desk', dx, fz(1.6), 0.9); S.laptop = [dx, fz(1.5)];
      FURN.bookshelf(k, sideX(-1, 0.2), 0, (fz(0) + nearZ) / 2, 1, Math.min(2.4, d - 1.6), rng);
      if (r.type === 'study') { FURN.bookshelf(k, sideX(1, 0.2), 0, (fz(0) + nearZ) / 2, 3, Math.min(2.4, d - 1.6), rng); FURN.armchair(k, cx + w * 0.2, 0, (fz(0) + nearZ) / 2 + inZ * 0.3, 0, 0x4a2a1a); }
      if (rng() < [0, 0, 0.25, 0.4, 0.6, 0.6, 0.8][Math.min(6, tier)] || ctx.sig) { FURN.safe(k, sideX(1, 0.45), 0, fz(0.45), 3); C('safe', sideX(1, 1.2), fz(0.6), 0.9); }
      S.stash = S.stash || [dx, fz(1.7)];
      break;
    }
    case 'foyer': {
      k.box(sideX(1, 0.3), 0, (nearZ + farZ) / 2, 0.45, 0.85, 1.6, 0x4a3424, { col: true }); C('closet', sideX(1, 1.0), (nearZ + farZ) / 2, 0.9);
      if (!isEntry || Math.abs(sideX(-1, 0.45) - doorX) > 1.6) FURN.plant(k, sideX(-1, 0.45), 0, fz(0.5), 1.0);
      FURN.rug(k, (x0 + x1) / 2, 0, cz, Math.min(w - 0.6, 2.2), Math.min(d - 0.6, 3.0), 0x7a1a2a, 0x9a2a3a);
      FURN.art(k, sideX(1, 0.03), 1.5, cz, 3, 1.0, 0.8, pal.acc);
      if (ctx.sig || tier >= 5) FURN.chandelier(k, cx, H - 0.9, cz);
      break;
    }
    case 'rec': case 'games': {
      if (w > 3.6 && d > 4.0) FURN.poolTable(k, cx, 0, cz, w > d ? 1 : 0); else FURN.diningSet(k, cx, 0, cz, 0, 4, 0x1f6a3e);
      FURN.arcade(k, sideX(-1, 0.45), 0, fz(0.4), oFar, 0x6a3a8a); FURN.tv(k, sideX(1, 0.3), 0, cz, 3, 1.8);
      FURN.ceilingLight(k, cx, H, cz, 1.4); C('closet', sideX(-1, 1.2), fz(1.2), 0.9);
      break;
    }
    case 'bar': {
      FURN.bar(k, fx(cx), 0, fz(1.45), oFar === 2 ? 2 : 0, Math.min(w - 1.0, 3.2), 3); S.bar = [fx(cx), fz(2.3)];
      FURN.sofa(k, cx, 0, nearZ + inZ * 1.0, oFar === 2 ? 2 : 0, Math.min(w - 1.4, 2.2), 0x5a1a2a); C('closet', sideX(-1, 0.9), cz, 0.9);
      break;
    }
    case 'laundry': { k.box(sideX(1, 0.4), 0, fz(0.4), 0.65, 0.9, 0.65, 0xe8eaec, { col: true }); k.box(sideX(1, 1.1), 0, fz(0.4), 0.65, 0.9, 0.65, 0xe8eaec, { col: true }); C('closet', cx, cz, 0.9); break; }
  }
}
// where a person can stand in a built kit: a flood fill on a 0.25 m grid from (sx, sz) with a 0.34 m body
// against every collider between 0.35 m and 1.7 m. snap(x, z, R) gives the nearest reachable cell within R.
function kitReach(k, W, D, sx, sz) {
  const S = 0.25, nx = Math.ceil(W / S), nz = Math.ceil(D / S), r = 0.4, cols = k.cols.filter(c => c.y0 < 1.7 && c.y1 > 0.35);
  const cx = i => -W / 2 + (i + 0.5) * S, cz = j => -D / 2 + (j + 0.5) * S;
  const free = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = cx(i), z = cz(j); if (Math.abs(x) > W / 2 - r || Math.abs(z) > D / 2 - r) continue;
    let ok = 1; for (const c of cols) if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) { ok = 0; break; }
    free[j * nx + i] = ok;
  }
  const reach = new Uint8Array(nx * nz), q = [];
  const si = clamp(Math.floor((sx + W / 2) / S), 0, nx - 1), sj = clamp(Math.floor((sz + D / 2) / S), 0, nz - 1);
  // start from the nearest free cell to the door
  let st = -1, bd = 1e9; for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (free[j * nx + i]) { const d = (i - si) ** 2 + (j - sj) ** 2; if (d < bd) { bd = d; st = j * nx + i; } }
  if (st >= 0) { reach[st] = 1; q.push(st); }
  while (q.length) { const c = q.pop(), i = c % nx, j = (c / nx) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const n = b * nx + a; if (free[n] && !reach[n]) { reach[n] = 1; q.push(n); } } }
  const snap = (x, z, R = 1.4) => {
    let best = null, bd2 = R * R;
    const i0 = Math.floor((x - R + W / 2) / S), i1 = Math.ceil((x + R + W / 2) / S), j0 = Math.floor((z - R + D / 2) / S), j1 = Math.ceil((z + R + D / 2) / S);
    for (let j = Math.max(0, j0); j <= Math.min(nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) { if (!reach[j * nx + i]) continue; const d = (cx(i) - x) ** 2 + (cz(j) - z) ** 2; if (d < bd2) { bd2 = d; best = [cx(i), cz(j)]; } }
    return best;
  };
  let n = 0; for (let c = 0; c < reach.length; c++) n += reach[c];
  return { snap, cells: n };
}
// build a planned house into an interior kit (walls, doors, furniture, lights); returns slots and the room list
function buildPlannedHouse(k, plan, rng, ctx) {
  const { W, D, H, rooms, links, hall } = plan, hw = W / 2, hd = D / 2, wc = ctx.pal.wall;
  // hallway walls with a doorway into each room
  iwall(k, 'x', hall.z0, -hw, hw, 0, H, wc, rooms.filter(r => r.band === 'b' && r.door).map(r => r.door));
  iwall(k, 'x', hall.z1, -hw, hw, 0, H, wc, rooms.filter(r => r.band === 'f' && r.door).map(r => r.door));
  for (const L of links) iwall(k, 'z', L.x, L.z0, L.z1, 0, H, wc, L.gap ? [L.gap] : []);
  // a runner and lights down the hallway
  FURN.rug(k, 0, 0, (hall.z0 + hall.z1) / 2, W - 2, hall.z1 - hall.z0 - 0.5, 0x5a3a2a, 0x6a4a3a);
  for (let x = -hw + 2.5; x < hw - 1; x += 4.5) FURN.ceilingLight(k, x, H, (hall.z0 + hall.z1) / 2, 0.8);
  // the closed-off ensuite: it has no hall door, so its wall with the master has the gap (handled in links)
  for (const r of rooms) furnishRoom(k, r, plan, rng, ctx);
  // every searchable container and every owner spot sits where a person can actually stand
  const R = kitReach(k, W, D, plan.doorX, D / 2 - 0.9);
  ctx.reachCells = R.cells;
  for (const c of ctx.conts) { const p = R.snap(c.x, c.z); if (p) { c.x = p[0]; c.z = p[1]; c.r = Math.max(c.r, 0.95); } else c.drop = true; }
  for (let i = ctx.conts.length - 1; i >= 0; i--) if (ctx.conts[i].drop) ctx.conts.splice(i, 1);
  for (const key in ctx.S) { const p = R.snap(ctx.S[key][0], ctx.S[key][1], 2.2); if (p) ctx.S[key] = p; else delete ctx.S[key]; }
  ctx.snap = R.snap;
  return rooms.map(r => r.type);
}

/* ---------------- house interiors by tier ----------------
   1 a studio: bed, small TV, kitchenette, a shower room
   2 one bedroom: living room, kitchen and table, bedroom, bathroom
   3 a house: living room, kitchen-diner, two bedrooms, bathroom off a hallway
   4 a family home: bigger rooms, island kitchen, dining for six, three bedrooms, two bathrooms
   5 a luxury home: open plan with a bar and a media wall, master suite with ensuite, office, art
   6 the Crestmoor mansion: two storeys (mansionInteriorDef)
   Since v6, tiers 2-5 and the signature homes are built from a seeded floor plan (housePlan above): rooms
   either side of a hallway, varied per house; tier 1 stays a studio. */
function houseInteriorDef(home, prop) {
  if (home.type === 'mansion') return mansionInteriorDef(home, prop);
  const tier = homeTier(home, prop), sig = !!(prop && prop.sig) || !!home.sig;
  const seed = Math.abs(Math.floor(home.x0 * 13 + home.z0 * 7));
  const plan = tier >= 2 ? housePlan(tier, sig, mulberry32(seed * 31 + 7)) : null;
  const dims = plan ? [plan.W, plan.D, plan.H] : [9.5, 7.5, 2.9];
  const W = dims[0], D = dims[1], H = dims[2];
  const doorX = plan ? plan.doorX : -W / 2 + 1.6;
  const conts = [];
  const C = (kind, x, z, r = 1.1) => { conts.push({ kind, x, z, r }); };
  const def = {
    id: 'h:' + home.id, dynamic: true, name: prop ? prop.name : (home.type === 'apartment' ? 'An apartment' : 'Somebody’s house'), w: W, d: D, h: H, seed, tier, sig,
    rooms: plan ? plan.rooms.map(r => r.type) : ['studio', 'bath'],
    // a level below the fixed interiors (the Linden safehouse sits under its own house), so a house built on
    // demand never shares space with one
    floorY: IY - 8,
    exit: { x: doorX, z: D / 2 - 0.6 }, spawnH: Math.PI, place: null, at: { x: (home.x0 + home.x1) / 2, z: (home.z0 + home.z1) / 2 },
    door: { x: home.door.x, z: home.door.z, h: home.door.h }, home: home.id, propId: prop ? prop.id : null, owned: !!prop,
    build(k, rng) {
      conts.length = 0;
      const pals = tier >= 5 ? [{ floor: 0xd8d2c4, wall: 0xf0ece4, ceil: 0xf8f6f0, acc: 0x1a1c20 }, { floor: 0x5a4030, wall: 0xe8e2d4, ceil: 0xf4f0e6, acc: 0x2a3a52 }]
        : tier >= 3 ? [{ floor: 0x7a5a3c, wall: 0xd8cfbf, ceil: 0xeeeae2, acc: 0x2a4a6a }, { floor: 0x9a8a72, wall: 0xc9d4d8, ceil: 0xeeeae2, acc: 0x5a3a2a }, { floor: 0x6b4f3a, wall: 0xe0d6c4, ceil: 0xe8e4dc, acc: 0x3a5a3a }]
          : [{ floor: 0x8a7a62, wall: 0xc8bfa8, ceil: 0xe0dcd2, acc: 0x6a4a3a }, { floor: 0x6a6a64, wall: 0xb8c0b4, ceil: 0xdcdcd4, acc: 0x3a4a5a }];
      const pal = pals[Math.floor(rng() * pals.length)];
      const sheet = [0x2f5d8a, 0x7a2a3a, 0x3a6a4a, 0xd8c8a0, 0x5a4a7a][Math.floor(rng() * 5)];
      const sofaC = [0x4a5a6a, 0x6a4a3a, 0x3a3f46, 0x8a7a62, 0x2a3a52][Math.floor(rng() * 5)];
      k.room(W, D, H, { floor: pal.floor, wall: pal.wall, ceil: pal.ceil, trim: 0x3a2a20, lights: tier >= 4 ? [3, 2] : [2, 1] });
      if (tier >= 5) k.tiles(W, D, pal.floor, new THREE.Color(pal.floor).multiplyScalar(0.94).getHex(), 1.2);
      else k.planks(W, D, pal.floor, new THREE.Color(pal.floor).multiplyScalar(0.92).getHex(), Math.round(W * 1.4));
      k.door(doorX, D / 2 - 0.02, 0);
      const hw = W / 2, hd = D / 2, wc = pal.wall;
      if (plan) {
        const S = {}, ctx = { C, S, sheet, sofaC, pal, tier, sig, conts };
        buildPlannedHouse(k, plan, rng, ctx);
        // a missing spot falls back to the middle of a fitting room (then snapped to where you can stand)
        const roomMid = (...types) => { const r = plan.rooms.find(q => types.includes(q.type)) || plan.rooms[0]; return ctx.snap((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, 3) || ctx.snap(doorX, D / 2 - 1, 3); };
        const any = (k2, ...types) => S[k2] || roomMid(...types);
        def.slots = { bed: any('bed', 'master', 'bed', 'bed2'), wardrobe: any('wardrobe', 'master', 'bed', 'bed2'), fridge: any('fridge', 'kitchen', 'kitdin'), tv: any('tv', 'living'), stash: any('stash', 'office', 'study', 'master', 'bed'), garage: ctx.snap(hw - 0.9, hd - 2.4, 3) || roomMid('living') };
        if (S.laptop) def.slots.laptop = S.laptop;
        if (S.bar) def.slots.bar = S.bar;
      } else if (tier === 1) {
        // studio: one room, a shower room in the back-right corner
        iwall(k, 'z', 2, -hd, -0.8, 0, H, wc); iwall(k, 'x', -0.8, 2, hw, 0, H, wc, [[2.4, 3.4]]);
        FURN.toilet(k, 4.25, 0, -3.3, 0); FURN.vanity(k, 2.75, 0, -3.45, 0, 0.8); FURN.shower(k, 4.2, 0, -1.4, 3, 1.0); C('bath', 2.75, -2.6);
        FURN.bed(k, -3.4, 0, -2.6, 0, 1.5, 2.1, sheet); FURN.nightstand(k, -2.25, 0, -3.45, 0); C('nightstand', -2.25, -2.6); C('bed', -3.4, -1.2);
        FURN.dresser(k, -0.6, 0, -3.48, 0, 1.1); C('dresser', -0.6, -2.7);
        FURN.kitchenRun(k, 4.4, 0, 1.6, 3, 2.6, { upper: true }); C('kitchen', 3.5, 1.9);
        FURN.diningSet(k, 1.6, 0, 1.4, 1, 2);
        FURN.tv(k, -1.3, 0, 3.45, 2, 1.0); FURN.armchair(k, -1.3, 0, 1.4, 0, sofaC); FURN.rug(k, -1.3, 0, 1.9, 2.4, 2.0, 0x8a3a2a);
        FURN.wardrobe(k, -4.42, 0, 0.6, 1, 1.2);
        FURN.plant(k, -4.3, 0, 3.3, 0.8);
        def.slots = { bed: [-3.4, -1.0], wardrobe: [-3.6, 0.6], fridge: [3.5, 0.6], tv: [-1.3, 2.4], stash: [-4.0, 2.4], garage: [hw - 0.9, hd - 2.4] };
      }
      if (home.garageRect) { k.box(hw - 0.05, 0, hd - 2.4, 0.08, 2.2, 1.2, 0x6f7378); k.glow(hw - 0.1, 2.3, hd - 2.4, 0.03, 0.15, 0.6, 0x8fe39b, 2.2); }
      def.containers = conts.map((c, i) => ({ ...c, i }));
    }
  };
  // build once to learn the spot positions (the kit is cheap; the real build happens on install)
  def.build(new InteriorKit(H), mulberry32(seed * 977 + 13));
  const sl = def.slots, spots = [{ id: 'exit', x: def.exit.x, z: def.exit.z, r: 1.3, label: 'Leave' }];
  if (prop) {
    spots.push({ id: 'bed', x: sl.bed[0], z: sl.bed[1], r: 1.5, label: 'Sleep & save' });
    spots.push({ id: 'wardrobe', x: sl.wardrobe[0], z: sl.wardrobe[1], r: 1.2, label: 'Wardrobe' });
    spots.push({ id: 'fridge', x: sl.fridge[0], z: sl.fridge[1], r: 1.3, label: 'Grab a snack' });
    spots.push({ id: 'tv', x: sl.tv[0], z: sl.tv[1], r: 1.3, label: 'Watch the news' });
    spots.push({ id: 'stash', x: sl.stash[0], z: sl.stash[1], r: 1.3, label: 'Stash & property' });
    if (sl.laptop) spots.push({ id: 'laptop', x: sl.laptop[0], z: sl.laptop[1], r: 1.1, label: 'Run your empire' });
    if (sl.bar) spots.push({ id: 'bar', x: sl.bar[0], z: sl.bar[1], r: 1.2, label: 'Mix a drink' });
    if (home.garageRect) spots.push({ id: 'garage', x: sl.garage[0], z: sl.garage[1], r: 1.2, label: 'Into the garage' });
  } else for (const c of def.containers) spots.push({ id: 'c:' + c.i, x: c.x, z: c.z, r: c.r, label: (c.kind === 'safe' ? 'Crack the ' : 'Search the ') + LOOT_KIND[c.kind].label, kind: c.kind });
  def.spots = spots;
  def.noExit = true; // the exit is a spot (so it carries the right label)
  return def;
}

/* ---------------- the Crestmoor mansion: two storeys ----------------
   Ground floor (y 0): a double-height foyer with a grand staircase up the middle, living room with a
   media wall and fireplace, a kitchen with an island, a dining room under the gallery, an office with
   the safe, a bar lounge, a powder room and the stairs down to the motor court.
   Upper floor (y 4.2): a gallery that looks down into the foyer, the master suite with an ensuite,
   two more bedrooms, a second bathroom and a game room with a pool table and a big screen. */
const MANSION_H1 = 4.2;
function mansionInteriorDef(home, prop) {
  const W = 28, D = 20, H1 = MANSION_H1, H2 = 3.9, H = H1 + H2, hw = W / 2, hd = D / 2;
  const owned = !!prop;
  const def = {
    id: 'h:' + home.id, dynamic: true, name: prop ? prop.name : 'Crestmoor Estate', w: W, d: D, h: H, seed: 7171, tier: 6,
    exit: { x: 0, z: hd - 0.7 }, spawnH: Math.PI, place: null, at: { x: (home.x0 + home.x1) / 2, z: (home.z0 + home.z1) / 2 },
    door: { x: home.door.x, z: home.door.z, h: home.door.h }, home: home.id, propId: prop ? prop.id : null, owned,
    // walkable decks and the grand stair: the upper floor is everything but the void over the foyer
    levels: [
      { x0: -hw, x1: hw, z0: -hd, z1: -2.2, h: H1 },
      { x0: -hw, x1: -2.6, z0: -2.2, z1: hd, h: H1 },
      { x0: 2.6, x1: hw, z0: -2.2, z1: hd, h: H1 },
      { x0: -1.25, x1: 1.25, z0: -2.2, z1: 6.0, axis: 'z', dir: -1, h0: 0, h1: H1 }
    ],
    build(k, rng) {
      def.windows = [];
      const wall = 0xe8e2d4, wall2 = 0xdcd4c2, marble = 0xe8e4dc, marble2 = 0xd8d2c4, wood = 0x5a3e2b, gold = 0xd8b04a;
      k.room(W, D, H, { floor: marble, wall, wall2, ceil: 0xf4f0e6, trim: 0x2a2620, lights: [4, 3], lightC: 0xfff4dc });
      k.tiles(W, D, marble, marble2, 1.25);
      k.door(0, hd - 0.02, 0, 0x3a2a1e, gold);
      // ----- the upper floor slab (ceiling of the ground floor), with the foyer left open
      const slab = (x0, z0, x1, z1) => { k.box((x0 + x1) / 2, H1 - 0.3, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0, 0xf4f0e6, { col: true }); k.box((x0 + x1) / 2, H1 - 0.012, (z0 + z1) / 2, x1 - x0 - 0.02, 0.014, z1 - z0 - 0.02, 0x6b4f3a, { flat: true }); };
      slab(-hw, -hd, hw, -2.2); slab(-hw, -2.2, -2.6, hd); slab(2.6, -2.2, hw, hd);
      for (let i = 0; i < 18; i++) k.box(-hw + (i + 0.5) * W / 18, H1 - 0.005, -hd / 2 - 1.1, W / 18 - 0.02, 0.008, hd - 2.3, i % 2 ? 0x6b4f3a : 0x634834, { flat: true });
      // ----- grand staircase: 24 steps rising north from the foyer, solid underneath, banisters
      const st0 = 6.0, st1 = -2.2, n = 24, run = (st0 - st1) / n;
      for (let i = 0; i < n; i++) { const z = st0 - (i + 0.5) * run, top = (i + 1) * H1 / n; k.box(0, 0, z, 2.5, top, run + 0.01, marble); k.box(0, top - 0.02, z + run / 2 - 0.03, 2.5, 0.025, 0.06, 0x8a7a5a); }
      FURN.rug(k, 0, 0, st0 + 1.4, 2.6, 2.2, 0x7a1a2a, 0x9a2a3a);
      for (let i = 0; i < 12; i++) {
        const za = st0 - i * (st0 - st1) / 12, zb = st0 - (i + 1) * (st0 - st1) / 12, ha = (st0 - za) / (st0 - st1) * H1, hb = (st0 - zb) / (st0 - st1) * H1;
        // underside volume (you can't walk under the stair) and the banisters (you can't step off it)
        if (ha > 0.4) k.cols.push({ x0: -1.25, x1: 1.25, z0: zb, z1: za, y0: 0, y1: ha - 0.05 });
        for (const sx of [-1.33, 1.33]) { k.cols.push({ x0: sx - 0.08, x1: sx + 0.08, z0: zb, z1: za, y0: Math.max(0, ha - 0.3), y1: hb + 1.0 }); k.box(sx, ha + 0.9, (za + zb) / 2, 0.08, 0.08, za - zb + 0.02, 0x3a2a1e); k.box(sx, ha, (za + zb) / 2, 0.03, 0.9, 0.03, gold); }
      }
      k.box(-1.33, 0, st0 + 0.05, 0.25, 1.1, 0.25, 0x3a2a1e); k.box(1.33, 0, st0 + 0.05, 0.25, 1.1, 0.25, 0x3a2a1e);
      // gallery railing round the void (glass, a polished rail), open where the stair arrives
      const rail = (x0, z0, x1, z1) => { const ax = Math.abs(x1 - x0) > 0.1, len = ax ? x1 - x0 : z1 - z0; k.box((x0 + x1) / 2, H1, (z0 + z1) / 2, ax ? len : 0.05, 1.0, ax ? 0.05 : len, 0xa8c8d8); k.box((x0 + x1) / 2, H1 + 1.0, (z0 + z1) / 2, ax ? len : 0.1, 0.06, ax ? 0.1 : len, 0x3a2a1e); k.cols.push({ x0: Math.min(x0, x1) - 0.06, x1: Math.max(x0, x1) + 0.06, z0: Math.min(z0, z1) - 0.06, z1: Math.max(z0, z1) + 0.06, y0: H1, y1: H1 + 1.1 }); };
      rail(-2.6, -2.2, -2.6, hd - 0.2); rail(2.6, -2.2, 2.6, hd - 0.2); rail(-2.6, -2.2, -1.35, -2.2); rail(1.35, -2.2, 2.6, -2.2);
      FURN.chandelier(k, 0, H - 1.6, 4.5); FURN.chandelier(k, 0, H - 1.6, 8.0);
      // ----- ground floor walls
      const G = H1 - 0.3;
      iwall(k, 'z', -4, -hd, hd, 0, G, wall, [[-6.8, -5.2], [1.0, 4.0]]); // foyer|living (wide), dining|kitchen
      iwall(k, 'x', -2, -hw, -4, 0, G, wall2, [[-9.6, -8.4]]); // kitchen|living
      iwall(k, 'z', 4, -hd, hd, 0, G, wall, [[-6.8, -5.2], [-1.0, 2.0], [6.4, 7.6]]); // dining|office, foyer|bar, foyer|powder
      iwall(k, 'x', -3, 4, hw, 0, G, wall2); // office|bar
      iwall(k, 'x', 4, 4, hw, 0, G, wall2, [[12.2, 13.4]]); // bar|motor-court stair (clear of the back bar)
      iwall(k, 'z', 8, 4, hd, 0, G, wall2); // powder|stair
      // foyer: console, plants, art, a statue on a plinth
      k.box(-3.5, 0, 8.5, 0.5, 0.85, 2.0, wood, { col: true }); k.box(-3.5, 0.85, 8.5, 0.55, 0.04, 2.05, marble2);
      FURN.plant(k, -3.4, 0, 9.4, 1.1); FURN.plant(k, 3.4, 0, 9.4, 1.1); FURN.art(k, -3.92, 1.4, 4.6, 1, 1.6, 1.1, 0x8a2f3a);
      k.box(3.2, 0, 4.5, 0.8, 1.0, 0.8, marble2, { col: true }); k.box(3.2, 1.0, 4.5, 0.4, 0.9, 0.4, gold);
      // living room: sectional, media wall, fireplace, rug, armchairs, lamps
      FURN.rug(k, -9, 0, 4.5, 6.5, 4.8, 0x2a3a52, 0x3a4a62);
      FURN.sofa(k, -9, 0, 3.2, 0, 3.6, 0x3a3f46); FURN.sofa(k, -11.6, 0, 5.4, 1, 2.4, 0x3a3f46);
      FURN.coffeeTable(k, -9, 0, 5.0, 0, 1.8, 0.9, 0x1a1c20);
      k.box(-9, 0, hd - 0.35, 5.0, 0.5, 0.5, 0x1a1c20, { col: true }); FURN.tv(k, -9, 0.4, hd - 0.2, 2, 3.4, false);
      FURN.fireplace(k, -hw + 0.3, 0, 4.5, 1, 2.0); FURN.armchair(k, -5.2, 0, 6.6, 3, 0x6a4a3a); FURN.lamp(k, -13.4, 0, 1.0); FURN.lamp(k, -4.6, 0, 1.0);
      FURN.art(k, -hw + 0.02, 1.6, 1.0, 1, 1.4, 1.0, 0x2a5f9e); FURN.plant(k, -13.3, 0, 9.3);
      // kitchen: a long run with a range hood on the back wall, an island with stools, a second fridge
      FURN.kitchenRun(k, -9.0, 0, -hd + 0.35, 0, 8.6, { upper: true, hood: true, base: 0x2a2c30, top: 0xe8e4dc, fridgeC: 0xb8bcc2 });
      FURN.island(k, -9.0, 0, -6.2, 0, 3.4, 0x1a1c20, 0xe8e4dc, 4);
      FURN.kitchenRun(k, -hw + 0.35, 0, -4.0, 1, 2.6, { upper: false, fridge: false, base: 0x2a2c30, top: 0xe8e4dc });
      for (const lx of [-10.2, -7.8]) FURN.ceilingLight(k, lx, G + 0.3, -6.2, 1.0);
      // dining room under the gallery: a table for ten, a sideboard, pendant lights
      FURN.diningSet(k, 0, 0, -6.0, 1, 10, 0x2a2620); FURN.ceilingLight(k, 0, G + 0.3, -7.2, 1.2); FURN.ceilingLight(k, 0, G + 0.3, -4.8, 1.2);
      k.box(0, 0, -hd + 0.35, 3.0, 0.9, 0.5, wood, { col: true }); FURN.art(k, 0, 1.5, -hd + 0.02, 0, 2.2, 1.2, 0x5a3a7a);
      // office: desk with the laptop, bookshelves, the safe, a map on the wall
      FURN.desk(k, 9.5, 0, -7.0, 0, 2.0, true, 0x3a2a1e); k.box(9.5, 0, -8.4, 0.9, 1.15, 0.12, 0x2a2a2e);
      FURN.bookshelf(k, hw - 0.25, 0, -6.5, 3, 3.0, rng, 2.4); FURN.bookshelf(k, 6.0, 0, -hd + 0.25, 0, 3.0, rng, 2.4);
      FURN.safe(k, hw - 0.45, 0, -3.6, 3); FURN.armchair(k, 6.0, 0, -4.2, 1, 0x4a2a1a);
      k.box(4.1, 1.2, -8.7, 0.04, 1.3, 1.6, 0xc8b88a); for (let i = 0; i < 8; i++) k.box(4.12, 1.3 + (i % 3) * 0.4, -9.3 + i * 0.16, 0.01, 0.06, 0.06, 0xd23a2a);
      // bar lounge
      FURN.bar(k, 9.5, 0, 2.6, 2, 4.0, 4); FURN.sofa(k, 6.4, 0, -1.6, 0, 2.4, 0x5a1a2a); FURN.armchair(k, 12.6, 0, -1.6, 0, 0x5a1a2a); FURN.coffeeTable(k, 8.8, 0, -0.6, 0, 1.2, 0.7, 0x1a1c20);
      FURN.rug(k, 9, 0, -0.8, 5.5, 3.0, 0x3a1a1a, 0x5a2a22);
      // powder room
      FURN.toilet(k, 7.4, 0, 9.4, 2); FURN.vanity(k, 5.2, 0, 9.5, 2, 0.8, 0x2a2c30);
      // stairs down to the motor court
      for (let i = 0; i < 6; i++) k.box(11, -0.02, 6.0 + i * 0.6, 3.6, 0.03, 0.55, i % 2 ? 0x3a3d42 : 0x44474d, { flat: true });
      k.box(11, 0, 9.6, 3.6, 2.4, 0.1, 0x2a2c30); k.glow(11, 2.5, 9.5, 2.4, 0.18, 0.04, 0x8fe39b, 2.4);
      k.box(9.2, 0, 7.8, 0.12, 1.0, 3.6, 0x3a3d42); k.box(12.8, 0, 7.8, 0.12, 1.0, 3.6, 0x3a3d42);
      // ground floor lights under the slab
      for (const [lx, lz] of [[-9, 1.5], [-9, 6.5], [9.5, -6.5], [9.5, 0.5], [6, 7], [11, 7]]) FURN.ceilingLight(k, lx, G + 0.3, lz, 1.2);
      // ----- upper floor walls (from H1 up)
      iwall(k, 'z', -4, -hd, hd, H1, H2, wall, [[-6.6, -5.4], [5.4, 6.6]]); // hall|master, gallery|bed2
      iwall(k, 'z', 4, -hd, hd, H1, H2, wall, [[-6.6, -5.4], [5.4, 6.6]]); // hall|game, gallery|bed3
      iwall(k, 'x', 1, -hw, -4, H1, H2, wall2, [[-11.6, -10.4]]); // master|ensuite
      iwall(k, 'z', -8, 1, hd, H1, H2, wall2); // ensuite|bed2
      iwall(k, 'x', 1, 4, hw, H1, H2, wall2, [[10.9, 12.1]]); // game|bath2
      iwall(k, 'z', 9, 1, hd, H1, H2, wall2); // bed3|bath2
      const U = H1;
      // gallery and hall: bench, art, plants, a rug
      FURN.rug(k, 0, U, -6.0, 6.0, 5.0, 0x7a1a2a, 0x9a2a3a); FURN.sofa(k, 0, U, -hd + 0.6, 0, 2.6, 0xe6e2da);
      FURN.art(k, 0, U + 1.4, -hd + 0.02, 0, 2.4, 1.3, 0x2a5f9e); FURN.plant(k, -3.4, U, -hd + 0.5); FURN.plant(k, 3.4, U, -hd + 0.5);
      FURN.plant(k, -3.3, U, hd - 0.6, 0.9); FURN.plant(k, 3.3, U, hd - 0.6, 0.9);
      // master suite
      FURN.rug(k, -9.5, U, -5.0, 5.0, 4.2, 0xc8bca8, 0xd8ccb8);
      FURN.bed(k, -9.5, U, -hd + 1.35, 0, 2.2, 2.4, 0x6a3a8a, 0x1a1c20); FURN.nightstand(k, -11.1, U, -hd + 0.4, 0); FURN.nightstand(k, -7.9, U, -hd + 0.4, 0);
      FURN.wardrobe(k, -hw + 0.35, U, -3.0, 1, 2.0, 0x2c2e33); FURN.dresser(k, -5.0, U, -3.2, 3, 1.6, 0x2c2e33, true);
      FURN.sofa(k, -9.5, U, -1.0, 2, 2.2, 0xe6e2da); FURN.tv(k, -4.6, U, -8.4, 3, 1.8);
      FURN.lamp(k, -12.8, U, -1.0);
      // ensuite
      FURN.tub(k, -12.6, U, 6.0, 1, 1.8); FURN.vanity(k, -11.0, U, hd - 0.35, 2, 1.6, 0x2a2c30); FURN.shower(k, -9.2, U, 2.2, 0, 1.2); FURN.toilet(k, -13.3, U, 2.0, 1);
      // bedroom 2
      FURN.bed(k, -6.0, U, hd - 1.3, 2, 1.6, 2.1, 0x2f5d8a); FURN.nightstand(k, -7.4, U, hd - 0.35, 2); FURN.desk(k, -6.0, U, 1.5, 0, 1.2, false); FURN.wardrobe(k, -7.6, U, 4.0, 1, 1.2);
      // bedroom 3
      FURN.bed(k, 6.5, U, hd - 1.3, 2, 1.6, 2.1, 0x3a6a4a); FURN.nightstand(k, 7.9, U, hd - 0.35, 2); FURN.dresser(k, 6.5, U, 1.5, 0, 1.4); FURN.wardrobe(k, 8.6, U, 4.2, 3, 1.2);
      // bathroom 2
      FURN.shower(k, 13.4, U, 2.0, 3, 1.1); FURN.toilet(k, 13.4, U, 6.0, 3); FURN.vanity(k, 11.5, U, hd - 0.35, 2, 1.0);
      // game room: pool table, big screen with a sectional, arcade cabinets, a card table, a drinks cart
      FURN.poolTable(k, 9.0, U, -6.0, 1); FURN.ceilingLight(k, 9.0, H, -6.0, 1.6);
      k.box(hw - 0.35, U, -2.0, 0.5, 0.5, 4.0, 0x1a1c20, { col: true }); FURN.tv(k, hw - 0.2, U + 0.4, -2.0, 3, 3.2, false);
      FURN.sofa(k, 9.6, U, -1.6, 1, 3.0, 0x2a3a52);
      FURN.arcade(k, 5.0, U, -hd + 0.5, 0, 0x6a3a8a); FURN.arcade(k, 6.0, U, -hd + 0.5, 0, 0xd23a2a);
      FURN.diningSet(k, 12.2, U, -8.4, 0, 4, 0x1f6a3e); k.box(4.5, U, -1.0, 0.6, 0.9, 0.5, 0x8a8a8a, { col: true });
      for (let i = 0; i < 4; i++) k.glow(4.5 - 0.18 + i * 0.12, U + 0.92, -1.0, 0.08, 0.26, 0.08, [0xffb547, 0x46d4c4, 0xd28cff, 0x7fe08f][i], 1.3);
      FURN.rug(k, 9.0, U, -6.0, 4.4, 5.0, 0x2a2a2e);
      // upper ceiling lights in the rooms (the room() grid covers the rest)
      for (const [lx, lz] of [[-9.5, -4.5], [-6, 5.5], [6.5, 5.5], [-11, 5.5], [11.5, 5.5]]) FURN.ceilingLight(k, lx, H, lz, 1.0);
      // windows: the skyline behind glass, both floors
      for (const [x, z, ry, w] of [[-9, -hd + 0.06, 0, 3.0], [9.5, -hd + 0.06, 0, 2.4], [-hw + 0.06, -6.0, Math.PI / 2, 2.8], [hw - 0.06, 0.5, -Math.PI / 2, 2.2]]) FURN.window(def, x, 1.1, z, w, 1.6, ry);
      for (const [x, z, ry, w] of [[-9.5, -hd + 0.06, 0, 3.0], [9.0, -hd + 0.06, 0, 2.6], [-6.0, hd - 0.06, Math.PI, 2.2], [6.5, hd - 0.06, Math.PI, 2.2], [-hw + 0.06, -4.0, Math.PI / 2, 2.4]]) FURN.window(def, x, H1 + 1.0, z, w, 1.6, ry);
    }
  };
  const U = H1;
  def.spots = [
    { id: 'exit', x: 0, z: hd - 0.7, r: 1.3, label: 'Leave' },
    { id: 'upstairs', x: 0, z: 6.9, r: 1.1, label: 'Grand staircase · walk up to the bedrooms and the game room', hint: true }
  ];
  if (owned) def.spots.push(
    { id: 'tv', x: -9, z: 6.6, r: 1.4, label: 'Watch the news' },
    { id: 'fridge', x: -12.2, z: -hd + 1.4, r: 1.3, label: 'Grab a snack' },
    { id: 'laptop', x: 9.5, z: -5.6, r: 1.3, label: 'Run your empire' },
    { id: 'stash', x: hw - 1.3, z: -3.6, r: 1.3, label: 'Safe · stash & property' },
    { id: 'bar', x: 9.5, z: 1.4, r: 1.3, label: 'Mix a drink' },
    { id: 'motorcourt', x: 11, z: 6.8, r: 1.6, label: 'Down to the motor court' },
    { id: 'bed', x: -9.5, y: U, z: -hd + 3.2, r: 1.6, label: 'Sleep & save' },
    { id: 'wardrobe', x: -hw + 1.2, y: U, z: -3.0, r: 1.3, label: 'Wardrobe' },
    { id: 'pool', x: 7.6, y: U, z: -6.0, r: 1.3, label: 'Shoot some pool' },
    { id: 'tv', x: 11.6, y: U, z: -2.0, r: 1.3, label: 'Big screen · watch the news' }
  );
  // the 'upstairs' marker is only a hint, not an action
  def.spots = def.spots.filter(s => !s.hint);
  def.noExit = true;
  return def;
}

// the penthouse: a glass apartment on the top tier of Valen Tower with a terrace all the way round.
// Back: master suite (ensuite, safe), the elevator hall, a guest room with its own shower room.
// Front, open plan: a lounge with a sectional and a wall screen, a study corner, a kitchen with an
// island, dining for six and a bar; the terrace door in the middle; a hot tub outside.
Object.assign(INTERIOR_DEFS.penthouse, {
  w: 16, d: 14, h: 3.6, exit: { x: 0, z: -5.6 }, spawn: { x: 0, z: -5.2 }, spawnH: 0, noDoor: true, noExit: true, realView: true, windows: null,
  build(k, rng) {
    const W = 16, D = 14, H = 3.6, T = 12, hw = W / 2, hd = D / 2;
    k.box(0, -0.25, 0, T * 2 + 0.4, 0.25, T * 2 + 0.4, 0xb8b0a0, { flat: true });
    k.tiles(W, D, 0x2a2c30, 0x34363c, 1.5);
    k.box(0, H, 0, W + 0.6, 0.3, D + 0.6, 0xeeeae2, { flat: true });
    // glass walls: mullions, a sill and a head beam; colliders all round except the terrace door
    const frame = 0x1a1c20;
    for (const [x0, z0, x1, z1] of [[-hw, -hd, hw, -hd], [-hw, hd, hw, hd], [-hw, -hd, -hw, hd], [hw, -hd, hw, hd]]) {
      const len = Math.hypot(x1 - x0, z1 - z0), ax = Math.abs(x1 - x0) > 0.1, n = Math.round(len / 2);
      for (let i = 0; i <= n; i++) { const t = i / n; k.box(x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, 0.12, H, 0.12, frame); }
      k.box((x0 + x1) / 2, 0, (z0 + z1) / 2, ax ? len : 0.14, 0.3, ax ? 0.14 : len, frame);
      k.box((x0 + x1) / 2, H - 0.3, (z0 + z1) / 2, ax ? len : 0.14, 0.3, ax ? 0.14 : len, frame);
    }
    const gl = (x0, z0, x1, z1) => k.cols.push({ x0: Math.min(x0, x1) - 0.08, x1: Math.max(x0, x1) + 0.08, z0: Math.min(z0, z1) - 0.08, z1: Math.max(z0, z1) + 0.08, y0: 0, y1: H });
    gl(-hw, -hd, hw, -hd); gl(-hw, -hd, -hw, hd); gl(hw, -hd, hw, hd);
    gl(-hw, hd, -1.6, hd); gl(1.6, hd, hw, hd);
    // terrace: decking, planters, loungers, a hot tub, an outdoor lounge, a glass railing round the edge
    k.box(0, -0.02, 0, T * 2, 0.03, T * 2, 0x8a6a4a, { flat: true });
    for (const [x0, z0, x1, z1] of [[-T, -T, T, -T], [-T, T, T, T], [-T, -T, -T, T], [T, -T, T, T]]) {
      const ax = Math.abs(x1 - x0) > 0.1, len = ax ? x1 - x0 : z1 - z0;
      k.box((x0 + x1) / 2, 0, (z0 + z1) / 2, ax ? len : 0.08, 1.1, ax ? 0.08 : len, 0x9aa8b4);
      k.box((x0 + x1) / 2, 1.1, (z0 + z1) / 2, ax ? len : 0.12, 0.06, ax ? 0.12 : len, 0x2a2d33);
      k.cols.push({ x0: Math.min(x0, x1) - 0.15, x1: Math.max(x0, x1) + 0.15, z0: Math.min(z0, z1) - 0.15, z1: Math.max(z0, z1) + 0.15, y0: 0, y1: 1.6 });
    }
    for (const [x, z] of [[-10, 10], [10, 10], [10, -10], [-10, -10]]) { k.box(x, 0, z, 1.2, 0.7, 1.2, 0x5a5e62, { col: true }); k.box(x, 0.7, z, 1.0, 1.4, 1.0, 0x2f6a3a); }
    for (const x of [-2.4, 2.4]) { k.box(x, 0, 10, 0.8, 0.35, 2.0, 0xf2f0ec, { col: true }); }
    k.box(-10.0, 0, 1.0, 2.6, 0.8, 2.6, 0xd8d4cc, { col: true }); k.glow(-10.0, 0.75, 1.0, 2.2, 0.04, 2.2, 0x46d4c4, 1.1);
    FURN.sofa(k, 9.6, 0, 1.5, 3, 2.6, 0xe6e2da); FURN.coffeeTable(k, 8.4, 0, 1.5, 3, 1.2, 0.7, 0x8a6a4a);
    // partitions (painted), the hall and the elevator
    const wc = 0xd8d4cc;
    iwall(k, 'z', -2, -hd, -1.5, 0, H, wc, [[-3.6, -2.4]]); iwall(k, 'z', 2, -hd, -1.5, 0, H, wc, [[-3.6, -2.4]]);
    iwall(k, 'x', -1.5, -hw, -2, 0, H, wc); iwall(k, 'x', -1.5, 2, hw, 0, H, wc);
    iwall(k, 'z', -6.2, -hd, -4.2, 0, H, wc); iwall(k, 'x', -4.2, -hw, -6.2, 0, H, wc, [[-7.6, -6.6]]); // master ensuite
    iwall(k, 'z', 6.2, -hd, -4.2, 0, H, wc); iwall(k, 'x', -4.2, 6.2, hw, 0, H, wc, [[6.6, 7.6]]); // guest shower room
    k.box(0, 0, -hd + 0.06, 1.9, 2.5, 0.08, 0x9ea4aa); k.box(0, 0, -hd + 0.1, 0.03, 2.4, 0.04, 0x55595e); k.glow(0, 2.65, -hd + 0.12, 0.7, 0.16, 0.03, 0xffd84d, 2.5);
    FURN.art(k, -1.92, 1.3, -4.6, 1, 1.0, 1.3, 0x8a2f3a); FURN.art(k, 1.92, 1.3, -4.6, 3, 1.0, 1.3, 0x2a5f9e); FURN.plant(k, 1.5, 0, -6.4, 0.8);
    // master suite
    FURN.rug(k, -4.2, 0, -4.2, 3.6, 2.6, 0xc8bca8);
    FURN.bed(k, -4.4, 0, -5.75, 0, 2.0, 2.4, 0x6a3a8a, 0x1a1c20); FURN.nightstand(k, -5.75, 0, -6.75, 0); FURN.nightstand(k, -3.05, 0, -6.75, 0);
    FURN.wardrobe(k, -7.65, 0, -2.6, 1, 1.8, 0x2c2e33); FURN.safe(k, -2.45, 0, -6.3, 3);
    FURN.tub(k, -7.4, 0, -6.0, 0, 1.7); FURN.vanity(k, -6.55, 0, -5.7, 3, 0.9, 0x2a2c30);
    // guest room
    FURN.bed(k, 4.4, 0, -5.75, 0, 1.6, 2.1, 0x2f5d8a); FURN.nightstand(k, 3.3, 0, -6.75, 0); FURN.dresser(k, 4.4, 0, -1.85, 2, 1.4, 0x2c2e33);
    FURN.shower(k, 7.4, 0, -6.4, 3, 1.0); FURN.toilet(k, 7.55, 0, -5.0, 3);
    // lounge: media wall on the master's front wall, a sectional facing it, a reading chair
    k.box(-5.0, 0, -1.2, 4.4, 0.45, 0.4, 0x1a1c20, { col: true }); FURN.tv(k, -5.0, 0.3, -1.38, 0, 3.0, false);
    FURN.sofa(k, -5.0, 0, 1.7, 2, 3.6, 0xe6e2da); FURN.sofa(k, -7.4, 0, 0.3, 1, 2.2, 0xe6e2da); FURN.coffeeTable(k, -5.0, 0, 0.35, 0, 1.6, 0.8, 0x111214);
    FURN.rug(k, -5.0, 0, 0.9, 5.0, 3.6, 0xc8bca8, 0xd4c8b4); FURN.lamp(k, -2.6, 0, 0.0);
    // study corner
    FURN.desk(k, -6.6, 0, 6.35, 2, 1.6, true, 0x2c2e33); FURN.armchair(k, -3.9, 0, 6.0, 2, 0x4a2a1a); FURN.plant(k, -7.4, 0, 3.4, 0.9);
    // kitchen, dining, bar
    FURN.kitchenRun(k, 5.0, 0, -1.15, 0, 5.6, { upper: true, hood: true, base: 0x1a1c20, top: 0xd8d4cc, fridgeC: 0xb8bcc2, upperC: 0x2c2e33 });
    FURN.island(k, 5.0, 0, 1.2, 0, 2.6, 0x1a1c20, 0xe8e4dc, 3);
    FURN.diningSet(k, 3.0, 0, 4.6, 0, 6, 0x2a2620); FURN.ceilingLight(k, 3.0, H, 4.6, 1.4);
    FURN.bar(k, 6.6, 0, 4.5, 3, 3.0, 3);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) k.glow(-4 + i * 4, H - 0.08, -3 + j * 6, 1.1, 0.03, 0.4, 0xfff6e8, 2.4);
  },
  spots: [
    { id: 'elevator', x: 0, z: -5.8, r: 1.3, label: 'Elevator' },
    { id: 'bed', x: -4.4, z: -3.9, r: 1.3, label: 'Sleep & save' },
    { id: 'stash', x: -2.95, z: -5.1, r: 0.9, label: 'Safe · stash & property' },
    { id: 'wardrobe', x: -6.7, z: -2.6, r: 1.1, label: 'Wardrobe' },
    { id: 'tv', x: -5.0, z: 2.9, r: 1.3, label: 'Watch the news' },
    { id: 'laptop', x: -6.6, z: 5.1, r: 1.2, label: 'Run your empire' },
    { id: 'fridge', x: 2.9, z: -0.3, r: 1.1, label: 'Grab a snack' },
    { id: 'bar', x: 5.3, z: 4.5, r: 1.2, label: 'Mix a drink' },
    { id: 'view', x: 0, z: 10.5, r: 1.8, label: 'Take in the view' }
  ]
});

/* ---------------- drive-in garages under the street ----------------
   The mansion's ten-car motor court and the penthouse's four-car residents' garage. You drive
   through the door, the screen dips, and you are inside; drive into the exit lane to come back
   out. On foot: the elevator (penthouse) or the stairs (mansion). */
const VSPACE_DEFS = {
  mansion: { prop: 'mansion', name: 'Crestmoor Motor Court', door: 'mansionGarage', w: 32, d: 24, h: 4.6, bays: 10, at: { x: 116, z: 36 }, floor: 0x2a2c30, floor2: 0x34363c, wall: 0xe8e2d4, accent: 0xd8b04a },
  penthouse: { prop: 'penthouse', name: 'Valen Tower Garage', door: 'towerGarage', w: 22, d: 18, h: 3.6, bays: 4, at: null, floor: 0x3a3d42, floor2: 0x44474d, wall: 0xc8ccd0, accent: 0x4d8dff }
};
const VSPACE_RECTS = [];
function vspaceFloor(x, z, y) { for (const r of VSPACE_RECTS) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && Math.abs(y - r.y) < 12) return r.y; return null; }
class VSpaces {
  constructor(g) {
    this.g = g; this.list = [];
    const w = g.world, tb = w.block(6, 5);
    for (const id in VSPACE_DEFS) {
      const D = Object.assign({ id }, VSPACE_DEFS[id]);
      const at = D.at || { x: tb.cx + 4, z: tb.cz - 6 };
      D.ox = at.x; D.oz = at.z;
      const W = D.w, Dd = D.d, H = D.h, k = new InteriorKit(H);
      k.room(W, Dd, H, { floor: D.floor, wall: D.wall, ceil: 0x55585c, trim: 0x1a1c20, band: [0, 1.0], bandC: D.accent, lights: [Math.round(W / 6), 2], lightC: 0xf4f8ff });
      k.tiles(W, Dd, D.floor, D.floor2, 2);
      // two rows of bays facing each other across the aisle; the exit lane is at the east end
      const per = Math.ceil(D.bays / 2), bw = 3.4, x0 = -W / 2 + 2 + bw / 2;
      D.bays = [];
      for (let r = 0; r < 2; r++) for (let i = 0; i < per && D.bays.length < VSPACE_DEFS[id].bays; i++) {
        const lx = x0 + i * bw, lz = r ? Dd / 2 - 3.2 : -Dd / 2 + 3.2;
        D.bays.push({ x: D.ox + lx, z: D.oz + lz, h: r ? 0 : Math.PI, y: VY, kind: 'under' });
        k.box(lx - bw / 2, -0.004, lz, 0.1, 0.012, 5.2, 0xe8e8e8, { flat: true });
        k.box(lx + bw / 2, -0.004, lz, 0.1, 0.012, 5.2, 0xe8e8e8, { flat: true });
        k.glow(lx, H - 0.1, lz, 1.4, 0.04, 0.3, 0xffffff, 2.6);
        k.box(lx, 0, r ? Dd / 2 - 0.2 : -Dd / 2 + 0.2, 1.2, 0.12, 0.3, D.accent);
      }
      // pillars between the bays, the exit lane with its door, and the way back in on foot
      for (let i = 0; i <= per; i++) for (const r of [-1, 1]) if (i % 2 === 0) k.box(x0 - bw / 2 + i * bw, 0, r * (Dd / 2 - 6.2), 0.5, H, 0.5, 0xb8b4ac, { col: true });
      k.box(W / 2 - 0.05, 0, 0, 0.1, 3.2, 5.6, 0x2a2d33); k.glow(W / 2 - 0.12, 3.35, 0, 0.03, 0.18, 2.6, 0x7fe08f, 2.4);
      for (let i = 0; i < 6; i++) k.box(W / 2 - 1.5 - i * 1.6, -0.004, 0, 0.9, 0.012, 0.18, 0xf2c230, { flat: true });
      k.box(-W / 2 + 0.1, 0, 0, 0.1, 2.5, 1.9, 0x9ea4aa); k.glow(-W / 2 + 0.16, 2.65, 0, 0.03, 0.16, 0.7, 0xffd84d, 2.5);
      if (id === 'mansion') { k.box(-W / 2 + 6, 0, 0, 5, 0.25, 5, 0x1a1c20, { col: false }); k.glow(-W / 2 + 6, 0.26, 0, 4.6, 0.02, 4.6, 0xd8b04a, 0.5); }
      const parts = k.build(), grp = new THREE.Group(); grp.position.set(D.ox, VY, D.oz);
      grp.add(parts.main); if (parts.glow) grp.add(parts.glow); grp.visible = false; g.scene.add(grp); D.group = grp;
      for (const c of k.cols) g.world.grid.add({ x0: D.ox + c.x0, x1: D.ox + c.x1, z0: D.oz + c.z0, z1: D.oz + c.z1, y0: VY + c.y0 - 0.5, y1: VY + c.y1, kind: 'vint' });
      VSPACE_RECTS.push({ x0: D.ox - W / 2, x1: D.ox + W / 2, z0: D.oz - Dd / 2, z1: D.oz + Dd / 2, y: VY, id });
      D.entry = { x: D.ox + W / 2 - 4, z: D.oz, h: -Math.PI / 2 };
      D.exitZone = { x0: D.ox + W / 2 - 2.6, x1: D.ox + W / 2, z0: D.oz - 3, z1: D.oz + 3 };
      D.foot = { x: D.ox - W / 2 + 1.6, z: D.oz, h: Math.PI / 2 };
      D.spots = [{ id: id === 'penthouse' ? 'elevator' : 'stairs', x: D.ox - W / 2 + 1.1, z: D.oz, r: 1.6, label: id === 'penthouse' ? 'Elevator' : 'Up to the house' }, { id: 'walkout', x: D.ox + W / 2 - 1.2, z: D.oz + 2.2, r: 1.2, label: 'Walk out' }];
      const dr = g.doors.byId(D.door); D.doorE = dr; D.street = dr ? { x: dr.d.x, z: dr.d.z, face: dr.d.face } : null;
      D.def = { id: 'vs:' + id, name: D.name, door: D.street ? { x: D.street.x + FACE_V[D.street.face][0] * 2, z: D.street.z + FACE_V[D.street.face][1] * 2, h: Math.atan2(FACE_V[D.street.face][0], FACE_V[D.street.face][1]) } : { x: D.ox, z: D.oz, h: 0 } };
      this.list.push(D);
    }
    this.cool = 0;
  }
  byProp(pid) { return this.list.find(D => D.prop === pid) || null; }
  get cur() { const p = this.g.player; return p.interior && p.interior.vspace ? this.list.find(D => D.id === p.interior.vspace) : null; }
  owned(D) { return !!(this.g.uw && this.g.uw.props.owned(D.prop)); }
  update(dt) {
    const g = this.g, p = g.player, pv = p.state === 'vehicle' ? p.vehicle : null;
    this.cool -= dt; if (this.cool > 0 || g.fading || g.state !== 'playing') return;
    const D = this.cur;
    if (D) {
      interiorLighting(g);
      if (pv) { const z = D.exitZone; if (pv.pos.x > z.x0 && pv.pos.x < z.x1 && pv.pos.z > z.z0 && pv.pos.z < z.z1 && pv.localVel().z > 0.5) this.leave(D, pv); }
      return;
    }
    if (!pv || p.interior) return;
    for (const S of this.list) {
      if (!S.street || !S.doorE || S.doorE.open < 0.6 || !this.owned(S)) continue;
      const f = FACE_V[S.street.face], dx = pv.pos.x - S.street.x, dz = pv.pos.z - S.street.z;
      const out = dx * f[0] + dz * f[1], lat = Math.abs(dx * f[1] - dz * f[0]);
      const vin = -(pv.vel.x * f[0] + pv.vel.y * f[1]);
      if (out < 3.4 && out > -1 && lat < 2.6 && vin > 0.4) { this.enter(S, pv); break; }
    }
  }
  _place(v, x, z, h) { v.pos.set(x, VY, z); v.h = h; v.vel.set(0, 0); v.yawRate = 0; v.airborne = false; v.yVel = 0; v._lastG = undefined; v.syncMesh(0); }
  enter(D, v) {
    const g = this.g, p = g.player; this.cool = 1.5;
    g.fade(() => {
      // arriving from a room upstairs (elevator, stairs): that room is put away first
      const I = g.content.interiors; if (I.cur) { I.cur.group.visible = false; I.dispose(I.cur); I.cur = null; }
      g.chunks.wide(false);
      D.group.visible = true;
      if (v) { this._place(v, D.entry.x, D.entry.z, D.entry.h); p.pos.set(v.pos.x, VY, v.pos.z); }
      else { p.pos.set(D.foot.x, VY, D.foot.z); p.h = D.foot.h; p.vel.set(0, 0, 0); p.onGround = true; }
      p.interior = { id: 'vs:' + D.id, floor: VY, vspace: D.id, def: D.def };
      g.cam.yaw = v ? v.h : D.foot.h; g.cam.pitch = -0.15; g.cam.init = false;
      if (g.vreg) g.vreg.t = 0;
      g.ui.toast(D.name); g.audio.play('door');
    });
  }
  leave(D, v) {
    const g = this.g, p = g.player; this.cool = 2;
    const S = D.street, f = FACE_V[S.face], h = Math.atan2(f[0], f[1]);
    if (D.doorE) { D.doorE.force = true; setTimeout(() => { D.doorE.force = false; }, 3500); }
    g.fade(() => {
      D.group.visible = false; p.interior = null;
      const x = S.x + f[0] * 6.5, z = S.z + f[1] * 6.5;
      if (v) { v.pos.set(x, groundY(x, z), z); v.h = h; v.vel.set(Math.sin(h) * 3, Math.cos(h) * 3); v.yawRate = 0; v.syncMesh(0); p.pos.set(x, v.pos.y, z); }
      else { p.pos.set(S.x + f[0] * 2.4, groundY(S.x + f[0] * 2.4, S.z + f[1] * 2.4), S.z + f[1] * 2.4); p.h = h; p.vel.set(0, 0, 0); }
      g.cam.yaw = h; g.cam.pitch = -0.12; g.cam.init = false;
      if (g.vreg) g.vreg.t = 0;
      g.audio.play('door');
    });
  }
  findAction() {
    const g = this.g, p = g.player, D = this.cur; if (!D || p.state !== 'foot') return null;
    for (const s of D.spots) if (Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < s.r) {
      if (s.id === 'elevator') return { label: 'Elevator', act: () => g.content.openElevator() };
      if (s.id === 'stairs') return { label: 'Up to the house', act: () => g.content.enterHome('mansion') };
      if (s.id === 'walkout') return { label: 'Walk out to the street', act: () => this.leave(D, null) };
    }
    return null;
  }
  // used when the game resets or loads: nobody is left underground
  reset() { for (const D of this.list) D.group.visible = false; }
}

// lighting for a closed room under the street (interiors, the drive-in garages)
function interiorLighting(g) {
  const env = g.env;
  env.sun.intensity = 0.0; env.headL.intensity = 0; env.headR.intensity = 0; env.police.intensity = 0;
  env.hemi.color.setRGB(1.0, 0.96, 0.9); env.hemi.groundColor.setRGB(0.42, 0.38, 0.34); env.hemi.intensity = 1.55;
  env.rainMesh.visible = false; g.scene.fog.density = 0.0004;
  g.renderer.toneMappingExposure = 1.0;
  const I = g.content && g.content.interiors;
  if (I && I.sky) {
    I.sky.bg.color.copy(U.uHorizon.value).lerp(U.uZenith.value, 0.35).multiplyScalar(1.25 + (1 - env.night) * 0.6);
    I.sky.sil.color.setScalar(0.35 + (1 - env.night) * 0.4);
    I.sky.lit.opacity = clamp(env.night * 1.2, 0, 1);
  }
}
// The Valen Royale gaming floor: lobby with cashier and bar, Royale Billions slot banks, blackjack and
// roulette tables (no limits: every table takes any stake), one big no-limit Hold'em table and the VIP
// lounge behind a rope (open to everyone, it is just quieter). Built on entry, disposed on exit.
const CASINO_GAMES = [['bj', 'Blackjack'], ['roul', 'Roulette'], ['poker', 'Hold’em']];
const CASINO_FELT = [0x1f6a3e, 0x1d4f8a, 0x7a1a2a, 0x141418];
const CASINO_TRIM = [0x7fe08f, 0x7fb2ff, 0xff4d5e, 0xffd84d];
function casinoInteriorDef() {
  const W = 40, D = 28, H = 6;
  const tables = [];
  // t picks the felt colour; n is the table number shown to the player
  for (let t = 0; t < 3; t++) { tables.push({ g: 'bj', t, n: t, x: -2, z: 4.5 - t * 4 }); tables.push({ g: 'roul', t, n: t, x: 5, z: 4.5 - t * 4 }); }
  tables.push({ g: 'poker', t: 2, n: 0, x: 12, z: 0.5, big: true });
  tables.push({ g: 'bj', t: 3, n: 3, x: -2, z: -10.5 }, { g: 'roul', t: 3, n: 3, x: 5, z: -10.5 });
  const slots = [['royale', -16, 3.5, 0xff4d5e], ['royale', -11, 3.5, 0x46d4c4], ['royale', -16, -1.5, 0xd28cff], ['royale', -11, -1.5, 0xffd84d], ['royale', -14, -10.5, 0xf4f2ee], ['royale', 12, -10.5, 0xffd84d]];
  const spots = [
    { id: 'g:cashier', x: 15.2, z: 9.6, r: 1.5, label: 'Cashier · records & table access' },
    { id: 'g:bar', x: -14.5, z: 9.6, r: 1.6, label: 'Royale Bar · drink $40' }
  ];
  for (const T of tables) spots.push({ id: `g:${T.g}:${T.n}`, x: T.x, z: T.z + (T.big ? 2.1 : 1.35), r: T.big ? 1.6 : 1.25, label: T.g === 'poker' ? 'Hold’em · no limit · choose your stakes' : `${CASINO_GAMES.find(c => c[0] === T.g)[1]} · table ${T.n + 1} · any stake` });
  for (const [id, x, z] of slots) spots.push({ id: 'g:slot:' + id, x, z: z + 1.2, r: 1.2, label: 'Royale Billions · max jackpot $1,000,000,000' });
  const npcs = [
    { id: 'cashier', x: 15.2, z: 11.6, h: Math.PI, look: { shirt: 0x1a1a1e, pants: 0x1a1a1e, cap: 0xd8a227 } },
    { id: 'bartender', x: -14.5, z: 11.6, h: Math.PI, look: { shirt: 0xf4f2ee, pants: 0x1a1a1e } },
    { id: 'bouncer', x: -0.4, z: -6.1, h: 0, look: { shirt: 0x111111, pants: 0x111111 } }
  ];
  tables.forEach((T, i) => npcs.push({ id: 'dealer' + i, x: T.x, z: T.z - (T.big ? 1.75 : 1.15), h: 0, look: { shirt: 0xf4f2ee, pants: 0x1a1a1e, cap: CASINO_TRIM[T.t] } }));
  [[-16.6, 5.0], [-10.4, 5.0], [-15.4, 0.0], [3.6, 6.2], [10.2, 2.2], [-1.2, -9.0], [0.5, 9.5], [8, 9.8]].forEach(([x, z], i) => npcs.push({ id: 'patron' + i, x, z, h: rand(-Math.PI, Math.PI) }));
  return {
    id: 'casino', place: 'casino', name: 'The Valen Royale', dynamic: true, w: W, d: D, h: H,
    exit: { x: 0, z: D / 2 - 0.9 }, spawnH: Math.PI, exitLabel: 'Leave the casino', spots, npcs,
    build(k) {
      k.room(W, D, H, { floor: 0x5a1420, wall: 0x2a1a36, ceil: 0x1a1022, trim: 0xd8a227, band: [3.6, 0.2], bandC: 0xd8a227, lights: [5, 4], lightC: 0xffe6b8 });
      k.tiles(W, D, 0x5a1420, 0x6a1c2a, 2);
      k.door(0, D / 2 - 0.02, 0, 0x1a0e24, 0xffd84d);
      // lobby: marble strip at the doors, cashier cage (east), bar (west), a gold fountain-sculpture between
      k.box(0, -0.004, D / 2 - 3, 12, 0.012, 6, 0xe8e2d4, { flat: true });
      k.box(15.2, 0, 10.6, 6, 1.15, 0.8, 0x2a1a36, { col: true }); k.box(15.2, 1.15, 10.6, 6.1, 0.06, 0.9, 0xd8a227);
      for (let i = 0; i < 7; i++) k.box(12.4 + i * 0.93, 1.21, 10.6, 0.05, 1.6, 0.05, 0xd8a227);
      k.glow(15.2, 2.9, 10.3, 5.6, 0.35, 0.05, 0xffd84d, 2.2);
      k.box(-14.5, 0, 10.6, 6, 1.1, 0.8, 0x3a2416, { col: true }); k.box(-14.5, 1.1, 10.6, 6.2, 0.06, 1.0, 0x1a1a1e);
      k.box(-14.5, 0, 13.4, 6.4, 2.6, 0.5, 0x1a1a1e, { col: true });
      for (let i = 0; i < 14; i++) k.glow(-17.3 + i * 0.42, 1.2 + (i % 2) * 0.55, 13.1, 0.1, 0.3, 0.1, [0xffb547, 0x46d4c4, 0xd28cff, 0x7fe08f][i % 4], 1.5);
      for (const x of [-16.5, -14.5, -12.5]) { k.box(x, 0, 9.4, 0.45, 0.75, 0.45, 0xd8a227, { col: true }); }
      k.box(0, 0, 7.6, 1.6, 0.6, 1.6, 0xd8a227, { col: true }); k.glow(0, 0.6, 7.6, 0.6, 2.2, 0.6, 0xffe2a0, 1.6);
      // slot banks: a cabinet row per machine type, marquee colour by type
      for (const [, x, z, mc] of slots) for (let i = -1; i <= 1; i++) {
        const cx = x + i * 1.0;
        k.box(cx, 0, z, 0.9, 1.75, 0.7, 0x2a1a36, { col: true });
        k.glow(cx, 1.78, z, 0.86, 0.3, 0.62, mc, 1.9);
        k.glow(cx, 2.12, z, 0.9, 0.34, 0.1, 0xffd84d, 2.1);
        k.glow(cx, 0.95, z + 0.36, 0.7, 0.55, 0.02, 0x1a0e24, 1);
        for (let r = 0; r < 3; r++) k.glow(cx - 0.22 + r * 0.22, 1.03, z + 0.37, 0.18, 0.32, 0.02, 0xf4f2ee, 1.4);
        k.box(cx, 0, z + 0.85, 0.45, 0.55, 0.45, 0x1a1a1e);
      }
      // tables: felt by limit, a lit sign above each
      for (const T of tables) {
        const felt = CASINO_FELT[T.t], trim = CASINO_TRIM[T.t];
        if (T.g === 'roul') {
          k.box(T.x, 0, T.z, 3.0, 0.85, 1.3, 0x3a2416, { col: true }); k.box(T.x, 0.85, T.z, 3.1, 0.05, 1.4, felt);
          k.box(T.x - 1.0, 0.9, T.z, 0.9, 0.12, 0.9, 0x5a3a1a); k.box(T.x - 1.0, 1.02, T.z, 0.6, 0.04, 0.6, 0xd8a227); k.box(T.x - 1.0, 1.06, T.z, 0.12, 0.18, 0.12, 0xd8a227);
          for (let i = 0; i < 12; i++) k.box(T.x - 0.3 + (i % 6) * 0.3, 0.9, T.z - 0.3 + Math.floor(i / 6) * 0.45, 0.24, 0.01, 0.36, i % 2 ? 0xa8242a : 0x15171c);
        } else if (T.g === 'poker') {
          // the one big no-limit table: long felt, padded rail, eight chairs
          k.box(T.x, 0, T.z, 4.6, 0.82, 2.6, 0x3a2416, { col: true }); k.box(T.x, 0.82, T.z, 4.7, 0.08, 2.7, 0x1a1a1e); k.box(T.x, 0.84, T.z, 4.2, 0.07, 2.2, felt);
          k.box(T.x, 0.92, T.z, 1.2, 0.02, 0.5, 0xd8a227);
          for (const [dx, dz] of [[-2.7, 0], [2.7, 0], [-1.4, 1.75], [0, 1.85], [1.4, 1.75], [-1.4, -1.75], [1.4, -1.75]]) k.box(T.x + dx, 0, T.z + dz, 0.45, 0.5, 0.45, 0x1a1a1e);
        } else {
          k.box(T.x, 0, T.z, 2.8, 0.85, 1.25, 0x3a2416, { col: true }); k.box(T.x, 0.85, T.z, 2.9, 0.06, 1.35, felt);
          for (let i = 0; i < 5; i++) k.box(T.x - 1.1 + i * 0.55, 0, T.z + 1.0, 0.42, 0.62, 0.42, 0x1a1a1e);
          k.box(T.x + 0.9, 0.91, T.z - 0.35, 0.35, 0.18, 0.25, 0x5a3a1a);
        }
        k.glow(T.x, 3.1, T.z - 0.1, 2.4, 0.4, 0.08, trim, 1.8);
      }
      // the VIP room: a gold-trimmed wall with a roped opening and a bouncer
      k.box(-12, 0, -7, 16, H, 0.3, 0x1a1022, { col: true }); k.box(9.5, 0, -7, 21, H, 0.3, 0x1a1022, { col: true });
      k.box(-12, 2.6, -6.83, 16, 0.12, 0.04, 0xd8a227); k.box(9.5, 2.6, -6.83, 21, 0.12, 0.04, 0xd8a227);
      for (const x of [-3.8, -1.2]) { k.box(x, 0, -6.7, 0.18, 1.0, 0.18, 0xd8a227); k.box(x + (x < -2.5 ? -0.3 : 0.3), 0.8, -6.7, 0.6, 0.05, 0.05, 0x9a1a2a); }
      k.glow(-2.5, 3.1, -6.82, 3.4, 0.5, 0.05, 0xffd84d, 2.4);
      k.box(0, -0.003, -10.5, W, 0.012, 7, 0x141418, { flat: true });
    }
  };
}
class InteriorManager {
  constructor(game) {
    this.g = game; this.cur = null; this.defs = INTERIOR_DEFS; this.list = [];
    this.sky = null;
    const places = game.world.places;
    for (const id in INTERIOR_DEFS) { const def = INTERIOR_DEFS[id]; def.id = id; this._install(def, places); this.list.push(def); }
    this.guards = [];
  }
  // build an interior's mesh and colliders. def.at overrides the position (default: under the
  // place's door), def.floorY the floor height (default IY, 60 m under the street)
  _install(def, places) {
    const game = this.g, pl = places && places[def.place];
    const ox = def.at ? def.at.x : pl && pl.under ? pl.under.x : pl.door.x, oz = def.at ? def.at.z : pl && pl.under ? pl.under.z : pl.door.z;
    const fy = def.floorY !== undefined ? def.floorY : IY;
    def.ox = ox; def.oz = oz; def.fy = fy; if (!def.door && pl) def.door = pl.door;
    const k = new InteriorKit(def.h);
    def.build(k, mulberry32((def.seed || def.id.length) * 977 + 13), def);
    const parts = k.build();
    const grp = new THREE.Group(); grp.position.set(ox, fy, oz);
    grp.add(parts.main); if (parts.glow) grp.add(parts.glow);
    if (def.windows) for (const w of def.windows) grp.add(this._window(w));
    if (def.afterInstall) def.afterInstall(grp, def);
    grp.visible = false;
    game.scene.add(grp);
    def.group = grp;
    def.cols = k.cols.map(c => game.world.grid.add({ x0: ox + c.x0, x1: ox + c.x1, z0: oz + c.z0, z1: oz + c.z1, y0: fy + c.y0 - 0.5, y1: fy + c.y1, kind: 'int', base: fy }));
    def.chars = (def.npcs || []).map(n => {
      const look = n.look === 'cop' ? copLook() : Object.assign(randomLook(mulberry32(n.id.length * 31)), n.look ? { shirt: C(n.look.shirt), pants: C(n.look.pants), cap: n.look.cap !== undefined ? C(n.look.cap) : null } : {});
      return { id: n.id, x: ox + n.x, y: fy, z: oz + n.z, h: n.h, look, pose: { phase: Math.random() * 5, amp: 0 }, flash: 0 };
    });
  }
  // interiors built when you walk in and thrown away when you leave (houses)
  addDynamic(def) { if (this.defs[def.id]) return this.defs[def.id]; this._install(def, this.g.world.places); this.defs[def.id] = def; return def; }
  dispose(def) {
    if (!def || !def.dynamic) return;
    for (const c of def.cols || []) this.g.world.grid.remove(c);
    this.g.scene.remove(def.group);
    def.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    delete this.defs[def.id];
  }
  _window(w) {
    if (!this.sky) {
      const t = makeSkylineTextures();
      this.sky = {
        bg: new THREE.MeshBasicMaterial({ color: 0x8fb4dc, fog: false }),
        sil: new THREE.MeshBasicMaterial({ map: t.sil, transparent: true, fog: false, depthWrite: false }),
        lit: new THREE.MeshBasicMaterial({ map: t.lit, transparent: true, fog: false, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })
      };
    }
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(w.w, w.h);
    const bg = new THREE.Mesh(geo, this.sky.bg), sil = new THREE.Mesh(geo, this.sky.sil), lit = new THREE.Mesh(geo, this.sky.lit);
    sil.position.z = 0.01; lit.position.z = 0.02;
    sil.material.map.repeat.set(w.w / 18, 1); sil.material.map.wrapS = THREE.RepeatWrapping;
    lit.material.map.repeat.copy(sil.material.map.repeat); lit.material.map.wrapS = THREE.RepeatWrapping;
    g.add(bg, sil, lit);
    g.position.set(w.x, w.y + w.h / 2, w.z); g.rotation.y = w.ry;
    for (const m of [bg, sil, lit]) m.frustumCulled = false;
    return g;
  }
  def(id) { return this.defs[id]; }
  // world-space position of a local point in an interior
  wp(id, lx, lz) { const d = this.defs[id]; return { x: d.ox + lx, z: d.oz + lz }; }
  enter(id, quiet) {
    HitchLog.mark('entered ' + id);
    const g = this.g, p = g.player, def = this.defs[id];
    if (!def || p.state !== 'foot') return false;
    const go = () => {
      const prev = this.cur;
      if (prev) prev.group.visible = false;
      if (prev && prev !== def) this.dispose(prev);
      this.cur = def; def.group.visible = true;
      p.interior = { id, floor: def.fy, def };
      const sp = def.spawn || { x: def.exit.x, z: def.exit.z - 0.9 };
      p.pos.set(def.ox + sp.x, def.fy, def.oz + sp.z);
      if (def.realView) this.g.chunks.wide(true); else this.g.chunks.wide(false);
      p.vel.set(0, 0, 0); p.h = def.spawnH; p.onGround = true;
      g.cam.yaw = def.spawnH; g.cam.pitch = -0.12; g.cam.init = false;
      if (id === 'depot') this.spawnGuards(def);
      if (def.store) g.content.openStaffDoor(def, false);
      g.audio.play('door');
      g.content.onInterior(id, true);
    };
    if (quiet) go(); else g.fade(go);
    return true;
  }
  exit(quiet) {
    const g = this.g, p = g.player, def = this.cur;
    if (!def) return;
    const go = () => {
      def.group.visible = false; this.cur = null; p.interior = null; this.guards = [];
      this.dispose(def); this.g.chunks.wide(false);
      const d = def.door;
      const x = d.x + Math.sin(d.h) * 0.9, z = d.z + Math.cos(d.h) * 0.9;
      p.pos.set(x, groundY(x, z), z); p.vel.set(0, 0, 0); p.h = d.h; p.onGround = true;
      g.cam.yaw = d.h; g.cam.pitch = -0.12; g.cam.init = false;
      g.audio.play('door');
      g.content.onInterior(def.id, false);
    };
    if (quiet) go(); else g.fade(go);
  }
  spawnGuards(def) {
    this.alarm = false;
    this.guards = (def.guards || []).map((route, i) => ({
      route, i: 1, x: def.ox + route[0][0], z: def.oz + route[0][1], h: 0, alert: 0, look: Object.assign(copLook(), { shirt: C(0x3a3a3a), cap: C(0x1a1a1a) }), pose: { phase: i * 2, amp: 0 }, flash: 0, y: IY, wait: 0
    }));
  }
  // per frame while inside: lighting override, window sky, guards
  update(dt) {
    const g = this.g, def = this.cur; if (!def) return;
    if (!def.realView) interiorLighting(g);
    if (def.id === 'prison' && g.uw && g.uw.prison.esc) { g.env.hemi.intensity = 0.42; g.renderer.toneMappingExposure = 0.75; }
    for (const c of def.chars) { c.pose.phase += dt; }
    if (!this.guards.length) return;
    // depot guards walk their loops and raise the alarm if they see you
    const p = g.player;
    for (const gd of this.guards) {
      const tgt = gd.route[gd.i], tx = def.ox + tgt[0], tz = def.oz + tgt[1];
      const dx = tx - gd.x, dz = tz - gd.z, d = Math.hypot(dx, dz);
      if (gd.wait > 0) { gd.wait -= dt; gd.pose.amp = damp(gd.pose.amp, 0, 6, dt); }
      else if (d < 0.3) { gd.i = (gd.i + 1) % gd.route.length; gd.wait = 1.6; }
      else { const sp = (gd.alert > 0 ? 3.6 : 1.3) / (gd.slow || 1); gd.x += dx / d * sp * dt; gd.z += dz / d * sp * dt; gd.h = dampAngle(gd.h, Math.atan2(dx, dz), 6, dt); gd.pose.amp = damp(gd.pose.amp, sp > 2 ? 1 : 0.6, 6, dt); gd.pose.phase += sp / 1.4 * Math.PI * dt; }
      const px = p.pos.x - gd.x, pz = p.pos.z - gd.z, pd = Math.hypot(px, pz);
      const facing = (px * Math.sin(gd.h) + pz * Math.cos(gd.h)) / (pd || 1);
      const sees = pd < 11 && facing > 0.45 && g.world.grid.lineOfSight(gd.x, IY + 1.6, gd.z, p.pos.x, IY + 1.3, p.pos.z);
      if (sees || pd < 1.6) { gd.alert += dt; if (gd.alert > 0.7 && !this.alarm) { this.alarm = true; if (this.onAlarm) this.onAlarm(); else g.content.onAlarm(); } }
    }
  }
  drawChars(cr) {
    const def = this.cur; if (!def) return;
    for (const c of def.chars) if (!c.hidden) cr.draw(c);
    for (const gd of this.guards) cr.draw(gd);
  }
  // street door prompts and interior spot prompts
  nearDoor(p) {
    for (const def of this.list) {
      if (def.noDoor) continue;
      const d = def.door; if (Math.hypot(p.pos.x - d.x, p.pos.z - d.z) < 2.3) return def;
    }
    return null;
  }
  nearSpot(p) {
    const def = this.cur; if (!def) return null;
    if (!def.noExit && Math.hypot(p.pos.x - (def.ox + def.exit.x), p.pos.z - (def.oz + def.exit.z)) < 1.3) return { id: 'exit', label: def.exitLabel || 'Leave' };
    // spots on an upper floor only answer to someone standing on that floor
    const ly = p.pos.y - def.fy;
    for (const s of def.spots) if (Math.abs(ly - (s.y || 0)) < 1.6 && Math.hypot(p.pos.x - (def.ox + s.x), p.pos.z - (def.oz + s.z)) < s.r) return s;
    return null;
  }
}

