/* =====================================================================
   [CORE] FX SYSTEM
   ===================================================================== */
class FXSystem {
  constructor(game) {
    this.game = game; const scene = game.scene;
    this.smoke = new ParticlePool(scene, 2600, false);
    this.glow = new ParticlePool(scene, 1600, true);
    // skid marks ring buffer
    this.skidMax = 1600; this.skidI = 0;
    const sg = new THREE.BufferGeometry();
    this.skidPos = new Float32Array(this.skidMax * 4 * 3);
    sg.setAttribute('position', new THREE.BufferAttribute(this.skidPos, 3));
    const idx = new Uint32Array(this.skidMax * 6);
    for (let i = 0; i < this.skidMax; i++) { idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4 + 1, i * 4 + 2, i * 4 + 3], i * 6); }
    sg.setIndex(new THREE.BufferAttribute(idx, 1));
    this.skidGeo = sg;
    this.skids = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.skids.frustumCulled = false; this.skids.renderOrder = 1; scene.add(this.skids);
    this.lastSkid = new Map();
    // tracers
    this.tracerMax = 64; this.tracers = [];
    const tg = new THREE.BufferGeometry(); this.tracerPos = new Float32Array(this.tracerMax * 6);
    tg.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3)); this.tracerGeo = tg;
    this.tracerLines = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracerLines.frustumCulled = false; scene.add(this.tracerLines);
    // muzzle flash sprite + shared flash light
    this.flashTex = makeRadialTexture('rgba(255,240,200,1)', 'rgba(255,140,40,0)', 64);
    this.muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.muzzle.scale.setScalar(0.6); this.muzzle.visible = false; scene.add(this.muzzle);
    this.muzzleT = 0;
    this.light = new THREE.PointLight(0xffa040, 0, 18, 2); scene.add(this.light); this.lightT = 0; this.lightMax = 1;
    // debris (knocked props)
    this.debris = [];
    this.emitters = []; // hydrants
    this.ambientT = 0;
    this._v = new THREE.Vector3();
  }
  glass(p, y) {
    for (let i = 0; i < 18; i++) this.glow.emit(p.x, y, p.z, rand(-3, 3), rand(1, 4), rand(-3, 3), rand(0.4, 0.9), 0.07, 0.04, 0.75, 0.85, 0.95, 0.9, 0.6, 16);
    this.game.audio.play('glass', { x: p.x, z: p.z, gain: 0.7 });
  }
  sparks(x, y, z, n, nx = 0, nz = 0) {
    for (let i = 0; i < n; i++) this.glow.emit(x, y, z, nx * rand(1, 5) + rand(-4, 4), rand(1, 6), nz * rand(1, 5) + rand(-4, 4), rand(0.25, 0.6), 0.12, 0.02, 1, rand(0.6, 0.85), 0.3, 1, 1.2, 14);
  }
  dust(x, y, z, n = 6, col = [0.6, 0.58, 0.54]) {
    for (let i = 0; i < n; i++) this.smoke.emit(x, y, z, rand(-1.5, 1.5), rand(0.3, 1.8), rand(-1.5, 1.5), rand(0.5, 1.1), 0.25, 0.9, col[0], col[1], col[2], 0.55, 2.5, 0.5);
  }
  puff(x, y, z, col = [0.85, 0.85, 0.85]) { for (let i = 0; i < 5; i++) this.smoke.emit(x, y, z, rand(-0.8, 0.8), rand(0.3, 1.2), rand(-0.8, 0.8), rand(0.3, 0.6), 0.15, 0.5, col[0], col[1], col[2], 0.7, 3, 0.3); }
  tireSmoke(x, y, z, k) {
    this.smoke.emit(x + rand(-0.2, 0.2), y + 0.2, z + rand(-0.2, 0.2), rand(-0.8, 0.8), rand(0.4, 1.4), rand(-0.8, 0.8), rand(1.2, 2.4), 0.6, 3.2 + k * 2, 0.88, 0.88, 0.9, 0.32 * k, 1.4, -0.3, 0.15);
  }
  impact(x, y, z, n = 5) {
    for (let i = 0; i < n; i++) this.glow.emit(x, y, z, rand(-2.2, 2.2), rand(0.4, 2.6), rand(-2.2, 2.2), rand(0.12, 0.25), 0.07, 0.015, 1, 0.92, 0.7, 1, 0.8, 9);
  }
  tracer(ax, ay, az, bx, by, bz) {
    this.tracers.push({ a: [ax, ay, az], b: [bx, by, bz], t: 0.06 });
    if (this.tracers.length > this.tracerMax) this.tracers.shift();
  }
  muzzleFlash(x, y, z) {
    this.muzzle.position.set(x, y, z); this.muzzle.visible = true; this.muzzleT = 0.05; this.muzzle.material.rotation = Math.random() * 6;
    this.muzzle.scale.setScalar(rand(0.45, 0.8));
    this.flashLight(x, y, z, 6, 0.06, 0xffb060);
    for (let i = 0; i < 3; i++) this.glow.emit(x, y, z, rand(-1, 1), rand(-1, 1), rand(-1, 1), 0.08, 0.25, 0.05, 1, 0.8, 0.4, 1, 1, 0);
  }
  flashLight(x, y, z, intensity, dur, color) {
    if (this.lightT > 0 && this.lightMax > intensity) return;
    this.light.position.set(x, y, z); this.light.color.setHex(color); this.light.intensity = intensity; this.lightT = dur; this.lightDur = dur; this.lightMax = intensity;
  }
  skidMark(key, x, z, y, h, width = 0.24) {
    const last = this.lastSkid.get(key);
    const now = this.game.time;
    if (last && now - last.t < 0.12 && dist2(last.x, last.z, x, z) < 4) {
      const i = this.skidI; this.skidI = (this.skidI + 1) % this.skidMax;
      const rx = Math.cos(h) * width / 2, rz = -Math.sin(h) * width / 2;
      const yy = y + 0.025;
      const o = i * 12;
      const P3 = this.skidPos;
      P3[o] = last.x - last.rx; P3[o + 1] = yy; P3[o + 2] = last.z - last.rz;
      P3[o + 3] = last.x + last.rx; P3[o + 4] = yy; P3[o + 5] = last.z + last.rz;
      P3[o + 6] = x - rx; P3[o + 7] = yy; P3[o + 8] = z - rz;
      P3[o + 9] = x + rx; P3[o + 10] = yy; P3[o + 11] = z + rz;
      this.skidGeo.attributes.position.needsUpdate = true;
      last.x = x; last.z = z; last.t = now; last.rx = rx; last.rz = rz;
    } else this.lastSkid.set(key, { x, z, t: now, rx: Math.cos(h) * width / 2, rz: -Math.sin(h) * width / 2 });
  }
  explosion(x, y, z, power = 1) {
    const g = this.game;
    for (let i = 0; i < 70 * power; i++) {
      const a = Math.random() * 6.28, e = Math.random() * 1.2, s = rand(4, 14) * power;
      this.glow.emit(x, y + 0.8, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 2, Math.sin(a) * Math.cos(e) * s, rand(0.4, 0.9), rand(1.4, 2.6), rand(0.3, 0.8), 1, rand(0.45, 0.75), 0.15, 1, 2.6, -1);
    }
    for (let i = 0; i < 40 * power; i++) this.smoke.emit(x + rand(-1.5, 1.5), y + rand(0.5, 2), z + rand(-1.5, 1.5), rand(-3, 3), rand(2, 7), rand(-3, 3), rand(2.5, 5), rand(1.5, 2.5), rand(5, 9), 0.12, 0.11, 0.1, 0.75, 1.2, -0.8, 0.05);
    this.sparks(x, y + 1, z, 40);
    this.flashLight(x, y + 2, z, 60, 0.5, 0xff8a30);
    g.audio.play('explosion', { x, z, ref: 30, max: 500, gain: 1.4 });
    const d = Math.hypot(g.cam.pos.x - x, g.cam.pos.z - z);
    g.cam.shake(clamp(1.2 - d / 60, 0, 1));
    g.peds.panic(x, z, 60, 1);
    // damage around
    for (const v of g.vehicles.nearby(x, z, 10)) {
      const dd = Math.hypot(v.pos.x - x, v.pos.z - z); if (dd > 10) continue;
      const k = 1 - dd / 10;
      if (dd > 0.5) { v.wake(); v.vel.x += (v.pos.x - x) / dd * 14 * k * 1500 / v.spec.mass; v.vel.y += (v.pos.z - z) / dd * 14 * k * 1500 / v.spec.mass; v.yawRate += rand(-2, 2) * k; }
      if (v.mode === 'kin') g.traffic.disturb(v, null);
      v.hurt(100 * k, 'fire');
    }
    g.combat.areaDamage(x, z, 9, 90);
  }
  explodeVehicle(v) {
    if (v.burnt) return;
    v.burnt = true; v.health = 0; v.siren = false;
    this.explosion(v.pos.x, v.pos.y, v.pos.z, 1);
    v.wake(); v.yVel = 6; v.yawRate += rand(-1.5, 1.5);
    const g = this.game;
    if (g.player.vehicle === v && g.player.state === 'vehicle') { g.player.damage(1e5, 'explosion'); }
    if (v.type === 'police' && v.lastHitBy && v.lastHitBy.driver === 'player') { g.police.crime('copcar', v.pos.x, v.pos.z); g.save.stats.copsWrecked++; }
    else if (g.player.vehicle === v || (v.lastHitBy && v.lastHitBy.driver === 'player') || v.shotByPlayer) g.police.crime('explosion', v.pos.x, v.pos.z);
    g.missions.onVehicleDestroyed(v);
  }
  knockProp(p, vx, vz) {
    const geo = this.game.props.geos[p.type]; if (!geo) return;
    const m = new THREE.Mesh(geo, this.game.props.mat);
    m.position.set(p.x, CURB_H, p.z); m.rotation.y = p.ry; m.castShadow = true;
    this.game.scene.add(m);
    const sp = Math.hypot(vx, vz);
    this.debris.push({ m, vx: vx * 0.8 + rand(-1, 1), vy: 2 + sp * 0.25, vz: vz * 0.8 + rand(-1, 1), ax: rand(-6, 6), az: rand(-6, 6), t: 7 });
    this.dust(p.x, 0.5, p.z, 6);
    if (this.debris.length > 24) { const d = this.debris.shift(); this.game.scene.remove(d.m); }
  }
  hydrant(x, z) {
    this.emitters.push({ x, z, t: 14, type: 'water' });
    this.game.audio.play('water', { x, z });
  }
  update(dt) {
    const g = this.game;
    // continuous emitters
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i]; e.t -= dt;
      if (e.t <= 0) { this.emitters.splice(i, 1); continue; }
      if (dist2(e.x, e.z, g.cam.pos.x, g.cam.pos.z) > 150 * 150) continue;
      const k = Math.min(1, e.t / 3);
      for (let j = 0; j < 4; j++) this.smoke.emit(e.x, 0.7, e.z, rand(-0.6, 0.6), rand(7, 10) * k, rand(-0.6, 0.6), rand(0.8, 1.2), 0.18, 0.6, 0.78, 0.86, 0.95, 0.75, 0.3, 9.8);
    }
    // world fx near camera: fountains, chimney smoke
    this.ambientT -= dt;
    if (this.ambientT <= 0) {
      this.ambientT = 0.05;
      for (const ci of g.chunks.visible) {
        const b = g.world.blocks[ci];
        for (const f of b.fx) {
          if (f.type === 'fountain' && dist2(f.x, f.z, g.cam.pos.x, g.cam.pos.z) < 90 * 90) {
            for (let j = 0; j < 3; j++) this.smoke.emit(f.x + rand(-0.15, 0.15), f.y, f.z + rand(-0.15, 0.15), rand(-1, 1), rand(4, 5.5), rand(-1, 1), 1.0, 0.14, 0.32, 0.8, 0.88, 0.95, 0.6, 0.2, 9.8);
          } else if (f.type === 'smoke' && dist2(f.x, f.z, g.cam.pos.x, g.cam.pos.z) < 300 * 300 && Math.random() < 0.5) {
            this.smoke.emit(f.x, f.y, f.z, rand(-0.3, 0.3) + 1.2, rand(1.2, 2), rand(-0.3, 0.3) + 0.4, rand(5, 8), 1.4, 6, 0.75, 0.75, 0.76, 0.4, 0.15, -0.1, 0.1);
          } else if (f.type === 'steam' && dist2(f.x, f.z, g.cam.pos.x, g.cam.pos.z) < 420 * 420 && Math.random() < 0.6) {
            // cooling-tower plume: big, bright, slow and drifting with the wind
            const w = U.uWind.value;
            this.smoke.emit(f.x + rand(-3, 3), f.y, f.z + rand(-3, 3), w * 1.4 + rand(-0.4, 0.4), rand(2.2, 3.4), w * 0.5 + rand(-0.4, 0.4), rand(7, 10), 4, 14, 0.93, 0.94, 0.96, 0.5, 0.08, -0.05, 0.15);
          }
        }
      }
    }
    // vehicle smoke/fire and tire smoke/skids
    for (const v of g.vehicles.list) {
      if (dist2(v.pos.x, v.pos.z, g.cam.pos.x, g.cam.pos.z) > 140 * 140) continue;
      const fx = Math.sin(v.h), fz = Math.cos(v.h);
      const hx = v.pos.x + fx * v.spec.l * 0.35, hz = v.pos.z + fz * v.spec.l * 0.35, hy = v.pos.y + v.vg.frontTop;
      // exhaust puffs when pulling away hard from low speed
      if (!v.burnt && v.health > 0 && v.ctl.throttle > 0.6 && v.speed < 7 && !v.sleep && Math.random() < dt * 14 && dist2(v.pos.x, v.pos.z, g.cam.pos.x, g.cam.pos.z) < 45 * 45) {
        const ex = v.pos.x - fx * v.spec.l * 0.5, ez = v.pos.z - fz * v.spec.l * 0.5;
        this.smoke.emit(ex, v.pos.y + 0.35, ez, -fx * 1.2 + rand(-0.3, 0.3), rand(0.3, 0.7), -fz * 1.2 + rand(-0.3, 0.3), rand(0.6, 1.1), 0.18, 0.9, 0.55, 0.55, 0.57, 0.28, 0.6, -0.2, 0.05);
      }
      if (v.burnt) { if (Math.random() < 0.3) this.smoke.emit(v.pos.x + rand(-0.5, 0.5), v.pos.y + 1.2, v.pos.z + rand(-0.5, 0.5), rand(-0.3, 0.3), rand(1.5, 2.5), rand(-0.3, 0.3), rand(3, 5), 0.8, 4, 0.08, 0.08, 0.08, 0.5, 0.6, -0.3, 0.1); }
      else if (v.health < VEH_T.smoke) {
        // smoke: thin and pale at first, darker and heavier through heavy damage, flames when critical
        if (v.health <= VEH_T.heavy && v.speed > 12 && Math.random() < dt * 6) this.sparks(v.pos.x - fx * v.spec.l * 0.45, v.pos.y + 0.15, v.pos.z - fz * v.spec.l * 0.45, 3, -fx, -fz);
        const dark = v.health < VEH_T.critical ? 0.12 : v.health < VEH_T.heavy ? 0.32 : 0.68;
        const rate = v.health < VEH_T.heavy ? 30 : 14;
        if (Math.random() < dt * rate) this.smoke.emit(hx, hy, hz, rand(-0.3, 0.3) - v.vel.x * 0.2, rand(1, 2), rand(-0.3, 0.3) - v.vel.y * 0.2, rand(1.2, 2.2), v.health < VEH_T.heavy ? 0.4 : 0.26, 2.5, dark, dark, dark, 0.45, 1, -0.4, 0.1);
        if ((v.health <= 0 || (v.health < VEH_T.critical && Math.random() < 0.35)) && Math.random() < dt * (v.health <= 0 ? 40 : 10)) this.glow.emit(hx + rand(-0.4, 0.4), hy, hz + rand(-0.4, 0.4), rand(-0.4, 0.4), rand(1.5, 3), rand(-0.4, 0.4), rand(0.4, 0.8), 0.7, 0.2, 1, 0.5, 0.12, 1, 1, -1);
      }
      // tyre spray: wet roads throw a fine mist behind fast cars
      if (g.env.wet > 0.35 && v.speed > 9 && !v.airborne && Math.random() < dt * 22 * g.env.wet && dist2(v.pos.x, v.pos.z, g.cam.pos.x, g.cam.pos.z) < 70 * 70) {
        const c = Math.cos(v.h), sn = Math.sin(v.h);
        for (let i = 2; i < 4; i++) { const [lx, lz] = v.vg.wheels[i]; const wx = v.pos.x + lx * c + lz * sn, wz = v.pos.z - lx * sn + lz * c;
          this.smoke.emit(wx, v.pos.y + 0.15, wz, -v.vel.x * 0.25 + rand(-0.6, 0.6), rand(0.4, 1.2), -v.vel.y * 0.25 + rand(-0.6, 0.6), rand(0.5, 0.9), 0.25, 1.4 + v.speed * 0.03, 0.75, 0.78, 0.82, 0.22 * g.env.wet, 0.8, 0.3, 0.1); }
      }
      if (v.skid > 0.05 && v.pos.y < 0.5 && !v.sleep) {
        const c = Math.cos(v.h), s = Math.sin(v.h);
        for (let i = 2; i < 4; i++) {
          const [lx, lz] = v.vg.wheels[i];
          const wx = v.pos.x + lx * c + lz * s, wz = v.pos.z - lx * s + lz * c;
          if (Math.random() < v.skid * dt * 40) this.tireSmoke(wx, v.pos.y, wz, v.skid);
          this.skidMark(v.id * 4 + i, wx, wz, groundY(wx, wz), v.h);
        }
        if (v.skid > 0.4) for (let i = 0; i < 2; i++) { const [lx, lz] = v.vg.wheels[i]; const wx = v.pos.x + lx * c + lz * s, wz = v.pos.z - lx * s + lz * c; this.skidMark(v.id * 4 + i, wx, wz, groundY(wx, wz), v.h); }
      }
    }
    // debris
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]; d.t -= dt;
      const m = d.m;
      d.vy -= GRAVITY * dt; m.position.x += d.vx * dt; m.position.y += d.vy * dt; m.position.z += d.vz * dt;
      m.rotation.x += d.ax * dt; m.rotation.z += d.az * dt;
      const gy = groundY(m.position.x, m.position.z);
      if (m.position.y < gy) { m.position.y = gy; d.vy = -d.vy * 0.3; d.vx *= 0.6; d.vz *= 0.6; d.ax *= 0.5; d.az *= 0.5; }
      if (d.t < 1) m.scale.setScalar(Math.max(0.01, d.t));
      if (d.t <= 0) { this.game.scene.remove(m); this.debris.splice(i, 1); }
    }
    // tracers
    const T = this.tracerPos; let tn = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) { const tr = this.tracers[i]; tr.t -= dt; if (tr.t <= 0) this.tracers.splice(i, 1); }
    for (const tr of this.tracers) { T.set(tr.a, tn * 6); T.set(tr.b, tn * 6 + 3); tn++; }
    this.tracerGeo.setDrawRange(0, tn * 2); this.tracerGeo.attributes.position.needsUpdate = true;
    // muzzle & light
    if (this.muzzleT > 0) { this.muzzleT -= dt; if (this.muzzleT <= 0) this.muzzle.visible = false; }
    if (this.lightT > 0) { this.lightT -= dt; this.light.intensity = this.lightMax * Math.max(0, this.lightT / this.lightDur); if (this.lightT <= 0) { this.light.intensity = 0; this.lightMax = 0; } }
    this.smoke.update(dt); this.glow.update(dt);
    const scale = g.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(g.camera.fov) / 2));
    this.smoke.mat.uniforms.uScale.value = scale; this.glow.mat.uniforms.uScale.value = scale;
  }
}

