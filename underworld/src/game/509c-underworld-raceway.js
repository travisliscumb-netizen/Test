/* =====================================================================
   [UNDERWORLD] SOUTHSHORE RACEWAY AND THE COMPLEX'S OWNER (owner, 2026-11-18; world: 129b)
   The island's road course, an OfficialVenue (509) like the Southshore
   Speedway (509b): Clean Bank, no Rep, never any heat.
   - The Race Office in the paddock: four official events with class rules
     by the car's worth, a buy-in from the bank and prize money by the same
     daily tiers as every other race (the Invitational awards a Monarch GT,
     once); timed laps on the circuit (a session fee, free for the owner).
   - The Southshore Motorsport Complex (both tracks, one property): its
     twenty-one pit garages hold forty-two of the owner's cars. This venue
     carries what the owner gets on top: race meetings to host, the pit crew
     a third off at any of the garages, and the complex's daily income.
   Valen Point Motorsport Park closed when Valen Sound was filled in: its
   owner has the price back (Clean, 'propRefund'), once, when a save loads;
   its record goes; an Invitational won there counts here; its cars parked
   in its garages take a free bay at another of your places (the registry's
   house(), 505), the complex's garages among them.
   ===================================================================== */
const SR_EVENTS = [
  { id: 'sr_hatch', name: 'Hot Hatch Trophy', laps: 3, opp: 5, band: [0, 18000], fee: 200, reward: 2200, cls: ['compact', 'apex', 'sedan', 'crest'], blurb: 'Hatchbacks and saloons worth under $18,000. Three laps, elbows out.' },
  { id: 'sr_touring', name: 'Touring Cup', laps: 4, opp: 5, band: [14000, 50000], fee: 900, reward: 6500, cls: ['sports', 'tempest', 'muscle', 'hellion', 'revenant'], blurb: 'Sports cars and muscle, $14,000 to $50,000. Four laps of the hairpin.' },
  { id: 'sr_gt', name: 'Southshore GT', laps: 5, opp: 5, band: [45000, Infinity], fee: 2500, reward: 14000, cls: ['supercar', 'valkyr', 'obsidian', 'coupe', 'monarch'], blurb: 'The quick stuff, $45,000 and up. Five laps, flat out down the back straight.' },
  { id: 'sr_inv', name: 'Southshore Invitational', laps: 4, opp: 5, band: [40000, Infinity], fee: 8000, reward: 0, car: 'monarch', cls: ['valkyr', 'obsidian', 'supercar', 'coupe', 'kodiak'], blurb: 'Invitation only, $40,000 and up. The winner drives home a Monarch GT. Once.' }
];
for (const e of SR_EVENTS) { e.circuit = true; e.official = true; e.rep = 0; e.venue = 'sr'; }
// prices (provisional, like the other venues': ECONOMY.md): a session on the circuit
const SR_PARK = { trackDay: 200, session: 600, minHp: 60 };
// the complex's owner (provisional, ECONOMY.md): a meeting's cost and the next day's gate, the daily takings and
// upkeep (about $2,600 a day clear on a $600,000 property), the pit crew's price for an owner
const COMPLEX = { hostCost: 20000, hostTake: 32000, income: 3600, upkeep: 1000, pitK: 0.7 };
// what Valen Point Motorsport Park cost, for an owner's refund
const MOTORSPORT_REFUND = 1500000;
const RACE_OFFICE = { id: 'raceoffice', name: 'Race Office' };
// the circuit's safe speeds: tarmac corners (√(8·R)), 58 m/s at most, braking back at 7 m/s²
function srSafeSpeeds() { const T = game.world.sr.track; return T._vs || (T._vs = loopSafeSpeeds(T, 8, 58, 7)); }
class RacewayPark extends OfficialVenue {
  constructor(g) {
    super(g, { key: 'raceway', prop: 'raceway', events: SR_EVENTS, park: SR_PARK, office: RACE_OFFICE, chip: 'SOUTHSHORE · official', waive: true, wonAt: 'won at Southshore', repairHint: ' (the pit crew can do it)',
      line: () => { const sr = game.world.sr; return { T: sr.track, sf: sr.sf, w: SR.w }; } });
  }
  static fresh() { return { best: null, prize: {}, hosted: null, laps: 0 }; }
  safeSpeeds() { return srSafeSpeeds(); }
  door() { const pl = this.g.world.places.raceway; return pl ? pl.door : null; }
  // ---------------------------------------------------------------- the owner's meeting and the complex's day
  host() {
    const g = this.g, s = this.s;
    if (!this.owned()) return 'Only the owner hosts meetings.';
    if (s.hosted) return 'A meeting is already on the calendar.';
    if (!Money.pay(COMPLEX.hostCost, 'trackHost')) return `Putting a meeting on costs ${fmtMoney(COMPLEX.hostCost)} from your bank.`;
    s.hosted = { day: this.day() };
    g.saveGame(true);
    return '';
  }
  // once an economic day (PropertyManager.tickDay): the complex's takings, and the gate from a meeting you hosted
  tickDay() {
    const g = this.g, s = this.s; if (!this.owned()) return;
    // inside (M13, §45.8): the staff keep it running at cost, no profit for an owner in a cell
    Money.earn(g.uw && g.uw.S.jail ? COMPLEX.upkeep : COMPLEX.income, 'trackIncome');
    Money.pay(COMPLEX.upkeep, 'upkeep', { partial: true });
    if (s.hosted && s.hosted.day < this.day()) { s.hosted = null; Money.earn(COMPLEX.hostTake, 'trackIncome'); g.uw.news('pv', `Race meeting at Southshore: a full house. ${fmtMoney(COMPLEX.hostTake)} from the gate is in your bank.`); }
  }
  // ---------------------------------------------------------------- the pit crew (stopped in a bay of either track's garages)
  pitAction(v) {
    const g = this.g, w = g.world; if (v.speed > 2) return null;
    const bays = [...(w.sr ? w.sr.bays : []), ...(w.cfs ? w.cfs.bays : [])];
    if (!bays.some(b => Math.hypot(v.pos.x - b.x, v.pos.z - b.z) < 3.5)) return null;
    const dmg = v.health < 99.5 || v.broken || v.deformed > 0.05; if (!dmg) return null;
    const c = Math.round(g.content.repairCost(v.type, v.health) * (this.owned() ? COMPLEX.pitK : 1) / 10) * 10;
    return { label: `Pit crew · repair ${fmtMoney(c)}`, act: () => { if (!Money.pay(c, 'pitService')) { g.ui.toast('Not enough in the bank.', 'warn'); return; } g.content.repair(v); const e = g.vreg.entryOf(v); if (e) e.dmg = 0; g.audio.play('cash'); g.ui.toast('Pit crew: fixed.', 'money'); } };
  }
  findAction() {
    const g = this.g, p = g.player;
    if (p.state === 'vehicle') return p.vehicle ? this.pitAction(p.vehicle) : null;
    const d = this.door(); if (!d || p.state !== 'foot' || p.interior) return null;
    if (Math.hypot(p.pos.x - d.x, p.pos.z - d.z) > 2.6) return null;
    return { label: 'Race Office · Southshore Motorsport Complex', act: () => this.openOffice() };
  }
  openOffice() { complexOffice(this.g, 'road'); }
  // a save's venue state: validated; an old save's Valen Point settled first (once: what it reads is then gone)
  reset() {
    const s = this.g.save;
    if (s) {
      const P = s.uw && s.uw.props;
      if (P && P.motorsport) {
        if (P.motorsport.owned) { Money.earn(MOTORSPORT_REFUND, 'propRefund'); s.messages = s.messages || []; s.messages.push({ from: 'Southshore Motorsport', text: `Valen Point Motorsport Park has closed: the sound it stood in is land now. Your ${fmtMoney(MOTORSPORT_REFUND)} is back in your bank, and your cars from its garages have spaces at your other places.`, t: Math.floor((s.stats && s.stats.playTime) || 0), day: '' }); }
        delete P.motorsport;
      }
      if (s.track && typeof s.track === 'object') {
        if (s.track.prize && s.track.prize.vp_inv) { const R = s.raceway && typeof s.raceway === 'object' ? s.raceway : (s.raceway = this.constructor.fresh()); R.prize = { ...(R.prize && typeof R.prize === 'object' ? R.prize : {}), sr_inv: true }; }
        delete s.track;
      }
      for (const e of s.garage || []) if (e.at && e.at.p === 'motorsport') e.at = null;
    }
    const T = super.reset(); if (!T) return T;
    T.hosted = T.hosted && Number.isInteger(T.hosted.day) ? { day: T.hosted.day } : null;
    return T;
  }
}
