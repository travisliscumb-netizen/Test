/* =====================================================================
   [CONTENT] THE BANKS OF PORT VALEN: three real branches, open to anyone
   from day one, each one a building you can bank in or rob.
   - Old Quarter Neighborhood Bank: a small savings branch. Two tellers, a
     back office, a cash room and a small wall of deposit boxes. One guard.
   - Downtown Commercial Bank: a business bank. Four windows, glass offices,
     a secured back corridor, a cash room, a vault and a deposit room.
   - Port Valen Central Bank: the island's money. A marble hall under a six
     metre ceiling, six windows, a security office, executive suites, a round
     vault door and a deposit hall. Six guards and the fastest police.
   What each holds (BANKS[].base) varies by economic day and rises toward the
   end of the economic week; what a robbery takes stays taken until the
   branch recovers (512, BankSystem). The difficulty is the gate: no Rank,
   Rep or upgrade is needed to walk in.
   Interiors are built when you walk in and thrown away when you leave
   (dynamic interiors, 350): one merged mesh and one lamp mesh each, plus the
   doors that open, and the city is hidden while you are inside (G2).
   ===================================================================== */
// base: the full reserve on a middle day of the economic week (counter + cash room + vault + deposit boxes);
// split: how that divides between them; boxes: deposit boxes on the wall; guards: on duty with no recent robbery;
// stars: wanted level when the alarm goes; escal: seconds inside per extra star after it; storm: seconds before
// the police come through the door, then a wave every BANK_T.wave seconds (wave officers, at most stormMax
// inside); win/sec/cashDoor/grab/vaultDoor/vaultGrab/box: seconds for each job (a security step slows them);
// cop: the district's police presence (the alarm's response and how fast the escalation runs)
const BANKS = {
  n: {
    id: 'n', name: 'Old Quarter Neighborhood Bank', short: 'Neighborhood Bank', tier: 1, at: [2, 5, 0, 44], col: 0x5fbf6a,
    base: 50000, split: { counter: 0.1, cash: 0.6, vault: 0, boxes: 0.3 }, boxes: 24,
    guards: 1, guardMax: 3, stars: 2, escal: 60, storm: 75, wave: 2, stormMax: 3,
    win: 3, sec: 4, cashDoor: 6, grab: 4, grabs: 3, vaultDoor: 0, vaultGrab: 0, vaultGrabs: 0, box: 5,
    role: 'Bank · savings and loans, two tellers', w: 14, d: 12, h: 3.4
  },
  d: {
    id: 'd', name: 'Downtown Commercial Bank', short: 'Commercial Bank', tier: 2, at: [8, 7, 3, 52], col: 0x7fb2ff,
    base: 145000, split: { counter: 0.06, cash: 0.28, vault: 0.46, boxes: 0.2 }, boxes: 60,
    guards: 3, guardMax: 5, stars: 3, escal: 45, storm: 55, wave: 2, stormMax: 5,
    win: 3.5, sec: 7, cashDoor: 8, grab: 5, grabs: 3, vaultDoor: 30, vaultGrab: 6, vaultGrabs: 4, box: 5,
    role: 'Bank · business accounts, four windows, a vault', w: 22, d: 18, h: 4.2
  },
  c: {
    id: 'c', name: 'Port Valen Central Bank', short: 'Central Bank', tier: 3, at: [6, 6, 2, 28], col: 0xffd84d,
    base: 300000, split: { counter: 0.04, cash: 0.18, vault: 0.56, boxes: 0.22 }, boxes: 120,
    guards: 6, guardMax: 8, stars: 3, escal: 30, storm: 40, wave: 3, stormMax: 7,
    win: 4, sec: 9, cashDoor: 10, grab: 6, grabs: 3, vaultDoor: 50, vaultGrab: 7, vaultGrabs: 5, box: 5,
    role: 'Bank · the island’s central bank, the great vault', w: 30, d: 26, h: 6
  }
};
const BANK_IDS = Object.keys(BANKS);
// tuning shared by all three (M13 economy: see ECONOMY.md "Banks")
// week: reserve multiple by day of the economic week (0..6), rising to pay day; noise: a day's reserve varies by
// this much either way (seeded per bank and day, so a reload can't re-roll it); recover: the share of an emptied
// area restocked per economic day (the tills in two days, the cash room in ten, the vault in twenty-five: a branch that
// was hit keeps less on hand for a while, so robbing the same one daily is no money engine; ECONOMY.md "Banks");
// boxRefill: economic days before a drilled deposit box holds anything again; boxVal: a box's share is skewed (most
// hold little, a few a lot) and may hold valuables (hot goods); secMax/secRecover: a robbery adds a security step
// (another guard, police faster), one step recovering every secRecover economic days; wave: seconds between
// police waves once they storm; restrain: seconds a guard needs his hands on you, unarmed and not fighting back
// bag: what you carry out. Notes take room by what they are: the tills are small bills (cap 100 of them is $60k), the
// cash room mixed straps ($150k), the vault bricks of hundreds ($300k), a deposit box whatever was in it; check: seconds
// to go through it per bundle not yet checked (at least checkMin)
// dye: a teller's drawer may hold a dye pack (win, by tier; a note handed over gets one more often: note), so may a
// cash room strap (cash); one that leaves the building bursts: its bundle is ruined and `stain` of the rest of the bag
// with it, and the red smoke shows the police where you came out. Found in time, it costs only its bait money (bait)
// hostage: each hostage holds the police storm back `delay` seconds (at most `cap`) and slows their waves (waveMul);
// held while you're out in the hall with them (within `reach`); while you're in the back, one makes a run for the doors
// after `nerve` seconds (each their own)
// rearCover: seconds after the police first come in before they also cover the rear staff door; pick: seconds to pick
// its lock from the street (a lockpick set)
const BANK_T = {
  week: [0.62, 0.72, 0.84, 0.96, 1.08, 1.2, 1.3], noise: 0.15,
  recover: { counter: 0.5, cash: 0.1, vault: 0.04 }, boxRefill: 21,
  boxSkew: 2.6, boxHot: 0.22,
  secMax: 3, secRecover: 7, secStorm: 10, secEscal: 8, secSlow: 0.15,
  wave: 20, restrain: 2.2, warnT: 2.5, sightR: 15,
  bag: { cap: 100, per: { counter: 600, cash: 1500, vault: 3000, boxes: 2000 }, check: 1.2, checkMin: 3 },
  dye: { win: [0, 0.2, 0.3, 0.4], note: 0.15, cash: [0, 0.08, 0.12, 0.16], bait: 0.2, stain: 0.15 },
  hostage: { delay: 12, cap: 60, waveMul: 0.15, nerve: [20, 40], reach: 20 },
  rearCover: 10, pick: 6
};
const BANK_GLASS = 0xb8d4e0;
// a spot whose prompt reads the robbery's state (BankSystem.label)
function bankSpot(id, x, z, r) { return { id: 'bk:' + id, x, z, r, get label() { return game.uw ? game.uw.banks.label(id) : ''; } }; }
// a teller line: counter, glass (solid: nobody climbs over it), a window (number lamp) per seat, a chair behind each
function tellerLine(k, x0, x1, z, n, T) {
  const len = x1 - x0, cx = (x0 + x1) / 2, step = len / n;
  k.box(cx, 0, z, len, 1.05, 0.7, T.counter, { col: true });
  k.box(cx, 1.05, z, len + 0.1, 0.06, 0.82, T.top);
  k.box(cx, 0.05, z + 0.36, len, 0.12, 0.04, T.trim); // kick plate
  k.cols.push({ x0, x1, z0: z - 0.06, z1: z + 0.06, y0: 1.05, y1: 2.45 });
  for (let i = 0; i <= n; i++) k.box(x0 + i * step, 1.11, z, 0.07, 1.2, 0.07, T.frame); // glass posts
  k.box(cx, 2.31, z, len, 0.08, 0.1, T.frame);
  for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.5) * step;
    k.box(x, 1.36, z, step - 0.1, 0.95, 0.025, BANK_GLASS); // the glass, a gap under it for the tray
    k.box(x, 1.11, z + 0.12, 0.5, 0.03, 0.25, 0x8a8f96); // the cash tray
    k.glow(x, 2.0, z + 0.06, 0.32, 0.18, 0.02, T.lamp, 1.6); // window number
    k.box(x, 0, z - 0.95, 0.5, 0.48, 0.5, 0x2a2c30); k.box(x, 0.48, z - 1.15, 0.5, 0.55, 0.08, 0x2a2c30); // chair
    k.box(x - 0.35, 1.11, z - 0.2, 0.42, 0.3, 0.06, 0x1a1c20); k.glow(x - 0.35, 1.15, z - 0.17, 0.36, 0.22, 0.01, 0x7fb2ff, 1.2); // screen
  }
}
// a glazed partition with a solid low wall under it (a collider for the whole height)
function glassWall(k, along, c, a, b, H, low = 1.0, col = 0xdfe3e7) {
  const m = (a + b) / 2, L = b - a;
  if (along === 'x') { k.box(m, 0, c, L, low, 0.15, col, { col: true }); k.box(m, low, c, L, H - low - 0.4, 0.04, BANK_GLASS); k.cols.push({ x0: a, x1: b, z0: c - 0.08, z1: c + 0.08, y0: low, y1: H }); }
  else { k.box(c, 0, m, 0.15, low, L, col, { col: true }); k.box(c, low, m, 0.04, H - low - 0.4, L, BANK_GLASS); k.cols.push({ x0: c - 0.08, x1: c + 0.08, z0: a, z1: b, y0: low, y1: H }); }
}
// a wall of deposit boxes along x (doors facing ±z) or z (facing ±x): rows of small doors with brass plates
function boxWall(k, along, c, a, b, y0, rows, cols, face, body = 0x8a8f96) {
  const span = b - a, cw = span / cols, rh = 0.3;
  if (along === 'x') k.box((a + b) / 2, y0, c, span + 0.1, rows * rh + 0.1, 0.5, body, { col: true });
  else k.box(c, y0, (a + b) / 2, 0.5, rows * rh + 0.1, span + 0.1, body, { col: true });
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const s = a + (q + 0.5) * cw, y = y0 + 0.05 + r * rh;
    if (along === 'x') { k.box(s, y, c + face * 0.26, cw - 0.04, rh - 0.05, 0.02, 0xb4b9bf); k.box(s, y + rh * 0.42, c + face * 0.28, 0.08, 0.05, 0.015, 0xc9a54a); }
    else { k.box(c + face * 0.26, y, s, 0.02, rh - 0.05, cw - 0.04, 0xb4b9bf); k.box(c + face * 0.28, y + rh * 0.42, s, 0.015, 0.05, 0.08, 0xc9a54a); }
  }
}
// shelving stacked with banded cash (vertical: the shelf runs along z)
function cashShelf(k, x, z, w, d, h, rng, vertical) {
  k.box(x, 0, z, vertical ? d : w, h, vertical ? w : d, 0x5c5e62, { col: true });
  for (let r = 0; r < 4; r++) {
    const y = 0.15 + r * (h - 0.2) / 4;
    k.box(x, y, z, (vertical ? d : w) + 0.04, 0.03, (vertical ? w : d) + 0.04, 0x8c9096);
    const n = Math.floor(w / 0.32);
    for (let i = 0; i < n; i++) {
      if (rng() < 0.15) continue;
      const s = -w / 2 + (i + 0.5) * w / n, hh = 0.1 + rng() * 0.14, col = rng() < 0.7 ? 0x5f8f5a : 0x8fb57f;
      if (vertical) k.box(x, y + 0.03, z + s, d * 0.8, hh, 0.26, col); else k.box(x + s, y + 0.03, z, 0.26, hh, d * 0.8, col);
    }
  }
}
// a cash trolley (the vault's): a steel cart with stacked bricks
function cashCart(k, x, z, rng) {
  k.box(x, 0.12, z, 1.0, 0.7, 0.6, 0x7a7f86, { col: true });
  for (let i = 0; i < 6; i++) k.box(x - 0.36 + (i % 3) * 0.36, 0.82, z - 0.14 + Math.floor(i / 3) * 0.28, 0.32, 0.12 + rng() * 0.1, 0.24, 0x5f8f5a);
}
function goldStack(k, x, z) { k.box(x, 0, z, 1.1, 0.62, 0.6, 0x5c5e62, { col: true }); for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) k.box(x - 0.36 + i * 0.24 + r * 0.12, 0.62 + r * 0.09, z, 0.22, 0.09, 0.42, 0xd8b44a); }
// round parts the box kit can't make: a ring (r0 > 0) or a disc (r0 = 0) about an axis along z, from z0 to z1, in
// `segs` facets, with the kit's baked face shading (tops light, undersides dark) and its floor AO (flat: none)
function kitRingZ(k, cx, cy, z0, z1, r0, r1, segs, color, flat) {
  const t = k.a, c = new THREE.Color(color), H = k.H;
  const put = (v, sh) => {
    const ao = flat ? 1 : (0.62 + 0.38 * smoothstep(0, 1.3, v[1])) * (1 - 0.14 * smoothstep(H - 0.9, H, v[1]));
    t.p.push(v[0], v[1], v[2]); t.c.push(c.r * sh * ao, c.g * sh * ao, c.b * sh * ao);
  };
  const quad = (A, B, C, D, sh) => { const o = t.p.length / 3; put(A, sh); put(B, sh); put(C, sh); put(D, sh); t.i.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  const P = (r, a, z) => [cx + r * Math.cos(a), cy + r * Math.sin(a), z];
  for (let s = 0; s < segs; s++) {
    const a0 = s / segs * Math.PI * 2, a1 = (s + 1) / segs * Math.PI * 2, ny = Math.sin((a0 + a1) / 2);
    quad(P(r0, a0, z1), P(r1, a0, z1), P(r1, a1, z1), P(r0, a1, z1), 0.9); // the face (+z)
    quad(P(r0, a1, z0), P(r1, a1, z0), P(r1, a0, z0), P(r0, a0, z0), 0.86); // the back (-z)
    quad(P(r1, a0, z1), P(r1, a0, z0), P(r1, a1, z0), P(r1, a1, z1), ny > 0 ? 0.8 + 0.2 * ny : 0.8 + 0.25 * ny); // the rim
    if (r0 > 0) quad(P(r0, a1, z1), P(r0, a1, z0), P(r0, a0, z0), P(r0, a0, z1), ny < 0 ? 0.8 - 0.2 * ny : 0.8 - 0.25 * ny); // the hole
  }
}
// a box turned `ang` about the z axis round its own centre: a wheel spoke, a radial bolt, a rivet on a round door
function kitBoxZ(k, cx, cy, cz, w, h, d, ang, color) {
  const t = k.a, n0 = t.p.length, cs = Math.cos(ang), sn = Math.sin(ang);
  k.box(0, -h / 2, 0, w, h, d, color, { flat: true });
  for (let i = n0; i < t.p.length; i += 3) { const x = t.p[i], y = t.p[i + 1]; t.p[i] = cx + x * cs - y * sn; t.p[i + 1] = cy + x * sn + y * cs; t.p[i + 2] += cz; }
}
// a lockable door in a wall gap (security, cash room, vault): its collider while it is shut, and how it opens (o). A
// plain door swings 90° on its jamb. A vault door turns its wheel (`turns`), draws its bolts (`boltIn` metres), comes
// `pull` metres straight out of the frame (negative: into the room behind) and swings `ang` about `hinge` (room metres,
// where the hinge is while shut); `times` are the seconds each part of that takes (BankSystem.swingDoors)
function lockDoor(k, def, key, x, z, along, w = 1.15, color = 0x6a7076, o = {}) {
  def.locks = def.locks || {};
  def.locks[key] = Object.assign({ key, col: k.cols.length, x, z, along, w, color, kind: 'plain', thick: 0.06, h: 2.25, half: w / 2 - 0.01,
    hinge: along === 'x' ? [x + w / 2, z] : [x, z + w / 2], pull: [0, 0], ang: along === 'x' ? Math.PI / 2 : -Math.PI / 2, times: { swing: [0, 0.7] } }, o);
  if (along === 'x') k.cols.push({ x0: x - w / 2, x1: x + w / 2, z0: z - 0.12, z1: z + 0.12, y0: 0, y1: 2.6 });
  else k.cols.push({ x0: x - 0.12, x1: x + 0.12, z0: z - w / 2, z1: z + w / 2, y0: 0, y1: 2.6 });
}
// the door itself: a small vertex-coloured mesh of its own, built in the room's coordinates and drawn with the room's
// lamp-lit material (350), so it is lit like the walls round it at any hour of the day outside; opening it moves its
// vertices (bankDoorPlace). Vertex tags: 0 the door, 1 a locking bolt (draws in along its dir), 2 the wheel (turns)
function bankDoor(Lk, H, mat) {
  const k = new InteriorKit(H), tag = [], dir = [], { x, z, w, color, along } = Lk;
  const mark = (tg, d) => { const n = k.a.p.length / 3; while (tag.length < n) { tag.push(tg); dir.push(d ? d[0] : 0, d ? d[1] : 0, d ? d[2] : 0); } };
  const dark = new THREE.Color(color).multiplyScalar(0.72).getHex(), light = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.18).getHex();
  if (Lk.kind === 'round') {
    // the Central's great round door: a steel disc in its frame, a bevel and a face ring, rivets, the hinge on the west
    // edge, ten bolts round the rim and the wheel on its boss
    const T = Lk.thick, cy = Lk.hub[1], R = Lk.half, f = z + T / 2;
    kitRingZ(k, x, cy, z - T / 2, f, 0, R, 40, color);
    kitRingZ(k, x, cy, f, f + 0.03, R - 0.13, R - 0.03, 40, dark, true);
    kitRingZ(k, x, cy, f, f + 0.04, 1.02, 1.12, 40, light, true);
    for (let s = 0; s < 12; s++) { const a = s / 12 * Math.PI * 2; kitBoxZ(k, x + Math.cos(a) * 1.28, cy + Math.sin(a) * 1.28, f + 0.015, 0.08, 0.08, 0.03, a, 0x6a7076); }
    for (const y of [0.7, 2.3]) k.box(x - R - 0.05, y, z - T / 2 + 0.02, 0.2, 0.4, 0.2, 0x5c5e62);
    mark(0);
    for (let s = 0; s < 10; s++) { const a = (s + 0.5) / 10 * Math.PI * 2; kitBoxZ(k, x + Math.cos(a) * (R + 0.07), cy + Math.sin(a) * (R + 0.07), z, 0.36, 0.09, 0.09, a, 0xc8ccd0); mark(1, [Math.cos(a), Math.sin(a), 0]); }
    kitRingZ(k, x, cy, f, f + 0.16, 0, 0.18, 16, 0x8a8f96, true);
    kitRingZ(k, x, cy, f + 0.12, f + 0.2, 0.62, 0.7, 28, 0xc8ccd0, true);
    for (let s = 0; s < 3; s++) kitBoxZ(k, x, cy, f + 0.16, 1.32, 0.06, 0.06, s * Math.PI / 3, 0xb4b9bf);
    kitRingZ(k, x, cy, f + 0.16, f + 0.24, 0, 0.12, 12, 0xc9a54a, true);
    mark(2);
  } else if (Lk.kind === 'vault') {
    // the Commercial's vault door: a thick steel slab, a face plate, rivets, hinges on the east edge, four bolts on
    // the west edge and the wheel
    const T = Lk.thick, f = z + T / 2, hy = Lk.hub[1];
    k.box(x, 0.02, z, w, Lk.h - 0.02, T, color);
    k.box(x, 0.35, f + 0.02, w - 0.4, 1.6, 0.04, light);
    for (const [u, y] of [[-0.66, 0.15], [0, 0.15], [0.66, 0.15], [-0.66, 2.1], [0, 2.1], [0.66, 2.1], [-0.66, 1.12], [0.66, 1.12]]) k.box(x + u, y, f + 0.015, 0.07, 0.07, 0.03, 0x6a7076);
    for (const y of [0.35, 1.5]) k.box(x + w / 2 + 0.04, y, f - 0.05, 0.1, 0.4, 0.14, 0x5c5e62);
    mark(0);
    for (const y of [0.45, 0.9, 1.35, 1.8]) { k.box(x - w / 2 - 0.06, y, z, 0.14, 0.07, 0.07, 0xc8ccd0); mark(1, [-1, 0, 0]); }
    kitRingZ(k, x, hy, f + 0.02, f + 0.12, 0.3, 0.36, 20, 0xc8ccd0, true);
    for (let s = 0; s < 3; s++) kitBoxZ(k, x, hy, f + 0.08, 0.62, 0.04, 0.04, s * Math.PI / 3, 0xb4b9bf);
    kitRingZ(k, x, hy, f, f + 0.14, 0, 0.07, 12, 0x8a8f96, true);
    mark(2);
  } else {
    // a plain door: the leaf, a kick plate and a handle on both faces (the latch side, away from the hinge), a vision
    // panel in the security door, steel bands on the cash room's
    const B = (u, y, v, wu, hh, dv, col) => along === 'x' ? k.box(x + u, y, z + v, wu, hh, dv, col) : k.box(x + v, y, z + u, dv, hh, wu, col);
    B(0, 0.02, 0, w - 0.02, Lk.h - 0.02, Lk.thick, color);
    for (const s of [-1, 1]) {
      B(0, 0.04, s * 0.032, w - 0.14, 0.22, 0.006, dark);
      B(-w / 2 + 0.17, 1.0, s * 0.05, 0.17, 0.04, 0.03, 0xc8ccd0); B(-w / 2 + 0.1, 0.94, s * 0.036, 0.05, 0.16, 0.012, 0xb4b9bf);
      if (Lk.key === 'sec') B(0.06, 1.3, s * 0.032, 0.26, 0.62, 0.006, 0x1d2a33);
      else for (const y of [0.75, 1.65]) B(0, y, s * 0.032, w - 0.1, 0.06, 0.008, dark);
    }
    mark(0);
  }
  const geo = new THREE.BufferGeometry(), base = new Float32Array(k.a.p);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(base.slice(), 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(k.a.c, 3));
  geo.setIndex(k.a.i); geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
  return { mesh, base, tag: Uint8Array.from(tag), dir: Float32Array.from(dir), Lk };
}
// where a point of the door's body is `t` seconds after it starts to open (room metres, x and z: the swing is about
// a vertical hinge, after the pull)
function bankDoorAt(Lk, t, x, z) {
  const T = Lk.times, ph = r => r ? smoothstep(r[0], r[1], t) : 1, pull = ph(T.pull), sw = ph(T.swing) * Lk.ang;
  const hx = Lk.hinge[0] + Lk.pull[0], hz = Lk.hinge[1] + Lk.pull[1], cs = Math.cos(sw), sn = Math.sin(sw);
  const rx = x + Lk.pull[0] * pull - hx, rz = z + Lk.pull[1] * pull - hz;
  return [hx + rx * cs + rz * sn, hz - rx * sn + rz * cs];
}
function bankDoorPlace(D, t) {
  const Lk = D.Lk, T = Lk.times, ph = r => r ? smoothstep(r[0], r[1], t) : 1;
  const spin = ph(T.spin) * (Lk.turns || 0) * Math.PI * 2, bolt = ph(T.bolt) * (Lk.boltIn || 0), cw = Math.cos(spin), sw = Math.sin(spin);
  const a = D.mesh.geometry.attributes.position, p = a.array, b = D.base, hub = Lk.hub;
  for (let i = 0, n = b.length / 3; i < n; i++) {
    let x = b[i * 3], y = b[i * 3 + 1], z = b[i * 3 + 2];
    if (D.tag[i] === 1) { x -= D.dir[i * 3] * bolt; y -= D.dir[i * 3 + 1] * bolt; z -= D.dir[i * 3 + 2] * bolt; }
    else if (D.tag[i] === 2) { const dx = x - hub[0], dy = y - hub[1]; x = hub[0] + dx * cw - dy * sw; y = hub[1] + dx * sw + dy * cw; }
    const q = bankDoorAt(Lk, t, x, z); p[i * 3] = q[0]; p[i * 3 + 1] = y; p[i * 3 + 2] = q[1];
  }
  a.needsUpdate = true;
}
// the floor box an open door stands on (its collider once it has swung): the body's footprint, moved to the end
function bankDoorOpenBox(Lk) {
  const t = Lk.times.swing[1], hu = Lk.half, hv = Math.max(Lk.thick, 0.12) / 2, xs = [], zs = [];
  for (const [u, v] of [[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv]]) {
    const q = Lk.along === 'x' ? bankDoorAt(Lk, t, Lk.x + u, Lk.z + v) : bankDoorAt(Lk, t, Lk.x + v, Lk.z + u);
    xs.push(q[0]); zs.push(q[1]);
  }
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), y0: 0, y1: Lk.h };
}
// ------------------------------------------------------------ the three interiors
const BANK_BUILD = {
  // the Old Quarter branch: warm terrazzo, walnut wainscot, green and brass; two windows; behind the staff door the
  // tellers' side, a corridor, the manager's office, the cash room and a small wall of deposit boxes
  n(k, rng, def) {
    const W = 14, D = 12, H = 3.4, hw = W / 2, hd = D / 2;
    const T = { counter: 0x5a3a24, top: 0xe9e0cf, trim: 0x2f6b4a, frame: 0x3a2a1e, lamp: 0xffe2b0 };
    k.room(W, D, H, { floor: 0xd9cfbd, wall: 0xe9e0cf, ceil: 0xf3eee4, trim: 0x3a2a1e, band: [1.0, 0.1], bandC: 0x5a3a24, lights: [3, 3], lightC: 0xffe2b0 });
    k.tiles(W, D, 0xd9cfbd, 0xc9bea8, 0.6);
    for (const [x, z, w, d] of [[0, hd - 0.05, W, 0.06], [-hw + 0.05, 3.1, 0.06, 5.8], [hw - 0.05, 3.1, 0.06, 5.8]]) k.box(x, 0, z, w, 1.0, d, 0x5a3a24); // wainscot
    k.door(0, hd - 0.02, 0, 0x2f3a33, 0x2f6b4a);
    FURN.rug(k, 0, 0, 4.4, 2.6, 1.6, 0x2f6b4a, 0x3a7a55);
    FURN.sofa(k, -6.2, 0, 3.4, Math.PI / 2, 2.4, 0x2f6b4a);
    k.box(-2.6, 0, 3.4, 1.6, 1.05, 0.6, 0x5a3a24, { col: true }); k.box(-2.6, 1.05, 3.4, 1.7, 0.05, 0.7, 0xe9e0cf); // the cheque desk
    FURN.desk(k, -4.6, 0, 1.2, 0, 1.3, true, 0x5a3a24); k.box(-4.6, 0, 2.1, 0.5, 0.48, 0.5, 0x2f6b4a); // new accounts
    k.glow(-4.6, 2.2, 0.32, 1.4, 0.24, 0.02, 0x2f6b4a, 1.4);
    FURN.plant(k, -6.3, 0, 5.4); FURN.plant(k, 6.3, 0, 5.4); FURN.art(k, hw - 0.04, 1.6, 3.0, -Math.PI / 2, 1.4, 0.9, 0x2f6b4a);
    k.glow(3.2, 2.6, 0.32, 3.6, 0.3, 0.03, 0xd8b44a, 1.4); // the brass name over the windows
    // the counter (z 0.2), two windows; a screen wall the rest of the way with the staff door (x -1.4)
    tellerLine(k, 0, 6.4, 0.2, 2, T);
    k.box(6.7, 0, 0.2, 0.6, H, 0.7, 0xe9e0cf, { col: true });
    iwall(k, 'x', 0.2, -hw, 0, 0, H, 0xe9e0cf, [[-1.975, -0.825]]);
    lockDoor(k, def, 'sec', -1.4, 0.2, 'x');
    // the back partition (z -2.5) with an open doorway into the corridor (x -1.6..0.6)
    iwall(k, 'x', -2.5, -hw, hw, 0, H, 0xe2d8c4, [[-1.4, -0.2]]);
    // the manager's office (x < -1.6): desk, CCTV, the keycard in the drawer
    iwall(k, 'z', -1.6, -hd, -2.5, 0, H, 0xe2d8c4, [[-4.4, -3.2]]);
    FURN.desk(k, -4.2, 0, -5.0, 0, 1.4, true, 0x5a3a24); k.box(-4.2, 0, -5.7, 0.5, 0.48, 0.5, 0x2f6b4a);
    k.box(-6.85, 0.9, -4.0, 0.06, 0.7, 1.4, 0x111111); k.glow(-6.8, 0.95, -4.0, 0.01, 0.6, 1.3, 0x6a9a7a, 1.2);
    FURN.bookshelf(k, -6.6, 0, -2.9, Math.PI / 2, 1.0, rng);
    // the cash room (x > 0.6): a steel door, shelves of banded cash, a floor safe
    iwall(k, 'z', 0.6, -hd, -2.5, 0, H, 0x9aa0a6, [[-3.6, -2.6]]);
    lockDoor(k, def, 'cash', 0.6, -3.1, 'z', 1.0, 0x5c5e62);
    cashShelf(k, 3.6, -5.6, 4.6, 0.6, 2.0, rng); cashShelf(k, 6.6, -4.0, 2.4, 0.6, 2.0, rng, true);
    FURN.safe(k, 1.6, 0, -5.4, 0);
    k.glow(3.6, H - 0.08, -4.2, 1.2, 0.03, 0.4, 0xf4fbff, 2.4);
    // the rear staff door: the back wall of the manager's office (a fire door with a crash bar and an exit sign)
    k.door(-6.0, -hd + 0.02, Math.PI, 0x4a4f55, 0x46d46a); k.box(-6.0, 0.95, -hd + 0.08, 0.9, 0.08, 0.06, 0xc8ccd0);
    // the deposit boxes: the end wall of the corridor
    boxWall(k, 'x', -hd + 0.3, -1.5, 0.5, 0.3, 6, 4, 1);
  },
  // the Downtown branch: grey stone, navy and steel, a long teller line, two glass offices, a keypad door to the
  // secured corridor: the cash room, the vault and the deposit room
  d(k, rng, def) {
    const W = 22, D = 18, H = 4.2, hw = W / 2, hd = D / 2;
    const T = { counter: 0x1f3f6e, top: 0xe8ebee, trim: 0x8a9096, frame: 0x2a2e33, lamp: 0xd8ecff };
    k.room(W, D, H, { floor: 0x8c9095, wall: 0xdfe3e7, ceil: 0xf2f4f6, trim: 0x2a2e33, band: [3.2, 0.25], bandC: 0x1f3f6e, lights: [4, 4], lightC: 0xf0f6ff });
    k.tiles(W, D, 0x8c9095, 0x7a7e84, 1.2);
    k.door(0, hd - 0.02, 0, 0x2a2e33, 0x7fb2ff);
    // the lobby: queue posts, sofas, a writing island, screens, plants
    for (let i = 0; i < 4; i++) { k.box(-4 + i * 1.6, 0, 4.5, 0.08, 0.95, 0.08, 0xc8ccd0); if (i < 3) k.box(-3.2 + i * 1.6, 0.85, 4.5, 1.5, 0.04, 0.04, 0x1f3f6e); }
    FURN.sofa(k, -10.2, 0, 6.6, Math.PI / 2, 2.4, 0x1f3f6e); FURN.sofa(k, -10.2, 0, 3.4, Math.PI / 2, 2.4, 0x1f3f6e);
    k.box(-6.0, 0, 7.0, 2.2, 1.05, 0.9, 0xe8ebee, { col: true }); k.box(-6.0, 1.05, 7.0, 2.3, 0.05, 1.0, 0x1f3f6e);
    for (const x of [-5, 1.4]) { k.box(x, 2.2, hd - 0.12, 2.4, 1.3, 0.08, 0x111111); k.glow(x, 2.25, hd - 0.17, 2.2, 1.15, 0.01, 0x2a6ab8, 1.3); }
    FURN.plant(k, -10.3, 0, 8.3); FURN.plant(k, 3.8, 0, 8.3);
    k.glow(-3.75, 3.3, 1.72, 7.2, 0.4, 0.03, 0x7fb2ff, 1.4); // the name over the windows
    // the teller line (z 1.6), four windows; a wall either side, the keypad door at x 3.1
    tellerLine(k, -9, 1.5, 1.6, 4, T);
    k.box(-10.0, 0, 1.6, 2.0, H, 0.2, 0xdfe3e7, { col: true });
    k.box(2.0, 0, 1.6, 1.0, H, 0.2, 0xdfe3e7, { col: true });
    iwall(k, 'x', 1.6, 2.5, 4.5, 0, H, 0xdfe3e7, [[2.525, 3.675]]);
    lockDoor(k, def, 'sec', 3.1, 1.6, 'x', 1.15, 0x1f3f6e);
    k.box(3.95, 1.1, 1.75, 0.18, 0.26, 0.04, 0x2a2e33); k.glow(3.95, 1.22, 1.78, 0.12, 0.08, 0.01, 0x46d46a, 1.8); // keypad
    // the glass offices (x 4.5..11, z 1.6..9): two of them, desks and chairs
    iwall(k, 'z', 4.5, 1.6, hd, 0, H, 0xdfe3e7, [[6.6, 7.8], [2.6, 3.8]]);
    glassWall(k, 'x', 5.2, 4.5, hw, H);
    iwall(k, 'x', 1.6, 4.5, hw, 0, H, 0xdfe3e7);
    for (const z of [7.2, 3.4]) { FURN.desk(k, 8.6, 0, z, Math.PI / 2, 1.4, true, 0x2a2e33); k.box(9.6, 0, z, 0.5, 0.48, 0.5, 0x1f3f6e); k.box(7.4, 0, z, 0.5, 0.48, 0.5, 0x8a9096); FURN.plant(k, 10.4, 0, z + 1.2, 0.8); }
    // the secured corridor (z 1.6..-2.4) and what opens off it
    iwall(k, 'x', -2.4, -hw, hw, 0, H, 0xc8ccd0, [[-7.575, -6.425], [1.7, 3.3], [6.9, 8.1]]);
    k.glow(-4, H - 0.08, -0.4, 5, 0.03, 0.3, 0xf0f6ff, 2.4); k.glow(6, H - 0.08, -0.4, 4, 0.03, 0.3, 0xf0f6ff, 2.4);
    // the cash room (x < -4.5): its door at x -7, shelves of cash
    iwall(k, 'z', -4.5, -hd, -2.4, 0, H, 0x9aa0a6);
    lockDoor(k, def, 'cash', -7.0, -2.4, 'x', 1.15, 0x5c5e62);
    cashShelf(k, -8.0, -8.3, 5.4, 0.6, 2.2, rng); cashShelf(k, -10.5, -5.4, 4.0, 0.6, 2.2, rng, true); cashShelf(k, -5.1, -5.6, 3.6, 0.6, 2.2, rng, true);
    k.glow(-7.8, H - 0.08, -5.6, 1.2, 0.03, 0.4, 0xf4fbff, 2.4);
    // the vault (x -4.5..5): a thick steel door at x 2.5 in a heavy frame; carts and shelves inside
    iwall(k, 'z', 5.0, -hd, -2.4, 0, H, 0x9aa0a6);
    k.box(1.35, 0, -2.4, 0.5, 2.9, 0.7, 0x5c5e62, { col: true }); k.box(3.65, 0, -2.4, 0.5, 2.9, 0.7, 0x5c5e62, { col: true }); k.box(2.5, 2.6, -2.4, 2.8, 0.5, 0.7, 0x5c5e62);
    // it opens out into the corridor and right round, flat against the wall east of the frame
    lockDoor(k, def, 'vault', 2.5, -2.4, 'x', 1.56, 0x8a9096, { kind: 'vault', thick: 0.4, half: 0.78, hinge: [3.28, -2.2], pull: [0, 0.6], ang: Math.PI, hub: [2.5, 1.2],
      turns: 1.5, boltIn: 0.16, times: { spin: [0, 1.0], bolt: [0.4, 1.0], pull: [1.0, 1.5], swing: [1.5, 3.0] } });
    for (const [x, z] of [[-3.2, -5.2], [-1.4, -5.2], [0.6, -6.4], [3.2, -6.4]]) cashCart(k, x, z, rng);
    cashShelf(k, 0.2, -8.4, 8.6, 0.6, 2.4, rng);
    k.glow(0.2, H - 0.08, -5.8, 1.4, 0.03, 0.45, 0xf4fbff, 2.6);
    // the rear staff door: the east end of the secured corridor
    k.door(hw - 0.02, -0.4, -Math.PI / 2, 0x4a4f55, 0x46d46a); k.box(hw - 0.08, 0.95, -0.4, 0.06, 0.08, 0.9, 0xc8ccd0);
    // the deposit room (x 5..11): boxes on two walls, a viewing table
    boxWall(k, 'x', -hd + 0.3, 5.6, 10.6, 0.3, 7, 10, 1); boxWall(k, 'z', hw - 0.3, -8.4, -3.2, 0.3, 7, 6, -1);
    k.box(7.6, 0, -5.2, 1.6, 0.9, 0.8, 0x7a7f86, { col: true });
    k.glow(7.8, H - 0.08, -5.6, 1.2, 0.03, 0.4, 0xf4fbff, 2.4);
  },
  // the Central Bank: a marble hall under a coffered six-metre ceiling, columns and chandeliers, six windows in a
  // brass and mahogany counter, the executive suite west, the security office east; behind the bronze door (east
  // end of the counter) the tellers' side, a corridor, the cash room, the great round vault and the deposit hall
  c(k, rng, def) {
    const W = 30, D = 26, H = 6, hw = W / 2, hd = D / 2;
    const T = { counter: 0x4a2418, top: 0xe9e2d2, trim: 0xc9a54a, frame: 0xc9a54a, lamp: 0xffe6bc };
    k.room(W, D, H, { floor: 0xe9e2d2, wall: 0xe6dcc6, ceil: 0xf1ebdf, trim: 0x7a1f2b, band: [4.8, 0.4], bandC: 0xc9a54a, lights: [1, 1], lightC: 0xffe6bc });
    k.tiles(W, D, 0xe9e2d2, 0x24252a, 1.5);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) k.box(-12 + i * 6, H - 0.35, 10 - j * 6, 5.2, 0.3, 5.2, 0xe6dcc6); // coffers
    for (const [x, z] of [[-6, 8.5], [6, 8.5], [-6, 3], [6, 3], [0, 6]]) FURN.chandelier(k, x, H - 1.6, z);
    for (const x of [-2.6, 0, 2.6]) k.door(x, hd - 0.02, 0, 0x3a2a1e, 0xc9a54a);
    // columns with gilt capitals
    for (const x of [-9, -3, 3, 9]) for (const z of [9.5, 3.5]) { k.box(x, 0, z, 1.0, H - 0.6, 1.0, 0xefe7d6, { col: true }); k.box(x, H - 0.8, z, 1.3, 0.3, 1.3, 0xc9a54a); k.box(x, 0, z, 1.3, 0.3, 1.3, 0xd8cfbd); }
    // the security checkpoint at the doors: two arches either side of the middle way
    for (const x of [-3.2, 3.2]) { k.box(x - 0.6, 0, 11.0, 0.15, 2.3, 0.6, 0x8a9096); k.box(x + 0.6, 0, 11.0, 0.15, 2.3, 0.6, 0x8a9096); k.box(x, 2.3, 11.0, 1.35, 0.2, 0.6, 0x8a9096); }
    // benches, a writing table, palms, the rug, the name in gold over the counter
    FURN.sofa(k, -6.0, 0, 6.4, Math.PI / 2, 2.4, 0x7a1f2b); FURN.sofa(k, 6.0, 0, 6.4, -Math.PI / 2, 2.4, 0x7a1f2b);
    k.box(0, 0, 4.6, 3.2, 1.05, 1.0, 0x4a2418, { col: true }); k.box(0, 1.05, 4.6, 3.3, 0.06, 1.1, 0xe9e2d2);
    for (const x of [-9.8, 9.8]) FURN.plant(k, x, 0, 12.0, 1.4);
    k.glow(-1.25, 3.6, -0.68, 9.5, 0.5, 0.04, 0xd8b44a, 1.5);
    FURN.rug(k, 0, 0, 8.6, 3.4, 6.0, 0x7a1f2b, 0x8a2a36);
    // the counter (z -0.8): six windows in brass; the bronze door at its east end (x 9.25); walls beyond
    tellerLine(k, -10.5, 8.0, -0.8, 6, T);
    iwall(k, 'x', -0.8, 8.0, 10.5, 0, H, 0xe6dcc6, [[8.65, 9.85]]);
    lockDoor(k, def, 'sec', 9.25, -0.8, 'x', 1.2, 0x8a6a3a);
    k.glow(9.25, 2.55, -0.66, 1.4, 0.12, 0.03, 0xd8b44a, 1.6);
    k.box(-12.75, 0, -0.8, 4.5, H, 0.3, 0xe6dcc6, { col: true }); k.box(12.75, 0, -0.8, 4.5, H, 0.3, 0xe6dcc6, { col: true });
    // the executive suite (x < -10.5) and the security office (x > 10.5)
    iwall(k, 'z', -10.5, -0.8, hd, 0, H, 0xe6dcc6, [[6.4, 7.6]]);
    iwall(k, 'z', 10.5, -0.8, hd, 0, H, 0xe6dcc6, [[6.4, 7.6]]);
    FURN.desk(k, -13.2, 0, 9.0, Math.PI / 2, 1.6, true, 0x4a2418); FURN.armchair(k, -12.0, 0, 9.0, -Math.PI / 2, 0x7a1f2b); FURN.bookshelf(k, -14.6, 0, 4.0, Math.PI / 2, 2.4, rng);
    FURN.art(k, -14.85, 1.8, 9.0, Math.PI / 2, 1.6, 1.0, 0x2a5f9e); FURN.plant(k, -11.2, 0, 12.0);
    for (let i = 0; i < 4; i++) { k.box(14.8, 1.2 + (i % 2) * 0.9, 3.4 + Math.floor(i / 2) * 1.3, 0.08, 0.75, 1.2, 0x111111); k.glow(14.75, 1.25 + (i % 2) * 0.9, 3.4 + Math.floor(i / 2) * 1.3, 0.01, 0.65, 1.1, 0x6a9a7a, 1.3); }
    k.box(13.4, 0, 4.0, 1.0, 0.8, 2.4, 0x2a2e33, { col: true });
    // behind the counter: the tellers' side (z -0.8..-3.2), the partition with an open way through (x 0), the corridor
    iwall(k, 'x', -3.2, -hw, hw, 0, H, 0xd8cfbd, [[-0.6, 0.6], [10.5, 11.7]]);
    // the cash room (x < -6, z < -6.2)
    iwall(k, 'z', -6.0, -hd, -6.2, 0, H, 0x9aa0a6);
    iwall(k, 'x', -6.2, -hw, -6.0, 0, H, 0x9aa0a6, [[-10.375, -9.225]]);
    lockDoor(k, def, 'cash', -9.8, -6.2, 'x', 1.15, 0x5c5e62);
    for (const z of [-8.6, -11.4]) cashShelf(k, -10.5, z, 7.0, 0.6, 2.4, rng);
    k.glow(-10.5, H - 0.08, -10.0, 2.2, 0.03, 0.5, 0xf4fbff, 2.6);
    // the great round vault door (x 4) in a massive round steel frame set in the stone face (a square opening behind
    // the frame, the wall above it to the ceiling; the frame's lower quarters are solid, so the way through is the
    // round hole); the door opens back into the vault, so nothing stands where it swings
    iwall(k, 'x', -6.2, -6.0, 2.4, 0, H, 0x7a7f86);
    iwall(k, 'x', -6.2, 5.6, hw, 0, H, 0x7a7f86, [[11.4, 12.6]]);
    k.box(4.0, 3.3, -6.2, 3.2, H - 3.3, 0.15, 0x7a7f86, { col: true });
    kitRingZ(k, 4.0, 1.7, -6.5, -5.9, 1.6, 2.4, 40, 0x6a6f76);
    kitRingZ(k, 4.0, 1.7, -5.9, -5.86, 2.2, 2.38, 40, 0x8a8f96, true);
    k.cols.push({ x0: 2.4, x1: 3.25, z0: -6.5, z1: -5.9, y0: 0, y1: 0.9 }, { x0: 4.75, x1: 5.6, z0: -6.5, z1: -5.9, y0: 0, y1: 0.9 });
    lockDoor(k, def, 'vault', 4.0, -6.2, 'x', 3.2, 0x9aa0a6, { kind: 'round', thick: 0.45, half: 1.55, h: 3.25, hinge: [2.45, -6.425], pull: [0, -0.65], ang: Math.PI / 2, hub: [4.0, 1.7],
      turns: 2, boltIn: 0.3, times: { spin: [0, 1.4], bolt: [0.6, 1.4], pull: [1.4, 2.1], swing: [2.1, 4.0] } });
    iwall(k, 'z', 9.0, -hd, -6.2, 0, H, 0x7a7f86);
    // the west of the vault (behind the open door): cash carts; the east: gold on its trolleys and two more carts
    for (const [x, z] of [[-3.6, -8.6], [-1.6, -8.6], [0.4, -8.6], [-3.6, -11.0], [-1.6, -11.0], [0.4, -11.0]]) cashCart(k, x, z, rng);
    for (const [x, z] of [[7.6, -7.6], [7.6, -9.4], [7.6, -11.2]]) goldStack(k, x, z);
    for (const [x, z] of [[4.2, -11.4], [5.8, -11.4]]) cashCart(k, x, z, rng);
    cashShelf(k, 1.6, -12.5, 12, 0.6, 2.6, rng);
    k.glow(1.6, H - 0.08, -9.6, 2.6, 0.03, 0.6, 0xfff1d6, 2.6);
    k.glow(-2, H - 0.08, -4.6, 6, 0.03, 0.3, 0xfff1d6, 2.4); k.glow(8, H - 0.08, -4.6, 6, 0.03, 0.3, 0xfff1d6, 2.4);
    // the rear staff door: the west end of the corridor
    k.door(-hw + 0.02, -4.7, Math.PI / 2, 0x4a4f55, 0x46d46a); k.box(-hw + 0.08, 0.95, -4.7, 0.06, 0.08, 0.9, 0xc8ccd0);
    // the deposit hall (x 9..15): boxes floor to head height on three walls, a viewing table
    boxWall(k, 'z', hw - 0.3, -12.5, -6.8, 0.3, 8, 14, -1); boxWall(k, 'x', -hd + 0.3, 9.6, 14.4, 0.3, 8, 10, 1); boxWall(k, 'z', 9.3, -12.5, -8.5, 0.3, 8, 10, 1);
    k.box(12.0, 0, -9.2, 1.8, 0.9, 0.9, 0x7a7f86, { col: true });
    k.glow(12.0, H - 0.08, -9.4, 1.4, 0.03, 0.5, 0xf4fbff, 2.4);
  }
};
// where things are in each interior (local metres): the windows to rob or bank at, the jobs behind, the guards'
// posts (in the order they come on duty), the staff and the customers, where the police come in (the front: storm;
// the rear staff door: rear, also where you stand to use it and where you come in through it), the middle of the
// banking hall (hall: where you take control of it) and the counter line (staffZ: behind it is staff only)
const BANK_LAYOUT = {
  n: {
    exit: { x: 0, z: 5.4 }, storm: { x: 0, z: 4.6 }, rear: { x: -6.0, z: -5.2, h: 0 }, hall: { x: 1.2, z: 3.4, r: 1.5 }, staffZ: 0.2,
    windows: [{ x: 1.6, z: 1.1 }, { x: 4.8, z: 1.1 }],
    jobs: { office: { x: -4.2, z: -4.2 }, sec: { x: -1.4, z: 1.0 }, cashdoor: { x: -0.2, z: -3.1 }, cash: { x: 3.6, z: -4.6 }, boxes: { x: -0.5, z: -4.9 } },
    posts: [{ x: 2.6, z: 4.6, h: Math.PI }, { x: -3.6, z: 2.2, h: Math.PI / 2 }, { x: -0.5, z: -3.6, h: 0 }],
    staff: [{ id: 'teller0', x: 1.6, z: -0.7, h: 0 }, { id: 'teller1', x: 4.8, z: -0.7, h: 0 }, { id: 'manager', x: -4.2, z: -5.6, h: 0 }],
    customers: [{ x: 1.6, z: 2.0, h: Math.PI }, { x: -6.2, z: 3.4, h: Math.PI / 2 }]
  },
  d: {
    exit: { x: 0, z: 8.4 }, storm: { x: 0, z: 7.6 }, rear: { x: 10.2, z: -0.4, h: -Math.PI / 2 }, hall: { x: -2.0, z: 6.2, r: 1.8 }, staffZ: 1.6,
    windows: [{ x: -7.69, z: 2.5 }, { x: -5.06, z: 2.5 }, { x: -2.44, z: 2.5 }, { x: 0.19, z: 2.5 }],
    jobs: { office: { x: 7.4, z: 4.4 }, sec: { x: 3.1, z: 2.5 }, cashdoor: { x: -7.0, z: -1.6 }, cash: { x: -8.0, z: -7.0 }, vaultdoor: { x: 1.0, z: -1.2 }, vault: { x: 0.2, z: -6.0 }, boxes: { x: 8.0, z: -7.2 } },
    posts: [{ x: 1.8, z: 7.6, h: Math.PI }, { x: -7.0, z: 5.6, h: Math.PI / 2 }, { x: -1.0, z: -0.6, h: Math.PI / 2 }, { x: 8.0, z: -0.4, h: Math.PI }, { x: 6.0, z: -1.2, h: -Math.PI / 2 }],
    staff: [{ id: 'teller0', x: -7.69, z: 0.6, h: 0 }, { id: 'teller1', x: -5.06, z: 0.6, h: 0 }, { id: 'teller2', x: -2.44, z: 0.6, h: 0 }, { id: 'teller3', x: 0.19, z: 0.6, h: 0 }, { id: 'manager', x: 9.6, z: 3.4, h: -Math.PI / 2 }, { id: 'officer', x: 9.6, z: 7.2, h: -Math.PI / 2 }],
    customers: [{ x: -5.06, z: 3.4, h: Math.PI }, { x: -2.6, z: 5.3, h: Math.PI }, { x: -10.2, z: 6.6, h: Math.PI / 2 }, { x: 7.4, z: 7.2, h: Math.PI / 2 }]
  },
  c: {
    exit: { x: 0, z: 12.4 }, storm: { x: 0, z: 11.6 }, rear: { x: -14.2, z: -4.7, h: Math.PI / 2 }, hall: { x: 0, z: 7.6, r: 2.0 }, staffZ: -0.8,
    windows: [{ x: -8.96, z: 0.1 }, { x: -5.875, z: 0.1 }, { x: -2.79, z: 0.1 }, { x: 0.29, z: 0.1 }, { x: 3.375, z: 0.1 }, { x: 6.46, z: 0.1 }],
    jobs: { office: { x: -11.9, z: 7.8 }, sec: { x: 9.25, z: 0.1 }, cashdoor: { x: -9.8, z: -5.3 }, cash: { x: -10.5, z: -10.0 }, vaultdoor: { x: 4.0, z: -5.2 }, vault: { x: 4.6, z: -9.2 }, boxes: { x: 12.0, z: -7.6 } },
    posts: [{ x: -4.4, z: 11.6, h: Math.PI }, { x: 4.4, z: 11.6, h: Math.PI }, { x: -6.0, z: 1.8, h: Math.PI / 2 }, { x: 6.0, z: 1.8, h: -Math.PI / 2 }, { x: 12.6, z: 7.0, h: -Math.PI / 2 }, { x: 4.0, z: -4.4, h: Math.PI }, { x: -4.0, z: -4.6, h: Math.PI / 2 }, { x: 12.0, z: -11.0, h: 0 }],
    staff: [{ id: 'teller0', x: -8.96, z: -1.8, h: 0 }, { id: 'teller1', x: -5.875, z: -1.8, h: 0 }, { id: 'teller2', x: -2.79, z: -1.8, h: 0 }, { id: 'teller3', x: 0.29, z: -1.8, h: 0 }, { id: 'teller4', x: 3.375, z: -1.8, h: 0 }, { id: 'teller5', x: 6.46, z: -1.8, h: 0 }, { id: 'manager', x: -14.2, z: 9.0, h: Math.PI / 2 }, { id: 'security', x: 14.0, z: 4.0, h: -Math.PI / 2 }],
    customers: [{ x: -5.875, z: 1.0, h: Math.PI }, { x: 0.29, z: 1.0, h: Math.PI }, { x: -1.0, z: 5.4, h: 0 }, { x: -6.0, z: 6.4, h: Math.PI / 2 }, { x: 6.0, z: 6.4, h: -Math.PI / 2 }]
  }
};
const BANK_STAFF_LOOK = {
  n: { shirt: 0xe9e0cf, pants: 0x2f6b4a }, d: { shirt: 0xe8ebee, pants: 0x1f3f6e }, c: { shirt: 0xf4f2ee, pants: 0x2a2226 }
};
const BANK_GUARD_LOOK = { shirt: 0x3a4a5e, pants: 0x1a1c22, cap: 0x1a1c22 };
function bankInteriorDef(B, L) {
  const Y = BANK_LAYOUT[B.id], spots = [];
  Y.windows.forEach((w, i) => spots.push(bankSpot('w' + i, w.x, w.z, 0.85)));
  for (const k in Y.jobs) spots.push(bankSpot(k, Y.jobs[k].x, Y.jobs[k].z, k === 'boxes' || k === 'cash' || k === 'vault' ? 1.5 : 1.0));
  spots.push(bankSpot('hall', Y.hall.x, Y.hall.z, Y.hall.r), bankSpot('exit', Y.exit.x, Y.exit.z, 1.2), bankSpot('back', Y.rear.x, Y.rear.z, 0.9));
  return {
    id: 'bank:' + B.id, dynamic: true, name: B.name, w: B.w, d: B.d, h: B.h, exit: Y.exit, spawnH: Math.PI, noExit: true, fight: true,
    bank: B.id, at: { x: L.x, z: L.z }, door: { x: L.x, z: L.z, h: L.h }, seed: 7919 + B.tier * 131,
    build(k, rng, def) { BANK_BUILD[B.id](k, rng, def); },
    afterInstall(grp, def) {
      // the doors that open, drawn with this room's own lamp-lit material (grp's first child is the room mesh, 350)
      def.doors = {};
      const mat = grp.children[0].material;
      for (const key in def.locks) { const D = bankDoor(def.locks[key], B.h, mat); grp.add(D.mesh); def.doors[key] = D; }
    },
    spots
  };
}
// ------------------------------------------------------------ the street front
// built once into the outdoor group by BankSystem: a neoclassical portico for the Central Bank, a glass and steel
// frontage for the Commercial, a stone surround and green awning for the neighbourhood branch; each with its
// name in lights
function bankFacade(gb, lb, B, d) {
  const fx = Math.sin(d.h), fz = Math.cos(d.h), rx = Math.cos(d.h), rz = -Math.sin(d.h), y0 = d.y0;
  const at = (side, out) => [d.x - fx * (d.wall - out) + rx * side, d.z - fz * (d.wall - out) + rz * side];
  const box = (b, side, out, y, w, h, dd, col) => { const [x, z] = at(side, out); b.box(x, y0 + y + h / 2, z, w, h, dd, C(col), d.h); };
  if (B.id === 'c') {
    box(gb, 0, 2.2, 0.05, 22, 0.1, 4.6, 0xd8cfbd); box(gb, 0, 1.4, 0.15, 20, 0.12, 3.0, 0xe2dacb); // the plinth (flat enough to walk on)
    for (const s of [-9, -5.4, -1.8, 1.8, 5.4, 9]) { box(gb, s, 2.9, 0.2, 1.1, 0.4, 1.1, 0xd8cfbd); box(gb, s, 2.9, 0.6, 0.8, 7.4, 0.8, 0xefe7d6); box(gb, s, 2.9, 8.0, 1.2, 0.5, 1.2, 0xc9a54a); }
    box(gb, 0, 2.6, 8.5, 21, 1.1, 1.9, 0xe6dcc6); box(gb, 0, 2.6, 9.6, 21.6, 0.35, 2.0, 0xd8cfbd);
    for (let i = 0; i < 6; i++) box(gb, 0, 2.6, 9.95 + i * 0.32, 20 - i * 3.4, 0.32, 1.8, 0xe6dcc6); // the stepped pediment
    box(gb, -3.6, 0.04, 1.2, 0.2, 2.6, 0.2, 0x2a2e33); box(gb, 3.6, 0.04, 1.2, 0.2, 2.6, 0.2, 0x2a2e33);
    box(lb, -3.6, 0.06, 2.75, 0.4, 0.5, 0.4, 0xffffff); box(lb, 3.6, 0.06, 2.75, 0.4, 0.5, 0.4, 0xffffff);
  } else if (B.id === 'd') {
    box(gb, 0, 0.08, 0, 12, 7.2, 0.14, 0x20344e); // the dark glass frontage
    for (const s of [-6, -3, 0, 3, 6]) box(gb, s, 0.15, 0, 0.16, 7.2, 0.18, 0x8a9096);
    for (const y of [2.5, 4.8]) box(gb, 0, 0.15, y, 12, 0.14, 0.18, 0x8a9096);
    box(gb, 0, 1.6, 3.0, 6.4, 0.18, 3.0, 0x2a2e33); box(gb, 0, 3.05, 3.14, 6.4, 0.06, 0.08, 0x7fb2ff);
    for (const s of [-2.8, 2.8]) box(gb, s, 3.0, 0.02, 0.18, 3.0, 0.18, 0x2a2e33);
    for (const s of [-3.4, -2.2, 2.2, 3.4]) box(gb, s, 3.9, 0.02, 0.22, 0.9, 0.22, 0x8a9096); // bollards
    box(lb, 0, 1.6, 2.9, 5.6, 0.04, 2.2, 0xffffff);
  } else {
    box(gb, 0, 0.1, 0, 7.2, 4.2, 0.24, 0xd8cfbd); // the stone surround
    for (const s of [-3.2, 3.2]) box(gb, s, 0.2, 0, 0.6, 4.2, 0.4, 0xc9bea8);
    box(gb, 0, 0.25, 4.2, 7.6, 0.4, 0.5, 0xc9bea8);
    box(gb, 0, 1.0, 2.75, 4.6, 0.08, 1.8, 0x2f6b4a); box(gb, 0, 1.85, 2.55, 4.6, 0.3, 0.06, 0x2f6b4a); // the green awning
    box(gb, 2.9, 0.18, 1.0, 0.7, 1.4, 0.18, 0x5c5e62); box(lb, 2.9, 0.28, 1.5, 0.5, 0.4, 0.04, 0xffffff); // the cash machine
    box(lb, 0, 0.2, 3.5, 0.4, 0.4, 0.15, 0xffffff);
  }
  // the name board
  const [nx, nz] = at(0, B.id === 'c' ? 3.6 : B.id === 'd' ? 0.32 : 0.3);
  return { x: nx, y: y0 + (B.id === 'c' ? 8.6 : B.id === 'd' ? 5.6 : 3.75), z: nz, h: d.h, w: B.id === 'c' ? 14 : B.id === 'd' ? 8 : 5.6, ht: B.id === 'c' ? 0.9 : B.id === 'd' ? 0.9 : 0.6 };
}
// the rear staff door on the back wall of a bank's building (r: BankSystem.rearOf, the wall point and the way out):
// a steel door in a dark frame on a concrete step, a lock box, a caged lamp over it; its sign is bankRearSigns
function bankRearDoor(gb, lb, r) {
  const ox = Math.sin(r.h), oz = Math.cos(r.h), rx = Math.cos(r.h), rz = -Math.sin(r.h);
  const box = (b, side, out, y, w, h, dd, col) => b.box(r.x + ox * out + rx * side, r.y0 + y + h / 2, r.z + oz * out + rz * side, w, h, dd, C(col), r.h);
  box(gb, 0, 0.6, 0, 1.9, 0.12, 1.2, 0x8a8f96);
  box(gb, 0, 0.06, 0, 1.6, 2.55, 0.12, 0x2a2e33);
  box(gb, 0, 0.13, 0.12, 1.2, 2.25, 0.04, 0x6a7076);
  box(gb, 0, 0.155, 0.16, 1.1, 0.25, 0.01, 0x4a4f55);
  box(gb, 0.42, 0.16, 1.0, 0.05, 0.14, 0.05, 0xc8ccd0); box(gb, 0.48, 0.15, 1.2, 0.12, 0.2, 0.04, 0x1a1c20);
  box(gb, 0, 0.2, 2.66, 0.46, 0.14, 0.4, 0x2a2e33); box(lb, 0, 0.2, 2.6, 0.36, 0.06, 0.3, 0xffffff);
}
// the rear doors' "STAFF ENTRANCE" signs: one quad each over the door, all in one mesh (one draw call)
function bankRearSigns(rs) {
  const p = [], n = [], uv = [], ix = [], w = 1.5, ht = 0.28;
  rs.forEach((r, k) => {
    const ox = Math.sin(r.h), oz = Math.cos(r.h), rx = Math.cos(r.h), rz = -Math.sin(r.h), cx = r.x + ox * 0.03, cz = r.z + oz * 0.03, y = r.y0 + 3.06;
    for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { p.push(cx + rx * s * w / 2, y + t * ht / 2, cz + rz * s * w / 2); n.push(ox, 0, oz); uv.push((s + 1) / 2, (t + 1) / 2); }
    ix.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(ix); geo.computeBoundingSphere();
  return geo;
}
