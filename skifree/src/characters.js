// Characters are drawn live every frame (there are only a couple of dozen on
// screen), so poses can be continuous: skis follow the exact heading, the body
// leans into turns, the yeti's arms pump in time with its stride.
//
// All functions draw with the origin at the character's footprint on the snow.
import { C, OUTFITS, DOG_COATS } from './palette.js';

const TAU = Math.PI * 2;

function ell(ctx, x, y, rx, ry, fill, stroke, lw = 1.3, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

// Stroke drawn twice: dark outline under a coloured core.
function line2(ctx, x0, y0, x1, y1, color, w) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = w + 1.8;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}

export function groundShadow(ctx, rx, z = 0) {
  const k = 1 / (1 + z / 60);
  ell(ctx, 2, 1, rx * (0.6 + 0.4 * k), rx * 0.32 * (0.6 + 0.4 * k), `rgba(38, 66, 112, ${0.2 * k + 0.05})`);
}

function star(ctx, x, y, r, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 0.7;
  ctx.stroke();
}

function dizzy(ctx, x, y, t) {
  for (let i = 0; i < 3; i++) {
    const a = t * 5 + (i * TAU) / 3;
    star(ctx, x + Math.cos(a) * 8, y + Math.sin(a) * 2.6, 2.4, C.yellow);
  }
}

// ------------------------------------------------------------------ skier
//
// s: { heading, travel, state, anim, turbo, tucking, braking, walking, z,
//      stateTime, outfit, poles }
export function drawSkier(ctx, s) {
  const [jacket, pants, hat, skiColor] = OUTFITS[s.outfit ?? 0];
  if (s.state === 'crash') return skierSprawled(ctx, s, jacket, pants, hat, skiColor);
  if (s.state === 'tumble' || s.state === 'fall') return skierTumble(ctx, s, jacket, pants, hat, skiColor);
  if (s.state === 'recover') return skierKneel(ctx, s, jacket, pants, hat, skiColor);

  const h = s.heading;
  const dx = Math.sin(h), dy = Math.cos(h) * 0.72; // slope foreshortening
  const px = Math.cos(h), py = -Math.sin(h) * 0.72; // across the skis
  const tuck = s.turbo ? 1 : s.tucking ? 0.6 : 0;
  const walk = s.walking ? Math.sin(s.anim * 14) : 0;
  const zlift = -(s.z || 0);

  ctx.save();
  ctx.translate(0, zlift);

  // Skis. Braking splays the tails into a snowplough.
  const plough = s.braking ? 0.32 : 0;
  for (const side of [-1, 1]) {
    const a = h + side * plough * -1;
    const sdx = Math.sin(a), sdy = Math.cos(a) * 0.72;
    const ox = px * side * 3.3 + (side === 1 ? walk * dx * 2 : -walk * dx * 2);
    const oy = py * side * 3.3 + 1;
    line2(ctx, ox - sdx * 10, oy - sdy * 10, ox + sdx * 13, oy + sdy * 13, skiColor, 2.3);
    // Upturned tips.
    ell(ctx, ox + sdx * 13, oy + sdy * 13, 1.5, 1.5, skiColor, C.outline, 0.8);
  }

  const lean = dx * (2.5 + tuck * 1.5);
  const hipY = -10 + tuck * 2.5;
  const torsoY = -16 + tuck * 4;
  const headY = -25 + tuck * 5.5;
  const fwd = dy * tuck * 3; // leaning down the fall line in a tuck

  // Legs.
  for (const side of [-1, 1]) {
    line2(ctx, px * side * 3.2, py * side * 3.2 - 1, lean * 0.6 + side * 2.2, hipY, pants, 3);
  }
  // Poles, trailing behind.
  const poleSwing = s.walking ? Math.sin(s.anim * 14) * 3 : 0;
  for (const side of [-1, 1]) {
    const hx = lean + side * (6.5 - tuck * 1.5) + fwd * 0.3;
    const hy = torsoY + 3 - tuck * 1;
    const tx = hx - dx * (9 + tuck * 6) + side * 1.5 + side * poleSwing;
    const ty = hy + 13 - dy * (6 + tuck * 5);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ell(ctx, tx, ty, 1.2, 0.6, null, C.outline, 0.6);
  }
  // Torso.
  ell(ctx, lean + fwd * 0.2, torsoY, 5.4, 6.6 - tuck * 0.8, jacket, C.outline, 1.3);
  ctx.beginPath();
  ctx.moveTo(lean - 4.6, torsoY + 1);
  ctx.lineTo(lean + 4.6, torsoY + 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  // Arms.
  for (const side of [-1, 1]) {
    const hx = lean + side * (6.5 - tuck * 1.5) + fwd * 0.3;
    const hy = torsoY + 3 - tuck;
    line2(ctx, lean + side * 3.8, torsoY - 3, hx, hy, jacket, 2.4);
    ell(ctx, hx, hy, 1.5, 1.5, C.outline);
  }
  // Head.
  const hx = lean * 1.25 + fwd * 0.4;
  ell(ctx, hx, headY, 4.4, 4.4, C.skin, C.outline, 1.3);
  // Goggles: a band when facing down the hill, a profile lens when turned.
  const face = Math.abs(h) < 1.2;
  if (face) {
    ctx.fillStyle = C.outline;
    ctx.fillRect(hx - 3.8 + dx * 1.2, headY - 1.4, 7.6, 2.8);
    ctx.fillStyle = '#7fd0ff';
    ctx.fillRect(hx - 2.8 + dx * 1.8, headY - 0.9, 5.6 - Math.abs(dx) * 2, 1.8);
  } else {
    ctx.fillStyle = C.outline;
    ctx.fillRect(hx + Math.sign(dx) * 1 - 1.5, headY - 1.4, 4, 2.8);
  }
  // Beanie + bobble.
  ctx.beginPath();
  ctx.arc(hx, headY - 0.6, 4.6, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = hat;
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ell(ctx, hx - dx * 1.5, headY - 5.6, 1.8, 1.8, hat, C.outline, 1);
  ctx.restore();
}

function skierSprawled(ctx, s, jacket, pants, hat, skiColor) {
  const t = s.anim;
  const dir = Math.sin(s.travel) >= 0 ? 1 : -1;
  // Skis flung into an X.
  line2(ctx, -12, -6, 10, 5, skiColor, 2.3);
  line2(ctx, -10, 6, 13, -5, skiColor, 2.3);
  ctx.save();
  ctx.scale(dir, 1);
  // Flat on the snow, face down, limbs out.
  line2(ctx, -2, -2, -11, 3, pants, 3);
  line2(ctx, -2, 0, -10, -5, pants, 3);
  line2(ctx, 3, -3, 9, -8, jacket, 2.4);
  line2(ctx, 3, 0, 10, 3, jacket, 2.4);
  ell(ctx, 1, -1.5, 6.4, 4.2, jacket, C.outline, 1.3, 0.1);
  ell(ctx, 9.5, -2, 4, 3.6, C.skin, C.outline, 1.2);
  ctx.beginPath();
  ctx.arc(10, -2.4, 4.1, -Math.PI / 2, Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = hat;
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  // Snow kicked up around the impact.
  ell(ctx, -4, 5, 5, 2, '#ffffff', 'rgba(140,165,200,0.6)', 0.8);
  ell(ctx, 7, 5.5, 3.5, 1.6, '#ffffff', 'rgba(140,165,200,0.6)', 0.8);
  dizzy(ctx, 9 * dir, -10, t);
}

function skierTumble(ctx, s, jacket, pants, hat, skiColor) {
  const spin = s.anim * 13 * (Math.sin(s.travel) >= 0 ? 1 : -1);
  ctx.save();
  ctx.translate(0, -9);
  ctx.rotate(spin);
  line2(ctx, -11, 5, 11, 5, skiColor, 2.2);
  line2(ctx, -3, 1, -5, 5, pants, 3);
  line2(ctx, 3, 1, 5, 5, pants, 3);
  ell(ctx, 0, -1, 5, 5.4, jacket, C.outline, 1.3);
  line2(ctx, -4, -3, -9, -6, jacket, 2.2);
  line2(ctx, 4, -3, 9, -7, jacket, 2.2);
  ell(ctx, 0, -8.5, 3.8, 3.8, C.skin, C.outline, 1.2);
  ctx.beginPath();
  ctx.arc(0, -9, 4, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = hat;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // Snow puffs flying off the roll.
  for (let i = 0; i < 3; i++) {
    const a = spin * 0.7 + i * 2.1;
    ell(ctx, Math.cos(a) * 11, -8 + Math.sin(a) * 7, 2.2, 1.8, '#ffffff', 'rgba(140,165,200,0.7)', 0.7);
  }
}

function skierKneel(ctx, s, jacket, pants, hat, skiColor) {
  const up = 1 - Math.max(0, Math.min(1, s.stateTime / 0.32)); // 0 kneeling -> 1 standing
  line2(ctx, -3.3, -9, -3.3, 13, skiColor, 2.3);
  line2(ctx, 3.3, -9, 3.3, 13, skiColor, 2.3);
  const hy = -5 - up * 5;
  line2(ctx, -3, 1, -2.4, hy, pants, 3);
  line2(ctx, 3, 1, 2.4, hy, pants, 3);
  ell(ctx, 0, hy - 5.5, 5.4, 6.2, jacket, C.outline, 1.3);
  line2(ctx, -4, hy - 7, -8, hy + 1, jacket, 2.4);
  line2(ctx, 4, hy - 7, 8, hy + 1, jacket, 2.4);
  ell(ctx, 0, hy - 14.5, 4.4, 4.4, C.skin, C.outline, 1.3);
  ctx.fillStyle = C.outline;
  ctx.fillRect(-3.8, hy - 15.9, 7.6, 2.8);
  ctx.beginPath();
  ctx.arc(0, hy - 15, 4.6, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = hat;
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // Brushing off snow.
  ell(ctx, -8, 3, 3, 1.4, '#ffffff', 'rgba(140,165,200,0.6)', 0.7);
}

// -------------------------------------------------------------- snowboarder

export function drawBoarder(ctx, s) {
  const [jacket, pants, hat, board] = OUTFITS[s.outfit ?? 1];
  if (s.state === 'fall') return skierTumble(ctx, s, jacket, pants, hat, board);
  const h = s.heading;
  const z = -(s.z || 0);
  ctx.save();
  ctx.translate(0, z);
  // The board sits across the fall line, swinging with the carve.
  const ba = h * 0.6 + Math.PI / 2;
  const bx = Math.sin(ba) * 11, by = Math.cos(ba) * 11 * 0.72;
  ctx.beginPath();
  ctx.moveTo(-bx, -by);
  ctx.lineTo(bx, by);
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 7.4;
  ctx.stroke();
  ctx.strokeStyle = board;
  ctx.lineWidth = 5.4;
  ctx.stroke();
  const lean = Math.sin(h) * 3;
  const face = Math.sign(Math.sin(ba)) || 1;
  line2(ctx, -bx * 0.35, -by * 0.35, lean - 2, -9, pants, 3);
  line2(ctx, bx * 0.35, by * 0.35, lean + 2, -9, pants, 3);
  ell(ctx, lean, -15, 5.6, 6.4, jacket, C.outline, 1.3);
  // Arms out for balance.
  line2(ctx, lean - 4, -18, lean - 11, -14 + Math.sin(s.anim * 3) * 2, jacket, 2.3);
  line2(ctx, lean + 4, -18, lean + 11, -16 - Math.sin(s.anim * 3) * 2, jacket, 2.3);
  ell(ctx, lean * 1.2, -24.5, 4.4, 4.4, C.skin, C.outline, 1.3);
  ctx.fillStyle = C.outline;
  ctx.fillRect(lean * 1.2 - 3.6 + face, -25.8, 7, 2.6);
  // Hood-up beanie with a long tail.
  ctx.beginPath();
  ctx.arc(lean * 1.2, -25, 4.6, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = hat;
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  line2(ctx, lean * 1.2 - 3, -28, lean * 1.2 - 7 - Math.sin(s.anim * 6), -24, hat, 1.8);
  ctx.restore();
}

// ---------------------------------------------------------------------- dog

export function drawDog(ctx, d) {
  const [coat, patch] = DOG_COATS[d.look % DOG_COATS.length];
  const facing = Math.sin(d.heading) >= 0 ? 1 : -1;
  const running = d.speed > 20 && d.state !== 'sit';
  const t = d.anim * (running ? 18 : 4);
  ctx.save();
  ctx.scale(facing, 1);
  if (d.state === 'sit') {
    // Sitting: upright body, tail sweeping the snow.
    line2(ctx, -5, -1, -11 - Math.sin(t) * 2, -3 + Math.cos(t) * 1.5, coat, 2);
    ell(ctx, -1, -6, 5.5, 5, coat, C.outline, 1.2);
    line2(ctx, 2, -3, 3, 0, coat, 1.8);
    line2(ctx, 4, -3, 5, 0, coat, 1.8);
    ell(ctx, 3.5, -12.5, 4, 3.6, coat, C.outline, 1.2);
    ell(ctx, 7, -11.5, 2.2, 1.6, coat, C.outline, 1);
    ell(ctx, 8.8, -11.9, 0.9, 0.8, C.outline);
    ell(ctx, 4.5, -13.6, 0.7, 0.7, C.outline);
    ell(ctx, 1.4, -13, 1.6, 3, patch, C.outline, 0.8, 0.3);
    ctx.fillStyle = C.red;
    ctx.fillRect(1, -9.8, 4.5, 1.2);
    ctx.restore();
    return;
  }
  const bob = running ? Math.abs(Math.sin(t)) * 1.5 : 0;
  ctx.translate(0, -bob);
  // Legs: gallop when running, walk when trotting.
  const swing = running ? 4 : 2;
  for (const [x, ph] of [[-5, 0], [-3, Math.PI], [3, Math.PI * 0.5], [5, Math.PI * 1.5]]) {
    const k = Math.sin(t + ph);
    line2(ctx, x, -5, x + k * swing, 0 + bob, coat, 1.6);
  }
  // Tail, wagging.
  line2(ctx, -7, -8, -12, -11 + Math.sin(t * 1.3) * 2.5, coat, 1.8);
  ell(ctx, 0, -7, 8, 4.2, coat, C.outline, 1.2);
  ell(ctx, -2, -8.5, 3, 2, patch);
  // Head, ears flapping.
  ell(ctx, 8.5, -11, 3.8, 3.4, coat, C.outline, 1.2);
  ell(ctx, 12, -10, 2.2, 1.6, coat, C.outline, 1);
  ell(ctx, 13.8, -10.3, 0.9, 0.8, C.outline);
  ell(ctx, 9.5, -12, 0.7, 0.7, C.outline);
  ell(ctx, 6.6, -11.6 + (running ? Math.sin(t) : 0), 1.6, 3, patch, C.outline, 0.8, running ? -0.6 : 0.3);
  if (running) {
    // Tongue out.
    ell(ctx, 12.3, -8.2, 0.9, 1.4, '#ff6f8a');
  }
  ctx.fillStyle = C.red;
  ctx.fillRect(5.2, -10, 1.3, 3.6);
  ctx.restore();
}

// --------------------------------------------------------------------- yeti

// Jagged fur outline around an ellipse, stable from frame to frame.
function furBlob(ctx, cx, cy, rx, ry, spikes, fill, stroke, jag = 0.12) {
  ctx.beginPath();
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * TAU;
    const r = i % 2 ? 1 - jag : 1 + jag * 0.3;
    const x = cx + Math.cos(a) * rx * r, y = cy + Math.sin(a) * ry * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
}

function furArm(ctx, x0, y0, x1, y1, w) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const len = Math.hypot(x1 - x0, y1 - y0);
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(a);
  furBlob(ctx, len / 2, 0, len / 2 + 2, w, 6, C.yeti, C.outline, 0.16);
  ell(ctx, len / 2, w * 0.35, len / 2 - 2, w * 0.35, C.yetiShade);
  // Grey hand with three claws.
  ell(ctx, len + 1, 0, 3.8, 3.4, C.yetiFace, C.outline, 1.4);
  for (const k of [-1, 0, 1]) {
    ctx.beginPath();
    ctx.moveTo(len + 3.5, k * 2);
    ctx.lineTo(len + 6.5, k * 2.6);
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
}

function yetiFace(ctx, x, y, mood, open) {
  // Grey face mask.
  ell(ctx, x, y, 8.6, 7.2, C.yetiFace, C.outline, 1.4);
  // Eyes: angry for the chase, squeezed shut and happy for the celebration.
  if (mood === 'happy') {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x + s * 3.4, y - 2.4, 1.9, Math.PI * 1.1, Math.PI * 1.9);
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  } else {
    for (const s of [-1, 1]) {
      ell(ctx, x + s * 3.4, y - 2.4, 1.8, 1.9, '#ffffff', C.outline, 1);
      ell(ctx, x + s * 3.1, y - 2.1, 1, 1.1, C.outline);
      // Brows.
      ctx.beginPath();
      ctx.moveTo(x + s * 1.2, y - 4.2);
      ctx.lineTo(x + s * 6, y - 6.3);
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 1.9;
      ctx.stroke();
    }
  }
  // Mouth.
  const mh = 1 + open * 3.8;
  ell(ctx, x, y + 3.2, 4.6 + open * 0.6, mh, C.mouth, C.outline, 1.2);
  if (open > 0.3) {
    // Fangs.
    ctx.fillStyle = '#ffffff';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + s * 3, y + 3.2 - mh + 0.3);
      ctx.lineTo(x + s * 1.6, y + 3.2 - mh + 0.3);
      ctx.lineTo(x + s * 2.3, y + 3.2 - mh + 2.4);
      ctx.fill();
    }
    ell(ctx, x, y + 3.2 + mh * 0.45, 2.6, mh * 0.35, '#e0556a');
  } else if (mood === 'happy') {
    ctx.beginPath();
    ctx.arc(x, y + 1.6, 3.6, 0.2, Math.PI - 0.2);
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
}

// y: { state, anim, heading, speed, eatTime, lunging, outfit }
export function drawYeti(ctx, y) {
  const facing = Math.sin(y.heading) >= 0 ? 1 : -1;
  if (y.state === 'eat') return yetiEating(ctx, y);

  const stride = y.anim * (6 + Math.min(10, y.speed / 30));
  const run = y.speed > 30 ? 1 : 0.2;
  const bob = Math.abs(Math.sin(stride)) * 3.2 * run;
  const stumble = y.state === 'stumble';

  ctx.save();
  if (stumble) {
    ctx.translate(0, -2);
    ctx.rotate(facing * 0.55);
  }
  // Feet.
  for (const s of [-1, 1]) {
    const k = Math.sin(stride + (s > 0 ? Math.PI : 0)) * run;
    ell(ctx, s * 8 + k * 2, -2 - Math.max(0, k) * 4, 6, 3.4, C.yetiFace, C.outline, 1.5);
  }
  ctx.translate(0, -bob);
  // Legs.
  for (const s of [-1, 1]) {
    const k = Math.sin(stride + (s > 0 ? Math.PI : 0)) * run;
    furBlob(ctx, s * 8 + k * 1.5, -9 - Math.max(0, k) * 2, 6, 7, 5, C.yeti, C.outline, 0.14);
  }
  // Arms up, pumping. Lunge throws them forward.
  const pump = Math.sin(stride) * 5 * run;
  const reach = y.lunging ? 1 : 0;
  for (const s of [-1, 1]) {
    const hx = s * (25 - reach * 6) + facing * reach * 4;
    const hy = -60 + s * pump + reach * 22;
    furArm(ctx, s * 13, -37, hx, hy, 4.6);
  }
  // Body.
  furBlob(ctx, 0, -28, 17, 20, 11, C.yeti, C.outline, 0.1);
  ell(ctx, 4, -22, 11, 12, C.yetiShade);
  furBlob(ctx, 0, -28, 17, 20, 11, 'rgba(0,0,0,0)', C.outline, 0.1);
  // Head.
  furBlob(ctx, facing * 1.5, -46, 12.5, 11, 9, C.yeti, C.outline, 0.14);
  yetiFace(ctx, facing * 2, -44, 'angry', y.lunging ? 1 : 0.35 + Math.abs(Math.sin(stride * 0.5)) * 0.25);
  if (stumble) dizzy(ctx, 0, -62, y.anim);
  ctx.restore();
}

// The classic: grab, gulp, chew, then a very pleased hop.
function yetiEating(ctx, y) {
  const e = y.eatTime;
  const o = OUTFITS[y.outfit ?? 0];
  let bodyY = 0;
  let mood = 'angry';
  let open = 0.2;
  let armL = [-25, -58];
  let armR = [25, -58];
  let victim = null; // [x, y, scale, rotation]
  let legsOut = 0;

  if (e < 0.35) {
    // Grab: arms swing down onto the skier.
    const k = e / 0.35;
    armL = [-25 + k * 14, -58 + k * 42];
    armR = [25 - k * 14, -58 + k * 42];
    open = 0.5 + k * 0.5;
    victim = [0, -10, 1, 0];
  } else if (e < 1.1) {
    // Lift over the head, then down the hatch head-first.
    const k = (e - 0.35) / 0.75;
    const lift = Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5);
    const sink = Math.max(0, (k - 0.55) / 0.45);
    armL = [-10, -18 - lift * 50];
    armR = [10, -18 - lift * 50];
    open = 1;
    victim = [0, -18 - lift * 52 + sink * 14, 1 - sink * 0.2, Math.PI * lift];
    legsOut = sink;
  } else if (e < 1.8) {
    // Chew. Skis still poking out, then gone.
    const k = (e - 1.1) / 0.7;
    open = Math.abs(Math.sin(k * Math.PI * 5)) * 0.5;
    armL = [-18, -34 + Math.sin(k * 20) * 2];
    armR = [18, -34 - Math.sin(k * 20) * 2];
    legsOut = k < 0.5 ? 1 - k * 2 : 0;
  } else {
    // Celebrate: hops with arms up, patting its belly on the landings.
    const k = e - 1.8;
    const hop = Math.abs(Math.sin(k * 7));
    bodyY = -hop * 16;
    mood = 'happy';
    open = 0;
    const pat = hop < 0.3;
    armL = pat ? [-6, -22] : [-24, -64];
    armR = pat ? [6, -22] : [24, -64];
  }

  // Shadow shrinks as it hops.
  ctx.save();
  ctx.translate(0, bodyY);
  for (const s of [-1, 1]) ell(ctx, s * 8, -2, 6, 3.4, C.yetiFace, C.outline, 1.5);
  for (const s of [-1, 1]) furBlob(ctx, s * 8, -9, 6, 7, 5, C.yeti, C.outline, 0.14);
  furBlob(ctx, 0, -28, 17 + (e > 1.1 && e < 1.8 ? 2 : 0), 20, 11, C.yeti, C.outline, 0.1);
  ell(ctx, 4, -22, 11, 12, C.yetiShade);
  furBlob(ctx, 0, -28, 17, 20, 11, 'rgba(0,0,0,0)', C.outline, 0.1);
  furBlob(ctx, 0, -46, 12.5, 11, 9, C.yeti, C.outline, 0.14);
  // Cheeks puff while chewing.
  if (e >= 1.1 && e < 1.8) {
    const puff = 1 + Math.abs(Math.sin(e * 16)) * 0.25;
    ell(ctx, -8, -41, 4 * puff, 3.4 * puff, C.yeti, C.outline, 1.2);
    ell(ctx, 8, -41, 4 * puff, 3.4 * puff, C.yeti, C.outline, 1.2);
  }
  yetiFace(ctx, 0, -44, mood, open);
  // Skis sticking out of the mouth.
  if (legsOut > 0) {
    ctx.save();
    ctx.translate(0, -40);
    ctx.globalAlpha = Math.min(1, legsOut * 1.5);
    line2(ctx, -2, 0, -6 - legsOut * 4, -10 - legsOut * 8, o[3], 2.2);
    line2(ctx, 2, 0, 6 + legsOut * 4, -10 - legsOut * 8, o[3], 2.2);
    line2(ctx, -1.5, 0, -3, -6 * legsOut, o[1], 2.6);
    line2(ctx, 1.5, 0, 3, -6 * legsOut, o[1], 2.6);
    ctx.restore();
  }
  if (victim) {
    ctx.save();
    ctx.translate(victim[0], victim[1]);
    ctx.rotate(victim[3]);
    ctx.scale(victim[2], victim[2]);
    // A limp little skier, dangling.
    line2(ctx, -3, 8, -4, 18, o[3], 2);
    line2(ctx, 3, 8, 4, 18, o[3], 2);
    line2(ctx, -2, 0, -3, 9, o[1], 2.6);
    line2(ctx, 2, 0, 3, 9, o[1], 2.6);
    ell(ctx, 0, -4, 4.6, 5.6, o[0], C.outline, 1.2);
    ell(ctx, 0, -12, 4, 4, C.skin, C.outline, 1.2);
    ctx.beginPath();
    ctx.arc(0, -12.6, 4.2, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = o[2];
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  for (const [s, a] of [[-1, armL], [1, armR]]) furArm(ctx, s * 13, -37, a[0], a[1], 4.6);
  ctx.restore();
}

// ---------------------------------------------------------------- chairlift

export function drawChair(ctx, riders, looks) {
  // Hanger from the cable down to the seat.
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 30);
  ctx.stroke();
  for (let i = 0; i < riders; i++) {
    const x = i ? 4 : -4;
    const o = OUTFITS[looks[i] % OUTFITS.length];
    line2(ctx, x - 1, 36, x - 1.5, 42, o[1], 2.2);
    line2(ctx, x + 1, 36, x + 1.5, 42, o[1], 2.2);
    line2(ctx, x - 2.5, 43, x + 2, 45, o[3], 1.8);
    ell(ctx, x, 30.5, 3.4, 4.2, o[0], C.outline, 1.1);
    ell(ctx, x, 24.5, 3, 3, C.skin, C.outline, 1.1);
    ctx.beginPath();
    ctx.arc(x, 24, 3.1, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = o[2];
    ctx.fill();
    ctx.stroke();
  }
  // Seat and back rest.
  ctx.fillStyle = '#3a4250';
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.rect(-10, 34, 20, 3);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(-10, 27, 20, 2);
  ctx.fill();
  ctx.stroke();
}
