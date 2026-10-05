import { ADVANCE, GLYPH_H, GLYPH_W, glyph } from "./sprites/font";
import { INK, WHITE } from "./palette";

export type Align = "left" | "center" | "right";

export interface TextStyle {
  scale?: number;
  color?: string;
  /** Drop-shadow colour, or null for none. */
  shadow?: string | null;
  align?: Align;
}

/** Draws the bitmap font, caching one tiny canvas per (glyph, colour). */
export class TextRenderer {
  private readonly cache = new Map<string, HTMLCanvasElement>();

  width(text: string, scale = 2): number {
    return text.length === 0 ? 0 : (text.length * ADVANCE - 1) * scale;
  }

  draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, style: TextStyle = {}): void {
    const scale = style.scale ?? 2;
    const color = style.color ?? WHITE;
    const shadow = style.shadow === undefined ? INK : style.shadow;
    const align = style.align ?? "left";
    const w = this.width(text, scale);
    let cx = Math.round(align === "center" ? x - w / 2 : align === "right" ? x - w : x);
    const cy = Math.round(y);
    for (const ch of text) {
      if (ch !== " ") {
        if (shadow) ctx.drawImage(this.glyph(ch, shadow), cx + scale, cy + scale, GLYPH_W * scale, GLYPH_H * scale);
        ctx.drawImage(this.glyph(ch, color), cx, cy, GLYPH_W * scale, GLYPH_H * scale);
      }
      cx += ADVANCE * scale;
    }
  }

  private glyph(ch: string, color: string): HTMLCanvasElement {
    const key = `${color}|${ch}`;
    let canvas = this.cache.get(key);
    if (canvas) return canvas;
    canvas = document.createElement("canvas");
    canvas.width = GLYPH_W;
    canvas.height = GLYPH_H;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = color;
    glyph(ch).forEach((row, y) => {
      for (let x = 0; x < GLYPH_W; x++) if (row[x] === "#") ctx.fillRect(x, y, 1, 1);
    });
    this.cache.set(key, canvas);
    return canvas;
  }
}
