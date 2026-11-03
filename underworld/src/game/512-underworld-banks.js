/* =====================================================================
   [UNDERWORLD] THE BANKS (353 is the content): banking at the counter and
   robbing the place, on the systems the game already has.
   - What a branch holds: BANKS[].base × the day of the economic week ×
     a seeded day's variation, split between the tills, the cash room, the
     vault and the deposit boxes. What a robbery takes is gone from that area
     until it recovers on the economic clock (BANK_T.recover per economic
     day, from S.econH, so saving, reloading, leaving the district, an arrest
     or a death change nothing). A drilled deposit box is empty for
     BANK_T.boxRefill economic days. Saved per bank in S.banks.
   - The robbery escalates: the tills are quick and small, the cash room is
     behind a door, the vault behind a drilled door, the boxes one at a time.
     Any robbery sets off the silent alarm: the wanted level the branch calls
     for, one more star for every BANKS[].escal seconds you stay, the police
     through the door after BANKS[].storm seconds and in waves after that.
     The building is contained (310) while you are inside. Walk out with what
     you have whenever you like.
   - Guards are people (300) who fight with the gang fight code (470,
     gangAttack): they hold their posts, warn a drawn gun, close in on an
     unarmed robber and hold him for the police (an arrest, 630 onBusted),
     and shoot it out with an armed or violent one. Hitting or killing one
     goes on the case file (511) as its own charge, on the CCTV.
   - A robbery adds a security step (another guard, faster police) that
     recovers one step every BANK_T.secRecover economic days (the M10 idea).
   - What you take is Dirty Cash in your hands (Money 'bankRob'); valuables
     from the boxes are hot goods.
   ===================================================================== */
class BankSystem {
  constructor(uw) { this.uw = uw; this.R = null; this.guards = []; this.civs = []; this.facade = null; this.rear = {}; this.via = 'front'; this.last = null; }
  get g() { return this.uw.g; }
  get S() { return this.uw.S; }
  static fresh() { return {}; }
  static sanitize(all, num) {
    const out = {};
    if (!all || typeof all !== 'object') return out;
    for (const id of BANK_IDS) {
      const b = all[id]; if (!b || typeof b !== 'object') continue;
      const rem = {};
      for (const a of ['counter', 'cash', 'vault']) { const r = b.rem && b.rem[a]; if (r && typeof r === 'object') rem[a] = { f: num(r.f, 1, 0, 1), h: num(r.h, 0, 0, 1e9) }; }
      const boxes = [];
      if (Array.isArray(b.boxes)) for (const x of b.boxes) if (Array.isArray(x) && x[0] >= 0 && x[0] < BANKS[id].boxes) boxes.push([x[0] | 0, Math.floor(num(x[1], 0, 0, 1e7)), Math.floor(num(x[2], 1, 1, 1e6))]);
      out[id] = { rem, boxes: boxes.slice(-BANKS[id].boxes), sec: Math.floor(num(b.sec, 0, 0, BANK_T.secMax)), secDay: Math.floor(num(b.secDay, 0, 0, 1e7)),
        n: Math.floor(num(b.n, 0, 0, 1e6)), last: Math.floor(num(b.last, -1, -1, 1e7)), taken: num(b.taken, 0, 0, 1e12) };
    }
    return out;
  }
  st(id) { const S = this.S; S.banks = S.banks || {}; return S.banks[id] || (S.banks[id] = { rem: {}, boxes: [], sec: 0, secDay: 0, n: 0, last: -1, taken: 0 }); }
  // ---------------------------------------------------------------- what a branch holds
  // the full reserve today: the base, the day of the economic week, and a day's variation seeded per bank and day
  full(id, day = this.S.day) {
    const B = BANKS[id], wk = BANK_T.week[((day % 7) + 7) % 7], v = 1 + (hash2i(day, B.tier * 97 + 11, 13) * 2 - 1) * BANK_T.noise;
    return Math.round(B.base * wk * v);
  }
  // the share of an area still there (1 full, 0 emptied): what was left plus what came back since, economic hours
  remOf(id, a) { const r = this.st(id).rem[a]; if (!r) return 1; return Math.min(1, r.f + Math.max(0, this.S.econH - r.h) / 24 * BANK_T.recover[a]); }
  areaFull(id, a) { return this.full(id) * BANKS[id].split[a]; }
  avail(id, a) { return Math.round(this.areaFull(id, a) * this.remOf(id, a)); }
  // take up to `share` of an area's full value (never more than is left); the area remembers when
  take(id, a, share) {
    const full = this.areaFull(id, a); if (full <= 0) return 0;
    const rem = this.remOf(id, a), amt = Math.round(full * Math.min(rem, share));
    this.st(id).rem[a] = { f: Math.max(0, rem - amt / full), h: this.S.econH };
    return amt;
  }
  // deposit boxes: one at a time, a box drilled stays empty for BANK_T.boxRefill economic days; what each holds is
  // seeded per bank, box and how often it has been drilled (most hold little, a few a lot; some hold valuables)
  boxOpen(id, i) { const b = this.st(id).boxes.find(x => x[0] === i); return !!(b && this.S.day - b[1] < BANK_T.boxRefill); }
  boxesLeft(id) { let n = 0; for (let i = 0; i < BANKS[id].boxes; i++) if (!this.boxOpen(id, i)) n++; return n; }
  boxValue(id, i, n) {
    const B = BANKS[id], k = BANK_T.boxSkew, u = hash2i(i * 31 + n * 7, B.tier * 53, 29);
    const cash = Math.round(this.areaFull(id, 'boxes') / B.boxes * (k + 1) * Math.pow(u, k));
    const hot = hash2i(i, n * 13 + B.tier, 31) < BANK_T.boxHot ? 1 + Math.floor(hash2i(n, i, 37) * 3) : 0;
    return { cash, hot };
  }
  drillBox(id) {
    const st = this.st(id);
    for (let i = 0; i < BANKS[id].boxes; i++) {
      if (this.boxOpen(id, i)) continue;
      const old = st.boxes.find(x => x[0] === i), n = old ? old[2] + 1 : 1;
      if (old) { old[1] = this.S.day; old[2] = n; } else st.boxes.push([i, this.S.day, n]);
      return { i, ...this.boxValue(id, i, n) };
    }
    return null;
  }
  // security: a step for a recent robbery, one recovering every BANK_T.secRecover economic days
  sec(id) { const s = this.st(id); return Math.max(0, s.sec - Math.floor((this.S.day - s.secDay) / BANK_T.secRecover)); }
  guardsFor(id) { const B = BANKS[id]; return Math.min(B.guardMax, B.guards + this.sec(id)); }
  slow(id) { return 1 + this.sec(id) * BANK_T.secSlow; }
  stormAt(id) { return Math.max(15, BANKS[id].storm - this.sec(id) * BANK_T.secStorm); }
  escalEvery(id) { return Math.max(15, BANKS[id].escal - this.sec(id) * BANK_T.secEscal); }
  // ---------------------------------------------------------------- the street side
  // the facades: one merged mesh, one lamp mesh, a name board each, and the rear staff doors with one sign mesh for
  // all three (built once)
  buildFacades() {
    if (this.facade) return;
    const g = this.g, grid = g.world.grid, gb = new GeoBuilder(), lb = new GeoBuilder(), boards = [];
    this.rear = {};
    for (const id of BANK_IDS) {
      const L = this.uw.loc('spot', 'bank_' + id); if (!L) continue;
      const fx = Math.sin(L.h), fz = Math.cos(L.h), y0 = groundY(L.x, L.z, CURB_H + 1);
      const hit = grid.raycast(L.x, y0 + 1.2, L.z, -fx, 0, -fz, 6, 0.5);
      const d = { x: L.x, z: L.z, h: L.h, wall: hit ? hit.t : 1.3, y0 };
      const nb = bankFacade(gb, lb, BANKS[id], d); nb.id = id; boards.push(nb);
      const r = this.rearOf(L); if (r) { this.rear[id] = r; bankRearDoor(gb, lb, r); }
    }
    const grp = new THREE.Group();
    if (gb.n) { const m = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.08 })); m.receiveShadow = true; m.castShadow = true; grp.add(m); }
    if (lb.n) grp.add(new THREE.Mesh(lb.build(), new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffc070, emissiveIntensity: 0.6, roughness: 0.4 })));
    for (const b of boards) {
      const B = BANKS[b.id], tex = makeSignTexture(B.name.toUpperCase(), b.id === 'c' ? '#2a2226' : b.id === 'd' ? '#1f3f6e' : '#2f6b4a', b.id === 'c' ? '#e8c860' : '#f4f1ea', 1024, Math.round(1024 * b.ht / b.w));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.ht), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.5 }));
      m.position.set(b.x, b.y, b.z); m.rotation.y = b.h; grp.add(m);
    }
    const rs = Object.values(this.rear);
    if (rs.length) {
      const tex = makeSignTexture('STAFF ENTRANCE', '#1d2a33', '#e8eef2', 512, 96);
      grp.add(new THREE.Mesh(bankRearSigns(rs), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25, roughness: 0.5 })));
    }
    for (const o of grp.children) o.frustumCulled = false;
    g.outdoor.add(grp); this.facade = grp;
  }
  // a bank's rear staff door: on the back wall of its building (the building's box, straight through from the front
  // door), at the pavement of the street behind; slid along the wall clear of anything standing on that pavement
  rearOf(L) {
    const g = this.g, grid = g.world.grid, fx = Math.sin(L.h), fz = Math.cos(L.h), ix = L.x - fx * 3, iz = L.z - fz * 3;
    const b = grid.query(ix - 0.1, iz - 0.1, ix + 0.1, iz + 0.1, []).find(c => c.kind === 'bld' && c.x1 !== undefined);
    if (!b) return null;
    const wx = Math.abs(fx) > 0.5 ? (fx > 0 ? b.x0 : b.x1) : L.x, wz = Math.abs(fz) > 0.5 ? (fz > 0 ? b.z0 : b.z1) : L.z;
    const h = L.h + Math.PI, ox = Math.sin(h), oz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
    // (the grid's query is by cell: each collider is tested for real, boxes and round props alike)
    const touches = (c, x, z, r) => c.x0 !== undefined ? x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1 : Math.hypot(c.x - x, c.z - z) < r + (c.r || 0);
    const clear = (x, z) => !grid.query(x - 0.7, z - 0.7, x + 0.7, z + 0.7, []).some(c => c !== b && c.on !== false && c.kind !== 'int' && c.y1 > 0.2 && c.y0 < 2.2 && touches(c, x, z, 0.7));
    for (const s of [0, 1.5, -1.5, 3, -3, 4.5, -4.5, 6, -6]) {
      const x = wx + rx * s, z = wz + rz * s, sx = x + ox * 1.3, sz = z + oz * 1.3;
      if (!clear(sx, sz) || !clear(x + ox * 0.5, z + oz * 0.5)) continue;
      return { x, z, h, sx, sz, y0: groundY(sx, sz, CURB_H + 1) };
    }
    return null;
  }
  // on the street by a bank's rear staff door: locked; a lockpick set (M10 tools) opens it, with nobody watching
  rearAction() {
    const g = this.g, p = g.player; if (!this.rear) return null;
    for (const id in this.rear) {
      const r = this.rear[id];
      if (dist2(r.sx, r.sz, p.pos.x, p.pos.z) > 1.8 * 1.8) continue;
      if (!this.uw.tools.picks) return { label: `Staff entrance · ${BANKS[id].short} · locked`, act: () => g.content.deny('Locked. A lockpick set would open it (Dockside Sully sells them).') };
      return { label: `Pick the staff entrance · ${BANKS[id].short}`, act: () => this.pickRear(id) };
    }
    return null;
  }
  pickRear(id) {
    const g = this.g, r = this.rear[id];
    if (g.police.level > 0) { g.content.deny('Not with the police on you.'); return; }
    g.content.channel('PICKING THE STAFF DOOR', BANK_T.pick, () => {
      if (!this.uw.tools.usePick()) return;
      this.enter(id, 'back');
      // a break-in on the street: anyone who saw it may call it in (300/310 witnesses)
      g.police.crime('burglary', r.sx, r.sz);
    });
  }
  // ---------------------------------------------------------------- walking in and out
  // in by the front doors, or (via 'back') by the rear staff door: you start just inside it, facing the room
  enter(id, via) {
    const g = this.g, B = BANKS[id], L = this.uw.loc('spot', 'bank_' + id); if (!B || !L) return;
    if (g.police.level > 0 && g.police.visible) { g.content.deny('They’d follow you straight in. Break line of sight first.'); return; }
    const I = g.content.interiors, def = I.addDynamic(bankInteriorDef(B, L)), Y = BANK_LAYOUT[id];
    def.spawn = via === 'back' ? { x: Y.rear.x, z: Y.rear.z } : null; def.spawnH = via === 'back' ? Y.rear.h : Math.PI;
    this.via = via === 'back' ? 'back' : 'front';
    I.enter(def.id);
  }
  onInterior(id, entered) {
    if (!id.startsWith('bank:')) return;
    const g = this.g, I = g.content.interiors;
    if (entered) {
      const def = I.def(id), bid = def.bank;
      this.R = { id: bid, def, via: this.via || 'front', alarm: false, alarmT: 0, waveT: 0, hostile: false, violent: false, took: 0, keycard: false,
        open: { sec: false, cash: false, vault: false }, swing: [], win: {}, grabs: { cash: 0, vault: 0 }, hit: new Set(), killed: new Set(), restrainT: 0, warnT: 0, warned: false, started: false,
        bag: { items: [], units: 0 }, hostages: false, noDeal: false, civHit: new Set(), civDead: new Set(), stormN: 0, stormT: 0, rearCovered: false, trespassT: 0, out: null };
      this.spawnGuards(); this.spawnCivilians();
      const B = BANKS[bid];
      g.ui.toast(this.R.via === 'back' ? `${B.name} · in by the staff door. Staff only back here: keep out of the guards’ sight.` : `${B.name} · ${this.sec(bid) ? 'security is up after a recent robbery' : 'open for business'}`);
    } else this.leave();
  }
  // whatever the way out (a door, an arrest, a death, a reload): the guards, the people in the bank and any police
  // inside go; the robbery is over; what was taken from the bank stays taken (S.banks, as it happened). The bag pays
  // out only through a door (settle); arrested or dead, it goes with you into custody, or nowhere
  leave() {
    const g = this.g, R = this.R; if (!R) return;
    for (const p of this.guards.concat(this.civs)) { const i = g.peds.peds.indexOf(p); if (i >= 0) g.peds.peds.splice(i, 1); }
    this.guards = []; this.civs = [];
    for (let k = g.police.cops.length - 1; k >= 0; k--) { const c = g.police.cops[k]; if (!c.bankCop) continue; const i = g.peds.peds.indexOf(c); if (i >= 0) g.peds.peds.splice(i, 1); g.police.cops.splice(k, 1); }
    if (g.police.contain === R.def.id) g.police.contain = null;
    if (R.alarm && g.police.level > 0) { g.police.lastSeen.x = R.def.door.x; g.police.lastSeen.z = R.def.door.z; }
    if (R.out === 'back' && R.alarm && g.police.level > 0 && R.rearCovered) this.rearCops();
    if (R.out) this.settle();
    else if (R.bag.items.length) g.ui.toast(`The bag (${fmtMoney(this.bagCash())}) goes into police evidence.`, 'warn');
    this.R = null;
  }
  reset() { if (this.R) this.leave(); this.R = null; this.guards = []; this.civs = []; }
  // out of the back with the police already covering it: officers at the door, and they have you
  rearCops() {
    const g = this.g, r = this.rear[this.R.id]; if (!r) return;
    const rx = Math.cos(r.h), rz = -Math.sin(r.h);
    for (const s of [-2.2, 2.2]) g.police.spawnCop(r.sx + rx * s + Math.sin(r.h) * 2.5, r.sz + rz * s + Math.cos(r.h) * 2.5);
    g.police.lastSeen.x = r.sx; g.police.lastSeen.z = r.sz; g.police.seenT = 0;
    g.ui.toast('Police at the back door! They were waiting for you.', 'warn');
  }
  spawnGuards() {
    const g = this.g, R = this.R, def = R.def, B = BANKS[R.id], Y = BANK_LAYOUT[R.id], n = this.guardsFor(R.id);
    this.guards = [];
    for (let i = 0; i < n && i < Y.posts.length; i++) {
      const post = Y.posts[i], p = g.peds.make('guard', Object.assign(randomLook(mulberry32(R.id.length * 17 + i)), { shirt: C(BANK_GUARD_LOOK.shirt), pants: C(BANK_GUARD_LOOK.pants), cap: C(BANK_GUARD_LOOK.cap), skirt: null }));
      p.x = def.ox + post.x; p.z = def.oz + post.z; p.y = def.fy; p.floor = def.fy; p.h = post.h; p.state = 'free'; p.keep = true; p.bank = R.id;
      p.post = { x: p.x, z: p.z, h: post.h }; p.home = p.post;
      p.gun = true; p.bat = false; p.role = B.tier >= 2 ? 'guard' : 'officer'; p.skill = 0.4 + B.tier * 0.1; p.courage = 1;
      p.health = 100 + B.tier * 15; p.maxHealth = p.health; p.atkT = 0; p.cool = rand(0.6, 1.4); p.fireT = rand(0.8, 1.6); p.blockT = 0;
      p.brain = bankGuardBrain; p.char.x = p.x; p.char.y = p.y; p.char.z = p.z; p.char.h = p.h;
      g.peds.peds.push(p); this.guards.push(p);
    }
  }
  // the people in the bank: the tellers, the manager and the other staff, the customers. People (300) on the bank's
  // floor, so they can be hurt like anyone else; bankCivBrain decides what each does (cv: idle, hands up, cowering,
  // on the floor as a hostage, running out, gone)
  spawnCivilians() {
    const g = this.g, R = this.R, def = R.def, Y = BANK_LAYOUT[R.id], look = BANK_STAFF_LOOK[R.id];
    this.civs = [];
    const add = (s, i, staff) => {
      const lk = randomLook(mulberry32((staff ? 41 : 59) * (i + 1) + R.id.charCodeAt(0) * 7 + (staff ? 0 : this.S.day)));
      if (staff) Object.assign(lk, s.id === 'security' ? { shirt: C(BANK_GUARD_LOOK.shirt), pants: C(BANK_GUARD_LOOK.pants), cap: C(BANK_GUARD_LOOK.cap), skirt: null } : { shirt: C(look.shirt), pants: C(look.pants), cap: null });
      const p = g.peds.make('bankciv', lk);
      p.x = def.ox + s.x; p.z = def.oz + s.z; p.y = def.fy; p.floor = def.fy; p.h = s.h; p.state = 'free'; p.keep = true; p.bank = R.id; p.bankCiv = true;
      p.staff = staff; p.post = { x: p.x, z: p.z, h: s.h }; p.cv = 'idle'; p.nerve = 0; p.nerveMax = rand(BANK_T.hostage.nerve[0], BANK_T.hostage.nerve[1]);
      p.brain = bankCivBrain; p.char.x = p.x; p.char.y = p.y; p.char.z = p.z; p.char.h = p.h;
      g.peds.peds.push(p); this.civs.push(p);
    };
    Y.staff.forEach((s, i) => add(s, i, true));
    Y.customers.forEach((c, i) => add(c, i, false));
  }
  // a civilian who ran out of the doors (or was let go)
  civGone(p) { const g = this.g, i = g.peds.peds.indexOf(p); if (i >= 0) g.peds.peds.splice(i, 1); p.cv = 'gone'; }
  // hostages: people on the floor at your word, still there and not hurt badly enough to be out of it
  hostages() { let n = 0; for (const c of this.civs) if (c.cv === 'floor' && !c.ko && c.state !== 'ko') n++; return n; }
  // the police wait while you hold hostages (a negotiator on the phone), and stop waiting once one has been hurt
  negotiation() { return this.R.noDeal ? 0 : Math.min(BANK_T.hostage.cap, this.hostages() * BANK_T.hostage.delay); }
  // ---------------------------------------------------------------- the alarm and the response
  alarm(why, violent, robbery) {
    const g = this.g, R = this.R; if (!R) return;
    if (violent) R.violent = true;
    if (robbery) this.started();
    if (!R.alarm) {
      R.alarm = true; R.alarmT = 0; R.waveT = 0;
      g.police.contain = R.def.id; g.police.lastSeen.x = R.def.door.x; g.police.lastSeen.z = R.def.door.z;
      g.audio.play('buzzer');
      g.ui.toast(why || 'Silent alarm. The police are on their way.', 'warn');
      // the staff put their hands up; a customer nobody is holding runs for the doors, or freezes where they are
      for (const c of this.civs) if (c.cv === 'idle') c.cv = c.staff ? 'hands' : Math.random() < 0.6 ? 'run' : 'cower';
    }
    this.escalate();
  }
  // the stars this robbery calls for: the branch's, one for violence, one for a killing, one for holding hostages,
  // one more for every escal seconds inside
  wantStars() {
    const R = this.R, B = BANKS[R.id];
    return Math.min(5, B.stars + (R.violent ? 1 : 0) + (R.killed.size || R.civDead.size ? 1 : 0) + (R.hostages ? 1 : 0) + Math.floor(R.alarmT / this.escalEvery(R.id)));
  }
  escalate() { const g = this.g, w = this.wantStars(); if (g.police.level < w) g.police.setLevel(w); }
  // the first real move against the bank: a security step for next time, the count, the charge on the CCTV
  started() {
    const R = this.R; if (R.started) return; R.started = true;
    const st = this.st(R.id), now = this.sec(R.id);
    st.sec = Math.min(BANK_T.secMax, now + 1); st.secDay = this.S.day; st.n++; st.last = this.S.day;
    this.g.save.stats.bankJobs = (this.g.save.stats.bankJobs || 0) + 1;
    this.file('bankrob');
  }
  file(type) { const R = this.R, d = R.def.door; this.uw.cops.crime(type, CRIMES[type] || 1, true, d.x, d.z, 'police'); }
  // combat (320) and the people code (300): hitting a guard or anyone else in the bank, putting one down
  onHit(c, kind) {
    const R = this.R; if (!R || c.bank !== R.id) return;
    c.lastHitKind = kind;
    if (c.bankCiv) { this.hurtCiv(c, false); return; }
    R.hostile = true;
    if (!R.hit.has(c.id)) { R.hit.add(c.id); this.file('assaultguard'); }
    this.alarm('A guard is down on the alarm. Every officer in the district is coming.', true);
  }
  onKnock(p, byPlayer, ko) {
    const R = this.R; if (!R || p.bank !== R.id || !byPlayer) return;
    if (p.bankCiv) { this.hurtCiv(p, ko && p.lastHitKind === 'gun'); return; }
    R.hostile = true;
    if (ko && !R.killed.has(p.id) && p.lastHitKind === 'gun') { R.killed.add(p.id); this.file('killguard'); this.g.ui.toast('A guard is dead. This is a murder case now.', 'warn'); }
    else if (!R.hit.has(p.id)) { R.hit.add(p.id); this.file('assaultguard'); }
    this.alarm(null, true);
  }
  // someone in the bank hurt by you: once the robbery is on (or they are your hostage) it is a hostage hurt, on the
  // CCTV as its own charge, and the police stop negotiating and come straight in; before that, an assault
  hurtCiv(c, dead) {
    const g = this.g, R = this.R, held = R.started || c.cv === 'floor';
    if (dead && !R.civDead.has(c.id)) { R.civDead.add(c.id); this.file(held ? 'killhostage' : 'koped'); g.ui.toast(held ? 'A hostage is dead. This is a murder case now.' : 'Someone is dead on the bank floor.', 'warn'); }
    else if (!R.civHit.has(c.id)) { R.civHit.add(c.id); this.file(held ? 'harmhostage' : 'assault'); }
    if (c.cv !== 'gone') c.cv = 'floor';
    this.alarm(held ? null : 'Screams in the bank: the alarm goes.', true);
    if (held && !R.noDeal) {
      R.noDeal = true;
      if (!R.stormed) { R.alarmT = Math.max(R.alarmT, this.stormAt(R.id)); R.waveT = 0; }
      g.ui.toast('A hostage is hurt. The police stop talking: they’re coming in now.', 'warn');
    }
  }
  // the police come in: through the front doors, and once they cover the back, every other wave through the staff door
  stormIn() {
    const g = this.g, R = this.R, B = BANKS[R.id], Y = BANK_LAYOUT[R.id], def = R.def;
    const inside = g.police.cops.filter(c => c.bankCop && c.state !== 'down' && g.peds.peds.includes(c)).length;
    let n = Math.min(B.wave, B.stormMax - inside);
    if (n <= 0) return;
    R.stormN++;
    const back = R.rearCovered && R.stormN % 2 === 0, at = back ? Y.rear : Y.storm;
    if (!R.stormed) { R.stormed = true; R.stormT = R.alarmT; g.ui.toast('Police! They’re coming through the front doors.', 'warn'); g.audio.play('radio'); }
    else if (back && !R.saidBack) { R.saidBack = true; g.ui.toast('Police coming in through the staff door at the back!', 'warn'); }
    while (n-- > 0) {
      const c = g.police.spawnCop(def.ox + at.x + rand(-0.8, 0.8), def.oz + at.z + rand(-0.6, 0.6)); if (!c) break;
      c.floor = def.fy; c.y = def.fy; c.bankCop = true; c.health = 90 + B.tier * 10; c.char.y = def.fy;
    }
    // the police bring out whoever is frozen in a corner
    for (const c of this.civs) if (c.cv === 'cower') c.cv = 'run';
  }
  // ---------------------------------------------------------------- per frame inside
  update(dt) {
    const g = this.g, R = this.R; if (!R || g.state !== 'playing') return;
    const p = g.player, Y = BANK_LAYOUT[R.id];
    if (!p.interior || p.interior.id !== R.def.id) return;
    this.swingDoors(dt);
    // a gun out: a guard who sees it tells you to put it away; keep it out (or fire) and the alarm goes
    const gunOut = p.wep && !p.wep.melee && p.aiming;
    const firing = p.wep && !p.wep.melee && p.attackT > 0;
    if (firing) { R.hostile = true; this.alarm('Shots fired in the bank! The alarm is ringing.', true); }
    else if (gunOut && !R.alarm && this.guardSees()) {
      if (!R.warned) { R.warned = true; R.warnT = 0; this.say(pick(['Hey! Put that away. Now.', 'Gun! Drop it!', 'Easy... put the weapon down.'])); }
      R.warnT += dt; if (R.warnT > BANK_T.warnT) { R.hostile = true; this.alarm('The guard hits the alarm. The police are on their way.'); }
    } else if (!gunOut && R.warned && !R.alarm) R.warnT = Math.max(0, R.warnT - dt);
    // behind the counter with no alarm (in by the staff door): a guard who sees you there tells you to get out; stay
    // in his sight and he hits the alarm (a break-in on the CCTV)
    const who = !R.alarm && p.pos.z - R.def.oz < Y.staffZ - 0.3 ? this.seenBy() : null;
    if (who) {
      if (!R.trespass) { R.trespass = true; g.content.say(who, who === 'Guard' ? pick(['Hey! You can’t be back here.', 'Staff only! Out. Now.']) : 'Who are you? You can’t be back here!'); }
      R.trespassT += dt;
      if (R.trespassT > BANK_T.warnT) { this.file('burglary'); this.alarm(who === 'Guard' ? 'The guard hits the alarm: an intruder in the back.' : 'The staff hit the panic button: an intruder in the back.'); }
    }
    // an armed robbery turns the guards on you; an unarmed one they try to hold for the police
    if (R.alarm && gunOut) R.hostile = true;
    if (R.alarm) {
      // the building stays contained while you are in it (whatever else cleared the search)
      if (g.police.contain !== R.def.id && g.police.level > 0) g.police.contain = R.def.id;
      R.alarmT += dt; this.escalate();
      const wait = this.negotiation(), at = this.stormAt(R.id);
      if (!R.stormed && wait > 0 && R.alarmT >= at && !R.negotiating) { R.negotiating = true; g.content.say('Police negotiator', 'This is the police. Nobody has to get hurt today. Let those people go and we can talk.'); }
      if (R.alarmT >= at + (R.stormed ? 0 : wait)) {
        R.waveT -= dt;
        if (R.waveT <= 0) { R.waveT = BANK_T.wave * (1 + Math.min(1, this.hostages() * BANK_T.hostage.waveMul)); this.stormIn(); }
      }
      if (R.stormed && !R.rearCovered && R.alarmT >= R.stormT + BANK_T.rearCover) { R.rearCovered = true; g.ui.toast('Police radio: units are covering the staff door at the back.', 'warn'); }
      // a guard's hands on an unarmed robber who isn't fighting back: held for the police
      if (!R.hostile) {
        const close = this.guards.some(q => q.state !== 'down' && Math.hypot(q.x - p.pos.x, q.z - p.pos.z) < 1.5 && Math.abs(q.y - p.pos.y) < 1.2);
        if (close && !(p.attackT > 0)) { R.restrainT += dt; if (R.restrainT > 0.3 && !R.saidHold) { R.saidHold = true; this.say('Don’t move! You’re staying right here till the police come.'); } }
        else R.restrainT = Math.max(0, R.restrainT - dt * 1.5);
        if (R.restrainT >= BANK_T.restrain) { R.restrainT = 0; g.content.cancelChannel(null); g.ui.toast('The guard pins you to the floor and holds you for the police.', 'warn'); g.onBusted(); return; }
      }
    }
    this.watchHostages(dt);
  }
  // hostages are held while you're out in the banking hall with them (the public side of the counter, within earshot);
  // while you're in the back (the cash room, the vault) each one loses their nerve, at their own pace, and makes a run
  // for the doors; back in the hall, they settle again
  watchHostages(dt) {
    const p = this.g.player, R = this.R, Y = BANK_LAYOUT[R.id];
    const hall = p.pos.z - R.def.oz > Y.staffZ;
    for (const c of this.civs) {
      if (c.cv !== 'floor' || c.ko || c.state === 'down') continue;
      const held = hall && Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < BANK_T.hostage.reach;
      c.nerve = held ? Math.max(0, c.nerve - dt * 2) : c.nerve + dt;
      if (c.nerve > c.nerveMax) { c.cv = 'run'; c.nerve = 0; if (!R.saidRun) { R.saidRun = true; this.g.ui.toast('A hostage is making a run for the doors.', 'warn'); } }
    }
  }
  guardSees() {
    const g = this.g, p = g.player, grid = g.world.grid;
    for (const q of this.guards) {
      if (q.state === 'down') continue;
      const d = Math.hypot(q.x - p.pos.x, q.z - p.pos.z); if (d > BANK_T.sightR) continue;
      if (grid.lineOfSight(q.x, q.y + 1.6, q.z, p.pos.x, p.pos.y + 1.3, p.pos.z)) return true;
    }
    return false;
  }
  // who in the bank sees you: a guard, or one of the staff at their post
  seenBy() {
    if (this.guardSees()) return 'Guard';
    const g = this.g, p = g.player, grid = g.world.grid;
    for (const c of this.civs) if (c.staff && c.cv === 'idle' && Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < 10 && grid.lineOfSight(c.x, c.y + 1.6, c.z, p.pos.x, p.pos.y + 1.3, p.pos.z)) return 'Staff';
    return null;
  }
  say(text) { this.g.content.say('Guard', text); }
  // ---------------------------------------------------------------- the bag
  bagCash() { return this.R.bag.items.reduce((a, i) => a + i.cash, 0); }
  bagFull() { return this.R.bag.units >= BANK_T.bag.cap - 0.5; }
  // what still fits in the bag of one kind of notes, in dollars
  room(src) { return Math.max(0, (BANK_T.bag.cap - this.R.bag.units) * BANK_T.bag.per[src]); }
  // take up to `share` of an area's full value, as much of it as fits in the bag (the rest stays in the bank)
  grab(area, share, src = area) {
    const full = this.areaFull(this.R.id, area); if (full <= 0) return 0;
    return this.take(this.R.id, area, Math.min(share, this.room(src) / full));
  }
  // into the bag: notes from the tills, the cash room, the vault or a box; dyeP: the chance a dye pack is in them
  bagPut(src, cash, dyeP, what, quiet) {
    const g = this.g, R = this.R;
    if (cash <= 0) { if (!quiet) g.ui.toast('Nothing left here. It hasn’t been restocked since the last robbery.', 'warn'); return; }
    const risky = dyeP > 0;
    R.bag.items.push({ src, cash, risky, dye: risky && Math.random() < dyeP, checked: !risky });
    R.bag.units += cash / BANK_T.bag.per[src];
    if (!quiet) g.ui.toast(`${what ? what + ': ' : ''}${fmtMoney(cash)} into the bag · ${fmtMoney(this.bagCash())}, ${Math.round(R.bag.units)}% full.`, 'money');
  }
  recount() { const R = this.R; R.bag.units = R.bag.items.reduce((a, i) => a + i.cash / BANK_T.bag.per[i.src], 0); }
  // the bag is full: dump the bulky small notes for denser ones, if there are any to dump; otherwise it's time to go
  makeRoom(src, then) {
    const g = this.g, R = this.R, per = BANK_T.bag.per, light = R.bag.items.filter(i => per[i.src] < per[src]);
    if (!light.length) { g.ui.toast('The bag is full. Get it out: the front doors, or the staff door at the back.', 'warn'); return; }
    const cash = light.reduce((a, i) => a + i.cash, 0);
    g.ui.ask('The bag is full', `Dump ${fmtMoney(cash)} of bulkier notes on the floor to make room for ${src === 'vault' ? 'the vault’s hundreds' : src === 'boxes' ? 'what’s in the boxes' : 'the cash room’s straps'}?`, 'Dump them', () => {
      if (!this.R) return;
      R.bag.items = R.bag.items.filter(i => per[i.src] >= per[src]); this.recount();
      g.ui.toast(`Dumped ${fmtMoney(cash)} on the floor. The bag is ${Math.round(R.bag.units)}% full.`, 'warn');
      then();
    });
  }
  unchecked() { return this.R.bag.items.filter(i => i.risky && !i.checked); }
  checkSecs() { return Math.max(BANK_T.bag.checkMin, Math.round(this.unchecked().length * BANK_T.bag.check)); }
  // going through the bag for dye packs: every bundle from the tills and the cash room; a pack found goes, with the
  // bait money round it
  checkBag(then) {
    const g = this.g, R = this.R, todo = this.unchecked(); if (!todo.length) { if (then) then(); return; }
    g.content.channel('GOING THROUGH THE BAG', this.checkSecs(), () => {
      let n = 0, lost = 0;
      for (const i of todo) { i.checked = true; if (!i.dye) continue; n++; i.dye = false; const b = Math.round(i.cash * BANK_T.dye.bait); i.cash -= b; lost += b; }
      this.recount();
      g.ui.toast(n ? `${n} dye pack${n > 1 ? 's' : ''} found and dumped, with the bait money round ${n > 1 ? 'them' : 'it'} (${fmtMoney(lost)}).` : 'No dye packs. Clean notes.', n ? 'warn' : 'money');
      if (then) then();
    });
  }
  // out of the front doors or the staff door at the back. Bundles in the bag nobody has gone through: a choice first
  walkOut(how) {
    const g = this.g, R = this.R, todo = this.unchecked();
    if (!todo.length) { this.goOut(how); return; }
    g.content.openSvc(how === 'back' ? 'The staff door' : 'The front doors', 'Teller drawers and cash room straps can hide a dye pack.', () => {
      let h = `<div class="svcTop"><span>The bag <b class="cash dirty">${fmtMoney(this.bagCash())}</b></span><span>${Math.round(R.bag.units)}% full</span></div>`;
      h += `<div class="hint">${todo.length} bundle${todo.length > 1 ? 's' : ''} from the tills and the cash room you haven’t gone through. A dye pack that leaves the building bursts: its bundle and some of the rest are ruined, and the red smoke shows the police where you came out.</div>`;
      h += `<div class="row"><button data-act="check">Go through the bag · ${this.checkSecs()} s</button><button class="danger" data-act="out">Walk out now</button><button data-act="stay">Stay</button></div>`;
      return h;
    }, a => { g.ui.back(); if (a === 'out') this.goOut(how); else if (a === 'check') this.checkBag(); });
  }
  goOut(how, quiet) {
    const g = this.g, R = this.R, I = g.content.interiors; R.out = how;
    const r = how === 'back' ? this.rear[R.id] : null;
    if (r) I.exit(quiet, { x: r.x + Math.sin(r.h) * 0.4, z: r.z + Math.cos(r.h) * 0.4, h: r.h }); else I.exit(quiet);
  }
  // through a door with the bag: what is in it becomes Dirty Cash in hand ('bankRob'), less what a dye pack leaving
  // the building ruins (its bundle and BANK_T.dye.stain of the rest); the red smoke shows the police where you are
  settle() {
    const g = this.g, R = this.R, items = R.bag.items; if (!items.length) return;
    const total = this.bagCash(), burst = items.filter(i => i.dye), hit = burst.reduce((a, i) => a + i.cash, 0);
    const ruined = burst.length ? hit + Math.round((total - hit) * BANK_T.dye.stain) : 0, paid = Math.max(0, total - ruined);
    if (paid > 0) { g.earn(paid, 'bankRob'); this.st(R.id).taken += paid; }
    R.took = paid; this.last = { id: R.id, out: R.out, total, ruined, paid, burst: burst.length };
    if (!burst.length) { g.ui.toast(`Out with ${fmtMoney(paid)} from the ${BANKS[R.id].short}.`, 'money'); return; }
    const p = g.player.pos;
    for (let k = 0; k < 8; k++) g.fx.puff(p.x + rand(-0.7, 0.7), p.y + 0.8 + rand(0, 0.8), p.z + rand(-0.7, 0.7), [0.86, 0.1, 0.14]);
    if (g.police.level > 0) { g.police.lastSeen.x = p.x; g.police.lastSeen.z = p.z; g.police.seenT = 0; }
    g.ui.toast(`A dye pack bursts in the bag! Red smoke everywhere: ${fmtMoney(ruined)} ruined. Out with ${fmtMoney(paid)}.`, 'warn');
  }
  // ---------------------------------------------------------------- the jobs (interior spots 'bk:...')
  label(key) {
    const R = this.R; if (!R) return '';
    const B = BANKS[R.id], armed = this.armed(), full = this.bagFull(), pct = () => ` · bag ${Math.round(R.bag.units)}%`;
    if (key[0] === 'w') {
      const i = +key.slice(1);
      if (R.win[i]) return `Window ${i + 1} · the drawer is empty`;
      return R.alarm || armed ? `Rob window ${i + 1}${full ? ' · the bag is full' : ''}` : `Window ${i + 1} · teller`;
    }
    const bag = R.bag.items.length ? ` · the bag: ${fmtMoney(this.bagCash())}` : '';
    switch (key) {
      case 'office': return R.keycard ? 'The manager’s desk · searched' : 'Search the manager’s desk';
      case 'sec': return R.open.sec ? 'The door is open' : R.keycard ? 'Swipe the keycard' : `Force the ${R.id === 'n' ? 'staff' : 'security'} door`;
      case 'cashdoor': return R.open.cash ? 'Cash room · open' : R.keycard ? 'Swipe the keycard · cash room' : 'Drill the cash room door';
      case 'cash': return !R.open.cash ? 'Cash room · locked' : this.cleaned('cash') ? 'Cash room · cleaned out' : full ? 'Cash room · the bag is full' : 'Bag the cash' + pct();
      case 'vaultdoor': return R.open.vault ? 'Vault · open' : `Drill the vault door · ${Math.round(B.vaultDoor * this.slow(R.id))} s`;
      case 'vault': return !R.open.vault ? 'Vault · sealed' : this.cleaned('vault') ? 'Vault · cleaned out' : full ? 'Vault · the bag is full' : 'Load the vault cash' + pct();
      case 'boxes': { const n = this.boxesLeft(R.id); return !n ? 'Deposit boxes · all drilled' : full ? 'Deposit boxes · the bag is full' : `Drill a deposit box · ${n} left` + pct(); }
      case 'hall': {
        if (!armed) return '';
        const n = this.hostages(), free = this.civs.some(c => c.cv !== 'floor' && c.cv !== 'gone' && !c.ko);
        return free ? 'Everybody on the floor! · take the hall' : n ? `Stay down! · ${n} hostage${n > 1 ? 's' : ''}` : '';
      }
      case 'exit': return 'Leave' + bag;
      case 'back': return 'Staff door · out the back' + bag;
    }
    return '';
  }
  armed() { const p = this.g.player; return !!(p.wep && !p.wep.melee); }
  // a room emptied this visit (R.grabs: the share of its full value taken), or with nothing in it to take
  cleaned(area) { return this.R.grabs[area] >= 0.995 || this.avail(this.R.id, area) <= 0; }
  spot(key) {
    const g = this.g, R = this.R; if (!R) return;
    const B = BANKS[R.id], C2 = g.content, slow = this.slow(R.id);
    if (key === 'exit') { this.walkOut('front'); return; }
    if (key === 'back') { this.walkOut('back'); return; }
    if (key[0] === 'w') { const i = +key.slice(1); if (R.win[i]) { g.ui.toast('That drawer is already empty.', 'warn'); return; } if (R.alarm || this.armed()) this.robWindow(i); else this.teller(i); return; }
    if (key === 'hall') { this.takeHall(); return; }
    if (key === 'office') {
      if (R.keycard) { g.ui.toast('Nothing else in the desk.'); return; }
      C2.channel('GOING THROUGH THE MANAGER’S DESK', 3 * slow, () => {
        // the petty cash comes out of the branch's tills (so it is never there twice), into the bag if it fits
        R.keycard = true; const c = this.grab('counter', 0.03); this.bagPut('counter', c, 0, null, true);
        g.ui.toast(c > 0 ? `A staff keycard and ${fmtMoney(c)} petty cash.` : this.bagFull() ? 'A staff keycard. No room in the bag for the petty cash.' : 'A staff keycard. The petty cash tin is empty.', 'money');
        this.alarm('The manager hits the panic button under the desk.', false, true);
      });
      return;
    }
    if (key === 'sec') {
      if (R.open.sec) return;
      if (R.keycard) { this.openDoor('sec'); this.alarm(null, false, true); return; }
      C2.channel(R.id === 'n' ? 'FORCING THE STAFF DOOR' : 'FORCING THE SECURITY DOOR', B.sec * slow, () => { this.openDoor('sec'); g.audio.play('clank'); });
      this.alarm(R.id === 'n' ? 'The staff door alarm goes off.' : 'The security door alarm goes off.', false, true);
      return;
    }
    if (key === 'cashdoor') {
      if (R.open.cash) return;
      C2.channel(R.keycard ? 'SWIPING THE KEYCARD' : 'DRILLING THE CASH ROOM DOOR', (R.keycard ? 1 : B.cashDoor) * slow, () => { this.openDoor('cash'); g.audio.play('clank'); });
      this.alarm(null, false, true);
      return;
    }
    if (key === 'cash' || key === 'vault') {
      const area = key, grabs = area === 'cash' ? B.grabs : B.vaultGrabs;
      if (!R.open[area]) { g.ui.toast(area === 'cash' ? 'The cash room is locked.' : 'The vault door is sealed.', 'warn'); return; }
      if (this.cleaned(area)) { g.ui.toast('There’s nothing left in here. It hasn’t been restocked since the last time.', 'warn'); return; }
      if (this.bagFull()) { this.makeRoom(area, () => this.spot(key)); return; }
      C2.channel(area === 'cash' ? 'BAGGING THE CASH' : 'LOADING THE VAULT CASH', (area === 'cash' ? B.grab : B.vaultGrab) * slow, () => {
        const amt = this.grab(area, 1 / grabs); R.grabs[area] += amt / Math.max(1, this.areaFull(R.id, area));
        this.bagPut(area, amt, area === 'cash' ? BANK_T.dye.cash[B.tier] : 0);
        if (area === 'vault' && R.id === 'c' && Math.random() < 0.35) { const got = this.uw.give({ hot: randi(1, 3) }, 'robbery'); if (got) g.ui.toast(`And from the vault's shelves: ${goodsList(got)}.`, 'money'); }
      });
      this.alarm(null, false, true);
      return;
    }
    if (key === 'vaultdoor') {
      if (R.open.vault) return;
      C2.channel('DRILLING THE VAULT DOOR', B.vaultDoor * slow, () => { this.openDoor('vault'); g.audio.play('clank'); g.ui.toast('The bolts draw back. The vault door swings open.', 'money'); });
      this.alarm('The vault’s seismic alarm trips.', false, true);
      return;
    }
    if (key === 'boxes') {
      if (!this.boxesLeft(R.id)) { g.ui.toast('Every box here has been drilled. Nothing left until people fill them again.', 'warn'); return; }
      if (this.bagFull()) { this.makeRoom('boxes', () => this.spot(key)); return; }
      C2.channel('DRILLING A DEPOSIT BOX', B.box * slow, () => {
        const b = this.drillBox(R.id); if (!b) return;
        const got = b.hot ? this.uw.give({ hot: b.hot }, 'robbery') : null, fit = Math.min(b.cash, Math.floor(this.room('boxes')));
        if (!fit && !got) { g.ui.toast(b.cash ? `Box ${b.i + 1}: ${fmtMoney(b.cash)}, and no room left in the bag for it.` : pick([`Box ${b.i + 1}: old letters and a will.`, `Box ${b.i + 1}: empty.`, `Box ${b.i + 1}: somebody’s baby teeth.`]), ''); return; }
        if (fit) this.bagPut('boxes', fit, 0, `Box ${b.i + 1}${got ? ' (and ' + goodsList(got) + ')' : ''}${fit < b.cash ? ` · ${fmtMoney(b.cash - fit)} didn’t fit` : ''}`);
        else g.ui.toast(`Box ${b.i + 1}: ${goodsList(got)}.`, 'money');
      });
      this.alarm(null, false, true);
    }
  }
  // "Everybody on the floor!": everyone in the hall (in earshot) goes down and stays down while you're watching; it
  // starts the robbery, files hostage-taking on the CCTV and turns the guards on you (a gun on the room)
  takeHall() {
    const g = this.g, R = this.R, p = g.player; if (!this.armed()) return;
    let n = 0;
    for (const c of this.civs) {
      if (c.cv === 'gone' || c.ko || Math.hypot(c.x - p.pos.x, c.z - p.pos.z) > BANK_T.hostage.reach) continue;
      c.cv = 'floor'; c.nerve = 0; n++;
    }
    g.content.say('You', R.hostages ? 'Stay down! Nobody moves!' : 'Everybody on the floor! Nobody moves, nobody gets hurt!');
    if (n && !R.hostages) { R.hostages = true; this.file('hostage'); }
    R.hostile = true;
    this.alarm('A hold-up in the banking hall. The alarm goes.', false, true);
  }
  // a teller: an armed robber gets the drawer; an unarmed note gets half of it, or a refusal and the alarm
  robWindow(i) {
    const g = this.g, R = this.R, B = BANKS[R.id], armed = this.armed(), Y = BANK_LAYOUT[R.id];
    if (this.bagFull()) { this.makeRoom('counter', () => this.robWindow(i)); return; }
    if (!armed && !R.alarm && Math.random() > [0, 0.65, 0.45, 0.3][B.tier]) {
      R.win[i] = true; this.say('Not today. *the teller ducks and the alarm goes*');
      this.alarm('The teller hits the alarm. The guards are coming for you.', false, true);
      return;
    }
    g.content.channel(armed ? 'THE TELLER FILLS THE BAG' : 'PASSING THE TELLER A NOTE', B.win * this.slow(R.id), () => {
      R.win[i] = true;
      this.bagPut('counter', this.grab('counter', (armed ? 1 : 0.5) / Y.windows.length), BANK_T.dye.win[B.tier] + (armed ? 0 : BANK_T.dye.note), `Window ${i + 1}`);
    });
    this.alarm(null, false, true);
  }
  // a door the robbery has opened: it swings (swingDoors); the label and the job behind it count it open at once
  openDoor(key) {
    const R = this.R, Lk = R.def.locks && R.def.locks[key]; if (!Lk || R.open[key]) return;
    R.open[key] = true; R.swing.push({ key, t: 0 });
  }
  // the doors on their way open: a vault's wheel, its bolts, out of the frame, the swing. The doorway stays shut until
  // the door is clear of it; then the open door is solid where it stands (a collider of its own, gone with the room)
  swingDoors(dt) {
    const R = this.R, def = R.def;
    for (let i = R.swing.length - 1; i >= 0; i--) {
      const s = R.swing[i], Lk = def.locks[s.key], end = Lk.times.swing[1];
      s.t = Math.min(end, s.t + dt); bankDoorPlace(def.doors[s.key], s.t);
      if (s.t < end) continue;
      R.swing.splice(i, 1);
      const c = def.cols[Lk.col]; if (c) c.on = false;
      const o = bankDoorOpenBox(Lk);
      def.cols.push(this.g.world.grid.add({ x0: def.ox + o.x0, x1: def.ox + o.x1, z0: def.oz + o.z0, z1: def.oz + o.z1, y0: def.fy + o.y0 - 0.5, y1: def.fy + o.y1, kind: 'int', base: def.fy }));
    }
  }
  // banking at a window: your Clean Bank account, the books, and (if you mean it) the robbery
  teller(i) {
    const g = this.g, R = this.R, B = BANKS[R.id], S = this.S, L = S.lastLedger;
    const sum = o => o ? Object.values(o).reduce((a, b) => a + b, 0) : 0;
    g.content.openSvc(`${B.name} · Window ${i + 1}`, 'Good day. How can we help?', () => {
      let h = `<div class="svcTop"><span>Your account <b class="cash clean">${fmtMoney(Money.clean)}</b></span>${Money.debt > 0 ? `<span>Medical debt <b>${fmtMoney(Money.debt)}</b></span>` : ''}</div>`;
      h += `<div class="hint">${L ? `Yesterday's statement: in <b class="cash clean">${fmtMoney(sum(L.inc))}</b>, out <b>${fmtMoney(sum(L.exp))}</b>.` : 'No statement yet: the first economic day hasn’t closed.'} Business income, Clean winnings and car sales are paid into this account; fines, fees and Clean purchases come out of it.</div>`;
      h += `<div class="hint">The branch doesn't take cash over the counter without a source of funds. Dirty money has to come through a front or the fixer first.</div>`;
      h += `<div class="row"><button data-act="close">Thank you</button><button class="danger" data-act="rob">Slide a note under the glass…</button></div>`;
      return h;
    }, a => {
      if (a === 'close') { g.ui.back(); return; }
      if (a === 'rob') { g.ui.back(); this.robWindow(i); }
    });
  }
  // a map entry per bank, once its district is known
  mapEntries() {
    const out = [], g = this.g;
    for (const id of BANK_IDS) {
      const L = this.uw.loc('spot', 'bank_' + id); if (!L || !g.save.discovered.zones[L.zone]) continue;
      const B = BANKS[id], s = this.sec(id);
      out.push({ key: 'bank:' + id, name: B.name, cat: 'bank', icon: 'K', x: L.x, z: L.z, sub: `${B.role}${s ? ' · security up after a robbery' : ''}` });
    }
    return out;
  }
}
// a guard: holds his post; with the alarm up, closes in on an unarmed robber to hold him, and shoots it out with an
// armed or violent one (the gang fight code); never leaves the building
function bankGuardBrain(p, dt) {
  const g = game, BK = g.uw && g.uw.banks, R = BK && BK.R, pl = g.player;
  if (p.state === 'down' || p.state === 'ko') return;
  p.state = 'free';
  if (p.stagger > 0) { p.vx = damp(p.vx, 0, 6, dt); p.vz = damp(p.vz, 0, 6, dt); return; }
  const dx = pl.pos.x - p.x, dz = pl.pos.z - p.z, d = Math.hypot(dx, dz) || 1;
  const here = R && pl.interior && pl.interior.id === R.def.id && Math.abs(pl.pos.y - p.y) < 2 && pl.state === 'foot';
  if ((p.losT = (p.losT || 0) - dt) <= 0) { p.losT = 0.3; p.los = here && d < BANK_T.sightR + 6 && g.world.grid.lineOfSight(p.x, p.y + 1.6, p.z, pl.pos.x, pl.pos.y + 1.3, pl.pos.z); }
  if (here && R.alarm && R.hostile && (p.los || d < 4)) {
    gangAttack(p, { isPlayer: true, x: pl.pos.x, z: pl.pos.z, y: pl.pos.y, state: 'up' }, dt);
    if (!p.saidFight) { p.saidFight = true; BK.say(pick(['Drop it! Drop it now!', 'Armed robbery in progress, I need backup!', 'Get down! Get down on the floor!'])); }
    return;
  }
  p.pose.aim = 0; p.pose.hold = here && R.alarm ? 'gun' : null;
  if (here && R.alarm && (p.los || d < 8)) {
    // close in and take hold (an unarmed robber): BankSystem.update counts the time his hands are on you
    const sp = d > 1.2 ? 4.6 : 0;
    p.vx = damp(p.vx, dx / d * sp, 8, dt); p.vz = damp(p.vz, dz / d * sp, 8, dt);
    p.h = dampAngle(p.h, Math.atan2(dx, dz), 9, dt);
    return;
  }
  // back to the post, facing the room
  const h = p.post, hx = h.x - p.x, hz = h.z - p.z, hd = Math.hypot(hx, hz);
  if (hd > 0.4) { const sp = hd > 3 ? 3.2 : 1.3; p.vx = damp(p.vx, hx / hd * sp, 5, dt); p.vz = damp(p.vz, hz / hd * sp, 5, dt); p.h = dampAngle(p.h, Math.atan2(hx, hz), 6, dt); }
  else { p.vx = damp(p.vx, 0, 6, dt); p.vz = damp(p.vz, 0, 6, dt); p.h = dampAngle(p.h, h.h + (here && d < 6 ? Math.atan2(dx, dz) - h.h : 0) * 0.6, 3, dt); }
}
// someone in the bank: at their post (a teller at the window, a customer in the queue); when the alarm goes the staff
// put their hands up and a customer runs for the doors or freezes; on the floor at your word they are hostages and
// stay down (BankSystem.watchHostages decides when one runs); a run ends out of the front doors
function bankCivBrain(p, dt) {
  const g = game, BK = g.uw && g.uw.banks, R = BK && BK.R;
  if (p.state === 'down' || p.state === 'ko' || p.ko || !R) return;
  const def = R.def, Y = BANK_LAYOUT[R.id];
  if (p.cv === 'floor' || p.cv === 'cower') { p.state = 'cower'; p.timer = 99; p.pose.surrender = 0; p.vx = 0; p.vz = 0; return; }
  p.state = 'free';
  if (p.cv === 'run') {
    const tx = def.ox + Y.exit.x, tz = def.oz + Y.exit.z, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    p.runT = (p.runT || 0) + dt; p.pose.surrender = 0;
    if (d < 1.0 || p.runT > 12) { BK.civGone(p); return; }
    p.vx = damp(p.vx, dx / d * 4.4, 6, dt); p.vz = damp(p.vz, dz / d * 4.4, 6, dt);
    return;
  }
  p.pose.surrender = p.cv === 'hands' ? 1 : 0;
  const h = p.post, hx = h.x - p.x, hz = h.z - p.z, hd = Math.hypot(hx, hz);
  if (hd > 0.3) { p.vx = damp(p.vx, hx / hd * 1.3, 5, dt); p.vz = damp(p.vz, hz / hd * 1.3, 5, dt); p.h = dampAngle(p.h, Math.atan2(hx, hz), 6, dt); }
  else { p.vx = damp(p.vx, 0, 6, dt); p.vz = damp(p.vz, 0, 6, dt); p.h = dampAngle(p.h, h.h, 4, dt); }
}
