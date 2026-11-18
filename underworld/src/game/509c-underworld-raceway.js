/* =====================================================================
   [UNDERWORLD] SOUTHSHORE RACEWAY (owner, 2026-11-18; world: 129b)
   The island's second circuit, an OfficialVenue like Valen Point and
   Cedar Fields: Clean Bank, no Rep, never any heat.
   - The Race Office in the paddock: three official events with class
     rules by the car's worth, a buy-in from the bank and prize money
     by the same daily tiers as every other race; timed laps on the
     circuit (a session fee, free for the owner: a private session).
   - The raceway is a property of its own (no Rank gate, Clean Bank):
     its nine pit garages hold eighteen of the owner's cars (the
     registry's physical spaces), and the owner races free.
   ===================================================================== */
const SR_EVENTS = [
  { id: 'sr_hatch', name: 'Hot Hatch Trophy', laps: 3, opp: 5, band: [0, 18000], fee: 200, reward: 2200, cls: ['compact', 'apex', 'sedan', 'crest'], blurb: 'Hatchbacks and saloons worth under $18,000. Three laps, elbows out.' },
  { id: 'sr_touring', name: 'Touring Cup', laps: 4, opp: 5, band: [14000, 50000], fee: 900, reward: 6500, cls: ['sports', 'tempest', 'muscle', 'hellion', 'revenant'], blurb: 'Sports cars and muscle, $14,000 to $50,000. Four laps of the hairpin.' },
  { id: 'sr_gt', name: 'Southshore GT', laps: 5, opp: 5, band: [45000, Infinity], fee: 2500, reward: 14000, cls: ['supercar', 'valkyr', 'obsidian', 'coupe', 'monarch'], blurb: 'The quick stuff, $45,000 and up. Five laps, flat out down the back straight.' }
];
for (const e of SR_EVENTS) { e.circuit = true; e.official = true; e.rep = 0; e.venue = 'sr'; }
// prices (provisional, like the other venues': ECONOMY.md): a session on the circuit
const SR_PARK = { trackDay: 200, session: 600, minHp: 60 };
const RACE_OFFICE = { id: 'raceoffice', name: 'Race Office' };
// the circuit's safe speeds: tarmac corners (√(8·R)), 58 m/s at most, braking back at 7 m/s²
function srSafeSpeeds() { const T = game.world.sr.track; return T._vs || (T._vs = loopSafeSpeeds(T, 8, 58, 7)); }
class RacewayPark extends OfficialVenue {
  constructor(g) {
    super(g, { key: 'raceway', prop: 'raceway', events: SR_EVENTS, park: SR_PARK, office: RACE_OFFICE, chip: 'SOUTHSHORE · official', waive: true, wonAt: 'won at Southshore', repairHint: '',
      line: () => { const sr = game.world.sr; return { T: sr.track, sf: sr.sf, w: SR.w }; } });
  }
  safeSpeeds() { return srSafeSpeeds(); }
  door() { const pl = this.g.world.places.raceway; return pl ? pl.door : null; }
  findAction() {
    const g = this.g, p = g.player, d = this.door();
    if (!d || p.state !== 'foot' || p.interior) return null;
    if (Math.hypot(p.pos.x - d.x, p.pos.z - d.z) > 2.6) return null;
    return { label: 'Race Office · Southshore Raceway', act: () => this.openOffice() };
  }
  openOffice() {
    const g = this.g, C2 = g.content, PM = g.uw.props, def = PROP_BY_ID.raceway;
    const render = () => {
      const own = this.owned(), s = this.s;
      let h = `<div class="svcTop"><span>${own ? 'Yours' : 'For sale · ' + fmtMoney(PM.price(def))}</span><span>Lap record <b>${s.best ? fmtRace(s.best.t) : '—'}</b></span><span>${Money.html('trackFee')}</span></div>`;
      if (!own) h += `<div class="card"><div class="t">Buy the raceway</div><div class="d">${esc(def.desc)}</div><button class="sbtn gold" data-act="buy" ${Money.can(PM.price(def), 'property') ? '' : 'disabled'}>Buy · ${fmtMoney(PM.price(def))}</button></div>`;
      h += '<h3>Official events</h3><div class="grid2">' + SR_EVENTS.map(e => {
        const p = this.payout(e, 1), f = this.fee(e), band = e.band[1] === Infinity ? fmtMoney(e.band[0]) + ' and up' : fmtMoney(e.band[0]) + '–' + fmtMoney(e.band[1]);
        return `<div class="card"><div class="t">${esc(e.name)}</div><div class="d">${esc(e.blurb)}</div><div class="stat"><span>Class</span><span>${band}</span></div><div class="stat"><span>Entry</span><span>${f ? fmtMoney(f) : 'free'}</span></div><div class="stat"><span>Prize</span><span>${fmtMoney(p.cash)}</span></div><button class="sbtn" data-act="ev:${e.id}">Enter · ${e.laps} laps</button></div>`;
      }).join('') + '</div>';
      h += `<h3>On the circuit</h3><div class="btns"><button class="sbtn" data-act="day" ${this.session ? 'disabled' : ''}>${own ? 'Private session (free)' : 'Timed laps · ' + fmtMoney(SR_PARK.trackDay)}</button></div>`;
      return h;
    };
    C2.openSvc('Race Office', 'Clerk of the course: “Official means clean. The bank pays, the bank collects, and nobody here calls the police on you.”', render, act => {
      const [k, id] = act.split(':');
      if (k === 'buy') { const r = PM.buy('raceway'); C2.refreshSvc(r || 'Southshore Raceway is yours.'); return; }
      if (k === 'ev') { const e = SR_EVENTS.find(x => x.id === id); if (e) this.enter(e); return; }
      if (k === 'day') { C2.refreshSvc(this.book() || 'Session booked.'); return; }
    });
  }
}
