/* =====================================================================
   [UNDERWORLD] VEHICLE REGISTRY (§14, §45.29; Session 5A): the one place
   every persistent vehicle lives, and the one system that puts it in the
   world. A vehicle is in exactly one record.
   - Your fleet (save.garage). Every owned car holds a home bay at a
     property you own (e.at), reserved while the car is out: the fleet can
     never be larger than your real parking, and an empty bay whose car is
     out is not free. Out on the street a car is saved exactly where you
     left it (e.loc) and stands there again when you come back. Nothing
     tows a working car home, and nothing waits "in storage".
   - Tracked cars (save.tracked): the stolen cars you have driven and
     anything carrying your cargo, saved with position, condition, HOT
     state, trunk and the cash in it (the wallet key 't<id>'), at most
     VREG.max of them. Left unattended in public for about a day of the
     economic clock, police recover one: an explicit, logged event (its
     cargo and cash seized with it), never a silent deletion.
   - Wrecks: a destroyed owned car is towed home to its bay by your own
     people as a wreck that needs a repair (a recovery, not a seizure).
   - Rare and unique cars are never dropped: owned, they come home like
     any other; tracked, they are the last to give way when the registry
     is full.
   - A car you were given with nowhere to park it waits with whoever gave
     it to you (save.pendingCars), not in your fleet, until you have a free
     bay and collect it.
   ===================================================================== */
const VREG = { near: 150, keep: 340, max: 8, attend: 60, recover: 24, tick: 0.4, towWreck: 120 };
class VehicleRegistry {
  constructor(g) { this.g = g; this.cars = new Map(); this.trk = new Map(); this.t = 0; }
  get s() { return this.g.save; }
  get PM() { return this.g.uw.props; }
  get tracked() { return this.s.tracked || (this.s.tracked = []); }
  get log() { return this.s.vlog || (this.s.vlog = []); }
  econ() { return this.g.uw ? this.g.uw.S.econH : 0; }
  day() { return this.g.uw ? this.g.uw.S.day : 0; }
  // a line in the vehicle log: what happened to which car (and what went with it)
  note(what, type, extra = {}) { const L = this.log; L.push({ day: this.day(), what, type, ...extra }); if (L.length > 20) L.splice(0, L.length - 20); }
  // HOT (Session 5B): a tracked stolen car's r.hot or a fleet car's e.hot, saved with it; only a Chop Shop clean
  // takes it off
  isHot(v) { if (!v) return false; if (v.garageUid) { const e = this.entryOf(v); return !!(e && e.hot); } if (v.trackId) { const r = this.rec(v.trackId); return !!(r && r.hot); } return false; }
  // ---------------------------------------------------------------- the fleet
  entryOf(v) { return v && v.garageUid ? this.s.garage.find(e => e.uid === v.garageUid) : null; }
  bayPos(e) { const def = e.at && PROP_BY_ID[e.at.p]; return def ? this.PM.bays(def)[e.at.i] || null : null; }
  // where a fleet car is: its bay, or where you left it
  where(e) {
    if (e.imp && this.g.impound) { const sp = this.g.impound.slotPos(e); if (sp) return { x: sp.x, z: sp.z, name: `${IMPOUND.name} · ${this.g.impound.spaceName(e)}`, street: false, imp: true }; }
    if (e.out && e.loc) return { x: e.loc.x, z: e.loc.z, name: placeNameAt(e.loc.x, e.loc.z) || 'the street', street: true };
    const b = this.bayPos(e), def = e.at && PROP_BY_ID[e.at.p];
    return b ? { x: b.x, z: b.z, name: `${def.name} · ${PARK_LABEL[b.kind] || 'space'} ${b.i + 1}`, street: false } : null;
  }
  live(e) { const v = this.cars.get(e.uid); return v && this.g.vehicles.list.includes(v) && v.garageUid === e.uid ? v : null; }
  // put a fleet car into the world at p (a bay, or its saved street spot)
  spawnFor(e, p) {
    const g = this.g;
    for (const v of g.vehicles.list) if (v.garageUid === e.uid) { v.trunk = e.trunk || (e.trunk = {}); this.cars.set(e.uid, v); return v; }
    // a street spot something now stands on (the city was rebuilt round it: the Curved Roads pass laid new streets and
    // warehouses): the car is put at the nearest clear kerb instead, once, and you are told where (never inside a wall)
    if (e.out && p === e.loc && kerbBlocked(g.world, p.x, p.z, groundY(p.x, p.z, p.y), p.h || 0)) {
      const k = kerbSpot(g.world, p.x, p.z);
      if (k) {
        e.loc = { x: k.x, z: k.z, h: k.h, y: groundY(k.x, k.z) }; p = e.loc;
        if (g.ui) g.ui.toast(`Your ${VEHICLES[e.type].name} was moved to the kerb nearby: the street it stood on was rebuilt.`);
      }
    }
    // clear anything standing on the spot first (never the player's car, never another kept car)
    for (const v of g.vehicles.nearby(p.x, p.z, 4)) if (v !== g.player.vehicle && !v.garageUid && !v.trackId && !v.mission && Math.hypot(v.pos.x - p.x, v.pos.z - p.z) < 3 && Math.abs(v.pos.y - (p.y ?? v.pos.y)) < 2) g.vehicles.despawn(v);
    const v = g.vehicles.spawn(e.type, p.x, p.z, p.h, { parked: true, color: e.color, y: p.y, vtier: e.vtier || VEHICLES[e.type].tier });
    v.owned = true; v.touched = true; v.garageUid = e.uid; v.tune = e.tune; v.origin = e.origin; v.health = Math.max(1, 100 - e.dmg);
    v.trunk = e.trunk || (e.trunk = {}); v.looted = true; v.special = !!VEHICLES[e.type].special; v.display = !e.out; v.dirt = e.dirt ?? 0.5;
    if (e.dmg >= 100) { v.health = 0; v.burnt = false; }
    this.cars.set(e.uid, v);
    return v;
  }
  // free spaces for one more car: unreserved bays, less any car of yours still waiting for one (never negative)
  freeBays() { let n = 0; for (const def of this.PM.ownedList()) for (const b of this.PM.bays(def)) if (!this.PM.carAt(def.id, b.i)) n++; return Math.max(0, n - this.s.garage.filter(e => !e.at).length); }
  // a home bay for every car that lacks one (a save from before Session 5A, a property bought since): any free
  // bay at a property you own. The car itself stays where it is.
  house() {
    const s = this.s, PM = this.PM, taken = new Set();
    for (const e of s.garage) {
      const def = e.at && PROP_BY_ID[e.at.p];
      const ok = def && PM.owned(def.id) && PM.bays(def)[e.at.i] && !taken.has(def.id + ':' + e.at.i);
      if (ok) taken.add(def.id + ':' + e.at.i); else e.at = null;
    }
    for (const e of s.garage) {
      if (e.at) continue;
      for (const def of PM.ownedList()) { const b = PM.bays(def).find(x => !taken.has(def.id + ':' + x.i)); if (b) { e.at = { p: def.id, i: b.i }; taken.add(def.id + ':' + b.i); break; } }
      // still nowhere: it stands on the street by your place until a bay frees up (never "in storage")
      if (!e.at && !e.loc) { const h = this.homeSpot(); e.out = true; e.loc = { x: h.x, z: h.z, h: h.h, y: 0 }; }
    }
  }
  homeSpot() { const sh = this.g.missions.safe, c = curbNear(sh.x, sh.z, 8 + (this.s.garage.length % 5) * 6); return { x: c.x, z: c.z, h: c.h }; }
  updateFleet() {
    const g = this.g, s = this.s, p = g.player, px = p.pos.x, pz = p.pos.z, py = p.pos.y;
    if (s.garage.some(e => !e.at)) this.house(); // a car still waiting for a space takes one as soon as it frees
    for (const e of s.garage) {
      // a car in the police impound is the impound lot's to show and to let go of (Session 5B)
      if (e.imp) continue;
      const v = this.live(e);
      if (!v) this.cars.delete(e.uid); else if (v.trunk !== e.trunk) v.trunk = e.trunk || (e.trunk = {});
      const b = this.bayPos(e);
      if (v) {
        // leaving its bay takes it out; from then on it is saved wherever it stands
        if (!e.out && b && (Math.hypot(v.pos.x - b.x, v.pos.z - b.z) > 7 || Math.abs(v.pos.y - (b.y ?? v.pos.y)) > 3)) { e.out = true; v.display = false; e.loc = this.here(v); e.seen = this.econ(); g.autosave('Vehicle taken out'); }
        if (e.out) {
          e.loc = this.here(v); e.dmg = clamp(100 - v.health, 0, 100); e.dirt = v.dirt;
          const d = Math.hypot(v.pos.x - px, v.pos.z - pz), mine = v === p.vehicle || v === p.lastVehicle;
          if (v === p.vehicle || d < VREG.attend) e.seen = this.econ();
          // a wreck left behind: your people tow it home to its bay (a recovery, not a police matter)
          if (e.dmg >= 100 && v !== p.vehicle && b && d > VREG.towWreck && !g.inView(v.pos.x, 1, v.pos.z, 3)) { this.towHome(e, v); continue; }
          // a day left in public: the police tow it, even the last car you drove (it is only kept in the world for you)
          if (this.abandoned(e, v)) { g.impound.seize(e, 'abandoned'); continue; }
          if (d > VREG.keep && !mine && !g.inView(v.pos.x, 1, v.pos.z, 3)) { g.vehicles.despawn(v); this.cars.delete(e.uid); }
          continue;
        }
      }
      // a day out on the street with nobody near it: police tow it to the impound (§45.30); a wreck goes home
      if (this.abandoned(e, v)) { g.impound.seize(e, 'abandoned'); continue; }
      const at = e.out ? e.loc : b; if (!at) continue;
      const bay = !e.out && b;
      const near = Math.hypot(at.x - px, at.z - pz) < VREG.near && Math.abs((at.y ?? 0) - py) < (bay && b.kind === 'under' ? 20 : 60) && (bay && b.kind === 'under' ? p.interior && p.interior.vspace === b.space : !(p.interior && p.interior.vspace));
      if (near && !v) this.spawnFor(e, at);
      else if (!near && v && v !== p.vehicle && v !== p.lastVehicle && !e.out) { g.vehicles.despawn(v); this.cars.delete(e.uid); }
    }
  }
  here(v) { return { x: v.pos.x, z: v.pos.z, h: v.h, y: v.pos.y }; }
  // out on the street, not a wreck, nobody near it for a day of the economic clock, and not in your sight right now
  abandoned(e, v) {
    const g = this.g, p = g.player;
    if (!g.impound || !e.out || !e.loc || e.dmg >= 100 || this.econ() - (e.seen ?? this.econ()) < VREG.recover) return false;
    return !v || (v !== p.vehicle && !(g.inView(v.pos.x, 1, v.pos.z, 3) && Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z) < VREG.attend));
  }
  towHome(e, v) {
    const g = this.g;
    if (v && g.vehicles.list.includes(v) && v !== g.player.vehicle) g.vehicles.despawn(v);
    this.cars.delete(e.uid);
    e.out = false; e.loc = null; e.dmg = 100;
    const def = PROP_BY_ID[e.at.p];
    this.note('towed home wrecked', e.type, { uid: e.uid, to: def ? def.name : '' });
    g.ui.toast(`Your people towed the wrecked ${VEHICLES[e.type].name} home to ${def ? def.name : 'its space'}. It needs a repair.`, 'warn');
  }
  // a fleet car that burned: it comes home as a wreck (its cargo burned with it); the hulk left on the street is no
  // longer that car
  wrecked(e, v) {
    const lost = e.trunk && units(e.trunk) ? goodsList(e.trunk) : '';
    if (e.trunk) Inv.clear(e.trunk);
    if (v) { v.garageUid = 0; v.owned = false; v.trunk = {}; }
    this.cars.delete(e.uid);
    e.dmg = 100; e.out = false; e.loc = null;
    const def = e.at && PROP_BY_ID[e.at.p];
    this.note('wrecked, towed home', e.type, { uid: e.uid, to: def ? def.name : '', cargo: lost });
    return lost;
  }
  // ---------------------------------------------------------------- cars you don't own
  // a car worth keeping track of: one you are driving or that holds your cargo, not a job's, a cab, a lot car or yours
  eligible(v) { return !!v && !v.garageUid && !v.owned && !v.mission && !v.taxiCab && !v.dealer && !v.burnt && !isUniqueType(v.type) && this.g.vehicles.list.includes(v) && CARGO_LB[v.type] !== undefined; }
  rec(id) { return this.tracked.find(r => r.id === id) || null; }
  liveT(r) { const v = this.trk.get(r.id); return v && this.g.vehicles.list.includes(v) && v.trackId === r.id ? v : null; }
  track(v) {
    const s = this.s; if (!this.eligible(v) || v.trackId || v.untracked) return null;
    // full, and every car kept holds your goods or cash: nothing of yours is dropped to make room (§45.30). This
    // car stays usable while you use it, but it can't be remembered: you are told so, plainly.
    if (this.tracked.length >= VREG.max && !this.makeRoom(v)) { v.untracked = true; this.g.ui.toast(`Too many stolen cars with your things in them: this ${v.spec.name} can’t be kept track of. Leave it and it, and anything you put in it, won’t be safe.`, 'warn'); return null; }
    const id = s.nextTrack = (s.nextTrack || 0) + 1;
    const r = { id, type: v.type, color: v.colorHex, vtier: v.vtier || VEHICLES[v.type].tier, x: v.pos.x, z: v.pos.z, h: v.h, y: v.pos.y, hp: v.health, trunk: v.trunk || (v.trunk = {}), hot: !(v.origin === 'found' || v.legit), origin: v.origin === 'found' ? 'found' : v.dealerStolen ? 'dealer' : v.fac ? 'hijack' : 'stolen', fac: v.fac || null, rare: !!(v.rareFind || v.special || v.vtier === 'rare'), seen: this.econ(), since: this.econ(), tune: v.tune ? { ...v.tune } : null };
    this.tracked.push(r);
    v.trackId = id; v.stolenBefore = v.stolenBefore || r.hot; v.touched = true;
    Money.adoptCar(v, 't' + id); // its cash is kept in the wallet now (saved with the car)
    this.trk.set(id, v);
    return r;
  }
  // the registry is full: the oldest car with nothing of yours in it gives way (rare ones last). A car with your cargo
  // or cash in it never gives way (§45.30): with only those left, there is no room (false)
  makeRoom(keep) {
    const p = this.g.player, mine = r => units(r.trunk) > 0 || Money.dirtyInCar('t' + r.id) > 0;
    const cands = this.tracked.filter(r => { const v = this.liveT(r); return !mine(r) && !(v && (v === p.vehicle || v === keep)); });
    cands.sort((a, b) => ((a.rare ? 1 : 0) - (b.rare ? 1 : 0)) || (a.seen - b.seen));
    const r = cands[0]; if (!r) return false;
    this.release(r); return true;
  }
  // leaving a car the registry couldn't keep: say so if there is anything of yours in it
  warnUntracked(v) {
    if (!v || !v.untracked || v.warned || v.trackId) return;
    if (!(units(v.trunk) > 0 || +v.cash > 0)) return;
    v.warned = true;
    this.g.ui.toast(`Warning: this ${v.spec.name} isn’t being kept track of (8 stolen cars already hold your things). What you leave in it can be lost.`, 'warn');
  }
  // let a tracked car go back to being any car (nothing of yours in it)
  release(r) {
    const v = this.liveT(r); if (v) v.trackId = 0;
    this.trk.delete(r.id); this.tracked.splice(this.tracked.indexOf(r), 1);
    this.note('left behind', r.type, { id: r.id });
  }
  // police recover a stolen car: the car goes, and what was in it is seized (an explicit event)
  recover(r, why) {
    const g = this.g, v = this.liveT(r);
    const cargo = units(r.trunk) ? goodsList(r.trunk) : '', n = units(r.trunk), cash = Money.seizeCar('t' + r.id);
    Inv.clear(r.trunk);
    if (v && v !== g.player.vehicle) g.vehicles.despawn(v); else if (v) v.trackId = 0;
    this.trk.delete(r.id); const i = this.tracked.indexOf(r); if (i >= 0) this.tracked.splice(i, 1);
    const where = placeNameAt(r.x, r.z) || 'the street';
    this.note('recovered by police', r.type, { id: r.id, why, at: where, cargo, n, cash });
    const what = [cargo, cash > 0 ? fmtMoney(cash) : ''].filter(Boolean).join(' and ');
    if (g.uw) g.uw.news('radio', `Police radio: stolen ${VEHICLES[r.type].name} recovered on ${where}.${what ? ` Seized from it: ${what}.` : ''}`);
    if (!(g.uw && g.uw.S.jail)) g.ui.toast(`Police recovered the ${VEHICLES[r.type].name} you left on ${where}${what ? ` (and ${what} in it)` : ''}.`, 'warn');
  }
  // a tracked car burned: it is gone, and what was in it burned with it (logged); returns what was lost
  burned(v) {
    const r = v && v.trackId ? this.rec(v.trackId) : null; if (!r) return '';
    const cargo = units(r.trunk) ? goodsList(r.trunk) : '';
    Inv.clear(r.trunk); Money.seizeCar('t' + r.id);
    this.trk.delete(r.id); this.tracked.splice(this.tracked.indexOf(r), 1); v.trackId = 0;
    this.note('burned', r.type, { id: r.id, cargo });
    return cargo;
  }
  // a tracked car leaves the registry by design: sold to the chop shop, or parked into your fleet
  forget(v, why) {
    const r = v && v.trackId ? this.rec(v.trackId) : null; if (!r) return;
    if (why === 'owned' && v.garageUid) Money.rekeyCar('t' + r.id, v.garageUid);
    this.trk.delete(r.id); this.tracked.splice(this.tracked.indexOf(r), 1);
    v.trackId = 0;
    if (why === 'sold') this.note('sold to the chop shop', r.type, { id: r.id });
  }
  spawnTracked(r) {
    const g = this.g;
    for (const o of g.vehicles.nearby(r.x, r.z, 4)) if (o !== g.player.vehicle && !o.garageUid && !o.trackId && !o.mission && Math.hypot(o.pos.x - r.x, o.pos.z - r.z) < 3) g.vehicles.despawn(o);
    const v = g.vehicles.spawn(r.type, r.x, r.z, r.h, { parked: true, color: r.color, y: r.y, vtier: r.vtier });
    v.trackId = r.id; v.trunk = r.trunk; v.health = r.hp; v.touched = true; v.looted = true; v.stolenBefore = r.hot; v.fac = null; v.tune = r.tune || null;
    if (r.origin === 'found') v.origin = 'found';
    if (r.hp <= 0) { v.health = 0; v.burnt = false; }
    this.trk.set(r.id, v);
    return v;
  }
  updateTracked() {
    const g = this.g, p = g.player, px = p.pos.x, pz = p.pos.z, outdoors = !(p.interior && !p.interior.vspace), e = this.econ();
    // what you are driving, and the last car you left your cargo in, are kept track of
    const pv = p.state === 'vehicle' ? p.vehicle : null;
    if (pv && !pv.trackId && this.eligible(pv)) this.track(pv);
    const lv = p.lastVehicle;
    // room again (a car recovered, sold, parked): a car that couldn't be kept is kept now
    if (lv && lv.untracked && this.tracked.length < VREG.max) { lv.untracked = false; lv.warned = false; }
    if (lv && lv !== pv && !lv.trackId && this.eligible(lv) && (units(lv.trunk) > 0 || +lv.cash > 0)) this.track(lv);
    if (lv && lv !== pv) this.warnUntracked(lv);
    for (const r of this.tracked.slice()) {
      const v = this.liveT(r);
      if (!v) this.trk.delete(r.id);
      if (v) {
        if (v.burnt) { this.burned(v); continue; }
        if (v.garageUid) { this.forget(v, 'owned'); continue; }
        r.x = v.pos.x; r.z = v.pos.z; r.h = v.h; r.y = v.pos.y; r.hp = v.health;
        const d = Math.hypot(v.pos.x - px, v.pos.z - pz);
        if (v === pv || d < VREG.attend) r.seen = e;
        if (d > VREG.keep && v !== pv && v !== p.lastVehicle && !g.inView(v.pos.x, 1, v.pos.z, 3)) { g.vehicles.despawn(v); this.trk.delete(r.id); }
      } else if (outdoors && Math.hypot(r.x - px, r.z - pz) < VREG.near) { if (Math.hypot(r.x - px, r.z - pz) < VREG.attend) r.seen = e; this.spawnTracked(r); }
      // a day unattended in public: the police find it
      const v2 = this.liveT(r);
      if (e - r.seen >= VREG.recover && !(v2 && (v2 === pv || (g.inView(v2.pos.x, 1, v2.pos.z, 3) && Math.hypot(v2.pos.x - px, v2.pos.z - pz) < VREG.attend)))) this.recover(r, 'abandoned');
    }
  }
  // ---------------------------------------------------------------- gifts with nowhere to go
  // a car given to you: into a free bay if there is one, otherwise it waits with the giver
  give(type, origin, color, from) {
    const C2 = this.g.content;
    if (this.freeBays() > 0) return C2.addToGarage(type, origin, color, true);
    const s = this.s; (s.pendingCars || (s.pendingCars = [])).push({ type, origin, color: color !== undefined ? color : VEHICLES[type].colors[0], from: from || '' });
    this.g.ui.toast(`No free parking space: the ${VEHICLES[type].name} waits${from ? ' with ' + from : ''} until you have room (Garage).`, 'warn');
    return null;
  }
  // collect a waiting car into a free bay
  collect(i) {
    const s = this.s, P = (s.pendingCars || [])[i]; if (!P) return 'Nothing waiting.';
    if (this.freeBays() <= 0) return 'No free parking space.';
    s.pendingCars.splice(i, 1);
    this.g.content.addToGarage(P.type, P.origin, P.color, false);
    return '';
  }
  // ---------------------------------------------------------------- the clock, saves and resets
  update(dt) {
    const g = this.g; if (!g.uw || g.state !== 'playing') return;
    this.t -= dt; if (this.t > 0) return; this.t = VREG.tick;
    this.updateFleet(); this.updateTracked();
  }
  // before a save: every live kept car's position, condition and trunk into its record
  sync() {
    const s = this.s; if (!s || !s.garage) return;
    for (const e of s.garage) { const v = this.live(e); if (v) e.dirt = v.dirt; if (v && e.out) { e.loc = this.here(v); e.dmg = clamp(100 - v.health, 0, 100); } }
    for (const r of this.tracked) { const v = this.liveT(r); if (v) { r.x = v.pos.x; r.z = v.pos.z; r.h = v.h; r.y = v.pos.y; r.hp = v.health; } }
  }
  clearAll() {
    for (const v of this.cars.values()) if (this.g.vehicles.list.includes(v) && v !== this.g.player.vehicle) this.g.vehicles.despawn(v);
    for (const v of this.trk.values()) if (this.g.vehicles.list.includes(v) && v !== this.g.player.vehicle) this.g.vehicles.despawn(v);
    this.cars.clear(); this.trk.clear();
  }
  // a save (re)loaded: records are the truth, live cars are rebuilt from them as you come near
  reset() { this.clearAll(); this.t = 0; if (this.g.uw && this.s && this.s.garage) this.house(); if (this.g.impound) this.g.impound.reset(); }
  // sanitize the records in a save (SaveSystem): positions finite, trunks clean, the registry bounded
  static sanitize(d) {
    const ok = v => typeof v === 'number' && isFinite(v), num = (v, def, lo, hi) => ok(v) ? clamp(v, lo, hi) : def;
    const pt = o => o && typeof o === 'object' && ok(o.x) && ok(o.z) ? { x: o.x, z: o.z, h: ok(o.h) ? o.h : 0, y: ok(o.y) ? o.y : 0 } : null;
    for (const e of d.garage) {
      e.loc = pt(e.loc); e.out = !!e.loc;
      // HOT and the impound (Session 5B): a stolen car stays HOT until a Chop Shop clean; an impounded car keeps its fee
      e.hot = e.hot === undefined ? e.origin === 'stolen' && !e.cleaned : !!e.hot; e.cleaned = !!e.cleaned;
      e.seen = num(e.seen, 0, 0, 1e9);
      e.dirt = num(e.dirt, 0.5, 0, 1);
      const I = e.imp && typeof e.imp === 'object' ? e.imp : null;
      e.imp = I ? { why: ['arrest', 'abandoned', 'pursuit'].includes(I.why) ? I.why : 'abandoned', since: num(I.since, 0, 0, 1e9), fee: Math.round(num(I.fee, IMPOUND.fee.min, IMPOUND.fee.min, IMPOUND.fee.max)), slot: Math.floor(num(I.slot, -1, -1, 1e5)), paid: !!I.paid } : null;
      if (e.imp) { e.out = false; e.loc = null; }
    }
    let next = Number.isInteger(d.nextTrack) && d.nextTrack >= 0 ? d.nextTrack : 0;
    d.tracked = (Array.isArray(d.tracked) ? d.tracked : []).filter(r => r && typeof r === 'object' && VEHICLES[r.type] && Number.isInteger(r.id) && r.id > 0 && pt(r)).slice(-VREG.max).map(r => {
      next = Math.max(next, r.id);
      const tune = r.tune && typeof r.tune === 'object' ? { engine: num(r.tune.engine, 0, 0, 3) | 0, brakes: num(r.tune.brakes, 0, 0, 3) | 0, grip: num(r.tune.grip, 0, 0, 3) | 0, armor: num(r.tune.armor, 0, 0, 3) | 0 } : null;
      return { id: r.id, type: r.type, color: ok(r.color) ? r.color : VEHICLES[r.type].colors[0], vtier: TIER_LOOK[r.vtier] ? r.vtier : VEHICLES[r.type].tier, x: r.x, z: r.z, h: ok(r.h) ? r.h : 0, y: ok(r.y) ? r.y : 0, hp: num(r.hp, 100, 0, 100), trunk: Inv.clean(r.trunk, num), hot: !!r.hot, origin: ['stolen', 'hijack', 'found', 'dealer'].includes(r.origin) ? r.origin : 'stolen', fac: null, rare: !!r.rare, seen: num(r.seen, 0, 0, 1e9), since: num(r.since, 0, 0, 1e9), tune };
    });
    d.nextTrack = next;
    d.pendingCars = (Array.isArray(d.pendingCars) ? d.pendingCars : []).filter(P => P && typeof P === 'object' && VEHICLES[P.type]).slice(0, 12).map(P => ({ type: P.type, origin: ['reward', 'found', 'bought', 'mission', 'prize', 'pinkslip'].includes(P.origin) ? P.origin : 'reward', color: ok(P.color) ? P.color : VEHICLES[P.type].colors[0], from: typeof P.from === 'string' ? P.from.slice(0, 40) : '' }));
    d.vlog = (Array.isArray(d.vlog) ? d.vlog : []).filter(x => x && typeof x === 'object' && typeof x.what === 'string' && VEHICLES[x.type]).slice(-20);
  }
}
