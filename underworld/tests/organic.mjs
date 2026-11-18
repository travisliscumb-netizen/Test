/* The organic downtown (owner, 2026-11-18): the central grid broken up so it reads as a city that grew, its gameplay
   unchanged.
   - The squares, mews and yards (CITY_CLOSED): each a lattice street closed to traffic inside a precinct (never its
     edge street, never a race line), its two crossroads turned into T-junctions (no dead end, no lone corner), raised
     and paved, bollards across both ends, dressed (a fountain in a square), named, and painted on the map.
   - The lanes, the crescent, the avenue and the works roads (122): every one a through street, both ends on an open
     road; a street that runs on through several blocks meets itself at each crossing; the GPS follows Glass Mile end
     to end; standing on one, the HUD names it.
   - Nothing a save or the game stands on moved: every door, home, flat and place where it was (no road over any of
     them), every home still has its building, no flat under a road; every downtown block keeps two open sides; each district keeps
     its density (the lanes are lined with new frontage where they cut a block). */
import { launch, open, check, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b, { viewport: { width: 900, height: 700 } });
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);

const R = await ev(() => {
  const g = window.game, w = g.world, P = window.__pv, RN = P.RoadNet, CL = P.CityLayout, out = {};
  const Pm = 80, segD = (x, z, a, c) => { const dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz || 1; let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
  const polyD = (x, z, pts) => { let m = Infinity; for (let k = 0; k < pts.length - 1; k++) m = Math.min(m, segD(x, z, pts[k], pts[k + 1])); return m; };
  // the race lines (lattice segments a street race runs along)
  const race = new Set();
  for (const r of P.RACES) if (r.nodes) { const s = r.nodes.slice(); if (r.loop) s.push(s[0]); for (let k = 1; k < s.length; k++) { let [a, c] = s[k - 1]; const [d, e] = s[k], di = Math.sign(d - a), dj = Math.sign(e - c); while (a !== d || c !== e) { const na = a + di, nc = c + dj; race.add(di ? `1:${c}:${Math.min(a, na)}` : `0:${a}:${Math.min(c, nc)}`); a = na; c = nc; } } }
  // ---- the closures
  out.closures = P.CITY_CLOSED.map(c => {
    const A = c.a === 0 ? [c.i - 1, c.j] : [c.j, c.i - 1], B = c.a === 0 ? [c.i, c.j] : [c.j, c.i];
    const pa = CL.precinctOf(...A), pb = CL.precinctOf(...B), inside = pa === pb;
    const n0 = c.a === 0 ? [c.i, c.j] : [c.j, c.i], n1 = c.a === 0 ? [c.i, c.j + 1] : [c.j + 1, c.i];
    const W = (x, z) => [x + pa.ox * Pm, z + pa.oz * Pm];
    const mid = c.a === 0 ? W(c.i * Pm, (c.j + 0.5) * Pm) : W((c.j + 0.5) * Pm, c.i * Pm);
    const strip = c.a === 0 ? [mid[0] - 10, c.j * Pm + 6 + pa.oz * Pm, mid[0] + 10, (c.j + 1) * Pm - 6 + pa.oz * Pm] : [c.j * Pm + 6 + pa.ox * Pm, mid[1] - 10, (c.j + 1) * Pm - 6 + pa.ox * Pm, mid[1] + 10];
    const inS = (x, z, m = 0) => x > strip[0] - m && x < strip[2] + m && z > strip[1] - m && z < strip[3] + m;
    const props = w.blocks.flatMap(bk => bk.props).filter(p => inS(p.x, p.z));
    const ends = [0, 1].map(e => props.filter(p => p.type === 'bollard' && (c.a === 0 ? Math.abs(p.z - (e ? strip[3] : strip[1])) < 2.5 : Math.abs(p.x - (e ? strip[2] : strip[0])) < 2.5)).length);
    const fountain = w.blocks.some(bk => bk.fx.some(f => f.type === 'fountain' && inS(f.x, f.z)));
    const prot = [...Object.values(w.places || {}).flatMap(p => ['door', 'garage', 'under'].map(k => p[k]).filter(Boolean)), ...(w.doors || []), ...w.homes.map(h => ({ x: (h.x0 + h.x1) / 2, z: (h.z0 + h.z1) / 2 }))].filter(q => inS(q.x, q.z, 2)).length;
    // a crossroads left a T; on a precinct's edge street, the edge street running straight on past it
    const tee = n => { const i = n[0] + pa.ox, j = n[1] + pa.oz, d = RN.degree(i, j); return d === 3 || d === 2 && (RN.open(i, j, 1, 0) && RN.open(i, j, -1, 0) || RN.open(i, j, 0, 1) && RN.open(i, j, 0, -1)); };
    return { name: c.name, kind: c.kind, inside, race: race.has(`${c.a}:${c.i}:${c.j}`), deg: [tee(n0), tee(n1)], road: RN.roadAt(mid[0], mid[1]), y: +P.groundY(mid[0], mid[1]).toFixed(2), ends, fountain, named: P.streetNameAt(mid[0], mid[1]), prot };
  });
  // ---- the curved streets laid by the organic pass
  const names = new Set(); for (const k in P.CURVED_STREETS) if (!['10,2', '10,3', '3,10', '4,10'].includes(k)) for (const r of P.CURVED_STREETS[k].roads) names.add(r.name);
  out.names = [...names];
  const ours = w.localRoads.filter(r => r.link && names.has(r.link));
  out.lanes = ours.length; out.linked = ours.filter(r => w.links.some(L => L.road === r && L.ends.every(Boolean))).length;
  // the HUD's name on a lane, half way along
  out.hud = ours.map(r => { const q = r.pts[Math.floor(r.pts.length / 2)]; return [r.link, P.streetNameAt(q[0], q[1])]; }).filter(([a, c]) => a !== c);
  // the GPS follows Glass Mile end to end
  const gm = w.links.filter(L => L.name === 'Glass Mile').sort((a, c) => a.pts[0][0] - c.pts[0][0]);
  const s0 = gm[0].pts[3], s1 = gm[gm.length - 1].pts[gm[gm.length - 1].pts.length - 4], rt = P.RoadGraph.route(s0[0], s0[1], s1[0], s1[1]);
  const chain = gm.reduce((t, L) => t + L.len, 0);
  out.gm = { pieces: gm.length, chain: Math.round(chain), route: rt ? Math.round(rt.len) : null, onIt: rt ? rt.pts.every(p => { const x = p.x ?? p[0], z = p.z ?? p[1]; return gm.some(L => polyD(x, z, L.pts) < 9); }) : false };
  // ---- nothing a save or the game stands on is under a new road
  const prot = [...Object.entries(w.places || {}).flatMap(([id, p]) => ['door', 'garage', 'under'].map(k => p[k] && { k: id + ':' + k, x: p[k].x, z: p[k].z }).filter(Boolean)), ...(w.doors || []).map(d => ({ k: 'door:' + d.id, x: d.x, z: d.z }))];
  out.onRoad = prot.filter(q => ours.some(r => polyD(q.x, q.z, r.pts) < r.w / 2 + 1)).map(q => q.k);
  const housed = h => w.blocks.some(bk => bk.bld.some(r => r.x0 <= (h.x0 + h.x1) / 2 && r.x1 >= (h.x0 + h.x1) / 2 && r.z0 <= (h.z0 + h.z1) / 2 && r.z1 >= (h.z0 + h.z1) / 2));
  const flats = w.flats ? (Array.isArray(w.flats) ? w.flats : Object.values(w.flats)) : [];
  // (a flat is a unit inside a building of the street's: no new road over it)
  const under = h => ours.some(r => polyD((h.x0 + h.x1) / 2, (h.z0 + h.z1) / 2, r.pts) < r.w / 2 + 2);
  out.homeless = [...w.homes.filter(h => !housed(h) || under(h)), ...flats.filter(f => f.x0 !== undefined && under(f))].map(h => h.id);
  // ---- every downtown block keeps two open sides; each district keeps its density
  const ids = ['core', 'oldquarter', 'linden', 'port'], cnt = {}, shut = [];
  for (const bk of w.blocks) {
    const p = CL.precinctOf(bk.bx, bk.bz); if (!ids.includes(p.id)) continue;
    cnt[p.id] = (cnt[p.id] || 0) + bk.bld.length;
    if (bk.superblock) continue;
    const open = [0, 1, 2, 3].filter(s => RN.sideOpen(bk.I, bk.J, s)).length; if (open < 2) shut.push(bk.bx + ',' + bk.bz);
  }
  out.cnt = cnt; out.shut = shut;
  // ---- the map: a square's paving and its fountain, a lane's asphalt
  const ui = g.ui, c = document.createElement('canvas'), S = 1080; c.width = c.height = S;
  const gg = c.getContext('2d', { willReadFrequently: true }), k0 = ui.mapK, E0 = ui.mapE; ui.mapK = 1; ui.mapE = 60;
  try { ui._paintMap(gg, { x0: -60, z0: -60, x1: 1020, z1: 1020 }); } finally { ui.mapK = k0; ui.mapE = E0; }
  const px = (x, z) => Array.from(gg.getImageData(Math.round(x + 60), Math.round(z + 60), 1, 1).data.slice(0, 3));
  const sq = P.CITY_CLOSED.find(q => q.name === 'Ledger Square'), sqm = sq.a === 0 ? [sq.i * Pm, (sq.j + 0.5) * Pm + 12] : [(sq.j + 0.5) * Pm + 12, sq.i * Pm];
  const ln = ours.find(r => r.link === 'Glass Mile'), lq = ln.pts[Math.floor(ln.pts.length / 2)];
  out.map = { square: px(...sqm), lane: px(lq[0], lq[1]) };
  return out;
});
const cl = R.closures;
check('the squares, mews and yards: inside a precinct, off every race line, both crossroads T-junctions or, on an edge, the edge street straight on (no dead end, no lone corner)', cl.length >= 7 && cl.every(c => c.inside && !c.race && c.deg.every(Boolean)), JSON.stringify(cl.map(c => [c.name, c.inside, c.race, c.deg])));
check('closed to traffic: off the road network, raised to the pavement, bollards across both ends', cl.every(c => !c.road && c.y > 0.1 && c.ends.every(n => n >= 6)), JSON.stringify(cl.map(c => [c.name, c.road, c.y, c.ends])));
check('dressed and named: a fountain in every square; the HUD gives its name; nothing a door, home or place stands on', cl.every(c => (c.kind !== 'plaza' || c.fountain) && c.named === c.name && c.prot === 0), JSON.stringify(cl.map(c => [c.name, c.fountain, c.named, c.prot])));
check('the new streets: lanes, a crescent, avenues and works roads, every one a through street with both ends on an open road', R.names.length >= 15 && R.lanes >= 24 && R.linked === R.lanes, JSON.stringify({ names: R.names, lanes: R.lanes, linked: R.linked }));
check('standing on any of them, the HUD names it', R.hud.length === 0, JSON.stringify(R.hud));
check('the GPS takes Glass Mile end to end, a diagonal across three blocks', R.gm.pieces === 3 && R.gm.onIt && R.gm.route < R.gm.chain * 1.25, JSON.stringify(R.gm));
check('no new road over any door, garage or place; every home still has its building, no flat under a road', R.onRoad.length === 0 && R.homeless.length === 0, JSON.stringify({ onRoad: R.onRoad, homeless: R.homeless }));
check('no block cut off: every downtown block keeps at least two open sides', R.shut.length === 0, JSON.stringify(R.shut));
// the density before the pass (building counts per precinct, the grid as it was): the lanes' new frontage keeps it
const BASE = { core: 207, oldquarter: 168, linden: 137, port: 36 };
check('each district keeps its density (within 5% of the grid it was)', Object.entries(BASE).every(([k, v]) => R.cnt[k] >= v * 0.95), JSON.stringify({ now: R.cnt, before: BASE }));
const near = (a, c, t = 14) => a.every((v, i) => Math.abs(v - c[i]) <= t);
check('the map shows them: a square’s paving, a lane’s asphalt', near(R.map.square, [0x8f, 0x8a, 0x80], 30) && near(R.map.lane, [0x6f, 0x76, 0x82], 30), JSON.stringify(R.map));
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await finish(b, 'organic');
