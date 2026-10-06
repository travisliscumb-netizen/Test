import { periodic, radial, seededRandom, type Ctx, type Stops } from "../paint";

/** Draws `draw(offset)` at 0 and ±width so shapes crossing an edge wrap around. */
export function wrap(width: number, draw: (offset: number) => void): void {
  draw(-width);
  draw(0);
  draw(width);
}

/** A ridge silhouette: fills from a periodic skyline down to `bottom`. */
export function ridge(ctx: Ctx, width: number, bottom: number, base: number, seed: number, octaves: readonly (readonly [number, number])[], fill: string | CanvasGradient): (x: number) => number {
  const h = periodic(width, seed, octaves);
  const top = (x: number): number => base + h(x);
  ctx.beginPath();
  ctx.moveTo(0, bottom);
  for (let x = 0; x <= width; x += 4) ctx.lineTo(x, top(x));
  ctx.lineTo(width, bottom);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  return top;
}

/** A soft cumulus cloud from overlapping shaded puffs. */
export function cloud(ctx: Ctx, x: number, y: number, w: number, light: string, shadow: string, seed: number): void {
  const rnd = seededRandom(seed);
  const puffs = 6 + Math.floor(rnd() * 4);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < puffs; i++) {
      const t = i / (puffs - 1);
      const px = x + t * w;
      const r = w * (0.09 + Math.sin(t * Math.PI) * 0.1) * (0.85 + rnd() * 0.3);
      const py = y - Math.sin(t * Math.PI) * w * 0.05 + (pass === 0 ? r * 0.3 : 0);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = pass === 0 ? shadow : radial(ctx, px - r * 0.3, py - r * 0.4, r * 1.3, [
        [0, light],
        [0.75, light],
        [1, shadow],
      ]);
      ctx.fill();
    }
  }
}

/** Soft circular glow. */
export function glow(ctx: Ctx, x: number, y: number, r: number, stops: Stops): void {
  ctx.fillStyle = radial(ctx, x, y, r, stops);
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A grid of windows on a façade; lit ones glow, unlit ones reflect the sky. */
export function windows(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  rnd: () => number,
  opts: { cols: number; rows: number; lit: string; dark: string; litChance: number; frame?: string },
): void {
  const cw = w / opts.cols;
  const rh = h / opts.rows;
  for (let r = 0; r < opts.rows; r++) {
    for (let c = 0; c < opts.cols; c++) {
      const wx = x + c * cw + cw * 0.22;
      const wy = y + r * rh + rh * 0.2;
      const ww = cw * 0.56;
      const wh = rh * 0.6;
      if (opts.frame) {
        ctx.fillStyle = opts.frame;
        ctx.fillRect(wx - 0.8, wy - 0.8, ww + 1.6, wh + 1.6);
      }
      ctx.fillStyle = rnd() < opts.litChance ? opts.lit : opts.dark;
      ctx.fillRect(wx, wy, ww, wh);
      // Glint on the top half of the pane.
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      ctx.fillRect(wx, wy, ww, wh * 0.4);
    }
  }
}

/** A round-canopied tree with a lit top and a trunk, base at (x, y). */
export function tree(ctx: Ctx, x: number, y: number, r: number, light: string, dark: string, trunk: string): void {
  ctx.fillStyle = trunk;
  ctx.fillRect(x - r * 0.1, y - r * 1.2, r * 0.2, r * 1.2);
  for (const [dx, dy, k] of [
    [-0.5, -1.5, 0.75],
    [0.5, -1.5, 0.75],
    [0, -2.1, 0.85],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x + dx * r, y + dy * r, r * k, 0, Math.PI * 2);
    ctx.fillStyle = radial(ctx, x + dx * r - r * 0.3, y + dy * r - r * 0.4, r * k * 1.4, [
      [0, light],
      [1, dark],
    ]);
    ctx.fill();
  }
}

/** A street lamp with a warm glow, base at (x, y). */
export function lamp(ctx: Ctx, x: number, y: number, h: number, post: string, glowAlpha: number): void {
  ctx.fillStyle = post;
  ctx.fillRect(x - 1.5, y - h, 3, h);
  ctx.fillRect(x - 1.5, y - h, 12, 2.5);
  ctx.beginPath();
  ctx.moveTo(x + 6, y - h + 2);
  ctx.lineTo(x + 15, y - h + 2);
  ctx.lineTo(x + 13, y - h + 6);
  ctx.lineTo(x + 8, y - h + 6);
  ctx.closePath();
  ctx.fill();
  if (glowAlpha > 0) {
    glow(ctx, x + 10.5, y - h + 7, 26, [
      [0, `rgba(255, 220, 140, ${glowAlpha})`],
      [1, "rgba(255, 220, 140, 0)"],
    ]);
  }
}

/** Tints only what is already painted on the layer (atmospheric haze), leaving its transparent sky untouched. */
export function tint(ctx: Ctx, color: string, width: number, height: number): void {
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
