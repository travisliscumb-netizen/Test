/* App icon artwork: Kael mid flying kick, cut out against a blood moon,
   rendered with the game's own skeleton and fighter painter so the icon is
   the game. No lettering -- it has to read at 29px on a Home Screen.     */

import { FIGHTERS } from './config.js';
import { POSES, solve, scaledBody } from './skeleton.js';
import { drawFighter } from './fighter-art.js';
import { glowSprite } from './color.js';

export function drawIcon(g, size, { maskable = false } = {}) {
  const S = size;
  g.save();
  // background: near-black crimson
  const bg = g.createRadialGradient(S * 0.5, S * 0.42, S * 0.05, S * 0.5, S * 0.5, S * 0.78);
  bg.addColorStop(0, '#5a0a14');
  bg.addColorStop(0.55, '#24040a');
  bg.addColorStop(1, '#0a0103');
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);

  // safe zone: maskable icons are cropped to a circle of 80%
  const k = maskable ? 0.78 : 1;
  g.translate(S / 2, S / 2);
  g.scale(k, k);
  g.translate(-S / 2, -S / 2);

  // blood moon
  const mx = S * 0.56, my = S * 0.42, mr = S * 0.3;
  g.globalCompositeOperation = 'lighter';
  g.drawImage(glowSprite('#ff3a2a', 256), mx - mr * 2.3, my - mr * 2.3, mr * 4.6, mr * 4.6);
  g.globalCompositeOperation = 'source-over';
  const mg = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.35, mr * 0.1, mx, my, mr);
  mg.addColorStop(0, '#ffd2a0');
  mg.addColorStop(0.45, '#ff5a2a');
  mg.addColorStop(1, '#a8101e');
  g.fillStyle = mg;
  g.beginPath();
  g.arc(mx, my, mr, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(120,0,10,0.35)';
  for (const [dx, dy, r] of [[-0.3, 0.1, 0.12], [0.25, -0.2, 0.08], [0.1, 0.35, 0.1]]) {
    g.beginPath();
    g.arc(mx + dx * mr, my + dy * mr, r * mr, 0, Math.PI * 2);
    g.fill();
  }

  // ground mist
  const fg = g.createLinearGradient(0, S * 0.7, 0, S);
  fg.addColorStop(0, 'rgba(10,1,3,0)');
  fg.addColorStop(1, 'rgba(10,1,3,0.95)');
  g.fillStyle = fg;
  g.fillRect(0, S * 0.7, S, S * 0.3);

  // the fighter: a flying kick, silhouetted with a hot rim light
  const def = FIGHTERS.kael;
  const body = scaledBody(def);
  const pose = { ...POSES.akick, t: -26, h: 4, flu: 78, fll: -2, blu: -16, bll: -118, fau: 40, fal: 110, bau: -50, bal: 60, rot: -14, oy: 0 };
  const f = { def, body, skel: solve(pose, body, {}), x: 0, y: 0, facing: 1, flash: 0, alpha: 1, side: 0, state: 'idle', vx: 0 };
  const scale = S / 440;
  g.save();
  g.translate(S * 0.46, S * 0.7);
  g.scale(scale, scale);
  const light = { key: '#ff9a6a', rim: '#ff3a2a', ambient: '#120206' };
  // glow halo behind the figure so it separates from the moon
  g.save();
  g.translate(0, 0);
  drawFighter(g, f, light, { silhouette: 'rgba(255,90,60,0.55)', chains: false });
  g.restore();
  g.save();
  g.translate(-3, 2);
  drawFighter(g, f, light, { silhouette: '#0c0204', chains: false });
  g.restore();
  g.restore();

  // slash of blood across the bottom
  g.strokeStyle = '#c4122f';
  g.lineCap = 'round';
  g.lineWidth = S * 0.028;
  g.beginPath();
  g.moveTo(S * 0.12, S * 0.86);
  g.quadraticCurveTo(S * 0.5, S * 0.8, S * 0.88, S * 0.84);
  g.stroke();
  g.fillStyle = '#c4122f';
  for (const [x, y, r] of [[0.3, 0.9, 0.012], [0.62, 0.89, 0.016], [0.78, 0.92, 0.01]]) {
    g.beginPath();
    g.arc(S * x, S * y, S * r, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();

  // subtle inner frame on non-maskable icons
  if (!maskable) {
    g.strokeStyle = 'rgba(255,190,120,0.18)';
    g.lineWidth = S * 0.012;
    g.strokeRect(S * 0.006, S * 0.006, S * 0.988, S * 0.988);
  }
}

/* iOS launch image (landscape): the icon art centred on the game's black. */
export function drawSplash(g, w, h) {
  const bg = g.createRadialGradient(w / 2, h / 2, h * 0.05, w / 2, h / 2, w * 0.6);
  bg.addColorStop(0, '#2a0408');
  bg.addColorStop(1, '#0a0103');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const s = Math.round(h * 0.42);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  drawIcon(c.getContext('2d'), s);
  g.save();
  const x = (w - s) / 2, y = (h - s) / 2 - h * 0.04, r = s * 0.22;
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + s, y, x + s, y + s, r);
  g.arcTo(x + s, y + s, x, y + s, r);
  g.arcTo(x, y + s, x, y, r);
  g.arcTo(x, y, x + s, y, r);
  g.closePath();
  g.clip();
  g.drawImage(c, x, y);
  g.restore();
}
