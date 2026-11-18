/* The Southshore Fairground (owner, 2026-11-18; ISLAND.md §9).
   - The site: on the open plain between the airport and Longshore Drive (not the reclaimed Sound Flats), one level,
     dry pad; Fairground Way off Longshore Drive to the car park; the GPS finds it; on the maps; two empty, level ride
     slots kept for rides to come.
   - Six rides and the karts, each boarded at its gate while it is loading (a ticket, cash first): you ride in the seat
     the scenery draws (the onboard view from it), up where the ride goes, and step off at its gate when it stops; not
     with the police after you, not without the fare.
   - The roller coaster: a lift hill, a vertical loop (the train upside down at its top), a lap from the platform back
     to it, never faster than a real one.
   - The go-karts: a real kart you drive on the fair's track (penned in by its tyre walls), laps timed through every
     sector and the best kept, three other karts lapping; out of the kart, you hand it back at the booth.
   - The games: $5 a go, a good score wins a plush prize (never money); walking away wins nothing; the world waits
     while you play.
   - Save → reload keeps the fair's record; a save made aboard a ride puts you back at its gate. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const helpers = () => ev(() => {
  const g = window.game;
  g.events.cool = 1e9; g.police.enabled = false; g.env.time = 13;
  window.__log = []; if (!window.__hooked) { g.money.on(x => window.__log.push(x)); window.__hooked = true; }
  // advance the game's clock (the rides run on it) without simulating the whole world
  window.__advance = (sec, step = 0.25) => { for (let t = 0; t < sec; t += step) { g.time += step; if (g.player.state === 'ride') g.fair.rideStep(step); } };
});
await helpers();
const reload = async () => {
  await ev(() => { const g = window.game; g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true); });
  await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
  await ev(() => window.game.quality.setMode(0));
  await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
  await helpers();
};

// ---------------------------------------------------------------- 1. the site
const site = await ev(() => {
  const g = window.game, P = window.__pv, F = P.FAIR, I = P.Island, w = g.world, out = {};
  let lo = 1e9, hi = -1e9, wet = 0; for (let x = F.pad.x0 + 4; x < F.pad.x1; x += 12) for (let z = F.pad.z0 + 4; z < F.pad.z1; z += 12) { const y = P.groundY(x, z, F.y + 3); lo = Math.min(lo, y); hi = Math.max(hi, y); if (y < P.SEA_Y + 1) wet++; }
  out.level = [+lo.toFixed(2), +hi.toFixed(2)]; out.wet = wet;
  const R = P.SOUND_RESERVE; out.reserve = F.pad.x1 > R[0] && F.pad.x0 < R[2] && F.pad.z1 > R[1] && F.pad.z0 < R[3];
  out.zone = P.zoneKey((F.pad.x0 + F.pad.x1) / 2, (F.pad.z0 + F.pad.z1) / 2);
  // no island road through it but its own
  out.through = I.roads.filter(Rd => Rd.id !== 'fg1' && Rd.pts.some(p => P.inFair(p[0], p[1], -2))).map(Rd => Rd.name);
  out.way = !!w.links.find(L => L.name === 'Fairground Way');
  const d = w.places.fair && w.places.fair.door, from = g.uw.loc('prop', 'linden'), rt = d && P.RoadGraph.route(from.x, from.z, d.x, d.z);
  out.route = rt ? Math.round(rt.len) : null; const last = rt && rt.pts[rt.pts.length - 1]; out.ends = last ? Math.round(Math.hypot((last.x ?? last[0]) - d.x, (last.z ?? last[1]) - d.z)) : null;
  out.place = !!w.mapPlaces.find(q => q.id === 'fair');
  // the spare ride slots: level, and nothing built, laid or standing on them
  out.spare = F.spare.map(S => { let bld = 0; for (const xb of w.xblocks) { for (const q of xb.bld) if ((q.x0 + q.x1) / 2 > S[0] && (q.x0 + q.x1) / 2 < S[2] && (q.z0 + q.z1) / 2 > S[1] && (q.z0 + q.z1) / 2 < S[3]) bld++; for (const dd of xb.det) if (dd.col && dd.x > S[0] && dd.x < S[2] && dd.z > S[1] && dd.z < S[3]) bld++; } let hl = 1e9, hh = -1e9; for (let x = S[0]; x <= S[2]; x += 8) for (let z = S[1]; z <= S[3]; z += 8) { const y = P.groundY(x, z, F.y + 3); hl = Math.min(hl, y); hh = Math.max(hh, y); } return { m2: (S[2] - S[0]) * (S[3] - S[1]), bld, flat: +(hh - hl).toFixed(2) }; });
  out.rides = Object.keys(w.fair.rides); out.games = w.fair.games.map(q => q.id);
  return out;
});
check('the site: one level, dry pad on the plain by the airport (Southshore), off the reclaimed land; no other road through it', site.level[1] - site.level[0] < 0.05 && site.wet === 0 && !site.reserve && site.zone === 'e' && site.through.length === 0, JSON.stringify(site));
check('Fairground Way serves it, ending at the entrance arch with the car park beside it; the GPS routes from Linden Hills to the Fair Office; it is on the map', site.way && site.route > 1000 && site.ends < 30 && site.place, JSON.stringify(site));
check('six rides and the go-karts, four carnival games, and three empty, level slots (10,000 m² and more each) kept for more rides', site.rides.length === 6 && ['wheel', 'coaster', 'ship', 'carousel', 'drop', 'kart'].every(r => site.rides.includes(r)) && site.games.length === 4 && site.spare.length === 3 && site.spare.every(s => s.bld === 0 && s.flat < 0.05 && s.m2 > 9900), JSON.stringify(site));

// ---------------------------------------------------------------- 2. the coaster's track and run
const co = await ev(() => {
  const P = window.__pv, C = P.fairCoaster(), Y = P.FAIR.y, out = {};
  out.len = Math.round(C.len); out.top = +(C.ymax - Y).toFixed(1); out.run = Math.round(C.runT);
  out.vmax = +Math.max(...C.motion.map(m => m.v)).toFixed(1); out.end = +(C.motion[C.motion.length - 1].s - C.s0 - C.len).toFixed(2);
  out.inverted = C.U.some(u => u.y < -0.8); out.lowest = +Math.min(...C.pts.map(p => p.y - Y)).toFixed(2);
  // the seam: the frame carries on smoothly round the lap (no flip where the curve closes)
  out.seam = +C.U[0].angleTo(C.U[C.n - 1]).toFixed(3);
  // never into the ground, never through itself (any two samples 30 m apart along the track stay 2 m apart)
  let close = 0; for (let i = 0; i < C.n; i += 4) for (let j = i + 60; j < C.n - 60 + i && j < C.n; j += 4) if (C.pts[i].distanceTo(C.pts[j]) < 2) close++;
  out.close = close;
  return out;
});
check('the Riptide: a lift hill over 30 m, a vertical loop (upside down at its top), 700 m+ of track, never under the pad', co.top > 30 && co.inverted && co.len > 700 && co.lowest > 1 && co.close === 0 && co.seam < 0.2, JSON.stringify(co));
check('…a lap from the platform back to it, stopping exactly there, under 2½ minutes, never faster than 30 m/s', co.end === 0 && co.run < 150 && co.vmax > 18 && co.vmax < 30, JSON.stringify(co));

// ---------------------------------------------------------------- 3. riding each ride
const rides = await ev(() => {
  const g = window.game, P = window.__pv, F = g.world.fair, out = {};
  g.money.W.dirty.me = 500; g.money.W.clean = 0;
  for (const id of ['wheel', 'coaster', 'ship', 'carousel', 'drop']) {
    const R = F.rides[id], o = out[id] = {};
    // wait for the boarding (run the clock on to the next loading window)
    for (let k = 0; k < 600 && !g.fair.status(id).open; k++) g.time += 0.5;
    g.resetPlayerState(R.at.x, R.at.z, R.at.h); g.update(0.05, 0.05);
    const a = g.fair.findAction(); o.label = a && a.label;
    const c0 = g.money.total(); window.__log = []; if (a) a.act();
    o.state = g.player.state; o.paid = Math.round(c0 - g.money.total()); o.src = window.__log.filter(x => x.d < 0).map(x => x.cur + ':' + x.src).join();
    // the onboard view: the camera at the seat's eye
    g.cam.update(0.016); const seat = P.fairSeat(id, g.time, g.fair.ride ? g.fair.ride.k : 0, {});
    o.eye = +g.camera.position.distanceTo(seat.p).toFixed(2);
    let top = -1e9, y0 = g.player.pos.y, steps = 0;
    while (g.player.state === 'ride' && steps < 1200) { window.__advance(0.5); top = Math.max(top, g.player.pos.y); steps++; }
    o.rise = +(top - y0).toFixed(1); o.secs = steps * 0.5; o.after = g.player.state;
    o.atGate = +Math.hypot(g.player.pos.x - R.exit.x, g.player.pos.z - R.exit.z).toFixed(2);
    o.count = g.save.fair.rides[id];
  }
  return out;
});
const R = rides;
check('every ride boards at its gate for its fare (cash first: fairTicket) and seats you (the ride state)', Object.entries(R).every(([id, o]) => /^Ride /.test(o.label || '') && o.state === 'ride' && o.paid === { wheel: 10, coaster: 20, ship: 10, carousel: 5, drop: 15 }[id] && o.src === 'dirty:fairTicket' && o.count === 1), JSON.stringify(R));
check('…the onboard view is from the seat (the camera within a metre of it)', Object.values(R).every(o => o.eye < 1), JSON.stringify(Object.fromEntries(Object.entries(R).map(([k, o]) => [k, o.eye]))));
check('…it takes you where the ride goes (the wheel and the tower 35 m+ up, the coaster 28 m+, the ship 8 m+), then off at its gate', R.wheel.rise > 35 && R.drop.rise > 35 && R.coaster.rise > 28 && R.ship.rise > 8 && Object.values(R).every(o => o.after === 'foot' && o.atGate < 1), JSON.stringify(R));
check('…for as long as a ride lasts (the wheel one turn, a minute; the coaster under two and a half)', R.wheel.secs >= 60 && R.wheel.secs <= 70 && R.coaster.secs > 60 && R.coaster.secs < 150 && R.carousel.secs >= 50 && R.drop.secs > 30, JSON.stringify(Object.fromEntries(Object.entries(R).map(([k, o]) => [k, o.secs]))));
const refuse = await ev(() => {
  const g = window.game, F = g.world.fair, R = F.rides.wheel, out = {};
  g.resetPlayerState(R.at.x, R.at.z, R.at.h);
  g.money.W.dirty.me = 0; g.money.W.clean = 0; out.broke = g.fair.board('wheel'); out.s1 = g.player.state;
  g.money.W.dirty.me = 100; g.police.level = 2; out.wanted = g.fair.board('wheel'); out.s2 = g.player.state; g.police.level = 0;
  // a ride that is running: no boarding until it loads again
  const id = 'drop'; for (let k = 0; k < 400 && g.fair.status(id).open; k++) g.time += 0.5; const D = F.rides[id]; g.resetPlayerState(D.at.x, D.at.z, D.at.h); g.update(0.05, 0.05);
  const a = g.fair.findAction(); out.running = a && a.label; out.closed = g.fair.board(id); out.s3 = g.player.state;
  return out;
});
check('…not without the fare, not with the police after you, not while it is running (it says when it boards next)', refuse.broke === 'money' && refuse.wanted === 'wanted' && refuse.closed === 'closed' && /boarding in \d+ s/.test(refuse.running || '') && [refuse.s1, refuse.s2, refuse.s3].every(s => s === 'foot'), JSON.stringify(refuse));

// ---------------------------------------------------------------- 4. the go-karts
const kart = await ev(() => {
  const g = window.game, P = window.__pv, F = g.world.fair, K = F.rides.kart, out = {};
  g.money.W.dirty.me = 200; g.resetPlayerState(K.at.x, K.at.z, K.at.h); g.update(0.05, 0.05);
  const a = g.fair.findAction(); out.label = a && a.label; window.__log = []; if (a) a.act();
  const v = g.player.vehicle; out.inKart = g.player.state === 'vehicle' && v && v.type === 'kart'; out.paid = window.__log.filter(x => x.d < 0).map(x => x.src + ':' + Math.round(-x.d)).join();
  out.onTrack = v ? Math.min(...F.kart.pts.map(p => Math.hypot(p[0] - v.pos.x, p[1] - v.pos.z))) : null;
  out.crime = g.police.heat;
  // a lap: the kart carried round the line (the timing reads where it is), every sector passed in order
  const T = F.kart, n = T.pts.length, k0 = T.sf.k;
  for (let j = -6; j <= n + 8; j++) { const p = T.pts[((k0 + j) % n + n) % n]; v.pos.x = p[0]; v.pos.z = p[1]; g.fair.kartStep(0.06); }
  for (let j = 9; j <= n + 8; j++) { const p = T.pts[(k0 + j) % n]; v.pos.x = p[0]; v.pos.z = p[1]; g.fair.kartStep(0.055); }
  out.laps = g.fair.kart && g.fair.kart.laps; out.best = g.save.fair.kartBest;
  // a short cut across the infield does not count
  const lapsBefore = g.fair.kart.laps; v.pos.x = T.pts[(k0 - 5 + n) % n][0]; v.pos.z = T.pts[(k0 - 5 + n) % n][1]; g.fair.kartStep(0.05); v.pos.x = T.sf.x + 3; g.fair.kartStep(0.05); out.cut = g.fair.kart.laps - lapsBefore;
  // the tyre walls hold it: flat out at the outside wall of the first straight
  v.pos.set(T.pts[k0][0], v.pos.y, T.pts[k0][1]); v.h = 0; v.vel.set(0, 18); g.player.vehicle.ctl.throttle = 1;
  for (let k = 0; k < 80; k++) { v.ctl.throttle = 1; v.ctl.steer = 0; g.vehicles.update(0.05); }
  out.held = +Math.min(...T.pts.map(p => Math.hypot(p[0] - v.pos.x, p[1] - v.pos.z))).toFixed(1);
  // the other karts lap on their own
  out.ai = g.fair.ai.length; const p0 = g.fair.ai.map(q => [q.pos.x, q.pos.z]);
  for (let k = 0; k < 300; k++) g.update(0.05, 0.05);
  out.aiMoved = g.fair.ai.map((q, i) => Math.round(Math.hypot(q.pos.x - p0[i][0], q.pos.z - p0[i][1])));
  out.aiOn = g.fair.ai.map(q => +Math.min(...T.pts.map(p => Math.hypot(p[0] - q.pos.x, p[1] - q.pos.z))).toFixed(1));
  // out of the kart: handed back at the booth
  g.exitVehicle(true); g.update(0.05, 0.05);
  out.after = g.player.state; out.gate = +Math.hypot(g.player.pos.x - K.exit.x, g.player.pos.z - K.exit.z).toFixed(1); out.gone = !g.vehicles.list.includes(v); out.session = !!g.fair.kart;
  return out;
});
check('the go-karts: rented at the booth for $25, you are in a real kart on the fair’s track (no crime: it is a rental)', /Go-karts/.test(kart.label || '') && kart.inKart && kart.paid === 'fairTicket:25' && kart.onTrack < 3 && kart.crime === 0, JSON.stringify(kart));
check('…a lap through every sector is timed and the best kept; a cut across the infield is not a lap', kart.laps >= 1 && kart.best && kart.best.t > 5 && kart.cut === 0, JSON.stringify(kart));
check('…the tyre walls keep a kart on the track, flat out into them', kart.held < 6.5, JSON.stringify(kart));
check('…three other karts lap the track on their own', kart.ai === 3 && kart.aiMoved.every(d => d > 40) && kart.aiOn.every(d => d < 6), JSON.stringify(kart));
check('…out of the kart, you hand it back at the booth', kart.after === 'foot' && kart.gate < 1.5 && kart.gone && !kart.session, JSON.stringify(kart));

// ---------------------------------------------------------------- 5. the games
const games = await ev(() => {
  const g = window.game, P = window.__pv, F = g.world.fair, out = {};
  g.money.W.dirty.me = 100;
  for (const G of F.games) {
    const o = out[G.id] = {};
    g.resetPlayerState(G.x, G.z, G.h); g.update(0.05, 0.05);
    const a = g.fair.findAction(); o.label = a && a.label; const p0 = g.save.fair.prizes.slice(); window.__log = []; if (a) a.act();
    o.paid = window.__log.filter(x => x.d < 0).map(x => x.src + ':' + Math.round(-x.d)).join(); o.ui = !!document.getElementById('fairGame');
    // the world waits while you play: Game.tick hands the frame to the game
    const t0 = g.time; g.tick && g.tick(performance.now() + 50); o.paused = g.time === t0;
    // a top score
    const GM = g.fair.game; GM.score = P.FAIR_GAMES[G.id].tiers[2]; GM.end(); for (let k = 0; k < 40 && g.fair.game; k++) GM.frame(0.05);
    o.prize = g.save.fair.prizes.map((n, i) => n - p0[i]); o.closed = !document.getElementById('fairGame') && !g.fair.game;
    o.money = window.__log.filter(x => x.d > 0).length;
  }
  // walking away: nothing
  const G = F.games[0]; g.resetPlayerState(G.x, G.z, G.h); const p1 = g.save.fair.prizes.slice(); g.fair.play(G.id); g.fair.game.score = 99; g.fair.game.finish(true); out.walk = g.save.fair.prizes.map((n, i) => n - p1[i]);
  return out;
});
const GM = Object.entries(games).filter(([k]) => k !== 'walk');
check('four carnival games at the midway booths, $5 a go (fairGame), each on its own screen', GM.length === 4 && GM.every(([, o]) => /a go/.test(o.label || '') && o.paid === 'fairGame:5' && o.ui), JSON.stringify(games));
check('…the world waits while you play; a top score wins the giant plush (a prize, never money); walking away wins nothing', GM.every(([, o]) => o.paused && o.prize[2] === 1 && o.closed && o.money === 0) && games.walk.every(n => n === 0), JSON.stringify(games));
// each game's own rules really score: the high striker rings the bell at the top, misses at the bottom; whack-a-mole whacks
const rules = await ev(() => {
  const g = window.game, out = {};
  g.money.W.dirty.me = 100;
  g.fair.play('striker'); const S = g.fair.game; S.t = Math.PI / 2 / 2.2; S.act = true; S.step(0.001); out.top = S.res[0];
  S.puck = 0; S.puckV = 0; S.t = 0.0001; S.act = true; S.step(0.0001); out.bottom = S.res[1]; S.finish(true);
  g.fair.play('moles'); const M = g.fair.game; M.holes[4].up = 0.5; M.keys.push(5); M.step(0.01); out.whack = M.score; M.finish(true);
  g.fair.play('gallery'); const D = g.fair.game, d = D.ducks[0]; D.ptr.x = d.x; D.ptr.y = 0.28 + d.r * 0.2; D.act = true; D.step(0.001); out.duck = D.score; out.shots = D.shots; D.finish(true);
  return out;
});
check('…and the games really score (the striker’s bell at the top of the swing, a mole whacked, a duck hit)', rules.top >= 97 && rules.bottom < 20 && rules.whack === 1 && rules.duck === 1 && rules.shots === 11, JSON.stringify(rules));

// ---------------------------------------------------------------- 6. save → reload
await ev(() => { const g = window.game, F = g.world.fair; for (let k = 0; k < 600 && !g.fair.status('carousel').open; k++) g.time += 0.5; const R = F.rides.carousel; g.resetPlayerState(R.at.x, R.at.z, R.at.h); g.money.W.dirty.me = 50; g.fair.board('carousel'); window.__advance(10); window.__mid = { state: g.player.state, prizes: g.save.fair.prizes.slice(), best: g.save.fair.kartBest }; });
const mid = await ev(() => window.__mid);
await reload();
const after = await ev(() => { const g = window.game, R = g.world.fair.rides.carousel; return { state: g.player.state, gate: +Math.hypot(g.player.pos.x - R.exit.x, g.player.pos.z - R.exit.z).toFixed(1), prizes: g.save.fair.prizes, best: g.save.fair.kartBest, rides: g.save.fair.rides }; });
check('save → reload: the fair’s record kept (prizes, the best lap, the rides taken); saved aboard a ride, you are back at its gate', mid.state === 'ride' && after.state === 'foot' && after.gate < 3 && JSON.stringify(after.prizes) === JSON.stringify(mid.prizes) && after.best && after.best.t === mid.best.t && after.rides.carousel >= 2, JSON.stringify({ mid, after }));
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await finish(b, 'fair');
