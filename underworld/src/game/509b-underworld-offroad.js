/* =====================================================================
   [UNDERWORLD] CEDAR FIELDS OFF-ROAD PARK (§45.36; Session 6C)
   The official side of off-road racing, at the course in Cedar Fields
   South (world: 026, 027, 126, 176). Like Valen Point it is an
   OfficialVenue: Clean Bank, no Rep, never any heat.
   - The Course Office: official events with class rules for off-road
     vehicles, trucks and values; a buy-in from the bank and prize money
     by the same daily tiers as every other race (per event, per economic
     day); free-roam timed laps on the course (a session fee, free for
     the owner: a private session).
   - The compound is a property of its own (no Rank gate, Clean Bank, the
     price provisional until Session 13): six real bays in the owners'
     garage shed (the registry's physical spaces) and the service stand,
     where the owner's cars are repaired a third off.
   The illegal side (countryside races for Dirty Cash and Rep, and
   Vance's off-road pink slip) is in RACES (370) and PinkSlips (508).
   ===================================================================== */
const OR_EVENTS = [
  { id: 'or_trail', name: 'Trail Cup', laps: 2, opp: 4, band: [0, 30000], trail: 0.55, fee: 250, reward: 2000, cls: ['pickup', 'suv', 'utility', 'offroad'], blurb: 'Pickups, SUVs and off-roaders worth under $30,000. Two laps of the course: whoops, jumps, mud and rock.' },
  { id: 'or_truck', name: 'Truck Run', laps: 2, opp: 3, band: [0, Infinity], types: ['truck', 'pickup', 'utility'], fee: 300, reward: 2400, cls: ['truck', 'pickup', 'utility'], blurb: 'Trucks and pickups only. Two laps, heavy metal, mind the jumps.' },
  { id: 'or_pro', name: 'Mesa Pro', laps: 3, opp: 4, band: [20000, Infinity], trail: 0.7, fee: 1200, reward: 8000, cls: ['offroad', 'kodiak'], blurb: 'Real off-roaders worth $20,000 and up. Three laps, flat out.' }
];
for (const e of OR_EVENTS) { e.circuit = true; e.official = true; e.rep = 0; e.venue = 'cfs'; }
// prices (provisional until Session 13): a session on the course, the compound's service stand discount
const OR_PARK = { trackDay: 150, session: 600, minHp: 60, standK: 0.7 };
const COURSE_OFFICE = { id: 'courseoffice', name: 'Course Office' };
// the course's safe speeds: dirt corners (√(4.5·R)), 30 m/s at most, slower over the whoops, the mud and the rock
// and into the jumps, braking back at 4.5 m/s²
function cfsSafeSpeeds() {
  const w = game.world, T = w.cfs.track; if (T._vs) return T._vs;
  const cap = T.pts.map(() => Infinity), lim = { whoops: 15, mud: 11, rock: 14, jump: 20, camber: 20 };
  for (const F of w.cfs.course.features) for (let k = 0; k < T.pts.length; k++) { const a = T.cum[k]; if (a >= F.at - 4 && a <= F.at + F.len) cap[k] = Math.min(cap[k], lim[F.kind]); }
  return (T._vs = loopSafeSpeeds(T, 4.5, 30, 4.5, cap));
}
class OffroadPark extends OfficialVenue {
  constructor(g) {
    super(g, { key: 'offroad', prop: 'offroad', events: OR_EVENTS, park: OR_PARK, office: COURSE_OFFICE, chip: 'CEDAR FIELDS · official', waive: false, wonAt: 'won at Cedar Fields', repairHint: '',
      line: () => { const cf = game.world.cfs; return { T: cf.track, sf: cf.sf, w: CFS_COURSE.w }; } });
  }
  safeSpeeds() { return cfsSafeSpeeds(); }
  // the class rules: the car's worth, and its kind (a list of models) or how well it copes off the road
  classWhy(e, def) {
    if (def.types && !def.types.includes(e.type)) return `Wrong class: the ${def.name} is for ${def.types.map(t => VEHICLES[t].name).join(', ')}.`;
    if (def.trail && trailOf(e.type) < def.trail) return `Wrong class: the ${def.name} needs a car built for dirt${def.trail >= 0.7 ? ' (a real off-roader)' : ' (a pickup, an SUV or an off-roader)'}.`;
    return super.classWhy(e, def);
  }
  // ---------------------------------------------------------------- the service stand (the owner's, in a car)
  standAction(v) {
    const g = this.g, S = g.world.cfs.stand;
    if (v.speed > 2 || v.pos.x < S.x0 || v.pos.x > S.x1 || v.pos.z < S.z0 || v.pos.z > S.z1 + 3) return null;
    if (!this.owned()) return { label: 'Service stand · owners only', act: () => g.ui.toast('The service stand belongs to the compound’s owner.', 'warn') };
    const dmg = v.health < 99.5 || v.broken || v.deformed > 0.05; if (!dmg) return null;
    const c = Math.round(g.content.repairCost(v.type, v.health) * OR_PARK.standK / 10) * 10;
    return { label: `Service stand · repair ${fmtMoney(c)}`, act: () => { if (!Money.pay(c, 'pitService')) { g.ui.toast('Not enough in the bank.', 'warn'); return; } g.content.repair(v); const e = g.vreg.entryOf(v); if (e) e.dmg = 0; g.audio.play('cash'); g.ui.toast('Service stand: fixed.', 'money'); } };
  }
  door() { const pl = this.g.world.places.offroad; return pl ? pl.door : null; }
  findAction() {
    const g = this.g, p = g.player;
    if (p.state === 'vehicle') return p.vehicle ? this.standAction(p.vehicle) : null;
    const d = this.door(); if (!d || p.state !== 'foot' || p.interior) return null;
    if (Math.hypot(p.pos.x - d.x, p.pos.z - d.z) > 2.6) return null;
    return { label: 'Course Office · Cedar Fields Off-Road Park', act: () => this.openOffice() };
  }
  openOffice() {
    const g = this.g, C2 = g.content, PM = g.uw.props, def = PROP_BY_ID.offroad;
    const rule = e => e.types ? e.types.map(t => VEHICLES[t].name).join(', ') : e.trail >= 0.7 ? 'Off-roaders' : 'Built for dirt';
    const render = () => {
      const own = this.owned(), s = this.s;
      let h = `<div class="svcTop"><span>${own ? 'Yours' : 'For sale · ' + fmtMoney(PM.price(def))}</span><span>Best lap <b>${s.best ? fmtRace(s.best.t) : '—'}</b></span><span>${Money.html('trackFee')}</span></div>`;
      if (!own) h += `<div class="card"><div class="t">Buy the compound</div><div class="d">${esc(def.desc)}</div><button class="sbtn gold" data-act="buy" ${Money.can(PM.price(def), 'property') ? '' : 'disabled'}>Buy · ${fmtMoney(PM.price(def))}</button></div>`;
      h += '<h3>Official events</h3><div class="grid2">' + OR_EVENTS.map(e => {
        const p = this.payout(e, 1), f = this.fee(e);
        return `<div class="card"><div class="t">${esc(e.name)}</div><div class="d">${esc(e.blurb)}</div><div class="stat"><span>Class</span><span>${esc(rule(e))}</span></div><div class="stat"><span>Entry</span><span>${f ? fmtMoney(f) : 'free'}</span></div><div class="stat"><span>Prize</span><span>${fmtMoney(p.cash) + (p.tier ? ' (won today)' : '')}</span></div><button class="sbtn" data-act="ev:${e.id}">Enter</button></div>`;
      }).join('') + '</div>';
      h += `<h3>On the course</h3><div class="btns"><button class="sbtn" data-act="day" ${this.session ? 'disabled' : ''}>${own ? 'Private session (free)' : 'Timed laps · ' + fmtMoney(OR_PARK.trackDay)}</button></div>`;
      return h;
    };
    C2.openSvc('Course Office', 'Marshal: “Official means clean: the bank pays, the bank collects, and nobody here calls the police on you.”', render, act => {
      const [k, id] = act.split(':');
      if (k === 'buy') { const r = PM.buy('offroad'); C2.refreshSvc(r || 'The Cedar Fields compound is yours.'); return; }
      if (k === 'ev') { const e = OR_EVENTS.find(x => x.id === id); if (e) this.enter(e); return; }
      if (k === 'day') { C2.refreshSvc(this.book() || 'Session booked.'); return; }
    });
  }
}
