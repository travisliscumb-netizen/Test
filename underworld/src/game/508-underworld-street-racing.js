/* =====================================================================
   [UNDERWORLD] STREET RACING RULES AND THE CAR WASH (§16, §15, §45.33; Session 6A)
   - The purse. Each street race pays its full purse and Rep for the
     first win of an economic day; a second win that day pays half the
     purse and a third of the Rep, every later win a quarter of the purse
     and a third of the Rep. The tiers reset each economic day; the
     buy-in stays 15%. Racing never runs out, it just stops being a farm.
   - The police. Racing is illegal, but only an officer who actually sees
     it does anything about it: in a live race, at race speed, within
     sight of a cop close by, you get 1★ for street racing, once a race.
   - Pink slips. Once an economic day Tull has one: you race the car you
     put up, one on one, for a car of about the same worth. The stake is
     checked and committed (and saved) on the start line; from then on a
     loss, a quit, a wreck, an arrest or a reload all hand your car over.
     A win puts the rival's car in your fleet (it needs a free space,
     checked before the start); it resells for Dirty Cash.
   - The car wash (Suds, Shine Express): stop in the bay at the kerb and
     the brushes do the rest, about seven seconds of foam. It washes and
     fully repairs the car for a $40 wash plus the Motor Works repair
     rate, from the bank; at a car wash you own the wash is free and the
     repair a third off. It never touches wanted level, HOT, ownership or
     provenance.
   ===================================================================== */
const RACE_T = { purse: [1, 0.5, 0.25], rep: [1, 1 / 3, 1 / 3], seen: 40, speed: 60 / 3.6, pink: { lo: 0.8, hi: 1.5, minHp: 60 } };
const WASH_T = { fee: 40, dur: 7, own: 0.7, props: ['carwash', 'wash2'], r: 3.2 };
// cars a rival never stakes: police and ex-police, cabs
const PINK_NEVER = ['police', 'unmarked', 'taxi'];
const carWorth = (type, tier) => carMsrp(type) * (TIER_LOOK[tier || VEHICLES[type].tier] || TIER_LOOK.common).value;

class RaceRules {
  constructor(g) { this.g = g; }
  get s() { return this.g.save; }
  day() { return this.g.uw ? this.g.uw.S.day : 0; }
  // this economic day's wins per race (the record resets on a new day)
  today() { const s = this.s, d = this.day(); if (!s.raceDay || s.raceDay.day !== d) s.raceDay = { day: d, wins: {} }; return s.raceDay.wins; }
  tier(id) { return Math.min(RACE_T.purse.length - 1, this.today()[id] || 0); }
  // what a finish pays: the place share of the purse, and the Rep, both scaled by today's tier for this race
  payout(def, place) {
    const k = this.tier(def.id);
    return { cash: Math.round(def.reward * [1, 0.4, 0.2][place - 1] * RACE_T.purse[k] / 10) * 10, rep: Math.round((place === 1 ? def.rep : def.rep / 3) * RACE_T.rep[k]), tier: k };
  }
  noteWin(id) { const w = this.today(); w[id] = (w[id] || 0) + 1; }
  // seen racing: a cop close by with a line of sight while you're at race speed in a live race; once a race
  watch(A, v) {
    const g = this.g, P = g.police;
    if (A.seen || !v || !P.enabled || !g.uw || g.uw.S.jail || v.speed < RACE_T.speed) return;
    if (!P.copCanSee(v.pos.x, v.pos.z, RACE_T.seen)) return;
    A.seen = true;
    if (P.level < 1) P.addHeat(HEAT_LEVELS[1], v.pos.x, v.pos.z);
    g.ui.toast('Dispatch: street racing in progress. Unit in pursuit.', 'radio');
  }
}

class PinkSlips {
  constructor(g) { this.g = g; }
  get s() { return this.g.save; }
  day() { return this.g.uw ? this.g.uw.S.day : 0; }
  available() { return this.s.pinkDay !== this.day() && !this.s.pink; }
  def() { return RACES.find(r => r.pink); }
  offer(c) {
    const def = this.def();
    return { type: 'srace', race: def, pink: true, title: def.name, desc: def.blurb + ' You race the car you put up: a legal car of yours, nothing in the trunk, in one piece, and a free space at home for his.', reward: 0, fee: 0, contact: c, locked: '', chip: 'PINK SLIP · one on one · once a day', rep: 0 };
  }
  // why this car can't be put up ('' when it can)
  canStake(v) {
    const g = this.g, R = g.vreg, e = R.entryOf(v);
    if (!e) return 'Vance only races for a car with papers in your name.';
    if (e.hot) return 'Not with hot plates: Vance wants a car he can register.';
    if (e.imp) return 'That car is in the impound.';
    if (e.unique || VEHICLES[e.type].unique) return 'Not that one: it’s one of a kind.';
    if ((e.trunk && Object.values(e.trunk).some(n => n > 0)) || Money.dirtyInCar(e.uid) > 0) return 'Empty it first: no goods, loot or cash in a car you put up.';
    if (v.health < RACE_T.pink.minHp || v.broken || v.burnt) return 'Get it fixed first: Vance won’t race a wreck.';
    if (R.freeBays() < 1) return 'You need a free parking space for his car if you win.';
    return '';
  }
  // the rival's stake: a car worth about 0.8–1.5× yours
  rival(e) {
    const sv = carWorth(e.type, e.vtier);
    const all = Object.keys(VEHICLES).filter(t => !VEHICLES[t].police && !VEHICLES[t].unique && !PINK_NEVER.includes(t) && CAR_MSRP[t]);
    const val = t => carWorth(t, VEHICLES[t].tier);
    let pool = all.filter(t => val(t) >= sv * RACE_T.pink.lo && val(t) <= sv * RACE_T.pink.hi);
    if (!pool.length) pool = [all.reduce((a, t) => Math.abs(Math.log(val(t) / sv)) < Math.abs(Math.log(val(a) / sv)) ? t : a)];
    const type = pick(pool);
    return { type, color: pick(VEHICLES[type].colors), vtier: VEHICLES[type].tier };
  }
  // on the start line: the stake is committed and saved; from here every way out but a win hands the car over
  commit(v) {
    const g = this.g, e = g.vreg.entryOf(v), r = this.rival(e);
    this.s.pink = { uid: e.uid, rival: r };
    this.s.pinkDay = this.day();
    g.vreg.note('put up in a pink slip', e.type, { uid: e.uid, vs: r.type });
    g.saveGame(true);
    return r;
  }
  // the result: true a win, false anything else
  resolve(win) {
    const g = this.g, s = this.s, P = s.pink; if (!P) return;
    s.pink = null;
    const e = s.garage.find(x => x.uid === P.uid), V = VEHICLES[P.rival.type];
    if (win) {
      const A = g.race.active, o = A && A.racers[0] && g.vehicles.list.includes(A.racers[0].v) ? A.racers[0].v : null;
      const ne = g.content.addToGarage(P.rival.type, 'pinkslip', P.rival.color, true) || g.vreg.give(P.rival.type, 'pinkslip', P.rival.color, 'Vance');
      if (ne) {
        ne.vtier = P.rival.vtier;
        if (o) {
          // his car is yours where it stopped: keys in it
          ne.dmg = clamp(100 - o.health, 0, 100);
          o.drive = null; o.mission = null; o.driver = null; o.owned = true; o.touched = true; o.legit = true; o.locked = false; o.garageUid = ne.uid; o.origin = 'pinkslip'; o.tune = ne.tune; o.trunk = ne.trunk || (ne.trunk = {}); o.looted = true; o.pinkWon = true;
          ne.out = true; ne.loc = g.vreg.here(o); g.vreg.cars.set(ne.uid, o);
        }
      }
      g.vreg.note('won in a pink slip', P.rival.type, { from: 'Vance' });
      g.ui.toast(`Pink slip won: the ${V.name} is yours.`, 'money');
    } else if (e) this.surrender(e, P);
    g.saveGame(true);
  }
  // your car is handed over: out of the fleet for good
  surrender(e, P) {
    const g = this.g, s = this.s, R = g.vreg;
    const v = R.live(e) || (g.player.vehicle && g.player.vehicle.garageUid === e.uid ? g.player.vehicle : null);
    if (v) { if (g.player.vehicle === v && g.player.state === 'vehicle') g.exitVehicle(true); if (g.vehicles.list.includes(v)) g.vehicles.despawn(v); }
    R.cars.delete(e.uid);
    if (e.trunk && Object.values(e.trunk).some(n => n > 0) && g.uw) g.uw.unloadTrunk(e);
    Money.emptyCar(e.uid);
    const i = s.garage.indexOf(e); if (i >= 0) s.garage.splice(i, 1);
    R.note('lost in a pink slip', e.type, { uid: e.uid, to: 'Vance' });
    g.ui.toast(`Vance drives off in your ${VEHICLES[e.type].name}. It’s his now.`, 'warn');
    void P;
  }
  // the race ended any other way than a result (quit, arrest, death): a loss once the stake is down
  abort() { if (this.s.pink) this.resolve(false); }
  // a save with a stake still down: the race was walked away from, so the car is his
  reset() {
    const s = this.s; if (!s) return;
    const P = s.pink;
    if (P && (typeof P !== 'object' || !Number.isInteger(P.uid) || !P.rival || !VEHICLES[P.rival.type])) { s.pink = null; return; }
    if (P) { const e = s.garage.find(x => x.uid === P.uid); s.pink = null; if (e) this.surrender(e, P); if (this.g.uw) this.g.uw.news('pv', `You walked away from a pink slip. Vance kept your ${e ? VEHICLES[e.type].name : 'car'}.`); }
    if (!Number.isInteger(s.pinkDay)) s.pinkDay = -1;
    if (!s.raceDay || typeof s.raceDay !== 'object' || !Number.isInteger(s.raceDay.day) || !s.raceDay.wins || typeof s.raceDay.wins !== 'object') s.raceDay = { day: -1, wins: {} };
    for (const k in s.raceDay.wins) { const n = s.raceDay.wins[k]; if (!RACES.some(r => r.id === k) || !Number.isInteger(n) || n < 0) delete s.raceDay.wins[k]; }
  }
}

class CarWash {
  constructor(g) { this.g = g; this.job = null; this._bays = null; this.rig = null; }
  // the wash bays: the kerb by each car wash's door
  bays() {
    if (this._bays) return this._bays;
    const uw = this.g.uw, out = [];
    for (const id of WASH_T.props) { const L = uw && uw.loc('prop', id); if (!L) continue; const c = curbNear(L.x + Math.sin(L.h) * 4, L.z + Math.cos(L.h) * 4, -2); out.push({ id, x: c.x, z: c.z, h: c.h, name: PROP_BY_ID[id].name }); }
    return out.length ? (this._bays = out) : out;
  }
  owned(id) { return !!(this.g.uw && this.g.uw.props.owned(id)); }
  // what a wash costs here: { wash, repair, total }
  price(v, id) {
    const C2 = this.g.content, own = this.owned(id), dmg = v.health < 99.5 || v.broken || v.deformed > 0.05;
    const repair = dmg ? Math.round(C2.repairCost(v.type, v.health) * (own ? WASH_T.own : 1) / 10) * 10 : 0;
    const wash = own ? 0 : WASH_T.fee;
    return { wash, repair, total: wash + repair };
  }
  bayAt(v) { return this.bays().find(b => Math.hypot(v.pos.x - b.x, v.pos.z - b.z) < WASH_T.r) || null; }
  findAction() {
    const g = this.g, p = g.player; if (this.job || p.state !== 'vehicle') return null;
    const v = p.vehicle; if (!v || v.speed > 2 || v.burnt) return null;
    const b = this.bayAt(v); if (!b) return null;
    const pr = this.price(v, b.id);
    if (pr.total && !Money.can(pr.total, 'carWash')) return { label: `${b.name} · ${fmtMoney(pr.total)} (not enough in the bank)`, act: () => g.ui.toast(`Wash and repair: ${fmtMoney(pr.total)} from your bank.`, 'warn') };
    return { label: `${b.name} · wash${pr.repair ? ' & repair' : ''} ${pr.total ? fmtMoney(pr.total) : '(free: yours)'}`, act: () => this.start(v, b) };
  }
  start(v, b) {
    const g = this.g; if (this.job) return;
    this.job = { v, b, t: 0, price: this.price(v, b.id) };
    v.vel.set(0, 0); v.yawRate = 0;
    this.rig = this.rig || this._rig();
    this.rig.position.set(b.x, CURB_H, b.z); this.rig.rotation.y = v.h; this.rig.visible = true;
    g.audio.play('confirm');
    g.ui.toast(`${b.name}: brushes on. Stay put.`, 'info');
  }
  _rig() {
    const grp = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ color: 0x2f7fd8 }), geo = new THREE.CylinderGeometry(0.45, 0.45, 2.2, 10);
    for (const s of [-1.6, 1.6]) { const m = new THREE.Mesh(geo, mat); m.position.set(s, 1.1, 0); grp.add(m); }
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 3.0, 10), mat); top.rotation.z = Math.PI / 2; top.position.set(0, 2.1, 0); grp.add(top);
    grp.visible = false; this.g.scene.add(grp);
    return grp;
  }
  update(dt) {
    const g = this.g, J = this.job; if (!J) return;
    const v = J.v, p = g.player;
    // leaving the bay (or the car) stops the wash: nothing charged, nothing done
    if (p.state !== 'vehicle' || p.vehicle !== v || Math.hypot(v.pos.x - J.b.x, v.pos.z - J.b.z) > WASH_T.r + 1.5 || v.burnt) { this.stop(); g.ui.toast('Wash cancelled.', 'warn'); return; }
    v.ctl.throttle = Math.min(v.ctl.throttle, 0); v.ctl.handbrake = true; v.vel.set(0, 0);
    J.t += dt;
    const k = J.t / WASH_T.dur, ph = J.t * 3;
    this.rig.children[0].rotation.y = ph; this.rig.children[1].rotation.y = -ph; this.rig.children[2].rotation.x = ph;
    // the brushes travel along the car; foam everywhere
    const along = (k - 0.5) * (v.spec.l + 1.5);
    this.rig.position.set(J.b.x + Math.sin(v.h) * along, CURB_H, J.b.z + Math.cos(v.h) * along);
    if (g.fx && Math.random() < 0.7) g.fx.puff(v.pos.x + rand(-1.2, 1.2), v.pos.y + rand(0.6, 1.8), v.pos.z + rand(-1.2, 1.2), [0.95, 0.97, 1.0]);
    if (J.t < WASH_T.dur) return;
    // done: charge (if it still adds up), wash and repair; nothing else changes
    const pr = this.price(v, J.b.id);
    if (pr.total && !Money.pay(pr.total, 'carWash')) { this.stop(); g.ui.toast('Not enough in the bank.', 'warn'); return; }
    if (pr.repair) { g.content.repair(v); g.save.stats.repairs++; }
    v.dirt = 0;
    const e = g.vreg.entryOf(v); if (e) { if (pr.repair) e.dmg = 0; e.dirt = 0; }
    g.audio.play(pr.total ? 'cash' : 'pass');
    g.ui.toast(`Washed${pr.repair ? ' and repaired' : ''}${pr.total ? ` · ${fmtMoney(pr.total)}` : ''}.`, 'money');
    this.stop();
    g.saveGame();
  }
  stop() { this.job = null; if (this.rig) this.rig.visible = false; }
  reset() { this.stop(); this._bays = null; }
}
