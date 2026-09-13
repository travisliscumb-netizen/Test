/* Renders the PWA / Home Screen icon set from src/icon.js.

   The artwork is vector, drawn in the game's own projection; it is rendered at
   4x and box-downsampled so the bevels and the 1px chamfers survive at 16px
   instead of aliasing into mush. */

import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'block-stack');
const OUT = path.join(ROOT, 'icons');

const TARGETS = [
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

/* iOS launch images. Portrait only -- the game is portrait only. */
const SPLASHES = [
  [1290, 2796], [1179, 2556], [1284, 2778], [1170, 2532],
  [1125, 2436], [828, 1792], [750, 1334], [1242, 2688]
];

const { server, url } = await serve(ROOT);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
await page.goto(url + '/index.html', { waitUntil: 'domcontentloaded' });

fs.mkdirSync(OUT, { recursive: true });

for (const t of TARGETS) {
  const data = await page.evaluate(async ({ size, maskable, wide }) => {
    const { drawIcon } = await import('./src/icon.js');
    const SS = Math.min(4, Math.max(1, Math.floor(2048 / size)));
    const big = document.createElement('canvas');
    big.width = size * SS; big.height = size * SS;
    drawIcon(big.getContext('2d'), size * SS, { maskable });
    const out = document.createElement('canvas');
    if (wide) { out.width = size * 2; out.height = size; } else { out.width = size; out.height = size; }
    const g = out.getContext('2d');
    if (wide) {
      const bg = g.createLinearGradient(0, 0, 0, out.height);
      bg.addColorStop(0, '#232739'); bg.addColorStop(1, '#0A0B12');
      g.fillStyle = bg; g.fillRect(0, 0, out.width, out.height);
    }
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(big, wide ? size * 0.5 : 0, 0, size, size);
    return out.toDataURL('image/png');
  }, t);
  fs.writeFileSync(path.join(OUT, t.file), Buffer.from(data.split(',')[1], 'base64'));
  console.log('wrote', t.file);
}

for (const [w, h] of SPLASHES) {
  const data = await page.evaluate(async ({ w, h }) => {
    const { drawSplash } = await import('./src/icon.js');
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    drawSplash(c.getContext('2d'), w, h);
    return c.toDataURL('image/png');
  }, { w, h });
  fs.writeFileSync(path.join(OUT, `splash-${w}x${h}.png`), Buffer.from(data.split(',')[1], 'base64'));
  console.log('wrote', `splash-${w}x${h}.png`);
}

/* Chrome's canvas PNG encoder optimises for speed, not size: a flat launch
   image that should be ~17 KB comes out at ~292 KB. Re-deflating the pixel
   stream at maximum level is lossless -- identical pixels, a fraction of the
   bytes -- and it pays off on every icon, not just the launch images. */
function crc32(buf) {
  let c, table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
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

function recompressPng(file) {
  const src = fs.readFileSync(file);
  if (src.length < 8 || src.readUInt32BE(0) !== 0x89504E47) return 0;
  const keep = [];
  const idat = [];
  let pos = 8;
  while (pos + 8 <= src.length) {
    const len = src.readUInt32BE(pos);
    const type = src.toString('ascii', pos + 4, pos + 8);
    const data = src.subarray(pos + 8, pos + 8 + len);
    if (type === 'IDAT') idat.push(data);
    else if (type !== 'IEND') keep.push([type, Buffer.from(data)]);
    pos += 12 + len;
  }
  if (!idat.length) return 0;
  let raw;
  try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch (e) { return 0; }
  const packed = zlib.deflateSync(raw, { level: 9, memLevel: 9, strategy: zlib.constants.Z_DEFAULT_STRATEGY });
  if (packed.length >= Buffer.concat(idat).length) return 0;
  const out = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    ...keep.map(([t, d]) => chunk(t, d)),
    chunk('IDAT', packed),
    chunk('IEND', Buffer.alloc(0))
  ]);
  const saved = src.length - out.length;
  fs.writeFileSync(file, out);
  return saved;
}

let saved = 0;
for (const f of fs.readdirSync(OUT)) {
  if (f.endsWith('.png')) saved += recompressPng(path.join(OUT, f));
}
console.log(`recompressed icons, saved ${(saved / 1048576).toFixed(2)} MB`);

/* favicon.ico with a PNG payload -- every browser in use reads this. */
const png32 = fs.readFileSync(path.join(OUT, 'favicon-32.png'));
const ico = Buffer.alloc(22 + png32.length);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico.writeUInt8(32, 6); ico.writeUInt8(32, 7); ico.writeUInt8(0, 8); ico.writeUInt8(0, 9);
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png32.length, 14); ico.writeUInt32LE(22, 18);
png32.copy(ico, 22);
fs.writeFileSync(path.join(ROOT, 'favicon.ico'), ico);
console.log('wrote favicon.ico');

await browser.close();
server.close();
