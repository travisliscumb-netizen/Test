/* =====================================================================
   [CORE] PLAYER
   ===================================================================== */
// Firearm feel (angles in radians, cone half-angles): hip / ADS / moving spread, bloom added per
// shot and its cap and decay, recoil kick (pitch up, random yaw) and how fast the aim recovers,
// reload time and the head multiplier. slot: the loadout slot (melee / secondary / primary).
const WEAPONS = [
  { id: 'fists', name: 'Fists', slot: 'melee', melee: true, range: 1.4, dmg: 14, rate: 0.42 },
  { id: 'bat', name: 'Bat', slot: 'melee', melee: true, range: 2.0, dmg: 40, rate: 0.62 },
  { id: 'pistol', name: 'Pistol', slot: 'secondary', range: 90, dmg: 26, rate: 0.24, mag: 12, hip: 0.024, ads: 0.006, move: 0.022, bloom: 0.012, bloomMax: 0.05, bloomRec: 0.09, recoil: 0.032, recoilYaw: 0.008, recover: 10, reload: 1.2, head: 1.6, sound: 'pistol', ammoName: 'pistol rounds' },
  { id: 'smg', name: 'Compact SMG', slot: 'primary', range: 70, dmg: 12, rate: 0.075, mag: 30, hip: 0.036, ads: 0.013, move: 0.03, bloom: 0.0055, bloomMax: 0.055, bloomRec: 0.12, recoil: 0.013, recoilYaw: 0.011, recover: 12, reload: 1.6, head: 1.5, auto: true, sound: 'smg', ammoName: 'SMG rounds' },
  { id: 'shotgun', name: 'Shotgun', slot: 'primary', range: 32, dmg: 11, rate: 0.85, mag: 6, hip: 0.07, ads: 0.05, move: 0.018, bloom: 0, bloomMax: 0, bloomRec: 1, recoil: 0.075, recoilYaw: 0.016, recover: 6, reload: 2.0, head: 1.25, pellets: 7, sound: 'shotgun', ammoName: 'shotgun shells' }
];
// Survivability scale: the starting player has 3x the old health pool (300). An ordinary NPC
// handgun body hit does 24-30, so about 10-12 hits kill from full health; vests are a separate
// 150-point layer that soaks most of each hit before health. Environmental damage scales with HP.
const HP_BASE = 300, HP_PER_LEVEL = 60, HP_SCALE = 3, VEST_MAX = 150, VEST_SOAK = 0.75;
const NPC_GUN = { pistol: [25, 29], smg: [12, 16], shotgun: [36, 54] };
function npcGunDamage(kind = 'pistol', d = 10) {
  const r = NPC_GUN[kind] || NPC_GUN.pistol;
  // shotgun falls off hard with distance; pistols and SMGs barely
  const fall = kind === 'shotgun' ? clamp(1.25 - d / 16, 0.25, 1.1) : clamp(1.08 - d / 160, 0.8, 1.05);
  return rand(r[0], r[1]) * fall;
}
class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.h = 0; this.onGround = true; this.state = 'foot';
    this.health = 100; this.stamina = 1; this.vehicle = null;
    this.look = { skin: C(0xd9a07a), hair: C(0x1a1410), shirt: C(0x26323f), pants: C(0x2b3448), shoes: C(0x151515), sleeve: true, hairStyle: 1, scale: 1, build: 1.05, cap: null };
    this.pose = { phase: 0, amp: 0 };
    this.char = { x: 0, y: 0, z: 0, h: 0, look: this.look, pose: this.pose, flash: 0 };
    this.weapon = 0; this.mag = { pistol: 0, smg: 0, shotgun: 0 };
    this.attackT = 0; this.reloadT = 0; this.aim = 0; this.swingT = 0; this.punchT = 0;
    this.stepPhase = 0; this.lastY = 0; this.airTime = 0; this.transT = 0; this.trans = null;
    this.regenDelay = 0; this.invuln = 0; this.hitCooldown = 0;
    this._res = {}; this.interior = null; this.vest = 0; this.boostT = 0;
  }
  // Reset every transient gameplay/animation value to a known-good default.
  // Persistent data (health upgrades, weapons owned, ammo, outfit) is untouched.
  resetTransient() {
    this.vel.set(0, 0, 0); this.onGround = true; this.trans = null; this.airTime = 0; this.lastY = this.pos.y;
    this.aim = 0; this.aiming = false; this.ads = false; this.raiseT = 0; this.bloom = 0; this.reloadW = null; this.attackT = 0; this.reloadT = 0; this.swingT = 0; this.punchT = 0; this.attackFacing = 0;
    this.invuln = 0; this.hitCooldown = 0; this.regenDelay = 0; this.boostT = 0;
    this.combo = 0; this.comboT = 0; this.lungeLeft = 0; this.lungeStop = false; this.attackH = null; this.blockH = null; this.blocking = false; this.dodgeT = 0; this.dodgeCD = 0;
    this.hitT = 0; this.knockT = 0; this.kickT = 0; this.heavyT = 0; this.moveKind = null; this.atkHold = 0; this.moveDir = null; this.hitDone = false;
    const ps = this.pose;
    for (const k of ['amp', 'crouch', 'surrender', 'down', 'downDir', 'lean', 'air', 'sit', 'twist', 'punch', 'swing', 'aim', 'aimPitch', 'headPitch', 'kick', 'block', 'heavy', 'hit', 'dodge', 'punchArm']) ps[k] = 0;
    ps.phone = false; ps.hold = null;
    this.char.flash = 0;
  }
  applyOutfit(o) {
    const l = this.look;
    l.shirt = C(o.shirt); l.pants = C(o.pants); l.shoes = C(o.shoes); l.hair = C(o.hair);
    l.cap = o.cap >= 0 ? C(o.cap) : null;
  }
  get maxHealth() { const fit = this.game.uw && this.game.uw.S ? (this.game.uw.S.fit | 0) : 0; return Math.round((HP_BASE + this.game.save.upgrades.health * HP_PER_LEVEL) * (1 + fit * 0.03)); }
  spawn(x, z, h = 0) {
    this.pos.set(x, groundY(x, z), z); this.h = h; this.state = 'foot'; this.vehicle = null;
    this.health = this.maxHealth; this.stamina = 1;
    this.resetTransient();
  }
  damage(amount, src) {
    if (this.state === 'dead' || this.game.debug.god || this.invuln > 0) return;
    // the vest is its own layer: it soaks most of each hit until its points run out
    let soaked = 0;
    if (this.vest > 0) { soaked = Math.min(this.vest, amount * VEST_SOAK); this.vest -= soaked; amount -= soaked; if (this.vest < 0.5) { this.vest = 0; this.game.ui.toast('Your vest is shot through.', 'warn'); } }
    this.health -= amount; this.regenDelay = 6;
    this.lastHurt = { amount, soaked, src, t: this.game.time };
    this.game.ui.hurtFlash(clamp((amount + soaked * 0.3) / (30 * HP_SCALE), 0.2, 1));
    if (amount > 4 * HP_SCALE || soaked > 6) this.game.audio.play('hurt', { gain: 0.6 });
    this.char.flash = 0.08;
    if (this.state === 'foot' && amount > 3 * HP_SCALE) {
      this.hitT = 0.3;
      // heavy blows knock the player off their feet (fall + get up); recovery is automatic
      if ((src === 'heavy' || src === 'vehicle') && amount > 10 * HP_SCALE && this.knockT <= 0 && this.health > 0) { this.knockT = 1.35; this.attackT = Math.max(this.attackT, 0.4); this.blocking = false; }
    }
    if (this.health <= 0) { this.health = 0; this.game.onPlayerDeath(src); }
  }
  // only what you carry can be drawn: a gun left in a stash stays there
  ownedWeapons() { const s = this.game.save, w = s.weapons, l = s.wloc || {}; return WEAPONS.filter(x => x.id === 'fists' || (w[x.id] && !l[x.id])); }
  carries(id) { const s = this.game.save; return id === 'fists' || (!!s.weapons[id] && !(s.wloc && s.wloc[id])); }
  cycleWeapon(dir) {
    const owned = this.ownedWeapons();
    let i = owned.findIndex(w => w === WEAPONS[this.weapon]);
    i = (i + dir + owned.length) % owned.length;
    this.weapon = WEAPONS.indexOf(owned[i]);
    this.game.audio.play('ui', { gain: 0.5 });
  }
  selectWeapon(idx) { const w = WEAPONS[idx]; if (w && this.carries(w.id)) { this.weapon = idx; this.game.audio.play('ui', { gain: 0.5 }); } }
  // the selected weapon, or fists if it has since been stashed, sold or confiscated
  get wep() { const w = WEAPONS[this.weapon]; return w && this.carries(w.id) ? w : WEAPONS[0]; }
  ammoOf(w) { return w.melee ? Infinity : (this.game.save.ammo[w.id] || 0); }
  updateFoot(dt) {
    const g = this.game, inp = g.input, cam = g.cam;
    const mv = g.state === 'playing' && !g.ui.modal ? inp.moveAxis() : { x: 0, y: 0, mag: 0 };
    const ry = this.aiming ? cam.yaw : cam.moveYaw(mv);
    const fx = Math.sin(ry), fz = Math.cos(ry);
    const rx = -fz, rz = fx;
    let dx = fx * mv.y + rx * mv.x, dz = fz * mv.y + rz * mv.x;
    const dl = Math.hypot(dx, dz); if (dl > 1e-4) { dx /= dl; dz /= dl; }
    const up = g.save.upgrades;
    // remembered for melee: the direction the player is currently pushing the stick / keys
    this.moveDir = mv.mag > 0.3 ? Math.atan2(dx, dz) : null;
    const wantSprint = inp.isDown('sprint') && mv.mag > 0.3 && this.stamina > 0.02 && !this.aiming && !this.blocking;
    const walking = inp.isDown('walk') || (mv.mag < 0.45 && !inp.usingTouch) || (inp.usingTouch && mv.mag < 0.4);
    // ADS is a steady strafe; hip fire keeps most of your pace so you can move, aim and shoot at once
    // sprint: 9.2 m/s base (it was 7.4) plus the stamina upgrade on top
    let speed = this.ads ? 2.6 : this.aiming ? (walking ? 1.8 : 3.9) : wantSprint ? SPRINT_SPEED + up.stamina * 0.3 : walking ? 1.8 : 4.4;
    if (this.blocking) speed = Math.min(speed, 1.6);
    if (this.attackT > 0 && this.wep.melee) speed *= 0.45;
    const stunned = this.knockT > 0;
    let tvx = dx * speed * (mv.mag > 0.05 ? 1 : 0), tvz = dz * speed * (mv.mag > 0.05 ? 1 : 0);
    if (stunned) { tvx = 0; tvz = 0; }
    let acc = this.onGround ? (mv.mag > 0.05 ? 16 : 22) : 3.5;
    if (this.dodgeT > 0) { this.dodgeT -= dt; tvx = Math.sin(this.dodgeH) * 7.8; tvz = Math.cos(this.dodgeH) * 7.8; acc = 40; }
    // melee step-in: covers an exact, capped distance and stops dead (no coasting past it)
    if (this.lungeStop) {
      this.lungeStop = false;
      const vm = Math.hypot(this.vel.x, this.vel.z), cap = mv.mag > 0.05 ? speed : 0;
      if (vm > cap) { const k = cap / vm; this.vel.x *= k; this.vel.z *= k; }
    }
    if (this.dodgeT > 0 || stunned) this.lungeLeft = 0;
    if (this.dodgeT <= 0 && this.lungeLeft > 0 && !stunned && dt > 0) {
      const step = Math.min(this.lungeLeft, this.lungeV * dt); this.lungeLeft -= step;
      tvx = Math.sin(this.attackH) * step / dt; tvz = Math.cos(this.attackH) * step / dt; acc = 1e4;
      if (this.lungeLeft <= 1e-4) { this.lungeLeft = 0; this.lungeStop = true; }
    }
    this.vel.x = damp(this.vel.x, tvx, acc, dt);
    this.vel.z = damp(this.vel.z, tvz, acc, dt);
    if (stunned) {
      this.knockT -= dt;
      this.pose.down = damp(this.pose.down || 0, this.knockT > 0.55 ? 1 : 0, this.knockT > 0.55 ? 10 : 5, dt);
      this.pose.downDir = -1;
      if (this.knockT <= 0) { this.knockT = 0; this.pose.down = 0; }
    }
    this.hitT = Math.max(0, (this.hitT || 0) - dt);
    if (this.boostT > 0) { this.boostT -= dt; this.stamina = Math.min(1, this.stamina + dt * 0.5); }
    // a full bar sprints for 10 s (twice what it did; upgrades and conditioning stretch it further) and refills
    // faster, fastest standing still
    const fit = g.uw && g.uw.S ? (g.uw.S.fit | 0) : 0;
    const gym = g.uw && g.uw.props ? g.uw.props.perk('stamina') : 0;
    if (wantSprint && this.boostT <= 0 && Math.hypot(this.vel.x, this.vel.z) > 5) this.stamina = Math.max(0, this.stamina - dt * (STAMINA_DRAIN / ((1 + up.stamina * 0.35) * (1 + fit * 0.04) * (1 + gym))));
    else this.stamina = Math.min(1, this.stamina + dt * (Math.hypot(this.vel.x, this.vel.z) < 0.5 ? STAMINA_REGEN_STILL : STAMINA_REGEN));
    // jump
    if (g.state === 'playing' && inp.pressed('jump') && this.onGround && !stunned && !this.blocking) { this.vel.y = 7.4; this.onGround = false; g.audio.play('jump', { gain: 0.5 }); }
    this.vel.y -= GRAVITY * dt;
    this.pos.x += this.vel.x * dt; this.pos.y += this.vel.y * dt; this.pos.z += this.vel.z * dt;
    this.collide();
    // facing
    const hs = Math.hypot(this.vel.x, this.vel.z);
    // Facing priority: aim direction > the heading locked in when the attack started > movement.
    // A melee attack never turns the player back toward the camera or any older heading.
    if (this.aiming) this.h = dampAngle(this.h, cam.yaw + (cam.recoilY || 0), 22, dt);
    else if (this.attackFacing > 0 && this.attackH !== null && this.attackH !== undefined) this.h = dampAngle(this.h, this.attackH, 28, dt);
    else if (this.blocking && this.blockH !== null && this.blockH !== undefined) this.h = dampAngle(this.h, this.blockH, 10, dt);
    else if (this.dodgeT > 0) { /* keep facing during a dodge */ }
    else if (hs > 0.4 && !stunned) this.h = dampAngle(this.h, Math.atan2(this.vel.x, this.vel.z), 12, dt);
    this.attackFacing = Math.max(0, (this.attackFacing || 0) - dt);
    // animation
    const stride = hs > 5 ? 2.3 : hs > 3 ? 1.9 : 1.25;
    const prev = this.pose.phase;
    this.pose.phase += hs / stride * Math.PI * dt;
    this.pose.amp = damp(this.pose.amp, this.onGround ? clamp(hs / 4.2, 0, 1.15) : 0.3, 10, dt);
    this.pose.lean = damp(this.pose.lean || 0, hs > 5 ? 0.22 : hs > 3 ? 0.1 : 0.02, 6, dt);
    this.pose.air = damp(this.pose.air || 0, this.onGround ? 0 : 1, 10, dt);
    if (this.onGround && hs > 0.8 && Math.floor(prev / Math.PI) !== Math.floor(this.pose.phase / Math.PI)) g.audio.footstep(this.pos.x, this.pos.z, hs > 5);
    g.save.stats.distFoot += hs * dt;
    this.regen(dt);
  }
  regen(dt) {
    this.regenDelay -= dt;
    if (this.regenDelay < 0 && this.health < this.maxHealth * 0.65 && this.game.police.level === 0) this.health = Math.min(this.maxHealth * 0.65, this.health + dt * 4 * HP_SCALE);
  }
  collide() {
    const g = this.game;
    const r = this.game.world.grid.resolveCircle(this.pos.x, this.pos.z, 0.34, this.pos.y + 0.35, this.pos.y + 1.7, this._res);
    if (r.hit) {
      this.pos.x = r.x; this.pos.z = r.z;
      const vn = this.vel.x * r.nx + this.vel.z * r.nz;
      if (vn < 0) { this.vel.x -= vn * r.nx; this.vel.z -= vn * r.nz; }
    }
    // vehicles: push out; stand on roofs (interiors have their own floor and no traffic)
    let gy = this.interior ? this.interior.floor + interiorLevel(this.interior, this.pos.x, this.pos.z, this.pos.y) : groundY(this.pos.x, this.pos.z, this.pos.y);
    if (!this.interior || this.interior.vspace) for (const v of g.vehicles.nearby(this.pos.x, this.pos.z, 6)) {
      if (Math.abs(v.pos.y - this.pos.y) > 3) continue; // a car on another level
      const lp = v.toLocal(this.pos.x, this.pos.z);
      const hw = v.spec.w / 2 + 0.3, hl = v.spec.l / 2 + 0.3;
      if (Math.abs(lp.x) < hw && Math.abs(lp.z) < hl) {
        const roof = v.pos.y + v.spec.h;
        if (this.pos.y > roof - 0.45) { gy = Math.max(gy, roof); continue; }
        const rel = Math.hypot(v.vel.x - this.vel.x, v.vel.z - this.vel.z);
        if (rel > 4.5 && v.speed > 4) { g.combat.vehicleHitsPlayer(v, rel); }
        const px = hw - Math.abs(lp.x), pz = hl - Math.abs(lp.z);
        if (px < pz) lp.x += Math.sign(lp.x || 1) * px; else lp.z += Math.sign(lp.z || 1) * pz;
        const w = v.toWorld(lp.x, lp.z); this.pos.x = w.x; this.pos.z = w.z;
      }
    }
    if (this.pos.y <= gy) {
      if (!this.onGround && this.vel.y < -12) { this.damage((-this.vel.y - 12) * 6 * HP_SCALE, 'fall'); g.audio.play('land'); }
      else if (!this.onGround && this.vel.y < -4) g.audio.play('land', { gain: 0.5 });
      this.pos.y = gy; this.vel.y = 0; this.onGround = true;
    } else if (this.pos.y > gy + 0.25) this.onGround = false;
    else if (this.vel.y <= 0) { this.pos.y = gy; this.vel.y = 0; this.onGround = true; }
    if (this.pos.y < -2.5 && !this.interior) { this.pos.y = -2.5; this.damage(1e5, 'drown'); }
  }
  syncChar() {
    const c = this.char; c.x = this.pos.x; c.y = this.pos.y; c.z = this.pos.z; c.h = this.h;
    const w = this.wep;
    const ps = this.pose;
    ps.hold = w.id === 'bat' ? 'bat' : w.id === 'pistol' ? 'gun' : (w.id === 'smg' || w.id === 'shotgun') ? 'gun2' : null;
    // the gun comes up whenever it is raised (hip fire or ADS), and points along the camera pitch
    ps.aim = w.melee ? this.aim : Math.max(this.aim, this.aiming ? 1 : 0, ps.aim ? ps.aim * 0.9 : 0);
    ps.aimPitch = clamp((this.game.cam.pitch + (this.game.cam.recoilP || 0)) * 0.9, -0.8, 0.8);
    ps.punch = this.punchT > 0 ? 1 - this.punchT / (this.punchDur || 0.3) : 0;
    ps.swing = this.swingT > 0 ? 1 - this.swingT / (this.swingDur || 0.45) : 0;
    ps.kick = this.kickT > 0 ? 1 - this.kickT / 0.45 : 0;
    ps.heavy = this.heavyT > 0 ? 1 - this.heavyT / 0.62 : 0;
    ps.block = damp(ps.block || 0, this.blocking ? 1 : 0, 16, 1 / 60);
    ps.hit = this.hitT > 0 ? this.hitT / 0.3 : 0;
    ps.dodge = this.dodgeT > 0 ? 1 : damp(ps.dodge || 0, 0, 10, 1 / 60);
    if (c.flash > 0) c.flash -= 1 / 60;
  }
}

