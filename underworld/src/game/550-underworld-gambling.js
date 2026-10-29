/* =====================================================================
   [UNDERWORLD] GAMBLING: Fuel & Go scratch cards and slot machine, and the
   Valen Royale casino (slot floor, blackjack, roulette, Texas Hold'em).
   Every bet is settled the moment it is placed: stake out and any win in,
   in one step, before the reels spin or the card is scratched. The show is
   only a reveal, so closing a screen, double-tapping, a state change or a
   reload can never duplicate or lose money (a blackjack hand you walk away
   from is stood; a poker stack is cashed out). Every game keeps an honest,
   modest house edge (§45.4, M9): ordinary rules, ordinary odds, table
   limits by room. The windfalls are the Royale Billions major prizes and the
   world-time billion-dollar progressive (a $10,000 spin qualifies).
   ===================================================================== */
const SCRATCH_CARDS = {
  5: { name: 'Lucky Fives', col: '#7fe08f', prizes: [[5, 0.21], [10, 0.08], [20, 0.03], [50, 0.006], [100, 0.002], [500, 0.0002], [2500, 0.00002], [12500, 0.0000025]] },
  10: { name: 'Double Dime', col: '#46d4c4', prizes: [[10, 0.2], [20, 0.08], [40, 0.03], [100, 0.007], [250, 0.002], [1000, 0.0002], [5000, 0.00002], [25000, 0.0000025]] },
  20: { name: 'Gold Rush', col: '#ffd84d', prizes: [[20, 0.19], [40, 0.075], [100, 0.025], [250, 0.006], [1000, 0.0012], [5000, 0.00008], [20000, 0.00001], [75000, 0.0000015]] },
  50: { name: 'Diamond Deluxe', col: '#7fb2ff', prizes: [[50, 0.18], [100, 0.07], [250, 0.022], [500, 0.008], [2500, 0.001], [10000, 0.00008], [50000, 0.000008], [250000, 0.000001]] },
  100: { name: 'Millionaire Royale', col: '#ff8a3d', prizes: [[100, 0.17], [200, 0.065], [500, 0.02], [1000, 0.007], [5000, 0.0008], [25000, 0.00006], [100000, 0.000005], [1000000, 0.0000005]] }
};
for (const d in SCRATCH_CARDS) SCRATCH_CARDS[d].grand = SCRATCH_CARDS[d].prizes[SCRATCH_CARDS[d].prizes.length - 1][0];
function scratchRTP(den) { const c = SCRATCH_CARDS[den]; return c.prizes.reduce((a, [x, p]) => a + x * p, 0) / den; }
// win size class: drives the celebration (small, medium, large, jackpot)
function winClass(win, stake, top) { if (!(win > 0)) return 'none'; if (top && win >= top) return 'jackpot'; const m = win / stake; return m >= 50 ? 'large' : m >= 5 ? 'medium' : 'small'; }
// ---- slot machines. Symbols, weights per reel stop, pay tables (multiples of the bet / line bet).
const SLOT_SYMS = ['seven', 'crown', 'diamond', 'cash', 'car', 'shoe', 'skull'];
const SLOT_GLYPH = { seven: ['7', '#ff4d5e'], crown: ['♛', '#ffd84d'], diamond: ['♦', '#46d4c4'], cash: ['$', '#7fe08f'], car: ['CAR', '#7fb2ff'], shoe: ['Ω', '#d8a26a'], skull: ['☠', '#9aa3b2'] };
const SLOT_W_FUEL = { seven: 0.8, crown: 6.2, diamond: 8, cash: 17, car: 12, shoe: 24, skull: 32 };
const SLOT_LINES5 = [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2]];
const SLOT_DEFS = {
  // the Fuel & Go machine (the casino's own slot is Royale Billions below): bigger bets play bigger tables; the $100 jackpot is $3,000,000 at about 1 in 1.95 million
  fuel: { name: 'Lucky Pump', where: 'Fuel & Go', reels: 3, bets: [10, 25, 50, 100], w: SLOT_W_FUEL, table: {
    10: { three: { seven: 2500, crown: 226, diamond: 90, car: 45, cash: 23, shoe: 11 }, two: { seven: 23, crown: 9, diamond: 5, car: 3.5, cash: 2.5, shoe: 2 }, one: { shoe: 1 } },
    25: { three: { seven: 4000, crown: 228, diamond: 91, car: 46, cash: 23, shoe: 11 }, two: { seven: 23, crown: 9, diamond: 5, car: 3.5, cash: 2.5, shoe: 2 }, one: { shoe: 1 } },
    50: { three: { seven: 10000, crown: 230, diamond: 92, car: 46, cash: 23, shoe: 11 }, two: { seven: 23, crown: 9, diamond: 6, car: 3.5, cash: 3, shoe: 2 }, one: { shoe: 1 } },
    100: { three: { seven: 30000, crown: 232, diamond: 93, car: 46, cash: 23, shoe: 11 }, two: { seven: 23, crown: 9, diamond: 6, car: 3.5, cash: 3, shoe: 2 }, one: { shoe: 1 } } } },
};
function slotTable(def, bet) { return def.table ? def.table[bet] : def.all; }
function slotTop(def, bet, pool) { if (def.reels === 5) return def.pays.seven[2] * bet / def.lines.length; if (def.progressive) return pool || def.progressive.seed; return slotTable(def, bet).three.seven * bet; }
// exact expected return per unit staked (3-reel: one line; 5-reel: per line, lines are independent draws)
function slotRTP(def, bet) {
  const W = SLOT_SYMS.reduce((a, s) => a + def.w[s], 0);
  let ev = 0, hit = 0, jp = 0;
  if (def.reels === 3) {
    const t = slotTable(def, bet || def.bets[0]);
    for (const a of SLOT_SYMS) for (const b of SLOT_SYMS) for (const c of SLOT_SYMS) {
      const p = def.w[a] / W * def.w[b] / W * def.w[c] / W;
      const x = a === b && b === c ? t.three[a] || 0 : a === b ? (t.two[a] || 0) : (t.one[a] || 0);
      ev += p * x; if (x > 0) hit += p; if (a === 'seven' && b === 'seven' && c === 'seven') jp = p;
    }
  } else {
    const rec = (k, arr, p) => {
      if (k === 5) { let n = 1; while (n < 5 && arr[n] === arr[0]) n++; const pay = n >= 3 ? (def.pays[arr[0]] || [0, 0, 0])[n - 3] : 0; ev += p * pay; if (pay) hit += p; return; }
      for (const s of SLOT_SYMS) { arr[k] = s; rec(k + 1, arr, p * def.w[s] / W); }
    };
    rec(0, [], 1);
  }
  return { rtp: ev, hit, jp };
}
function slotDraw(def) { const W = SLOT_SYMS.reduce((a, s) => a + def.w[s], 0); let r = Math.random() * W; for (const s of SLOT_SYMS) { r -= def.w[s]; if (r <= 0) return s; } return 'skull'; }
// one spin: the grid (reels x rows) and what it pays
function slotSpin(def, bet, pool) {
  const rows = def.rows || 1, grid = [];
  for (let r = 0; r < def.reels; r++) { const col = []; for (let k = 0; k < rows; k++) col.push(slotDraw(def)); grid.push(col); }
  let win = 0, lines = [], jackpot = false;
  if (def.reels === 3) {
    const t = slotTable(def, bet), [a, b, c] = grid.map(col => col[0]);
    let x = a === b && b === c ? t.three[a] || 0 : a === b ? (t.two[a] || 0) : (t.one[a] || 0);
    if (a === 'seven' && b === 'seven' && c === 'seven') { jackpot = true; if (def.progressive) x = 0; }
    win = Math.round(x * bet);
    if (jackpot && def.progressive && (!def.progressive.maxOnly || bet === def.bets[def.bets.length - 1])) win = Math.round(pool);
    if (win) lines.push(0);
  } else {
    const lb = bet / def.lines.length;
    def.lines.forEach((L, li) => { const s = L.map((row, r) => grid[r][row]); let n = 1; while (n < 5 && s[n] === s[0]) n++; if (n >= 3) { const x = def.pays[s[0]][n - 3]; if (x) { win += x * lb; lines.push(li); if (s[0] === 'seven' && n === 5) jackpot = true; } } });
    win = Math.round(win);
  }
  return { grid, win, lines, jackpot };
}
// ---- the Valen Royale (§45.4, M9): an honest house. Ordinary rules and odds at every table (European roulette
// 2.7%, blackjack 6 decks S17 3:2 about 0.5%, baccarat about 1.1–1.2%, three card poker about 3.4%, craps pass line
// 1.4%), the Royale Billions slot at about 95% return, and table limits by room: $10,000 on the floor, $250,000 in
// the VIP room once you are known there (Rep 1,300).
const CASINO = {
  minBet: 10, floorMax: 10000, vipMax: 250000, vipRep: 1300, slotMax: 10000,
  quick: [100, 1e3, 5e3, 1e4, 5e4, 1e5, 2.5e5]
};
// "2.5m", "10k", "$1,000,000", "1b" → whole dollars (NaN when it is not an amount)
function parseMoney(s) { const t = String(s == null ? '' : s).trim().toLowerCase().replace(/[$,\s_]/g, ''); const m = t.match(/^(\d+(?:\.\d+)?)([kmbt]?)$/); if (!m) return NaN; return Math.floor(+m[1] * { '': 1, k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[m[2]]); }
// ---- Royale Billions, the casino's slot: 5 reels, 3 rows, 5 lines. A spin's base result is drawn first (how many
// lines win, with which symbol and how many in a row), the reels are then built to show exactly that, and the
// payout is always read back off the reels, so what you see is what you are paid. On top of that, every spin
// rolls each major prize independently (MAJORS below) with a soft drought pressure that is saved.
const ROYALE_SYMS = ['seven', 'crown', 'diamond', 'car', 'cash', 'shoe'];
const ROYALE_FILL = ['seven', 'crown', 'diamond', 'car', 'cash', 'shoe', 'skull', 'skull', 'skull'];
// line pays as multiples of the total bet for 3 / 4 / 5 in a row from the left
const ROYALE_PAY = { shoe: [1.0, 1.4, 2.5], cash: [1.12, 1.6, 3], car: [1.2, 2, 4], diamond: [1.35, 2.8, 8], crown: [1.7, 4.5, 15], seven: [2.2, 8, 40] };
const ROYALE_K = [0.39, 0.545, 0.05, 0.01, 0.003, 0.001]; // 0..5 winning lines
const ROYALE_SYM_W = { shoe: 9, cash: 38, car: 26, diamond: 13, crown: 8, seven: 6 };
const ROYALE_N_W = [0.9, 0.085, 0.015]; // 3, 4, 5 in a row
// base game (measured, 1M spins): return 98.4%, 56% of spins pay more than the bet, 4.4% pay it back exactly
const ROYALE_BASE_RTP = 0.984;
// the major prize ladder (M9). A prize is in play when it is at least 5× the bet (the billion only on a qualifying
// $10,000 spin). The tiers in play share ROYALE.share of every stake as expected return, split by w, so a jackpot's
// chance is proportional to the bet and nothing about the machine favours a big bettor. Every spin rolls every tier
// in play independently, a hit only resets that tier's pressure, and nothing caps how often a tier can land.
// Drought pressure: each spin without a hit adds that spin's base chance to the tier's pressure P (P = hits you were
// "owed"); the live chance is base × (1 + 4·P²), so a long dry run gets steadily more likely to end. The base chance
// is scaled by ROYALE_DROUGHT_K so that the long-run average, pressure included, is exactly the share.
const ROYALE_MAJORS = [
  { id: 'm1b', prize: 1e9, w: 0.25, name: 'BILLION DOLLAR JACKPOT' }, { id: 'm250m', prize: 2.5e8, w: 0.1, name: 'GRAND JACKPOT' },
  { id: 'm100m', prize: 1e8, w: 0.1, name: 'MEGA JACKPOT' }, { id: 'm50m', prize: 5e7, w: 0.08, name: 'SUPER JACKPOT' },
  { id: 'm25m', prize: 2.5e7, w: 0.08, name: 'ROYAL JACKPOT' }, { id: 'm10m', prize: 1e7, w: 0.07, name: 'GOLD JACKPOT' },
  { id: 'm5m', prize: 5e6, w: 0.06, name: 'SILVER JACKPOT' }, { id: 'm1m', prize: 1e6, w: 0.05, name: 'MILLION' },
  { id: 'm500k', prize: 5e5, w: 0.04, name: 'MAJOR' }, { id: 'm250k', prize: 2.5e5, w: 0.04, name: 'MAJOR' },
  { id: 'm100k', prize: 1e5, w: 0.04, name: 'MINOR' }, { id: 'm50k', prize: 5e4, w: 0.03, name: 'MINOR' },
  { id: 'm25k', prize: 2.5e4, w: 0.03, name: 'BONUS' }, { id: 'm10k', prize: 1e4, w: 0.03, name: 'BONUS' }
];
// M9: the majors share 4% of every stake as expected return (split by w, scaled by the drought average); the base game
// pays baseK of its table (about 91%), so the machine returns about 95% in all. The billion tier is the world-time progressive
// (jp.pool, seeded at $1B, growing ~$400k–$800k an economic day) and is only in play on a qualifying $10,000 spin.
// othersWin (M13): the chance an economic day that somebody else at the Royale hits the progressive, so the pool stays
// bounded (about $1.25B on average) and the machine never drifts into positive expectation (that would take a pool
// over ~$5.7B: the billion tier is priced at the $1B seed)
const ROYALE = { share: 0.04, drought: 4, minRatio: 5, maxP: 0.5, top: 1e9, sph: 1300, baseK: 0.925, qualify: 10000, grow: [400000, 800000], othersWin: 1 / 400 };
// mean of the pressured wait in units of the unpressured one: ∫₀^∞ exp(−(x + c·x³/3)) dx (0.536 for c = 4)
const ROYALE_DROUGHT_K = (() => { const c = ROYALE.drought, dx = 1e-3; let sum = 0; for (let x = dx / 2; x < 16; x += dx) sum += Math.exp(-(x + c * x * x * x / 3)) * dx; return sum; })();
function royaleEval(grid) {
  let mult = 0; const lines = [];
  SLOT_LINES5.forEach((L, li) => { const s = L.map((row, r) => grid[r][row]); if (!ROYALE_PAY[s[0]]) return; let n = 1; while (n < 5 && s[n] === s[0]) n++; if (n >= 3) { mult += ROYALE_PAY[s[0]][n - 3]; lines.push({ li, n, sym: s[0], x: ROYALE_PAY[s[0]][n - 3] }); } });
  return { mult, lines };
}
function _wpick(obj, rnd) { let t = 0; for (const k in obj) t += obj[k]; t *= rnd(); for (const k in obj) { t -= obj[k]; if (t <= 0) return k; } return Object.keys(obj).pop(); }
function _apick(arr, rnd) { let t = arr.reduce((a, b) => a + b, 0) * rnd(); for (let i = 0; i < arr.length; i++) { t -= arr[i]; if (t <= 0) return i; } return arr.length - 1; }
// reels showing exactly k winning lines (null if the attempt budget runs out; the caller falls back to k = 0)
function royaleBuild(k, rnd = Math.random) {
  for (let att = 0; att < 40; att++) {
    const g = [0, 1, 2, 3, 4].map(() => [null, null, null]), lis = [0, 1, 2, 3, 4];
    for (let i = 4; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = lis[i]; lis[i] = lis[j]; lis[j] = t; }
    let ok = true;
    for (const li of lis.slice(0, k)) {
      const sym = _wpick(ROYALE_SYM_W, rnd), n = 3 + _apick(ROYALE_N_W, rnd), L = SLOT_LINES5[li];
      for (let r = 0; r < n; r++) { const c = g[r][L[r]]; if (c && c !== sym) { ok = false; break; } g[r][L[r]] = sym; }
      if (!ok) break;
      if (n < 5) { const c = g[n][L[n]]; if (c === sym) { ok = false; break; } if (!c) g[n][L[n]] = '!' + sym; }
    }
    if (!ok) continue;
    for (let f = 0; f < 30; f++) {
      const h = g.map(col => col.map(c => c && c[0] !== '!' ? c : null));
      for (let r = 0; r < 5; r++) for (let w = 0; w < 3; w++) if (!h[r][w]) { let s, guard = 0; do { s = ROYALE_FILL[Math.floor(rnd() * ROYALE_FILL.length)]; } while (g[r][w] && g[r][w][0] === '!' && g[r][w].slice(1) === s && guard++ < 20); h[r][w] = s; }
      const e = royaleEval(h); if (e.lines.length === k) return { grid: h, ...e };
    }
  }
  return null;
}
// reels with nothing on any line: the fallback when the random build runs out of attempts
function royaleBlank(rnd = Math.random) {
  for (let t = 0; t < 20; t++) { const g = [0, 1, 2, 3, 4].map(() => [0, 1, 2].map(() => ROYALE_FILL[Math.floor(Math.random() * ROYALE_FILL.length)])); if (!royaleEval(g).lines.length) return { grid: g, mult: 0, lines: [] }; }
  void rnd; return { grid: [0, 1, 2, 3, 4].map(r => [0, 1, 2].map(w => (r + w) % 2 ? 'skull' : ROYALE_SYMS[(r * 2 + w) % 6])), mult: 0, lines: [] };
}
// the majors in play at this bet and their base chance per spin (before drought pressure)
// (memoised per bet: the table is constant, so the last bet's array is reused; callers never mutate it)
let _royaleChBet = NaN, _royaleCh = null;
function royaleChances(bet) {
  if (bet === _royaleChBet && _royaleCh) return _royaleCh;
  _royaleChBet = bet; return (_royaleCh = royaleChancesRaw(bet));
}
function royaleChancesRaw(bet) {
  const el = ROYALE_MAJORS.filter(m => bet >= CASINO.minBet && m.prize >= ROYALE.minRatio * bet && (m.id !== 'm1b' || bet >= ROYALE.qualify)), sw = el.reduce((a, m) => a + m.w, 0);
  return ROYALE_MAJORS.map(m => el.includes(m) ? Math.min(ROYALE.maxP, ROYALE.share * m.w / sw * bet / m.prize * ROYALE_DROUGHT_K) : 0);
}
// long-run average spins between hits of each tier at this bet, pressure included (0 = not in play)
function royaleEvery(bet) { return royaleChances(bet).map(p => p > 0 ? ROYALE_DROUGHT_K / p : 0); }
// a pressure value drawn from the steady state: the time since the last hit (in owed hits) of a player who has been
// spinning for ever has density ∝ exp(−(x + c·x³/3)) (rejection sampling; about six tries)
function royaleSeedPressure(rnd = Math.random) {
  const c = ROYALE.drought;
  for (let i = 0; i < 200; i++) { const x = rnd() * 4; if (rnd() < Math.exp(-(x + c * x * x * x / 3))) return x; }
  return 0;
}
// the live chance of each tier on the next spin, with the pressure this player has built up
function royaleLive(bet, jp) { return royaleChances(bet).map((b, t) => { if (!b) return 0; const P = +(jp && jp.pr && jp.pr[ROYALE_MAJORS[t].id]) || 0; return Math.min(ROYALE.maxP, b * (1 + ROYALE.drought * P * P)); }); }
// when no major is in play (a bet over a fifth of the top prize) the base game pays its share instead, so the
// expected return never drops for betting big
function royaleBaseScale(bet) { return ROYALE.baseK * (royaleChances(bet).some(p => p > 0) ? 1 : (ROYALE_BASE_RTP * ROYALE.baseK + ROYALE.share) / (ROYALE_BASE_RTP * ROYALE.baseK)); }
// the major roll of one spin: every tier in play is rolled, the biggest that hits is paid. Updates jp in place
// (pressure and hit counts) and returns the tier index or -1. Shared by royaleSpin and the simulations.
function royaleRollMajor(bet, jp, rnd = Math.random) {
  const base = royaleChances(bet); jp.pr = jp.pr || {}; jp.hits = jp.hits || {};
  // a tier you have never played starts at a random point of a typical dry spell, not at "just hit": with the drought
  // pressure, starting from zero would make a new player's first hours rarer than the long-run average
  for (let t = 0; t < ROYALE_MAJORS.length; t++) if (base[t] && !(ROYALE_MAJORS[t].id in jp.pr)) jp.pr[ROYALE_MAJORS[t].id] = royaleSeedPressure(rnd);
  const live = royaleLive(bet, jp);
  let major = -1;
  for (let t = 0; t < ROYALE_MAJORS.length; t++) { if (!base[t]) continue; if (rnd() < live[t] && major < 0) major = t; }
  for (let t = 0; t < ROYALE_MAJORS.length; t++) { if (!base[t]) continue; const id = ROYALE_MAJORS[t].id; if (t === major) { jp.pr[id] = 0; jp.hits[id] = (jp.hits[id] || 0) + 1; } else jp.pr[id] = (+jp.pr[id] || 0) + base[t]; }
  return major;
}
// one spin. jp = { pr: {tier: pressure}, hits: {tier: n} } is updated in place (the caller saves it with the money)
function royaleSpin(bet, jp, rnd = Math.random) {
  const major = royaleRollMajor(bet, jp, rnd);
  let b;
  if (major >= 0) {
    b = royaleBuild(0, rnd) || royaleBlank();
    for (let r = 0; r < 5; r++) b.grid[r][1] = 'royal';
    // the billion tier pays the live progressive and starts it again from the seed
    const prog = ROYALE_MAJORS[major].id === 'm1b', prize = prog ? Math.max(ROYALE.top, Math.floor(+jp.pool || ROYALE.top)) : ROYALE_MAJORS[major].prize;
    if (prog) jp.pool = ROYALE.top;
    return { grid: b.grid, win: prize, lines: [{ li: 0, n: 5, sym: 'royal' }], major, mult: 0, teaser: 0, progressive: prog };
  }
  b = royaleBuild(_apick(ROYALE_K, rnd), rnd) || royaleBuild(0, rnd) || royaleBlank();
  let teaser = 0;
  // a near miss now and then: two to four jackpot crowns on the middle line, then a blank
  if (!b.lines.length && rnd() < 0.25) { teaser = 2 + Math.floor(rnd() * 3); for (let r = 0; r < teaser; r++) b.grid[r][1] = 'royal'; if (teaser < 5) b.grid[teaser][1] = 'skull'; }
  const win = Math.round(b.mult * royaleBaseScale(bet) * bet);
  return { grid: b.grid, win, lines: b.lines, major: -1, mult: b.mult, teaser };
}
// celebration class for a casino win: by multiple of the stake and by absolute size
function royaleClass(win, bet, major) {
  if (!(win > 0)) return 'none';
  if (major === 0) return 'billion';
  if (win >= 1e6 && win >= bet * 5) return 'mega';
  const m = win / bet; return major >= 0 || m >= 15 ? 'large' : m >= 3 ? 'medium' : 'small';
}
// ---- cards (rank 2..14, suit 0..3: ♠ ♥ ♦ ♣)
const SUITS = ['♠', '♥', '♦', '♣'], RANKS_TXT = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
function makeDeck(decks = 1) { const d = []; for (let k = 0; k < decks; k++) for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s }); for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = d[i]; d[i] = d[j]; d[j] = t; } return d; }
function cardHTML(c, hidden) { if (hidden) return '<span class="pcard back"></span>'; const red = c.s === 1 || c.s === 2; return `<span class="pcard${red ? ' red' : ''}">${RANKS_TXT[c.r] || c.r}<small>${SUITS[c.s]}</small></span>`; }
function bjValue(cards) { let t = 0, aces = 0; for (const c of cards) { if (c.r === 14) { aces++; t += 11; } else t += Math.min(10, c.r); } while (t > 21 && aces) { t -= 10; aces--; } return { total: t, soft: aces > 0 }; }
// poker: score any 5 cards as one comparable number (category first, then kickers)
const HAND_NAMES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
function rank5(cs) {
  const r = cs.map(c => c.r).sort((a, b) => b - a), flush = cs.every(c => c.s === cs[0].s);
  const cnt = {}; for (const x of r) cnt[x] = (cnt[x] || 0) + 1;
  const groups = Object.entries(cnt).map(([k, n]) => [n, +k]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  let uniq = [...new Set(r)], straightHi = 0;
  if (uniq.length === 5) { if (uniq[0] - uniq[4] === 4) straightHi = uniq[0]; else if (uniq.join() === '14,5,4,3,2') straightHi = 5; }
  let cat, ks;
  if (straightHi && flush) { cat = 8; ks = [straightHi]; }
  else if (groups[0][0] === 4) { cat = 7; ks = [groups[0][1], groups[1][1]]; }
  else if (groups[0][0] === 3 && groups[1][0] === 2) { cat = 6; ks = [groups[0][1], groups[1][1]]; }
  else if (flush) { cat = 5; ks = r; }
  else if (straightHi) { cat = 4; ks = [straightHi]; }
  else if (groups[0][0] === 3) { cat = 3; ks = groups.map(g => g[1]); }
  else if (groups[0][0] === 2 && groups[1][0] === 2) { cat = 2; ks = groups.map(g => g[1]); }
  else if (groups[0][0] === 2) { cat = 1; ks = groups.map(g => g[1]); }
  else { cat = 0; ks = r; }
  let v = cat; for (let i = 0; i < 5; i++) v = v * 15 + (ks[i] || 0);
  return v;
}
const _C7 = []; for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) _C7.push([a, b]);
function best7(cs) { let best = -1; const five = []; for (const [a, b] of _C7) { five.length = 0; for (let i = 0; i < cs.length; i++) if (i !== a && i !== b) five.push(cs[i]); const v = rank5(five); if (v > best) best = v; } return best; }
function bestOf(cs) { if (cs.length === 5) return rank5(cs); if (cs.length === 6) { let b = -1; for (let i = 0; i < 6; i++) b = Math.max(b, rank5(cs.filter((_, j) => j !== i))); return b; } return best7(cs); }
function handCat(v) { return Math.floor(v / 759375); } // 15^5
// a quick equity estimate against n random hands (the AI's read of its own cards)
function pokerEquity(hole, board, nOpp, iters = 120) {
  const known = new Set([...hole, ...board].map(c => c.r * 4 + c.s));
  const pool = []; for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) if (!known.has(r * 4 + s)) pool.push({ r, s });
  let win = 0;
  for (let it = 0; it < iters; it++) {
    for (let i = pool.length - 1; i > pool.length - 1 - (5 - board.length + nOpp * 2) && i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    let k = pool.length - 1; const b = board.slice(); while (b.length < 5) b.push(pool[k--]);
    const me = bestOf([...hole, ...b]); let best = true, tie = 0;
    for (let o = 0; o < nOpp; o++) { const v = bestOf([pool[k--], pool[k--], ...b]); if (v > me) { best = false; break; } if (v === me) tie++; }
    if (best) win += tie ? 1 / (tie + 1) : 1;
  }
  return win / iters;
}
const POKER_AI = [
  { name: 'Marguerite', pers: 'cautious', tight: 0.62, aggr: 0.25, bluff: 0.02, loose: 0.0, desc: 'Cautious: folds a lot, bets only real hands' },
  { name: 'Big Sal', pers: 'aggressive', tight: 0.5, aggr: 0.75, bluff: 0.08, loose: 0.05, desc: 'Aggressive: raises whenever he likes it' },
  { name: 'Lucky Lou', pers: 'loose', tight: 0.34, aggr: 0.35, bluff: 0.05, loose: 0.25, desc: 'Loose: calls with anything' },
  { name: 'Vivian Kade', pers: 'bluffer', tight: 0.45, aggr: 0.55, bluff: 0.22, loose: 0.1, desc: 'Bluff-heavy: never believe her' }
];
class Gamble {
  constructor(g) {
    this.g = g; this.busy = false; this.view = null; this.token = 0;
    this.shoe = []; this.bj = null; this.roul = null; this.pk = null;
    const cv = document.createElement('canvas'); cv.id = 'confetti'; document.body.appendChild(cv); this.cv = cv; this.parts = [];
  }
  get G() { return this.g.save.gamble; }
  // the casino plays from the bank only (§45.5): wagers, chips and lottery tickets are Clean Bank, so are winnings
  get money() { return Money.clean; }
  // a new session or another save: in-memory tables are dropped; anything that matters is already in the save and recover() settles it
  reset() { this.token++; this.busy = false; this.bj = null; this.pk = null; this.sc = null; this.roul = null; this.ry = null; this.slotState = {}; this.game = null; }
  // ------------------------------------------------------------- money: one atomic step per bet
  // stake leaves and the win arrives together; stats are updated in the same breath
  settle(group, stake, win, extra) {
    const G = this.G;
    const pre = !!(extra && extra.prepaid);
    if (!(stake >= 0) || !(win >= 0) || stake >= MONEY_MAX || win >= MONEY_MAX || (!pre && stake > Money.clean + 1e-6)) return false;
    // a prepaid stake (blackjack, poker) already left the bank through debit(); the ledger books stakes and wins
    if (!pre && stake > 0) Money.pay(stake, 'casinoStake');
    if (win > 0) Money.earn(win, 'casino');
    if (group === 'scratch') { const S = G.scratch; S.bought++; S.spent += stake; S.won += win; if (win > 0) S.wins++; S.biggest = Math.max(S.biggest, win); }
    else if (group === 'slots') { const S = G.slots; S.spins++; S.wagered += stake; S.won += win; S.biggest = Math.max(S.biggest, win); if (extra && extra.jackpot) S.jackpots++; }
    else { const S = G.casino; S.wagered += stake; S.won += win; S.lost += Math.max(0, stake - win); S.biggest = Math.max(S.biggest, win - stake); if (extra) { if (extra.slot) { S.slotSpins++; S.biggestSlot = Math.max(S.biggestSlot, win); } if (extra.bj) { S.bjHands++; if (win > stake) S.bjWins++; } if (extra.roul) S.rouletteSpins++; } }
    return true;
  }
  // ------------------------------------------------------------- celebration, scaled to the win
  celebrate(cls, amount, title) {
    const g = this.g;
    if (cls === 'none') { g.audio.play('deny', { gain: 0.5 }); return; }
    if (cls === 'small') g.audio.play('win1');
    else if (cls === 'medium') { g.audio.play('win2'); this.pulse(); }
    else if (cls === 'large') { g.audio.play('win3'); this.pulse(); this.confetti(90); }
    else if (cls === 'billion') { g.audio.play('jackpot'); setTimeout(() => g.audio.play('jackpot'), 2100); this.pulse(); this.confetti(420, true); setTimeout(() => this.confetti(300, true), 1600); setTimeout(() => this.confetti(260, true), 3400); g.ui.banner(title || 'BILLION DOLLAR JACKPOT', fmtMoney(amount), 'pass', 9); this.strobe(7); }
    else { g.audio.play('jackpot'); this.pulse(); this.confetti(cls === 'mega' ? 360 : 320, cls === 'mega'); g.ui.banner(title || 'JACKPOT', fmtMoney(amount), 'pass', 5); const f = $('flash'); f.style.transition = 'none'; f.style.background = 'radial-gradient(ellipse at center,rgba(255,216,77,.55),rgba(255,140,40,.25))'; f.style.opacity = 0.9; void f.offsetWidth; f.style.transition = 'opacity 1.6s'; f.style.opacity = 0; setTimeout(() => { f.style.background = ''; }, 1700); }
    this.lastCelebration = { cls, amount, t: performance.now() };
  }
  // full-screen gold strobe for the billion
  strobe(n) { const f = $('flash'); let i = 0; const tk = () => { if (i++ >= n * 2) { f.style.opacity = 0; setTimeout(() => { f.style.background = ''; }, 400); return; } f.style.transition = 'opacity .18s'; f.style.background = i % 4 < 2 ? 'radial-gradient(ellipse at center,rgba(255,236,140,.75),rgba(255,140,40,.35))' : 'radial-gradient(ellipse at center,rgba(224,86,253,.5),rgba(255,216,77,.3))'; f.style.opacity = i % 2 ? 0.85 : 0.2; setTimeout(tk, 230); }; tk(); }
  pulse() { const el = document.querySelector('#svcBody .gres'); if (el) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); } }
  confetti(n, coins) {
    const cv = this.cv, W = cv.width = innerWidth, H = cv.height = innerHeight, cols = coins ? ['#ffd84d', '#ffbf3c', '#ffe9a0', '#e0a92a'] : ['#ffd84d', '#ff4d5e', '#46d4c4', '#7fe08f', '#d28cff', '#ffffff', '#ff8a3d'];
    if (this.parts.length > 900) n = Math.min(n, 120); // keep the particle count bounded on a phone
    for (let i = 0; i < n; i++) this.parts.push({ x: W / 2 + rand(-W * 0.25, W * 0.25), y: H * 0.35 + rand(-40, 40), vx: rand(-260, 260), vy: rand(-520, -160), r: rand(0, 6), vr: rand(-8, 8), s: rand(5, 10), c: pick(cols), t: rand(2.2, 3.4) });
    cv.style.display = 'block';
    if (!this._raf) { let last = performance.now(); const step = (now) => { const dt = Math.min(0.05, (now - last) / 1000); last = now; this.drawConfetti(dt); if (this.parts.length) this._raf = requestAnimationFrame(step); else { this._raf = 0; cv.style.display = 'none'; } }; this._raf = requestAnimationFrame(step); }
  }
  drawConfetti(dt) {
    const c = this.cv.getContext('2d'); c.clearRect(0, 0, this.cv.width, this.cv.height);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.t -= dt; if (p.t <= 0 || p.y > this.cv.height + 20) { this.parts.splice(i, 1); continue; }
      p.vy += 520 * dt; p.vx *= 1 - 0.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.globalAlpha = Math.min(1, p.t); c.fillStyle = p.c; c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); c.restore();
    }
  }
  // the screen may close mid-reveal: reveals check this token and quietly stop
  // switching screens or closing one leaves the table cleanly: a blackjack hand is stood, a poker stack is cashed out
  open(title, hint, render, act, game) {
    if (!this._wenter) { this._wenter = true; $('svcBody').addEventListener('keydown', e => { if (e.target && e.target.id === 'wagerIn' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); const f = this.g.content._svcAct; if (f) f('w:set'); } }); }
    if (this.game && this.game !== game) this.leaveTable();
    this.token++; this.busy = false; this.view = title; this.game = game || null;
    this.stopSpins();
    this.g.content.openSvc(title, hint, render, a => { if (this.busy && a !== 'close') return; act(a); });
    this.g.content._svcClose = () => { this.token++; this.busy = false; this.stopSpins(); this.leaveTable(); this.game = null; };
  }
  // a reveal cut short by leaving: the money moved when the bet was placed, only the show is skipped
  stopSpins() {
    for (const id in this.slotState || {}) { const sl = this.slotState[id]; if (sl.spinning) { sl.spinning = false; if (sl.res) sl.grid = sl.res.grid; } }
    if (this.roul && this.roul.spinning) this.roul.spinning = null;
    if (this.bj && this.bj.revealing) { this.bj.revealing = false; this.bj.shown = 99; }
    if (this.ry && this.ry.spinning) { this.ry.spinning = false; if (this.ry.res) this.ry.grid = this.ry.res.grid; }
  }
  later(ms, fn) { const tk = this.token; setTimeout(() => { if (tk === this.token && this.g.ui.modal === 'svcScreen') fn(); }, ms); }
  refresh(h) { this.g.content.refreshSvc(h); }
  statsHTML(kind) {
    const G = this.G;
    if (kind === 'scratch') { const S = G.scratch; return `<div class="stats"><span>Cards bought</span><span>${S.bought}</span><span>Spent</span><span>${fmtMoney(S.spent)}</span><span>Won</span><span>${fmtMoney(S.won)}</span><span>Biggest win</span><span>${fmtMoney(S.biggest)}</span></div>`; }
    if (kind === 'slots') { const S = G.slots; return `<div class="stats"><span>Spins</span><span>${S.spins}</span><span>Wagered</span><span>${fmtMoney(S.wagered)}</span><span>Won</span><span>${fmtMoney(S.won)}</span><span>Biggest win</span><span>${fmtMoney(S.biggest)}</span><span>Jackpots</span><span>${S.jackpots}</span></div>`; }
    const S = G.casino; return `<div class="stats"><span>Wagered</span><span>${fmtMoney(S.wagered)}</span><span>Won</span><span>${fmtMoney(S.won)}</span><span>Lost</span><span>${fmtMoney(S.lost)}</span><span>Largest win</span><span>${fmtMoney(S.biggest)}</span><span>Largest slot win</span><span>${fmtMoney(S.biggestSlot)}</span><span>Blackjack hands won</span><span>${S.bjWins} / ${S.bjHands}</span><span>Poker hands won</span><span>${S.pokerWins} / ${S.pokerHands}</span><span>Roulette spins</span><span>${S.rouletteSpins}</span></div>`;
  }
  // ------------------------------------------------------------- scratch cards (Fuel & Go)
  scratchDraw(den) { const c = SCRATCH_CARDS[den]; let r = Math.random(); for (const [x, p] of c.prizes) { r -= p; if (r < 0) return x; } return 0; }
  // nine panels; three matching amounts win that amount
  scratchPanels(den, win) {
    const c = SCRATCH_CARDS[den], amounts = c.prizes.map(p => p[0]), cells = [];
    if (win) { for (let i = 0; i < 3; i++) cells.push(win); }
    const pool = amounts.filter(a => a !== win);
    const count = {}; if (win) count[win] = 3;
    while (cells.length < 9) { const a = pick(pool.length ? pool : amounts); if ((count[a] || 0) >= 2) continue; count[a] = (count[a] || 0) + 1; cells.push(a); }
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = cells[i]; cells[i] = cells[j]; cells[j] = t; }
    return cells;
  }
  openScratch() {
    if (this.sc && this.sc.done) this.sc = null;
    const render = () => {
      const s = this.g.save, sc = this.sc;
      let h = `<div class="svcTop"><span>Bank <b class="cash clean">${fmtMoney(this.shownMoney())}</b></span><span>Three matching amounts win that amount</span></div>`;
      h += '<div class="grid2">' + Object.keys(SCRATCH_CARDS).map(d => { const c = SCRATCH_CARDS[d]; return `<div class="card" style="border-left:4px solid ${c.col}"><div class="t">${c.name} · $${d}</div><div class="d">Top prize ${fmtMoney(c.grand)} · wins about 1 in ${Math.round(1 / c.prizes.reduce((a, p) => a + p[1], 0))}</div><button class="sbtn gold" data-act="buy:${d}" ${Money.clean < +d || (sc && !sc.done) ? 'disabled' : ''}>Buy · $${d}</button></div>`; }).join('') + '</div>';
      if (sc) {
        h += `<div class="scard" style="--sc:${SCRATCH_CARDS[sc.den].col}"><div class="sct">${SCRATCH_CARDS[sc.den].name} <small>$${sc.den}</small></div><div class="scgrid">${sc.cells.map((a, i) => `<div class="scc${sc.open[i] ? ' open' : ''}${sc.done && sc.win && a === sc.win ? ' hit' : ''}" data-act="sc:${i}">${sc.open[i] ? fmtMoney(a) : ''}</div>`).join('')}</div>
          ${sc.done ? `<div class="gres ${sc.cls}">${sc.win ? `WINNER · ${fmtMoney(sc.win)}` : 'No match. Better luck next time.'}</div>` : `<div class="btns"><button class="sbtn gold" data-act="scratch">SCRATCH</button></div><div class="hint">Drag across the panels or tap SCRATCH.</div>`}</div>`;
      }
      return h + '<h3>Your scratch-card record</h3>' + this.statsHTML('scratch');
    };
    this.open('Scratch Cards', 'Clerk: “Good luck. Most people don’t have any.”', render, a => {
      const [k, x] = a.split(':');
      if (k === 'buy') this.scratchBuy(+x);
      else if (k === 'scratch') this.scratchReveal();
      else if (k === 'sc') this.scratchCell(+x);
    }, 'scratch');
    this.bindScratchDrag();
  }
  // wins already paid but not yet revealed stay out of the cash shown on the game screens
  get pendingWin() { let w = 0; if (this.sc && !this.sc.done) w += this.sc.win; for (const id in this.slotState || {}) { const sl = this.slotState[id]; if (sl.spinning && sl.res) w += sl.res.win; } if (this.bj && this.bj.revealing) w += this.bj.revealWin; if (this.roul && this.roul.spinning) w += this.roul.spinning.win; if (this.ry && this.ry.spinning && this.ry.res) w += this.ry.res.win; return w; }
  shownMoney() { return Money.clean - this.pendingWin; }
  scratchBuy(den) {
    if (this.sc && !this.sc.done) return;
    const win = this.scratchDraw(den);
    if (!this.settle('scratch', den, win)) return;
   
    this.sc = { den, win, cells: this.scratchPanels(den, win), open: new Array(9).fill(false), done: false, cls: winClass(win, den, SCRATCH_CARDS[den].grand) };
    this.g.audio.play('cash', { gain: 0.5 }); this.g.saveGame(); this.refresh('Scratch it.');
  }
  scratchCell(i) { const sc = this.sc; if (!sc || sc.done || sc.open[i]) return; sc.open[i] = true; this.g.audio.play('scratch', { gain: 0.5 }); if (sc.open.every(Boolean)) this.scratchDone(); else this.refresh(); }
  scratchReveal() {
    const sc = this.sc; if (!sc || sc.done || this.busy) return;
    this.busy = true;
    const order = sc.open.map((o, i) => o ? -1 : i).filter(i => i >= 0);
    // about 2.2 seconds for a full card: panel by panel, the last one held a beat
    order.forEach((i, n) => this.later(200 + n * 230 + (n === order.length - 1 ? 180 : 0), () => { sc.open[i] = true; this.g.audio.play('scratch', { gain: 0.35 }); if (n === order.length - 1) { this.busy = false; this.scratchDone(); } else this.refresh(); }));
    if (!order.length) { this.busy = false; this.scratchDone(); }
  }
  scratchDone() { const sc = this.sc; if (!sc || sc.done) return; sc.done = true; sc.open.fill(true); this.refresh(sc.win ? `You won ${fmtMoney(sc.win)}!` : 'Nothing this time.'); this.celebrate(sc.cls, sc.win, 'SCRATCH JACKPOT'); this.g.saveGame(); }
  bindScratchDrag() {
    if (this._scd) return; this._scd = true;
    const body = $('svcBody'); let down = false;
    body.addEventListener('pointerdown', e => { if (e.target.closest('.scc')) { down = true; const c = e.target.closest('.scc'); this.g.content._svcAct && this.g.content._svcAct(c.dataset.act); } });
    window.addEventListener('pointerup', () => { down = false; });
    body.addEventListener('pointermove', e => { if (!down) return; const el = document.elementFromPoint(e.clientX, e.clientY); const c = el && el.closest && el.closest('.scc'); if (c && !c.classList.contains('open') && this.g.content._svcAct) this.g.content._svcAct(c.dataset.act); });
  }
  // ------------------------------------------------------------- slot machines (Fuel & Go and the casino floor)
  pool(id) { const c = this.G.casino; c.pools = c.pools && typeof c.pools === 'object' ? c.pools : {}; const def = SLOT_DEFS[id]; if (def.progressive && !(c.pools[id] >= def.progressive.seed)) c.pools[id] = def.progressive.seed; return c.pools[id] || 0; }
  // a spot on the casino floor (older ids with a limit tier still open the same game)
  spot(id) {
    const [, kind, arg] = id.split(':');
    if (kind === 'bj') this.openBlackjack(+arg || 0);
    else if (kind === 'roul') this.openRoulette(+arg || 0);
    else if (kind === 'poker') this.openPoker();
    else if (kind === 'bacc') this.openBaccarat(+arg || 0);
    else if (kind === 'craps') this.openCraps();
    else if (kind === 'tcp') this.openThreeCard(+arg || 0);
    else if (kind === 'sports') this.openSportsbook();
    else if (kind === 'slot') this.openRoyale(arg);
    else if (kind === 'cashier') this.openCashier();
    else if (kind === 'bar') this.barDrink();
  }
  barDrink() {
    const g = this.g, p = g.player;
    if (!Money.pay(40, 'bar')) { g.content.deny('The bartender waits. Drinks are $40.'); return; }
    p.health = Math.min(p.maxHealth, p.health + 25 * HP_SCALE);
    g.audio.play('pickup'); g.ui.toast(pick(['An old fashioned, on the rocks. +75 health.', 'Something with a cherry in it. +75 health.', 'Top-shelf rye. +75 health.']), 'money');
  }
  openCashier() {
    const render = () => {
      const s = this.g.save, J = this.G.jp;
      let h = `<div class="svcTop"><span>Bank <b class="cash clean">${fmtMoney(Money.clean)}</b></span><span>Limits: ${fmtMoney(CASINO.minBet)}–${fmtMoney(CASINO.floorMax)} on the floor · up to ${fmtMoney(CASINO.vipMax)} at the VIP tables (Rep ${CASINO.vipRep.toLocaleString('en-US')}) · Royale Billions up to ${fmtMoney(CASINO.slotMax)}</span></div>`;
      h += `<div class="hint">An honest house: ordinary rules and odds, a small edge on every game. The windfalls are the Royale Billions major prizes and the progressive, now <b class="gold">${fmtMoney(Math.floor(+J.pool || ROYALE.top))}</b>, which grows every day and is only in play on a $10,000 spin.</div>`;
      h += `<h3>Royale Billions jackpots</h3><div class="stats">${ROYALE_MAJORS.slice(0, 8).map(m => `<span>${fmtMoney(m.prize)}</span><span>${(J.hits[m.id] || 0)} hit${(J.hits[m.id] || 0) === 1 ? '' : 's'}</span>`).join('')}</div>`;
      h += '<h3>Casino record</h3>' + this.statsHTML('casino') + '<h3>Fuel & Go slot</h3>' + this.statsHTML('slots') + '<h3>Scratch cards</h3>' + this.statsHTML('scratch');
      return h;
    };
    this.open('Cashier', 'Cashier: “Chips, records, credit lines. Mostly records.”', render, () => {}, 'cashier');
  }
  openSlot(id) {
    const def = SLOT_DEFS[id]; const st = this.slotState || (this.slotState = {});
    if (def.tier !== undefined && !this.canSit(def.tier)) return;
    const sl = st[id] || (st[id] = { bet: def.bets[0], grid: null, res: null, spinning: false, stopped: 0 });
    if (!def.bets.includes(sl.bet)) sl.bet = def.bets[0];
    const rows = def.rows || 1;
    const sym = s => { const [t, c] = SLOT_GLYPH[s]; return `<span class="sym" style="color:${c}">${t}</span>`; };
    const render = () => {
      const s = this.g.save, pool = def.progressive ? this.pool(id) : 0;
      const grid = sl.grid || Array.from({ length: def.reels }, () => Array.from({ length: rows }, () => pick(SLOT_SYMS)));
      let h = `<div class="svcTop"><span>${esc(def.kind || def.where || 'SLOT')}</span><span>Bank <b class="cash clean">${fmtMoney(this.shownMoney())}</b></span>${def.progressive ? `<span>Progressive <b class="gold">${fmtMoney(pool)}</b></span>` : ''}</div>`;
      h += `<div class="slotm${def.reels === 5 ? ' five' : ''}"><div class="reels">${grid.map((col, r) => `<div class="reel${sl.spinning && r >= sl.stopped ? ' spin' : ''}">${col.map((s2, k) => `<div class="cell${sl.res && !sl.spinning && sl.res.lines.length && (def.reels === 3 || sl.res.lines.some(li => def.lines[li][r] === k)) ? ' win' : ''}">${sym(s2)}</div>`).join('')}</div>`).join('')}</div>
        <div class="lever${sl.spinning ? ' pulled' : ''}" data-act="spin"><i></i><b></b></div></div>`;
      h += `<div class="gres ${sl.res && !sl.spinning ? sl.res.cls : ''}">${sl.spinning ? '…' : sl.res ? (sl.res.win ? `WIN ${fmtMoney(sl.res.win)}${sl.res.jackpot ? ' · JACKPOT' : ''}` : 'No win') : 'Pick a bet and spin'}</div>`;
      h += `<div class="btns">${def.bets.map(b => `<button class="sbtn${sl.bet === b ? ' gold' : ''}" data-act="bet:${b}" ${sl.spinning ? 'disabled' : ''}>$${b}</button>`).join('')}<button class="sbtn gold" data-act="spin" ${sl.spinning || Money.clean < sl.bet ? 'disabled' : ''} style="min-width:110px">SPIN · $${sl.bet}</button></div>`;
      const t = def.reels === 3 ? slotTable(def, sl.bet) : null;
      h += `<details class="paytbl"><summary>Pay table at $${sl.bet}</summary>${def.reels === 3 ? `<div class="stats">${['seven', 'crown', 'diamond', 'car', 'cash', 'shoe'].map(k => `<span>${sym(k)}${sym(k)}${sym(k)}</span><span>${k === 'seven' && def.progressive ? 'PROGRESSIVE' + (def.progressive.maxOnly ? ' (max bet)' : '') : fmtMoney(t.three[k] * sl.bet)}</span>`).join('')}${Object.keys(t.two).map(k => `<span>${sym(k)}${sym(k)} ·</span><span>${fmtMoney(t.two[k] * sl.bet)}</span>`).join('')}${Object.keys(t.one).map(k => `<span>${sym(k)} · ·</span><span>${fmtMoney(t.one[k] * sl.bet)}</span>`).join('')}</div>` : `<div class="stats">${['seven', 'crown', 'diamond', 'cash', 'car', 'shoe'].map(k => `<span>${sym(k)} ×3 / ×4 / ×5</span><span>${def.pays[k].map(x => fmtMoney(x * sl.bet / def.lines.length)).join(' / ')}</span>`).join('')}<span>Lines</span><span>5 (left to right)</span></div>`}<div class="hint">Return to player over time: ${(slotRTP(def, sl.bet).rtp * 100).toFixed(1)}%${def.progressive ? ' plus the progressive pool' : ''}. The house always wins in the end.</div></details>`;
      return h + `<h3>${id === 'fuel' ? 'Slot record' : 'Casino record'}</h3>` + this.statsHTML(id === 'fuel' ? 'slots' : 'casino');
    };
    this.open(def.name, id === 'fuel' ? 'A battered cabinet next to the ice cream fridge. Pull the handle or press SPIN.' : 'Lights, bells and terrible odds.', render, a => {
      const [k, x] = a.split(':');
      if (k === 'bet') { if (!sl.spinning && def.bets.includes(+x)) { sl.bet = +x; this.refresh(); } }
      else if (k === 'spin') this.slotGo(id, sl);
    }, 'slot');
  }
  slotGo(id, sl) {
    const def = SLOT_DEFS[id]; if (sl.spinning || this.busy) return;
    const bet = sl.bet, s = this.g.save; if (Money.clean < bet) { this.refresh('Not enough cash.'); return; }
    let pool = 0;
    if (def.progressive) { pool = this.pool(id); }
    const r = slotSpin(def, bet, pool);
    if (def.progressive) { const c = this.G.casino; if (r.jackpot && r.win > 0) c.pools[id] = def.progressive.seed; else c.pools[id] = pool + bet * def.progressive.rate; }
    if (!this.settle(id === 'fuel' ? 'slots' : 'casino', bet, r.win, { slot: true, jackpot: r.jackpot && r.win > 0 })) return;
    r.cls = winClass(r.win, bet, r.jackpot ? r.win : slotTop(def, bet, pool));
    if (r.jackpot && r.win > 0) r.cls = 'jackpot';
    this.busy = true;
    sl.spinning = true; sl.stopped = 0; sl.res = r;
    this.g.audio.play('lever'); this.g.saveGame();
    const spinFx = () => { if (!sl.spinning) return; sl.grid = r.grid.map((col, i) => i < sl.stopped ? col : col.map(() => pick(SLOT_SYMS))); this.refresh(); this.later(90, spinFx); };
    sl.grid = r.grid.map(col => col.map(() => pick(SLOT_SYMS))); this.refresh(); this.later(90, spinFx);
    const stopAt = (i) => this.later(650 + i * 330, () => { sl.stopped = i + 1; this.g.audio.play('reelstop', { gain: 0.6 }); if (i === def.reels - 1) { sl.spinning = false; sl.grid = r.grid; this.busy = false; this.refresh(r.win ? `Win: ${fmtMoney(r.win)}` : 'No win.'); this.celebrate(r.cls, r.win, def.progressive ? 'PROGRESSIVE JACKPOT' : 'JACKPOT'); } });
    for (let i = 0; i < def.reels; i++) stopAt(i);
  }
  // the economic day (M9): the progressive grows from the unseen players, whether you are here or not
  tickDay(rnd = Math.random) {
    const J = this.G.jp; J.pool = Math.max(ROYALE.top, +J.pool || ROYALE.top) + Math.round(ROYALE.grow[0] + rnd() * (ROYALE.grow[1] - ROYALE.grow[0]));
    if (rnd() < ROYALE.othersWin) { const won = J.pool; J.pool = ROYALE.top; J.others = (J.others | 0) + 1; if (this.g.uw) this.g.uw.news('pv', `A visitor hit the Royale Billions progressive last night: ${fmtMoney(won)}. The pool starts again at ${fmtMoney(ROYALE.top)}.`); }
    if (this.tickSports) this.tickSports();
  }
  // ------------------------------------------------------------- wagers: any amount from the minimum to the whole bankroll
  get pref() { const G = this.G; if (!G.pref || typeof G.pref !== 'object' || Array.isArray(G.pref)) G.pref = {}; return G.pref; }
  // the table limit (M9): the Royale slot tops out at the qualifying $10,000; tables at $10,000 on the floor and
  // $250,000 at a VIP table for someone known there; the poker room's buy-in and the sportsbook follow the same two limits by Rep alone
  maxBet(game) { if (game === 'royale') return CASINO.slotMax; return (game === 'pokerBuy' || game === 'sports' || this.seat === 3) && this.g.save.rep >= CASINO.vipRep ? CASINO.vipMax : CASINO.floorMax; }
  wager(game, def) { const v = this.pref[game]; return Math.min(this.maxBet(game), typeof v === 'number' && isFinite(v) && v >= CASINO.minBet ? v : def); }
  setWager(game, v) { v = Math.floor(+v); if (!(v >= CASINO.minBet)) v = CASINO.minBet; v = Math.min(v, this.maxBet(game)); this.pref[game] = v; return v; }
  // the shared bet bar: balance, wager, what it can pay; quick amounts up to what you hold, MAX, ½, ×2 and a typed amount
  wagerHTML(game, cur, o = {}) {
    const m = Math.floor(o.avail !== undefined ? o.avail : this.shownMoney()), lock = o.lock ? 'disabled' : '';
    const quick = CASINO.quick.filter(v => v <= this.maxBet(game));
    const top = o.noTop ? '' : `<div class="wtop"><span>BALANCE<b class="cash clean">${fmtMoney(this.shownMoney())}</b></span><span>${o.label || 'BET'}<b>${fmtMoney(cur)}</b></span>${o.pays ? `<span>${o.paysLabel || 'PAYS UP TO'}<b class="gold">${o.pays}</b></span>` : ''}</div>`;
    return `<div class="wager">${top}
      <div class="wq">${quick.map(v => `<button class="sbtn${cur === v ? ' gold' : ''}" data-act="w:q:${v}" ${v > m || o.lock ? 'disabled' : ''}>$${fmtShort(v)}</button>`).join('')}<button class="sbtn${cur === m && m >= CASINO.minBet ? ' gold' : ''}" data-act="w:max" ${m < CASINO.minBet || o.lock ? 'disabled' : ''}>MAX</button></div>
      <div class="wq wc"><button class="sbtn" data-act="w:half" ${lock}>½</button><button class="sbtn" data-act="w:dbl" ${lock}>×2</button><input id="wagerIn" class="wagerIn" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" spellcheck="false" placeholder="Custom: 7500, 250k, 2.5m" aria-label="Custom amount" ${lock}><button class="sbtn gold" data-act="w:set" ${lock}>SET</button></div></div>`;
  }
  // a bet-bar action → the new wager (null when the action is not one); cap is what can still be staked
  wagerAct(game, a, cur, cap) {
    const [k, sub, x] = a.split(':'); if (k !== 'w') return null;
    const m = Math.min(this.maxBet(game), Math.floor(cap !== undefined ? cap : Money.clean));
    let v = cur;
    if (sub === 'q') v = +x; else if (sub === 'max') v = m; else if (sub === 'half') v = Math.floor(cur / 2); else if (sub === 'dbl') v = cur * 2;
    else if (sub === 'set') { const el = document.getElementById('wagerIn'); const n = parseMoney(el && el.value); if (!(n > 0)) { this.refresh('Type an amount like 7500, 250k, 2.5m or 1b.'); return cur; } v = n; }
    else return null;
    if (v > m) { v = m; if (sub === 'set' || sub === 'dbl') this.g.ui.toast(`That is more than you have. Set to ${fmtMoney(Math.max(CASINO.minBet, m))}.`, 'warn'); }
    return this.setWager(game, Math.max(CASINO.minBet, v));
  }
  debit(n) { return Money.can(n, 'casinoStake') && Money.pay(n, 'casinoStake') > 0; }
  leaveTable() {
    if (this.bj && this.bj.phase === 'play') this.bjAutoStand(true);
    if (this.pk) this.pokerLeave();
  }
  // a hand or a stack left behind by a closed page is settled on the next load
  recover() {
    const s = this.g.save, G = s.gamble, msgs = [];
    if (G.table && G.table.game === 'bj') { this.bj = { seat: G.table.seat | 0, bet: G.table.bet, hands: G.table.hands, dealer: G.table.dealer, phase: 'play', cur: 0 }; const w = this.bjAutoStand(true); msgs.push(`Your unfinished blackjack hand was stood: ${w ? 'paid ' + fmtMoney(w) : 'lost'}.`); this.bj = null; }
    G.table = null;
    if (G.casino.chips > 0) { Money.earn(G.casino.chips, 'casino'); msgs.push(`${fmtMoney(G.casino.chips)} in poker chips cashed out.`); G.casino.chips = 0; }
    this.pk = null;
    return msgs;
  }
  // ------------------------------------------------------------- blackjack: six decks, dealer stands on soft 17, blackjack pays 3:2,
  // double on any two cards, one split (split aces take one card each). Dealer checks for blackjack first.
  draw() { if (this.shoe.length < 78) { this.shoe = makeDeck(6); this.g.audio.play('card', { gain: 0.6 }); } return this.shoe.pop(); }
  openBlackjack(seat) {
    this.seat = seat | 0;
    seat = Math.max(0, seat | 0);
    if (!this.bj || this.bj.phase !== 'play') this.bj = { seat, bet: this.wager('bj', 100), hands: [], dealer: [], phase: 'bet', cur: 0, msg: '' };
    const render = () => {
      const bj = this.bj, s = this.g.save, play = bj.phase === 'play', hideHole = play || (bj.revealing && bj.shown < 2);
      const dShown = bj.revealing ? bj.dealer.slice(0, Math.max(2, bj.shown)) : bj.dealer;
      let h = `<div class="felt"><div class="who">Dealer${bj.dealer.length && !hideHole ? ' · ' + bjValue(dShown).total : ''}</div><div class="cards">${dShown.map((c, i) => cardHTML(c, hideHole && i === 1)).join('')}</div>`;
      h += bj.hands.map((hd, i) => { const v = bjValue(hd.cards); return `<div class="who${play && i === bj.cur ? ' cur' : ''}">You${bj.hands.length > 1 ? ' · hand ' + (i + 1) : ''} · ${v.total}${v.soft && v.total < 21 ? ' soft' : ''} · bet ${fmtMoney(hd.bet)}${hd.out ? ' · ' + hd.out : ''}</div><div class="cards">${hd.cards.map(c => cardHTML(c)).join('')}</div>`; }).join('');
      h += '</div>';
      h += `<div class="gres ${bj.revealing ? '' : bj.cls || ''}">${bj.revealing ? '…' : bj.msg || (play ? 'Your move.' : 'Set your bet and deal.')}</div>`;
      if (play) {
        const hd = bj.hands[bj.cur], two = hd && hd.cards.length === 2;
        const canSplit = two && bj.hands.length === 1 && Math.min(10, hd.cards[0].r === 14 ? 11 : hd.cards[0].r) === Math.min(10, hd.cards[1].r === 14 ? 11 : hd.cards[1].r) && Money.clean >= hd.bet;
        h += `<div class="wager"><div class="wtop"><span>BALANCE<b class="cash clean">${fmtMoney(this.shownMoney())}</b></span><span>ON THE TABLE<b>${fmtMoney(bj.hands.reduce((a, x) => a + x.bet, 0))}</b></span></div></div>`;
        h += `<div class="btns big"><button class="sbtn gold" data-act="hit">HIT</button><button class="sbtn gold" data-act="stand">STAND</button><button class="sbtn" data-act="double" ${two && Money.clean >= hd.bet ? '' : 'disabled'}>DOUBLE</button><button class="sbtn" data-act="split" ${canSplit ? '' : 'disabled'}>SPLIT</button></div>`;
      } else {
        h += this.wagerHTML('bj', bj.bet, { pays: fmtMoney(Math.floor(bj.bet * 2.5)), paysLabel: 'BLACKJACK PAYS', lock: bj.revealing });
        h += `<div class="btns big"><button class="sbtn gold" data-act="deal" style="min-width:160px" ${Money.clean < bj.bet || bj.revealing ? 'disabled' : ''}>DEAL · ${fmtMoney(bj.bet)}</button></div>`;
      }
      return h + '<div class="hint">Dealer stands on all 17s · Blackjack pays 3:2 · Double on any two cards · One split · Limits by room ($10,000 on the floor, $250,000 VIP once known) · Walking away mid-hand stands every hand.</div><h3>Casino record</h3>' + this.statsHTML('casino');
    };
    this.open(`Blackjack · Table ${seat + 1}`, 'Dealer: “Place your bets. Sky’s the limit tonight.”', render, a => {
      const [k] = a.split(':'), bj = this.bj;
      if (k === 'w') { if (bj.phase !== 'play' && !bj.revealing) { const v = this.wagerAct('bj', a, bj.bet); if (v !== null) { bj.bet = v; this.refresh(); } } }
      else if (k === 'deal') this.bjDeal();
      else if (bj.phase === 'play' && ['hit', 'stand', 'double', 'split'].includes(k)) this.bjAction(k);
    }, 'bj');
  }
  bjPersist() { const bj = this.bj, G = this.G; G.table = bj && bj.phase === 'play' ? { game: 'bj', seat: bj.seat | 0, bet: bj.bet, hands: bj.hands.map(h => ({ cards: h.cards.slice(), bet: h.bet, done: !!h.done, split: !!h.split })), dealer: bj.dealer.slice() } : null; }
  bjDeal() {
    const bj = this.bj; if (bj.phase === 'play' || bj.revealing) return;
    if (!(bj.bet >= CASINO.minBet) || !isFinite(bj.bet)) return;
    if (!this.debit(bj.bet)) { this.refresh('Not enough cash for that bet.'); return; }
    bj.hands = [{ cards: [this.draw(), this.draw()], bet: bj.bet }]; bj.dealer = [this.draw(), this.draw()];
    bj.phase = 'play'; bj.cur = 0; bj.msg = ''; bj.cls = '';
    this.g.audio.play('card');
    const d = bjValue(bj.dealer).total, p = bjValue(bj.hands[0].cards).total;
    if (d === 21 || p === 21) { bj.hands[0].done = true; this.bjFinish(); return; }
    this.bjPersist(); this.g.saveGame(); this.refresh('Dealer shows ' + (RANKS_TXT[bj.dealer[0].r] || bj.dealer[0].r) + '.');
  }
  bjAction(k) {
    const bj = this.bj, hd = bj.hands[bj.cur]; if (!hd || hd.done) return;
    if (k === 'hit') { hd.cards.push(this.draw()); this.g.audio.play('card'); const v = bjValue(hd.cards).total; if (v >= 21) { hd.done = true; if (v > 21) hd.out = 'BUST'; } }
    else if (k === 'stand') hd.done = true;
    else if (k === 'double') { if (hd.cards.length !== 2 || !this.debit(hd.bet)) return; hd.bet *= 2; hd.cards.push(this.draw()); hd.done = true; this.g.audio.play('chip'); if (bjValue(hd.cards).total > 21) hd.out = 'BUST'; }
    else if (k === 'split') {
      const a = hd.cards[0], b = hd.cards[1], val = c => c.r === 14 ? 11 : Math.min(10, c.r);
      if (hd.cards.length !== 2 || bj.hands.length !== 1 || val(a) !== val(b) || !this.debit(hd.bet)) return;
      const aces = a.r === 14;
      bj.hands = [{ cards: [a, this.draw()], bet: hd.bet, split: true, done: aces }, { cards: [b, this.draw()], bet: hd.bet, split: true, done: aces }];
      this.g.audio.play('chip');
    }
    while (bj.cur < bj.hands.length && bj.hands[bj.cur].done) bj.cur++;
    if (bj.cur >= bj.hands.length) { this.bjFinish(); return; }
    this.bjPersist(); this.g.saveGame(); this.refresh();
  }
  bjAutoStand(silent) { const bj = this.bj; if (!bj || bj.phase !== 'play') return 0; for (const h of bj.hands) h.done = true; return this.bjFinish(silent); }
  // the dealer plays out and every hand is paid in one step; the cards are then revealed one by one
  bjFinish(silent) {
    const bj = this.bj, d = bj.dealer;
    const live = bj.hands.some(h => bjValue(h.cards).total <= 21);
    const natural = h => !h.split && h.cards.length === 2 && bjValue(h.cards).total === 21;
    const dealerBJ = d.length === 2 && bjValue(d).total === 21;
    if (live && !dealerBJ && !(bj.hands.length === 1 && natural(bj.hands[0]))) {
      const play = () => { while (bjValue(d).total < 17) d.push(this.draw()); };
      play();
    }
    const dv = bjValue(d).total;
    let stake = 0, win = 0;
    for (const h of bj.hands) {
      const v = bjValue(h.cards).total; stake += h.bet; let w = 0;
      if (v > 21) { h.out = 'BUST'; }
      else if (natural(h) && !dealerBJ) { w = Math.floor(h.bet * 2.5); h.out = 'BLACKJACK'; } // 3:2, rounded down on odd bets
      else if (dealerBJ) { w = natural(h) ? h.bet : 0; h.out = natural(h) ? 'PUSH' : 'DEALER BLACKJACK'; }
      else if (dv > 21 || v > dv) { w = h.bet * 2; h.out = 'WIN'; }
      else if (v === dv) { w = h.bet; h.out = 'PUSH'; }
      else h.out = 'LOSE';
      win += w;
    }
    win = Math.round(win);
    this.settle('casino', stake, win, { prepaid: true, bj: true });
    bj.phase = 'done'; this.G.table = null;
    bj.cls = win > stake ? winClass(win - stake, stake, 0) : 'none';
    bj.msg = win > stake ? `You win ${fmtMoney(win - stake)}` : win === stake ? 'Push. Your bet comes back.' : `Dealer wins${dv > 21 ? '' : ' with ' + dv}. −${fmtMoney(stake - win)}`;
    this.g.saveGame();
    if (silent) return win;
    // reveal: hole card, then each dealer draw
    bj.revealing = true; bj.revealWin = win; bj.shown = 1; this.busy = true; this.refresh();
    const steps = d.length;
    for (let i = 2; i <= steps; i++) this.later(450 * (i - 1), () => { bj.shown = i; this.g.audio.play('card'); this.refresh(); });
    this.later(450 * (steps - 1) + 350, () => { bj.revealing = false; bj.shown = 99; this.busy = false; this.refresh(bj.msg); if (bj.cls !== 'none') this.celebrate(bj.cls, win - stake); else this.g.audio.play(win === stake ? 'chip' : 'deny', { gain: 0.5 }); });
    return win;
  }
  // ------------------------------------------------------------- roulette: European single zero, as many bets as you like in one spin
  openRoulette(seat) {
    this.seat = seat | 0;
    seat = Math.max(0, seat | 0);
    if (!this.roul) this.roul = { bets: {}, stack: [], hist: [], res: null, spinning: null, last: null, mode: 'add' };
    const R = this.roul, red = n => ROUL_RED.has(n);
    R.seat = seat;
    const total = () => Object.values(R.bets).reduce((a, b) => a + b, 0);
    const cell = (key, label, cls) => `<div class="rc ${cls || ''}${R.bets[key] ? ' on' : ''}" data-act="rb:${key}">${label}${R.bets[key] ? `<i>${fmtShort(R.bets[key])}</i>` : ''}</div>`;
    const render = () => {
      const s = this.g.save, spinning = !!R.spinning, tot = total(), chip = this.wager('roul', 100);
      const shown = spinning ? R.spinning.ticker : R.res ? R.res.n : null;
      let h = `<div class="rwheel${spinning ? ' spin' : ''}"><div class="rball ${shown === null ? '' : shown === 0 ? 'g' : red(shown) ? 'r' : 'b'}">${shown === null ? '–' : shown}</div><div class="rhist">${R.hist.slice(-12).map(n => `<span class="${n === 0 ? 'g' : red(n) ? 'r' : 'b'}">${n}</span>`).join('')}</div></div>`;
      const res = R.res, net = res ? res.win - res.stake : 0;
      h += `<div class="gres ${!spinning && res ? res.cls : ''}">${spinning ? 'No more bets…' : res ? `${res.n} ${res.n === 0 ? 'GREEN' : red(res.n) ? 'RED' : 'BLACK'} · ${res.win ? 'paid ' + fmtMoney(res.win) + ' · ' : ''}${net > 0 ? 'net +' + fmtMoney(net) : net < 0 ? 'net −' + fmtMoney(-net) : 'even'}` : 'Tap the layout to place chips. Tap again to add more.'}</div>`;
      h += `<div class="rtable">${cell('n:0', '0', 'g zero')}<div class="rnums">${Array.from({ length: 36 }, (_, i) => i + 1).map(n => cell('n:' + n, n, red(n) ? 'r' : 'b')).join('')}</div></div>`;
      h += `<div class="rout">${cell('d1', '1st 12')}${cell('d2', '2nd 12')}${cell('d3', '3rd 12')}${cell('c1', 'Col 1')}${cell('c2', 'Col 2')}${cell('c3', 'Col 3')}${cell('low', '1–18')}${cell('even', 'EVEN')}${cell('red', 'RED', 'r')}${cell('black', 'BLACK', 'b')}${cell('odd', 'ODD')}${cell('high', '19–36')}</div>`;
      // what the layout can do: best and worst outcome over the 37 pockets
      let best = 0, worst = Infinity, bestN = 0; if (tot) for (let n = 0; n <= 36; n++) { const p = roulettePayout(R.bets, n); if (p > best) { best = p; bestN = n; } worst = Math.min(worst, p); }
      h += `<div class="btns rmode"><button class="sbtn${R.mode === 'add' ? ' gold' : ''}" data-act="mode:add" ${spinning ? 'disabled' : ''}>＋ ADD CHIPS</button><button class="sbtn${R.mode === 'remove' ? ' gold' : ''}" data-act="mode:remove" ${spinning || !tot ? 'disabled' : ''}>－ REMOVE</button><button class="sbtn" data-act="undo" ${spinning || !R.stack.length ? 'disabled' : ''}>UNDO</button><button class="sbtn" data-act="clear" ${spinning || !tot ? 'disabled' : ''}>CLEAR ALL</button></div>`;
      h += this.wagerHTML('roul', chip, { label: 'CHIP', avail: Money.clean - tot, lock: spinning, pays: tot ? fmtMoney(best) : '', paysLabel: tot ? `BEST CASE (${bestN})` : '' });
      if (tot) h += `<div class="rbets"><div class="rbt"><span>${Object.keys(R.bets).length} bet${Object.keys(R.bets).length === 1 ? '' : 's'} · total <b>${fmtMoney(tot)}</b></span><span>worst case ${worst ? 'pays ' + fmtMoney(worst) : 'loses it all'}</span></div>${Object.entries(R.bets).map(([k2, a2]) => `<span class="rbi">${roulLabel(k2)} <b>${fmtMoney(a2)}</b> <small>pays ${fmtMoney(a2 * roulMult(k2))}</small></span>`).join('')}</div>`;
      h += `<div class="btns big"><button class="sbtn" data-act="rebet" ${spinning || !R.last || tot ? 'disabled' : ''}>REBET</button><button class="sbtn gold" data-act="rspin" style="min-width:140px" ${spinning || !tot || tot > Money.clean ? 'disabled' : ''}>SPIN · ${fmtMoney(tot)}</button></div>`;
      return h + `<div class="hint">Straight up 35:1 · Dozens and columns 2:1 · Red/black, odd/even, 1–18/19–36 1:1 · Cover as much of the table as you like; the only limit is your cash.</div><h3>Casino record</h3>` + this.statsHTML('casino');
    };
    this.open(`Roulette · Table ${seat + 1}`, 'Croupier: “Faites vos jeux.”', render, a => {
      const [k, x, y] = a.split(':');
      if (R.spinning) return;
      if (k === 'w') { const v = this.wagerAct('roul', a, this.wager('roul', 100), Math.max(CASINO.minBet, Money.clean - total())); if (v !== null) this.refresh(); }
      else if (k === 'mode') { R.mode = x === 'remove' ? 'remove' : 'add'; this.refresh(); }
      else if (k === 'rb') {
        const key = y !== undefined ? x + ':' + y : x; if (!ROUL_KEYS.has(key)) return;
        const chip = this.wager('roul', 100);
        if (R.mode === 'remove') { const cur = R.bets[key] || 0; if (!cur) return; const d = Math.min(cur, chip); if (cur - d > 0) R.bets[key] = cur - d; else delete R.bets[key]; R.stack.push([key, -d]); if (!total()) R.mode = 'add'; this.g.audio.play('chip', { gain: 0.4 }); this.refresh(); return; }
        if (total() + chip > Money.clean) { this.refresh('Not enough cash for another chip of that size.'); return; }
        R.bets[key] = (R.bets[key] || 0) + chip; R.stack.push([key, chip]); R.res = null; this.g.audio.play('chip', { gain: 0.6 }); this.refresh();
      }
      else if (k === 'undo') { const u = R.stack.pop(); if (u) { const [key, d] = u, v = (R.bets[key] || 0) - d; if (v > 0) R.bets[key] = v; else delete R.bets[key]; this.refresh(); } }
      else if (k === 'clear') { R.bets = {}; R.stack = []; R.mode = 'add'; this.refresh(); }
      else if (k === 'rebet') { const sum = Object.values(R.last).reduce((a2, b) => a2 + b, 0); if (sum <= Money.clean) { R.bets = { ...R.last }; R.stack = Object.entries(R.bets); this.refresh(); } else this.refresh('Not enough cash to repeat that layout.'); }
      else if (k === 'rspin') this.roulSpin();
    }, 'roul');
  }
  roulSpin() {
    const R = this.roul, stake = Object.values(R.bets).reduce((a, b) => a + b, 0);
    if (R.spinning || !(stake >= CASINO.minBet)) { if (stake && stake < CASINO.minBet) this.refresh(`Minimum ${fmtMoney(CASINO.minBet)} a spin.`); return; }
    const n = roulettePick(R.bets), win = roulettePayout(R.bets, n);
    if (!this.settle('casino', stake, win, { roul: true })) { this.refresh('Not enough cash.'); return; }
    R.last = { ...R.bets }; R.bets = {}; R.stack = []; R.mode = 'add';
    R.spinning = { n, win, stake, ticker: Math.floor(Math.random() * 37) }; R.res = null; this.busy = true;
    this.g.audio.play('lever', { gain: 0.5 }); this.g.saveGame(); this.refresh();
    let delay = 60, at = 0;
    const tick = () => { if (!R.spinning) return; R.spinning.ticker = ROUL_WHEEL[(ROUL_WHEEL.indexOf(R.spinning.ticker) + 1) % 37]; this.g.audio.play('reelstop', { gain: 0.15 }); this.refresh(); };
    while (at < 2300) { this.later(at, tick); at += delay; delay *= 1.09; }
    this.later(at + 150, () => {
      R.hist.push(n); R.spinning = null; this.busy = false;
      const net = win - stake;
      R.res = { n, win, stake, cls: net > 0 ? winClass(net, stake, 0) : 'none' };
      this.refresh(net > 0 ? `${n}. You are up ${fmtMoney(net)}.` : win ? `${n} pays ${fmtMoney(win)}, but the table took ${fmtMoney(-net)}.` : `${n}. The house takes it.`);
      if (net > 0) this.celebrate(R.res.cls, net); else this.g.audio.play('deny', { gain: 0.4 });
    });
  }
  // ------------------------------------------------------------- Texas Hold'em, no limit, one table: you choose the buy-in and the blinds;
  // the three regulars sit with stacks in the same range as yours. No rake. Chips live in the save while you sit;
  // leaving, closing the screen or reloading cashes them out. A hand you walk away from is played out check/fold.
  pokerBlind(buy, depth) { const raw = buy / depth; if (raw < 2) return 2; const p = Math.pow(10, Math.floor(Math.log10(raw)) - 1); return Math.max(2, Math.round(raw / p / 2) * p * 2); }
  openPoker() {
    const render = () => {
      const pk = this.pk, s = this.g.save;
      if (!pk) {
        const buy = this.wager('pokerBuy', 1000), depth = [20, 50, 100].includes(this.pref.pokerDepth) ? this.pref.pokerDepth : 50, bb = this.pokerBlind(buy, depth);
        let h = `<div class="hint">One no-limit table. Choose your buy-in, then how deep you play: the blinds follow from both. The regulars bring stacks to match.</div>`;
        h += this.wagerHTML('pokerBuy', buy, { label: 'BUY-IN', pays: `${fmtMoney(bb / 2)} / ${fmtMoney(bb)}`, paysLabel: 'BLINDS' });
        h += `<div class="btns">${[[100, 'DEEP · 100 big blinds'], [50, 'STANDARD · 50'], [20, 'SHORT · 20']].map(([d, l]) => `<button class="sbtn${depth === d ? ' gold' : ''}" data-act="depth:${d}">${l}</button>`).join('')}</div>`;
        h += `<div class="grid2">${POKER_AI.map(a => `<div class="card"><div class="t">${a.name}</div><div class="d">${a.desc}</div></div>`).join('')}</div>`;
        h += `<div class="btns big"><button class="sbtn gold" data-act="sit" style="min-width:170px" ${Money.clean < buy || buy < 200 ? 'disabled' : ''}>TAKE A SEAT · ${fmtMoney(buy)}</button></div>${buy < 200 ? '<div class="hint">The minimum buy-in is $200.</div>' : ''}`;
        return h + '<h3>Casino record</h3>' + this.statsHTML('casino');
      }
      const showAll = pk.phase === 'show';
      let h = `<div class="svcTop"><span>Blinds <b>${fmtMoney(pk.bb / 2)} / ${fmtMoney(pk.bb)}</b></span><span>Bank <b class="cash clean">${fmtMoney(Money.clean)}</b></span><span>Your chips <b class="gold">${fmtMoney(pk.seats[0].stack)}</b></span></div>`;
      h += `<div class="felt poker"><div class="board">${pk.board.map(c => cardHTML(c)).join('') || '<span class="hint">—</span>'}</div><div class="pot">Pot ${fmtMoney(pk.pot + pk.seats.reduce((a, x) => a + x.put, 0))}</div>`;
      h += `<div class="seats">${pk.seats.map((x, i) => `<div class="seat${i === pk.toAct && pk.phase === 'play' ? ' cur' : ''}${x.folded ? ' out' : ''}${x.won ? ' won' : ''}"><div class="who">${i === pk.btn ? '<b class="btn">D</b> ' : ''}${esc(x.name)}${x.isP ? '' : ` <small>${x.pers}</small>`}</div><div class="cards">${x.hole.map(c => cardHTML(c, !x.isP && !(showAll && !x.folded))).join('')}</div><div class="d">$${fmtShort(x.stack)}${x.put ? ' · bet $' + fmtShort(x.put) : ''}${x.allin ? ' · ALL IN' : ''}</div><div class="act">${esc(x.last || '')}</div></div>`).join('')}</div></div>`;
      h += `<div class="gres ${pk.cls || ''}">${esc(pk.msg || '')}</div>`;
      const me = pk.seats[0];
      if (pk.phase === 'play' && pk.toAct === 0) {
        const toCall = Math.max(0, pk.curBet - me.put), opts = this.pkRaiseOptions();
        h += `<div class="btns big"><button class="sbtn" data-act="fold">FOLD</button><button class="sbtn gold" data-act="call">${toCall ? 'CALL ' + fmtMoney(Math.min(toCall, me.stack)) : 'CHECK'}</button></div>`;
        h += `<div class="btns pkr">${opts.map(o => `<button class="sbtn${o.allin ? ' danger' : ''}" data-act="raise:${o.to}">${o.label}<small>${fmtMoney(o.to - me.put)}</small></button>`).join('') || '<span class="hint">No raise possible.</span>'}</div>`;
      } else if (pk.phase !== 'play') {
        h += `<div class="btns big"><button class="sbtn gold" data-act="deal" ${me.stack < pk.bb ? 'disabled' : ''}>NEXT HAND</button><button class="sbtn" data-act="topup" ${Money.clean < 1 || me.stack >= pk.buy ? 'disabled' : ''}>REBUY TO ${fmtMoney(pk.buy)}</button><button class="sbtn" data-act="leave">CASH OUT</button></div>`;
      } else h += '<div class="btns"><button class="sbtn" disabled>…</button></div>';
      return h + '<h3>Casino record</h3>' + this.statsHTML('casino');
    };
    this.open(`Hold'em · No Limit`, 'Dealer: “Blinds are up. Good luck.”', render, a => {
      const [k, x] = a.split(':'), pk = this.pk;
      if (!pk) {
        if (k === 'w') { const v = this.wagerAct('pokerBuy', a, this.wager('pokerBuy', 1000)); if (v !== null) this.refresh(); }
        else if (k === 'depth') { if ([20, 50, 100].includes(+x)) { this.pref.pokerDepth = +x; this.refresh(); } }
        else if (k === 'sit') this.pokerSit(this.wager('pokerBuy', 1000), [20, 50, 100].includes(this.pref.pokerDepth) ? this.pref.pokerDepth : 50);
        return;
      }
      if (k === 'deal') { if (pk.phase !== 'play') this.pokerHand(); }
      else if (k === 'topup') { const need = Math.min(pk.buy - pk.seats[0].stack, Math.floor(Money.clean)); if (pk.phase !== 'play' && need > 0 && this.debit(need)) { pk.seats[0].stack += need; this.G.casino.chips = pk.seats[0].stack; this.g.saveGame(); this.refresh(); } }
      else if (k === 'leave') { if (pk.phase !== 'play') { this.pokerLeave(); this.refresh('Chips cashed out.'); } }
      else if (pk.phase === 'play' && pk.toAct === 0 && ['fold', 'call', 'raise'].includes(k)) { this.pokerAct(0, k, +x); this.pokerRun(); }
    }, 'poker');
  }
  pokerSit(buy, depth) {
    buy = Math.floor(buy);
    if (this.pk || !(buy >= 200) || !this.debit(buy)) { this.refresh('Not enough cash.'); return; }
    const bb = this.pokerBlind(buy, depth), ai = pickN(POKER_AI, 3);
    const aiStack = () => Math.max(bb * 10, Math.round(buy * rand(0.6, 1.6) / bb) * bb);
    this.pk = { bb, buy, depth, seats: [{ name: 'You', isP: true, stack: buy, hole: [], put: 0, total: 0 }, ...ai.map(a => ({ ...a, name: a.name, stack: aiStack(), hole: [], put: 0, total: 0 }))], btn: Math.floor(Math.random() * 4), board: [], pot: 0, phase: 'idle', msg: 'You take a seat.', toAct: -1 };
    this.G.casino.chips = buy; this.g.audio.play('chip'); this.g.saveGame();
    this.pokerHand();
  }
  pokerLeave() {
    const pk = this.pk; if (!pk) return;
    if (pk.phase === 'play') { pk.walk = true; let guard = 0; while (pk.phase === 'play' && guard++ < 400) { if (pk.toAct === 0) this.pokerAct(0, pk.curBet > pk.seats[0].put ? 'fold' : 'call'); else { const d = this.pokerAI(pk.toAct, true); this.pokerAct(pk.toAct, d.kind, d.to); } } }
    const st = pk.seats[0].stack;
    if (st > 0) Money.earn(st, 'casino'); this.G.casino.chips = 0; this.pk = null; this.g.saveGame();
    if (st) this.g.ui.toast(`Cashed out ${fmtMoney(st)} in chips.`, 'money');
  }
  pkActive() { return this.pk.seats.filter(x => !x.folded && !x.sitout); }
  pkMinRaise() { const pk = this.pk; return Math.max(pk.bb, pk.lastRaise || pk.bb); }
  // the raise sizes offered to the player: the minimum, half the pot, the pot, all in (as the total to have in front)
  pkRaiseOptions() {
    const pk = this.pk, me = pk.seats[0], toCall = Math.max(0, pk.curBet - me.put), cap = me.put + me.stack;
    if (me.stack <= toCall || pk.raises >= 6) return [];
    const pot = pk.pot + pk.seats.reduce((a, x) => a + x.put, 0) + toCall, out = [], seen = new Set();
    const add = (label, to) => { to = Math.min(cap, Math.round(to)); if (to <= pk.curBet || seen.has(to)) return; seen.add(to); out.push({ label, to, allin: to >= cap }); };
    add(pk.curBet ? 'MIN RAISE' : 'MIN BET', pk.curBet + this.pkMinRaise());
    add('½ POT', pk.curBet + Math.max(this.pkMinRaise(), pot / 2));
    add('POT', pk.curBet + Math.max(this.pkMinRaise(), pot));
    add('ALL IN', cap);
    for (const o of out) if (o.allin) o.label = 'ALL IN';
    return out;
  }
  // an honest shuffle every hand
  pokerDeck() { return makeDeck(1); }
  pokerHand() {
    const pk = this.pk, bb = pk.bb, n = pk.seats.length;
    for (const x of pk.seats) if (!x.isP && x.stack < bb * 2) { const fresh = pick(POKER_AI.filter(a => !pk.seats.some(y => y.name === a.name))) || POKER_AI[0]; Object.assign(x, { ...fresh, stack: Math.max(bb * 10, Math.round(pk.buy * rand(0.6, 1.6) / bb) * bb) }); }
    const me = pk.seats[0];
    if (me.stack < bb) { pk.phase = 'idle'; this.refresh('You need more chips to play a hand.'); return; }
    pk.btn = (pk.btn + 1) % n;
    pk.deck = this.pokerDeck(); pk.board = []; pk.pot = 0; pk.street = 0; pk.cls = ''; pk.msg = '';
    for (const x of pk.seats) { x.hole = [pk.deck.pop(), pk.deck.pop()]; x.put = 0; x.total = 0; x.folded = false; x.allin = false; x.last = ''; x.won = false; x.sitout = false; }
    const post = (i, amt) => { const x = pk.seats[i], a = Math.min(amt, x.stack); x.stack -= a; x.put += a; x.total += a; if (!x.stack) x.allin = true; x.last = a === bb ? 'big blind' : 'small blind'; };
    post((pk.btn + 1) % n, bb / 2); post((pk.btn + 2) % n, bb);
    pk.curBet = bb; pk.raises = 1; pk.lastRaise = bb;
    pk.pending = new Set(pk.seats.map((x, i) => i).filter(i => !pk.seats[i].allin));
    pk.toAct = (pk.btn + 3) % n; pk.phase = 'play';
    this.G.casino.chips = me.stack; this.g.audio.play('card'); this.g.saveGame();
    this.pokerAdvanceTo();
    this.pokerRun();
  }
  // move toAct to the next seat that still has to act
  pokerAdvanceTo() {
    const pk = this.pk, n = pk.seats.length;
    for (let k = 0; k < n; k++) { const i = (pk.toAct + k) % n; if (pk.pending.has(i)) { pk.toAct = i; return; } }
    pk.toAct = -1;
  }
  // kind: fold / call / raise; for a raise, `to` is the total this seat will have in front of it this street
  pokerAct(i, kind, to) {
    const pk = this.pk, x = pk.seats[i], n = pk.seats.length;
    if (pk.phase !== 'play' || pk.toAct !== i) return;
    const toCall = Math.max(0, pk.curBet - x.put);
    if (kind === 'fold' && toCall === 0) kind = 'call';
    if (kind === 'raise' && (pk.raises >= 6 || x.stack <= toCall)) kind = 'call';
    if (kind === 'fold') { x.folded = true; x.last = 'fold'; }
    else if (kind === 'call') { const a = Math.min(toCall, x.stack); x.stack -= a; x.put += a; x.total += a; x.last = toCall ? (a < toCall ? 'all in' : 'call') : 'check'; if (!x.stack) x.allin = true; }
    else {
      let target = isFinite(to) ? Math.round(to) : pk.curBet + this.pkMinRaise();
      target = Math.max(target, Math.min(x.put + x.stack, pk.curBet + this.pkMinRaise()));
      const a = Math.min(target - x.put, x.stack); x.stack -= a; x.put += a; x.total += a;
      x.last = (pk.curBet ? 'raise' : 'bet') + (x.stack ? ' ' + fmtShort(x.put) : ' (all in)'); if (!x.stack) x.allin = true;
      if (x.put > pk.curBet) { pk.lastRaise = Math.max(pk.lastRaise || pk.bb, x.put - pk.curBet); pk.curBet = x.put; pk.raises++; pk.pending = new Set(pk.seats.map((y, j) => j).filter(j => j !== i && !pk.seats[j].folded && !pk.seats[j].allin)); }
    }
    pk.pending.delete(i);
    if (i === 0) { this.G.casino.chips = x.stack; this.g.audio.play(kind === 'fold' ? 'ui' : 'chip', { gain: 0.6 }); }
    const live = pk.seats.filter(y => !y.folded);
    if (live.length === 1) { this.pokerShowdown(); return; }
    if (!pk.pending.size) { this.pokerStreet(); return; }
    pk.toAct = (i + 1) % n; this.pokerAdvanceTo();
  }
  pokerStreet() {
    const pk = this.pk, n = pk.seats.length;
    for (const x of pk.seats) { pk.pot += x.put; x.put = 0; if (!x.folded) x.last = x.allin ? 'all in' : ''; }
    pk.curBet = 0; pk.raises = 0; pk.lastRaise = pk.bb;
    if (pk.street === 3) { this.pokerShowdown(); return; }
    pk.street++;
    pk.deck.pop(); if (pk.street === 1) pk.board.push(pk.deck.pop(), pk.deck.pop(), pk.deck.pop()); else pk.board.push(pk.deck.pop());
    const canAct = pk.seats.map((x, j) => j).filter(j => !pk.seats[j].folded && !pk.seats[j].allin);
    if (canAct.length < 2) { while (pk.board.length < 5) { pk.deck.pop(); pk.board.push(pk.deck.pop()); } pk.street = 3; this.pokerShowdown(); return; }
    pk.pending = new Set(canAct); pk.toAct = (pk.btn + 1) % n; this.pokerAdvanceTo();
  }
  // main and side pots by contribution level; ties split. No rake.
  pokerShowdown() {
    const pk = this.pk, bb = pk.bb;
    for (const x of pk.seats) { pk.pot += x.put; x.put = 0; }
    const live = pk.seats.filter(x => !x.folded);
    const score = new Map(live.map(x => [x, live.length > 1 ? bestOf([...x.hole, ...pk.board]) : 0]));
    const levels = [...new Set(pk.seats.map(x => x.total).filter(v => v > 0))].sort((a, b) => a - b);
    let prev = 0; const paid = new Map();
    for (const L of levels) {
      let part = 0; for (const x of pk.seats) part += Math.max(0, Math.min(x.total, L) - prev);
      const elig = live.filter(x => x.total >= L);
      prev = L; if (!part) continue;
      // nobody still in the hand put this much in: it goes back to the deepest live player(s)
      if (!elig.length) { const top = Math.max(...live.map(x => x.total)); elig.push(...live.filter(x => x.total === top)); }
      const best = Math.max(...elig.map(x => score.get(x))), winners = elig.filter(x => score.get(x) === best);
      const share = Math.floor(part / winners.length); let odd = part - share * winners.length;
      for (const w of winners) { paid.set(w, (paid.get(w) || 0) + share + (odd > 0 ? 1 : 0)); odd--; }
    }
    for (const [x, v] of paid) { x.stack += Math.round(v); if (v > 0 && !x.folded) x.won = true; }
    const me = pk.seats[0], put = me.total, got = Math.round(paid.get(me) || 0);
    const C = this.G.casino; C.pokerHands++; C.wagered += put; C.won += got; C.lost += Math.max(0, put - got); C.biggest = Math.max(C.biggest, got - put); if (got > put) C.pokerWins++;
    this.G.casino.chips = me.stack;
    pk.lastNet = got - put; pk.lastFolded = !!me.folded;
    const win = pk.seats.filter(x => x.won);
    const name = x => live.length > 1 ? HAND_NAMES[handCat(score.get(x))] : '';
    pk.msg = win.map(x => `${x.isP ? 'You win' : x.name + ' wins'} ${fmtMoney(paid.get(x))}${name(x) ? ' with ' + name(x).toLowerCase() : ''}`).join(' · ');
    pk.cls = me.won && got > put ? winClass(got - put, Math.max(put, bb), 0) : '';
    pk.phase = live.length > 1 ? 'show' : 'done'; pk.toAct = -1; pk.pot = 0;
    this.g.saveGame();
    if (!pk.walk && !pk.sim) { if (me.won && got > put) this.celebrate(pk.cls, got - put); this.refresh(); }
  }
  // AI turns play out with a short pause each, so the table reads like a table
  pokerRun() {
    const pk = this.pk; if (!pk) return;
    this.refresh();
    if (pk.phase !== 'play' || pk.toAct === 0) return;
    this.busy = true;
    this.later(rand(450, 800), () => { if (this.pk !== pk || pk.phase !== 'play' || pk.toAct <= 0) { this.busy = false; this.refresh(); return; } const d = this.pokerAI(pk.toAct); this.pokerAct(pk.toAct, d.kind, d.to); this.busy = pk.phase === 'play' && pk.toAct !== 0; if (this.busy) this.pokerRun(); else this.refresh(); });
  }
  // the regulars read their equity against the live hands and the price, and size bets off the pot
  pokerAI(i, quick) {
    const pk = this.pk, x = pk.seats[i], opp = pk.seats.filter((y, j) => j !== i && !y.folded).length;
    const toCall = Math.max(0, pk.curBet - x.put), minR = this.pkMinRaise();
    const pot = pk.pot + pk.seats.reduce((a, y) => a + y.put, 0);
    let eq = pokerEquity(x.hole, pk.board, Math.max(1, opp), quick ? 40 : 110);
    eq += x.loose * 0.12 * (pk.street === 0 ? 1 : 0.5);
    const fair = 1 / (opp + 1), odds = toCall / (pot + toCall || 1);
    const bluff = Math.random() < x.bluff * (pk.street >= 1 ? 1 : 0.4);
    const rThresh = fair * (1.75 - x.aggr * 0.75) + x.tight * 0.08;
    if ((eq > rThresh || bluff) && pk.raises < 6 && x.stack > toCall && Math.random() < 0.55 + x.aggr * 0.4) {
      const strong = eq > rThresh * 1.35, shove = eq > 0.78 && Math.random() < 0.3;
      const to = shove ? x.put + x.stack : pk.curBet + Math.max(minR, Math.round(pot * (strong ? rand(0.75, 1.1) : rand(0.4, 0.65))));
      return { kind: 'raise', to };
    }
    if (toCall === 0) return { kind: 'call' };
    const big = toCall > x.stack * 0.5 ? 0.08 : 0; // a call for most of the stack needs a little more
    if (eq >= odds * (1 + x.tight * 0.7) + big + (pk.street === 0 ? x.tight * 0.06 : 0) || (toCall <= pk.bb * 2 && Math.random() < x.loose)) return { kind: 'call' };
    return { kind: 'fold' };
  }
  // ------------------------------------------------------------- Royale Billions: the casino's slot
  royaleBetStep(bet, dir) {
    const L = []; for (let e = 1; e <= 12; e++) for (const m of [1, 2, 5]) L.push(m * Math.pow(10, e)); // $10 .. $5T
    const m = Math.floor(Money.clean);
    if (dir > 0) { const n = L.find(v => v > bet); return Math.max(CASINO.minBet, Math.min(n || bet, Math.max(CASINO.minBet, m))); }
    let n = CASINO.minBet; for (const v of L) if (v < bet) n = v; return n;
  }
  royaleCell(sym, cls) { if (sym === 'royal') return `<div class="ryc royal${cls || ''}"><span>♛</span></div>`; const [t, c] = SLOT_GLYPH[sym]; return `<div class="ryc${cls || ''}" style="color:${c}"><span${t.length > 1 ? ' class="w"' : ''}>${t}</span></div>`; }
  royaleRandCol(n) { const a = []; for (let i = 0; i < n; i++) a.push(Math.random() < 0.04 ? 'royal' : pick(ROYALE_FILL)); return a; }
  royaleHTML() {
    const ry = this.ry, s = this.g.save, J = this.G.jp, bet = ry.bet;
    const grid = ry.grid || (ry.grid = [0, 1, 2, 3, 4].map(() => this.royaleRandCol(3)));
    const res = !ry.spinning && ry.res ? ry.res : null, hitCells = new Set();
    if (res) for (const L of res.lines) for (let r = 0; r < L.n; r++) hitCells.add(r + ':' + SLOT_LINES5[L.li][r]);
    const bulbs = n => Array.from({ length: n }, (_, i) => `<i style="animation-delay:${(-i * 0.09).toFixed(2)}s"></i>`).join('');
    const lines = SLOT_LINES5.map((L, li) => `<polyline class="ln${res && res.lines.some(x => x.li === li) ? ' on' : ''}" points="${L.map((row, r) => `${50 + r * 100},${50 + row * 100}`).join(' ')}"/>`).join('');
    let h = `<div class="ryl"><div class="rylCab ${ry.spinning ? 'spin' : res && res.win ? 'w-' + res.cls : 'idle'}" id="rylCab">
      <div class="rylBulbs">${bulbs(18)}</div>
      <div class="rylMarq"><span class="rylName">ROYALE BILLIONS</span><span class="rylMax">PROGRESSIVE <b>${fmtMoney(Math.floor(+this.G.jp.pool || ROYALE.top))}</b></span></div>
      <div class="rylWin"><span id="rylTier">${res && res.major >= 0 ? ROYALE_MAJORS[res.major].name : res && res.win ? 'WIN' : ry.spinning ? 'GOOD LUCK' : 'WIN'}</span><b id="rylWinV">${res && res.win ? fmtMoney(res.win) : '$0'}</b></div>
      <div class="rylGlass"><div class="rylReels" id="rylReels">${grid.map((col, r) => `<div class="ryr" data-r="${r}"><div class="rys">${col.map((sy, w) => this.royaleCell(sy, hitCells.has(r + ':' + w) ? ' hit' : '')).join('')}</div></div>`).join('')}</div><svg class="rylLines" viewBox="0 0 500 300" preserveAspectRatio="none">${lines}</svg></div>
      <div class="rylBulbs">${bulbs(18)}</div></div></div>`;
    h += `<div class="rylBar"><div><span>BALANCE</span><b class="cash clean" id="rylBal">${fmtFit(this.shownMoney())}</b></div><div><span>BET</span><b>${fmtFit(bet)}</b></div><div><span>WIN</span><b class="money" id="rylLast">${res && res.win ? fmtFit(res.win) : '$0'}</b></div></div>`;
    h += `<div class="btns rylCtl"><button class="sbtn" data-act="ry:down" ${ry.spinning ? 'disabled' : ''} aria-label="Lower bet">−</button><button class="sbtn gold rylSpin" data-act="ry:spin" ${ry.spinning || Money.clean < bet ? 'disabled' : ''}>SPIN</button><button class="sbtn" data-act="ry:up" ${ry.spinning ? 'disabled' : ''} aria-label="Raise bet">+</button></div>`;
    h += this.wagerHTML('royale', bet, { lock: ry.spinning, noTop: true });
    h += `<div class="btns"><button class="sbtn${ry.info ? ' gold' : ''}" data-act="ry:info">${ry.info ? 'HIDE INFO' : 'INFO / PAYTABLE'}</button></div>`;
    if (ry.info) {
      const ch = royaleChances(bet), every = royaleEvery(bet), live = royaleLive(bet, J), sc = royaleBaseScale(bet), hrs = n => { const h = n / ROYALE.sph; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 100 ? `${h < 10 ? h.toFixed(1) : Math.round(h)} h` : `${Math.round(h).toLocaleString('en-US')} h`; }, nm = { seven: 'seven', crown: 'crown', diamond: 'diamond', car: 'car', cash: 'cash', shoe: 'horseshoe' };
      h += `<div class="rylInfo"><h3>Line pays at ${fmtMoney(bet)}</h3><div class="stats">${ROYALE_SYMS.map(k => `<span>${this.royaleCell(k, ' mini')} ${nm[k]} ×3 / ×4 / ×5</span><span>${ROYALE_PAY[k].map(x => fmtMoney(Math.round(x * sc * bet))).join(' / ')}</span>`).join('')}</div>
        <div class="hint">Five lines: the three rows and two V shapes, read from the left reel. Every winning line on a spin is paid.</div>
        <h3>Jackpots</h3><div class="stats">${ROYALE_MAJORS.map((m, t) => `<span>${this.royaleCell('royal', ' mini')} ${fmtMoney(m.id === 'm1b' ? Math.floor(+this.G.jp.pool || ROYALE.top) : m.prize)}${m.id === 'm1b' ? ' (progressive · $10,000 spins only)' : ''}</span><span>${ch[t] ? `on average every ${hrs(every[t])} of play${live[t] > ch[t] * 1.05 ? ` · <b style="color:var(--gold, #ffd84d)">due: ×${(live[t] / ch[t]).toFixed(1)}</b>` : ''}` : m.id === 'm1b' && bet < ROYALE.qualify ? 'only on a ' + fmtMoney(ROYALE.qualify) + ' spin' : 'needs a bet of ' + fmtMoney(m.prize / ROYALE.minRatio) + ' or less'}</span>`).join('')}</div>
        <div class="hint">Five jackpot crowns on the middle line. Every spin rolls every jackpot that is at least five times your bet, independently, so any spin can hit any of them, even twice in a row. These are long-run averages at about ${ROYALE.sph.toLocaleString('en-US')} spins an hour, never a schedule, and the chance grows with the bet in proportion: the machine keeps its edge at every stake. A jackpot that hasn’t landed for a while gets more likely (“due”) until it does. The billion is a progressive: it grows every day, with or without you, and only a ${fmtMoney(ROYALE.qualify)} spin can win it.</div>
        <h3>Your record</h3><div class="stats"><span>Spins</span><span>${(J.spins || 0).toLocaleString('en-US')}</span><span>Biggest win</span><span>${fmtMoney(J.biggest || 0)}</span>${ROYALE_MAJORS.filter(m => J.hits[m.id]).map(m => `<span>${fmtMoney(m.prize)} hits</span><span>${J.hits[m.id]}</span>`).join('')}</div></div>`;
    }
    return h;
  }
  openRoyale() {
    if (!this.ry) this.ry = { bet: this.wager('royale', 100), res: null, spinning: false, info: false, grid: null };
    const ry = this.ry;
    this.open('Royale Billions', 'Pick a bet and SPIN. Every spin can hit every jackpot, up to a billion.', () => this.royaleHTML(), a => {
      const [k, x] = a.split(':');
      if (ry.spinning) return;
      if (k === 'w') { const v = this.wagerAct('royale', a, ry.bet); if (v !== null) { ry.bet = v; this.refresh(); } }
      else if (k === 'ry' && x === 'spin') this.royaleGo();
      else if (k === 'ry' && (x === 'up' || x === 'down')) { ry.bet = this.setWager('royale', this.royaleBetStep(ry.bet, x === 'up' ? 1 : -1)); this.refresh(); }
      else if (k === 'ry' && x === 'info') { ry.info = !ry.info; this.refresh(); }
    }, 'royale');
  }
  // the spin is settled (money, jackpot pressure, records, save) before a single reel moves
  royaleGo() {
    const ry = this.ry, s = this.g.save, bet = ry.bet, J = this.G.jp;
    if (!ry || ry.spinning || this.busy || !(bet >= CASINO.minBet)) return;
    if (Money.clean < bet) { this.refresh('Not enough cash for that bet.'); return; }
    const r = royaleSpin(bet, J);
    if (!this.settle('casino', bet, r.win, { slot: true, jackpot: r.major >= 0 })) return;
    J.spins = (J.spins || 0) + 1; J.wagered = (J.wagered || 0) + bet; J.won = (J.won || 0) + r.win; J.biggest = Math.max(J.biggest || 0, r.win);
    if (r.major >= 0) J.last = { id: ROYALE_MAJORS[r.major].id, day: this.g.uw ? this.g.uw.day | 0 : 0 };
    r.cls = royaleClass(r.win, bet, r.major);
    ry.res = r; ry.spinning = true; this.busy = true;
    this.g.saveGame();
    this.g.audio.play('lever');
    const body = $('svcBody'), cab = body.querySelector('#rylCab');
    if (!cab) { this.refresh(); }
    const q = sel => body.querySelector(sel);
    const setCab = c => { const el = q('#rylCab'); if (el) el.className = 'rylCab ' + c; };
    setCab('spin');
    body.querySelectorAll('.ryl .ln').forEach(el => el.classList.remove('on'));
    const tier = q('#rylTier'), wv = q('#rylWinV'); if (tier) tier.textContent = 'GOOD LUCK'; if (wv) wv.textContent = '$0';
    const bal = q('#rylBal'); if (bal) bal.textContent = fmtFit(this.shownMoney());
    body.querySelectorAll('[data-act^="ry:"],[data-act^="w:"]').forEach(b => { b.disabled = true; });
    const reels = [...body.querySelectorAll('.ryr')];
    for (const el of reels) { el.classList.remove('land'); el.classList.add('spin'); const col = this.royaleRandCol(12); el.firstElementChild.innerHTML = [...col, ...col].map(sy => this.royaleCell(sy)).join(''); }
    // the reels stop left to right; when the first two show a jackpot crown on the middle line the rest hold on longer
    const tease = r.grid[0][1] === 'royal' && r.grid[1][1] === 'royal';
    let at = 750;
    for (let i = 0; i < 5; i++) {
      const stopAt = at;
      this.later(stopAt, () => {
        const el = reels[i]; if (el && el.isConnected) { el.classList.remove('spin'); el.firstElementChild.innerHTML = r.grid[i].map(sy => this.royaleCell(sy)).join(''); void el.offsetWidth; el.classList.add('land'); }
        this.g.audio.play('reelstop', { gain: 0.6 + (tease && i >= 2 ? 0.25 : 0) });
        if (tease && i === 1) setCab('spin tease');
        if (i === 4) this.royaleReveal();
      });
      at += 300 + (tease && i >= 1 ? 650 + i * 150 : 0);
    }
  }
  royaleReveal() {
    const ry = this.ry, r = ry.res; if (!ry.spinning) return;
    ry.spinning = false; ry.grid = r.grid; this.busy = false;
    this.refresh(r.win ? (r.major >= 0 ? `${ROYALE_MAJORS[r.major].name}! ${fmtMoney(r.win)}` : `Win: ${fmtMoney(r.win)}`) : r.teaser >= 3 ? 'So close.' : 'No win.');
    // the win meter counts up, longer for bigger wins
    const dur = { none: 0, small: 450, medium: 1000, large: 1900, mega: 3600, billion: 6500 }[r.cls] || 0;
    const el = $('svcBody').querySelector('#rylWinV');
    if (el && dur) { const t0 = performance.now(); el.textContent = '$0'; const step = now => { if (!el.isConnected) return; const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmtMoney(r.win * e); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
    if (r.cls === 'none') { this.g.audio.play('deny', { gain: 0.4 }); return; }
    const title = r.major >= 0 ? ROYALE_MAJORS[r.major].name : 'BIG WIN';
    this.celebrate(r.cls, r.win, title);
  }
}
// short labels and return multiples for the roulette layout
function roulLabel(k) { return k.startsWith('n:') ? k.slice(2) : { red: 'RED', black: 'BLACK', odd: 'ODD', even: 'EVEN', low: '1–18', high: '19–36', d1: '1st 12', d2: '2nd 12', d3: '3rd 12', c1: 'Col 1', c2: 'Col 2', c3: 'Col 3' }[k] || k; }
function roulMult(k) { return k.startsWith('n:') ? 36 : k[0] === 'd' || k[0] === 'c' ? 3 : 2; }
const ROUL_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const ROUL_WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const ROUL_KEYS = new Set([...Array.from({ length: 37 }, (_, n) => 'n:' + n), 'red', 'black', 'odd', 'even', 'low', 'high', 'd1', 'd2', 'd3', 'c1', 'c2', 'c3']);
// total returned (stake included) for a set of bets on number n
function roulettePayout(bets, n) {
  let w = 0;
  for (const key in bets) {
    const a = bets[key]; let m = 0;
    if (key.startsWith('n:')) m = +key.slice(2) === n ? 36 : 0;
    else if (n === 0) m = 0;
    else if (key === 'red') m = ROUL_RED.has(n) ? 2 : 0;
    else if (key === 'black') m = ROUL_RED.has(n) ? 0 : 2;
    else if (key === 'odd') m = n % 2 ? 2 : 0;
    else if (key === 'even') m = n % 2 ? 0 : 2;
    else if (key === 'low') m = n <= 18 ? 2 : 0;
    else if (key === 'high') m = n >= 19 ? 2 : 0;
    else if (key[0] === 'd') m = Math.ceil(n / 12) === +key[1] ? 3 : 0;
    else if (key[0] === 'c') m = ((n - 1) % 3) + 1 === +key[1] ? 3 : 0;
    w += a * m;
  }
  return w;
}
// exact up to $9,999,999, then short ($22.5M): for the narrow readouts
const fmtFit = v => v >= 1e7 ? '$' + fmtShort(v) : fmtMoney(v);
// $1.5k, $25M, $1B: short amounts for chips and buttons (one decimal only when it is not whole)
const fmtShort = v => { v = Math.floor(+v || 0); for (const [d, u] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']]) if (v >= d) { const x = v / d; return (x >= 100 || Math.abs(x - Math.round(x)) < 0.05 ? Math.round(x) : x.toFixed(1)) + u; } return String(v); };
// the pocket for a spin: a fair single-zero wheel, whatever is on the layout (the bets are kept in the signature for
// the callers and the tests)
function roulettePick(bets, rnd = Math.random) { void bets; return Math.floor(rnd() * 37); }

