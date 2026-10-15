/* Renders the Underworld crest (tools/icon.svg) into the app icons with headless Chromium:
   icons/icon-1024.png (master), icon-512.png, icon-192.png (PWA, also maskable: the crest sits inside the
   80% safe zone), apple-touch-icon.png (180), favicon-32.png.
   Usage: node underworld/tools/make-icons.mjs */
import { chromium } from '../tests/lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname), out = path.resolve(dir, '..', 'icons');
fs.mkdirSync(out, { recursive: true });
const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
const b = await chromium.launch();
const page = await b.newPage();
for (const [name, size] of [['icon-1024.png', 1024], ['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180], ['favicon-32.png', 32]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:#07080c">${svg.replace('width="1024" height="1024"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path: path.join(out, name), clip: { x: 0, y: 0, width: size, height: size } });
  console.log(name, size, fs.statSync(path.join(out, name)).size, 'bytes');
}
await b.close();
