// Render the PWA PNG icons from the SVG using the bundled Chromium.
// Usage: node tools/make-icons.mjs
import { chromium } from 'playwright';

// The pinned Chromium in this environment is at a fixed path; see README.
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
import { writeFile } from 'node:fs/promises';

const OUT = new URL('../icons/', import.meta.url).pathname;

const tile = (size, maskable) => `
<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:${size}px;height:${size}px}
  .t{width:${size}px;height:${size}px;background:#6ea8fe;display:grid;place-items:center;
     border-radius:${maskable ? 0 : Math.round(size * 0.22)}px}
  .g{font:700 ${Math.round(size * (maskable ? 0.42 : 0.56))}px/1 -apple-system,"Segoe UI",Roboto,sans-serif;color:#0b1220}
</style>
<div class="t"><div class="g">&#8354;</div></div>`;

const browser = await chromium.launch({ executablePath: EXECUTABLE });
const jobs = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
];
for (const [name, size, maskable] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(tile(size, maskable));
  await writeFile(`${OUT}${name}`, await page.screenshot({ omitBackground: false }));
  await page.close();
  console.log('wrote', name, `${size}x${size}`);
}
await browser.close();
