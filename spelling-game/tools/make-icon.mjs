/* Render the home-screen icon from the real character art, so the icon can
   never drift from the characters in the game. Writes assets/icon-180.png
   (the size iOS asks for); assemble.mjs embeds it. Run after changing the
   art:  node tools/make-icon.mjs && npm run build */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const art = require(path.join(ROOT, 'src', '50-art.js'));
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = path.join(ROOT, 'assets', 'icon-180.png');
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const html = `<!DOCTYPE html><style>
  html,body{margin:0;width:180px;height:180px;overflow:hidden}
  .bg{position:absolute;inset:0;background:linear-gradient(160deg,#58B2FF 0%,#1E6FE8 70%)}
  .ground{position:absolute;left:0;right:0;bottom:0;height:34px;background:#F2D7A8;border-top:5px solid #E6BF7E}
  .c{position:absolute;width:118px;height:118px}
  .c svg{width:100%;height:100%;overflow:visible;filter:drop-shadow(0 3px 3px rgba(9,30,66,.3))}
  /* the idle face only: the reactions are hidden until the game shows them */
  .eye-happy,.m-open,.m-oops,.sweat{display:none}
  .blip{left:-8px;top:24px;transform:rotate(-8deg)}
  .zip{right:-10px;top:40px}
  .tile{position:absolute;left:64px;top:14px;width:52px;height:56px;border-radius:13px;background:#FF8A1F;
    color:#fff;font:900 40px/56px ui-rounded,"Arial Rounded MT Bold",system-ui;text-align:center;
    box-shadow:0 5px 0 #C4520A;border:3px solid #fff;transform:rotate(8deg)}
</style><div class="bg"></div><div class="ground"></div>
<div class="tile">A</div>
<div class="c blip">${art.CHAR_ART.blip()}</div><div class="c zip">${art.CHAR_ART.zip()}</div>`;

const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.screenshot({ path: OUT });
await browser.close();
console.log('wrote ' + path.relative(process.cwd(), OUT));
