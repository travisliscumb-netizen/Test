/* The city layout (021, CITY_SPREAD.md): Node only, no browser. The layout module and the world constants are
   run as they are in the build, with the few things they ask of later files stubbed.
   - the classic layout answers exactly what the lattice arithmetic it replaced answered, on and round the city;
   - a layout cut into precincts that stay where they were (same offset, abutting) answers the same again;
   - a layout whose precincts stand apart maps every cell, street and edge strip to its own precinct and back, and
     the zone and turf of a world point are those of its lattice cell;
   - check() refuses every kind of bad layout, with the reason.

   node underworld/tests/layout.mjs */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

let fail = 0;
const check = (name, ok, detail = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'game');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const stubs = `const window = {}, navigator = { maxTouchPoints: 0 }, screen = { width: 1200, height: 900 };
const vpSide = () => false, inCedarSouth = () => false, inValenPoint = () => false;
const Island = { zoneKey: () => 'e', land: () => true, lake: () => false }, VP = { name: 'Valen Point' }, CFS = { name: 'Cedar Fields South' }, LAKE = { name: 'Lake Valen' };
function offCity(x, z) { return CityLayout.at(x, z) === null; }
const TURF_N = 6;
`;
const turfSrc = read('390-underworld-data.js').match(/function turfAt\(x, z\) \{[\s\S]*?\n\}/);
check('the turf lookup is where the suite expects it (390)', !!turfSrc);
const code = stubs + read('010-core-utilities.js') + '\n' + read('020-content-world-constants.js') + '\n' + read('021-content-city-layout.js') + '\n' + (turfSrc ? turfSrc[0] : '') +
  '\n;globalThis.__x = { CityLayout, CITY_LAYOUTS, zoneKey, districtNameAt, turfAt, ZONE_MAP, ZONES, SUPERBLOCKS, N, P, CITY, EDGE_MARGIN, ROAD_HALF, clamp, RoadNet };';
// THREE for RoadNet.texture(): the texture's bytes are what the suite compares
const THREE = { DataTexture: class { constructor(d) { this.image = { data: d }; } }, RGBAFormat: 0, NearestFilter: 0 };
const ctx = vm.createContext({ console, Math, Number, Int8Array, Int16Array, Int32Array, Uint8Array, Map, Set, Infinity, THREE });
vm.runInContext(code, ctx, { filename: 'layout-under-test.js' });
const { CityLayout: L, CITY_LAYOUTS, zoneKey, districtNameAt, turfAt, ZONE_MAP, ZONES, N, P, CITY, EDGE_MARGIN, ROAD_HALF, clamp, RoadNet: RN } = ctx.__x;

// what the lattice arithmetic answered before there was a layout (the expressions 021 replaced)
const old = {
  off: (x, z) => x > CITY + EDGE_MARGIN || x < -EDGE_MARGIN || z < -EDGE_MARGIN || z > CITY + EDGE_MARGIN,
  bx: x => clamp(Math.floor(x / P), 0, N - 1),
  zone: (x, z) => ZONE_MAP[clamp(Math.floor(z / P), 0, N - 1)][clamp(Math.floor(x / P), 0, N - 1)],
  turf: (x, z) => Math.floor(clamp(Math.floor(z / P), 0, N - 1) / 2) * 6 + Math.floor(clamp(Math.floor(x / P), 0, N - 1) / 2),
  water: (x, z) => x < -ROAD_HALF - 2 || z < -ROAD_HALF - 2 || x > CITY + ROAD_HALF + 2 || z > CITY + ROAD_HALF + 2
};
// every point of a lattice that brackets the city by 60 m, 3.7 m apart, and the exact lines where an answer changes
function* samples() {
  const edge = [-EDGE_MARGIN, -ROAD_HALF - 2, -ROAD_HALF, 0, CITY, CITY + ROAD_HALF, CITY + ROAD_HALF + 2, CITY + EDGE_MARGIN], eps = [-1e-9, 0, 1e-9];
  const lines = []; for (let k = 0; k <= N; k++) lines.push(k * P); for (const e of edge) for (const d of eps) lines.push(e + d);
  for (let z = -60; z <= CITY + 60; z += 3.7) for (let x = -60; x <= CITY + 60; x += 3.7) yield [x, z];
  for (const a of lines) for (let t = -60; t <= CITY + 60; t += 9.3) { yield [a, t]; yield [t, a]; }
  for (const a of lines) for (const b of lines) yield [a, b];
}
function sameAsLattice(label) {
  let n = 0, bad = 0, first = '';
  for (const [x, z] of samples()) {
    n++;
    const p = L.at(x, z), off = p === null;
    let ok = off === old.off(x, z);
    if (ok && !off) ok = L.lx(p, x) === old.bx(x) && L.lz(p, z) === old.bx(z) && zoneKey(x, z) === old.zone(x, z) && (districtNameAt(x, z) === 'Waterfront') === old.water(x, z);
    if (ok) { const q = L.near(x, z); ok = q !== null && turfAt(x, z) === old.turf(x, z); }
    if (ok) ok = L.inCity(x, z, ROAD_HALF) === !(x < -ROAD_HALF || z < -ROAD_HALF || x > CITY + ROAD_HALF || z > CITY + ROAD_HALF);
    if (ok && x >= 0 && z >= 0 && x < CITY && z < CITY) ok = L.cellAt(x, z) === Math.floor(z / P) * N + Math.floor(x / P);
    if (!ok) { bad++; if (!first) first = `${x},${z}`; }
  }
  check(`${label}: in or off the city, the cell, the zone, the waterfront strip, the turf and the carriageway as the lattice arithmetic gave them`, bad === 0, `${n} points${bad ? ', ' + bad + ' differ, first at ' + first : ''}`);
}

// ---------------------------------------------------------------- the classic layout
check('the build starts on the classic layout: one precinct, all 144 cells, offset 0', L.id === 'classic' && L.precincts.length === 1 && L.precincts[0].ox === 0 && L.precincts[0].oz === 0 && L.sites.size === N * N);
sameAsLattice('classic');
check('far from the city is off the city, and the nearest precinct is still found', L.at(-2000, 300) === null && L.at(480, 5000) === null && L.near(-2000, 300) === L.precincts[0]);

// ---------------------------------------------------------------- cut, but nothing moved
const quad = (ox = 0, oz = 0) => [
  { id: 'nw', lx0: 0, lz0: 0, lx1: 5, lz1: 3, ox, oz }, { id: 'ne', lx0: 6, lz0: 0, lx1: 11, lz1: 3, ox, oz },
  { id: 'w', lx0: 0, lz0: 4, lx1: 1, lz1: 9, ox, oz }, { id: 'mid', lx0: 2, lz0: 4, lx1: 9, lz1: 9, ox, oz }, { id: 'e', lx0: 10, lz0: 4, lx1: 11, lz1: 11, ox, oz },
  { id: 'sw', lx0: 0, lz0: 10, lx1: 9, lz1: 11, ox, oz }];
L.use('cut-in-place', quad());
check('six precincts at one offset are a layout (neighbours on the lattice may abut)', L.precincts.length === 6 && L.sites.size === N * N);
sameAsLattice('cut in place');

// ---------------------------------------------------------------- precincts that stand apart
const apart = [
  { id: 'core', lx0: 2, lz0: 0, lx1: 9, lz1: 7, ox: 0, oz: 0 },
  { id: 'heights', lx0: 0, lz0: 0, lx1: 1, lz1: 7, ox: -6, oz: -3 },
  { id: 'docks', lx0: 10, lz0: 0, lx1: 11, lz1: 11, ox: 5, oz: 2 },
  { id: 'south', lx0: 0, lz0: 8, lx1: 9, lz1: 11, ox: 1, oz: 6 }];
L.use('apart', apart);
{
  let bad = 0, n = 0, first = '';
  // every cell: its world cell leads back to it, and every point of its frame (cells, streets, the outer strip) is its precinct's
  for (let lz = 0; lz < N; lz++) for (let lx = 0; lx < N; lx++) {
    const p = L.precinctOf(lx, lz), I = L.siteI(lx, lz), J = L.siteJ(lx, lz);
    if (L.cell(I, J) !== lz * N + lx) { bad++; if (!first) first = `cell ${lx},${lz}`; }
    for (const fx of [0, 0.01, 0.5, 0.99]) for (const fz of [0, 0.01, 0.5, 0.99]) {
      n++;
      const x = L.worldX(p, (lx + fx) * P), z = L.worldZ(p, (lz + fz) * P), q = L.at(x, z);
      const ok = q === p && L.lx(q, x) === lx && L.lz(q, z) === lz && L.cellAt(x, z) === lz * N + lx && zoneKey(x, z) === ZONE_MAP[lz][lx] && turfAt(x, z) === Math.floor(lz / 2) * 6 + Math.floor(lx / 2) &&
        Math.abs(L.latX(q, x) - (lx + fx) * P) < 1e-9 && Math.abs(L.latZ(q, z) - (lz + fz) * P) < 1e-9;
      if (!ok) { bad++; if (!first) first = `cell ${lx},${lz} at ${fx},${fz}`; }
    }
  }
  check('standing apart: every cell maps to its world cell and back, and a point in it has its lattice cell, zone and turf', bad === 0, `${n} points${bad ? ', ' + bad + ' wrong, first ' + first : ''}`);
  // the outer strip of each precinct (its edge streets' far halves and the margin) is that precinct's, clamped to its edge cells
  bad = 0; n = 0; first = '';
  for (const p of L.precincts) for (const d of [0.5, ROAD_HALF, EDGE_MARGIN]) for (let t = 0; t <= 1; t += 0.05) {
    const xs = p.x0 + (p.x1 - p.x0) * t, zs = p.z0 + (p.z1 - p.z0) * t;
    for (const [x, z, ex, ez] of [[xs, p.z0 - d, null, p.lz0], [xs, p.z1 + d, null, p.lz1], [p.x0 - d, zs, p.lx0, null], [p.x1 + d, zs, p.lx1, null]]) {
      n++;
      const q = L.at(x, z), ok = q === p && (ex === null || L.lx(q, x) === ex) && (ez === null || L.lz(q, z) === ez) && L.cellAt(x, z) === -1;
      if (!ok) { bad++; if (!first) first = `${p.id} ${x},${z}`; }
    }
    for (const [x, z] of [[xs, p.z0 - EDGE_MARGIN - 0.01], [xs, p.z1 + EDGE_MARGIN + 0.01], [p.x0 - EDGE_MARGIN - 0.01, zs], [p.x1 + EDGE_MARGIN + 0.01, zs]]) { n++; if (L.at(x, z) !== null) { bad++; if (!first) first = `${p.id} beyond the strip ${x},${z}`; } }
  }
  check('standing apart: each precinct\'s edge streets and outer strip are its own, and the ground beyond them is off the city', bad === 0, `${n} points${bad ? ', ' + bad + ' wrong, first ' + first : ''}`);
  // frames never share a point: a world point in a frame is in exactly one precinct's
  bad = 0; n = 0;
  for (let z = L.z0 - 100; z <= L.z1 + 100; z += 7.3) for (let x = L.x0 - 100; x <= L.x1 + 100; x += 7.3) {
    let c = 0; for (const p of L.precincts) if (x >= p.x0 - EDGE_MARGIN && x <= p.x1 + EDGE_MARGIN && z >= p.z0 - EDGE_MARGIN && z <= p.z1 + EDGE_MARGIN) c++;
    n++; if (c > 1 || (c === 1) !== (L.at(x, z) !== null)) bad++;
  }
  check('standing apart: no two frames share a point, and at() is in a frame exactly where one is', bad === 0, `${n} points`);
  const nodes = [[2, 0, 'core'], [10, 8, 'core'], [-6, -3, 'heights'], [-4, 5, 'heights'], [15, 2, 'docks'], [17, 14, 'docks'], [1, 14, 'south'], [11, 18, 'south']];
  check('standing apart: a street crossing belongs to the precinct whose streets cross there, and the ground between precincts has none',
    nodes.every(([I, J, id]) => { const p = L.nodeAt(I, J); return p && p.id === id; }) && L.nodeAt(12, 4) === null && L.nodeAt(-1, 0) === null && L.nodeAt(0, 10) === null);
  check('the layout describes itself in plain data', JSON.stringify(L.describe()) === JSON.stringify({ id: 'apart', precincts: apart.map(p => [p.id, p.lx0, p.lz0, p.lx1, p.lz1, p.ox, p.oz]) }));
}

// ---------------------------------------------------------------- layouts that must be refused
const refuse = (name, table, why) => { let msg = ''; try { L.use('bad', table); } catch (e) { msg = e.message; } check(`refused: ${name}`, why.test(msg), msg || 'accepted'); };
refuse('a cell left out', apart.slice(0, 3), /is in no precinct/);
refuse('a cell in two precincts', [...apart, { id: 'twice', lx0: 4, lz0: 4, lx1: 5, lz1: 5, ox: 20, oz: 20 }], /is in precincts/);
refuse('a cut on an odd line (it would split a turf)', [{ id: 'a', lx0: 0, lz0: 0, lx1: 4, lz1: 11, ox: 0, oz: 0 }, { id: 'b', lx0: 5, lz0: 0, lx1: 11, lz1: 11, ox: 9, oz: 0 }], /odd line/);
refuse('a cut through a superblock (the stadium)', [{ id: 'a', lx0: 0, lz0: 0, lx1: 7, lz1: 11, ox: 0, oz: 0 }, { id: 'b', lx0: 8, lz0: 0, lx1: 11, lz1: 11, ox: 9, oz: 0 }], /superblock stadium/);
refuse('precincts at different offsets with touching frames', [{ id: 'a', lx0: 0, lz0: 0, lx1: 11, lz1: 5, ox: 0, oz: 0 }, { id: 'b', lx0: 0, lz0: 6, lx1: 11, lz1: 11, ox: 1, oz: 0 }], /less than one cell apart/);
refuse('precincts moved onto each other', [{ id: 'a', lx0: 0, lz0: 0, lx1: 11, lz1: 5, ox: 0, oz: 0 }, { id: 'b', lx0: 0, lz0: 6, lx1: 11, lz1: 11, ox: 0, oz: -4 }], /less than one cell apart|overlap/);
refuse('a precinct off the lattice', [{ id: 'a', lx0: 0, lz0: 0, lx1: 12, lz1: 11, ox: 0, oz: 0 }], /outside the lattice/);
refuse('an offset that is not whole cells', [{ id: 'a', lx0: 0, lz0: 0, lx1: 11, lz1: 11, ox: 0.5, oz: 0 }], /whole numbers/);
let unknown = ''; try { L.use('nowhere'); } catch (e) { unknown = e.message; }
// ---------------------------------------------------------------- stage S2: the street network and the world's questions
{
  // the lattice's own street segments (as authored: inside 0..N, not swallowed by a superblock)
  const latOpen = (a, i, j) => i >= 0 && i <= N && j >= 0 && j < N && !RN.closed.has(RN.key(a, i, j));
  const tex = () => Array.from(RN.texture().image.data).join(',');
  L.use('classic');
  const tex0 = tex();
  let bad = 0, n = 0, first = '';
  for (let a = 0; a < 2; a++) for (let i = -3; i <= N + 3; i++) for (let j = -3; j <= N + 3; j++) { n++; if (RN.segOpen(a, i, j) !== latOpen(a, i, j)) { bad++; if (!first) first = `${a},${i},${j}`; } }
  for (let i = -2; i <= N + 2; i++) for (let j = -2; j <= N + 2; j++) { n++; if (RN.edgeNode(i, j) !== (i <= 0 || j <= 0 || i >= N || j >= N)) { bad++; if (!first) first = `edge ${i},${j}`; } }
  for (let z = -60; z <= CITY + 60; z += 3.7) for (let x = -60; x <= CITY + 60; x += 3.7) { n++; if (L.cellNear(x, z) !== old.bx(z) * N + old.bx(x) || L.wx(x, z) !== x || L.wz(x, z) !== z) { bad++; if (!first) first = `${x},${z}`; } }
  check('S2, classic: the street network, the edge streets, a point\'s block and lattice metres answer what the lattice did', bad === 0 && RN.I0 === 0 && RN.J0 === 0 && RN.I1 === N && RN.J1 === N && L.cx() === CITY / 2, `${n} answers${bad ? ', ' + bad + ' wrong, first ' + first : ''}`);
  L.use('apart', apart);
  bad = 0; n = 0; first = '';
  // every lattice segment exists where its precinct stands, and nothing else does
  let want = 0;
  for (const p of L.precincts) {
    for (let i = p.lx0; i <= p.lx1 + 1; i++) for (let j = p.lz0; j <= p.lz1; j++) { n++; const o = latOpen(0, i, j); want += o; if (RN.segOpen(0, i + p.ox, j + p.oz) !== o) { bad++; if (!first) first = `${p.id} v ${i},${j}`; } }
    for (let i = p.lz0; i <= p.lz1 + 1; i++) for (let j = p.lx0; j <= p.lx1; j++) { n++; const o = latOpen(1, i, j); want += o; if (RN.segOpen(1, i + p.oz, j + p.ox) !== o) { bad++; if (!first) first = `${p.id} h ${i},${j}`; } }
  }
  check('S2, apart: every precinct\'s streets stand where it does (its whole edge streets its own), and no other street exists', bad === 0 && RN.open_.size === want, `${n} segments, ${RN.open_.size} open of ${want}${bad ? ', ' + bad + ' wrong, first ' + first : ''}`);
  check('S2, apart: the ground shader\'s street texture stays in the lattice (the same bytes as classic)', tex() === tex0);
  // a point on a moved street is on a road; the old place of a moved street is not
  bad = 0; n = 0; first = '';
  for (const p of L.precincts) for (let i = p.lx0; i <= p.lx1 + 1; i++) for (let j = p.lz0; j <= p.lz1; j++) {
    const x = (i + p.ox) * P + 2, z = (j + p.oz + 0.5) * P; n++;
    if (RN.roadAt(x, z) !== latOpen(0, i, j)) { bad++; if (!first) first = `${p.id} ${i},${j}`; }
  }
  n++; if (RN.roadAt(11 * P + 2, 3.5 * P)) { bad++; if (!first) first = 'old docks street'; } // (line 10 is also the core's own east edge street)
  check('S2, apart: roadAt is true on a moved street and false where it used to be', bad === 0, `${n} points${bad ? ', ' + bad + ' wrong, first ' + first : ''}`);
  // a route inside a moved precinct is the lattice route, moved; the ground between precincts has no route
  const docks = L.precincts.find(p => p.id === 'docks');
  const r = RN.path(10 + docks.ox, 0 + docks.oz, 12 + docks.ox, 9 + docks.oz), last = r[r.length - 1];
  check('S2, apart: a route inside a moved precinct reaches its goal over its own streets', last[0] === 12 + docks.ox && last[1] === 9 + docks.oz && r.every(([i, j], k) => k === 0 || RN.open(r[k - 1][0], r[k - 1][1], i - r[k - 1][0], j - r[k - 1][1])), JSON.stringify(r));
  const nn = RN.nearNode(12 * P, 4 * P); // between core and docks
  check('S2, apart: the nearest street crossing to a point between precincts is one that has a street', nn && RN.degree(nn[0], nn[1]) > 0, JSON.stringify(nn));
  // edge streets: a crossing on any precinct's edge, not one inside
  bad = 0; n = 0; first = '';
  for (const p of L.precincts) for (let i = p.lx0; i <= p.lx1 + 1; i++) for (let j = p.lz0; j <= p.lz1 + 1; j++) {
    const own = (I, J) => L.cell(I, J) >= 0, I = i + p.ox, J = j + p.oz, edge = !(own(I - 1, J - 1) && own(I, J - 1) && own(I - 1, J) && own(I, J)); n++;
    const expect = i === p.lx0 || i === p.lx1 + 1 || j === p.lz0 || j === p.lz1 + 1;
    if (RN.edgeNode(I, J) !== edge || (edge !== expect && !(p.id === 'core' || p.id === 'heights'))) { bad++; if (!first) first = `${p.id} ${i},${j}`; }
  }
  check('S2, apart: a precinct\'s edge crossings are edge streets and its inner ones are not', bad === 0, `${n} crossings${bad ? ', ' + bad + ' wrong, first ' + first : ''}`);
  // lattice metres to world metres, a point's block, the middle of town
  bad = 0; n = 0; first = '';
  for (let lz = 0; lz < N; lz++) for (let lx = 0; lx < N; lx++) {
    const p = L.precinctOf(lx, lz), x = (lx + 0.3) * P, z = (lz + 0.7) * P, wx = L.wx(x, z), wz = L.wz(x, z); n++;
    if (wx !== x + p.ox * P || wz !== z + p.oz * P || L.cellNear(wx, wz) !== lz * N + lx || L.cellAt(wx, wz) !== lz * N + lx) { bad++; if (!first) first = `${lx},${lz}`; }
  }
  const mid = L.precinctOf(N / 2, N / 2);
  check('S2, apart: lattice metres land where their block stands, a point finds its block, the middle of town moves with its precinct', bad === 0 && L.cx() === CITY / 2 + mid.ox * P && L.cz() === CITY / 2 + mid.oz * P, `${n} points${bad ? ', ' + bad + ' wrong, first ' + first : ''}`);
  // a point in the empty ground between precincts belongs to the nearest precinct's edge cell
  const gap = L.cellNear(10.5 * P, 3.5 * P), gp = L.precinctOf(gap % N, Math.floor(gap / N));
  check('S2, apart: off every block, a point belongs to the nearest precinct\'s edge cell', gp === L.near(10.5 * P, 3.5 * P), `${gap}`);
}

check('an unknown layout name is an error', /no layout/.test(unknown));
check('a refused layout leaves the one in use untouched', L.id === 'apart' && L.precincts.length === 4);
L.use('classic');
check('every layout the build ships passes its own rules', Object.keys(CITY_LAYOUTS).every(id => { try { L.use(id); return true; } catch { return false; } }) && L.use('classic').id === 'classic', Object.keys(CITY_LAYOUTS).join(', '));
check('zones of the lattice are all known zones', ZONE_MAP.every(r => r.length === N && [...r].every(c => ZONES[c])));

console.log(`\nlayout: ${fail ? 'FAILED' : 'ALL CHECKS PASSED'}`);
process.exit(fail ? 1 : 0);
