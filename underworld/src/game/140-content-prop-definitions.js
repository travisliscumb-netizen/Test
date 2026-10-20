/* =====================================================================
   [CONTENT] PROP DEFINITIONS (instanced street furniture)
   ===================================================================== */
const PROP_DEFS = {
  lamp: { col: { r: 0.16, h: 7.5 }, glow: [[0, 7.2, 1.5, 0.22, 0.07, 0.42]], cast: true, breakable: true, breakSpeed: 15, mass: 400,
    build(g) { const c = C(0x2c3035); g.cyl(0, 3.75, 0, 0.09, 7.5, c); g.cyl(0, 0.3, 0, 0.16, 0.6, c); g.box(0, 7.45, 0.75, 0.1, 0.1, 1.6, c); g.box(0, 7.32, 1.5, 0.34, 0.16, 0.64, c); } },
  parklamp: { col: { r: 0.12, h: 4 }, glow: [[0, 3.55, 0, 0.2, 0.28, 0.2]],
    build(g) { const c = C(0x1e2226); g.cyl(0, 1.8, 0, 0.07, 3.6, c); g.box(0, 3.55, 0, 0.32, 0.45, 0.32, c); g.add(TPL.cone, M(0, 3.95, 0, 0.3, 0.3, 0.3), c); } },
  lotlamp: { col: { r: 0.2, h: 10 }, glow: [[0.9, 9.6, 0, 0.3, 0.08, 0.5], [-0.9, 9.6, 0, 0.3, 0.08, 0.5]], cast: true,
    build(g) { const c = C(0x3a3f45); g.cyl(0, 5, 0, 0.12, 10, c); g.box(0, 9.85, 0, 2.4, 0.12, 0.14, c); g.box(0.9, 9.72, 0, 0.5, 0.18, 0.7, c); g.box(-0.9, 9.72, 0, 0.5, 0.18, 0.7, c); } },
  tlight: { col: { r: 0.2, h: 6 }, cast: true, breakable: true, breakSpeed: 19, mass: 500,
    build(g) {
      const c = C(0x2a2e33), y = C(0x3a3e44);
      g.cyl(0, 2.9, 0, 0.11, 5.8, c); g.cyl(0, 0.25, 0, 0.18, 0.5, c);
      g.box(-1.9, 5.75, 0, 3.8, 0.12, 0.12, c);
      g.box(-3.6, 5.3, 0, 0.42, 1.15, 0.32, y); g.box(-3.6, 5.3, -0.17, 0.5, 1.25, 0.04, C(0x111214));
      g.box(0, 2.7, 0.14, 0.3, 0.8, 0.2, y); // ped signal box
      g.box(0.5, 4.7, 0, 1.0, 0.24, 0.03, C(0x1c6b3a)); g.box(0, 4.45, 0.5, 0.03, 0.24, 1.0, C(0x1c6b3a));
    } },
  tree: { col: { r: 0.32, h: 4 }, cast: true, tint: true, foliage: true,
    build(g) {
      g.add(TPL.cyl6, M(0, 1.3, 0, 0.16, 2.6, 0.16), C(0x4a3626));
      const leaf = C(0x3f6b2a);
      g.add(TPL.sphere, M(0, 3.6, 0, 1.9, 1.6, 1.9), leaf);
      g.add(TPL.sphere, M(0.9, 3.1, 0.4, 1.2, 1.1, 1.2), C(0x4b7a30));
      g.add(TPL.sphere, M(-0.7, 3.3, -0.6, 1.3, 1.1, 1.3), C(0x355f25));
      g.add(TPL.sphere, M(0.1, 4.5, -0.2, 1.1, 1.0, 1.1), C(0x4f8034));
    } },
  pine: { col: { r: 0.3, h: 5 }, cast: true, tint: true, foliage: true,
    build(g) {
      g.add(TPL.cyl6, M(0, 0.8, 0, 0.15, 1.6, 0.15), C(0x4a3626));
      const c = C(0x2a4a2a);
      g.add(TPL.cone, M(0, 2.2, 0, 1.8, 2.4, 1.8), c); g.add(TPL.cone, M(0, 3.6, 0, 1.4, 2.1, 1.4), C(0x2f5530)); g.add(TPL.cone, M(0, 4.8, 0, 0.9, 1.7, 0.9), C(0x356035));
    } },
  bush: { tint: true, foliage: true, build(g) { g.add(TPL.sphere, M(0, 0.5, 0, 1.0, 0.75, 1.0), C(0x3d6a2c)); g.add(TPL.sphere, M(0.6, 0.4, 0.3, 0.7, 0.55, 0.7), C(0x46782f)); } },
  bench: { col: { w: 1.8, d: 0.6, h: 0.9 }, breakable: true, breakSpeed: 9, mass: 80,
    build(g) { const w = C(0x7a5434), m = C(0x2b2f33); g.box(0, 0.45, 0, 1.8, 0.07, 0.5, w); g.box(0, 0.75, -0.22, 1.8, 0.4, 0.06, w); for (const x of [-0.75, 0.75]) { g.box(x, 0.22, 0, 0.07, 0.44, 0.45, m); g.box(x, 0.6, -0.22, 0.07, 0.6, 0.06, m); } } },
  bin: { col: { r: 0.3, h: 0.95 }, breakable: true, mass: 20,
    build(g) { g.cyl(0, 0.45, 0, 0.28, 0.9, C(0x2f4a3a)); g.cyl(0, 0.93, 0, 0.3, 0.06, C(0x1f2a24)); } },
  dumpster: { col: { w: 2.1, d: 1.2, h: 1.4 },
    build(g) { g.box(0, 0.7, 0, 2.0, 1.2, 1.1, C(0x2c5a3c)); g.box(0, 1.33, 0.05, 2.04, 0.08, 1.12, C(0x1d2a22)); for (const x of [-0.8, 0.8]) for (const z of [-0.4, 0.4]) g.cyl(x, 0.08, z, 0.08, 0.16, C(0x111111)); } },
  hydrant: { col: { r: 0.22, h: 0.8 }, breakable: true, mass: 40, water: true,
    build(g) { const r = C(0xb3261e); g.cyl(0, 0.35, 0, 0.13, 0.7, r); g.cyl(0, 0.72, 0, 0.1, 0.08, r); g.box(0, 0.45, 0, 0.42, 0.1, 0.1, r); g.cyl(0, 0.05, 0, 0.18, 0.1, C(0x5a1612)); } },
  busstop: { col: { w: 3.2, d: 1.3, h: 2.6 },
    build(g) {
      const f = C(0x3a4048), gl = C(0x8fb3c4);
      g.box(0, 2.55, 0, 3.4, 0.1, 1.5, f); g.box(0, 1.3, -0.6, 3.2, 2.4, 0.04, gl);
      for (const x of [-1.6, 1.6]) { g.box(x, 1.3, -0.6, 0.08, 2.5, 0.08, f); g.box(x, 1.3, 0.6, 0.08, 2.5, 0.08, f); g.box(x, 1.3, 0, 0.04, 2.4, 1.1, gl); }
      g.box(0, 0.48, -0.4, 2.4, 0.08, 0.36, C(0x7a5434));
    } },
  newsbox: { col: { r: 0.32, h: 1.05 }, breakable: true, mass: 25,
    build(g) { g.box(0, 0.55, 0, 0.5, 1.0, 0.45, C(0x1f4fa0)); g.box(0, 0.85, 0.23, 0.38, 0.25, 0.02, C(0xd8e0e8)); } },
  planter: { col: { w: 1.6, d: 1.6, h: 0.75 },
    build(g) { g.box(0, 0.35, 0, 1.6, 0.7, 1.6, C(0x8a857c)); g.add(TPL.sphere, M(0, 0.95, 0, 0.75, 0.5, 0.75), C(0x3d6a2c)); } },
  cone: { col: { r: 0.25, h: 0.7 }, breakable: true, mass: 3,
    build(g) { g.add(TPL.cone, M(0, 0.37, 0, 0.22, 0.7, 0.22), C(0xff6a14)); g.add(TPL.cyl6, M(0, 0.4, 0, 0.13, 0.1, 0.13), C(0xf2f2f2)); g.box(0, 0.025, 0, 0.5, 0.05, 0.5, C(0x222222)); } },
  barrier: { col: { w: 2.0, d: 0.6, h: 0.85 }, breakable: true, mass: 120,
    build(g) { g.box(0, 0.4, 0, 2.0, 0.8, 0.45, C(0xd9d6cf)); g.box(0, 0.62, 0, 2.02, 0.16, 0.47, C(0xc22b2b)); } },
  pallet: { col: { w: 1.2, d: 1.2, h: 1.0 },
    build(g) { g.box(0, 0.08, 0, 1.2, 0.15, 1.2, C(0x8a6a44)); g.box(0, 0.55, 0, 1.1, 0.8, 1.1, C(0xb59a6e)); } },
  meter: { col: { r: 0.12, h: 1.3 }, breakable: true, mass: 15,
    build(g) { g.cyl(0, 0.6, 0, 0.04, 1.2, C(0x4a4f55)); g.box(0, 1.28, 0, 0.2, 0.32, 0.16, C(0x6b737b)); g.box(0, 1.3, 0.081, 0.12, 0.1, 0.01, C(0xd8e0e8)); } },
  mailbox: { col: { r: 0.32, h: 1.2 }, breakable: true, mass: 40,
    build(g) { g.box(0, 0.55, 0, 0.5, 1.0, 0.45, C(0x1f4c8f)); g.cyl(0, 1.05, 0, 0.25, 0.45, C(0x1f4c8f)); g.box(0, 0.9, 0.23, 0.32, 0.06, 0.02, C(0x111111)); for (const x of [-0.2, 0.2]) g.box(x, 0.04, 0, 0.06, 0.08, 0.4, C(0x111111)); } },
  vending: { col: { w: 1.0, d: 0.8, h: 1.9 },
    build(g) { g.box(0, 0.95, 0, 1.0, 1.9, 0.8, C(0xc8302a)); g.box(-0.12, 1.15, 0.41, 0.6, 1.1, 0.02, C(0x203040)); g.box(0.36, 1.0, 0.41, 0.16, 0.6, 0.02, C(0x9aa0a6)); g.box(0, 0.25, 0.41, 0.8, 0.2, 0.02, C(0x111111)); } },
  bags: { col: { r: 0.35, h: 0.6 }, breakable: true, mass: 4,
    build(g) { g.add(TPL.sphere0, M(0, 0.3, 0, 0.36, 0.32, 0.34), C(0x1a1c1e)); g.add(TPL.sphere0, M(0.3, 0.22, 0.15, 0.26, 0.24, 0.26), C(0x2b2e31)); } },
  bikerack: { col: { w: 2.2, d: 0.3, h: 0.8 },
    build(g) { for (let i = 0; i < 4; i++) { const x = -0.9 + i * 0.6; g.box(x, 0.4, 0, 0.05, 0.8, 0.05, C(0x8a8f94)); g.box(x, 0.8, 0, 0.05, 0.05, 0.5, C(0x8a8f94)); } } },
  bollard: { col: { r: 0.14, h: 0.9 },
    build(g) { g.cyl(0, 0.45, 0, 0.12, 0.9, C(0x3a3e44)); g.cyl(0, 0.75, 0, 0.125, 0.06, C(0xd8c040)); } },
  upole: { col: { r: 0.2, h: 9 }, breakable: true, breakSpeed: 17, mass: 900, cast: true,
    build(g) { const w = C(0x5a4632); g.add(TPL.cyl6, M(0, 4.4, 0, 0.13, 8.8, 0.13), w); g.box(0, 8.2, 0, 0.12, 0.12, 1.8, w); for (const z of [-0.7, 0, 0.7]) g.cyl(0, 8.32, z, 0.04, 0.12, C(0xd8d8d8)); } },
  transformer: { col: { w: 1.4, d: 1.1, h: 1.4 },
    build(g) { g.box(0, 0.7, 0, 1.4, 1.4, 1.1, C(0x4f6b4a)); g.box(0, 1.42, 0, 1.45, 0.04, 1.15, C(0x3c5238)); g.box(0, 0.9, 0.56, 0.3, 0.2, 0.01, C(0xe8d040)); } },
  pump: { col: { w: 0.7, d: 0.9, h: 1.9 }, breakable: true, breakSpeed: 7, mass: 300, explode: true,
    build(g) { g.box(0, 0.95, 0, 0.7, 1.9, 0.9, C(0xe8e8e6)); g.box(0, 1.55, 0, 0.72, 0.5, 0.92, C(0xd23a2a)); g.box(0, 1.15, 0.46, 0.4, 0.3, 0.02, C(0x101418)); g.box(0.38, 0.9, 0, 0.06, 0.4, 0.2, C(0x222222)); } },
  cart: { col: { r: 0.45, h: 1.0 }, breakable: true, mass: 15,
    build(g) { const m = C(0xa8adb2); g.box(0, 0.75, 0, 0.55, 0.45, 0.9, m); g.box(0, 0.3, 0, 0.5, 0.04, 0.8, m); for (const x of [-0.22, 0.22]) for (const z of [-0.36, 0.36]) g.cyl(x, 0.07, z, 0.06, 0.06, C(0x222222)); } },
  barrel: { col: { r: 0.33, h: 0.95 }, breakable: true, mass: 60,
    build(g) { g.cyl(0, 0.45, 0, 0.3, 0.9, C(0x2e6fb5)); g.cyl(0, 0.3, 0, 0.31, 0.04, C(0x1d4a7a)); g.cyl(0, 0.62, 0, 0.31, 0.04, C(0x1d4a7a)); } }
};

