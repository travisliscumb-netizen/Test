// Draws the island (022) to a PNG without a browser: heights, the shore, the roads (bridges white, the tunnel red),
// the pads. A design aid for editing ISLE_COAST / ISLE_ROADS: node underworld/tools/isle-preview.mjs [out.png] [m per px]
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import { fileURLToPath } from 'node:url';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'game');
const rd = f => fs.readFileSync(path.join(dir, f), 'utf8');
const grab = (src, name) => { const i = src.indexOf('function ' + name + '('); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } };
const util = rd('010-core-utilities.js').split('const IS_TOUCH')[0];
const code = util + '\nconst P = 80, N = 12, CITY = 960, EDGE_MARGIN = 18, CURB_H = 0.15, ROAD_HALF = 6; const TSURF = { grass: 0, dirt: 1, mud: 2, rock: 3, gravel: 4, track: 5 }; const CFS = { x0: -20, x1: 680, z0: 1040, z1: 1490 }; const VP = { x0: 1440, x1: 2380, z0: 130, z1: 910 };\n'
  + grab(rd('027-content-terrain.js'), 'tNoise') + '\n' + grab(rd('120-content-city-v2.js'), 'splinePts') + '\n' + rd('022-content-island.js') + '\nglobalThis.__isle = { Island, ISLE, SEA_Y, AIRPORT, PROVING, VP, CFS, CITY };';
new Function(code)();
const { Island, ISLE, SEA_Y, AIRPORT, PROVING, VP, CFS, CITY } = globalThis.__isle;
const out = process.argv[2] || 'isle-preview.png', S = +(process.argv[3] || 8);
let t0 = Date.now(); Island.init(); const tS = Date.now() - t0; Island.corePads(); t0 = Date.now(); Island.buildRoads(); const tR = Date.now() - t0;
const W = Math.round((ISLE.x1 - ISLE.x0) / S), H = Math.round((ISLE.z1 - ISLE.z0) / S), px = new Uint8Array(W * H * 3);
let land = 0, maxH = -99; t0 = Date.now();
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const x = ISLE.x0 + (i + 0.5) * S, z = ISLE.z0 + (j + 0.5) * S, h = Island.compute(x, z), o = (j * W + i) * 3;
  let c;
  if (h < SEA_Y) { const k = Math.max(0, 1 + (h - SEA_Y) / 5); c = [20 + 40 * k, 60 + 70 * k, 110 + 80 * k]; }
  else { land++; maxH = Math.max(maxH, h); const e = h - SEA_Y; c = e < 3.2 ? [226, 212, 160] : e < 30 ? [96 + e, 150 - e, 78] : e < 110 ? [126 + (e - 30) * 0.5, 120 + (e - 30) * 0.1, 78 + (e - 30) * 0.3] : [166 + (e - 110) * 0.4, 128 + (e - 110) * 0.6, 102 + (e - 110) * 0.8]; if (Math.floor(e / 20) !== Math.floor((Island.compute(x + S, z) - SEA_Y) / 20)) c = c.map(v => v * 0.7); }
  px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
}
const tH = Date.now() - t0;
const dot = (x, z, c, r = 0) => { const i = Math.round((x - ISLE.x0) / S), j = Math.round((z - ISLE.z0) / S); for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue; const o = (jj * W + ii) * 3; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; } };
const rect = (R, c) => { for (let x = R.x0; x <= R.x1; x += S / 2) { dot(x, R.z0, c); dot(x, R.z1, c); } for (let z = R.z0; z <= R.z1; z += S / 2) { dot(R.x0, z, c); dot(R.x1, z, c); } };
rect({ x0: 0, z0: 0, x1: CITY, z1: CITY }, [255, 255, 0]); rect(VP, [255, 120, 60]); rect(CFS, [200, 160, 60]); rect(AIRPORT, [255, 255, 255]); rect(PROVING, [255, 0, 255]);
for (const R of Island.roads) { R.pts.forEach((p, k) => dot(p[0], p[1], R.sp[k] === 2 ? [255, 0, 0] : R.sp[k] === 1 ? [255, 255, 255] : [30, 30, 30])); if (R.ring) dot(R.ring.x, R.ring.z, [0, 255, 255], 1); }
// PNG
const raw = Buffer.alloc((W * 3 + 1) * H); for (let j = 0; j < H; j++) { raw[j * (W * 3 + 1)] = 0; Buffer.from(px.buffer, j * W * 3, W * 3).copy(raw, j * (W * 3 + 1) + 1); }
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = b => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const b = Buffer.alloc(8 + d.length + 4); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`sdf ${tS} ms, roads ${tR} ms, heights ${tH} ms (${(tH / W / H * 1000).toFixed(2)} us each); land ${(land * S * S / 1e6).toFixed(1)} km2, highest ${maxH.toFixed(0)} m`);
for (const R of Island.roads) { let g = 0, lo = 1e9, hi = -1e9, off = 0; for (let k = 1; k < R.pts.length; k++) { g = Math.max(g, Math.abs(R.y[k] - R.y[k - 1]) / (R.cum[k] - R.cum[k - 1])); lo = Math.min(lo, R.y[k]); hi = Math.max(hi, R.y[k]); } for (let k = 0; k < R.pts.length; k++) if (!R.sp[k]) off = Math.max(off, Math.abs(R.y[k] - Island.base0(R.pts[k][0], R.pts[k][1]))); console.log(R.id.padEnd(3), R.name.padEnd(22), (R.len / 1000).toFixed(2) + ' km', 'y', lo.toFixed(1), '..', hi.toFixed(1), 'max grade', (g * 100).toFixed(1) + '%', 'max cut/fill', off.toFixed(1), 'bridges', JSON.stringify(R.bridges.map(b => Math.round(R.cum[b[1]] - R.cum[b[0]]))), R.tunnel ? 'tunnel ' + Math.round(R.cum[R.tunnel[1]] - R.cum[R.tunnel[0]]) + ' m' : ''); }
// where each road's deepest cut or highest fill is
for (const R of Island.roads) { let m = 0, at = 0; for (let k = 0; k < R.pts.length; k++) if (!R.sp[k]) { const d = R.y[k] - Island.base0(R.pts[k][0], R.pts[k][1]); if (Math.abs(d) > Math.abs(m)) { m = d; at = k; } } console.log(R.id, 'worst', m.toFixed(1), 'm at', R.pts[at].map(Math.round).join(','), 'along', Math.round(R.cum[at])); }
// where the ground on a road's centre line is furthest from the road's own level, and where it is least level across
if (process.env.ISLE_BEDS) for (const R of Island.roads) {
  let c = [0, 0], x = [0, 0];
  for (let k = 2; k < R.pts.length - 2; k++) {
    const p = R.pts[k]; if (R.sp[k] || R.sp[k - 1] || R.sp[k + 1] || (p[0] > -30 && p[1] > -30 && p[0] < 990 && p[1] < 990)) continue;
    const a = R.pts[k - 1], b = R.pts[k + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = (b[1] - a[1]) / l, nz = -(b[0] - a[0]) / l, w = R.w / 2 - 1.5;
    const h0 = Island.height(p[0], p[1], R.y[k] + 1), hl = Island.height(p[0] + nx * w, p[1] + nz * w, R.y[k] + 1), hr = Island.height(p[0] - nx * w, p[1] - nz * w, R.y[k] + 1);
    if (Math.abs(h0 - R.y[k]) > c[0]) c = [Math.abs(h0 - R.y[k]), k]; if (Math.abs(hl - hr) > x[0]) x = [Math.abs(hl - hr), k];
  }
  console.log(R.id, 'centre', c[0].toFixed(3), 'at k', c[1], R.pts[c[1]].map(Math.round).join(','), 'of', R.pts.length, '| cross', x[0].toFixed(3), 'at k', x[1], R.pts[x[1]].map(Math.round).join(','));
}
if (process.env.ISLE_DBG) { const R = Island.roads.find(r => r.id === process.env.ISLE_DBG); for (let k = 0; k < 20; k++) { const p = R.pts[k]; Island._nearRoad(Island._seg, p[0], p[1]); console.log(k, p.map(v => v.toFixed(1)).join(','), 'y', R.y[k].toFixed(2), 'compute', Island.compute(p[0], p[1]).toFixed(2), 'tile', Island.height(p[0], p[1], R.y[k] + 1).toFixed(2), 'sel', Island._rr.id, 'd', Island._rd.toFixed(1)); } }
// the sharpest turn between consecutive samples of each road (the roads suite wants under 0.175 rad)
for (const R of Island.roads) { let m = 0, at = 0; for (let k = 1; k < R.pts.length - 1; k++) { const a = R.pts[k - 1], b = R.pts[k], c = R.pts[k + 1], t = Math.abs(Math.atan2((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]), (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]))); if (t > m) { m = t; at = k; } } console.log(R.id, 'kink', m.toFixed(3), 'at', R.pts[at].map(Math.round).join(',')); }
