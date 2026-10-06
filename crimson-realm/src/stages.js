/* Stage art. Each stage is a static sky, three parallax layers (painted
   once into offscreen canvases when the stage loads), a perspective floor
   drawn every frame, and animated lights/weather.

   All coordinates are logical: 720 tall. A layer with parallax factor f is
   W = viewW + (STAGE_W - viewW) * f wide.                                 */

import { rgba, mix, shade, tint, glowSprite } from './color.js';
import { rng32 } from './engine.js';
import { GROUND_Y } from './config.js';

export const HORIZON = GROUND_Y - 72;   // back edge of the floor

/* ----------------------------------------------------------- helpers */
function vgrad(g, y0, y1, stops) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([t, c]) => gr.addColorStop(t, c));
  return gr;
}

function ridge(g, w, base, amp, color, seed, rough = 0.55, step = 6) {
  const r = rng32(seed);
  const n = 257;
  const h = new Float32Array(n);
  let span = n - 1, a = amp;
  h[0] = r() * amp; h[n - 1] = r() * amp;
  while (span > 1) {
    for (let i = span / 2; i < n; i += span) h[i] = (h[i - span / 2] + h[i + span / 2]) / 2 + (r() - 0.5) * a;
    span /= 2; a *= rough;
  }
  g.beginPath();
  g.moveTo(0, 720);
  for (let x = 0; x <= w; x += step) {
    const u = (x / w) * (n - 1);
    const i = Math.min(n - 2, Math.floor(u));
    const v = h[i] + (h[i + 1] - h[i]) * (u - i);
    g.lineTo(x, base - v);
  }
  g.lineTo(w, 720);
  g.closePath();
  g.fillStyle = color;
  g.fill();
}

function haze(g, w, y0, y1, color, a0, a1) {
  g.fillStyle = vgrad(g, y0, y1, [[0, rgba(color, a0)], [1, rgba(color, a1)]]);
  g.fillRect(0, y0, w, y1 - y0);
}

function glow(g, x, y, r, color, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.globalCompositeOperation = 'lighter';
  g.drawImage(glowSprite(color, 128), x - r, y - r, r * 2, r * 2);
  g.restore();
}

function pagoda(g, x, base, s, col, win) {
  const tiers = 4;
  let y = base;
  for (let i = 0; i < tiers; i++) {
    const w = (120 - i * 20) * s, h = 46 * s;
    g.fillStyle = col;
    g.fillRect(x - w * 0.36, y - h, w * 0.72, h);
    if (win) {
      g.fillStyle = win;
      for (let k = -1; k <= 1; k++) g.fillRect(x + k * w * 0.2 - 4 * s, y - h * 0.7, 8 * s, h * 0.4);
    }
    y -= h;
    g.beginPath();
    g.moveTo(x - w * 0.62, y + 8 * s);
    g.quadraticCurveTo(x - w * 0.4, y - 2 * s, x - w * 0.3, y - 14 * s);
    g.lineTo(x + w * 0.3, y - 14 * s);
    g.quadraticCurveTo(x + w * 0.4, y - 2 * s, x + w * 0.62, y + 8 * s);
    g.closePath();
    g.fillStyle = col;
    g.fill();
    y -= 12 * s;
  }
  g.fillRect(x - 2 * s, y - 50 * s, 4 * s, 50 * s);
}

function gate(g, x, base, s, col, accent) {
  g.fillStyle = col;
  g.fillRect(x - 110 * s, base - 260 * s, 22 * s, 260 * s);
  g.fillRect(x + 88 * s, base - 260 * s, 22 * s, 260 * s);
  g.fillRect(x - 130 * s, base - 222 * s, 260 * s, 16 * s);
  g.beginPath();
  g.moveTo(x - 165 * s, base - 266 * s);
  g.quadraticCurveTo(x, base - 250 * s, x + 165 * s, base - 266 * s);
  g.lineTo(x + 150 * s, base - 288 * s);
  g.quadraticCurveTo(x, base - 274 * s, x - 150 * s, base - 288 * s);
  g.closePath();
  g.fill();
  if (accent) {
    g.fillStyle = accent;
    g.fillRect(x - 130 * s, base - 222 * s, 260 * s, 4 * s);
  }
}

function pillar(g, x, top, base, w, col, hi) {
  g.fillStyle = vgrad(g, top, base, [[0, col], [1, shade(col, 0.4)]]);
  g.fillRect(x - w / 2, top, w, base - top);
  g.fillStyle = hi;
  g.fillRect(x - w / 2, top, w * 0.18, base - top);
  g.fillStyle = shade(col, 0.2);
  g.fillRect(x - w * 0.7, top, w * 1.4, 18);
  g.fillRect(x - w * 0.7, base - 22, w * 1.4, 22);
}

function stars(g, w, h, n, seed) {
  const r = rng32(seed);
  for (let i = 0; i < n; i++) {
    const a = 0.2 + r() * 0.8;
    g.fillStyle = `rgba(255,255,255,${a * 0.8})`;
    const s = r() < 0.08 ? 2.2 : 1.2;
    g.fillRect(r() * w, r() * h, s, s);
  }
}

function clouds(g, w, y, n, color, alpha, seed, sx = 260, sy = 50) {
  const r = rng32(seed);
  for (let i = 0; i < n; i++) {
    const cx = r() * w, cy = y + (r() - 0.5) * sy * 2;
    const rw = sx * (0.5 + r()), rh = sy * (0.5 + r() * 0.6);
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rw);
    gr.addColorStop(0, rgba(color, alpha));
    gr.addColorStop(1, rgba(color, 0));
    g.save();
    g.translate(cx, cy);
    g.scale(1, rh / rw);
    g.translate(-cx, -cy);
    g.fillStyle = gr;
    g.fillRect(cx - rw, cy - rw, rw * 2, rw * 2);
    g.restore();
  }
}

function bamboo(g, x, top, base, w, col, seed) {
  const r = rng32(seed);
  g.fillStyle = vgrad(g, top, base, [[0, shade(col, 0.3)], [0.5, col], [1, shade(col, 0.5)]]);
  g.fillRect(x - w / 2, top, w, base - top);
  g.fillStyle = tint(col, 0.15);
  g.fillRect(x - w / 2 + w * 0.15, top, w * 0.15, base - top);
  g.fillStyle = shade(col, 0.45);
  for (let y = base - 40 - r() * 60; y > top; y -= 70 + r() * 50) g.fillRect(x - w / 2 - 1, y, w + 2, 3);
  // leaves
  g.fillStyle = shade(col, 0.15);
  for (let i = 0; i < 6; i++) {
    const ly = top + r() * (base - top) * 0.6;
    const dir = r() < 0.5 ? -1 : 1;
    g.beginPath();
    g.moveTo(x, ly);
    g.quadraticCurveTo(x + dir * 30, ly - 10, x + dir * 60, ly + 6);
    g.quadraticCurveTo(x + dir * 30, ly + 4, x, ly);
    g.fill();
  }
}

function spire(g, x, base, w, h, col, seed) {
  const r = rng32(seed);
  g.beginPath();
  g.moveTo(x - w / 2, base);
  let y = base;
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    y = base - (h * i) / steps;
    g.lineTo(x - (w / 2) * (1 - i / (steps + 1)) + (r() - 0.5) * 14, y);
  }
  g.lineTo(x + (r() - 0.5) * 10, base - h - 30);
  for (let i = steps; i >= 1; i--) {
    y = base - (h * i) / steps;
    g.lineTo(x + (w / 2) * (1 - i / (steps + 1)) + (r() - 0.5) * 14, y);
  }
  g.lineTo(x + w / 2, base);
  g.closePath();
  g.fillStyle = col;
  g.fill();
}

function gear(g, x, y, r, teeth, col) {
  g.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r : r * 1.14;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.moveTo(x + r * 0.35, y);
  g.arc(x, y, r * 0.35, 0, Math.PI * 2, true);
  g.fillStyle = col;
  g.fill('evenodd');
}

function chain(g, x, top, len, col) {
  g.strokeStyle = col;
  g.lineWidth = 3;
  for (let y = top; y < top + len; y += 14) {
    g.beginPath();
    g.ellipse(x, y, 4, 8, 0, 0, Math.PI * 2);
    g.stroke();
  }
}

/* ------------------------------------------------------------- stages */
export const STAGE_ART = {
  temple: {
    floor: { back: '#7a4636', front: '#24100f', seam: 'rgba(30,10,12,0.55)', tile: 180, rows: 4, spot: '#ffb070' },
    sky(g, w) {
      g.fillStyle = vgrad(g, 0, HORIZON, [[0, '#1e0b2e'], [0.45, '#7a2452'], [0.78, '#ff7a3d'], [1, '#ffd08a']]);
      g.fillRect(0, 0, w, 720);
      glow(g, w * 0.62, 400, 380, '#ff8a3a', 0.55);
      g.beginPath();
      g.arc(w * 0.62, 400, 104, 0, Math.PI * 2);
      g.fillStyle = vgrad(g, 296, 504, [[0, '#fff1c4'], [1, '#ff9a4a']]);
      g.fill();
      clouds(g, w, 250, 9, '#ff9a6a', 0.22, 11, 300, 26);
      clouds(g, w, 140, 7, '#5a1c50', 0.4, 12, 320, 30);
    },
    layers: [
      { f: 0.12, q: 0.6, draw(g, w) {
        ridge(g, w, HORIZON - 40, 150, '#6a2a5a', 21, 0.55);
        haze(g, w, HORIZON - 200, HORIZON, '#ff8a5a', 0, 0.35);
        ridge(g, w, HORIZON - 10, 90, '#4a1a46', 22, 0.6);
      } },
      { f: 0.38, q: 0.75, draw(g, w) {
        const r = rng32(31);
        for (let x = 120; x < w; x += 340 + r() * 200) pagoda(g, x, HORIZON + 4, 0.8 + r() * 0.5, '#2a0f28', 'rgba(255,170,90,0.85)');
        haze(g, w, HORIZON - 120, HORIZON + 6, '#ff7a4a', 0, 0.2);
      } },
      { f: 0.7, q: 1, draw(g, w) {
        g.fillStyle = '#1a0816';
        g.fillRect(0, HORIZON - 70, w, 76);
        g.fillStyle = '#2c1024';
        for (let x = 0; x < w; x += 46) g.fillRect(x, HORIZON - 82, 34, 14);
        for (let x = 300; x < w; x += 900) gate(g, x, HORIZON + 4, 1.15, '#2a0a12', '#8a1a2a');
      } }
    ],
    lights: [{ f: 0.7, every: 900, start: 160, y: HORIZON - 150, color: '#ffae5a', r: 70, flame: true }, { f: 0.7, every: 900, start: 440, y: HORIZON - 150, color: '#ffae5a', r: 70, flame: true }],
    weather: 'petals',
    rays: { x: 0.62, y: 400, a0: -2.9, a1: -0.25, n: 9, color: '#ffb070', alpha: 0.12 }
  },

  bridge: {
    floor: { back: '#4a3a32', front: '#120c0c', seam: 'rgba(10,6,6,0.7)', tile: 60, rows: 2, planks: true, spot: '#9ab8ff' },
    sky(g, w) {
      g.fillStyle = vgrad(g, 0, HORIZON, [[0, '#03061a'], [0.6, '#14234a'], [1, '#3c5a8a']]);
      g.fillRect(0, 0, w, 720);
      stars(g, w, HORIZON - 120, 260, 5);
      glow(g, w * 0.3, 190, 300, '#9ab8ff', 0.5);
      g.beginPath();
      g.arc(w * 0.3, 190, 86, 0, Math.PI * 2);
      g.fillStyle = vgrad(g, 104, 276, [[0, '#ffffff'], [1, '#c4d4f0']]);
      g.fill();
      g.fillStyle = 'rgba(150,170,210,0.25)';
      g.beginPath(); g.arc(w * 0.3 - 22, 170, 18, 0, 7); g.fill();
      g.beginPath(); g.arc(w * 0.3 + 26, 214, 12, 0, 7); g.fill();
      clouds(g, w, 300, 8, '#3a4c7a', 0.35, 6, 300, 22);
    },
    layers: [
      { f: 0.14, q: 0.6, draw(g, w) {
        ridge(g, w, HORIZON - 70, 220, '#22355e', 41, 0.5);
        haze(g, w, HORIZON - 160, HORIZON, '#6a8ac4', 0, 0.4);
      } },
      { f: 0.4, q: 0.75, draw(g, w) {
        const r = rng32(43);
        for (let x = 0; x < w; x += 420 + r() * 200) {
          const cw = 200 + r() * 140, ch = 260 + r() * 140;
          g.fillStyle = '#121d38';
          g.beginPath();
          g.moveTo(x, HORIZON + 10);
          g.lineTo(x + 20, HORIZON - ch);
          g.lineTo(x + cw * 0.6, HORIZON - ch - 30);
          g.lineTo(x + cw, HORIZON - ch + 20);
          g.lineTo(x + cw + 10, HORIZON + 10);
          g.fill();
          // waterfall
          g.fillStyle = vgrad(g, HORIZON - ch, HORIZON, [[0, 'rgba(200,220,255,0.7)'], [1, 'rgba(200,220,255,0.15)']]);
          g.fillRect(x + cw * 0.45, HORIZON - ch + 10, 16, ch);
        }
        haze(g, w, HORIZON - 100, HORIZON + 10, '#7a9ad0', 0, 0.45);
      } },
      { f: 0.72, q: 1, draw(g, w) {
        for (let x = 60; x < w; x += 300) {
          g.fillStyle = '#0a0d1a';
          g.fillRect(x - 9, HORIZON - 150, 18, 160);
          g.fillRect(x - 13, HORIZON - 160, 26, 12);
        }
        g.strokeStyle = '#1a2036';
        g.lineWidth = 4;
        for (const off of [110, 60]) {
          g.beginPath();
          for (let x = 60; x < w; x += 300) {
            g.moveTo(x, HORIZON - off);
            g.quadraticCurveTo(x + 150, HORIZON - off + 30, x + 300, HORIZON - off);
          }
          g.stroke();
        }
      } }
    ],
    lights: [{ f: 0.72, every: 600, start: 60, y: HORIZON - 172, color: '#ffd28a', r: 46, flame: true }],
    weather: 'mist',
    rays: { x: 0.3, y: 190, a0: 0.6, a1: 2.4, n: 7, color: '#b8ccff', alpha: 0.07 }
  },

  forge: {
    floor: { back: '#3a2620', front: '#0c0605', seam: 'rgba(255,90,30,0.35)', tile: 70, rows: 5, grate: true, spot: '#ff7a30' },
    sky(g, w) {
      g.fillStyle = vgrad(g, 0, HORIZON, [[0, '#080302'], [0.6, '#2a0c06'], [1, '#7a2208']]);
      g.fillRect(0, 0, w, 720);
      glow(g, w * 0.5, HORIZON, 520, '#ff4a10', 0.6);
    },
    layers: [
      { f: 0.15, q: 0.6, draw(g, w) {
        const r = rng32(51);
        g.fillStyle = '#1a0805';
        for (let x = 0; x < w; x += 60 + r() * 80) {
          g.beginPath();
          g.moveTo(x, 0); g.lineTo(x + 30 + r() * 30, 80 + r() * 200); g.lineTo(x + 70 + r() * 40, 0);
          g.fill();
        }
        ridge(g, w, HORIZON - 30, 140, '#2a0c06', 52, 0.6);
        for (let x = 200; x < w; x += 600 + r() * 300) {
          g.fillStyle = vgrad(g, 120, HORIZON, [[0, 'rgba(255,200,80,0.9)'], [1, 'rgba(255,80,20,0.8)']]);
          g.fillRect(x, 120 + r() * 80, 22, HORIZON);
          glow(g, x + 11, HORIZON - 40, 120, '#ff6a1a', 0.6);
        }
      } },
      { f: 0.42, q: 0.8, draw(g, w) {
        const r = rng32(53);
        for (let x = 150; x < w; x += 380 + r() * 200) gear(g, x, HORIZON - 160 - r() * 120, 70 + r() * 60, 12, '#200a06');
        for (let x = 80; x < w; x += 160 + r() * 140) chain(g, x, 0, 160 + r() * 260, '#2a120a');
        for (let x = 300; x < w; x += 700) {
          g.fillStyle = '#140604';
          g.fillRect(x - 120, HORIZON - 200, 240, 210);
          g.fillStyle = vgrad(g, HORIZON - 150, HORIZON, [[0, '#ffcc66'], [1, '#ff4a10']]);
          g.beginPath();
          g.arc(x, HORIZON - 60, 70, Math.PI, 0);
          g.lineTo(x + 70, HORIZON);
          g.lineTo(x - 70, HORIZON);
          g.fill();
          glow(g, x, HORIZON - 60, 200, '#ff7a20', 0.7);
        }
      } },
      { f: 0.75, q: 1, draw(g, w) {
        for (let x = 0; x < w; x += 520) pillar(g, x + 200, 0, HORIZON + 6, 70, '#2a120c', 'rgba(255,120,40,0.25)');
      } }
    ],
    lights: [{ f: 0.75, every: 520, start: 200, y: HORIZON - 90, color: '#ff8a2a', r: 90, flame: true }],
    weather: 'embers',
    rays: { x: 0.5, y: 760, a0: -2.6, a1: -0.55, n: 8, color: '#ff6a20', alpha: 0.08 }
  },

  spire: {
    floor: { back: '#3e5258', front: '#070d10', seam: 'rgba(0,0,0,0.5)', tile: 150, rows: 3, wet: true, spot: '#9ff0ff' },
    sky(g, w) {
      g.fillStyle = vgrad(g, 0, HORIZON, [[0, '#04090c'], [0.5, '#12262e'], [1, '#3a5a62']]);
      g.fillRect(0, 0, w, 720);
      clouds(g, w, 120, 14, '#2a3e46', 0.7, 61, 280, 60);
      clouds(g, w, 260, 10, '#5a7a84', 0.3, 62, 300, 40);
    },
    layers: [
      { f: 0.12, q: 0.6, draw(g, w) {
        const r = rng32(71);
        for (let x = 0; x < w; x += 140 + r() * 160) spire(g, x, HORIZON + 4, 60 + r() * 50, 200 + r() * 220, '#1c2e34', r() * 1e6);
        haze(g, w, HORIZON - 260, HORIZON, '#7aa4ac', 0, 0.45);
      } },
      { f: 0.4, q: 0.8, draw(g, w) {
        const r = rng32(72);
        for (let x = 200; x < w; x += 640) {
          g.fillStyle = '#0e1a1e';
          g.fillRect(x - 70, HORIZON - 380, 140, 390);
          g.beginPath(); g.moveTo(x - 90, HORIZON - 380); g.lineTo(x, HORIZON - 470); g.lineTo(x + 90, HORIZON - 380); g.fill();
          g.fillStyle = 'rgba(95,240,255,0.55)';
          g.fillRect(x - 10, HORIZON - 330, 20, 40);
        }
        for (let x = 0; x < w; x += 120 + r() * 120) spire(g, x, HORIZON + 6, 90, 120 + r() * 120, '#132226', r() * 1e6);
      } },
      { f: 0.74, q: 1, draw(g, w) {
        const r = rng32(73);
        for (let x = 100; x < w; x += 420 + r() * 200) {
          const h = 140 + r() * 180;
          pillar(g, x, HORIZON - h, HORIZON + 6, 54, '#1e2c30', 'rgba(150,240,255,0.18)');
          g.fillStyle = '#04090c';
          g.beginPath(); g.moveTo(x - 40, HORIZON - h); g.lineTo(x + 5, HORIZON - h - 30); g.lineTo(x + 40, HORIZON - h + 10); g.fill();
        }
      } }
    ],
    lights: [],
    weather: 'rain'
  },

  grove: {
    floor: { back: '#2e4a36', front: '#040a06', seam: 'rgba(0,0,0,0.45)', tile: 130, rows: 3, moss: true, spot: '#9dffc0' },
    sky(g, w) {
      g.fillStyle = vgrad(g, 0, HORIZON, [[0, '#010605'], [0.6, '#0a2a20'], [1, '#2f6a52']]);
      g.fillRect(0, 0, w, 720);
      glow(g, w * 0.7, 120, 260, '#c8ffe0', 0.3);
      g.beginPath(); g.arc(w * 0.7, 120, 46, 0, 7); g.fillStyle = '#e8fff2'; g.fill();
    },
    layers: [
      { f: 0.14, q: 0.6, draw(g, w) {
        const r = rng32(81);
        for (let x = 0; x < w; x += 18 + r() * 30) bamboo(g, x, 0, HORIZON + 4, 8 + r() * 6, '#1d4a38', r() * 1e6);
        haze(g, w, 0, HORIZON, '#5aa080', 0.1, 0.55);
      } },
      { f: 0.42, q: 0.8, draw(g, w) {
        const r = rng32(82);
        for (let x = 0; x < w; x += 40 + r() * 70) bamboo(g, x, 0, HORIZON + 4, 14 + r() * 8, '#163a2c', r() * 1e6);
        haze(g, w, HORIZON - 160, HORIZON + 6, '#4a9070', 0, 0.4);
      } },
      { f: 0.78, q: 1, draw(g, w) {
        const r = rng32(83);
        for (let x = 30; x < w; x += 160 + r() * 260) bamboo(g, x, 0, HORIZON + 8, 26 + r() * 12, '#0a2018', r() * 1e6);
        g.fillStyle = '#081a12';
        for (let x = 0; x < w; x += 300) {
          g.beginPath(); g.ellipse(x + 100, HORIZON + 4, 140, 26, 0, Math.PI, 0); g.fill();
        }
      } }
    ],
    lights: [],
    weather: 'fireflies'
  },

  throne: {
    floor: { back: '#2a1424', front: '#050205', seam: 'rgba(200,80,255,0.25)', tile: 200, rows: 3, wet: true, spot: '#d070ff' },
    sky(g, w) {
      g.fillStyle = vgrad(g, 0, HORIZON, [[0, '#120208'], [0.5, '#4a0818'], [1, '#c8301e']]);
      g.fillRect(0, 0, w, 720);
      clouds(g, w, 200, 10, '#ff5a2a', 0.25, 91, 300, 40);
      clouds(g, w, 100, 8, '#200410', 0.6, 92, 320, 40);
    },
    layers: [
      { f: 0.12, q: 0.6, draw(g, w) {
        ridge(g, w, HORIZON - 30, 230, '#2a0610', 93, 0.55);
        haze(g, w, HORIZON - 120, HORIZON, '#ff5a2a', 0, 0.5);
      } },
      { f: 0.36, q: 0.8, draw(g, w) {
        // great hall arches
        g.fillStyle = '#140409';
        g.fillRect(0, 0, w, 140);
        for (let x = 0; x < w; x += 260) {
          g.fillRect(x, 0, 60, HORIZON + 6);
          g.beginPath(); g.moveTo(x + 60, 140); g.quadraticCurveTo(x + 160, 260, x + 260, 140); g.lineTo(x + 260, 130); g.lineTo(x + 60, 130); g.fill();
        }
        // the throne, centre of the stage
        const cx = w / 2, b = HORIZON + 6;
        g.fillStyle = '#1e0610';
        g.fillRect(cx - 230, b - 60, 460, 60);
        g.fillRect(cx - 180, b - 110, 360, 50);
        g.beginPath();
        g.moveTo(cx - 110, b - 110); g.lineTo(cx - 120, b - 380); g.lineTo(cx - 60, b - 440); g.lineTo(cx, b - 520);
        g.lineTo(cx + 60, b - 440); g.lineTo(cx + 120, b - 380); g.lineTo(cx + 110, b - 110);
        g.fill();
        g.strokeStyle = '#c9a227'; g.lineWidth = 3; g.stroke();
        g.fillStyle = '#5e0b1b';
        g.fillRect(cx - 70, b - 360, 140, 250);
        glow(g, cx, b - 420, 90, '#c04dff', 0.8);
        for (const dx of [-330, 330]) {
          g.fillStyle = '#5e0b1b';
          g.fillRect(cx + dx - 40, 140, 80, 300);
          g.beginPath(); g.moveTo(cx + dx - 40, 440); g.lineTo(cx + dx, 480); g.lineTo(cx + dx + 40, 440); g.fill();
          g.strokeStyle = '#c9a227'; g.lineWidth = 2; g.strokeRect(cx + dx - 34, 150, 68, 280);
        }
      } },
      { f: 0.76, q: 1, draw(g, w) {
        for (let x = 180; x < w; x += 560) pillar(g, x, 0, HORIZON + 8, 80, '#240814', 'rgba(200,80,255,0.2)');
      } }
    ],
    lights: [{ f: 0.76, every: 560, start: 460, y: HORIZON - 40, color: '#c04dff', r: 110, flame: true, brazier: true }],
    weather: 'ash',
    rays: { x: 0.5, y: 120, a0: 0.9, a1: 2.25, n: 7, color: '#c04dff', alpha: 0.07 }
  }
};

/* --------------------------------------------------------- the floor
   Each stage paints a floor texture once: x is world x, y is depth (row 0
   is the back edge). It is drawn every frame as horizontal slices, each
   scaled for its depth -- true perspective, so slabs, planks and grates
   converge correctly and scroll at the right speed at every depth.      */
const FX = -700, FW = 4000, FS = 0.55;     // texture covers world x in [FX, FX+FW] at FS px/unit
const FD = 300;                             // depth rows
const floorTex = new Map();

function paintFloor(id, art) {
  const seams = [];                         // vertical seams, drawn per frame as vectors: [worldX, depth0, depth1, kind]
  const c = document.createElement('canvas');
  c.width = Math.ceil(FW * FS);
  c.height = FD;
  const g = c.getContext('2d');
  const r = rng32(id.length * 7919 + 13);
  const W = c.width, fl = art.floor;
  const X = (wx) => (wx - FX) * FS;
  g.fillStyle = vgrad(g, 0, FD, [[0, fl.back], [0.5, mix(fl.back, fl.front, 0.4)], [1, fl.front]]);
  g.fillRect(0, 0, W, FD);
  const mottle = (n, size, col, a) => {
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = r() * FD, rr = size * (0.4 + r());
      const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, rgba(col, a * (0.4 + r() * 0.6)));
      gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr;
      g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
  };
  const rows = (bands) => {                 // depth rows of slabs: [y0, y1] pairs
    const out = [];
    let y = 0;
    for (const h of bands) { out.push([y, y + h]); y += h; }
    return out;
  };
  const slab = (x0, x1, y0, y1, base, seam, chip = 0.4) => {
    const shadeK = (r() - 0.5) * 0.07;
    g.fillStyle = shadeK > 0 ? mix(base, '#ffffff', shadeK * 0.5) : mix(base, '#000000', -shadeK);
    g.fillRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
    // bevel: light on the far edge, dark on the near edge
    g.fillStyle = 'rgba(255,240,220,0.10)';
    g.fillRect(x0 + 1, y0 + 1, x1 - x0 - 2, 2);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(x0 + 1, y1 - 3, x1 - x0 - 2, 2);
    g.fillStyle = seam;
    g.fillRect(x0, y0, x1 - x0, 1.2);
    seams.push([x0 / FS + FX, y0 / FD, y1 / FD, 0]);
    if (r() < chip) {                       // cracks and chips
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      let x = x0 + r() * (x1 - x0), y = y0 + 2;
      g.moveTo(x, y);
      while (y < y1 - 3) { x += (r() - 0.5) * 14; y += 4 + r() * 8; g.lineTo(x, y); }
      g.stroke();
    }
  };
  switch (id) {
    case 'temple': {
      for (const [y0, y1] of rows([34, 46, 62, 76, 82])) {
        let x = r() * -120;
        while (x < W) { const w = (150 + r() * 120) * FS * (0.7 + y0 / FD); slab(x, x + w, y0, y1, '#6e4034', 'rgba(25,8,10,0.6)', 0.5); x += w; }
      }
      mottle(220, 30, '#2a0e0c', 0.18);
      mottle(140, 22, '#ffb27a', 0.08);
      break;
    }
    case 'bridge': {
      for (let x = 0; x < W; ) {
        const w = (38 + r() * 14) * FS;
        g.fillStyle = mix('#4e3c30', '#2a1e18', r() * 0.6);
        g.fillRect(x + 1, 0, w - 2, FD);
        g.strokeStyle = 'rgba(20,10,6,0.35)';
        g.lineWidth = 1;
        for (let k = 0; k < 4; k++) {        // wood grain along each plank
          const gx = x + 3 + r() * (w - 6);
          g.beginPath(); g.moveTo(gx, 0);
          for (let y = 0; y <= FD; y += 20) g.lineTo(gx + Math.sin(y * 0.05 + k) * 2, y);
          g.stroke();
        }
        seams.push([x / FS + FX, 0, 1, 0]);
        if (r() < 0.35) { g.fillStyle = 'rgba(30,20,14,0.9)'; g.beginPath(); g.ellipse(x + w / 2, 30 + r() * 240, 3, 4, 0, 0, 7); g.fill(); }
        x += w;
      }
      g.fillStyle = 'rgba(160,190,240,0.06)'; g.fillRect(0, 0, W, FD);
      mottle(120, 40, '#000000', 0.2);
      break;
    }
    case 'forge': {
      for (const [y0, y1] of rows([60, 70, 80, 90])) {
        for (let x = 0; x < W; x += 110 * FS) {
          slab(x, x + 110 * FS, y0, y1, '#3a2a24', 'rgba(0,0,0,0.7)', 0.15);
          for (let k = 1; k < 5; k++) seams.push([(x + k * 22 * FS) / FS + FX, (y0 + 6) / FD, (y1 - 6) / FD, 1]);
          g.fillStyle = '#6a5040';
          for (const [ax, ay] of [[4, 4], [110 * FS - 6, 4], [4, y1 - y0 - 6], [110 * FS - 6, y1 - y0 - 6]]) { g.beginPath(); g.arc(x + ax, y0 + ay, 2, 0, 7); g.fill(); }
        }
      }
      mottle(160, 34, '#ff5a1a', 0.07);
      mottle(160, 26, '#000000', 0.25);
      break;
    }
    case 'spire': {
      for (const [y0, y1] of rows([40, 54, 64, 70, 72])) {
        let x = r() * -80;
        while (x < W) { const w = (120 + r() * 160) * FS; slab(x, x + w, y0, y1, '#3a4c52', 'rgba(0,0,0,0.6)', 0.3); x += w; }
      }
      for (let i = 0; i < 70; i++) {         // puddles
        const x = r() * W, y = r() * FD, rw = 20 + r() * 60;
        g.fillStyle = 'rgba(160,220,240,0.10)';
        g.beginPath(); g.ellipse(x, y, rw, rw * 0.3, 0, 0, 7); g.fill();
      }
      break;
    }
    case 'grove': {
      for (const [y0, y1] of rows([40, 56, 66, 70, 68])) {
        let x = r() * -80;
        while (x < W) { const w = (90 + r() * 120) * FS; slab(x, x + w, y0, y1, '#2e4434', 'rgba(5,15,8,0.7)', 0.35); x += w; }
      }
      mottle(260, 30, '#4f8a3a', 0.28);
      for (let i = 0; i < 500; i++) {         // grass tufts in the seams
        const x = r() * W, y = r() * FD;
        g.strokeStyle = rgba(r() < 0.5 ? '#3f7a3a' : '#2a5a2a', 0.6);
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y - 4 - r() * 6); g.stroke();
      }
      break;
    }
    case 'throne': {
      for (const [y0, y1] of rows([70, 100, 130])) {
        for (let x = 0; x < W; x += 210 * FS) slab(x, x + 210 * FS, y0, y1, '#1c0c18', 'rgba(200,80,255,0.35)', 0);
      }
      g.strokeStyle = 'rgba(190,80,255,0.16)';
      g.lineWidth = 1.2;
      for (let i = 0; i < 60; i++) {          // marble veins
        g.beginPath();
        let x = r() * W, y = r() * FD;
        g.moveTo(x, y);
        for (let k = 0; k < 8; k++) { x += 10 + r() * 30; y += (r() - 0.5) * 20; g.lineTo(x, y); }
        g.stroke();
      }
      mottle(80, 50, '#ff3060', 0.06);
      break;
    }
  }
  // painterly grain
  const img = g.getImageData(0, 0, W, FD);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 16;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return { c, seams };
}

export function drawFloor(g, art, viewW, camX, camY, t, id) {
  const fl = art.floor;
  const y0 = HORIZON + camY;
  let ft = floorTex.get(id);
  if (!ft) { ft = paintFloor(id, art); floorTex.set(id, ft); }
  const tex = ft.c;
  const sc = (y) => 1 + (y - GROUND_Y - camY) * 0.0029;
  // slices: thin near the horizon (where perspective changes fastest)
  const N = 72;
  for (let i = 0; i < N; i++) {
    const a = i / N, b = (i + 1) / N;
    const ya = y0 + (720 - y0) * a * a, yb = y0 + (720 - y0) * b * b;
    if (yb - ya < 0.2) continue;
    const ym = (ya + yb) / 2;
    const k = sc(ym);
    const wxL = camX - viewW / 2 / k;
    const sx = (wxL - FX) * FS, sw = (viewW / k) * FS;
    // depth row of this slice: linear in 1/scale-ish, matched to the slab rows
    const da = Math.pow(a * a, 0.62), db = Math.pow(b * b, 0.62);
    const sy = da * (FD - 1), sh = Math.max(1, (db - da) * (FD - 1));
    g.drawImage(tex, sx, sy, sw, sh, 0, ya, viewW, yb - ya + 0.6);
  }
  // vertical seams as true perspective vectors (slicing would stair-step them)
  const yOf = (d) => y0 + (720 - y0) * Math.pow(d, 1 / 0.62);
  const xOf = (wx, y) => viewW / 2 + (wx - camX) * sc(y);
  const half = viewW / 2 / 0.75 + 200;
  const seamPath = [new Path2D(), new Path2D()];
  for (const [wx, d0, d1, kind] of ft.seams) {
    if (Math.abs(wx - camX) > half) continue;
    const ya = yOf(d0), yb = yOf(d1);
    seamPath[kind].moveTo(xOf(wx, ya), ya);
    seamPath[kind].lineTo(xOf(wx, yb), yb);
  }
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = fl.seam;
  g.lineWidth = 2.6;
  g.stroke(seamPath[0]);
  g.strokeStyle = 'rgba(255,235,210,0.07)';
  g.lineWidth = 1;
  g.translate(1.6, 0);
  g.stroke(seamPath[0]);
  g.translate(-1.6, 0);
  g.strokeStyle = 'rgba(0,0,0,0.8)';
  g.lineWidth = 4;
  g.stroke(seamPath[1]);
  g.strokeStyle = 'rgba(255,110,30,0.5)';
  g.lineWidth = 1.6;
  g.stroke(seamPath[1]);
  g.restore();
  if (fl.grate) {
    const p = 0.5 + 0.5 * Math.sin(t * 2);
    g.fillStyle = vgrad(g, y0, 720, [[0, `rgba(255,90,20,${0.1 + p * 0.08})`], [1, 'rgba(255,60,10,0)']]);
    g.fillRect(0, y0, viewW, 720 - y0);
  }
  // key-light pool on the floor
  const gr = g.createRadialGradient(viewW / 2, GROUND_Y + camY, 10, viewW / 2, GROUND_Y + camY, viewW * 0.6);
  gr.addColorStop(0, rgba(fl.spot, 0.2));
  gr.addColorStop(1, rgba(fl.spot, 0));
  g.fillStyle = gr;
  g.fillRect(0, y0, viewW, 720 - y0);
  // depth fog toward the back edge, contact shadow under the wall
  g.fillStyle = vgrad(g, y0, y0 + 80, [[0, rgba(fl.back, 0.55)], [1, rgba(fl.back, 0)]]);
  g.fillRect(0, y0, viewW, 80);
  g.fillStyle = vgrad(g, y0, y0 + 22, [[0, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(0, y0, viewW, 22);
  // near-camera darkening
  g.fillStyle = vgrad(g, 640, 720, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.45)']]);
  g.fillRect(0, 640, viewW, 80);
}

/* Post-process for the pre-rendered parallax layers: distance blur where
   the browser supports canvas filters, then painterly grain. Done once per
   stage load, so it costs nothing per frame. */
export function paintPostLayer(canvas, depth) {
  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  if (depth > 0 && 'filter' in g) {
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const t = tmp.getContext('2d');
    t.filter = `blur(${depth}px)`;
    t.drawImage(canvas, 0, 0);
    if (t.filter !== 'none') {
      g.clearRect(0, 0, w, h);
      g.drawImage(tmp, 0, 0);
    }
    tmp.width = tmp.height = 0;
  }
  const r = rng32(w * 31 + h);
  g.save();
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < (w * h) / 900; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.035)';
    const x = r() * w, y = r() * h, l = 4 + r() * 16;
    g.fillRect(x, y, l, 1 + r() * 2);
  }
  g.restore();
}

/* Static light rays from the stage's key light, rendered once. */
export function paintRays(canvas, art, viewW) {
  const g = canvas.getContext('2d');
  const R = art.rays;
  if (!R) return false;
  g.save();
  g.scale(canvas.width / viewW, canvas.height / 720);
  g.globalCompositeOperation = 'lighter';
  const ox = viewW * R.x, oy = R.y;
  const rr = rng32(viewW);
  for (let i = 0; i < R.n; i++) {
    const a = R.a0 + (R.a1 - R.a0) * (i / (R.n - 1)) + (rr() - 0.5) * 0.05;
    const w = 0.02 + rr() * 0.05;
    const len = 900;
    const gr = g.createLinearGradient(ox, oy, ox + Math.cos(a) * len, oy + Math.sin(a) * len);
    gr.addColorStop(0, rgba(R.color, R.alpha));
    gr.addColorStop(1, rgba(R.color, 0));
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(ox, oy);
    g.lineTo(ox + Math.cos(a - w) * len, oy + Math.sin(a - w) * len);
    g.lineTo(ox + Math.cos(a + w) * len, oy + Math.sin(a + w) * len);
    g.closePath();
    g.fill();
  }
  g.restore();
  return true;
}

/* ------------------------------------------------ animated light sources */
export function drawLights(g, art, viewW, camX, camY, stageW, t) {
  for (const L of art.lights) {
    const shift = (camX - viewW / 2) * L.f;
    const span = viewW + (stageW - viewW) * L.f;
    for (let x = L.start; x < span; x += L.every) {
      const sx = x - shift;
      if (sx < -200 || sx > viewW + 200) continue;
      const sy = L.y + camY * L.f;
      const fl = 0.8 + 0.2 * Math.sin(t * 13 + x) * Math.sin(t * 7.3 + x * 0.3);
      if (L.brazier) {
        g.fillStyle = '#1a0610';
        g.beginPath(); g.moveTo(sx - 40, sy); g.lineTo(sx + 40, sy); g.lineTo(sx + 16, sy + 50); g.lineTo(sx - 16, sy + 50); g.fill();
        g.fillRect(sx - 8, sy + 50, 16, 80);
      } else if (L.flame && art !== STAGE_ART.forge) {
        g.fillStyle = 'rgba(30,8,10,0.9)';
        g.fillRect(sx - 14, sy - 26, 28, 44);
      }
      glow(g, sx, sy - 10, L.r * 2.6 * fl, L.color, 0.5);
      if (L.flame) {
        for (let i = 0; i < 3; i++) {
          const h = (L.brazier ? 70 : 26) * fl * (1 - i * 0.25);
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.fillStyle = rgba(i === 2 ? '#ffffff' : L.color, 0.55);
          g.beginPath();
          const wv = Math.sin(t * 9 + i + x) * 5;
          g.moveTo(sx - (L.brazier ? 30 : 10) * (1 - i * 0.3), sy);
          g.quadraticCurveTo(sx + wv, sy - h * 1.2, sx + wv * 0.5, sy - h * 1.4);
          g.quadraticCurveTo(sx + wv, sy - h * 0.6, sx + (L.brazier ? 30 : 10) * (1 - i * 0.3), sy);
          g.fill();
          g.restore();
        }
      }
    }
  }
}

/* --------------------------------------------------------------- weather
   Screen-space particles in front of everything. State lives here, keyed
   by stage id, so it persists across frames without the engine knowing. */
const weatherState = new Map();
export function drawWeather(g, art, id, viewW, camX, t, dt, flashOut) {
  let W = weatherState.get(id);
  if (!W || W.viewW !== viewW) {
    const r = rng32(id.length * 977);
    const n = { rain: 170, petals: 40, embers: 70, mist: 6, fireflies: 46, ash: 60 }[art.weather] || 0;
    W = { viewW, r, p: Array.from({ length: n }, () => ({ x: r() * viewW, y: r() * 720, z: 0.4 + r() * 0.8, s: r() * 10 })), bolt: 0, nextBolt: 2 };
    weatherState.set(id, W);
  }
  const k = dt * 60;
  const kind = art.weather;
  g.save();
  if (kind === 'rain') {
    g.strokeStyle = 'rgba(190,230,255,0.35)';
    g.lineWidth = 1.3;
    g.beginPath();
    for (const p of W.p) {
      p.x -= 7 * p.z * k; p.y += 26 * p.z * k;
      if (p.y > 720) { p.y = -20; p.x = W.r() * (viewW + 200); }
      if (p.x < -20) p.x += viewW + 40;
      g.moveTo(p.x, p.y); g.lineTo(p.x + 5 * p.z, p.y - 20 * p.z);
    }
    g.stroke();
    W.nextBolt -= dt;
    if (W.nextBolt <= 0) { W.bolt = 0.35; W.nextBolt = 3 + W.r() * 6; W.bx = W.r() * viewW; W.seed = W.r() * 1e6; }
    if (W.bolt > 0) {
      W.bolt -= dt;
      flashOut.v = Math.max(flashOut.v, W.bolt * 1.2);
      const r = rng32(W.seed);
      g.strokeStyle = `rgba(220,250,255,${Math.min(1, W.bolt * 3)})`;
      g.lineWidth = 3;
      g.beginPath();
      let x = W.bx, y = 0;
      g.moveTo(x, y);
      while (y < HORIZON - 120) { x += (r() - 0.5) * 60; y += 30 + r() * 30; g.lineTo(x, y); }
      g.stroke();
    }
  } else if (kind === 'petals' || kind === 'ash') {
    const col = kind === 'petals' ? '#ffb6c8' : '#c8b8b0';
    g.fillStyle = col;
    for (const p of W.p) {
      p.s += 0.03 * k;
      p.x += (Math.sin(p.s) * 1.2 - 1.1) * p.z * k;
      p.y += (kind === 'petals' ? 1.1 : 0.9) * p.z * k;
      if (p.y > 730) { p.y = -10; p.x = W.r() * viewW; }
      if (p.x < -10) p.x = viewW + 10;
      g.globalAlpha = 0.5 + 0.4 * p.z;
      g.beginPath();
      g.ellipse(p.x, p.y, 4.5 * p.z, 2.2 * p.z, p.s, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === 'embers' || kind === 'fireflies') {
    g.globalCompositeOperation = 'lighter';
    const col = kind === 'embers' ? '#ff8a2a' : '#c8ff6a';
    const spr = glowSprite(col, 64);
    for (const p of W.p) {
      p.s += 0.02 * k;
      if (kind === 'embers') { p.y -= 1.6 * p.z * k; p.x += Math.sin(p.s * 2) * 0.8 * k; }
      else { p.x += Math.cos(p.s * 1.3) * 0.6 * k; p.y += Math.sin(p.s) * 0.5 * k; }
      if (p.y < -10) { p.y = 730; p.x = W.r() * viewW; }
      if (p.y > 730) p.y = -10;
      if (p.x < -10) p.x = viewW + 10;
      if (p.x > viewW + 10) p.x = -10;
      const a = kind === 'fireflies' ? 0.4 + 0.6 * Math.max(0, Math.sin(p.s * 3)) : 0.9;
      g.globalAlpha = a;
      const R = 12 * p.z;
      g.drawImage(spr, p.x - R, p.y - R, R * 2, R * 2);
    }
  } else if (kind === 'mist') {
    for (const p of W.p) {
      p.x += 0.3 * p.z * k;
      if (p.x > viewW + 400) p.x = -400;
      const y = HORIZON + 20 + p.z * 90;
      const gr = g.createRadialGradient(p.x, y, 0, p.x, y, 380);
      gr.addColorStop(0, 'rgba(160,190,240,0.16)');
      gr.addColorStop(1, 'rgba(160,190,240,0)');
      g.fillStyle = gr;
      g.save(); g.translate(p.x, y); g.scale(1, 0.22); g.translate(-p.x, -y);
      g.fillRect(p.x - 380, y - 380, 760, 760);
      g.restore();
    }
  }
  if (kind === 'fireflies') {
    // moonlight shafts
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 1;
    for (let i = 0; i < 3; i++) {
      const x = ((i * 520 - camX * 0.3) % (viewW + 600) + viewW + 600) % (viewW + 600) - 300;
      const gr = g.createLinearGradient(x, 0, x - 200, 720);
      gr.addColorStop(0, 'rgba(180,255,220,0.10)');
      gr.addColorStop(1, 'rgba(180,255,220,0)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 90, 0); g.lineTo(x - 120, 720); g.lineTo(x - 300, 720); g.fill();
    }
  }
  g.restore();
}
