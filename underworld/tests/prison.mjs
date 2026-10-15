/* Prison: no fast-forward; the sentence clock (two seconds a day) and the street calendar (a day per
   week served); readable sentences; lawyers, bribes (success / refusal / backfire), work, cards,
   inmates, the escape (caught and out); save and reload in jail; release; the v4 calendar migration. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const waitFade = () => page.waitForFunction(() => !window.game.fading, null, { timeout: 30000, polling: 100 });
const step = (sec) => ev(s => { const g = window.game; for (let n = 0; n < s * 60; n++) g.update(1 / 60, 1 / 60); }, sec);

check('there are no sentence speed buttons (1× / 5× / 20×) anywhere', await ev(() => !document.getElementById('jailSpeed') && !/20×/.test(document.body.innerHTML) && typeof window.game.uw.prison.setSpeed === 'undefined'));
const fmt = await ev(() => { const f = window.__pv.fmtSentence; return [f(1), f(45), f(365), f(439), f(800)]; });
check('sentences read as days or years + days', fmt.join('|') === '1 day|45 days|1 year|1 year 74 days|2 years 70 days', fmt.join('|'));

// an early-game arrest: one star, a pickpocketing
await ev(() => { const g = window.game; g.events.cool = 1e9; g.save.money = 50000; g.uw.S.rap.cur = { pickpocket: 1 }; g.police.setLevel(1); g.onBusted(); });
await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });
const s0 = await ev(() => { const g = window.game, j = g.uw.S.jail; return { total: j.total, day: g.uw.S.day, hud: document.getElementById('jailDays').textContent + ' / ' + document.getElementById('jailLeft').textContent }; });
check('an early mistake gets a short sentence (a pickpocketing at one star: under three weeks)', s0.total >= 5 && s0.total <= 21, JSON.stringify(s0));
check('the jail panel shows remaining, sentence and served in words', /left/.test(s0.hud) && /Sentence/.test(s0.hud) && /served/.test(s0.hud), s0.hud);
await ev(() => { const j = window.game.uw.S.jail; j.total = 400; });
await step(20);
const s1 = await ev(() => { const g = window.game, j = g.uw.S.jail; return { served: j.served, day: g.uw.S.day, cal: g.uw.calDay }; });
check('the sentence clock runs at about a day per two seconds (20 s → ~10 days)', s1.served >= 9 && s1.served <= 11, JSON.stringify(s1));
await step(30);
const s2 = await ev(() => { const g = window.game, j = g.uw.S.jail; return { served: j.served, day: g.uw.S.day }; });
check('the street calendar moves a day per week served, not a day per day', s2.day - s0.day >= 2 && s2.day - s0.day <= 4 && s2.served >= 24, JSON.stringify({ s0, s2 }));
check('the street time of day stands still inside', await ev(() => { const t = window.game.env.time; for (let n = 0; n < 120; n++) window.game.update(1 / 60, 1 / 60); return Math.abs(window.game.env.time - t) < 0.01; }));
const menuStop = await ev(() => { const g = window.game, j = g.uw.S.jail, a = j.served; g.uw.prison.openLife(); for (let n = 0; n < 600; n++) g.update(0, 1 / 60); const b2 = j.served; while (g.ui.stack.length) g.ui.back(); return { a, b2 }; });
check('time does not pass while a prison menu is open', menuStop.a === menuStop.b2, JSON.stringify(menuStop));

// lawyers: success, failure, once per firm, a month between hearings
const law = await ev(() => {
  const g = window.game, P = g.uw.prison, j = g.uw.S.jail, R = Math.random, out = {};
  P.openLawyer();
  j.lastLawyer = -99; let m0 = g.save.money, t0 = j.total; Math.random = () => 0.01; g.content._svcAct('hire:pd'); Math.random = R;
  out.ok = { paid: m0 - g.save.money, cut: t0 - j.total };
  j.lastLawyer = -99; m0 = g.save.money; t0 = j.total; Math.random = () => 0.99; g.content._svcAct('hire:firm'); Math.random = R;
  out.fail = { paid: m0 - g.save.money, cut: t0 - j.total };
  m0 = g.save.money; g.content._svcAct('hire:silk'); out.waiting = { paid: m0 - g.save.money };
  j.lastLawyer = -99; m0 = g.save.money; g.content._svcAct('hire:pd'); out.again = { paid: m0 - g.save.money };
  while (g.ui.stack.length) g.ui.back();
  return out;
});
check('lawyer: a win cuts the sentence and is paid for', law.ok.paid === 300 && law.ok.cut > 0, JSON.stringify(law));
check('lawyer: a loss is still paid for and cuts nothing', law.fail.paid > 0 && law.fail.cut === 0, JSON.stringify(law));
check('lawyer: one hearing a month, each firm once per sentence', law.waiting.paid === 0 && law.again.paid === 0, JSON.stringify(law));

// bribes: success, refusal, backfire
const bribe = await ev(() => {
  const g = window.game, P = g.uw.prison, j = g.uw.S.jail, R = Math.random, out = {};
  const go = (r, act) => { j.lastBribe = -99; P.openGuard(); const m0 = g.save.money, t0 = j.total, s0 = j.susp; Math.random = () => r; g.content._svcAct(act); Math.random = R; while (g.ui.stack.length) g.ui.back(); return { paid: m0 - g.save.money, days: j.total - t0, susp: j.susp - s0, lock: P.locked() }; };
  j.susp = 0; out.ok = go(0.01, 'paper');
  j.susp = 0; out.refuse = go(P.bribeOdds('perk').ok + 0.01, 'perk');
  j.susp = 0; out.back = go(0.999, 'perk');
  j.lockUntil = 0;
  return out;
});
check('bribe: success takes a quarter off what is left', bribe.ok.paid > 0 && bribe.ok.days < 0, JSON.stringify(bribe));
check('bribe: refusal costs nothing but raises suspicion', bribe.refuse.paid === 0 && bribe.refuse.days === 0 && bribe.refuse.susp > 0, JSON.stringify(bribe));
check('bribe: backfire loses the money, adds time and a lockdown', bribe.back.paid === 500 && bribe.back.days > 0 && bribe.back.susp >= 30 && bribe.back.lock > 0, JSON.stringify(bribe));

// work, cards, inmates (time passes during these)
const work = await ev(() => {
  const g = window.game, P = g.uw.prison, j = g.uw.S.jail, c = g.content;
  j.lastJob = -99; const m0 = g.save.money, st0 = j.standing;
  P.openWork(); c._svcAct('kitchen');
  for (let n = 0; n < 60 * 7; n++) g.update(1 / 60, 1 / 60);
  return { earned: g.save.money - m0, standing: j.standing - st0, chan: !!c.chan };
});
check('a prison shift (stand at the board a few seconds) pays commissary money and standing', work.earned > 0 && work.standing > 0 && !work.chan, JSON.stringify(work));
const cards = await ev(() => { const g = window.game, P = g.uw.prison; P.openCards(); const m0 = g.save.money; for (let i = 0; i < 40; i++) g.content._svcAct('bet:20'); while (g.ui.stack.length) g.ui.back(); return { net: g.save.money - m0 }; });
check('cards & dice settle real bets', cards.net !== 0 && Math.abs(cards.net) <= 800, JSON.stringify(cards));
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

// save and reload in jail
const sv = await ev(() => { const g = window.game; g.saveGame(true); const d = window.__pv.SaveSystem.load().data; return { v: d.version, jail: !!d.uw.jail, served: d.uw.jail.served, ally: d.uw.jail.ally, speed: 'speed' in d.uw.jail }; });
check('save in jail: version 5, the sentence and its progress survive a reload, no speed field', sv.v === 5 && sv.jail && sv.served > 0 && sv.ally && !sv.speed, JSON.stringify(sv));

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
await ev(() => { const g = window.game, I = g.content.interiors, d = I.cur, p = g.player; const gd = I.guards[0]; gd.route = [[10.5, -3.6], [10.6, -3.6]]; gd.x = d.ox + 10.5; gd.z = d.oz - 3.6; gd.h = 0; p.pos.set(d.ox - 12.1, d.fy, d.oz + 4.0); g.uw.prison.escapeHatch(); for (let n = 0; n < 60 * 5; n++) g.update(1 / 60, 1 / 60); });
await waitFade();
const out = await ev(() => { const g = window.game, S = g.uw.S; return { jail: !!S.jail, fug: S.fugitive, lvl: g.police.level, interior: !!g.player.interior }; });
check('escape: reach the grate unseen and unscrew it → out, a fugitive, three stars', !out.jail && out.fug && out.fug.left > 0 && out.lvl >= 3 && !out.interior, JSON.stringify(out));
const ch = await ev(() => { const g = window.game; return g.uw.prison.charges().lines.map(l => l[0]).join(' | '); });
check('a fugitive caught again answers for the rest of the old sentence', /Escaped custody/.test(ch), ch);

// release after a served sentence
await ev(() => { const g = window.game; g.police.clear(); g.police.setLevel(1); g.onBusted(); });
await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });
await ev(() => { const j = window.game.uw.S.jail; j.total = j.served + 1; });
await page.waitForFunction(() => !window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });
const rel = await ev(() => { const g = window.game; return { interior: !!g.player.interior, hud: document.getElementById('jailHud').classList.contains('hidden'), fug: g.uw.S.fugitive }; });
check('serve the time and you walk out: back on the street, no jail panel, no fugitive record', !rel.interior && rel.hud && !rel.fug, JSON.stringify(rel));

// v4 save with an inflated calendar: the shown calendar loses the jail inflation
const mig = await ev(() => {
  const SS = window.__pv.SaveSystem, raw = JSON.parse(localStorage.getItem('pvunderworld.save.v1'));
  raw.version = 4; raw.uw.day = 2114; raw.uw.st.jailDays = 2100; delete raw.uw.dayOffset; raw.uw.jail = { total: 500, served: 20, speed: 20, call: 0, appealed: false, bribed: false, charges: 'x' };
  localStorage.setItem('pvunderworld.save.v1', JSON.stringify(raw));
  const d = SS.load(); const g = window.game; g.save = d.data; g.uw.bind(g.save);
  const r = { migrated: d.migrated, day: g.uw.S.day, cal: g.uw.calDay, jail: !!g.uw.S.jail, speed: 'speed' in g.uw.S.jail, credit: g.uw.S.jail.credit, standing: g.uw.S.jail.standing };
  g.uw.S.jail = null; return r;
});
check('migration v4 → v5: a calendar inflated by prison days shows the street days instead (day 2114 with 2100 in jail → about day 314)', mig.migrated && mig.day === 2114 && mig.cal >= 300 && mig.cal <= 320, JSON.stringify(mig));
check('migration v4 → v5: a sentence in progress keeps going with the new fields filled in', mig.jail && !mig.speed && mig.credit === 0 && mig.standing >= 0, JSON.stringify(mig));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'prison');
