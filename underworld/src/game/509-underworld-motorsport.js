/* =====================================================================
   [UNDERWORLD] VALEN POINT MOTORSPORT PARK (§16, §45.34; Session 6B)
   A legitimate asset on the island east of the city (world: 025, 125,
   175). Everything here is Clean Bank, and nothing here draws heat:
   - Race Control (the paddock office): buy the park (no Rank or Rep
     gate), enter official events, book a track day.
   - Official events: circuit races against the clock and a grid, with
     class rules by the value of the car you bring (registered to you,
     not HOT, in one piece), a buy-in and prize money from the bank (the
     buy-in waived for the owner), paid by the same daily tiers as street
     races (per event, per economic day); the Invitational awards a prize
     car, once.
   - Track days: timed laps on the circuit (a fee, or free for the owner:
     a private session). Valid laps pass every sector; the best is saved.
   - The owner also gets: 24 pit-garage parking bays (the registry's
     physical spaces), a pit crew for repairs a third off, the right to
     host a race meeting (pay to put it on, the gate takes it back the
     next day), and the park's daily income.
   ===================================================================== */
const VP_EVENTS = [
  { id: 'vp_club', name: 'Club Sprint', laps: 2, opp: 4, band: [0, 16000], fee: 300, reward: 2400, cls: ['compact', 'apex', 'sedan', 'crest'], blurb: 'Hatchbacks and saloons, nothing worth more than $16,000. Two laps.' },
  { id: 'vp_gt', name: 'GT Cup', laps: 3, opp: 5, band: [16000, 65000], fee: 1500, reward: 9000, cls: ['sports', 'tempest', 'muscle', 'hellion', 'revenant'], blurb: 'Sports cars and muscle, $16,000 to $65,000. Three laps.' },
  { id: 'vp_super', name: 'Supercar Showdown', laps: 3, opp: 5, band: [65000, Infinity], fee: 5000, reward: 30000, cls: ['supercar', 'valkyr', 'obsidian', 'monarch', 'coupe'], blurb: 'The fastest cars on the island, $65,000 and up. Three laps.' },
  { id: 'vp_inv', name: 'Valen Point Invitational', laps: 3, opp: 5, band: [40000, Infinity], fee: 8000, reward: 0, car: 'monarch', cls: ['valkyr', 'obsidian', 'supercar', 'coupe', 'kodiak'], blurb: 'Invitation only, $40,000 and up. The winner drives home a Monarch GT. Once.' }
];
for (const e of VP_EVENTS) { e.circuit = true; e.official = true; e.rep = 0; }
const VP_PARK = { trackDay: 250, session: 600, hostCost: 20000, hostTake: 32000, income: 9000, upkeep: 2500, pitK: 0.7, minHp: 60 };
const RACE_CONTROL = { id: 'racecontrol', name: 'Race Control' };
// the circuit's checkpoints for an event: every 40 m from the start/finish line round the loop, `laps` times; the
// grid 34 m behind the line on the main straight; the racing line for AI drivers every 10 m with a safe speed
function vpCheckpoints(def) {
  const vp = game.world.vp, T = vp.track, n = T.pts.length, k0 = vp.sf.k, laps = def.laps || 1, out = [];
  for (let l = 0; l < laps; l++) for (let j = 20; j <= n; j += 20) { const k = (k0 + j) % n; out.push({ x: T.pts[k][0], z: T.pts[k][1], lap: l }); }
  // the last checkpoint of every lap is the line itself
  for (let l = 0; l < laps; l++) { const i = (l + 1) * Math.floor(n / 20) - 1; if (out[i]) { out[i].x = vp.sf.x; out[i].z = vp.sf.z; } }
  const ks = (k0 - 17 + n) % n, p = T.pts[ks], q = T.pts[(ks + 1) % n], dx = q[0] - p[0], dz = q[1] - p[1], l2 = Math.hypot(dx, dz) || 1;
  const dir = { x: dx / l2, z: dz / l2 };
  const ai = []; const vs = vpSafeSpeeds();
  for (let j = 5; j <= n * laps + 30; j += 5) { const k = (ks + j) % n; ai.push({ x: T.pts[k][0], z: T.pts[k][1], node: true, vmax: vs[k], nx: T.nl[k][0], nz: T.nl[k][1] }); }
  return { cps: out, perLap: out.length / laps, start: { x: p[0], z: p[1], h: Math.atan2(dir.x, dir.z), dir }, aiPath: ai };
}
// how fast the racing line can be taken at each centreline sample: v = √(a·R) in corners, braking back from each
// corner at 7 m/s², capped at 60 m/s on the straights
function vpSafeSpeeds() {
  const T = game.world.vp.track; if (T._vs) return T._vs;
  const n = T.pts.length, v = T.R.map(R => R > 0 ? Math.sqrt(8.5 * R) : 60);
  for (let pass = 0; pass < 3; pass++) for (let i = n - 1; i >= 0; i--) { const j = (i + 1) % n, ds = T.cum[i + 1] - T.cum[i]; v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * 7 * ds)); }
  return (T._vs = v);
}
class MotorsportPark {
  constructor(g) { this.g = g; this.session = null; this.lapT = null; this.sect = 0; this._prevZ = null; }
  get s() { const s = this.g.save; return s.track || (s.track = MotorsportPark.fresh()); }
  static fresh() { return { best: null, prize: {}, hosted: null, laps: 0 }; }
  owned() { return !!(this.g.uw && this.g.uw.props.owned('motorsport')); }
  day() { return this.g.uw ? this.g.uw.S.day : 0; }
  // ---------------------------------------------------------------- official events
  fee(def) { return this.owned() ? 0 : def.fee; }
  payout(def, place) {
    const k = this.g.raceRules ? this.g.raceRules.tier(def.id) : 0;
    return { cash: Math.round(def.reward * [1, 0.4, 0.2][place - 1] * RACE_T.purse[k] / 10) * 10, tier: k };
  }
  noteWin(id) { if (this.g.raceRules) this.g.raceRules.noteWin(id); }
  // scrutineering on the grid: '' when the car may race this event
  canEnter(v, def) {
    const g = this.g, e = g.vreg.entryOf(v);
    if (!e) return 'Race Control only lets in cars registered to you.';
    if (e.hot) return 'Scrutineering won’t pass a car with hot plates.';
    if (v.health < VP_PARK.minHp || v.broken) return 'Scrutineering: get the car repaired first (the pit crew can do it).';
    const w = carWorth(e.type, e.vtier);
    if (w < def.band[0] || w >= def.band[1]) return `Wrong class: this event is for cars worth ${def.band[1] === Infinity ? fmtMoney(def.band[0]) + ' and up' : fmtMoney(def.band[0]) + '–' + fmtMoney(def.band[1])} (yours: ${fmtMoney(Math.round(w))}).`;
    if (def.car && this.s.prize[def.id]) return 'You have already won the Invitational.';
    if (def.car && g.vreg.freeBays() < 1) return 'You need a free parking space for the prize car.';
    return '';
  }
  // the buy-in at the start line (after scrutineering): '' paid, else why not
  payIn(def) { const f = this.fee(def); if (!f) return ''; return Money.pay(f, 'trackFee') ? '' : `The entry fee is ${fmtMoney(f)} from your bank.`; }
  // the Invitational's car, once: the flag is set and saved with the car (a reload can't award it twice)
  awardCar(def) {
    const g = this.g; if (!def.car || this.s.prize[def.id]) return null;
    this.s.prize[def.id] = true;
    const e = g.vreg.give(def.car, 'prize', undefined, 'Race Control');
    g.vreg.note('won at Valen Point', def.car, { event: def.id });
    g.ui.toast(`The ${VEHICLES[def.car].name} is yours. Its space is waiting in your garage.`, 'money');
    g.saveGame(true);
    return e;
  }
  spec(def) {
    const p = this.payout(def, 1), f = this.fee(def);
    return { type: 'srace', official: true, race: def, title: def.name, desc: def.blurb + (f ? ` Entry ${fmtMoney(f)} from your bank on the grid.` : ' No entry fee: it’s your track.') + (p.tier ? ` Won today already: the prize is ${fmtMoney(p.cash)}.` : ''), reward: def.reward ? p.cash : 0, fee: 0, contact: RACE_CONTROL, locked: '', chip: 'VALEN POINT · official', rep: 0 };
  }
  enter(def) {
    const g = this.g; if (g.missions.active) { g.ui.toast('Finish what you’re doing first.', 'warn'); return; }
    g.ui.closeAll(); g.missions.start(this.spec(def));
  }
  // ---------------------------------------------------------------- track days and private sessions
  book() {
    const g = this.g, own = this.owned(), cost = own ? 0 : VP_PARK.trackDay;
    if (this.session) return 'You’re already on track.';
    if (cost && !Money.pay(cost, 'trackFee')) return `A track day is ${fmtMoney(cost)} from your bank.`;
    this.session = { until: g.time + VP_PARK.session, laps: 0, best: 0, own };
    this.lapT = null; this.sect = 0; this._prevZ = null;
    g.ui.toast(own ? 'Private session: the track is yours. Laps are timed from the line.' : 'Track day booked: ten minutes on track, laps timed from the line.', 'money');
    return '';
  }
  // ---------------------------------------------------------------- the owner's meeting and the park's day
  host() {
    const g = this.g, s = this.s;
    if (!this.owned()) return 'Only the owner hosts meetings.';
    if (s.hosted) return 'A meeting is already on the calendar.';
    if (!Money.pay(VP_PARK.hostCost, 'trackHost')) return `Putting a meeting on costs ${fmtMoney(VP_PARK.hostCost)} from your bank.`;
    s.hosted = { day: this.day() };
    g.saveGame(true);
    return '';
  }
  // once an economic day (PropertyManager.tickDay): the park's takings, and the gate from a meeting you hosted
  tickDay() {
    const g = this.g, s = this.s; if (!this.owned()) return;
    Money.earn(VP_PARK.income, 'trackIncome');
    Money.pay(VP_PARK.upkeep, 'upkeep', { partial: true });
    if (s.hosted && s.hosted.day < this.day()) { s.hosted = null; Money.earn(VP_PARK.hostTake, 'trackIncome'); g.uw.news('pv', `Race meeting at Valen Point: a full house. ${fmtMoney(VP_PARK.hostTake)} from the gate is in your bank.`); }
  }
  // ---------------------------------------------------------------- the pit crew (in a pit garage, in a car)
  pitAction(v) {
    const g = this.g, [x0, x1] = VP_PIT.garX, [z0, z1] = VP_PIT.garZ;
    if (v.speed > 2 || v.pos.x < x0 || v.pos.x > x1 || v.pos.z < z0 || v.pos.z > z1) return null;
    const dmg = v.health < 99.5 || v.broken || v.deformed > 0.05; if (!dmg) return null;
    const c = Math.round(g.content.repairCost(v.type, v.health) * (this.owned() ? VP_PARK.pitK : 1) / 10) * 10;
    return { label: `Pit crew · repair ${fmtMoney(c)}`, act: () => { if (!Money.pay(c, 'pitService')) { g.ui.toast('Not enough in the bank.', 'warn'); return; } g.content.repair(v); const e = g.vreg.entryOf(v); if (e) e.dmg = 0; g.audio.play('cash'); g.ui.toast('Pit crew: fixed.', 'money'); } };
  }
  door() { const pl = this.g.world.places.motorsport; return pl ? pl.door : null; }
  findAction() {
    const g = this.g, p = g.player;
    if (p.state === 'vehicle') return p.vehicle ? this.pitAction(p.vehicle) : null;
    const d = this.door(); if (!d || p.state !== 'foot' || p.interior) return null;
    if (Math.hypot(p.pos.x - d.x, p.pos.z - d.z) > 2.6) return null;
    return { label: 'Race Control · Valen Point Motorsport Park', act: () => this.openOffice() };
  }
  openOffice() {
    const g = this.g, C2 = g.content, PM = g.uw.props, def = PROP_BY_ID.motorsport;
    const render = () => {
      const own = this.owned(), s = this.s;
      let h = `<div class="svcTop"><span>${own ? 'Yours' : 'For sale · ' + fmtMoney(PM.price(def))}</span><span>Best lap <b>${s.best ? fmtRace(s.best.t) : '—'}</b></span><span>${Money.html('trackFee')}</span></div>`;
      if (!own) h += `<div class="card"><div class="t">Buy the park</div><div class="d">${esc(def.desc)} 24 pit-garage spaces, no entry fees, a private session whenever you like, the pit crew a third off, race meetings you host, and about ${fmtMoney(VP_PARK.income - VP_PARK.upkeep)} a day clear.</div><button class="sbtn gold" data-act="buy" ${Money.can(PM.price(def), 'property') ? '' : 'disabled'}>Buy · ${fmtMoney(PM.price(def))}</button></div>`;
      h += '<h3>Official events</h3><div class="grid2">' + VP_EVENTS.map(e => {
        const done = e.car && s.prize[e.id], p = this.payout(e, 1), f = this.fee(e);
        return `<div class="card"><div class="t">${esc(e.name)}</div><div class="d">${esc(e.blurb)}</div><div class="stat"><span>Entry</span><span>${f ? fmtMoney(f) : 'free'}</span></div><div class="stat"><span>Prize</span><span>${e.car ? (done ? 'won' : esc(VEHICLES[e.car].name)) : fmtMoney(p.cash) + (p.tier ? ' (won today)' : '')}</span></div><button class="sbtn" data-act="ev:${e.id}" ${done ? 'disabled' : ''}>${done ? 'Won' : 'Enter'}</button></div>`;
      }).join('') + '</div>';
      h += `<h3>On track</h3><div class="btns"><button class="sbtn" data-act="day" ${this.session ? 'disabled' : ''}>${own ? 'Private session (free)' : 'Track day · ' + fmtMoney(VP_PARK.trackDay)}</button>${own ? `<button class="sbtn" data-act="host" ${s.hosted ? 'disabled' : ''}>${s.hosted ? 'Meeting on the calendar' : 'Host a race meeting · ' + fmtMoney(VP_PARK.hostCost)}</button>` : ''}</div>`;
      return h;
    };
    C2.openSvc('Race Control', 'Official: “Clean money, clean cars, a clean lap. Everything here goes through the bank.”', render, act => {
      const [k, id] = act.split(':');
      if (k === 'buy') { const r = PM.buy('motorsport'); C2.refreshSvc(r || 'Valen Point Motorsport Park is yours.'); return; }
      if (k === 'ev') { const e = VP_EVENTS.find(x => x.id === id); if (e) this.enter(e); return; }
      if (k === 'day') { C2.refreshSvc(this.book() || 'Session booked.'); return; }
      if (k === 'host') { C2.refreshSvc(this.host() || 'Meeting on the calendar: the takings come in tomorrow.'); return; }
    });
  }
  // ---------------------------------------------------------------- lap timing on a track day
  update(dt) {
    const g = this.g, S = this.session; if (!S) return;
    if (g.time > S.until) { this.session = null; g.ui.toast(`Session over. ${S.laps} lap${S.laps === 1 ? '' : 's'}${S.best ? ', best ' + fmtRace(S.best) : ''}.`, 'info'); return; }
    const p = g.player, v = p.state === 'vehicle' ? p.vehicle : null; if (!v) { this._prevZ = null; return; }
    const vp = g.world.vp, T = vp.track, n = T.pts.length;
    // sectors: a quarter, half and three quarters of the way round must be passed in order
    const sec = [0.25, 0.5, 0.75].map(f => T.pts[(vp.sf.k + Math.floor(n * f)) % n]);
    if (this.lapT !== null && this.sect < 3) { const q = sec[this.sect]; if (Math.hypot(v.pos.x - q[0], v.pos.z - q[1]) < 18) this.sect++; }
    const z = v.pos.z, crossed = this._prevZ !== null && this._prevZ > vp.sf.z && z <= vp.sf.z && Math.abs(v.pos.x - vp.sf.x) < VP_TRACK.w / 2 + 1.5;
    this._prevZ = z;
    if (this.lapT !== null) this.lapT += dt;
    if (!crossed) return;
    if (this.lapT !== null && this.sect >= 3) {
      const t = Math.round(this.lapT * 100) / 100; S.laps++; this.s.laps++;
      if (!S.best || t < S.best) S.best = t;
      const rec = !this.s.best || t < this.s.best.t; if (rec) this.s.best = { t, type: v.type };
      g.ui.toast(`Lap ${S.laps}: ${fmtRace(t)}${rec ? ' · track record' : ''}`, rec ? 'money' : 'info');
    }
    this.lapT = 0; this.sect = 0;
  }
  // a save's park state: validated
  reset() {
    const s = this.g.save; if (!s) return;
    const T = s.track && typeof s.track === 'object' ? s.track : MotorsportPark.fresh();
    T.best = T.best && isFinite(T.best.t) && T.best.t > 10 && VEHICLES[T.best.type] ? { t: T.best.t, type: T.best.type } : null;
    T.prize = T.prize && typeof T.prize === 'object' ? Object.fromEntries(Object.keys(T.prize).filter(k => VP_EVENTS.some(e => e.id === k)).map(k => [k, true])) : {};
    T.hosted = T.hosted && Number.isInteger(T.hosted.day) ? { day: T.hosted.day } : null;
    T.laps = Number.isInteger(T.laps) && T.laps >= 0 ? T.laps : 0;
    s.track = T; this.session = null; this.lapT = null; this.sect = 0; this._prevZ = null;
  }
}
