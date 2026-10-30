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
  constructor(uw) { this.uw = uw; this.R = null; this.guards = []; this.facade = null; }
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
  // the facades: one merged mesh, one lamp mesh, a name board each (built once)
  buildFacades() {
    if (this.facade) return;
    const g = this.g, grid = g.world.grid, gb = new GeoBuilder(), lb = new GeoBuilder(), boards = [];
    for (const id of BANK_IDS) {
      const L = this.uw.loc('spot', 'bank_' + id); if (!L) continue;
      const fx = Math.sin(L.h), fz = Math.cos(L.h), y0 = groundY(L.x, L.z, CURB_H + 1);
      const hit = grid.raycast(L.x, y0 + 1.2, L.z, -fx, 0, -fz, 6, 0.5);
      const d = { x: L.x, z: L.z, h: L.h, wall: hit ? hit.t : 1.3, y0 };
      const nb = bankFacade(gb, lb, BANKS[id], d); nb.id = id; boards.push(nb);
    }
    const grp = new THREE.Group();
    if (gb.n) { const m = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.08 })); m.receiveShadow = true; m.castShadow = true; grp.add(m); }
    if (lb.n) grp.add(new THREE.Mesh(lb.build(), new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffc070, emissiveIntensity: 0.6, roughness: 0.4 })));
    for (const b of boards) {
      const B = BANKS[b.id], tex = makeSignTexture(B.name.toUpperCase(), b.id === 'c' ? '#2a2226' : b.id === 'd' ? '#1f3f6e' : '#2f6b4a', b.id === 'c' ? '#e8c860' : '#f4f1ea', 1024, Math.round(1024 * b.ht / b.w));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.ht), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.5 }));
      m.position.set(b.x, b.y, b.z); m.rotation.y = b.h; grp.add(m);
    }
    for (const o of grp.children) o.frustumCulled = false;
    g.outdoor.add(grp); this.facade = grp;
  }
  // ---------------------------------------------------------------- walking in and out
  enter(id) {
    const g = this.g, B = BANKS[id], L = this.uw.loc('spot', 'bank_' + id); if (!B || !L) return;
    if (g.police.level > 0 && g.police.visible) { g.content.deny('They’d follow you straight in. Break line of sight first.'); return; }
    const I = g.content.interiors, def = I.addDynamic(bankInteriorDef(B, L));
    I.enter(def.id);
  }
  onInterior(id, entered) {
    if (!id.startsWith('bank:')) return;
    const g = this.g, I = g.content.interiors;
    if (entered) {
      const def = I.def(id), bid = def.bank;
      this.R = { id: bid, def, alarm: false, alarmT: 0, waveT: 0, hostile: false, violent: false, filed: false, took: 0, keycard: false,
        open: { sec: false, cash: false, vault: false }, win: {}, grabs: { cash: 0, vault: 0 }, hit: new Set(), killed: new Set(), restrainT: 0, warnT: 0, warned: false, started: false, seenT: 0 };
      this.spawnGuards();
      const B = BANKS[bid];
      g.ui.toast(`${B.name} · ${this.sec(bid) ? 'security is up after a recent robbery' : 'open for business'}`);
    } else this.leave();
  }
  // whatever the way out (the door, an arrest, a death, a reload): the guards and any police inside go; the robbery
  // is over; what was taken stays taken (it was saved to S.banks as it happened)
  leave() {
    const g = this.g, R = this.R; if (!R) return;
    for (const p of this.guards) { const i = g.peds.peds.indexOf(p); if (i >= 0) g.peds.peds.splice(i, 1); }
    this.guards = [];
    for (let k = g.police.cops.length - 1; k >= 0; k--) { const c = g.police.cops[k]; if (!c.bankCop) continue; const i = g.peds.peds.indexOf(c); if (i >= 0) g.peds.peds.splice(i, 1); g.police.cops.splice(k, 1); }
    if (g.police.contain === R.def.id) g.police.contain = null;
    if (R.alarm && g.police.level > 0) { g.police.lastSeen.x = R.def.door.x; g.police.lastSeen.z = R.def.door.z; }
    if (R.took > 0 && g.state === 'playing') g.ui.toast(`Out with ${fmtMoney(R.took)} from ${BANKS[R.id].short}.`, 'money');
    this.R = null;
  }
  reset() { if (this.R) this.leave(); this.R = null; this.guards = []; }
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
      for (const c of R.def.chars) { if (c.id.startsWith('cust')) c.pose.crouch = 1; else if (c.id !== 'security') c.pose.surrender = 1; }
    }
    this.escalate();
  }
  // the stars this robbery calls for: the branch's, one for violence, one more for every escal seconds inside
  wantStars() { const R = this.R, B = BANKS[R.id]; return Math.min(5, B.stars + (R.violent ? 1 : 0) + (R.killed.size ? 1 : 0) + Math.floor(R.alarmT / this.escalEvery(R.id))); }
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
  // combat (320) and the people code (300): hitting a guard, putting one down
  onHit(c, kind) {
    const R = this.R; if (!R || c.bank !== R.id) return;
    c.lastHitKind = kind; R.hostile = true;
    if (!R.hit.has(c.id)) { R.hit.add(c.id); this.file('assaultguard'); }
    this.alarm('A guard is down on the alarm. Every officer in the district is coming.', true);
  }
  onKnock(p, byPlayer, ko) {
    const R = this.R; if (!R || p.bank !== R.id || !byPlayer) return;
    R.hostile = true;
    if (ko && !R.killed.has(p.id) && p.lastHitKind === 'gun') { R.killed.add(p.id); this.file('killguard'); this.g.ui.toast('A guard is dead. This is a murder case now.', 'warn'); }
    else if (!R.hit.has(p.id)) { R.hit.add(p.id); this.file('assaultguard'); }
    this.alarm(null, true);
  }
  stormIn() {
    const g = this.g, R = this.R, B = BANKS[R.id], Y = BANK_LAYOUT[R.id], def = R.def;
    const inside = g.police.cops.filter(c => c.bankCop && c.state !== 'down' && g.peds.peds.includes(c)).length;
    let n = Math.min(B.wave, B.stormMax - inside);
    if (n > 0 && !R.stormed) { R.stormed = true; g.ui.toast('Police! They’re coming through the front doors.', 'warn'); g.audio.play('radio'); }
    while (n-- > 0) {
      const c = g.police.spawnCop(def.ox + Y.storm.x + rand(-1.2, 1.2), def.oz + Y.storm.z + rand(-0.4, 0.4)); if (!c) break;
      c.floor = def.fy; c.y = def.fy; c.bankCop = true; c.health = 90 + B.tier * 10; c.char.y = def.fy;
    }
  }
  // ---------------------------------------------------------------- per frame inside
  update(dt) {
    const g = this.g, R = this.R; if (!R || g.state !== 'playing') return;
    const p = g.player, B = BANKS[R.id];
    if (!p.interior || p.interior.id !== R.def.id) return;
    // a gun out: a guard who sees it tells you to put it away; keep it out (or fire) and the alarm goes
    const gunOut = p.wep && !p.wep.melee && p.aiming;
    const firing = p.wep && !p.wep.melee && p.attackT > 0;
    if (firing) { R.hostile = true; this.alarm('Shots fired in the bank! The alarm is ringing.', true); }
    else if (gunOut && !R.alarm && this.guardSees()) {
      if (!R.warned) { R.warned = true; R.warnT = 0; this.say(pick(['Hey! Put that away. Now.', 'Gun! Drop it!', 'Easy... put the weapon down.'])); }
      R.warnT += dt; if (R.warnT > BANK_T.warnT) { R.hostile = true; this.alarm('The guard hits the alarm. The police are on their way.'); }
    } else if (!gunOut && R.warned && !R.alarm) R.warnT = Math.max(0, R.warnT - dt);
    // an armed robbery turns the guards on you; an unarmed one they try to hold for the police
    if (R.alarm && gunOut) R.hostile = true;
    if (R.alarm) {
      // the building stays contained while you are in it (whatever else cleared the search)
      if (g.police.contain !== R.def.id && g.police.level > 0) g.police.contain = R.def.id;
      R.alarmT += dt; this.escalate();
      if (R.alarmT >= this.stormAt(R.id)) { R.waveT -= dt; if (R.waveT <= 0) { R.waveT = BANK_T.wave; this.stormIn(); } }
      // a guard's hands on an unarmed robber who isn't fighting back: held for the police
      if (!R.hostile) {
        const close = this.guards.some(q => q.state !== 'down' && Math.hypot(q.x - p.pos.x, q.z - p.pos.z) < 1.5 && Math.abs(q.y - p.pos.y) < 1.2);
        if (close && !(p.attackT > 0)) { R.restrainT += dt; if (R.restrainT > 0.3 && !R.saidHold) { R.saidHold = true; this.say('Don’t move! You’re staying right here till the police come.'); } }
        else R.restrainT = Math.max(0, R.restrainT - dt * 1.5);
        if (R.restrainT >= BANK_T.restrain) { R.restrainT = 0; g.content.cancelChannel(null); g.ui.toast('The guard pins you to the floor and holds you for the police.', 'warn'); g.onBusted(); return; }
      }
    }
    void B;
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
  say(text) { this.g.content.say('Guard', text); }
  // ---------------------------------------------------------------- the jobs (interior spots 'bk:...')
  label(key) {
    const R = this.R; if (!R) return '';
    const B = BANKS[R.id], armed = this.armed();
    if (key[0] === 'w') {
      const i = +key.slice(1);
      if (R.win[i]) return `Window ${i + 1} · the drawer is empty`;
      return R.alarm || armed ? `Rob window ${i + 1}` : `Window ${i + 1} · teller`;
    }
    switch (key) {
      case 'office': return R.keycard ? 'The manager’s desk · searched' : 'Search the manager’s desk';
      case 'sec': return R.open.sec ? 'The door is open' : R.keycard ? 'Swipe the keycard' : `Force the ${R.id === 'n' ? 'staff' : 'security'} door`;
      case 'cashdoor': return R.open.cash ? 'Cash room · open' : R.keycard ? 'Swipe the keycard · cash room' : 'Drill the cash room door';
      case 'cash': return !R.open.cash ? 'Cash room · locked' : R.grabs.cash >= B.grabs || this.avail(R.id, 'cash') <= 0 ? 'Cash room · cleaned out' : 'Bag the cash';
      case 'vaultdoor': return R.open.vault ? 'Vault · open' : `Drill the vault door · ${Math.round(B.vaultDoor * this.slow(R.id))} s`;
      case 'vault': return !R.open.vault ? 'Vault · sealed' : R.grabs.vault >= B.vaultGrabs || this.avail(R.id, 'vault') <= 0 ? 'Vault · cleaned out' : 'Load the vault cash';
      case 'boxes': { const n = this.boxesLeft(R.id); return n ? `Drill a deposit box · ${n} left` : 'Deposit boxes · all drilled'; }
    }
    return '';
  }
  armed() { const p = this.g.player; return !!(p.wep && !p.wep.melee); }
  spot(key) {
    const g = this.g, R = this.R; if (!R) return;
    const B = BANKS[R.id], C2 = g.content, slow = this.slow(R.id), d = R.def;
    if (key[0] === 'w') { const i = +key.slice(1); if (R.win[i]) { g.ui.toast('That drawer is already empty.', 'warn'); return; } if (R.alarm || this.armed()) this.robWindow(i); else this.teller(i); return; }
    if (key === 'office') {
      if (R.keycard) { g.ui.toast('Nothing else in the desk.'); return; }
      C2.channel('GOING THROUGH THE MANAGER’S DESK', 3 * slow, () => {
        // the petty cash comes out of the branch's tills (so it is never there twice)
        R.keycard = true; const c = this.take(R.id, 'counter', 0.03); if (c > 0) { g.earn(c, 'bankRob'); R.took += c; this.st(R.id).taken += c; }
        g.ui.toast(c > 0 ? `A staff keycard and ${fmtMoney(c)} petty cash.` : 'A staff keycard. The petty cash tin is empty.', 'money');
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
      if (R.grabs[area] >= grabs || this.avail(R.id, area) <= 0) { g.ui.toast('There’s nothing left in here. It hasn’t been restocked since the last time.', 'warn'); return; }
      C2.channel(area === 'cash' ? 'BAGGING THE CASH' : 'LOADING THE VAULT CASH', (area === 'cash' ? B.grab : B.vaultGrab) * slow, () => {
        R.grabs[area]++;
        const cash = this.take(R.id, area, 1 / grabs);
        this.pay(cash, area === 'vault' && R.id === 'c' && Math.random() < 0.35 ? { hot: randi(1, 3) } : null);
      });
      this.alarm(null, false, true);
      return;
    }
    if (key === 'vaultdoor') {
      if (R.open.vault) return;
      C2.channel('DRILLING THE VAULT DOOR', B.vaultDoor * slow, () => { this.openDoor('vault'); g.audio.play('clank'); g.ui.toast('The vault door swings open.', 'money'); });
      this.alarm('The vault’s seismic alarm trips.', false, true);
      return;
    }
    if (key === 'boxes') {
      if (!this.boxesLeft(R.id)) { g.ui.toast('Every box here has been drilled. Nothing left until people fill them again.', 'warn'); return; }
      C2.channel('DRILLING A DEPOSIT BOX', B.box * slow, () => {
        const b = this.drillBox(R.id); if (!b) return;
        if (!b.cash && !b.hot) { g.ui.toast(pick(['Box ' + (b.i + 1) + ': old letters and a will.', 'Box ' + (b.i + 1) + ': empty.', 'Box ' + (b.i + 1) + ': somebody’s baby teeth.']), ''); return; }
        this.pay(b.cash, b.hot ? { hot: b.hot } : null, 'Box ' + (b.i + 1));
      });
      this.alarm(null, false, true);
    }
    void d;
  }
  // a teller: an armed robber gets the drawer; an unarmed note gets half of it, or a refusal and the alarm
  robWindow(i) {
    const g = this.g, R = this.R, B = BANKS[R.id], armed = this.armed(), Y = BANK_LAYOUT[R.id];
    if (!armed && !R.alarm && Math.random() > [0, 0.65, 0.45, 0.3][B.tier]) {
      R.win[i] = true; this.say('Not today. *the teller ducks and the alarm goes*');
      this.alarm('The teller hits the alarm. The guards are coming for you.', false, true);
      return;
    }
    g.content.channel(armed ? 'THE TELLER FILLS THE BAG' : 'PASSING THE TELLER A NOTE', B.win * this.slow(R.id), () => {
      R.win[i] = true;
      const cash = this.take(R.id, 'counter', (armed ? 1 : 0.5) / Y.windows.length);
      this.pay(cash, null, `Window ${i + 1}`);
    });
    this.alarm(null, false, true);
  }
  pay(cash, goods, what) {
    const g = this.g, R = this.R;
    if (cash > 0) { g.earn(cash, 'bankRob'); R.took += cash; this.st(R.id).taken += cash; }
    const got = goods ? this.uw.give(goods, 'robbery') : null;
    if (cash > 0 || got) g.ui.toast(`${what ? what + ': ' : ''}${cash > 0 ? fmtMoney(cash) : ''}${cash > 0 && got ? ' and ' : ''}${got ? goodsList(got) : ''}. Total ${fmtMoney(R.took)}.`, 'money');
    else g.ui.toast('Nothing left here. It hasn’t been restocked since the last robbery.', 'warn');
  }
  openDoor(key) {
    const R = this.R, def = R.def, Lk = def.locks && def.locks[key]; if (!Lk) return;
    R.open[key] = true;
    const c = def.cols[Lk.col]; if (c) c.on = false;
    const m = def.doorMesh && def.doorMesh[key]; if (!m) return;
    if (key === 'vault' && R.id === 'c') { m.position.x = Lk.x + 2.4; m.position.z = Lk.z + 1.0; m.rotation.z = 0; m.rotation.y = -Math.PI / 2.6; }
    else if (Lk.along === 'x') { m.position.x = Lk.x + Lk.w / 2; m.position.z = Lk.z + Lk.w / 2; m.rotation.y = Math.PI / 2; }
    else { m.position.z = Lk.z + Lk.w / 2; m.position.x = Lk.x + Lk.w / 2; m.rotation.y = Math.PI / 2; }
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
