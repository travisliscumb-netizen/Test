/* =====================================================================
   [UNDERWORLD] THE ONE-OFFS (Session 6D): the registry of the ten unique
   cars (UNIQUE_CARS, 225). save.uniques[id] = { st, lead, n } is the
   truth for each:
     st 0 undiscovered · 1 clue known (a search area on the map for a car
     that stands somewhere) · 2 exact location known (or, for Vance's car,
     offered) · 3 acquired.
   Discovered is not owned: a car is acquired exactly once, and from then
   on it is an ordinary fleet entry of yours (save.garage, or waiting for
   a space in save.pendingCars) that the vehicle registry keeps like any
   other: its own bay, saved where you left it, recovered from the impound,
   towed home as a wreck. Nothing removes it: it can't be sold, chopped or
   staked in a pink slip, so the registry's count never goes down and a
   reload can't bring a second one.
   A car that stands in the world (how 'find') is put there only once its
   clue is known, only while you are near (streamed like the fleet), and
   never once acquired. You take it by getting in, which needs a free
   parking space: it joins your fleet there and then (the Ambassador as a
   stolen, HOT car until the Chop Shop cleans it).
   ===================================================================== */
const UQ = { tick: 0.5, near: 160, keep: 340, pop: 60, intel: 3000, intelRep: 800 };
// who tells you about each (the phone contact)
const UQ_FROM = { corsair: 'unknown', spectre: 'tull', ambassador: 'lucky', proto: 'prestige', baja: 'farm', widow: 'vance', club: 'racecontrol', riviera: 'pv', tourer: 'ferry', aeterna: 'unknown' };
const UQ_STATE = ['Undiscovered', 'Clue known', 'Exact location known', 'Acquired'];
// the five city street races (the Spectre's condition)
const uqCityRaces = () => RACES.filter(r => !r.storyOnly && !r.country);
class UniqueCars {
  constructor(g) { this.g = g; this.live = new Map(); this.t = 0; this._spots = {}; }
  get s() { return this.g.save; }
  get U() { const s = this.s; if (!s.uniques || typeof s.uniques !== 'object') s.uniques = {}; return s.uniques; }
  rec(id) { const U = this.U; return U[id] || (U[id] = { st: 0, lead: false, n: 0 }); }
  st(id) { return this.rec(id).st; }
  // the one fleet entry of a one-off, or where it waits for a space (-1: none)
  entry(id) { const t = UNIQUE_BY[id].type; return this.s.garage.find(e => e.type === t) || null; }
  pendingIdx(id) { const t = UNIQUE_BY[id].type; return (this.s.pendingCars || []).findIndex(P => P.type === t); }
  count() { return UNIQUE_CARS.filter(u => this.st(u.id) >= 3).length; }
  // where an acquired one-off is right now, in words
  whereText(id) {
    const e = this.entry(id);
    if (e) { if (e.imp) return 'In the police impound'; const w = this.g.vreg.where(e); return e.out ? `Out: ${w ? w.name : 'on the street'}` : `Stored: ${w ? w.name : 'its space'}`; }
    if (this.pendingIdx(id) >= 0) return `Waiting with ${UNIQUE_BY[id].keeper} for a free space`;
    return '';
  }
  // ---------------------------------------------------------------- the stages
  // a stage reached: once, saved, with the message that goes with it
  advance(id, st, quiet) {
    const r = this.rec(id), d = UNIQUE_BY[id]; if (r.st >= st) return false;
    r.st = st;
    if (!quiet && st === 1) { this.g.content.phone(UQ_FROM[id], d.clue); this.g.ui.toast(`New lead: ${d.hint}${d.how === 'find' ? ' (search area on the map)' : ''}.`, 'info'); }
    if (!quiet && st === 2 && d.how === 'find') { this.g.ui.banner(VEHICLES[d.type].name, d.kind, 'info', 3, 'One-off spotted'); this.g.audio.play('pass'); }
    this.g.saveGame();
    return true;
  }
  setLead(id) { const r = this.rec(id); if (r.lead) return; r.lead = true; const d = UNIQUE_BY[id]; if (d.lead && UQ_FROM[id] === 'lucky') this.g.content.phone('lucky', 'Come by the shop. I hear things about a diplomat’s car, and I sell what I hear.'); this.g.saveGame(); }
  // acquired: the one moment it becomes yours (the caller has already made the fleet or waiting entry)
  acquired(d) {
    const g = this.g, r = this.rec(d.id); r.st = 3; r.day = g.uw ? g.uw.S.day : 0;
    g.vreg.note('one-off acquired', d.type, { id: d.id });
    g.ui.banner(VEHICLES[d.type].name, `One of ten · ${this.count()} of ${UNIQUE_CARS.length} found`, 'rank', 4, 'One-off acquired');
    g.audio.play('pass');
    g.saveGame(true);
  }
  // given to you (a reward, Vance's car): into a free space, or it waits with whoever gave it. Once only.
  grant(id) {
    const g = this.g, d = UNIQUE_BY[id]; if (!d || this.st(id) >= 3 || this.entry(id) || this.pendingIdx(id) >= 0) return null;
    const e = g.vreg.give(d.type, d.origin, VEHICLES[d.type].colors[0], d.keeper);
    if (e) e.vtier = 'unique';
    if (d.how === 'reward') g.content.phone(UQ_FROM[id], `The ${VEHICLES[d.type].name} is yours. ${e ? 'It’s in your space.' : 'I’ll keep it here until you have a space for it.'}`);
    this.acquired(d);
    return e;
  }
  // what unlocks each stage (checked on the registry's clock)
  check() {
    const g = this.g, s = this.s, p = g.player, rep = s.rep;
    const cityWon = uqCityRaces().filter(r => s.races[r.id] && s.races[r.id].won).length;
    if (s.flags.goldHint) this.advance('corsair', 1);
    if (cityWon > 0) this.advance('spectre', 1);
    if (cityWon >= uqCityRaces().length && this.st('spectre') < 3) this.grant('spectre');
    if (rep >= UQ.intelRep) this.setLead('ambassador');
    if (rep >= 2000) this.advance('proto', 1);
    if (inCedarSouth(p.pos.x, p.pos.z)) this.advance('baja', 1);
    if (inValenPoint(p.pos.x, p.pos.z)) this.advance('club', 1);
    if (Object.keys(ZONES).every(z => s.discovered.zones[z])) { this.setLead('riviera'); if (rep >= UNIQUE_BY.riviera.rep) this.advance('riviera', 1); }
    if (s.secrets.ghostferry) this.advance('tourer', 1);
    if (UNIQUE_CARS.every(u => u.id === 'aeterna' || this.st(u.id) >= 3)) this.advance('aeterna', 1);
  }
  // a race won: the Spectre (all five city races) and the Clubsport (the GT Cup at Valen Point)
  onRaceWin(raceId) {
    if (raceId === 'vp_gt') { this.advance('club', 1, true); this.grant('club'); }
    this.check();
  }
  // a pink slip won against Vance: three ordinary ones and he puts up the Widowmaker
  onPinkWin(wasWidow) {
    if (wasWidow) return;
    const r = this.rec('widow'), d = UNIQUE_BY.widow; if (r.st >= 3) return;
    r.n = (r.n || 0) + 1;
    if (r.n === 1) this.advance('widow', 1);
    if (r.n >= d.wins && this.advance('widow', 2, true)) this.g.content.phone('vance', `Fine. Next street pink slip, I put up the Widowmaker. Bring something worth ${fmtMoney(d.stake)} or more.`);
    this.g.saveGame();
  }
  // Vance is racing his own car today (a street pink slip, once he has offered it)
  widowDue() { return this.st('widow') === 2; }
  // ---------------------------------------------------------------- where each one stands
  spotOf(id) {
    if (this._spots[id] !== undefined) return this._spots[id];
    const w = this.g.world; if (!w || !RoadGraph.ready) return null;
    const blk = (bx, bz, fx = 0.5, fz = 0.5) => { const b = w.block(bx, bz); return kerbSpot(w, b.x0 + (b.x1 - b.x0) * fx, b.z0 + (b.z1 - b.z0) * fz); };
    let sp = null;
    switch (id) {
      case 'corsair': sp = curbAt(11, 8, 2, 62); break; // behind the depot on Harbor Row, where the old tip always said
      case 'ambassador': sp = blk(1, 1); break;          // a Crestmoor Heights driveway
      case 'proto': sp = blk(8, 10, 0.5, 0.8); break;    // a bonded yard in the Warehouse District
      case 'riviera': sp = blk(1, 9, 0.3, 0.5); break;   // a Linden Hills carport
      case 'tourer': sp = blk(0, 6, 0, 0.5); break;      // the old ferry slip on the west shore
      case 'aeterna': { const t = w.places.tower; sp = t && t.door ? kerbSpot(w, t.door.x, t.door.z) : null; break; } // the foot of Valen Tower
      case 'baja': { // just off the farm track in the far fields east of the park
        const sps = extRoadSpots(CITY / 2, CITY + 300); let best = null, bd = 1e18;
        for (const q of sps) { const d2 = dist2(q.x, q.z, 610, 1105); if (d2 < bd) { bd = d2; best = q; } }
        if (best) {
          const ox = best.x + Math.cos(best.h) * 7, oz = best.z - Math.sin(best.h) * 7;
          sp = !kerbBlocked(w, ox, oz, groundY(ox, oz), best.h) ? { x: ox, z: oz, h: best.h } : { x: best.x, z: best.z, h: best.h };
        }
        break;
      }
    }
    if (sp) sp = { x: sp.x, z: sp.z, h: sp.h || 0 };
    return (this._spots[id] = sp);
  }
  // the search area: around the car, never centred on it
  areaOf(id) {
    const d = UNIQUE_BY[id], sp = this.spotOf(id); if (!sp || !d.area) return null;
    const a = (d.n * 2.39996) % (Math.PI * 2);
    return { x: sp.x + Math.cos(a) * d.area * 0.45, z: sp.z + Math.sin(a) * d.area * 0.45, r: d.area };
  }
  liveOf(id) { const v = this.live.get(id); return v && this.g.vehicles.list.includes(v) && v.uniqueId === id && !v.garageUid ? v : null; }
  spawnAt(d, sp) {
    const g = this.g, y = groundY(sp.x, sp.z);
    for (const o of g.vehicles.nearby(sp.x, sp.z, 5)) if (o !== g.player.vehicle && !o.garageUid && !o.trackId && !o.mission && !o.uniqueId && Math.hypot(o.pos.x - sp.x, o.pos.z - sp.z) < 4) g.vehicles.despawn(o);
    const v = g.vehicles.spawn(d.type, sp.x, sp.z, sp.h, { parked: true, color: VEHICLES[d.type].colors[0], y, vtier: 'unique' });
    v.uniqueId = d.id; v.touched = true; v.looted = true; v.display = true;
    if (d.origin !== 'stolen') { v.origin = 'found'; v.legit = true; }
    this.live.set(d.id, v);
    return v;
  }
  // the cars that stand in the world: there while you are near and the clue is known, never once acquired
  updateWorld() {
    const g = this.g, p = g.player, px = p.pos.x, pz = p.pos.z, outdoors = !(p.interior && !p.interior.vspace);
    for (const d of UNIQUE_CARS) {
      if (d.how !== 'find') continue;
      const r = this.rec(d.id), v = this.liveOf(d.id);
      if (!v) this.live.delete(d.id);
      if (r.st < 1 || r.st >= 3) { if (v && v !== p.vehicle) { g.vehicles.despawn(v); this.live.delete(d.id); } continue; }
      const sp = this.spotOf(d.id); if (!sp) continue;
      const ds = Math.hypot(sp.x - px, sp.z - pz);
      if (r.st === 1 && outdoors && ds < d.reveal) this.advance(d.id, 2);
      if (!v) { if (outdoors && ds < UQ.near && (ds > UQ.pop || !g.inView(sp.x, 1, sp.z, 3))) this.spawnAt(d, sp); continue; }
      // a hulk is not the car: a fresh one stands at its place the next time you come by
      if (v.burnt) { v.uniqueId = ''; this.live.delete(d.id); continue; }
      if (Math.hypot(v.pos.x - px, v.pos.z - pz) > UQ.keep && !g.inView(v.pos.x, 1, v.pos.z, 3)) { g.vehicles.despawn(v); this.live.delete(d.id); }
    }
  }
  // ---------------------------------------------------------------- taking one
  // why you can't take it ('' when you can)
  claimBlock(v) {
    const g = this.g, d = v && UNIQUE_BY[v.uniqueId];
    if (!d || v.garageUid || this.st(d.id) >= 3 || this.entry(d.id) || this.pendingIdx(d.id) >= 0) return 'Gone.';
    if (g.vreg.freeBays() < 1 || g.save.garage.length >= g.content.garageCap) return `Nowhere to keep it: the ${VEHICLES[d.type].name} needs a free parking space of yours. Make room first.`;
    return '';
  }
  // into your fleet where it stands: its own space reserved, saved from now on, and it can't happen twice
  claim(v) {
    const g = this.g, why = this.claimBlock(v); if (why) return why;
    const d = UNIQUE_BY[v.uniqueId], R = g.vreg;
    const e = g.content.addToGarage(d.type, d.origin, v.colorHex, true); if (!e) return 'No free parking space.';
    e.vtier = 'unique'; e.out = true; e.loc = R.here(v); e.seen = R.econ(); e.dmg = clamp(100 - v.health, 0, 100); e.dirt = v.dirt;
    e.hot = d.origin === 'stolen';
    v.owned = true; v.garageUid = e.uid; v.origin = d.origin; v.tune = e.tune; v.trunk = e.trunk || (e.trunk = {}); v.looted = true; v.display = false; v.uniqueId = '';
    if (d.origin === 'stolen') { v.stolenBefore = true; g.save.stats.stolen++; g.police.crime('theft', v.pos.x, v.pos.z); }
    R.cars.set(e.uid, v); this.live.delete(d.id);
    this.acquired(d);
    if (e.hot) g.ui.toast(`The ${VEHICLES[d.type].name} is yours, and it is stolen: HOT until the Chop Shop cleans its papers.`, 'warn');
    return '';
  }
  // the player walks up to it: one question, then it is yours
  offer(v) {
    const g = this.g, d = UNIQUE_BY[v.uniqueId], why = this.claimBlock(v);
    if (why) { g.ui.toast(why, 'warn'); g.audio.play('deny'); return; }
    const V = VEHICLES[d.type];
    g.ui.ask(`Take the ${V.name}?`, `${V.blurb} One of ten one-offs on the island: it takes a free parking space of yours and is yours for good (it can’t be sold or staked).${d.origin === 'stolen' ? ' Taking it is theft: it stays HOT until the Chop Shop cleans it.' : ''}`, 'Take it', () => {
      const r = this.claim(v); if (r) { g.ui.toast(r, 'warn'); return; }
      if (g.player.state === 'foot') g.beginEnter(v);
    });
  }
  // Lucky's tip (the Ambassador): paid intel at the pawn shop, cash in hand, once
  intelSpot() { const L = this.g.uw && this.g.uw.loc('prop', 'pawn'); if (!L) return null; const h = L.h || 0; return { x: L.x + Math.cos(h) * 3.4, z: L.z - Math.sin(h) * 3.4 }; }
  findAction() {
    const g = this.g, p = g.player; if (g.state !== 'playing' || p.state !== 'foot' || p.interior) return null;
    const r = this.rec('ambassador'); if (!r.lead || r.st > 0) return null;
    const q = this.intelSpot(); if (!q || Math.hypot(p.pos.x - q.x, p.pos.z - q.z) > 2) return null;
    return { label: `Lucky’s tip · ${fmtMoney(UQ.intel)} cash`, act: () => this.buyIntel() };
  }
  buyIntel() {
    const g = this.g, r = this.rec('ambassador'); if (!r.lead || r.st > 0) return 'Nothing to sell.';
    if (!Money.pay(UQ.intel, 'intel')) { g.ui.toast(`Lucky wants ${fmtMoney(UQ.intel)} in cash.`, 'warn'); g.audio.play('deny'); return 'Not enough cash.'; }
    g.audio.play('cash');
    this.advance('ambassador', 1);
    return '';
  }
  // ---------------------------------------------------------------- the map and the stats screen
  // search areas (clue known) and exact places (found, not yet taken)
  mapEntries() {
    const out = [];
    for (const d of UNIQUE_CARS) {
      if (d.how !== 'find') continue;
      const st = this.st(d.id);
      if (st === 1) { const a = this.areaOf(d.id); if (a) out.push({ key: 'uq:' + d.id, name: `Search area · ${d.hint}`, cat: 'unique', icon: '?', x: a.x, z: a.z, area: a, sub: `One-off ${d.kind.toLowerCase()}: somewhere in here` }); }
      else if (st === 2) { const sp = this.spotOf(d.id); if (sp) out.push({ key: 'uq:' + d.id, name: VEHICLES[d.type].name, cat: 'unique', icon: '◆', x: sp.x, z: sp.z, sub: `One-off ${d.kind.toLowerCase()} · ${d.hint}` }); }
    }
    return out;
  }
  areas() { const out = []; for (const d of UNIQUE_CARS) if (d.how === 'find' && this.st(d.id) === 1) { const a = this.areaOf(d.id); if (a) out.push(a); } return out; }
  statsHtml() {
    const rows = UNIQUE_CARS.map(d => {
      const r = this.rec(d.id), V = VEHICLES[d.type], known = r.st > 0;
      const what = r.st >= 3 ? this.whereText(d.id) || 'Yours' : r.st > 0 ? d.hint : r.lead && d.lead ? d.lead : '';
      return `<span>${known ? esc(V.name) : '???'} <i style="opacity:.6">${esc(d.kind)}</i></span><span>${UQ_STATE[r.st]}${what ? ' · ' + esc(what) : ''}</span>`;
    }).join('');
    return `<h3>One-offs · ${this.count()} of ${UNIQUE_CARS.length}</h3><div class="stats">${rows}</div>`;
  }
  // ---------------------------------------------------------------- the clock, saves and resets
  update(dt) {
    const g = this.g; if (!g.uw || g.state !== 'playing') return;
    this.showcase(dt);
    this.t -= dt; if (this.t > 0) return; this.t = UQ.tick;
    this.check(); this.updateWorld();
    // the Golden Corsair is also one of the city's secrets (the first time you drive it)
    const pv = g.player.state === 'vehicle' ? g.player.vehicle : null;
    if (pv && pv.type === 'u_corsair' && pv.garageUid) g.content.secret('gold');
  }
  // ---------------------------------------------------------------- how a waiting one-off looks (G5)
  // one still standing where its clue put it is lit like a car on a stand: a warm pool of light round it on the
  // ground and, from dusk, a soft beam from above. Both go the moment it leaves its spot or is taken.
  showcase(dt) {
    const g = this.g;
    if (!this._sc) {
      const cv = (w, h, paint) => { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d')); return new THREE.CanvasTexture(c); };
      const pool = cv(128, 128, x => { const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); });
      const beam = cv(4, 64, x => { const gr = x.createLinearGradient(0, 64, 0, 0); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 4, 64); });
      const mat = map => new THREE.MeshBasicMaterial({ map, color: 0xffd7a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
      const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
      const bg = new THREE.CylinderGeometry(0.35, 1, 1, 20, 1, true); bg.translate(0, 0.5, 0);
      this._sc = { pg, bg, pm: mat(pool), bm: mat(beam), on: new Map(), t: 0 };
    }
    const S = this._sc; S.t += dt;
    const night = U.uNight.value, pulse = 1 + 0.07 * Math.sin(S.t * 1.7);
    for (const [id, o] of S.on) if (!this.live.has(id)) { g.outdoor.remove(o.pool, o.beam); S.on.delete(id); }
    for (const [id, v] of this.live) {
      const sp = this.spotOf(id), show = !!sp && this.liveOf(id) === v && v !== g.player.vehicle && !v.burnt && this.st(id) < 3 && Math.hypot(v.pos.x - sp.x, v.pos.z - sp.z) < 3;
      let o = S.on.get(id);
      if (!show) { if (o) { g.outdoor.remove(o.pool, o.beam); S.on.delete(id); } continue; }
      if (!o) {
        o = { pool: new THREE.Mesh(S.pg, S.pm), beam: new THREE.Mesh(S.bg, S.bm) };
        o.pool.renderOrder = 2; o.beam.renderOrder = 3; o.pool.frustumCulled = o.beam.frustumCulled = false;
        g.outdoor.add(o.pool, o.beam); S.on.set(id, o);
      }
      const y = groundY(v.pos.x, v.pos.z), L = v.spec.l + 3.2, W = v.spec.w + 3.2, H = 7.5;
      o.pool.position.set(v.pos.x, y + 0.05, v.pos.z); o.pool.rotation.y = v.h; o.pool.scale.set(W, 1, L);
      o.beam.position.set(v.pos.x, y + 0.02, v.pos.z); o.beam.scale.set(L * 0.42, H, L * 0.42);
      o.beam.visible = night > 0.15;
    }
    S.pm.opacity = (0.16 + 0.5 * night) * pulse; S.bm.opacity = 0.2 * clamp((night - 0.15) / 0.5, 0, 1);
  }
  clearAll() {
    if (this._sc) { for (const o of this._sc.on.values()) this.g.outdoor.remove(o.pool, o.beam); this._sc.on.clear(); }
    for (const v of this.live.values()) if (this.g.vehicles.list.includes(v) && v !== this.g.player.vehicle) this.g.vehicles.despawn(v); this.live.clear();
  }
  reset() { this.clearAll(); this.t = 0; this._spots = {}; if (this.s) for (const u of UNIQUE_CARS) this.rec(u.id); }
  // sanitize a save (SaveSystem, after the vehicle registry's): known ids and states only, one fleet or waiting
  // entry per one-off at most, every acquired one accounted for, and the old Golden Corsair brought in
  static sanitize(d) {
    const src = d.uniques && typeof d.uniques === 'object' && !Array.isArray(d.uniques) ? d.uniques : {}, U = {};
    for (const u of UNIQUE_CARS) {
      const r = src[u.id] && typeof src[u.id] === 'object' ? src[u.id] : {};
      U[u.id] = { st: Number.isInteger(r.st) ? clamp(r.st, 0, 3) : 0, lead: !!r.lead, n: Number.isInteger(r.n) && r.n >= 0 ? Math.min(r.n, 99) : 0 };
      if (Number.isInteger(r.day)) U[u.id].day = r.day;
    }
    d.uniques = U;
    if (!Array.isArray(d.pendingCars)) d.pendingCars = [];
    // before Session 6D the Golden Corsair was a gold-painted stock Corsair 68: the one you kept becomes the real one
    if (d.secrets && d.secrets.gold && !d.garage.some(e => e.type === 'u_corsair')) {
      const old = d.garage.find(e => e.type === 'classic' && e.color === 0xc9a227 && e.origin === 'found');
      if (old) { old.type = 'u_corsair'; old.vtier = 'unique'; U.corsair.st = 3; }
    }
    for (const u of UNIQUE_CARS) {
      // one of each, ever: a second entry (a corrupted or hand-edited save) is dropped and logged
      const mine = d.garage.filter(e => e.type === u.type), wait = d.pendingCars.filter(P => P.type === u.type);
      for (const e of mine.slice(1)) { d.garage.splice(d.garage.indexOf(e), 1); (d.vlog || (d.vlog = [])).push({ day: 0, what: 'duplicate one-off removed', type: u.type, uid: e.uid }); }
      for (const P of (mine.length ? wait : wait.slice(1))) d.pendingCars.splice(d.pendingCars.indexOf(P), 1);
      for (const e of mine.slice(0, 1)) e.vtier = 'unique';
      const held = mine.length > 0 || wait.length > 0;
      if (held) U[u.id].st = 3;
      // acquired but nowhere (a save from a broken build): it is never silently gone, it waits with its keeper
      else if (U[u.id].st >= 3) d.pendingCars.push({ type: u.type, origin: u.origin === 'stolen' ? 'found' : u.origin, color: VEHICLES[u.type].colors[0], from: u.keeper.slice(0, 40) });
    }
  }
}
