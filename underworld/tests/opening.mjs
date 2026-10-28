/* The opening (M12): six short jobs from Rosa Calder, each finished by doing the real thing (buying and selling
   product, laundering through Dina, stealing and chopping a car, losing the police, using the map, looking over a
   warehouse), each paying modest Dirty Cash and Rep, unlocking in order, then letting you go (side jobs from then
   on, other contacts call). The new game points you at her; the contextual tips carry no stale wording. */
import { launch, open, check, startNew, finish, frames } from './lib.mjs';
const b = await launch();
const t = await open(b);
const page = t.page;
const ev = (f, a) => page.evaluate(f, a);
await startNew(page);
await ev(() => { const g = window.game; g.events.cool = 1e9; g.traffic.enabled = true; g.save.settings.guide = false; });
// run the game for a while (the mission engine, the phone, the clock)
const step = (sec) => ev(s => { const g = window.game; for (let n = 0; n < s * 60; n++) g.update(1 / 60, 1 / 60); }, sec);
const offer = () => ev(() => { const g = window.game, c = g.missions.contacts.find(x => x.id === 'rosa'), o = g.campaign.offerFor(c); return o && { type: o.type, id: o.def && o.def.id, title: o.title, chip: o.chip, locked: o.locked, reward: o.reward }; });
const startJob = () => ev(() => { const g = window.game, c = g.missions.contacts.find(x => x.id === 'rosa'); g.missions.start(g.campaign.offerFor(c)); });
const state = () => ev(() => { const g = window.game, m = g.missions.active; return m ? { obj: m.objective, si: m.si, id: m.spec.def && m.spec.def.id } : null; });
const passed = id => ev(i => !!window.game.save.story[i], id);

await page.waitForFunction(() => window.game.save.messages.some(m => m.from === 'rosa'), null, { timeout: 30000, polling: 200 }).catch(() => {});
const intro2 = await ev(() => window.game.save.messages.map(m => m.from + ': ' + m.text).join(' | '));
check('a new game points you at Rosa Calder (the ! on the map)', /rosa: .*Rosa Calder/.test(intro2), intro2.slice(0, 300));
const o1 = await offer();
check('Rosa’s first offer is the opening: STORY · Fresh Off the Ferry · 1/6, “Smokes”', o1.type === 'story' && o1.id === 'o1' && /1\/6/.test(o1.chip) && o1.locked === '', JSON.stringify(o1));

// ---------------------------------------------------------------- 1. Smokes
const m0 = await ev(() => ({ dirty: window.game.money.W.dirty.me, rep: window.game.save.rep }));
await startJob(); await step(2);
const s1 = await ev(() => { const g = window.game; return { dirty: g.money.W.dirty.me, obj: g.missions.active.objective }; });
check('Smokes: broke at the start, Rosa fronts $150 in cash (Dirty) and sends you to Sully', s1.dirty >= 150 && /Sully/.test(s1.obj), JSON.stringify([m0, s1]));
await ev(() => { const g = window.game, L = g.uw.loc('spot', 'sully'); g.resetPlayerState(L.x, L.z, 0); }); await step(2);
await ev(() => { const g = window.game, L = g.uw.loc('spot', 'sully'); g.uw.ui.openSpot(L); g.content._svcAct('b:smokes:5'); while (g.ui.stack.length) g.ui.back(); }); await step(1);
const s1b = await state();
check('…buying at Sully’s moves the job on to selling them', /Sell your smokes/.test(s1b.obj), JSON.stringify(s1b));
await ev(() => { const g = window.game, uw = g.uw, T = uw.T.find(t => t.zone === 'o') || uw.T[0]; const R = Math.random; Math.random = () => 0.99; try { uw.ui.openDeal({ turf: T.i, members: [] }); g.content._svcAct('s:smokes:5'); } finally { Math.random = R; } while (g.ui.stack.length) g.ui.back(); });
await step(4);
check('…selling to street buyers finishes it: $150 Dirty and Rep', await passed('o1'), JSON.stringify(await state()));

// ---------------------------------------------------------------- 2. Clean Hands
const o2 = await offer();
check('the next job unlocks only after the last: “Clean Hands” 2/6', o2.id === 'o2' && /2\/6/.test(o2.chip), JSON.stringify(o2));
await startJob(); await step(2);
await ev(() => { const g = window.game, L = g.uw.loc('spot', 'fixer'); g.resetPlayerState(L.x, L.z, 0); }); await step(2);
await ev(() => { const g = window.game; g.uw.fixer.hand(150); }); await step(4);
check('Clean Hands: handing Dina Dirty Cash to launder finishes it', await passed('o2'), JSON.stringify(await state()));

// ---------------------------------------------------------------- 3. Hot Wheels
await startJob(); await step(2);
await ev(() => { const g = window.game, P = window.__pv, kp = P.nearestRoadPoint(5 * 80 + 40, 5 * 80); g.resetPlayerState(kp.x, kp.z, 0); const v = g.vehicles.spawn('sedan', kp.x + 3, kp.z, 0); g.enterVehicle ? g.enterVehicle(v) : g.beginEnter(v); window.__car = v; });
await step(3);
const s3 = await state();
check('Hot Wheels: getting into a car that isn’t yours moves on (“HOT”, to the Chop Shop)', s3 && /Chop Shop/.test(s3.obj), JSON.stringify(s3));
await ev(() => { const g = window.game, v = g.player.vehicle || window.__car; g.uw.sellCar(v, false); }); await step(4);
check('…selling it to the Chop Shop finishes it', await passed('o3'), JSON.stringify(await state()));

// ---------------------------------------------------------------- 4. Heat
await startJob(); await step(3);
const s4 = await ev(() => ({ lvl: window.game.police.level, obj: window.game.missions.active.objective }));
check('Heat: a star, and the job is to lose them', s4.lvl >= 1 && /Lose the police/.test(s4.obj), JSON.stringify(s4));
await ev(() => window.game.police.clear()); await step(4);
check('…out of sight, the case file explained, it’s done', await passed('o4'), JSON.stringify(await state()));

// ---------------------------------------------------------------- 5. Know the City
await startJob(); await step(2);
const s5 = await state();
check('Know the City: mark Greenhouse Gus on the map first', /Mark Greenhouse Gus/.test(s5.obj), JSON.stringify(s5));
await ev(() => { const g = window.game, L = g.uw.loc('spot', 'gus'); g.content.setWaypoint(L.x, L.z, 'Greenhouse Gus'); }); await step(2);
const s5b = await state();
await ev(() => { const g = window.game, L = g.uw.loc('spot', 'gus'); g.resetPlayerState(L.x, L.z, 0); }); await step(4);
check('…then follow the GPS to him; he deals with you from then on', /Follow the GPS/.test(s5b.obj) && await passed('o5') && await ev(() => !!window.game.uw.S.flags.intro.gus), JSON.stringify(s5b));

// ---------------------------------------------------------------- 6. Bigger Than You
await startJob(); await step(2);
const s6 = await state();
await ev(() => { const g = window.game, w = window.__pv.PROPS.filter(p => p.kind === 'warehouse').sort((a, b2) => a.price - b2.price)[0], L = g.uw.loc('prop', w.id); g.resetPlayerState(L.x, L.z, 0); }); await step(5);
const end = await ev(() => { const g = window.game, c = g.missions.contacts.find(x => x.id === 'rosa'), o = g.campaign.offerFor(c); return { done: !!g.save.story.o6, intro: !!g.save.flags.introDone, next: o && o.type, chip: o && o.chip, msgs: g.save.messages.slice(-4).map(m => m.from), dirty: g.money.W.dirty.me, rep: g.save.rep, rank: g.uw.rank }; });
check('Bigger Than You: look over a warehouse for sale, and Rosa lets you go', /Look over/.test(s6.obj) && end.done && end.intro, JSON.stringify([s6, end]));
check('afterwards Rosa offers ordinary side jobs, and Ines and Tull call', end.next !== 'story' && /SIDE/.test(end.chip || '') && end.msgs.includes('ines') && end.msgs.includes('tull'), JSON.stringify(end));
check('the opening pays modestly (Rep ≥ 300 but still a Nobody or Street Hustler: Rank isn’t handed out)', end.rep >= 300 && end.rank <= 1, JSON.stringify(end));

// ---------------------------------------------------------------- the tips carry no stale wording
const tips = await ev(() => { const g = window.game; return (window.__pv.TUTORIAL || []).map(t => t.text(g)).join(' | '); });
check('the contextual tips are current (1×/3×/5×/7×, serving counter, Rosa, no-skip cabs)', !/2× and 3×|serving window|launder your name/.test(tips) && /Rosa/.test(tips) && /3×, 5× and 7×/.test(tips), tips.slice(0, 200));

check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
await finish(b, 'opening');
