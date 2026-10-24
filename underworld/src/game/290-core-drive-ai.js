/* =====================================================================
   [CORE] DRIVE AI (physics vehicles: police pursuit, fleeing, cruising)
   ===================================================================== */
class DriveAI {
  constructor(v, game, mode = 'cruise') {
    this.v = v; this.g = game; this.mode = mode;
    this.path = []; this.pi = 0; this.repath = 0; this.stuck = 0; this.rev = 0; this.revSteer = 1;
    this.cruise = 14; this.wait = 0; this.goal = null; this.target = null; this.arrived = false; this.direct = false;
  }
  setGoal(x, z) { this.goal = { x, z }; this.route(x, z); this.arrived = false; }
  route(tx, tz) {
    const v = this.v, fx = Math.sin(v.h), fz = Math.cos(v.h);
    // to or from Valen Point: the GPS route through the causeway, kept to the right-hand side of each leg
    if (vpSide(v.pos.x, v.pos.z) || vpSide(tx, tz)) {
      const r = gpsRoute(v.pos.x, v.pos.z, tx, tz);
      if (r && r.length > 1) {
        this.path = [];
        for (let k = 1; k < r.length; k++) {
          const a = r[k - 1], b = r[k], last = k === r.length - 1;
          if (Math.hypot(b.x - a.x, b.z - a.z) < 0.5 && !last) continue;
          const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, o = last ? 0 : LANE * 0.7;
          this.path.push({ x: b.x - dz / l * o, z: b.z + dx / l * o, node: !last });
        }
        this.pi = 0;
        return;
      }
    }
    let i = Math.round(v.pos.x / P), j = Math.round(v.pos.z / P);
    const onV = Math.abs(v.pos.x - i * P) < 9, onH = Math.abs(v.pos.z - j * P) < 9;
    if (onV && !onH) j = fz > 0 ? Math.ceil(v.pos.z / P) : Math.floor(v.pos.z / P);
    else if (onH && !onV) i = fx > 0 ? Math.ceil(v.pos.x / P) : Math.floor(v.pos.x / P);
    i = clamp(i, 0, N); j = clamp(j, 0, N);
    if (RoadNet.degree(i, j) === 0) [i, j] = RoadNet.nearNode(v.pos.x, v.pos.z);
    const [gi, gj] = RoadNet.nearNode(tx, tz);
    // shortest route over the roads that exist (superblocks close some lattice segments)
    const pts = RoadNet.path(i, j, gi, gj);
    this.path = [];
    for (let k = 0; k < pts.length; k++) {
      const [a, b] = pts[k];
      let x = a * P, z = b * P;
      const nxt = pts[k + 1];
      if (nxt) { const dx = nxt[0] - a, dz = nxt[1] - b; x += -dz * LANE * 0.7; z += dx * LANE * 0.7; }
      this.path.push({ x, z, node: true });
    }
    // a goal part-way along the last street: stop there instead of running on to the far junction and U-turning back
    for (let guard = 0; guard < 2 && this.path.length >= 1; guard++) {
      const B = this.path[this.path.length - 1], A = this.path.length >= 2 ? this.path[this.path.length - 2] : v.pos;
      const abx = B.x - A.x, abz = B.z - A.z, L2 = abx * abx + abz * abz; if (L2 < 1) break;
      const t = ((tx - A.x) * abx + (tz - A.z) * abz) / L2, off = Math.abs((tx - A.x) * abz - (tz - A.z) * abx) / Math.sqrt(L2);
      if (t > 0.02 && t < 0.98 && off < 14) this.path.pop(); else break;
    }
    this.path.push({ x: tx, z: tz, node: false });
    this.pi = 0;
  }
  update(dt) {
    const v = this.v, g = this.g, ctl = v.ctl;
    if (v.health <= 0 || v.burnt) { ctl.throttle = 0; ctl.handbrake = true; ctl.steer = 0; return; }
    if (this.wait > 0) {
      this.wait -= dt; ctl.throttle = 0; ctl.handbrake = true;
      if (this.wait <= 0 && this.bail) { this.bail = false; g.peds.ejectDriver(v, 'flee'); return; }
      return;
    }
    if (v.driver !== 'npc' && v.driver !== 'cop') { ctl.throttle = 0; ctl.handbrake = true; return; }
    ctl.handbrake = false;
    let desired = this.cruise, tx, tz;
    this.direct = false;
    if (this.target) {
      const t = this.target();
      if (t.direct) { this.direct = true; tx = t.x; tz = t.z; desired = t.speed || this.cruise; }
      else if (!this.goal || dist2(this.goal.x, this.goal.z, t.x, t.z) > 25 * 25 || (this.repath -= dt) <= 0) { this.setGoal(t.x, t.z); this.repath = 1.5; }
      if (t.speed && !this.direct) desired = t.speed;
    }
    const fx = Math.sin(v.h), fz = Math.cos(v.h);
    if (!this.direct) {
      if (!this.path.length) { ctl.throttle = 0; ctl.handbrake = true; return; }
      while (this.pi < this.path.length - 1) {
        const w = this.path[this.pi];
        const lp = v.toLocal(w.x, w.z), d = Math.hypot(lp.x, lp.z);
        if (d < (w.node ? 11 : 5) || (lp.z < -2 && d < 18)) this.pi++; else break;
      }
      const w = this.path[this.pi]; tx = w.x; tz = w.z;
      const last = this.pi === this.path.length - 1;
      const dl = Math.hypot(tx - v.pos.x, tz - v.pos.z);
      if (last && dl < 7) {
        this.arrived = true;
        if (this.mode === 'cruise' || this.mode === 'flee') { const c = g.world.randomCurbSpot(v.pos.x, v.pos.z, 250, 700); this.setGoal(c.x, c.z); }
        else { ctl.throttle = v.localVel().z > 0.5 ? -0.6 : 0; ctl.handbrake = v.speed < 1; return; }
      }
      if (w.node && this.pi + 1 < this.path.length) {
        const n = this.path[this.pi + 1];
        const ax = tx - v.pos.x, az = tz - v.pos.z, bx = n.x - tx, bz = n.z - tz;
        const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
        const turn = 1 - (ax * bx + az * bz) / (la * lb);
        if (turn > 0.5) desired = Math.min(desired, 10 + Math.max(0, dl - 12) * 0.55);
      }
      if (last) desired = Math.min(desired, 4 + dl * 0.5);
      // a racing line carries its own safe speed (Valen Point): the lowest of this point and the next two
      if (w.vmax) { let lim = w.vmax; for (let j = 1; j <= 2 && this.pi + j < this.path.length; j++) lim = Math.min(lim, this.path[this.pi + j].vmax || lim); desired = Math.min(desired, lim); }
    }
    const lp = v.toLocal(tx, tz);
    const ang = Math.atan2(lp.x, lp.z);
    let steer = clamp(ang * 1.9, -1, 1);
    if (Math.abs(ang) > 0.45) desired = Math.min(desired, 9 + Math.hypot(lp.x, lp.z) * 0.2);
    // static obstacle probe
    const probe = 5 + v.speed * 0.55;
    const hit = g.world.grid.raycast(v.pos.x + fx * v.spec.l * 0.5, v.pos.y + 0.8, v.pos.z + fz * v.spec.l * 0.5, fx, 0, fz, probe, 0.5);
    if (hit && !this.direct) { desired = Math.min(desired, Math.max(3, hit.t * 0.9)); steer += (hit.nx * Math.cos(v.h) - hit.nz * Math.sin(v.h)) > 0 ? 0.5 : -0.5; }
    // traffic ahead. Two cars that each wait for the other (nose to nose, or one parked across the
    // lane) would sit forever: after a few seconds stopped behind something that isn't moving
    // either, the driver pulls round it at walking pace.
    const fwd = v.localVel().z;
    let blocker = null, bl2 = null, slowed = desired;
    for (const e of g.dyn.query(v.pos.x + fx * 7, v.pos.z + fz * 7, 8, this._n || (this._n = []))) {
      if (e.ref === v || (this.direct && e.ref === this.targetRef)) continue;
      if (e.ref === g.player && g.player.passenger) continue;
      const l2 = v.toLocal(e.x, e.z);
      if (l2.z > 0 && l2.z < 12 && Math.abs(l2.x) < 2.2) {
        if (this.mode === 'pursue') steer += l2.x > 0 ? -0.6 : 0.6;
        else { const lim = Math.max(0, (l2.z - 4) * 1.2); if (lim < slowed) { slowed = lim; blocker = e.ref; bl2 = l2; } }
      }
    }
    if (blocker && slowed < 1 && Math.abs(fwd) < 0.6) {
      const still = !(blocker.speed > 0.8) && !(blocker.vel && Math.hypot(blocker.vel.x, blocker.vel.y || 0, blocker.vel.z || 0) > 0.8);
      this.blockT = still ? (this.blockT || 0) + dt : 0;
    } else if (!blocker) this.blockT = Math.max(0, (this.blockT || 0) - dt * 2);
    // queued traffic clears by itself: wait longer behind kinematic traffic, and much longer when the
    // queue stands at a junction (a red light), so an AI car never overtakes a light queue
    let patience = 2.5;
    if (blocker && blocker.mode === 'kin') {
      const bx = blocker.pos ? blocker.pos.x : v.pos.x, bz = blocker.pos ? blocker.pos.z : v.pos.z;
      const nearNode = Math.hypot(bx - Math.round(bx / P) * P, bz - Math.round(bz / P) * P) < 26;
      patience = nearNode ? 25 : 7;
    }
    if (blocker && this.blockT > patience) { desired = Math.min(desired, 4); steer += bl2.x > 0 ? -0.8 : 0.8; }
    else desired = slowed;
    if (this.rev > 0) { this.rev -= dt; ctl.throttle = -1; ctl.steer = -this.revSteer; return; }
    if (ctl.throttle > 0.3 && Math.abs(fwd) < 0.8 && desired > 2) { this.stuck += dt; this.stuckTotal = (this.stuckTotal || 0) + dt; if (this.stuck > 1.4) { this.rev = 1.3; this.revSteer = Math.sign(steer) || 1; this.stuck = 0; } }
    else { this.stuck = Math.max(0, this.stuck - dt); if (fwd > 4) this.stuckTotal = 0; }
    // repeated stalls: plan a fresh route; still pinned much later and unseen: let the owner recycle it
    if (this.stuckTotal > 8 && !this._rerouted) { this._rerouted = true; if (this.goal) this.route(this.goal.x, this.goal.z); }
    if (this.stuckTotal > 25 && !g.inView(v.pos.x, 1, v.pos.z, 3) && Math.hypot(v.pos.x - g.player.pos.x, v.pos.z - g.player.pos.z) > 40) v.recycle = true;
    if (fwd > 4) this._rerouted = false;
    ctl.steer = clamp(steer, -1, 1);
    const dv = desired - fwd;
    ctl.throttle = dv > 1.5 ? 1 : dv < -3 ? -1 : clamp(dv * 0.4, -1, 1);
    ctl.handbrake = this.mode === 'pursue' && Math.abs(ang) > 1.2 && fwd > 12;
  }
}

