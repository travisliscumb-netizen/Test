/* =====================================================================
   [CORE] POLICE MANAGER (heat levels, perception, pursuit, search, arrests)
   ===================================================================== */
const HEAT_LEVELS = [0, 1, 4, 10, 20, 34];
const CRIMES = { hitped: 2, assault: 1.5, shoot: 1, carjack: 2, stealcop: 6, ramcop: 3, hitcop: 5, shootcop: 6, copcar: 8, explosion: 4, koped: 3, theft: 1, deal: 2, pickpocket: 1, robbery: 3, burglary: 1.5, escape: 5 };
const UNITS_PER_LEVEL = [0, 2, 3, 5, 7, 9];
class PoliceManager {
  constructor(game) {
    this.g = game; this.level = 0; this.heat = 0; this.units = []; this.cops = [];
    this.lastSeen = { x: 0, z: 0 }; this.seenT = 0; this.visible = false; this.percT = 0; this.spawnT = 0;
    this.enabled = true; this.bust = 0; this.pending = []; this.roadblockT = 20; this.roadblocks = []; this.shootT = 0;
    this.lockLevel = 0; this.dispatchT = 0; this.joinT = 0; this.joins = { moving: 0, parked: 0, foot: 0 };
    this._buildHeli();
  }
  _buildHeli() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8).scale(1.3, 1.1, 2.2), new THREE.MeshStandardMaterial({ color: 0x1b2a44, roughness: 0.4, metalness: 0.5 }));
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 4.5), body.material); tail.position.set(0, 0.3, -3.6);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.8), body.material); fin.position.set(0, 0.8, -5.6);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 6).scale(1.1, 0.8, 1.2), new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 0.05, metalness: 0.9 })); glass.position.set(0, 0.3, 1.2);
    this.rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.06, 0.35), new THREE.MeshStandardMaterial({ color: 0x111111 })); this.rotor.position.y = 1.35;
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3.2), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    const s1 = skid.clone(); s1.position.set(0.9, -1.2, 0); const s2 = skid.clone(); s2.position.set(-0.9, -1.2, 0);
    g.add(body, tail, fin, glass, this.rotor, s1, s2);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.heliLight = new THREE.SpotLight(0xdfe8ff, 0, 120, 0.22, 0.6, 1.2);
    this.heliLight.position.set(0, -1, 0.5); g.add(this.heliLight); g.add(this.heliLight.target);
    g.visible = false;
    this.heli = { g, active: false, x: 0, z: 0, y: 60, vx: 0, vz: 0 };
    this.g.scene.add(g);
  }
  get escapeTime() { return [0, 12, 16, 21, 26, 32][this.level] * (this.g.uw ? this.g.uw.cops.escapeMul() : 1); }
  get searchRadius() { return 35 + this.seenT * 5; }
  crime(type, x, z) {
    const g = this.g;
    if (!this.enabled) return;
    let sev = CRIMES[type] || 1;
    // the retired undercover car you earn at the end of the story draws less attention
    const pv = g.player.state === 'vehicle' ? g.player.vehicle : null;
    if (pv && pv.type === 'unmarked' && pv.garageUid && (type === 'theft' || type === 'ramcop' || type === 'hitped')) sev *= 0.5;
    if (type === 'shoot') { if (this._shootCD > 0) return; this._shootCD = 3; }
    // police witnesses
    const witnessed = this.copCanSee(x, z, 75) || this.level > 0 && this.visible;
    if (g.uw) g.uw.onCrime(type, sev, witnessed, x, z);
    if (witnessed) { this.addHeat(sev, x, z); return; }
    // civilian witnesses: they must actually see it; then each one observes, flees, ignores it or
    // calls it in. A caller who is knocked down or chased off before the call connects never calls.
    if (sev >= 1 && !(type === 'shoot' && this.pending.some(c => c.type === 'shoot'))) {
      const grid = g.world.grid, callMul = g.uw ? g.uw.cops.witnessCallMul(x, z) : 1;
      let looked = 0;
      for (const p of g.peds.peds) {
        if (p.kind !== 'civ' || p.state === 'down' || p.called || looked > 8) continue;
        if (dist2(p.x, p.z, x, z) > 38 * 38) continue;
        looked++;
        if (!grid.lineOfSight(p.x, p.y + 1.6, p.z, x, 1.2, z)) continue;
        // personality: some people always call, some never do, most depend on how bad it was
        const nature = hash2i(p.id, 7, 3);
        const callP = clamp((nature < 0.15 ? 0.95 : nature > 0.8 ? 0.05 : 0.35 + sev * 0.18) * callMul * (1 - g.env.night * 0.25), 0, 0.98);
        if (Math.random() < callP) {
          p.called = true; p.state = 'flee'; p.timer = rand(5, 8); p.fleeFrom = { x, z }; p.pose.phone = true;
          this.pending.push({ t: rand(3, 5.5), sev: Math.min(sev, 2), x, z, type, by: p });
          break;
        } else if (p.state === 'walk' || p.state === 'idle') { p.state = Math.random() < 0.5 ? 'flee' : 'cower'; p.timer = rand(3, 6); p.fleeFrom = { x, z }; }
      }
    }
  }
  copCanSee(x, z, range) {
    const grid = this.g.world.grid;
    for (const u of this.units) if (!u.v.burnt && dist2(u.v.pos.x, u.v.pos.z, x, z) < range * range && grid.lineOfSight(u.v.pos.x, 1.5, u.v.pos.z, x, 1.2, z)) return true;
    for (const c of this.cops) if (c.state !== 'down' && dist2(c.x, c.z, x, z) < range * range && grid.lineOfSight(c.x, 1.6, c.z, x, 1.2, z)) return true;
    for (const v of this.g.traffic.cars) if (v.patrol && dist2(v.pos.x, v.pos.z, x, z) < range * range && grid.lineOfSight(v.pos.x, 1.5, v.pos.z, x, 1.2, z)) { this.adoptUnit(v); return true; }
    return false;
  }
  addHeat(pts, x, z) {
    const g = this.g;
    const prev = this.level;
    this.heat += pts;
    let lvl = 0; for (let i = 0; i < HEAT_LEVELS.length; i++) if (this.heat >= HEAT_LEVELS[i]) lvl = i;
    lvl = Math.max(lvl, prev, pts > 0 ? 1 : 0);
    this.level = Math.min(5, lvl);
    this.lastSeen.x = g.player.pos.x; this.lastSeen.z = g.player.pos.z; this.seenT = 0; this.visible = true;
    if (this.level > prev) {
      g.audio.play('wanted');
      this.radio(this.level);
      g.save.stats.maxWanted = Math.max(g.save.stats.maxWanted, this.level);
      if (prev === 0) this.spawnT = g.uw ? g.uw.cops.dispatchDelay(this.level, g.player.pos.x, g.player.pos.z) : 0;
      if (g.uw) g.uw.cops.onWanted(this.level);
    }
    // investigation: remember what the suspect was driving
    this.seenVeh = g.player.state === 'vehicle' ? g.player.vehicle : null;
    void x; void z;
  }
  setLevel(l) { this.heat = HEAT_LEVELS[clamp(l, 0, 5)]; if (l > 0) this.addHeat(0.001); else this.clear(); this.level = clamp(l, 0, 5); }
  radio(level) {
    const g = this.g;
    const area = districtNameAt(g.player.pos.x, g.player.pos.z);
    const lines = [
      '', `Dispatch: reports of a disturbance in ${area}. Nearby unit, take a look.`,
      `Dispatch: suspect fleeing in ${area}. All units in the area respond.`,
      `Dispatch: shots and pursuit in ${area}. Additional units en route.`,
      `Dispatch: suspect armed and dangerous. Set up roadblocks around ${area}.`,
      `Dispatch: maximum response authorized. Air unit is airborne.`
    ];
    if (lines[level]) { g.ui.toast(lines[level], 'radio'); g.audio.play('radio', { gain: 0.7 }); }
  }
  clear(msg) {
    const g = this.g;
    if (this.level > 0 && msg) { g.ui.toast(msg, 'money'); g.audio.play('confirm'); }
    this.level = 0; this.heat = 0; this.bust = 0; this.visible = false; this.pending.length = 0;
    for (const u of this.units) { u.v.siren = false; if (u.v.drive) { u.v.drive.target = null; u.v.drive.mode = 'cruise'; const c = g.world.randomCurbSpot(u.v.pos.x, u.v.pos.z, 300, 800); u.v.drive.setGoal(c.x, c.z); u.v.drive.cruise = 13; } u.standDown = true; }
    for (const c of this.cops) { c.brain = copStandDown; }
    for (const rb of this.roadblocks) rb.t = Math.min(rb.t, 5);
    this.heli.active = false;
  }
  adoptUnit(v) {
    if (this.units.find(u => u.v === v)) return;
    const g = this.g;
    if (v.mode === 'kin') { g.traffic.release(v); v.mode = 'phys'; v.ai = null; v.vel.set(Math.sin(v.h) * 8, Math.cos(v.h) * 8); }
    v.driver = 'cop'; v.patrol = false; v.touched = true; v.sleep = false;
    v.drive = new DriveAI(v, g, 'pursue'); v.drive.cruise = 26;
    // roles: the first two chase; after that units alternate between intercepting ahead of the player and
    // flanking down a parallel street, so a big pursuit spreads out instead of queueing bumper to bumper
    const n = this.units.filter(x => !x.standDown).length;
    const unit = { v, cops: [], dismounted: false, crew: 2, standDown: false, role: n < 2 ? 'chase' : ['intercept', 'flank', 'chase'][(n - 2) % 3], offset: rand(-1, 1) < 0 ? -1 : 1 };
    v.drive.target = () => this.unitTarget(unit);
    v.drive.targetRef = g.player.vehicle || g.player;
    this.units.push(unit);
  }
  unitTarget(u) {
    const g = this.g, p = g.player, v = u.v;
    const lvl = this.level;
    const sp = 18 + lvl * 4.5;
    if (this.visible) {
      let tx = p.pos.x, tz = p.pos.z;
      const pv = p.vehicle && p.state === 'vehicle' ? p.vehicle : null;
      const d = Math.hypot(tx - v.pos.x, tz - v.pos.z);
      if (pv && u.role === 'intercept' && lvl >= 2 && d > 25) { tx += pv.vel.x * 2.2; tz += pv.vel.y * 2.2; }
      // flank: aim at a point a block to one side of where the player is heading; the route there runs down a
      // parallel street, and it closes in once it is near
      if (pv && u.role === 'flank' && d > 45) { const sp2 = Math.hypot(pv.vel.x, pv.vel.y) || 1, fx = pv.vel.x / sp2, fz = pv.vel.y / sp2; tx = clamp(tx + fx * 60 - fz * P * 0.75 * u.offset, 10, CITY - 10); tz = clamp(tz + fz * 60 + fx * P * 0.75 * u.offset, 10, CITY - 10); return { x: tx, z: tz, speed: sp }; }
      if (d < 45 && g.world.grid.lineOfSight(v.pos.x, 1, v.pos.z, p.pos.x, 1, p.pos.z)) {
        const ram = lvl >= 3;
        const close = d < 14 && !pv;
        return { x: tx, z: tz, direct: true, speed: close ? Math.max(0, d - 8) * 0.8 : ram ? sp : Math.min(sp, 6 + d * 0.6) };
      }
      return { x: tx, z: tz, speed: sp };
    }
    // search mode: sweep around the last known position
    if (!u.searchPt || dist2(v.pos.x, v.pos.z, u.searchPt.x, u.searchPt.z) < 18 * 18) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * this.searchRadius;
      u.searchPt = { x: clamp(this.lastSeen.x + Math.cos(a) * r, 0, CITY), z: clamp(this.lastSeen.z + Math.sin(a) * r, 0, CITY) };
    }
    return { x: u.searchPt.x, z: u.searchPt.z, speed: 14 };
  }
  // the most units a pursuit may have at once: the level's quota plus two that happened to be passing
  get unitCap() { return UNITS_PER_LEVEL[this.level] + 2; }
  // reaction time and how far a unit notices the chase, by wanted level (higher = faster, further)
  joinParams() { const L = this.level; return { delay: [0, 1.6, 1.1, 0.75, 0.45, 0.3][L], range: [0, 45, 55, 70, 85, 100][L] * (1 - this.g.env.night * 0.2) * (1 - this.g.env.fog * 0.3) }; }
  // make room for a closer unit when the pursuit is at its cap: the furthest unit stands down
  makeRoom(x, z) {
    const live = this.units.filter(u => !u.standDown && !u.v.burnt);
    if (live.length < this.unitCap) return true;
    let far = null, fd = 0; for (const u of live) { const d = Math.hypot(u.v.pos.x - x, u.v.pos.z - z); if (d > fd) { fd = d; far = u; } }
    const p = this.g.player, dn = Math.hypot(p.pos.x - x, p.pos.z - z), df = far ? Math.hypot(p.pos.x - far.v.pos.x, p.pos.z - far.v.pos.z) : 0;
    if (!far || df < dn + 40) return false;
    this.standDownUnit(far); return true;
  }
  standDownUnit(u) {
    const g = this.g; u.standDown = true; u.v.siren = false;
    if (u.v.drive) { u.v.drive.target = null; u.v.drive.mode = 'cruise'; const c = g.world.randomCurbSpot(u.v.pos.x, u.v.pos.z, 300, 800); u.v.drive.setGoal(c.x, c.z); u.v.drive.cruise = 13; }
  }
  joinScan(step) {
    const g = this.g, p = g.player, grid = g.world.grid;
    // any unit that sees a wanted suspect joins, whether or not the rest of the pursuit still has eyes on them
    if (p.interior || this.level <= 0) return;
    const { delay, range } = this.joinParams(), px = p.pos.x, pz = p.pos.z, r2 = range * range;
    const sees = (x, y, z, rr) => dist2(x, z, px, pz) < rr * rr && (dist2(x, z, px, pz) < 18 * 18 || grid.lineOfSight(x, y, z, px, p.pos.y + 1.2, pz));
    // patrols in traffic: siren on, peel off and join (or intercept)
    for (const v of g.traffic.cars) {
      if (!v.patrol || v.burnt) continue;
      if (dist2(v.pos.x, v.pos.z, px, pz) > r2 || !sees(v.pos.x, 1.5, v.pos.z, range)) { v.joinT = 0; continue; }
      v.joinT = (v.joinT || 0) + step;
      if (v.joinT < delay || !this.makeRoom(v.pos.x, v.pos.z)) continue;
      this.adoptUnit(v); v.siren = true; this.joins.moving++; this.visible = true; this.seenT = 0; this.lastSeen.x = px; this.lastSeen.z = pz;
      if (this.joins.moving + this.joins.parked < 4 || Math.random() < 0.3) g.ui.toast(pick(['Unit on the corner: “I’ve got eyes on the suspect, joining.”', 'Patrol car: “Suspect just passed me. In pursuit.”', 'Dispatch: nearby unit is joining the pursuit.']), 'radio');
      return; // one at a time
    }
    // staffed police cars parked at the kerb or the precinct: they pull out and join
    for (const v of g.vehicles.list) {
      if (v.type !== 'police' || !v.parked || v.roadblock || v.mission || v.garageUid || v.burnt || v === p.vehicle || v.driver === 'player' || this.units.some(u => u.v === v)) continue;
      // not every parked car has an officer in it (the precinct lot is mostly empty cars)
      if (v.staffed === undefined) v.staffed = hash2i(Math.round(v.pos.x), Math.round(v.pos.z), 91) < 0.45;
      if (!v.staffed) continue;
      if (!sees(v.pos.x, 1.4, v.pos.z, range * 0.75)) { v.joinT = 0; continue; }
      v.joinT = (v.joinT || 0) + step;
      if (v.joinT < delay + 0.8 || !this.makeRoom(v.pos.x, v.pos.z)) continue;
      v.parked = false; v.sleep = false; v.mode = 'phys'; v.touched = true;
      this.adoptUnit(v); v.siren = true; v.drive.cruise = 22; this.joins.parked++; this.visible = true; this.seenT = 0; this.lastSeen.x = px; this.lastSeen.z = pz;
      g.ui.toast('A parked cruiser lights up and pulls out after you.', 'radio');
      return;
    }
    // officers on foot: they react, call it in and give chase for a while
    for (const c of this.cops) {
      if (c.state === 'down' || c.state === 'ko' || c.brain === copBrain || c.brain === copFootChase || c.unit) continue;
      if (!sees(c.x, c.y + 1.6, c.z, range * 0.7)) { c.joinT = 0; continue; }
      c.joinT = (c.joinT || 0) + step;
      if (c.joinT < delay) continue;
      c.brain = copFootChase; c.state = 'chase'; c.chaseT = 14 + this.level * 3; c.home = c.home || { x: c.x, z: c.z, h: c.postH || c.h }; this.joins.foot++;
      this.visible = true; this.seenT = 0; this.lastSeen.x = px; this.lastSeen.z = pz;
      g.ui.toast('Officer on foot: “Suspect heading past me, I’m on him!”', 'radio');
    }
  }
  spawnUnit() {
    const g = this.g, p = g.player;
    let best = null;
    for (let k = 0; k < 20; k++) {
      const i = clamp(Math.round(p.pos.x / P) + randi(-3, 3), 0, N), j = clamp(Math.round(p.pos.z / P) + randi(-3, 3), 0, N);
      const x = i * P, z = j * P;
      const d = Math.hypot(x - p.pos.x, z - p.pos.z);
      if (d < 120 || d > 260) continue;
      if (g.inView(x, 2, z, 5) && k < 15) continue;
      let blocked = false; for (const v of g.vehicles.list) if (dist2(v.pos.x, v.pos.z, x, z) < 100) { blocked = true; break; }
      if (blocked) continue;
      best = { x, z }; break;
    }
    if (!best) return;
    const h = Math.atan2(p.pos.x - best.x, p.pos.z - best.z);
    const ax = Math.abs(Math.sin(h)) > Math.abs(Math.cos(h));
    const hh = ax ? (Math.sin(h) > 0 ? Math.PI / 2 : -Math.PI / 2) : (Math.cos(h) > 0 ? 0 : Math.PI);
    const v = g.vehicles.spawn('police', best.x - Math.cos(hh) * LANE, best.z + Math.sin(hh) * LANE, hh, { driver: 'cop', speed: 10 });
    v.siren = true;
    this.adoptUnit(v);
  }
  roadblock() {
    const g = this.g, p = g.player;
    const pv = p.state === 'vehicle' ? p.vehicle : null;
    const vx = pv ? pv.vel.x : Math.sin(g.cam.yaw), vz = pv ? pv.vel.y : Math.cos(g.cam.yaw);
    const l = Math.hypot(vx, vz) || 1;
    const ax = Math.abs(vx) > Math.abs(vz);
    let x = p.pos.x + vx / l * 130, z = p.pos.z + vz / l * 130;
    if (ax) { z = Math.round(z / P) * P; x = (Math.floor(x / P) + 0.5) * P; } else { x = Math.round(x / P) * P; z = (Math.floor(z / P) + 0.5) * P; }
    if (x < 30 || z < 30 || x > CITY - 30 || z > CITY - 30) return;
    if (g.inView(x, 1, z, 6) && Math.hypot(x - p.pos.x, z - p.pos.z) < 90) return;
    const rb = { t: 45, cars: [], cops: [] };
    const across = ax ? 0 : Math.PI / 2;
    for (const off of [-2.6, 2.6]) {
      const cx = ax ? x : x + off, cz = ax ? z + off : z;
      const v = g.vehicles.spawn('police', cx, cz, across + rand(-0.35, 0.35), { driver: null, parked: true });
      v.siren = true; v.roadblock = true; v.touched = true;
      rb.cars.push(v);
      const c = this.spawnCop(cx + (ax ? -3 : rand(-1, 1)), cz + (ax ? rand(-1, 1) : -3));
      if (c) rb.cops.push(c);
    }
    this.roadblocks.push(rb);
    g.ui.toast('Dispatch: roadblock in position.', 'radio');
  }
  spawnCop(x, z) {
    const g = this.g;
    if (this.cops.length > 14) return null;
    const c = g.peds.spawnAt(x, z, 'cop', copLook(), 'chase');
    c.keep = true; c.vx = c.vz = 0; c.health = 90; c.brain = copBrain; c.fireT = rand(0.5, 1.5);
    this.cops.push(c);
    return c;
  }
  update(dt) {
    const g = this.g, p = g.player;
    this._shootCD = (this._shootCD || 0) - dt;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const c = this.pending[i]; c.t -= dt;
      // a witness who was knocked down, scared off or out of range never finishes the call
      if (c.by && (c.by.state === 'down' || c.by.state === 'ko' || !g.peds.peds.includes(c.by))) { this.pending.splice(i, 1); continue; }
      if (c.t <= 0) { this.pending.splice(i, 1); if (this.enabled) { if (this.level === 0) g.ui.toast('A witness called the police.', 'warn'); if (g.uw) g.uw.cops.crime(c.type, c.sev, true, c.x, c.z); this.addHeat(c.sev, c.x, c.z); } }
    }
    // cleanup dead/far units
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      const d = Math.hypot(u.v.pos.x - p.pos.x, u.v.pos.z - p.pos.z);
      if (!g.vehicles.list.includes(u.v)) { this.units.splice(i, 1); continue; }
      if (u.v.recycle && u.v !== p.vehicle) { g.vehicles.despawn(u.v); this.units.splice(i, 1); continue; }
      if ((u.standDown && d > 160 && !g.inView(u.v.pos.x, 1, u.v.pos.z, 3)) || d > 420) { g.vehicles.despawn(u.v); this.units.splice(i, 1); continue; }
      if (u.v.burnt) { u.v.siren = false; u.v.driver = null; if (u.v.drive) u.v.drive = null; }
    }
    this.cops = this.cops.filter(c => g.peds.peds.includes(c));
    for (const c of this.cops) if (Math.hypot(c.x - p.pos.x, c.z - p.pos.z) > 150 && !g.inView(c.x, 1, c.z, 1)) { c.keep = false; }
    for (let i = this.roadblocks.length - 1; i >= 0; i--) {
      const rb = this.roadblocks[i]; rb.t -= dt;
      if (rb.t <= 0) {
        for (const v of rb.cars) if (g.vehicles.list.includes(v) && v !== p.vehicle && Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z) > 60) g.vehicles.despawn(v); else v.siren = false;
        for (const c of rb.cops) c.keep = false;
        this.roadblocks.splice(i, 1);
      }
    }
    if (!this.enabled) { if (this.level) this.clear(); return; }
    if (this.level === 0) { this.heli.active = false; this.updateHeli(dt); return; }
    if (this.lockLevel && this.level < this.lockLevel) this.level = this.lockLevel;
    // perception
    this.percT -= dt;
    if (this.percT <= 0) {
      this.percT = 0.25;
      const night = g.env.night, fog = g.env.fog;
      const ghost = p.state === 'vehicle' && p.vehicle && p.vehicle.type === 'unmarked' && p.vehicle.garageUid;
      const range = (95 - night * 30) * (1 - fog * 0.4) * (1 - g.env.rain * 0.15) * (ghost ? 0.7 : 1) * (g.uw ? g.uw.cops.perceptionMul() : 1);
      let seen = false;
      const px = p.pos.x, py = p.pos.y + 1.2, pz = p.pos.z;
      const grid = g.world.grid;
      for (const u of this.units) { if (u.v.burnt || u.standDown) continue; const d = Math.hypot(u.v.pos.x - px, u.v.pos.z - pz); if (d < range && grid.lineOfSight(u.v.pos.x, u.v.pos.y + 1.4, u.v.pos.z, px, py, pz)) { seen = true; break; } }
      if (!seen) for (const c of this.cops) { if (c.state === 'down') continue; const d = Math.hypot(c.x - px, c.z - pz); if (d < range * 0.8 && grid.lineOfSight(c.x, c.y + 1.6, c.z, px, py, pz)) { seen = true; break; } }
      if (!seen && this.heli.active && Math.hypot(this.heli.x - px, this.heli.z - pz) < 65) seen = true;
      if (p.interior) seen = false;
      const cur = p.state === 'vehicle' ? p.vehicle : null;
      if (seen) { this.visible = true; this.seenT = 0; this.lastSeen.x = px; this.lastSeen.z = pz; this.seenVeh = cur; }
      // out of sight: they search for the description they have. Switching cars (or ditching the
      // car on foot) makes that description wrong, so the search goes cold much faster.
      else { this.visible = false; this.seenT += 0.25 * (this.seenVeh !== cur ? 2.2 : 1); }
      if (!this.visible && this.seenT > this.escapeTime && !this.lockLevel) { const lv = this.level; this.clear('You lost the police.'); g.missions.onEvaded(lv); return; }
    }
    // police already out there join the pursuit when they see you go by (patrols in traffic, staffed cars
    // parked at the kerb or the precinct, officers on foot)
    this.joinT -= dt;
    if (this.joinT <= 0) { this.joinT = 0.3; this.joinScan(0.3); }
    // maintain units (joined units count, so a pursuit that picked up passing patrols spawns fewer)
    const want = UNITS_PER_LEVEL[this.level];
    const active = this.units.filter(u => !u.standDown && !u.v.burnt).length;
    this.spawnT -= dt;
    if (active < want && this.spawnT <= 0) { this.spawnUnit(); this.spawnT = this.level >= 4 ? 2 : 4; }
    for (const u of this.units) if (!u.standDown) u.v.siren = true;
    // roadblocks
    if (this.level >= 4) { this.roadblockT -= dt; if (this.roadblockT <= 0) { this.roadblockT = 28; this.roadblock(); } }
    // dismount crews near an on-foot or stopped player
    const pv = p.state === 'vehicle' ? p.vehicle : null;
    for (const u of this.units) {
      if (u.standDown || u.v.burnt) continue;
      const d = Math.hypot(u.v.pos.x - p.pos.x, u.v.pos.z - p.pos.z);
      const slow = !pv || pv.speed < 3;
      if (!u.dismounted && d < 22 && slow && u.v.speed < 3 && this.visible) {
        u.dismounted = true; u.v.driver = null; u.v.ctl.throttle = 0; u.v.ctl.handbrake = true;
        for (let k = 0; k < u.crew; k++) { const w = u.v.toWorld((k ? -1 : 1) * (u.v.spec.w / 2 + 0.6), 0.3); const c = this.spawnCop(w.x, w.z); if (c) { c.unit = u; u.cops.push(c); } }
      }
      if (u.dismounted && pv && pv.speed > 6 && d > 30) {
        // crew returns to the car
        let all = true;
        for (const c of u.cops) { if (!g.peds.peds.includes(c) || c.state === 'down') continue; c.brain = copReturn; if (dist2(c.x, c.z, u.v.pos.x, u.v.pos.z) > 9) all = false; }
        if (all) { for (const c of u.cops) { const i = g.peds.peds.indexOf(c); if (i >= 0) g.peds.peds.splice(i, 1); } u.cops = []; u.dismounted = false; u.v.driver = 'cop'; u.crew = 2; }
      }
    }
    // arrest
    let near = false;
    if (this.level <= 2 && !p.interior) {
      for (const c of this.cops) if (c.state === 'chase' && dist2(c.x, c.z, p.pos.x, p.pos.z) < (pv ? 3.2 : 1.7) ** 2) { near = true; break; }
    }
    if (near && (!pv || pv.speed < 1)) this.bust = Math.min(1, this.bust + dt / (pv ? 2.6 : 1.7));
    else this.bust = Math.max(0, this.bust - dt * 0.8);
    if (this.bust >= 1) { this.bust = 0; g.onBusted(); return; }
    this.updateHeli(dt);
  }
  updateHeli(dt) {
    const h = this.heli, g = this.g, p = g.player;
    if (this.level >= 5 && !h.active) { h.active = true; h.x = p.pos.x - 200; h.z = p.pos.z - 200; h.y = 70; }
    h.g.visible = h.active || h.leaving > 0;
    if (!h.g.visible) { this.heliLight.intensity = 0; return; }
    const tx = h.active ? (this.visible ? p.pos.x : this.lastSeen.x) + Math.sin(g.time * 0.3) * 18 : h.x + 50, tz = h.active ? (this.visible ? p.pos.z : this.lastSeen.z) + Math.cos(g.time * 0.3) * 18 : h.z + 50;
    const dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz);
    const sp = Math.min(24, d * 0.8);
    h.vx = damp(h.vx, d > 0.1 ? dx / d * sp : 0, 1.2, dt); h.vz = damp(h.vz, d > 0.1 ? dz / d * sp : 0, 1.2, dt);
    h.x += h.vx * dt; h.z += h.vz * dt; h.y = damp(h.y, 38, 0.5, dt);
    h.g.position.set(h.x, h.y + Math.sin(g.time * 1.3) * 0.4, h.z);
    h.g.rotation.set(h.vz * 0.012, Math.atan2(h.vx, h.vz), -h.vx * 0.012);
    this.rotor.rotation.y += dt * 30;
    this.heliLight.intensity = h.active ? 3000 * (0.3 + g.env.night) : 0;
    this.heliLight.target.position.set(0, -40, 4);
    if (h.active && Math.random() < dt * 6) g.audio.play('thud', { x: h.x, z: h.z, gain: 0.25, ref: 30, max: 300 });
    if (!h.active) { h.leaving = (h.leaving || 4) - dt; h.y += dt * 10; }
  }
}
// cop on-foot brains
function copBrain(c, dt) {
  const g = game, p = g.player, pol = g.police;
  if (c.state === 'down' || c.state === 'ko') return;
  if (c.state !== 'chase') { c.state = 'chase'; }
  const tx = pol.visible ? p.pos.x : pol.lastSeen.x, tz = pol.visible ? p.pos.z : pol.lastSeen.z;
  const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz) || 1;
  const shooting = pol.level >= 3 && pol.visible && d < 32;
  let sp = shooting ? (d > 14 ? 3.5 : 0) : (d > 1.2 ? 5.6 : 0);
  if (pol.level <= 2 && d < 1.1) sp = 0;
  c.vx = damp(c.vx, dx / d * sp, 8, dt); c.vz = damp(c.vz, dz / d * sp, 8, dt);
  c.pose.hold = pol.level >= 3 ? 'gun' : null;
  c.pose.aim = shooting ? 1 : 0;
  if (shooting) {
    c.h = Math.atan2(dx, dz);
    c.fireT -= dt;
    if (c.fireT <= 0) { c.fireT = rand(1.15, 1.9); g.combat.copShoot(c); }
  }
}
function copReturn(c, dt) {
  const u = c.unit; if (!u) { c.brain = copStandDown; return; }
  const dx = u.v.pos.x - c.x, dz = u.v.pos.z - c.z, d = Math.hypot(dx, dz) || 1;
  c.state = 'chase';
  c.vx = damp(c.vx, dx / d * 5.5, 8, dt); c.vz = damp(c.vz, dz / d * 5.5, 8, dt);
  c.pose.aim = 0;
}
function copStandDown(c, dt) {
  c.pose.aim = 0; c.pose.hold = null; c.keep = false;
  if (c.state === 'chase') { c.vx = damp(c.vx, 0, 4, dt); c.vz = damp(c.vz, 0, 4, dt); }
}
// an officer on foot who joined a pursuit: chases like any cop for a while, then gives up once the player is
// well away (a car pulling off, or simply outrun) and walks back to the post; never gets into a car
function copFootChase(c, dt) {
  const g = game, p = g.player, pol = g.police;
  if (c.state === 'down' || c.state === 'ko') return;
  c.chaseT -= dt;
  const d = Math.hypot(p.pos.x - c.x, p.pos.z - c.z), pv = p.state === 'vehicle' && p.vehicle && p.vehicle.speed > 8;
  if (pol.level === 0 || c.chaseT <= 0 || d > 70 || (pv && d > 35)) { c.brain = copWalkBack; return; }
  copBrain(c, dt);
}
function copWalkBack(c, dt) {
  const g = game, pol = g.police;
  if (c.state === 'down' || c.state === 'ko') return;
  c.pose.aim = 0; c.pose.hold = null; c.state = 'free';
  const h = c.home; if (!h) { c.brain = copStandDown; return; }
  const dx = h.x - c.x, dz = h.z - c.z, d = Math.hypot(dx, dz) || 1;
  if (d < 1) { c.vx = c.vz = 0; c.brain = c.postH !== undefined ? copPost : copStandDown; c.joinT = 0; return; }
  c.vx = damp(c.vx, dx / d * 1.6, 6, dt); c.vz = damp(c.vz, dz / d * 1.6, 6, dt); c.h = dampAngle(c.h, Math.atan2(dx, dz), 6, dt);
  // seeing the player again on a live chase sends them back after you
  if (pol.level > 0 && pol.visible && dist2(c.x, c.z, g.player.pos.x, g.player.pos.z) < 30 * 30) { c.brain = copFootChase; c.state = 'chase'; c.chaseT = 8; }
}

