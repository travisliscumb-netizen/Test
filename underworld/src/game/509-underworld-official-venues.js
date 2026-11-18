/* =====================================================================
   [UNDERWORLD] OFFICIAL VENUES (§16, §45.34; Session 6B)
   The base of the island's legitimate tracks: Southshore Raceway (the
   road course, 509c) and the Southshore Speedway (the oval, 509b), one
   property, the Southshore Motorsport Complex. Everything here is Clean
   Bank, and nothing here draws heat:
   - Official events: circuit races against the clock and a grid, with
     class rules by the value of the car you bring (registered to you,
     not HOT, in one piece), a buy-in and prize money from the bank (the
     buy-in waived for the owner), paid by the same daily tiers as street
     races (per event, per economic day); an invitational awards a prize
     car, once.
   - Track days: timed laps on the circuit (a fee, or free for the owner:
     a private session). Valid laps pass every sector; the best is saved.
   (Valen Point Motorsport Park, the first of them, closed on 2026-11-18
   when Valen Sound was filled in: 509c takes its owners' features and
   settles an old save.)
   ===================================================================== */
// a loop's checkpoints for an event: every 40 m from the start/finish sample k0 round the loop, `laps` times (the
// last of each lap the line itself); the grid 34 m behind the line; the racing line for AI drivers every 10 m with a
// safe speed vs[k] and the left normal
function loopCheckpoints(T, k0, def, vs) {
  const n = T.pts.length, laps = def.laps || 1, out = [], sf = T.pts[k0];
  for (let l = 0; l < laps; l++) for (let j = 20; j <= n; j += 20) { const k = (k0 + j) % n; out.push({ x: T.pts[k][0], z: T.pts[k][1], lap: l }); }
  for (let l = 0; l < laps; l++) { const i = (l + 1) * Math.floor(n / 20) - 1; if (out[i]) { out[i].x = sf[0]; out[i].z = sf[1]; } }
  const ks = (k0 - 17 + n) % n, p = T.pts[ks], q = T.pts[(ks + 1) % n], dx = q[0] - p[0], dz = q[1] - p[1], l2 = Math.hypot(dx, dz) || 1;
  const dir = { x: dx / l2, z: dz / l2 };
  const ai = [];
  for (let j = 5; j <= n * laps + 30; j += 5) { const k = (ks + j) % n; ai.push({ x: T.pts[k][0], z: T.pts[k][1], node: true, vmax: vs[k], nx: T.nl[k][0], nz: T.nl[k][1] }); }
  return { cps: out, perLap: out.length / laps, start: { x: p[0], z: p[1], h: Math.atan2(dir.x, dir.z), dir }, aiPath: ai };
}
// how fast a loop can be taken at each sample: v = √(a·R) in corners, capped at vTop on the straights and at cap[k]
// where given, braking back from each limit at `brake` m/s²
function loopSafeSpeeds(T, a, vTop, brake, cap) {
  const n = T.pts.length, v = T.R.map((R, k) => Math.min(R > 0 ? Math.sqrt(a * R) : vTop, cap ? cap[k] : Infinity));
  for (let pass = 0; pass < 3; pass++) for (let i = n - 1; i >= 0; i--) { const j = (i + 1) % n, ds = T.cum[i + 1] - T.cum[i]; v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * brake * ds)); }
  return v;
}
// which venue runs an official event
function venueOf(def) { return def.venue === 'oval' ? game.oval : game.raceway; }
/* ---------------------------------------------------------------------
   An official venue: everything Clean Bank, no Rep, no heat. Events with class rules and a buy-in at the start line
   (after scrutineering), prize money by the street races' daily tiers, a prize car once; track sessions with lap
   timing (sectors in order, the best saved). V: { key (its save slot), prop (the property), events, park (prices:
   trackDay, session, minHp), office ({ id, name }), chip, waive (the owner races free), line() → { T, sf: {k, x, z},
   w } }. RacewayPark (the Southshore road course) and OvalPark (the Southshore Speedway).
   --------------------------------------------------------------------- */
class OfficialVenue {
  constructor(g, V) { this.g = g; this.V = V; this.session = null; this.lapT = null; this.sect = 0; this._prev = null; }
  get s() { const s = this.g.save; return s[this.V.key] || (s[this.V.key] = this.constructor.fresh()); }
  static fresh() { return { best: null, prize: {}, laps: 0 }; }
  owned() { return !!(this.g.uw && this.g.uw.props.owned(this.V.prop)); }
  day() { return this.g.uw ? this.g.uw.S.day : 0; }
  // ---------------------------------------------------------------- official events
  fee(def) { return this.V.waive && this.owned() ? 0 : def.fee; }
  payout(def, place) {
    const k = this.g.raceRules ? this.g.raceRules.tier(def.id) : 0;
    return { cash: Math.round(def.reward * [1, 0.4, 0.2][place - 1] * RACE_T.purse[k] / 10) * 10, tier: k };
  }
  noteWin(id) { if (this.g.raceRules) this.g.raceRules.noteWin(id); }
  // the class rule ('' when the car fits): by its worth; a venue can add more
  classWhy(e, def) {
    const w = carWorth(e.type, e.vtier);
    if (w < def.band[0] || w >= def.band[1]) return `Wrong class: this event is for cars worth ${def.band[1] === Infinity ? fmtMoney(def.band[0]) + ' and up' : fmtMoney(def.band[0]) + '–' + fmtMoney(def.band[1])} (yours: ${fmtMoney(Math.round(w))}).`;
    return '';
  }
  // scrutineering on the grid: '' when the car may race this event
  canEnter(v, def) {
    const g = this.g, e = g.vreg.entryOf(v);
    if (!e) return `${this.V.office.name} only lets in cars registered to you.`;
    if (e.hot) return 'Scrutineering won’t pass a car with hot plates.';
    if (v.health < this.V.park.minHp || v.broken) return `Scrutineering: get the car repaired first${this.V.repairHint || ''}.`;
    const why = this.classWhy(e, def); if (why) return why;
    if (def.car && this.s.prize[def.id]) return `You have already won the ${def.name}.`;
    if (def.car && g.vreg.freeBays() < 1) return 'You need a free parking space for the prize car.';
    return '';
  }
  // the buy-in at the start line (after scrutineering): '' paid, else why not
  payIn(def) { const f = this.fee(def); if (!f) return ''; return Money.pay(f, 'trackFee') ? '' : `The entry fee is ${fmtMoney(f)} from your bank.`; }
  // a prize car, once: the flag is set and saved with the car (a reload can't award it twice)
  awardCar(def) {
    const g = this.g; if (!def.car || this.s.prize[def.id]) return null;
    this.s.prize[def.id] = true;
    const e = g.vreg.give(def.car, 'prize', undefined, this.V.office.name);
    g.vreg.note(this.V.wonAt, def.car, { event: def.id });
    g.ui.toast(`The ${VEHICLES[def.car].name} is yours. Its space is waiting in your garage.`, 'money');
    g.saveGame(true);
    return e;
  }
  spec(def) {
    const p = this.payout(def, 1), f = this.fee(def);
    return { type: 'srace', official: true, race: def, title: def.name, desc: def.blurb + (f ? ` Entry ${fmtMoney(f)} from your bank on the grid.` : ' No entry fee: it’s your track.') + (p.tier ? ` Won today already: the prize is ${fmtMoney(p.cash)}.` : ''), reward: def.reward ? p.cash : 0, fee: 0, contact: this.V.office, locked: '', chip: this.V.chip, rep: 0 };
  }
  enter(def) {
    const g = this.g; if (g.missions.active) { g.ui.toast('Finish what you’re doing first.', 'warn'); return; }
    g.ui.closeAll(); g.missions.start(this.spec(def));
  }
  checkpoints(def) { const L = this.V.line(); return loopCheckpoints(L.T, L.sf.k, def, this.safeSpeeds()); }
  // ---------------------------------------------------------------- track days and private sessions
  book() {
    const g = this.g, own = this.owned(), cost = own ? 0 : this.V.park.trackDay;
    if (this.session) return 'You’re already on track.';
    if (cost && !Money.pay(cost, 'trackFee')) return `A session is ${fmtMoney(cost)} from your bank.`;
    this.session = { until: g.time + this.V.park.session, laps: 0, best: 0, own };
    this.lapT = null; this.sect = 0; this._prev = null;
    g.ui.toast(own ? 'Private session: the track is yours. Laps are timed from the line.' : `Session booked: ${Math.round(this.V.park.session / 60)} minutes on track, laps timed from the line.`, 'money');
    return '';
  }
  // ---------------------------------------------------------------- lap timing in a session
  update(dt) {
    const g = this.g, S = this.session; if (!S) return;
    if (g.time > S.until) { this.session = null; g.ui.toast(`Session over. ${S.laps} lap${S.laps === 1 ? '' : 's'}${S.best ? ', best ' + fmtRace(S.best) : ''}.`, 'info'); return; }
    const p = g.player, v = p.state === 'vehicle' ? p.vehicle : null; if (!v) { this._prev = null; return; }
    const L = this.V.line(), T = L.T, n = T.pts.length, k0 = L.sf.k;
    // sectors: a quarter, half and three quarters of the way round must be passed in order
    const sec = [0.25, 0.5, 0.75].map(f => T.pts[(k0 + Math.floor(n * f)) % n]);
    if (this.lapT !== null && this.sect < 3) { const q = sec[this.sect]; if (Math.hypot(v.pos.x - q[0], v.pos.z - q[1]) < 18) this.sect++; }
    // the line: crossed forwards (the side of it you are on, along the direction of travel, turns positive) within
    // the track's width
    const a = T.pts[(k0 - 1 + n) % n], b = T.pts[(k0 + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    const along = ((v.pos.x - L.sf.x) * dx + (v.pos.z - L.sf.z) * dz) / l, lat = Math.abs((v.pos.x - L.sf.x) * dz - (v.pos.z - L.sf.z) * dx) / l;
    const crossed = this._prev !== null && this._prev < 0 && along >= 0 && lat < L.w / 2 + 1.5 && along < 10;
    this._prev = along;
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
  // a save's venue state: validated (subclasses add their own fields)
  reset() {
    const s = this.g.save; if (!s) return;
    const T = s[this.V.key] && typeof s[this.V.key] === 'object' ? s[this.V.key] : this.constructor.fresh();
    T.best = T.best && isFinite(T.best.t) && T.best.t > 10 && VEHICLES[T.best.type] ? { t: T.best.t, type: T.best.type } : null;
    T.prize = T.prize && typeof T.prize === 'object' ? Object.fromEntries(Object.keys(T.prize).filter(k => this.V.events.some(e => e.id === k)).map(k => [k, true])) : {};
    T.laps = Number.isInteger(T.laps) && T.laps >= 0 ? T.laps : 0;
    s[this.V.key] = T; this.session = null; this.lapT = null; this.sect = 0; this._prev = null;
    return T;
  }
}
