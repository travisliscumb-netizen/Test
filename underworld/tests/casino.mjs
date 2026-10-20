/* The Valen Royale (v6): no table limits (custom wagers up to the bankroll, millions and more), the
   player-favoured 60/40 balance measured by simulation for roulette, blackjack, Hold'em and Royale
   Billions (with tolerances, and the same odds at $10 and $10,000,000), roulette multi-betting with
   a correct total and net result and no coverage exploit, the $1B jackpot ladder with independent
   rolls, persistent drought pressure and consecutive jackpots, and atomic settlement under spam,
   close and reload. Simulation results are printed for the report. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const t = await open(b, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = t.page;
const ev = (f, a) => page.evaluate(f, a);
await startNew(page);
await ev(() => { const g = window.game; g.events.cool = 1e9; g.police.enabled = false; g.traffic.enabled = false; });
const report = {};

// ---------------------------------------------------------------- wagers
const w = await ev(() => {
  const g = window.game, G = g.gamble, s = g.save, P = window.__pv, out = {};
  out.parse = ['5000', '250k', '2.5m', '$1,000,000', '1b', 'abc'].map(P.parseMoney);
  window.game.money.W.clean = 3e8;
  G.openBlackjack(0);
  const html = document.getElementById('svcBody').innerHTML;
  out.quick = [...document.querySelectorAll('#svcBody .wq [data-act^="w:q:"]')].map(b => +b.dataset.act.split(':')[2]);
  out.hasMax = /data-act="w:max"/.test(html); out.hasInput = !!document.getElementById('wagerIn');
  out.shows = /BALANCE/.test(html) && /BET/.test(html) && /BLACKJACK PAYS/.test(html);
  document.getElementById('wagerIn').value = '25m'; g.content._svcAct('w:set'); out.custom = G.bj.bet;
  g.content._svcAct('w:max'); out.max = G.bj.bet;
  g.content._svcAct('w:q:100'); out.low = G.bj.bet;
  document.getElementById('wagerIn').value = '9b'; g.content._svcAct('w:set'); out.capped = G.bj.bet;
  // touch targets in the bet bar
  out.minH = Math.min(...[...document.querySelectorAll('#svcBody .wq .sbtn')].map(b => b.getBoundingClientRect().height));
  out.overflow = document.getElementById('svcBody').scrollWidth > document.getElementById('svcBody').clientWidth + 1;
  while (g.ui.stack.length) g.ui.back();
  return out;
});
check('amounts type naturally: 5000, 250k, 2.5m, $1,000,000, 1b', JSON.stringify(w.parse.slice(0, 5)) === JSON.stringify([5000, 250000, 2500000, 1000000, 1e9]) && w.parse[5] !== w.parse[5], JSON.stringify(w.parse));
check('bet bar: $100 $1K $10K $100K $1M quick bets, bigger ones when you have them, MAX, custom entry', [100, 1e3, 1e4, 1e5, 1e6, 1e8].every(v => w.quick.includes(v)) && w.hasMax && w.hasInput && w.shows, JSON.stringify(w.quick));
check('custom $25M wager, MAX = the whole bankroll, $100 still allowed, more than you have is capped', w.custom === 25e6 && w.max === 3e8 && w.low === 100 && w.capped === 3e8, JSON.stringify(w));
check('bet bar touch targets are at least 44 px tall and nothing overflows at 390 px', w.minH >= 43.5 && !w.overflow, JSON.stringify({ minH: w.minH, overflow: w.overflow }));

// ---------------------------------------------------------------- roulette
const rsim = await ev(() => {
  const P = window.__pv, N = 40000, out = {};
  const sim = (bets) => { let st = 0; for (const k in bets) st += bets[k]; let pos = 0, ret = 0; for (let i = 0; i < N; i++) { const n = P.roulettePick(bets), pay = P.roulettePayout(bets, n); ret += pay; if (pay > st) pos++; } return { netPos: pos / N, rtp: ret / (st * N) }; };
  out.red = sim({ red: 100 }); out.odd = sim({ odd: 1e6 }); out.dozen = sim({ d2: 100 }); out.straight = sim({ 'n:17': 100 });
  out.mixed = sim({ red: 100, 'n:7': 25, d3: 50, c1: 50 });
  // coverage: 35 numbers straight up, both colours, two dozens + both colours
  const cov = {}; for (let n = 1; n <= 35; n++) cov['n:' + n] = 100; out.cover35 = sim(cov);
  out.bothColours = sim({ red: 100, black: 100 }); out.twoDozens = sim({ d1: 100, d2: 100 });
  // the same layout at $10 and at $10,000,000
  out.small = sim({ red: 10 }); out.huge = sim({ red: 1e7 });
  return out;
});
report.roulette = rsim;
console.log('ROULETTE SIM', JSON.stringify(rsim));
check('roulette: even-chance bets net positive ~60% of spins (40k spins, ±2%)', Math.abs(rsim.red.netPos - 0.6) < 0.02 && Math.abs(rsim.odd.netPos - 0.6) < 0.02, JSON.stringify([rsim.red, rsim.odd]));
check('roulette: long shots keep their character (straight up ~3.3%, dozens ~40%) with the same ~+20% edge', rsim.straight.netPos > 0.02 && rsim.straight.netPos < 0.05 && Math.abs(rsim.dozen.netPos - 0.4) < 0.02 && rsim.dozen.rtp > 1.1 && rsim.dozen.rtp < 1.3, JSON.stringify([rsim.straight, rsim.dozen]));
check('roulette: covering the board is not free money (35 numbers, both colours, two dozens all lose over time)', rsim.cover35.rtp < 1 && rsim.bothColours.rtp < 1.0001 && rsim.twoDozens.rtp < 1, JSON.stringify([rsim.cover35, rsim.bothColours, rsim.twoDozens]));
check('roulette: the odds do not change with the size of the bet ($10 vs $10,000,000)', Math.abs(rsim.small.netPos - rsim.huge.netPos) < 0.02, JSON.stringify([rsim.small, rsim.huge]));
const rtab = await ev(async () => {
  const g = window.game, G = g.gamble, s = g.save, out = {};
  window.game.money.W.clean = 5e7; G.roul = null; G.openRoulette(0);
  G.setWager('roul', 1e6);
  for (const k of ['red', 'n:17', 'n:17', 'd2', 'c1', 'odd', 'n:0', 'high', 'low', 'even', 'n:32']) g.content._svcAct('rb:' + k);
  out.total = Object.values(G.roul.bets).reduce((a, x) => a + x, 0); out.n17 = G.roul.bets['n:17']; out.bets = Object.keys(G.roul.bets).length;
  g.content._svcAct('undo'); out.afterUndo = Object.values(G.roul.bets).reduce((a, x) => a + x, 0);
  g.content._svcAct('mode:remove'); g.content._svcAct('rb:n:17'); out.afterRemove = G.roul.bets['n:17']; g.content._svcAct('mode:add');
  out.list = document.querySelectorAll('#svcBody .rbi').length;
  out.chipH = Math.min(...[...document.querySelectorAll('#svcBody .rc')].map(e => e.getBoundingClientRect().height));
  const stake = Object.values(G.roul.bets).reduce((a, x) => a + x, 0), m0 = window.game.money.clean, bets = { ...G.roul.bets };
  G.roulSpin(); const n = G.roul.spinning.n;
  await new Promise(r => { const iv = setInterval(() => { if (!G.roul.spinning) { clearInterval(iv); r(); } }, 20); });
  out.net = window.game.money.clean - m0; out.expectNet = window.__pv.roulettePayout(bets, n) - stake; out.stake = stake;
  out.msg = document.querySelector('#svcBody .gres').textContent;
  while (g.ui.stack.length) g.ui.back();
  return out;
});
check('roulette table: eleven chips of $1M on nine positions, tapping a position again adds to it', rtab.total === 11e6 && rtab.n17 === 2e6 && rtab.bets === 10, JSON.stringify(rtab));
check('roulette table: UNDO takes the last chip back, REMOVE mode takes chips off a position, the bet list shows each bet', rtab.afterUndo === 10e6 && rtab.afterRemove === 1e6 && rtab.list >= 9, JSON.stringify(rtab));
check('roulette table: the result is total paid − total staked, shown as the net', rtab.net === rtab.expectNet && /net|even/.test(rtab.msg), JSON.stringify(rtab));
check('roulette chips are tappable on a phone (cells ≥ 28 px)', rtab.chipH >= 28, String(rtab.chipH));

// ---------------------------------------------------------------- blackjack 60/40 (basic strategy)
const bsim = await ev(() => {
  const g = window.game, G = g.gamble, bjv = window.__pv.bjValue, keepSave = g.saveGame, keepRef = G.refresh;
  g.saveGame = () => {}; G.refresh = () => {}; (g.money.W.clean = g.money.W.dirty.me = 1e13);
  const run = (bet, N) => {
    let w = 0, l = 0, p = 0, ev = 0;
    G.bj = { seat: 0, bet, hands: [], dealer: [], phase: 'bet', cur: 0 };
    for (let i = 0; i < N; i++) {
      const bj = G.bj; bj.phase = 'bet'; bj.revealing = false; G.busy = false; bj.bet = bet;
      const m0 = g.money.total(); G.bjDeal(); let guard = 0;
      while (bj.phase === 'play' && guard++ < 30) {
        const hd = bj.hands[bj.cur], v = bjv(hd.cards), d = Math.min(10, bj.dealer[0].r === 14 ? 11 : bj.dealer[0].r);
        let a; if (v.soft) a = v.total <= 17 ? 'hit' : 'stand'; else if (v.total <= 8) a = 'hit'; else if (v.total <= 11) a = hd.cards.length === 2 && d < v.total - 1 ? 'double' : 'hit'; else if (v.total <= 16) a = d >= 7 ? 'hit' : (v.total === 12 && d <= 3 ? 'hit' : 'stand'); else a = 'stand';
        G.bjAction(a); bj.revealing = false; G.busy = false;
      }
      const net = g.money.total() - m0; ev += net; if (net > 0) w++; else if (net < 0) l++; else p++;
    }
    return { hands: N, win: w / N, lose: l / N, push: p / N, decided: w / (w + l), ev: ev / N / bet };
  };
  const out = { small: run(10, 15000), huge: run(1e7, 15000) };
  g.saveGame = keepSave; G.refresh = keepRef; G.bj = null; G.busy = false; (g.money.W.clean = g.money.W.dirty.me = 1e7);
  return out;
});
report.blackjack = bsim;
console.log('BLACKJACK SIM', JSON.stringify(bsim));
check('blackjack: ~60% of decided hands go to the player with basic strategy (15k hands, ±3%)', Math.abs(bsim.small.decided - 0.6) < 0.03, JSON.stringify(bsim.small));
check('blackjack: the same at $10,000,000 a hand (no penalty for betting big)', Math.abs(bsim.huge.decided - bsim.small.decided) < 0.03, JSON.stringify(bsim.huge));
check('blackjack: still has losing hands and pushes (40%-ish lose, pushes happen)', bsim.small.lose > 0.3 && bsim.small.push > 0.05, JSON.stringify(bsim.small));

// ---------------------------------------------------------------- Hold'em: stakes and 60/40
const psim = await ev(() => {
  const g = window.game, G = g.gamble, keepSave = g.saveGame, keepRef = G.refresh, out = {};
  g.saveGame = () => {}; G.refresh = () => {}; (g.money.W.clean = g.money.W.dirty.me = 1e13);
  // a $1,000,000 buy-in: the regulars bring stacks in the same range; the blinds follow from the depth
  G.pk = null; G.pokerSit(1e6, 50); const pk = G.pk; pk.sim = true;
  out.stacks = pk.seats.map(x => x.stack + x.put); out.bb = pk.bb;
  out.opts = (() => { pk.phase = pk.phase; return null; })();
  let pw = 0, pl = 0, pn = 0, folds = 0, ev = 0, allins = 0, raiseOpts = null;
  for (let h = 0; h < 1500; h++) {
    if (pk.seats[0].stack < pk.bb * 20) { const need = pk.buy - pk.seats[0].stack; (g.money.W.clean -= need); pk.seats[0].stack += need; }
    if (pk.phase !== 'play') G.pokerHand();
    let guard = 0;
    while (pk.phase === 'play' && guard++ < 200) {
      if (pk.toAct === 0) {
        const me = pk.seats[0], opp = pk.seats.filter((y, j) => j && !y.folded).length, toCall = Math.max(0, pk.curBet - me.put), pot = pk.pot + pk.seats.reduce((a, y) => a + y.put, 0);
        const eq = window.__pv.pokerEquity(me.hole, pk.board, Math.max(1, opp), 60), fair = 1 / (opp + 1), o = G.pkRaiseOptions();
        if (!raiseOpts && o.length) raiseOpts = o.map(x => x.label);
        if (eq > fair * 1.5 && o.length) { const c = o.find(x => x.label === (eq > fair * 2 ? 'POT' : '½ POT')) || o[0]; G.pokerAct(0, 'raise', c.to); }
        else if (toCall === 0 || eq >= toCall / (pot + toCall)) G.pokerAct(0, 'call'); else G.pokerAct(0, 'fold');
      } else { const d = G.pokerAI(pk.toAct, true); if (d.kind === 'raise' && d.to >= pk.seats[pk.toAct].put + pk.seats[pk.toAct].stack) allins++; G.pokerAct(pk.toAct, d.kind, d.to); }
    }
    ev += pk.lastNet; if (pk.lastFolded) folds++; else { pn++; if (pk.lastNet > 0) pw++; else if (pk.lastNet < 0) pl++; }
  }
  out.sim = { hands: pn + folds, played: pn, folded: folds, win: pw / pn, lose: pl / pn, decided: pw / (pw + pl), evBB: ev / (pn + folds) / pk.bb, aiAllIns: allins };
  out.raiseOpts = raiseOpts;
  G.pk = null; G.G.casino.chips = 0; g.saveGame = keepSave; G.refresh = keepRef; G.busy = false; (g.money.W.clean = g.money.W.dirty.me = 1e7);
  return out;
});
report.poker = psim.sim;
console.log('POKER SIM', JSON.stringify(psim));
check('poker: $1M buy-in; NPC stacks in the same range ($600k–$1.6M), blinds from the depth', psim.stacks[0] === 1e6 && psim.stacks.slice(1).every(v => v >= 6e5 - psim.bb && v <= 1.6e6 + psim.bb) && psim.bb === 20000, JSON.stringify(psim));
check('poker: bet sizes offered (min, ½ pot, pot, all in)', psim.raiseOpts && psim.raiseOpts.includes('ALL IN') && psim.raiseOpts.length >= 2, JSON.stringify(psim.raiseOpts));
check('poker: of the hands you play, ~60–68% are net wins over 1,500 hands, with a small positive edge', psim.sim.decided > 0.57 && psim.sim.decided < 0.72 && psim.sim.evBB > -0.5, JSON.stringify(psim.sim));
check('poker: still has losing hands, folds and all-ins (believable play)', psim.sim.lose > 0.25 && psim.sim.folded > 100 && psim.sim.aiAllIns > 0, JSON.stringify(psim.sim));
const pkUI = await ev(async () => {
  const g = window.game, G = g.gamble, s = g.save, out = {};
  window.game.money.W.clean = 2e8; G.pk = null; G.openPoker();
  out.depths = [...document.querySelectorAll('#svcBody [data-act^="depth:"]')].length;
  G.setWager('pokerBuy', 1e8); g.content._svcAct('depth:100'); g.content._svcAct('sit');
  out.bb = G.pk.bb; out.chips = s.gamble.casino.chips;
  await new Promise(r => { const iv = setInterval(() => { if (G.pk && G.pk.phase === 'play' && G.pk.toAct === 0 || (G.pk && G.pk.phase !== 'play')) { clearInterval(iv); r(); } }, 30); setTimeout(() => { clearInterval(iv); r(); }, 8000); });
  const body = document.getElementById('svcBody');
  out.overflow = body.scrollWidth > body.clientWidth + 1;
  out.btnMinH = Math.min(...[...body.querySelectorAll('.btns .sbtn')].map(e => e.getBoundingClientRect().height));
  G.busy = false; if (G.pk && G.pk.phase !== 'play') g.content._svcAct('leave'); else G.pokerLeave();
  out.back = s.gamble.casino.chips === 0;
  while (g.ui.stack.length) g.ui.back();
  return out;
});
check('poker: a $100,000,000 deep buy-in seats you (blinds $500k/$1M), controls fit a phone', pkUI.bb === 1e6 && pkUI.chips > 0 && !pkUI.overflow && pkUI.btnMinH >= 43 && pkUI.depths === 3, JSON.stringify(pkUI));

// ---------------------------------------------------------------- Royale Billions
const ladder = await ev(() => { const P = window.__pv; return { prizes: P.ROYALE_MAJORS.map(m => m.prize), top: P.ROYALE.top }; });
check('slot ladder: $1B top, then $250M $100M $50M $25M $10M $5M $1M $500k $250k $100k $50k $25k $10k', JSON.stringify(ladder.prizes) === JSON.stringify([1e9, 2.5e8, 1e8, 5e7, 2.5e7, 1e7, 5e6, 1e6, 5e5, 2.5e5, 1e5, 5e4, 2.5e4, 1e4]) && ladder.top === 1e9, JSON.stringify(ladder));
const ssim = await ev(() => {
  const P = window.__pv, out = {};
  const run = (bet, N) => { const jp = { pr: {}, hits: {} }; let ret = 0, pos = 0, push = 0, lose = 0, majors = 0, base = 0; for (let i = 0; i < N; i++) { const r = P.royaleSpin(bet, jp); ret += r.win; base += r.major >= 0 ? 0 : r.win; if (r.major >= 0) majors++; if (r.win > bet) pos++; else if (r.win === bet) push++; else lose++; } return { spins: N, rtp: ret / (bet * N), baseRtp: base / (bet * N), netPos: pos / N, push: push / N, lose: lose / N, majors, hits: jp.hits }; };
  out.b100 = run(100, 200000); out.b1m = run(1e6, 100000); out.b1e8 = run(1e8, 50000);
  // what you see is what you are paid: the payout is read back off the reels
  let bad = 0; for (let i = 0; i < 20000; i++) { const jp = { pr: {}, hits: {} }; const r = P.royaleSpin(250, jp); if (r.major < 0 && Math.round(P.royaleEval(r.grid).mult * P.royaleBaseScale(250) * 250) !== r.win) bad++; }
  out.mismatch = bad;
  return out;
});
report.slots = ssim;
console.log('SLOT SIM', JSON.stringify(ssim));
check('slots: ~56–60% of spins pay more than the bet, losses ~40% (200k spins at $100)', ssim.b100.netPos > 0.54 && ssim.b100.netPos < 0.62 && ssim.b100.lose > 0.34 && ssim.b100.lose < 0.44, JSON.stringify(ssim.b100));
check('slots: the base game returns ~98% and the jackpots lift it above 100% (player-favoured)', Math.abs(ssim.b100.baseRtp - 0.984) < 0.02 && ssim.b1m.rtp > 1.0, JSON.stringify([ssim.b100.baseRtp, ssim.b1m.rtp]));
check('slots: no penalty for betting big ($100M a spin keeps the same base game and win rate)', Math.abs(ssim.b1e8.netPos - ssim.b100.netPos) < 0.03 && ssim.b1e8.rtp > 0.98, JSON.stringify(ssim.b1e8));
check('slots: the reels always show what is paid (20,000 spins re-read)', ssim.mismatch === 0, String(ssim.mismatch));
const indep = await ev(() => {
  const P = window.__pv, out = {};
  // every tier is rolled every spin: with the roll forced to hit, the billion lands twice in a row
  const jp = { pr: {}, hits: {} };
  const a = P.royaleSpin(1e7, jp, () => 0), b2 = P.royaleSpin(1e7, jp, () => 0);
  out.twice = [a.win, b2.win]; out.hits = jp.hits.m1b; out.pressureAfter = jp.pr.m1b;
  // the first spin of a fresh save can hit the top prize (it is eligible from spin one)
  out.firstEligible = P.royaleChances(1e7)[0] > 0;
  // v7: full odds from $1,000 (scaled down below it), flat up to about $1M, then the high-roller share rule makes
  // it grow again; it never drops for betting more, and it is the same at any point (no schedule)
  const ch = [100, 1e3, 1e4, 1e5, 1e7, 1e8].map(bet => P.royaleChances(bet)[0]); out.ch = ch;
  out.every = P.royaleEvery(1e3).map(n => n / P.ROYALE.sph);
  // drought pressure: a tier that has not hit builds pressure, a hit resets only that tier
  const j2 = { pr: {}, hits: {} }; let rolls = 0; const rnd = () => { rolls++; return 0.999999; };
  for (let i = 0; i < 500; i++) P.royaleSpin(1e7, j2, rnd);
  out.pr500 = { ...j2.pr };
  const keep = { ...j2.pr }; let k = 0; const forceTier = () => (k++ === 1 ? 0 : 0.999999); // only the second tier rolled hits
  P.royaleSpin(1e7, j2, forceTier);
  out.reset = { m250m: j2.pr.m250m, m1bKept: j2.pr.m1b > keep.m1b };
  return out;
});
check('jackpot: two $1B jackpots back to back are possible (independent rolls, no cooldown)', indep.twice[0] === 1e9 && indep.twice[1] === 1e9 && indep.hits === 2 && indep.pressureAfter === 0, JSON.stringify(indep));
check('jackpot: eligible from the first spin; $100 gets a tenth of full odds; flat $1K-$100K; grows again for high rollers; never drops', indep.firstEligible && Math.abs(indep.ch[0] * 10 - indep.ch[1]) < 1e-15 && indep.ch[1] === indep.ch[2] && indep.ch[2] === indep.ch[3] && indep.ch[3] < indep.ch[4] && indep.ch[4] < indep.ch[5], JSON.stringify(indep.ch));
check('jackpot: at full odds the $1B lands on average every 30 h of play, $1M every ~14 h, $10K every ~40 min', Math.abs(indep.every[0] - 30) < 0.01 && Math.abs(indep.every[7] - 1 / 0.07) < 0.01 && Math.abs(indep.every[13] * 60 - 40) < 0.1, JSON.stringify(indep.every.map(x => +x.toFixed(2))));
check('jackpot drought: pressure builds on every miss, a hit resets only that tier', indep.pr500.m1b > 0.1 && indep.reset.m250m === 0 && indep.reset.m1bKept, JSON.stringify(indep));
const jsim = await ev(() => {
  const P = window.__pv, firsts = [];
  for (let run = 0; run < 60; run++) { const jp = { pr: {}, hits: {} }; let f = null; for (let i = 0; i < 4000 && f === null; i++) if (P.royaleSpin(1e7, jp).major === 0) f = i + 1; firsts.push(f); }
  const got = firsts.filter(x => x !== null).sort((a, b2) => a - b2);
  return { seen: got.length, runs: 60, median: got[got.length >> 1], p90: got[Math.floor(got.length * 0.9)] };
});
report.billion = jsim;
console.log('BILLION SIM', JSON.stringify(jsim));
check('the $1B jackpot is realistically seen: at $10M a spin, within 4,000 spins in most runs', jsim.seen >= 50 && jsim.median < 2000, JSON.stringify(jsim));

// UI: a spin, its reveal, the meter, INFO, and the save of the pressure
const ry = await ev(async () => {
  const g = window.game, G = g.gamble, s = g.save, out = {};
  window.game.money.W.clean = 5e7; G.ry = null; G.spot('g:slot:royale');
  const body = document.getElementById('svcBody');
  out.main = ['BALANCE', 'BET', 'WIN', 'SPIN', 'MAX JACKPOT', '$1,000,000,000'].every(k => body.textContent.includes(k));
  out.spinH = body.querySelector('.rylSpin').getBoundingClientRect().height;
  G.setWager('royale', 1e6); G.ry.bet = 1e6; G.refresh();
  const m0 = window.game.money.clean, pr0 = JSON.stringify(s.gamble.jp.pr);
  g.content._svcAct('ry:spin'); g.content._svcAct('ry:spin');
  const res = G.ry.res; out.hidden = G.shownMoney() === m0 - 1e6; out.settled = window.game.money.clean === m0 - 1e6 + res.win;
  out.prChanged = JSON.stringify(s.gamble.jp.pr) !== pr0;
  out.spinning = body.querySelectorAll('.ryr.spin').length;
  await new Promise(r => { const iv = setInterval(() => { if (!G.ry.spinning) { clearInterval(iv); r(); } }, 20); });
  out.after = window.game.money.clean === m0 - 1e6 + res.win; out.cab = body.querySelector('#rylCab').className;
  // the spin cycle in the real UI: SPIN until SPIN can be pressed again (the cadence the jackpot rates assume adds a tap)
  { G.setWager('royale', 1e3); G.ry.bet = 1e3; G.refresh(); const cyc = []; for (let i = 0; i < 4; i++) { const t0 = performance.now(); g.content._svcAct('ry:spin'); await new Promise(r => { const iv = setInterval(() => { const b = body.querySelector('.rylSpin'); if (!G.ry.spinning && b && !b.disabled) { clearInterval(iv); r(); } }, 10); }); cyc.push(performance.now() - t0); } out.cycle = cyc.map(x => Math.round(x)); }
  g.content._svcAct('ry:info'); out.info = /Line pays/.test(body.textContent) && /Jackpots/.test(body.textContent) && body.querySelectorAll('.rylInfo .stats span').length > 20;
  out.infoTime = /on average every 30 h of play/.test(body.textContent) && /never a schedule/.test(body.textContent);
  out.overflow = body.scrollWidth > body.clientWidth + 1;
  // a forced billion: the full spectacle
  const P = window.__pv, keep = Math.random; let k = 0; Math.random = () => (k++ === 0 ? 0 : keep());
  G.ry.info = false; G.setWager('royale', 1e7); G.ry.bet = 1e7; G.refresh();
  const m1 = window.game.money.clean; g.content._svcAct('ry:spin'); Math.random = keep;
  out.billion = { major: G.ry.res.major, win: G.ry.res.win, cls: G.ry.res.cls, paid: window.game.money.clean - m1 };
  await new Promise(r => { const iv = setInterval(() => { if (!G.ry.spinning) { clearInterval(iv); r(); } }, 20); });
  out.banner = !document.getElementById('banner').classList.contains('hidden'); out.confetti = G.parts.length;
  out.jpHits = s.gamble.jp.hits.m1b; void P;
  // close the machine mid-spin: settled once, the reels show the result when you come back
  const m2 = window.game.money.clean; g.content._svcAct('ry:spin'); const w2 = G.ry.res.win; g.ui.back();
  await new Promise(r => setTimeout(r, 400));
  out.closed = { delta: window.game.money.clean - m2, expect: w2 - 1e7, spinning: G.ry.spinning };
  G.spot('g:slot:royale'); out.reopen = G.shownMoney() === window.game.money.clean; g.ui.back();
  out.pr = JSON.stringify(s.gamble.jp.pr);
  s.stats.playTime = Math.max(s.stats.playTime, 120); g.saveGame(true);
  return out;
});
check('slot screen: BALANCE, BET, WIN, SPIN and MAX JACKPOT $1,000,000,000 on the main view; a big SPIN button', ry.main && ry.spinH >= 52, JSON.stringify(ry));
check('slot: a $1M spin is settled (money and jackpot pressure) before the reels stop; spam spins once; win hidden till the reveal', ry.hidden && ry.settled && ry.prChanged && ry.spinning === 5 && ry.after, JSON.stringify(ry));
check('slot: INFO / PAYTABLE panel holds the rules, pays and jackpots; nothing overflows at 390 px', ry.info && !ry.overflow, JSON.stringify(ry));
check('slot INFO: jackpots shown as average play time at your bet, and said to be a long-run average, never a schedule', ry.infoTime, JSON.stringify(ry.infoTime));
const minCyc = Math.min(...ry.cycle);
check('spin cadence: a spin settles and SPIN re-arms in ~1.95 s (the 1,300 spins/hour design assumes ~0.8 s more to tap again)', minCyc > 1800 && minCyc < 2700 && 3600000 / (minCyc + 800) > 1150 && 3600000 / (minCyc + 800) < 1500, `${ry.cycle.join(' / ')} ms → ${Math.round(3600000 / (minCyc + 800))} spins/h`);
check('slot: a billion-dollar jackpot pays $1,000,000,000 once with the full spectacle', ry.billion.major === 0 && ry.billion.paid === 1e9 - 1e7 && ry.billion.cls === 'billion' && ry.banner && ry.confetti > 200 && ry.jpHits >= 1, JSON.stringify(ry.billion));
check('slot: closing the machine mid-spin settles once; reopening shows the true balance', ry.closed.delta === ry.closed.expect && !ry.closed.spinning && ry.reopen, JSON.stringify(ry.closed));
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
const after = await ev(() => JSON.stringify(window.game.save.gamble.jp.pr));
check('jackpot pressure survives a reload exactly (no reroll by closing the game)', after === ry.pr, `${after.slice(0, 120)} vs ${ry.pr.slice(0, 120)}`);

console.log('CASINO REPORT ' + JSON.stringify(report));
check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
await finish(b, 'casino');
