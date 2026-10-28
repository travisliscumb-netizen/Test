/* =====================================================================
   [UNDERWORLD] PRISON: sentencing from the arrest, the charges and the
   record (halved since v6); a playable cell block on its own clock while the
   empire keeps running day for day; good-behaviour chores unlock 3×, 5× and 7×
   time; payphone; a phone or an early release only by bribing a guard.
   ===================================================================== */
const JAIL_LOOK = { shirt: 0xd8762a, pants: 0xd8762a, shoes: 0xe8e8e8, cap: -1, hair: 0x1a1410 };
// the people in Block C you can get to know (each helps once per sentence when they trust you)
const INMATES = {
  inmate1: { name: 'Marcus "Deacon" Hale', blurb: 'Ran collections for half the Old Quarter. Still has friends out there.', gift: 'word', giftText: 'Put in a word with a crew outside' },
  inmate2: { name: 'Tito Reyes', blurb: 'Knows every supplier who ever sold him short.', gift: 'contact', giftText: 'Pass on a supplier contact' },
  inmate3: { name: 'Big Lou', blurb: 'Two hundred pounds of patience. Getting out the same month as you, maybe.', gift: 'recruit', giftText: 'Work for you when you’re both out' },
  inmate4: { name: 'Kenji "Wire" Sato', blurb: 'Fixed the block’s cameras once. Knows when the night guard walks.', gift: 'ally', giftText: 'Help with a way out' }
};
// favours (M8, §24): once an inmate trusts you (60+), each can do his kind of favour again and again, for commissary
// money and a cooldown. Favours never take time off the sentence.
const INMATE_FAVORS = {
  inmate1: { id: 'protect', text: 'Protection: nobody touches you, and the guards look elsewhere', fee: 100, cd: 10 },
  inmate2: { id: 'phone', text: 'Smuggle in a phone (it might get found)', fee: 300, cd: 15 },
  inmate3: { id: 'cover', text: 'Cause a scene on the night you go (a distraction)', fee: 150, cd: 10 },
  inmate4: { id: 'intel', text: 'Guard routines, or a tool for a grate', fee: 250, cd: 8 }
};
// the jail (M8): a compact multi-room county jail round a two-tier cell block (§24). Local metres, origin at the
// centre: the cell block's two tiers along the north wall with a catwalk and a stair, the day room in front of them,
// the laundry (work) and the restricted maintenance room in the west wing, the guard station and the exit in the east
// wing, and along the south the cafeteria, visitation (lawyers) with the infirmary behind it, and the gym.
const JAIL = { W: 40, D: 32, H1: 3.4, H: 7.4, bunk: { x: -2, z: -14.3 }, restricted: { x0: -20, x1: -14, z0: -16, z1: -9 } };
INTERIOR_DEFS.prison = {
  name: 'Port Valen County Jail', place: 'prison', w: JAIL.W, d: JAIL.D, h: JAIL.H, exit: { x: 0, z: 99 }, spawnH: 0, noExit: true, noDoor: true,
  // the catwalk in front of the upper cells and the stair up to it at the east end of the block
  levels: [
    { x0: -12, x1: 13.8, z0: -11.5, z1: -9.9, h: JAIL.H1 },
    { x0: 12.2, x1: 13.8, z0: -9.9, z1: -2.4, axis: 'z', dir: -1, h0: 0, h1: JAIL.H1 }
  ],
  build(k) {
    const H1 = JAIL.H1, H = JAIL.H, wall = 0xa8b0a6, wall2 = 0x9aa39a, steel = 0x3a3e44, bar = 0x3a3e44, orange = 0xd8762a;
    k.room(JAIL.W, JAIL.D, H, { floor: 0x7d7f80, wall, wall2, ceil: 0x8a8f8c, trim: 0x3a3e40, band: [0, 1.3], bandC: 0x5d6b62, lights: [6, 4], lightC: 0xe8f4ff });
    k.tiles(JAIL.W, JAIL.D, 0x7d7f80, 0x737576, 1.25);
    // ----- interior walls (doorways as gaps)
    iwall(k, 'z', -14, -16, 2, 0, H, wall, [[-3.2, -1.4]]);            // block | west wing (laundry door)
    iwall(k, 'x', -9, -20, -14, 0, H, wall2, [[-17.8, -16.4]]);        // laundry | maintenance (restricted)
    iwall(k, 'z', 14, -16, 2, 0, H, wall, [[-1.4, 0.2]]);              // block | guard station (its door; a window above the counter)
    iwall(k, 'x', 2, -20, 20, 0, H1, wall2, [[-12.2, -10.2], [-1.4, 1.4], [10.2, 12.2]]); // block | cafeteria, visitation, gym
    iwall(k, 'z', -6, 2, 16, 0, H1, wall);                              // cafeteria | visitation & infirmary
    iwall(k, 'z', 6, 2, 16, 0, H1, wall);                               // visitation & infirmary | gym
    iwall(k, 'x', 9, -6, 6, 0, H1, wall2, [[-1, 1]]);                  // visitation | infirmary
    k.box(0, H1, 9, 40, 0.2, 14, 0x8a8f8c);                             // the low ceiling over the south rooms
    // the guard station's window onto the day room
    k.glow(14.02, 1.4, -6, 0.04, 1.2, 3.4, 0x8fb4c8, 0.5); k.box(14.6, 0, -6, 1.0, 1.0, 3.6, steel, { col: true });
    // ----- the cell block: six cells a tier, the player's (lower, third from the west) open
    const cellRow = (y, open) => {
      for (let c = 0; c < 6; c++) {
        const x0 = -12 + c * 4;
        k.box(x0, y, -13.8, 0.18, 3.2, 4.4, 0x8f978e, { col: true });
        k.box(x0 + 2, y, -15.35, 3.4, 0.45, 0.85, 0x5a5e62, { col: true }); k.box(x0 + 2, y + 0.45, -15.35, 3.2, 0.1, 0.8, 0xc8c2b4);
        k.box(x0 + 2.4, y + 1.35, -15.35, 3.0, 0.12, 0.8, 0x5a5e62); k.box(x0 + 2.4, y + 1.47, -15.35, 2.9, 0.08, 0.75, 0xc8c2b4);
        k.box(x0 + 3.4, y, -12.6, 0.45, 0.42, 0.55, 0xd8dcd8, { col: true });
        const isOpen = open && c === 2;
        for (let b = 0; b < 11; b++) { if (isOpen && b > 2 && b < 8) continue; k.box(x0 + 0.2 + b * 0.36, y, -11.6, 0.05, 3.2, 0.05, bar); }
        k.box(x0 + 2, y + 3.15, -11.6, 4, 0.12, 0.12, bar);
        if (isOpen) k.cols.push({ x0: x0 + 0.1, x1: x0 + 1.1, z0: -11.68, z1: -11.52, y0: y, y1: y + 3.2 }, { x0: x0 + 2.95, x1: x0 + 4, z0: -11.68, z1: -11.52, y0: y, y1: y + 3.2 });
        else k.cols.push({ x0: x0 + 0.1, x1: x0 + 4, z0: -11.68, z1: -11.52, y0: y, y1: y + 3.2 });
        k.glow(x0 + 2, y + 3.0, -13.8, 0.6, 0.05, 0.3, 0xe8f4ff, 1.8);
      }
      k.box(12, y, -13.8, 0.18, 3.2, 4.4, 0x8f978e, { col: true });
    };
    cellRow(0, true); cellRow(H1, false);
    k.box(0, H1 - 0.25, -13.8, 24.2, 0.25, 4.4, 0x5a5e62);
    // the catwalk: a steel deck, a railing on its open side, and the stair down at the east end
    k.box(1, H1 - 0.25, -10.7, 25.6, 0.25, 1.6, 0x5a5e62, { col: true });
    k.box(1, H1 - 0.005, -10.7, 25.4, 0.01, 1.5, 0x6a6e72, { flat: true });
    k.box(0.1, H1 + 1.0, -9.92, 24.2, 0.06, 0.06, 0xc8ccd0); k.cols.push({ x0: -12, x1: 12.2, z0: -9.98, z1: -9.86, y0: H1, y1: H1 + 1.1 });
    for (let x = -12; x <= 12; x += 2) k.box(x, H1, -9.92, 0.05, 1.0, 0.05, 0xc8ccd0);
    for (let i = 0; i < 16; i++) { const z0 = -2.4 - i * (7.5 / 16), top = (i + 1) * H1 / 16; k.box(13, top - 0.14, z0 - 7.5 / 32, 1.6, 0.14, 7.5 / 16 + 0.01, 0x5a5e62); }
    for (let i = 0; i < 8; i++) { const za = -2.4 - i * 7.5 / 8, zb = -2.4 - (i + 1) * 7.5 / 8, ha = i * H1 / 8; if (ha > 0.4) k.cols.push({ x0: 12.2, x1: 13.8, z0: zb, z1: za, y0: 0, y1: ha - 0.05 }); k.cols.push({ x0: 12.05, x1: 12.2, z0: zb, z1: za, y0: Math.max(0, ha - 0.3), y1: ha + H1 / 8 + 1.0 }); }
    k.box(12.12, H1 * 0.5 + 0.9, -6.15, 0.05, 0.05, 7.6, 0xc8ccd0);
    // ----- the day room: steel tables, the TV, the payphone, cards on the middle table
    for (const [tx, tz] of [[-8, -6], [-2, -4.5], [4, -6], [-8, -1], [4, -1]]) { k.box(tx, 0, tz, 2.4, 0.78, 1.0, 0x9aa0a6, { col: true }); for (const s of [-1, 1]) k.box(tx, 0, tz + s * 0.95, 2.4, 0.45, 0.32, 0x8a9096); }
    for (let i = 0; i < 5; i++) k.box(-2.6 + i * 0.25, 0.79, -4.1 + (i % 2) * 0.12, 0.16, 0.01, 0.22, i % 2 ? 0xf4f2ee : 0xd23a2a);
    k.box(-13.9, 1.6, -5, 0.08, 1.0, 1.6, 0x111111); k.glow(-13.85, 1.65, -5, 0.02, 0.9, 1.5, 0x6a8ab0, 1.3);
    k.box(13.7, 0.9, 1.0, 0.2, 0.7, 0.4, 0x2a2c30); k.box(13.6, 1.25, 1.0, 0.12, 0.25, 0.18, 0x111111); k.glow(13.58, 1.45, 1.0, 0.02, 0.1, 0.15, 0x7fe08f, 1.4);
    k.box(12.8, 0, -7.5, 0.55, 0.85, 0.55, 0xc23a2a, { col: true }); k.box(12.8, 0.85, -7.5, 0.6, 0.06, 0.6, steel);
    // ----- the laundry (the work board), the restricted maintenance room behind it, the grate
    for (let i = 0; i < 4; i++) { k.box(-19.4, 0, -7.6 + i * 2.2, 1.1, 1.2, 1.4, 0xd8dcd8, { col: true }); k.glow(-18.84, 0.65, -7.6 + i * 2.2, 0.02, 0.5, 0.5, 0x6a7a8a, 0.8); }
    for (const z of [-6.4, -5.2]) { k.box(-15.5, 0.2, z, 0.9, 0.7, 0.9, 0x6a7a8a, { col: true }); k.box(-15.5, 0.85, z, 0.8, 0.15, 0.8, 0xe8e4dc); }
    k.box(-14.12, 1.3, 0.2, 0.04, 1.0, 1.4, 0xb59a6a); for (let i = 0; i < 6; i++) k.box(-14.16, 1.4 + (i % 2) * 0.4, -0.3 + Math.floor(i / 2) * 0.45, 0.02, 0.3, 0.32, 0xf4f2ee);
    k.box(-17.1, 0, -9, 1.4, 2.3, 0.08, 0x4a4e54); k.glow(-17.1, 2.2, -8.95, 0.6, 0.08, 0.03, 0xff4d5e, 1.6); // the restricted door (it stands open on its stop)
    for (let i = 0; i < 4; i++) k.box(-17, 2.6 + i * 0.25, -12.5, 6, 0.12, 0.12, i % 2 ? 0x8a6a4a : 0x6a7a8a); // pipes
    k.box(-19.92, 0.15, -13, 0.06, 0.8, 1.1, steel); for (let i = 0; i < 6; i++) k.box(-19.88, 0.2 + i * 0.13, -13, 0.03, 0.04, 1.0, 0x22252a);
    // ----- the cafeteria: three long tables and the serving counter
    for (const tz of [5, 8.5, 12]) { k.box(-13, 0, tz, 8, 0.78, 1.0, 0x9aa0a6, { col: true }); for (const s of [-1, 1]) k.box(-13, 0, tz + s * 0.95, 8, 0.45, 0.32, 0x8a9096); }
    k.box(-13, 0, 15.3, 8, 1.0, 0.7, 0x8a9096, { col: true }); k.box(-13, 1.0, 15.3, 8.1, 0.06, 0.8, 0xc8ccd0);
    k.box(-13, 1.06, 15.65, 7.6, 1.3, 0.04, 0x2a2c30); k.glow(-13, 1.7, 15.62, 7.2, 0.9, 0.02, 0xffe6b8, 1.4); k.glow(-13, 2.6, 15.6, 6.0, 0.28, 0.03, orange, 1.6);
    // ----- visitation: booths behind glass; the infirmary: beds and a cabinet
    for (const x of [-3.5, 0, 3.5]) { k.box(x, 0, 6.2, 2.6, 1.0, 0.5, 0x5a5e62, { col: true }); k.glow(x, 1.0, 6.25, 2.4, 1.4, 0.03, 0x8fb4c8, 0.5); k.box(x, 0, 5.2, 0.45, 0.6, 0.45, steel); k.box(x + 0.6, 1.05, 6.0, 0.08, 0.25, 0.1, 0x111111); }
    for (const x of [-4, 4]) { k.box(x, 0, 13.5, 1.0, 0.55, 2.0, 0xe8e8e4, { col: true }); k.box(x, 0.55, 12.8, 0.9, 0.12, 0.5, 0xf4f4f0); }
    k.box(0, 0, 15.6, 2.0, 1.9, 0.5, 0xe8e8e4, { col: true }); k.glow(0, 1.5, 15.34, 0.5, 0.5, 0.02, 0xff4d5e, 1.4);
    // ----- the gym: a bench, a rack, a hoop, high windows
    k.box(13, 0, 12, 0.5, 0.45, 1.6, 0x2a2a2e, { col: true }); k.box(13, 0.95, 11.8, 1.6, 0.06, 0.06, 0x9a9a9a);
    for (const sx of [-1, 1]) k.box(13 + sx * 0.75, 0.95, 11.8, 0.08, 0.35, 0.35, 0x222222);
    k.box(16, 0, 14.8, 2.4, 1.2, 0.5, 0x2a2a2e, { col: true }); k.box(19.8, 2.4, 9, 0.1, 1.0, 1.4, 0xf4f2ee); k.box(19.4, 2.4, 9, 0.6, 0.04, 0.04, orange);
    for (let i = 0; i < 4; i++) k.glow(7 + i * 3.6, 2.6, 15.96, 2.6, 0.5, 0.03, 0xcfe0ff, 1.2);
    // ----- the guard station: a desk, monitors, the locked exit
    k.box(17.5, 0, -6, 1.4, 0.8, 3.2, steel, { col: true }); for (let i = 0; i < 3; i++) k.glow(18.2, 1.2 + (i % 2) * 0.4, -7 + i, 0.03, 0.35, 0.5, 0x7fd0ff, 1.3);
    k.door(19.98, -6, 3, 0x55595e, 0xff4d5e);
    for (let i = 0; i < 6; i++) k.glow(-14 + i * 5.6, H - 1.2, -15.96, 2.0, 0.6, 0.03, 0xcfe0ff, 1.0);
  },
  spots: [
    { id: 'bunk', x: JAIL.bunk.x, z: JAIL.bunk.z, r: 1.4, label: 'Bunk · sentence & empire' },
    { id: 'payphone', x: 13.2, z: 1.0, r: 1.3, label: 'Payphone' },
    { id: 'smokey', x: 6.2, z: -5.6, r: 1.5, label: 'Smokey · contraband' },
    { id: 'guard', x: 13.1, z: -5.2, r: 1.5, label: 'Guard station window' },
    { id: 'visit', x: 0, z: 4.6, r: 1.2, label: 'Visitation · lawyers' },
    { id: 'infirmary', x: 0, z: 12, r: 1.6, label: 'Infirmary' },
    { id: 'work', x: -15, z: 0.2, r: 1.3, label: 'Work board · laundry, kitchen, cleaning' },
    { id: 'cards', x: -2, z: -3.3, r: 1.1, label: 'Cards & dice' },
    { id: 'hatch', x: -19.2, z: -13, r: 1.1, label: 'Maintenance grate' },
    { id: 'weights', x: 13, z: 10.6, r: 1.3, label: 'Work out' },
    { id: 'tv', x: -13, z: -5, r: 1.2, label: 'Watch the news' },
    { id: 'rota', x: 2, z: -10.7, y: JAIL.H1, r: 1.3, label: 'Watch the guards from the catwalk' },
    { id: 'inmate:inmate1', x: -13, z: 7.6, r: 1.0, label: 'Talk to Deacon' },
    { id: 'inmate:inmate2', x: -16.4, z: -3.6, r: 1.0, label: 'Talk to Tito' },
    { id: 'inmate:inmate3', x: 11.2, z: 12.4, r: 1.0, label: 'Talk to Big Lou' },
    { id: 'inmate:inmate4', x: 10.6, z: -3.4, r: 1.0, label: 'Talk to Wire' }
  ],
  npcs: [
    { id: 'smokey', x: 6.2, z: -4.8, h: Math.PI, look: { shirt: 0xd8762a, pants: 0xd8762a, cap: 0x2a2a2e } },
    { id: 'inmate1', x: -13, z: 6.8, h: 0, look: { shirt: 0xd8762a, pants: 0xd8762a } },
    { id: 'inmate2', x: -17.2, z: -3.6, h: Math.PI / 2, look: { shirt: 0xd8762a, pants: 0xd8762a } },
    { id: 'inmate3', x: 11.2, z: 13.2, h: Math.PI, look: { shirt: 0xd8762a, pants: 0xd8762a } },
    { id: 'inmate4', x: 10.6, z: -2.6, h: Math.PI, look: { shirt: 0xd8762a, pants: 0xd8762a } },
    { id: 'guard', x: 16.6, z: -5, h: -Math.PI / 2, look: 'cop' },
    { id: 'nurse', x: 1.2, z: 14.6, h: Math.PI, look: { shirt: 0xe8eef6, pants: 0xe8eef6 } }
  ],
  // the night guards during an escape (lights out): one walks the block, the corridor under the catwalk and the
  // laundry; a second (no rota known, or the jail tightened up after escapes) works the laundry and maintenance
  guards: [[[-12, -10.4], [11, -10.4], [11, -6], [-12, -6], [-12, -2.2], [-16.5, -2.2], [-16.5, -7.5], [-12, -2.2]]],
  guards2: [[-15.5, -1.5], [-19, -1.5], [-19, -7.4], [-17, -8.2], [-17, -14.5], [-15, -14.5], [-17, -8.2], [-15.5, -6]]
};
// Sentencing: a sentence day passes every two real seconds at 1× while you are in the block (menus stop it).
// Every day served is a full day on the street: businesses, payroll, upkeep, territory and suppliers all run
// as normal (v6; v5 moved the street a day per week). Sentences are half what the charges add up to, so
// fewer days pass. Good behaviour points (chores) unlock 2× and then 3×; misbehaviour takes points away.
const JAIL_SEC_PER_DAY = 2;
const JAIL_STREET_RATIO = 1;
const SENTENCE_FACTOR = 0.5;
// §24 / §37.4: 1× / 3× / 5× / 7×, each unlocked by good-behaviour points (and lost again by misbehaviour)
const JAIL_SPEEDS = [{ x: 1, pts: 0 }, { x: 3, pts: 20 }, { x: 5, pts: 45 }, { x: 7, pts: 75 }];
const GBP_MAX = 100;
// chore points: a tray to the serving counter, a piece of litter in the bin, a laundry bag to the carts
const CHORE_PTS = { tray: 3, trash: 2, bag: 5 };
const SENTENCE_BASE = [5, 7, 14, 30, 75, 150]; // days by wanted level at arrest
const SENTENCE_MAX = 3 * 365;
// a sentence in readable form: "45 days", "1 year 74 days", "3 years"
function fmtSentence(d) {
  d = Math.max(0, Math.round(d));
  const y = Math.floor(d / 365), r = d % 365;
  const dd = n => `${n} day${n === 1 ? '' : 's'}`;
  if (!y) return dd(d);
  return `${y} year${y > 1 ? 's' : ''}${r ? ' ' + dd(r) : ''}`;
}
class Prison {
  constructor(uw) { this.uw = uw; this.callT = 0; this.ambT = 0; this.esc = null; }
  get S() { return this.uw.S; }
  get j() { return this.uw.S.jail; }
  // what the arrest looks like before the court (the busted screen): the court's counts and the sentence they add up to
  charges() {
    const L = this.uw.legal, ch = L.charges(), total = L.sentenceOf(ch.counts, ch.mul, ch.fugitive);
    return { ...ch, total, full: total, lines: ch.counts.map(c => [c.name, c.days]) };
  }
  // called once the arrest animation has played: sentence, confiscate, lock up
  // booking (M7): the counts are fixed from what you had on you before it is taken, then everything carried is
  // confiscated, then the court hears the case (Legal.arraign); a jail sentence comes back through lockUp
  arrest() {
    const uw = this.uw, S = this.S, g = uw.g, p = g.player;
    const pend = this.pending || { ch: this.charges(), veh: null }; this.pending = null;
    const ch = pend.ch;
    // confiscation: everything carried, the trunk of the car you were in, every firearm, and the Dirty Cash on you
    // and in that car (§2). Cash in stashes and vaults, and the bank, are not touched by an ordinary arrest.
    S.st.seized += units(S.inv); Inv.clear(S.inv); uw.tools.confiscate();
    const v = pend.veh;
    const cash = Money.seize(v && g.vehicles.list.includes(v) ? v : null);
    S.st.seizedCash = (S.st.seizedCash || 0) + cash;
    if (cash > 0) uw.news('pv', `The police took ${fmtMoney(cash)} in cash from you and the car. Whatever you stashed is still where you left it.`);
    if (v && g.vehicles.list.includes(v)) {
      if (v.trunk) Inv.clear(v.trunk);
      // the car itself: yours goes to the impound lot, still yours (§45.30), emptied of what the police took above;
      // a stolen one you were in is recovered (logged)
      if (v.garageUid) { const e = g.save.garage.find(x => x.uid === v.garageUid); if (e) { if (e.trunk) Inv.clear(e.trunk); e.dmg = Math.max(e.dmg, 100 - v.health); if (g.player.vehicle === v) g.exitVehicle(true); g.impound.seize(e, 'arrest'); } }
      else if (v.trackId) { const r = g.vreg.rec(v.trackId); if (r) { if (g.player.vehicle === v) g.exitVehicle(true); g.vreg.recover(r, 'arrest'); } }
      if (g.vehicles.list.includes(v) && g.player.vehicle !== v) g.vehicles.despawn(v);
    }
    // only what you had on you is evidence: guns, rounds and armour left in a stash stay there
    const ws = g.save.weapons, wl = g.save.wloc; let kept = 0;
    for (const k of ARMORY_GUNS) { if (ws[k] && wl[k]) kept++; else ws[k] = false; }
    for (const k in g.save.ammo) g.save.ammo[k] = 0;
    p.mag = { pistol: 0, smg: 0, shotgun: 0 }; p.weapon = 0; p.vest = 0; g.save.vest = 0;
    if (kept) uw.news('pv', `The police took what you carried. The ${kept === 1 ? 'gun' : kept + ' guns'} in your stash ${kept === 1 ? 'is' : 'are'} still there.`);
    uw.legal.arraign(ch);
  }
  // the court sent you down: the cell block, on its own clock
  lockUp(ch) {
    const uw = this.uw, S = this.S, g = uw.g;
    S.jail = Prison.fresh(ch);
    this.acc = 0;
    this.enter();
    g.ui.banner('Sentenced', fmtSentence(ch.total), 'fail', 3.5);
    uw.news('pv', `Sentenced to ${fmtSentence(ch.total)}. No phone, no map in here: the business runs without you, day for day. Do chores for good-behaviour points to speed time up, hire a lawyer, or try a guard.`);
    g.saveGame(true);
  }
  static fresh(ch) {
    return {
      total: ch.total, served: 0, call: 0, appealed: false, bribed: false, credit: 0, standing: 10, susp: 0, intel: 0, tool: false, ally: false,
      lockUntil: 0, inm: {}, lastJob: -9, lastBribe: -99, lastStudy: -9, lastLawyer: -99, lawyers: [], escapes: 0, streetAcc: 0, workouts: 0, gifts: [],
      // v6: good-behaviour points and the speed chosen; time off (lawyers, paperwork, good time) never takes the
      // sentence under half of what it started at; the smuggled phone (if a guard brings one) is for this sentence only
      gbp: 0, speed: 1, floor: Math.max(2, Math.ceil(ch.total * 0.5)), phone: false, lastPhone: -99, lastRelease: -99, chores: 0,
      // the jail commissary account: prison wages and the dice table, kept apart from street money (§45.18)
      commissary: 0, cover: false, fav: {}, trespass: -1, lastSick: -9,
      charges: ch.lines.map(l => `${l[0]}: ${fmtSentence(l[1])}`).join(' · ') + (ch.mul > 1.01 ? ` · ×${ch.mul.toFixed(2)} record & pressure` : ch.mul < 0.99 ? ` · ×${ch.mul.toFixed(2)} (friends at the precinct)` : '') + (ch.full ? ` · halved: ${fmtSentence(ch.full)} → ${fmtSentence(ch.total)}` : '')
    };
  }
  // fills in anything a saved sentence is missing (older saves had a speed setting and fewer fields)
  static sanitize(j, num) {
    const d = Prison.fresh({ total: 30, lines: [], mul: 1 });
    j.total = Math.floor(num(j.total, 30, 1, 36500));
    j.served = num(j.served, 0, 0, j.total);
    for (const k of ['credit', 'standing', 'susp', 'intel', 'workouts', 'escapes', 'streetAcc', 'call', 'chores']) j[k] = num(j[k], d[k], 0, 1e6);
    j.commissary = Math.floor(num(j.commissary, 0, 0, 1e6));
    for (const k of ['lastJob', 'lastBribe', 'lastStudy', 'lastLawyer', 'lockUntil', 'lastPhone', 'lastRelease']) j[k] = num(j[k], d[k], -999, 1e6);
    j.gbp = clamp(num(j.gbp, 0, 0, GBP_MAX), 0, GBP_MAX);
    j.speed = JAIL_SPEEDS.some(sp => sp.x === j.speed) ? j.speed : 1;
    while (j.speed > 1 && JAIL_SPEEDS.find(sp => sp.x === j.speed).pts > j.gbp) j.speed--;
    j.floor = Math.floor(num(j.floor, Math.max(2, Math.ceil(j.total * 0.5)), 1, j.total));
    if (j.phone !== undefined) j.phone = !!j.phone;
    j.streetAcc = Math.min(j.streetAcc, 0.999);
    j.standing = clamp(j.standing, 0, 100); j.susp = clamp(j.susp, 0, 100); j.intel = clamp(j.intel, 0, 3);
    j.appealed = !!j.appealed; j.bribed = !!j.bribed; j.tool = !!j.tool; j.ally = !!j.ally; j.cover = !!j.cover;
    j.fav = j.fav && typeof j.fav === 'object' ? j.fav : {}; for (const k in j.fav) { if (!INMATE_FAVORS[k]) delete j.fav[k]; else j.fav[k] = num(j.fav[k], 0, -999, 1e6); }
    j.trespass = num(j.trespass, -1, -1, 1e6); j.lastSick = num(j.lastSick, -9, -999, 1e6);
    j.lawyers = Array.isArray(j.lawyers) ? j.lawyers.filter(x => typeof x === 'string').slice(0, 3) : [];
    j.gifts = Array.isArray(j.gifts) ? j.gifts.filter(x => INMATES[x]).slice(0, 4) : [];
    j.inm = j.inm && typeof j.inm === 'object' ? j.inm : {};
    for (const k in j.inm) { if (!INMATES[k]) delete j.inm[k]; else j.inm[k] = clamp(num(j.inm[k], 0), 0, 100); }
    j.charges = typeof j.charges === 'string' ? j.charges : '';
    return j;
  }
  get left() { const j = this.j; return j ? Math.max(0, j.total - j.served) : 0; }
  enter() {
    const uw = this.uw, g = uw.g, p = g.player;
    const def = INTERIOR_DEFS.prison;
    g.player.applyOutfit(JAIL_LOOK);
    g.content.interiors.enter('prison', true);
    p.pos.set(def.ox + JAIL.bunk.x, IY, def.oz + JAIL.bunk.z); p.h = 0; g.cam.yaw = 0; g.cam.pitch = -0.2; g.cam.init = false;
    g.audio.play('clank');
    this.choreReset();
    uw.ui.showJail(true);
  }
  phone() { const j = this.j; return !!(j && j.phone) || this.callT > 0; }
  update(dt, rdt) {
    const uw = this.uw, S = this.S, g = uw.g, j = S.jail;
    if (!j) return;
    if (this.callT > 0) this.callT -= rdt;
    if (this.esc) this.updateEscape(dt);
    // the sentence clock: two real seconds a day while you're in the block (a menu or the map stops it).
    // The street moves a day for every week served.
    else if (dt > 0 && g.state === 'playing') {
      this.acc = (this.acc || 0) + dt * this.speed() / JAIL_SEC_PER_DAY;
      let n = 0;
      while (this.acc >= 1 && j.served < j.total && n < 5) {
        this.acc -= 1; j.served++; n++; S.st.jailDays++;
        j.susp = Math.max(0, j.susp - 1.5);
        j.streetAcc += 1 / JAIL_STREET_RATIO;
        // the street keeps its full calendar: every day here is a day of revenue, payroll, upkeep and turf out there
        while (j.streetAcc >= 1) { j.streetAcc -= 1; for (let q = 0; q < 4; q++) uw.tickHours(6, q * 6); uw.tickDay(); if (!S.jail) return; }
        this.choreTick();
      }
      if (j.served >= j.total) this.release();
    }
    this.choreFrame(rdt);
    this.restricted();
    // block ambience: distant doors, buzzers
    this.ambT -= rdt;
    if (this.ambT <= 0) { this.ambT = rand(3, 9); g.audio.play(Math.random() < 0.8 ? 'clank' : 'buzzer', { gain: rand(0.15, 0.4) }); }
    uw.ui.updateJail();
  }
  // the maintenance room is off limits by day: a guard sends you back, it goes on your record (once a day)
  restricted() {
    const j = this.j, g = this.uw.g, p = g.player, def = INTERIOR_DEFS.prison, R = JAIL.restricted; if (!j || this.esc) return;
    const lx = p.pos.x - def.ox, lz = p.pos.z - def.oz;
    if (lx < R.x0 || lx > R.x1 || lz < R.z0 || lz > R.z1) return;
    if (j.trespass === j.served) return;
    j.trespass = j.served; j.susp = clamp(j.susp + 10, 0, 100);
    this.misbehave(4, 'Out of bounds in maintenance');
    this.say('Guard', 'Maintenance is staff only. Out. Now.');
  }
  // time off for work: at most a tenth of the sentence, and never under the floor (half the original sentence)
  earnCredit(days) {
    const j = this.j; if (!j) return 0;
    const cap = Math.floor((j.total + j.credit) * 0.1), d = this.cutDays(Math.max(0, Math.min(days, cap - j.credit)));
    j.credit += d;
    return d;
  }
  // take days off the sentence (lawyers, paperwork, good time) without going under the floor or past today
  cutDays(d) { const j = this.j; if (!j) return 0; d = Math.max(0, Math.min(Math.floor(d), j.total - Math.max(j.floor || 1, j.served + 1))); j.total -= d; return d; }
  // ---- speed and good behaviour
  speed() { const j = this.j; return j && !this.esc ? (j.speed || 1) : 1; }
  maxSpeed() { const j = this.j; let x = 1; for (const sp of JAIL_SPEEDS) if (j && j.gbp >= sp.pts) x = sp.x; return x; }
  setSpeed(x) { const j = this.j; if (!j) return false; if (!JAIL_SPEEDS.some(sp => sp.x === x) || x > this.maxSpeed()) { const need = JAIL_SPEEDS.find(sp => sp.x === x); if (need) this.uw.g.ui.toast(`${x}× time needs ${need.pts} good-behaviour points. You have ${Math.floor(j.gbp)}. Do chores: clear the cafeteria, pick up litter, carry laundry.`, 'warn'); return false; } j.speed = x; this.uw.ui.updateJail(true); return true; }
  goodBehaviour(pts, why) {
    const j = this.j; if (!j) return; const before = this.maxSpeed();
    j.gbp = clamp(j.gbp + pts, 0, GBP_MAX); j.chores++;
    const after = this.maxSpeed();
    if (after > before) { this.uw.g.ui.banner('Good behaviour', `${after}× time unlocked`, 'pass', 2.2); this.uw.g.audio.play('pass'); }
    this.uw.g.ui.toast(`${why} +${pts} good behaviour (${Math.floor(j.gbp)})`, 'money');
    this.uw.ui.updateJail(true);
  }
  // misbehaviour costs points, and the speed drops to what the points still allow
  misbehave(pts, why) {
    const j = this.j; if (!j) return;
    j.gbp = clamp(j.gbp - pts, 0, GBP_MAX);
    const mx = this.maxSpeed(); if (j.speed > mx) { j.speed = mx; this.uw.g.ui.toast(`${why}: −${pts} good behaviour. Time is back to ${mx}×.`, 'warn'); }
    else this.uw.g.ui.toast(`${why}: −${pts} good behaviour.`, 'warn');
    this.uw.ui.updateJail(true);
  }
  release(how) {
    const uw = this.uw, S = this.S, g = uw.g;
    if (!S.jail) return;
    const served = S.jail.served;
    S.jail = null; this.esc = null; this.callT = 0; this.choreClear();
    uw.ui.showJail(false);
    g.fade(() => {
      g.content.interiors.exit(true);
      g.player.applyOutfit(g.save.outfit);
      const pl = g.world.places.police.door;
      g.resetPlayerState(pl.x + Math.sin(pl.h) * 2.5, pl.z + Math.cos(pl.h) * 2.5, pl.h);
      g.police.clear();
      S.pressure = clamp(S.pressure * 0.65, 0, 100);
      S.lastHour = Math.floor(g.env.time);
      g.ui.banner(how === 'bribe' ? 'Walked out' : 'Released', `Served ${fmtSentence(served)}`, how === 'bribe' ? 'pass' : 'info', 3.5);
      g.ui.toast(how === 'bribe' ? 'A side door, a nod, and you are on the street. Nobody saw anything.' : 'Released from County. Check your empire (Phone): the street kept running the whole time.');
      g.saveGame(true);
    }, true);
  }
  findAction() {
    const g = this.uw.g, p = g.player, def = INTERIOR_DEFS.prison;
    const hatch = def.spots.find(s => s.id === 'hatch');
    if (this.esc) {
      if (Math.hypot(p.pos.x - (def.ox + hatch.x), p.pos.z - (def.oz + hatch.z)) < 1.2) return { label: 'Unscrew the grate', act: () => this.escapeHatch() };
      return null;
    }
    const c = this.choreAction(); if (c) return c;
    // a spot on the catwalk is only reachable up there (and one under it only down here)
    const fy = def.fy !== undefined ? def.fy : IY, ly = p.pos.y - fy;
    for (const s of def.spots) if (Math.hypot(p.pos.x - (def.ox + s.x), p.pos.z - (def.oz + s.z)) < s.r && Math.abs(ly - (s.y || 0)) < 1.5) return { label: s.label, act: () => this.spot(s.id) };
    return null;
  }
  // ------------------------------------------------------------------ chores: small jobs in the block for good-behaviour points.
  // Trays turn up on the cafeteria tables, litter on the floor, laundry bags by the cells; you carry them to the
  // serving counter, the bin by the guard post or the laundry carts. Items are plain meshes that exist only
  // while you are inside; what is lying around is not saved (it is regenerated on load).
  choreSetup() {
    if (this.ch) return this.ch;
    const g = this.uw.g, def = INTERIOR_DEFS.prison, grp = new THREE.Group(); grp.name = 'prisonChores';
    grp.position.set(def.ox, def.fy !== undefined ? def.fy : IY, def.oz); g.scene.add(grp);
    const mat = c => new THREE.MeshLambertMaterial({ color: c });
    const geo = { tray: new THREE.BoxGeometry(0.42, 0.04, 0.3), trash: new THREE.BoxGeometry(0.16, 0.1, 0.13), bag: new THREE.BoxGeometry(0.5, 0.42, 0.42), dish: new THREE.CylinderGeometry(0.09, 0.07, 0.03, 8) };
    const mats = { tray: mat(0x8a8f96), trash: mat(0xd8d2c0), can: mat(0xc23a2a), bag: mat(0x5a7a9a), dish: mat(0xf4f2ee), hi: new THREE.MeshBasicMaterial({ color: 0xffd84d, transparent: true, opacity: 0.55 }) };
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 20), mats.hi); ring.rotation.x = -Math.PI / 2; ring.visible = false; grp.add(ring);
    const held = new THREE.Group(); held.visible = false; g.scene.add(held);
    this.ch = { grp, geo, mats, ring, held, items: [], carry: null, t: 0 };
    return this.ch;
  }
  choreClear() { const ch = this.ch; if (!ch) return; for (const it of ch.items) ch.grp.remove(it.mesh); ch.items = []; ch.carry = null; ch.held.clear(); ch.held.visible = false; ch.grp.visible = false; ch.ring.visible = false; }
  choreMesh(kind) {
    const ch = this.ch, m = new THREE.Group();
    if (kind === 'tray') { m.add(new THREE.Mesh(ch.geo.tray, ch.mats.tray)); const d = new THREE.Mesh(ch.geo.dish, ch.mats.dish); d.position.set(-0.08, 0.035, 0); m.add(d); const d2 = new THREE.Mesh(ch.geo.dish, ch.mats.dish); d2.position.set(0.1, 0.035, 0.04); d2.scale.setScalar(0.7); m.add(d2); }
    else if (kind === 'trash') { const a = new THREE.Mesh(ch.geo.trash, Math.random() < 0.5 ? ch.mats.trash : ch.mats.can); a.rotation.y = Math.random() * 3; a.rotation.z = Math.random() < 0.5 ? Math.PI / 2 : 0; m.add(a); }
    else { const b = new THREE.Mesh(ch.geo.bag, ch.mats.bag); b.position.y = 0.21; m.add(b); }
    return m;
  }
  // where things turn up (prison-local coordinates): tray spots on the three tables, floor spots for litter, bag spots by the cells
  static get CHORE_SPOTS() {
    return {
      tray: [[-15.5, 5, 0.8], [-11, 5.1, 0.8], [-14, 8.5, 0.8], [-10.5, 8.4, 0.8], [-16, 12, 0.8], [-12, 12.1, 0.8]],
      trash: [[-10, -7.6], [-5, -8.2], [2.6, -7.8], [9, -7.4], [-10.6, 0.6], [6.4, 0.8], [9.6, -1.6], [8.6, 5.4], [16, 6.2], [10.4, 14.2], [0.4, -1.6], [-11.6, -3.4]],
      bag: [[-10, -10.8], [-6, -10.8], [2, -10.8], [6, -10.8], [10, -10.8]]
    };
  }
  // drop-off points
  static get CHORE_DROPS() { return { tray: [-13, 14.5, 'Serving counter'], trash: [12.8, -6.8, 'Trash can'], bag: [-15.5, -4.4, 'Laundry carts'] }; }
  choreSpawn(kind) {
    const ch = this.choreSetup(), spots = Prison.CHORE_SPOTS[kind], used = new Set(ch.items.filter(i => i.kind === kind).map(i => i.si));
    const free = spots.map((s, i) => i).filter(i => !used.has(i)); if (!free.length) return false;
    const si = pick(free), sp = spots[si], mesh = this.choreMesh(kind);
    mesh.position.set(sp[0] + rand(-0.12, 0.12), kind === 'tray' ? sp[2] : 0.03, sp[1] + rand(-0.1, 0.1)); mesh.rotation.y = rand(-0.4, 0.4);
    ch.grp.add(mesh); ch.items.push({ kind, si, mesh });
    return true;
  }
  // a fresh block (entering, loading): some mess to start with
  choreReset() {
    const ch = this.choreSetup(); this.choreClear(); ch.grp.visible = true;
    for (let i = 0; i < 4; i++) this.choreSpawn('tray');
    for (let i = 0; i < 4; i++) this.choreSpawn('trash');
    this.choreSpawn('bag');
  }
  // each sentence day a little more mess turns up (meals three times a day, litter, laundry)
  choreTick() {
    if (!this.ch || !this.ch.grp.visible) return;
    if (Math.random() < 0.55) this.choreSpawn('tray');
    if (Math.random() < 0.35) this.choreSpawn('trash');
    if (Math.random() < 0.15) this.choreSpawn('bag');
  }
  choreFrame(rdt) {
    const ch = this.ch; if (!ch || !ch.grp.visible) return;
    const g = this.uw.g, p = g.player, def = INTERIOR_DEFS.prison;
    // what you are carrying rides in front of you
    if (ch.carry) { ch.held.visible = true; ch.held.position.set(p.pos.x + Math.sin(p.h) * 0.42, p.pos.y + (ch.carry.kind === 'bag' ? 0.7 : 1.02), p.pos.z + Math.cos(p.h) * 0.42); ch.held.rotation.y = p.h; }
    else ch.held.visible = false;
    // a faint ring under the nearest thing you can use
    const t = this.choreTarget();
    if (t) { ch.ring.visible = true; ch.ring.position.set(t.x - def.ox, 0.02, t.z - def.oz); ch.t += rdt; ch.ring.material.opacity = 0.35 + Math.sin(ch.t * 5) * 0.2; }
    else ch.ring.visible = false;
  }
  choreTarget() {
    const ch = this.ch; if (!ch || !ch.grp.visible || this.esc) return null;
    const p = this.uw.g.player, def = INTERIOR_DEFS.prison, lx = p.pos.x - def.ox, lz = p.pos.z - def.oz;
    // every chore is on the ground floor: nothing below reaches you up on the catwalk
    if (p.pos.y - (def.fy ?? IY) > 1.5) return null;
    if (ch.carry) { const D = Prison.CHORE_DROPS[ch.carry.kind]; if (Math.hypot(lx - D[0], lz - D[1]) < 1.5) return { drop: true, x: def.ox + D[0], z: def.oz + D[1], label: D[2] }; if (!(ch.carry.kind === 'trash' && ch.carry.n < 3)) return null; }
    // holding litter, more litter comes first (up to three); otherwise the nearest thing
    let best = null, bd = 1.2;
    const want = ch.carry && ch.carry.kind === 'trash' && ch.carry.n < 3 ? 'trash' : null;
    if (want) for (const it of ch.items) { if (it.kind !== want) continue; const d = Math.hypot(lx - it.mesh.position.x, lz - it.mesh.position.z); if (d < bd) { bd = d; best = it; } }
    if (!best) for (const it of ch.items) { const d = Math.hypot(lx - it.mesh.position.x, lz - it.mesh.position.z); if (d < bd) { bd = d; best = it; } }
    return best ? { item: best, x: def.ox + best.mesh.position.x, z: def.oz + best.mesh.position.z } : null;
  }
  choreAction() {
    const ch = this.ch, t = this.choreTarget(); if (!t) return null;
    const names = { tray: 'tray', trash: 'litter', bag: 'laundry bag' };
    if (t.drop) { const k = ch.carry.kind, n = ch.carry.n; return { label: k === 'tray' ? 'Return the tray at the serving counter' : k === 'trash' ? `Bin the litter (${n})` : 'Drop the laundry at the carts', act: () => this.choreDrop() }; }
    const it = t.item;
    if (ch.carry && (ch.carry.kind !== it.kind || it.kind !== 'trash' || ch.carry.n >= 3)) return { label: `Hands full: ${ch.carry.kind === 'trash' ? 'bin the litter first' : 'take the ' + names[ch.carry.kind] + ' to the ' + Prison.CHORE_DROPS[ch.carry.kind][2].toLowerCase()}`, act: () => this.uw.g.audio.play('deny') };
    return { label: it.kind === 'tray' ? 'Pick up the dirty tray' : it.kind === 'trash' ? 'Pick up the litter' : 'Pick up the laundry bag', act: () => this.choreTake(it) };
  }
  choreTake(it) {
    const ch = this.ch, i = ch.items.indexOf(it); if (i < 0) return;
    ch.items.splice(i, 1); ch.grp.remove(it.mesh);
    if (ch.carry && ch.carry.kind === 'trash' && it.kind === 'trash') ch.carry.n++;
    else ch.carry = { kind: it.kind, n: 1 };
    it.mesh.position.set(0, ch.held.children.length * 0.06, 0); it.mesh.rotation.set(0, 0, 0); ch.held.add(it.mesh);
    this.uw.g.audio.play('pickup', { gain: 0.5 });
    this.uw.ui.updateJail(true);
  }
  choreDrop() {
    const ch = this.ch, c = ch && ch.carry; if (!c) return;
    ch.carry = null; ch.held.clear();
    const pts = CHORE_PTS[c.kind] * c.n;
    this.j.standing = clamp(this.j.standing + 1, 0, 100);
    this.uw.g.audio.play('confirm', { gain: 0.6 });
    this.goodBehaviour(pts, c.kind === 'tray' ? 'Tray returned.' : c.kind === 'trash' ? `${c.n} piece${c.n > 1 ? 's' : ''} of litter binned.` : 'Laundry delivered.');
  }
  // ------------------------------------------------------------------ the block
  say(who, t) { this.uw.g.content.say(who, t, 3.5); }
  locked() { const j = this.j; return j && j.served < j.lockUntil ? j.lockUntil - j.served : 0; }
  spot(id) {
    const uw = this.uw, S = this.S, g = uw.g, j = S.jail;
    if (!j) return;
    const lock = this.locked();
    if (lock && !['bunk', 'tv'].includes(id)) { this.say('Guard', `Lockdown. You stay by your bunk for ${fmtSentence(lock)} more.`); g.audio.play('deny'); return; }
    if (id.startsWith('inmate:')) { this.openInmate(id.slice(7)); return; }
    switch (id) {
      case 'bunk': this.openLife(); break;
      case 'tv': uw.ui.open('feed'); break;
      case 'payphone': {
        if (j.phone) { this.say('pv', 'You have a phone in your sock. Use it.'); uw.ui.open('home'); break; }
        if (j.served - j.call < 30 && j.call > 0) { this.say('Guard', `One call a month. Next call in ${30 - (j.served - j.call)} days.`); break; }
        j.call = Math.max(1, j.served); this.callT = 75;
        this.say('pv', 'You get one call. Make it count: you have about a minute.');
        uw.ui.open('home');
        break;
      }
      case 'smokey': this.openSmokey(); break;
      case 'guard': this.openGuard(); break;
      case 'visit': this.openLawyer(); break;
      case 'work': this.openWork(); break;
      case 'cards': this.openCards(); break;
      case 'hatch': this.openHatch(); break;
      case 'infirmary': {
        if (j.served - j.lastSick < 1) { this.say('Nurse', 'You were here today. Go lie down.'); break; }
        j.lastSick = j.served; const p = g.player; p.health = p.maxHealth; j.standing = clamp(j.standing + 1, 0, 100);
        this.say('Nurse', pick(['Patched up. Try not to walk into anything.', 'Two aspirin and stay out of the gym fights.', 'You’re fine. Next.']));
        break;
      }
      case 'rota': {
        if (j.intel >= 2) { this.say('pv', 'You know the night rota by heart.'); break; }
        if (Math.max(0, 5 - (j.served - j.lastStudy)) > 0) { this.say('pv', 'Nothing new to see from up here yet.'); break; }
        g.content.channel('WATCHING THE GUARDS FROM THE CATWALK', 6, () => { j.intel = Math.min(2, j.intel + 1); j.lastStudy = j.served; j.susp = clamp(j.susp + 3, 0, 100); this.say('pv', j.intel >= 2 ? 'Midnight count, then twelve minutes of nothing on the west side. That’s the window.' : 'The night guard takes the laundry corridor at the half hour. Need another look.'); });
        break;
      }
      case 'weights': {
        g.content.channel('WORKING OUT', 5, () => {
          const p = g.player; p.health = Math.min(p.maxHealth, p.health + 25 * HP_SCALE); p.stamina = 1; j.workouts++;
          const fit = S.fit | 0;
          if (j.workouts % 6 === 0 && fit < 5) { S.fit = fit + 1; this.say('pv', `Stronger. (+${S.fit * 3}% health for good — conditioning ${S.fit}/5)`); }
          else this.say('pv', pick(['Twenty minutes on the bench.', 'Pull-ups till the arms give out.', 'Somebody spots you. Respect.']));
          j.standing = clamp(j.standing + 1, 0, 100);
        });
        break;
      }
    }
  }
  // an overview of the sentence and of what the block offers; opened from the bunk or the HUD
  openLife() {
    const uw = this.uw, g = uw.g, S = this.S, j = this.j; if (!j) return;
    const lock = this.locked();
    const row = (a, b) => `<span>${a}</span><span>${b}</span>`;
    const yes = (b, t) => b ? `<b style="color:var(--green)">✓ ${t}</b>` : `<span style="color:var(--dim)">✗ ${t}</span>`;
    const mx = this.maxSpeed(), nxt = JAIL_SPEEDS.find(sp => sp.pts > j.gbp);
    const render = () => `<div class="stats">${row('Sentence', '<b>' + fmtSentence(j.total) + '</b>')}${row('Served', fmtSentence(j.served))}${row('Remaining', '<b>' + fmtSentence(j.total - j.served) + '</b>')}${row('Good behaviour', `<b>${Math.floor(j.gbp)}</b> points · ${mx}× time unlocked${nxt ? ` · ${nxt.x}× at ${nxt.pts}` : ''}`)}${row('Good-time credit', fmtSentence(j.credit) + ' off (max ' + fmtSentence(Math.floor((j.total + j.credit) * 0.1)) + ')')}${row('Standing with the block', Math.round(j.standing) + ' / 100')}${row('Guard suspicion', `<span style="color:${j.susp > 60 ? 'var(--red)' : j.susp > 30 ? 'var(--amber)' : 'var(--green)'}">${Math.round(j.susp)} / 100</span>`)}${row('Street calendar', 'every day in here is a full day out there')}${row('Phone', j.phone ? '<b style="color:var(--green)">smuggled phone (this sentence)</b>' : 'none · payphone once a month')}</div>
      <h3>Time</h3><div class="btns">${JAIL_SPEEDS.map(sp => `<button class="sbtn${j.speed === sp.x ? ' gold' : ''}" data-act="spd:${sp.x}" ${sp.x > mx ? 'disabled' : ''}>${sp.x}×${sp.pts > j.gbp ? ' · ' + sp.pts + ' pts' : ''}</button>`).join('')}</div>
      <div class="hint" style="font-size:12px">Chores earn good-behaviour points: carry dirty trays from the cafeteria tables to the serving counter (+${CHORE_PTS.tray}), pick litter off the floor and bin it (+${CHORE_PTS.trash} each, up to three at a time), take laundry bags from the cells to the carts (+${CHORE_PTS.bag}). Work shifts add 2. Bribes that go wrong, contraband and escape attempts take points away.</div>
      ${lock ? `<div class="hint" style="color:var(--red)">Lockdown: ${fmtSentence(lock)} confined to your bunk.</div>` : ''}
      <h3>Charges</h3><div class="hint" style="font-size:12px">${esc(j.charges || '—')}</div>
      <h3>A way out</h3><div class="stats">${row('Guard rota', yes(j.intel >= 2, `known (${j.intel}/2)`))}${row('Tool for the grate', yes(j.tool, 'have one'))}${row('Cover', yes(j.ally, 'Wire (optional)'))}${row('Distraction', yes(j.cover, 'Big Lou (optional)'))}</div>
      <h3>The jail</h3><div class="hint" style="font-size:12px;line-height:1.5">
        <b>Cell block</b>: your bunk on the lower tier; the <b>catwalk</b> (stairs at the east end) looks down on the night guards' rounds. ·
        <b>Day room</b>: cards & dice, the TV, the payphone (one call a month), Smokey (contraband), the <b>guard window</b> (a phone or walking out, if the money is right and so is the guard). ·
        <b>Cafeteria</b>: trays to the serving counter. · <b>Laundry</b> (west): the work board and the carts. <b>Maintenance</b> behind it is staff only. ·
        <b>Visitation</b>: lawyers; the <b>infirmary</b> behind it patches you up. · <b>Gym</b>: conditioning that stays with you. ·
        <b>Inmates</b>: get to know Deacon, Tito, Big Lou and Wire; trusted, each does favours (protection, contraband, a distraction, guard routines).</div>
      <div class="btns">${j.phone ? '<button class="sbtn gold" data-act="empire">Phone (smuggled)</button>' : ''}<button class="sbtn" data-act="feed">News on the TV</button></div>`;
    g.content.openSvc('County Jail · Block C', 'Time only passes while you’re out of this screen.', render, a => {
      if (a.startsWith('spd:')) { if (this.setSpeed(+a.slice(4))) g.content.refreshSvc(); return; }
      if (a === 'empire' && this.phone()) { g.ui.back(); uw.ui.open('home'); }
      if (a === 'feed') { g.ui.back(); uw.ui.open('feed'); }
    });
  }
  // ---- lawyers: one hearing a month; each firm once per sentence; never a sure thing
  lawyerTiers() {
    const left = this.left, L2 = this.uw.props.perk('legal'), f = v => Math.round(v * (1 - L2) / 50) * 50;
    return [
      { id: 'pd', name: 'Public defender', fee: f(300), cut: [0.08, 0.15], base: 0.45, desc: 'Overworked, but he read your file. Probably.' },
      { id: 'firm', name: 'Castellan & Ward', fee: f(Math.max(2500, left * 60)), cut: [0.15, 0.25], base: 0.6, desc: 'A real criminal defence firm.' },
      { id: 'silk', name: 'Adrienne Voss, QC', fee: f(Math.max(15000, left * 240)), cut: [0.25, 0.4], base: 0.74, desc: 'Judges listen when she talks. She knows it.' }
    ];
  }
  caseOdds(base) {
    const S = this.S, j = this.j;
    let p = base - S.rap.priors * 0.03 - (/firearm|Shooting|officer/i.test(j.charges) ? 0.08 : 0) - (/Possession/.test(j.charges) ? 0.05 : 0) + this.uw.props.perk('legal') / 3;
    return clamp(p, 0.15, 0.9);
  }
  openLawyer() {
    const uw = this.uw, g = uw.g, j = this.j;
    const wait = Math.max(0, 30 - (j.served - j.lastLawyer));
    const render = () => `<div class="hint">Your case: ${esc(j.charges || '—')}</div><div class="hint">Remaining: <b>${fmtSentence(this.left)}</b> · ${Money.html('lawyer')}${wait ? ` · next hearing in ${fmtSentence(wait)}` : ''}</div>
      <div class="jobs">${this.lawyerTiers().map(t => { const used = j.lawyers.includes(t.id), odds = this.caseOdds(t.base); return `<div class="job"><div style="flex:1"><b>${t.name}</b><span>${t.desc} · cuts ${Math.round(t.cut[0] * 100)}–${Math.round(t.cut[1] * 100)}% off what’s left · about ${Math.round(odds * 100)}% chance with your case</span></div><button class="sbtn ${used ? '' : 'gold'}" data-act="hire:${t.id}" ${used || wait || this.left < 4 || !Money.can(t.fee, 'lawyer') ? 'disabled' : ''}>${used ? 'Used' : fmtMoney(t.fee)}</button></div>`; }).join('')}</div>
      <div class="hint">A lawyer is paid whether the appeal works or not. Each firm takes your case once per sentence. No appeal takes the sentence under ${fmtSentence(j.floor || 1)} (half of what you were given).</div>`;
    g.content.openSvc('Visitation booth', 'Lawyers', render, a => {
      const t = this.lawyerTiers().find(x => 'hire:' + x.id === a); if (!t) return;
      if (j.lawyers.includes(t.id) || this.left < 4 || !Money.can(t.fee, 'lawyer') || Math.max(0, 30 - (j.served - j.lastLawyer)) > 0) return;
      Money.pay(t.fee, 'lawyer'); j.lawyers.push(t.id); j.lastLawyer = j.served; if (t.id === 'firm' || t.id === 'silk') j.appealed = true;
      const ok = Math.random() < this.caseOdds(t.base);
      if (ok) { const left = this.left, cut = this.cutDays(Math.ceil(left * rand(t.cut[0], t.cut[1]))); g.audio.play('pass'); g.content.refreshSvc(`Appeal granted. ${fmtSentence(cut)} off. ${fmtSentence(this.left)} to go.`); g.ui.banner('Appeal granted', `−${fmtSentence(cut)}`, 'pass', 2.5); }
      else { g.audio.play('deny'); g.content.refreshSvc(pick(['The judge didn’t buy it. The fee stays paid.', 'Appeal denied on every count.', 'Your lawyer “did everything possible”. The sentence stands.'])); }
    });
  }
  // ---- the guard post: privileges, paperwork, a smuggled phone, walking out today, and studying the night rota.
  // Every bribe is a real roll: yes, a refusal (nothing lost but face) or a setup that costs time.
  bribeOdds(kind) {
    const uw = this.uw, j = this.j, friends = uw.cops.perk('okoro') || uw.cops.perk('vale');
    const base = kind === 'perk' ? 0.62 : kind === 'phone' ? 0.45 : 0.4;
    const ok = clamp(base + (friends ? (kind === 'phone' ? 0.12 : 0.25) : 0) - j.susp / 220, 0.1, 0.9);
    const back = clamp((kind === 'phone' ? 0.2 : 0.12) + j.susp / 300 - (friends ? 0.06 : 0), 0.05, 0.5);
    return { ok, back: Math.min(back, 1 - ok), refuse: Math.max(0, 1 - ok - back) };
  }
  // the going rate for walking out today: it grows with the time you have left
  releaseBase() { return Math.max(10000, Math.round(this.left * 1500 / 1000) * 1000); }
  // release odds for an offer: at the going rate 50% out / 30% refused / 20% backfire; doubling the offer adds
  // 13 points to walking out and takes 4 off the backfire (8× the rate: 89% / 3% / 8%); low offers mostly fail
  releaseOdds(offer) {
    const x = clamp(Math.log2(Math.max(1, offer) / this.releaseBase()), -3, 3), friends = this.uw.cops.perk('okoro') || this.uw.cops.perk('vale') ? 0.04 : 0;
    const ok = clamp(0.5 + 0.13 * x + friends, 0.08, 0.92), back = clamp(0.2 - 0.04 * x, 0.06, 0.34);
    return { ok, back: Math.min(back, 1 - ok), refuse: Math.max(0, 1 - ok - Math.min(back, 1 - ok)) };
  }
  // what a backfire on the release bribe adds: a quarter of what is left, at least a week, at most half a year
  releaseBackfireDays() { return clamp(Math.round(this.left * 0.25), 7, 180); }
  // ---- money in jail (§45.22). Everyday spending inside is the commissary account on the sentence. Outside Dirty
  // Cash reaches a guard only through a courier: someone from your crew still on the street carries it in. No crew
  // outside, no outside money. The courier draws from your stashes in payroll order (your pockets were seized).
  courier() {
    const act = this.uw.crew.active();
    return act.find(c => c.role === 'bodyguard') || act.find(c => c.role === 'lieutenant') || act[0] || null;
  }
  canOutside(n) { return !!this.courier() && Money.can(n, 'jailBribe'); }
  canCommissary(n) { const j = this.j; return !!j && (j.commissary || 0) >= n; }
  payCommissary(n) { const j = this.j; if (!this.canCommissary(n)) return false; j.commissary -= n; return true; }
  outsideHint() {
    const c = this.courier();
    return c ? `Outside money ${Money.html('jailBribe')} <small>(${esc(c.name.split(' ')[0])} brings it in)</small>` : 'Outside money: <b>no one on the street to bring it in</b> <small>(you need a crew member outside)</small>';
  }
  openGuard() {
    const uw = this.uw, g = uw.g, j = this.j;
    const paperFee = Math.max(2000, this.left * 45), phoneFee = 10000;
    if (!(this._offer >= 1000)) this._offer = this.releaseBase();
    const odds = o => `${Math.round(o.ok * 100)}% yes · ${Math.round(o.refuse * 100)}% no · <span style="color:var(--red)">${Math.round(o.back * 100)}% it goes wrong</span>`;
    const render = () => {
      const bwait = Math.max(0, 10 - (j.served - j.lastBribe)), swait = Math.max(0, 5 - (j.served - j.lastStudy)), rwait = Math.max(0, 7 - (j.served - j.lastRelease)), lock = this.locked();
      const o1 = this.bribeOdds('perk'), o2 = this.bribeOdds('paper'), o3 = this.bribeOdds('phone'), base = this.releaseBase(), ro = this.releaseOdds(this._offer);
      const mults = [0.5, 1, 2, 4, 8].map(m => Math.round(base * m / 1000) * 1000);
      return `<div class="hint">Suspicion <b style="color:${j.susp > 60 ? 'var(--red)' : 'var(--text)'}">${Math.round(j.susp)}</b> / 100 · Commissary <b class="money">${fmtMoney(j.commissary || 0)}</b> · ${this.outsideHint()} · ${fmtSentence(this.left)} left${bwait ? ` · no small favours for ${fmtSentence(bwait)}` : ''}</div>
      <div class="jobs">
      <div class="job"><div style="flex:1"><b>Slip him $500</b><span>From your commissary. Privileges: the payphone whenever you want it this month, and nobody looks in your bunk. ${odds(o1)}</span></div><button class="sbtn gold" data-act="perk" ${bwait || lock || !this.canCommissary(500) ? 'disabled' : ''}>$500</button></div>
      <div class="job"><div style="flex:1"><b>Lose some paperwork</b><span>15% of what’s left disappears from your file. ${odds(o2)}</span></div><button class="sbtn gold" data-act="paper" ${bwait || lock || j.bribed || this.left < 8 || !this.canOutside(paperFee) ? 'disabled' : ''}>${j.bribed ? 'Done' : fmtMoney(paperFee)}</button></div>
      <div class="job"><div style="flex:1"><b>Smuggle in a phone</b><span>Your empire, the map and your crew from the cell, until you’re out. It goes with the sentence. ${j.phone ? '<b style="color:var(--green)">You have one.</b>' : odds(o3) + ' (caught: more time, lockdown, −25 good behaviour; you lose the money)'}</span></div><button class="sbtn gold" data-act="phone" ${j.phone || bwait || lock || !this.canOutside(phoneFee) ? 'disabled' : ''}>${j.phone ? 'Have one' : fmtMoney(phoneFee)}</button></div>
      <div class="job"><div style="flex:1"><b>Watch the night rota</b><span>Stand around and learn when the night guard walks (${j.intel}/2 known). Raises suspicion a little.</span></div><button class="sbtn" data-act="study" ${swait || j.intel >= 2 ? 'disabled' : ''}>${j.intel >= 2 ? 'Known' : swait ? 'In ' + fmtSentence(swait) : 'Watch'}</button></div>
      </div>
      <h3>Walk out today</h3>
      <div class="hint">Make Officer Bright an offer to lose you on the next transfer. The going rate for ${fmtSentence(this.left)} is about <b>${fmtMoney(base)}</b>; more money buys better odds. A refusal costs nothing. If it goes wrong he takes half the offer as “evidence”, you keep the other half, and a judge adds ${fmtSentence(this.releaseBackfireDays())}.</div>
      <div class="btns">${mults.map(v => `<button class="sbtn${this._offer === v ? ' gold' : ''}" data-act="offer:${v}" ${!this.canOutside(v) ? 'disabled' : ''}>$${fmtShort(v)}</button>`).join('')}</div>
      <div class="wq wc" style="max-width:420px;margin:0 auto"><input id="wagerIn" class="wagerIn" type="text" inputmode="decimal" autocomplete="off" placeholder="Other amount, e.g. 750k" aria-label="Offer amount"><button class="sbtn gold" data-act="offer:custom">SET</button></div>
      <div class="stats"><span>Your offer</span><span><b class="money">${fmtMoney(this._offer)}</b></span><span>Walk out</span><span><b style="color:var(--green)">${Math.round(ro.ok * 100)}%</b></span><span>He says no (no cost)</span><span>${Math.round(ro.refuse * 100)}%</span><span>It goes wrong</span><span style="color:var(--red)">${Math.round(ro.back * 100)}% · −${fmtMoney(Math.ceil(this._offer / 2))}, +${fmtSentence(this.releaseBackfireDays())}</span></div>
      <div class="btns big"><button class="sbtn danger" data-act="release" ${rwait || lock || !this.canOutside(this._offer) || this._offer < 1000 ? 'disabled' : ''}>${rwait ? `Try again in ${fmtSentence(rwait)}` : lock ? 'Not during lockdown' : 'MAKE THE OFFER · ' + fmtMoney(this._offer)}</button></div>`;
    };
    g.content.openSvc('Guard post', 'Officer Bright, nights and weekends', render, a => {
      const [k, v] = a.split(':');
      if (k === 'offer') { if (v === 'custom') { const el = document.getElementById('wagerIn'), n = parseMoney(el && el.value); if (!(n >= 1000)) { g.content.refreshSvc('Offer at least $1,000. Type it like 250000, 250k or 1.5m.'); return; } this._offer = n; } else if (+v >= 1000) this._offer = +v; g.content.refreshSvc(); return; }
      if (a === 'release') { this.releaseBribe(this._offer); return; }
      if (a === 'study') {
        if (j.intel >= 2 || Math.max(0, 5 - (j.served - j.lastStudy)) > 0) return;
        g.ui.back();
        g.content.channel('WATCHING THE GUARD ROTA', 6, () => { j.intel = Math.min(2, j.intel + 1); j.lastStudy = j.served; j.susp = clamp(j.susp + 6, 0, 100); this.say('pv', j.intel >= 2 ? 'Midnight count, then twelve minutes of nothing on the west side. That’s the window.' : 'Count at ten, count at midnight. Need to see a night or two more.'); });
        return;
      }
      if (Math.max(0, 10 - (j.served - j.lastBribe)) > 0 || this.locked()) return;
      const kind = a === 'paper' ? 'paper' : a === 'phone' ? 'phone' : a === 'perk' ? 'perk' : null; if (!kind) return;
      // the $500 favour comes from your commissary; paperwork and a phone need outside money through a courier
      const fee = kind === 'paper' ? paperFee : kind === 'phone' ? phoneFee : 500;
      const can = kind === 'perk' ? this.canCommissary(fee) : this.canOutside(fee), pay = () => kind === 'perk' ? this.payCommissary(fee) : Money.pay(fee, 'jailBribe');
      if (!can || (kind === 'paper' && (j.bribed || this.left < 8)) || (kind === 'phone' && j.phone)) return;
      j.lastBribe = j.served; if (kind === 'phone') j.lastPhone = j.served;
      const o = this.bribeOdds(kind), r = Math.random();
      if (r < o.ok) {
        pay(); g.audio.play('cash');
        if (kind === 'paper') { const cut = this.cutDays(Math.ceil(this.left * 0.15)); j.bribed = true; g.content.refreshSvc(`Funny. Your file seems to be missing a page. −${fmtSentence(cut)}.`); }
        else if (kind === 'phone') { j.phone = true; g.audio.play('pickup'); g.content.refreshSvc('Next morning there is a phone in your laundry, charged. Keep it out of sight. It goes back in the bin the day you walk out.'); this.uw.ui.updateJail(true); }
        else { j.call = 0; this.callT = 0; j.susp = Math.max(0, j.susp - 15); g.content.refreshSvc('He pockets it. The payphone is yours whenever, and your bunk stays unsearched.'); }
      } else if (r < o.ok + o.refuse) { g.audio.play('deny'); j.susp = clamp(j.susp + 8, 0, 100); g.content.refreshSvc('He looks at the money, then at you. “Put that away.” Nothing lost but face.'); }
      else {
        pay(); g.audio.play('wanted');
        const add = kind === 'phone' ? Math.max(5, Math.round(this.left * 0.1)) : Math.max(10, Math.round(this.left * 0.1)); j.total += add; j.susp = clamp(j.susp + 35, 0, 100); j.lockUntil = j.served + (kind === 'phone' ? 3 : 5); j.standing = clamp(j.standing - 5, 0, 100);
        this.misbehave(kind === 'phone' ? 25 : 15, kind === 'phone' ? 'Caught with contraband' : 'Bribing an officer');
        g.content.refreshSvc(kind === 'phone' ? `A shakedown the same night. The phone is evidence, the money is gone: +${fmtSentence(add)} and lockdown.` : `It was a setup. Bribing an officer: +${fmtSentence(add)}, five days of lockdown, and the money’s evidence now.`);
        g.ui.banner('Bribe backfired', `+${fmtSentence(add)}`, 'fail', 2.5);
      }
    });
  }
  // the release bribe: one real roll. Out (pay the offer, walk), refused (keep everything) or backfire (half the
  // offer is gone, the other half stays with you, and the sentence grows)
  releaseBribe(offer, rnd = Math.random) {
    const uw = this.uw, g = uw.g, j = this.j; if (!j) return null;
    offer = Math.floor(offer);
    if (!(offer >= 1000) || !this.canOutside(offer) || this.locked() || Math.max(0, 7 - (j.served - j.lastRelease)) > 0) return null;
    j.lastRelease = j.served;
    const o = this.releaseOdds(offer), r = rnd();
    if (r < o.ok) {
      Money.pay(offer, 'jailBribe'); g.audio.play('cash');
      g.ui.back(); uw.news('pv', `${fmtMoney(offer)} well spent. Officer Bright “lost” you on a transfer.`);
      this.release('bribe');
      return 'release';
    }
    if (r < o.ok + o.refuse) { g.audio.play('deny'); j.susp = clamp(j.susp + 5, 0, 100); g.content.refreshSvc('“I didn’t hear that.” He walks off. Your money is still yours.'); return 'refuse'; }
    const half = Math.ceil(offer / 2), add = this.releaseBackfireDays();
    Money.pay(half, 'jailBribe'); g.audio.play('wanted');
    j.total += add; j.susp = clamp(j.susp + 30, 0, 100); j.lockUntil = j.served + 3; j.standing = clamp(j.standing - 5, 0, 100);
    this.misbehave(30, 'Attempted bribery');
    g.content.refreshSvc(`He took the money and called it in. ${fmtMoney(half)} is evidence now (you kept ${fmtMoney(offer - half)}): +${fmtSentence(add)} and three days of lockdown.`);
    g.ui.banner('Bribe backfired', `+${fmtSentence(add)}`, 'fail', 2.5);
    return 'backfire';
  }
  // ---- Smokey: the phone, a tool, smokes for standing
  openSmokey() {
    const uw = this.uw, g = uw.g, S = this.S, j = this.j;
    void S;
    const render = () => `<div class="hint">Commissary <b class="money">${fmtMoney(j.commissary || 0)}</b> · “Phones? Not since the shakedown. You want a phone, you talk to a guard, and you better pick the right one.”</div><div class="jobs">
      <div class="job"><div style="flex:1"><b>A screwdriver, filed down</b><span>Fits the screws on a maintenance grate. Don’t get caught with it.</span></div><button class="sbtn gold" data-act="tool" ${j.tool || !this.canCommissary(1500) ? 'disabled' : ''}>${j.tool ? 'Have one' : '$1,500'}</button></div>
      <div class="job"><div style="flex:1"><b>Cartons for the block</b><span>Hand out smokes: +10 standing with everyone.</span></div><button class="sbtn" data-act="smokes" ${!this.canCommissary(200) ? 'disabled' : ''}>$200</button></div></div>`;
    g.content.openSvc('Smokey', 'Contraband', render, a => {
      if (a === 'tool' && !j.tool && this.payCommissary(1500)) { j.tool = true; j.susp = clamp(j.susp + 5, 0, 100); g.audio.play('pickup'); g.content.refreshSvc('In your sock. Don’t sit funny.'); }
      if (a === 'smokes' && this.payCommissary(200)) { j.standing = clamp(j.standing + 10, 0, 100); g.audio.play('cash'); g.content.refreshSvc('Word gets around that you’re good people.'); }
    });
  }
  // ---- prison work: a shift is a few seconds of standing at the board; pays commissary money, earns
  // good time, raises standing; the laundry sometimes turns up something useful
  openWork() {
    const uw = this.uw, g = uw.g, j = this.j;
    const wait = Math.max(0, 2 - (j.served - j.lastJob));
    const render = () => `<div class="hint">One shift every couple of days. A shift pays commissary money, 2 good-behaviour points and now and then a day of good time (up to a tenth of the sentence).${wait ? ` Next shift in ${fmtSentence(wait)}.` : ''}</div><div class="jobs">
      <div class="job"><div style="flex:1"><b>Laundry</b><span>Hot, boring. Things get left in pockets.</span></div><button class="sbtn gold" data-act="laundry" ${wait ? 'disabled' : ''}>Work</button></div>
      <div class="job"><div style="flex:1"><b>Kitchen</b><span>Better pay; the cooks trade cigarettes.</span></div><button class="sbtn gold" data-act="kitchen" ${wait ? 'disabled' : ''}>Work</button></div>
      <div class="job"><div style="flex:1"><b>Cleaning</b><span>Mop the block. The guards notice who does.</span></div><button class="sbtn gold" data-act="clean" ${wait ? 'disabled' : ''}>Work</button></div></div>`;
    g.content.openSvc('Work board', 'Prison jobs', render, a => {
      if (!['laundry', 'kitchen', 'clean'].includes(a) || Math.max(0, 2 - (j.served - j.lastJob)) > 0) return;
      g.ui.back();
      g.content.channel(a === 'laundry' ? 'LAUNDRY SHIFT' : a === 'kitchen' ? 'KITCHEN SHIFT' : 'MOPPING THE BLOCK', 6, () => {
        j.lastJob = j.served;
        // wages go on your commissary account, not into street money (§24, §45.18)
        const pay = a === 'kitchen' ? randi(25, 45) : randi(15, 30); j.commissary = (j.commissary || 0) + pay; g.audio.play('cash');
        const off = Math.random() < (a === 'clean' ? 0.75 : 0.55) ? this.earnCredit(1) : 0;
        j.standing = clamp(j.standing + (a === 'kitchen' ? 3 : 2), 0, 100);
        if (a === 'clean') j.susp = Math.max(0, j.susp - 6);
        j.gbp = clamp(j.gbp + 2, 0, GBP_MAX);
        let extra = '';
        if (a === 'laundry' && !j.tool && Math.random() < 0.1) { j.tool = true; extra = ' Something hard in a pocket: a screwdriver, filed down. You keep it.'; }
        if (a === 'kitchen' && Math.random() < 0.3) { j.standing = clamp(j.standing + 4, 0, 100); extra = ' The cooks slip you a carton to share.'; }
        this.say('pv', `${fmtMoney(pay)} commissary${off ? ', one day off for good behaviour' : ''}.${extra}`);
      });
    });
  }
  // ---- cards & dice: two dice each against an inmate; the higher total wins, ties go to the house
  openCards() {
    const uw = this.uw, g = uw.g, j = this.j;
    this._dice = this._dice || null;
    const d = this._dice;
    const render = () => `<div class="hint">High dice: you and Shorty roll two each. Higher total wins even money; a tie is his. Commissary <b class="money">${fmtMoney(j.commissary || 0)}</b></div>
      ${d ? `<div class="card"><div class="t">You ${d.a.join(' + ')} = <b>${d.a[0] + d.a[1]}</b> · Shorty ${d.b.join(' + ')} = <b>${d.b[0] + d.b[1]}</b></div><div class="d" style="color:${d.win ? 'var(--green)' : 'var(--red)'}">${d.win ? 'You win ' + fmtMoney(d.bet) : 'You lose ' + fmtMoney(d.bet)}</div></div>` : ''}
      <div class="btns">${[20, 100, 500].map(b => `<button class="sbtn gold" data-act="bet:${b}" ${(j.commissary || 0) < b ? 'disabled' : ''}>Bet ${fmtMoney(b)}</button>`).join('')}</div>`;
    g.content.openSvc('Cards & dice', 'The middle table', render, a => {
      const bet = +a.split(':')[1]; if (!(bet > 0) || (j.commissary || 0) < bet) return;
      const r6 = () => 1 + Math.floor(Math.random() * 6), A = [r6(), r6()], B = [r6(), r6()], win = A[0] + A[1] > B[0] + B[1];
      j.commissary = (j.commissary || 0) + (win ? bet : -bet); // jail gambling is on the commissary account (§45.18)
      this._dice = { a: A, b: B, win, bet }; j.standing = clamp(j.standing + 1, 0, 100);
      g.audio.play(win ? 'cash' : 'ui');
      g.content._svcRender = () => { const dd = this._dice; return render.call(null).replace(/^/, '') && `<div class="hint">High dice: you and Shorty roll two each. Higher total wins even money; a tie is his. Commissary <b class="money">${fmtMoney(j.commissary || 0)}</b></div><div class="card"><div class="t">You ${dd.a.join(' + ')} = <b>${dd.a[0] + dd.a[1]}</b> · Shorty ${dd.b.join(' + ')} = <b>${dd.b[0] + dd.b[1]}</b></div><div class="d" style="color:${dd.win ? 'var(--green)' : 'var(--red)'}">${dd.win ? 'You win ' + fmtMoney(dd.bet) : 'You lose ' + fmtMoney(dd.bet)}</div></div><div class="btns">${[20, 100, 500].map(b => `<button class="sbtn gold" data-act="bet:${b}" ${(j.commissary || 0) < b ? 'disabled' : ''}>Bet ${fmtMoney(b)}</button>`).join('')}</div>`; };
      g.content.refreshSvc();
    });
  }
  // ---- inmates: chat, favours; once they trust you (40+), each can do one thing for you per sentence
  openInmate(id) {
    const uw = this.uw, g = uw.g, j = this.j, I = INMATES[id]; if (!I) return;
    const rel = () => j.inm[id] | 0;
    const render = () => {
      const r = rel(), given = j.gifts.includes(id);
      return `<div class="card"><div class="t">${esc(I.name)}</div><div class="d">${esc(I.blurb)}</div><div class="stat"><span>Trust</span><span>${r} / 100</span></div><div class="bar"><i style="width:${r}%"></i></div></div>
      <div class="btns"><button class="sbtn" data-act="chat">Talk</button><button class="sbtn gold" data-act="favour">Do him a favour</button><button class="sbtn gold" data-act="gift" ${r < 40 || given ? 'disabled' : ''}>${given ? 'Done' : esc(I.giftText)}${r < 40 && !given ? ' (trust 40)' : ''}</button></div>`;
    };
    const base = render, F = INMATE_FAVORS[id];
    const render2 = () => { const r = rel(), cd = this.favorWait(id); return base() + (F ? `<div class="jobs"><div class="job"><div style="flex:1"><b>${esc(F.text)}</b><span>Needs trust 60 · ${fmtMoney(F.fee)} commissary${cd ? ` · again in ${fmtSentence(cd)}` : ''}</span></div><button class="sbtn gold" data-act="ask" ${r < 60 || cd || !this.canCommissary(F.fee) ? 'disabled' : ''}>Ask</button></div></div>` : ''); };
    g.content.openSvc(I.name, 'County Jail', render2, a => {
      if (a === 'chat') {
        j.inm[id] = clamp(rel() + (j.standing > 40 ? 4 : 2), 0, 100);
        const rumour = Math.random() < 0.35 ? this.rumour() : null;
        g.content.refreshSvc(rumour || pick(['He talks about his kids. You listen.', '“Food’s worse than last year. Hard to believe.”', 'He nods at you. It’s something.']));
      }
      if (a === 'favour') {
        g.ui.back();
        g.content.channel('RUNNING AN ERRAND ON THE BLOCK', 4, () => { j.inm[id] = clamp(rel() + 12, 0, 100); j.standing = clamp(j.standing + 2, 0, 100); if (Math.random() < 0.2) { j.susp = clamp(j.susp + 6, 0, 100); this.say('Guard', 'What are you carrying there? …Fine. Move along.'); } else this.say(I.name.split(' ')[0], 'Appreciate it.'); });
        return;
      }
      if (a === 'gift' && rel() >= 40 && !j.gifts.includes(id)) { j.gifts.push(id); g.content.refreshSvc(this.gift(id)); g.audio.play('pass'); }
      if (a === 'ask') { const r = this.favor(id); g.content.refreshSvc(r); }
    });
  }
  favorWait(id) { const j = this.j, F = INMATE_FAVORS[id], last = (j.fav || {})[id]; return F && last !== undefined ? Math.max(0, F.cd - (j.served - last)) : 0; }
  favor(id, rnd = Math.random) {
    const j = this.j, F = INMATE_FAVORS[id], g = this.uw.g; if (!j || !F) return '';
    if ((j.inm[id] | 0) < 60 || this.favorWait(id) || !this.payCommissary(F.fee)) return 'Not now.';
    (j.fav || (j.fav = {}))[id] = j.served;
    g.audio.play('cash');
    if (F.id === 'protect') { j.susp = Math.max(0, j.susp - 20); j.standing = clamp(j.standing + 5, 0, 100); return 'Deacon nods to a few people. Nobody bothers you, and the guards find someone else to watch (−20 suspicion).'; }
    if (F.id === 'cover') { j.cover = true; return 'Big Lou cracks his knuckles. “The night you go, I start a fight in the gym. Loud.” (a distraction for your escape)'; }
    if (F.id === 'intel') { if (j.intel < 2) { j.intel++; return `Wire draws the night rota on a napkin (${j.intel}/2 known).`; } j.tool = true; return 'Wire palms you a filed-down screwdriver. It fits a maintenance grate.'; }
    if (F.id === 'phone') {
      if (j.phone) return 'You already have one.';
      if (rnd() < 0.75) { j.phone = true; this.uw.ui.updateJail(true); return 'Tito’s cousin works the kitchen delivery. A phone turns up in a bread crate, charged. Keep it hidden.'; }
      const add = Math.max(5, Math.round(this.left * 0.05)); j.total += add; j.susp = clamp(j.susp + 25, 0, 100); this.misbehave(20, 'Caught with contraband');
      return `A shakedown finds the phone before you do: +${fmtSentence(add)}.`;
    }
    return '';
  }
  rumour() {
    const uw = this.uw, S = this.S;
    const facs = FAC_IDS.filter(f => !S.factions[f].broken);
    const f = pick(facs), F2 = FACTIONS[f];
    return pick([`“${F2.short} are short on product this week. Prices will jump.”`, `“Heard ${F2.short} are moving a shipment through the docks soon.”`, `“Somebody in ${F2.short} is talking to the cops. Watch who you trust.”`, `“The task force is looking at the Strip. Don’t deal there for a while.”`]);
  }
  gift(id) {
    const uw = this.uw, g = uw.g, S = this.S, j = this.j;
    if (id === 'inmate1') { const facs = FAC_IDS.filter(f => !S.factions[f].broken); const f = facs.sort((a, b) => S.factions[a].rel - S.factions[b].rel)[0]; if (f) { S.factions[f].rel = clamp(S.factions[f].rel + 15, -100, 100); return `Deacon makes a call. The ${FACTIONS[f].short} think a little better of you (+15).`; } return 'Deacon shrugs: nobody left worth calling.'; }
    if (id === 'inmate2') { const k = SPOTS.find(s => s.rep && g.save.rep < s.rep && !(S.flags.intro && S.flags.intro[s.id])); if (k) { (S.flags.intro || (S.flags.intro = {}))[k.id] = true; uw.news('unknown', `Tito’s cousin: “${k.name} will deal with you now. Tell them Tito sent you.”`); return `Tito gives you a name: ${k.name} (${k.role}). They’ll sell to you without the reputation.`; } return 'Tito: “You already know everybody I know.”'; }
    if (id === 'inmate3') { const c = uw.crew.genCandidate(); c.name = 'Lou Brannigan'; c.nick = 'Big Lou'; c.skill = Math.max(c.skill, 55); c.loyalty = Math.max(c.loyalty, 78); c.fee = Math.round(c.fee * 0.5 / 10) * 10; S.cand.unshift(c); S.candDay = S.day; return 'Big Lou is in. He’ll be on your recruit list (half his usual fee) when you’re both out.'; }
    if (id === 'inmate4') { j.ally = true; j.intel = Math.max(j.intel, 2); return 'Wire leans in: “Midnight count, then the night guard walks the cells and sits down by the door. I’ll make some noise at the far end when you go.” (Guard rota known; Wire will cover you.)'; }
    return '';
  }
  // ---- escapes (M8, §24). Never guaranteed, and the jail adapts: every escape you have made (legal.L.escapes) makes
  // the next a little harder. Two ways out:
  // - the grate: a tool is a must; at lights-out reach it unseen from your bunk (one night guard, two if you don't know
  //   the rota or the jail has tightened up), unscrew it, then the storm drains (a roll: drainOdds). Out on foot, 3★.
  // - the laundry truck (crew-assisted): your people outside arrange it (Dirty Cash through a courier, Crew Leader and
  //   up); one roll (truckOdds), out with a getaway car waiting, 1★. Preparation (rota, cover, a distraction, a tool)
  //   counts for both.
  escapes() { return this.uw.legal ? this.uw.legal.L.escapes : 0; }
  drainOdds() { const j = this.j; return clamp(0.55 + j.intel * 0.12 + (j.ally ? 0.1 : 0) + (j.cover ? 0.08 : 0) - this.escapes() * 0.05 - j.susp / 400, 0.3, 0.9); }
  truckCrew() { const c = this.courier(); return c && this.uw.rank >= 3 ? c : null; }
  truckPrice() { return Math.max(15000, Math.round(this.left * 400 / 1000) * 1000); }
  truckOdds() {
    const j = this.j, c = this.truckCrew(); if (!c) return 0;
    return clamp(0.5 + j.intel * 0.08 + (j.tool ? 0.05 : 0) + (j.ally ? 0.07 : 0) + (j.cover ? 0.06 : 0) + (c.skill || 0) / 400 + this.uw.rank * 0.03 - this.escapes() * 0.05 - j.susp / 300, 0.2, 0.85);
  }
  openHatch() {
    const uw = this.uw, g = uw.g, j = this.j;
    const yes = (b, t) => b ? `<b style="color:var(--green)">✓ ${t}</b>` : `✗ ${t}`;
    const render = () => {
      const crew = this.truckCrew(), price = this.truckPrice();
      return `<div class="hint">The grate behind the laundry opens on a crawlspace to the storm drains. Or your people outside can get you onto the laundry truck.</div><div class="stats">
      <span>A tool for the screws</span><span>${yes(j.tool, j.tool ? 'in your sock' : 'Smokey sells one; Wire or the laundry may turn one up')}</span>
      <span>The night rota</span><span>${yes(j.intel >= 2, `${j.intel}/2 known (the catwalk, the guard window or Wire)`)}</span>
      <span>Cover</span><span>${yes(j.ally, 'Wire makes noise at the far end')}</span>
      <span>A distraction</span><span>${yes(j.cover, 'Big Lou starts a fight')}</span>
      <span>Escapes so far</span><span>${this.escapes()} ${this.escapes() ? '(the jail has tightened up)' : ''}</span></div>
      <h3>Through the grate</h3><div class="hint">At lights-out, from your bunk to the grate without the night guard${j.intel >= 2 && this.escapes() < 2 ? '' : 's'} seeing you, then the drains: about <b>${Math.round(this.drainOdds() * 100)}%</b> you come out clear once you are through. Caught: more time, lockdown, the tool gone. Out: a fugitive, 3★.</div>
      <div class="btns"><button class="sbtn gold" data-act="go" ${j.tool ? '' : 'disabled'}>Wait for lights-out</button></div>
      <h3>The laundry truck</h3><div class="hint">${crew ? `${esc(crew.name)} can set it up: ${fmtMoney(price)} in Dirty Cash for the driver and the gate. About <b>${Math.round(this.truckOdds() * 100)}%</b>. Out with a car waiting (1★). Caught: more time, and ${esc(crew.name.split(' ')[0])} may be picked up.` : 'Needs someone in your crew still on the street, and enough standing to organise it (Crew Leader).'}</div>
      <div class="btns"><button class="sbtn" data-act="truck" ${crew && this.canOutside(price) && !this.locked() ? '' : 'disabled'}>${crew ? 'Set it up · ' + fmtMoney(price) : 'Not possible'}</button></div>`;
    };
    g.content.openSvc('A way out', 'Never a sure thing', render, a => {
      if (a === 'go' && j.tool) { g.ui.back(); this.startEscape(); }
      if (a === 'truck') { g.ui.back(); this.truckEscape(); }
    });
  }
  startEscape() {
    const uw = this.uw, g = uw.g, j = this.j, I = g.content.interiors, def = INTERIOR_DEFS.prison, p = g.player;
    j.escapes++;
    const routes = def.guards.slice(); if (j.intel < 2 || this.escapes() >= 2) routes.push(def.guards2);
    const slow = (j.ally ? 1.6 : 1) * (j.cover ? 1.25 : 1) / (1 + this.escapes() * 0.1);
    g.fade(() => {
      p.pos.set(def.ox + JAIL.bunk.x, IY, def.oz + JAIL.bunk.z); p.h = 0; g.cam.yaw = 0; g.cam.init = false;
      this.esc = { t: 70, caught: false };
      I.guards = routes.map((route, i) => ({ route, i: 1, x: def.ox + route[0][0], z: def.oz + route[0][1], h: 0, alert: 0, look: copLook(), pose: { phase: i * 2, amp: 0 }, flash: 0, y: IY, wait: 0, slow }));
      I.alarm = false;
      I.onAlarm = () => this.escapeCaught();
      for (const c of def.chars) c.hidden = true;
      g.ui.banner('Lights out', j.cover ? 'Big Lou starts shouting in the gym' : j.ally ? 'Wire starts banging on his bars at the far end' : 'Reach the grate behind the laundry', 'info', 2.5);
      g.audio.play('buzzer', { gain: 0.6 });
    });
  }
  updateEscape(dt) {
    const e = this.esc;
    if (!e || e.done) return;
    if (dt > 0) e.t -= dt;
    if (e.t <= 0 && !e.done) { this.escapeCaught('Morning count. You’re out of your bunk and the grate is still shut.'); }
  }
  escapeHatch() {
    const g = this.uw.g, e = this.esc; if (!e || e.done) return;
    g.content.channel('UNSCREWING THE GRATE', 4, () => { if (this.esc && !this.esc.done) this.drains(); });
  }
  // through the grate: the storm drains are the last roll
  drains(rnd = Math.random) {
    if (rnd() < this.drainOdds()) { this.escapeOut('drain'); return true; }
    this.escapeCaught('A patrol was waiting where the drain comes out. Back you go.');
    return false;
  }
  // the laundry truck: one roll, prepared or not
  truckEscape(rnd = Math.random) {
    const uw = this.uw, g = uw.g, j = this.j, crew = this.truckCrew(), price = this.truckPrice(); if (!j || !crew || !this.canOutside(price) || this.locked()) return null;
    const p = this.truckOdds();
    Money.pay(price, 'jailBribe'); j.escapes++;
    this.esc = { t: 1, caught: false };
    if (rnd() < p) { this.escapeOut('truck'); return 'out'; }
    if (rnd() < 0.4) uw.crew.arrest(crew, 'a jailbreak that went wrong');
    this.escapeCaught('The truck gets searched at the gate. You’re pulled out of a laundry bin.');
    return 'caught';
  }
  endEscape() {
    const g = this.uw.g, I = g.content.interiors;
    I.guards = []; I.onAlarm = null; I.alarm = false;
    for (const c of INTERIOR_DEFS.prison.chars || []) c.hidden = false;
    if (g.content.chan) g.content.cancelChannel(null);
    this.esc = null;
  }
  escapeCaught(why) {
    const uw = this.uw, g = uw.g, j = this.j; if (!this.esc || this.esc.done) return;
    this.esc.done = true;
    g.audio.play('wanted');
    g.fade(() => {
      this.endEscape();
      if (!this.j) return;
      const add = Math.max(30, Math.round(this.left * 0.3));
      j.total += add; j.tool = false; j.intel = 0; j.cover = false; j.susp = 100; j.lockUntil = j.served + 10; j.standing = clamp(j.standing + 5, 0, 100);
      this.misbehave(GBP_MAX, 'Escape attempt'); j.speed = 1;
      const def = INTERIOR_DEFS.prison, p = g.player; p.pos.set(def.ox + JAIL.bunk.x, IY, def.oz + JAIL.bunk.z); p.h = 0; g.cam.init = false;
      g.ui.banner('Caught', `Attempted escape: +${fmtSentence(add)}`, 'fail', 3);
      this.say('Guard', why || 'Got you. Back in your box. You’ll be here a while longer now.');
      g.saveGame(true);
    });
  }
  escapeOut(route) {
    const uw = this.uw, g = uw.g, S = this.S, j = this.j; if (!j || !this.esc) return;
    this.esc.done = true;
    const left = this.left, truck = route === 'truck';
    g.fade(() => {
      this.endEscape();
      S.jail = null; this.callT = 0; this.choreClear(); uw.ui.showJail(false);
      S.fugitive = { left, day: S.day }; uw.legal.L.escapes++;
      g.content.interiors.exit(true);
      g.player.applyOutfit(g.save.outfit);
      // the storm drain comes out by the harbour wall; the laundry truck drops you a few blocks further on
      const pl = g.world.places.police.door, ang = Math.atan2(pl.x - CITY / 2, pl.z - CITY / 2), far = truck ? 260 : 140;
      const x = clamp(pl.x + Math.sin(ang) * far, 20, CITY - 20), z = clamp(pl.z + Math.cos(ang) * far, 20, CITY - 20);
      g.resetPlayerState(x, z, ang);
      S.lastHour = Math.floor(g.env.time);
      // nobody sees the truck route come out (a search at one star); the drain comes up in front of a patrol
      g.police.setLevel(truck ? 1 : 3); if (!truck) g.police.crime('escape', x, z);
      S.pressure = clamp(S.pressure + (truck ? 8 : 15), 0, 100);
      g.ui.banner('Escaped', truck ? 'The truck stops in an alley. A car is waiting.' : 'Every cop in Port Valen has your picture', 'fail', 3.5);
      uw.news('radio', `All units: inmate escaped from County. Considered dangerous. ${fmtSentence(left)} left on the sentence.`);
      g.saveGame(true);
    });
  }
}
