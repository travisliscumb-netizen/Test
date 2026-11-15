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
  '\n;globalThis.__x = { CityLayout, CITY_LAYOUTS, zoneKey, districtNameAt, turfAt, ZONE_MAP, ZONES, SUPERBLOCKS, N, P, CITY, EDGE_MARGIN, ROAD_HALF, clamp };';
const ctx = vm.createContext({ console, Math, Number, Int8Array, Map, Set, Infinity });
vm.runInContext(code, ctx, { filename: 'layout-under-test.js' });
const { CityLayout: L, CITY_LAYOUTS, zoneKey, districtNameAt, turfAt, ZONE_MAP, ZONES, N, P, CITY, EDGE_MARGIN, ROAD_HALF, clamp } = ctx.__x;

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
check('an unknown layout name is an error', /no layout/.test(unknown));
check('a refused layout leaves the one in use untouched', L.id === 'apart' && L.precincts.length === 4);
L.use('classic');
check('every layout the build ships passes its own rules', Object.keys(CITY_LAYOUTS).every(id => { try { L.use(id); return true; } catch { return false; } }) && L.use('classic').id === 'classic', Object.keys(CITY_LAYOUTS).join(', '));
check('zones of the lattice are all known zones', ZONE_MAP.every(r => r.length === N && [...r].every(c => ZONES[c])));

console.log(`\nlayout: ${fail ? 'FAILED' : 'ALL CHECKS PASSED'}`);
process.exit(fail ? 1 : 0);
