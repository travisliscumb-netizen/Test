/* Gang aggression cooldown (v7). The long-term relationship (f.rel) and short-term aggression (f.aggro) are separate:
   - only hostile acts raise aggression; a minor scuffle cools in seconds, a massacre or a downed boss takes minutes,
     and repeat trouble raises it faster; cooling never repairs the relationship
   - aggression does not cool while one of their people can see you
   - gangs only know where you are from a sighting: no sighting, no squad; a squad drives to where you were last
     seen, locks on only when it spots you, and gives up and drives off when you are not there
   - a hostile group that has lost you stands down (later when aggression is high)
   - recognition takes a real look: an enemy on its own turf picks you out on foot, close, after a moment; a faction
     that is actively after you knows your face anywhere, even slowing past in a car
   - aggression survives a save and reload; a night's sleep clears it, not the grudge */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const t = await open(b, {});
const page = t.page;
const ev = (f, a) => page.evaluate(f, a);
await startNew(page);
await ev(() => { const g = window.game; g.quality.setMode(0); g.events.cool = 1e9; g.police.enabled = false; g.traffic.enabled = false; g.save.money = 1e6; if (g.tutorial) g.tutorial.off = true; });

// a faction that holds a turf, and a spot near its hangout with a clear view of it
const setup = await ev(() => {
  const g = window.game, uw = g.uw, S = uw.S, grid = g.world.grid;
  for (let i = 0; i < uw.T.length; i++) {
    const fid = uw.owner[i]; if (!fid || fid === 'pc' || !window.__pv.FACTIONS[fid] || S.factions[fid].broken) continue;
    const h = uw.T[i].hang;
    for (let a = 0; a < 16; a++) {
      const ang = a / 16 * Math.PI * 2, spots = [8, 15, 6].map(r => ({ x: h.x + Math.sin(ang) * r, z: h.z + Math.cos(ang) * r }));
      if (spots.every(sp => grid.lineOfSight(h.x, 1.5, h.z, sp.x, 1.4, sp.z)) && spots.every(sp => uw.owner[window.__pv.turfAt(sp.x, sp.z)] === fid))
        return { i, fid, h: { x: h.x, z: h.z, h: h.h }, at8: spots[0], at15: spots[1], at6: spots[2] };
    }
  }
  return null;
});
check('test setup: a faction turf with a clear view around its hangout', !!setup, JSON.stringify(setup));
const G = (f, a) => ev(f, a);

// ---------------------------------------------------------------- 1. aggression: rises with hostile acts, cools when unseen
const cool = await G(fid => {
  const g = window.game, uw = g.uw, gm = uw.gangs, f = uw.S.factions[fid], A = window.__pv.GANG_AGGRO, out = {};
  const reset = () => { f.aggro = 0; f.trouble = 0; gm.seen = {}; };
  const unseen = () => { if (gm.seen[fid]) gm.seen[fid].t = g.time - 10; };
  const secsTo = (lvl) => { let s = 0; unseen(); while (f.aggro > lvl && s < 3600) { gm.coolDown(0.1); s += 0.1; } return Math.round(s * 10) / 10; };
  f.rel = -80; reset();
  // minor: one punch
  gm.provoke(fid, A.hit, g.player.pos.x, g.player.pos.z); out.minor = f.aggro; out.minorCool = secsTo(0);
  // serious: their boss down and three soldiers knocked out
  reset(); for (const [k] of [[A.bossKo], [A.ko], [A.ko], [A.ko]]) gm.provoke(fid, k, 0, 0); out.serious = f.aggro;
  out.seriousToCalm = secsTo(A.squad); out.seriousCool = out.seriousToCalm + secsTo(0);
  // repeat trouble: the same knock-out lands harder after a run of incidents
  reset(); gm.provoke(fid, A.ko, 0, 0); out.koFresh = f.aggro;
  reset(); for (let k = 0; k < 5; k++) gm.provoke(fid, A.hit, 0, 0); const before = f.aggro; gm.provoke(fid, A.ko, 0, 0); out.koRepeat = f.aggro - before;
  // a new hostile act while cooling resets it upward
  const mid = f.aggro; gm.provoke(fid, A.hit, 0, 0); out.reup = f.aggro > mid;
  // while they can see you it does not cool
  gm.sighting(fid); const held = f.aggro; gm.coolDown(5); out.held = f.aggro === held;
  // cooling never repairs the relationship
  out.rel = f.rel;
  reset();
  return out;
}, setup.fid);
check('a single punch: a little aggression that cools in seconds', cool.minor > 3 && cool.minor < 8 && cool.minorCool > 5 && cool.minorCool < 30, JSON.stringify(cool));
check('their boss down and three of theirs knocked out: they stay after you for minutes', cool.serious > 80 && cool.seriousToCalm > 120 && cool.seriousCool > 200 && cool.seriousCool > cool.minorCool * 10, JSON.stringify(cool));
check('repeat trouble makes the same knock-out count for more', cool.koRepeat > cool.koFresh * 1.4, `${cool.koFresh.toFixed(1)} → ${cool.koRepeat.toFixed(1)}`);
check('another hostile act while cooling pushes it back up; no cooling while they can see you', cool.reup && cool.held, JSON.stringify(cool));
check('cooling off never repairs the relationship (rel unchanged at −80)', cool.rel === -80, String(cool.rel));

// ---------------------------------------------------------------- 2. no omniscience: squads need a sighting and go where you were seen
const sq = await G(fid => {
  const g = window.game, uw = g.uw, gm = uw.gangs, f = uw.S.factions[fid], out = {}, p = g.player;
  const squads = () => [...gm.groups.values()].filter(gr => gr.kind === 'squad');
  for (const gr of squads()) gm.removeGroup(gr);
  f.rel = -80; f.aggro = 80; f.trouble = 0; f.truce = 0; gm.seen = {};
  gm.sendSquad(fid, 'hit'); out.noSighting = squads().length;
  // seen here, then gone across town
  const x0 = p.pos.x, z0 = p.pos.z; gm.sighting(fid, x0, z0);
  g.resetPlayerState(x0 + 260, z0 + 40, 0);
  gm.sendSquad(fid, 'hit');
  const gr = squads()[0]; out.sent = !!gr;
  if (gr) {
    const v = gr.car, tg = v.drive.target();
    out.goesToSeen = Math.hypot(tg.x - x0, tg.z - z0) < 0.01; out.notToPlayer = Math.hypot(tg.x - p.pos.x, tg.z - p.pos.z) > 200;
    out.spawnFromSeen = Math.round(Math.hypot(v.pos.x - x0, v.pos.z - z0));
    // they reach the spot and you are not there: a short look round, then they give up and drive off
    v.pos.set(x0, v.pos.y, z0); let s = 0;
    while (gm.groups.has(gr.key) && s < 60) { gm.updateSquads(0.5); s += 0.5; }
    out.gaveUpAfter = s; out.released = !v.uwGroup && v.mission === null && (!v.drive || v.drive.mode === 'cruise' || v.driver !== 'npc');
    if (g.vehicles.list.includes(v)) g.vehicles.despawn(v);
  }
  // a squad that does spot you locks on
  gm.sighting(fid, p.pos.x, p.pos.z); gm.sendSquad(fid, 'hit');
  const g2 = squads()[0];
  if (g2) { const v = g2.car; v.pos.set(p.pos.x + 8, v.pos.y, p.pos.z); g2.spotT = 0; gm.updateSquads(0.1); out.locked = g2.locked; const tg = v.drive && v.drive.target ? v.drive.target() : null; out.lockTarget = g2.members.length > 0 || (tg ? Math.hypot(tg.x - p.pos.x, tg.z - p.pos.z) < 0.01 : false); gm.removeGroup(g2); if (g.vehicles.list.includes(v)) g.vehicles.despawn(v); }
  // the periodic hit squads: long-term hatred alone (rel −80, aggression cold) sends nobody any more
  Object.defineProperty(uw, 'stage', { value: 3, configurable: true });
  f.aggro = 0; gm.sighting(fid); gm.hitT = 0.01; gm.updateSquads(0.1); out.coldHit = squads().length;
  // actively after you, with a fresh sighting: they come (to where you were seen)
  f.aggro = 60; gm.sighting(fid); gm.hitT = 0.01; gm.updateSquads(0.1); out.hotHit = squads().length;
  for (const gr3 of squads()) { const v = gr3.car; gm.removeGroup(gr3); if (g.vehicles.list.includes(v)) g.vehicles.despawn(v); }
  // …but not when the last sighting is old news
  f.aggro = 60; gm.seen[fid].t = g.time - 1000; gm.hitT = 0.01; gm.updateSquads(0.1); out.staleHit = squads().length;
  delete uw.stage; f.aggro = 0; gm.seen = {};
  return out;
}, setup.fid);
check('no sighting, no squad: they cannot find you without seeing you', sq.noSighting === 0, JSON.stringify(sq));
check('a squad drives to where you were last seen, not to where you are now', sq.sent && sq.goesToSeen && sq.notToPlayer && sq.spawnFromSeen >= 80 && sq.spawnFromSeen <= 200, JSON.stringify(sq));
check('finding nobody there, the squad gives up within ~20 s and drives off', sq.gaveUpAfter > 10 && sq.gaveUpAfter <= 25 && sq.released, JSON.stringify(sq));
check('a squad that spots you locks on to you (and, this close, jumps out to fight)', sq.locked && sq.lockTarget, JSON.stringify(sq));
check('hit squads: hatred alone (cold aggression) sends nobody; hot aggression + a fresh sighting does; an old sighting does not', sq.coldHit === 0 && sq.hotHit === 1 && sq.staleHit === 0, JSON.stringify(sq));

// ---------------------------------------------------------------- 3. hostile groups stand down once they lose you
const calm = await G(S0 => {
  const g = window.game, uw = g.uw, gm = uw.gangs, f = uw.S.factions[S0.fid], out = {};
  g.resetPlayerState(S0.at8.x, S0.at8.z, 0);
  const gr = gm.spawnGroup('hang' + S0.i, 'hang', S0.fid, S0.h, 3, { turf: S0.i });
  const steps = (aggro) => {
    f.aggro = aggro; gr.hostile = true; gr.lostT = 0; gm.seen = {};
    // they see you (close by): stays hostile and they keep track of you
    g.resetPlayerState(S0.at8.x, S0.at8.z, 0); for (const m of gr.members) { m.x = S0.h.x; m.z = S0.h.z; }
    gm.updateHostility(0.6); const sees = gr.hostile && gr.lostT === 0 && !!gm.seen[S0.fid];
    // you get away
    g.resetPlayerState(S0.h.x + 220, S0.h.z + 30, 0); let s = 0;
    while (gr.hostile && s < 120) { gm.updateHostility(0.6); s += 0.6; }
    return { sees, after: Math.round(s * 10) / 10 };
  };
  out.cold = steps(0); out.hot = steps(80);
  out.rel = f.rel; out.members = gr.members.length;
  f.aggro = 0;
  return out;
}, setup);
check('a hostile group keeps track of you while it can see you', calm.cold.sees && calm.hot.sees, JSON.stringify(calm));
check('once you get away a hostile group stands down (about 12 s after a minor fight)', calm.cold.after >= 11 && calm.cold.after <= 15, JSON.stringify(calm.cold));
check('…and holds out longer when they are really after you (about 30 s at high aggression)', calm.hot.after > calm.cold.after + 12 && calm.hot.after < 40, JSON.stringify(calm.hot));

// ---------------------------------------------------------------- 4. recognition in the world (real frames)
const place = (pos, inCar) => G(([S0, pos, inCar]) => {
  const g = window.game, uw = g.uw, gm = uw.gangs, gr = gm.groups.get('hang' + S0.i) || gm.spawnGroup('hang' + S0.i, 'hang', S0.fid, S0.h, 3, { turf: S0.i });
  // the previous step's car goes away (left parked, it would block the view)
  if (g.player.state === 'vehicle') { const v0 = g.player.vehicle; g.exitVehicle(true); g.vehicles.despawn(v0); }
  g.resetPlayerState(pos.x, pos.z, Math.atan2(S0.h.x - pos.x, S0.h.z - pos.z));
  if (inCar) { const v = g.vehicles.spawn('sedan', pos.x, pos.z, 0, { parked: true }); v.touched = true; v.legit = true; v.owned = true; g.completeEnter(v); v.vel.set(0, 0); }
  if (gr) { gr.hostile = false; gr.warned = 0; gr.saidFear = 0; for (const m of gr.members) { m.x = S0.h.x; m.z = S0.h.z; m.spotT = 0; m.vx = 0; m.vz = 0; m.target = null; m.state = 'free'; m.health = m.maxHealth; } }
  return !!gr;
}, [setup, pos, inCar]);
const hostileNow = () => G(S0 => { const gr = window.game.uw.gangs.groups.get('hang' + S0.i); return !!(gr && gr.hostile); }, setup);
// wait in game seconds (software rendering runs slowly; the brains run on game time)
const watch = async (secs) => { const t0 = await ev(() => window.game.time); await page.waitForFunction(([i, end]) => { const gr = window.game.uw.gangs.groups.get('hang' + i); return (gr && gr.hostile) || window.game.time > end; }, [setup.i, t0 + secs], { timeout: 240000, polling: 100 }); const t1 = await ev(() => window.game.time); return { hostile: await hostileNow(), gameSecs: Math.round((t1 - t0) * 100) / 100 }; };
await G(fid => { const f = window.game.uw.S.factions[fid]; f.rel = -80; f.aggro = 0; f.truce = 0; f.tribute = 0; window.game.uw.gangs.seen = {}; }, setup.fid);
const placed = await place(setup.at15, false); await frames(page, 5);
check('test setup: the hangout crew is there to look at you', placed, '');
const far = await watch(4);
await place(setup.at6, true); await frames(page, 5);
const carCold = await watch(4);
await place(setup.at8, false); await frames(page, 5);
const near = await watch(6);
const att = await G(fid => window.game.uw.attitude(fid), setup.fid);
check('an enemy (rel −80) on its own turf does not pick you out at 15 m (it used to at 16 m)', !far.hostile, JSON.stringify({ far, att }));
check('…nor sitting in a car beside them while they are not after you', !carCold.hostile, JSON.stringify(carCold));
check('…but does recognise you on foot at 8 m after a moment (a held 1.2 s look; part of it before the watch starts)', near.hostile && near.gameSecs >= 0.5, JSON.stringify(near));
await G(fid => { const f = window.game.uw.S.factions[fid]; f.aggro = 60; }, setup.fid);
await place(setup.at6, true); await frames(page, 3);
await G(fid => window.game.uw.gangs.sighting(fid), setup.fid);
const carHot = await watch(5);
check('a faction actively after you knows your face even in a car slowing past (6 m)', carHot.hostile, JSON.stringify(carHot));
await G(() => { const g = window.game; if (g.player.state === 'vehicle') { const v = g.player.vehicle; g.exitVehicle(true); g.vehicles.despawn(v); } });

// ---------------------------------------------------------------- 5. save/reload keeps it; a night's sleep clears it (not the grudge)
const pre = await G(fid => { const g = window.game, f = g.uw.S.factions[fid]; f.aggro = 47.5; f.trouble = 3; f.rel = -70; g.uw.gangs.seen = {}; for (const gr of [...g.uw.gangs.groups.values()]) g.uw.gangs.removeGroup(gr); g.police.level = 0; g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true); return { a: f.aggro, tr: f.trouble }; }, setup.fid);
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await ev(() => window.game.quality.setMode(0));
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
const post = await G(fid => { const f = window.game.uw.S.factions[fid]; return { a: f.aggro, tr: f.trouble, rel: f.rel }; }, setup.fid);
check('aggression survives a save and reload', Math.abs(post.a - pre.a) < 1 && Math.abs(post.tr - pre.tr) < 0.1, JSON.stringify([pre, post]));
await G(() => { const g = window.game, uw = g.uw; if (!uw.props.owned('flop')) uw.props.buy('flop'); g.police.level = 0; uw.props.sleep('flop'); });
await page.waitForFunction(() => !window.game.fading, null, { timeout: 30000 }); await frames(page, 3);
const slept = await G(fid => { const f = window.game.uw.S.factions[fid]; return { a: f.aggro, rel: f.rel }; }, setup.fid);
check('a night\'s sleep clears the aggression but not the grudge (still an enemy)', slept.a === 0 && slept.rel <= -40, JSON.stringify(slept));
const ui = await G(fid => { const g = window.game, f = g.uw.S.factions[fid]; f.aggro = 60; g.uw.ui.open('empire'); g.uw.ui.tab = 'factions'; g.uw.ui.render(); const txt = document.getElementById('empBody').textContent; f.aggro = 0; g.uw.ui.render(); const txt2 = document.getElementById('empBody').textContent; g.ui.closeAll(); return { hot: /hunting for you/.test(txt), cold: /not looking for you/.test(txt2) }; }, setup.fid);
check('the Factions screen says who is hunting for you right now', ui.hot && ui.cold, JSON.stringify(ui));

check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
await finish(b, 'gangs');
