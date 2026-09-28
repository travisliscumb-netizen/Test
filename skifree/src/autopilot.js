// A simple skiing bot. It drives the attract-mode skier behind the title
// screen, and the headless tests use it to play thousands of metres of real
// game. It only produces the same input object a human would.
import { OBJECTS } from './objects.js';

const DANGER = new Set(['crash', 'tumble', 'smash']);

// Distance along a heading before hitting something that would knock us down.
function clearance(game, x, y, h, reach, pad) {
  const dx = Math.sin(h), dy = Math.cos(h);
  let best = reach;
  const midX = x + dx * reach * 0.5, midY = y + dy * reach * 0.5;
  game.world.forEachNear(midX, midY, reach * 0.5 + pad, (o) => {
    const def = OBJECTS[o.t];
    if (o.state || !DANGER.has(def.hit)) return;
    const rx = o.x - x, ry = o.y - y;
    const t = rx * dx + ry * dy;
    if (t < 0 || t > best) return;
    const side = Math.abs(rx * dy - ry * dx);
    if (side < def.r + pad) best = t;
  });
  for (const a of game.actors) {
    if (a.fallen) continue;
    const rx = a.x - x, ry = a.y - y;
    const t = rx * dx + ry * dy;
    if (t < 0 || t > best) continue;
    if (Math.abs(rx * dy - ry * dx) < a.radius + pad + 4) best = t;
  }
  return best;
}

// opts: { turbo: 'never' | 'yeti' | 'always', skill: 0..1, driftHome: bool }
export function autopilot(game, opts = {}) {
  const p = game.player;
  const out = { left: false, right: false, up: false, down: false, jump: false, turbo: false, aim: null };
  if (!p.controllable) return out;
  const skill = opts.skill ?? 1;
  const reach = 90 + p.speed * (0.7 + skill * 0.5);
  const y = game.yeti && (game.yeti.state === 'chase' || game.yeti.state === 'stumble') ? game.yeti : null;

  let best = 0, bestScore = -Infinity;
  for (let h = -1.2; h <= 1.2001; h += 0.1) {
    const clear = clearance(game, p.x, p.y, h, reach, 11);
    let score = (clear / reach) * 3 + Math.cos(h) * 0.9 - Math.abs(h - p.heading) * 0.35;
    if (clear < reach * 0.35) score -= 3;
    // Wander back towards the middle of the mountain eventually.
    if (opts.driftHome !== false) score -= Math.sign(p.x) * Math.sin(h) * Math.min(1, Math.abs(p.x) / 6000);
    if (y) {
      const ax = p.x - y.x, ay = p.y - y.y;
      const len = Math.hypot(ax, ay) || 1;
      score += ((Math.sin(h) * ax + Math.cos(h) * ay) / len) * 0.8;
    }
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  out.aim = best;
  const ahead = clearance(game, p.x, p.y, best, reach, 11);
  out.turbo = opts.turbo === 'always' || (opts.turbo === 'yeti' && !!y && ahead > reach * 0.7);
  // Hop anything low that we can't steer around.
  if (ahead < 40 && p.speed > 60) {
    let low = true;
    game.world.forEachNear(p.x + Math.sin(best) * 30, p.y + Math.cos(best) * 30, 24, (o) => {
      if (OBJECTS[o.t].h > 30 && OBJECTS[o.t].solid) low = false;
    });
    if (low) out.jump = true;
    else out.down = true;
  }
  return out;
}
