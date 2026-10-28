/* =====================================================================
   [CONTENT] ROBBABLE BUSINESSES (M10, §27): every shop-front business of a
   robbable category has a modular interior you can walk into: the shop
   floor dressed for its trade, the counter and its till, a staff door, and
   the back: an office (desk, the safe) and a stockroom. One layout, themed
   by a table, so a new trade is a new row, not a new room.
   - The heist itself is the Fuel & Go one (360 storeHeist), paid by the
     theme: till and safe ranges, what the stockroom holds.
   - Security: every robbery raises the business's security a step (a guard
     on the door, faster alarms) and it recovers a step every ROB_SEC.recover
     economic days. A business can't be robbed again while it is still
     counting the losses (the till refills daily, the back office weekly).
   - Your own business: walk in, no robbing yourself; the counter is where
     you manage it.
   ===================================================================== */
// fit: how the shop floor is dressed; till/safe: cash ranges; stock: what the stockroom gives; sec: the security a
// trade starts with (0 none, 1 cameras, 2 a guard); pal: the colours of its stock
const ROB_THEMES = {
  shop: { fit: 'shelves', till: [120, 380], safe: [1200, 3600], stock: { smokes: [2, 5] }, sec: 0, wall: 0xe8e4da, trim: 0x3a7a4a, pal: [0xd23a2a, 0xf2c230, 0x2a5f9e, 0x3a7a4a, 0xe67e22, 0xecf0f1] },
  pharmacy: { fit: 'shelves', till: [150, 450], safe: [2000, 5000], stock: { pills: [2, 6] }, sec: 1, wall: 0xf2f6f6, trim: 0x2a9a6a, pal: [0xffffff, 0x7fd0ff, 0x2a9a6a, 0xd8e8f0, 0xff8a8a, 0xf4f2ee] },
  jewelry: { fit: 'cases', till: [300, 900], safe: [6000, 15000], stock: { hot: [3, 7] }, sec: 2, wall: 0x2a2630, trim: 0xd8b44a, pal: [0xffd84d, 0xf4f2ee, 0xd8b44a, 0x8fd8ff] },
  electronics: { fit: 'screens', till: [200, 600], safe: [2500, 6000], stock: { hot: [2, 5] }, sec: 1, wall: 0x2c3440, trim: 0x2a8ad8, pal: [0x111111, 0x2a2c30, 0x7fd0ff, 0xd8dce0] },
  pawn: { fit: 'clutter', till: [250, 700], safe: [3000, 8000], stock: { hot: [2, 4] }, sec: 1, wall: 0x8a7a5a, trim: 0xd8a227, pal: [0xd8a227, 0x8a6a4a, 0x5a5e62, 0xc8c2b4, 0x3a2a20] },
  boutique: { fit: 'racks', till: [200, 600], safe: [2500, 6500], stock: { hot: [1, 3] }, sec: 1, wall: 0xf4ecec, trim: 0xd28cff, pal: [0x2a2a2e, 0xd28cff, 0xf4f2ee, 0x8a2f3a, 0x2f5d8a] },
  bar: { fit: 'bar', till: [300, 900], safe: [1500, 4000], stock: { smokes: [2, 5] }, sec: 0, wall: 0x4a3426, trim: 0xd8762a, pal: [0x6a3a1a, 0x2a5a2a, 0xd8a227, 0x8a2f3a] },
  food: { fit: 'tables', till: [120, 420], safe: [900, 2600], stock: { smokes: [1, 3] }, sec: 0, wall: 0xf0e2c8, trim: 0xc23a2a, pal: [0xc23a2a, 0xf2c230, 0xf4f2ee, 0x3a7a4a] },
  service: { fit: 'chairs', till: [100, 320], safe: [800, 2200], stock: { hot: [1, 2] }, sec: 0, wall: 0xe4e8ec, trim: 0x46d4c4, pal: [0x2a2a2e, 0x46d4c4, 0xf4f2ee, 0xd8762a] }
};
const ROB_CAT_THEME = { convenience: 'shop', grocery: 'shop', pharmacy: 'pharmacy', jewelry: 'jewelry', electronics: 'electronics', pawn: 'pawn', boutique: 'boutique', bar: 'bar',
  coffee: 'food', diner: 'food', pizza: 'food', restaurant: 'food', barber: 'service', salon: 'service', tattoo: 'service', laundromat: 'service', arcade: 'service' };
// security: a robbery adds a step (up to max); a step recovers every `recover` economic days; each step adds to the
// clerk's alarm chance and to how long the jobs take
// a burglary (M10): one report roll as you go in; the neighbour's call lands after `delay` seconds; a home of
// `highTier` or above is contained (the search does not give up while you hide inside it)
const BURGLARY = { report: 0.175, delay: [20, 45], highTier: 4 };
// a Fuel & Go's take (it has no trade of its own)
const STORE_ROB = { till: [180, 460], safe: [1400, 4200], stock: { smokes: [2, 5] }, sec: 0 };
const ROB_SEC = { max: 3, recover: 5, alarm: 0.15, slow: 1 };
const robTheme = def => def && ROB_THEMES[ROB_CAT_THEME[def.cat]] || null;
function bizInteriorDef(prop, L) {
  const T = robTheme(prop), W = 12, D = 11, hw = W / 2, hd = D / 2;
  return {
    id: 'b:' + prop.id, dynamic: true, name: prop.name, w: W, d: D, h: 3.2, exit: { x: -3.5, z: 4.6 }, spawnH: Math.PI, store: true, noExit: true,
    propId: prop.id, rob: T, at: { x: L.x, z: L.z }, door: { x: L.x, z: L.z, h: L.h }, seed: prop.id.length * 131 + prop.price % 997,
    build(k, rng, def) {
      k.room(W, D, 3.2, { floor: 0xcfcac0, wall: T.wall, ceil: 0xf4f2ee, trim: T.trim, band: [2.5, 0.3], bandC: T.trim, lights: [3, 3], lightC: 0xf4fbff });
      k.tiles(W, D, 0xcfcac0, 0xb8b3a8, 0.6);
      k.door(-3.5, hd - 0.02, 0, 0x9ab4c4, T.trim);
      // the partition, the staff door behind the counter (same place as at a Fuel & Go, so openStaffDoor serves both)
      iwall(k, 'x', -1.8, -hw, hw, 0, 3.2, 0xd8d4ca, [[2.6, 3.8]]);
      iwall(k, 'z', 0, -hd, -1.8, 0, 3.2, 0xd0ccc2, [[-3.6, -2.6]]);
      def.staffCol = k.cols.length; k.cols.push({ x0: 2.6, x1: 3.8, z0: -1.9, z1: -1.7, y0: 0, y1: 2.3 });
      k.box(3.2, 2.35, -1.7, 1.3, 0.22, 0.04, T.trim);
      // the counter and its till
      k.box(3.6, 0, 2.6, 2.8, 1.0, 0.8, T.trim, { col: true }); k.box(3.6, 1.0, 2.6, 2.9, 0.05, 0.9, 0xe8e4da);
      k.box(2.7, 1.05, 2.6, 0.45, 0.3, 0.38, 0x2a2a2e); k.glow(2.7, 1.2, 2.82, 0.3, 0.12, 0.02, 0x7fe08f, 1.6);
      k.glow(3.6, 2.2, hd - 0.04, 2.4, 0.5, 0.03, T.trim, 1.4);
      // the shop floor, by trade
      const P = T.pal;
      if (T.fit === 'shelves') { k.shelfUnit(-1.9, 1.7, 0.7, 3.4, 1.6, 3, rng, P); k.shelfUnit(0.5, 1.7, 0.7, 3.4, 1.6, 3, rng, P); k.shelfUnit(-4.6, -0.6, 0.6, 2.4, 1.9, 4, rng, P); }
      else if (T.fit === 'cases') {
        for (const [x, z] of [[-4.2, 0.4], [-1.6, 0.4], [-4.2, 3.0], [-1.6, 3.0]]) { k.box(x, 0, z, 1.8, 0.9, 0.7, 0x2a2630, { col: true }); k.glow(x, 0.92, z, 1.7, 0.08, 0.6, 0xcfe8ff, 0.6); for (let i = 0; i < 4; i++) k.glow(x - 0.6 + i * 0.4, 0.97, z, 0.12, 0.03, 0.12, P[i % P.length], 1.8); }
        k.box(-5.7, 0, -0.6, 0.4, 2.2, 1.6, 0x2a2630, { col: true }); k.glow(-5.48, 1.2, -0.6, 0.02, 1.4, 1.4, 0xcfe8ff, 0.5);
      } else if (T.fit === 'screens') {
        for (let i = 0; i < 4; i++) { k.box(-5.0 + i * 1.6, 1.0, -1.45, 1.4, 0.85, 0.06, 0x111111); k.glow(-5.0 + i * 1.6, 1.05, -1.4, 1.3, 0.75, 0.01, [0x2a8ad8, 0x8a2f3a, 0x3a7a4a, 0xd8a227][i], 1.2); }
        k.box(-3.0, 0, 1.6, 4.4, 0.85, 1.0, 0x5c5e62, { col: true }); for (let i = 0; i < 6; i++) k.box(-4.8 + i * 0.7, 0.85, 1.6, 0.5, 0.05, 0.35, 0x2a2c30);
      } else if (T.fit === 'clutter') {
        k.shelfUnit(-4.6, -0.6, 0.6, 2.4, 1.9, 4, rng, P); k.shelfUnit(-1.4, 1.5, 0.7, 3.0, 1.6, 3, rng, P);
        k.box(-4.8, 0, 2.8, 1.2, 1.1, 1.0, 0x8a6a4a, { col: true }); k.box(-4.8, 1.1, 2.8, 0.9, 0.5, 0.2, 0xd8a227);
        k.box(0.2, 0, 3.6, 0.06, 2.4, 2.6, 0x5a5e62); // the cage by the counter
      } else if (T.fit === 'racks') {
        for (const [x, z] of [[-4.4, 0.6], [-2.0, 0.6], [-4.4, 3.0], [-2.0, 3.0]]) { k.box(x, 1.5, z, 1.6, 0.04, 0.04, 0xc8ccd0); for (let i = 0; i < 7; i++) k.box(x - 0.66 + i * 0.22, 0.6, z, 0.18, 0.9, 0.36, P[(i + Math.round(x)) % P.length]); }
        k.box(-5.75, 0, -0.4, 0.1, 2.0, 1.0, 0xc8ccd0); k.glow(-5.68, 1.0, -0.4, 0.01, 1.8, 0.9, 0xcfe8ff, 0.7);
      } else if (T.fit === 'bar') {
        k.box(-2.4, 0, -0.6, 5.8, 1.05, 0.7, 0x4a2a1a, { col: true }); k.box(-2.4, 1.05, -0.6, 5.9, 0.06, 0.8, 0x2a1a10);
        for (let i = 0; i < 12; i++) k.box(-5.0 + i * 0.45, 1.4, -1.55, 0.1, 0.32, 0.1, P[i % P.length]);
        for (let i = 0; i < 5; i++) k.box(-4.6 + i * 1.1, 0, 0.3, 0.38, 0.75, 0.38, 0x2a2a2e, { col: true });
        for (const [x, z] of [[-4.0, 2.8], [-1.2, 2.8]]) { k.box(x, 0, z, 0.9, 0.75, 0.9, 0x6a4a2a, { col: true }); }
      } else if (T.fit === 'tables') {
        for (const [x, z] of [[-4.4, 0.4], [-1.8, 0.4], [-4.4, 3.0], [-1.8, 3.0]]) { k.box(x, 0, z, 1.2, 0.75, 0.9, 0xd8d0c0, { col: true }); for (const s of [-1, 1]) k.box(x + s * 0.85, 0, z, 0.4, 0.45, 0.8, P[0]); }
        k.box(-3.0, 0, -1.4, 5.0, 1.0, 0.6, 0xb8b0a0, { col: true }); k.glow(-3.0, 1.6, -1.65, 4.6, 0.5, 0.02, 0xffe6b8, 1.3);
      } else {
        for (const x of [-4.6, -2.6, -0.6]) { k.box(x, 0, -1.2, 0.8, 0.55, 0.8, 0x2a2a2e, { col: true }); k.box(x, 0.55, -1.5, 0.8, 0.7, 0.12, 0x2a2a2e); k.box(x, 1.0, -1.62, 0.7, 1.0, 0.04, 0xcfe8ff); }
        k.box(-4.0, 0, 2.6, 2.6, 0.45, 0.8, P[1]);
      }
      // the back office: desk, CCTV, the safe; the stockroom
      FURN.desk(k, 3.0, 0, -4.9, 0, 1.4, false, 0x5a5e62); k.box(2.7, 0.74, -5.05, 0.5, 0.35, 0.05, 0x111111); k.glow(2.7, 0.78, -5.02, 0.44, 0.28, 0.01, 0x6a9a7a, 1.2);
      FURN.safe(k, 5.45, 0, -4.7, T.sec >= 2 ? 4 : 3);
      for (const sx of [-5.3, -2.0]) k.shelfUnit(sx, -3.8, 0.7, 2.6, 2.0, 4, rng, [0x8a6a4a, 0x7a5a3a, 0x9a7a5a, 0xd8c8a0]);
      k.crate(-3.6, -5.0, 0.55, 0x8a6a4a, 2);
    },
    afterInstall(grp, def) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.2, 0.06), new THREE.MeshBasicMaterial({ color: 0x6a7076, fog: false }));
      m.position.set(3.2, 1.1, -1.8); grp.add(m); def.staffMesh = m;
    },
    spots: [
      { id: 'manage', x: 4.4, z: 3.5, r: 1.0, label: 'The counter' },
      { id: 'register', x: 2.4, z: 3.5, r: 0.8, label: 'Rob the till' },
      { id: 'staff', x: 3.2, z: -1.0, r: 0.9, label: 'Staff only · force the door' },
      { id: 'safe', x: 4.6, z: -4.4, r: 0.9, label: 'Crack the office safe' },
      { id: 'desk', x: 3.0, z: -3.6, r: 0.8, label: 'Search the desk' },
      { id: 'stock', x: -3.6, z: -3.3, r: 1.1, label: 'Search the stockroom' },
      { id: 'exit', x: -3.5, z: 4.6, r: 1.1, label: 'Leave' }
    ],
    npcs: [{ id: 'clerk', x: 3.6, z: 1.8, h: 0, look: { shirt: T.trim, pants: 0x2a2a2e } }, { id: 'guard', x: -2.2, z: 4.2, h: Math.PI, look: { shirt: 0x2a3346, pants: 0x1a1c22, cap: 0x1a1c22 } }]
  };
}
