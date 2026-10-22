/* =====================================================================
   [CORE] VEHICLE
   ===================================================================== */
let VEH_ID = 1;
const LOD_D = 72; // metres: beyond this, cars draw their light LOD mesh
const VEH_DUR = 2; // durability factor: every car withstands about twice the punishment it used to
const BRAKE_K = 1.35; // service-brake strength over the old tables (~25% shorter stopping distance)
const LAT_G = 1.45;     // cornering grip in g per unit of spec grip (arcade: a little above a real road car)
const REV_DELAY = 0.4;  // a held brake at a standstill waits this long before it becomes reverse
const CAR_STEP = 0.6;   // the highest ledge a wheel rides up onto; anything taller is a wall, not ground
// suspension travel around the wheel's rest height (local y = wheelR): up into the arch / down (droop)
const SUSP_UP = 0.07, SUSP_DOWN = 0.22;
// health is a percentage (0-100). Damage thresholds, retuned for the doubled durability:
// light (scuffs) below 85, moderate (dents, loose panels) below 65, smoke below 45,
// heavy (dark smoke, sparks, power loss) below 28, critical (flames, misfires) below 12, destroyed at 0.
const VEH_T = { light: 85, moderate: 65, smoke: 45, heavy: 28, critical: 12 };
const VEH_STAGES = [[VEH_T.light, 'NORMAL', '#7fe08f'], [VEH_T.moderate, 'LIGHT DAMAGE', '#c8e07f'], [VEH_T.smoke, 'DAMAGED', '#ffd84d'], [VEH_T.heavy, 'SMOKING', '#ffb547'], [VEH_T.critical, 'HEAVILY DAMAGED', '#ff8a3d'], [0, 'CRITICAL', '#ff4d5e'], [-1e9, 'DESTROYED', '#8a1020']];
function vehStage(h) { for (const s of VEH_STAGES) if (h > s[0]) return s; return VEH_STAGES[VEH_STAGES.length - 1]; }
class Vehicle {
  constructor(vm, type) {
    this.vm = vm; this.type = type; this.spec = VEHICLES[type]; this.id = VEH_ID++;
    const vg = vehicleGeometry(type); this.vg = vg;
    this.mat = makeVehicleMaterial(vm.physical);
    this.mesh = new THREE.Mesh(vg.geo, this.mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.rotation.order = 'YXZ';
    this.mesh.matrixAutoUpdate = true;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector2();
    this.ctl = { throttle: 0, steer: 0, handbrake: false };
    this.circles = Math.max(2, Math.round(this.spec.l / this.spec.w));
  }
  reset(x, z, h, opts = {}) {
    const s = this.spec;
    this.pos.set(x, groundY(x, z, opts.y), z); this.h = h; this.vel.set(0, 0);
    if (opts.speed) { this.vel.set(Math.sin(h) * opts.speed, Math.cos(h) * opts.speed); }
    this.yawRate = 0; this.steer = 0; this.health = 100; this.fireT = 0; this.burnt = false; this.dead = false;
    this.pitch = 0; this.roll = 0; this.pv = 0; this.rv = 0; this.yOff = 0; this.yVel = 0; this.lastVf = 0;
    this.spin = 0; this.slip = 0; this.skid = 0; this.rpm = 0; this.gear = 1; this.reversing = false; this.braking = false;
    this.driver = opts.driver || null; this.ai = null; this.drive = null; this.mode = opts.kinematic ? 'kin' : 'phys';
    this.sleep = !!opts.parked; this.parked = !!opts.parked; this.touched = false; this.owner = null;
    this.siren = false; this.sirenPhase = Math.random() * 10; this.headOn = false; this.alarmT = 0;
    this.ctl.throttle = 0; this.ctl.steer = 0; this.ctl.handbrake = !!opts.parked;
    this.deformed = 0; this.smokeT = 0; this.mission = null; this.lastHitBy = null; this.honkT = 0;
    this.airborne = false; this.airT = 0; this.pitchG = 0; this.rollG = 0; this.pitchGV = 0; this.bodyOff = 0; this.bodyV = 0; this.planeOff = 0; this.slopeF = 0; this.hitT = 0; this.brakeP = 0; this.landT = 0; this.broken = 0;
    this._wy = this._wy || [0, 0, 0, 0]; this._wl = this._wl || [0, 0, 0, 0]; this.indL = 0; this.indR = 0; this.hazard = false; this.align = 0; this.owned = false; this.special = false;
    this._safe = null; this.recycle = false; this.tune = null; this.garageUid = 0; this.trackId = 0; this.locked = false; this.origin = null; this.rareFind = false; this.critical = false;
    this.fac = null; this.trunk = null; this.looted = false; this.rareOpp = 0; this.stolenBefore = false; this.legit = false; this.shotByPlayer = false; this.roadblock = false; this.joinT = 0; this.staffed = undefined; this.free = false; this.goldCar = false; this.dealer = null; this.homeBlock = undefined; this.patrol = false; this.revHold = 0;
    const col = opts.color !== undefined ? opts.color : pick(s.colors);
    this.mat.userData.u.uPaint.value.setHex(col);
    this.mat.userData.u.uPaint2.value.setHex(s.police ? 0xf4f6f7 : 0xffffff);
    this.mat.userData.u.uMisc.value.set(0, 0, 0, 0);
    this.restoreGeo();
    this.colorHex = col;
    this.setTier(opts.vtier || (opts.parked || opts.kinematic ? (beaterRoll(this.type, x, z, opts.beaterSeed) ? 'beater' : s.tier) : s.tier));
    this.syncMesh(0);
  }
  // back to the shared, undamaged mesh (a dented clone is disposed; the shared LOD never is)
  restoreGeo() {
    const gm = this.mesh.geometry;
    if (gm !== this.vg.geo && gm !== this.vg.lod) gm.dispose();
    this.mesh.geometry = this.vg.geo;
  }
  setTier(tier) {
    const L = TIER_LOOK[tier] || TIER_LOOK.common;
    this.vtier = tier; this.rim = L.rim;
    this.mat.userData.u.uFinish.value.set(L.flake, L.gloss, L.wear, L.rim);
  }
  get speed() { return Math.hypot(this.vel.x, this.vel.y); }
  get fx() { return Math.sin(this.h); } get fz() { return Math.cos(this.h); }
  localVel() { const fx = Math.sin(this.h), fz = Math.cos(this.h); return { z: this.vel.x * fx + this.vel.y * fz, x: this.vel.x * fz - this.vel.y * fx }; }
  toLocal(x, z) { const dx = x - this.pos.x, dz = z - this.pos.z, c = Math.cos(this.h), s = Math.sin(this.h); return { x: dx * c - dz * s, z: dx * s + dz * c }; }
  toWorld(lx, lz) { const c = Math.cos(this.h), s = Math.sin(this.h); return { x: this.pos.x + lx * c + lz * s, z: this.pos.z - lx * s + lz * c }; }
  circleCenters(out) {
    const n = this.circles, s = this.spec;
    const span = s.l - s.w; out.length = 0;
    for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : -span / 2 + span * i / (n - 1); out.push(this.toWorld(0, t)); }
    return out;
  }
  wake() { this.sleep = false; this.touched = true; }
  // every source of damage goes through here: cars take about half of what they used to
  // (VEH_DUR), so they survive roughly double the punishment; stages read health as a percentage
  hurt(n, src) {
    if (!(n > 0) || this.burnt) return 0;
    if (this.driver === 'player' && this.vm.game.debug.god) return 0;
    const d = n / (VEH_DUR * (this.spec.armorK || 1)); this.health -= d; return d;
  }
  step(dt, game) {
    const s = this.spec;
    if (this.sleep) return;
    if (this.hitT > 0) this.hitT -= dt;
    if (this.airborne) {
      // ballistic: no tyre forces, mild air drag. Spin from the launch dies away instead of
      // building up; a little air control (steer yaws the car slowly). Only a collision in the air
      // (hitT) can leave it spinning faster than that.
      this.vel.x *= 1 - 0.05 * dt; this.vel.y *= 1 - 0.05 * dt;
      const cap = this.hitT > 0 ? 4 : 1.2;
      this.yawRate = clamp(this.yawRate * Math.exp(-2.4 * dt) + clamp(this.ctl.steer, -1, 1) * 0.7 * dt, -cap, cap);
      this.h += this.yawRate * dt;
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.y * dt;
      this.steer = damp(this.steer, this.ctl.steer * s.steer, 9, dt);
      this.spin += (this.ctl.throttle * 30) * dt;
      this.slip = 0; this.skid = 0;
      return;
    }
    const fx = Math.sin(this.h), fz = Math.cos(this.h), rx = -fz, rz = fx;
    let vf = this.vel.x * fx + this.vel.y * fz, vl = this.vel.x * rx + this.vel.y * rz;
    const ctl = this.ctl;
    const disabled = this.burnt || this.health <= 0;
    const thr = disabled ? 0 : ctl.throttle;
    // damage stages (see VEH_STAGES): power fades as the car gets beaten up
    const hpK = this.health > VEH_T.smoke ? 1 : this.health > VEH_T.heavy ? 0.92 : this.health > VEH_T.critical ? 0.76 : 0.55;
    const isPlayer = this.driver === 'player';
    const tn = this.tune;
    let grip = s.grip * game.env.gripMul * (tn ? 1 + tn.grip * 0.06 : 1);
    if (this.health <= VEH_T.critical) grip *= 0.86; else if (this.health <= VEH_T.heavy) grip *= 0.95;
    const hb = ctl.handbrake || disabled;
    // speed-sensitive steering: a big lock for parking, alleys and three-point turns that fades
    // smoothly to the old high-speed angle (and a touch below it) so motorway driving stays calm
    const av = Math.abs(vf), lowLock = Math.min(s.steer * (s.lowLock || 1.38), 0.72);
    const hiLock = s.steer / (1 + av * 0.032);
    const maxSteer = lerp(lowLock, hiLock, smoothstep(2.5, 20, av));
    this.maxSteerNow = maxSteer;
    // the wheel turns quicker at parking speeds and when reversing
    this.steer = damp(this.steer, (ctl.steer + this.align) * maxSteer, av < 6 || vf < 0 ? 14 : 11, dt);
    // longitudinal
    let F = 0, brake = 0; this.braking = false; this.reversing = false;
    if (thr > 0.01) {
      if (vf < -0.6) { brake = s.brake * thr; this.braking = true; }
      else F = s.power * (tn ? 1 + tn.engine * 0.09 : 1) * hpK * thr * clamp(1 - Math.pow(Math.max(0, vf) / (s.vmax * (tn ? 1 + tn.engine * 0.035 : 1)), 2), 0, 1);
    } else if (thr < -0.01) {
      // moving forward: the pedal brakes first; reverse only engages once the car has (nearly) stopped
      if (vf > 0.6) { brake = s.brake * -thr; this.braking = true; this.revHold = 0; }
      else {
        this.revHold = (this.revHold || 0) + dt;
        const revMax = s.vmax * (s.rev || 0.4) * (tn ? 1 + tn.engine * 0.02 : 1);
        // short clutch-in delay from a standstill so a held brake doesn't lurch straight backwards
        if (this.revHold > REV_DELAY || vf < -0.5) { F = s.power * 0.78 * hpK * thr * clamp(1 - Math.pow(Math.min(0, vf) / revMax, 2), 0, 1); this.reversing = true; }
        else { brake = s.brake * 0.6; this.braking = true; }
      }
    } else this.revHold = 0;
    // stronger service brakes (shorter stops), still ordered by class: sports > sedan > SUV > van > truck.
    // Pressure builds over ~0.15 s, so a tap scrubs speed and a held pedal stops hard.
    this.brakeP = this.braking ? Math.min(1, this.brakeP + dt / 0.15) : 0;
    if (brake > 0 && this.braking) brake *= BRAKE_K * (0.45 + 0.55 * this.brakeP);
    // a critically damaged engine misfires: short power cuts under throttle
    if (this.health < VEH_T.critical && !disabled) { this.misT = (this.misT || 0) - dt; if (this.misT < -0.6 && thr > 0.3 && Math.random() < dt * 1.2) this.misT = 0.28; if (this.misT > 0) F *= 0.12; }
    if (tn && brake > 0) brake *= 1 + tn.brakes * 0.14;
    if (hb) { brake = Math.max(brake, s.brake * (disabled ? 0.8 : 0.55)); }
    let acc = F / s.mass;
    // gravity along a slope (uphill slows you, a car left in neutral rolls back down)
    const gSlope = 9.81 * clamp(this.slopeF || 0, -0.5, 0.5);
    // traction limit: excess power turns into wheelspin instead of acceleration
    const tractionCap = grip * 9.81 * 0.92;
    let spin = false;
    if (acc > tractionCap) { spin = acc > tractionCap * 1.08 && vf < 22; acc = tractionCap; }
    acc -= 0.00042 * vf * Math.abs(vf);
    acc -= gSlope;
    vf += acc * dt;
    const decel = brake + (Math.abs(thr) < 0.01 ? 1.0 : 0) + 0.12;
    if (Math.abs(vf) <= decel * dt) vf = 0; else vf -= Math.sign(vf) * decel * dt;
    // weight transfer: braking loads the nose (sharper turn-in, a lighter tail), accelerating loads the tail
    const wtT = clamp(-(this.aLongSm || 0) / 14.7, -0.35, 0.45);
    this.wt = damp(this.wt || 0, wtT, 8, dt);
    // yaw
    const wb = s.l * 0.6;
    let yawT = vf * Math.tan(this.steer) / wb * (1 + this.wt * 0.2);
    const maxLat = grip * 9.81 * LAT_G;
    // the yaw a tyre can sustain is limited by the car's whole speed (not just its forward part,
    // which shrinks in a slide and used to let the yaw run away into a spin) and sits just under
    // the lateral grip, so a car at the limit runs a little wide instead of swapping ends
    const spd = Math.hypot(vf, vl);
    if (!hb) { const lim = maxLat * 0.94 * (1 + Math.max(0, this.wt) * 0.06) / Math.max(1, spd); yawT = clamp(yawT, -lim, lim); }
    else yawT *= 1.5;
    this.yawRate = damp(this.yawRate, yawT, hb ? 3.2 : (vf < 0 ? 11 : 9) * grip, dt);
    // lateral grip
    // power oversteer: hard throttle unloads the rear tyres (strongest on the muscle car)
    const powerSlide = thr > 0.5 && vf > 6 ? 1 - (s.drift || 0) * thr * clamp(Math.abs(this.steer) / maxSteer, 0, 1) : 1;
    if (powerSlide < 1) this.yawRate += Math.sign(this.steer) * (1 - powerSlide) * 1.6 * dt;
    const latCap = maxLat * (hb ? 0.32 : 1) * (Math.abs(vf) < 3 ? 2 : 1) * powerSlide * (1 - Math.max(0, this.wt) * 0.06);
    const want = -vl * Math.min(1, 16 * dt);
    vl += clamp(want, -latCap * dt, latCap * dt);
    const burn = (spin || (thr > 0.85 && vf < 6 && vf >= 0 && s.power / s.mass > 8)) && !hb;
    this.slip = Math.abs(vl) + (hb && Math.abs(vf) > 6 ? Math.abs(vf) * 0.3 : 0) + (burn ? 5 : 0);
    this.skid = clamp((this.slip - 2.2) / 6, 0, 1);
    this.vel.x = fx * vf + rx * vl; this.vel.y = fz * vf + rz * vl;
    this.h += this.yawRate * dt;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.y * dt;
    // suspension dynamics
    const aLong = (vf - this.lastVf) / Math.max(dt, 1e-4); this.lastVf = vf;
    this.aLongSm = damp(this.aLongSm || 0, clamp(aLong, -40, 40), 10, dt);
    const aLat = vf * this.yawRate;
    const pT = clamp(-aLong * 0.0065 * s.soft, -0.09, 0.09), rT = clamp(aLat * 0.0085 * s.soft, -0.1, 0.1);
    this.pv += ((pT - this.pitch) * 140 - this.pv * 13) * dt; this.pitch += this.pv * dt;
    this.rv += ((rT - this.roll) * 120 - this.rv * 11) * dt; this.roll += this.rv * dt;
    this.spin += vf * dt / s.wheelR;
    // engine sim
    const ratio = clamp(Math.abs(vf) / s.vmax, 0, 1);
    const g = Math.min(5, Math.floor(ratio * 5.2) + 1);
    this.gear = this.reversing ? -1 : g;
    const inGear = ratio * 5.2 - (g - 1);
    this.rpm = damp(this.rpm, clamp(0.18 + inGear * 0.7 + Math.abs(thr) * 0.15 + (burn ? 0.4 : 0), 0.15, 1), 8, dt);
    if (Math.abs(vf) < 0.05 && Math.abs(vl) < 0.05 && Math.abs(thr) < 0.01 && !isPlayer && this.driver === null && this.health > 0) {
      this.restT = (this.restT || 0) + dt; if (this.restT > 3) { this.sleep = true; this.vel.set(0, 0); this.yawRate = 0; }
    } else this.restT = 0;
  }
  // wheel ground heights: a wheel only rides up CAR_STEP (a kerb, a ramp lip), anything taller is a wall
  _sampleWheels(ref) {
    const W = this.vg.wheels, c = Math.cos(this.h), sn = Math.sin(this.h), wy = this._wy;
    for (let i = 0; i < 4; i++) { const lx = W[i][0], lz = W[i][1]; wy[i] = groundY(this.pos.x + lx * c + lz * sn, this.pos.z - lx * sn + lz * c, ref, CAR_STEP); }
    return wy;
  }
  // Vertical physics: ground contact, ramps, decks, launches, flight and landings. Driven cars run it
  // in the physics update (every substep); kinematic traffic and placement go through syncMesh().
  // pos.y is the ground level under the car's centre while it is on the ground. The chassis attitude
  // (pitchG / rollG) comes from the four wheel contacts; the body adds a small cosmetic spring
  // (bodyOff) and weight-transfer tilt on top, and the wheels are drawn at their contact points but
  // never further than the suspension travel from their arches (see VehicleManager.render).
  ground(dt) {
    const W = this.vg.wheels, wbase = W[0][1] - W[2][1], track = W[0][0] - W[1][0];
    const ref = this.pos.y;
    const h = this._sampleWheels(ref);
    // the surface under the centre and its slope: the car's centre follows exactly this
    const gc = groundY(this.pos.x, this.pos.z, ref, CAR_STEP), gx = SURF.gx, gz = SURF.gz;
    const c = Math.cos(this.h), sn = Math.sin(this.h);
    // a wheel more than half a metre off the plane of the centre's surface is hanging over a drop
    // (or the lip of a ramp): it takes the plane's height for the chassis attitude
    const sup = this._wl;
    for (let i = 0; i < 4; i++) {
      const lx = W[i][0], lz = W[i][1], p = gc + gx * (lx * c + lz * sn) + gz * (-lx * sn + lz * c);
      sup[i] = Math.abs(h[i] - p) < 0.5 ? h[i] : p;
    }
    const hf = (sup[0] + sup[1]) / 2, hr = (sup[2] + sup[3]) / 2, hl = (sup[0] + sup[2]) / 2, hrr = (sup[1] + sup[3]) / 2;
    const gPitch = Math.atan2(hr - hf, wbase), gRoll = Math.atan2(hl - hrr, track);
    // the slope the car is standing on along its heading (for gravity in step())
    this.slopeF = this.airborne ? 0 : gx * sn + gz * c;
    // where the four contacts put the body relative to the centre's ground: at a crease (the foot or
    // the head of a ramp) the plane through the wheels sits above or below the centre point
    const planeT = clamp((hf + hr) / 2 - gc, -0.35, 0.35);
    if (!(dt > 0)) { // placement: sit exactly on the ground
      this.pos.y = gc; this.airborne = false; this.yVel = 0; this.pitchG = gPitch; this.rollG = gRoll; this.pitchGV = 0; this.bodyOff = 0; this.bodyV = 0; this.planeOff = planeT;
      return;
    }
    if (this.mode !== 'phys') { // kinematic traffic: glued to the road
      this.pos.y = gc; this.airborne = false; this.yVel = 0;
      this.pitchG = damp(this.pitchG, gPitch, 14, dt); this.rollG = damp(this.rollG, gRoll, 14, dt); this.planeOff = damp(this.planeOff || 0, planeT, 14, dt);
      return;
    }
    // vertical speed of a car that follows the surface under it (exact on a ramp, 0 over a kerb step)
    const vyS = this.vel.x * gx + this.vel.y * gz;
    const wasAir = this.airborne;
    this.yVel -= GRAVITY * dt; this.pos.y += this.yVel * dt;
    if (this.pos.y <= gc) {
      // contact. The ground pushes the car up to the surface; a launch happens on its own when the
      // ground stops rising (ramp lip) or drops away (deck edge) and the car keeps its vertical speed
      const imp = Math.max(0, vyS - this.yVel);
      const step = gc - this.pos.y;
      if (!wasAir && step > 0.03) this.bodyOff -= Math.min(step, 0.3) * 0.6; // kerb: the springs take it
      this.pos.y = gc; this.yVel = vyS;
      if (wasAir) {
        this.airborne = false; this.landT = 0.25;
        this.bodyV -= Math.min(imp, 16) * 0.05;
        // the attitude snaps toward the landing surface through the spring, not instantly
        this.pitchGV += clamp((gPitch - this.pitchG) * 6, -6, 6);
        this.vm.onLand(this, imp, this.airT);
      }
    } else if (!wasAir && this.pos.y > gc + 0.2) {
      // the car left the ground: a ramp lip, a crest taken fast, a deck edge
      this.airborne = true; this.airT = 0;
      if (this.vm.onLaunch) this.vm.onLaunch(this);
    }
    if (this.airborne) {
      this.airT += dt;
      // the nose follows the arc (up off the lip, down as it falls); roll levels out
      const vf = Math.max(4, Math.abs(this.vel.x * sn + this.vel.y * c));
      const want = clamp(-Math.atan2(this.yVel, vf) * 0.7, -0.5, 0.55);
      this.pitchGV += ((want - this.pitchG) * 9 - this.pitchGV * 4.5) * dt;
      this.pitchG += this.pitchGV * dt;
      this.rollG = damp(this.rollG, 0, 1.6, dt);
    } else {
      // on (or settling onto) the ground: stiff, well-damped spring toward the contact plane
      this.pitchGV += ((gPitch - this.pitchG) * 900 - this.pitchGV * 58) * dt;
      this.pitchG += this.pitchGV * dt;
      if (Math.abs(this.pitchG - gPitch) > 0.6) { this.pitchG = gPitch; this.pitchGV = 0; }
      this.rollG = damp(this.rollG, gRoll, 16, dt);
      if (this.landT > 0) this.landT -= dt;
    }
    this.planeOff = this.airborne ? damp(this.planeOff || 0, 0, 6, dt) : damp(this.planeOff || 0, planeT, 22, dt);
    // cosmetic body bounce (kerbs, landings), kept inside the wheel-arch clearance
    this.bodyV += (-this.bodyOff * 260 - this.bodyV * 24) * dt;
    this.bodyOff = clamp(this.bodyOff + this.bodyV * dt, -0.09, 0.05);
    this.pitchG = clamp(this.pitchG, -0.9, 0.9);
  }
  // body transform from the physics state (render only; no simulation here)
  pose() {
    this.mesh.position.set(this.pos.x, this.pos.y + this.bodyOff + (this.planeOff || 0), this.pos.z);
    // weight transfer adds a little dive / squat and lean on top of the chassis attitude; small
    // enough that the arches always clear the tyres
    this.mesh.rotation.set(this.pitchG + clamp(this.pitch, -0.04, 0.04), this.h, this.rollG + clamp(this.roll, -0.055, 0.055) * (this.airborne ? 0.4 : 1));
  }
  syncMesh(dt) { this.ground(dt); this.pose(); }
  updateMaterial(night, t) {
    const u = this.mat.userData.u;
    const alive = !this.burnt;
    const head = alive && (this.driver || this.mode === 'kin') && this.headOn ? 1 : 0;
    u.uLights.value.set(head * (0.4 + night * 0.6), alive && (this.braking || (this.mode === 'kin' && this.aiBrake)) ? 1 : 0, alive && this.reversing ? 1 : 0, t + this.sirenPhase);
    u.uMisc.value.set(this.burnt ? 1 : 0, this.siren && alive ? 1 : 0, clamp(1 - this.health / 100, 0, 1), 0);
    const blink = Math.sin(t * 9.5) > 0 ? 1 : 0;
    const il = alive && (this.indL || this.hazard) ? blink : 0, ir = alive && (this.indR || this.hazard) ? blink : 0;
    u.uLights2.value.set(il, ir, this.broken, U.uWet.value);
  }
  deform(lx, lz, nx, nz, amount) {
    if (amount > 0.06) { const corner = (lz > 0 ? (lx > 0 ? 1 : 2) : (lx > 0 ? 4 : 8)); if (!(this.broken & corner) && Math.abs(lz) > this.spec.l * 0.3) { this.broken |= corner; if (this.vm.game.fx) this.vm.game.fx.glass(this.toWorld(lx, lz), this.pos.y + 0.6); } }
    if (amount > 0.12 && Math.random() < 0.35) this.align = clamp(this.align + (Math.random() - 0.5) * 0.12, -0.12, 0.12);
    if (this.deformed > 1.2) return;
    if (this.mesh.geometry === this.vg.geo || this.mesh.geometry === this.vg.lod) this.mesh.geometry = this.vg.geo.clone();
    const pos = this.mesh.geometry.attributes.position;
    const a = Math.min(0.22, amount);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const d = Math.hypot(x - lx, z - lz, (y - 0.7) * 0.6);
      if (d < 1.0) {
        const k = (1 - d) * a;
        pos.setXYZ(i, x - nx * k, y - k * 0.25, z - nz * k);
      }
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.deformed += a;
  }
}

