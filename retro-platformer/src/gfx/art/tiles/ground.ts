import { OUTLINE, ellipse, linear, rgba, seededRandom, shade, type Ctx } from "../../paint";
import type { Material } from "../materials";

export interface GroundShape {
  /** Open space above: draw the surface layer. */
  top: boolean;
  /** Open space to the left / right: draw a cliff edge. */
  left: boolean;
  right: boolean;
}

/** Overhang allowance around the 32×32 cell (grass blades, cliff lips). */
export const GROUND_PAD = 8;

/** Surface line height at x; period 32 so neighbouring tiles join exactly. */
function surfaceY(x: number): number {
  return 3 + Math.sin((x / 32) * Math.PI * 2) * 0.8 + Math.sin((x / 32) * Math.PI * 6 + 1) * 0.5;
}

/** One ground cell. `variant` changes the texture so repeated cells don't look stamped. */
export function drawGround(ctx: Ctx, m: Material, shape: GroundShape, variant: number): void {
  const rnd = seededRandom(1000 + variant * 97);
  const [dark, mid, light] = m.soil;
  ctx.save();
  // Soil body.
  ctx.fillStyle = mid;
  ctx.fillRect(0, 0, 32, 32);
  // Soft mottling kept away from the edges so cells join seamlessly.
  for (let i = 0; i < 6; i++) {
    const x = 5 + rnd() * 22;
    const y = 5 + rnd() * 22;
    ellipse(ctx, x, y, 2 + rnd() * 4, 1.5 + rnd() * 2.5, rnd() * Math.PI);
    ctx.fillStyle = rgba(rnd() < 0.5 ? dark : light, 0.12);
    ctx.fill();
  }
  // An occasional embedded pebble with a lit top.
  const pebbles = rnd() < 0.5 ? 1 : 2;
  for (let i = 0; i < pebbles; i++) {
    const x = 6 + rnd() * 20;
    const y = (shape.top ? 13 : 5) + rnd() * (shape.top ? 13 : 21);
    const rx = 1.6 + rnd() * 2.2;
    const ry = rx * (0.6 + rnd() * 0.25);
    ellipse(ctx, x, y + 0.6, rx, ry);
    ctx.fillStyle = rgba(dark, 0.45);
    ctx.fill();
    ellipse(ctx, x, y, rx, ry);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = linear(ctx, x, y - ry, x, y + ry, [
      [0, m.pebble[2]],
      [0.5, m.pebble[1]],
      [1, m.pebble[0]],
    ]);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Fine grain.
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = rgba(rnd() < 0.5 ? dark : light, 0.22);
    ctx.fillRect(2 + rnd() * 28, 2 + rnd() * 28, 0.8, 0.8);
  }

  if (shape.top) drawSurface(ctx, m, rnd);
  if (shape.left) drawCliff(ctx, m, shape.top, -1);
  if (shape.right) drawCliff(ctx, m, shape.top, 1);
  ctx.restore();
}

function drawSurface(ctx: Ctx, m: Material, rnd: () => number): void {
  const [dark, mid, light] = m.top;
  const depth = m.topKind === "grass" ? 9 : m.topKind === "gravel" ? 8 : 7;
  // Shadow cast into the ground by the surface layer.
  ctx.fillStyle = linear(ctx, 0, depth, 0, depth + 5, [
    [0, rgba(m.soil[0], 0.65)],
    [1, rgba(m.soil[0], 0)],
  ]);
  ctx.fillRect(0, depth, 32, 5);

  if (m.topKind === "sidewalk" || m.topKind === "slab") {
    // Paving: a lit top edge, joints between slabs, and a few stains.
    ctx.fillStyle = linear(ctx, 0, 0, 0, depth, [
      [0, light],
      [0.3, mid],
      [1, dark],
    ]);
    ctx.fillRect(0, 0, 32, depth);
    ctx.fillStyle = rgba("#ffffff", m.topKind === "slab" ? 0.45 : 0.3);
    ctx.fillRect(0, 0, 32, 0.9);
    ctx.fillStyle = rgba(OUTLINE, 0.55);
    ctx.fillRect(m.topKind === "slab" ? 15.5 : 31.2, 0, 0.8, depth);
    ctx.fillRect(0, depth - 0.8, 32, 0.8);
    for (let i = 0; i < 3; i++) {
      ellipse(ctx, 4 + rnd() * 24, 2.5 + rnd() * (depth - 4), 1 + rnd() * 2, 0.6 + rnd() * 0.6);
      ctx.fillStyle = rgba(dark, 0.35);
      ctx.fill();
    }
    if (m.topKind === "slab") {
      // Polished granite catches a sheen.
      ctx.fillStyle = linear(ctx, 0, 0, 32, depth, [
        [0, "rgba(255, 255, 255, 0)"],
        [0.5, "rgba(255, 255, 255, 0.18)"],
        [1, "rgba(255, 255, 255, 0)"],
      ]);
      ctx.fillRect(0, 1, 32, depth - 2);
    }
    return;
  }

  if (m.topKind === "gravel") {
    // Packed site dirt topped with loose gravel.
    ctx.fillStyle = linear(ctx, 0, 0, 0, depth, [
      [0, light],
      [0.4, mid],
      [1, dark],
    ]);
    ctx.beginPath();
    ctx.moveTo(0, surfaceY(0));
    for (let x = 1; x <= 32; x++) ctx.lineTo(x, surfaceY(x));
    ctx.lineTo(32, depth);
    ctx.lineTo(0, depth);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 14; i++) {
      const x = 1 + rnd() * 30;
      const y = surfaceY(x) + 0.5 + rnd() * (depth - 3);
      const r = 0.6 + rnd() * 1.1;
      ellipse(ctx, x, y, r * 1.3, r);
      ctx.fillStyle = rnd() < 0.5 ? m.pebble[2] : m.pebble[1];
      ctx.fill();
    }
    return;
  }

  // Grassy band with a wavy top edge.
  ctx.beginPath();
  ctx.moveTo(0, surfaceY(0));
  for (let x = 1; x <= 32; x++) ctx.lineTo(x, surfaceY(x));
  ctx.lineTo(32, depth);
  for (let x = 32; x >= 0; x -= 2) ctx.lineTo(x, depth + Math.sin(x * 1.3) * 1.2);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, 0, 0, depth + 1, [
    [0, light],
    [0.35, mid],
    [1, dark],
  ]);
  ctx.fill();
  // Roots hanging into the soil.
  for (let i = 0; i < 4; i++) {
    const x = 3 + rnd() * 26;
    const len = 2 + rnd() * 4;
    ctx.strokeStyle = rgba(dark, 0.85);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x, depth - 0.5);
    ctx.quadraticCurveTo(x + 0.6, depth + len * 0.5, x - 0.2, depth + len);
    ctx.stroke();
  }
  // Blades poking up out of the cell.
  for (let i = 0; i < 16; i++) {
    const x = rnd() * 32;
    const base = surfaceY(x) + 1.5;
    const h = 2.5 + rnd() * 4.5;
    const lean = (rnd() - 0.5) * 3;
    ctx.strokeStyle = rnd() < 0.5 ? light : mid;
    ctx.lineWidth = 1 + rnd() * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.quadraticCurveTo(x + lean * 0.3, base - h * 0.6, x + lean, base - h);
    ctx.stroke();
  }
  // Specular rim on the surface.
  ctx.strokeStyle = rgba(shade(light, 0.4), 0.7);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let x = 0; x <= 32; x++) {
    if (x === 0) ctx.moveTo(x, surfaceY(x) + 0.6);
    else ctx.lineTo(x, surfaceY(x) + 0.6);
  }
  ctx.stroke();
  // The odd park flower.
  if (rnd() < 0.5) {
    const x = 4 + rnd() * 24;
    const y = surfaceY(x) - 1;
    const petal = rnd() < 0.5 ? "#fff6c8" : "#ffd0e0";
    ctx.strokeStyle = shade(m.top[0], -0.2);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y + 2);
    ctx.lineTo(x, y - 1.5);
    ctx.stroke();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      ellipse(ctx, x + Math.cos(a) * 1.1, y - 2 + Math.sin(a) * 1.1, 0.9, 0.9);
      ctx.fillStyle = petal;
      ctx.fill();
    }
    ellipse(ctx, x, y - 2, 0.6, 0.6);
    ctx.fillStyle = "#ffcc33";
    ctx.fill();
  }
}

/** Exposed side of the ground (a pit edge), with the surface curling over the corner. */
function drawCliff(ctx: Ctx, m: Material, top: boolean, side: -1 | 1): void {
  const edge = side < 0 ? 0 : 32;
  const inner = edge - side * 6;
  ctx.fillStyle = linear(ctx, edge, 0, inner, 0, [
    [0, rgba(m.soil[0], 0.95)],
    [1, rgba(m.soil[0], 0)],
  ]);
  ctx.fillRect(Math.min(edge, inner), 0, 6, 32);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(edge, top ? 4 : 0);
  ctx.lineTo(edge, 32);
  ctx.stroke();
  if (top && m.topKind === "grass") {
    // Grass lip rolling over the edge.
    ctx.beginPath();
    ctx.moveTo(edge - side * 4, surfaceY(edge - side * 4));
    ctx.quadraticCurveTo(edge + side * 2.5, surfaceY(edge) - 0.5, edge + side * 1.8, 6.5);
    ctx.quadraticCurveTo(edge + side * 1.2, 10, edge - side * 1, 9.5);
    ctx.lineTo(edge - side * 4, 8);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, 0, 1, 0, 10, [
      [0, m.top[2]],
      [1, m.top[0]],
    ]);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
}
