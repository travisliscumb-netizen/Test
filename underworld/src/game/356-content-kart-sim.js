/* =====================================================================
   [CONTENT] THE KART SIMULATOR (owner, 2026-11-17): a racing game inside the
   game, played at the rig in the bunker's games room (355).
   - Its own world: Valen Kart Park, a figure-of-eight circuit of about
     1.3 km. The bridge carries the second half of the lap over the first
     where they cross; a tunnel runs through a hill on the west loop; a small
     bridge crosses a creek on the east. Kerbs on the corners, tyre walls
     beyond the run-off, a grandstand and a start gantry, trees round it all.
   - Six karts: you and five rivals, three laps, a lights-out start.
   - Kart physics: a light, quick car. A bicycle model: each axle's grip
     builds with its slip angle up to what its tyres hold, so the kart turns
     in sharply, slides when you ask too much of it, and the front and rear
     grips (the settings) decide whether it pushes wide or swings round.
   - Pause (Esc, or the pause button) stops the race and offers the
     settings (steering, front grip, rear grip, top speed), restart, and quit
     back to the bunker. The settings and your best lap are saved.
   While it runs the main game stands still (Game.tick hands the frame here).
   ===================================================================== */
const KART = {
  laps: 3, w: 10, run: 4.5, rivals: 5,
  // the circuit's control points [x, y, z]: a figure of eight through the origin; the second pass crosses on the bridge
  pts: [[-20, 0, -20], [20, 0, 20], [60, 0, 50], [110, 0, 62], [150, 0, 32], [162, 0, -18], [134, 0, -60], [84, 0, -72], [40, 3, -50], [15, 6.5, -15],
    [-15, 6.5, 15], [-58, 3.5, 50], [-108, 0.6, 62], [-150, 0, 32], [-164, 0, -16], [-134, 0, -60], [-84, 0, -72], [-45, 0, -50]],
  tunnel: [[-166, 30], [-120, -66]],   // the tunnel runs between these two points of the west loop (nearest samples)
  creek: [128, 54],                     // the creek crosses the east loop here
  colors: [0xd23a2a, 0x2a6fd6, 0xf2c230, 0x2f9a4a, 0x8a3ad2, 0xff8a3d],
  names: ['You', 'Rossi', 'Kimura', 'Dahl', 'Okafor', 'Vance']
};
const KART_SET = { steer: [0.6, 1.5], fgrip: [0.6, 1.5], rgrip: [0.6, 1.5], top: [0.8, 1.2] };
class KartSim {
  constructor(game) { this.g = game; this.active = false; }
  static sanitize(d) {
    const k = d.kart && typeof d.kart === 'object' ? d.kart : {}, n = (v, lo, hi, def) => typeof v === 'number' && isFinite(v) ? clamp(v, lo, hi) : def;
    d.kart = { steer: n(k.steer, ...KART_SET.steer, 1), fgrip: n(k.fgrip, ...KART_SET.fgrip, 1), rgrip: n(k.rgrip, ...KART_SET.rgrip, 1), top: n(k.top, ...KART_SET.top, 1), best: n(k.best, 0, 3600, 0), wins: Math.floor(n(k.wins, 0, 1e6, 0)) };
  }
  get S() { if (!this.g.save.kart) KartSim.sanitize(this.g.save); return this.g.save.kart; }
  // ---------------------------------------------------------------- the track
  _track() {
    if (this.T) return this.T;
    const P = KART.pts.map(p => new THREE.Vector3(p[0], p[1], p[2])), curve = new THREE.CatmullRomCurve3(P, true, 'catmullrom', 0.5);
    const L = curve.getLength(), n = Math.round(L), S = [];
    for (let i = 0; i < n; i++) {
      const p = curve.getPointAt(i / n), q = curve.getPointAt(((i + 1) % n) / n), tx = q.x - p.x, tz = q.z - p.z, tl = Math.hypot(tx, tz) || 1;
      S.push({ x: p.x, y: p.y, z: p.z, tx: tx / tl, tz: tz / tl, lx: tz / tl, lz: -tx / tl, k: 0, narrow: false, bridge: p.y > 1.2, tunnel: false });
    }
    for (let i = 0; i < n; i++) { const a = S[(i - 6 + n) % n], b = S[(i + 6) % n]; const da = Math.atan2(a.tx, a.tz), db = Math.atan2(b.tx, b.tz); S[i].k = Math.abs(wrapPi(db - da)) / 12; }
    const near = (x, z) => { let bi = 0, bd = Infinity; S.forEach((s, i) => { const d = Math.hypot(s.x - x, s.z - z) + (s.y > 1 ? 50 : 0); if (d < bd) { bd = d; bi = i; } }); return bi; };
    const t0 = near(...KART.tunnel[0]), t1 = near(...KART.tunnel[1]);
    for (let i = t0; i !== t1; i = (i + 1) % n) S[i].tunnel = true;
    for (const s of S) s.narrow = s.bridge || s.tunnel;
    this.T = { S, n, L, creek: near(...KART.creek) };
    return this.T;
  }
  // nearest sample to (x, z) within a window round i0 (the window keeps a kart on its own level where the lap crosses)
  _near(x, z, i0, win = 40) {
    const { S, n } = this.T; let bi = i0, bd = Infinity;
    for (let o = -win; o <= win; o++) { const i = (i0 + o + n) % n, s = S[i], d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; bi = i; } }
    return bi;
  }
  // ---------------------------------------------------------------- textures
  _tex(w, h, draw, rep) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (rep) t.repeat.set(rep[0], rep[1]); return t; }
  _noise(g, w, h, base, amp, n) { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let i = 0; i < n; i++) { const v = Math.random(); g.fillStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${Math.random() * amp})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); } }
  // ---------------------------------------------------------------- the world
  _build() {
    const T = this._track(), { S, n } = T, sc = new THREE.Scene(), W = KART.w / 2;
    sc.background = new THREE.Color(0x8fc4ec); sc.fog = new THREE.Fog(0xa8d0ee, 160, 520);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: {}, vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'varying vec3 vP; void main(){ float h = clamp(vP.y, 0.0, 1.0); vec3 c = mix(vec3(0.72,0.84,0.95), vec3(0.24,0.5,0.86), pow(h, 0.6)); gl_FragColor = vec4(c, 1.0); }' }));
    sc.add(sky);
    sc.add(new THREE.HemisphereLight(0xdfefff, 0x4a6a3a, 1.1));
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.6); sun.position.set(80, 140, 60); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc2 = sun.shadow.camera; sc2.left = -60; sc2.right = 60; sc2.top = 60; sc2.bottom = -60; sc2.near = 10; sc2.far = 400; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
    sc.add(sun, sun.target); this.sun = sun;
    // the ground: mown grass in stripes
    const grass = this._tex(512, 512, (g, w, h) => { this._noise(g, w, h, '#4f8a3a', 0.12, 9000); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; g.fillRect(0, i * h / 8, w, h / 8); } }, [80, 80]);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95 }));
    ground.position.y = -0.02; ground.receiveShadow = true; sc.add(ground);
    // the asphalt (dark, flecked, worn darker on the racing line), its white edge lines; kerbs; the start line
    const asph = this._tex(256, 512, (g, w, h) => { this._noise(g, w, h, '#3a3c40', 0.18, 16000); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(w * 0.3, 0, w * 0.4, h); g.fillStyle = '#e8e8e2'; g.fillRect(4, 0, 6, h); g.fillRect(w - 10, 0, 6, h); });
    const kerbT = this._tex(64, 128, (g, w, h) => { for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#f2f2ee' : '#d2232a'; g.fillRect(0, i * h / 4, w, h / 4); } });
    const ribbon = (lo, hi, mat, dy, filt) => {
      const pos = [], uv = [], idx = []; let v = 0;
      for (let i = 0; i <= n; i++) {
        const s = S[i % n];
        const a = [s.x + s.lx * lo, s.y + dy, s.z + s.lz * lo], b = [s.x + s.lx * hi, s.y + dy, s.z + s.lz * hi];
        pos.push(...a, ...b); uv.push(0, v, 1, v); v += 1 / 10;
        if (i > 0 && (!filt || (filt((i - 1) % n) && filt(i % n)))) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; sc.add(m); return m;
    };
    ribbon(W, -W, new THREE.MeshStandardMaterial({ map: asph, roughness: 0.82, polygonOffset: true, polygonOffsetFactor: -1 }), 0.03);
    const corner = i => S[i].k > 0.012 && !S[i].narrow;
    const kmat = new THREE.MeshStandardMaterial({ map: kerbT, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
    ribbon(W + 1.2, W, kmat, 0.06, corner); ribbon(-W, -W - 1.2, kmat, 0.06, corner);
    // the run-off: a gravel band outside the corners
    const grav = this._tex(128, 128, (g, w, h) => this._noise(g, w, h, '#b8a27a', 0.35, 4000));
    const gmat = new THREE.MeshStandardMaterial({ map: grav, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
    ribbon(W + KART.run, W + 1.2, gmat, 0.02, i => corner(i)); ribbon(-W - 1.2, -W - KART.run, gmat, 0.02, i => corner(i));
    // the start / finish line: a chequered band across the track at sample 0
    const chk = this._tex(128, 32, (g, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4'; g.fillRect(i * w / 16, j * h / 4, w / 16, h / 4); } });
    const s0 = S[0], line = new THREE.Mesh(new THREE.PlaneGeometry(KART.w, 1.6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: chk, polygonOffset: true, polygonOffsetFactor: -3 }));
    line.position.set(s0.x, s0.y + 0.07, s0.z); line.rotation.y = Math.atan2(s0.tx, s0.tz); sc.add(line);
    // the tyre walls: stacks of tyres in red and white, outside the run-off (on the bridge and in the tunnel, the walls)
    const tyre = new THREE.CylinderGeometry(0.42, 0.42, 0.95, 12), tyres = [];
    for (let i = 0; i < n; i += 1) for (const sd of [-1, 1]) { const s = S[i]; if (s.narrow) continue; const o = sd * (W + KART.run + 0.5); tyres.push([s.x + s.lx * o, s.y, s.z + s.lz * o, (Math.floor(i / 2) + (sd > 0 ? 1 : 0)) % 2]); }
    const tm = new THREE.InstancedMesh(tyre, new THREE.MeshStandardMaterial({ roughness: 0.85 }), tyres.length), M = new THREE.Matrix4(), col = new THREE.Color();
    tyres.forEach(([x, y, z, c], i) => { M.makeTranslation(x, y + 0.47, z); tm.setMatrixAt(i, M); tm.setColorAt(i, col.setHex(c ? 0xf0f0ec : 0xc8202a)); });
    tm.castShadow = true; tm.receiveShadow = true; sc.add(tm);
    // the bridge: a deck under the raised part of the lap, parapets, piers down to the ground
    const conc = new THREE.MeshStandardMaterial({ color: 0xb4b2ac, roughness: 0.9 }), steel = new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.5, metalness: 0.5 });
    const boxAt = (s, w, h, d, o, y, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(s.x + s.lx * o, y, s.z + s.lz * o); m.rotation.y = Math.atan2(s.tx, s.tz); m.castShadow = m.receiveShadow = true; sc.add(m); return m; };
    for (let i = 0; i < n; i++) { const s = S[i]; if (!s.bridge) continue;
      boxAt(s, KART.w + 1.6, 0.9, 1.05, 0, s.y - 0.45, conc);
      for (const sd of [-1, 1]) { boxAt(s, 0.35, 1.0, 1.05, sd * (W + 0.6), s.y + 0.5, conc); if (i % 2 === 0) boxAt(s, 0.08, 0.08, 1.0, sd * (W + 0.6), s.y + 1.1, steel); }
      // (the piers stand clear of the part of the lap that runs underneath: they were in its road)
      if (i % 12 === 0 && s.y > 2.5) for (const sd of [-1, 1]) { const px = s.x + s.lx * sd * (W - 1), pz = s.z + s.lz * sd * (W - 1); if (S.some(q => !q.bridge && Math.hypot(q.x - px, q.z - pz) < W + 2.5)) continue; boxAt(s, 1.0, s.y - 0.9, 1.0, sd * (W - 1), (s.y - 0.9) / 2, conc); }
    }
    // the tunnel: a concrete bore (walls and an arched roof) extruded along that part of the lap, lamps along its crown,
    // a grassed ridge over it, a concrete portal at each end
    { const idxs = []; for (let i = 0; i < n; i++) if (S[i].tunnel) idxs.push(i);
      const R = W + 0.9, H0 = 3.6, inner = [[-R, 0], [-R, H0]], outer = [[-R - 16, -0.3], [-R - 7, 4.5], [-R, 7.2], [0, 8.6], [R, 7.2], [R + 7, 4.5], [R + 16, -0.3]];
      for (let a = 1; a < 12; a++) { const an = Math.PI - a / 12 * Math.PI; inner.push([Math.cos(an) * R, H0 + Math.sin(an) * 3.2]); }
      inner.push([R, H0], [R, 0]);
      const tube = (prof, mat) => {
        const pos = [], idx = [], m = prof.length;
        idxs.forEach((si, j) => { const q = S[si]; for (const [l, h] of prof) pos.push(q.x + q.lx * l, q.y + h, q.z + q.lz * l); if (j > 0) for (let k = 0; k < m - 1; k++) { const a0 = (j - 1) * m + k, b0 = j * m + k; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); } });
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true; sc.add(mesh); return mesh;
      };
      tube(inner, new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 0.95, side: THREE.DoubleSide }));
      tube(outer, new THREE.MeshStandardMaterial({ map: grass, roughness: 1, side: THREE.DoubleSide }));
      const lampM = new THREE.MeshBasicMaterial({ color: 0xffe2a8 });
      idxs.forEach((si, j) => { if (j % 7 === 3) boxAt(S[si], 0.5, 0.1, 1.6, 0, S[si].y + H0 + 3.1, lampM); });
      for (const si of [idxs[0], idxs[idxs.length - 1]]) { const q = S[si];
        for (const sd of [-1, 1]) boxAt(q, 2.4, 7.4, 1.2, sd * (R + 1.2), q.y + 3.7, conc);
        boxAt(q, 2 * R + 4.8, 1.8, 1.2, 0, q.y + H0 + 3.6, conc); boxAt(q, 2 * R + 5.2, 0.3, 1.4, 0, q.y + H0 + 4.6, steel); }
    }
    // the creek: a stream of water across the east loop, under a short bridge with white railings
    { const s = S[T.creek], water = new THREE.Mesh(new THREE.PlaneGeometry(6, 120).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a8ac0, roughness: 0.1, metalness: 0.2 }));
      water.position.set(s.x, 0.01, s.z); water.rotation.y = Math.atan2(s.tx, s.tz) + Math.PI / 2; sc.add(water);
      for (let o = -4; o <= 4; o++) { const q = S[(T.creek + o + n) % n]; for (const sd of [-1, 1]) boxAt(q, 0.12, 1.0, 1.0, sd * (W + 0.3), q.y + 0.5, new THREE.MeshStandardMaterial({ color: 0xf2f2ee })); } }
    // the grandstand and the start gantry by the start; trees all round
    { const s = S[n - 12], g = new THREE.Group();
      const seat = new THREE.MeshStandardMaterial({ color: 0x2a6fd6, roughness: 0.7 }), roof = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 });
      for (let r = 0; r < 6; r++) { const m = new THREE.Mesh(new THREE.BoxGeometry(40, 0.8, 1.4), r % 2 ? seat : conc); m.position.set(0, 0.4 + r * 0.8, r * 1.4); g.add(m); }
      const rf = new THREE.Mesh(new THREE.BoxGeometry(42, 0.3, 10), roof); rf.position.set(0, 9, 3.5); g.add(rf);
      for (const x of [-20, 0, 20]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 9, 0.4), steel); c.position.set(x, 4.5, 8); g.add(c); }
      g.position.set(s.x + s.lx * (W + KART.run + 6), 0, s.z + s.lz * (W + KART.run + 6)); g.rotation.y = Math.atan2(s.tx, s.tz) + Math.PI / 2; g.traverse(o => { o.castShadow = o.receiveShadow = true; }); sc.add(g); }
    { const s = S[2], g = new THREE.Group();
      for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.5), steel); p.position.set(sd * (W + 1), 3, 0); g.add(p); }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(KART.w + 2.5, 1.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x1a1c20 })); beam.position.y = 6; g.add(beam);
      this.lights = []; for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16), new THREE.MeshBasicMaterial({ color: 0x331010 })); m.position.set(-2.4 + i * 1.2, 6, -0.31); m.rotation.y = Math.PI; g.add(m); this.lights.push(m); }
      g.position.set(s.x, s.y, s.z); g.rotation.y = Math.atan2(s.tx, s.tz); sc.add(g); }
    { const trunk = new THREE.CylinderGeometry(0.25, 0.35, 3, 6), crown = new THREE.IcosahedronGeometry(2.4, 1), spots = [];
      for (let i = 0; i < 260; i++) { const x = (Math.random() - 0.5) * 520, z = (Math.random() - 0.5) * 300; let ok = true; for (let j = 0; j < n; j += 6) if (Math.hypot(S[j].x - x, S[j].z - z) < W + KART.run + 6) { ok = false; break; } if (ok) spots.push([x, z, 0.8 + Math.random() * 0.7]); }
      const ti = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x5a4030 }), spots.length), ci = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: 0x3f7a34, flatShading: true, roughness: 0.9 }), spots.length);
      spots.forEach(([x, z, k], i) => { M.compose(new THREE.Vector3(x, 1.5 * k, z), new THREE.Quaternion(), new THREE.Vector3(k, k, k)); ti.setMatrixAt(i, M); M.compose(new THREE.Vector3(x, 4.4 * k, z), new THREE.Quaternion(), new THREE.Vector3(k, k * 1.15, k)); ci.setMatrixAt(i, M); ci.setColorAt(i, col.setHSL(0.28 + Math.random() * 0.06, 0.45, 0.28 + Math.random() * 0.1)); });
      ti.castShadow = ci.castShadow = true; sc.add(ti, ci); }
    // the karts
    this.karts = [];
    for (let i = 0; i <= KART.rivals; i++) { const m = this._kartMesh(KART.colors[i]); sc.add(m); this.karts.push({ mesh: m, i, ai: i > 0 }); }
    this.scene = sc;
    this.cam = new THREE.PerspectiveCamera(68, 1, 0.1, 1200);
  }
  _kartMesh(color) {
    const g = new THREE.Group(), body = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.3 }), dark = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.6 }), chrome = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.25, metalness: 0.8 });
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    add(new THREE.BoxGeometry(1.1, 0.08, 1.9), chrome, 0, 0.16, 0);                 // the frame
    add(new THREE.BoxGeometry(1.0, 0.22, 0.5), body, 0, 0.3, 0.85);                  // the nose
    add(new THREE.BoxGeometry(0.9, 0.16, 0.6), body, 0, 0.28, 0.35);                 // the front panel
    for (const sx of [-0.62, 0.62]) add(new THREE.BoxGeometry(0.22, 0.2, 0.9), body, sx, 0.26, -0.05); // side pods
    add(new THREE.BoxGeometry(0.5, 0.45, 0.45), dark, 0, 0.42, -0.2);               // the seat
    add(new THREE.BoxGeometry(0.42, 0.42, 0.28), new THREE.MeshStandardMaterial({ color: 0x22304a }), 0, 0.82, -0.18); // the driver
    add(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.4 }), 0, 1.16, -0.12); // the helmet
    add(new THREE.BoxGeometry(0.26, 0.07, 0.04), dark, 0, 1.17, 0.07);              // its visor
    add(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 14).rotateX(Math.PI / 2.6), dark, 0, 0.62, 0.22); // the wheel
    add(new THREE.BoxGeometry(1.25, 0.12, 0.16), body, 0, 0.22, -0.98);              // the rear bumper
    g.wheels = [];
    for (const [x, z, r, w] of [[-0.62, 0.62, 0.2, 0.2], [0.62, 0.62, 0.2, 0.2], [-0.66, -0.66, 0.25, 0.3], [0.66, -0.66, 0.25, 0.3]]) {
      const wh = new THREE.Group(); const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 16).rotateZ(Math.PI / 2), dark); t.castShadow = true; wh.add(t);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.01, 10).rotateZ(Math.PI / 2), chrome); wh.add(hub);
      wh.position.set(x, r, z); g.add(wh); g.wheels.push(wh);
    }
    return g;
  }
  // ---------------------------------------------------------------- the race
  start() {
    const g = this.g; if (this.active) return;
    this._track(); if (!this.scene) this._build();
    this.active = true; this.paused = false; this._ui(true);
    document.body.classList.add('kart', 'driving');
    this.reset();
    g.audio.play('ui');
  }
  reset() {
    const { S, n } = this.T, K = this.karts;
    K.forEach((k, i) => {
      // a grid two by three behind the line: you at the back left, the rivals ahead
      const row = Math.floor((KART.rivals - i) / 2), sd = (KART.rivals - i) % 2 ? -1 : 1, idx = (n - 8 - row * 6) % n, s = S[idx];
      Object.assign(k, { x: s.x + s.lx * sd * 2.4, z: s.z + s.lz * sd * 2.4, y: s.y, h: Math.atan2(s.tx, s.tz), vf: 0, vl: 0, r: 0, idx, lap: 0, lapT: 0, best: 0, done: false, fin: 0, sk: 0.86 + 0.02 * i + Math.random() * 0.03, lane: (Math.random() - 0.5) * 4, steer: 0, prog: -row * 6 - 8, spin: 0 });
    });
    this.t = -4; this.clock = 0; this.result = null; this._finishShown = false;
  }
  stop() {
    if (!this.active) return;
    this.active = false; this._ui(false); document.body.classList.remove('kart', 'driving'); this.g.audio.update(0.016, {});
    this.g.last = performance.now();
  }
  // one frame of the simulator (from Game.tick, instead of the game's own)
  frame(dt) {
    const g = this.g, inp = g.input;
    if (inp.pressed('pause')) { this.paused = !this.paused; this._pauseUI(this.paused); }
    if (!this.paused) {
      const steps = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / steps;
      for (let s = 0; s < steps; s++) this._step(h, inp);
    }
    this._render(dt);
  }
  _input(inp) {
    let thr = (inp.isDown('up') || inp.isDown('gas') ? 1 : 0), brk = (inp.isDown('down') || inp.isDown('brake') ? 1 : 0), st = (inp.isDown('left') ? 1 : 0) - (inp.isDown('right') ? 1 : 0);
    if (inp.stick.active) { st -= inp.stick.x; if (inp.stick.y < -0.35) thr = Math.max(thr, -inp.stick.y); if (inp.stick.y > 0.5) brk = 1; }
    if (inp.gp.active) { thr = Math.max(thr, inp.gp.rt); brk = Math.max(brk, inp.gp.lt); st -= inp.gp.lx; }
    return { thr, brk, st: clamp(st, -1, 1) };
  }
  _step(dt, inp) {
    const { S, n } = this.T, K = this.karts, set = this.S, W = KART.w / 2;
    this.t += dt; const go = this.t >= 0;
    if (go) this.clock += dt;
    for (const k of K) {
      // ---- what it wants: the player from the controls, a rival from the line ahead
      let thr = 0, brk = 0, st = 0;
      const steerK = k.ai ? 1 : set.steer, fG = k.ai ? 1 : set.fgrip, rG = k.ai ? 1 : set.rgrip, top = 27 * (k.ai ? k.sk * 1.04 : set.top);
      if (!k.ai) { const c = this._input(inp); thr = c.thr; brk = c.brk; st = c.st; }
      else {
        const look = Math.round(6 + Math.abs(k.vf) * 0.55), tgt = S[(k.idx + look) % n], o = clamp(k.lane, -W + 1.8, W - 1.8);
        const tx = tgt.x + tgt.lx * o, tz = tgt.z + tgt.lz * o, want = Math.atan2(tx - k.x, tz - k.z);
        st = clamp(wrapPi(want - k.h) * 2.2, -1, 1);
        let kmax = 0; for (let j = 4; j < 34; j += 3) kmax = Math.max(kmax, S[(k.idx + j) % n].k);
        const vmax = Math.min(top, Math.sqrt(13.5 * k.sk / Math.max(kmax, 0.004)));
        thr = k.vf < vmax ? 1 : 0; brk = k.vf > vmax + 1.5 ? 1 : 0;
        // stuck (against a wall, turned round in a tangle): back out turning away from the wall, then drive on
        if (go && !k.done) { if (Math.abs(k.vf) < 1.2 && !(k.unstick > 0)) k.stuckT = (k.stuckT || 0) + dt; else k.stuckT = 0; if (k.stuckT > 1.2) { k.unstick = 1.4; k.stuckT = 0; k.unSteer = this._lat(k) > 0 ? 1 : -1; } }
        if (k.unstick > 0) { k.unstick -= dt; thr = 0; brk = 1; st = k.unSteer; }
      }
      // (on the grid, held on the brakes: nothing moves until the lights go out; home, it coasts to a stop)
      if (!go) { k.vf = 0; k.vl = 0; k.r = 0; k.steer = 0; continue; }
      if (k.done) { thr = 0; brk = k.vf > 0.5 ? 0.4 : 0; }
      // ---- the bicycle model: L 1.24 m (a 0.62 / b 0.62), 160 kg with the driver
      const m = 160, a = 0.62, b = 0.62, I = 52, sc = Math.abs(k.vf) < 1 ? 1 : 0;
      k.steer += (st - k.steer) * Math.min(1, dt * (k.ai ? 8 : 12));
      const delta = k.steer * 0.42 * steerK / (1 + Math.abs(k.vf) / 22);
      const off = Math.abs(this._lat(k)) > W, grass = off ? 0.55 : 1;
      const vx = Math.max(Math.abs(k.vf), 1.5) * (k.vf < 0 ? -1 : 1);
      const af = Math.atan2(k.vl + a * k.r, Math.abs(vx)) - delta * Math.sign(vx), ar = Math.atan2(k.vl - b * k.r, Math.abs(vx));
      const Nf = m * 9.8 / 2, Nr = m * 9.8 / 2, Cf = 9500 * fG, Cr = 10500 * rG;
      let Ff = clamp(-Cf * af, -1.55 * fG * grass * Nf, 1.55 * fG * grass * Nf), Fr = clamp(-Cr * ar, -1.6 * rG * grass * Nr, 1.6 * rG * grass * Nr);
      if (sc) { Ff *= Math.abs(k.vf); Fr *= Math.abs(k.vf); }
      // drive: strong low down, fading toward the top speed; brakes; rolling and air drag; the grass slows you
      let Fx = thr * 2600 * clamp(1 - k.vf / top, 0, 1) - brk * (k.vf > 0.5 ? 3600 : k.vf > -4 ? 900 : 0) - 0.9 * k.vf * Math.abs(k.vf) - 40 * Math.sign(k.vf) - (off ? 520 * Math.sign(k.vf) : 0);
      if (brk && k.vf <= 0.5 && !thr) Fx = -1400;
      k.vf += (Fx / m + k.vl * k.r) * dt;
      k.vl += ((Ff * Math.cos(delta) + Fr) / m - k.vf * k.r) * dt;
      k.r += ((a * Ff * Math.cos(delta) - b * Fr) / I) * dt;
      k.r *= Math.exp(-dt * 0.8); k.vl *= Math.exp(-dt * 0.4);
      k.h += k.r * dt;
      k.x += (k.vf * Math.sin(k.h) + k.vl * Math.cos(k.h)) * dt; k.z += (k.vf * Math.cos(k.h) - k.vl * Math.sin(k.h)) * dt;
      k.slide = Math.min(1, Math.abs(ar) * 4 + Math.abs(af) * 2) * (Math.abs(k.vf) > 6 ? 1 : 0);
      // ---- the track: where it is along the lap, its height, the walls
      const old = k.idx; k.idx = this._near(k.x, k.z, k.idx); const s = S[k.idx];
      const step = ((k.idx - old + n + n / 2) % n) - n / 2; k.prog += step;
      if (k.prog >= (k.lap + 1) * n && go) { k.lap++; if (k.i === 0) { const lt = this.clock - k.lapT; k.lapT = this.clock; if (!k.best || lt < k.best) k.best = lt; if (lt > 20 && (!this.S.best || lt < this.S.best)) this.S.best = lt; this._flash(k.lap < KART.laps ? `Lap ${k.lap + 1}` : 'Final lap done'); } if (k.lap >= KART.laps && !k.done) { k.done = true; k.fin = this.clock; } }
      k.y += (s.y - k.y) * Math.min(1, dt * 12);
      const lim = s.narrow ? W - 0.75 : W + KART.run - 0.4, d = this._lat(k);
      if (Math.abs(d) > lim) {
        const sd = Math.sign(d); k.x -= s.lx * (Math.abs(d) - lim) * sd; k.z -= s.lz * (Math.abs(d) - lim) * sd;
        // into the wall: the speed into it is taken off, a bounce, a scrub of speed along it
        const vxw = k.vf * Math.sin(k.h) + k.vl * Math.cos(k.h), vzw = k.vf * Math.cos(k.h) - k.vl * Math.sin(k.h), into = (vxw * s.lx + vzw * s.lz) * sd;
        if (into > 0) { const nx = vxw - s.lx * sd * into * 1.35, nz = vzw - s.lz * sd * into * 1.35; k.vf = (nx * Math.sin(k.h) + nz * Math.cos(k.h)) * 0.94; k.vl = (nx * Math.cos(k.h) - nz * Math.sin(k.h)) * 0.5; k.r *= 0.4; if (!k.ai && into > 4) { this.g.audio.play('thud'); this.shake = Math.min(1, into / 14); } }
      }
    }
    // ---- karts bump each other
    for (let i = 0; i < K.length; i++) for (let j = i + 1; j < K.length; j++) {
      const A = K[i], B = K[j]; if (Math.abs(A.y - B.y) > 2) continue;
      const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz); if (d > 1.7 || d < 1e-4) continue;
      const nx = dx / d, nz = dz / d, push = (1.7 - d) / 2; A.x -= nx * push; A.z -= nz * push; B.x += nx * push; B.z += nz * push;
      const av = this._vw(A), bv = this._vw(B), rel = (bv[0] - av[0]) * nx + (bv[1] - av[1]) * nz;
      if (rel < 0) { const j2 = -rel * 0.6; this._addV(A, -nx * j2, -nz * j2); this._addV(B, nx * j2, nz * j2); if (!A.ai || !B.ai) this.g.audio.play('thud', { gain: 0.4 }); }
      if (A.ai) A.lane += (A.lane > B.lane ? 1 : -1) * 0.02; if (B.ai) B.lane += (B.lane > A.lane ? 1 : -1) * 0.02;
    }
    // ---- the finish
    const me = K[0];
    if (me.done && !this.result) { this.result = this._order(); this.S.wins += this.result[0] === me ? 1 : 0; this.g.saveGame && this.g.saveGame(true); }
  }
  _lat(k) { const s = this.T.S[k.idx]; return (k.x - s.x) * s.lx + (k.z - s.z) * s.lz; }
  _vw(k) { return [k.vf * Math.sin(k.h) + k.vl * Math.cos(k.h), k.vf * Math.cos(k.h) - k.vl * Math.sin(k.h)]; }
  _addV(k, dx, dz) { const [x, z] = this._vw(k), nx = x + dx, nz = z + dz; k.vf = nx * Math.sin(k.h) + nz * Math.cos(k.h); k.vl = nx * Math.cos(k.h) - nz * Math.sin(k.h); }
  _order() { return this.karts.slice().sort((A, B) => (A.done && B.done) ? A.fin - B.fin : (B.prog - A.prog)); }
  // ---------------------------------------------------------------- drawing
  _render(dt) {
    const g = this.g, r = g.renderer, cam = this.cam, me = this.karts[0];
    for (const k of this.karts) {
      k.mesh.position.set(k.x, k.y + 0.02, k.z); k.mesh.rotation.set(0, k.h, -k.r * 0.02 * Math.min(1, Math.abs(k.vf) / 10), 'YXZ');
      k.spin += k.vf * dt / 0.22; for (const [i, w] of k.mesh.wheels.entries()) { w.rotation.set(k.spin, i < 2 ? k.steer * 0.42 : 0, 0, 'YXZ'); }
    }
    // the chase camera: behind and above, swinging after the kart, pulled back and widened with speed
    const sp = Math.abs(me.vf), inT = this.T.S[me.idx].tunnel || this.T.S[(me.idx + 6) % this.T.n].tunnel; this._tk = (this._tk || 0) + ((inT ? 1 : 0) - (this._tk || 0)) * Math.min(1, dt * 4);
    const back = (4.6 + sp * 0.05) * (1 - 0.35 * this._tk), up = (1.9 + sp * 0.01) * (1 - 0.25 * this._tk);
    const tx = me.x - Math.sin(me.h) * back, tz = me.z - Math.cos(me.h) * back, ty = me.y + up;
    if (!this._cp) this._cp = new THREE.Vector3(tx, ty, tz);
    const kk = 1 - Math.exp(-dt * 7); this._cp.x += (tx - this._cp.x) * kk; this._cp.y += (ty - this._cp.y) * kk; this._cp.z += (tz - this._cp.z) * kk;
    const sh = (this.shake = Math.max(0, (this.shake || 0) - dt * 2.5)) * 0.25;
    cam.position.set(this._cp.x + (Math.random() - 0.5) * sh, this._cp.y + (Math.random() - 0.5) * sh, this._cp.z);
    cam.lookAt(me.x + Math.sin(me.h) * 3, me.y + 0.8, me.z + Math.cos(me.h) * 3);
    cam.fov = 66 + sp * 0.45; cam.aspect = r.domElement.clientWidth / Math.max(1, r.domElement.clientHeight); cam.updateProjectionMatrix();
    this.sun.position.set(me.x + 80, 140, me.z + 60); this.sun.target.position.set(me.x, 0, me.z);
    // the start lights: red one by one, then out
    if (this.lights) this.lights.forEach((L, i) => L.material.color.setHex(this.t < 0 && this.t > -4 + i * 0.6 + 1 ? 0xff2020 : this.t >= 0 && this.t < 0.6 ? 0x20ff40 : 0x331010));
    r.render(this.scene, cam);
    g.audio.update(dt, { engine: { rpm: clamp(0.15 + sp / 30, 0, 1.1), throttle: this._input(g.input).thr, base: 1.6 }, skid: me.slide * 0.8 });
    this._hud();
  }
  // ---------------------------------------------------------------- the overlay
  _ui(on) {
    let el = document.getElementById('kartUI');
    if (!el) {
      el = document.createElement('div'); el.id = 'kartUI';
      el.innerHTML = `<style>
        #kartUI{position:fixed;inset:0;pointer-events:none;z-index:40;font-family:system-ui,sans-serif;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.6)}
        #kartUI .kt{position:absolute;top:calc(12px + var(--safe-t,0px));left:calc(14px + var(--safe-l,0px));font-weight:800;font-size:28px;line-height:1.05}
        #kartUI .kt small{display:block;font-size:14px;font-weight:600;opacity:.85}
        #kartUI .kr{position:absolute;top:calc(12px + var(--safe-t,0px));right:calc(70px + var(--safe-r,0px));text-align:right;font-weight:700;font-size:16px}
        #kartUI .ks{position:absolute;bottom:calc(150px + var(--safe-b,0px));right:calc(22px + var(--safe-r,0px));font-weight:900;font-size:40px}
        #kartUI .ks small{font-size:14px;margin-left:4px}
        #kartUI .kc{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:110px;font-weight:900}
        #kartUI .kf{position:absolute;top:30%;left:0;right:0;text-align:center;font-size:34px;font-weight:900}
        #kartUI .kp,#kartUI .kx{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(8,10,14,.72);pointer-events:auto}
        #kartUI .box{background:#11151c;border:1px solid #2a3240;border-radius:14px;padding:18px 20px;width:min(420px,88vw);max-height:84vh;overflow:auto}
        #kartUI h2{margin:0 0 10px;font-size:22px} #kartUI label{display:block;margin:10px 0 2px;font-size:14px;opacity:.9}
        #kartUI input[type=range]{width:100%} #kartUI .row{display:flex;justify-content:space-between;font-size:12px;opacity:.7}
        #kartUI button{margin:8px 6px 0 0;padding:10px 16px;border-radius:10px;border:0;font-weight:800;font-size:15px;background:#2a3240;color:#fff}
        #kartUI button.go{background:#f2c230;color:#111} #kartUI table{width:100%;border-collapse:collapse;margin:6px 0} #kartUI td{padding:4px 2px}
      </style><div class="kt"></div><div class="kr"></div><div class="ks"></div><div class="kc"></div><div class="kf"></div>
      <div class="kp"><div class="box"><h2>Kart simulator · paused</h2>
        <label>Steering <span data-v="steer"></span></label><input type="range" data-k="steer" min="0.6" max="1.5" step="0.05"><div class="row"><span>tight</span><span>loose</span></div>
        <label>Front grip <span data-v="fgrip"></span></label><input type="range" data-k="fgrip" min="0.6" max="1.5" step="0.05"><div class="row"><span>slides wide</span><span>sticky</span></div>
        <label>Rear grip <span data-v="rgrip"></span></label><input type="range" data-k="rgrip" min="0.6" max="1.5" step="0.05"><div class="row"><span>loose tail</span><span>planted</span></div>
        <label>Top speed <span data-v="top"></span></label><input type="range" data-k="top" min="0.8" max="1.2" step="0.05"><div class="row"><span>80%</span><span>120%</span></div>
        <div><button class="go" data-a="resume">Resume</button><button data-a="reset">Default handling</button><button data-a="restart">Restart race</button><button data-a="quit">Quit to the bunker</button></div></div></div>
      <div class="kx"><div class="box"><h2>Race result</h2><table></table><div><button class="go" data-a="restart">Race again</button><button data-a="quit">Quit to the bunker</button></div></div></div>`;
      document.body.appendChild(el);
      el.addEventListener('input', e => { const k = e.target.dataset.k; if (k) { this.S[k] = +e.target.value; this._pauseUI(true); } });
      el.addEventListener('click', e => { const a = e.target.dataset && e.target.dataset.a; if (!a) return; this.g.audio.play('ui');
        if (a === 'resume') { this.paused = false; this._pauseUI(false); }
        else if (a === 'reset') { Object.assign(this.S, { steer: 1, fgrip: 1, rgrip: 1, top: 1 }); this._pauseUI(true); }
        else if (a === 'restart') { this.paused = false; this._pauseUI(false); el.querySelector('.kx').style.display = 'none'; this.reset(); }
        else if (a === 'quit') { this.paused = false; this._pauseUI(false); el.querySelector('.kx').style.display = 'none'; this.stop(); } });
    }
    el.style.display = on ? '' : 'none';
    this.el = el;
  }
  _pauseUI(on) {
    const el = this.el; el.querySelector('.kp').style.display = on ? 'flex' : 'none';
    if (on) for (const k of ['steer', 'fgrip', 'rgrip', 'top']) { el.querySelector(`[data-k="${k}"]`).value = this.S[k]; el.querySelector(`[data-v="${k}"]`).textContent = Math.round(this.S[k] * 100) + '%'; }
  }
  _flash(t) { this._fl = { t, until: this.clock + 1.6 }; }
  _hud() {
    const el = this.el, me = this.karts[0], ord = this._order(), pos = ord.indexOf(me) + 1, fmt = t => t > 0 ? `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}` : '—';
    el.querySelector('.kt').innerHTML = `P${pos}<small>of ${this.karts.length}</small>LAP ${Math.min(me.lap + 1, KART.laps)}/${KART.laps}`;
    el.querySelector('.kr').innerHTML = `${fmt(me.done ? me.fin : this.clock)}<br><small>Lap ${fmt(this.clock - me.lapT)} · Best ${fmt(me.best)} · Record ${fmt(this.S.best)}</small>`;
    el.querySelector('.ks').innerHTML = `${Math.round(Math.abs(me.vf) * 3.6)}<small>km/h</small>`;
    el.querySelector('.kc').textContent = this.t < 0 ? (this.t > -3 ? String(Math.ceil(-this.t)) : '') : this.t < 0.8 ? 'GO!' : '';
    el.querySelector('.kf').textContent = this._fl && this.clock < this._fl.until ? this._fl.t : '';
    // (the table stays live while the others finish)
    if (this.result && this._finishShown) { const x = el.querySelector('.kx'); if (x.style.display !== 'none' && ((this._tbT = (this._tbT || 0) + 1) % 20 === 0)) { this._finishShown = false; } }
    if (this.result && !this._finishShown) {
      this._finishShown = true; const x = el.querySelector('.kx');
      x.querySelector('table').innerHTML = this._order().map((k, i) => `<tr style="${k === me ? 'color:#f2c230;font-weight:800' : ''}"><td>${i + 1}</td><td>${KART.names[k.i]}</td><td style="text-align:right">${k.done ? fmt(k.fin) : 'running'}</td></tr>`).join('') + `<tr><td colspan="3">Your best lap ${fmt(me.best)} · record ${fmt(this.S.best)} · wins ${this.S.wins}</td></tr>`;
      x.style.display = 'flex';
    }
  }
}
