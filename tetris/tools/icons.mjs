/* Renders icons/icon.svg to the PNG sizes the manifest and iOS need, using the
   Chromium that Playwright drives. Run: npm run icons */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './pw.mjs';

const playwright = loadPlaywright();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(ROOT, 'icons', 'icon.svg'), 'utf8');
const SIZES = [
  ['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon-180.png', 180], ['favicon-32.png', 32]
];

const browser = await playwright.chromium.launch();
const page = await browser.newPage();
for (const [name, size] of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:#05060f">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: path.join(ROOT, 'icons', name), omitBackground: false });
  console.log(`icons/${name}`);
}
await browser.close();
