/* Renders the PWA / Home Screen icon set from src/icon.js.

   The artwork is vector, drawn in the game's own projection; it is rendered at
   4x and box-downsampled so the bevels and the 1px chamfers survive at 16px
   instead of aliasing into mush. */

import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'block-stack');
const OUT = path.join(ROOT, 'icons');

const TARGETS = [
  { file: 'favicon-16.png', size: 16 },
  { file: 'favicon-32.png', size: 32 },
  { file: 'icon-48.png', size: 48 },
  { file: 'icon-72.png', size: 72 },
  { file: 'icon-96.png', size: 96 },
  { file: 'icon-128.png', size: 128 },
  { file: 'icon-144.png', size: 144 },
  { file: 'icon-152.png', size: 152 },
  { file: 'apple-touch-icon-167.png', size: 167 },
  { file: 'apple-touch-icon-180.png', size: 180 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-256.png', size: 256 },
  { file: 'icon-384.png', size: 384 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-1024.png', size: 1024 },
  { file: 'maskable-192.png', size: 192, maskable: true },
  { file: 'maskable-512.png', size: 512, maskable: true },
  { file: 'og-cover.png', size: 512, wide: true }
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
      const bg = g.createLinearGradient(0, 0, out.width, out.height);
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
