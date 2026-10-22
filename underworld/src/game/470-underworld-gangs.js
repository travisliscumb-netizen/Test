/* =====================================================================
   [UNDERWORLD] GANGS ON THE STREET: hangout crews, bosses and guards at HQ,
   turf-war fights, police raid scenes, shipment convoys, street buyers and
   the player's own crew presence and bodyguards. Groups stream in around
   the player and dissolve when out of range; the strategic state persists.
   ===================================================================== */
const GANG_CAP = 18;
// ---- gang aggression (v7). The long-term relationship (f.rel) says who dislikes you; f.aggro (0-100, saved) is how
// hard a faction is actively after you right now. Only hostile acts raise it (repeat trouble raises it faster), and it
// cools whenever none of their people can see you, so getting away works: pursuit stops, groups stand down, and the
// hit squads stop coming. Gangs only know where you are from a sighting (they drive to where you were last seen).
const GANG_AGGRO = { hit: 4, bossHit: 15, ko: 12, guardKo: 14, bossKo: 40, car: 8, ship: 35, war: 40,
  cool: 0.35,            // aggro lost per second while no member of the faction sees you
  hot: 15,               // at or above: any member anywhere recognises you on sight (on foot or in a slow car)
  squad: 35,             // at or above: they send cars to where you were last seen
  memory: 150,           // a sighting older than this (s) no longer tells them where to look
  calm: 12, calmK: 0.25  // a hostile group stands down after losing you for calm + aggro × calmK seconds
};
const LINES = {
  warn: ['This corner’s taken. Keep walking.', 'You lost? This is our block.', 'Walk on, friend. Nothing for you here.', 'Wrong street. Turn around.'],
  warnKnown: ['We know who you are. Don’t start nothing here.', 'Easy. We don’t want a problem with you.'],
  provoked: ['You just made a mistake.', 'Get him!', 'Now you’re done.', 'Run your pockets, tough guy.'],
  fear: ['That’s them. Don’t look.', 'We’re cool, we’re cool.', 'Nah, not worth it.'],
  friendly: ['Boss.', 'Everything’s quiet here.', 'Good to see you.']
};
class GangManager {
  constructor(uw) { this.uw = uw; this.groups = new Map(); this.t = 0; this._near = []; this.seen = {}; }
  get g() { return this.uw.g; }
  // a hostile act against faction fid at (x, z): active aggression rises (faster with repeated trouble) and they know
  // where it happened. The long-term relationship is handled by the caller as before.
  provoke(fid, amount, x, z) {
    const f = this.uw.S.factions[fid]; if (!f || !FACTIONS[fid]) return;
    f.trouble = Math.min(10, (f.trouble || 0) + 1);
    f.aggro = Math.min(100, (f.aggro || 0) + amount * (1 + f.trouble * 0.1));
    if (x !== undefined) this.sighting(fid, x, z);
  }
  // one of their people has eyes on the player (or saw the incident): the last known position, and no cooling meanwhile
  sighting(fid, x, z) { const g = this.g; this.seen[fid] = { x: x === undefined ? g.player.pos.x : x, z: z === undefined ? g.player.pos.z : z, t: g.time }; }
  lastSeen(fid) { const s = this.seen[fid]; return s && this.g.time - s.t < GANG_AGGRO.memory ? s : null; }
  aggro(fid) { const f = this.uw.S.factions[fid]; return f ? f.aggro || 0 : 0; }
  // per frame: aggression cools for every faction that cannot see you right now; the trouble count fades slowly
  coolDown(dt) {
    const S = this.uw.S, now = this.g.time;
    for (const fid of FAC_IDS) {
      const f = S.factions[fid]; if (!f) continue;
      const s = this.seen[fid], watching = s && now - s.t < 1.5;
      if (f.aggro > 0 && !watching) f.aggro = Math.max(0, f.aggro - GANG_AGGRO.cool * dt);
      if (f.trouble > 0) f.trouble = Math.max(0, f.trouble - dt / 120);
    }
  }
  // can this member see the player from here?
  canSee(m, range) {
    const g = this.g, pl = g.player;
    if (m.state === 'down' || pl.interior || pl.state === 'dead') return false;
    if (dist2(m.x, m.z, pl.pos.x, pl.pos.z) > range * range) return false;
    return g.world.grid.lineOfSight(m.x, (m.y || 0) + 1.5, m.z, pl.pos.x, pl.pos.y + 1.4, pl.pos.z);
  }
  // hostile groups that have lost the player stand down (twice a second, one sight check per group)
  updateHostility(step) {
    const g = this.g, pl = g.player;
    for (const gr of this.groups.values()) {
      if (!gr.hostile || gr.crew || gr.kind === 'war' || gr.kind === 'raid' || gr.kind === 'convoy' || gr.kind === 'bounty' || gr.kind === 'body' || !gr.fid) continue;
      if (gr.kind === 'squad' && !gr.members.length) continue; // still in the car: the squad logic handles it
      let near = null, nd = Infinity;
      for (const m of gr.members) { if (m.state === 'down') continue; const d = dist2(m.x, m.z, pl.pos.x, pl.pos.z); if (d < nd) { nd = d; near = m; } }
      const sees = near && this.canSee(near, 45);
      if (sees) { gr.lostT = 0; this.sighting(gr.fid); continue; }
      gr.lostT = (gr.lostT || 0) + step;
      if (gr.lostT > GANG_AGGRO.calm + this.aggro(gr.fid) * GANG_AGGRO.calmK) {
        gr.hostile = false; gr.lostT = 0; gr.warned = 0; gr.calledBackup = false;
        for (const m of gr.members) { m.alertT = 0; m.spotT = 0; m.target = null; m.tT = 0; }
      }
    }
  }
  reset() {
    const g = this.g;
    this.seen = {};
    for (const gr of this.groups.values()) this.removeGroup(gr, true);
    this.groups.clear();
    this.riding = [];
    if (g.peds) g.peds.peds = g.peds.peds.filter(p => p.kind !== 'gang' && p.kind !== 'crew' && p.kind !== 'buyer');
  }
  count() { let n = 0; for (const gr of this.groups.values()) n += gr.members.length; return n; }
  makeMember(gr, look, role, x, z, h) {
    const g = this.g, p = g.peds.make(gr.crew ? 'crew' : 'gang', look);
    p.x = x + rand(-1.2, 1.2); p.z = z + rand(-1.2, 1.2); p.y = groundY(p.x, p.z); p.h = h + rand(-0.6, 0.6);
    p.state = 'free'; p.keep = true; p.fac = gr.fid; p.role = role; p.group = gr; p.home = { x: p.x, z: p.z, h: p.h };
    p.friendly = !!gr.crew; p.courage = rand(0.3, 1); p.atkT = 0; p.cool = rand(0.5, 1.5); p.fireT = rand(0.5, 1.5);
    const F = FACTIONS[gr.fid];
    const gunP = gr.crew ? 0.5 : (F ? F.gun : 0.3) * (role === 'guard' ? 2 : role === 'boss' ? 1 : 1) + (gr.kind === 'war' ? 0.15 : 0);
    p.gun = Math.random() < gunP; p.bat = !p.gun && Math.random() < 0.35;
    p.health = role === 'boss' ? 170 : role === 'guard' ? 115 : 75; p.maxHealth = p.health;
    p.skill = role === 'boss' ? 0.8 : role === 'guard' ? 0.65 : rand(0.25, 0.6);
    p.pose.hold = p.gun ? null : p.bat ? 'bat' : null;
    p.brain = gr.crew ? crewBrain : gangBrain;
    g.peds.peds.push(p); gr.members.push(p);
    return p;
  }
  // room under the cap for n more: retire ambient street groups (hangouts and buyers, never anyone fighting), farthest
  // from you first. A raid's response (and anything else that must turn up) asks before it spawns.
  makeRoom(n) {
    const g = this.g, p = g.player, need = this.count() + n - GANG_CAP; if (need <= 0) return true;
    const amb = [...this.groups.values()].filter(gr => (gr.kind === 'hang' || gr.kind === 'buy') && !gr.hostile && !gr.crew)
      .sort((a, b) => dist2(b.x, b.z, p.pos.x, p.pos.z) - dist2(a.x, a.z, p.pos.x, p.pos.z));
    let freed = 0;
    for (const gr of amb) { if (freed >= need) break; freed += gr.members.length; this.removeGroup(gr); }
    return this.count() + n <= GANG_CAP;
  }
  spawnGroup(key, kind, fid, at, n, opts = {}) {
    if (this.groups.has(key)) return this.groups.get(key);
    const g = this.g;
    if (this.count() + n > GANG_CAP) n = Math.max(0, GANG_CAP - this.count());
    if (n <= 0 && kind !== 'hq') return null;
    const gr = { key, kind, fid, x: at.x, z: at.z, h: at.h || 0, members: [], hostile: false, crew: fid === 'pc', turf: opts.turf, warned: 0, t: 0, opts };
    this.groups.set(key, gr);
    const rng = Math.random;
    for (let k = 0; k < n; k++) {
      const role = kind === 'hq' ? 'guard' : kind === 'deal' ? 'dealer' : k === 0 && kind === 'hang' && Math.random() < 0.5 ? 'dealer' : 'soldier';
      const look = gr.crew ? crewLook(opts.crewIds ? opts.crewIds[k] : null) : factionLook(fid, rng);
      const m = this.makeMember(gr, look, role, at.x + Math.cos(k * 2.1) * 1.6, at.z + Math.sin(k * 2.1) * 1.6, at.h || 0);
      if (opts.crewIds) m.crewId = opts.crewIds[k];
    }
    if (kind === 'hq') {
      const f = this.uw.S.factions[fid], B = FACTIONS[fid].boss;
      if (f.bossDown === 0) {
        const look = lookFrom(B.look, mulberry32(fid.length * 101));
        const boss = this.makeMember(gr, look, 'boss', at.x, at.z, at.h || 0);
        boss.x = at.x; boss.z = at.z; boss.home = { x: at.x, z: at.z, h: at.h }; boss.bossName = f.boss; gr.boss = boss;
        boss.gun = true; boss.pose.hold = null;
      }
    }
    return gr;
  }
  removeGroup(gr, all) {
    const g = this.g;
    for (const m of gr.members) { const i = g.peds.peds.indexOf(m); if (i >= 0) g.peds.peds.splice(i, 1); }
    gr.members.length = 0;
    this.groups.delete(gr.key);
    // the group's cars go back to being ordinary cars, so the world cleanup can recycle them
    if (gr.cars) for (const v of gr.cars) this.releaseCar(v);
    if (gr.car) this.releaseCar(gr.car);
  }
  releaseCar(v) {
    const g = this.g, p = g.player;
    if (!v || !g.vehicles.list.includes(v)) return;
    v.uwGroup = null;
    if (v.mission === 'squad' || v.mission === 'shipment' || v.mission === 'event') v.mission = null;
    if (v === p.vehicle || v === p.lastVehicle || v.driver !== 'npc' || !v.drive) return;
    // a driver with nothing left to do heads off across town instead of hunting the player
    v.drive.target = null; v.drive.targetRef = null; v.drive.wait = 0; v.drive.mode = 'cruise'; v.drive.cruise = rand(12, 16);
    const c = g.world.randomCurbSpot(v.pos.x, v.pos.z, 300, 700); v.drive.setGoal(c.x, c.z);
  }
  // safety net: a car that still belongs to a group that no longer exists (reloads, resets, jail)
  sweepOrphans() {
    for (const v of this.g.vehicles.list) if (v.uwGroup && !this.groups.has(v.uwGroup)) this.releaseCar(v);
  }
  // is a live (spawned, fighting) war happening on this turf right now?
  // is the showdown being fought in front of the player? (the rival side is on the street and standing)
  warLive(i) { const w = this.uw.S.turfs[i].war, gr = this.groups.get((w && w.a === 'pc' ? 'warD' : 'warA') + i); return !!(gr && gr.members.some(m => m.state !== 'down')); }
  threatNear(r) {
    const p = this.g.player;
    for (const gr of this.groups.values()) if (gr.hostile && !gr.crew) for (const m of gr.members) if (m.state !== 'down' && dist2(m.x, m.z, p.pos.x, p.pos.z) < r * r) return true;
    return false;
  }
  update(dt) {
    const g = this.g, uw = this.uw, S = uw.S, p = g.player;
    this.t -= dt;
    this.coolDown(dt);
    // prune despawned members (in place, one shared lookup set: no per-frame allocations)
    if (this.groups.size) {
      const live = this._live || (this._live = new Set()); live.clear();
      for (const q of g.peds.peds) live.add(q);
      for (const gr of this.groups.values()) { const M = gr.members; let n = 0; for (let k = 0; k < M.length; k++) if (live.has(M[k])) M[n++] = M[k]; M.length = n; }
      live.clear();
    }
    if (this.t <= 0) {
      this.t = 0.6;
      const px = p.pos.x, pz = p.pos.z, inside = !!p.interior;
      const want = new Set();
      if (!inside && g.peds.enabled) {
        for (let i = 0; i < uw.T.length; i++) {
          const t = uw.T[i], d2h = dist2(t.hang.x, t.hang.z, px, pz);
          const own = uw.owner[i], war = S.turfs[i].war;
          if (war && dist2(t.cx, t.cz, px, pz) < 170 * 170) {
            want.add('warA' + i); if (war.d) want.add('warD' + i);
            if (war.a === 'pc') {
              // your showdown: your people on the turf against the owner's, who are out for you
              if (!this.groups.has('warA' + i)) { const ids = uw.crew.onTurf(i).slice(0, 3); if (ids.length) { const gr = this.spawnGroup('warA' + i, 'war', 'pc', { x: t.hang.x + 6, z: t.hang.z + 6, h: t.hang.h }, ids.length, { turf: i, enemy: war.d, crewIds: ids }); if (gr) gr.hostileTo = war.d; } }
              if (war.d && !this.groups.has('warD' + i)) { const D = S.factions[war.d]; this.spawnGroup('warD' + i, 'war', war.d, t.hang, clamp(Math.round(2 + D.strength / 35), 2, 4), { turf: i, enemy: 'pc' }); }
              const gd = this.groups.get('warD' + i); if (gd) { gd.enemy = 'pc'; gd.hostile = true; }
              const ga = this.groups.get('warA' + i); if (ga) ga.enemy = war.d || 'none';
              continue;
            }
            const A = S.factions[war.a];
            if (!this.groups.has('warA' + i)) this.spawnGroup('warA' + i, 'war', war.a, { x: t.hang.x + 6, z: t.hang.z + 6, h: t.hang.h }, clamp(Math.round(2 + A.strength / 30), 2, 5), { turf: i, enemy: war.d });
            if (war.d && !this.groups.has('warD' + i)) {
              if (war.d === 'pc') { const ids = uw.crew.onTurf(i).slice(0, 3); const gr = this.spawnGroup('warD' + i, 'war', 'pc', t.hang, Math.max(1, ids.length), { turf: i, enemy: war.a, crewIds: ids }); if (gr) gr.hostileTo = war.a; }
              else { const D = S.factions[war.d]; this.spawnGroup('warD' + i, 'war', war.d, t.hang, clamp(Math.round(2 + D.strength / 35), 2, 4), { turf: i, enemy: war.a }); }
            }
            const ga = this.groups.get('warA' + i); if (ga) ga.enemy = war.d || 'none';
            const gd = this.groups.get('warD' + i); if (gd) gd.enemy = war.a;
            if (war.d === 'pc' && ga) ga.hostile = true;
            continue;
          }
          // the hangout and the deal corner can sit in different blocks of the turf: each has its own range
          if (d2h <= 125 * 125) {
            if (own && own !== 'pc' && !S.factions[own].broken) {
              want.add('hang' + i);
              if (!this.groups.has('hang' + i) && (d2h > 45 * 45 || !g.inView(t.hang.x, 1, t.hang.z, 3))) this.spawnGroup('hang' + i, 'hang', own, t.hang, clamp(Math.round(1.5 + S.factions[own].strength / 30), 2, 4), { turf: i });
            } else if (own === 'pc') {
              const ids = uw.crew.onTurf(i).slice(0, 3);
              if (ids.length) { want.add('crew' + i); if (!this.groups.has('crew' + i) && (d2h > 45 * 45 || !g.inView(t.hang.x, 1, t.hang.z, 3))) this.spawnGroup('crew' + i, 'hang', 'pc', t.hang, ids.length, { turf: i, crewIds: ids }); }
            }
          }
          // street buyers on deal corners (not where a rival is looking for trouble)
          const dl = t.deal, dd = dist2(dl.x, dl.z, px, pz);
          if (dd < 80 * 80 && this.buyersActive(i)) { want.add('buy' + i); if (!this.groups.has('buy' + i) && (dd > 35 * 35 || !g.inView(dl.x, 1, dl.z, 2))) this.spawnBuyers(i); }
        }
        if (uw.compounds) uw.compounds.wantGroups(want, px, pz);
        // a rival warehouse's guards, and the squads of a raid on it, are kept while they matter
        for (const fid in RIVAL_WH) { want.add('rg:' + fid); for (const k of [1, 2, 3]) want.add('rs:' + fid + ':' + k); }
        for (const fid of FAC_IDS) {
          const L = uw.loc('hq', fid); if (!L || S.factions[fid].broken) continue;
          if (dist2(L.x, L.z, px, pz) < 120 * 120) { want.add('hq' + fid); if (!this.groups.has('hq' + fid) && (dist2(L.x, L.z, px, pz) > 40 * 40 || !g.inView(L.x, 1, L.z, 3))) this.spawnGroup('hq' + fid, 'hq', fid, L, clamp(Math.round(1 + S.factions[fid].strength / 40), 1, 3)); }
        }
      }
      // keep groups that are busy fighting near the player; drop the rest
      for (const gr of [...this.groups.values()]) {
        if (gr.kind === 'body' || gr.kind === 'raid' || gr.kind === 'convoy' || gr.kind === 'bounty' || gr.kind === 'squad' || gr.kind === 'assault') continue;
        if (want.has(gr.key)) continue;
        const near = gr.members.some(m => dist2(m.x, m.z, px, pz) < 70 * 70 && m.state !== 'down');
        if ((gr.hostile || gr.kind === 'war') && near) continue;
        const seen = gr.members.some(m => g.inView(m.x, 1, m.z, 1) && dist2(m.x, m.z, px, pz) < 90 * 90);
        if (!seen || inside) this.removeGroup(gr);
      }
      // timed scenes (raids, bounties) clean up when finished and out of sight
      for (const gr of [...this.groups.values()]) {
        if (gr.kind !== 'raid' && gr.kind !== 'bounty') continue;
        gr.life = (gr.life || 0) + 0.6;
        const far = gr.members.every(m => dist2(m.x, m.z, px, pz) > 160 * 160) || inside;
        if ((gr.life > 120 && far) || (gr.kind === 'raid' && gr.life > 240)) { this.removeGroup(gr); if (gr.cars) for (const v of gr.cars) if (g.vehicles.list.includes(v) && v !== p.vehicle && v !== p.lastVehicle && !g.inView(v.pos.x, 1, v.pos.z, 3)) g.vehicles.despawn(v); else if (g.vehicles.list.includes(v)) v.mission = null; }
      }
      this.updateHostility(0.6);
      this.updateBodyguards();
      this.sweepOrphans();
    }
    this.updateSquads(dt);
  }
  buyersActive(i) {
    const g = this.g, uw = this.uw, t = uw.T[i];
    const hour = g.env.time, night = hour >= 18 || hour < 4;
    if (!night && !['o', 'h', 'w', 's'].includes(t.zone)) return false;
    const own = uw.owner[i];
    if (own && own !== 'pc' && uw.attitude(own) === 'hostile') return false;
    return true;
  }
  spawnBuyers(i) {
    const t = this.uw.T[i], g = this.g;
    const gr = { key: 'buy' + i, kind: 'buy', fid: null, x: t.deal.x, z: t.deal.z, h: t.deal.h, members: [], turf: i, hostile: false };
    this.groups.set(gr.key, gr);
    const n = randi(1, 2);
    for (let k = 0; k < n; k++) {
      const look = randomLook(); look.hood = C(pick([0x22262c, 0x3a3a46, 0x4a3a2a, 0x2a3a4a])); look.shirt = look.hood; look.jacket = null; look.skirt = null;
      const q = g.peds.make('buyer', look);
      q.x = t.deal.x + k * 1.1; q.z = t.deal.z + k * 0.6; q.y = groundY(q.x, q.z); q.h = t.deal.h + rand(-0.8, 0.8);
      q.state = 'free'; q.keep = true; q.group = gr; q.brain = buyerBrain; q.home = { x: q.x, z: q.z, h: q.h }; q.health = 50;
      g.peds.peds.push(q); gr.members.push(q);
    }
  }
  buyerNear() {
    const p = this.g.player;
    for (const gr of this.groups.values()) if (gr.kind === 'buy') for (const m of gr.members) if (m.state === 'free' && dist2(m.x, m.z, p.pos.x, p.pos.z) < 2.6 * 2.6) return gr;
    return null;
  }
  talkTarget() {
    const g = this.g, p = g.player, uw = this.uw;
    for (const gr of this.groups.values()) {
      if (gr.kind !== 'hq' || !gr.boss || gr.hostile) continue;
      const b = gr.boss; if (b.state === 'down') continue;
      if (dist2(b.x, b.z, p.pos.x, p.pos.z) < 2.6 * 2.6) return { label: `Talk to ${b.bossName}`, act: () => uw.ui.openBoss(gr.fid) };
    }
    return null;
  }
  // the player hit someone: gang members' groups turn hostile, relations drop
  onHit(c, kind, dmg) {
    const uw = this.uw, S = uw.S;
    uw.combatT = 8;
    if (c.kind === 'gang' && c.group) {
      const gr = c.group;
      if (!gr.hostile) { gr.hostile = true; this.say(c, pick(LINES.provoked)); }
      const f = S.factions[c.fac]; if (f) { f.rel = Math.max(-100, f.rel - (c.role === 'boss' ? 12 : 3)); f.hits++; }
      if (FACTIONS[c.fac]) this.provoke(c.fac, c.role === 'boss' ? GANG_AGGRO.bossHit : GANG_AGGRO.hit, c.x, c.z);
      gr.lostT = 0;
      for (const m of gr.members) m.alertT = 6;
      // nearby groups of the same faction join in, and a strong faction calls for backup
      for (const o of this.groups.values()) if (o !== gr && o.fid === gr.fid && !o.crew && o.members.some(m => dist2(m.x, m.z, c.x, c.z) < 30 * 30)) o.hostile = true;
      if (!gr.calledBackup && f && !f.broken && f.strength > 30 && gr.kind !== 'squad' && uw.attitude(c.fac) !== 'fearful') { gr.calledBackup = true; uw.g.later(rand(14000, 24000), () => this.sendSquad(c.fac, 'backup')); }
    } else if (c.kind === 'crew') { /* friendly fire is ignored by targeting */ }
  }
  // a gang member went down (knock/KO): influence and war bookkeeping
  onDown(p, byPlayer, ko) {
    const uw = this.uw, S = uw.S;
    if (byPlayer && p.group && p.kind === 'gang' && !p.group.hostile) { p.group.hostile = true; uw.combatT = 8; }
    if (p.kind === 'gang' && p.fac && FACTIONS[p.fac]) {
      const i = turfAt(p.x, p.z), f = S.factions[p.fac];
      if ((byPlayer || p.lastHitBy === 'pc') && ko) this.provoke(p.fac, p.role === 'boss' ? GANG_AGGRO.bossKo : p.role === 'guard' ? GANG_AGGRO.guardKo : GANG_AGGRO.ko, p.x, p.z);
      if (byPlayer || (p.lastHitBy === 'pc')) {
        uw.addInf(i, p.fac, -(ko ? 4 : 2));
        if (uw.g.save.rep >= 100 || uw.owner[i] === 'pc') uw.addInf(i, 'pc', ko ? 2.5 : 1);
        uw.threats.press(p.fac, ko ? PRESSURE.ko : PRESSURE.down, ko ? 'their people put down' : null);
        if (ko) { f.strength = Math.max(0, f.strength - 0.6); uw.addRep(p.role === 'guard' ? 8 : 4, null); S.infamy = Math.min(400, S.infamy + 0.6); }
        uw.opps.onKill(p);
      }
      if (p.role === 'boss' && ko) uw.factions.bossDown(p.fac, byPlayer || p.lastHitBy === 'pc');
      const gr = p.group;
      // courage breaks when the group is losing
      if (gr && gr.members.filter(m => m.state === 'down').length >= Math.ceil(gr.members.length * 0.6)) for (const m of gr.members) if (m.state !== 'down' && m.courage < 0.7) m.fleeT = 6;
    }
    if (p.kind === 'crew' && ko && p.crewId) uw.crew.hurt(p.crewId, 'street fight');
  }
  say(p, text) {
    const g = this.g;
    if (dist2(p.x, p.z, g.player.pos.x, g.player.pos.z) > 16 * 16) return;
    const now = g.time; if (this._sayT && now - this._sayT < 2.5) return; this._sayT = now;
    const who = p.kind === 'crew' ? 'Your crew' : p.role === 'boss' ? p.bossName : (FACTIONS[p.fac] ? FACTIONS[p.fac].short : 'Stranger');
    g.content.say(who, text, 2.6);
  }
  // ---------------------------------------------------------------- squads: backup and hit teams arrive by car
  sendSquad(fid, why) {
    const g = this.g, uw = this.uw, p = g.player, S = uw.S;
    if (!FACTIONS[fid] || S.factions[fid].broken || p.interior || S.jail || g.state !== 'playing') return;
    if ([...this.groups.values()].some(gr => gr.kind === 'squad')) return;
    if (this.count() > GANG_CAP - 3) return;
    // they only know where you were last seen: no sighting, no squad
    const ls = this.lastSeen(fid); if (!ls) return;
    const goal = { x: ls.x, z: ls.z };
    const c = g.world.randomCurbSpot(goal.x, goal.z, 90, 150);
    if (g.inView(c.x, 1, c.z, 4)) { const c2 = g.world.randomCurbSpot(goal.x, goal.z, 110, 170); c.x = c2.x; c.z = c2.z; c.h = c2.h; }
    const F = FACTIONS[fid];
    const v = g.vehicles.spawn(pick(F.cars.filter(t => CARGO_LB[t] !== undefined)), c.x, c.z, c.h, { driver: 'npc', speed: 8 });
    v.fac = fid; v.touched = true; v.mission = 'squad';
    v.colorHex = pick(F.carCol); v.mat.userData.u.uPaint.value.setHex(v.colorHex); v.mat.userData.u.uPaint2.value.setHex(F.hex);
    v.drive = new DriveAI(v, g, 'pursue'); v.drive.cruise = 22;
    const gr = { key: 'squad' + (this._sq = (this._sq || 0) + 1), kind: 'squad', fid, x: c.x, z: c.z, members: [], hostile: true, cars: [v], car: v, n: randi(2, 3), life: 0, goal, locked: false, search: 0 };
    // heading for the last known position until they actually spot you; then they come for you
    v.drive.target = () => {
      if (!gr.locked) { const d = Math.hypot(gr.goal.x - v.pos.x, gr.goal.z - v.pos.z); return { x: gr.goal.x, z: gr.goal.z, speed: d < 25 ? 6 : 20, direct: d < 30 }; }
      const d = Math.hypot(p.pos.x - v.pos.x, p.pos.z - v.pos.z); return { x: p.pos.x, z: p.pos.z, speed: d < 30 ? Math.max(0, d - 12) * 0.8 : 22, direct: d < 40 };
    };
    v.drive.targetRef = null;
    v.uwGroup = gr.key;
    this.groups.set(gr.key, gr);
    if (why === 'hit') g.ui.toast(`${S.factions[fid].boss} sent a crew after you.`, 'warn');
  }
  updateSquads(dt) {
    const g = this.g, p = g.player;
    // (deleting the current entry while iterating a Map is safe: no per-frame copy needed)
    for (const gr of this.groups.values()) {
      if (gr.kind !== 'squad') continue;
      const v = gr.car;
      gr.life += dt;
      if (!g.vehicles.list.includes(v) || v.burnt) { if (!gr.members.length) this.removeGroup(gr); continue; }
      if (!gr.members.length && v.driver === 'npc') {
        const d = Math.hypot(p.pos.x - v.pos.x, p.pos.z - v.pos.z);
        // spotting from the car: close, or in clear sight (checked a few times a second)
        if (!gr.locked && (gr.spotT = (gr.spotT || 0) - dt) <= 0) {
          gr.spotT = 0.4;
          if (!p.interior && (d < 12 || (d < 34 && g.world.grid.lineOfSight(v.pos.x, v.pos.y + 1.4, v.pos.z, p.pos.x, p.pos.y + 1.4, p.pos.z)))) { gr.locked = true; v.drive.targetRef = p; this.sighting(gr.fid); }
        }
        if (gr.locked && d < 60 && (gr.seeT = (gr.seeT || 0) - dt) <= 0) { gr.seeT = 0.5; if (!p.interior && g.world.grid.lineOfSight(v.pos.x, v.pos.y + 1.4, v.pos.z, p.pos.x, p.pos.y + 1.4, p.pos.z)) this.sighting(gr.fid); }
        if (!gr.locked) {
          // nobody where you were last seen: a short look round, then they give up and drive off
          if (Math.hypot(gr.goal.x - v.pos.x, gr.goal.z - v.pos.z) < 18) gr.search += dt;
          const ls = this.lastSeen(gr.fid); if (ls && (ls.x !== gr.goal.x || ls.z !== gr.goal.z) && g.time - ls.t < 5) { gr.goal = { x: ls.x, z: ls.z }; gr.search = 0; }
          if (gr.search > 18 || gr.life > 75) { this.removeGroup(gr); continue; }
        }
        if (gr.locked && ((d < 26 && v.speed < 3) || (d < 14))) {
          // bail out and fight
          v.drive = null; v.driver = null; v.ctl.throttle = 0; v.ctl.handbrake = true; v.mission = null; v.uwGroup = null;
          for (let k = 0; k < gr.n; k++) { const w = v.toWorld((k % 2 ? -1 : 1) * (v.spec.w / 2 + 0.7), (k - 1) * 1.2); const m = this.makeMember(gr, factionLook(gr.fid), 'soldier', w.x, w.z, v.h); m.x = w.x; m.z = w.z; m.gun = m.gun || Math.random() < 0.5; m.courage = rand(0.6, 1); }
          g.audio.play('door', { x: v.pos.x, z: v.pos.z });
        }
        if (gr.life > 90 || d > 400) { this.removeGroup(gr); if (v.driver === 'npc' && !g.inView(v.pos.x, 1, v.pos.z, 3)) g.vehicles.despawn(v); }
      } else if (gr.members.length && gr.members.every(m => m.state === 'down' || dist2(m.x, m.z, p.pos.x, p.pos.z) > 150 * 150)) {
        if (!gr.members.some(m => g.inView(m.x, 1, m.z, 1))) this.removeGroup(gr);
      }
    }
    // a faction that is actively after you (aggression high, and someone saw you recently) sends a car to where
    // you were last seen. Once their aggression cools, or nobody has seen you for a while, the squads stop.
    this.hitT = (this.hitT || rand(60, 120)) - dt;
    if (this.hitT <= 0) {
      this.hitT = rand(120, 240);
      const S = this.uw.S;
      const angry = FAC_IDS.filter(f => !S.factions[f].broken && (S.factions[f].aggro || 0) >= GANG_AGGRO.squad && S.factions[f].truce <= S.day && this.lastSeen(f) && this.uw.attitude(f) !== 'fearful');
      if (angry.length && this.uw.rank >= 2 && g.police.level === 0) this.sendSquad(pick(angry), 'hit');
    }
  }
  // ---------------------------------------------------------------- scenes
  raidScene(i, fid) {
    const g = this.g, uw = this.uw, t = uw.T[i], p = g.player;
    if (p.interior || dist2(t.hang.x, t.hang.z, p.pos.x, p.pos.z) > 260 * 260) return;
    if (this.groups.has('raid' + i)) return;
    const gr = { key: 'raid' + i, kind: 'raid', fid, x: t.hang.x, z: t.hang.z, members: [], hostile: false, cars: [] };
    this.groups.set(gr.key, gr);
    const c = curbNear(t.hang.x, t.hang.z);
    for (let k = 0; k < 2; k++) { const v = g.vehicles.spawn('police', c.x + Math.sin(c.h) * k * 6.5, c.z + Math.cos(c.h) * k * 6.5, c.h + rand(-0.3, 0.3), { parked: true }); v.siren = true; v.touched = true; v.mission = 'event'; v.uwGroup = gr.key; gr.cars.push(v); }
    for (let k = 0; k < 3; k++) {
      const q = g.peds.make('gang', factionLook(fid)); q.x = t.hang.x + rand(-2, 2); q.z = t.hang.z + rand(-2, 2); q.y = groundY(q.x, q.z);
      q.state = 'free'; q.keep = true; q.fac = fid; q.group = gr; q.brain = (c2, dt) => { c2.state = 'free'; c2.vx = 0; c2.vz = 0; c2.pose.surrender = Math.min(1, (c2.pose.surrender || 0) + dt * 3); c2.pose.crouch = 0.25; };
      g.peds.peds.push(q); gr.members.push(q);
      const cop = g.peds.make('cop', copLook()); cop.x = q.x + 1.2; cop.z = q.z + 0.6; cop.y = groundY(cop.x, cop.z); cop.state = 'free'; cop.keep = true; cop.faceX = q.x; cop.faceZ = q.z; cop.brain = idleBrain; cop.pose.hold = 'gun'; cop.pose.aim = 1;
      g.peds.peds.push(cop); gr.members.push(cop);
    }
  }
  // ---------------------------------------------------------------- bodyguards (player's crew that follows)
  updateBodyguards() {
    const g = this.g, uw = this.uw, p = g.player;
    const ids = uw.crew.bodyguards();
    let gr = this.groups.get('body');
    if (!ids.length || p.interior || uw.S.jail) { if (gr) this.removeGroup(gr); this.riding = []; return; }
    if (p.state === 'vehicle') {
      // bodyguards ride along: they leave the street and come back out when the player does
      if (gr && gr.members.length) { this.riding = gr.members.map(m => m.crewId); this.removeGroup(gr); }
      return;
    }
    if (!gr) {
      gr = { key: 'body', kind: 'body', fid: 'pc', x: p.pos.x, z: p.pos.z, members: [], hostile: false, crew: true };
      this.groups.set('body', gr);
      const back = { x: p.pos.x - Math.sin(p.h) * 1.6, z: p.pos.z - Math.cos(p.h) * 1.6 };
      for (const id of ids) {
        const m = this.makeMember(gr, crewLook(id), 'guard', back.x, back.z, p.h);
        m.crewId = id; m.gun = true; m.health = 120; m.slot = gr.members.length - 1;
      }
      this.riding = [];
    }
    // dismissed or new bodyguards: rebuild next tick
    if (gr.members.length !== ids.length || gr.members.some(m => !ids.includes(m.crewId))) this.removeGroup(gr);
  }
  // ---------------------------------------------------------------- strategic presence for the HUD/minimap
  blips() { const out = []; for (const gr of this.groups.values()) for (const m of gr.members) if (m.state !== 'down' && (m.kind === 'gang' || m.kind === 'crew')) out.push(m); return out; }
}
function crewLook(id) {
  const uw = game && game.uw, c = uw && id ? uw.S.crew.find(x => x.id === id) : null;
  const rng = mulberry32((c ? c.seed : Math.floor(Math.random() * 1e6)) >>> 0);
  const L = randomLook(rng);
  L.jacket = C(0x111214); L.shirt = C(pick([0xffb547, 0x26323f, 0xe8e8e8])); L.chain = c && c.rank >= 3 ? C(0xd8b04a) : null;
  if (c && c.role === 'bodyguard') { L.shades = true; L.tie = C(0x111214); L.shirt = C(0xe8e8e8); L.build = 1.2; L.shoulders = 1.12; }
  L.skirt = null;
  return L;
}
// ---------------- brains ----------------
function nearestEnemy(p, list, r) {
  let best = null, bd = r * r;
  for (const e of list) { if (e === p || e.state === 'down' || e.state === 'ko') continue; const d = dist2(e.x, e.z, p.x, p.z); if (d < bd) { bd = d; best = e; } }
  return best;
}
function brainTarget(p) {
  const g = game, uw = g.uw, pl = g.player, gr = p.group;
  const plTarget = { isPlayer: true, x: pl.pos.x, z: pl.pos.z, y: pl.pos.y, state: pl.state === 'foot' ? 'up' : 'away' };
  // enemies by faction: gang groups at war, crew vs hostile gangs
  const peds = g.peds.peds;
  if (p.kind === 'crew') {
    const foes = [];
    for (const q of peds) {
      if (q.kind !== 'gang' || q.state === 'down') continue;
      const qg = q.group;
      if ((qg && (qg.hostile || (gr && gr.enemy && qg.fid === gr.enemy))) || q.aggro === 'player') foes.push(q);
    }
    if (p.role === 'guard' && g.police.level >= 3) for (const c of g.police.cops) if (c.state === 'chase') foes.push(c);
    return nearestEnemy(p, foes, p.role === 'guard' ? 22 : 30);
  }
  const foes = [];
  if (gr && gr.enemy) for (const q of peds) { if (q.state === 'down') continue; if ((gr.enemy === 'pc' && q.kind === 'crew') || (q.kind === 'gang' && q.fac === gr.enemy) || (gr.hostile && q.kind === 'crew')) foes.push(q); }
  else if (gr && gr.hostile) for (const q of peds) if (q.kind === 'crew' && q.state !== 'down') foes.push(q);
  const e = nearestEnemy(p, foes, 26);
  const hostileToPlayer = gr && (gr.hostile || (gr.enemy === 'pc'));
  if (hostileToPlayer && pl.state !== 'dead' && pl.state !== 'busted' && !pl.interior) {
    const dp = dist2(p.x, p.z, pl.pos.x, pl.pos.z);
    if (!e || dp < dist2(p.x, p.z, e.x, e.z) * 1.4) { if (dp < 45 * 45) return plTarget; }
  }
  return e;
}
function gangAttack(p, t, dt) {
  const g = game, pl = g.player;
  const tx = t.x, tz = t.z, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) || 1;
  const inCar = t.isPlayer && pl.state === 'vehicle';
  p.pendHit = p.pendHit > 0 ? p.pendHit - dt : p.pendHit;
  if (p.gun && d < 24 && (d > 2.5 || inCar)) {
    // stand and shoot
    p.vx = damp(p.vx, 0, 8, dt); p.vz = damp(p.vz, 0, 8, dt);
    p.h = dampAngle(p.h, Math.atan2(dx, dz), 10, dt);
    p.pose.hold = 'gun'; p.pose.aim = 1;
    p.fireT -= dt;
    if (p.fireT <= 0) {
      // against the player: slower, less accurate, heavier hits (a pistol needs ~11 hits to kill and a
      // gunfight lasts about three times as long as it used to). Against other NPCs: the original model,
      // so turf wars between crews play out as before.
      const smg = t.isPlayer && (p.role === 'boss' || p.role === 'guard');
      p.fireT = t.isPlayer ? rand(1.3, 2.2) / (0.7 + p.skill * 0.5) : rand(0.9, 1.6) / (0.6 + p.skill * 0.6);
      const ox = p.x + Math.sin(p.h) * 0.5, oy = p.y + 1.38, oz = p.z + Math.cos(p.h) * 0.5;
      const ty = (t.isPlayer ? pl.pos.y : t.y) + 1.1;
      if (!g.world.grid.lineOfSight(ox, oy, oz, tx, ty, tz)) { p.fireT = 0.4; return; }
      const moving = t.isPlayer ? (inCar ? pl.vehicle.speed : Math.hypot(pl.vel.x, pl.vel.z)) : 0;
      const hitP = t.isPlayer ? clamp(0.2 + p.skill * 0.25 - d * 0.013 - moving * 0.012, 0.03, 0.5) : clamp(0.5 + p.skill * 0.25 - d * 0.014 - moving * 0.02, 0.06, 0.82);
      // an SMG (bosses and guards) fires a two-round burst: two separate chances to hit
      const hit = Math.random() < hitP || (smg && Math.random() < hitP);
      const mx = hit ? tx : tx + rand(-2, 2), my = hit ? ty : ty + rand(-0.5, 1.4), mz = hit ? tz : tz + rand(-2, 2);
      g.fx.muzzleFlash(ox, oy, oz); g.fx.tracer(ox, oy, oz, mx, my, mz);
      g.audio.play('gangshot', { x: ox, z: oz, gain: 0.8 });
      g.peds.panic(p.x, p.z, 30, 1);
      if (g.traffic.scare) g.traffic.scare(p.x, p.z, 25);
      if (hit) {
        if (t.isPlayer) {
          if (inCar && pl.vehicle) { pl.vehicle.hurt(2.5, 'gun'); g.fx.sparks(mx, my, mz, 4); if (Math.random() < 0.3) pl.damage(npcGunDamage('pistol', d) * 0.45, 'gang'); }
          else if (pl.invuln <= 0) pl.damage(npcGunDamage(p.role === 'boss' || p.role === 'guard' ? 'smg' : 'pistol', d), 'gang');
        } else {
          t.health -= rand(9, 15); t.char.flash = 0.08; t.lastHitBy = p.kind === 'crew' ? 'pc' : p.fac;
          if (t.health <= 0 || Math.random() < 0.2) g.peds.knock(t, dx / d * 3, dz / d * 3, 0, false, 'gun');
        }
      }
      // gunfire in the street draws the police
      if (g.uw && Math.random() < 0.25) g.uw.cops.streetViolence(p.x, p.z, p.kind === 'crew');
    }
    return;
  }
  p.pose.aim = 0; p.pose.hold = p.bat ? 'bat' : null;
  // melee: close in, wind up, hit if still in reach and roughly in front
  const reach = p.bat ? 1.6 : 1.25;
  if (d > reach * 0.9) {
    const sp = p.fleeT > 0 ? 0 : 4.8 + p.skill;
    // not gaining ground (a parked car, a bench, a corner in the way): swing round it,
    // alternating sides, instead of pushing straight into it forever
    const moved = p.lastX !== undefined ? Math.hypot(p.x - p.lastX, p.z - p.lastZ) : sp * dt;
    p.stuckT = (sp > 0 && dt > 0 && moved < sp * dt * 0.25) ? (p.stuckT || 0) + dt : 0;
    p.lastX = p.x; p.lastZ = p.z;
    if (p.stuckT > 0.45) { p.stuckT = 0; p.sideT = 0.8; p.sideDir = p.sideDir ? -p.sideDir : ((p.id | 0) % 2 ? 1 : -1); }
    let ax = dx / d, az = dz / d;
    if (p.sideT > 0) { p.sideT -= dt; const a = 1.25 * p.sideDir, c = Math.cos(a), sn = Math.sin(a); const rx = ax * c - az * sn, rz = ax * sn + az * c; ax = rx; az = rz; }
    p.vx = damp(p.vx, ax * sp, 8, dt); p.vz = damp(p.vz, az * sp, 8, dt);
    p.h = dampAngle(p.h, Math.atan2(p.vx, p.vz), 9, dt);
    return;
  }
  p.stuckT = 0; p.lastX = undefined; p.sideT = 0;
  p.vx = damp(p.vx, 0, 10, dt); p.vz = damp(p.vz, 0, 10, dt);
  p.h = dampAngle(p.h, Math.atan2(dx, dz), 9, dt);
  // read the player's attack and block it now and then
  if (t.isPlayer && pl.attackT > 0.15 && p.blockT <= 0 && Math.random() < dt * 3 * p.skill) p.blockT = 0.5;
  p.cool -= dt;
  if (p.cool <= 0 && !(p.pendHit > 0) && p.blockT <= 0 && !(p.stagger > 0)) {
    p.cool = rand(0.9, 1.7) / (0.7 + p.skill * 0.5);
    p.atkKind = p.bat ? 'swing' : Math.random() < 0.25 ? 'kick' : 'punch';
    p.atkT = p.atkKind === 'swing' ? 0.55 : p.atkKind === 'kick' ? 0.5 : 0.45;
    p.pose.punchArm = Math.random() < 0.5 ? 1 : -1;
    p.pendHit = 0.24; p.pendTarget = t;
    g.audio.play('swing', { x: p.x, z: p.z, gain: 0.35 });
  }
  if (p.pendHit !== undefined && p.pendHit <= 0 && p.pendTarget) {
    const tt = p.pendTarget; p.pendTarget = null; p.pendHit = undefined;
    const tx2 = tt.isPlayer ? pl.pos.x : tt.x, tz2 = tt.isPlayer ? pl.pos.z : tt.z;
    const ex = tx2 - p.x, ez = tz2 - p.z, ed = Math.hypot(ex, ez) || 1;
    if (ed > reach + 0.35 || (ex * Math.sin(p.h) + ez * Math.cos(p.h)) / ed < 0.45) return; // whiffed: the target moved
    const dmg = p.atkKind === 'swing' ? rand(13, 18) : p.atkKind === 'kick' ? rand(8, 12) : rand(5, 9);
    if (tt.isPlayer) {
      // melee keeps most of its old bite against the bigger health pool (x2.4, not x3)
      const pdmg = dmg * HP_SCALE * 0.8;
      if (pl.state !== 'foot' || pl.invuln > 0) return;
      // a block works when facing the attacker
      const fx = Math.sin(pl.h), fz = Math.cos(pl.h), facing = (-ex * fx + -ez * fz) / ed;
      if (pl.blocking && facing > 0.35) { pl.damage(pdmg * 0.18, 'block'); g.audio.play('block'); p.stagger = 0.45; g.cam.shake(0.05); return; }
      pl.damage(pdmg, p.atkKind === 'swing' || p.atkKind === 'kick' ? 'heavy' : 'gang');
      pl.vel.x += ex / ed * 2.2; pl.vel.z += ez / ed * 2.2;
      g.audio.play('punch', { gain: 0.7 }); g.cam.shake(0.1); g.fx.impact(pl.pos.x, pl.pos.y + 1.3, pl.pos.z, 4);
    } else {
      if (tt.blockT > 0 && Math.random() < 0.6) { g.audio.play('block', { x: tt.x, z: tt.z }); return; }
      tt.health -= dmg; tt.char.flash = 0.08; tt.stagger = 0.4; tt.lastHitBy = p.kind === 'crew' ? 'pc' : p.fac;
      g.audio.play('punch', { x: tt.x, z: tt.z, gain: 0.6 });
      if (tt.health <= 0 || (p.atkKind !== 'punch' && Math.random() < 0.4)) g.peds.knock(tt, ex / ed * 4, ez / ed * 4, 0, false, 'melee');
    }
  }
}
function gangBrain(p, dt) {
  const g = game, uw = g.uw, pl = g.player, gr = p.group;
  if (p.state === 'down' || p.state === 'ko' || !uw) return;
  p.state = 'free';
  p.retT = (p.retT || 0) - dt; p.fleeT = (p.fleeT || 0) - dt; p.alertT = (p.alertT || 0) - dt;
  if (p.stagger > 0) { p.vx = damp(p.vx, 0, 6, dt); p.vz = damp(p.vz, 0, 6, dt); return; }
  if ((p.tT = (p.tT || 0) - dt) <= 0) { p.tT = 0.35; p.target = brainTarget(p); }
  const att = uw.attitude(p.fac);
  // broken courage: run from the player
  if (p.fleeT > 0 || (p.health < p.maxHealth * 0.3 && p.courage < 0.55)) {
    const dx = p.x - pl.pos.x, dz = p.z - pl.pos.z, d = Math.hypot(dx, dz) || 1;
    p.vx = damp(p.vx, dx / d * 5.4, 6, dt); p.vz = damp(p.vz, dz / d * 5.4, 6, dt); p.pose.aim = 0;
    if (p.fleeT <= 0) p.fleeT = 4;
    return;
  }
  const t = p.target;
  if (t && !(t.isPlayer && t.state === 'away' && !p.gun)) { gangAttack(p, t, dt); return; }
  p.pose.aim = 0; p.pose.hold = p.bat ? 'bat' : null;
  // no fight: stand on the corner, warn trespassers, keep clear of a feared player
  const home = p.home;
  const dh = Math.hypot(home.x - p.x, home.z - p.z);
  const dp = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
  const onFoot = pl.state === 'foot' && !pl.interior;
  // recognising the player takes a real look: line of sight, in range, held for a moment. A faction that is actively
  // after you (aggro hot) knows your face anywhere, on foot or slowing past in a car; otherwise only an enemy faction
  // on its own turf picks you out, close up and on foot.
  if (gr && !gr.hostile && gr.kind !== 'war' && !pl.interior && pl.state !== 'dead' && att !== 'fearful' && FACTIONS[p.fac]) {
    const ag = uw.gangs.aggro(p.fac), hot = ag >= GANG_AGGRO.hot;
    const inCar = pl.state === 'vehicle', slow = !inCar || (pl.vehicle && Math.abs(pl.vehicle.speed) < 10);
    const range = hot ? (inCar ? 9 : 20) : (att === 'hostile' && onFoot && uw.owner[turfAt(p.x, p.z)] === p.fac ? 12 : 0);
    let looking = false;
    if (range > 0 && slow && dp < range) looking = (p.losT = (p.losT || 0) - dt) > 0 ? p.los : (p.losT = 0.3, p.los = g.world.grid.lineOfSight(p.x, p.y + 1.5, p.z, pl.pos.x, pl.pos.y + 1.4, pl.pos.z));
    p.spotT = looking ? (p.spotT || 0) + dt : Math.max(0, (p.spotT || 0) - dt * 2);
    if (p.spotT > (hot ? 0.5 : 1.2)) { p.spotT = 0; gr.hostile = true; gr.lostT = 0; uw.gangs.sighting(p.fac); uw.gangs.say(p, pick(LINES.provoked)); return; }
  }
  if (gr && gr.kind !== 'hq' && onFoot && dp < 5 && att === 'fearful' && p.role !== 'boss') {
    const dx = p.x - pl.pos.x, dz = p.z - pl.pos.z;
    p.vx = damp(p.vx, dx / dp * 1.6, 4, dt); p.vz = damp(p.vz, dz / dp * 1.6, 4, dt);
    p.h = dampAngle(p.h, Math.atan2(-dx, -dz) + 0.9, 3, dt);
    if (!gr.saidFear) { gr.saidFear = 1; uw.gangs.say(p, pick(LINES.fear)); }
    return;
  }
  if (gr && onFoot && (att === 'territorial' || att === 'hostile') && uw.owner[turfAt(p.x, p.z)] === p.fac && gr.kind !== 'war') {
    if (dp < 5.5) {
      if (!gr.warned) { gr.warned = g.time; uw.gangs.say(p, pick(uw.rank >= 2 ? LINES.warnKnown : LINES.warn)); }
      else if (gr.kind === 'hang' && g.time - gr.warned > 9 && dp < 3.5 && att === 'territorial' && uw.rank < 2) { gr.hostile = true; uw.gangs.say(p, 'I told you once.'); return; }
      p.h = dampAngle(p.h, Math.atan2(pl.pos.x - p.x, pl.pos.z - p.z), 5, dt);
      p.vx = damp(p.vx, 0, 6, dt); p.vz = damp(p.vz, 0, 6, dt);
      return;
    }
  }
  if (gr && att === 'friendly' && onFoot && dp < 4 && !gr.saidHi) { gr.saidHi = 1; uw.gangs.say(p, pick(LINES.friendly)); }
  if (dh > 1.5) { const sp = dh > 8 ? 4.2 : 1.4; p.vx = damp(p.vx, (home.x - p.x) / dh * sp, 4, dt); p.vz = damp(p.vz, (home.z - p.z) / dh * sp, 4, dt); p.h = dampAngle(p.h, Math.atan2(home.x - p.x, home.z - p.z), 6, dt); }
  else { p.vx = damp(p.vx, 0, 6, dt); p.vz = damp(p.vz, 0, 6, dt); p.h = dampAngle(p.h, home.h + Math.sin(g.time * 0.4 + p.id) * 0.7, 2, dt); p.pose.phone = p.role === 'dealer' ? false : Math.sin(g.time * 0.2 + p.id * 3) > 0.7; }
}
function crewBrain(p, dt) {
  const g = game, uw = g.uw, pl = g.player;
  if (p.state === 'down' || p.state === 'ko' || !uw) return;
  p.state = 'free';
  if (p.stagger > 0) { p.vx = damp(p.vx, 0, 6, dt); p.vz = damp(p.vz, 0, 6, dt); return; }
  if ((p.tT = (p.tT || 0) - dt) <= 0) { p.tT = 0.35; p.target = brainTarget(p); }
  const t = p.target;
  if (t) { gangAttack(p, t, dt); return; }
  p.pose.aim = 0; p.pose.hold = null;
  let gx, gz;
  if (p.role === 'guard' && p.group && p.group.kind === 'body') {
    // escort: flank behind the player
    const side = p.slot % 2 === 0 ? 1 : -1;
    const fx = Math.sin(pl.h), fz = Math.cos(pl.h);
    gx = pl.pos.x - fx * 1.8 + -fz * side * 1.3; gz = pl.pos.z - fz * 1.8 + fx * side * 1.3;
    const d = Math.hypot(gx - p.x, gz - p.z);
    // lost far behind and out of sight: catch up off-screen
    if (d > 60 && !g.inView(p.x, 1, p.z, 1)) { p.x = gx; p.z = gz; p.y = groundY(gx, gz); }
  } else { gx = p.home.x; gz = p.home.z; }
  const dx = gx - p.x, dz = gz - p.z, d = Math.hypot(dx, dz);
  if (d > 0.8) { const sp = d > 7 ? 5.6 : d > 3 ? 3.2 : 1.5; p.vx = damp(p.vx, dx / d * sp, 6, dt); p.vz = damp(p.vz, dz / d * sp, 6, dt); p.h = dampAngle(p.h, Math.atan2(dx, dz), 8, dt); }
  else { p.vx = damp(p.vx, 0, 8, dt); p.vz = damp(p.vz, 0, 8, dt); p.h = dampAngle(p.h, p.group && p.group.kind === 'body' ? pl.h : p.home.h, 3, dt); }
}
function buyerBrain(p, dt) {
  const g = game, pl = g.player;
  if (p.state === 'down' || p.state === 'ko') return;
  p.state = 'free'; p.vx = damp(p.vx, 0, 6, dt); p.vz = damp(p.vz, 0, 6, dt);
  const dp = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
  if (dp < 6 && pl.state === 'foot') p.h = dampAngle(p.h, Math.atan2(pl.pos.x - p.x, pl.pos.z - p.z), 4, dt);
  else p.h = dampAngle(p.h, p.home.h + Math.sin(g.time * 0.3 + p.id) * 0.8, 2, dt);
  p.pose.phone = dp > 8 && Math.sin(g.time * 0.25 + p.id) > 0.4;
  // sirens or gunfire nearby: buyers scatter
  if (g.police.level >= 2 && dp < 40) { p.state = 'flee'; p.timer = 6; p.fleeFrom = { x: pl.pos.x, z: pl.pos.z }; p.brain = null; p.keep = false; }
}

