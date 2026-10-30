/* =====================================================================
   [CORE] PEDESTRIANS (sidewalk rings, crosswalks, reactions, lightweight LOD)
   ===================================================================== */
const CORNER_SIGN = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const cornerIndex = (sx, sz) => sx < 0 ? (sz < 0 ? 0 : 3) : (sz < 0 ? 1 : 2);
const BLOCK_DENSITY = { D: 1, C: 1, R: 0.7, H: 0.35, I: 0.25, P: 0.8, K: 0.35, X: 0.15, W: 0.25, G: 0.9, A: 0.3, T: 0.1, F: 0.1 };
let PED_ID = 1;
class PedManager {
  constructor(game) {
    this.g = game; this.peds = []; this.enabled = true; this.target = 32; this._near = []; this._res = {};
  }
  ringPos(bx, bz, o, t, out = {}) {
    const L = P - 2 * o; let tt = ((t % (4 * L)) + 4 * L) % (4 * L);
    const side = Math.min(3, Math.floor(tt / L)), u = tt - side * L;
    const x0 = bx * P + o, z0 = bz * P + o;
    if (side === 0) { out.x = x0 + u; out.z = z0; out.h = Math.PI / 2; }
    else if (side === 1) { out.x = x0 + L; out.z = z0 + u; out.h = 0; }
    else if (side === 2) { out.x = x0 + L - u; out.z = z0 + L; out.h = -Math.PI / 2; }
    else { out.x = x0; out.z = z0 + L - u; out.h = Math.PI; }
    out.side = side;
    return out;
  }
  projectRing(x, z) {
    const bx = clamp(Math.floor(x / P), 0, N - 1), bz = clamp(Math.floor(z / P), 0, N - 1);
    const o = ROAD_HALF + 2.2, L = P - 2 * o, x0 = bx * P + o, z0 = bz * P + o;
    const cx = clamp(x, x0, x0 + L), cz = clamp(z, z0, z0 + L);
    const dN = cz - z0, dS = z0 + L - cz, dW = cx - x0, dE = x0 + L - cx;
    const m = Math.min(dN, dS, dW, dE);
    let t;
    if (m === dN) t = cx - x0; else if (m === dE) t = L + (cz - z0); else if (m === dS) t = 2 * L + (x0 + L - cx); else t = 3 * L + (z0 + L - cz);
    return { bx, bz, o, t };
  }
  make(kind, look) {
    const p = {
      id: PED_ID++, kind, look: look || randomLook(), pose: { phase: Math.random() * 6, amp: 0 },
      x: 0, y: 0, z: 0, h: 0, vx: 0, vz: 0, vy: 0, state: 'walk', timer: 0, health: kind === 'cop' ? 90 : 55,
      speed: rand(1.15, 1.6), dir: chance(0.5) ? 1 : -1, d: rand(1.7, 2.9), latOff: 0, flash: 0, lod: 0
    };
    p.char = { x: 0, y: 0, z: 0, h: 0, look: p.look, pose: p.pose, flash: 0 };
    return p;
  }
  pickBlock(px, pz) {
    const cands = [];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const b = this.g.world.block(Math.floor(px / P) + dx, Math.floor(pz / P) + dz);
      if (b && !b.noPeds) cands.push([b, (BLOCK_DENSITY[b.t] || 0.5) * zoneAt(b.cx, b.cz).ped]);
    }
    let sum = 0; for (const c of cands) sum += c[1];
    let r = Math.random() * sum;
    for (const c of cands) { r -= c[1]; if (r <= 0) return c[0]; }
    return cands.length ? cands[0][0] : null;
  }
  trySpawn() {
    const g = this.g, px = g.focus.x, pz = g.focus.z;
    for (let k = 0; k < 6; k++) {
      const b = this.pickBlock(px, pz); if (!b) return;
      const p = this.make('civ');
      p.bx = b.bx; p.bz = b.bz; p.o = ROAD_HALF + p.d;
      const L = P - 2 * p.o; p.t = Math.random() * 4 * L;
      const q = this.ringPos(p.bx, p.bz, p.o, p.t);
      const d = Math.hypot(q.x - px, q.z - pz);
      if (d < 32 || d > 110) continue;
      if (d < 70 && g.inView(q.x, 1, q.z, 1)) continue;
      p.x = q.x; p.z = q.z; p.y = groundY(q.x, q.z);
      this.setSegment(p);
      this.newDest(p);
      this.peds.push(p);
      return p;
    }
  }
  setSegment(p) {
    const L = P - 2 * p.o;
    const seg = Math.floor(p.t / L + 1e-6);
    p.ct = p.dir > 0 ? (seg + 1) * L : (Math.abs(p.t - seg * L) < 1e-3 ? (seg - 1) * L : seg * L);
  }
  newDest(p) {
    p.dest = { bx: clamp(p.bx + randi(-2, 2), 0, N - 1), bz: clamp(p.bz + randi(-2, 2), 0, N - 1) };
    p.idleAt = null;
  }
  spawnAt(x, z, kind, look, state = 'flee') {
    const p = this.make(kind, look);
    p.x = x; p.z = z; p.y = groundY(x, z); p.state = state; p.timer = rand(4, 7);
    p.fleeFrom = { x: this.g.player.pos.x, z: this.g.player.pos.z };
    this.peds.push(p);
    return p;
  }
  ejectDriver(v, mode) {
    if (v.driver !== 'npc' && v.driver !== 'cop') return null;
    const side = v.toWorld(v.spec.w / 2 + 0.6, 0.3);
    const p = this.spawnAt(side.x, side.z, v.driver === 'cop' ? 'cop' : 'civ', v.driver === 'cop' ? copLook() : null, mode === 'down' ? 'down' : 'flee');
    if (mode === 'down') { p.timer = 1.6; p.vx = (side.x - v.pos.x) * 2; p.vz = (side.z - v.pos.z) * 2; this.g.audio.play('scream', { x: p.x, z: p.z }); }
    v.driver = null; v.drive = null;
    return p;
  }
  panic(x, z, r, sev = 1) {
    for (const p of this.peds) {
      if (p.kind !== 'civ' || p.state === 'down' || p.state === 'ko') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < r) {
        if (p.state !== 'flee' && Math.random() < 0.25 && d < r * 0.6) this.g.audio.play('scream', { x: p.x, z: p.z, gain: 0.5 });
        if (sev > 0.5 && Math.random() < 0.18 && d < 25) { p.state = 'cower'; p.timer = rand(3, 6); }
        else { p.state = 'flee'; p.timer = rand(5, 9); p.fleeFrom = { x, z }; }
      }
    }
  }
  knock(p, vx, vz, dmg, byPlayer, src) {
    if (p.state === 'ko' || (p.state === 'down' && p.ko)) return;
    p.health -= dmg;
    p.vx = vx; p.vz = vz; p.vy = Math.min(8, 2 + Math.hypot(vx, vz) * 0.25);
    p.state = 'down'; p.timer = rand(2.5, 4.5); p.pose.downDir = 1;
    p.char.flash = 0.1; p.pose.surrender = 0; p.pose.aim = 0; p.atkT = 0; p.pendHit = undefined; p.pendTarget = null;
    if (p.health <= 0) { p.state = 'down'; p.ko = true; p.timer = 9999; }
    if (this.g.uw) { this.g.uw.onKnock(p, byPlayer, !!p.ko); this.g.uw.gangs.onDown(p, byPlayer, !!p.ko); }
    if (byPlayer) {
      this.g.save.stats.pedsHit++;
      this.g.police.crime(p.kind === 'cop' ? 'hitcop' : (p.ko ? 'koped' : (src === 'car' ? 'hitped' : 'assault')), p.x, p.z);
      this.panic(p.x, p.z, 25, 0.7);
    }
  }
  update(dt, frame) {
    const g = this.g, fx = g.focus.x, fz = g.focus.z;
    if (!this.enabled) { this.peds = this.peds.filter(p => p.kind !== 'civ'); }
    // despawn
    for (let k = this.peds.length - 1; k >= 0; k--) {
      const p = this.peds[k];
      const d = Math.hypot(p.x - fx, p.z - fz);
      if (p.keep) continue;
      if (d > 135 || (d > 85 && p.kind === 'civ' && !g.inView(p.x, 1, p.z, 1) && p.state !== 'down')) this.peds.splice(k, 1);
    }
    const want = this.enabled ? this.target * g.env.pedMul * (g.save.settings.peds ?? 1) : 0;
    const civs = this.peds.reduce((a, p) => a + (p.kind === 'civ' ? 1 : 0), 0);
    if (civs < want) { this.trySpawn(); if (civs < want * 0.5) this.trySpawn(); }
    else if (civs > want + 3) {
      for (let k = this.peds.length - 1; k >= 0; k--) { const p = this.peds[k]; if (p.kind === 'civ' && !p.keep && p.state === 'walk' && !g.inView(p.x, 1, p.z, 1) && Math.hypot(p.x - fx, p.z - fz) > 40) { this.peds.splice(k, 1); break; } }
    }
    // bystanders react to an active police response nearby
    this.copScareT = (this.copScareT || 0) - dt;
    if (g.police.level >= 2 && this.copScareT <= 0) {
      this.copScareT = 0.6;
      const threats = [];
      for (const u of g.police.units) if (u.v.siren && !u.v.burnt) threats.push(u.v.pos);
      for (const c of g.police.cops) if (c.state !== 'down') threats.push(c);
      threats.push(g.player.pos);
      for (const p of this.peds) {
        if (p.kind !== 'civ' || !(p.state === 'walk' || p.state === 'idle' || p.state === 'wait' || p.state === 'sit')) continue;
        for (const t of threats) {
          if (dist2(p.x, p.z, t.x, t.z) < 18 * 18) {
            if (p.seat) { p.seat.taken = false; p.seat = null; }
            if (Math.random() < 0.35) { p.state = 'cower'; p.timer = rand(2.5, 5); }
            else { p.state = 'flee'; p.timer = rand(4, 7); p.fleeFrom = { x: t.x, z: t.z }; }
            break;
          }
        }
      }
    }
    for (let k = 0; k < this.peds.length; k++) {
      const p = this.peds[k];
      const d = Math.hypot(p.x - fx, p.z - fz);
      p.lodAcc = (p.lodAcc || 0) + dt;
      const skip = d > 70 ? 3 : 1;
      if ((frame + k) % skip !== 0) continue;
      const step = Math.min(0.2, p.lodAcc); p.lodAcc = 0;
      if (p.brain) p.brain(p, step);
      this.updatePed(p, step, d < 70);
    }
  }
  updatePed(p, dt, fine) {
    const g = this.g;
    let moving = 0, run = false;
    switch (p.state) {
      case 'walk': {
        const L = P - 2 * p.o;
        if (p.idleAt !== null && p.idleAt !== undefined) {
          const rem = (p.idleAt - p.t) * p.dir;
          if (rem <= 0) { p.state = 'idle'; p.timer = rand(4, 12); p.pose.phone = Math.random() < 0.4; break; }
        }
        p.t += p.dir * p.speed * dt; moving = p.speed;
        if (p.dir > 0 ? p.t >= p.ct : p.t <= p.ct) { p.t = p.ct; this.atCorner(p); }
        const q = this.ringPos(p.bx, p.bz, p.o, p.t, this._q || (this._q = {}));
        const nx = -Math.sin(q.h) * 0, inward = q.side === 0 ? [0, 1] : q.side === 1 ? [-1, 0] : q.side === 2 ? [0, -1] : [1, 0];
        if (fine && (p._avT = (p._avT || 0) - dt) <= 0) {
          p._avT = 0.3; p.latTarget = 0;
          const fx = Math.sin(p.h), fz = Math.cos(p.h);
          for (const e of g.dyn.query(p.x, p.z, 2, this._near)) {
            if (e.ref === p || !e.ped) continue;
            const ex = e.x - p.x, ez = e.z - p.z, fwd = ex * fx + ez * fz;
            if (fwd > 0 && fwd < 2 && Math.abs(ex * fz - ez * fx) < 0.9) { p.latTarget = p.dir > 0 ? 0.7 : -0.7; break; }
          }
          if (g.player.state === 'foot' && dist2(g.player.pos.x, g.player.pos.z, p.x, p.z) < 2.2 * 2.2) p.latTarget = p.dir > 0 ? 0.8 : -0.8;
        }
        p.latOff = damp(p.latOff, p.latTarget || 0, 2, dt);
        p.x = q.x + inward[0] * p.latOff; p.z = q.z + inward[1] * p.latOff;
        p.h = dampAngle(p.h, q.h + (p.dir < 0 ? Math.PI : 0), 8, dt);
        void nx; void L;
        break;
      }
      case 'wait': {
        const c = p.crossing;
        p.h = dampAngle(p.h, Math.atan2(c.tx - p.x, c.tz - p.z), 6, dt);
        p.timer -= dt;
        const safe = Signals.pedSafe(c.ni, c.nj, c.axis);
        if (safe || (p.timer < 0 && Math.random() < 0.004 && !this.carNear(p.x, p.z, 30))) { p.state = 'cross'; }
        if (p.timer < -40) { p.state = 'walk'; this.setSegment(p); }
        break;
      }
      case 'cross': {
        const c = p.crossing;
        const dx = c.tx - p.x, dz = c.tz - p.z, d = Math.hypot(dx, dz);
        const sp = p.speed * 1.2;
        if (d < sp * dt + 0.05) {
          p.bx = c.nbx; p.bz = c.nbz; p.t = c.nt; p.state = 'walk';
          p.dir = c.ndir; this.setSegment(p);
          if (p.bx === p.dest.bx && p.bz === p.dest.bz) { const L = P - 2 * p.o; p.idleAt = p.t + p.dir * rand(10, L * 2); }
        } else { p.x += dx / d * sp * dt; p.z += dz / d * sp * dt; p.h = dampAngle(p.h, Math.atan2(dx, dz), 8, dt); moving = sp; }
        break;
      }
      case 'idle': {
        p.timer -= dt;
        if (p.timer <= 0) { p.pose.phone = false; this.newDest(p); p.state = 'walk'; p.dir = chance(0.5) ? 1 : -1; this.setSegment(p); }
        break;
      }
      case 'sit': {
        p.timer -= dt;
        if (p.timer <= 0) { p.state = 'rejoin'; p.seat.taken = false; p.seat = null; }
        break;
      }
      case 'toSeat': {
        const s = p.seat; const dx = s.x - p.x, dz = s.z - p.z, d = Math.hypot(dx, dz);
        if (d < 0.25) { p.state = 'sit'; p.timer = rand(10, 25); p.x = s.x; p.z = s.z; p.h = s.ry; }
        else { p.x += dx / d * p.speed * dt; p.z += dz / d * p.speed * dt; p.h = dampAngle(p.h, Math.atan2(dx, dz), 8, dt); moving = p.speed; }
        break;
      }
      case 'flee': case 'dive': case 'rejoin': case 'cower': case 'down': case 'chase': case 'free': {
        this.freeMove(p, dt); moving = Math.hypot(p.vx, p.vz); run = moving > 3; break;
      }
    }
    // vehicle interaction (only near the player)
    if (fine && p.state !== 'ko') this.vehicleCheck(p, dt);
    // pose
    const ps = p.pose;
    const stride = run ? 2.2 : 1.25;
    ps.phase += moving / stride * Math.PI * dt;
    ps.amp = damp(ps.amp, p.state === 'down' ? 0 : clamp(moving / 4, 0, 1.1), 8, dt);
    ps.lean = damp(ps.lean || 0, run ? 0.2 : 0.03, 5, dt);
    ps.sit = damp(ps.sit || 0, p.state === 'sit' ? 1 : 0, 6, dt);
    ps.crouch = damp(ps.crouch || 0, p.state === 'cower' ? 1 : 0, 6, dt);
    ps.down = damp(ps.down || 0, p.state === 'down' ? 1 : 0, p.state === 'down' ? 9 : 3, dt);
    if (p.stagger > 0) p.stagger -= dt;
    ps.hit = p.stagger > 0 ? Math.min(1, p.stagger / 0.3) : 0;
    if (p.atkT !== undefined) { p.atkT -= dt; ps.punch = p.atkT > 0 && p.atkKind === 'punch' ? 1 - p.atkT / 0.45 : 0; ps.swing = p.atkT > 0 && p.atkKind === 'swing' ? 1 - p.atkT / 0.55 : 0; ps.kick = p.atkT > 0 && p.atkKind === 'kick' ? 1 - p.atkT / 0.5 : 0; }
    if (p.blockT !== undefined) { p.blockT -= dt; ps.block = p.blockT > 0 ? 1 : 0; }
    ps.air = p.vy > 0.5 && p.state !== 'down' ? 1 : 0;
    if (p.state !== 'down' && p.state !== 'flee' && p.state !== 'dive' && p.state !== 'free' && p.state !== 'chase') p.y = groundY(p.x, p.z);
    if (p.char.flash > 0) p.char.flash -= dt;
    p.char.x = p.x; p.char.y = p.y; p.char.z = p.z; p.char.h = p.h;
  }
  atCorner(p) {
    const L = P - 2 * p.o;
    const c = ((Math.round(p.t / L) % 4) + 4) % 4;
    const [sx, sz] = CORNER_SIGN[c];
    const opts = [];
    const nbx = p.bx + sx, nbz = p.bz + sz;
    const wantX = p.dest.bx !== p.bx && Math.sign(p.dest.bx - p.bx) === sx;
    const wantZ = p.dest.bz !== p.bz && Math.sign(p.dest.bz - p.bz) === sz;
    const W0 = this.g.world;
    if (nbx >= 0 && nbx < N && !W0.block(nbx, p.bz).noPeds) opts.push(['x', wantX ? 3 : 0.3]);
    if (nbz >= 0 && nbz < N && !W0.block(p.bx, nbz).noPeds) opts.push(['z', wantZ ? 3 : 0.3]);
    opts.push(['go', (wantX || wantZ) ? 0.2 : 1.6]);
    if (p.bx === p.dest.bx && p.bz === p.dest.bz) {
      // in destination block: sometimes head for a bench, otherwise idle somewhere on this ring
      const b = this.g.world.block(p.bx, p.bz);
      const seat = b && b.seats.find(s => !s.taken && Math.random() < 0.5);
      if (seat && Math.random() < 0.35) { seat.taken = true; p.seat = seat; p.state = 'toSeat'; return; }
      p.idleAt = p.t + p.dir * rand(8, L * 0.9);
    }
    let sum = 0; for (const o of opts) sum += o[1];
    let r = Math.random() * sum, choice = 'go';
    for (const o of opts) { r -= o[1]; if (r <= 0) { choice = o[0]; break; } }
    if (choice === 'go') { if (Math.random() < 0.08) p.dir = -p.dir; this.setSegment(p); return; }
    const q = this.ringPos(p.bx, p.bz, p.o, p.t);
    let tbx = p.bx, tbz = p.bz, tc, axis, ni, nj;
    ni = p.bx + (sx > 0 ? 1 : 0); nj = p.bz + (sz > 0 ? 1 : 0);
    if (choice === 'x') { tbx = nbx; tc = cornerIndex(-sx, sz); axis = 0; }
    else { tbz = nbz; tc = cornerIndex(sx, -sz); axis = 1; }
    const tq = this.ringPos(tbx, tbz, p.o, tc * L);
    p.x = q.x; p.z = q.z;
    p.crossing = { tx: tq.x, tz: tq.z, nbx: tbx, nbz: tbz, nt: tc * L, ni, nj, axis, ndir: chance(0.5) ? 1 : -1 };
    p.state = 'wait'; p.timer = rand(0, 3);
  }
  carNear(x, z, r) { for (const v of this.g.vehicles.list) if (v.speed > 2 && dist2(v.pos.x, v.pos.z, x, z) < r * r) return true; return false; }
  freeMove(p, dt) {
    const g = this.g;
    if (p.state === 'down') {
      p.timer -= dt;
      const fl = p.floor !== undefined ? p.floor : groundY(p.x, p.z);
      p.vx = damp(p.vx, 0, p.y > fl + 0.05 ? 0.5 : 5, dt); p.vz = damp(p.vz, 0, p.y > fl + 0.05 ? 0.5 : 5, dt);
      if (p.timer <= 0 && !p.ko) { p.state = p.kind === 'cop' ? 'chase' : (p.brain && p.kind !== 'civ') ? 'free' : 'flee'; p.timer = rand(4, 7); p.fleeFrom = { x: g.player.pos.x, z: g.player.pos.z }; }
    } else if (p.state === 'flee') {
      p.timer -= dt;
      const f = p.fleeFrom || g.player.pos;
      let dx = p.x - f.x, dz = p.z - f.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      const sp = 5.2;
      p.vx = damp(p.vx, dx * sp, 6, dt); p.vz = damp(p.vz, dz * sp, 6, dt);
      if (p.timer <= 0) { p.state = 'rejoin'; const r = this.projectRing(p.x, p.z); Object.assign(p, { bx: r.bx, bz: r.bz, o: r.o, t: r.t }); }
    } else if (p.state === 'dive') {
      p.timer -= dt; if (p.timer <= 0) { p.state = 'flee'; p.timer = rand(2, 4); }
    } else if (p.state === 'cower') {
      p.vx = 0; p.vz = 0; p.timer -= dt; if (p.timer <= 0) { p.state = 'flee'; p.timer = rand(3, 5); }
    } else if (p.state === 'rejoin') {
      const q = this.ringPos(p.bx, p.bz, p.o, p.t);
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      // can't get back to the sidewalk (wedged behind something): hop there while off-screen
      p.rejoinT = (p.rejoinT || 0) + dt;
      if (p.rejoinT > 10 && !g.inView(p.x, 1, p.z, 1)) { p.x = q.x; p.z = q.z; p.y = groundY(q.x, q.z); }
      if (d < 0.4 || p.rejoinT > 10 && !g.inView(p.x, 1, p.z, 1)) { p.rejoinT = 0; p.state = 'walk'; p.latOff = 0; p.x = q.x; p.z = q.z; this.setSegment(p); this.newDest(p); p.vx = p.vz = 0; return; }
      p.vx = dx / d * p.speed; p.vz = dz / d * p.speed;
    }
    p.vy -= GRAVITY * dt;
    p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
    // someone inside a building (a bank's guards, the police who storm it) stands on its floor, not the street above
    const gy = p.floor !== undefined ? p.floor : groundY(p.x, p.z);
    if (p.y <= gy) { p.y = gy; if (p.vy < -6 && p.state === 'down') g.fx.dust(p.x, gy + 0.1, p.z, 3); p.vy = 0; }
    const r = g.world.grid.resolveCircle(p.x, p.z, 0.3, p.y + 0.3, p.y + 1.7, this._res);
    if (r.hit) { p.x = r.x; p.z = r.z; if (p.state === 'rejoin' || p.state === 'flee') { p.vx += -r.nz * 2; p.vz += r.nx * 2; } }
    // kept to the city's promenade, unless standing on Valen Point or Cedar Fields South (and their causeway and bridge)
    if ((p.x < -EDGE_MARGIN + 1 || p.z < -EDGE_MARGIN + 1 || p.x > CITY + EDGE_MARGIN - 1 || p.z > CITY + EDGE_MARGIN - 1) && !inExtension(p.x, p.z)) { p.x = clamp(p.x, -EDGE_MARGIN + 1, CITY + EDGE_MARGIN - 1); p.z = clamp(p.z, -EDGE_MARGIN + 1, CITY + EDGE_MARGIN - 1); }
    const hs = Math.hypot(p.vx, p.vz);
    if (hs > 0.3 && p.state !== 'down') p.h = dampAngle(p.h, Math.atan2(p.vx, p.vz), 10, dt);
  }
  vehicleCheck(p, dt) {
    const g = this.g;
    for (const v of g.vehicles.nearby(p.x, p.z, 14)) {
      const lp = v.toLocal(p.x, p.z);
      const hw = v.spec.w / 2 + 0.3, hl = v.spec.l / 2 + 0.3;
      const sp = v.speed;
      if (Math.abs(lp.x) < hw && Math.abs(lp.z) < hl && p.y < v.pos.y + v.spec.h) {
        if (sp > 3 && p.state !== 'down') {
          const byPlayer = v.driver === 'player';
          this.knock(p, v.vel.x * 0.75 + rand(-1, 1), v.vel.y * 0.75 + rand(-1, 1), sp * 3.2, byPlayer, 'car');
          g.audio.play('thud', { x: p.x, z: p.z, gain: clamp(sp / 10, 0.3, 1) });
          if (byPlayer) g.cam.shake(0.15);
          v.vel.x *= 0.97; v.vel.y *= 0.97;
        } else {
          const px = hw - Math.abs(lp.x), pz = hl - Math.abs(lp.z);
          if (px < pz) lp.x += Math.sign(lp.x || 1) * px; else lp.z += Math.sign(lp.z || 1) * pz;
          const w = v.toWorld(lp.x, lp.z); p.x = w.x; p.z = w.z;
        }
        continue;
      }
      // danger: dive out of the way of a fast car on collision course
      if (sp > 6 && p.kind === 'civ' && (p.state === 'walk' || p.state === 'wait' || p.state === 'idle' || p.state === 'cross' || p.state === 'rejoin' || p.state === 'sit')) {
        const lv = v.localVel();
        if (lv.z > 6 && lp.z > 0 && lp.z < lv.z * 1.1 + 3 && Math.abs(lp.x) < hw + 1.3) {
          if (!p.diveRoll) p.diveRoll = Math.random();
          if (p.diveRoll < 0.8) {
            const side = lp.x >= 0 ? 1 : -1;
            const w = v.toWorld(side * 3, 0); const dx = w.x - v.pos.x, dz = w.z - v.pos.z, dl = Math.hypot(dx, dz) || 1;
            if (p.seat) { p.seat.taken = false; p.seat = null; }
            p.state = 'dive'; p.timer = 0.55; p.vx = dx / dl * 6; p.vz = dz / dl * 6; p.vy = 2.5; p.fleeFrom = { x: v.pos.x, z: v.pos.z };
            if (Math.random() < 0.3) g.audio.play('scream', { x: p.x, z: p.z, gain: 0.6 });
          }
        }
      }
      // drivers on the sidewalk scare people
      if (v.driver === 'player' && sp > 4 && !isOnRoad(v.pos.x, v.pos.z) && dist2(v.pos.x, v.pos.z, p.x, p.z) < 12 * 12 && p.kind === 'civ' && p.state !== 'down' && p.state !== 'flee' && p.state !== 'dive') {
        p.state = 'flee'; p.timer = rand(3, 6); p.fleeFrom = { x: v.pos.x, z: v.pos.z };
      }
    }
  }
  draw(r) { for (const p of this.peds) { p.char.flash = p.char.flash || 0; r.draw(p.char); } }
}
function copLook() {
  const l = randomLook(); l.shirt = C(0x1d2e4a); l.pants = C(0x15181f); l.shoes = C(0x0b0b0b); l.sleeve = true; l.cap = C(0x111a2e); l.hairStyle = 1; l.build = 1.05 + Math.random() * 0.1;
  return l;
}

