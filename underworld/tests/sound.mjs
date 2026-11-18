/* Valen Sound filled in (owner, 2026-11-18): the water on the city's east side is land, Valen Point is gone.
   - The land: the old sound is dry ground everywhere but Valen River, which winds from a harbour basin at the
     Container Terminal's quay out to the east coast along the old sound's south side (offset, never its middle),
     its banks wandering; the ship at the quay still floats.
   - The roads: Sound Parkway (the port's east street to Uptown) and Riverside Drive (off it, east along the river's
     north bank) are dry, within their grade and in the one road network; the GPS routes onto them.
   - The Sound Flats: the reclaimed land is a district (zone 'v') you discover by going there; the plain north of the
     river is kept open (no farm, no lone house scattered on it).
   - The impound's third yard: the Sound annex on the parkway, 85 spaces, a driveway to its gate; the three yards
     still hold a space for every car you could own; a car seized on the Flats goes there, one seized downtown to
     the main yard.
   - Valen Point is gone (no district, no property, no venue); its race cars are at the Southshore garages and
     paddock; its owner's features are the Southshore Motorsport Complex's (race meetings, the pit crew, a daily
     income, the Invitational's Monarch, once).
   - An old save that owned Valen Point: the $1,500,000 back once (Clean), its record gone, an Invitational won
     there counted at Southshore, its garaged cars given bays at the owner's other places. */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const helpers = () => ev(() => {
  const g = window.game;
  g.events.cool = 1e9; g.debug.god = true; g.police.enabled = false; g.env.time = 13;
  window.__log = []; if (!window.__hooked) { g.money.on(x => window.__log.push(x)); window.__hooked = true; }
});
await helpers();

// ---------------------------------------------------------------- 1. the land and the river
const land = await ev(() => {
  const P = window.__pv, I = P.Island, out = {};
  // every wet point of the old sound is the river's (within its banks' reach), everything else dry
  let wet = 0, stray = [], dry = 0;
  for (let x = 1000; x <= 2560; x += 20) for (let z = -100; z <= 1250; z += 20) {
    if (!I.land(x, z) && I.nat(x, z) < P.SEA_Y) { wet++; const r = P.riverAt(x, z); if (!(r.d < r.hw + 34)) stray.push([x, z]); } else dry++;
  }
  out.wet = wet; out.dry = dry; out.stray = stray.slice(0, 6); out.nStray = stray.length;
  // where Valen Point's island and the causeway were: dry
  let vpWet = 0; for (let x = 1440; x <= 2380; x += 40) for (let z = 130; z <= 900; z += 40) if (I.nat(x, z) < P.SEA_Y + 0.3) vpWet++;
  out.vpWet = vpWet;
  // the river: water all along its centreline, from the basin to the sea beyond the coast
  const L = P.ISLE_RIVER; let dryC = [];
  for (const [x, z] of P.RIVER_LINE) if (I.nat(x, z) >= P.SEA_Y - 0.5) dryC.push([Math.round(x), Math.round(z), +I.nat(x, z).toFixed(1)]);
  out.dryC = dryC.length; out.dryAt = dryC.slice(0, 4); out.mouth = +I.nat(L[L.length - 1][0] + 60, L[L.length - 1][1]).toFixed(1);
  // offset to the south side: the old sound ran from z ≈ −200 to ≈ 1200; the river never comes north of z 850
  out.minZ = Math.min(...L.map(p => p[1])); out.avgZ = Math.round(L.reduce((s, p) => s + p[1], 0) / L.length);
  // winding: the centreline's heading swings back and forth (left, right, left ...) along its length
  let swings = 0, prev = 0; for (let i = 1; i < L.length - 1; i++) { const a = Math.atan2(L[i][1] - L[i - 1][1], L[i][0] - L[i - 1][0]), c = Math.atan2(L[i + 1][1] - L[i][1], L[i + 1][0] - L[i][0]), s = Math.sign(c - a); if (s && prev && s !== prev) swings++; if (s) prev = s; }
  out.swings = swings;
  // its banks wander: the north bank's z, east along the river every 40 m, is never a straight line for long
  const bank = []; for (let x = 1100; x <= 2400; x += 40) { let z = P.riverZ(x); while (I.nat(x, z) < P.SEA_Y && z > P.riverZ(x) - 140) z -= 2; bank.push(z); }
  let straight = 0, run = 0; for (let i = 2; i < bank.length; i++) { const d2 = bank[i] - 2 * bank[i - 1] + bank[i - 2]; if (Math.abs(d2) < 0.5) { run++; straight = Math.max(straight, run); } else run = 0; }
  out.straightRun = straight; out.bankSpan = Math.round(Math.max(...bank) - Math.min(...bank));
  // width: 50 m and more of water across it (a large river)
  const w = []; for (const x of [1300, 1700, 2100, 2400]) { let n = 0; for (let z = P.riverZ(x) - 120; z <= P.riverZ(x) + 120; z += 2) if (I.nat(x, z) < P.SEA_Y) n += 2; w.push(n); }
  out.widths = w;
  // the ship at the terminal's quay floats: deep water under its whole hull
  let shipDry = 0; for (let x = 996; x <= 1018; x += 4) for (let z = 822; z <= 958; z += 6) if (I.nat(x, z) > P.SEA_Y - 1.5) shipDry++;
  out.shipDry = shipDry;
  return out;
});
check('the old sound is dry land everywhere but the river (no stray pond or channel), Valen Point’s ground among it', land.nStray === 0 && land.wet > 100 && land.dry > 3000 && land.vpWet === 0, JSON.stringify(land));
check('Valen River: water the whole way from the harbour basin to the sea, 50 m and more across', land.dryC === 0 && land.mouth < -1.2 && land.widths.every(n => n >= 50), JSON.stringify(land));
check('…offset to the south side (never north of z 850; the sound’s middle was z ≈ 500), winding, its banks never ruled straight', land.minZ >= 850 && land.avgZ > 950 && land.swings >= 4 && land.straightRun <= 3 && land.bankSpan > 120, JSON.stringify(land));
check('the ship at the Container Terminal’s quay still floats (deep water under its hull)', land.shipDry === 0, JSON.stringify(land));

// ---------------------------------------------------------------- 2. the roads
const roads = await ev(() => {
  const g = window.game, P = window.__pv, I = P.Island, out = {};
  for (const id of ['sp1', 'sp2']) {
    const R = I.roads.find(r => r.id === id); if (!R) { out[id] = null; continue; }
    let grade = 0; for (let k = 1; k < R.pts.length; k++) { const ds = R.cum[k] - R.cum[k - 1]; if (ds > 0.5) grade = Math.max(grade, Math.abs(R.y[k] - R.y[k - 1]) / ds); }
    out[id] = { name: R.name, len: Math.round(R.len), span: R.sp.some(Boolean), grade: +grade.toFixed(3), minY: +Math.min(...R.y).toFixed(2), allowed: R.grade };
  }
  out.graph = P.RoadGraph.edges.filter(e => e.name === 'Sound Parkway' || e.name === 'Riverside Drive').length;
  const ab = g.world.xblocks.find(x => x.xb === 'annex'), from = g.uw.loc('prop', 'linden');
  const rt = (x, z) => { const r = P.RoadGraph.route(from.x, from.z, x, z); if (!r) return null; const last = r.pts[r.pts.length - 1]; return { len: Math.round(r.len), ends: Math.round(Math.hypot((last.x ?? last[0]) - x, (last.z ?? last[1]) - z)) }; };
  out.toAnnex = ab ? rt(ab.cx + 4.5, ab.z0 - 6) : null; out.toRing = rt(2460, 990);
  // a straight walk from the parkway's south edge up the driveway to the gate: no step taller than a kerb
  if (ab) { let step = 0, y0 = null; for (let z = ab.z0 - 14; z <= ab.z0 + 4; z += 0.5) { const y = P.groundY(ab.cx + 4.5, z); if (y0 !== null) step = Math.max(step, Math.abs(y - y0)); y0 = y; } out.drive = +step.toFixed(3); }
  return out;
});
check('Sound Parkway and Riverside Drive: dry the whole way (no bridge), within their grade, in the one road network', roads.sp1 && roads.sp2 && !roads.sp1.span && !roads.sp2.span && roads.sp1.grade <= roads.sp1.allowed + 0.005 && roads.sp2.grade <= roads.sp2.allowed + 0.005 && roads.graph >= 2, JSON.stringify(roads));
check('the GPS routes from Linden Hills to the annex’s gate and to Riverside Drive’s turning circle; the driveway climbs to the gate without a step', roads.toAnnex && roads.toAnnex.ends < 30 && roads.toRing && roads.toRing.ends < 30 && roads.drive < 0.12, JSON.stringify(roads));

// ---------------------------------------------------------------- 3. the Sound Flats
const flats = await ev(() => {
  const g = window.game, P = window.__pv, s = g.save, out = {};
  out.zone = P.zoneKey(1500, 500); out.name = P.ZONES.v.name; out.south = P.zoneKey(1500, 1200);
  delete s.discovered.zones.v; g.resetPlayerState(1500, 500, 0); for (let k = 0; k < 20; k++) g.update(0.05, 0.05);
  out.found = !!s.discovered.zones.v;
  // the plain north of the river is open: no building of a farm or a settlement on it
  const R = P.SOUND_RESERVE; out.built = [];
  for (const xb of g.world.xblocks) for (const q of xb.bld) { const x = (q.x0 + q.x1) / 2, z = (q.z0 + q.z1) / 2; if (x > R[0] && x < R[2] && z > R[1] && z < R[3] && xb.xb !== 'annex') out.built.push(xb.xb || xb.name); }
  out.built = [...new Set(out.built)];
  return out;
});
check('the reclaimed land is the Sound Flats (zone v), discovered by going there; south of the river is Southshore', flats.zone === 'v' && flats.name === 'Sound Flats' && flats.south === 'e' && flats.found, JSON.stringify(flats));
check('the plain north of the river is kept open for what comes next (nothing built on it but the annex)', flats.built.length === 0, JSON.stringify(flats));

// ---------------------------------------------------------------- 4. the impound's Sound annex
const imp = await ev(() => {
  const g = window.game, P = window.__pv, PM = g.uw.props, I = g.impound, s = g.save, out = {};
  g.money.W.clean = 2e6; out.buy = PM.buy('raceway') || '';
  let bays = 0; for (const d of P.PROPS) bays += PM.bays(d).length;
  out.bays = bays; out.cap = I.capacity(); out.lots = I.lots(); out.annex = g.world.compounds.impound_vp ? g.world.compounds.impound_vp.slots.length : 0;
  const one = (x, z) => { const e = g.content.addToGarage('sedan', 'bought', undefined, true); const v = g.vreg.spawnFor(e, { x, z, h: 0, y: P.groundY(x, z) }); e.out = true; e.loc = { x, z, h: 0, y: v.pos.y }; g.resetPlayerState(x + 30, z, 0); I.seize(e, 'abandoned'); const r = { lot: I.lotOf(e), name: I.spaceName(e) }; e.imp = null; s.garage.splice(s.garage.indexOf(e), 1); g.vreg.despawn && g.vreg.despawn(e); return r; };
  out.flats = one(1500, 470); out.city = one(400, 365);
  return out;
});
check('the impound’s three yards hold a space for every car you could own; the Sound annex has its 85', imp.cap >= imp.bays && imp.lots.length === 3 && imp.annex === 85, JSON.stringify(imp));
check('a car seized on the Sound Flats goes to the annex; one seized downtown to the city’s main yard', imp.flats.lot === 'impound_vp' && /Sound annex/.test(imp.flats.name) && imp.city.lot === 'impound' && /main yard/.test(imp.city.name), JSON.stringify(imp));

// ---------------------------------------------------------------- 5. Valen Point gone; its cars and features at Southshore
const gone = await ev(() => {
  const g = window.game, P = window.__pv, w = g.world, out = {};
  out.vp = !!w.vp; out.prop = P.PROPS.some(d => d.id === 'motorsport'); out.venue = !!g.motorsport; out.place = w.mapPlaces.some(q => /Valen Point/.test(q.name));
  out.links = w.links.filter(L => /Valen Point/.test(L.name)).length; out.zoneName = P.districtNameAt(1600, 500);
  const F = w.isle.fleet; out.paddock = (F.find(f => f.id === 'sr_paddock') || { slots: [] }).slots.length; out.oval = (F.find(f => f.id === 'so_pits') || { slots: [] }).slots.length;
  out.vpFleet = F.filter(f => /^vp_/.test(f.id)).length;
  out.events = P.SR_EVENTS.map(e => e.id).concat(P.OV_EVENTS.map(e => e.id));
  return out;
});
check('Valen Point is gone: no district, property, venue, causeway or map place; its ground is the Sound Flats', !gone.vp && !gone.prop && !gone.venue && !gone.place && gone.links === 0 && gone.zoneName === 'Sound Flats', JSON.stringify(gone));
check('its twelve race cars are at Southshore: six in the road course’s paddock, six more in the oval’s garages (twelve there)', gone.paddock === 6 && gone.oval === 12 && gone.vpFleet === 0, JSON.stringify(gone));

const owner = await ev(() => {
  const g = window.game, P = window.__pv, R = g.raceway, uw = g.uw, out = {};
  g.money.W.clean = 2e6; out.buy = uw.props.owned('raceway') ? '' : uw.props.buy('raceway') || '';
  // a meeting: paid now, the gate once the next day, with the complex's own takings
  window.__log = []; out.why = R.host(); out.twice = R.host();
  uw.S.day += 1; R.tickDay(); out.take = window.__log.filter(x => x.src === 'trackIncome').map(x => Math.round(x.d));
  R.tickDay(); out.take2 = window.__log.filter(x => x.src === 'trackIncome').map(x => Math.round(x.d));
  out.out = window.__log.filter(x => x.d < 0).map(x => x.src + ':' + Math.round(-x.d)).join();
  // the pit crew, stopped in a damaged car in a bay of the oval's garages: a third off for the owner
  const bay = g.world.cfs.bays[3], e = g.content.addToGarage('sports', 'bought', undefined, true), v = g.vreg.spawnFor(e, { x: bay.x, z: bay.z, h: bay.h, y: bay.y });
  v.health = 40; v.vel.set(0, 0);
  const a = R.pitAction(v); out.pit = a && a.label; out.full = Math.round(g.content.repairCost(v.type, v.health) / 10) * 10;
  if (a) { a.act(); out.fixed = v.health; }
  // the Invitational: the Monarch once, never twice
  const def = P.SR_EVENTS.find(x => x.id === 'sr_inv'), n0 = g.save.garage.filter(x => x.type === 'monarch').length;
  R.awardCar(def); R.awardCar(def); out.monarch = g.save.garage.filter(x => x.type === 'monarch').length - n0; out.flag = !!R.s.prize.sr_inv;
  return out;
});
const pitCost = owner.pit && +(owner.pit.match(/\$([\d,]+)/) || [0, '0'])[1].replace(/,/g, '');
check('the complex’s owner hosts a meeting (Clean now, the gate once the next day) and takes a daily income', owner.buy === '' && owner.why === '' && /already/.test(owner.twice) && owner.take.includes(32000) && owner.take.includes(3600) && owner.take2.filter(n => n === 32000).length === 1 && /trackHost:20000/.test(owner.out), JSON.stringify(owner));
check('the pit crew works any of the complex’s garages, a third off for the owner; the Invitational’s Monarch is awarded once', /Pit crew/.test(owner.pit || '') && Math.abs(pitCost - Math.round(owner.full * 0.7 / 10) * 10) <= 10 && owner.fixed > 99 && owner.monarch === 1 && owner.flag, JSON.stringify({ owner, pitCost }));

// ---------------------------------------------------------------- 6. an old save that owned Valen Point
const mig = await ev(() => {
  const g = window.game, s = g.save, P = window.__pv, c0 = g.money.W.clean; window.__log = [];
  s.uw.props.motorsport = { owned: true, since: 0 }; s.track = { best: { t: 88, type: 'sports' }, prize: { vp_inv: true }, hosted: null, laps: 9 };
  s.raceway.prize = {};
  const e = g.content.addToGarage('coupe', 'bought', undefined, true); e.at = { p: 'motorsport', i: 3 };
  g.raceway.reset(); const once = g.money.W.clean - c0; g.raceway.reset();
  g.vreg.house();
  return { got: once, twice: g.money.W.clean - c0, src: window.__log.filter(x => x.src === 'propRefund').length, gone: !s.uw.props.motorsport && !s.track, inv: !!s.raceway.prize.sr_inv, at: e.at, msg: (s.messages || []).some(m => /Valen Point Motorsport Park has closed/.test(m.text)) };
});
check('a save that owned Valen Point: its $1,500,000 back (Clean, once), its record gone, its Invitational counted at Southshore', mig.got === 1500000 && mig.twice === 1500000 && mig.src === 1 && mig.gone && mig.inv && mig.msg, JSON.stringify(mig));
check('…its garaged car given a bay at one of the owner’s other places', mig.at && mig.at.p && mig.at.p !== 'motorsport', JSON.stringify(mig));

// ---------------------------------------------------------------- 7. the map
const map = await ev(() => {
  const g = window.game, ui = g.ui, ab = g.world.xblocks.find(x => x.xb === 'annex'), c = document.createElement('canvas'); c.width = c.height = 400;
  const x0 = 900, z0 = 400, k = 1, gg = c.getContext('2d', { willReadFrequently: true }), k0 = ui.mapK, E0 = ui.mapE;
  ui.mapK = k; ui.mapE = -x0; gg.translate(0, (x0 - z0) * k);
  try { ui._paintMap(gg, { x0, z0, x1: x0 + 400, z1: z0 + 400 }); } finally { ui.mapK = k0; ui.mapE = E0; }
  const px = (x, z) => Array.from(gg.getImageData(Math.round(x - x0), Math.round(z - z0), 1, 1).data.slice(0, 3));
  return { annex: px(ab.cx - 20, ab.cz + 10), grass: px(1200, 600), vpImg: !!ui.vpImg };
});
check('the map paints the annex’s yard on the Flats (grey on green) and no Valen Point', map.annex[1] - map.annex[0] < 10 && Math.abs(map.annex[0] - map.annex[2]) < 30 && map.grass[1] > map.grass[0] + 20 && !map.vpImg, JSON.stringify(map));
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await finish(b, 'sound');
