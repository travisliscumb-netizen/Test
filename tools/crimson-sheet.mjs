/* Renders every pose of every Crimson Realm fighter onto one contact sheet,
   for eyeballing the art and the skeleton. Not part of the shipped game. */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'crimson-realm');
const OUT = process.argv[2] || path.join(ROOT, '..', '.shots', 'crimson-poses.png');
const only = process.argv[3] ? process.argv[3].split(',') : null;
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const { server, url } = await serve(ROOT);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url + '/__blank');
const data = await page.evaluate(async (only) => {
  const { FIGHTERS, STAGES } = await import('/src/config.js');
  const { POSES, solve, scaledBody, groundOffset } = await import('/src/skeleton.js');
  const { drawFighter, drawShadow } = await import('/src/fighter-art.js');
  const ids = Object.keys(FIGHTERS);
  const poses = only || Object.keys(POSES);
  const cw = 230, ch = 360;
  const c = document.createElement('canvas');
  c.width = cw * poses.length; c.height = ch * ids.length;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2c36'; g.fillRect(0, 0, c.width, c.height);
  const light = { key: STAGES.temple.key, rim: STAGES.temple.rim, ambient: STAGES.temple.ambient };
  ids.forEach((id, row) => {
    const def = FIGHTERS[id];
    const body = scaledBody(def);
    poses.forEach((name, col) => {
      const p = { ...POSES[name] };
      p.oy = groundOffset(p, body);
      const f = { def, body, skel: solve(p, body, {}), x: 0, y: 0, facing: 1, flash: 0, alpha: 1, side: 0, state: 'idle', vx: 0, hidden: false };
      g.save();
      g.translate(col * cw + cw / 2, row * ch + ch - 30);
      g.strokeStyle = '#555'; g.beginPath(); g.moveTo(-cw / 2, 0); g.lineTo(cw / 2, 0); g.stroke();
      drawShadow(g, f, light);
      for (let i = 0; i < 40; i++) drawFighter(g, f, light, { time: i / 60 });
      g.restore();
      g.fillStyle = '#fff'; g.font = '14px sans-serif';
      g.fillText(id + ' ' + name, col * cw + 6, row * ch + 16);
    });
  });
  return c.toDataURL('image/png');
}, only);
fs.writeFileSync(OUT, Buffer.from(data.split(',')[1], 'base64'));
console.log('wrote', OUT, errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no errors');
await browser.close();
server.close();
