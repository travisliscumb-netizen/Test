/* =====================================================================
   [CORE] TRAFFIC MANAGER (kinematic lane-following AI with signals & yielding)
   ===================================================================== */
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// district traffic mix: weighted pick from the zone's table
function zoneVehicle(x, z) {
  const zt = zoneAt(x, z).traffic; let sum = 0;
  for (const k in zt) sum += zt[k];
  let r = Math.random() * sum;
  for (const k in zt) { r -= zt[k]; if (r <= 0) return k; }
  return 'sedan';
}
class TrafficManager {
  constructor(game) {
    this.g = game; this.cars = []; this.enabled = true; this.target = 18; this._near = []; this.linkChance = 0.4;
  }
  release(v) { const i = this.cars.indexOf(v); if (i >= 0) this.cars.splice(i, 1); }
  // danger nearby: a few cars break out of their lanes and flee (the rest brake via normal AI)
  scare(x, z, r) {
    const g = this.g; let n = 0;
    if ((this._scareT || 0) > g.time) return; this._scareT = g.time + 1.5;
    for (const v of this.cars.slice()) {
      if (n >= 3 || v.mission || v.patrol || dist2(v.pos.x, v.pos.z, x, z) > r * r) continue;
      n++; this.disturb(v, null);
      if (v.drive && v.driver === 'npc') { v.drive.wait = 0; v.drive.mode = 'flee'; v.drive.cruise = rand(16, 22); const c = g.world.randomCurbSpot(v.pos.x, v.pos.z, 300, 700); v.drive.setGoal(c.x, c.z); }
    }
  }
  validDir(i, j, dx, dz) { const a = i + dx, b = j + dz; return i >= 0 && j >= 0 && i <= N && j <= N && a >= 0 && b >= 0 && a <= N && b <= N && RoadNet.open(i, j, dx, dz); }
  // ---------------------------------------------------------------- curved links
  segKey(ai) { return ai.dx ? Links.key(1, ai.j, Math.min(ai.i, ai.i + ai.dx)) : Links.key(0, ai.i, Math.min(ai.j, ai.j + ai.dz)); }
  lanePt(i, j, dx, dz, s, off = LANE) { return [i * P + dx * s - dz * off, j * P + dz * s + dx * off]; }
  alongOf(ai, C) { return ai.dx ? (C.x - ai.i * P) * ai.dx : (C.z - ai.j * P) * ai.dz; }
  qbez(a, c, b, n) { const out = []; for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); } return out; }
  // the lattice lane a car joins at a link end, heading either way along that road
  exitState(e, sgn) {
    if (e.axis === 0) return sgn > 0 ? { i: e.line, j: e.seg, dx: 0, dz: 1, s: e.along } : { i: e.line, j: e.seg + 1, dx: 0, dz: -1, s: P - e.along };
    return sgn > 0 ? { i: e.seg, j: e.line, dx: 1, dz: 0, s: e.along } : { i: e.seg + 1, j: e.line, dx: -1, dz: 0, s: P - e.along };
  }
  // follow `lane` (link lane points) then merge onto the lattice at the far end of link L
  linkPath(v, start, lane, L, farEnd) {
    const x = this.exitState(L.ends[farEnd], Math.random() < 0.5 ? 1 : -1);
    const xs = Math.min(x.s + 10, P - TURN_IN - 0.5), ctl = this.lanePt(x.i, x.j, x.dx, x.dz, x.s), tgt = this.lanePt(x.i, x.j, x.dx, x.dz, xs);
    const pts = [...start, ...lane], mergeK = pts.length - 1;
    pts.push(...this.qbez(lane[lane.length - 1], ctl, tgt, 8));
    const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    // corner speed from the local radius (two points either side): v = sqrt(a_lat * R)
    const lim = pts.map((q, k) => {
      const a = pts[Math.max(0, k - 2)], b = pts[Math.min(pts.length - 1, k + 2)];
      const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), aq = Math.hypot(q[0] - a[0], q[1] - a[1]), qb = Math.hypot(b[0] - q[0], b[1] - q[1]);
      const cr = Math.abs((q[0] - a[0]) * (b[1] - a[1]) - (q[1] - a[1]) * (b[0] - a[0]));
      const R = cr < 1e-6 ? 1e6 : ab * aq * qb / (2 * cr);
      return clamp(Math.sqrt(3.2 * R), 4.5, 40);
    });
    const ai = v.ai;
    ai.path = { pts, cum, lim, len: cum[cum.length - 1], d: 0, k: 0, exit: { ...x, s: xs }, abeam: x.s, mergeD: cum[mergeK], link: L.id };
    ai.mode = 'path'; ai.next = null; ai.overtake = 0; ai.laneOff = 0; ai.runLight = null;
  }
  // a lattice car reaching a link junction: some turn off onto the curved road
  maybeTakeLink(v) {
    const ai = v.ai, ends = Links.idx.get(this.segKey(ai)); if (!ends || ai.linkSeen) return;
    for (const en of ends) {
      const sc = this.alongOf(ai, en.end.C);
      if (ai.s > sc - 18 && ai.s < sc - 10) {
        ai.linkSeen = 1;
        if (v.mission || v.patrol || Math.random() > this.linkChance) return;
        // a spur: out to its turning circle and back to the same junction
        const L = en.link, lane = L.spur ? Links.loop(L) : Links.lane(L, en.e), q0 = this.lanePt(ai.i, ai.j, ai.dx, ai.dz, ai.s), qc = this.lanePt(ai.i, ai.j, ai.dx, ai.dz, sc);
        this.linkPath(v, [q0, ...this.qbez(q0, qc, lane[0], 8).slice(0, -1)], lane, L, L.spur ? 0 : 1 - en.e);
        return;
      }
    }
  }
  // is a lattice car about to pass the merge point in the lane we are joining?
  mergeBlocked(v) {
    const x = v.ai.path.exit;
    for (const c of this.cars) {
      const ca = c.ai; if (!ca || c === v) continue;
      if (ca.mode === 'lane' && ca.i === x.i && ca.j === x.j && ca.dx === x.dx && ca.dz === x.dz && ca.s > v.ai.path.abeam - 30 && ca.s < v.ai.path.abeam + 6) return true;
    }
    return false;
  }
  trySpawnLink() {
    const g = this.g, px = g.focus.x, pz = g.focus.z;
    // only curved roads within spawning range: with several links in the city, a random pick would
    // almost never be the one near the player
    const near = Links.list.filter(L => L.pts.some(q => { const d = Math.hypot(q[0] - px, q[1] - pz); return d > 75 && d < 230; }));
    const L = pick(near); if (!L) return null;
    const from = L.spur ? 0 : Math.random() < 0.5 ? 0 : 1, lane = L.spur ? Links.loop(L) : Links.lane(L, from);
    const k = Math.floor(rand(0.1, 0.8) * lane.length), [x, z] = lane[k];
    const d = Math.hypot(x - px, z - pz);
    if (d < 75 || d > 230 || (d < 160 && g.inView(x, 1, z, 3))) return null;
    for (const v of g.vehicles.list) if (dist2(v.pos.x, v.pos.z, x, z) < 15 * 15) return null;
    const type = zoneVehicle(x, z), b = lane[Math.min(lane.length - 1, k + 1)];
    const v = g.vehicles.spawn(type, x, z, Math.atan2(b[0] - x, b[1] - z), { kinematic: true, driver: 'npc' });
    const r0 = Math.random(), pers = r0 < 0.25 ? 0 : r0 < 0.8 ? 1 : 2, pk = [[0.85, 1.5, 0.3, 1.4], [1, 1, 1, 1], [1.15, 0.55, 2.5, 0.6]][pers];
    v.ai = { i: 0, j: 0, dx: 1, dz: 0, s: 0, mode: 'path', t: 0, len: 1, speed: 8, pers, gapK: pk[3], runK: pk[2], maxV: rand(11, 14.5) * pk[0] * (type === 'truck' ? 0.8 : 1), react: rand(0.25, 1.1) * pk[1], reactT: 0, runLight: null, next: null, blockT: 0, honkT: rand(0, 2) * pk[1], laneOff: 0, overtake: 0, creepT: 0, p0: null, linkSeen: 1 };
    this.linkPath(v, [], lane.slice(k), L, L.spur ? 0 : 1 - from);
    v.patrol = false;
    this.cars.push(v);
    return v;
  }
  trySpawn() {
    const g = this.g, px = g.focus.x, pz = g.focus.z;
    if (Links.list.length && Math.random() < 0.18) { const v = this.trySpawnLink(); if (v) return v; }
    for (let tries = 0; tries < 14; tries++) {
      const i = clamp(Math.round(px / P) + randi(-3, 3), 0, N), j = clamp(Math.round(pz / P) + randi(-3, 3), 0, N);
      const [dx, dz] = pick(DIRS);
      if (!this.validDir(i, j, dx, dz)) continue;
      const s = rand(TURN_IN + 4, P - TURN_IN - 10);
      const x = i * P + dx * s - dz * LANE, z = j * P + dz * s + dx * LANE;
      const d = Math.hypot(x - px, z - pz);
      if (d < 75 || d > 230) continue;
      if (d < 160 && g.inView(x, 1, z, 3)) continue;
      let ok = true;
      for (const v of g.vehicles.list) if (dist2(v.pos.x, v.pos.z, x, z) < 15 * 15) { ok = false; break; }
      if (!ok) continue;
      let type = zoneVehicle(x, z);
      const zn = zoneAt(x, z);
      // night racers prowl the industrial east
      const racer = g.env.night > 0.6 && (zn === ZONES.s || zn === ZONES.h) && Math.random() < 0.12;
      if (racer) type = pick(['sports', 'muscle', 'sports']);
      const pm = g.uw ? g.uw.cops.patrolMul(x, z) : 1;
      if (Math.random() < 0.07 * zn.cops * pm && g.police.level === 0 && this.cars.filter(c => c.type === 'police').length < Math.round(2 * Math.min(2, pm))) type = 'police';
      // gang cars cruise their own turf
      let fac = null;
      if (type !== 'police' && g.uw) { const own = g.uw.owner[turfAt(x, z)]; if (own && own !== 'pc' && FACTIONS[own] && !g.uw.S.factions[own].broken && Math.random() < 0.18) { fac = own; type = pick(FACTIONS[own].cars); } }
      const edge = i === 0 || i === N || j === 0 || j === N;
      const v = g.vehicles.spawn(type, x, z, Math.atan2(dx, dz), { kinematic: true, driver: 'npc' });
      // driver personality: cautious, normal or aggressive
      const r0 = Math.random(), pers = racer || fac ? 2 : r0 < 0.25 ? 0 : r0 < 0.8 ? 1 : 2;
      const pk = [[0.85, 1.5, 0.3, 1.4], [1, 1, 1, 1], [1.15, 0.55, 2.5, 0.6]][pers];
      v.ai = { i, j, dx, dz, s, mode: 'lane', t: 0, len: 1, speed: 8, pers, gapK: pk[3], runK: pk[2], maxV: rand(11, 14.5) * pk[0] * (edge ? 1.18 : 1) * (type === 'sports' ? 1.15 : 1) * (racer ? 1.3 : 1) * (type === 'truck' ? 0.8 : 1), react: rand(0.25, 1.1) * pk[1], reactT: 0, runLight: null, next: null, blockT: 0, honkT: rand(0, 2) * pk[1], laneOff: 0, overtake: 0, creepT: 0, p0: null };
      if (fac) { v.fac = fac; const cc = FACTIONS[fac].carCol; v.colorHex = pick(cc); v.mat.userData.u.uPaint.value.setHex(v.colorHex); v.mat.userData.u.uPaint2.value.setHex(FACTIONS[fac].hex); }
      v.patrol = type === 'police';
      this.cars.push(v);
      return v;
    }
    return null;
  }
  chooseNext(ai) {
    const Bi = ai.i + ai.dx, Bj = ai.j + ai.dz;
    const opts = [];
    const st = [ai.dx, ai.dz], rt = [-ai.dz, ai.dx], lt = [ai.dz, -ai.dx];
    if (this.validDir(Bi, Bj, st[0], st[1])) opts.push([st, 0, 0.55]);
    if (this.validDir(Bi, Bj, rt[0], rt[1])) opts.push([rt, 1, 0.25]);
    if (this.validDir(Bi, Bj, lt[0], lt[1])) opts.push([lt, 2, 0.2]);
    if (!opts.length) return { d: [-ai.dx, -ai.dz], type: 3 };
    let sum = 0; for (const o of opts) sum += o[2];
    let r = Math.random() * sum;
    for (const o of opts) { r -= o[2]; if (r <= 0) return { d: o[0], type: o[1] }; }
    return { d: opts[0][0], type: opts[0][1] };
  }
  beginTurn(v) {
    const ai = v.ai;
    if (!ai.next) ai.next = this.chooseNext(ai);
    const Bx = (ai.i + ai.dx) * P, Bz = (ai.j + ai.dz) * P;
    const [ndx, ndz] = ai.next.d;
    const ex = Bx - ai.dx * TURN_IN - ai.dz * LANE, ez = Bz - ai.dz * TURN_IN + ai.dx * LANE;
    const xx = Bx + ndx * TURN_IN - ndz * LANE, xz = Bz + ndz * TURN_IN + ndx * LANE;
    let cx, cz;
    if (ai.next.type === 0) { cx = (ex + xx) / 2; cz = (ez + xz) / 2; }
    else if (ai.next.type === 3) { cx = Bx; cz = Bz; }
    else { const k = (xx - ex) * ai.dx + (xz - ez) * ai.dz; cx = ex + ai.dx * k; cz = ez + ai.dz * k; }
    ai.p0 = [ex, ez, cx, cz, xx, xz];
    let len = 0, lx = ex, lz = ez;
    for (let k = 1; k <= 8; k++) { const t = k / 8; const q = this.bez(ai.p0, t); len += Math.hypot(q[0] - lx, q[1] - lz); lx = q[0]; lz = q[1]; }
    ai.len = Math.max(1, len); ai.t = 0; ai.mode = 'turn';
  }
  bez(p, t) { const u = 1 - t; return [u * u * p[0] + 2 * u * t * p[2] + t * t * p[4], u * u * p[1] + 2 * u * t * p[3] + t * t * p[5]]; }
  bezT(p, t) { const u = 1 - t; return [2 * u * (p[2] - p[0]) + 2 * t * (p[4] - p[2]), 2 * u * (p[3] - p[1]) + 2 * t * (p[5] - p[3])]; }
  disturb(v, by) {
    if (v.mode !== 'kin') return;
    const g = this.g;
    this.release(v);
    const sp = v.ai ? v.ai.speed : 0;
    v.vel.set(Math.sin(v.h) * sp, Math.cos(v.h) * sp);
    v.ai = null; v.mode = 'phys'; v.sleep = false; v.touched = true; v.aiBrake = false;
    v.ctl.throttle = 0; v.ctl.steer = 0; v.ctl.handbrake = false;
    const byPlayer = by && (by.driver === 'player' || by === g.player);
    if (v.type === 'police' && v.patrol) {
      g.police.adoptUnit(v);
      if (byPlayer) g.police.crime('ramcop', v.pos.x, v.pos.z);
      return;
    }
    if (v.driver === 'npc') {
      v.drive = new DriveAI(v, g, 'cruise');
      v.drive.wait = rand(1.2, 2.6);
      if (byPlayer) {
        if (Math.random() < 0.3) { v.drive.bail = true; }
        else { v.drive.cruise = rand(18, 24); v.drive.mode = 'flee'; v.drive.fleeFrom = g.player.pos; }
        setTimeout(() => { if (v.driver === 'npc' && g.vehicles.list.includes(v)) g.audio.play('horn', { x: v.pos.x, z: v.pos.z, dur: 0.8 }); }, 700);
      }
      const c = g.world.randomCurbSpot(v.pos.x, v.pos.z, 200, 600);
      v.drive.setGoal(c.x, c.z);
    }
  }
  update(dt, frame) {
    const g = this.g;
    if (!this.enabled) { for (const v of this.cars.slice()) g.vehicles.despawn(v); return; }
    const fx = g.focus.x, fz = g.focus.z;
    // despawn
    for (let k = this.cars.length - 1; k >= 0; k--) {
      const v = this.cars[k];
      const d = Math.hypot(v.pos.x - fx, v.pos.z - fz);
      if ((d > 260 || (d > 170 && !g.inView(v.pos.x, 1, v.pos.z, 3)) || v.recycle) && !v.mission) g.vehicles.despawn(v);
    }
    let want = this.target * g.env.trafficMul * (g.save.settings.traffic ?? 1);
    if (this.cars.length < want && Math.random() < 0.6) this.trySpawn();
    // density lowered (setting, night): thin out promptly, but only cars nobody can see
    else if (this.cars.length > want + 2) {
      for (let k = this.cars.length - 1; k >= 0; k--) { const v = this.cars[k]; if (!v.mission && !g.inView(v.pos.x, 1, v.pos.z, 3) && Math.hypot(v.pos.x - fx, v.pos.z - fz) > 60) { g.vehicles.despawn(v); break; } }
    }
    const dyn = g.dyn;
    for (let k = 0; k < this.cars.length; k++) {
      const v = this.cars[k];
      const d = Math.hypot(v.pos.x - fx, v.pos.z - fz);
      const skip = d > 150 ? 3 : d > 90 ? 2 : 1;
      v.aiAcc = (v.aiAcc || 0) + dt;
      if ((frame + k) % skip !== 0) continue;
      const step = Math.min(v.aiAcc, 0.15); v.aiAcc = 0;
      this.updateCar(v, step, d < 120, dyn);
    }
  }
  updateCar(v, dt, fine, dyn) {
    const g = this.g, ai = v.ai, s = v.spec;
    let vAllow = ai.maxV * (g.env.rain > 0.5 ? 0.85 : 1);
    let lightStop = false;
    if (ai.mode === 'lane') this.maybeTakeLink(v);
    const Bi = ai.i + ai.dx, Bj = ai.j + ai.dz;
    if (ai.mode === 'path') {
      // curved road: brake ahead of bends, wait for a gap before merging back onto the lattice
      const pa = ai.path;
      vAllow = Math.min(vAllow, ai.maxV * 0.92);
      for (let k = pa.k; k < pa.pts.length && pa.cum[k] - pa.d < 45; k++) { const va = Math.sqrt(pa.lim[k] * pa.lim[k] + 2 * 4.5 * Math.max(0, pa.cum[k] - pa.d)); if (va < vAllow) vAllow = va; }
      // a car stopped in the merge zone (a queue at a light) must not hold us forever: after a few
      // seconds we nose out anyway and the obstacle check keeps us off its bumper
      if (pa.d < pa.mergeD && pa.mergeD - pa.d < 24 && (pa.waitT || 0) < 6 && this.mergeBlocked(v)) {
        const va = Math.sqrt(2 * 5 * Math.max(0, pa.mergeD - pa.d - 1.5)); if (va < vAllow) { vAllow = va; lightStop = true; }
        if (ai.speed < 0.5) pa.waitT = (pa.waitT || 0) + dt;
      }
    } else if (ai.mode === 'lane') {
      const remain = P - TURN_IN - ai.s;
      if (!ai.next && remain < 35) ai.next = this.chooseNext(ai);
      if (ai.next && ai.next.type !== 0 && remain < 28) vAllow = Math.min(vAllow, 6.5 + remain * 0.32);
      // signals only where three or more roads meet (a bend or a straight-through has none)
      const corner = !RoadNet.isJunction(Bi, Bj);
      if (!corner) {
        const axis = ai.dx !== 0 ? 1 : 0;
        const st = Signals.state(Bi, Bj, axis);
        const stopS = P - 11.2 - s.l / 2;
        const dStop = stopS - ai.s;
        if (st !== 0 && dStop > -0.3) {
          if (ai.runLight === null) ai.runLight = Math.random() < (st === 1 ? 0.22 : 0.015) * (ai.runK || 1);
          const canStop = dStop > (ai.speed * ai.speed) / (2 * 6.5);
          if (!ai.runLight && (st === 2 || canStop)) { const va = Math.sqrt(2 * 5.5 * Math.max(0, dStop)); if (va < vAllow) { vAllow = va; lightStop = true; } }
        } else if (st === 0) ai.runLight = null;
        // left turns yield to oncoming traffic
        if (ai.next && ai.next.type === 2 && remain < 6) {
          for (const c of this.cars) {
            const ca = c.ai; if (!ca || c === v || ca.mode !== 'lane') continue;
            if (ca.i + ca.dx === Bi && ca.j + ca.dz === Bj && ca.dx === -ai.dx && ca.dz === -ai.dz && P - ca.s < 34 && ca.speed > 1.5) {
              const va = Math.sqrt(2 * 5 * Math.max(0, remain - 1)); if (va < vAllow) { vAllow = va; lightStop = true; } break;
            }
          }
        }
      }
    } else vAllow = Math.min(vAllow, ai.next && ai.next.type !== 0 ? 7.5 : vAllow);
    // obstacles ahead (vehicles, people, the player)
    const fx = Math.sin(v.h), fz = Math.cos(v.h), rx = -fz, rz = fx;
    const look = 7 + ai.speed * 1.5;
    const near = dyn.query(v.pos.x + fx * look * 0.5, v.pos.z + fz * look * 0.5, look * 0.5 + 4, this._near);
    let blocker = null;
    for (const e of near) {
      if (e.ref === v) continue;
      const dx = e.x - v.pos.x, dz = e.z - v.pos.z;
      const fwd = dx * fx + dz * fz; if (fwd <= 0) continue;
      const lat = dx * rx + dz * rz;
      let halfLat = e.r, halfLong = e.r;
      if (e.veh) { const dh = e.ref.h - v.h; const c = Math.abs(Math.cos(dh)), sn = Math.abs(Math.sin(dh)); halfLat = c * e.ref.spec.w / 2 + sn * e.ref.spec.l / 2; halfLong = c * e.ref.spec.l / 2 + sn * e.ref.spec.w / 2; }
      if (Math.abs(lat) > s.w / 2 + halfLat + 0.15) continue;
      if (fwd > look + halfLong) continue;
      const gap = fwd - s.l / 2 - halfLong;
      const va = Math.sqrt(2 * 6.5 * Math.max(0, gap - 1.6 * (ai.gapK || 1)));
      if (va < vAllow) { vAllow = va; blocker = e; }
    }
    // reaction time from standstill
    if (ai.speed < 0.3 && vAllow > 2) { ai.reactT += dt; if (ai.reactT < ai.react) vAllow = 0; }
    else if (ai.speed > 0.6) ai.reactT = 0;
    // blocked handling: honk, then creep / overtake
    if (blocker && ai.speed < 0.5 && !lightStop) {
      ai.blockT += dt;
      ai.honkT -= dt;
      if (ai.blockT > 2.2 && ai.honkT <= 0 && fine) { ai.honkT = rand(2.5, 5); if (Math.random() < 0.7) g.audio.play('horn', { x: v.pos.x, z: v.pos.z, dur: rand(0.2, 0.7), pitch: rand(0.85, 1.15) }); }
      if (ai.blockT > 5 && ai.mode === 'lane' && P - TURN_IN - ai.s > 22 && !ai.overtake) {
        const b = blocker.ref; const still = !b || (b.speed !== undefined ? b.speed < 0.5 : true);
        if (still) { ai.overtake = 1; ai.blockT = 0; }
      }
      if (ai.blockT > 9) { ai.creepT = 1.6; ai.blockT = 0; }
      ai.jamT = (ai.jamT || 0) + dt;
    } else if (ai.speed > 1) { ai.blockT = 0; ai.jamT = 0; }
    // last resort for a permanent jam: recycle the car, but only where nobody can see it
    if (ai.jamT > 30 && !v.mission && !g.inView(v.pos.x, 1, v.pos.z, 3) && Math.hypot(v.pos.x - g.player.pos.x, v.pos.z - g.player.pos.z) > 40) { v.recycle = true; }
    if (ai.creepT > 0) { ai.creepT -= dt; vAllow = Math.max(vAllow, 2.5); }
    // overtake lane offset
    const remainL = P - TURN_IN - ai.s;
    let laneTarget = ai.overtake ? -LANE * 2 : 0;
    if (ai.mode !== 'lane' || remainL < 14) { laneTarget = 0; ai.overtake = 0; }
    if (ai.overtake) { ai.overtake += dt; if (ai.overtake > 5) ai.overtake = 0; }
    ai.laneOff = damp(ai.laneOff, laneTarget, 1.6, dt);
    // speed integration
    const accel = 2.6 + s.power / s.mass * 0.15;
    if (ai.speed < vAllow) ai.speed = Math.min(vAllow, ai.speed + accel * dt);
    else ai.speed = Math.max(vAllow, ai.speed - (vAllow < ai.speed - 3 ? 10 : 6) * dt);
    v.aiBrake = vAllow < ai.speed - 0.2 || (ai.speed < 0.2 && vAllow < 0.5);
    // advance along path
    if (ai.mode === 'lane') {
      ai.s += ai.speed * dt;
      if (ai.s >= P - TURN_IN) this.beginTurn(v);
    }
    if (ai.mode === 'turn') {
      ai.t += ai.speed * dt / ai.len;
      if (ai.t >= 1) {
        const over = (ai.t - 1) * ai.len;
        ai.i = Bi; ai.j = Bj; ai.dx = ai.next.d[0]; ai.dz = ai.next.d[1];
        ai.s = TURN_IN + over; ai.mode = 'lane'; ai.next = null; ai.runLight = null; ai.linkSeen = 0;
      }
    }
    if (ai.mode === 'path') {
      const pa = ai.path;
      pa.d += ai.speed * dt;
      while (pa.k < pa.pts.length - 2 && pa.cum[pa.k + 1] <= pa.d) pa.k++;
      if (pa.d >= pa.len) { const x = pa.exit; ai.i = x.i; ai.j = x.j; ai.dx = x.dx; ai.dz = x.dz; ai.s = x.s; ai.mode = 'lane'; ai.path = null; ai.next = null; ai.laneOff = 0; ai.linkSeen = 1; v._lo = undefined; }
    }
    // resolve pose
    let x, z, h, steer = 0;
    if (ai.mode === 'path') {
      const pa = ai.path, a = pa.pts[pa.k], b = pa.pts[pa.k + 1], t = clamp((pa.d - pa.cum[pa.k]) / Math.max(1e-6, pa.cum[pa.k + 1] - pa.cum[pa.k]), 0, 1);
      x = a[0] + (b[0] - a[0]) * t; z = a[1] + (b[1] - a[1]) * t;
      // heading blends toward the next segment so the car turns smoothly through each vertex
      const c = pa.pts[Math.min(pa.pts.length - 1, pa.k + 2)], h0 = Math.atan2(b[0] - a[0], b[1] - a[1]), h1 = Math.atan2(c[0] - b[0], c[1] - b[1]);
      h = h0 + wrapPi(h1 - h0) * t;
      steer = clamp(wrapPi(h1 - h0) * 3, -0.45, 0.45);
    } else if (ai.mode === 'lane') {
      const off = LANE + ai.laneOff;
      x = ai.i * P + ai.dx * ai.s - ai.dz * off; z = ai.j * P + ai.dz * ai.s + ai.dx * off;
      const latV = (ai.laneOff - (v._lo === undefined ? ai.laneOff : v._lo)) / Math.max(dt, 1e-3);
      h = Math.atan2(ai.dx, ai.dz) + Math.atan2(-latV, Math.max(ai.speed, 2));
      v._lo = ai.laneOff;
    } else {
      const q = this.bez(ai.p0, ai.t), tg = this.bezT(ai.p0, ai.t);
      x = q[0]; z = q[1]; h = Math.atan2(tg[0], tg[1]);
      steer = ai.next.type === 1 ? -0.45 : ai.next.type === 2 ? 0.4 : 0;
    }
    const prevVf = ai.speed;
    v.pos.x = x; v.pos.z = z;
    v.yawRate = wrapPi(h - v.h) / Math.max(dt, 1e-3);
    v.h = h;
    v.vel.set(Math.sin(h) * ai.speed, Math.cos(h) * ai.speed);
    v.steer = damp(v.steer, steer, 6, dt);
    v.spin += ai.speed * dt / s.wheelR;
    const aLong = (ai.speed - (v.lastVf || 0)) / Math.max(dt, 1e-3); v.lastVf = prevVf;
    const pT = clamp(-aLong * 0.006 * s.soft, -0.06, 0.06);
    v.pitch = damp(v.pitch, pT, 6, dt); v.roll = damp(v.roll, clamp(v.yawRate * ai.speed * 0.008, -0.06, 0.06), 6, dt);
    v.rpm = clamp(0.2 + ai.speed / s.vmax * 2, 0.2, 0.9);
    v.syncMesh(dt);
  }
}

