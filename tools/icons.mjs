/* Renders the app icons and the social preview from the game's own vector
   sprites, in headless Chromium, so the icons can never drift from the art.
   Usage: node tools/icons.mjs */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'icons');
fs.mkdirSync(OUT, { recursive: true });

const JOBS = [
  { file: 'favicon-16.png', w: 16, h: 16, kind: 'tiny' },
  { file: 'favicon-32.png', w: 32, h: 32, kind: 'tiny' },
  { file: 'apple-touch-icon-180.png', w: 180, h: 180, kind: 'full' },
  { file: 'icon-192.png', w: 192, h: 192, kind: 'rounded' },
  { file: 'icon-512.png', w: 512, h: 512, kind: 'rounded' },
  { file: 'maskable-192.png', w: 192, h: 192, kind: 'full' },
  { file: 'maskable-512.png', w: 512, h: 512, kind: 'full' },
  { file: 'og-cover.png', w: 1200, h: 630, kind: 'cover' }
];

const { server, url } = await serve(ROOT);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${url}/sw.js`);

const results = await page.evaluate(async (jobs) => {
  const face = new FontFace('Press Start 2P', 'url(/src/fonts/press-start-2p-latin.woff2)');
  document.fonts.add(await face.load());
  const { drawPac, drawGhost, COLORS } = await import('/src/sprites.js');

  const rounded = (g, x, y, w, h, r) => {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };
  const backdrop = (g, w, h) => {
    const grd = g.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    grd.addColorStop(0, '#16205a');
    grd.addColorStop(0.6, '#080b24');
    grd.addColorStop(1, '#03040c');
    return grd;
  };
  const glow = (g, x, y, r, color) => {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, color);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };

  /* Pac-Man chasing a dot with Blinky behind, in a 32-unit square. */
  const scene = (g, u, ox, oy, simple) => {
    g.save();
    g.translate(ox, oy);
    g.scale(u, u);
    glow(g, 13, 16, 16, 'rgba(255, 210, 40, 0.35)');
    if (!simple) {
      g.fillStyle = '#ffd9c4';
      g.beginPath(); g.arc(27.2, 16, 1.6, 0, Math.PI * 2); g.fill();
    }
    drawPac(g, simple ? 16 : 13.5, 16, simple ? 13 : 10.5, 0.7, 3);
    g.restore();
  };

  const out = {};
  for (const job of jobs) {
    const c = document.createElement('canvas');
    c.width = job.w; c.height = job.h;
    const g = c.getContext('2d');
    const { w, h } = job;
    if (job.kind === 'cover') {
      g.fillStyle = backdrop(g, w, h);
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(61, 99, 255, 0.9)';
      g.shadowColor = 'rgba(61, 99, 255, 0.9)';
      g.shadowBlur = 18;
      g.lineWidth = 5;
      rounded(g, 40, 40, w - 80, h - 80, 46);
      g.stroke();
      g.lineWidth = 2;
      g.strokeStyle = '#b8c8ff';
      g.shadowBlur = 0;
      rounded(g, 52, 52, w - 104, h - 104, 36);
      g.stroke();
      g.font = '96px "Press Start 2P"';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const tg = g.createLinearGradient(0, 150, 0, 260);
      tg.addColorStop(0, '#fffbd0'); tg.addColorStop(0.4, '#ffe94a'); tg.addColorStop(1, '#e08a00');
      g.fillStyle = '#6a3a00';
      g.fillText('PAC-MAN', w / 2, 218);
      g.fillStyle = tg;
      g.shadowColor = 'rgba(255, 200, 30, 0.6)';
      g.shadowBlur = 30;
      g.fillText('PAC-MAN', w / 2, 210);
      g.shadowBlur = 0;
      g.font = '22px "Press Start 2P"';
      g.fillStyle = '#2ee8ff';
      g.fillText('ARCADE EDITION', w / 2, 292);
      /* Row spans units 28..213; centre it on the card. */
      const y = 430, u = 5;
      g.save(); g.translate(w / 2 - 120.5 * u, y); g.scale(u, u);
      for (let i = 0; i < 7; i++) { g.fillStyle = '#ffd9c4'; g.beginPath(); g.arc(30 + i * 9, 0, 1.1, 0, Math.PI * 2); g.fill(); }
      glow(g, 112, 0, 22, 'rgba(255, 210, 40, 0.35)');
      drawPac(g, 112, 0, 9, 0.7, 1);
      ['blinky', 'pinky', 'inky', 'clyde'].forEach((n, i) => {
        glow(g, 145 + i * 20, 0, 14, 'rgba(120, 140, 255, 0.18)');
        drawGhost(g, 145 + i * 20, 0, { color: COLORS.ghost[n], dir: 1, t: i * 1.3 });
      });
      g.restore();
    } else {
      if (job.kind === 'rounded') {
        rounded(g, 0, 0, w, h, w * 0.22);
        g.fillStyle = backdrop(g, w, h);
        g.fill();
        g.save();
        rounded(g, w * 0.035, h * 0.035, w * 0.93, h * 0.93, w * 0.19);
        g.strokeStyle = 'rgba(61, 99, 255, 0.85)';
        g.lineWidth = Math.max(1, w * 0.018);
        g.shadowColor = 'rgba(61, 99, 255, 0.9)';
        g.shadowBlur = w * 0.04;
        g.stroke();
        g.restore();
        scene(g, w / 32 * 0.86, w * 0.07, h * 0.07, false);
      } else if (job.kind === 'full') {
        g.fillStyle = backdrop(g, w, h);
        g.fillRect(0, 0, w, h);
        scene(g, w / 32 * 0.7, w * 0.15, h * 0.15, false);
      } else {
        rounded(g, 0, 0, w, h, w * 0.25);
        g.fillStyle = '#080b24';
        g.fill();
        scene(g, w / 32, 0, 0, true);
      }
    }
    out[job.file] = c.toDataURL('image/png');
  }
  return out;
}, JOBS);

for (const [file, dataUrl] of Object.entries(results)) {
  fs.writeFileSync(path.join(OUT, file), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
await browser.close();
server.close();
console.log(`icons: ${Object.keys(results).length} files in ${path.relative(process.cwd(), OUT) || OUT}`);
