/* Rank, Reputation and core progression (overhaul Session 2, handoff §1, §4, §18, §31, §45.7, §45.12, §45.13).
   - Seven player-facing Rank titles, one authority (Underworld.rankOf over RANKS); Reputation is a number, the old
     named ladder is gone.
   - Nobody → City Kingpin is reachable from a fresh career with no circular requirement, one Rank at a time, through
     play (Rep, crew, a showdown per turf, Lieutenants, influence); a Rank's needs never wait on a higher Rank.
   - Money buys none of it: buying every property for sale changes no Rep, influence, turf or Rank; a business adds
     influence only once it is established.
   - Turf ownership is saved state. Influence never flips it, for the player or rivals; only a showdown does (Take
     Turf, a rival war), a ceded turf is an offer the player takes up, a betrayal starts wars instead of flipping.
   - Personal upgrades are Stamina and Health only; a save that bought the removed ones is refunded to Clean Bank. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
await ev(() => { const g = window.game; g.events.cool = 1e9; g.debug.god = true; });

// ---------------------------------------------------------------- 1. the titles
const titles = await ev(() => { const P = window.__pv, g = window.game; return { names: P.RANKS.map(r => r.name), keys: [...new Set(P.RANKS.flatMap(r => Object.keys(r.need)))], ladder: 'repLevel' in g.content || 'repName' in g.content, hud: !!document.getElementById('rep'), cfg: Object.keys(window.__pv.GAME_CONFIG.economy).includes('reputation') }; });
check('exactly the seven Rank titles, in order', JSON.stringify(titles.names) === JSON.stringify(['Nobody', 'Street Hustler', 'Known Operator', 'Crew Leader', 'Territory Holder', 'Underworld Power', 'City Kingpin']), JSON.stringify(titles.names));
check('the old Reputation title ladder is gone (no repLevel/repName, no ladder HUD, no config entry)', !titles.ladder && !titles.hud && !titles.cfg, JSON.stringify(titles));
check('Rank reads only power money cannot buy: Rep, crew, Lieutenants, turf, influence, an operating warehouse', titles.keys.every(k => ['rep', 'crew', 'lts', 'turfs', 'infl', 'wh'].includes(k)), JSON.stringify(titles.keys));

// ---------------------------------------------------------------- 2. money buys no power
const rich = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, P = window.__pv;
  g.money.W.clean = 5e7; g.money.W.dirty.me = 5e7; g.police.clear && g.police.clear();
  uw.computeInfluence();
  const snap = () => ({ rep: g.save.rep, infl: uw.influence, rank: uw.rank, turfs: uw.playerTurfs(), own: S.turfs.map(t => t.own).join(','), pc: S.turfs.reduce((a, t) => a + (t.inf.pc || 0), 0) });
  const a = snap(), bought = [], refused = [];
  for (const d of P.PROPS) { const r = uw.props.buy(d.id); (r ? refused : bought).push(d.id + (r ? ': ' + r : '')); }
  for (const id of bought) if (uw.props.upgradeCost(id)) { uw.props.upgrade(id); uw.props.upgrade(id); }
  uw.computeInfluence();
  return { a, z: snap(), bought: bought.length, businesses: bought.filter(id => P.PROPS.find(d => d.id === id).kind === 'business').length, refused: refused.slice(0, 4) };
});
check('a rich Nobody can buy what is for sale (many properties, businesses included)', rich.bought >= 10 && rich.businesses >= 3, JSON.stringify(rich));
check('buying and upgrading every property buys no Rep, influence, turf hold or Rank', rich.z.rep === rich.a.rep && rich.z.infl === rich.a.infl && rich.z.rank === 0 && rich.z.turfs === 0 && rich.z.own === rich.a.own && rich.z.pc === rich.a.pc, JSON.stringify({ before: { ...rich.a, own: undefined }, after: { ...rich.z, own: undefined } }));
const est = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, d0 = S.day, out = {};
  for (const n of [0, 7, 14, 21, 40]) { S.day = d0 + n; uw.computeInfluence(); out['d' + n] = uw.influence; }
  S.day = d0; uw.computeInfluence();
  return out;
});
check('a business adds influence only once established: nothing for a week, then gradually, then fully', est.d0 === 0 && est.d7 === 0 && est.d14 > 0 && est.d21 > est.d14 && est.d40 >= est.d21 && est.d40 > 0, JSON.stringify(est));

// ---------------------------------------------------------------- 3. Nobody → City Kingpin, in order
const chain = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, steps = [];
  // the businesses bought above have been running for 40 days: established, so they count (§45.7)
  for (const id in S.props) if (S.props[id].owned) S.props[id].since = S.day - 40;
  const rank = () => { uw.computeInfluence(); return uw.rank; };
  const note = what => steps.push({ what, rank: rank(), infl: uw.influence, missing: uw.rankMissing() });
  note('fresh');
  // Rep from the street (the numbers earned crimes add)
  g.content.addRep(100); note('100 Rep');
  g.content.addRep(300); note('400 Rep');
  // crew: recruiting opens at 100 Rep (Street Hustler), paid in Dirty Cash
  uw.crew.refreshCandidates(true); const h1 = uw.crew.hire(0); uw.crew.refreshCandidates(true); const h2 = uw.crew.hire(0); uw.crew.refreshCandidates(true); const h3 = uw.crew.hire(0);
  note('three crew hired: ' + [h1, h2, h3].map(x => x || 'ok').join('/'));
  // one turf at a time: weaken the owner's hold, Take Turf, win the showdown
  const takeOne = i => {
    const T = S.turfs[i], own = T.own;
    if (own) uw.addInf(i, own, -100); uw.addInf(i, 'pc', 75);
    const why = uw.takeTurf(i); if (why) return why;
    for (let h = 0; h < 48 && T.war; h++) uw.factions.warStep(i, 1);
    return T.own === 'pc' ? '' : 'lost the showdown';
  };
  const order = uw.T.map(t => t.i).filter(i => S.turfs[i].own !== 'pc');
  const fails = [];
  let k = 0;
  const takeN = n => { while (uw.playerTurfs() < n && k < order.length) { const r = takeOne(order[k++]); if (r) fails.push(r); } };
  takeN(1); note('one turf');
  // Lieutenants: promotion is time and Dirty Cash (no Rank gate), then the role runs a district
  const crew = uw.crew.active();
  const lt = c => { c.days = 99; let r = ''; for (let n = 0; n < 3 && !r; n++) r = uw.crew.promote(c.id); const z = uw.T[order[0]].zone; return r || uw.crew.assign(c.id, 'lieutenant', z) || ''; };
  const lt1 = lt(crew[0]);
  // bosses put down (Rep and infamy earned on the street)
  for (const fid of Object.keys(S.factions)) uw.factions.bossDown(fid, true);
  takeN(8); note('eight turfs, one Lieutenant: ' + (lt1 || 'ok'));
  const lt2 = lt(crew[1]);
  // City Kingpin's infrastructure (Session 3): a warehouse run by a Lieutenant, with a Driver
  if (!uw.props.owned('whse_w')) { g.money.W.clean += 40000; uw.props.buy('whse_w'); }
  const whLt = uw.crew.assign(crew[1].id, 'lieutenant', 'w:whse_w'), whDrv = uw.crew.assign(crew[2].id, 'driver', 'w:whse_w');
  takeN(16); note('sixteen turfs, two Lieutenants, an operating warehouse: ' + [lt2, whLt, whDrv].map(x => x || 'ok').join('/'));
  return { steps, fails: fails.slice(0, 5), lts: uw.crew.active().filter(c => c.role === 'lieutenant').length, kingpin: uw.kingpin(), rankMax: S.rankMax };
});
const ranks = chain.steps.map(s => s.rank);
check('the chain climbs one Rank at a time, never skipping or falling back', JSON.stringify(ranks) === JSON.stringify([0, 1, 2, 3, 4, 5, 6]), JSON.stringify(chain.steps.map(s => [s.what, s.rank, s.infl, s.missing.join('; ')])));
check('City Kingpin is reached through play alone (showdowns all won, Lieutenants promoted)', chain.kingpin && chain.rankMax === 6 && chain.lts >= 2 && !chain.fails.length, JSON.stringify({ fails: chain.fails, lts: chain.lts, rankMax: chain.rankMax }));
check('each step names exactly what the next Rank still needs', chain.steps.slice(0, -1).every(s => s.missing.length >= 1) && chain.steps[6].missing.length === 0, JSON.stringify(chain.steps.map(s => s.missing)));
const gates = await ev(() => {
  const P = window.__pv, need = P.RANKS.map(r => r.need), keys = ['rep', 'crew', 'lts', 'turfs', 'infl', 'wh'];
  // each Rank needs at least what the one below it needs (so the order is a chain, not a loop)
  const mono = need.every((n, i) => i === 0 || keys.every(k => (n[k] || 0) >= (need[i - 1][k] || 0)));
  // what each input is gated by, if anything: hiring needs 100 Rep, Lieutenant needs crew rank 3 (time + Dirty Cash)
  return { mono, hireRep: 100, hireRank: need.findIndex(n => (n.rep || 0) >= 100), crewNeed: need.findIndex(n => n.crew), ltRole: P.GAME_CONFIG.underworld.crewRoles.lieutenant.minRank };
});
check('no circular requirement: every Rank needs at least the one below, and each input opens below the Rank that needs it', gates.mono && gates.hireRank < gates.crewNeed && gates.ltRole === 3, JSON.stringify(gates));

// ---------------------------------------------------------------- 4. ownership is saved state
const auth = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, out = {};
  // a rival turf the player dominates by influence: still theirs until a showdown
  const i = uw.T.findIndex((t, n) => S.turfs[n].own && S.turfs[n].own !== 'pc' && !S.turfs[n].war);
  const T = S.turfs[i], own = T.own;
  T.inf = { [own]: 5, pc: 95 }; for (let h = 0; h < 6; h++) uw.tickHours(1, h);
  out.pcDominant = S.turfs[i].own;
  // a rival dominating another rival's turf: no change either
  const j = uw.T.findIndex((t, n) => n !== i && S.turfs[n].own && S.turfs[n].own !== 'pc' && !S.turfs[n].war);
  const own2 = S.turfs[j].own, other = Object.keys(S.factions).find(f => f !== own2 && !S.factions[f].broken);
  S.turfs[j].inf = { [own2]: 5, [other]: 95 }; uw.recompute();
  out.rivalDominant = S.turfs[j].own === own2;
  out.contested = uw.contested[j];
  // a rival war the attacker wins hands the turf over; one it loses does not
  S.turfs[j].war = { a: other, d: own2, hrs: 10 }; S.turfs[j].inf = { [own2]: 5, [other]: 60 };
  for (let h = 0; h < 30 && S.turfs[j].war; h++) uw.factions.warStep(j, 1);
  out.warWon = S.turfs[j].own === other;
  return { ...out, i, own, ownNow: S.turfs[i].own };
});
check('influence alone never flips the player’s way: a 95-to-5 hold still belongs to the rival', auth.pcDominant === auth.own && auth.own !== 'pc', JSON.stringify(auth));
check('influence alone never flips between rivals either; it only marks the turf contested', auth.rivalDominant && auth.contested, JSON.stringify(auth));
check('a rival that wins its showdown takes the turf', auth.warWon, JSON.stringify(auth));
const cede = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S;
  // the faction must border one of the player's turfs; find one
  let fid = null, i = -1;
  for (let n = 0; n < uw.T.length && i < 0; n++) { const o = S.turfs[n].own; if (o && o !== 'pc' && !S.turfs[n].war && !S.turfs[n].offer && uw.turfNeighbors(n).some(m => S.turfs[m].own === 'pc')) { fid = o; i = n; } }
  if (i < 0) return { none: true };
  for (let n = 0; n < uw.T.length; n++) if (n !== i && S.turfs[n].own === fid) S.turfs[n].offer = { fid, until: S.day + 3 }; // only i is free to offer
  uw.factions.cedeTurf(fid);
  const offered = !!S.turfs[i].offer, after = S.turfs[i].own, check1 = uw.takeCheck(i);
  const r = uw.takeTurf(i);
  return { offered, after, fid, ok: check1.ok && check1.offered, r, now: S.turfs[i].own, war: !!S.turfs[i].war };
});
check('a ceded turf is only an offer: nothing changes hands until you Take Turf, then it is yours without a fight', !cede.none && cede.offered && cede.after === cede.fid && cede.ok && cede.r === '' && cede.now === 'pc' && !cede.war, JSON.stringify(cede));
const takeRules = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S;
  const i = uw.T.findIndex((t, n) => S.turfs[n].own && S.turfs[n].own !== 'pc' && !S.turfs[n].war && !S.turfs[n].offer);
  const T = S.turfs[i], own = T.own;
  T.inf = { [own]: 50, pc: 30 }; const weak = uw.takeCheck(i);
  S.factions[own].truce = S.day + 5; T.inf = { [own]: 5, pc: 90 }; const truce = uw.takeCheck(i); S.factions[own].truce = 0;
  const ok = uw.takeCheck(i);
  // the card shows it (Empire → Turf map)
  uw.ui.selTurf = i; uw.ui.open('map'); const html = document.getElementById('empBody').innerHTML; while (g.ui.stack.length) g.ui.back();
  return { weak, truce, ok, button: /data-act="take:/.test(html) && /TAKE TURF/.test(html) };
});
check('Take Turf needs a weakened hold (and says how much), respects a truce, and is on the turf card', !takeRules.weak.ok && /influence/.test(takeRules.weak.why) && !takeRules.truce.ok && /truce/.test(takeRules.truce.why) && takeRules.ok.ok && takeRules.button, JSON.stringify(takeRules));
const coup = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, CM = uw.crew;
  const c = CM.active().find(x => x.role === 'lieutenant');
  const z = c.assign, mine = uw.T.filter(t => t.zone === z && S.turfs[t.i].own === 'pc').map(t => t.i);
  for (const i of mine) S.turfs[i].war = null;
  for (const f of Object.keys(S.factions)) S.factions[f].truce = 0;
  // loyalty 28: low enough for a coup (< 30), too high for desertion, leaks or defection; the first roll skips skimming
  c.loyalty = 28; c.fear = 10; c.power = 90; c.offer = null; c.traits = [];
  const r0 = Math.random; let n = 0; Math.random = () => (n++ === 0 ? 0.9 : 0.01);
  try { CM.disloyalty(c, null); } finally { Math.random = r0; }
  return { n: mine.length, gone: c.status, stillMine: mine.filter(i => S.turfs[i].own === 'pc').length, wars: mine.filter(i => S.turfs[i].war).length };
});
check('a betrayal starts showdowns for the traitor’s turfs instead of flipping them', coup.n > 0 && coup.gone === 'gone' && coup.stillMine === coup.n && coup.wars === coup.n, JSON.stringify(coup));

// ---------------------------------------------------------------- 5. money and crew loyalty (§45.23, DC-26)
const morale = await ev(() => {
  const g = window.game, uw = g.uw, CM = uw.crew, M = g.money, P = window.__pv.GAME_CONFIG.underworld;
  M.W.dirty.me = 1e7;
  const c = CM.active().find(x => x.role !== 'lieutenant'); c.loyalty = 40; c.morale = 0; c.boosts = 0; c.raiseLoyal = 0; c.traits = []; c.rank = Math.min(c.rank, 2);
  const gains = []; for (let n = 0; n < 30; n++) { const m0 = c.morale; CM.bonus(c.id); gains.push(+(c.morale - m0).toFixed(2)); }
  const afterSpam = { loyalty: c.loyalty, morale: c.morale };
  // betrayal still reads loyalty: a low-loyalty lieutenant with full morale can still stage a coup
  const lt = CM.active().find(x => x !== c && x.role === 'lieutenant') || CM.active().find(x => x !== c); const ltWas = { role: lt.role, rank: lt.rank };
  lt.loyalty = 18; lt.fear = 10; lt.power = 90; lt.rank = 3; lt.traits = []; lt.offer = null; lt.morale = 0; lt.boosts = 0;
  for (let n = 0; n < 30; n++) CM.bonus(lt.id);
  const ltMorale = lt.morale;
  const r0 = Math.random; let k = 0; Math.random = () => (k++ === 0 ? 0.9 : 0.01);
  try { CM.disloyalty(lt, null); } finally { Math.random = r0; }
  const betrayed = lt.status === 'gone';
  // raises: a little lasting loyalty, capped over a career
  const raises = [];
  for (let n = 0; n < 3; n++) { const l0 = c.loyalty; uw.S.decisions.push({ id: 9000 + n, kind: 'raise', crew: c.id, text: 'raise', day: uw.S.day }); CM.decide(9000 + n, true); raises.push(+(c.loyalty - l0).toFixed(2)); }
  // morale wears off; wages paid on time keep loyalty from falling
  const l1 = c.loyalty, r1 = Math.random; Math.random = () => 0.99;
  try { for (let d = 0; d < 8; d++) CM.tickDay(); } finally { Math.random = r1; }
  const faded = c.morale, lAfter = c.loyalty;
  // the diner-type businesses put a floor under morale, never loyalty
  c.morale = 0; const l2 = c.loyalty; uw.props.tickDay(); const floor = Math.min(10, uw.props.perk('loyalty') * 10);
  return { gains: gains.slice(0, 6), last: gains[29], afterSpam, ltMorale, betrayed, ltWas, raises, faded, l1, lAfter, floorMorale: c.morale, floor, l2, l3: c.loyalty, cap: 10 };
});
check('bonuses lift morale, each recent one less, never past the cap, and never touch loyalty', morale.gains[0] === 8 && morale.gains.every((x, i, a) => i === 0 || x <= a[i - 1]) && morale.afterSpam.morale <= morale.cap && morale.afterSpam.loyalty === 40, JSON.stringify(morale));
check('no amount of bonuses makes a crew member betrayal-proof: a disloyal Lieutenant with full morale still turns', morale.ltMorale <= morale.cap && morale.betrayed, JSON.stringify(morale));
check('a raise adds a little lasting loyalty, capped over a career (5, 5, then nothing)', JSON.stringify(morale.raises) === JSON.stringify([5, 5, 0]), JSON.stringify(morale.raises));
check('morale wears off within days, and paid wages keep loyalty from falling', morale.faded === 0 && morale.lAfter >= morale.l1, JSON.stringify(morale));
check('food-and-coffee businesses keep a floor under morale (capped), not under loyalty', morale.floor > 0 && morale.floorMorale >= morale.floor && morale.floorMorale <= morale.cap && morale.l3 === morale.l2, JSON.stringify(morale));

// ---------------------------------------------------------------- 6. property presence is capped (§45.23, DC-27)
const pres = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, P = window.__pv.PROPS, PM = uw.props;
  // the turf with the most properties for sale
  const by = {}; for (const d of P) { const L = uw.loc('prop', d.id); if (L) (by[window.__pv.turfAt(L.x, L.z)] || (by[window.__pv.turfAt(L.x, L.z)] = [])).push(d.id); }
  const [ti, ids] = Object.entries(by).sort((a, b) => b[1].length - a[1].length)[0]; const i = +ti;
  const keep = ids.map(id => S.props[id] && S.props[id].owned);
  for (const id of ids) if (S.props[id]) S.props[id].owned = false;
  const seq = [PM.presenceDefense(i)];
  for (const id of ids) { (S.props[id] || (S.props[id] = { dmg: 0, since: S.day, lvl: 1 })).owned = true; seq.push(+PM.presenceDefense(i).toFixed(2)); }
  // decay of your hold: none with crew on the turf, half with only property, full with neither
  const crewThere = S.crew.filter(c => c.status === 'active' && c.assign === i);
  for (const c of crewThere) c.assign = null;
  const T = S.turfs[i]; T.war = null;
  const step = () => { T.inf.pc = 50; uw.factions.tickHours(1, 3); return +(50 - (T.inf.pc || 0)).toFixed(3); };
  const propOnly = step();
  for (const id of ids) S.props[id].owned = false; const none = step();
  ids.forEach((id, n) => { S.props[id].owned = keep[n]; });
  return { n: ids.length, seq, propOnly, none };
});
check('several properties on one turf add less and less to a showdown, never more than 12', pres.n >= 2 && pres.seq[0] === 0 && pres.seq[1] === 6 && pres.seq[2] === 9 && pres.seq.every((x, i, a) => i === 0 || x >= a[i - 1]) && Math.max(...pres.seq) <= 12, JSON.stringify(pres));
check('property only slows your hold fading (half); it does not replace people on the ground', pres.propOnly > 0 && Math.abs(pres.propOnly - pres.none / 2) < 0.01, JSON.stringify(pres));

// ---------------------------------------------------------------- 7. downranking is non-destructive (§45.23, DC-28)
const down = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, CM = uw.crew;
  // a full empire to fall from: two Lieutenants running districts, and the turfs held now
  for (const n of [1, 2]) S.crew.push(CM.sanitizeMember({ id: 700 + n, name: 'Down Lieutenant' + n, role: 'lieutenant', rank: 3, skill: 50, loyalty: 90, pay: 300, traits: [], status: 'active', assign: uw.T[0].zone }));
  uw.computeInfluence();
  const before = { rank: uw.rank, peak: S.rankMax, props: uw.props.ownedList().length, garage: g.save.garage.length, crew: CM.active().map(c => c.id + ':' + c.role + ':' + c.assign).join(','), up: JSON.stringify(g.save.upgrades), cops: Object.keys(S.cops).filter(k => S.cops[k].st === 'paid').join(',') };
  // every turf lost in showdowns
  for (let i = 0; i < uw.T.length; i++) if (S.turfs[i].own === 'pc') uw.transferTurf(i, 'vipers', 'test');
  uw.computeInfluence();
  const after = { rank: uw.rank, peak: S.rankMax, props: uw.props.ownedList().length, garage: g.save.garage.length, crew: CM.active().map(c => c.id + ':' + c.role + ':' + c.assign).join(','), up: JSON.stringify(g.save.upgrades), cops: Object.keys(S.cops).filter(k => S.cops[k].st === 'paid').join(',') };
  // a day passes: crew loyalty doesn't sour for the lost Rank, paid officers stay paid, automation keeps running
  g.money.W.dirty.me = 1e7;
  const c = CM.active().find(x => x.rank < 3) || CM.active()[0]; c.traits = []; c.unpaid = 0; c.wins = 0; c.offer = null; c.loyalty = 50; c.fear = 0;
  const r0 = Math.random; Math.random = () => 0.99;
  try { CM.tickDay(); uw.cops.tickDay(); } finally { Math.random = r0; }
  const dl = +(c.loyalty - 50).toFixed(2);
  // new expansion waits for the Rank: a luxury home is refused
  const lux = window.__pv.PROPS.find(d => d.luxury && !uw.props.owned(d.id));
  const luxR = lux ? uw.props.buy(lux.id) : 'none for sale';
  return { before, after, dl, expect: +(0.4 + S.rankMax * 0.3).toFixed(2), cops: Object.keys(S.cops).filter(k => S.cops[k].st === 'paid').join(','), luxR };
});
check('losing every turf lowers the Rank; the peak is remembered', down.before.rank >= 5 && down.after.rank < down.before.rank && down.after.rank <= 3 && down.after.peak === down.before.peak, JSON.stringify({ before: down.before.rank, after: down.after.rank, peak: down.after.peak }));
check('a downrank dismantles nothing: properties, cars, upgrades, crew roles and assignments, paid officers all remain', ['props', 'garage', 'crew', 'up', 'cops'].every(k => down.after[k] === down.before[k]) && down.cops === down.before.cops, JSON.stringify(down));
check('no downward spiral: crew loyalty still grows at the peak Rank’s rate', down.dl === down.expect, JSON.stringify({ dl: down.dl, expect: down.expect }));
check('new expansion waits for the Rank (a luxury home is refused at the lower Rank)', /Territory Holder|Come back/.test(down.luxR) || down.luxR === 'none for sale', down.luxR);

// ---------------------------------------------------------------- 8. save, reload, migration
const pre = await ev(() => { const g = window.game; g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.uw.computeInfluence(); g.saveGame(true); return { own: g.uw.S.turfs.map(t => t.own), rank: g.uw.rank, rankMax: g.uw.S.rankMax }; });
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
const menuLine = await ev(() => document.getElementById('continueSub').textContent);
check('the main menu’s continue line names the saved career’s Rank peak', menuLine.includes(['Nobody', 'Street Hustler', 'Known Operator', 'Crew Leader', 'Territory Holder', 'Underworld Power', 'City Kingpin'][pre.rankMax]), menuLine);
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
const post = await ev(() => { const g = window.game; g.uw.computeInfluence(); return { own: g.uw.S.turfs.map(t => t.own), rank: g.uw.rank, rankMax: g.uw.S.rankMax, v: g.save.version }; });
check('save → reload: every turf owner, the Rank and its peak are identical', JSON.stringify(pre) === JSON.stringify({ own: post.own, rank: post.rank, rankMax: post.rankMax }) && post.v === 9, JSON.stringify({ pre: { ...pre, own: pre.own.join('') }, post: { ...post, own: post.own.join('') } }));
// an older save (schema 8): owners derived once from influence, stageMax carried into rankMax, removed upgrades refunded
const oldSave = await ev(() => {
  const raw = JSON.parse(localStorage.getItem('pvunderworld.save.v1'));
  raw.version = 8; raw.upgrades = { stamina: 1, health: 2, handling: 2, cooldown: 1, armor: 3, engine: 1, brakes: 0, durability: 0 };
  raw.wallet.clean = 1000;
  raw.uw.stageMax = 6; delete raw.uw.rankMax; // above the Rank the save holds now, so the peak must come from it
  const F = raw.uw.factions;
  const expect = raw.uw.turfs.map(t => { delete t.own; delete t.offer; let a = null, av = 0, bb = 0; for (const k in t.inf) { if (k !== 'pc' && F[k] && F[k].broken) continue; const v = t.inf[k]; if (v > av) { bb = av; av = v; a = k; } else if (v > bb) bb = v; } return av >= 40 && av - bb >= 8 ? a : av >= 25 && bb >= 25 ? a : av >= 32 ? a : null; });
  for (const t of raw.uw.turfs) t.war = null;
  localStorage.setItem('pvunderworld.save.v1', JSON.stringify(raw));
  window.game.wiped = true;
  return { expect };
});
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
const mig = await ev(() => { const g = window.game; return { own: g.uw.S.turfs.map(t => t.own), rankMax: g.uw.S.rankMax, stageMax: 'stageMax' in g.uw.S, up: g.save.upgrades, clean: g.money.clean, v: g.save.version, shop: window.__pv.GAME_CONFIG.economy.upgrades.map(u => u.id) }; });
check('schema 8 → 9: turf owners are derived once from the saved influence', JSON.stringify(mig.own) === JSON.stringify(oldSave.expect) && mig.v === 9, JSON.stringify({ got: mig.own.join(','), want: oldSave.expect.join(',') }));
check('schema 8 → 9: the stage peak becomes the Rank peak', mig.rankMax === 6 && !mig.stageMax, JSON.stringify(mig));
check('Handling, Low Profile and Body Armor are gone; what was paid for them is refunded to Clean Bank', JSON.stringify(Object.keys(mig.up).sort()) === JSON.stringify(['health', 'stamina']) && mig.up.health === 2 && mig.up.stamina === 1 && JSON.stringify(mig.shop) === JSON.stringify(['stamina', 'health']) && mig.clean === 1000 + 1200 + 2600 + 1500 + 2000 + 4000 + 8000, JSON.stringify(mig));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'progression');
