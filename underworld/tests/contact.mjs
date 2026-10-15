/* Builds labelled contact sheets from a screenshot folder (not a test).
   Usage: node underworld/tests/contact.mjs [dir=.shots/v6] [prefix=]  → <dir>/sheet-<prefix|all>-N.png */
import { chromium } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const dir = path.resolve(here, '..', process.argv[2] || '.shots/v6'), prefix = process.argv[3] || '';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.png') && !f.startsWith('sheet-') && f.startsWith(prefix)).sort();
const per = 12, cols = 3;
const b = await chromium.launch(), page = await b.newPage({ viewport: { width: 1500, height: 1000 } });
for (let s = 0; s * per < files.length; s++) {
  const list = files.slice(s * per, s * per + per);
  const cells = list.map(f => `<figure><img src="data:image/png;base64,${fs.readFileSync(path.join(dir, f)).toString('base64')}"><figcaption>${f.replace(/\.png$/, '')}</figcaption></figure>`).join('');
  await page.setContent(`<html><body style="margin:0;background:#0b0d12;color:#e8eef6;font:13px Arial"><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;padding:8px">${cells}</div>
    <style>figure{margin:0}img{width:100%;display:block;border-radius:4px}figcaption{padding:3px 2px 0}</style></body></html>`);
  await page.waitForTimeout(200);
  const out = path.join(dir, `sheet-${prefix || 'all'}-${s + 1}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(out, list.length);
}
await b.close();
