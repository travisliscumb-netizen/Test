/* =====================================================================
   [CORE] CHARACTER RENDERER: every human (player, peds, cops) is drawn with a
   handful of InstancedMeshes; poses are computed procedurally per frame.
   ===================================================================== */
const SKIN = [0xf1c8a8, 0xe0ac86, 0xc68a62, 0x9c6a48, 0x7a4e33, 0x5a3825, 0xf5d5bd];
const HAIR = [0x1a1410, 0x2e2018, 0x5a3a22, 0x8a6a3a, 0xc9a66b, 0x6a6a6a, 0xd8d8d8, 0x7a2e1a];
const SHIRT = [0x2f5d8a, 0x8a2f3a, 0x3a7a4a, 0xd8d0c0, 0x22262c, 0xc9822a, 0x6a3a8a, 0x2a8a8a, 0xe8e8e8, 0x9a9a9a, 0xb3402a, 0x4a5a2a, 0xf2c94c];
const PANTS = [0x22304a, 0x2a2a2e, 0x4a3a2a, 0x6a6a6a, 0x1e3a5a, 0x5a4a3a, 0x3a3a46, 0xb8ab90];
const SHOES = [0x1a1a1a, 0x3a2a1a, 0xe8e8e8, 0x6a2a1a];
const JACKETS = [0x2b2f36, 0x4a3a2a, 0x23344f, 0x5a2a2a, 0x3c4a3a, 0x6b6b6b, 0x1b1b1e];
// A look is every visual property of a person. Optional layers (jacket, skirt, shades, chain,
// tie, bandana, hood) let one renderer draw civilians, gangs, police, bosses and bodyguards.
function randomLook(rng = Math.random) {
  const p = a => a[Math.floor(rng() * a.length)];
  const fem = rng() < 0.45;
  const L = {
    skin: C(p(SKIN)), hair: C(p(HAIR)), shirt: C(p(SHIRT)), pants: C(p(PANTS)), shoes: C(p(SHOES)),
    sleeve: rng() < 0.5, hairStyle: fem ? [2, 2, 3, 4, 5, 5, 1][Math.floor(rng() * 7)] : [0, 1, 1, 1, 4, 1, 2][Math.floor(rng() * 7)], scale: (fem ? 0.9 : 0.95) + rng() * 0.12, build: 0.88 + rng() * 0.28, cap: null,
    shoulders: fem ? 0.9 : 1 + rng() * 0.08, hips: fem ? 1.1 : 0.96, jacket: null, skirt: null, shades: false, chain: null, tie: null, bandana: null, hood: null, belt: rng() < 0.5
  };
  if (rng() < 0.32) L.jacket = C(p(JACKETS));
  if (fem && rng() < 0.3) L.skirt = C(p(PANTS.concat([0x7a2e3a, 0x2e4a7a])));
  if (rng() < 0.1) L.shades = true;
  if (!fem && rng() < 0.12) L.cap = C(p([0x111111, 0x8a2f3a, 0x2f5d8a, 0xd8d0c0]));
  // G6: more of a street's variety (drawn last, so a seeded look keeps everything it had): long coats over a jacket,
  // knitted beanies
  if (L.jacket && !L.skirt && rng() < 0.3) L.coat = true;
  if (!L.cap && rng() < 0.08) L.beanie = C(p([0x2a2a2e, 0x8a2f3a, 0x2f5d8a, 0x3a6a4a, 0xc9822a, 0xd8d0c0]));
  return L;
}
const _cm = Array.from({ length: 28 }, () => new THREE.Matrix4());
const _tm = new THREE.Matrix4();
function mT(m, x, y, z) { return m.makeTranslation(x, y, z); }
function mRx(m, a) { return m.makeRotationX(a); }
function mRy(m, a) { return m.makeRotationY(a); }
function mRz(m, a) { return m.makeRotationZ(a); }
function mS(m, x, y, z) { return m.makeScale(x, y, z); }

class CharacterRenderer {
  constructor(scene, max = 110) {
    this.max = max;
    this.mat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.02 });
    // tapered limb: a rounded section (G6: no box edges), narrower at the far end
    const limbGeo = roundBoxGeometry(3, 2, 3, 0.42, 0, 0.42); limbGeo.translate(0, -0.5, 0);
    { const p = limbGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = y < -0.9 ? 0.8 : y < -0.4 ? 0.93 : 1; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } }
    // torso: rounded at the sides and shoulders; chest wider than waist, front slightly fuller than back
    const torsoGeo = roundBoxGeometry(3, 3, 3, 0.3, 0.1, 0.36);
    { const p = torsoGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0) { p.setX(i, p.getX(i) * (y < -0.4 ? 0.8 : 0.86)); } else if (y > 0.4) { p.setX(i, p.getX(i) * 0.92); p.setZ(i, p.getZ(i) * 0.9); } if (p.getZ(i) > 0 && y > -0.2 && y < 0.35) p.setZ(i, p.getZ(i) * 1.08); } }
    const hipsGeo = roundBoxGeometry(3, 1, 3, 0.28, 0, 0.34);
    { const p = hipsGeo.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) { p.setX(i, p.getX(i) * 0.9); } }
    const skirtGeo = new THREE.CylinderGeometry(0.5, 0.78, 1, 10, 1, false); skirtGeo.translate(0, -0.5, 0);
    const handGeo = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
    { const p = handGeo.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) { p.setX(i, p.getX(i) * 0.75); p.setZ(i, p.getZ(i) * 0.8); } }
    handGeo.computeVertexNormals();
    const footGeo = new THREE.BoxGeometry(1, 1, 1, 1, 1, 2);
    { const p = footGeo.attributes.position; for (let i = 0; i < p.count; i++) { if (p.getZ(i) > 0.2 && p.getY(i) > 0) p.setY(i, p.getY(i) * 0.3); if (p.getZ(i) > 0.4) p.setX(i, p.getX(i) * 0.85); } }
    footGeo.computeVertexNormals();
    const defs = {
      head: [new THREE.IcosahedronGeometry(1, 2), 1], hair: [new THREE.SphereGeometry(1, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), 1],
      torso: [torsoGeo, 2], hips: [hipsGeo, 1], limb: [limbGeo, 12], small: [new THREE.BoxGeometry(1, 1, 1), 14], eye: [new THREE.SphereGeometry(1, 8, 6), 4],
      hand: [handGeo, 2], foot: [footGeo, 2], joint: [new THREE.SphereGeometry(1, 10, 7), 4], skirt: [skirtGeo, 1],
      gun: [new THREE.BoxGeometry(1, 1, 1), 1], bat: [new THREE.CylinderGeometry(1, 0.7, 1, 6), 1], hat: [new THREE.CylinderGeometry(1, 1.05, 1, 12), 1],
      gold: [new THREE.BoxGeometry(1, 1, 1), 2]
    };
    this.m = {};
    for (const k in defs) {
      const [g, per] = defs[k];
      let mat = this.mat;
      if (k === 'gun') mat = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.45, metalness: 0.65 });
      else if (k === 'bat') mat = new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.55, metalness: 0 });
      else if (k === 'gold') mat = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.9 });
      const im = new THREE.InstancedMesh(g, mat, max * per);
      if (k !== 'gun' && k !== 'bat') im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * per * 3), 3);
      im.count = 0; im.frustumCulled = false; im.castShadow = k !== 'gold' && k !== 'small' && k !== 'eye'; im.receiveShadow = false;
      scene.add(im); this.m[k] = im;
    }
    this.n = {}; this._col = new THREE.Color(); this._white = new THREE.Color(1, 1, 1); this._dark = new THREE.Color(0x0c0c0e);
    this._lip = new THREE.Color(); this._shade = new THREE.Color(0x111214);
    this._eyeW = new THREE.Color(0xe8e4dc); this._eyeP = new THREE.Color(0x1a1410); this._mouth = new THREE.Color();
    this.frustum = new THREE.Frustum(); this._sph = new THREE.Sphere(new THREE.Vector3(), 1.4);
    this.handR = new THREE.Matrix4();
  }
  begin(camera) {
    for (const k in this.m) this.n[k] = 0;
    _tm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(_tm);
    this.camPos = camera.position;
  }
  _put(k, m, color) {
    const im = this.m[k]; const i = this.n[k]++;
    if (i >= im.instanceMatrix.count) return;
    im.setMatrixAt(i, m);
    if (color && im.instanceColor) im.setColorAt(i, color);
  }
  end() {
    for (const k in this.m) {
      const im = this.m[k]; im.count = Math.min(this.n[k], im.instanceMatrix.count); im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
  // c: {x,y,z,h, look, pose:{...}}
  draw(c, opts = {}) {
    this._sph.center.set(c.x, c.y + 0.9, c.z);
    if (!opts.force && !this.frustum.intersectsSphere(this._sph)) return false;
    const L = c.look, ps = c.pose, s = L.scale, bw = L.build;
    const shW = L.shoulders || 1, hpW = L.hips || 1;
    const far = this.camPos ? dist2(c.x, c.z, this.camPos.x, this.camPos.z) > 55 * 55 : false; // distant people skip small details
    const flash = c.flash > 0;
    const col = (cc) => flash ? this._white : cc;
    const phase = ps.phase || 0, A = ps.amp || 0;
    const down = ps.down || 0, crouch = Math.max(ps.crouch || 0, (ps.dodge || 0) * 0.25), sit = ps.sit || 0, air = ps.air || 0;
    const kick = ps.kick > 0 ? Math.sin(Math.min(1, ps.kick) * Math.PI) : 0;
    const block = ps.block || 0, hit = ps.hit || 0, heavy = ps.heavy || 0;
    // --- root ---
    const root = _cm[0];
    mT(root, c.x, c.y, c.z);
    root.multiply(mRy(_tm, c.h));
    if (down > 0) { root.multiply(mT(_tm, 0, 0.13 * down, (ps.downDir || 1) * -0.1 * down)); root.multiply(mRx(_tm, -Math.PI / 2 * down * (ps.downDir || 1))); }
    root.multiply(mS(_tm, s, s * (L.height || 1), s));
    const bob = Math.abs(Math.sin(phase)) * 0.045 * A;
    const hipY = 0.92 - crouch * 0.36 - sit * 0.44 + bob - air * 0.05 - kick * 0.04;
    // --- legs ---
    const sw = Math.sin(phase) * A * 0.9;
    const legs = [[0.1, -sw, 0], [-0.1, sw, Math.PI]];
    for (const [lx, swing, off] of legs) {
      let thigh = swing - sit * 1.55 - crouch * 0.9 - air * 0.5 * (lx > 0 ? 1 : 0.4);
      let knee = Math.max(0, Math.sin(phase + off + 1.2)) * A * 1.3 + sit * 1.55 + crouch * 1.7 + air * 0.9;
      if (lx < 0 && kick > 0) { thigh = lerp(thigh, -1.55, kick); knee = lerp(knee, 0.15, kick); }
      if (lx > 0 && kick > 0) { knee = lerp(knee, 0.35, kick); }
      if (down > 0) { thigh = thigh * (1 - down) - 0.15 * down; knee *= (1 - down); }
      const hj = _cm[1].copy(root).multiply(mT(_tm, lx * bw * hpW, hipY, 0)).multiply(mRx(_tm, thigh)).multiply(mRz(_tm, lx * 0.05));
      _cm[2].copy(hj).multiply(mS(_tm, 0.16 * bw * hpW, 0.46, 0.17));
      this._put('limb', _cm[2], col(L.pants));
      const kj = _cm[3].copy(hj).multiply(mT(_tm, 0, -0.45, 0)).multiply(mRx(_tm, knee));
      _cm[4].copy(kj).multiply(mS(_tm, 0.13 * bw, 0.44, 0.14));
      this._put('limb', _cm[4], col(L.skirt && !far ? L.skin : L.pants));
      _cm[5].copy(kj).multiply(mT(_tm, 0, -0.47, 0.04)).multiply(mS(_tm, 0.12, 0.09, 0.27));
      this._put('foot', _cm[5], col(L.shoes));
    }
    // --- hips, skirt & torso ---
    _cm[6].copy(root).multiply(mT(_tm, 0, hipY + 0.04, 0)).multiply(mS(_tm, 0.37 * bw * hpW, 0.21, 0.23));
    this._put('hips', _cm[6], col(L.skirt || L.pants));
    if (L.skirt && !far) { _cm[6].copy(root).multiply(mT(_tm, 0, hipY + 0.14, 0)).multiply(mS(_tm, 0.42 * bw * hpW, 0.42, 0.3)); this._put('skirt', _cm[6], col(L.skirt)); }
    else if (L.coat && L.jacket && !far && sit < 0.5) { _cm[6].copy(root).multiply(mT(_tm, 0, hipY + 0.2, -0.01)).multiply(mS(_tm, 0.47 * bw * hpW, 0.56, 0.31)); this._put('skirt', _cm[6], col(L.jacket)); }
    const lean = (ps.lean || 0) + crouch * 0.5 - sit * 0.05 - hit * 0.35 + (ps.dodge || 0) * 0.25 + heavy * 0.15;
    const twist = (ps.twist || 0) + (heavy > 0 ? (heavy < 0.45 ? 0.5 * heavy / 0.45 : -0.6 * Math.sin((heavy - 0.45) / 0.55 * Math.PI)) : 0) + (ps.punch > 0 ? -0.3 * (ps.punchArm || -1) * Math.sin(ps.punch * Math.PI) : 0);
    const hp = _cm[7].copy(root).multiply(mT(_tm, 0, hipY + 0.1, 0)).multiply(mRx(_tm, lean)).multiply(mRy(_tm, twist + Math.sin(phase) * A * 0.12));
    _cm[8].copy(hp).multiply(mT(_tm, 0, 0.28, 0)).multiply(mS(_tm, 0.44 * bw * shW, 0.56, 0.25));
    this._put('torso', _cm[8], col(L.shirt));
    if (L.jacket) {
      // open jacket: a slightly larger shell, shirt shows through as a front strip
      _cm[8].copy(hp).multiply(mT(_tm, 0, 0.26, -0.012)).multiply(mS(_tm, 0.47 * bw * shW, 0.6, 0.26));
      this._put('torso', _cm[8], col(L.jacket));
      if (!far) { _cm[9].copy(hp).multiply(mT(_tm, 0, 0.3, 0.12)).multiply(mS(_tm, 0.12 * bw, 0.5, 0.03)); this._put('small', _cm[9], col(L.tie ? this._lip.copy(L.shirt) : L.shirt)); }
    }
    if (!far) {
      if (L.tie) { _cm[9].copy(hp).multiply(mT(_tm, 0, 0.36, 0.135)).multiply(mS(_tm, 0.045, 0.32, 0.02)); this._put('small', _cm[9], col(L.tie)); }
      if (L.belt) { _cm[9].copy(hp).multiply(mT(_tm, 0, 0.0, 0)).multiply(mS(_tm, 0.37 * bw * hpW, 0.045, 0.24)); this._put('small', _cm[9], col(this._dark)); }
      if (L.chain) { _cm[9].copy(hp).multiply(mT(_tm, 0, 0.5, 0.125)).multiply(mRx(_tm, 0.25)).multiply(mS(_tm, 0.16, 0.025, 0.02)); this._put('gold', _cm[9], L.chain); }
    }
    // --- neck & head ---
    _cm[19].copy(hp).multiply(mT(_tm, 0, 0.6, 0.0)).multiply(mS(_tm, 0.06, 0.07, 0.06));
    this._put('joint', _cm[19], col(L.hood && !far ? L.hood : L.skin));
    if (!opts.noHead) {
      const hd = _cm[9].copy(hp).multiply(mT(_tm, 0, 0.72, 0.01)).multiply(mRx(_tm, (ps.headPitch || 0) - lean * 0.6 + hit * 0.3));
      _cm[10].copy(hd).multiply(mS(_tm, 0.112, 0.14, 0.128));
      this._put('head', _cm[10], col(L.skin));
      if (!far) {
        // a face (G6): nose, ears, eyes (white and pupil), brows in the hair colour and a mouth; shades cover the eyes
        _cm[10].copy(hd).multiply(mT(_tm, 0, -0.005, 0.122)).multiply(mS(_tm, 0.024, 0.042, 0.032));
        this._put('small', _cm[10], col(L.skin));
        for (const ex of [-1, 1]) { _cm[10].copy(hd).multiply(mT(_tm, ex * 0.108, 0.0, -0.005)).multiply(mS(_tm, 0.018, 0.04, 0.03)); this._put('small', _cm[10], col(L.skin)); }
        if (L.shades) { _cm[10].copy(hd).multiply(mT(_tm, 0, 0.03, 0.115)).multiply(mS(_tm, 0.2, 0.04, 0.02)); this._put('small', _cm[10], col(this._shade)); }
        else for (const ex of [-1, 1]) {
          _cm[10].copy(hd).multiply(mT(_tm, ex * 0.043, 0.03, 0.103)).multiply(mS(_tm, 0.019, 0.013, 0.012)); this._put('eye', _cm[10], col(this._eyeW));
          _cm[10].copy(hd).multiply(mT(_tm, ex * 0.043, 0.03, 0.113)).multiply(mS(_tm, 0.009, 0.01, 0.006)); this._put('eye', _cm[10], col(this._eyeP));
          _cm[10].copy(hd).multiply(mT(_tm, ex * 0.045, 0.058, 0.108)).multiply(mRz(_tm, ex * -0.12)).multiply(mS(_tm, 0.034, 0.008, 0.012)); this._put('small', _cm[10], col(L.hairStyle === 0 ? this._lip.copy(L.skin).multiplyScalar(0.55) : L.hair));
        }
        _cm[10].copy(hd).multiply(mT(_tm, 0, -0.058, 0.108)).multiply(mS(_tm, 0.036, 0.008, 0.01)); this._put('small', _cm[10], col(this._mouth.copy(L.skin).multiplyScalar(0.62)));
      }
      if (L.bandana) {
        _cm[11].copy(hd).multiply(mT(_tm, 0, 0.06, -0.005)).multiply(mS(_tm, 0.122, 0.07, 0.136));
        this._put('hat', _cm[11], col(L.bandana));
      } else if (L.hood && !far) {
        _cm[11].copy(hd).multiply(mT(_tm, 0, 0.02, -0.03)).multiply(mS(_tm, 0.135, 0.16, 0.15));
        this._put('hair', _cm[11], col(L.hood));
      } else if (L.cap) {
        _cm[11].copy(hd).multiply(mT(_tm, 0, 0.1, 0)).multiply(mS(_tm, 0.13, 0.07, 0.14));
        this._put('hat', _cm[11], col(L.cap));
        _cm[11].copy(hd).multiply(mT(_tm, 0, 0.07, 0.1)).multiply(mS(_tm, 0.12, 0.02, 0.1));
        this._put('small', _cm[11], col(L.cap));
      } else if (L.beanie) {
        _cm[11].copy(hd).multiply(mT(_tm, 0, 0.055, -0.008)).multiply(mS(_tm, 0.132, 0.1, 0.142));
        this._put('hat', _cm[11], col(L.beanie));
      } else if (L.hairStyle > 0) {
        const long = L.hairStyle === 2, bun = L.hairStyle === 3, curly = L.hairStyle === 4, tail = L.hairStyle === 5;
        _cm[11].copy(hd).multiply(mT(_tm, 0, long ? 0.005 : 0.025, -0.012)).multiply(mS(_tm, curly ? 0.142 : 0.125, long ? 0.17 : curly ? 0.155 : 0.135, curly ? 0.155 : 0.14));
        this._put('hair', _cm[11], col(L.hair));
        if (!far) {
          if (bun) { _cm[11].copy(hd).multiply(mT(_tm, 0, 0.1, -0.1)).multiply(mS(_tm, 0.06, 0.06, 0.06)); this._put('joint', _cm[11], col(L.hair)); }
          // long hair falls behind the shoulders; a ponytail hangs from the crown
          if (long) { _cm[11].copy(hd).multiply(mT(_tm, 0, -0.1, -0.075)).multiply(mS(_tm, 0.24, 0.22, 0.07)); this._put('small', _cm[11], col(L.hair)); }
          if (tail) { _cm[11].copy(hd).multiply(mT(_tm, 0, 0.0, -0.14)).multiply(mRx(_tm, 0.35)).multiply(mS(_tm, 0.05, 0.16, 0.05)); this._put('small', _cm[11], col(L.hair)); }
        }
      }
    }
    // --- arms ---
    const armA = A * 0.75;
    const pArm = ps.punchArm || -1;
    for (const side of [1, -1]) {
      let shoulder = side * Math.sin(phase) * armA, abd = 0.08 + crouch * 0.2, elbow = 0.25 + A * 0.9;
      if (ps.punch > 0 && side === pArm) { const k = Math.sin(ps.punch * Math.PI); shoulder = lerp(shoulder, -1.55, k); elbow = lerp(elbow, 0.08, k); abd = lerp(abd, 0.02, k); }
      else if (ps.punch > 0) { shoulder = lerp(shoulder, -0.9, 0.7); elbow = lerp(elbow, 1.9, 0.7); }
      if (side === -1) {
        if (ps.aim > 0) { shoulder = lerp(shoulder, -Math.PI / 2 + (ps.aimPitch || 0), ps.aim); elbow = lerp(elbow, 0.05, ps.aim); abd = lerp(abd, -0.1, ps.aim); }
        if (heavy > 0) {
          if (heavy < 0.45) { const k = heavy / 0.45; shoulder = lerp(shoulder, 0.55, k); elbow = lerp(elbow, 1.7, k); abd = lerp(abd, 0.35, k); }
          else { const k = Math.sin((heavy - 0.45) / 0.55 * Math.PI); shoulder = lerp(-0.6, -1.65, k); elbow = lerp(1.0, 0.05, k); abd = 0.05; }
        }
        if (ps.swing > 0) { shoulder = -1.2 - Math.sin(ps.swing * Math.PI) * 0.4; elbow = 0.5; abd = 0.3; }
        if (ps.hold === 'bat' && !(ps.swing > 0)) { shoulder = lerp(shoulder, -0.5, 0.7); elbow = 1.2; }
        if (ps.phone) { shoulder = -0.3; elbow = 2.3; abd = 0.35; }
      } else {
        if (ps.aim > 0 && ps.hold === 'gun2') { shoulder = lerp(shoulder, -1.3, ps.aim); elbow = lerp(elbow, 0.6, ps.aim); abd = lerp(abd, -0.5, ps.aim); }
        if (ps.swing > 0) { shoulder = -1.0 - Math.sin(ps.swing * Math.PI) * 0.3; elbow = 0.8; abd = -0.4; }
        if (heavy > 0) { shoulder = lerp(shoulder, -0.8, 0.8); elbow = lerp(elbow, 1.9, 0.8); }
      }
      if (block > 0) { shoulder = lerp(shoulder, -1.75, block); elbow = lerp(elbow, 2.15, block); abd = lerp(abd, -0.18, block); }
      if (kick > 0) { shoulder = lerp(shoulder, side * 0.5, kick * 0.6); abd = lerp(abd, 0.45, kick); }
      if (hit > 0) { abd = lerp(abd, 0.3, hit); elbow = lerp(elbow, 1.2, hit); }
      if (crouch > 0.3) { shoulder = lerp(shoulder, -2.7, crouch); elbow = lerp(elbow, 2.0, crouch); }
      // hands up (arrest): its own channel so it can never leak into locomotion
      const sur = ps.surrender || 0;
      if (sur > 0) { shoulder = lerp(shoulder, -2.85, sur); elbow = lerp(elbow, 1.5, sur); abd = lerp(abd, 0.42, sur); }
      if (air > 0) { shoulder = lerp(shoulder, -0.6, air); abd = lerp(abd, 0.6, air); }
      if (sit > 0) { shoulder = lerp(shoulder, -0.4, sit); elbow = lerp(elbow, 1.2, sit); }
      if (down > 0) { shoulder = lerp(shoulder, -2.6, down); abd = lerp(abd, 0.5, down); }
      const sx = side * 0.255 * bw * shW;
      // rounded shoulder cap (deltoid) in the sleeve colour
      _cm[20].copy(hp).multiply(mT(_tm, sx * 0.96, 0.5, 0)).multiply(mS(_tm, 0.085 * bw, 0.08, 0.1));
      const upperCol = L.jacket || (L.sleeve ? L.shirt : null);
      this._put('joint', _cm[20], col(upperCol || L.shirt));
      const sj = _cm[12].copy(hp).multiply(mT(_tm, sx, 0.52, 0)).multiply(mRx(_tm, shoulder)).multiply(mRz(_tm, side * abd));
      _cm[13].copy(sj).multiply(mS(_tm, 0.1, 0.31, 0.11));
      this._put('limb', _cm[13], col(upperCol || L.skin));
      const ej = _cm[14].copy(sj).multiply(mT(_tm, 0, -0.31, 0)).multiply(mRx(_tm, -elbow));
      _cm[15].copy(ej).multiply(mS(_tm, 0.088, 0.27, 0.088));
      this._put('limb', _cm[15], col(L.jacket || L.skin));
      _cm[16].copy(ej).multiply(mT(_tm, 0, -0.29, 0.0)).multiply(mS(_tm, 0.075, 0.1, 0.085));
      this._put('hand', _cm[16], col(L.skin));
      if (side === -1) {
        const hand = _cm[17].copy(ej).multiply(mT(_tm, 0, -0.3, 0));
        if (opts.wantHand) this.handR.copy(hand);
        if (ps.hold === 'gun' || ps.hold === 'gun2') {
          _cm[18].copy(hand).multiply(mRx(_tm, Math.PI / 2)).multiply(mT(_tm, 0, 0.06, -0.02)).multiply(mS(_tm, 0.05, ps.hold === 'gun2' ? 0.4 : 0.22, 0.11));
          this._put('gun', _cm[18]);
        } else if (ps.hold === 'bat') {
          _cm[18].copy(hand).multiply(mRx(_tm, Math.PI / 2 - 0.4)).multiply(mT(_tm, 0, 0.42, 0)).multiply(mS(_tm, 0.035, 0.85, 0.035));
          this._put('bat', _cm[18]);
        }
      }
    }
    return true;
  }
}

