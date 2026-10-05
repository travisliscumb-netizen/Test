import { PixelCanvas, seededRandom, type IndexedImage } from "../indexed";

/** One horizontally tiling parallax layer. */
export interface BackgroundLayer {
  readonly image: IndexedImage;
  readonly palette: readonly string[];
  /** Scroll speed relative to the camera (0 = fixed, 1 = moves with the world). */
  readonly factor: number;
  /** Top of the layer in view pixels. */
  readonly y: number;
  /** Extra horizontal drift in px per frame (clouds). */
  readonly drift?: number;
}

export interface Background {
  /** Sky colours from top to bottom, drawn as equal horizontal bands. */
  readonly skyBands: readonly string[];
  readonly layers: readonly BackgroundLayer[];
}

/**
 * A periodic height function over [0, width): a sum of sines whose periods
 * divide the width, so the silhouette tiles seamlessly.
 */
export function periodicNoise(width: number, seed: number, octaves: readonly (readonly [cycles: number, amplitude: number])[]): (x: number) => number {
  const rnd = seededRandom(seed);
  const phases = octaves.map(() => rnd() * Math.PI * 2);
  return (x) =>
    octaves.reduce((sum, [cycles, amp], i) => sum + Math.sin((x / width) * Math.PI * 2 * cycles + phases[i]!) * amp, 0);
}

/** Fills everything below `top(x)` with colour `c`, and tints the top `rim` px with `rimColor`. */
export function ridge(pc: PixelCanvas, top: (x: number) => number, c: number, rim = 0, rimColor = c): void {
  for (let x = 0; x < pc.width; x++) {
    const t = Math.round(top(x));
    pc.vline(x, Math.max(0, t), pc.height - 1, c);
    if (rim > 0) pc.vline(x, Math.max(0, t), Math.max(0, t) + rim - 1, rimColor);
  }
}

/** Puffy cloud built from overlapping ellipses, with a shaded underside. */
export function cloud(pc: PixelCanvas, x: number, y: number, w: number, light: number, shade: number): void {
  const h = Math.round(w * 0.36);
  pc.ellipse(x, y + h * 0.35, w, h * 0.65, shade);
  pc.ellipse(x + w * 0.15, y, w * 0.4, h * 0.8, light);
  pc.ellipse(x + w * 0.4, y - h * 0.25, w * 0.42, h, light);
  pc.ellipse(x + w * 0.05, y + h * 0.3, w * 0.9, h * 0.5, light);
  pc.hline(Math.round(x + w * 0.12), Math.round(x + w * 0.88), Math.round(y + h * 0.85), shade);
}

/** Wraps drawing so shapes that cross the right edge reappear on the left. */
export function wrapped(width: number, draw: (offset: number) => void): void {
  draw(0);
  draw(-width);
}
