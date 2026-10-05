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
  const face = new FontFace('Outfit', 'url(/src/fonts/outfit-latin.woff2)', { weight: '100 900' });
  document.fonts.add(await face.load());
  const { drawPac, drawGhost, drawShadow, COLORS } = await import('/src/sprites.js');
  const TAU = Math.PI * 2;

  const rounded = (g, x, y, w, h, r) => {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };
  const glow = (g, x, y, r, color, a) => {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, color.replace('A', a));
    grd.addColorStop(1, color.replace('A', 0));
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  /* The game's sky: deep indigo with an aurora of violet and cyan. */
  const sky = (g, w, h) => {
    const base = g.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#11163f');
    base.addColorStop(1, '#05060f');
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    glow(g, w * 0.82, h * 0.95, Math.max(w, h) * 0.7, 'rgba(192,44,255,A)', 0.3);
    glow(g, w * 0.1, h * 0.9, Math.max(w, h) * 0.6, 'rgba(0,184,255,A)', 0.22);
    glow(g, w * 0.3, h * 0.05, Math.max(w, h) * 0.6, 'rgba(58,44,255,A)', 0.35);
    g.globalCompositeOperation = 'source-over';
  };
  const pellet = (g, x, y, r) => {
    glow(g, x, y, r * 3, 'rgba(255,170,130,A)', 0.55);
    const b = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
    b.addColorStop(0, '#ffffff'); b.addColorStop(0.5, '#ffe2cf'); b.addColorStop(1, '#ff9a6a');
    g.fillStyle = b;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  };

  /* The icon: a portrait of Pac-Man, mouth open toward a pellet, lit from
     behind, in a 32-unit square. */
  const portrait = (g, u, ox, oy) => {
    g.save();
    g.translate(ox, oy);
    g.scale(u, u);
    glow(g, 14.5, 15.5, 17, 'rgba(255,200,40,A)', 0.5);
    drawShadow(g, 15, 28.2, 9.5, 1.7, 0.55);
    pellet(g, 28, 16, 1.55);
    drawPac(g, 14.2, 16, 11.4, 0.66, 3);
    g.restore();
  };

  const out = {};
  for (const job of jobs) {
    const c = document.createElement('canvas');
    c.width = job.w; c.height = job.h;
    const g = c.getContext('2d');
    const { w, h } = job;
    if (job.kind === 'cover') {
      sky(g, w, h);
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.font = '900 150px Outfit';
      if ('letterSpacing' in g) g.letterSpacing = '-5px';
      const tg = g.createLinearGradient(0, 120, 0, 250);
      tg.addColorStop(0, '#fffbe0'); tg.addColorStop(0.3, '#ffe84a'); tg.addColorStop(0.62, '#ffc21a'); tg.addColorStop(1, '#f08f00');
      g.fillStyle = '#7a3e00';
      g.fillText('PAC-MAN', w / 2, 262);
      g.shadowColor = 'rgba(255, 190, 30, 0.45)';
      g.shadowBlur = 40;
      g.fillStyle = tg;
      g.fillText('PAC-MAN', w / 2, 252);
      g.shadowBlur = 0;
      g.font = '600 26px Outfit';
      if ('letterSpacing' in g) g.letterSpacing = '13px';
      g.fillStyle = '#9ff2ff';
      g.fillText('ARCADE EDITION', w / 2 + 6, 318);
      if ('letterSpacing' in g) g.letterSpacing = '0px';
      const y = 455, u = 5.4;
      g.save(); g.translate(w / 2 - 120.5 * u, y); g.scale(u, u);
      for (let i = 0; i < 7; i++) pellet(g, 30 + i * 9, 0, 1.1);
      glow(g, 112, 0, 24, 'rgba(255,200,40,A)', 0.45);
      drawShadow(g, 112, 9, 8, 1.6, 0.5);
      drawPac(g, 112, 0, 9, 0.7, 1);
      ['blinky', 'pinky', 'inky', 'clyde'].forEach((n, i) => {
        const gx = 145 + i * 20;
        glow(g, gx, 0, 14, n === 'blinky' ? 'rgba(255,61,79,A)' : n === 'pinky' ? 'rgba(255,143,216,A)' : n === 'inky' ? 'rgba(47,228,255,A)' : 'rgba(255,173,66,A)', 0.3);
        drawShadow(g, gx, 8.5, 6.5, 1.6, 0.5);
        drawGhost(g, gx, 0, { color: COLORS.ghost[n], dir: 1, t: i * 1.3 });
      });
      g.restore();
    } else if (job.kind === 'tiny') {
      /* At 16-32 px only the silhouette survives: Pac-Man, edge to edge. */
      rounded(g, 0, 0, w, h, w * 0.22);
      g.fillStyle = '#0b0f30';
      g.fill();
      g.save();
      g.scale(w / 32, h / 32);
      drawPac(g, 15.6, 16, 13.4, 0.68, 3);
      g.restore();
    } else if (job.kind === 'rounded') {
      rounded(g, 0, 0, w, h, w * 0.225);
      g.save();
      g.clip();
      sky(g, w, h);
      g.restore();
      rounded(g, w * 0.012, h * 0.012, w * 0.976, h * 0.976, w * 0.215);
      g.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      g.lineWidth = Math.max(1, w * 0.008);
      g.stroke();
      portrait(g, w / 32 * 0.9, w * 0.05, h * 0.05);
    } else {
      /* Full bleed: iOS rounds the corners itself, and Android masks keep
         only the central 80 %, so the portrait sits inside that. */
      sky(g, w, h);
      portrait(g, w / 32 * 0.76, w * 0.12, h * 0.12);
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
