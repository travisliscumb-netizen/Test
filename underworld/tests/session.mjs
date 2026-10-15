/* Underworld session test: the zero-to-kingpin loop end to end.
   First money (pickpocket, mugging, glovebox, chop shop) -> property -> supply -> street
   deals -> crew dealer income -> gang fight -> turf takeover -> rivals acting alone ->
   police raid supply shock -> corruption (bought and honest cops) -> save / reload ->
   corrupted save recovery. */
import { launch, open, check, frames, startNew, summary, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
await page.evaluate(() => { const g = window.game; g.events.cool = 1e9; g.input.wantLock = false; g.input.noLock = true; g.police.enabled = false; });
await page.mouse.move(240, 135);
const ev = (fn, a) => page.evaluate(fn, a);
const stubRandom = v => ev(v => { window.__rnd = window.__rnd || Math.random; Math.random = () => v; }, v);
const unstub = () => ev(() => { if (window.__rnd) Math.random = window.__rnd; });
const money = () => ev(() => window.game.save.money);
// a quiet spot away from every street location
const quiet = await ev(() => { const g = window.game; for (let k = 0; k < 400; k++) { const x = 40 + Math.random() * 880, z = 40 + Math.random() * 880; if (g.uw.locs.every(L => Math.hypot(L.x - x, L.z - z) > 25) && Math.abs(((x % 80) + 80) % 80 - 40) < 30 === false) return { x, z }; } return { x: 6 * 80, z: 6 * 80 }; });
// ---------------------------------------------------------------- 1. pickpocket
await ev(q => { const g = window.game, p = g.player; g.resetPlayerState(q.x, q.z, 0); g.peds.peds = g.peds.peds.filter(x => x.kind !== 'civ'); const c = g.peds.make('civ'); c.x = p.pos.x; c.z = p.pos.z + 1.0; c.y = p.pos.y; c.h = 0; c.state = 'idle'; c.timer = 99; c.keep = true; g.peds.peds.push(c); window.__mark = c; g.peds.enabled = true; }, quiet);
await frames(page, 2);
const lbl = await ev(() => { const a = window.game.uw.findAction(); return a && a.label; });
check('pickpocket prompt from behind', lbl === 'Pickpocket', lbl);
await stubRandom(0.1);
const m0 = await money();
await ev(() => { const a = window.game.uw.findAction(); if (a) a.act(); });
await unstub();
check('pickpocket pays the first dollars', (await money()) > m0, `${m0} -> ${await money()}`);
// ---------------------------------------------------------------- 2. mugging: knock down -> cash drop -> pick it up
await ev(() => { const g = window.game, p = g.player, c = window.__mark; c.picked = false; c.dropped = false; c.state = 'idle'; c.health = 4; c.x = p.pos.x + Math.sin(p.h) * 0.9; c.z = p.pos.z + Math.cos(p.h) * 0.9; });
await stubRandom(0.1);
await page.mouse.down(); await frames(page, 1); await page.mouse.up(); await frames(page, 14);
await unstub();
const drop = await ev(() => window.game.uw.pickups.list.length);
check('mugging drops cash', drop > 0, 'pickups ' + drop);
const m1 = await money();
await ev(() => { const g = window.game, it = g.uw.pickups.list[0]; if (it) { g.player.pos.x = it.x; g.player.pos.z = it.z; } });
await frames(page, 4);
check('walking over the drop collects it', (await money()) > m1, `${m1} -> ${await money()}`);
// ---------------------------------------------------------------- 3. glovebox + chop shop
await stubRandom(0.1);
const gl = await ev(q => { const g = window.game, p = g.player; g.resetPlayerState(q.x, q.z, 0); const v = g.vehicles.spawn('suv', p.pos.x + 3, p.pos.z, 0, { parked: true }); v.touched = true; const m = g.save.money; g.completeEnter(v); return { before: m, after: g.save.money, looted: v.looted }; }, quiet);
await unstub();
check('first time in a parked car: glovebox', gl.looted && gl.after > gl.before, JSON.stringify(gl));
const chop = await ev(() => { const g = window.game, L = g.uw.loc('spot', 'chop'), v = g.player.vehicle; v.pos.set(L.x, 0, L.z); v.vel.set(0, 0); v.health = 90; const a = g.uw.findAction(); const before = g.save.money; if (a) a.act(); return { label: a && a.label, before, after: g.save.money, gone: !g.vehicles.list.includes(v), state: g.player.state }; });
check('chop shop buys the stolen car', chop.gone && chop.after > chop.before && chop.state === 'foot', JSON.stringify(chop));
// ---------------------------------------------------------------- 4. property
await ev(() => { window.game.save.money += 20000; window.game.save.rep = 150; });
const prop = await ev(() => { const g = window.game, uw = g.uw, L = uw.loc('prop', 'flop'); g.resetPlayerState(L.x, L.z, 0); const a = uw.findAction(); const r = uw.props.buy('flop'); return { label: a && a.label, r, owned: uw.props.owned('flop'), saved: (localStorage.getItem('pvunderworld.save.v1') || '').includes('"flop":{"owned":true') }; });
check('buy a safehouse in person', prop.owned && prop.r === '' && /for sale/.test(prop.label || ''), JSON.stringify(prop));
// autosaves only commit in a stable moment (the mugging above may still count as a fight):
// the purchase must be saved now or queued and committed as soon as things calm down
const queued = await ev(() => window.game.pendingAutosave);
let saved = prop.saved;
for (let k = 0; k < 60 && !saved; k++) { await frames(page, 5); saved = await ev(() => (localStorage.getItem('pvunderworld.save.v1') || '').includes('"flop":{"owned":true')); }
check('purchase autosaves (at once or when stable)', saved, `immediate ${prop.saved} queued ${queued}`);
// ---------------------------------------------------------------- 5. supply -> stash -> street deal
const buy = await ev(() => { const g = window.game, uw = g.uw, L = uw.loc('spot', 'sully'); g.resetPlayerState(L.x, L.z, 0); uw.ui.openSpot(L); g.content._svcAct('buy:smokes:5'); g.content._svcAct('buy:smokes:5'); const n = uw.S.inv.smokes | 0; while (g.ui.stack.length) g.ui.back(); return n; });
check('bought smokes wholesale from Sully', buy === 10, 'carrying ' + buy);
const stash = await ev(() => { const g = window.game, uw = g.uw; uw.ui.openProp('flop'); g.content._svcAct('st:smokes'); const stored = uw.S.storage.flop.smokes | 0, pockets = uw.S.inv.smokes | 0; g.content._svcAct('tk:smokes'); while (g.ui.stack.length) g.ui.back(); return { stored, pockets, back: uw.S.inv.smokes | 0 }; });
check('stash store / take', stash.stored === 10 && stash.pockets === 0 && stash.back === 10, JSON.stringify(stash));
// deal corner: night, a corner on the player's side of town
const turf = await ev(() => { const g = window.game, uw = g.uw; g.env.time = 21; for (let i = 0; i < uw.T.length; i++) if (uw.gangs.buyersActive(i) && uw.T[i].zone === 'o') return i; return 0; });
await ev(i => { const g = window.game, t = g.uw.T[i]; g.resetPlayerState(t.deal.x + 70, t.deal.z, 0); }, turf);
// the street spawner ticks every 0.6 s: wait for the buyers to be on their corner
for (let k = 0; k < 60 && !(await ev(i => window.game.uw.gangs.groups.has('buy' + i), turf)); k++) await frames(page, 3);
await ev(i => { const g = window.game, t = g.uw.T[i]; g.resetPlayerState(t.deal.x + Math.sin(t.deal.h) * 1.6, t.deal.z + Math.cos(t.deal.h) * 1.6, t.deal.h + Math.PI); }, turf);
await frames(page, 4);
const deal = await ev(() => { const g = window.game, uw = g.uw, gr = uw.gangs.buyerNear(); if (!gr) return { found: false, groups: [...uw.gangs.groups.keys()] }; uw.ui.openDeal(gr); const before = g.save.money; const r0 = Math.random; Math.random = () => 0.99; g.content._svcAct('s:smokes:5'); Math.random = r0; const after = g.save.money; while (g.ui.stack.length) g.ui.back(); return { found: true, before, after, left: uw.S.inv.smokes | 0 }; });
check('street buyers at a deal corner buy product', deal.found && deal.after > deal.before && deal.left === 5, JSON.stringify(deal));
// ---------------------------------------------------------------- 6. crew dealer income
const crew = await ev(() => {
  const g = window.game, uw = g.uw; g.save.rep = 200;
  uw.crew.refreshCandidates(true); const r = uw.crew.hire(0);
  const c = uw.S.crew[0]; const tgt = uw.T.findIndex((t, i) => uw.owner[i] === 'vipers');
  const ra = c ? uw.crew.assign(c.id, 'dealer', tgt) : 'none';
  uw.S.storage.flop = { green: 30 };
  const before = units(uw.S.storage.flop);
  // pin randomness for this one day: stash robberies, skimming and busts are tested elsewhere
  const r0 = Math.random; Math.random = () => 0.99;
  try { uw.tickDay(); } finally { Math.random = r0; }
  return { r, ra, role: c && c.role, before, after: units(uw.S.storage.flop), income: uw.S.lastLedger && uw.S.lastLedger.inc.dealers, wages: uw.S.lastLedger && uw.S.lastLedger.exp.wages, status: c && c.status };
  function units(o) { let n = 0; for (const k in o) n += o[k]; return n; }
});
check('hire a crew member', crew.r === '' && crew.role === 'dealer', JSON.stringify(crew));
check('crew dealer sells stored product overnight', (crew.after < crew.before && crew.income > 0) || crew.status === 'jailed', JSON.stringify(crew));
check('wages are paid', crew.wages > 0, JSON.stringify(crew));
// ---------------------------------------------------------------- 7. gang fight on a rival corner
const gangTurf = await ev(() => { const g = window.game, uw = g.uw; const i = uw.owner.findIndex((o, k) => o === 'vipers' && uw.T[k].zone === 'o'); const t = uw.T[i]; g.resetPlayerState(t.hang.x + 75, t.hang.z, 0); g.player.health = 100000; return i; });
// the street spawner ticks every 0.6 s and never spawns in plain view up close: wait for the crew from 75 m
for (let k = 0; k < 60 && !(await ev(i => { const gr = window.game.uw.gangs.groups.get('hang' + i); return !!(gr && gr.members.length); }, gangTurf)); k++) await frames(page, 3);
await ev(i => { const g = window.game, t = g.uw.T[i]; g.resetPlayerState(t.hang.x + Math.sin(t.hang.h) * 5, t.hang.z + Math.cos(t.hang.h) * 5, t.hang.h + Math.PI); g.player.health = 100000; g.debug.god = true; }, gangTurf);
await frames(page, 4);
const grp = await ev(i => { const gr = window.game.uw.gangs.groups.get('hang' + i); return gr ? gr.members.length : 0; }, gangTurf);
check('a Vipers crew stands on their corner', grp >= 2, 'members ' + grp);
await ev(i => { const g = window.game, gr = g.uw.gangs.groups.get('hang' + i), m = gr.members[0]; g.uw.onPedHit(m, 'light', 5); }, gangTurf);
let attacked = false;
for (let k = 0; k < 60 && !attacked; k++) { await frames(page, 2); attacked = await ev(i => { const gr = window.game.uw.gangs.groups.get('hang' + i); return !!gr && gr.hostile && gr.members.some(m => m.target && m.target.isPlayer && (m.pendHit !== undefined || m.pose.aim > 0 || Math.hypot(m.x - window.game.player.pos.x, m.z - window.game.player.pos.z) < 2)); }, gangTurf); }
const atkInfo = await ev(i => { const g = window.game, gr = g.uw.gangs.groups.get('hang' + i), p = g.player; if (!gr) return { group: false }; return { hostile: gr.hostile, att: g.uw.attitude(gr.fid), members: gr.members.map(m => ({ st: m.state, tgt: m.target ? (m.target.isPlayer ? 'player' : m.target.kind) : null, d: +Math.hypot(m.x - p.pos.x, m.z - p.pos.z).toFixed(1), hp: m.health, flee: m.fleeT > 0, aim: m.pose.aim, stag: m.stagger > 0 })) }; }, gangTurf);
check('provoked gang members come for the player', attacked, JSON.stringify(atkInfo));
const ko = await ev(i => { const g = window.game, uw = g.uw, gr = uw.gangs.groups.get('hang' + i); const before = uw.S.turfs[i].inf.vipers || 0; const m = gr.members.find(x => x.state !== 'down'); m.health = 1; g.peds.knock(m, 1, 1, 5, true, 'melee'); return { ko: m.ko, before, after: uw.S.turfs[i].inf.vipers || 0, drops: uw.pickups.list.length, rel: uw.S.factions.vipers.rel }; }, gangTurf);
check('knocking out a gang member weakens their hold', ko.ko && ko.after < ko.before, JSON.stringify(ko));
await ev(() => { window.game.debug.god = false; window.game.player.health = 100; });
// ---------------------------------------------------------------- 8. turf takeover
const take = await ev(i => { const g = window.game, uw = g.uw, T = uw.S.turfs[i]; for (const k in T.inf) T.inf[k] = 8; T.inf.pc = 70; T.war = null; uw.recompute(); uw.computeInfluence(); return { owner: uw.owner[i], taken: uw.S.st.turfsTaken, stage: uw.stage, infl: uw.influence }; }, gangTurf);
check('taking a turf makes it yours', take.owner === 'pc' && take.taken >= 1, JSON.stringify(take));
// ---------------------------------------------------------------- 9. the city moves without the player
const sim = await ev(() => {
  const g = window.game, uw = g.uw;
  const snap = () => ({ own: uw.owner.slice(), str: Object.fromEntries(Object.keys(uw.S.factions).map(k => [k, uw.S.factions[k].strength])), price: uw.market.price('p', 'snow'), money: Object.fromEntries(Object.keys(uw.S.factions).map(k => [k, uw.S.factions[k].money])) });
  const a = snap(); let wars = 0;
  for (let d = 0; d < 12; d++) { for (let h = 0; h < 4; h++) uw.tickHours(6, h * 6); uw.tickDay(); wars += uw.S.turfs.filter(t => t.war).length; }
  const z = snap();
  return { ownChanged: a.own.filter((o, i) => o !== z.own[i]).length, strChanged: Object.keys(a.str).filter(k => Math.abs(a.str[k] - z.str[k]) > 1).length, moneyChanged: Object.keys(a.money).filter(k => Math.abs(a.money[k] - z.money[k]) > 500).length, wars, priceMoved: Math.abs(a.price - z.price) };
});
check('rival factions earn, recruit and fight on their own', sim.strChanged >= 3 && sim.moneyChanged >= 3 && sim.wars > 0, JSON.stringify(sim));
// ---------------------------------------------------------------- 10. police raid -> supply shock -> opportunity
const shock = await ev(() => { const g = window.game, uw = g.uw; uw.S.factions.vipers.broken = 0; uw.S.factions.vipers.stock = 200; const z = 'o', before = uw.market.price(z, 'green'); uw.factions.raid('vipers', 'routine'); return { before, after: uw.market.price(z, 'green'), opp: uw.S.opps.some(o => o.kind === 'scarcity') }; });
check('a police raid makes their product scarce and pricier', shock.after > shock.before * 1.2 && shock.opp, JSON.stringify(shock));
// ---------------------------------------------------------------- 11. corruption
const cor = await ev(() => {
  const g = window.game, uw = g.uw; g.save.money += 100000; g.save.rep = 600; uw.S.taskforce = 0;
  uw.crew.refreshCandidates(true); uw.crew.hire(0); uw.computeInfluence();
  const r0 = Math.random; Math.random = () => 0.99; const a = uw.cops.approach('kerr'); Math.random = r0;
  const p0 = uw.S.pressure; const b = uw.cops.approach('moss');
  return { stage: uw.stage, a, kerr: uw.S.cops.kerr && uw.S.cops.kerr.st, b, moss: uw.S.cops.moss && uw.S.cops.moss.st, pUp: uw.S.pressure - p0, perk: uw.cops.perk('kerr') };
});
check('a dirty patrol cop can be bought', cor.kerr === 'paid' && cor.perk, JSON.stringify(cor));
check('an honest sergeant refuses and pressure rises', cor.moss === 'refused' && cor.pUp > 5, JSON.stringify(cor));
// ---------------------------------------------------------------- 11b. one continuous stretch of play across systems
// drive, reverse, get chased, get busted in the car, serve, walk out, use the map and overlay,
// pickpocket and brawl again, then audit every system for corrupted state.
await ev(() => { const g = window.game; g.police.enabled = true; g.police.clear(); const x = 2 * 80 + 2.6, z = 6 * 80 + 12; const v = g.vehicles.spawn('sedan', x, z, 0, { parked: true }); v.touched = true; window.__sv = v; g.resetPlayerState(x + 2.4, z, -Math.PI / 2); g.cam.yaw = 0; });
await frames(page, 3);
await page.keyboard.press('KeyE'); await frames(page, 35);
const drove = { inCar: await ev(() => window.game.player.state) };
await page.keyboard.down('KeyW'); await frames(page, 45); await page.keyboard.up('KeyW');
drove.fwd = await ev(() => window.game.player.vehicle ? window.game.player.vehicle.speed : 0);
await page.keyboard.down('KeyS'); await frames(page, 70); await page.keyboard.up('KeyS');
drove.rev = await ev(() => window.game.player.vehicle ? window.game.player.vehicle.localVel().z : 0);
check('session: enter, drive and reverse with real input', drove.inCar === 'vehicle' && drove.fwd > 3 && drove.rev < -0.5, JSON.stringify(drove));
await ev(() => { window.game.uw.give({ smokes: 4 }); window.game.police.setLevel(2); });
await page.keyboard.down('KeyW'); await frames(page, 30); await page.keyboard.up('KeyW');
// dispatch has a delay: wait (bounded) for the first unit
let chase = { lvl: 0, units: 0 };
for (let k = 0; k < 80 && !(chase.units > 0); k++) { await frames(page, 4); chase = await ev(() => ({ lvl: window.game.police.level, units: window.game.police.units.length + window.game.police.cops.length })); }
check('session: a pursuit starts', chase.lvl >= 1 && chase.units > 0, JSON.stringify(chase));
await ev(() => window.game.onBusted());
await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000 });
const jailed = await ev(() => ({ inv: Object.keys(window.game.uw.S.inv).length, interior: window.game.player.interior && window.game.player.interior.id, veh: window.game.player.vehicle }));
check('session: busted in the car -> jail, product confiscated', jailed.interior === 'prison' && jailed.inv === 0 && !jailed.veh, JSON.stringify(jailed));
await ev(() => { const j = window.game.uw.S.jail; j.total = j.served + 2; });
await page.waitForFunction(() => !window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 180000 });
await frames(page, 6);
await page.keyboard.press('KeyM'); await frames(page, 3);
await page.keyboard.press('KeyT'); await frames(page, 2); await page.keyboard.press('KeyT'); await frames(page, 2);
await ev(() => window.game.uw.ui.mapClick(4 * 80 + 40, 4 * 80 + 40));
await page.keyboard.press('KeyM'); await frames(page, 3);
check('session: map + overlay after release', await ev(() => !window.game.mapOpen && window.game.uw.mapOverlay !== undefined));
// pickpocket + brawl after release
await ev(() => { const g = window.game, p = g.player; const c = g.peds.make('civ'); c.x = p.pos.x + Math.sin(p.h) * 0.9; c.z = p.pos.z + Math.cos(p.h) * 0.9; c.y = p.pos.y; c.h = p.h; c.state = 'idle'; c.timer = 99; c.keep = true; g.peds.peds.push(c); window.__m2 = c; });
await frames(page, 2);
const pp = await ev(() => { const a = window.game.uw.findAction(); return a && a.label; });
await page.mouse.down(); await frames(page, 1); await page.mouse.up(); await frames(page, 14);
const hitM = await ev(() => window.__m2.health < 100 || window.__m2.state === 'down' || window.__m2.state === 'flee');
check('session: street interactions still work after release (prompt + punch)', pp === 'Pickpocket' && hitM, `${pp} ${hitM}`);
await ev(() => window.game.police.clear('session'));
await frames(page, 10);
const audit = await ev(() => {
  const g = window.game, p = g.player, uw = g.uw, bad = [];
  if (![p.pos.x, p.pos.y, p.pos.z, p.vel.x, p.vel.z, p.h, p.health, g.cam.yaw, g.cam.pitch].every(Number.isFinite)) bad.push('player/cam NaN');
  for (const v of g.vehicles.list) if (![v.pos.x, v.pos.y, v.pos.z, v.vel.x, v.h, v.health].every(Number.isFinite)) { bad.push('veh NaN'); break; }
  for (const q of g.peds.peds) if (![q.x, q.y, q.z, q.health].every(Number.isFinite)) { bad.push('ped NaN'); break; }
  if (!Number.isFinite(g.save.money) || g.save.money < 0) bad.push('money ' + g.save.money);
  for (const t of uw.S.turfs) for (const k in t.inf) if (!Number.isFinite(t.inf[k]) || t.inf[k] < 0) bad.push('inf');
  for (const z in uw.S.market) for (const k in uw.S.market[z]) if (!uw.S.market[z][k].every(Number.isFinite)) bad.push('market');
  for (const id in uw.S.factions) { const F = uw.S.factions[id]; if (!Number.isFinite(F.strength) || !Number.isFinite(F.money) || !Number.isFinite(F.rel)) bad.push('faction ' + id); }
  for (const c of uw.S.crew) if (![c.loyalty, c.fear, c.pay].every(Number.isFinite)) bad.push('crew');
  if (!Number.isFinite(uw.S.pressure)) bad.push('pressure');
  if (uw.owner.length !== 36) bad.push('owner len');
  if ((p.pose.surrender || 0) > 0 || p.blocking || p.knockT > 0 || g.mapOpen || g.ui.modal || g.police.bust) bad.push('stale player/ui');
  if (g.input.down.size) bad.push('stuck keys');
  // the save must be plain data: no NaN / Infinity and no live objects (vehicles, meshes, vectors)
  const scan = (o, path, d) => {
    if (d > 14 || !o || typeof o !== 'object' || bad.length > 8) return;
    for (const k in o) {
      const v = o[k];
      if (typeof v === 'number' && !Number.isFinite(v)) bad.push('save NaN ' + path + '.' + k);
      else if (v && typeof v === 'object') {
        const pr = Object.getPrototypeOf(v);
        if (!Array.isArray(v) && pr !== Object.prototype && pr !== null) { bad.push('save holds a live ' + ((v.constructor && v.constructor.name) || 'object') + ' at ' + path + '.' + k); continue; }
        scan(v, path + '.' + k, d + 1);
      }
    }
  };
  scan(g.save, 'save', 0);
  try { JSON.stringify(g.save); } catch (e) { bad.push('save does not serialise: ' + e.message); }
  return bad;
});
check('session: no corrupted state anywhere after the stretch of play', audit.length === 0, audit.join(', '));
// rare-car opportunity: its car spawns next to the player and a save must still work
const rare = await ev(() => {
  const g = window.game, uw = g.uw, p = g.player, now = uw.opps.absHour();
  const o = { id: 'rt' + Date.now(), kind: 'rarecar', title: 'test', text: 'test', type: 'supercar', x: p.pos.x + 12, z: p.pos.z, h: 0, until: now + 5 };
  uw.S.opps.push(o); return o.id;
});
await frames(page, 6);
const rareSave = await ev(id => { const g = window.game; const car = g.uw.opps.cars.get(id); const ok = g.saveGame(true); const raw = localStorage.getItem('pvunderworld.save.v1') || ''; const o = JSON.parse(raw).uw.opps.find(x => x.id === id); return { spawned: !!car, ok, err: window.__pv.SaveSystem.lastError, carInSave: !!(o && o.car), size: raw.length }; }, rare);
check('a save works while a rare-car opportunity has its car on the street', rareSave.spawned && rareSave.ok && !rareSave.carInSave && rareSave.size < 1.5e6, JSON.stringify(rareSave));
// ---------------------------------------------------------------- 12. save + reload
const before = await ev(() => { const g = window.game, uw = g.uw; g.police.enabled = true; g.resetPlayerState(5 * 80 + 40, 5 * 80, 0); const ok = g.saveGame(true); return { ok, money: g.save.money, crew: uw.S.crew.length, own: uw.owner.filter(o => o === 'pc').length, flop: uw.props.owned('flop'), kerr: uw.S.cops.kerr && uw.S.cops.kerr.st, day: uw.S.day }; });
await page.reload();
await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await page.evaluate(() => window.game.quality.setMode(0));
await page.click('#btnContinue');
await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
await frames(page, 5);
const after = await ev(() => { const g = window.game, uw = g.uw; return { money: g.save.money, crew: uw.S.crew.length, own: uw.owner.filter(o => o === 'pc').length, flop: uw.props.owned('flop'), kerr: uw.S.cops.kerr && uw.S.cops.kerr.st, day: uw.S.day, pos: [Math.round(g.player.pos.x), Math.round(g.player.pos.z)] }; });
check('everything persists through save + reload', before.ok && after.money === before.money && after.crew === before.crew && after.own === before.own && after.flop && after.kerr === 'paid' && after.day === before.day, JSON.stringify([before, after]));
check('continue puts you where you saved', Math.abs(after.pos[0] - (5 * 80 + 40)) < 3 && Math.abs(after.pos[1] - 5 * 80) < 3, JSON.stringify(after.pos));
// ---------------------------------------------------------------- 13. a corrupted save never breaks the game
await ev(() => {
  const raw = JSON.parse(localStorage.getItem('pvunderworld.save.v1'));
  raw.money = 'lots'; raw.uw.turfs = 'garbage'; raw.uw.crew[0].loyalty = 'x'; raw.uw.crew.push(null); raw.uw.props.nope = { owned: true };
  raw.uw.market.o.snow = [NaN, null]; raw.uw.factions.vipers.strength = Infinity; raw.uw.jail = { total: 'forever' }; raw.garage.push({ type: 'spaceship' }); raw.pos = { x: NaN };
  localStorage.setItem('pvunderworld.save.v1', JSON.stringify(raw));
});
await page.reload();
await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await page.evaluate(() => window.game.quality.setMode(0));
await page.click('#btnContinue');
await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
await frames(page, 30);
const rec = await ev(() => { const g = window.game, uw = g.uw; return { money: g.save.money, turfs: uw.S.turfs.length, crew0: uw.S.crew[0] && uw.S.crew[0].loyalty, crewN: uw.S.crew.length, nope: !!uw.S.props.nope, snow: uw.S.market.o.snow, vipers: uw.S.factions.vipers.strength, jail: uw.S.jail, garage: g.save.garage.length, flop: uw.props.owned('flop') }; });
check('corrupted fields are repaired, the rest of the save survives', typeof rec.money === 'number' && rec.turfs === 36 && typeof rec.crew0 === 'number' && rec.crewN >= 1 && !rec.nope && rec.snow.every(v => Number.isFinite(v) && v > 0.2 && v < 5) && isFinite(rec.vipers) && rec.jail === null && rec.flop, JSON.stringify(rec));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'session');
