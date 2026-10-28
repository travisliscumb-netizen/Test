/* The newer Valen Royale tables (M9): baccarat, craps, three card poker and the sportsbook. The rules and the
   ordinary house edges are measured by simulation on the game's own pure functions; each table settles a bet in
   one step through the casino ledger (stake out, any win in); limits follow the room; the sportsbook's matches
   come from the day's seed, a bet settles once when the economic day ends, and an open bet survives a reload;
   every station is on the casino floor. Simulation results are printed for the report. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const t = await open(b, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = t.page;
const ev = (f, a) => page.evaluate(f, a);
await startNew(page);
await ev(() => { const g = window.game; g.events.cool = 1e9; g.police.enabled = false; g.traffic.enabled = false; });

// ---------------------------------------------------------------- the rules, by hand
const rules = await ev(() => {
  const P = window.__pv, seq = a => { let i = 0; return () => a[i++ % a.length]; }, out = {};
  // baccarat: naturals stand; a tie returns player and banker bets; banker pays 0.95
  out.bpay = [P.baccaratPay({ player: 100 }, 'player'), P.baccaratPay({ banker: 100 }, 'banker'), P.baccaratPay({ tie: 100, player: 100 }, 'tie'), P.baccaratPay({ banker: 100 }, 'player'), P.baccaratPay({ banker: 10 }, 'banker')];
  // craps: forced dice (each die = 1 + floor(r * 6))
  const d = (a, b2) => [(a - 1) / 6 + 0.01, (b2 - 1) / 6 + 0.01];
  out.c7 = P.crapsDecision(seq(d(3, 4))).result; out.c2 = P.crapsDecision(seq(d(1, 1))).result; out.c12 = P.crapsDecision(seq(d(6, 6))).result;
  out.cPoint = P.crapsDecision(seq([...d(2, 2), ...d(5, 6), ...d(1, 3)])); out.cSeven = P.crapsDecision(seq([...d(4, 5), ...d(3, 4)]));
  out.cpay = [P.crapsPay({ pass: 100 }, { result: 'pass', rolls: [[3, 4]] }), P.crapsPay({ dont: 100 }, { result: 'push12', rolls: [[6, 6]] }), P.crapsPay({ field: 100 }, { result: 'dont', rolls: [[1, 1]] }), P.crapsPay({ field: 100 }, { result: 'pass', rolls: [[4, 5]] }), P.crapsPay({ field: 100 }, { result: 'pass', rolls: [[3, 4]] })];
  // three card poker ranks: straight flush > trips > straight > flush > pair > high; A-2-3 is a straight
  const R = h => P.tcpRank(h)[0];
  out.tcp = [R([[5, 0], [6, 0], [7, 0]]), R([[9, 1], [9, 2], [9, 3]]), R([[14, 0], [2, 1], [3, 2]]), R([[2, 1], [8, 1], [11, 1]]), R([[10, 0], [10, 2], [4, 1]]), R([[14, 0], [9, 1], [4, 2]])];
  out.tcpCmp = P.tcpCmp(P.tcpRank([[12, 0], [6, 1], [4, 2]]), [0, 12, 6, 4]) >= 0 && P.tcpCmp(P.tcpRank([[12, 0], [6, 1], [3, 2]]), [0, 12, 6, 4]) < 0;
  return out;
});
check('baccarat pays: Player 1:1, Banker 0.95:1 (rounded down: $10 wins $9), Tie 8:1 with Player/Banker returned on a tie', JSON.stringify(rules.bpay) === JSON.stringify([200, 195, 1000, 0, 19]), JSON.stringify(rules.bpay));
check('craps: 7 wins on the come-out, 2 loses, 12 is the Don’t Pass push; a point is made before a 7, or lost to it', rules.c7 === 'pass' && rules.c2 === 'dont' && rules.c12 === 'push12' && rules.cPoint.result === 'pass' && rules.cPoint.point === 4 && rules.cSeven.result === 'dont' && rules.cSeven.point === 9, JSON.stringify(rules));
check('craps pays: Pass 1:1, Don’t Pass returned on a come-out 12, Field 2:1 on 2/12, 1:1 on 9, nothing on 7', JSON.stringify(rules.cpay) === JSON.stringify([200, 100, 300, 200, 0]), JSON.stringify(rules.cpay));
check('three card poker hand ranks (straight flush, trips, A-2-3 straight, flush, pair, high card); you play from Q-6-4', JSON.stringify(rules.tcp) === JSON.stringify([5, 4, 3, 2, 1, 0]) && rules.tcpCmp, JSON.stringify(rules.tcp));

// ---------------------------------------------------------------- the house edges, measured
const sim = await ev(() => {
  const P = window.__pv, out = {}, N = 300000;
  const bacc = { player: 0, banker: 0, tie: 0, ties: 0 };
  for (let i = 0; i < N; i++) { const r = P.baccaratDeal().result; bacc.player += P.baccaratPay({ player: 100 }, r) / 100; bacc.banker += P.baccaratPay({ banker: 100 }, r) / 100; bacc.tie += P.baccaratPay({ tie: 100 }, r) / 100; if (r === 'tie') bacc.ties++; }
  out.bacc = { player: bacc.player / N, banker: bacc.banker / N, tie: bacc.tie / N, tieRate: bacc.ties / N };
  const cr = { pass: 0, dont: 0, field: 0 };
  for (let i = 0; i < N; i++) { const d = P.crapsDecision(); cr.pass += P.crapsPay({ pass: 1 }, d); cr.dont += P.crapsPay({ dont: 1 }, d); cr.field += P.crapsPay({ field: 1 }, d); }
  out.craps = { pass: cr.pass / N, dont: cr.dont / N, field: cr.field / N };
  let net = 0, staked = 0, pp = 0, plays = 0;
  for (let i = 0; i < N; i++) { const r = P.tcpRound(1, 0); net += r.back - r.staked; staked += r.staked; if (r.play) plays++; const q = P.tcpRound(0, 1); pp += q.back; }
  out.tcp = { antePerHand: net / N, rtp: (staked + net) / staked, playRate: plays / N, pairPlus: pp / N };
  // the sportsbook: picking every outcome of every match for 20,000 days returns 1 − the margin
  let ret = 0, bets = 0, same = true;
  for (let d = 1; d <= 20000; d++) { const M = P.sportsDay(d); for (const m of M) for (let k = 0; k < 3; k++) { bets++; if (m.result === k) ret += m.odds[k]; } }
  for (const d of [1, 77, 4000]) same = same && JSON.stringify(P.sportsDay(d)) === JSON.stringify(P.sportsDay(d));
  out.sports = { rtp: ret / bets, same, margin: P.SPORTS.margin };
  return out;
});
console.log('TABLES SIM', JSON.stringify(sim));
check('baccarat: Banker returns ~98.9%, Player ~98.8% (±0.8%), Tie ~85.6% (±3%); ties about 9.5% of hands', Math.abs(sim.bacc.banker - 0.9894) < 0.008 && Math.abs(sim.bacc.player - 0.9876) < 0.008 && Math.abs(sim.bacc.tie - 0.8564) < 0.03 && Math.abs(sim.bacc.tieRate - 0.0952) < 0.004, JSON.stringify(sim.bacc));
check('craps: Pass ~98.6%, Don’t Pass ~98.6% (±0.8%), Field ~94.4% (±1%)', Math.abs(sim.craps.pass - 0.9859) < 0.008 && Math.abs(sim.craps.dont - 0.9864) < 0.008 && Math.abs(sim.craps.field - 0.9444) < 0.01, JSON.stringify(sim.craps));
check('three card poker: ante-play loses ~3.4% of the ante a hand (1.5–5.5%), you play about two hands in three, Pair Plus (flush 4:1) ~97.7% (±2.5%)', sim.tcp.antePerHand < -0.015 && sim.tcp.antePerHand > -0.055 && sim.tcp.playRate > 0.6 && sim.tcp.playRate < 0.72 && Math.abs(sim.tcp.pairPlus - 0.9768) < 0.025, JSON.stringify(sim.tcp));
check('sportsbook: the book keeps its margin (every pick on 20,000 days returns ~94%), and a day’s card is the same every time it is read', Math.abs(sim.sports.rtp - (1 - sim.sports.margin)) < 0.01 && sim.sports.same, JSON.stringify(sim.sports));

// ---------------------------------------------------------------- at the tables: one settlement per bet, limits by room
const tab = await ev(() => {
  const g = window.game, G = g.gamble, s = g.save, out = {};
  g.money.W.clean = 1e6; s.rep = 0;
  const play = (spot, act, wagerKey, bet, extra) => {
    G.spot(spot); const title = document.getElementById('svcTitle').textContent;
    G.setWager(wagerKey, bet); if (extra) g.content._svcAct(extra);
    const m0 = g.money.clean, c0 = { ...s.gamble.casino }; g.content._svcAct(act);
    const last = (wagerKey === 'bacc' ? G.bacc : wagerKey === 'craps' ? G.craps : G.tcp).last;
    const stake = last.stake !== undefined ? last.stake : last.staked;
    const r = { title, delta: g.money.clean - m0, expect: last.back - stake, stake, rec: s.gamble.casino.won - c0.won === last.back || last.back === 0 };
    r.overflow = document.getElementById('svcBody').scrollWidth > document.getElementById('svcBody').clientWidth + 1;
    while (g.ui.stack.length) g.ui.back();
    return r;
  };
  out.bacc = play('g:bacc:3', 'deal', 'bacc', 2500, 'pick:banker');
  out.craps = play('g:craps:0', 'roll', 'craps', 1000, 'pick:field');
  out.tcp = play('g:tcp:3', 'deal', 'tcp', 500, 'pp');
  G.seat = 0; out.floorCap = G.setWager('bacc', 1e6);
  G.seat = 3; out.vipNobody = G.setWager('tcp', 1e6); s.rep = window.__pv.CASINO.vipRep; out.vipKnown = G.setWager('tcp', 1e6); s.rep = 0;
  // the play bet needs covering: an ante you can't double is refused
  g.money.W.clean = 900; G.spot('g:tcp:3'); G.setWager('tcp', 500); const m1 = g.money.clean; g.content._svcAct('deal'); out.tcpShort = g.money.clean === m1; while (g.ui.stack.length) g.ui.back();
  g.money.W.clean = 1e6;
  return out;
});
for (const k of ['bacc', 'craps', 'tcp']) check(`${k}: one deal settles once, stake out and any win in, on the casino record; fits a phone`, tab[k].delta === tab[k].expect && tab[k].rec && !tab[k].overflow && !!tab[k].title, JSON.stringify(tab[k]));
check('limits: $10,000 on the floor, $250,000 at a VIP table once known', tab.floorCap === 1e4 && tab.vipNobody === 1e4 && tab.vipKnown === 2.5e5, JSON.stringify(tab));
check('three card poker: no deal when you can’t cover the play bet', tab.tcpShort, JSON.stringify(tab.tcpShort));

// ---------------------------------------------------------------- the sportsbook: settle once at the end of the day, survives a reload
const sb = await ev(() => {
  const g = window.game, G = g.gamble, uw = g.uw, P = window.__pv, out = {};
  const day = uw.S.day, M = P.sportsDay(day), win = M[0], lose = M[1];
  G.spot('g:sports'); out.title = document.getElementById('svcTitle').textContent; out.rows = document.querySelectorAll('#svcBody [data-act^="sb:"]').length; while (g.ui.stack.length) g.ui.back();
  const m0 = g.money.clean;
  out.e1 = G.sportsBet(win.id, win.result, 1000); out.e2 = G.sportsBet(lose.id, (lose.result + 1) % 3, 2000);
  out.tooBig = G.sportsBet(win.id, 0, 50000); out.badMatch = G.sportsBet(999999, 0, 100);
  out.paidOut = m0 - g.money.clean; out.expectWin = Math.round(1000 * win.odds[win.result]);
  g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true);
  return out;
});
check('the sportsbook: today’s three matches with Home/Draw/Away odds', /Sportsbook/.test(sb.title) && sb.rows === 9, JSON.stringify(sb));
check('a bet’s stake leaves at once; over the limit and unknown matches are refused', sb.e1 === '' && sb.e2 === '' && sb.paidOut === 3000 && /Bets from/.test(sb.tooBig) && /No such match/.test(sb.badMatch), JSON.stringify(sb));
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
const sb2 = await ev(() => {
  const g = window.game, G = g.gamble, uw = g.uw, out = {};
  out.open = G.sbook().bets.filter(b => !b.settled).length;
  const m0 = g.money.clean;
  G.tickSports(); out.sameDay = g.money.clean - m0;            // nothing settles before the day is over
  uw.tickDay(); out.settled = g.money.clean - m0;
  uw.tickDay(); out.again = g.money.clean - m0;                 // never twice
  out.rec = G.sbook().bets.filter(b => b.settled).map(b => [b.win, b.paid]);
  return out;
});
check('open bets survive a reload; nothing settles before the day ends', sb2.open === 2 && sb2.sameDay === 0, JSON.stringify(sb2));
check('the day ends: the winner is paid stake × odds once, the loser nothing; a later day pays nothing more', sb2.settled === sb.expectWin && sb2.again === sb.expectWin && JSON.stringify(sb2.rec) === JSON.stringify([[true, sb.expectWin], [false, 0]]), JSON.stringify([sb2, sb.expectWin]));

// ---------------------------------------------------------------- on the floor
const floor = await ev(async () => {
  const g = window.game, d = g.world.places.casino.door;
  g.resetPlayerState(d.x, d.z + 1, Math.PI);
  const a = g.content.findAction(); a && a.act();
  await new Promise(r => setTimeout(r, 1400));
  const D = g.content.interiors.cur;
  const want = ['g:bacc', 'g:craps', 'g:tcp', 'g:sports'];
  const found = want.map(k => { const s = D && D.spots.find(x => x.id.startsWith(k)); if (!s) return [k, false]; g.player.pos.set(D.ox + s.x, D.fy, D.oz + s.z); const f = g.content.findAction(); return [k, !!f, f && f.label]; });
  return { cur: D && D.id, found };
});
check('the casino floor has baccarat, craps, three card poker and the sportsbook, each one you can walk up to', floor.cur === 'casino' && floor.found.every(f => f[1]), JSON.stringify(floor));

check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
await finish(b, 'tables');
