/* Gambling: Fuel & Go scratch cards and Lucky Pump slot (house edge), the Valen Royale casino (Royale
   Billions, blackjack, roulette, no-limit Hold'em) with no table limits, records, celebration scaling, and
   money integrity: every bet is settled once, spam, closing a screen mid-reveal and reloading mid-hand
   neither duplicate nor lose money. The casino's 60/40 balance and high stakes are in casino.mjs. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const t = await open(b, {});
const page = t.page;
const ev = (f, a) => page.evaluate(f, a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
await startNew(page);
const quiet = () => ev(() => { const g = window.game; g.quality.setMode(0); g.events.cool = 1e9; g.police.enabled = false; g.traffic.enabled = false; });
await quiet();
await ev(() => { (window.game.money.W.clean = window.game.money.W.dirty.me = 5e6); });

// ---------------------------------------------------------------- 1. the maths: Fuel & Go keeps a house edge; roulette's pay table is the standard one
const maths = await ev(() => {
  const P = window.__pv, out = { scratch: {}, slots: {} };
  for (const d in P.SCRATCH_CARDS) { const c = P.SCRATCH_CARDS[d]; out.scratch[d] = { rtp: P.scratchRTP(d), grand: c.grand, odds: c.prizes.reduce((a, p) => a + p[1], 0) }; }
  for (const id in P.SLOT_DEFS) { const def = P.SLOT_DEFS[id]; out.slots[id] = def.bets.map(bet => ({ bet, ...P.slotRTP(def, bet), top: P.slotTop(def, bet) })); }
  // roulette: exact expected return of every bet type over the 37 pockets
  const rr = {}; for (const key of ['n:17', 'red', 'black', 'odd', 'even', 'low', 'high', 'd1', 'd2', 'd3', 'c1', 'c2', 'c3']) { let w = 0; for (let n = 0; n <= 36; n++) w += P.roulettePayout({ [key]: 1 }, n); rr[key] = w / 37; }
  out.roul = rr;
  return out;
});
const grands = { 5: 12500, 10: 25000, 20: 75000, 50: 250000, 100: 1000000 };
check('scratch: five denominations with the specified grand prizes', Object.keys(maths.scratch).join() === '5,10,20,50,100' && Object.entries(grands).every(([d, gp]) => maths.scratch[d].grand === gp), JSON.stringify(Object.fromEntries(Object.entries(maths.scratch).map(([d, v]) => [d, v.grand]))));
check('scratch: expected value below the price for every card (RTP 45–75%)', Object.values(maths.scratch).every(v => v.rtp > 0.45 && v.rtp < 0.75), JSON.stringify(Object.fromEntries(Object.entries(maths.scratch).map(([d, v]) => [d, +(v.rtp * 100).toFixed(1)]))));
check('scratch: a win about one card in three or four', Object.values(maths.scratch).every(v => v.odds > 0.22 && v.odds < 0.36), JSON.stringify(Object.values(maths.scratch).map(v => v.odds.toFixed(3))));
check('slots: every machine and bet returns less than it takes (78–96%)', Object.values(maths.slots).every(a => a.every(r => r.rtp > 0.78 && r.rtp < 0.96)), JSON.stringify(Object.fromEntries(Object.entries(maths.slots).map(([k, a]) => [k, a.map(r => +(r.rtp * 100).toFixed(1))]))));
const fuel100 = maths.slots.fuel.find(r => r.bet === 100);
check('Fuel & Go slot: bets $10/$25/$50/$100, high-roller jackpot $2–5M and extremely rare', maths.slots.fuel.map(r => r.bet).join() === '10,25,50,100' && fuel100.top >= 2e6 && fuel100.top <= 5e6 && fuel100.jp < 1e-6, JSON.stringify(fuel100));
check('roulette: the pay table is standard European (every bet 36/37 on a fair wheel: the 2.7% edge, casino.mjs)', Object.values(maths.roul).every(v => Math.abs(v - 36 / 37) < 1e-9), JSON.stringify(maths.roul));

// ---------------------------------------------------------------- 2. scratch cards: purchase, reveal, payout, records
const sc = await ev(async () => {
  const g = window.game, G = g.gamble, s = g.save, out = [];
  g.content.openStore();
  const storeBtn = !!document.querySelector('#svcBody [data-act="scratch"]');
  g.content._svcAct('scratch');
  const title = document.getElementById('svcTitle').textContent;
  for (const d of [5, 10, 20, 50, 100]) {
    const m0 = window.game.money.clean, st0 = { ...s.gamble.scratch };
    g.content._svcAct('buy:' + d);
    const win = G.sc.win, hidden = G.shownMoney() === m0 - d;
    g.content._svcAct('buy:' + d); // a second buy while the card is unscratched is refused
    const once = window.game.money.clean === m0 - d + win;
    const t0 = performance.now(); g.content._svcAct('scratch');
    await new Promise(r => { const iv = setInterval(() => { if (G.sc.done) { clearInterval(iv); r(); } }, 20); });
    const dur = performance.now() - t0;
    const st = s.gamble.scratch;
    out.push({ d, win, hidden, once, dur, shownAfter: G.shownMoney() === window.game.money.clean, stats: st.bought === st0.bought + 1 && st.spent === st0.spent + d && st.won === st0.won + win, cells: G.sc.cells.length, match: win ? G.sc.cells.filter(c => c === win).length === 3 : Object.values(G.sc.cells.reduce((a, c) => (a[c] = (a[c] || 0) + 1, a), {})).every(n => n < 3) });
  }
  // drag-scratch: panels opened one at a time by touch
  g.content._svcAct('buy:5'); for (let i = 0; i < 9; i++) g.content._svcAct('sc:' + i);
  const drag = G.sc.done;
  return { storeBtn, title, out, drag };
});
check('Fuel & Go sells scratch cards from the shop screen', sc.storeBtn && sc.title === 'Scratch Cards', sc.title);
check('scratch: every denomination charges once and pays its win exactly once', sc.out.every(r => r.once), JSON.stringify(sc.out.map(r => [r.d, r.win, r.once])));
check('scratch: a win stays hidden until the card is scratched', sc.out.every(r => r.hidden && r.shownAfter));
check('scratch: the full scratch takes 2–3 seconds', sc.out.every(r => r.dur > 1900 && r.dur < 3100), JSON.stringify(sc.out.map(r => Math.round(r.dur))));
check('scratch: nine panels, three matching amounts only on a winning card', sc.out.every(r => r.cells === 9 && r.match));
check('scratch: records (bought, spent, won) update with every card', sc.out.every(r => r.stats));
check('scratch: scratching panel by panel (drag) finishes the card', sc.drag);

// ---------------------------------------------------------------- 3. celebrations scale with the win
const cel = await ev(() => {
  const G = window.game.gamble, out = {};
  for (const cls of ['none', 'small', 'medium', 'large', 'jackpot']) { G.parts.length = 0; G.celebrate(cls, 1000, 'TEST'); out[cls] = G.parts.length; }
  G.parts.length = 0;
  const P = window.__pv;
  out.classes = [P.winClass(0, 10, 0), P.winClass(10, 10, 0), P.winClass(60, 10, 0), P.winClass(600, 10, 0), P.winClass(3e6, 100, 3e6)];
  return out;
});
check('celebration: confetti only for large wins and jackpots, bigger for jackpots', cel.none === 0 && cel.small === 0 && cel.medium === 0 && cel.large > 0 && cel.jackpot > cel.large, JSON.stringify(cel));
check('win classes: none / small / medium / large / jackpot', cel.classes.join() === 'none,small,medium,large,jackpot', cel.classes.join());
// a forced grand prize: jackpot class, banner and confetti
const grand = await ev(async () => {
  const g = window.game, G = g.gamble, s = g.save;
  G.openScratch(); const m0 = window.game.money.clean; const old = G.scratchDraw; G.scratchDraw = den => window.__pv.SCRATCH_CARDS[den].grand;
  g.content._svcAct('buy:100'); G.scratchDraw = old;
  g.content._svcAct('scratch');
  await new Promise(r => { const iv = setInterval(() => { if (G.sc.done) { clearInterval(iv); r(); } }, 20); });
  const r = { paid: window.game.money.clean - m0, cls: G.sc.cls, confetti: G.parts.length, banner: !document.getElementById('banner').classList.contains('hidden'), biggest: s.gamble.scratch.biggest };
  G.parts.length = 0; return r;
});
check('scratch grand prize: $1,000,000 paid once, jackpot celebration, record kept', grand.paid === 1e6 - 100 && grand.cls === 'jackpot' && grand.confetti > 100 && grand.banner && grand.biggest === 1e6, JSON.stringify(grand));

// ---------------------------------------------------------------- 4. the Lucky Pump slot at Fuel & Go
const storeSlot = await ev(() => { const def = window.__pv.INTERIOR_DEFS.store; return def.spots.find(s => s.id === 'slot'); });
check('Fuel & Go interior has the slot cabinet to walk up to', !!storeSlot, JSON.stringify(storeSlot));
const sl = await ev(async () => {
  const g = window.game, G = g.gamble, s = g.save;
  g.content.spotAct('slot');
  const title = document.getElementById('svcTitle').textContent, lever = !!document.querySelector('#svcBody .lever[data-act="spin"]');
  const res = [];
  for (const bet of [10, 25, 50, 100]) {
    g.content._svcAct('bet:' + bet);
    const m0 = window.game.money.clean, sp0 = s.gamble.slots.spins;
    g.content._svcAct('spin'); g.content._svcAct('spin'); G.slotGo('fuel', G.slotState.fuel); // spam: one spin only
    const st = G.slotState.fuel, r = st.res, hid = G.shownMoney() === m0 - bet;
    // each reel-stop clunk is recorded with the reel count at that moment (event-driven, not polled)
    const stops = [], t0 = performance.now(), play = g.audio.play;
    g.audio.play = function (n, o) { if (n === 'reelstop') stops.push([st.stopped, Math.round(performance.now() - t0)]); return play.call(this, n, o); };
    await new Promise(done => { const iv = setInterval(() => { if (!st.spinning) { clearInterval(iv); done(); } }, 15); });
    g.audio.play = play;
    res.push({ bet, win: r.win, once: window.game.money.clean === m0 - bet + r.win && s.gamble.slots.spins === sp0 + 1, hid, stops, grid: r.grid.map(c => c[0]) });
  }
  // the payout matches the pay table for the symbols shown
  const P = window.__pv, def = P.SLOT_DEFS.fuel; let bad = 0;
  for (let i = 0; i < 4000; i++) { const bet = def.bets[i % 4], r = P.slotSpin(def, bet, 0), [a, b2, c] = r.grid.map(x => x[0]), tb = def.table[bet]; const x = a === b2 && b2 === c ? tb.three[a] || 0 : a === b2 ? tb.two[a] || 0 : tb.one[a] || 0; if (Math.round(x * bet) !== r.win) bad++; }
  return { title, lever, res, bad };
});
check('slot: opens from the cabinet with a pull handle and SPIN', sl.title === 'Lucky Pump' && sl.lever, sl.title);
check('slot: each bet ($10/$25/$50/$100) deducted once even when SPIN is spammed; win paid once', sl.res.every(r => r.once), JSON.stringify(sl.res.map(r => [r.bet, r.win, r.once])));
check('slot: the three reels stop one after another', sl.res.every(r => r.stops.length >= 3 && r.stops[0][0] === 1 && r.stops[1][0] === 2 && r.stops[2][0] === 3 && r.stops[1][1] - r.stops[0][1] > 200 && r.stops[2][1] - r.stops[1][1] > 200), JSON.stringify(sl.res.map(r => r.stops)));
check('slot: win hidden until the last reel stops', sl.res.every(r => r.hid));
check('slot: 4,000 spins all pay exactly what the pay table says', sl.bad === 0, String(sl.bad));
const jp = await ev(async () => {
  const g = window.game, G = g.gamble, s = g.save, st = G.slotState.fuel;
  g.content._svcAct('bet:100'); const m0 = window.game.money.clean, j0 = s.gamble.slots.jackpots;
  const rnd = Math.random; Math.random = () => 0; // every reel lands on 7
  try { G.slotGo('fuel', st); } finally { Math.random = rnd; }
  await new Promise(done => { const iv = setInterval(() => { if (!st.spinning) { clearInterval(iv); done(); } }, 20); });
  const r = { paid: window.game.money.clean - m0, cls: st.res.cls, jackpots: s.gamble.slots.jackpots - j0, confetti: G.parts.length, biggest: s.gamble.slots.biggest };
  G.parts.length = 0; while (g.ui.stack.length) g.ui.back(); return r;
});
check('slot jackpot (forced 7-7-7 at $100): $3,000,000 paid once, jackpot celebration, counted', jp.paid === 3e6 - 100 && jp.cls === 'jackpot' && jp.jackpots === 1 && jp.confetti > 100 && jp.biggest === 3e6, JSON.stringify(jp));

// ---------------------------------------------------------------- 5. the casino: on the map, enterable, every station reachable
const casMap = await ev(() => { const g = window.game; g.ui.toggleMap(true); const entries = g.ui.mapView.entries || []; g.ui.toggleMap(false); const e = entries.find(x => x.name === 'The Valen Royale'); const pl = g.world.places.casino; return { e: e && { cat: e.cat, icon: e.icon, district: e.district }, door: pl && pl.door, n: entries.length }; });
check('casino is a landmark on the big map index, in the Nightlife Strip', casMap.e && casMap.e.cat === 'casino' && casMap.e.district === 'Nightlife Strip', JSON.stringify(casMap));
const inside = await ev(async () => {
  const g = window.game, d = g.world.places.casino.door;
  g.resetPlayerState(d.x, d.z + 1, Math.PI);
  const a = g.content.findAction(); const label = a && a.label; a && a.act();
  await new Promise(r => setTimeout(r, 1400));
  const I = g.content.interiors, D = I.cur;
  const st = D ? D.spots.map(s => { g.player.pos.set(D.ox + s.x, D.fy, D.oz + s.z); const f = g.content.findAction(); return [s.id, !!f]; }) : [];
  return { label, cur: D && D.id, spots: st, kinds: D ? [...new Set(D.spots.map(s => s.id.split(':')[1]))] : [], npcs: D ? D.chars.length : 0 };
});
check('casino door: walk in through the front doors', inside.label === 'Enter The Valen Royale' && inside.cur === 'casino', JSON.stringify(inside.label));
check('casino floor: cashier, bar, slot banks, blackjack, roulette and poker stations', ['cashier', 'bar', 'slot', 'bj', 'roul', 'poker'].every(k => inside.kinds.includes(k)) && inside.spots.every(s => s[1]), JSON.stringify(inside.kinds));
check('casino floor: dealers, staff and patrons', inside.npcs >= 20, String(inside.npcs));
await frames(page, 20);
const fps = await ev(async () => { const g = window.game, f0 = g.frame, t0 = performance.now(); await new Promise(r => setTimeout(r, 2500)); return (g.frame - f0) / ((performance.now() - t0) / 1000); });
check('casino interior renders without a frame-rate collapse', fps > 3, fps.toFixed(1) + ' fps (software GL)');

// ---------------------------------------------------------------- 6. table limits by room (M9): anyone sits anywhere; the VIP limit needs Rep
const lim = await ev(() => {
  const g = window.game, G = g.gamble, s = g.save, K = window.__pv.CASINO, out = {};
  const keep = window.game.money.clean, rep = s.rep; window.game.money.W.clean = 500;
  out.open = []; for (const k of ['g:bj:0', 'g:bj:3', 'g:roul:3', 'g:poker:0', 'g:slot:royale']) { G.spot(k); out.open.push(document.getElementById('svcTitle').textContent); while (g.ui.stack.length) g.ui.back(); }
  window.game.money.W.clean = 1e7; s.rep = 0;
  G.seat = 0; out.floor = G.maxBet('bj'); G.seat = 3; out.vipNobody = G.maxBet('bj'); s.rep = K.vipRep; out.vipKnown = G.maxBet('bj'); out.slot = G.maxBet('royale');
  G.seat = 0; out.capped = G.setWager('bj', 5e6);
  s.rep = rep; window.game.money.W.clean = keep;
  return out;
});
check('anyone can sit at every table (five stations open with $500)', lim.open.every(t => !!t) && lim.open.length === 5, JSON.stringify(lim.open));
check('limits: $10,000 on the floor; the VIP table is $10,000 for a nobody and $250,000 once known (Rep 1,300); the Royale slot $10,000', lim.floor === 1e4 && lim.vipNobody === 1e4 && lim.vipKnown === 2.5e5 && lim.slot === 1e4 && lim.capped === 1e4, JSON.stringify(lim));

// ---------------------------------------------------------------- 7. blackjack (ordinary rules)
const bj = await ev(async () => {
  const g = window.game, G = g.gamble, s = g.save, C = (r, su = 0) => ({ r, s: su }), K = window.__pv.CASINO;
  const fill = () => window.__pv.makeDeck(2).slice(0, 100);
  // shoe pops from the end: player, player, dealer, dealer, then hits
  const deal = (seq) => { G.shoe = fill().concat(seq.slice().reverse()); };
  const wait = () => new Promise(r => { const iv = setInterval(() => { if (!G.busy) { clearInterval(iv); r(); } }, 20); });
  const out = {};
  G.openBlackjack(0); g.content._svcAct('w:q:100');
  // natural blackjack pays 3:2
  let m0 = window.game.money.clean; deal([C(14), C(13), C(9), C(7)]); G.bjDeal(); await wait(); out.natural = window.game.money.clean - m0;
  // dealer stands on soft 17 (A,6): player 18 wins
  m0 = window.game.money.clean; deal([C(10), C(8), C(14), C(6)]); G.bjDeal(); G.bjAction('stand'); await wait(); out.s17 = { won: window.game.money.clean - m0, dealer: G.bj.dealer.length };
  // double: 11 + 10 = 21 against dealer 10,7
  m0 = window.game.money.clean; deal([C(5), C(6), C(10), C(7), C(10)]); G.bjDeal(); G.bjAction('double'); await wait(); out.double = window.game.money.clean - m0;
  // split eights: each hand gets a card, both stand, dealer busts (10,6 then 10)
  m0 = window.game.money.clean; deal([C(8), C(8, 1), C(10), C(6), C(3), C(2), C(10)]); G.bjDeal(); G.bjAction('split'); const hands = G.bj.hands.length; G.bjAction('stand'); G.bjAction('stand'); await wait(); out.split = { hands, won: window.game.money.clean - m0 };
  // bust loses the bet
  m0 = window.game.money.clean; deal([C(10), C(6), C(10), C(7), C(10)]); G.bjDeal(); G.bjAction('hit'); await wait(); out.bust = window.game.money.clean - m0;
  // push returns the bet
  m0 = window.game.money.clean; deal([C(10), C(8), C(10), C(8)]); G.bjDeal(); G.bjAction('stand'); await wait(); out.push = window.game.money.clean - m0;
  // spam: deal twice charges once
  m0 = window.game.money.clean; deal([C(10), C(9), C(10), C(5), C(9)]); G.bjDeal(); G.bjDeal(); out.spam = m0 - window.game.money.clean;
  // walking away mid-hand stands it and pays (dealer 15 draws 9 and busts)
  g.ui.back(); out.walk = { won: window.game.money.clean - m0, table: s.gamble.table, phase: G.bj.phase };
  out.stats = { hands: s.gamble.casino.bjHands, wins: s.gamble.casino.bjWins };
  // a $250,000 hand at the VIP table, for someone known there
  const rep0 = s.rep; s.rep = Math.max(s.rep, K.vipRep); window.game.money.W.clean = Math.max(window.game.money.clean, 2e7); G.openBlackjack(3); G.bj.bet = G.setWager('bj', 2.5e5); m0 = window.game.money.clean; deal([C(10), C(9), C(10), C(7)]); G.bjDeal(); G.bjAction('stand'); await wait(); out.big = window.game.money.clean - m0; s.rep = rep0;
  while (g.ui.stack.length) g.ui.back();
  return out;
});
check('blackjack: a natural pays 3:2', bj.natural === 150, String(bj.natural));
check('blackjack: dealer stands on soft 17', bj.s17.dealer === 2 && bj.s17.won === 100, JSON.stringify(bj.s17));
check('blackjack: double down doubles the bet and the win', bj.double === 200, String(bj.double));
check('blackjack: split makes two hands, each paid', bj.split.hands === 2 && bj.split.won === 200, JSON.stringify(bj.split));
check('blackjack: bust loses, push returns the stake', bj.bust === -100 && bj.push === 0, JSON.stringify([bj.bust, bj.push]));
check('blackjack: DEAL spammed charges one bet', bj.spam === 100, String(bj.spam));
check('blackjack: leaving mid-hand stands the hand and settles it once', bj.walk.won === 100 && bj.walk.table === null && bj.walk.phase === 'done', JSON.stringify(bj.walk));
check('blackjack: hands and wins recorded', bj.stats.hands >= 7 && bj.stats.wins >= 5, JSON.stringify(bj.stats));
check('blackjack: a $250,000 VIP hand plays and pays (19 v 17: +$250,000)', bj.big === 2.5e5, String(bj.big));

// ---------------------------------------------------------------- 8. roulette: many bets in one spin, no table maximum
const rl = await ev(async () => {
  const g = window.game, G = g.gamble, s = g.save, out = {};
  G.roul = null; G.openRoulette(0);
  g.content._svcAct('w:q:100'); for (const k of ['red', 'n:17', 'black', 'odd', 'd2', 'c3', 'n:0', 'high']) g.content._svcAct('rb:' + k);
  out.many = Object.values(G.roul.bets).reduce((a, b2) => a + b2, 0);
  g.content._svcAct('clear');
  G.setWager('roul', 25); g.content._svcAct('rb:red'); g.content._svcAct('rb:n:17'); g.content._svcAct('rb:d2');
  const m0 = window.game.money.clean, spins0 = s.gamble.casino.rouletteSpins;
  g.content._svcAct('rspin'); g.content._svcAct('rspin'); G.roulSpin();
  const n = G.roul.spinning.n, expect = window.__pv.roulettePayout({ red: 25, 'n:17': 25, d2: 25 }, n);
  out.hidden = G.shownMoney() === m0 - 75;
  await new Promise(r => { const iv = setInterval(() => { if (!G.roul.spinning) { clearInterval(iv); r(); } }, 20); });
  out.paid = window.game.money.clean - m0; out.expect = expect - 75; out.spins = s.gamble.casino.rouletteSpins - spins0; out.n = n;
  out.rebet = (g.content._svcAct('rebet'), Object.values(G.roul.bets).reduce((a, b2) => a + b2, 0));
  out.cells = document.querySelectorAll('#svcBody .rc').length;
  while (g.ui.stack.length) g.ui.back();
  return out;
});
check('roulette: eight different bets on one spin (the old $100 cap is gone)', rl.many === 800, String(rl.many));
check('roulette: one spin settles every bet exactly once (spam-safe)', rl.paid === rl.expect && rl.spins === 1 && rl.hidden, JSON.stringify(rl));
check('roulette: full layout (0–36 plus 12 outside bets) and REBET', rl.cells === 37 + 12 && rl.rebet === 75, JSON.stringify([rl.cells, rl.rebet]));

// ---------------------------------------------------------------- 9. Texas Hold'em, no limit, one table
const pk = await ev(async () => {
  const g = window.game, G = g.gamble, s = g.save, P = window.__pv, C = (r, su) => ({ r, s: su }), out = {};
  const v = cs => P.handCat(P.rank5(cs));
  out.ranks = [v([C(14, 0), C(13, 0), C(12, 0), C(11, 0), C(10, 0)]), v([C(9, 0), C(9, 1), C(9, 2), C(9, 3), C(2, 0)]), v([C(9, 0), C(9, 1), C(9, 2), C(4, 3), C(4, 0)]), v([C(2, 0), C(7, 0), C(9, 0), C(11, 0), C(4, 0)]), v([C(14, 1), C(2, 0), C(3, 2), C(4, 0), C(5, 3)]), v([C(9, 0), C(9, 1), C(9, 2), C(4, 3), C(2, 0)]), v([C(9, 0), C(9, 1), C(4, 2), C(4, 3), C(2, 0)]), v([C(9, 0), C(9, 1), C(3, 2), C(4, 3), C(2, 0)]), v([C(14, 0), C(9, 1), C(3, 2), C(4, 3), C(2, 0)])];
  out.kicker = P.rank5([C(14, 0), C(14, 1), C(13, 2), C(4, 3), C(2, 0)]) > P.rank5([C(14, 2), C(14, 3), C(12, 2), C(4, 1), C(2, 1)]);
  out.wheelLow = P.rank5([C(14, 1), C(2, 0), C(3, 2), C(4, 0), C(5, 3)]) < P.rank5([C(6, 1), C(2, 0), C(3, 2), C(4, 0), C(5, 3)]);
  G.pk = null; G.openPoker(); const m0 = window.game.money.clean;
  G.setWager('pokerBuy', 500); g.content._svcAct('sit'); G.token++; // stop the table's own pacing; this test drives the hands
  out.sit = { cash: m0 - window.game.money.clean, chips: s.gamble.casino.chips, seats: G.pk.seats.length, pers: G.pk.seats.slice(1).map(x => x.pers) };
  const total = () => G.pk.seats.reduce((a, x) => a + x.stack + x.put, 0) + G.pk.pot;
  const play = () => { let guard = 0; while (G.pk.phase === 'play' && guard++ < 500) { if (G.pk.toAct === 0) { const o = G.pkRaiseOptions(); if (o.length && Math.random() < 0.3) G.pokerAct(0, 'raise', pick(o).to); else G.pokerAct(0, 'call'); } else { const d = G.pokerAI(G.pk.toAct, true); G.pokerAct(G.pk.toAct, d.kind, d.to); } } return guard; };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  play();
  let bad = 0, hands = 0, shows = 0;
  for (let h = 0; h < 40; h++) {
    for (const x of G.pk.seats) if (x.isP && x.stack < G.pk.bb * 4) x.stack += 500;
    G.pokerHand(); G.token++; const before = total(); const guard = play(); const after = total(); hands++;
    if (G.pk.phase === 'show') shows++;
    if (before !== after || guard >= 500) bad++;
  }
  out.hands = { hands, bad, shows, pokerHands: s.gamble.casino.pokerHands };
  const pk2 = G.pk; pk2.board = [C(2, 0), C(7, 1), C(9, 2), C(11, 3), C(13, 0)];
  pk2.seats.forEach((x, i) => { x.folded = i === 3; x.put = 0; x.allin = i === 0; });
  pk2.seats[0].hole = [C(13, 1), C(13, 2)]; pk2.seats[0].total = 100;
  pk2.seats[1].hole = [C(11, 0), C(11, 1)]; pk2.seats[1].total = 300;
  pk2.seats[2].hole = [C(3, 0), C(4, 1)]; pk2.seats[2].total = 300;
  pk2.seats[3].total = 0;
  const st0 = pk2.seats.map(x => x.stack); pk2.pot = 700; pk2.phase = 'play'; pk2.walk = true;
  G.pokerShowdown();
  out.side = pk2.seats.map((x, i) => x.stack - st0[i]);
  G.busy = false;
  const chips = G.pk.seats[0].stack, m1 = window.game.money.clean; g.content._svcAct('leave');
  out.leave = { back: window.game.money.clean - m1, chips, saved: s.gamble.casino.chips, pk: !!G.pk };
  out.ai = P.POKER_AI.map(a => a.pers);
  while (g.ui.stack.length) g.ui.back();
  return out;
});
check('poker: hand ranking (straight flush, quads, full house, flush, wheel, trips, two pair, pair, high card)', pk.ranks.join() === '8,7,6,5,4,3,2,1,0' && pk.kicker && pk.wheelLow, JSON.stringify(pk.ranks));
check('poker: buy-in moves cash to chips held in the save; three AI regulars', pk.sit.cash === 500 && pk.sit.chips > 0 && pk.sit.chips <= 500 && pk.sit.seats === 4, JSON.stringify(pk.sit));
check('poker: AI personalities cautious, aggressive, loose, bluff-heavy', ['cautious', 'aggressive', 'loose', 'bluffer'].every(p => pk.ai.includes(p)), pk.ai.join());
check('poker: 40 no-limit hands play out; chips only ever move (no rake)', pk.hands.bad === 0 && pk.hands.hands === 40, JSON.stringify(pk.hands));
check('poker: side pots — a short all-in wins only what it could match', pk.side[0] === 300 && pk.side[1] === 400 && pk.side[2] === 0, JSON.stringify(pk.side));
check('poker: cashing out returns every chip once', pk.leave.back === pk.leave.chips && pk.leave.saved === 0 && !pk.leave.pk, JSON.stringify(pk.leave));

// ---------------------------------------------------------------- 10. Royale Billions on the floor (more in casino.mjs)
const floor = await ev(async () => {
  const g = window.game, G = g.gamble, s = g.save, out = {};
  G.spot('g:slot:royale'); g.content._svcAct('w:q:100');
  const m0 = window.game.money.clean, sp0 = s.gamble.casino.slotSpins;
  g.content._svcAct('ry:spin'); g.content._svcAct('ry:spin'); g.content._svcAct('ry:spin');
  const win = G.ry.res.win;
  await new Promise(r => { const iv = setInterval(() => { if (!G.ry.spinning) { clearInterval(iv); r(); } }, 20); });
  out.ok = window.game.money.clean === m0 - 100 + win; out.spins = s.gamble.casino.slotSpins - sp0; out.reels = G.ry.grid.length; out.rows = G.ry.grid[0].length;
  while (g.ui.stack.length) g.ui.back();
  return out;
});
check('Royale Billions: 5 reels × 3 rows; SPIN spammed settles one $100 spin once', floor.ok && floor.spins === 1 && floor.reels === 5 && floor.rows === 3, JSON.stringify(floor));

// ---------------------------------------------------------------- 11. close mid-reveal, reload mid-hand: no duplication, no loss
const midClose = await ev(async () => {
  const g = window.game, G = g.gamble, s = g.save, out = {};
  G.openSlot('fuel'); g.content._svcAct('bet:10'); const m0 = window.game.money.clean; g.content._svcAct('spin'); const win = G.slotState.fuel.res.win;
  g.ui.back(); // closed while the reels spin
  await new Promise(r => setTimeout(r, 1800));
  out.slot = { delta: window.game.money.clean - m0, expect: win - 10, spinning: G.slotState.fuel.spinning };
  G.openSlot('fuel'); out.reopenShown = G.shownMoney() === window.game.money.clean; g.ui.back();
  G.openScratch(); const m1 = window.game.money.clean; g.content._svcAct('buy:10'); const w2 = G.sc.win; g.ui.back();
  G.openScratch(); out.scratchKept = !!G.sc && !G.sc.done && G.shownMoney() === m1 - 10; g.content._svcAct('scratch');
  await new Promise(r => { const iv = setInterval(() => { if (G.sc.done) { clearInterval(iv); r(); } }, 20); });
  out.scratch = window.game.money.clean - m1 === w2 - 10;
  g.ui.back();
  return out;
});
check('closing the slot mid-spin: money settled once, reels cleared', midClose.slot.delta === midClose.slot.expect && !midClose.slot.spinning && midClose.reopenShown, JSON.stringify(midClose.slot));
check('closing an unscratched card keeps it to finish later, paid once', midClose.scratchKept && midClose.scratch);

// a blackjack hand and a poker stack left on the table survive a reload: stood and cashed out
const pre = await ev(() => {
  const g = window.game, G = g.gamble, s = g.save, C = r => ({ r, s: 0 });
  G.setWager('bj', 250); G.openBlackjack(1);
  G.shoe = window.__pv.makeDeck(2).slice(0, 100).concat([C(9), C(10), C(10), C(10), C(10)].reverse()); // player 19 v dealer 20
  G.bjDeal();
  G.openPoker(); // switching tables stands the blackjack hand first
  const afterSwitch = { table: s.gamble.table, bj: G.bj.phase };
  G.openBlackjack(1);
  G.shoe = window.__pv.makeDeck(2).slice(0, 100).concat([C(10), C(10), C(10), C(7), C(5)].reverse()); // player 20 v dealer 17
  G.bjDeal();
  const table = JSON.parse(JSON.stringify(s.gamble.table));
  s.stats.playTime = Math.max(s.stats.playTime, 120);
  g.saveGame(true);
  return { money: window.game.money.clean, table, hands: s.gamble.casino.bjHands, afterSwitch };
});
check('switching tables mid-hand stands and settles the blackjack hand', pre.afterSwitch.table === null && pre.afterSwitch.bj === 'done', JSON.stringify(pre.afterSwitch));
check('an open blackjack hand is written to the save with its stake already paid', pre.table && pre.table.game === 'bj' && pre.table.hands[0].bet === 250, JSON.stringify(pre.table));
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
await quiet();
const post = await ev(() => { const s = window.game.save; return { money: window.game.money.clean, table: s.gamble.table, hands: s.gamble.casino.bjHands }; });
check('reload mid-hand: the hand is stood (20 v 17) and paid exactly once', post.table === null && post.money === pre.money + 500 && post.hands === pre.hands + 1, JSON.stringify([pre.money, post]));
// poker chips across a reload
const pkPre = await ev(() => { const g = window.game, G = g.gamble, s = g.save; G.openPoker(); G.setWager('pokerBuy', 1000); g.content._svcAct('sit'); G.token++; s.stats.playTime = Math.max(s.stats.playTime, 120); g.saveGame(true); return { money: window.game.money.clean, chips: s.gamble.casino.chips }; });
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
await quiet();
const pkPost = await ev(() => { const s = window.game.save; return { money: window.game.money.clean, chips: s.gamble.casino.chips }; });
check('reload at the poker table: chips cashed out once (the blind in the pot is forfeit, like a fold)', pkPost.chips === 0 && pkPost.money === pkPre.money + pkPre.chips && pkPre.chips >= 990, JSON.stringify([pkPre, pkPost]));
// records persist
const rec = await ev(() => JSON.stringify(window.game.save.gamble));
check('gambling records survive save and reload', /"bought":\d+/.test(rec) && JSON.parse(rec).scratch.bought >= 7 && JSON.parse(rec).slots.jackpots >= 1 && JSON.parse(rec).casino.bjHands >= 9, rec.slice(0, 300));
// a damaged pending hand in a save is refunded, not lost or duplicated
const bad = await ev(() => { const SS = window.__pv.SaveSystem, g = window.game; const d = JSON.parse(JSON.stringify(g.save)); d.gamble.table = { game: 'bj', tier: 0, hands: [{ cards: 'junk', bet: 80 }], dealer: [] }; const m = d.wallet.clean; const r = SS.sanitize ? SS.sanitize(d) : null; return { m, after: (r || d).wallet.clean, table: (r || d).gamble.table, has: !!SS.sanitize }; });
check('a malformed saved hand is refunded to Clean Bank on load', !bad.has || (bad.after === bad.m + 80 && bad.table === null), JSON.stringify(bad));

check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
await finish(b, 'gambling');
