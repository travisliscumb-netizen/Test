/* Contact sheet of all ten worlds. Comparing them side by side is the only way
   to see which ones are carrying their weight and which read as placeholders. */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.shots');
const { server, url } = await serve(ROOT);
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1300, height: 680 }, deviceScaleFactor: 1 })).newPage();
await page.goto(url + '/tools/blank.html', { waitUntil: 'domcontentloaded' });
const data = await page.evaluate(async (files) => {
  const imgs = await Promise.all(files.map((f) => new Promise((r) => {
    const i = new Image(); i.onload = () => r(i); i.src = '/.shots/' + f;
  })));
  const cols = 5, tw = 244, th = 528;
  const c = document.createElement('canvas');
  c.width = cols * tw + 12; c.height = 2 * th + 18;
  const g = c.getContext('2d');
  g.fillStyle = '#101218'; g.fillRect(0, 0, c.width, c.height);
  imgs.forEach((im, i) => {
    const x = (i % cols) * tw + 6, y = Math.floor(i / cols) * th + 6;
    g.drawImage(im, x, y, tw - 6, th - 6);
    g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(x, y, 26, 20);
    g.fillStyle = '#fff'; g.font = '700 13px system-ui';
    g.fillText(String(i + 1), x + 8, y + 15);
  });
  return c.toDataURL('image/png');
}, Array.from({ length: 10 }, (_, i) => `world-${String(i + 1).padStart(2, '0')}.png`));
fs.writeFileSync(path.join(OUT, 'sheet-worlds.png'), Buffer.from(data.split(',')[1], 'base64'));
await b.close(); server.close();
console.log('world sheet written');
