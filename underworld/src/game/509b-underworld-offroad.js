/* =====================================================================
   [UNDERWORLD] SOUTHSHORE SPEEDWAY AND THE MOTORSPORT COMPLEX (owner, 2026-11-18; world: 126, 129b)
   The Cedar Fields off-road park was taken out for an asphalt oval; with the road course (Southshore
   Raceway, 509c) it is one property, the Southshore Motorsport Complex:
   - one purchase owns both tracks; their garages (nine at the road course, twelve at the oval) are
     one pool of parking bays (the registry's physical spaces); Paddock Road and the Southshore
     Highway join the two paddocks, so a car from any garage drives to either track's pit lane;
   - either office (the road course's Race Office, the oval's Speedway Office) runs both tracks'
     official events and timed sessions. Like every official venue: Clean Bank, no Rep, no heat.
   A save that owned the off-road park has its price back (Clean, 'propRefund'), once, when it loads;
   its cars parked there move to the street.
   ===================================================================== */
const OV_EVENTS = [
  { id: 'ov_dash', name: 'Speedway Dash', laps: 5, opp: 5, band: [0, 25000], fee: 300, reward: 3000, cls: ['compact', 'apex', 'sedan', 'crest', 'muscle'], blurb: 'Anything worth under $25,000. Five laps of the oval, nose to tail down both straights.' },
  { id: 'ov_muscle', name: 'Muscle Car Nationals', laps: 8, opp: 5, band: [10000, 45000], fee: 900, reward: 7500, cls: ['muscle', 'hellion', 'sports', 'tempest', 'revenant'], blurb: 'Cars worth $10,000 to $45,000. Eight laps on the banking.' },
  { id: 'ov_500', name: 'Southshore 500', laps: 12, opp: 5, band: [40000, Infinity], fee: 3000, reward: 15000, cls: ['supercar', 'valkyr', 'obsidian', 'coupe', 'monarch'], blurb: 'The big one, $40,000 and up. Twelve laps flat out: the straights are 400 m.' }
];
for (const e of OV_EVENTS) { e.circuit = true; e.official = true; e.rep = 0; e.venue = 'oval'; }
// prices (provisional, like the other venues': ECONOMY.md): a session on the oval
const OV_PARK = { trackDay: 200, session: 600, minHp: 60 };
const SPEEDWAY_OFFICE = { id: 'speedwayoffice', name: 'Speedway Office' };
// what the off-road park cost, for an owner's refund
const OFFROAD_REFUND = 180000;
// the oval's safe speeds: the banking holds the turns (√(9·R)), 70 m/s at most, braking back at 7 m/s²
function ovalSafeSpeeds() { const T = game.world.cfs.track; return T._vs || (T._vs = loopSafeSpeeds(T, 9, 70, 7)); }
class OvalPark extends OfficialVenue {
  constructor(g) {
    super(g, { key: 'oval', prop: 'raceway', events: OV_EVENTS, park: OV_PARK, office: SPEEDWAY_OFFICE, chip: 'SOUTHSHORE SPEEDWAY · official', waive: true, wonAt: 'won at the Southshore Speedway', repairHint: '',
      line: () => { const cf = game.world.cfs; return { T: cf.track, sf: cf.sf, w: OVAL.half * 2 }; } });
  }
  safeSpeeds() { return ovalSafeSpeeds(); }
  door() { const pl = this.g.world.places.oval; return pl ? pl.door : null; }
  findAction() {
    const g = this.g, p = g.player, d = this.door();
    if (!d || p.state !== 'foot' || p.interior) return null;
    if (Math.hypot(p.pos.x - d.x, p.pos.z - d.z) > 2.6) return null;
    return { label: 'Speedway Office · Southshore Motorsport Complex', act: () => complexOffice(this.g, 'oval') };
  }
  reset() {
    const T = super.reset(), s = this.g.save; if (!s) return T;
    // the off-road park is gone: its owner has the price back, once; its record goes; its cars move to the street
    const P = s.uw && s.uw.props;
    if (P && P.offroad) {
      if (P.offroad.owned) { Money.earn(OFFROAD_REFUND, 'propRefund'); s.messages = s.messages || []; s.messages.push({ from: 'Southshore Motorsport', text: `The Cedar Fields off-road park has closed for the new speedway. Your ${fmtMoney(OFFROAD_REFUND)} is back in your bank.`, t: Math.floor((s.stats && s.stats.playTime) || 0), day: '' }); }
      delete P.offroad;
    }
    delete s.offroad;
    for (const e of s.garage || []) if (e.at && e.at.p === 'offroad') e.at = null;
    return T;
  }
}
// the complex's two offices: one page with both tracks (buy the complex once; both tracks' events and sessions)
function complexOffice(g, here) {
  const C2 = g.content, PM = g.uw.props, def = PROP_BY_ID.raceway, V = { road: g.raceway, oval: g.oval };
  const T = { road: { name: 'Southshore Raceway · road course', events: SR_EVENTS, len: g.world.sr ? g.world.sr.track.len : 0 }, oval: { name: 'Southshore Speedway · oval', events: OV_EVENTS, len: g.world.cfs ? g.world.cfs.track.len : 0 } };
  const order = here === 'oval' ? ['oval', 'road'] : ['road', 'oval'];
  const render = () => {
    const own = V.road.owned();
    let h = `<div class="svcTop"><span>${own ? 'Yours' : 'For sale · ' + fmtMoney(PM.price(def))}</span><span>${Money.html('trackFee')}</span></div>`;
    if (!own) h += `<div class="card"><div class="t">Buy the Southshore Motorsport Complex</div><div class="d">${esc(def.desc)} About ${fmtMoney(COMPLEX.income - COMPLEX.upkeep)} a day clear.</div><button class="sbtn gold" data-act="buy" ${Money.can(PM.price(def), 'property') ? '' : 'disabled'}>Buy · ${fmtMoney(PM.price(def))}</button></div>`;
    for (const k of order) {
      const v = V[k], t = T[k], s = v.s;
      h += `<h3>${esc(t.name)} · ${(t.len / 1000).toFixed(2)} km · record ${s.best ? fmtRace(s.best.t) : '—'}</h3><div class="grid2">` + t.events.map(e => {
        const p = v.payout(e, 1), f = v.fee(e), band = e.band[1] === Infinity ? fmtMoney(e.band[0]) + ' and up' : fmtMoney(e.band[0]) + '–' + fmtMoney(e.band[1]), done = e.car && s.prize[e.id];
        return `<div class="card"><div class="t">${esc(e.name)}</div><div class="d">${esc(e.blurb)}</div><div class="stat"><span>Class</span><span>${band}</span></div><div class="stat"><span>Entry</span><span>${f ? fmtMoney(f) : 'free'}</span></div><div class="stat"><span>Prize</span><span>${e.car ? (done ? 'won' : esc(VEHICLES[e.car].name)) : fmtMoney(p.cash)}</span></div><button class="sbtn" data-act="ev:${k}:${e.id}" ${done ? 'disabled' : ''}>Enter · ${e.laps} laps</button></div>`;
      }).join('') + '</div>';
      h += `<div class="btns"><button class="sbtn" data-act="day:${k}" ${v.session ? 'disabled' : ''}>${own ? 'Private session (free)' : 'Timed laps · ' + fmtMoney(v.V.park.trackDay)}</button></div>`;
    }
    // the owner's meeting (the complex's, on the road course's record)
    if (own) { const hs = V.road.s.hosted; h += `<h3>Race meetings</h3><div class="btns"><button class="sbtn" data-act="host" ${hs ? 'disabled' : ''}>${hs ? 'Meeting on the calendar' : 'Host a meeting · ' + fmtMoney(COMPLEX.hostCost)}</button></div><div class="hint">The gate pays ${fmtMoney(COMPLEX.hostTake)} the next day. Stop in any pit garage for the pit crew, a third off.</div>`; }
    return h;
  };
  C2.openSvc(here === 'oval' ? 'Speedway Office' : 'Race Office', 'Clerk of the course: “One complex, two tracks. Official means clean: the bank pays, the bank collects, and nobody here calls the police on you.”', render, act => {
    const [k, a, id] = act.split(':');
    if (k === 'host') { C2.refreshSvc(V.road.host() || 'Meeting on the calendar: the takings come in tomorrow.'); return; }
    if (k === 'buy') { const r = PM.buy('raceway'); C2.refreshSvc(r || 'The Southshore Motorsport Complex is yours: both tracks and every garage.'); return; }
    if (k === 'ev') { const e = T[a] && T[a].events.find(x => x.id === id); if (e) V[a].enter(e); return; }
    if (k === 'day') { C2.refreshSvc(V[a].book() || 'Session booked.'); return; }
  });
}
