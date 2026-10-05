import { flipX, type IndexedImage } from "./indexed";
import type { SpriteSheet } from "./palette";

export type Canvas = HTMLCanvasElement;

function parseColor(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`bake: palette colours must be #rrggbb, got '${hex}'`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Renders an indexed image to an offscreen canvas at 1:1 pixel scale. */
export function bakeImage(img: IndexedImage, palette: readonly string[]): Canvas {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("bake: 2D canvas unavailable");
  const data = ctx.createImageData(img.width, img.height);
  const rgb = palette.map((c, i) => (i === 0 ? ([0, 0, 0] as [number, number, number]) : parseColor(c)));
  for (let i = 0; i < img.pixels.length; i++) {
    const p = img.pixels[i]!;
    if (p === 0) continue;
    const c = rgb[p];
    if (!c) throw new Error(`bake: palette index ${p} out of range (palette has ${palette.length})`);
    data.data[i * 4] = c[0];
    data.data[i * 4 + 1] = c[1];
    data.data[i * 4 + 2] = c[2];
    data.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

export type Baked<K extends string> = Readonly<Record<K, Canvas>>;

export function bakeSheet<K extends string>(sheet: SpriteSheet<K>, palette = sheet.palette): Baked<K> {
  const out = {} as Record<K, Canvas>;
  for (const key of Object.keys(sheet.frames) as K[]) out[key] = bakeImage(sheet.frames[key], palette);
  return out;
}

/** Every frame as authored, plus a horizontally mirrored copy for the opposite facing. */
export interface Facing<K extends string> {
  readonly base: Baked<K>;
  readonly mirrored: Baked<K>;
}

export function bakeFacing<K extends string>(sheet: SpriteSheet<K>): Facing<K> {
  const mirrored = {} as Record<K, Canvas>;
  for (const key of Object.keys(sheet.frames) as K[]) mirrored[key] = bakeImage(flipX(sheet.frames[key]), sheet.palette);
  return { base: bakeSheet(sheet), mirrored };
}
