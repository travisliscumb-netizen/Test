/**
 * Palette-indexed images. Index 0 is always transparent; index n (n ≥ 1)
 * means palette[n] of whichever palette the image is rendered with.
 */
export interface IndexedImage {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

/**
 * Builds an image from text rows: the character at position i of `key` maps
 * to palette index i ('.' or ' ' in key position 0 means transparent). This is
 * the simplest format for hand-drawn art and for swapping in your own sprites.
 *
 * ```ts
 * imageFromRows(["..kk..", ".kWWk.", "..kk.."], ".kW");
 * ```
 */
export function imageFromRows(rows: readonly string[], key: string): IndexedImage {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const pixels = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`imageFromRows: row ${y} is ${row.length} wide, expected ${width}`);
    for (let x = 0; x < width; x++) {
      const index = key.indexOf(row[x]!);
      if (index < 0) throw new Error(`imageFromRows: '${row[x]}' at (${x}, ${y}) is not in key '${key}'`);
      pixels[y * width + x] = index;
    }
  });
  return { width, height, pixels };
}

export function flipX(img: IndexedImage): IndexedImage {
  const pixels = new Uint8Array(img.pixels.length);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      pixels[y * img.width + x] = img.pixels[y * img.width + (img.width - 1 - x)]!;
    }
  }
  return { width: img.width, height: img.height, pixels };
}

export function flipY(img: IndexedImage): IndexedImage {
  const pixels = new Uint8Array(img.pixels.length);
  for (let y = 0; y < img.height; y++) {
    pixels.set(img.pixels.subarray((img.height - 1 - y) * img.width, (img.height - y) * img.width), y * img.width);
  }
  return { width: img.width, height: img.height, pixels };
}

/** Highest palette index an image uses. */
export function maxIndex(img: IndexedImage): number {
  let max = 0;
  for (const p of img.pixels) if (p > max) max = p;
  return max;
}

/**
 * A tiny raster toolkit for authoring indexed sprites in code. All shapes are
 * clipped to the canvas, coordinates are integers, and colour 0 erases.
 */
export class PixelCanvas {
  readonly pixels: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.pixels = new Uint8Array(width * height);
  }

  get(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return 0;
    return this.pixels[iy * this.width + ix]!;
  }

  set(x: number, y: number, c: number): void {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return;
    this.pixels[iy * this.width + ix] = c;
  }

  rect(x: number, y: number, w: number, h: number, c: number): this {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    for (let j = y0; j < y0 + Math.round(h); j++) for (let i = x0; i < x0 + Math.round(w); i++) this.set(i, j, c);
    return this;
  }

  hline(x0: number, x1: number, y: number, c: number): this {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c);
    return this;
  }

  vline(x: number, y0: number, y1: number, c: number): this {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c);
    return this;
  }

  /** Filled ellipse covering the pixel box [x, x + w) × [y, y + h). */
  ellipse(x: number, y: number, w: number, h: number, c: number): this {
    const rx = w / 2;
    const ry = h / 2;
    const cx = x + rx;
    const cy = y + ry;
    for (let j = Math.floor(y); j < Math.ceil(y + h); j++) {
      for (let i = Math.floor(x); i < Math.ceil(x + w); i++) {
        const dx = (i + 0.5 - cx) / rx;
        const dy = (j + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(i, j, c);
      }
    }
    return this;
  }

  /** Bresenham line, optionally stamped with a square brush of `size` px. */
  line(x0: number, y0: number, x1: number, y1: number, c: number, size = 1): this {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    const half = Math.floor((size - 1) / 2);
    for (;;) {
      this.rect(x - half, y - half, size, size, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
    return this;
  }

  /** Even-odd scanline fill of a polygon given as [x0, y0, x1, y1, ...]. */
  polygon(points: readonly number[], c: number): this {
    const n = points.length / 2;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      minY = Math.min(minY, points[i * 2 + 1]!);
      maxY = Math.max(maxY, points[i * 2 + 1]!);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const sy = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < n; i++) {
        const ax = points[i * 2]!;
        const ay = points[i * 2 + 1]!;
        const bx = points[((i + 1) % n) * 2]!;
        const by = points[((i + 1) % n) * 2 + 1]!;
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.round(xs[k]!); x < Math.round(xs[k + 1]!); x++) this.set(x, y, c);
      }
    }
    return this;
  }

  /**
   * Draws a 1 px outline of colour `c` on transparent pixels that touch an
   * opaque pixel orthogonally. Pixels already equal to `c` are not grown.
   */
  outline(c: number): this {
    const src = this.pixels.slice();
    const at = (x: number, y: number): number =>
      x < 0 || y < 0 || x >= this.width || y >= this.height ? 0 : src[y * this.width + x]!;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (at(x, y) !== 0) continue;
        const touches = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some((p) => p !== 0 && p !== c);
        if (touches) this.set(x, y, c);
      }
    }
    return this;
  }

  /** Copies another image on top (transparent pixels skipped). */
  stamp(img: IndexedImage, ox: number, oy: number): this {
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const p = img.pixels[y * img.width + x]!;
        if (p !== 0) this.set(ox + x, oy + y, p);
      }
    }
    return this;
  }

  toImage(): IndexedImage {
    return { width: this.width, height: this.height, pixels: this.pixels.slice() };
  }
}

/** Deterministic PRNG (mulberry32) so procedural art is identical every run. */
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
