import { OUTLINE, capsule, ellipse, fillStroke, radial, type Ctx } from "../../paint";

/**
 * Shared pieces for the critters. Every critter is drawn facing right with
 * its origin at the middle of its feet (y up is negative), in logical pixels.
 */

/** Three tones of one colour: shadow, base, light. */
export type Tone = readonly [dark: string, mid: string, light: string];

export const LINE = 1.1;

export function begin(ctx: Ctx): void {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
}

/** A rounded body part lit from the upper right. */
export function blob(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, tone: Tone, rotation = 0, line = LINE): void {
  ellipse(ctx, cx, cy, rx, ry, rotation);
  fillStroke(ctx, radial(ctx, cx, cy, Math.max(rx, ry) * 1.15, [
    [0, tone[2]],
    [0.55, tone[1]],
    [1, tone[0]],
  ], cx + rx * 0.3, cy - ry * 0.4), OUTLINE, line);
}

/** A glossy eye looking forward, with an optional angry brow slanting down toward the snout. */
export function eye(ctx: Ctx, x: number, y: number, r: number, opts: { iris?: string; angry?: boolean; lid?: number; glow?: boolean } = {}): void {
  const { iris = "#1a1016", angry = true, lid = 0, glow = false } = opts;
  if (glow) {
    ellipse(ctx, x, y, r * 1.9, r * 1.9);
    ctx.fillStyle = radial(ctx, x, y, r * 1.9, [
      [0, "rgba(255, 80, 60, 0.45)"],
      [1, "rgba(255, 80, 60, 0)"],
    ]);
    ctx.fill();
  }
  ellipse(ctx, x, y, r, r * 1.08);
  fillStroke(ctx, "#ffffff", OUTLINE, 0.7);
  ellipse(ctx, x + r * 0.3, y + r * 0.1, r * 0.58, r * 0.66);
  ctx.fillStyle = iris;
  ctx.fill();
  ellipse(ctx, x + r * 0.42, y - r * 0.18, r * 0.2, r * 0.2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  if (lid > 0) {
    // Heavy lid: a sly, scheming look.
    ctx.save();
    ellipse(ctx, x, y, r, r * 1.08);
    ctx.clip();
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(x - r, y - r * 1.1, r * 2, r * 2.2 * lid);
    ctx.restore();
  }
  if (angry) {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(0.9, r * 0.45);
    ctx.beginPath();
    ctx.moveTo(x - r * 1.05, y - r * 1.45);
    ctx.lineTo(x + r * 1.1, y - r * 0.75);
    ctx.stroke();
  }
}

/** Closed, dazed eyes for a squashed critter. */
export function xEye(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x - r, y - r);
  ctx.lineTo(x + r, y + r);
  ctx.moveTo(x + r, y - r);
  ctx.lineTo(x - r, y + r);
  ctx.stroke();
}

/**
 * One walking leg from the hip at (x, top) to a paw on the ground: paws
 * reach forward and back on `phase` and lift while swinging forward.
 */
export function leg(ctx: Ctx, x: number, top: number, phase: number, r: number, fill: string, paw: string, stride = 2.2): void {
  const fx = x + Math.sin(phase) * stride;
  const fy = -Math.max(0, Math.cos(phase)) * 1.3 - r * 0.7;
  capsule(ctx, x, top, fx, fy, r, r * 0.85);
  fillStroke(ctx, fill, OUTLINE, LINE);
  ellipse(ctx, fx + r * 0.35, fy + r * 0.15, r * 1.15, r * 0.75);
  fillStroke(ctx, paw, OUTLINE, LINE * 0.8);
}

/** A flattened critter: a wide pancake with dazed eyes; `extra` adds species details on top. */
export function pancake(ctx: Ctx, w: number, h: number, tone: Tone, extra?: () => void): void {
  ellipse(ctx, 0, -h / 2, w / 2, h / 2);
  fillStroke(ctx, radial(ctx, 0, -h / 2, w / 2, [
    [0, tone[2]],
    [0.6, tone[1]],
    [1, tone[0]],
  ], w * 0.12, -h * 0.8), OUTLINE, LINE);
  extra?.();
  xEye(ctx, w * 0.12, -h * 0.55, 1.3);
  xEye(ctx, w * 0.3, -h * 0.55, 1.3);
}

/** A tapering tail along a quadratic curve, as one filled shape. */
export function tail(ctx: Ctx, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, r0: number, r1: number, fill: string | CanvasGradient): void {
  const n = 10;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
    const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
    const dx = 2 * u * (cx - x0) + 2 * t * (x1 - cx);
    const dy = 2 * u * (cy - y0) + 2 * t * (y1 - cy);
    const len = Math.hypot(dx, dy) || 1;
    const r = r0 + (r1 - r0) * t;
    left.push([x - (dy / len) * r, y + (dx / len) * r]);
    right.push([x + (dy / len) * r, y - (dx / len) * r]);
  }
  ctx.beginPath();
  ctx.moveTo(left[0]![0], left[0]![1]);
  for (const [x, y] of left) ctx.lineTo(x, y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i]![0], right[i]![1]);
  ctx.closePath();
  fillStroke(ctx, fill, OUTLINE, LINE);
}

/** A pair of eyes peering out of a dark gap: a shell critter about to wake. */
export function peekingEyes(ctx: Ctx, x: number, y: number, gap: number, glow = "#ffe36a"): void {
  for (const ex of [x - gap / 2, x + gap / 2]) {
    ellipse(ctx, ex, y, 1.5, 1.8);
    ctx.fillStyle = glow;
    ctx.fill();
    ellipse(ctx, ex + 0.4, y + 0.2, 0.6, 1.1);
    ctx.fillStyle = OUTLINE;
    ctx.fill();
  }
}
