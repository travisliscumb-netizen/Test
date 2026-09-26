/* Render the home-screen icon from the real crew art, so the icon can never
   drift from the characters in the game. Writes assets/icon-180.png (the
   size iOS asks for); assemble.mjs embeds it. Run after changing the art:
     node tools/make-icon.mjs && npm run build */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const art = require(path.join(ROOT, 'src', '50-dinos.js'));
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = path.join(ROOT, 'assets', 'icon-180.png');
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const html = `<!DOCTYPE html><style>
  html,body{margin:0;width:180px;height:180px;overflow:hidden}
  .bg{position:absolute;inset:0;background:linear-gradient(180deg,#8FD6FF,#D8F3FF)}
  .sun{position:absolute;right:14px;top:12px;width:34px;height:34px;border-radius:50%;background:radial-gradient(circle,#FFF6B8 0 45%,#FFD23F 70%);box-shadow:0 0 16px 6px rgba(255,214,90,.6)}
  .volc{position:absolute;left:84px;bottom:28px;width:90px;height:52px;background:#B07A55;opacity:.6;clip-path:polygon(0 100%,38% 12%,46% 18%,54% 12%,62% 18%,100% 100%)}
  .ground{position:absolute;left:0;right:0;bottom:0;height:30px;background:#3FAE55;border-top:6px solid #8EE06A}
  .c{position:absolute;width:150px;height:150px;left:26px;bottom:10px}
  .c svg{width:100%;height:100%;overflow:visible;filter:drop-shadow(0 3px 3px rgba(0,0,0,.35))}
  /* the idle face only: the reactions are hidden until the game shows them */
  .eye-happy,.m-open,.m-oops,.sweat{display:none}
  .tile{position:absolute;left:14px;top:14px;width:50px;height:54px;border-radius:13px;background:#FF8A1F;
    color:#fff;font:900 38px/54px ui-rounded,"Arial Rounded MT Bold",system-ui;text-align:center;
    box-shadow:0 5px 0 #C4520A;border:3px solid #fff;transform:rotate(-10deg)}
</style><div class="bg"></div><div class="sun"></div><div class="volc"></div><div class="ground"></div>
<div class="tile">A</div>
<div class="c">${art.DINO_ART.brachio({})}</div>`;

const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.screenshot({ path: OUT });
await browser.close();
console.log('wrote ' + path.relative(process.cwd(), OUT));
