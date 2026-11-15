/* City siting (CITY_SPREAD.md S5): where on the island a precinct of the lattice could stand. No browser: the
   island (022) is run as isle-preview runs it, and its NATURAL ground (before any pad) is read under every place a
   precinct's frame could be put, on the island's 80 m grid.

     node underworld/tools/city-siting.mjs                      candidates for each precinct of the draft cut
     node underworld/tools/city-siting.mjs out.png [m per px]   and draw the layout in LAYOUT below over the island
     SITING_JSON=out.json                                       also write the heights and the layout (for a picture)
     SITING_SET="docks=13,21;industry=10,22"                    try other offsets; SITING_AREAS=1 the best site per 640 m square

   A site is good when the frame is dry land (a waterfront precinct may be wet along one side), low and nearly
   level (a district sits on a level pad at city height: relief is how much hill would be cut or filled), clear of
   the airport, the proving ground, Cedar Fields South, Valen Point and the lake, and clear of the other precincts.
   This prints the candidates; choosing among them is a design decision (the owner signs the picture off). */
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import { fileURLToPath } from 'node:url';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'game');
const rd = f => fs.readFileSync(path.join(dir, f), 'utf8');
const grab = (src, name) => { const i = src.indexOf('function ' + name + '('); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } };
const util = rd('010-core-utilities.js').split('const IS_TOUCH')[0];
const code = util + '\nconst P = 80, N = 12, CITY = 960, EDGE_MARGIN = 18, CURB_H = 0.15, ROAD_HALF = 6; const TSURF = { grass: 0, dirt: 1, mud: 2, rock: 3, gravel: 4, track: 5 }; const CFS = { x0: -20, x1: 680, z0: 1040, z1: 1490 }; const VP = { x0: 1440, x1: 2380, z0: 130, z1: 910 };\n'
  + grab(rd('027-content-terrain.js'), 'tNoise') + '\n' + grab(rd('120-content-city-v2.js'), 'splinePts') + '\n' + rd('022-content-island.js') + '\nglobalThis.__isle = { Island, ISLE, SEA_Y, AIRPORT, PROVING, LAKE, VP, CFS, CITY };';
new Function(code)();
const { Island, ISLE, SEA_Y, AIRPORT, PROVING, LAKE, VP, CFS } = globalThis.__isle;
Island.init(); Island.corePads(); Island.buildRoads();
const P = 80, E = 24;   // a frame reaches 24 m outside its cells (the edge street's far kerb and the strip beyond)

// The draft cut of the lattice (CITY_SPREAD.md §3) and where each precinct stands: [id, lx0, lz0, lx1, lz1, ox, oz, name].
// The idea: Valen Bay becomes the city's harbour and the city wraps round it (the Heights on its north shore, the core
// on the waist, Linden Hills and the Nightlife and Stadium districts along its south shore, the port and the industry
// on the west coast where the Blackgate Bridge lands). Offsets are whole cells. The core, the west of the Old Quarter and Linden Hills with the farm (the Cedar Fields land
// bridge hangs off its south street; a new game starts at its safehouse) stay where the city was built.
const LAYOUT = [
  ['core', 2, 0, 9, 7, 0, 0, 'Financial District, Downtown, Greenway Park, Old Quarter'],
  ['oldwest', 0, 4, 1, 7, 0, 0, 'Old Quarter (west)'],
  ['linden', 0, 8, 3, 11, 0, 0, 'Linden Hills and Cedar Fields farm'],
  ['heights', 0, 0, 1, 3, -8, -6, 'Crestmoor Heights'],
  ['south', 4, 8, 9, 11, -12, 4, 'Nightlife Strip, Stadium District, Warehouse District'],
  ['industry', 10, 0, 11, 5, -25, 12, 'Industrial Belt'],
  ['docks', 10, 6, 11, 11, -25, 12, 'Docklands and the Container Terminal']
];
// SITING_SET="industry=10,22;docks=13,21": try other offsets without editing the table
for (const kv of (process.env.SITING_SET || '').split(';').filter(Boolean)) { const [id, v] = kv.split('='), p = LAYOUT.find(q => q[0] === id), [ox, oz] = v.split(',').map(Number); if (!p || !Number.isInteger(ox) || !Number.isInteger(oz)) throw new Error('SITING_SET: ' + kv); p[5] = ox; p[6] = oz; }
const KEEP = [[AIRPORT, 100, 'the airport'], [PROVING, 60, 'the proving ground'], [CFS, 40, 'Cedar Fields South'], [VP, 60, 'Valen Point']];
const frame = (p, ox, oz) => ({ x0: (p[1] + ox) * P - E, z0: (p[2] + oz) * P - E, x1: (p[3] + 1 + ox) * P + E, z1: (p[4] + 1 + oz) * P + E });
const hit = (a, b, m = 0) => a.x0 - m < b.x1 && a.x1 + m > b.x0 && a.z0 - m < b.z1 && a.z1 + m > b.z0;
// the natural ground under a frame, a sample every 16 m: how much is dry, its lowest, mean and highest, and which sides are wet
function survey(F) {
  let n = 0, dry = 0, lo = 1e9, hi = -1e9, sum = 0; const wet = { n: 0, s: 0, w: 0, e: 0 };
  for (let z = F.z0; z <= F.z1 + 0.01; z += 16) for (let x = F.x0; x <= F.x1 + 0.01; x += 16) {
    const h = Island.nat(x, z); n++;
    if (h > SEA_Y + 0.35) { dry++; lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h; }
    else { if (z < F.z0 + 40) wet.n++; if (z > F.z1 - 40) wet.s++; if (x < F.x0 + 40) wet.w++; if (x > F.x1 - 40) wet.e++; }
  }
  const lk = (F.x0 + F.x1) / 2 - LAKE.x, lz = (F.z0 + F.z1) / 2 - LAKE.z;
  return { dry: dry / n, lo, hi, mean: dry ? sum / dry : 0, relief: dry ? hi - lo : 99, wet, lake: Math.hypot(lk / LAKE.rx, lz / LAKE.rz) < 2.2 };
}
const roadD = F => { let best = 1e9; const cx = (F.x0 + F.x1) / 2, cz = (F.z0 + F.z1) / 2; for (const R of Island.roads) for (let k = 0; k < R.pts.length; k += 8) best = Math.min(best, Math.hypot(Math.max(F.x0 - R.pts[k][0], 0, R.pts[k][0] - F.x1), Math.max(F.z0 - R.pts[k][1], 0, R.pts[k][1] - F.z1))); return best; };

const stay = LAYOUT.filter(p => p[5] === 0 && p[6] === 0).map(p => frame(p, 0, 0));
console.log('The layout in LAYOUT, as it stands on the natural ground:');
for (const p of LAYOUT) {
  const F = frame(p, p[5], p[6]), s = survey(F), bad = [];
  for (const [R, m, name] of KEEP) if (hit(F, R, m)) bad.push('on ' + name);
  for (const q of LAYOUT) if (q !== p && (q[5] !== p[5] || q[6] !== p[6]) && hit(F, frame(q, q[5], q[6]), P - 2 * E)) bad.push('too close to ' + q[0]);
  if (s.lake) bad.push('in the lake');
  console.log(`  ${p[0].padEnd(9)} cells ${p[1]},${p[2]}..${p[3]},${p[4]} at ${String(p[5]).padStart(3)},${String(p[6]).padStart(3)}  x ${F.x0 + E}..${F.x1 - E} z ${F.z0 + E}..${F.z1 - E}  dry ${(s.dry * 100).toFixed(0)}%  ground ${s.lo.toFixed(1)}..${s.hi.toFixed(1)} m (relief ${s.relief.toFixed(1)})  road ${roadD(F).toFixed(0)} m  ${bad.length ? 'PROBLEM: ' + bad.join(', ') : 'ok'}`);
}
if (!process.argv[2] || process.env.SITING_ALL) {
  console.log('\nCandidates (dry at least 97%, or 80% with the water along one side; relief under 12 m; clear of everything kept and of the precincts that stay), best first:');
  for (const p of LAYOUT) {
    if (p[5] === 0 && p[6] === 0) continue;
    const out = [];
    for (let oz = -40; oz <= 36; oz++) for (let ox = -32; ox <= 36; ox++) {
      const F = frame(p, ox, oz);
      if (F.x0 < ISLE.x0 + 100 || F.z0 < ISLE.z0 + 100 || F.x1 > ISLE.x1 - 100 || F.z1 > ISLE.z1 - 100) continue;
      if (KEEP.some(([R, m]) => hit(F, R, m)) || stay.some(S => hit(F, S, P - 2 * E))) continue;
      const s = survey(F); if (s.lake || s.relief > 12 || s.dry < 0.8) continue;
      const sides = ['n', 's', 'w', 'e'].filter(k => s.wet[k] > 0);
      if (s.dry < 0.97 && sides.length > 2) continue;
      out.push({ ox, oz, s, sides, road: roadD(F), score: s.relief + s.mean * 0.4 + roadD(F) / 120 + (1 - s.dry) * 6 });
    }
    out.sort((a, b) => a.score - b.score);
    console.log(`  ${p[0]} (${p[3] - p[1] + 1} x ${p[4] - p[2] + 1} cells): ${out.length} sites`);
    // SITING_AREAS=1: the best site in each 640 m square of the island instead (the list above crowds into the flattest plain)
    const shown = process.env.SITING_AREAS ? [...out.reduce((m, c) => { const k = Math.floor((p[1] + c.ox) * P / 640) + ',' + Math.floor((p[2] + c.oz) * P / 640); if (!m.has(k)) m.set(k, c); return m; }, new Map()).values()] : out.slice(0, +process.env.SITING_TOP || 14);
    for (const c of shown) console.log(`     at ${String(c.ox).padStart(3)},${String(c.oz).padStart(3)}  x ${(p[1] + c.ox) * P}..${(p[3] + 1 + c.ox) * P} z ${(p[2] + c.oz) * P}..${(p[4] + 1 + c.oz) * P}  dry ${(c.s.dry * 100).toFixed(0)}%  ground ${c.s.lo.toFixed(1)}..${c.s.hi.toFixed(1)}  relief ${c.s.relief.toFixed(1)}  road ${c.road.toFixed(0)} m  water ${c.sides.join('') || '-'}`);
  }
}
// ---------------------------------------------------------------- the picture
if (process.argv[2]) {
  const out = process.argv[2], S = +(process.argv[3] || 4), W = Math.round((ISLE.x1 - ISLE.x0) / S), H = Math.round((ISLE.z1 - ISLE.z0) / S), px = new Uint8Array(W * H * 3);
  const hs = process.env.SITING_JSON ? new Float32Array(W * H) : null;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const h = Island.nat(ISLE.x0 + (i + 0.5) * S, ISLE.z0 + (j + 0.5) * S), o = (j * W + i) * 3; if (hs) hs[j * W + i] = h;
    let c; if (h < SEA_Y) { const k = Math.max(0, 1 + (h - SEA_Y) / 5); c = [20 + 40 * k, 60 + 70 * k, 110 + 80 * k]; }
    else { const e = h - SEA_Y; c = e < 3.2 ? [226, 212, 160] : e < 30 ? [96 + e, 150 - e, 78] : e < 110 ? [126 + (e - 30) * 0.5, 120 + (e - 30) * 0.1, 78 + (e - 30) * 0.3] : [166 + (e - 110) * 0.4, 128 + (e - 110) * 0.6, 102 + (e - 110) * 0.8]; }
    px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
  }
  const dot = (x, z, c) => { const i = Math.round((x - ISLE.x0) / S), j = Math.round((z - ISLE.z0) / S); if (i < 0 || j < 0 || i >= W || j >= H) return; const o = (j * W + i) * 3; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; };
  const rect = (R, c, t = 1) => { for (let k = 0; k < t; k++) { for (let x = R.x0; x <= R.x1; x += S / 2) { dot(x, R.z0 + k * S, c); dot(x, R.z1 - k * S, c); } for (let z = R.z0; z <= R.z1; z += S / 2) { dot(R.x0 + k * S, z, c); dot(R.x1 - k * S, z, c); } } };
  for (const R of Island.roads) for (const p of R.pts) dot(p[0], p[1], [30, 30, 30]);
  rect({ x0: 0, z0: 0, x1: 960, z1: 960 }, [255, 255, 0]); rect(VP, [255, 120, 60]); rect(CFS, [200, 160, 60]); rect(AIRPORT, [255, 255, 255]); rect(PROVING, [255, 0, 255]);
  const COL = [[230, 60, 60], [230, 60, 60], [240, 200, 60], [240, 140, 40], [60, 210, 200], [120, 220, 110], [220, 90, 240]];
  LAYOUT.forEach((p, k) => { const F = frame(p, p[5], p[6]); rect({ x0: F.x0 + E, z0: F.z0 + E, x1: F.x1 - E, z1: F.z1 - E }, COL[k % COL.length], 3); for (let lx = p[1]; lx <= p[3] + 1; lx++) for (let z = (p[2] + p[6]) * P; z <= (p[4] + 1 + p[6]) * P; z += S) dot((lx + p[5]) * P, z, COL[k % COL.length]); for (let lz = p[2]; lz <= p[4] + 1; lz++) for (let x = (p[1] + p[5]) * P; x <= (p[3] + 1 + p[5]) * P; x += S) dot(x, (lz + p[6]) * P, COL[k % COL.length]); });
  const raw = Buffer.alloc((W * 3 + 1) * H); for (let j = 0; j < H; j++) { raw[j * (W * 3 + 1)] = 0; Buffer.from(px.buffer, j * W * 3, W * 3).copy(raw, j * (W * 3 + 1) + 1); }
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = b => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const b = Buffer.alloc(8 + d.length + 4); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
  fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  console.log('drawn', out, W + ' x ' + H);
  if (hs) fs.writeFileSync(process.env.SITING_JSON, JSON.stringify({ S, W, H, x0: ISLE.x0, z0: ISLE.z0, sea: SEA_Y, layout: LAYOUT, keep: { airport: AIRPORT, proving: PROVING, cfs: CFS, vp: VP, lake: LAKE }, roads: Island.roads.map(R => ({ name: R.name, pts: R.pts.filter((_, k) => k % 6 === 0) })), h: Buffer.from(hs.buffer).toString('base64') }));
}
