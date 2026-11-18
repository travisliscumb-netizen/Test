/* Southshore Raceway (129b, 509c; owner 2026-11-18): the island's second circuit, on the open plain between Marsh
   Hollow and the airport.
   - The site: a 1.4–1.8 km loop whose corners fit their straights, on level ground (one level for the whole circuit),
     dry, clear of every other road (Longshore Drive runs past on the diagonal) and of every other site's buildings;
     the armco keeps off the track.
   - Raceway Road leaves Heron Loop and ends at the paddock: the GPS routes there from the city.
   - The Race Office: its three official events (Clean Bank, class rules, a buy-in, prize money), timed sessions;
     the raceway is a property (no Rank gate) whose nine pit garages hold eighteen cars; the owner races free.
   - An AI car laps it at speed on its racing line and stays on the track; a session times a lap through every
     sector and keeps the record through a reload. The maps show it. */
import { launch, open, check, startNew, finish, frames } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const helpers = () => ev(() => {
  const g = window.game;
  g.events.cool = 1e9; g.debug.god = true; g.police.enabled = false; g.env.time = 13;
  window.__step = (n, follow) => { for (let k = 0; k < n; k++) { g.update(0.05, 0.05); if (follow && k % 10 === 0 && g.vehicles.list.includes(follow)) g.resetPlayerState(follow.pos.x - Math.sin(follow.h) * 8, follow.pos.z - Math.cos(follow.h) * 8, 0); } };
  window.__car = (type, x, z, h = 0) => { const g2 = window.game, e = g2.content.addToGarage(type, 'bought', undefined, true); if (!e) return null; e.prov = { dirty: 0, clean: 1000 }; if (g2.player.state === 'vehicle') g2.exitVehicle(true); const v = g2.vreg.spawnFor(e, { x, z, h, y: window.__pv.SR.y }); v.display = false; e.out = true; e.loc = { x, z, h, y: v.pos.y }; g2.resetPlayerState(x + 2.5, z, 0); g2.completeEnter(v); return e; };
  window.__log = []; if (!window.__hooked) { g.money.on(x => window.__log.push(x)); window.__hooked = true; }
});
await helpers();

// ---------------------------------------------------------------- 1. the site and the circuit
const site = await ev(() => {
  const g = window.game, w = g.world, P = window.__pv, SR = P.SR, T = w.sr.track, I = P.Island, out = {};
  out.len = Math.round(T.len); out.fits = T.corners.length === SR.verts.length && P.srTrackLine().fits;
  out.minR = Math.min(...SR.verts.map(v => v[2]));
  // one level under the whole circuit, and dry
  let lo = 1e9, hi = -1e9, wet = 0;
  for (let k = 0; k < T.pts.length; k += 2) { const [x, z] = T.pts[k]; for (const o of [-6, 0, 6]) { const y = P.groundY(x + T.nl[k][0] * o, z + T.nl[k][1] * o); lo = Math.min(lo, y); hi = Math.max(hi, y); if (y < P.SEA_Y + 0.5) wet++; } }
  out.level = [+lo.toFixed(2), +hi.toFixed(2)]; out.wet = wet;
  // clear of every other road (centreline to the road's edge)
  const segD = (x, z, a, c) => { const dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz || 1; let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
  let road = { d: 1e9, name: '' };
  for (const R of I.roads) { if (R.name === 'Raceway Road') continue; for (let j = 0; j < R.pts.length - 1; j += 2) { const a = R.pts[j], c = R.pts[Math.min(R.pts.length - 1, j + 2)]; if (Math.hypot(a[0] + 620, a[1] - 2100) > 900) continue; for (let k = 0; k < T.pts.length; k += 4) { const d = segD(T.pts[k][0], T.pts[k][1], a, c) - R.w / 2; if (d < road.d) road = { d: Math.round(d), name: R.name }; } } }
  out.road = road;
  // no other site's building on it
  out.foreign = w.xblocks.filter(xb => !/^sr_/.test(xb.xb || '')).flatMap(xb => xb.bld.filter(q => P.inRaceway((q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2, 10)).map(() => xb.xb || xb.name)).slice(0, 5);
  // the armco keeps off the track
  let worst = 1e9; for (const line of w.sr.barriers) for (let k = 0; k < line.length; k++) if (line[k]) worst = Math.min(worst, Math.hypot(line[k][0] - T.pts[k][0], line[k][1] - T.pts[k][1]));
  out.worst = +worst.toFixed(1);
  out.bays = w.sr.bays.length; out.place = !!w.places.raceway; out.map = w.mapPlaces.some(p => p.id === 'raceway');
  return out;
});
check('the circuit: 1.4–1.8 km, every corner’s tangents fit its straights, no corner under 25 m', site.len > 1400 && site.len < 1800 && site.fits && site.minR >= 25, JSON.stringify(site));
check('on one level of dry ground (the levelled site), the armco at least 7.5 m from the centreline', site.level[1] - site.level[0] < 0.15 && site.wet === 0 && site.worst >= 7.5, JSON.stringify({ level: site.level, wet: site.wet, worst: site.worst }));
check('clear of every other road (Longshore Drive passes 30 m+ away) and of every other site’s buildings', site.road.d >= 30 && site.foreign.length === 0, JSON.stringify({ road: site.road, foreign: site.foreign }));

// ---------------------------------------------------------------- 2. getting there: Raceway Road, the GPS
const there = await ev(() => {
  const g = window.game, w = g.world, P = window.__pv, d = w.places.raceway.door, out = {};
  out.road = w.links.some(L => L.name === 'Raceway Road' && L.ends.every(Boolean));
  const from = g.uw.loc('prop', 'linden'), rt = P.RoadGraph.route(from.x, from.z, d.x, d.z);
  out.route = rt ? { len: Math.round(rt.len), names: [...new Set(rt.steps ? rt.steps.map(s => s.e && s.e.name).filter(Boolean) : [])].slice(-3) } : null;
  const last = rt && rt.pts[rt.pts.length - 1]; out.ends = last ? Math.round(Math.hypot((last.x ?? last[0]) - d.x, (last.z ?? last[1]) - d.z)) : null;
  return out;
});
check('Raceway Road leaves Heron Loop for the paddock; the GPS routes there from Linden Hills', there.road && there.route && there.route.len > 500 && there.ends < 30, JSON.stringify(there));

// ---------------------------------------------------------------- 3. the Race Office and the property
const office = await ev(() => {
  const g = window.game, d = g.world.places.raceway.door, out = {};
  if (g.player.state === 'vehicle') g.exitVehicle(true);
  g.resetPlayerState(d.x + Math.sin(d.h) * 0.8, d.z + Math.cos(d.h) * 0.8, d.h + Math.PI);
  const a = g.raceway.findAction(); out.label = a && a.label;
  if (a) a.act();
  const body = document.getElementById('svcBody'); out.events = body ? (body.innerHTML.match(/data-act="ev:/g) || []).length : 0; out.forSale = body ? /For sale/.test(body.innerHTML) : false;
  g.ui.closeAll();
  // buying it: Clean Bank, no Rank gate; its garages become parking
  g.money.W.clean = 600000; out.rank = g.uw.rank;
  const why = g.uw.props.buy('raceway'); out.buy = why || ''; out.owned = g.raceway.owned(); out.bays = g.uw.props.bays(window.__pv.PROPS.find(p => p.id === 'raceway')).length;
  return out;
});
check('the Race Office at its door: three official events, the raceway for sale', /Race Office/.test(office.label || '') && office.events === 3 && office.forSale, JSON.stringify(office));
check('bought from the bank with no Rank gate; its nine pit garages are eighteen parking bays', office.buy === '' && office.owned && office.bays === 18, JSON.stringify(office));

// ---------------------------------------------------------------- 4. an official event: a full race, Clean money
const raceTo = async (id, place) => {
  await ev(id => { const g = window.game, e = window.__pv.SR_EVENTS.find(x => x.id === id); g.raceway.enter(e); }, id);
  await ev(() => { const g = window.game, A = g.race.active, v = g.player.vehicle; v.pos.x = A.R.start.x; v.pos.z = A.R.start.z; v.h = A.R.start.h; v.vel.set(0, 0); v.syncMesh(0); });
  await frames(page, 15);
  const obj = await ev(() => { const A = window.game.race.active; return A ? { phase: A.phase, obj: A.objective } : null; });
  if (!obj || obj.phase === 'toStart') { await ev(() => window.game.missions.fail('test')); return { refused: obj && obj.obj }; }
  await page.waitForFunction(() => { const A = window.game.race.active; return A && (A.phase === 'count' || A.phase === 'run'); }, null, { timeout: 60000, polling: 50 });
  await ev(() => { window.game.race.active.count = 0.01; });
  await page.waitForFunction(() => window.game.race.active && window.game.race.active.phase === 'run', null, { timeout: 30000, polling: 50 });
  const mid = await ev(() => { const g = window.game, A = g.race.active, v = g.player.vehicle; const s0 = A.racers.map(r => [r.v.pos.x, r.v.pos.z]); for (let k = 0; k < 160; k++) { v.vel.set(Math.sin(v.h) * 25, Math.cos(v.h) * 25); g.update(0.05, 0.05); } return { moved: A.racers.map((r, i) => Math.round(Math.hypot(r.v.pos.x - s0[i][0], r.v.pos.z - s0[i][1]))), cps: A.R.cps.length, laps: A.def ? A.def.laps : null }; });
  await ev(place => { const g = window.game, A = g.race.active, v = g.player.vehicle, c = A.R.cps[A.R.cps.length - 1]; A.finished = place - 1; A.cp = A.R.cps.length - 1; v.pos.x = c.x; v.pos.z = c.z; v.vel.set(0, 0); v.syncMesh(0); }, place);
  await page.waitForFunction(() => !window.game.missions.active, null, { timeout: 30000, polling: 50 });
  return { mid };
};
// an outsider first (the entry fee), in the wrong class, then the right one
// (the cars first, while its garages are yours: a car needs a space to be yours)
await ev(() => { const g = window.game, S = window.__pv.SR, x = S.office.x0 - 30, z = (S.office.z0 + S.office.z1) / 2; window.__cars = { compact: window.__car('compact', x, z + 6, Math.PI).uid, sports: window.__car('sports', x, z - 6, Math.PI).uid }; g.save.uw.props.raceway.owned = false; });
const into = type => ev(type => { const g = window.game, e = g.save.garage.find(q => q.uid === window.__cars[type]); if (g.player.state === 'vehicle') g.exitVehicle(true); const v = g.vreg.live(e) || g.vreg.spawnFor(e, { x: e.loc.x, z: e.loc.z, h: e.loc.h, y: window.__pv.SR.y }); g.resetPlayerState(v.pos.x + 2.5, v.pos.z, 0); g.completeEnter(v); return !!g.player.vehicle; }, type);
await into('sports');
const cls = await raceTo('sr_hatch', 1);
check('scrutineering: a car outside the event’s class doesn’t get on the grid', cls.refused && /Wrong class/.test(cls.refused), JSON.stringify(cls));
await into('compact'); await ev(() => { window.__log = []; });
const hatch = await raceTo('sr_hatch', 1);
const money = await ev(() => { const L = window.__log.filter(x => /^track/.test(x.src) || x.cur === 'dirty'); return { in: L.filter(x => x.d > 0).map(x => x.cur + ':' + x.src + ':' + Math.round(x.d)).join(), out: L.filter(x => x.d < 0).map(x => x.cur + ':' + x.src + ':' + Math.round(-x.d)).join() }; });
check('the Hot Hatch Trophy: three laps against five, the field really races; the fee and the prize are Clean Bank', hatch.mid && hatch.mid.moved.length === 5 && hatch.mid.moved.every(d => d > 40) && money.in === 'clean:trackPrize:2200' && money.out === 'clean:trackFee:200', JSON.stringify({ hatch, money }));
await ev(() => { const g = window.game; g.save.uw.props.raceway.owned = true; window.__log = []; });
await raceTo('sr_hatch', 1);
const own = await ev(() => window.__log.filter(x => x.d < 0 && x.src === 'trackFee').length);
check('the owner races free', own === 0, String(own));

// ---------------------------------------------------------------- 5. free roam: an AI lap at speed, a timed lap, the record kept
await into('compact');
const lap = await ev(() => {
  const g = window.game, P = g.raceway, T = g.world.sr.track, pv = window.__pv, out = {};
  out.book = P.book();
  const ck = P.checkpoints({ laps: 1 }), s = ck.start, v = g.vehicles.spawn('sports', s.x, s.z, s.h, { driver: 'npc' });
  v.mission = 'test'; v.touched = true; v.drive = new pv.DriveAI(v, g, 'race'); v.drive.path = ck.aiPath.map(c => ({ ...c })); v.drive.pi = 0; v.drive.wait = 0; v.drive.cruise = 58;
  let off = 0, maxV = 0, t = 0;
  for (let k = 0; k < 4000 && v.drive.pi < v.drive.path.length - 8; k++) {
    window.__step(1, v); t += 0.05; maxV = Math.max(maxV, v.speed);
    if (k % 10 === 0) { let d = 1e9; for (let j = 0; j < T.pts.length; j += 3) d = Math.min(d, Math.hypot(T.pts[j][0] - v.pos.x, T.pts[j][1] - v.pos.z)); if (d > 8.5) off++; }
  }
  out.done = v.drive.pi >= v.drive.path.length - 8; out.t = Math.round(t); out.maxV = Math.round(maxV * 3.6); out.off = off;
  g.vehicles.despawn(v);
  const n = T.pts.length, k0 = g.world.sr.sf.k;
  window.__car('sports', T.pts[k0][0] - 30, T.pts[k0][1], Math.PI / 2); const pl = g.player.vehicle;
  for (let j = -12; j <= n + 6; j += 3) { const p = T.pts[((k0 + j) % n + n) % n]; pl.pos.x = p[0]; pl.pos.z = p[1]; pl.syncMesh(0); P.update(0.25); }
  out.laps = P.session && P.session.laps; out.best = P.s.best;
  g.saveGame(true);
  return out;
});
check('free roam: a car laps it at speed on its racing line and stays on the track', lap.done && lap.off === 0 && lap.maxV > 100 && lap.t < 120, JSON.stringify(lap));
check('a session times a lap through every sector and keeps the record', lap.book === '' && lap.laps === 1 && lap.best && lap.best.t > 0, JSON.stringify(lap));
await ev(() => { const g = window.game; g.save.stats.playTime = Math.max(g.save.stats.playTime, 120); g.saveGame(true); });
await page.reload(); await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
await page.click('#btnContinue'); await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
const after = await ev(() => { const g = window.game; return { best: g.raceway.s.best, owned: g.raceway.owned() }; });
check('save → reload: the raceway still yours, the lap record kept', after.owned && after.best && after.best.t === lap.best.t, JSON.stringify(after));

// ---------------------------------------------------------------- 6. the maps
const map = await ev(() => {
  const g = window.game, ui = g.ui, T = g.world.sr.track, c = document.createElement('canvas'); c.width = c.height = 800;
  const x0 = -900, z0 = 1700, k = 1, gg = c.getContext('2d', { willReadFrequently: true }), k0 = ui.mapK, E0 = ui.mapE;
  ui.mapK = k; ui.mapE = -x0; gg.translate(0, (x0 - z0) * k);
  try { ui._paintMap(gg, { x0, z0, x1: x0 + 800, z1: z0 + 800 }); } finally { ui.mapK = k0; ui.mapE = E0; }
  const p = T.pts[Math.floor(T.pts.length * 0.3)], px = Array.from(gg.getImageData(Math.round(p[0] - x0), Math.round(p[1] - z0), 1, 1).data.slice(0, 3));
  return { px, place: g.world.mapPlaces.find(q => q.id === 'raceway').name };
});
check('the maps show the circuit and name it', map.px.every(v => v < 90) && map.place === 'Southshore Raceway', JSON.stringify(map));
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await finish(b, 'raceway');
