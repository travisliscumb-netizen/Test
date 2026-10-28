/* =====================================================================
   [UNDERWORLD] MARKET: supply and demand per district and good. Prices move
   with police seizures, gang wars, faction losses, large player sales, time
   of day and random events, and drift back toward normal over time.
   ===================================================================== */
const POCKET_CAP = 12;
// ---- cargo (v7): a vehicle carries product by weight. Every model has its own capacity in pounds, set by its
// body: a sports car trades the boot for speed, a box truck out-hauls a pickup five times over. Police cruisers
// carry nothing (the cage and the radio rack fill the boot). Pockets and property stashes keep their space units.
const CARGO_LB = {
  supercar: 50, valkyr: 50, tempest: 60, obsidian: 70, sports: 80, coupe: 100, metro: 110, monarch: 120, apex: 140,
  compact: 150, gangcar: 180, revenant: 180, hellion: 190, muscle: 200, classic: 220, taxi: 230, sedan: 250, unmarked: 250,
  regent: 260, luxury: 300, crest: 380, estate: 400, offroad: 450, kodiak: 450, suv: 500, pickup: 1000, utility: 1250,
  courier: 1500, van: 2000, truck: 5000, police: 0
};
// cargo weight of one lot of each good, in hundredths of a pound (integers, so totals never drift): a hot-goods
// item or a carton of smokes about a pound, a hardware unit (cased) five; Green, Pharma and Snow weigh what they are
const GOOD_CLB = { hot: 100, smokes: 100, green: 50, pills: 25, snow: 10, hardware: 500 };
// weight of a container's goods in hundredths of a pound, and a vehicle model's capacity in the same unit
function cargoC(o) { let c = 0; if (o) for (const k in o) if (GOOD_CLB[k]) c += (o[k] | 0) * GOOD_CLB[k]; return c; }
for (const u of UNIQUE_CARS) CARGO_LB[u.type] = u.cargo;
function cargoCapC(type) { return (CARGO_LB[type] || 0) * 100; }
// how many lots of good k still fit in a vehicle of this type holding o
function cargoFit(type, o, k) { return GOOD_CLB[k] ? Math.max(0, Math.floor((cargoCapC(type) - cargoC(o)) / GOOD_CLB[k])) : 0; }
// "312 lb", "12.5 lb", "0.25 lb", "1,250 lb" from hundredths of a pound
function fmtLb(c) { c = Math.max(0, Math.round(c)); const lb = c / 100; return (c % 100 === 0 ? Math.round(lb).toLocaleString('en-US') : c % 10 === 0 ? lb.toFixed(1) : lb.toFixed(2)) + ' lb'; }
const ZONE_WEALTH = { c: 2.2, m: 1.3, o: 0.9, l: 1.5, s: 0.8, h: 0.9, g: 1.0, p: 1.4, w: 0.8, u: 2.6, a: 1.1, r: 0.7 };
// ---- street theft (v6): who you rob matters. A pedestrian's type is drawn from how wealthy the district is, and
// what they carry follows a strongly skewed curve: mostly small, sometimes good, now and then big, very rarely a
// fortune (a payroll courier, a high roller between casinos). Valuables come with a name but feed the same
// hot-goods market underneath.
const PED_TYPES = [
  // w: weight in poor / ordinary / rich districts; cash [lo, hi] (skewed toward lo); hot: chance and count; jp: jackpot odds
  { id: 'local', label: 'a local', w: [70, 52, 22], cash: [4, 70], hot: 0.14, hotN: [1, 1], items: ['an old phone', 'a cheap watch', 'a wallet'] },
  { id: 'worker', label: 'an office worker', w: [20, 30, 26], cash: [25, 260], hot: 0.25, hotN: [1, 1], items: ['a phone', 'a smartwatch', 'a leather wallet'] },
  { id: 'tourist', label: 'a tourist', w: [6, 9, 14], cash: [60, 900], hot: 0.42, hotN: [1, 2], items: ['a camera', 'a phone', 'a passport wallet'] },
  { id: 'exec', label: 'an executive', w: [1, 5, 17], cash: [300, 3500], hot: 0.55, hotN: [1, 3], items: ['a gold watch', 'a new phone', 'cufflinks'], jp: 0.012 },
  { id: 'owner', label: 'a business owner', w: [2, 3, 9], cash: [400, 5000], hot: 0.38, hotN: [1, 2], items: ['a gold chain', 'a phone', 'a money clip'], jp: 0.01 },
  { id: 'highroller', label: 'a wealthy tourist', w: [0, 1, 7], cash: [1200, 6500], hot: 0.65, hotN: [2, 4], items: ['a diamond bracelet', 'a designer handbag', 'a platinum watch'], jp: 0.025 },
  { id: 'courier', label: 'a payroll courier', w: [1, 1, 3], cash: [1500, 6800], hot: 0, hotN: [0, 0], items: [], jp: 0.06 }
];
// the big scores: a jackpot roll picks one of these (the richer the district, the higher it reaches)
const PED_JACKPOTS = [[10000, 0.78], [40000, 0.18], [100000, 0.04]];
function pedType(q, zk) {
  const wl = ZONE_WEALTH[zk] || 1, band = wl >= 1.9 ? 2 : wl >= 1.2 ? 1 : 0;
  const r = hash2i(q.id | 0, 7, 77) * PED_TYPES.reduce((a, t) => a + t.w[band], 0);
  let acc = 0; for (const t of PED_TYPES) { acc += t.w[band]; if (r < acc) return { t, band, wl }; }
  return { t: PED_TYPES[0], band, wl };
}
// the time of day (M10): office districts carry more in office hours, the Strip and the Heights by night, and the
// small hours carry little anywhere (null: no time, the old rates)
function pocketTimeK(zk, hour) {
  if (hour == null) return 1;
  const h = ((Math.floor(hour) % 24) + 24) % 24, night = h >= 20 || h < 3, office = h >= 9 && h < 18;
  if (h >= 3 && h < 6) return 0.6;
  if (zk === 'p' || zk === 'u') return night ? 1.35 : 0.9;
  if (zk === 'c' || zk === 'm') return office ? 1.2 : night ? 0.8 : 1;
  return night ? 0.9 : 1;
}
// what lifting a pocket gets you: { cash, hot, item, jackpot }
function pocketLoot(q, zk, rnd = Math.random, hour = null) {
  const { t, band, wl } = pedType(q, zk);
  const [lo, hi] = t.cash, u = Math.pow(rnd(), 2.4);
  let cash = Math.round(lo * Math.pow(hi / lo, u) * (0.75 + wl * 0.25) * pocketTimeK(zk, hour));
  let jackpot = 0;
  if (t.jp && rnd() < t.jp * [0.25, 0.6, 1][band]) {
    let r = rnd(), pickV = PED_JACKPOTS[0][0];
    const reach = band === 2 ? 3 : band === 1 ? 2 : 1;
    let tot = 0; for (let i = 0; i < reach; i++) tot += PED_JACKPOTS[i][1];
    r *= tot; for (let i = 0; i < reach; i++) { r -= PED_JACKPOTS[i][1]; if (r <= 0) { pickV = PED_JACKPOTS[i][0]; break; } }
    jackpot = Math.round(pickV * (0.8 + rnd() * 0.4)); cash = Math.max(cash, jackpot);
  }
  let hot = 0, item = '';
  if (t.hot && rnd() < t.hot * (0.7 + band * 0.2)) { hot = t.hotN[0] + Math.floor(rnd() * (t.hotN[1] - t.hotN[0] + 1)) + (band === 2 && rnd() < 0.3 ? 1 : 0); item = t.items[Math.floor(rnd() * t.items.length)]; }
  return { cash, hot, item, jackpot, type: t.id, label: t.label };
}
function units(o) { let n = 0; if (o) for (const k in o) if (GOODS[k]) n += (o[k] | 0) * GOODS[k].size; return n; }
function addGoods(dst, src) { for (const k in src) if (GOODS[k] && src[k] > 0) dst[k] = (dst[k] | 0) + (src[k] | 0); }
function goodsList(o) { return GOOD_IDS.filter(k => o && o[k] > 0).map(k => `${fmtQty(k, o[k])} ${GOODS[k].name}`).join(', ') || 'nothing'; }
class Market {
  constructor(uw) { this.uw = uw; }
  get M() { return this.uw.S.market; }
  static fresh() {
    const m = {};
    for (const z in DEMAND) { m[z] = {}; for (const k of GOOD_IDS) m[z][k] = [1 + (Math.random() - 0.5) * 0.2, 1 + (Math.random() - 0.5) * 0.2]; }
    return m;
  }
  demand(zone, good) {
    const g = this.uw.g, night = g.env ? g.env.night : 0;
    const party = good === 'snow' || good === 'pills' ? 1 + ((NIGHT_DEMAND[zone] || 1) - 1) * night : 1;
    return DEMAND[zone][good] * party * this.M[zone][good][1];
  }
  // street price for one unit right now
  price(zone, good) {
    const m = this.M[zone] && this.M[zone][good]; if (!m) return GOODS[good].base;
    const ratio = this.demand(zone, good) / Math.max(0.2, m[0]);
    return Math.max(5, Math.round(GOODS[good].base * clamp(Math.pow(ratio, 0.75), 0.35, 3.4)));
  }
  // wholesale from a supplier: cheaper, but scarcity hits it hardest
  wholesale(zone, good) {
    const m = this.M[zone][good];
    return Math.max(3, Math.round(GOODS[good].base * 0.5 / Math.pow(clamp(m[0], 0.3, 2), 0.8)));
  }
  ratio(zone, good) { return this.price(zone, good) / GOODS[good].base; }
  // the player (or a crew dealer) dumped product on a district: supply up, demand sated
  sold(zone, good, n) {
    const m = this.M[zone][good];
    m[0] = clamp(m[0] + n * 0.014 / (1 + GOODS[good].tier * 0.5), 0.25, 2.6);
    m[1] = clamp(m[1] - n * 0.004, 0.5, 1.8);
  }
  bought(zone, good, n) { const m = this.M[zone][good]; m[0] = clamp(m[0] - n * 0.006, 0.25, 2.6); }
  // a seizure or loss pulls product off the street (k 0..1); a flood pushes it in (k < 0)
  shock(zones, good, k) {
    for (const z of zones) { const m = this.M[z] && this.M[z][good]; if (!m) continue; m[0] = clamp(m[0] * (1 - k), 0.25, 2.6); if (k > 0) m[1] = clamp(m[1] * (1 + k * 0.25), 0.5, 1.8); }
  }
  tick(h) {
    const M = this.M;
    for (const z in M) for (const k in M[z]) {
      const m = M[z][k];
      m[0] += (1 - m[0]) * (1 - Math.exp(-0.035 * h)) + (Math.random() - 0.5) * 0.015 * h;
      m[1] += (1 - m[1]) * (1 - Math.exp(-0.05 * h)) + (Math.random() - 0.5) * 0.02 * h;
      m[0] = clamp(m[0], 0.25, 2.6); m[1] = clamp(m[1], 0.5, 1.8);
    }
  }
  // snapshot for trend arrows (taken once a day)
  snapshot() { const out = {}; for (const z in DEMAND) { out[z] = {}; for (const k of GOOD_IDS) out[z][k] = this.price(z, k); } this.uw.S.marketPrev = out; }
  trend(zone, good) { const p = this.uw.S.marketPrev; const a = p && p[zone] && p[zone][good]; if (!a) return 0; const b = this.price(zone, good); return (b - a) / a; }
  // the best and worst district for a good right now
  extremes(good) {
    let hi = null, lo = null;
    for (const z in DEMAND) { const p = this.price(z, good); if (!hi || p > hi.p) hi = { z, p }; if (!lo || p < lo.p) lo = { z, p }; }
    return { hi, lo };
  }
}

