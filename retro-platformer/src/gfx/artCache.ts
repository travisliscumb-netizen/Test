import { drawCoin } from "./art/coin";
import { drawFinial, drawPole } from "./art/flag";
import { TOWER_HEIGHT, TOWER_WIDTH, drawGoalTower } from "./art/goalTower";
import { MATERIALS } from "./art/materials";
import { drawBrick } from "./art/tiles/brick";
import { MYSTERY_FRAMES, drawMystery, drawUsedBlock } from "./art/tiles/blocks";
import { GROUND_PAD, drawGround, type GroundShape } from "./art/tiles/ground";
import { drawPipe, type PipePiece } from "./art/tiles/pipe";
import { drawStone } from "./art/tiles/stone";
import { BACKDROPS } from "./backdrops";
import type { Ambient, PaintedLayer } from "./backdrops/types";
import { context, makeSurface, radial, rgba, type Ctx, type Stops, type Surface } from "./paint";
import type { ThemeName } from "../world/level";
import { TILE } from "../tuning";

/** Textures for coins spinning, in frames per full turn. */
export const COIN_FRAMES = 16;
/** Ground texture variants per edge shape, to break up repetition. */
export const GROUND_VARIANTS = 3;
/** Painted backdrops are soft, so they are baked at no more than this resolution to save memory. */
const BACKDROP_MAX_SCALE = 1.5;

export interface BakedLayer {
  readonly surface: Surface;
  /** Device pixels per logical pixel the layer was baked at. */
  readonly scale: number;
  readonly width: number;
  readonly y: number;
  readonly factor: number;
  readonly drift: number;
}

export interface ThemeArt {
  ground(shape: GroundShape, variant: number): Surface;
  /** A soft glowing dot in the ambient particle colour, 16 logical units across. */
  readonly mote: Surface;
  readonly brick: Surface;
  readonly stone: Surface;
  readonly pipe: Readonly<Record<PipePiece, Surface>>;
  readonly sky: Stops;
  readonly layers: readonly BakedLayer[];
  readonly ambient: Ambient;
}

/**
 * Everything that can be painted once, at the current device resolution.
 * Rebuilt whenever the scale changes; themes are painted on first use.
 */
export class ArtCache {
  /** Device pixels per tile (an integer, so tiles join without seams). */
  readonly tilePx: number;
  /** Device pixels of overhang margin around ground tiles. */
  readonly groundPadPx: number;
  readonly mystery: readonly Surface[];
  readonly used: Surface;
  readonly coin: readonly Surface[];
  readonly pole: Surface;
  readonly finial: Surface;
  readonly tower: Surface;
  private readonly themes = new Map<ThemeName, ThemeArt>();

  constructor(readonly scale: number) {
    this.tilePx = Math.round(TILE * scale);
    this.groundPadPx = Math.ceil(GROUND_PAD * scale);
    this.mystery = Array.from({ length: MYSTERY_FRAMES }, (_, f) => this.tile((ctx) => drawMystery(ctx, f)));
    this.used = this.tile(drawUsedBlock);
    this.coin = Array.from({ length: COIN_FRAMES }, (_, f) =>
      this.tile((ctx) => {
        ctx.translate(16, 16);
        drawCoin(ctx, f / COIN_FRAMES);
      }),
    );
    this.pole = this.tile((ctx) => drawPole(ctx, 0, 32));
    this.finial = this.tile((ctx) => {
      drawPole(ctx, 20, 32);
      drawFinial(ctx, 18);
    });
    this.tower = this.paint(TOWER_WIDTH, TOWER_HEIGHT, 0, drawGoalTower);
  }

  theme(name: ThemeName): ThemeArt {
    let art = this.themes.get(name);
    if (!art) {
      art = this.paintTheme(name);
      this.themes.set(name, art);
    }
    return art;
  }

  private paintTheme(name: ThemeName): ThemeArt {
    const m = MATERIALS[name];
    const backdrop = BACKDROPS[name]();
    const bgScale = Math.min(this.scale, BACKDROP_MAX_SCALE);
    // Every edge shape and texture variant is painted up front: painting lazily mid-scroll causes hitches.
    const key = (shape: GroundShape, variant: number): string => `${+shape.top}${+shape.left}${+shape.right}${variant}`;
    const ground = new Map<string, Surface>();
    for (const top of [false, true]) {
      for (const left of [false, true]) {
        for (const right of [false, true]) {
          for (let variant = 0; variant < GROUND_VARIANTS; variant++) {
            const shape = { top, left, right };
            ground.set(key(shape, variant), this.paint(TILE, TILE, GROUND_PAD, (ctx) => drawGround(ctx, m, shape, variant)));
          }
        }
      }
    }
    const a = backdrop.ambient;
    return {
      ground: (shape, variant) => ground.get(key(shape, variant))!,
      mote: this.paint(16, 16, 0, (ctx) => {
        ctx.fillStyle = radial(ctx, 8, 8, 8, [
          [0, rgba(a.color, 1)],
          [0.18, rgba(a.color, 0.9)],
          [0.4, rgba(a.color, a.glow ? 0.35 : 0)],
          [1, rgba(a.color, 0)],
        ]);
        ctx.fillRect(0, 0, 16, 16);
      }),
      brick: this.tile((ctx) => drawBrick(ctx, m)),
      stone: this.tile((ctx) => drawStone(ctx, m)),
      pipe: {
        topLeft: this.tile((ctx) => drawPipe(ctx, m, "topLeft")),
        topRight: this.tile((ctx) => drawPipe(ctx, m, "topRight")),
        left: this.tile((ctx) => drawPipe(ctx, m, "left")),
        right: this.tile((ctx) => drawPipe(ctx, m, "right")),
      },
      sky: backdrop.sky,
      ambient: backdrop.ambient,
      layers: backdrop.layers.map((layer) => ({
        surface: bakeLayer(layer, bgScale),
        scale: bgScale,
        width: layer.width,
        y: layer.y,
        factor: layer.factor,
        drift: layer.drift ?? 0,
      })),
    };
  }

  /** A 32×32 cell at exactly tilePx device pixels. */
  private tile(draw: (ctx: Ctx) => void): Surface {
    const surface = makeSurface(this.tilePx, this.tilePx);
    const ctx = context(surface);
    const k = this.tilePx / TILE;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    draw(ctx);
    return surface;
  }

  /** A w×h logical box at the current scale, with `pad` logical units of margin (rounded up to whole pixels). */
  private paint(w: number, h: number, pad: number, draw: (ctx: Ctx) => void): Surface {
    const k = this.tilePx / TILE;
    const padPx = Math.ceil(pad * k);
    const surface = makeSurface(Math.round(w * k) + padPx * 2, Math.round(h * k) + padPx * 2);
    const ctx = context(surface);
    ctx.setTransform(k, 0, 0, k, padPx, padPx);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    draw(ctx);
    return surface;
  }
}

/**
 * Paints a backdrop layer at `scale` device pixels per logical pixel. When the
 * scaled height is fractional the surface is rounded up, and its last row would
 * be only partly covered (translucent); that row is replaced by a copy of the
 * last whole row, so a layer that reaches the bottom of the view stays opaque
 * there (the renderer stretches that row into any slack below the view).
 */
export function bakeLayer(layer: PaintedLayer, scale: number): Surface {
  const surface = makeSurface(layer.width * scale, layer.height * scale);
  const ctx = context(surface);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  layer.paint(ctx);
  const whole = Math.floor(layer.height * scale);
  if (whole > 0 && whole < surface.height) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, whole, surface.width, surface.height - whole);
    ctx.drawImage(surface, 0, whole - 1, surface.width, 1, 0, whole, surface.width, surface.height - whole);
  }
  return surface;
}
