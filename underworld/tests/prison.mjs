/* Prison (v6 design): sentences halved; the sentence clock (two seconds a day at 1×) and a full street day
   for every day served; 1× by default, 2× and 3× unlocked by good-behaviour points from physical chores
   (trays, litter, laundry) and lost again by misbehaviour; no phone and no map by default; a phone only by
   a guard bribe (yes / no / caught); the walk-out bribe (out / refused / backfire with half the offer kept);
   lawyers, paperwork, work, cards, inmates, the escape; save and reload in jail; release; v4 and v5 migrations. */
import { launch, open, check, startNew, finish, throughCourt } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const waitFade = () => page.waitForFunction(() => !window.game.fading, null, { timeout: 30000, polling: 100 });
const step = (sec) => ev(s => { const g = window.game; for (let n = 0; n < s * 60; n++) g.update(1 / 60, 1 / 60); }, sec);

check('the sentence speeds are 1×, 3×, 5× and 7× (§24), and the jail panel offers exactly those', await ev(() => window.__pv.GAME_CONFIG.underworld.jailSpeeds.map(s => s.x).join() === '1,3,5,7' && [...document.querySelectorAll('#jailHud [data-spd]')].map(b => b.dataset.spd).join() === '1,3,5,7'));
const half = await ev(() => { const g = window.game, P = g.uw.prison, L = g.uw.legal; L.add('robbery', 'police'); L.add('robbery', 'police'); L.add('shoot', 'police'); g.police.setLevel(3); const c = P.charges(); const raw = c.counts.reduce((a, x) => a + x.days, 0); L.L.items = []; g.uw.S.rap.maxLvl = 0; g.police.clear(); return { raw, mul: c.mul, total: c.total }; });
check('the final sentence is half of what the counts add up to (×record)', half.raw > 0 && half.total === Math.max(3, Math.round(Math.min(half.raw * half.mul, 1095) * 0.5)), JSON.stringify(half));
const fmt = await ev(() => { const f = window.__pv.fmtSentence; return [f(1), f(45), f(365), f(439), f(800)]; });
check('sentences read as days or years + days', fmt.join('|') === '1 day|45 days|1 year|1 year 74 days|2 years 70 days', fmt.join('|'));

// an early-game arrest: one star, a pickpocketing
await ev(() => { const g = window.game; g.events.cool = 1e9; (g.money.W.clean = g.money.W.dirty.me = 50000); g.uw.S.rap.cur = { pickpocket: 1 }; g.police.setLevel(1); g.uw.S.rap.maxLvl = Math.max(g.uw.S.rap.maxLvl || 0, 3); g.uw.legal.add('assault', 'police'); g.onBusted(); });
await throughCourt(page);
await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });
const s0 = await ev(() => { const g = window.game, j = g.uw.S.jail; return { total: j.total, day: g.uw.S.day, hud: document.getElementById('jailDays').textContent + ' / ' + document.getElementById('jailLeft').textContent }; });
check('an early mistake gets a short sentence (a pickpocketing at one star: under two weeks)', s0.total >= 3 && s0.total <= 12, JSON.stringify(s0));
const noPhone = await ev(() => { const g = window.game; g.uw.ui.open('overview'); const locked = g.uw.ui.locked('overview') && g.uw.ui.locked('crew') && g.uw.ui.locked('market'); const body = document.getElementById('empBody').innerHTML; while (g.ui.stack.length) g.ui.back(); g.ui.toggleMap(true); const map = !document.getElementById('bigmap').classList.contains('hidden'); g.ui.toggleMap(false); return { locked, cant: /can’t reach anyone/.test(body), map, phone: g.uw.prison.phone(), btn: document.getElementById('jailEmpire').classList.contains('hidden') }; });
check('no phone, no map and no empire browsing by default in jail', noPhone.locked && noPhone.cant && !noPhone.map && !noPhone.phone && noPhone.btn, JSON.stringify(noPhone));
check('the jail panel shows remaining, sentence and served in words', /left/.test(s0.hud) && /Sentence/.test(s0.hud) && /served/.test(s0.hud), s0.hud);
await ev(() => { const j = window.game.uw.S.jail; j.total = 400; });
await step(20);
const s1 = await ev(() => { const g = window.game, j = g.uw.S.jail; return { served: j.served, day: g.uw.S.day, cal: g.uw.calDay }; });
check('the sentence clock runs at about a day per two seconds (20 s → ~10 days)', s1.served >= 9 && s1.served <= 11, JSON.stringify(s1));
await step(30);
const s2 = await ev(() => { const g = window.game, j = g.uw.S.jail; return { served: j.served, day: g.uw.S.day }; });
check('every day served is a full street day (the economy runs day for day)', s2.day - s0.day === s2.served && s2.served >= 24, JSON.stringify({ s0, s2 }));
check('the street time of day stands still inside', await ev(() => { const t = window.game.env.time; for (let n = 0; n < 120; n++) window.game.update(1 / 60, 1 / 60); return Math.abs(window.game.env.time - t) < 0.01; }));
const menuStop = await ev(() => { const g = window.game, j = g.uw.S.jail, a = j.served; g.uw.prison.openLife(); for (let n = 0; n < 600; n++) g.update(0, 1 / 60); const b2 = j.served; while (g.ui.stack.length) g.ui.back(); return { a, b2 }; });
check('time does not pass while a prison menu is open', menuStop.a === menuStop.b2, JSON.stringify(menuStop));

// lawyers: success, failure, once per firm, a month between hearings
const law = await ev(() => {
  const g = window.game, P = g.uw.prison, j = g.uw.S.jail, R = Math.random, out = {};
  P.openLawyer();
  j.lastLawyer = -99; let m0 = g.money.total(), t0 = j.total; Math.random = () => 0.01; g.content._svcAct('hire:pd'); Math.random = R;
  out.ok = { paid: m0 - g.money.total(), cut: t0 - j.total };
  j.lastLawyer = -99; m0 = g.money.total(); t0 = j.total; Math.random = () => 0.99; g.content._svcAct('hire:firm'); Math.random = R;
  out.fail = { paid: m0 - g.money.total(), cut: t0 - j.total };
  m0 = g.money.total(); g.content._svcAct('hire:silk'); out.waiting = { paid: m0 - g.money.total() };
  j.lastLawyer = -99; m0 = g.money.total(); g.content._svcAct('hire:pd'); out.again = { paid: m0 - g.money.total() };
  while (g.ui.stack.length) g.ui.back();
  return out;
});
check('lawyer: a win cuts the sentence and is paid for', law.ok.paid === 300 && law.ok.cut > 0, JSON.stringify(law));
check('lawyer: a loss is still paid for and cuts nothing', law.fail.paid > 0 && law.fail.cut === 0, JSON.stringify(law));
check('lawyer: one hearing a month, each firm once per sentence', law.waiting.paid === 0 && law.again.paid === 0, JSON.stringify(law));

// bribes: success, refusal, backfire
const bribe = await ev(() => {
  const g = window.game, P = g.uw.prison, j = g.uw.S.jail, R = Math.random, out = {};
  // the arrest took the cash you carried. Outside Dirty Cash reaches a guard only through a courier from your crew;
  // the $500 favour comes from the commissary (§45.22)
  g.money.W.dirty.me = Math.max(g.money.W.dirty.me, 50000); j.commissary = 1000;
  const go = (r, act) => { j.lastBribe = -99; P.openGuard(); const m0 = g.money.total(), c0 = j.commissary, t0 = j.total, s0 = j.susp; Math.random = () => r; g.content._svcAct(act); Math.random = R; while (g.ui.stack.length) g.ui.back(); return { paid: m0 - g.money.total(), fromCommissary: c0 - j.commissary, days: j.total - t0, susp: j.susp - s0, lock: P.locked() }; };
  g.uw.S.crew = g.uw.S.crew.filter(c => c.status !== 'active');
  j.susp = 0; out.noCourier = go(0.01, 'paper');
  const c = g.uw.crew.genCandidate(); c.id = g.uw.S.nextCrew++; g.uw.S.crew.push(c); out.courier = c.name;
  j.susp = 0; out.ok = go(0.01, 'paper');
  j.susp = 0; out.refuse = go(P.bribeOdds('perk').ok + 0.01, 'perk');
  j.susp = 0; out.back = go(0.999, 'perk');
  j.lockUntil = 0;
  return out;
});
check('bribe: with no crew on the street, outside money cannot reach the guard', bribe.noCourier.paid === 0 && bribe.noCourier.days === 0, JSON.stringify(bribe.noCourier));
check('bribe: lost paperwork, paid with outside money a crew member brings in, takes time off what is left', bribe.ok.paid > 0 && bribe.ok.days < 0 && !!bribe.courier, JSON.stringify(bribe));
check('bribe: refusal costs nothing but raises suspicion', bribe.refuse.paid === 0 && bribe.refuse.days === 0 && bribe.refuse.susp > 0, JSON.stringify(bribe));
check('bribe: the $500 favour comes from the commissary; a backfire loses it, adds time and a lockdown', bribe.back.paid === 0 && bribe.back.fromCommissary === 500 && bribe.back.days > 0 && bribe.back.susp >= 30 && bribe.back.lock > 0, JSON.stringify(bribe));

// work, cards, inmates (time passes during these)
const work = await ev(() => {
  const g = window.game, P = g.uw.prison, j = g.uw.S.jail, c = g.content;
  j.lastJob = -99; const m0 = j.commissary || 0, st0 = j.standing;
  P.openWork(); c._svcAct('kitchen');
  for (let n = 0; n < 60 * 7; n++) g.update(1 / 60, 1 / 60);
  return { earned: (j.commissary || 0) - m0, street: g.money.total(), standing: j.standing - st0, chan: !!c.chan };
});
check('a prison shift (stand at the board a few seconds) pays commissary money (not street money) and standing', work.earned > 0 && work.standing > 0 && !work.chan, JSON.stringify(work));
const cards = await ev(() => { const g = window.game, P = g.uw.prison, j = g.uw.S.jail; j.commissary = 1000; P.openCards(); const m0 = j.commissary, s0 = g.money.total(); for (let i = 0; i < 40; i++) g.content._svcAct('bet:20'); while (g.ui.stack.length) g.ui.back(); return { net: j.commissary - m0, street: g.money.total() - s0 }; });
check('cards & dice settle real bets on the commissary account, never street money', cards.net !== 0 && Math.abs(cards.net) <= 800 && cards.street === 0, JSON.stringify(cards));
const dice = await ev(() => { let w = 0; for (let a = 1; a <= 6; a++) for (let b2 = 1; b2 <= 6; b2++) for (let c = 1; c <= 6; c++) for (let d = 1; d <= 6; d++) if (a + b2 > c + d) w++; return w / 1296; });
check('dice keep a house edge (ties go to the house)', dice < 0.5, dice.toFixed(3));
const inm = await ev(() => {
  const g = window.game, P = g.uw.prison, j = g.uw.S.jail, c = g.content, S = g.uw.S;
  P.openInmate('inmate3'); c._svcAct('favour');
  for (let n = 0; n < 60 * 5; n++) g.update(1 / 60, 1 / 60);
  const t1 = j.inm.inmate3 | 0;
  j.inm.inmate3 = 45; const cand0 = S.cand.length; P.openInmate('inmate3'); c._svcAct('gift'); while (g.ui.stack.length) g.ui.back();
  j.inm.inmate4 = 45; P.openInmate('inmate4'); c._svcAct('gift'); while (g.ui.stack.length) g.ui.back();
  return { t1, lou: S.cand.length - cand0, louName: S.cand[0] && S.cand[0].nick, ally: j.ally, intel: j.intel };
});
check('inmates: a favour builds trust', inm.t1 >= 10, JSON.stringify(inm));
check('inmates: trusted, Big Lou joins your recruits and Wire covers an escape', inm.lou === 1 && inm.louName === 'Big Lou' && inm.ally && inm.intel >= 2, JSON.stringify(inm));

// chores: walk to a tray, pick it up, walk to the serving window, drop it (real interactions, not a menu)
const chore = await ev(() => {
  const g = window.game, P = g.uw.prison, j = g.uw.S.jail, d = window.__pv.Prison, def = g.content.interiors.cur, p = g.player, out = {};
  j.gbp = 0; j.speed = 1; j.lockUntil = 0; P.choreReset();
  const tray = P.ch.items.find(i => i.kind === 'tray');
  p.pos.set(def.ox + tray.mesh.position.x, p.pos.y, def.oz + tray.mesh.position.z + 0.5);
  const a1 = g.uw.findAction(); out.label1 = a1 && a1.label; a1 && a1.act();
  out.carrying = P.ch.carry && P.ch.carry.kind;
  const D = d.CHORE_DROPS.tray; p.pos.set(def.ox + D[0], p.pos.y, def.oz + D[1] - 0.6);
  const a2 = g.uw.findAction(); out.label2 = a2 && a2.label; a2 && a2.act();
  out.gbp = j.gbp; out.carry2 = !!P.ch.carry;
  // three pieces of litter, then the bin
  P.ch.items = P.ch.items.filter(i => { if (i.kind === 'trash') { P.ch.grp.remove(i.mesh); return false; } return true; });
  for (let i = 0; i < 3; i++) P.choreSpawn('trash');
  for (const it of P.ch.items.filter(i => i.kind === 'trash')) { p.pos.set(def.ox + it.mesh.position.x + 0.3, p.pos.y, def.oz + it.mesh.position.z); const a = g.uw.findAction(); if (a) a.act(); }
  out.litter = P.ch.carry && P.ch.carry.n;
  const T = d.CHORE_DROPS.trash; p.pos.set(def.ox + T[0], p.pos.y, def.oz + T[1] - 0.7); const a3 = g.uw.findAction(); out.label3 = a3 && a3.label; a3 && a3.act();
  out.gbp2 = j.gbp;
  return out;
});
check('chore: pick up a dirty tray in the cafeteria and carry it to the serving counter (+3)', /tray/.test(chore.label1) && chore.carrying === 'tray' && /serving counter/.test(chore.label2) && chore.gbp === 3 && !chore.carry2, JSON.stringify(chore));
check('chore: pick up litter (up to three) and bin it (+2 each)', chore.litter === 3 && /Bin/.test(chore.label3) && chore.gbp2 === 9, JSON.stringify(chore));
const spd = await ev(() => {
  const g = window.game, P = g.uw.prison, j = g.uw.S.jail, out = {};
  out.locked3 = !P.setSpeed(3) && j.speed === 1;
  j.gbp = 20; out.max20 = P.maxSpeed(); out.set3 = P.setSpeed(3); out.no5 = !P.setSpeed(5);
  j.gbp = 45; out.set5 = P.setSpeed(5); out.no7 = !P.setSpeed(7);
  j.gbp = 75; out.set7 = P.setSpeed(7) && P.maxSpeed() === 7;
  // 7× really runs seven times as fast
  const a = j.served; for (let n = 0; n < 60 * 4; n++) g.update(1 / 60, 1 / 60); out.days7 = j.served - a;
  P.misbehave(25, 'test'); out.after = { gbp: j.gbp, speed: j.speed };
  P.misbehave(30, 'test'); out.after2 = { gbp: j.gbp, speed: j.speed };
  P.misbehave(20, 'test'); out.after3 = { gbp: j.gbp, speed: j.speed };
  out.hud = [...document.querySelectorAll('#jailHud [data-spd]')].map(b => b.dataset.spd + (b.disabled ? 'x' : '') + (b.classList.contains('on') ? '*' : '')).join(' ');
  return out;
});
check('good behaviour: 3× unlocks at 20 points, 5× at 45, 7× at 75; locked tiers refuse', spd.locked3 && spd.max20 === 3 && spd.set3 && spd.no5 && spd.set5 && spd.no7 && spd.set7, JSON.stringify(spd));
check('7× time: four seconds serve about fourteen days', spd.days7 >= 12 && spd.days7 <= 15, JSON.stringify(spd));
check('misbehaviour costs points and drops the speed tier (75→50: 5×, →20: 3×, →0: 1×)', spd.after.gbp === 50 && spd.after.speed === 5 && spd.after2.gbp === 20 && spd.after2.speed === 3 && spd.after3.gbp === 0 && spd.after3.speed === 1 && /1\*/.test(spd.hud), JSON.stringify(spd));
// the rebuilt jail (M8): two tiers, the catwalk and stairs, the rooms round the day room, the restricted area
const lay = await ev(() => {
  const g = window.game, P = g.uw.prison, j = g.uw.S.jail, def = g.content.interiors.cur, p = g.player, fy = def.fy !== undefined ? def.fy : p.pos.y, out = {};
  const lvl = window.__pv.intFloorY;
  out.catwalk = lvl(def, 2, -10.7, 9); out.under = lvl(def, 2, -10.7, 0.2); out.stairMid = lvl(def, 13, -6.15, 3); out.dayroom = lvl(def, 0, -4, 3);
  const ids = def.spots.map(s => s.id); out.rooms = ['bunk', 'payphone', 'smokey', 'guard', 'visit', 'infirmary', 'work', 'cards', 'hatch', 'weights', 'tv', 'rota'].every(k => ids.includes(k));
  // the catwalk spot only up there
  const rota = def.spots.find(s => s.id === 'rota');
  p.pos.set(def.ox + rota.x, fy, def.oz + rota.z); const below = g.uw.findAction(); out.below = below ? below.label : null;
  p.pos.set(def.ox + rota.x, fy + rota.y, def.oz + rota.z); const above = g.uw.findAction(); out.above = above ? above.label : null;
  // the restricted maintenance room: a guard sends you back, once a day, and it goes on your record
  j.gbp = 30; j.susp = 0; const gb = j.gbp;
  p.pos.set(def.ox - 17, fy, def.oz - 12.5); P.restricted(); P.restricted();
  out.trespass = { gbp: gb - j.gbp, susp: j.susp };
  p.pos.set(def.ox + 0, fy, def.oz - 4);
  // the infirmary
  p.health = 10; P.spot('infirmary'); out.healed = p.health === p.maxHealth;
  return out;
});
check('two tiers: the catwalk is a deck at the upper tier, the stair climbs to it, the ground under it stays ground', lay.catwalk > 3 && lay.under === 0 && lay.stairMid > 0.5 && lay.stairMid < 3 && lay.dayroom === 0, JSON.stringify(lay));
check('every room of the jail has its place: cells, day room, cafeteria, laundry/work, visitation, infirmary, gym, guard station, the catwalk, maintenance', lay.rooms, JSON.stringify(lay));
check('the catwalk spot is only reachable up on the catwalk', !(lay.below || '').includes('catwalk') && /catwalk/.test(lay.above || ''), JSON.stringify(lay));
check('maintenance is staff only: walking in costs good behaviour and raises suspicion, once a day', lay.trespass.gbp === 4 && lay.trespass.susp === 10, JSON.stringify(lay));
check('the infirmary patches you up', lay.healed, JSON.stringify(lay));
const fav = await ev(() => {
  const g = window.game, P = g.uw.prison, j = g.uw.S.jail, out = {};
  j.commissary = 5000; j.susp = 50; for (const k of ['inmate1', 'inmate2', 'inmate3', 'inmate4']) j.inm[k] = 70; j.intel = 0; j.cover = false; j.tool = false; j.phone = false; j.fav = {};
  out.deacon = P.favor('inmate1'); out.susp = j.susp;
  out.lou = P.favor('inmate3'); out.cover = j.cover;
  out.wire1 = P.favor('inmate4'); out.intel1 = j.intel;
  out.again = P.favor('inmate4');
  j.fav.inmate4 = -99; P.favor('inmate4'); j.fav.inmate4 = -99; out.wireTool = (P.favor('inmate4'), j.tool);
  out.tito = P.favor('inmate2', () => 0.1); out.phone = j.phone;
  j.inm.inmate1 = 30; j.fav.inmate1 = -99; out.lowTrust = P.favor('inmate1');
  out.commissary = j.commissary;
  j.phone = false;
  return out;
});
check('inmate favours (trust 60+, commissary): protection cuts suspicion, Big Lou a distraction, Wire the rota then a tool, Tito a phone', fav.susp === 30 && fav.cover && fav.intel1 === 1 && fav.wireTool && fav.phone, JSON.stringify(fav));
check('favours have a cooldown and need trust; they never take time off the sentence', /Not now/.test(fav.again) && /Not now/.test(fav.lowTrust), JSON.stringify(fav));
// the phone: only from a guard, a real roll
const ph = await ev(() => {
  const g = window.game, P = g.uw.prison, j = g.uw.S.jail, R = Math.random, out = {};
  P.openSmokey(); out.smokey = !/data-act="phone"/.test(document.getElementById('svcBody').innerHTML); while (g.ui.stack.length) g.ui.back();
  if (!P.courier()) { const c = g.uw.crew.genCandidate(); c.id = g.uw.S.nextCrew++; g.uw.S.crew.push(c); } j.susp = 0; const o = P.bribeOdds('phone'); out.odds = o; g.money.W.clean = g.money.W.dirty.me = Math.max(g.money.total(), 100000);
  const go = r => { j.lastBribe = -99; j.lockUntil = 0; P.openGuard(); const m0 = g.money.total(), t0 = j.total, gb = j.gbp; Math.random = () => r; g.content._svcAct('phone'); Math.random = R; while (g.ui.stack.length) g.ui.back(); return { paid: m0 - g.money.total(), days: j.total - t0, phone: j.phone, gbp: j.gbp - gb, lock: P.locked() }; };
  j.gbp = 40; j.susp = 0; out.refuse = go(o.ok + 0.01);
  j.susp = 0; out.caught = go(0.999);
  j.susp = 0; out.ok = go(0.001);
  out.access = !g.uw.ui.locked('market') && P.phone();
  j.lockUntil = 0;
  return out;
});
check('smuggled phone: Smokey no longer sells one', ph.smokey, JSON.stringify(ph));
check('guard phone bribe: refusal costs nothing', ph.refuse.paid === 0 && !ph.refuse.phone && ph.refuse.days === 0, JSON.stringify(ph.refuse));
check('guard phone bribe: caught = money gone, more time, lockdown, −25 good behaviour', ph.caught.paid === 10000 && ph.caught.days >= 5 && ph.caught.lock > 0 && ph.caught.gbp === -25 && !ph.caught.phone, JSON.stringify(ph.caught));
check('guard phone bribe: success gives a phone with full access', ph.ok.paid === 10000 && ph.ok.phone && ph.access, JSON.stringify(ph.ok));
check('the odds are a real three-way split (success, refusal, caught all possible)', ph.odds.ok > 0.2 && ph.odds.refuse > 0.1 && ph.odds.back > 0.1, JSON.stringify(ph.odds));
// the walk-out bribe
const rb = await ev(() => {
  const g = window.game, P = g.uw.prison, j = g.uw.S.jail, out = {};
  if (!P.courier()) { const c = g.uw.crew.genCandidate(); c.id = g.uw.S.nextCrew++; g.uw.S.crew.push(c); } j.total = j.served + 200; j.floor = 1; (g.money.W.clean = g.money.W.dirty.me = 1e6); const base = P.releaseBase();
  out.at1 = P.releaseOdds(base); out.at4 = P.releaseOdds(base * 4); out.half = P.releaseOdds(base / 2);
  const offer = 50000;
  j.lastRelease = -99; P.openGuard(); let m0 = g.money.total(), t0 = j.total; let r = P.releaseBribe(offer, () => P.releaseOdds(offer).ok + 0.01);
  out.refuse = { r, paid: m0 - g.money.total(), days: j.total - t0 };
  j.lastRelease = -99; j.lockUntil = 0; m0 = g.money.total(); t0 = j.total; const expect = P.releaseBackfireDays(); r = P.releaseBribe(offer, () => 0.9999);
  out.back = { r, paid: m0 - g.money.total(), days: j.total - t0, expect };
  out.cool = P.releaseBribe(offer, () => 0) === null;
  while (g.ui.stack.length) g.ui.back();
  return out;
});
check('walk-out bribe at the going rate: 50% out / 30% refused / 20% backfire', Math.abs(rb.at1.ok - 0.5) < 0.005 && Math.abs(rb.at1.refuse - 0.3) < 0.005 && Math.abs(rb.at1.back - 0.2) < 0.005, JSON.stringify(rb.at1));
check('walk-out bribe: a bigger offer materially raises the odds (4×: 76% out), a low one lowers them', rb.at4.ok > 0.74 && rb.at4.back < 0.15 && rb.half.ok < 0.4, JSON.stringify([rb.at4, rb.half]));
check('walk-out bribe: refusal keeps the money and adds nothing', rb.refuse.r === 'refuse' && rb.refuse.paid === 0 && rb.refuse.days === 0, JSON.stringify(rb.refuse));
check('walk-out bribe: backfire takes half the offer ($25,000 of $50,000) and adds time', rb.back.r === 'backfire' && rb.back.paid === 25000 && rb.back.days === rb.back.expect && rb.back.days >= 7, JSON.stringify(rb.back));
check('walk-out bribe: one attempt a week', rb.cool, JSON.stringify(rb));

// save and reload in jail
const sv = await ev(() => { const g = window.game; g.uw.S.jail.gbp = 22; g.uw.S.jail.speed = 3; g.saveGame(true); const d = window.__pv.SaveSystem.load().data; return { v: d.version, jail: !!d.uw.jail, served: d.uw.jail.served, ally: d.uw.jail.ally, speed: d.uw.jail.speed, gbp: d.uw.jail.gbp, phone: d.uw.jail.phone }; });
check('save in jail: current schema; the sentence, progress, good behaviour, speed and phone survive a reload', sv.v === 9 && sv.jail && sv.served > 0 && sv.ally && sv.speed === 3 && sv.gbp === 22 && sv.phone === true, JSON.stringify(sv));

// the escape: caught
const caught = await ev(() => { const g = window.game, P = g.uw.prison, j = g.uw.S.jail; j.tool = true; j.intel = 2; window.__t0 = j.total; P.startEscape(); return true; });
await waitFade();
const esc1 = await ev(() => { const g = window.game, P = g.uw.prison, I = g.content.interiors; return { on: !!P.esc, guards: I.guards.length }; });
check('escape: lights out puts a night guard on his walk', esc1.on && esc1.guards === 1, JSON.stringify(esc1));
await ev(() => { const g = window.game, I = g.content.interiors, gd = I.guards[0]; const p = g.player; gd.x = p.pos.x; gd.z = p.pos.z + 2; gd.h = Math.PI; gd.wait = 5; for (let n = 0; n < 90; n++) g.update(1 / 60, 1 / 60); });
await waitFade();
const c2 = await ev(() => { const g = window.game, P = g.uw.prison, j = g.uw.S.jail; return { esc: !!P.esc, added: j.total - window.__t0, tool: j.tool, lock: P.locked(), guards: g.content.interiors.guards.length }; });
check('escape: seen by the guard means caught — more time, lockdown, the tool is gone', !c2.esc && c2.added >= 30 && !c2.tool && c2.lock > 0 && c2.guards === 0, JSON.stringify(c2));
void caught;
// the escape: out
await ev(() => { const g = window.game, P = g.uw.prison, j = g.uw.S.jail; j.lockUntil = 0; j.tool = true; j.intel = 2; P.startEscape(); });
await waitFade();
await ev(() => { const g = window.game, I = g.content.interiors, d = I.cur, p = g.player; const gd = I.guards[0]; gd.route = [[10.5, -3.6], [10.6, -3.6]]; gd.x = d.ox + 10.5; gd.z = d.oz - 3.6; gd.h = 0; g.uw.prison.drainOdds = () => 1; const H = d.spots.find(s => s.id === 'hatch'); p.pos.set(d.ox + H.x, d.fy, d.oz + H.z); g.uw.prison.escapeHatch(); for (let n = 0; n < 60 * 5; n++) g.update(1 / 60, 1 / 60); });
await waitFade();
const out = await ev(() => { const g = window.game, S = g.uw.S; return { jail: !!S.jail, fug: S.fugitive, lvl: g.police.level, interior: !!g.player.interior }; });
check('escape: reach the grate unseen and unscrew it → out, a fugitive, three stars', !out.jail && out.fug && out.fug.left > 0 && out.lvl >= 3 && !out.interior, JSON.stringify(out));
const ch = await ev(() => { const g = window.game; return g.uw.prison.charges().lines.map(l => l[0]).join(' | '); });
check('a fugitive caught again faces the recapture enhancement (not the whole old sentence)', /Escaped custody/.test(ch), ch);
await ev(() => { delete window.game.uw.prison.drainOdds; });

// release after a served sentence
await ev(() => { const g = window.game; g.police.clear(); g.police.setLevel(1); g.uw.S.rap.maxLvl = Math.max(g.uw.S.rap.maxLvl || 0, 3); g.uw.legal.add('assault', 'police'); g.onBusted(); });
await throughCourt(page);
await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });
await ev(() => { const j = window.game.uw.S.jail; j.total = j.served + 1; });
await page.waitForFunction(() => !window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });
const rel = await ev(() => { const g = window.game; return { interior: !!g.player.interior, hud: document.getElementById('jailHud').classList.contains('hidden'), fug: g.uw.S.fugitive, chores: !g.uw.prison.ch || !g.uw.prison.ch.grp.visible }; });
check('serve the time and you walk out: back on the street, no jail panel, no fugitive record, chores gone', !rel.interior && rel.hud && !rel.fug && rel.chores, JSON.stringify(rel));
// a walk-out that works: released at once, the offer paid
await ev(() => { const g = window.game; g.police.clear(); g.police.setLevel(2); g.uw.S.rap.maxLvl = Math.max(g.uw.S.rap.maxLvl || 0, 3); g.uw.legal.add('assault', 'police'); g.onBusted(); });
await throughCourt(page);
await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });
const walk = await ev(() => { const g = window.game, P = g.uw.prison, j = g.uw.S.jail; if (!P.courier()) { const c = g.uw.crew.genCandidate(); c.id = g.uw.S.nextCrew++; g.uw.S.crew.push(c); } (g.money.W.clean = g.money.W.dirty.me = 200000); j.lastRelease = -99; j.lockUntil = 0; const m0 = g.money.total(); const r = P.releaseBribe(20000, () => 0); return { r, paid: m0 - g.money.total(), phone: j.phone }; });
await page.waitForFunction(() => !window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });
check('walk-out bribe: success pays the offer and releases you at once (a new sentence starts with no phone)', walk.r === 'release' && walk.paid === 20000 && walk.phone === false, JSON.stringify(walk));

// v4 save with an inflated calendar: the shown calendar loses the jail inflation
const mig = await ev(() => {
  const SS = window.__pv.SaveSystem, raw = JSON.parse(localStorage.getItem('pvunderworld.save.v1'));
  raw.version = 4; raw.uw.day = 2114; raw.uw.st.jailDays = 2100; delete raw.uw.dayOffset; raw.uw.jail = { total: 500, served: 20, speed: 20, call: 0, appealed: false, bribed: false, charges: 'x' };
  localStorage.setItem('pvunderworld.save.v1', JSON.stringify(raw));
  const d = SS.load(); const g = window.game; g.save = d.data; g.uw.bind(g.save);
  const r = { migrated: d.migrated, day: g.uw.S.day, cal: g.uw.calDay, jail: !!g.uw.S.jail, speed: g.uw.S.jail.speed, credit: g.uw.S.jail.credit, standing: g.uw.S.jail.standing, gbp: g.uw.S.jail.gbp };
  g.uw.S.jail = null; return r;
});
check('migration v4 → v5: a calendar inflated by prison days shows the street days instead (day 2114 with 2100 in jail → about day 314)', mig.migrated && mig.day === 2114 && mig.cal >= 300 && mig.cal <= 320, JSON.stringify(mig));
check('migration v4 → v6: a sentence in progress keeps going with the new fields filled in (old 20× becomes 1×)', mig.jail && mig.speed === 1 && mig.credit === 0 && mig.standing >= 0 && mig.gbp === 0, JSON.stringify(mig));
// v5: the old permanent phone (S.jailPhone) is gone after migration
const mig5 = await ev(() => {
  const SS = window.__pv.SaveSystem, raw = JSON.parse(localStorage.getItem('pvunderworld.save.v1'));
  raw.version = 5; raw.uw.jailPhone = true; raw.uw.jail = null;
  localStorage.setItem('pvunderworld.save.v1', JSON.stringify(raw));
  const d = SS.load(); const g = window.game; g.save = d.data; g.uw.bind(g.save);
  return { phone: g.uw.S.jailPhone, migrated: d.migrated, v: g.save.version };
});
check('migration v5 → current: the old phone taped under the bunk is gone', mig5.phone === false && mig5.migrated && mig5.v === 9, JSON.stringify(mig5));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'prison');
