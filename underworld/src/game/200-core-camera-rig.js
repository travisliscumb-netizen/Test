/* =====================================================================
   [CORE] CAMERA RIG (third person, collision-aware, shake, speed FOV, modes)
   ===================================================================== */
// on-foot pace (v6): sprint 25% faster and twice as long, quicker recovery
const SPRINT_SPEED = 9.2, STAMINA_DRAIN = 0.1, STAMINA_REGEN = 0.22, STAMINA_REGEN_STILL = 0.32;
class CameraRig {
  constructor(camera, game) {
    this.cam = camera; this.game = game;
    this.yaw = 0; this.pitch = -0.18; this.dist = 4.6; this.mode = 0;
    this.trauma = 0; this.fov = 70; this.pos = new THREE.Vector3(); this.target = new THREE.Vector3();
    this.smTarget = new THREE.Vector3(); this.recoilP = 0; this.recoilY = 0; this.recRate = 10; this.gunK = 0; this.init = false; this.time = 0;
    this.cine = 0;
  }
  // snap behind a new heading and clear every spring/shake/lag accumulator
  reset(yaw) {
    if (yaw !== undefined && isFinite(yaw)) this.yaw = yaw;
    this.pitch = -0.12; this.init = false; this.trauma = 0; this.recoilP = 0; this.recoilY = 0; this.gunK = 0; this.wasGun = false; this.levelT = 0;
    this.landV = 0; this.landY = 0; this.aSm = 0; this.trail = 0; this.prevFwd = undefined;
    this.occOk = false; this.occT = 0; this.autoYaw = 0; this.ffT = 0; this.ffHead = undefined;
    this.fov = this.game.save.settings.fov; this.cam.fov = this.fov; this.cam.rotation.z = 0; this.cam.updateProjectionMatrix();
  }
  shake(a) { this.trauma = Math.min(1, this.trauma + a); }
  land(k) { this.landV = (this.landV || 0) - k * 3.2; this.shake(k * 0.25); }
  // recoil is an offset on top of the aim: it kicks the view up (and a little sideways) and the
  // aim recovers back to where the player was pointing; it never walks the aim into the ground
  kick(up, side, recover) { this.recoilP = Math.min(0.22, this.recoilP + up); this.recoilY = clamp(this.recoilY + side, -0.08, 0.08); this.recRate = recover || 10; }
  look(dt) {
    const g = this.game, l = g.input.consumeLook(), p = g.player;
    if (l.x || l.y) { this.lookFrame = g.frame; this.lookAge = 0; } else this.lookAge = (this.lookAge || 0) + dt;
    // ADS lowers sensitivity; aim-assist friction lowers it a little more over a target
    const adsK = p.state === 'foot' && p.ads ? 0.62 : 1;
    const sens = g.save.settings.sens * 0.0024 * adsK * (g.combat && g.combat.lookMul !== undefined ? g.combat.lookMul : 1);
    this.yaw -= l.x * sens;
    this.pitch -= l.y * sens * (g.save.settings.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.25, 0.75);
    const rk = 1 - Math.exp(-this.recRate * dt);
    this.recoilP -= this.recoilP * rk; this.recoilY -= this.recoilY * rk;
    if (Math.abs(this.recoilP) < 1e-4) this.recoilP = 0; if (Math.abs(this.recoilY) < 1e-4) this.recoilY = 0;
  }
  update(dt) {
    const g = this.game, p = g.player;
    this.time += dt;
    this.look(dt);
    let target = _v3a, dist, fovAdd = 0, sideOff = 0;
    const v = p.state === 'vehicle' || p.state === 'exiting' ? p.vehicle : null;
    if (v) {
      target.set(v.pos.x, v.pos.y + v.spec.camH, v.pos.z);
      dist = this.mode === 1 ? v.spec.camDist * 0.7 : v.spec.camDist;
      const sp = v.speed;
      dist += clamp(sp * 0.035, 0, 2.2);
      fovAdd = clamp((sp - 10) * 0.32, 0, 16);
      // acceleration lag / brake push-in and a slight trail into turns
      const fwdV = v.localVel().z;
      const aL = dt > 0 ? (fwdV - (this.prevFwd ?? fwdV)) / dt : 0; this.prevFwd = fwdV;
      this.aSm = damp(this.aSm || 0, clamp(aL, -25, 25), 4, dt);
      dist += clamp(this.aSm * 0.06, -0.8, 0.9);
      this.trail = damp(this.trail || 0, clamp(-v.yawRate * Math.min(sp, 25) * 0.035, -0.9, 0.9), 3, dt);
      sideOff = this.trail;
      if (v.airborne) fovAdd += 4;
      const idle = performance.now() - g.input.lastLookInput > 1300;
      // reverse: after ~0.45 s of sustained reversing above walking pace the camera eases round
      // to look out of the back window; it never flips instantly and eases back when driving on
      const fwdR = v.localVel().z;
      if (fwdR < -3 && v.reversing) this.revT = Math.min(2, (this.revT || 0) + dt); else this.revT = Math.max(0, (this.revT || 0) - dt * 2.5);
      const lookBack = g.input.isDown('lookback');
      if (lookBack) { this.yaw = dampAngle(this.yaw, v.h + Math.PI, 14, dt); this.lookBackT = 0.3; }
      else if ((this.lookBackT = Math.max(0, (this.lookBackT || 0) - dt)) > 0) this.yaw = dampAngle(this.yaw, v.h, 10, dt);
      // latched so a brief slow-down while backing up never swings the view back and forth
      if (this.revT > 0.45) this.revCam = true;
      else if (this.revCam && (this.revT <= 0 || fwdR > 1.5)) { this.revCam = false; this.revBack = true; }
      // the player taking the camera with the mouse / stick cancels the automatic return
      if (this.revBack && performance.now() - g.input.lastLookInput < 300) this.revBack = false;
      // the return swing also runs at a standstill so the view never stays stuck facing backwards
      if (!lookBack && this.lookBackT <= 0 && (idle || this.revCam || this.revBack) && (Math.abs(sp) > 2 || this.revBack)) {
        const rev = this.revCam, want = rev ? v.h + Math.PI : v.h;
        // eased swing with a capped turn rate (never more than ~125°/s), ramping in over the first second
        const d = wrapPi(want - this.yaw), maxRate = rev ? 2.2 * (smoothstep(0.45, 1.3, this.revT) * 0.85 + 0.15) : this.revBack ? 2.2 : 3.0;
        this.yaw += clamp(d * (1 - Math.exp(-(rev ? 2.4 : 2.6) * dt)), -maxRate * dt, maxRate * dt);
        this.pitch = damp(this.pitch, rev ? -0.24 : -0.16, 2, dt);
        if (this.revBack && Math.abs(d) < 0.06) this.revBack = false;
      }
      if (this.revCam) dist -= Math.min(1.2, this.revT * 0.6);
      this.smTarget.lerp(target, this.init ? 1 - Math.exp(-14 * dt) : 1);
    } else {
      // gun stance: over the right shoulder, a little closer, so the crosshair is never behind the player
      const gun = p.state === 'foot' && !p.wep.melee;
      this.gunK = damp(this.gunK || 0, gun ? 1 : 0, 8, dt);
      if (gun && !this.wasGun) this.levelT = 0.45;
      this.wasGun = gun;
      target.set(p.pos.x, p.pos.y + 1.55 + 0.05 * this.gunK, p.pos.z);
      dist = this.mode === 1 ? 3.0 : lerp(4.4, 3.5, this.gunK);
      if (p.interior) dist = Math.min(dist, 3.0);
      sideOff = 0.5 * this.gunK;
      if (p.aim > 0.01) { dist = lerp(dist, 2.1, p.aim); sideOff = lerp(sideOff, 0.66, p.aim); fovAdd = -14 * p.aim; }
      // drawing a gun while the camera stares at the pavement: ease the view up to a level aim,
      // unless the player is steering the camera themselves
      // (it used to stop at -0.1, which still put the crosshair on the pavement ~13 m out: every shot hit the ground)
      const lookIdle = performance.now() - g.input.lastLookInput;
      if (this.levelT > 0) {
        this.levelT -= dt;
        if (lookIdle > 600 && this.pitch < -0.03) this.pitch = damp(this.pitch, -0.02, 9, dt);
      } else if (gun && p.aim < 0.01 && lookIdle > 2000 && this.pitch < -0.14 && !(g.combat && g.combat.assist)) {
        // a gun held with the view resting on the ground and nobody under the reticle: drift slowly back up
        this.pitch = damp(this.pitch, -0.05, 1.5, dt);
      }
      const sp = Math.hypot(p.vel.x, p.vel.z);
      fovAdd += clamp((sp - 5) * 1.2, 0, 5);
      this.footFollow(dt, p, g);
      this.smTarget.lerp(target, this.init ? 1 - Math.exp(-20 * dt) : 1);
    }
    this.init = true;
    const ap = clamp(this.pitch + this.recoilP, -1.3, 0.85), ay = this.yaw + this.recoilY;
    const cp = Math.cos(ap), sp2 = Math.sin(ap);
    const dx = Math.sin(ay) * cp, dy = sp2, dz = Math.cos(ay) * cp;
    const t = this.smTarget;
    const rxv = -Math.cos(ay), rzv = Math.sin(ay);
    const ox = t.x + rxv * sideOff, oz = t.z + rzv * sideOff;
    if (this.mode === 2) {
      if (v) {
        const fx = Math.sin(v.h), fz = Math.cos(v.h);
        this.pos.set(v.pos.x + fx * v.spec.l * 0.08 - Math.cos(v.h) * 0.0, v.pos.y + v.spec.h * 0.86, v.pos.z + fz * v.spec.l * 0.08);
        const ly = v.h + wrapPi(this.yaw - v.h) * 0.0;
        this.cam.position.copy(this.pos);
        this.cam.lookAt(this.pos.x + Math.sin(ly) * 10, this.pos.y + Math.sin(this.pitch) * 10 - 0.6, this.pos.z + Math.cos(ly) * 10);
      } else {
        this.pos.set(p.pos.x + Math.sin(p.h) * 0.12, p.pos.y + 1.66, p.pos.z + Math.cos(p.h) * 0.12);
        this.cam.position.copy(this.pos);
        this.cam.lookAt(this.pos.x + dx * 10, this.pos.y + dy * 10, this.pos.z + dz * 10);
      }
    } else {
      // occlusion: a hard limit from a narrow fan of rays (the lens never ends up inside a wall, pole or tree)
      // and a soft limit from a wider fan that eases the camera in a little early, so thin things and corners
      // don't pop it in and out. Moving back out is damped, slower right after an obstruction.
      const hard = this.occlude(ox, t.y, oz, dx, dy, dz, dist, 0.2), soft = Math.min(hard, this.occlude(ox, t.y, oz, dx, dy, dz, dist, 0.5) + 0.25);
      const want = Math.min(dist, soft);
      if (want < dist - 0.05) this.occT = 0.7; else this.occT = Math.max(0, (this.occT || 0) - dt);
      if (this.occD === undefined || !this.occOk) { this.occD = want; this.occV = 0; }
      else if (want < this.occD) { this.occD = damp(this.occD, want, 16, dt); this.occV = 0; }
      else {
        // backing out: a critically damped spring (eases in and out), softer right after an obstruction
        const k = this.occT > 0 ? 3.2 : 4.5;
        this.occV = (this.occV || 0) + (k * k * (want - this.occD) - 2 * k * (this.occV || 0)) * dt;
        this.occD = Math.min(want, this.occD + this.occV * dt);
      }
      this.occOk = true;
      const d = Math.max(0.45, Math.min(this.occD, hard, dist));
      this.lastOcc = { dist, hard, soft, d };
      this.pos.set(ox - dx * d, t.y - dy * d, oz - dz * d);
      const gy = (p.interior && !v ? p.interior.floor + interiorLevel(p.interior, this.pos.x, this.pos.z, p.pos.y + 0.5) : groundY(this.pos.x, this.pos.z, (v ? v.pos.y : p.pos.y) + 1.5)) + 0.35;
      if (this.pos.y < gy) this.pos.y = gy;
      this.cam.position.copy(this.pos);
      // landing dip spring
      this.landV = (this.landV || 0) + (-(this.landY || 0) * 90 - (this.landV || 0) * 11) * dt;
      this.landY = (this.landY || 0) + this.landV * dt;
      this.cam.position.y += this.landY * 0.35;
      this.cam.lookAt(ox + dx * 4, t.y + dy * 4 + this.landY * 0.2, oz + dz * 4);
    }
    // shake
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma;
      const tt = this.time * 30;
      this.cam.position.x += (pvNoise(tt) - 0.5) * 0.5 * s;
      this.cam.position.y += (pvNoise(tt + 31) - 0.5) * 0.5 * s;
      this.cam.rotation.z += (pvNoise(tt + 77) - 0.5) * 0.08 * s;
      this.trauma = Math.max(0, this.trauma - dt * 1.4);
    }
    if (!(isFinite(this.cam.position.x) && isFinite(this.cam.position.y) && isFinite(this.cam.position.z))) { this.reset(this.yaw); this.cam.position.set(p.pos.x, p.pos.y + 3, p.pos.z - 4); }
    if (!isFinite(this.yaw)) this.yaw = 0;
    const fovT = clamp(g.save.settings.fov + fovAdd, 40, 115);
    this.fov = damp(this.fov, fovT, 4, dt);
    if (Math.abs(this.cam.fov - this.fov) > 0.01) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }
  forward(out) { const ap = this.pitch + this.recoilP, ay = this.yaw + this.recoilY, cp = Math.cos(ap); return out.set(Math.sin(ay) * cp, Math.sin(ap), Math.cos(ay) * cp); }
  // a cheap sphere cast: rays from the pivot to the camera position and to four points r around it
  // (camera right and up); returns how far back along the view ray the camera may sit
  occlude(ox, oy, oz, dx, dy, dz, dist, r) {
    const grid = this.game.world.grid;
    let rx = -dz, rz = dx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    // up perpendicular to the view ray: right × back
    const bx = -dx, by = -dy, bz = -dz, ux = -rz * by, uy = rz * bx - rx * bz, uz = rx * by;
    const ul = Math.hypot(ux, uy, uz) || 1;
    let best = dist;
    for (const [a, b] of _OCC_FAN) {
      const ex = bx * dist + rx * r * a + ux / ul * r * b, ey = by * dist + uy / ul * r * b, ez = bz * dist + rz * r * a + uz / ul * r * b;
      const L = Math.hypot(ex, ey, ez); if (L < 1e-4) continue;
      const hit = grid.raycast(ox, oy, oz, ex / L, ey / L, ez / L, L + 0.3, 0.35, true);
      if (hit) best = Math.min(best, Math.max(0, hit.t / L * dist - 0.3));
    }
    return best;
  }
  // on foot: once the character has held a new heading for a moment, ease the camera round behind it.
  // Tiny corrections are ignored; touching the camera stops it for a while; sprinting recentres sooner.
  footFollow(dt, p, g) {
    // (game time since the last camera input, so it behaves the same at any frame rate)
    const sp = Math.hypot(p.vel.x, p.vel.z), manual = (this.lookAge || 0) < 1.1;
    const ok = this.mode !== 2 && p.state === 'foot' && !p.aiming && !(p.aim > 0.05) && !p.blocking && !(p.attackT > 0) && !(p.dodgeT > 0) && sp > 1.2 && p.moveDir !== null && !manual && !g.ui.modal && g.state === 'playing';
    if (!ok) { this.ffT = 0; this.ffHead = undefined; return; }
    const head = Math.atan2(p.vel.x, p.vel.z);
    if (this.ffHead === undefined || Math.abs(wrapPi(head - this.ffHead)) > 0.3) { this.ffHead = head; this.ffT = 0; }
    else { this.ffHead += wrapPi(head - this.ffHead) * Math.min(1, dt * 4); this.ffT += dt; }
    const d = wrapPi(this.ffHead - this.yaw), big = Math.abs(d) > 2.2;
    if (Math.abs(d) < 0.12) return;
    const sprint = sp > 6.2, wait = (sprint ? 0.4 : 0.65) + (big ? 0.45 : 0);
    if (this.ffT < wait) return;
    const ramp = smoothstep(wait, wait + 0.7, this.ffT), cap = (sprint ? 2.4 : 1.5) * ramp;
    const step = clamp(d * (1 - Math.exp(-(sprint ? 2.6 : 1.7) * dt)), -cap * dt, cap * dt);
    this.yaw += step; this.autoYaw = (this.autoYaw || 0) + step; this.ffTurned = (this.ffTurned || 0) + Math.abs(step);
  }
  // the yaw the movement stick is read against: the camera's yaw minus what auto-follow has turned since this stick
  // direction was first held, so a camera easing round never steers the character into circles. A new stick
  // direction (or letting go) reads against the camera as it is now; turning the camera yourself always steers.
  moveYaw(mv) {
    const held = mv.mag > 0.3, ang = held ? Math.atan2(mv.x, mv.y) : 0;
    if (!held || this.mvAng === undefined || Math.abs(wrapPi(ang - this.mvAng)) > 0.45) this.autoYaw = 0;
    this.mvAng = held ? ang : undefined;
    return this.yaw - (this.autoYaw || 0);
  }
}
const _OCC_FAN = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
function pvNoise(t) { const i = Math.floor(t), f = t - i; const a = hash2i(i, 0, 3), b = hash2i(i + 1, 0, 3); const u = f * f * (3 - 2 * f); return a + (b - a) * u; }

