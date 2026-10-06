/**
 * Shared painting toolkit. All art is drawn with Canvas 2D paths and
 * gradients in logical pixels (1 tile = 32 units); callers scale the context
 * to the device resolution, so everything stays sharp at any screen size.
 */

export type Ctx = CanvasRenderingContext2D;
export type Surface = HTMLCanvasElement;

type SurfaceFactory = (width: number, height: number) => Surface;

let factory: SurfaceFactory = (width, height) => {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
};

/** Lets tests supply a Node canvas implementation. */
export function setSurfaceFactory(f: SurfaceFactory): void {
  factory = f;
}

export function makeSurface(width: number, height: number): Surface {
  return factory(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
}

export function context(surface: Surface): Ctx {
  const ctx = surface.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");
  return ctx;
}

// ── colour ──────────────────────────────────────────────────────────────────

function parse(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`expected #rrggbb, got '${hex}'`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex(r: number, g: number, b: number): string {
  const c = (v: number): string => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Linear blend of two colours; t = 0 gives a, 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const x = parse(a);
  const y = parse(b);
  return hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

/** Lighten (amount > 0, toward white) or darken (amount < 0, toward a deep shadow tone). */
export function shade(color: string, amount: number): string {
  return amount >= 0 ? mix(color, "#ffffff", amount) : mix(color, "#120c1c", -amount);
}

export function rgba(color: string, alpha: number): string {
  const [r, g, b] = parse(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── gradients and shapes ────────────────────────────────────────────────────

export type Stops = readonly (readonly [offset: number, color: string])[];

export function linear(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: Stops): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

export function radial(ctx: Ctx, x: number, y: number, r: number, stops: Stops, fx = x, fy = y): CanvasGradient {
  const g = ctx.createRadialGradient(fx, fy, 0, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, rotation = 0): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rotation, 0, Math.PI * 2);
}

/** Fills the current path, then strokes it with an outline. */
export function fillStroke(ctx: Ctx, fill: string | CanvasGradient, outline: string, width: number): void {
  ctx.fillStyle = fill;
  ctx.fill();
  if (width > 0) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

/** A tapered limb from (x0,y0) to (x1,y1), r0 → r1 thick, as one closed path. */
export function capsule(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, r0: number, r1: number): void {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.arc(x0, y0, r0, a + Math.PI / 2, a - Math.PI / 2);
  ctx.arc(x1, y1, r1, a - Math.PI / 2, a + Math.PI / 2);
  ctx.closePath();
}

/** Soft elliptical shadow on the ground. */
export function groundShadow(ctx: Ctx, cx: number, cy: number, rx: number, alpha = 0.28): void {
  ctx.save();
  ctx.fillStyle = radial(ctx, cx, cy, rx, [
    [0, `rgba(10, 6, 20, ${alpha})`],
    [1, "rgba(10, 6, 20, 0)"],
  ]);
  ctx.translate(cx, cy);
  ctx.scale(1, 0.28);
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Deterministic PRNG (mulberry32), so painted textures are identical every run. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A smooth periodic height function over [0, width): a sum of sines whose
 * periods divide the width, so silhouettes built from it tile seamlessly.
 */
export function periodic(width: number, seed: number, octaves: readonly (readonly [cycles: number, amplitude: number])[]): (x: number) => number {
  const rnd = seededRandom(seed);
  const phases = octaves.map(() => rnd() * Math.PI * 2);
  return (x) => octaves.reduce((sum, [cycles, amp], i) => sum + Math.sin((x / width) * Math.PI * 2 * cycles + phases[i]!) * amp, 0);
}

export const OUTLINE = "#25182e";
