/* Build step: rasterise the icon set from src/icon.js.

   The artwork is vector code, so the icons are generated rather than committed.
   That keeps the repository and the deploy payload to source files only, and it
   makes it impossible for the shipped icons to drift from the game's material. */

import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { drawIcon, drawSplash } from '../src/icon.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'icons');
fs.mkdirSync(OUT, { recursive: true });

const ICONS = [
  { file: 'favicon-16.png', size: 16 },
  { file: 'favicon-32.png', size: 32 },
  { file: 'icon-96.png', size: 96 },
  { file: 'apple-touch-icon-180.png', size: 180 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-256.png', size: 256 },
  { file: 'icon-512.png', size: 512 },
  { file: 'maskable-192.png', size: 192, maskable: true },
  { file: 'maskable-512.png', size: 512, maskable: true },
  { file: 'og-cover.png', size: 512, wide: true }
];

const SPLASHES = [
  [1290, 2796], [1179, 2556], [1284, 2778], [1170, 2532],
  [1125, 2436], [828, 1792], [750, 1334], [1242, 2688]
];

/* ---- PNG post-processing ------------------------------------------------
   Canvas encoders optimise for speed and dither their gradients; the dither is
   per-pixel noise PNG cannot model and it dominates the file size. Snapping
   each channel to a small step erases it with no visible change on artwork this
   smooth, Paeth predicts smooth gradients far better than the None filter the
   encoder emits, and a level-9 deflate finishes the job. */
function crc32(buf) {
  let table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function optimise(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504E47) return buf;
  const keep = [];
  const idat = [];
  let pos = 8;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IDAT') idat.push(data);
    else if (type !== 'IEND') keep.push([type, Buffer.from(data)]);
    pos += 12 + len;
  }
  if (!idat.length) return buf;
  let raw;
  try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch (e) { return buf; }

  const ihdr = keep.find(([t]) => t === 'IHDR');
  const width = ihdr ? ihdr[1].readUInt32BE(0) : 0;
  const colour = ihdr ? ihdr[1][9] : -1;
  const stride = width * 4 + 1;

  if (width && colour === 6 && raw.length % stride === 0) {
    let unfiltered = true;
    for (let o = 0; o < raw.length; o += stride) if (raw[o] !== 0) { unfiltered = false; break; }
    if (unfiltered) {
      for (let o = 0; o < raw.length; o += stride) {
        for (let i = o + 1; i < o + stride; i += 4) {
          raw[i] = Math.min(255, Math.round(raw[i] / 3) * 3);
          raw[i + 1] = Math.min(255, Math.round(raw[i + 1] / 3) * 3);
          raw[i + 2] = Math.min(255, Math.round(raw[i + 2] / 3) * 3);
        }
      }
      const rowBytes = width * 4, rows = raw.length / stride;
      const filtered = Buffer.alloc(raw.length);
      let prev = Buffer.alloc(rowBytes);
      for (let r = 0; r < rows; r++) {
        const line = raw.subarray(r * stride + 1, r * stride + 1 + rowBytes);
        filtered[r * stride] = 4;
        for (let i = 0; i < rowBytes; i++) {
          const a = i >= 4 ? line[i - 4] : 0;
          const b = prev[i];
          const c = i >= 4 ? prev[i - 4] : 0;
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          filtered[r * stride + 1 + i] = (line[i] - pred) & 0xFF;
        }
        prev = line;
      }
      raw = filtered;
    }
  }

  const packed = zlib.deflateSync(raw, { level: 9, memLevel: 9 });
  const out = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    ...keep.map(([t, d]) => chunk(t, d)),
    chunk('IDAT', packed),
    chunk('IEND', Buffer.alloc(0))
  ]);
  return out.length < buf.length ? out : buf;
}

let bytes = 0;
for (const t of ICONS) {
  const ss = Math.min(4, Math.max(1, Math.floor(2048 / t.size)));
  const big = createCanvas(t.size * ss, t.size * ss);
  drawIcon(big.getContext('2d'), t.size * ss, { maskable: t.maskable });
  const out = createCanvas(t.wide ? t.size * 2 : t.size, t.size);
  const g = out.getContext('2d');
  if (t.wide) {
    const bg = g.createLinearGradient(0, 0, 0, out.height);
    bg.addColorStop(0, '#232739'); bg.addColorStop(1, '#0A0B12');
    g.fillStyle = bg; g.fillRect(0, 0, out.width, out.height);
  }
  g.drawImage(big, t.wide ? t.size * 0.5 : 0, 0, t.size, t.size);
  const data = optimise(out.toBuffer('image/png'));
  fs.writeFileSync(path.join(OUT, t.file), data);
  bytes += data.length;
}

for (const [w, h] of SPLASHES) {
  const c = createCanvas(w, h);
  drawSplash(c.getContext('2d'), w, h);
  const data = optimise(c.toBuffer('image/png'));
  fs.writeFileSync(path.join(OUT, `splash-${w}x${h}.png`), data);
  bytes += data.length;
}

/* favicon.ico with a PNG payload -- every browser in use reads this. */
const png32 = fs.readFileSync(path.join(OUT, 'favicon-32.png'));
const ico = Buffer.alloc(22 + png32.length);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico.writeUInt8(32, 6); ico.writeUInt8(32, 7);
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png32.length, 14); ico.writeUInt32LE(22, 18);
png32.copy(ico, 22);
fs.writeFileSync(path.join(ROOT, 'favicon.ico'), ico);

console.log(`generated ${ICONS.length + SPLASHES.length} images, ${(bytes / 1024).toFixed(0)} KB`);
