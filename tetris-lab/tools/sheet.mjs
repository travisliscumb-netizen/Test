/* Contact sheet: lays several screenshots side by side (via Chromium, no
   image library) so a whole viewport's screens can be reviewed at once.
     node tools/sheet.mjs out.png a.png b.png ... */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = createRequire('/opt/node22/lib/node_modules/')('playwright'); }
const [out, ...files] = process.argv.slice(2);
const imgs = files.map((f) => `<figure><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}"><figcaption>${path.basename(f, '.png')}</figcaption></figure>`).join('');
const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
await page.setContent(`<html><body style="margin:0;background:#111;display:flex;gap:10px;padding:10px;align-items:flex-start;width:max-content">${imgs}<style>figure{margin:0;color:#aaa;font:12px sans-serif}img{display:block;max-height:${process.env.MAXH || 900}px}</style></body></html>`);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('wrote', out);
