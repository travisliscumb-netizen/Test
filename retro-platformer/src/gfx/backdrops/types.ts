import type { Ctx, Stops } from "../paint";

/** One horizontally tiling, pre-painted parallax layer. */
export interface PaintedLayer {
  /** Tile width and height in logical px. Content must wrap seamlessly at `width`. */
  readonly width: number;
  readonly height: number;
  /** Top of the layer in view px. */
  readonly y: number;
  /** Scroll speed relative to the camera (0 = fixed, 1 = moves with the world). */
  readonly factor: number;
  /** Extra drift in px per frame (clouds). */
  readonly drift?: number;
  readonly paint: (ctx: Ctx) => void;
}

/** Floating particles drawn live over the backdrop. */
export interface Ambient {
  readonly count: number;
  readonly color: string;
  readonly size: number;
  /** Mean drift velocity in px per frame. */
  readonly vx: number;
  readonly vy: number;
  /** Twinkle or glow. */
  readonly glow: boolean;
}

export interface Backdrop {
  /** Sky gradient stops, top (0) to bottom (1) of the view. */
  readonly sky: Stops;
  readonly layers: readonly PaintedLayer[];
  readonly ambient: Ambient;
}
