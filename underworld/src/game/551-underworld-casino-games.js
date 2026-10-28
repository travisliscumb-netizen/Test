/* =====================================================================
   [UNDERWORLD] MORE OF THE VALEN ROYALE (M9, §25): baccarat, craps, three
   card poker and the sportsbook. Every game is the ordinary one with its
   ordinary house edge, settled in one step when the bet is placed (stake
   out, any win in), so a closed screen or a reload can't change a result.
   - Baccarat: Player 1:1, Banker 0.95:1, Tie 8:1 (a tie returns Player and
     Banker bets); standard drawing rules, cards drawn from an 8-deck mix.
   - Craps: Pass Line, Don't Pass (12 pushes on the come-out) and the
     Field (2 and 12 pay double); a pass decision is rolled out to the end.
   - Three Card Poker: Ante and Play against the dealer, who needs queen
     high; you play anything from queen-six-four up (the usual strategy) and
     fold the rest; Ante bonus on a straight or better; optional Pair Plus.
   - The sportsbook: three matches a day with the house's margin built into
     the odds; a bet settles when that economic day ends, once. Matches and
     their results come from the day's seed: nothing a reload can reroll.
     Limits as at the tables: $10,000 a bet, $250,000 for someone known (Rep).
   ===================================================================== */
const SPORTS = { margin: 0.06, keep: 20,
  teams: ['Port Valen Harriers', 'Saltworks Rovers', 'Crestmoor Lions', 'Docklands United', 'Linden Hills FC', 'Old Quarter Athletic', 'Greenway Wanderers', 'Strip City', 'Stadium Town', 'Cedar Fields Rangers', 'Harbor Row Mariners', 'Warehouse Athletic'] };
const CARD_RANKS = 'A23456789TJQK';
// ---------------------------------------------------------------- pure rules (exported for the tests)
const baccVal = r => r >= 10 ? 0 : r; // r: 1 (ace) .. 13 (king)
function baccaratDeal(rnd = Math.random) {
  const card = () => 1 + Math.floor(rnd() * 13), tot = h => h.reduce((a, r) => a + baccVal(r), 0) % 10;
  const P = [card(), card()], B = [card(), card()];
  if (tot(P) < 8 && tot(B) < 8) {
    let p3 = null;
    if (tot(P) <= 5) { p3 = card(); P.push(p3); }
    const b = tot(B), v = p3 === null ? null : baccVal(p3);
    const draw = v === null ? b <= 5 : b <= 2 || (b === 3 && v !== 8) || (b === 4 && v >= 2 && v <= 7) || (b === 5 && v >= 4 && v <= 7) || (b === 6 && v >= 6 && v <= 7);
    if (draw) B.push(card());
  }
  const p = tot(P), b = tot(B);
  return { P, B, p, b, result: p > b ? 'player' : b > p ? 'banker' : 'tie' };
}
// what a set of bets returns (stake included) on a result
function baccaratPay(bets, result) {
  let back = 0;
  if (result === 'tie') { back += (bets.tie || 0) * 9 + (bets.player || 0) + (bets.banker || 0); }
  else if (result === 'player') back += (bets.player || 0) * 2;
  else back += (bets.banker || 0) * 1.95;
  // the house rounds the commission in its own favour (a $10 Banker win pays $19, never $20)
  return Math.floor(back + 1e-9);
}
function crapsRoll(rnd = Math.random) { const a = 1 + Math.floor(rnd() * 6), b = 1 + Math.floor(rnd() * 6); return [a, b]; }
// a pass-line decision rolled out to the end: the rolls and 'pass' / 'dont' / 'push12' (a come-out 12)
function crapsDecision(rnd = Math.random) {
  const rolls = [], first = crapsRoll(rnd), s0 = first[0] + first[1]; rolls.push(first);
  if (s0 === 7 || s0 === 11) return { rolls, point: 0, result: 'pass' };
  if (s0 === 2 || s0 === 3) return { rolls, point: 0, result: 'dont' };
  if (s0 === 12) return { rolls, point: 0, result: 'push12' };
  for (let n = 0; n < 200; n++) { const r = crapsRoll(rnd), t = r[0] + r[1]; rolls.push(r); if (t === s0) return { rolls, point: s0, result: 'pass' }; if (t === 7) return { rolls, point: s0, result: 'dont' }; }
  return { rolls, point: s0, result: 'dont' };
}
function crapsPay(bets, dec) {
  let back = 0;
  if (dec.result === 'pass') back += (bets.pass || 0) * 2;
  else if (dec.result === 'dont') back += (bets.dont || 0) * 2;
  else back += (bets.dont || 0); // a come-out 12: Pass loses, Don't Pass is returned
  if (bets.field) { const f = dec.rolls[0][0] + dec.rolls[0][1]; back += (f === 2 || f === 12) ? bets.field * 3 : [3, 4, 9, 10, 11].includes(f) ? bets.field * 2 : 0; }
  return Math.round(back);
}
// three card poker hands: cards are [rank 2..14, suit 0..3]; returns [category, ...tiebreak] (5 SF, 4 trips, 3 straight, 2 flush, 1 pair, 0 high)
function tcpRank(h) {
  const r = h.map(c => c[0]).sort((a, b) => b - a), fl = h[0][1] === h[1][1] && h[1][1] === h[2][1];
  const wheel = r[0] === 14 && r[1] === 3 && r[2] === 2, st = (r[0] - r[1] === 1 && r[1] - r[2] === 1) || wheel, top = wheel ? 3 : r[0];
  if (st && fl) return [5, top];
  if (r[0] === r[2]) return [4, r[0]];
  if (st) return [3, top];
  if (fl) return [2, ...r];
  if (r[0] === r[1] || r[1] === r[2]) { const pr = r[1], k = r[0] === r[1] ? r[2] : r[0]; return [1, pr, k]; }
  return [0, ...r];
}
const tcpCmp = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
function tcpDeal(rnd = Math.random) {
  const deck = []; for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) deck.push([r, s]);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return { you: deck.slice(0, 3), dealer: deck.slice(3, 6) };
}
// one round: ante (and play = ante when you play), Pair Plus side bet; returns what comes back, stake included
function tcpRound(ante, pairPlus, rnd = Math.random) {
  const d = tcpDeal(rnd), y = tcpRank(d.you), k = tcpRank(d.dealer);
  const play = tcpCmp(y, [0, 12, 6, 4]) >= 0, staked = ante + pairPlus + (play ? ante : 0);
  let back = 0;
  if (play) {
    const qual = tcpCmp(k, [0, 12, 0, 0]) >= 0, c = tcpCmp(y, k);
    if (!qual) back += ante * 2 + ante; // ante wins, play is returned
    else if (c > 0) back += ante * 2 + ante * 2;
    else if (c === 0) back += ante * 2;
    back += ante * ({ 5: 5, 4: 4, 3: 1 }[y[0]] || 0); // the ante bonus is paid whatever the dealer has
  }
  if (pairPlus) back += pairPlus * ({ 5: 41, 4: 31, 3: 7, 2: 5, 1: 2 }[y[0]] || 0);
  return { ...d, y, k, play, staked, back: Math.round(back) };
}
// the day's matches: from the day's seed, so a reload shows (and settles) the same ones
function sportsDay(day) {
  const rnd = mulberry32(day * 7919 + 13), T = SPORTS.teams.slice(), out = [];
  for (let i = T.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [T[i], T[j]] = [T[j], T[i]]; }
  for (let m = 0; m < 3; m++) {
    const home = T[m * 2], away = T[m * 2 + 1], ph = 0.3 + rnd() * 0.4, pd = 0.18 + rnd() * 0.1, pa = Math.max(0.05, 1 - ph - pd);
    const odds = [ph, pd, pa].map(p => Math.max(1.05, Math.round((1 - SPORTS.margin) / p * 100) / 100));
    const r = rnd(), result = r < ph ? 0 : r < ph + pd ? 1 : 2;
    out.push({ id: day * 10 + m, home, away, odds, result });
  }
  return out;
}
// ---------------------------------------------------------------- the tables
Object.assign(Gamble.prototype, {
  // a table bet: one of the new games, settled now (stake out, any win in) with its own record
  tableBet(stake, back, label) {
    if (!(stake >= CASINO.minBet) || Money.clean < stake) return false;
    if (!this.settle('casino', stake, back)) return false;
    this.g.audio.play(back > stake ? 'win1' : back === stake ? 'ui' : 'deny', { gain: 0.6 });
    this.g.saveGame();
    void label; return true;
  },
  cardHTML(r, s) { const red = s === 1 || s === 2; return `<span class="pcard${red ? ' red' : ''}">${CARD_RANKS[(r === 14 ? 1 : r) - 1] || '?'}${'♠♥♦♣'[s] || ''}</span>`; },
  openBaccarat(seat) {
    this.seat = seat | 0;
    const st = this.bacc || (this.bacc = { pick: 'banker', last: null });
    const render = () => {
      const bet = this.wager('bacc', 100), L = st.last;
      return this.wagerHTML('bacc', bet, { pays: st.pick === 'tie' ? '8:1' : st.pick === 'banker' ? '0.95:1' : '1:1' }) +
        `<div class="btns">${['player', 'banker', 'tie'].map(k => `<button class="sbtn${st.pick === k ? ' gold' : ''}" data-act="pick:${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}<button class="sbtn danger" data-act="deal">DEAL</button></div>` +
        (L ? `<div class="card gres"><div class="t">Player ${L.P.map(r => this.cardHTML(r === 1 ? 14 : r, 0)).join('')} = <b>${L.p}</b> · Banker ${L.B.map(r => this.cardHTML(r === 1 ? 14 : r, 1)).join('')} = <b>${L.b}</b></div><div class="d">${L.result.toUpperCase()} · ${L.back > L.stake ? 'you win ' + fmtMoney(L.back - L.stake) : L.back === L.stake ? 'bet returned' : 'you lose ' + fmtMoney(L.stake)}</div></div>` : '') +
        '<div class="hint">Player pays 1:1, Banker 0.95:1 (5% commission), Tie 8:1; a tie returns Player and Banker bets. Standard drawing rules.</div>';
    };
    this.open('Baccarat', 'Punto banco', render, a => {
      const [k, x] = a.split(':');
      if (k === 'w') { if (this.wagerAct('bacc', a, this.wager('bacc', 100)) !== null) this.refresh(); return; }
      if (k === 'pick') { st.pick = x; this.refresh(); return; }
      if (k === 'deal') { const bet = this.wager('bacc', 100), d = baccaratDeal(), back = baccaratPay({ [st.pick]: bet }, d.result); if (this.tableBet(bet, back, 'bacc')) st.last = { ...d, stake: bet, back }; this.refresh(); }
    }, 'bacc');
  },
  openCraps() {
    this.seat = 0;
    const st = this.craps || (this.craps = { pick: 'pass', last: null });
    const render = () => {
      const bet = this.wager('craps', 100), L = st.last;
      return this.wagerHTML('craps', bet, { pays: st.pick === 'field' ? '1:1 · 2 & 12 pay 2:1' : '1:1' }) +
        `<div class="btns">${[['pass', 'Pass Line'], ['dont', 'Don’t Pass'], ['field', 'Field']].map(([k, n]) => `<button class="sbtn${st.pick === k ? ' gold' : ''}" data-act="pick:${k}">${n}</button>`).join('')}<button class="sbtn danger" data-act="roll">ROLL</button></div>` +
        (L ? `<div class="card gres"><div class="t">${L.rolls.map(r => `⚀⚁⚂⚃⚄⚅`[r[0] - 1] + `⚀⚁⚂⚃⚄⚅`[r[1] - 1]).join(' ')}</div><div class="d">${L.point ? 'Point ' + L.point + ' · ' : ''}${L.result === 'pass' ? 'Pass wins' : L.result === 'dont' ? 'Don’t Pass wins' : 'Twelve: Don’t Pass pushes'} · ${L.back > L.stake ? 'you win ' + fmtMoney(L.back - L.stake) : L.back === L.stake ? 'bet returned' : 'you lose ' + fmtMoney(L.stake)}</div></div>` : '') +
        '<div class="hint">Pass Line: 7 or 11 on the come-out wins, 2, 3 or 12 loses; otherwise make the point before a 7. Don’t Pass is the other side (12 pushes). Field: one roll, 3 4 9 10 11 pay 1:1, 2 and 12 pay 2:1.</div>';
    };
    this.open('Craps', 'The craps table', render, a => {
      const [k, x] = a.split(':');
      if (k === 'w') { if (this.wagerAct('craps', a, this.wager('craps', 100)) !== null) this.refresh(); return; }
      if (k === 'pick') { st.pick = x; this.refresh(); return; }
      if (k === 'roll') { const bet = this.wager('craps', 100), dec = crapsDecision(), back = crapsPay({ [st.pick]: bet }, dec); if (this.tableBet(bet, back, 'craps')) st.last = { ...dec, stake: bet, back }; this.refresh(); }
    }, 'craps');
  },
  openThreeCard(seat) {
    this.seat = seat | 0;
    const st = this.tcp || (this.tcp = { pp: false, last: null });
    const names = ['High card', 'Pair', 'Flush', 'Straight', 'Three of a kind', 'Straight flush'];
    const render = () => {
      const ante = this.wager('tcp', 100), L = st.last, need = ante * 2 + (st.pp ? ante : 0);
      return this.wagerHTML('tcp', ante, { label: 'ANTE', pays: 'Play 1:1 · bonus up to 5:1' }) +
        `<div class="btns"><button class="sbtn${st.pp ? ' gold' : ''}" data-act="pp">Pair Plus (${fmtMoney(ante)}) ${st.pp ? 'ON' : 'off'}</button><button class="sbtn danger" data-act="deal" ${Money.clean < need ? 'disabled' : ''}>DEAL · needs ${fmtMoney(need)}</button></div>` +
        (L ? `<div class="card gres"><div class="t">You ${L.you.map(c => this.cardHTML(c[0], c[1])).join('')} ${names[L.y[0]]} · Dealer ${L.dealer.map(c => this.cardHTML(c[0], c[1])).join('')} ${names[L.k[0]]}</div><div class="d">${L.play ? 'You played' : 'You folded (below queen-six-four)'} · ${L.back > L.staked ? 'you win ' + fmtMoney(L.back - L.staked) : L.back === L.staked ? 'even' : 'you lose ' + fmtMoney(L.staked - L.back)}</div></div>` : '') +
        '<div class="hint">You play queen-six-four or better (the play bet equals the ante) and fold the rest. The dealer needs queen high: if not, the ante pays and the play bet is returned. Ante bonus: straight 1:1, trips 4:1, straight flush 5:1. Pair Plus: pair 1:1, flush 4:1, straight 6:1, trips 30:1, straight flush 40:1.</div>';
    };
    this.open('Three Card Poker', 'Ante, play, Pair Plus', render, a => {
      const [k] = a.split(':');
      if (k === 'w') { if (this.wagerAct('tcp', a, this.wager('tcp', 100)) !== null) this.refresh(); return; }
      if (k === 'pp') { st.pp = !st.pp; this.refresh(); return; }
      if (k === 'deal') {
        const ante = this.wager('tcp', 100), pp = st.pp ? ante : 0; if (Money.clean < ante * 2 + pp) { this.refresh('You need the play bet too: twice the ante, plus Pair Plus.'); return; }
        const r = tcpRound(ante, pp); if (this.tableBet(r.staked, r.back, 'tcp')) st.last = r; this.refresh();
      }
    }, 'tcp');
  },
  // ---------------------------------------------------------------- the sportsbook
  sbook() { const G = this.G; if (!G.sports || typeof G.sports !== 'object') G.sports = { bets: [], next: 1, won: 0, staked: 0 }; return G.sports; },
  sportsToday() { return this.g.uw ? this.g.uw.S.day : 1; },
  openSportsbook() {
    this.seat = 0;
    const st = this.sb || (this.sb = { pick: null });
    const render = () => {
      const day = this.sportsToday(), M = sportsDay(day), SB = this.sbook(), bet = this.wager('sports', 100);
      let h = this.wagerHTML('sports', bet, { pays: 'the odds shown' });
      h += '<h3>Today’s matches</h3><div class="jobs">' + M.map(m => `<div class="job"><div style="flex:1"><b>${esc(m.home)} v ${esc(m.away)}</b><span>Results at the end of the day</span></div>${['Home', 'Draw', 'Away'].map((n, i) => `<button class="sbtn${st.pick === m.id + ':' + i ? ' gold' : ''}" data-act="sb:${m.id}:${i}">${n} ${m.odds[i].toFixed(2)}</button>`).join('')}</div>`).join('') + '</div>';
      h += `<div class="btns"><button class="sbtn danger" data-act="sbgo" ${st.pick ? '' : 'disabled'}>PLACE BET</button></div>`;
      const open = SB.bets.filter(b => !b.settled), done = SB.bets.filter(b => b.settled).slice(-6).reverse();
      if (open.length) h += '<h3>Your open bets</h3><div class="stats">' + open.map(b => `<span>${esc(b.label)}</span><span>${fmtMoney(b.stake)} @ ${b.odds.toFixed(2)}</span>`).join('') + '</div>';
      if (done.length) h += '<h3>Settled</h3><div class="stats">' + done.map(b => `<span>${esc(b.label)}</span><span>${b.win ? '<b style="color:var(--green)">won ' + fmtMoney(b.paid) + '</b>' : 'lost'}</span>`).join('') + '</div>';
      return h + `<div class="hint">The book keeps about ${Math.round(SPORTS.margin * 100)}% in its odds. Bets settle once, when the economic day ends; up to ${fmtMoney(this.maxBet('sports'))} a bet.</div>`;
    };
    this.open('Sportsbook', 'Today’s card', render, a => {
      const [k, x, y] = a.split(':');
      if (k === 'w') { if (this.wagerAct('sports', a, this.wager('sports', 100)) !== null) this.refresh(); return; }
      if (k === 'sb') { st.pick = x + ':' + y; this.refresh(); return; }
      if (k === 'sbgo' && st.pick) { const r = this.sportsBet(+st.pick.split(':')[0], +st.pick.split(':')[1], this.wager('sports', 100)); st.pick = null; this.refresh(r || 'Bet placed. It settles at the end of the day.'); }
    }, 'sports');
  },
  // a sportsbook bet: the stake leaves now; it settles once, at the end of today's economic day
  sportsBet(matchId, pick, stake) {
    const day = this.sportsToday(), m = sportsDay(day).find(x => x.id === matchId); if (!m || ![0, 1, 2].includes(pick)) return 'No such match today.';
    stake = Math.floor(stake); if (!(stake >= CASINO.minBet) || stake > this.maxBet('sports')) return `Bets from ${fmtMoney(CASINO.minBet)} to ${fmtMoney(this.maxBet('sports'))}.`;
    if (!Money.can(stake, 'casinoStake')) return 'Not enough in the bank.';
    if (!this.settle('casino', stake, 0)) return 'Not enough in the bank.';
    const SB = this.sbook(); SB.staked += stake;
    SB.bets.push({ id: SB.next++, day, match: matchId, pick, odds: m.odds[pick], stake, label: `${m.home} v ${m.away}: ${[m.home, 'Draw', m.away][pick]}`, settled: false, win: false, paid: 0 });
    if (SB.bets.length > 60) SB.bets.splice(0, SB.bets.length - 60);
    this.g.saveGame();
    return '';
  },
  // the end of the economic day: every open bet from an earlier day settles, exactly once
  tickSports() {
    const SB = this.sbook(), today = this.sportsToday();
    for (const b of SB.bets) {
      if (b.settled || b.day >= today) continue;
      const m = sportsDay(b.day).find(x => x.id === b.match); b.settled = true;
      // (the stake was booked as lost when it was placed: a win takes that back)
      if (m && m.result === b.pick) { b.win = true; b.paid = Math.round(b.stake * b.odds); Money.earn(b.paid, 'casino'); const C = this.G.casino; C.won += b.paid; C.lost = Math.max(0, C.lost - b.stake); C.biggest = Math.max(C.biggest, b.paid - b.stake); SB.won += b.paid; }
    }
    // keep the record short
    const done = SB.bets.filter(b => b.settled); if (done.length > SPORTS.keep) SB.bets = SB.bets.filter(b => !b.settled || done.indexOf(b) >= done.length - SPORTS.keep);
  }
});
// a sportsbook record from a save: open bets kept (their stake is gone already), the record bounded
function sanitizeSports(x, okN) {
  const out = { bets: [], next: 1, won: 0, staked: 0 }; if (!x || typeof x !== 'object') return out;
  out.won = okN(x.won) ? x.won : 0; out.staked = okN(x.staked) ? x.staked : 0;
  for (const b of Array.isArray(x.bets) ? x.bets : []) if (b && Number.isInteger(b.id) && Number.isInteger(b.day) && Number.isInteger(b.match) && [0, 1, 2].includes(b.pick) && okN(b.stake) && b.stake <= CASINO.vipMax && okN(b.odds) && b.odds < 100) out.bets.push({ id: b.id, day: b.day, match: b.match, pick: b.pick, odds: b.odds, stake: b.stake, label: typeof b.label === 'string' ? b.label.slice(0, 80) : '', settled: !!b.settled, win: !!b.win, paid: okN(b.paid) ? b.paid : 0 });
  out.bets = out.bets.slice(-60); out.next = Math.max(1, ...out.bets.map(b => b.id + 1), Number.isInteger(x.next) ? x.next : 1);
  return out;
}
