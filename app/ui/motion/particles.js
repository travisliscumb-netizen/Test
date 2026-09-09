/**
 * The completion effect.
 *
 * A short burst of grass blades thrown from the Done button, under real
 * gravity and drag, with each blade tumbling about its own axis.
 *
 * Three rules keep it from ever being in the way:
 *   - the state change has already been committed before this is called; the
 *     effect is decoration over work that is already done
 *   - it renders to a single canvas on the compositor and touches no layout
 *   - it is capped by device capability and skipped entirely in calm motion,
 *     on low-core devices, and when the page is not visible
 */

import { ticker, prefersCalm } from './spring.js';

const GRAVITY = 2100;      // px/s²
const DRAG = 0.86;

let canvas = null;
let ctx = null;
let dpr = 1;
let blades = [];
let running = false;

function ensureCanvas() {
  if (canvas) return canvas;
  canvas = document.createElement('canvas');
  canvas.className = 'fx-layer';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  resize();
  addEventListener('resize', resize, { passive: true });
  return canvas;
}

function resize() {
  if (!canvas) return;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
}

function budget() {
  if (prefersCalm()) return 0;
  if (document.visibilityState !== 'visible') return 0;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (cores <= 2 || mem <= 2) return 0;
  if (cores <= 4) return 14;
  return 26;
}

/**
 * @param {DOMRect|{left,top,width,height}} origin  the button that was pressed
 * @param {string} colorA  accent
 * @param {string} colorB  accent-bright
 */
export function burst(origin, colorA = '#4ade80', colorB = '#86f7ad') {
  const n = budget();
  if (!n) return;
  ensureCanvas();

  const cx = origin.left + origin.width / 2;
  const cy = origin.top + origin.height / 2;

  for (let i = 0; i < n; i++) {
    // Thrown upward and outward in a fan, biased along the button's width so
    // it reads as coming off the key rather than out of a point.
    const spread = (Math.random() - 0.5) * origin.width * 0.9;
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
    const speed = 320 + Math.random() * 460;
    blades.push({
      x: cx + spread,
      y: cy - origin.height * 0.15,
      vx: Math.cos(angle) * speed * (0.55 + Math.random() * 0.8),
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 16,
      len: 7 + Math.random() * 8,
      wid: 1.6 + Math.random() * 1.7,
      life: 0,
      ttl: 0.62 + Math.random() * 0.5,
      color: Math.random() < 0.45 ? colorB : colorA,
    });
  }
  if (blades.length > 90) blades = blades.slice(-90);
  start();
}

function start() {
  if (running) return;
  running = true;
  ticker.add((dt) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    const drag = Math.pow(DRAG, dt * 60);
    for (let i = blades.length - 1; i >= 0; i--) {
      const b = blades[i];
      b.life += dt;
      if (b.life >= b.ttl) { blades.splice(i, 1); continue; }
      b.vy += GRAVITY * dt;
      b.vx *= drag;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vrot * dt;

      const t = b.life / b.ttl;
      const alpha = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
      ctx.globalAlpha = Math.max(0, alpha) * 0.95;
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.color;
      // A blade, not a square: tapered, rounded at the tip.
      ctx.beginPath();
      ctx.moveTo(-b.wid / 2, b.len / 2);
      ctx.quadraticCurveTo(-b.wid / 2, -b.len / 2, 0, -b.len / 2);
      ctx.quadraticCurveTo(b.wid / 2, -b.len / 2, b.wid / 2, b.len / 2);
      ctx.closePath();
      ctx.fill();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.restore();
    if (!blades.length) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      running = false;
      return false;
    }
    return true;
  });
}

/** Stops immediately and clears. Called when the app is backgrounded. */
export function clearEffects() {
  blades = [];
  if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  running = false;
}
