/* Generates the Math Circus icons and inline manifest, then writes them into
   math-circus-act1.html (the single-file game). Idempotent: it replaces either
   the __ICON_B64__ / __MANIFEST_B64__ placeholders or previously written values. */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'math-circus-act1.html');

/* ---- minimal PNG encoder ---- */
const CRC = (() => { const t = new Int32Array(256);
  for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t; })();
function crc32(buf){ let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba){
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++){
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, {level:9})),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
/* ---- tiny rasteriser ---- */
function makeCanvas(N){
  const buf = Buffer.alloc(N * N * 4);
  const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const put = (x, y, c, a = 1) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const i = (y * N + x) * 4;
    buf[i] = Math.round(buf[i] * (1 - a) + c[0] * a);
    buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + c[1] * a);
    buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + c[2] * a);
    buf[i + 3] = 255;
  };
  const fillAll = col => { const c = hex(col); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) put(x, y, c, 1); };
  /* supersampled polygon fill (2x2) for smooth edges */
  const poly = (pts, col) => {
    const c = hex(col);
    const P = pts.map(p => [p[0] * N, p[1] * N]);
    let minY = Math.max(0, Math.floor(Math.min(...P.map(p => p[1]))));
    let maxY = Math.min(N - 1, Math.ceil(Math.max(...P.map(p => p[1]))));
    for (let y = minY; y <= maxY; y++){
      for (let x = 0; x < N; x++){
        let hits = 0;
        for (const [sx, sy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]){
          const px = x + sx, py = y + sy;
          let inside = false;
          for (let i = 0, j = P.length - 1; i < P.length; j = i++){
            const [xi, yi] = P[i], [xj, yj] = P[j];
            if (((yi > py) !== (yj > py)) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
          }
          if (inside) hits++;
        }
        if (hits) put(x, y, c, hits / 4);
      }
    }
  };
  const rect = (x, y, w, h, col) => poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], col);
  return {buf, fillAll, poly, rect};
}
function drawIcon(N){
  const cv = makeCanvas(N);
  cv.fillAll('#12203A');
  const APEX = [0.5, 0.135], BL = [0.09, 0.80], BR = [0.91, 0.80];
  cv.poly([APEX, BR, BL], '#FFF8E7');
  const segs = 7;
  for (let i = 0; i < segs; i++){
    if (i % 2 === 0) continue;
    const x1 = BL[0] + (BR[0] - BL[0]) * (i / segs);
    const x2 = BL[0] + (BR[0] - BL[0]) * ((i + 1) / segs);
    cv.poly([APEX, [x2, BL[1]], [x1, BL[1]]], '#C41E3A');
  }
  /* doorway */
  cv.poly([[0.5, 0.42], [0.63, 0.80], [0.37, 0.80]], '#12203A');
  /* ground */
  cv.rect(0.05, 0.80, 0.90, 0.075, '#F2B705');
  /* pole + flag */
  cv.rect(0.485, 0.03, 0.03, 0.115, '#F2B705');
  cv.poly([[0.515, 0.035], [0.72, 0.075], [0.515, 0.115]], '#F2B705');
  return encodePNG(N, N, cv.buf);
}

const icon180 = drawIcon(180), icon192 = drawIcon(192), icon512 = drawIcon(512);
const b64 = b => b.toString('base64');
const manifest = {
  name:'Math Circus: Act 1', short_name:'Math Circus',
  description:'Twelve circus math games. A fan rebuild of the 1993 original.',
  start_url:'.', scope:'.', display:'standalone', orientation:'portrait',
  background_color:'#0E1626', theme_color:'#C41E3A',
  icons:[
    {src:'data:image/png;base64,' + b64(icon192), sizes:'192x192', type:'image/png', purpose:'any'},
    {src:'data:image/png;base64,' + b64(icon512), sizes:'512x512', type:'image/png', purpose:'any maskable'}
  ]
};
const manifestB64 = Buffer.from(JSON.stringify(manifest), 'utf8').toString('base64');

let html = fs.readFileSync(FILE, 'utf8');
html = html.replace(/(<link rel="manifest" href="data:application\/manifest\+json;base64,)[^"]*(")/,
  (m, a, b) => a + manifestB64 + b);
html = html.replace(/(<link rel="(?:apple-touch-icon|icon)" href="data:image\/png;base64,)[^"]*(")/g,
  (m, a, b) => a + b64(icon180) + b);
fs.writeFileSync(FILE, html);
console.log('icon180', icon180.length, 'b | manifest', manifestB64.length, 'b64 chars | html', html.length, 'b');
