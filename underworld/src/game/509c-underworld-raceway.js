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
    return { label: 'Race Office · Southshore Motorsport Complex', act: () => this.openOffice() };
  }
  openOffice() { complexOffice(this.g, 'road'); }
}
