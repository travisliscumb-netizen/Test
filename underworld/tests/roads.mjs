/* Roads and the map: curved through-roads (Greenway Park Drive, the Cedar Fields road, the suburb
   bends that cut the corner between two streets) are smooth
   splines; the ground, both maps, traffic and the GPS all use the same polyline; the lattice graph
   that saves, races and police routing depend on is unchanged; traffic turns off onto the curves,
   follows them inside the lane and merges back; the GPS routes along them; districts have their own
   road style; the big map answers taps on open ground with a district card (prices, turf, property,
   territory tax) or a road card, and has a street-price layer. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const t = await open(b, {});
const page = t.page;
const ev = (f, a) => page.evaluate(f, a);
await startNew(page);
await ev(() => { const g = window.game; g.quality.setMode(0); g.events.cool = 1e9; g.police.enabled = false; });

// ---------------------------------------------------------------- 1. geometry and graph stability
const geo = await ev(() => {
  const g = window.game, P = window.__pv, w = g.world, out = {};
  out.links = w.links.map(L => {
    let maxTurn = 0;
    for (let k = 1; k < L.pts.length - 1; k++) { const a = L.pts[k - 1], q = L.pts[k], c = L.pts[k + 1]; const h0 = Math.atan2(q[0] - a[0], q[1] - a[1]), h1 = Math.atan2(c[0] - q[0], c[1] - q[1]); let d = Math.abs(h1 - h0); if (d > Math.PI) d = 2 * Math.PI - d; maxTurn = Math.max(maxTurn, d); }
    return { name: L.name, n: L.pts.length, len: L.len, maxTurn, same: L.pts === L.road.pts && w.localRoads.includes(L.road), ends: L.ends.map(e => e.free || P.RoadNet.segOpen(e.axis, e.line, e.seg)) };
  });
  // the lattice: exactly the segments the superblocks close, nothing else
  let expect = 0; for (const sb of P.SUPERBLOCKS) expect += (sb.bx1 - sb.bx0) * (sb.bz1 - sb.bz0 + 1) + (sb.bz1 - sb.bz0) * (sb.bx1 - sb.bx0 + 1);
  out.closed = P.RoadNet.closed.size; out.expect = expect;
  out.path = P.RoadNet.path(0, 0, 12, 12).length;
  // every link point is on the road the ground shader paints (the local road raster)
  // (beyond the city's seawall the Valen Point causeway is painted by the district's own scenery: its band counts;
  // the Cedar Fields Track is the terrain's packed track (gravel on the pads) from the perimeter road's kerb out)
  const cfsTrack = q => q[1] >= P.CFS.lb.z0 && (P.Terrain.surf(q[0], q[1]) === P.TSURF.track || P.Terrain.surf(q[0], q[1]) === P.TSURF.gravel);
  let off = 0; for (const L of w.links) for (const q of L.pts) if (!P.localRoadAt(q[0], q[1]) && !(L.spur && q[0] >= P.VP.cw.x0 && Math.abs(q[1] - P.VP.cw.z) <= P.VP.cw.road) && !(L.name === 'Cedar Fields Track' && cfsTrack(q))) off++;
  out.offRaster = off;
  return out;
});
const names = geo.links.map(l => l.name);
check('curved through-roads: Greenway Park Drive, the Cedar Fields road and four suburb bends', names.includes('Greenway Park Drive') && names.includes('Cedar Fields Road') && ['Hawthorn Bend', 'Kestrel Curve', 'Millrace Lane', 'Willow Bend'].every(n => names.includes(n)) && new Set(names).size === names.length, JSON.stringify(names));
check('they are smooth splines (samples every ~2.5 m, no kink sharper than 10°)', geo.links.every(l => l.n >= l.len / 3 && l.maxTurn < 0.175), JSON.stringify(geo.links.map(l => [l.name, l.n, Math.round(l.len), +l.maxTurn.toFixed(3)])));
check('one polyline: what the ground paints and the maps draw is what traffic and GPS follow', geo.links.every(l => l.same) && geo.offRaster === 0, JSON.stringify(geo.offRaster));
check('each end meets an open lattice road (a spur’s far end is its turning circle)', geo.links.every(l => l.ends.every(Boolean)));
check('the lattice graph is unchanged (only superblock closures)', geo.closed === geo.expect && geo.path > 1, JSON.stringify([geo.closed, geo.expect, geo.path]));

// ---------------------------------------------------------------- 2. traffic on the curves
const trafficOn = await ev(async () => {
  const g = window.game, w = g.world, tr = g.traffic, out = {};
  const L = w.links[0], mid = L.pts[Math.floor(L.pts.length / 2)];
  g.resetPlayerState(mid[0] + 25, mid[1] + 25, 0);
  await new Promise(r => { const f0 = g.frame; const iv = setInterval(() => { if (g.frame > f0 + 5) { clearInterval(iv); r(); } }, 20); });
  for (const v of tr.cars.slice()) g.vehicles.despawn(v);
  let n = 0; for (let k = 0; k < 60 && n < 4; k++) if (tr.trySpawnLink()) n++;
  const track = tr.cars.filter(v => v.ai && v.ai.mode === 'path').map(v => ({ v, maxOff: 0, merged: false, link: w.links[v.ai.path.link], d0: v.ai.path.d }));
  const t0 = g.time;
  await new Promise(res => { const iv = setInterval(() => {
    for (const T of track) {
      const v = T.v; if (!g.vehicles.list.includes(v) || !v.ai) continue;
      if (v.ai.mode === 'path' && v.ai.path.d > 12 && v.ai.path.d < v.ai.path.mergeD - 4) {
        let best = 1e9; const P2 = T.link.pts; for (let k = 0; k < P2.length - 1; k++) { const a = P2[k], c = P2[k + 1], dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((v.pos.x - a[0]) * dx + (v.pos.z - a[1]) * dz) / l2)); best = Math.min(best, Math.hypot(v.pos.x - a[0] - dx * t, v.pos.z - a[1] - dz * t)); }
        T.maxOff = Math.max(T.maxOff, best);
      } else if (v.ai.mode !== 'path') T.merged = true;
    }
    if (g.time - t0 > 70 || track.every(T => T.merged)) { clearInterval(iv); res(); } }, 80); });
  out.n = track.length; out.cars = track.map(T => ({ off: +T.maxOff.toFixed(2), merged: T.merged, w: T.link.w, ...(T.merged ? {} : { alive: g.vehicles.list.includes(T.v), d: T.v.ai && T.v.ai.path && Math.round(T.v.ai.path.d), len: T.v.ai && T.v.ai.path && Math.round(T.v.ai.path.len), v: T.v.ai && +T.v.ai.speed.toFixed(1), blockT: T.v.ai && T.v.ai.blockT }) }));
  return out;
});
check('cars spawn on the curved roads', trafficOn.n >= 2, String(trafficOn.n));
check('they drive the curve inside their lane (centre to car under half the road width)', trafficOn.cars.every(c => c.off > 0.5 && c.off < c.w / 2), JSON.stringify(trafficOn.cars));
check('and merge back onto the lattice at the far end', trafficOn.cars.every(c => c.merged), JSON.stringify(trafficOn.cars));
// a lattice car reaching the junction turns off onto the drive
const turnOff = await ev(async () => {
  const g = window.game, w = g.world, tr = g.traffic, L = w.links[0], e = L.ends[0];
  for (const v of tr.cars.slice()) g.vehicles.despawn(v);
  // a car on the west perimeter road heading south (+z) towards the drive's junction
  g.resetPlayerState(e.C.x + 40, e.C.z, 0); g.traffic.enabled = true;
  await new Promise(r => { const f0 = g.frame; const iv = setInterval(() => { if (g.frame > f0 + 5) { clearInterval(iv); r(); } }, 20); }); // let traffic's focus follow the player
  let v = null; for (let k = 0; k < 60 && !v; k++) { v = tr.trySpawn(); if (v && (v.patrol || v.ai.mode !== 'lane')) { g.vehicles.despawn(v); v = null; } }
  if (!v) return { err: 'spawn' };
  Object.assign(v.ai, { i: e.line, j: e.seg, dx: 0, dz: 1, s: e.along - 30, mode: 'lane', next: null, linkSeen: 0, speed: 8 });
  // move the car to that lane now: its stale spawn spot may be far off-screen and get it despawned
  const lp = tr.lanePt(e.line, e.seg, 0, 1, e.along - 30); v.pos.x = lp[0]; v.pos.z = lp[1]; v.h = 0;
  tr.target = 1; tr.linkChance = 1; // no other spawns (and no thinning); this car always takes the turn
  let took = false; const t0 = g.time;
  try { await new Promise(res => { const iv = setInterval(() => { if (v.ai && v.ai.mode === 'path') took = true; if (took || g.time - t0 > 15 || !v.ai) { clearInterval(iv); res(); } }, 30); }); } finally { tr.linkChance = 0.4; tr.target = 18; }
  return { took, alive: !!v.ai };
});
check('lattice traffic turns off onto the curved road at its junction', turnOff.took, JSON.stringify(turnOff));
// every suburb bend is a real road: a lattice car turns in, drives it in lane and merges out the far end
const bends = await ev(async () => {
  const g = window.game, w = g.world, tr = g.traffic, out = [];
  for (const L of w.links.filter(L => /Bend|Curve|Lane/.test(L.name))) {
    for (const v of tr.cars.slice()) g.vehicles.despawn(v);
    const e = L.ends[0];
    g.resetPlayerState(e.C.x + (e.axis === 0 ? 30 : 0), e.C.z + (e.axis === 1 ? 30 : 0), 0);
    await new Promise(r => { const f0 = g.frame; const iv = setInterval(() => { if (g.frame > f0 + 5) { clearInterval(iv); r(); } }, 20); });
    let v = null; for (let k = 0; k < 80 && !v; k++) { v = tr.trySpawn(); if (v && (v.patrol || v.ai.mode !== 'lane')) { g.vehicles.despawn(v); v = null; } }
    if (!v) { out.push({ name: L.name, err: 'spawn' }); continue; }
    const dir = e.axis === 0 ? [0, 1] : [1, 0];
    Object.assign(v.ai, { i: e.axis === 0 ? e.line : e.seg, j: e.axis === 0 ? e.seg : e.line, dx: dir[0], dz: dir[1], s: e.along - 32, mode: 'lane', next: null, linkSeen: 0, speed: 8 });
    const lp = tr.lanePt(v.ai.i, v.ai.j, dir[0], dir[1], e.along - 32); v.pos.x = lp[0]; v.pos.z = lp[1]; v.h = Math.atan2(dir[0], dir[1]);
    tr.target = 1; tr.linkChance = 1;
    let took = false, merged = false, maxOff = 0; const t0 = g.time;
    try {
      await new Promise(res => { const iv = setInterval(() => {
        if (!v.ai) { clearInterval(iv); res(); return; }
        if (v.ai.mode === 'path') {
          took = true; const pa = v.ai.path;
          if (pa.d > pa.mergeD - L.len + 3 && pa.d < pa.mergeD - 3) { let best = 1e9; for (let k = 0; k < L.pts.length - 1; k++) { const a = L.pts[k], c = L.pts[k + 1], dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((v.pos.x - a[0]) * dx + (v.pos.z - a[1]) * dz) / l2)); best = Math.min(best, Math.hypot(v.pos.x - a[0] - dx * t, v.pos.z - a[1] - dz * t)); } maxOff = Math.max(maxOff, best); }
        } else if (took) merged = true;
        if (merged || g.time - t0 > 30) { clearInterval(iv); res(); }
      }, 30); });
    } finally { tr.linkChance = 0.4; tr.target = 18; }
    out.push({ name: L.name, took, merged, off: +maxOff.toFixed(2), w: L.w, ...(merged ? {} : { mode: v.ai && v.ai.mode, d: v.ai && v.ai.path && Math.round(v.ai.path.d), mergeD: v.ai && v.ai.path && Math.round(v.ai.path.mergeD), len: v.ai && v.ai.path && Math.round(v.ai.path.len), sp: +(v.ai ? v.ai.speed : -1).toFixed(1), blockT: v.ai && v.ai.blockT, pos: [Math.round(v.pos.x), Math.round(v.pos.z)] }) });
  }
  return out;
});
check('every suburb bend is driven by traffic: in at one street, along the curve in lane, out onto the other', bends.length === 4 && bends.every(b => b.took && b.merged && b.off < b.w / 2), JSON.stringify(bends));
const bendGps = await ev(() => {
  const g = window.game, P = window.__pv, out = [];
  for (const L of g.world.links.filter(L => /Bend|Curve|Lane/.test(L.name))) { const q = L.pts[Math.floor(L.pts.length / 2)], r = P.gpsRoute(q[0] + 200, q[1] + 200, q[0], q[1]), end = r[r.length - 1]; out.push({ name: L.name, end: +Math.hypot(end.x - q[0], end.z - q[1]).toFixed(2), on: r.filter(p => L.pts.some(s => Math.hypot(s[0] - p.x, s[1] - p.z) < 0.01)).length }); }
  return out;
});
check('the GPS (and so taxis and the map) routes onto each bend', bendGps.every(b => b.end < 0.01 && b.on >= 3), JSON.stringify(bendGps));

// ---------------------------------------------------------------- 3. GPS along the curve
const gps = await ev(() => {
  const g = window.game, P = window.__pv, L = g.world.links[0], q = L.pts[Math.floor(L.pts.length * 0.55)];
  // from the lattice west of the park to a point on the drive
  const r = P.gpsRoute(130, 290, q[0], q[1]);
  let onLink = 0; for (const p of r) if (L.pts.some(s => Math.hypot(s[0] - p.x, s[1] - p.z) < 0.01)) onLink++;
  const end = r[r.length - 1];
  // a trip across the city that has no reason to use the park still routes on the lattice
  const r2 = P.gpsRoute(600, 600, 900, 620); let onLink2 = 0; for (const p of r2) for (const L2 of g.world.links) if (L2.pts.some(s => Math.hypot(s[0] - p.x, s[1] - p.z) < 0.01)) onLink2++;
  return { onLink, n: r.length, end: Math.hypot(end.x - q[0], end.z - q[1]), onLink2, n2: r2.length };
});
check('GPS: a destination on the drive is reached along the curve', gps.onLink >= 20 && gps.end < 0.01, JSON.stringify(gps));
check('GPS: ordinary trips stay on the street grid', gps.onLink2 === 0 && gps.n2 >= 3, JSON.stringify(gps));

// ---------------------------------------------------------------- 4. district road styles
const styles = await ev(() => { const P = window.__pv; return { s: P.ROAD_STYLE, zones: Object.keys(P.ZONES) }; });
check('district road styles: Old Quarter, Financial, industrial, residential hills, Nightlife Strip', styles.s.o === 1 && styles.s.c === 2 && styles.s.s === 3 && styles.s.h === 3 && styles.s.u === 4 && styles.s.l === 4 && styles.s.p === 5 && !styles.s.m, JSON.stringify(styles.s));

// ---------------------------------------------------------------- 5. the interactive map
const map = await ev(async () => {
  const g = window.game, P = window.__pv, mv = g.ui.mapView, out = {};
  g.ui.toggleMap(true);
  await new Promise(r => setTimeout(r, 300));
  const c = P.ZONE_CENTRE.c, dEn = mv.districtEntry(c.x, c.z);
  out.district = { name: dEn.name, prices: /Street prices now/.test(dEn.extra), police: /Police presence/.test(dEn.extra), turf: /Turf/.test(dEn.extra), prop: /Property/.test(dEn.extra) };
  const L = g.world.links[0], q = L.pts[30], rEn = mv.roadEntry(q[0] + 2, q[1], 6);
  out.road = rEn && rEn.name;
  // tap on open ground (no card open) shows the district card; a second tap closes it
  mv.hideCard(); g.uw.mapOverlay = false;
  mv.sel = null; mv._drawn = [];
  const sx = mv.W / 2, sy = mv.H / 2; mv.tap(sx, sy);
  out.tap1 = !document.getElementById('mapCard').classList.contains('hidden') && /District|Road/.test(document.getElementById('mapCard').textContent);
  mv.tap(sx, sy); out.tap2 = document.getElementById('mapCard').classList.contains('hidden');
  // territory income: with the overlay on, a turf card opens instead
  g.uw.mapOverlay = true; mv.tap(sx, sy); out.turf = !document.getElementById('turfInfo').classList.contains('hidden');
  g.uw.mapOverlay = false; document.getElementById('turfInfo').classList.add('hidden');
  // street-price layer draws
  mv.setLayer('economy', true); mv.dirty = true; mv.draw(); out.layer = mv.layerOn('economy');
  mv.setLayer('economy', false);
  g.ui.toggleMap(false);
  return out;
});
check('map: a district card with police, turf, property and street prices', map.district.name === 'Financial District' && map.district.prices && map.district.police && map.district.turf && map.district.prop, JSON.stringify(map.district));
check('map: a road card for a curved road', map.road === 'Greenway Park Drive', String(map.road));
check('map: a tap on open ground opens a card, the next tap closes it', map.tap1 && map.tap2, JSON.stringify(map));
check('map: territory overlay taps still open the turf (income) card', map.turf);
check('map: street-price layer', map.layer);

check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
await finish(b, 'roads');
