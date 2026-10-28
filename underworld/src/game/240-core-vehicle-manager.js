/* =====================================================================
   [CORE] VEHICLE MANAGER (pools, wheels, collisions, parked cars, light pools)
   ===================================================================== */
class VehicleManager {
  constructor(game) {
    this.game = game; this.scene = game.scene;
    this.physical = game.quality.level >= 2;
    this.list = []; this.pools = {};
    this.maxWheels = 4 * 140;
    // one instanced mesh per rim style (steel, alloy, sport, polished)
    this.rims = [0, 1, 2, 3].map(st => {
      const m = new THREE.InstancedMesh(wheelGeometry(st), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: st === 3 ? 0.18 : st === 0 ? 0.7 : 0.45, metalness: st === 3 ? 0.9 : st === 0 ? 0.25 : 0.55 }), st <= 1 ? this.maxWheels : 4 * 60);
      m.count = 0; m.frustumCulled = false; m.castShadow = true; this.scene.add(m); return m;
    });
    this.wheels = this.rims[1];
    const pool = makeRadialTexture('rgba(255,240,210,0.85)', 'rgba(255,240,210,0)', 128, false);
    this.beamMat = new THREE.MeshBasicMaterial({ map: pool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const bg = new THREE.PlaneGeometry(4.2, 9).rotateX(-Math.PI / 2); bg.translate(0, 0, 4.4);
    this.beams = new THREE.InstancedMesh(bg, this.beamMat, 140);
    this.beams.count = 0; this.beams.frustumCulled = false; this.beams.renderOrder = 2;
    this.scene.add(this.beams);
    this._circA = []; this._circB = []; this._tmp = []; this._res = {};
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ'); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    this.parkedBlocks = new Map();
  }
  onLand(v, imp, airT) {
    const g = this.game;
    if (imp > 7) {
      const k = clamp((imp - 7) / 10, 0, 1);
      v.hurt((imp - 7) * 2.2 * (v.spec.offroad ? 0.35 : 1), 'land');
      g.fx.sparks(v.pos.x, v.pos.y + 0.2, v.pos.z, 10 + k * 20);
      g.fx.dust(v.pos.x, v.pos.y + 0.2, v.pos.z, 8);
      g.audio.play('crash', { x: v.pos.x, z: v.pos.z, k: 0.3 + k * 0.6 });
    } else if (imp > 3) g.audio.play('thud', { x: v.pos.x, z: v.pos.z, gain: 0.6 });
    if (v.driver === 'player') { g.cam.land(clamp(imp / 14, 0.1, 1)); if (g.stunts) g.stunts.landed(v, airT, imp); }
  }
  // physics guard: never let NaN/Infinity or runaway values survive a frame
  sanitize(v) {
    const ok = isFinite(v.pos.x) && isFinite(v.pos.y) && isFinite(v.pos.z) && isFinite(v.vel.x) && isFinite(v.vel.y) && isFinite(v.h) && isFinite(v.yawRate) && isFinite(v.health);
    const s = v._safe || (v._safe = { x: v.pos.x, y: v.pos.y, z: v.pos.z, h: v.h });
    if (!ok || (v.pos.y < -20 && vspaceFloor(v.pos.x, v.pos.z, v.pos.y) === null)) {
      const ok2 = isFinite(s.x) && isFinite(s.z);
      const x = ok2 ? s.x : CITY / 2, z = ok2 ? s.z : CITY / 2;
      v.pos.set(x, groundY(x, z), z); v.h = isFinite(s.h) ? s.h : 0; v.vel.set(0, 0); v.yawRate = 0;
      v.airborne = false; v.yVel = 0; v.pitch = 0; v.roll = 0; v.pv = 0; v.rv = 0; v.steer = 0; v.pitchG = 0; v.rollG = 0; v.pitchGV = 0; v.bodyOff = 0; v.bodyV = 0;
      v.syncMesh(0);
      if (!isFinite(v.health)) v.health = 50;
      return;
    }
    const sp = v.speed, cap = v.spec.vmax * 1.8;
    if (sp > cap) v.vel.multiplyScalar(cap / sp);
    v.yawRate = clamp(v.yawRate, -7, 7);
    if (!v.airborne) { s.x = v.pos.x; s.y = v.pos.y; s.z = v.pos.z; s.h = v.h; }
  }
  onLaunch(v) { const g = this.game; if (v.driver === 'player' && g.stunts) g.stunts.launched(v); }
  spawn(type, x, z, h, opts = {}) {
    const pool = this.pools[type] || (this.pools[type] = []);
    let v = pool.pop();
    if (!v) v = new Vehicle(this, type);
    v.reset(x, z, h, opts);
    this.scene.add(v.mesh);
    this.list.push(v);
    return v;
  }
  despawn(v) {
    const i = this.list.indexOf(v); if (i < 0) return;
    this.list.splice(i, 1);
    this.scene.remove(v.mesh);
    if (v.ai && this.game.traffic) this.game.traffic.release(v);
    v.ai = null; v.drive = null; v.driver = null; v.mission = null;
    v.restoreGeo();
    (this.pools[v.type] || (this.pools[v.type] = [])).push(v);
  }
  nearby(x, z, r) {
    const out = this._tmp; out.length = 0;
    for (const v of this.list) if (Math.abs(v.pos.x - x) < r + 3 && Math.abs(v.pos.z - z) < r + 3) out.push(v);
    return out;
  }
  // deterministic parked cars streamed with blocks
  updateParked(px, pz, radius) {
    const want = new Set();
    for (const b of this.game.world.blocks) if (Math.hypot(b.cx - px, b.cz - pz) < radius) want.add(b.i);
    for (const [bi, cars] of this.parkedBlocks) if (!want.has(bi)) {
      for (const v of cars) if (this.list.includes(v) && !v.touched && v.driver === null && !v.mission && v !== this.game.player.lastVehicle) this.despawn(v);
      this.parkedBlocks.delete(bi);
    }
    for (const bi of want) if (!this.parkedBlocks.has(bi)) {
      const b = this.game.world.blocks[bi]; const cars = [];
      b.parked.forEach((p, k) => {
        const hh = hash2i(bi, k, 31);
        let type = p.cls || (b.t === 'I' ? (hh < 0.5 ? 'van' : 'pickup') : b.t === 'H' ? CIVIL_TYPES[Math.floor(hh * 8)] : CIVIL_TYPES[Math.floor(hh * CIVIL_TYPES.length)]);
        if (!p.cls && hh > 0.985) type = 'muscle';
        if (!p.cls && hash2i(bi, k, 35) < (RARE_ZONES[zoneKey(p.x, p.z)] || 0)) type = RARE_TYPES[Math.floor(hash2i(bi, k, 34) * RARE_TYPES.length)];
        if (Math.hypot(p.x - px, p.z - pz) < 6) return;
        // the rooftop Zephyr is a one-time find (§45.39): once taken it never stands there again
        if (p.rare && (this.game.save.flags.rooftopTaken || this.game.save.secrets.rooftop)) return;
        // no parking at a curved road's junction: cars turning on and off sweep across the kerb there
        for (const L of Links.list) for (const e of L.ends) if (Math.hypot(p.x - e.C.x, p.z - e.C.z) < 16) return;
        // skip if something already occupies the slot
        for (const v of this.list) if (dist2(v.pos.x, v.pos.z, p.x, p.z) < 9) return;
        const s = VEHICLES[type];
        const v = this.spawn(type, p.x, p.z, p.h, { parked: true, y: p.y, color: s.colors[Math.floor(hash2i(bi, k, 32) * s.colors.length)], beaterSeed: hash2i(bi, k, 33) });
        v.homeBlock = bi;
        if (p.locked) v.locked = true;
        if (p.rare) v.rareFind = true;
        cars.push(v);
      });
      this.parkedBlocks.set(bi, cars);
    }
  }
  update(dt) {
    const g = this.game;
    for (const v of this.list) {
      if (v.mode === 'phys') {
        if (v.drive) v.drive.update(dt);
        const steps = v.speed > 25 || v.airborne ? 2 : 1;
        for (let k = 0; k < steps; k++) { v.step(dt / steps, g); if (!v.sleep) v.ground(dt / steps); }
        this.sanitize(v);
      }
      if (v.mode === 'phys' && !v.sleep) this.collideStatic(v);
    }
    this.collidePairs();
    // fire / damage effects
    for (const v of this.list) {
      if (v.health <= 0 && !v.burnt) {
        v.fireT += dt;
        if (v.fireT > 4.5) g.fx.explodeVehicle(v);
      }
    }
  }
  collideStatic(v) {
    const g = this.game, s = v.spec, r = s.w / 2;
    const cs = v.circleCenters(this._circA);
    const res = this._res, n = cs.length, span = s.l - s.w, sp = Math.sin(v.pitchG || 0);
    for (let ci = 0; ci < n; ci++) {
      const c = cs[ci];
      // on a slope the nose is higher than the centre (and the tail lower): each circle's height
      // band follows the chassis pitch, so a car climbing a steep ramp doesn't catch the deck edge
      const dy = n > 1 ? -(-span / 2 + span * ci / (n - 1)) * sp : 0;
      g.world.grid.resolveCircle(c.x, c.z, r, v.pos.y + dy + 0.3, v.pos.y + dy + s.h, res);
      if (!res.hit) continue;
      const nx = res.nx, nz = res.nz, d = res.depth;
      v.pos.x += nx * d; v.pos.z += nz * d;
      const rx = c.x - v.pos.x, rz = c.z - v.pos.z;
      const vcx = v.vel.x + v.yawRate * rz, vcz = v.vel.y - v.yawRate * rx;
      const vn = vcx * nx + vcz * nz;
      if (vn >= 0) continue;
      const col = res.col;
      if (col && col.onHit) col.onHit(v, -vn);
      // breakable props get knocked away instead of stopping the car
      const pdef = col && col.prop ? PROP_DEFS[col.prop.type] : null;
      if (pdef && col.breakable && v.speed > (pdef.breakSpeed || 3)) {
        if (g.props.breakProp(col.prop)) {
          g.fx.knockProp(col.prop, v.vel.x, v.vel.y);
          const keep = clamp(1 - (pdef.mass || 30) / (v.spec.mass * 1.4), 0.55, 0.97);
          v.vel.x *= keep; v.vel.y *= keep;
          if ((pdef.mass || 0) > 200) { v.hurt(6, 'prop'); g.fx.sparks(c.x, v.pos.y + 0.6, c.z, 18, nx, nz); if (v.driver === 'player') { g.cam.shake(0.35); g.audio.play('crash', { k: 0.6 }); } }
          if (pdef.explode) setTimeout(() => g.fx.explosion(col.prop.x, CURB_H, col.prop.z, 1.2), 350);
          if (g.stunts && v.driver === 'player') g.stunts.destroyed(col.prop.type);
          if (PROP_DEFS[col.prop.type].water) g.fx.hydrant(col.prop.x, col.prop.z);
          g.audio.play('thud', { x: c.x, z: c.z, gain: 0.8 });
          if (v.driver === 'player') g.cam.shake(0.12);
        }
        continue;
      }
      const cross = rz * nx - rx * nz;
      const I = s.mass * (s.l * s.l + s.w * s.w) / 12;
      const e = 0.18;
      const j = -(1 + e) * vn / (1 / s.mass + cross * cross / I);
      v.vel.x += j * nx / s.mass; v.vel.y += j * nz / s.mass;
      v.yawRate += j * cross / I * 0.6;
      // tangential friction
      const tx = -nz, tz = nx; const vt = vcx * tx + vcz * tz;
      v.vel.x -= tx * vt * 0.08; v.vel.y -= tz * vt * 0.08;
      this.impact(v, -vn, c.x, c.z, nx, nz, null);
    }
  }
  impact(v, speed, x, z, nx, nz, other) {
    const g = this.game;
    if (speed < 2) return;
    v.wake();
    if (v.airborne) v.hitT = 0.6; // a hit in the air may leave it spinning
    // progressive crash damage: parking bumps barely scratch, a 50 km/h hit matters, 90+ km/h is
    // dangerous. (hurt() halves it again for the doubled durability.)
    // raw: 7 m/s ~0.5, 10 m/s ~5, 15 m/s ~18, 20 m/s ~37, 25 m/s ~60, 30 m/s ~87, 40 m/s ~150
    const dmg = 0.54 * Math.pow(Math.max(0, speed - 6), 1.6) * Math.sqrt(1500 / v.spec.mass) * (v.tune ? 1 - v.tune.armor * 0.17 : 1) * (v.spec.offroad ? 0.7 : 1);
    if (v.driver === 'player' && speed > 21 && !g.slowT) g.slowT = 0.45;
    if (dmg > 0 && !v.burnt) { v.hurt(dmg, 'crash'); v.lastHitBy = other; }
    if (speed > 5) {
      const lp = v.toLocal(x, z); const c = Math.cos(v.h), s = Math.sin(v.h);
      const lnx = nx * c - nz * s, lnz = nx * s + nz * c;
      v.deform(lp.x * 0.9, lp.z * 0.9, -lnx, -lnz, speed * 0.012);
      g.fx.sparks(x, v.pos.y + 0.5, z, Math.min(30, speed * 2), nx, nz);
    }
    if (speed > 3.5) {
      const k = clamp(speed / 22, 0.2, 1);
      if (!this._lastCrash || performance.now() - this._lastCrash > 120) { g.audio.play('crash', { x, z, k, gain: 0.5 + k }); this._lastCrash = performance.now(); }
      if (v.driver === 'player') { g.cam.shake(clamp(speed / 25, 0.15, 0.8)); g.save.stats.crashes++; }
    }
    if (v.ai && v.mode === 'kin' && speed > 1.5) g.traffic.disturb(v, other);
    if (v.parked && speed > 3 && !v.alarmT && Math.random() < 0.5) v.alarmT = 6;
  }
  collidePairs() {
    const L = this.list, g = this.game;
    for (let a = 0; a < L.length; a++) {
      const A = L[a];
      for (let b = a + 1; b < L.length; b++) {
        const B = L[b];
        const reach = (A.spec.l + B.spec.l) / 2;
        if (Math.abs(A.pos.x - B.pos.x) > reach || Math.abs(A.pos.z - B.pos.z) > reach) continue;
        if (Math.abs(A.pos.y - B.pos.y) > 2.6) continue; // different parking decks / underground
        if (A.sleep && B.sleep) continue;
        if (A.mode === 'kin' && B.mode === 'kin') continue;
        const ca = A.circleCenters(this._circA), cb = B.circleCenters(this._circB);
        const ra = A.spec.w / 2, rb = B.spec.w / 2;
        let best = null, bd = 0;
        for (const p of ca) for (const q of cb) {
          const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
          if (d < ra + rb && (ra + rb - d) > bd) { bd = ra + rb - d; best = { p, q, nx: d > 1e-4 ? dx / d : 1, nz: d > 1e-4 ? dz / d : 0 }; }
        }
        if (!best) continue;
        const { p, nx, nz } = best;
        const cx = p.x + nx * ra, cz = p.z + nz * ra;
        const ma = A.mode === 'kin' || (A.sleep && B.speed < 2) ? 1e9 : A.spec.mass;
        const mb = B.mode === 'kin' || (B.sleep && A.speed < 2) ? 1e9 : B.spec.mass;
        const ia = 1 / ma, ib = 1 / mb, tot = ia + ib;
        A.pos.x -= nx * bd * ia / tot; A.pos.z -= nz * bd * ia / tot;
        B.pos.x += nx * bd * ib / tot; B.pos.z += nz * bd * ib / tot;
        const rax = cx - A.pos.x, raz = cz - A.pos.z, rbx = cx - B.pos.x, rbz = cz - B.pos.z;
        const vax = A.vel.x + A.yawRate * raz, vaz = A.vel.y - A.yawRate * rax;
        const vbx = B.vel.x + B.yawRate * rbz, vbz = B.vel.y - B.yawRate * rbx;
        const vn = (vbx - vax) * nx + (vbz - vaz) * nz;
        if (vn >= 0) continue;
        const Ia = A.spec.mass * (A.spec.l ** 2) / 12, Ib = B.spec.mass * (B.spec.l ** 2) / 12;
        const ca2 = raz * nx - rax * nz, cb2 = rbz * nx - rbx * nz;
        const j = -(1 + 0.25) * vn / (ia + ib + (ma < 1e8 ? ca2 * ca2 / Ia : 0) + (mb < 1e8 ? cb2 * cb2 / Ib : 0));
        if (ma < 1e8) { A.vel.x -= j * nx * ia; A.vel.y -= j * nz * ia; A.yawRate -= j * ca2 / Ia * 0.5; }
        if (mb < 1e8) { B.vel.x += j * nx * ib; B.vel.y += j * nz * ib; B.yawRate += j * cb2 / Ib * 0.5; }
        const sp = -vn;
        if (sp > 1) { A.wake(); B.wake(); }
        if (A.mode === 'kin' && sp > 1.5) g.traffic.disturb(A, B);
        if (B.mode === 'kin' && sp > 1.5) g.traffic.disturb(B, A);
        this.impact(A, sp, cx, cz, nx, nz, B); this.impact(B, sp, cx, cz, -nx, -nz, A);
        g.onVehicleCollision(A, B, sp);
      }
    }
  }
  render(dt, night, t, camera) {
    const RM = this.rims, cnt = [0, 0, 0, 0]; let nb = 0;
    const camPos = camera.position;
    for (const v of this.list) {
      if (v.mode === 'phys') v.pose();
      v.headOn = night > 0.25 || this.game.env.rain > 0.5;
      v.updateMaterial(night, t);
      if (v.alarmT > 0) { v.alarmT -= dt; v.mat.userData.u.uLights.value.x = (Math.sin(t * 10) > 0) ? 1.5 : 0; if (Math.random() < dt * 3) this.game.audio.play('horn', { x: v.pos.x, z: v.pos.z, dur: 0.25, pitch: 1.2, gain: 0.6 }); }
      const d2 = dist2(v.pos.x, v.pos.z, camPos.x, camPos.z);
      v.mesh.visible = d2 < 330 * 330;
      if (!v.mesh.visible) continue;
      // distance LOD (never for a dented car: its geometry is its own clone)
      const lodWant = d2 > LOD_D * LOD_D && v.driver !== 'player';
      if (v.mesh.geometry === v.vg.geo && lodWant) v.mesh.geometry = v.vg.lod;
      else if (v.mesh.geometry === v.vg.lod && !lodWant) v.mesh.geometry = v.vg.geo;
      // wheels
      const st = v.rim | 0, W = RM[st];
      let n = cnt[st];
      if (n + 4 <= W.instanceMatrix.count && d2 < 160 * 160) {
        const s = v.spec, R = s.wheelR;
        v.mesh.updateMatrix();
        const e = v.mesh.matrix.elements, upY = Math.max(0.5, e[5]);
        for (let i = 0; i < 4; i++) {
          const [lx, lz] = v.vg.wheels[i];
          const steerA = lz > 0 ? v.steer : 0;
          // the wheel sits on its contact point, measured in the body's own frame, but never moves
          // further than the suspension allows: up into the arch by SUSP_UP, down (droop) by SUSP_DOWN
          const restY = e[1] * lx + e[5] * R + e[9] * lz + e[13];
          const wy = R + clamp((v._wy[i] + R - restY) / upY, -SUSP_DOWN, SUSP_UP);
          this._e.set(v.spin, steerA, 0, 'YXZ'); this._q.setFromEuler(this._e);
          this._m.compose(this._p.set(lx, wy, lz), this._q, this._s.set(0.24, R, R));
          this._m.premultiply(v.mesh.matrix);
          W.setMatrixAt(n++, this._m);
        }
        cnt[st] = n;
      }
      if (v.headOn && !v.burnt && (v.driver || v.mode === 'kin') && v.driver !== 'player' && nb < 140 && night > 0.2) {
        v.mesh.updateMatrix();
        this._m.makeTranslation(0, 0.06 - v.pos.y + groundY(v.pos.x + Math.sin(v.h) * 5, v.pos.z + Math.cos(v.h) * 5), v.vg.zf).premultiply(v.mesh.matrix);
        this.beams.setMatrixAt(nb++, this._m);
      }
    }
    for (let i = 0; i < RM.length; i++) { RM[i].count = cnt[i]; RM[i].instanceMatrix.needsUpdate = true; }
    this.beams.count = nb; this.beams.instanceMatrix.needsUpdate = true;
    this.beamMat.opacity = clamp((night - 0.2) * 0.8, 0, 0.55);
  }
}

