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
