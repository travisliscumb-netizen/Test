/* =====================================================================
   [CORE] COMBAT (melee, hitscan firearms, auto-aim on touch, police fire)
   ===================================================================== */
class CombatSystem {
  constructor(game) { this.g = game; this.pendingHits = []; this._v = new THREE.Vector3(); this._d = new THREE.Vector3(); }
  muzzle(p) {
    const fx = Math.sin(p.h), fz = Math.cos(p.h), rx = -fz, rz = fx;
    return { x: p.pos.x + fx * 0.55 + rx * 0.24, y: p.pos.y + 1.38, z: p.pos.z + fz * 0.55 + rz * 0.24 };
  }
  update(dt) {
    const g = this.g, p = g.player, inp = g.input;
    p.attackT -= dt; p.punchT -= dt; p.swingT -= dt;
    for (let i = this.pendingHits.length - 1; i >= 0; i--) { const h = this.pendingHits[i]; h.t -= dt; if (h.t <= 0) { this.pendingHits.splice(i, 1); if (p.state === 'foot' && p.knockT <= 0) this.meleeHit(h.w, h.kind); } }
    const w = p.wep;
    this.lookMul = 1; this.assist = null;
    if (p.state !== 'foot' || g.state !== 'playing' || g.ui.modal || (p.interior && !p.interior.fight)) {
      p.aiming = false; p.ads = false; p.blocking = false; p.aim = damp(p.aim, 0, 12, dt); p.raiseT = 0;
      if (p.state !== 'foot') { inp.clearToggle('aim'); if (p.reloadT > 0) this.cancelReload(); }
      return;
    }
    const prevW = p.weapon;
    if (inp.pressed('weapon')) p.cycleWeapon(1);
    if (inp.wheel) p.cycleWeapon(inp.wheel > 0 ? 1 : -1);
    for (let k = 0; k < 5; k++) if (inp.pressed('w' + (k + 1))) p.selectWeapon(k);
    if (p.weapon !== prevW) this.onWeaponSwitch(prevW);
    const wep = p.wep, ranged = !wep.melee;
    if (!ranged) inp.clearToggle('aim');
    // ADS: right mouse / LB held, or the touch ADS toggle. Firing raises the gun (hip fire) without zooming.
    p.ads = ranged && inp.isDown('aim');
    p.raiseT = Math.max(0, (p.raiseT || 0) - dt);
    if (ranged && (inp.isDown('attack') || p.attackT > 0)) p.raiseT = 0.6;
    p.aiming = ranged && (p.ads || p.raiseT > 0);
    p.aim = damp(p.aim, p.ads ? 1 : 0, 12, dt);
    if (p.reloadT > 0) { p.reloadT -= dt; if (p.reloadT <= 0) this.finishReload(); }
    if (ranged) {
      // bloom settles back between shots
      p.bloom = Math.max(0, (p.bloom || 0) - (wep.bloomRec || 0.1) * dt);
      this.updateAssist(dt, wep);
      if ((inp.pressed('reload') || inp.pressed('radio')) && p.reloadT <= 0 && (p.mag[wep.id] || 0) < wep.mag && g.save.ammo[wep.id] > 0) this.reload(wep);
      // contextual melee with a gun out: a quick strike at whoever is in your face
      if ((inp.pressed('melee') || inp.pressed('kick') || inp.pressed('attack2')) && p.attackT <= 0.05 && p.knockT <= 0) { this.startMelee('kick', WEAPONS[0]); return; }
      const trig = wep.auto ? inp.isDown('attack') : inp.pressed('attack');
      if (trig && p.attackT <= 0 && p.reloadT <= 0) {
        if ((p.mag[wep.id] || 0) > 0) this.fire(wep);
        else if (g.save.ammo[wep.id] > 0) this.reload(wep);
        else if (inp.pressed('attack')) { g.audio.play('empty'); g.ui.toast(`Out of ${wep.ammoName} — buy more at the Armorer, or take some from a stash.`, 'warn'); p.attackT = 0.4; }
      }
    } else this.updateMelee(dt, wep);
  }
  onWeaponSwitch() {
    const p = this.g.player;
    if (p.reloadT > 0) this.cancelReload();
    p.bloom = 0; p.raiseT = 0;
  }
  // nearest crosshair-aligned target the aim assist may help with (never behind, never a friend)
  // returns { c, ang, cone, dist, pt } or null. o/dir: camera ray.
  assistCandidate(o, dir, w, skip) {
    const g = this.g, p = g.player;
    let best = null, bs = Infinity;
    for (const c of this.targets()) {
      if (c.state === 'down' || c.ko || c.friendly) continue;
      const tx = c.x - o.x, ty = c.y + 1.15 - o.y, tz = c.z - o.z;
      const along = tx * dir.x + ty * dir.y + tz * dir.z;
      if (along < skip + 0.3 || along > w.range + skip) continue; // in front of the camera AND past the player only
      const dist = Math.hypot(tx, ty, tz), ang = Math.acos(clamp(along / dist, -1, 1));
      const pd = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
      // the help cone: wide up close (a body fills the screen), narrow far away
      const cone = clamp(Math.atan2(1.15, pd), 0.026, 0.16);
      if (ang > cone) continue;
      const threat = (c.kind === 'cop' && g.police.level > 0) || (c.kind === 'gang' && c.group && c.group.hostile) || c.hostile;
      let score = ang / cone * (threat ? 0.55 : 1) * (c.kind === 'civ' ? 1.7 : 1) + pd / 300;
      if (score < bs) { bs = score; best = { c, ang, cone, dist: pd, pt: { x: c.x, y: c.y + 1.15, z: c.z } }; }
    }
    if (best && !g.world.grid.lineOfSight(o.x + dir.x * skip, o.y + dir.y * skip, o.z + dir.z * skip, best.pt.x, best.pt.y, best.pt.z)) return null;
    return best;
  }
  assistStrength() {
    const g = this.g, inp = g.input, lv = g.save.settings.aimAssist;
    if (!(inp.usingTouch || inp.gp.active)) return 0;
    return [0, 0.5, 1, 1.4][clamp(lv | 0, 0, 3)];
  }
  // restrained touch / pad aim assist: slowdown over a target, gentle drift toward the torso while
  // the player is actively aiming, moving or firing. Capped turn rate; nothing outside the cone.
  updateAssist(dt, w) {
    const g = this.g, p = g.player, inp = g.input, cam = g.camera;
    const k = this.assistStrength();
    const o = cam.position, dir = cam.getWorldDirection(this._d);
    const skip = this.skipDist(o, dir);
    const a = this.assistCandidate(o, dir, w, skip);
    this.assist = a;
    if (!a || k <= 0 || dt <= 0) return;
    const near = 1 - a.ang / a.cone; // 1 = dead centre
    const range = clamp(1.25 - a.dist / 60, 0.35, 1); // weaker at long range
    this.lookMul = 1 - clamp(0.55 * k * near * range, 0, 0.6);
    const active = g.frame - (g.cam.lookFrame ?? -99) < 15 || inp.moveAxis().mag > 0.2 || inp.isDown('attack');
    if (!active) return;
    // rotate the camera a little toward the torso point (yaw and pitch), never faster than ~18°/s
    const dx = a.pt.x - o.x, dy = a.pt.y - o.y, dz = a.pt.z - o.z, hz = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(dx, dz), wantPitch = Math.atan2(dy, hz);
    const cr = g.cam, maxR = 0.24 * k * range * dt;
    const dyaw = wrapPi(wantYaw - (cr.yaw + (cr.recoilY || 0))), dp = wantPitch - (cr.pitch + (cr.recoilP || 0));
    const pull = clamp(near * 0.6 + 0.25, 0, 1) * 3 * dt;
    cr.yaw += clamp(dyaw * pull, -maxR, maxR);
    cr.pitch += clamp(dp * pull, -maxR * 0.7, maxR * 0.7);
  }
  // how far along the camera ray the player stands: nothing closer than that can be shot
  skipDist(o, dir) {
    const p = this.g.player;
    const t = (p.pos.x - o.x) * dir.x + (p.pos.y + 1.3 - o.y) * dir.y + (p.pos.z - o.z) * dir.z;
    return Math.max(0, t + 0.45);
  }
  spreadOf(w) {
    const p = this.g.player;
    const mv = Math.hypot(p.vel.x, p.vel.z);
    let s = p.ads ? w.ads : w.hip;
    s += (w.move || 0) * clamp(mv / 4.4, 0, 1.4) * (p.ads ? 0.5 : 1);
    if (!p.onGround) s += w.hip * 0.8;
    return s + (p.bloom || 0);
  }
  // ---------------- melee: combos, heavy, kick, block, dodge ----------------
  // The attack heading is chosen at the moment the button is pressed, from (in order) the
  // movement input, a soft target inside a forward cone of that direction, or the current
  // facing. It is stored in p.attackH and is the only direction the player turns toward
  // and the only direction the hit is resolved along — there is no older heading to snap back to.
  pickMeleeHeading(range) {
    const g = this.g, p = g.player;
    const base = p.moveDir !== null && p.moveDir !== undefined ? p.moveDir : p.h;
    const fx = Math.sin(base), fz = Math.cos(base);
    let best = null, bs = Infinity;
    for (const c of this.targets()) {
      if (c.state === 'down' || c.friendly) continue;
      const dx = c.x - p.pos.x, dz = c.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > range + 1.4 || d < 0.05 || Math.abs(c.y - p.pos.y) > 1.2) continue;
      const dot = (dx * fx + dz * fz) / d;
      if (dot < 0.42) continue; // ~65° each side; never people behind the player
      let score = d * (2.2 - dot);
      if (c.hostile || c.state === 'chase') score *= 0.55;
      if (c.kind === 'civ') score *= 1.4;
      if (score < bs) { bs = score; best = c; }
    }
    this.meleeTarget = best;
    return best ? Math.atan2(best.x - p.pos.x, best.z - p.pos.z) : base;
  }
  startMelee(kind, w) {
    const g = this.g, p = g.player;
    const range = kind === 'kick' || kind === 'finisher' ? 1.7 : w.range;
    p.attackH = this.pickMeleeHeading(range);
    p.moveKind = kind; p.hitDone = false;
    const bat = w.id === 'bat';
    let dur, hitAt;
    if (kind === 'heavy') { dur = 0.75; hitAt = 0.34; p.heavyT = 0.62; p.stamina = Math.max(0, p.stamina - 0.12); }
    else if (kind === 'kick' || kind === 'finisher') { dur = 0.52; hitAt = 0.17; p.kickT = 0.45; }
    else if (bat) { dur = w.rate; hitAt = 0.2; p.swingT = p.swingDur = 0.45; }
    else { dur = 0.3; hitAt = 0.1; p.punchT = p.punchDur = 0.3; p.pose.punchArm = p.combo % 2 === 0 ? 1 : -1; }
    if (bat && kind === 'heavy') { p.heavyT = 0; p.swingT = p.swingDur = 0.6; }
    p.attackT = dur; p.attackFacing = dur;
    // step in: close the gap to a soft target that a previous hit shoved just out of reach
    p.lungeLeft = 0;
    const tg = this.meleeTarget;
    if (tg) { const gap = Math.hypot(tg.x - p.pos.x, tg.z - p.pos.z) - (range - 0.35); if (gap > 0.05) { p.lungeLeft = Math.min(gap, 0.85); p.lungeV = Math.min(7, p.lungeLeft / (hitAt + 0.05)); } }
    this.pendingHits.push({ t: hitAt, w, kind });
    g.audio.play('swing', { gain: kind === 'heavy' || bat ? 0.75 : 0.4 });
  }
  updateMelee(dt, w) {
    const g = this.g, p = g.player, inp = g.input;
    p.comboT -= dt; if (p.comboT <= 0) p.combo = 0;
    p.dodgeCD = Math.max(0, (p.dodgeCD || 0) - dt);
    p.punchT = Math.max(0, p.punchT); p.kickT = Math.max(0, (p.kickT || 0) - dt); p.heavyT = Math.max(0, (p.heavyT || 0) - dt);
    const busy = p.knockT > 0 || !p.onGround;
    const wantBlock = (inp.isDown('aim') || inp.isDown('block')) && !busy;
    if (wantBlock && !p.blocking) p.blockH = p.h;
    p.blocking = wantBlock && p.dodgeT <= 0 && p.attackT <= 0.05;
    // dodge: keyboard X / gamepad, or tapping BLOCK on touch while pushing the stick
    const touchDodge = inp.usingTouch && inp.pressed('block') && p.moveDir !== null && p.moveDir !== undefined;
    if ((inp.pressed('dodge') || touchDodge) && !busy && p.dodgeCD <= 0 && p.stamina > 0.15 && p.attackT <= 0.1) {
      p.dodgeH = p.moveDir !== null && p.moveDir !== undefined ? p.moveDir : p.h + Math.PI;
      p.dodgeT = 0.26; p.dodgeCD = 0.55; p.invuln = Math.max(p.invuln, 0.24); p.stamina -= 0.15; p.blocking = false;
      g.audio.play('jump', { gain: 0.35 });
      return;
    }
    // input buffer: a press during the tail of an attack chains into the next move
    p.queueT = Math.max(0, (p.queueT || 0) - dt);
    if (p.attackT > 0 && !inp.usingTouch) {
      if (inp.pressed('attack')) { p.queued = 'light'; p.queueT = 0.3; }
      else if (inp.pressed('attack2')) { p.queued = 'heavy'; p.queueT = 0.3; }
      else if (inp.pressed('kick')) { p.queued = 'kick'; p.queueT = 0.3; }
    }
    if (busy || p.blocking || p.dodgeT > 0 || p.attackT > 0) { if (!inp.isDown('attack')) p.atkHold = 0; return; }
    if (p.queueT > 0 && p.queued) { const q = p.queued; p.queued = null; p.queueT = 0; if (q === 'light') this.lightCombo(w); else this.startMelee(q, w); return; }
    if (inp.pressed('attack2')) { this.startMelee('heavy', w); return; }
    if (inp.pressed('kick')) { this.startMelee('kick', w); return; }
    if (inp.usingTouch) {
      // touch: tap = light, hold = heavy
      if (inp.isDown('attack')) { p.atkHold += dt; if (p.atkHold > 0.32 && !p.atkHeavyDone) { p.atkHeavyDone = true; this.startMelee('heavy', w); } return; }
      if (p.atkHold > 0 && !p.atkHeavyDone) { p.atkHold = 0; this.lightCombo(w); return; }
      p.atkHold = 0; p.atkHeavyDone = false;
    } else if (inp.pressed('attack')) this.lightCombo(w);
  }
  lightCombo(w) {
    const p = this.g.player;
    const step = p.comboT > 0 ? p.combo + 1 : 0;
    p.combo = step % 3; p.comboT = 0.75;
    this.startMelee(p.combo === 2 && w.id === 'fists' ? 'finisher' : 'light', w);
  }
  // the reload belongs to the weapon it started on: switching away cancels it
  reload(w) { const p = this.g.player; p.reloadT = w.reload || 1.2; p.reloadDur = p.reloadT; p.reloadW = w.id; this.g.audio.play('reload'); }
  cancelReload() { const p = this.g.player; p.reloadT = 0; p.reloadW = null; }
  finishReload() {
    const p = this.g.player, s = this.g.save, w = WEAPONS.find(x => x.id === p.reloadW);
    p.reloadW = null; p.reloadT = 0;
    if (!w || w.melee) return;
    const need = w.mag - (p.mag[w.id] || 0), take = Math.max(0, Math.min(need, s.ammo[w.id] | 0));
    p.mag[w.id] = (p.mag[w.id] || 0) + take; s.ammo[w.id] -= take;
  }
  targets() {
    const g = this.g, out = [];
    for (const c of g.peds.peds) if (c.state !== 'ko' && !c.ko && !c.friendly) out.push(c);
    return out;
  }
  // Firing: the shot goes where the crosshair is. The camera ray (screen centre, the exact view the
  // player saw last frame, plus spread and assist correction) is traced to find the aim point; the
  // bullet then leaves the muzzle toward that point, and a second trace from the muzzle catches
  // anything standing between the gun and the aim point. Never the gun mesh's own forward vector.
  aimPoint(o, dir, w, skip) {
    const sx = o.x + dir.x * skip, sy = o.y + dir.y * skip, sz = o.z + dir.z * skip;
    const hit = this.trace(sx, sy, sz, dir.x, dir.y, dir.z, w.range, 0.02);
    const t = skip + hit.t;
    return { x: o.x + dir.x * t, y: o.y + dir.y * t, z: o.z + dir.z * t, t, hit };
  }
  fire(w) {
    const g = this.g, p = g.player, cam = g.camera;
    p.attackT = w.rate; p.mag[w.id]--; p.attackFacing = 0.5; p.raiseT = 0.6;
    g.save.stats.shots++;
    const o = cam.position, base = cam.getWorldDirection(this._d).clone();
    const skip = this.skipDist(o, base);
    // turn to the aim at once (no shooting out of the side of your head after a fast camera turn)
    const aim0 = this.aimPoint(o, base, w, skip);
    const want = Math.atan2(aim0.x - p.pos.x, aim0.z - p.pos.z);
    if (Math.abs(wrapPi(want - p.h)) > 0.35) p.h = want; else p.h = dampAngle(p.h, want, 30, 1 / 60);
    const m = this.muzzle(p);
    // bullet magnetism: a small bend toward a torso that is already almost under the crosshair
    const k = this.assistStrength(), a = this.assist;
    if (k > 0 && a && a.ang < a.cone * 0.55) {
      const tx = a.pt.x - o.x, ty = a.pt.y - o.y, tz = a.pt.z - o.z, tl = Math.hypot(tx, ty, tz);
      const f = clamp(0.55 * k, 0, 0.85);
      base.set(base.x + (tx / tl - base.x) * f, base.y + (ty / tl - base.y) * f, base.z + (tz / tl - base.z) * f).normalize();
    }
    const sp = this.spreadOf(w);
    g.fx.muzzleFlash(m.x + Math.sin(p.h) * 0.15, m.y, m.z + Math.cos(p.h) * 0.15);
    g.audio.play(w.sound, { gain: 0.9 });
    g.cam.kick(w.recoil * (p.ads ? 0.7 : 1), (Math.random() - 0.5) * 2 * w.recoilYaw, w.recover);
    g.cam.shake(w.pellets ? 0.1 : 0.025);
    p.bloom = Math.min(w.bloomMax || 0, (p.bloom || 0) + (w.bloom || 0));
    let marked = false, killed = false;
    const d = this._d2 || (this._d2 = new THREE.Vector3()), up = this._up || (this._up = new THREE.Vector3()), rt = this._rt || (this._rt = new THREE.Vector3());
    rt.set(base.z, 0, -base.x).normalize(); if (rt.lengthSq() < 0.5) rt.set(1, 0, 0);
    up.crossVectors(rt, base).normalize();
    for (let n = 0; n < (w.pellets || 1); n++) {
      // a uniform point inside the spread cone
      const r = sp * Math.sqrt(Math.random()), th = Math.random() * Math.PI * 2;
      d.copy(base).addScaledVector(rt, Math.cos(th) * r).addScaledVector(up, Math.sin(th) * r).normalize();
      const ap = this.aimPoint(o, d, w, skip);
      let dx = ap.x - m.x, dy = ap.y - m.y, dz = ap.z - m.z; const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
      // from the muzzle toward the aim point; anything in between takes the hit instead
      // open sky: the bullet simply flies out to the aim point (no phantom impact beyond it)
      let hit = this.trace(m.x, m.y, m.z, dx, dy, dz, Math.min(w.range * 1.2, ap.hit.t < w.range - 0.05 ? L + 0.6 : L), 0.3);
      // nothing between the gun and the aim point: the bullet lands exactly where the crosshair ray did
      if (hit.t >= L - 0.08) hit = ap.hit.t < w.range - 0.05 ? { ...ap.hit, t: L } : { t: L, sky: true };
      const tt = hit.t;
      const hx = m.x + dx * tt, hy = m.y + dy * tt, hz = m.z + dz * tt;
      if (n < 3) g.fx.tracer(m.x, m.y, m.z, hx, hy, hz);
      if (hit.char) {
        const c = hit.char;
        const head = hy > c.y + 1.48 && c.state !== 'down';
        let dmg = w.pellets ? w.dmg * clamp(1.3 - Math.hypot(hx - m.x, hz - m.z) / w.range, 0.25, 1.2) : w.dmg;
        if (head) dmg *= w.head || 1.5;
        c.health -= dmg; c.char.flash = 0.08; c.stagger = 0.4;
        g.fx.puff(hx, hy, hz, [0.8, 0.8, 0.8]);
        if (g.uw) g.uw.onPedHit(c, 'gun', dmg);
        if (c.state !== 'down' && (c.health <= 0 || Math.random() < (w.pellets ? 0.18 : 0.35))) { g.peds.knock(c, dx * 3, dz * 3, 0, true, 'gun'); if (c.health <= 0) killed = true; }
        else { g.police.crime(c.kind === 'cop' ? 'shootcop' : 'assault', c.x, c.z); if (c.kind === 'civ') { c.state = 'flee'; c.timer = 6; c.fleeFrom = { x: p.pos.x, z: p.pos.z }; } }
        if (c.kind === 'cop') g.police.crime('shootcop', c.x, c.z);
        if (!marked) { g.ui.hitMarker(head ? 'head' : ''); marked = true; }
      } else if (hit.veh) {
        const v = hit.veh; v.hurt(w.dmg * 0.25, 'gun'); v.shotByPlayer = true; v.wake();
        g.fx.sparks(hx, hy, hz, 6, -dx, -dz);
        if (v.mode === 'kin') g.traffic.disturb(v, g.player);
        else if (v.driver === 'npc' && v.drive && v.drive.mode !== 'flee') { v.drive.mode = 'flee'; v.drive.cruise = 22; }
        if (v.type === 'police' && v.driver === 'cop') g.police.crime('shootcop', v.pos.x, v.pos.z);
        if (!marked) { g.ui.hitMarker('veh'); marked = true; }
      } else if (!hit.sky && hit.t < w.range - 0.1) {
        g.fx.dust(hx, hy, hz, 3, [0.65, 0.62, 0.58]); g.fx.sparks(hx, hy, hz, 3, hit.nx || 0, hit.nz || 0);
        if (Math.random() < 0.3 / (w.pellets || 1)) g.audio.play('ricochet', { x: hx, z: hz, gain: 0.5 });
      }
      if (n === 0) this.lastShot = { o: { x: o.x, y: o.y, z: o.z }, dir: { x: d.x, y: d.y, z: d.z }, aim: { x: ap.x, y: ap.y, z: ap.z }, hit: { x: hx, y: hy, z: hz }, muzzle: m, char: hit.char || null, veh: hit.veh || null, ground: !!hit.ground, t: g.time };
    }
    if (killed) { g.ui.hitMarker('kill'); g.audio.play('kill', { gain: 0.5 }); }
    else if (marked) g.audio.play('hitmark', { gain: 0.35 });
    if (g.traffic.scare) g.traffic.scare(p.pos.x, p.pos.z, 30);
    g.peds.panic(p.pos.x, p.pos.z, 38, 1);
    g.police.crime('shoot', p.pos.x, p.pos.z);
  }
  // nearest hit along ray against static world, characters and vehicles
  trace(ox, oy, oz, dx, dy, dz, maxT, minT = 0.3) {
    const g = this.g;
    let best = { t: maxT };
    const sh = g.world.grid.raycast(ox, oy, oz, dx, dy, dz, maxT, 0);
    if (sh) best = { t: sh.t, nx: sh.nx, nz: sh.nz };
    // the ground: the real surface height where the ray comes down (road 0, kerbs and blocks CURB_H)
    if (dy < -1e-4) {
      const g0 = this.g.player.interior ? this.g.player.interior.floor : 0;
      let tg = (oy - g0 - 0.02) / -dy;
      if (tg < best.t && !this.g.player.interior) { const gy = groundY(ox + dx * tg, oz + dz * tg, oy); if (gy > g0 + 0.01) tg = Math.max(0, (oy - gy - 0.02) / -dy); }
      if (tg < best.t) best = { t: tg, nx: 0, nz: 0, ground: true };
    }
    for (const c of this.targets()) {
      const r = 0.38, y0 = c.y, y1 = c.y + (c.state === 'down' ? 0.45 : 1.85);
      const fx = ox - c.x, fz = oz - c.z;
      const a = dx * dx + dz * dz; if (a < 1e-8) continue;
      const b = fx * dx + fz * dz, cc = fx * fx + fz * fz - r * r;
      const disc = b * b - a * cc; if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / a;
      if (t < minT || t >= best.t) continue;
      const y = oy + dy * t; if (y < y0 || y > y1) continue;
      best = { t, char: c };
    }
    for (const v of g.vehicles.list) {
      if (v === g.player.vehicle && g.player.state === 'vehicle') continue;
      // transform ray into vehicle local space (left x, up y, forward z)
      const c = Math.cos(v.h), s = Math.sin(v.h);
      const lox = (ox - v.pos.x) * c - (oz - v.pos.z) * s, loz = (ox - v.pos.x) * s + (oz - v.pos.z) * c, loy = oy - v.pos.y;
      const ldx = dx * c - dz * s, ldz = dx * s + dz * c;
      const hw = v.spec.w / 2, hl = v.spec.l / 2;
      let t0 = 0, t1 = best.t, ok = true;
      for (const [o, d, lo, hi] of [[lox, ldx, -hw, hw], [loy, dy, 0.25, v.spec.h], [loz, ldz, -hl, hl]]) {
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } continue; }
        let ta = (lo - o) / d, tb = (hi - o) / d; if (ta > tb) { const tt = ta; ta = tb; tb = tt; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 > minT && t0 < best.t) best = { t: t0, veh: v };
    }
    return best;
  }
  meleeHit(w, kind = 'light') {
    const g = this.g, p = g.player;
    const h = p.attackH !== null && p.attackH !== undefined ? p.attackH : p.h;
    const fx = Math.sin(h), fz = Math.cos(h);
    const bat = w.id === 'bat';
    const range = kind === 'kick' || kind === 'finisher' ? 1.75 : kind === 'heavy' ? w.range + 0.2 : w.range;
    const base = bat ? w.dmg : 10;
    const dmg = kind === 'heavy' ? base * (bat ? 1.5 : 2.5) : kind === 'finisher' ? base * 1.9 : kind === 'kick' ? base * 1.6 : base;
    const knockP = bat ? 1 : kind === 'heavy' ? 0.6 : kind === 'finisher' ? 0.75 : kind === 'kick' ? 0.45 : 0.08;
    let hitAny = false, n = 0;
    for (const c of this.targets()) {
      if (c.state === 'down' || c.friendly || n >= 2) continue;
      const dx = c.x - p.pos.x, dz = c.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > range || Math.abs(c.y - p.pos.y) > 1.2) continue;
      if ((dx * fx + dz * fz) / (d || 1) < 0.5) continue;
      hitAny = true; n++;
      // blocking gang members soak a light hit
      const blocked = c.blockT > 0 && kind === 'light' && !bat;
      const dd = blocked ? dmg * 0.2 : dmg;
      c.health -= dd; c.char.flash = 0.1; c.stagger = blocked ? 0.15 : kind === 'light' ? 0.32 : 0.55;
      g.fx.puff(c.x, c.y + 1.3, c.z, [0.85, 0.85, 0.85]);
      g.fx.impact(c.x - fx * 0.2, c.y + 1.25, c.z - fz * 0.2, kind === 'light' ? 4 : 9);
      if (g.uw) g.uw.onPedHit(c, kind, dd);
      if (!blocked && (c.health <= 0 || Math.random() < knockP)) g.peds.knock(c, fx * (kind === 'light' ? 3 : 5.5), fz * (kind === 'light' ? 3 : 5.5), 0, true, 'melee');
      else {
        c.x += fx * (blocked ? 0.15 : 0.45); c.z += fz * (blocked ? 0.15 : 0.45);
        g.police.crime(c.kind === 'cop' ? 'hitcop' : 'assault', c.x, c.z);
        if (c.kind === 'civ') { c.state = 'flee'; c.timer = 6; c.fleeFrom = { x: p.pos.x, z: p.pos.z }; }
      }
    }
    if (hitAny) { g.hitStop = Math.max(g.hitStop || 0, kind === 'light' ? 0.045 : 0.09); }
    if (w.id === 'bat') for (const v of g.vehicles.nearby(p.pos.x, p.pos.z, 4)) {
      const lp = v.toLocal(p.pos.x + fx * 1.2, p.pos.z + fz * 1.2);
      if (Math.abs(lp.x) < v.spec.w / 2 + 0.3 && Math.abs(lp.z) < v.spec.l / 2 + 0.3) {
        hitAny = true; v.hurt(3, 'melee'); v.wake(); g.fx.sparks(p.pos.x + fx * 1.2, p.pos.y + 1, p.pos.z + fz * 1.2, 6, -fx, -fz);
        if (v.parked && !v.alarmT) v.alarmT = 6;
        g.audio.play('crash', { k: 0.25, gain: 0.5 });
      }
    }
    if (hitAny) { g.audio.play('punch', { gain: bat || kind !== 'light' ? 1 : 0.7 }); g.cam.shake(kind === 'light' ? 0.07 : 0.16); g.ui.hitMarker(); }
  }
  copShoot(c) {
    const g = this.g, p = g.player;
    const ox = c.x + Math.sin(c.h) * 0.5, oy = c.y + 1.38, oz = c.z + Math.cos(c.h) * 0.5;
    const tx = p.pos.x, ty = p.pos.y + 1.1, tz = p.pos.z;
    const d = Math.hypot(tx - ox, tz - oz);
    if (!g.world.grid.lineOfSight(ox, oy, oz, tx, ty, tz)) return;
    const moving = p.state === 'vehicle' ? (p.vehicle ? p.vehicle.speed : 0) : Math.hypot(p.vel.x, p.vel.z);
    // retuned with the 3x health pool: a pistol hit is ~9% of your health (11 to kill at 3 stars) and,
    // against the original fire model, police fire takes about three times as long to kill you at every
    // wanted level. A running player is harder to hit.
    const pHit = clamp(0.292 - d * 0.011 - moving * 0.012 + g.police.level * 0.037, 0.04, 0.55);
    const hit = Math.random() < pHit;
    const mx = hit ? tx : tx + rand(-2, 2), my = hit ? ty : ty + rand(-0.5, 1.5), mz = hit ? tz : tz + rand(-2, 2);
    g.fx.muzzleFlash(ox, oy, oz); g.fx.tracer(ox, oy, oz, mx, my, mz);
    g.audio.play('copgun', { x: ox, z: oz, gain: 0.8 });
    if (hit) {
      if (p.state === 'vehicle' && p.vehicle) { p.vehicle.hurt(2.5, 'gun'); g.fx.sparks(mx, my, mz, 4); if (Math.random() < 0.3) p.damage(npcGunDamage('pistol', d) * 0.45, 'police'); }
      else p.damage(npcGunDamage('pistol', d) * (1 + (g.police.level - 3) * 0.08), 'police');
    } else if (Math.random() < 0.4) g.audio.play('ricochet', { x: mx, z: mz, gain: 0.4 });
  }
  vehicleHitsPlayer(v, rel) {
    const g = this.g, p = g.player;
    if (p.hitCooldown > 0) return;
    p.hitCooldown = 0.8;
    p.damage(rel * 3.5 * HP_SCALE, 'vehicle');
    p.vel.x = v.vel.x * 0.6; p.vel.z = v.vel.y * 0.6; p.vel.y = 4;
    g.cam.shake(0.4); g.audio.play('thud');
  }
  areaDamage(x, z, r, dmg) {
    const g = this.g, p = g.player;
    for (const c of g.peds.peds) {
      const d = Math.hypot(c.x - x, c.z - z); if (d > r) continue;
      const k = 1 - d / r;
      g.peds.knock(c, (c.x - x) / (d || 1) * 10 * k, (c.z - z) / (d || 1) * 10 * k, dmg * k, false);
    }
    if (p.state === 'foot') { const d = Math.hypot(p.pos.x - x, p.pos.z - z); if (d < r) { p.damage(dmg * HP_SCALE * (1 - d / r), 'explosion'); p.vel.y = 6; } }
  }
}

