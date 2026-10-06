import { TILE, VIEW_HEIGHT, VIEW_MAX_WIDTH, VIEW_MIN_WIDTH } from "../tuning";

/** Logical view width (even, clamped) for a screen of the given CSS size. */
export function viewWidthFor(cssWidth: number, cssHeight: number): number {
  if (cssWidth <= 0 || cssHeight <= 0) return VIEW_MIN_WIDTH;
  const ideal = (VIEW_HEIGHT * cssWidth) / cssHeight;
  return Math.min(VIEW_MAX_WIDTH, Math.max(VIEW_MIN_WIDTH, Math.round(ideal / 2) * 2));
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Placement {
  /** Device-pixel position of the view's logical origin (its top-left corner). */
  x: number;
  y: number;
  /** The logical view's size in device pixels. */
  width: number;
  height: number;
  /** Device pixels per logical pixel. Always makes a tile a whole number of device pixels. */
  scale: number;
  /**
   * The area actually painted. Snapping the scale leaves under two tiles of
   * slack around the view; that slack is painted too, so phones show no bars.
   * Only genuine letterboxing (an ultra-wide monitor) stays black.
   */
  clip: Rect;
}

/**
 * Fits the view into the display. The scale is snapped so one tile is a whole
 * number of device pixels, which keeps tiles seamless. In portrait the game is
 * pinned just below `topClear` (the top buttons) so the on-screen controls get
 * the space below it.
 */
export function placeView(viewW: number, viewH: number, dispW: number, dispH: number, topClear: number): Placement {
  const raw = Math.min(dispW / viewW, dispH / viewH);
  const tilePx = Math.max(4, Math.floor(TILE * raw));
  const scale = tilePx / TILE;
  const width = Math.round(viewW * scale);
  const height = Math.round(viewH * scale);
  const x = Math.floor((dispW - width) / 2);
  const spare = dispH - height;
  const portrait = spare > dispH * 0.25;
  const y = portrait ? Math.min(Math.floor(spare / 2), Math.round(topClear + dispH * 0.02)) : Math.floor(spare / 2);
  const fillW = dispW - width <= tilePx * 2;
  const fillH = !portrait && dispH - height <= tilePx * 2;
  const clip = {
    x: fillW ? 0 : x,
    y: fillH ? 0 : y,
    width: fillW ? dispW : width,
    height: fillH ? dispH : height,
  };
  return { x, y, width, height, scale, clip };
}

/** View pixels at each side of the frame that sit under a notch or rounded corner. */
export interface SafeInsets {
  left: number;
  right: number;
  /** True when the frame reaches up under the on-screen mute and pause buttons (landscape), not below them (portrait). */
  underTopButtons: boolean;
}

/** Bottom edge of the on-screen mute and pause buttons, in CSS pixels below the safe-area top (see index.html). */
const TOP_BUTTONS_BOTTOM = 46;

/** How much of the placed frame is covered by the device's left/right safe-area insets, in view pixels. */
export function frameInsets(p: Pick<Placement, "x" | "y" | "width" | "scale">, dispW: number, insetLeft: number, insetRight: number, buttonsBottom: number): SafeInsets {
  return {
    left: Math.max(0, insetLeft - p.x) / p.scale,
    right: Math.max(0, insetRight - (dispW - p.x - p.width)) / p.scale,
    underTopButtons: p.y < buttonsBottom,
  };
}

/** Owns the on-screen canvas at native device resolution. */
export class Display {
  readonly ctx: CanvasRenderingContext2D;
  placement: Placement = { x: 0, y: 0, width: 1, height: 1, scale: 1, clip: { x: 0, y: 0, width: 1, height: 1 } };
  viewWidth = VIEW_MIN_WIDTH;
  readonly viewHeight = VIEW_HEIGHT;
  /** Parts of the frame hidden by a notch; the HUD keeps clear of them. */
  insets: SafeInsets = { left: 0, right: 0, underTopButtons: true };
  /** Upper limit on device pixels per CSS pixel; lowered at runtime if the device can't keep up. */
  private maxDensity = 3;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onViewWidth: (width: number) => void,
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
    const resize = (): void => this.resize();
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    this.resize();
  }

  /** Renders at no more than `density` device pixels per CSS pixel from now on. */
  limitDensity(density: number): void {
    this.maxDensity = density;
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDensity);
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
    const width = viewWidthFor(cssW, cssH);
    if (width !== this.viewWidth) {
      this.viewWidth = width;
      this.onViewWidth(width);
    }
    // env() is only resolvable through a real property, so read it from a probe element.
    const probe = document.getElementById("safe-probe");
    const style = probe ? getComputedStyle(probe) : null;
    const inset = (side: "Top" | "Left" | "Right"): number => (style ? parseFloat(style[`padding${side}`]) || 0 : 0) * dpr;
    const buttonsBottom = Math.max(10 * dpr, inset("Top")) + TOP_BUTTONS_BOTTOM * dpr;
    this.placement = placeView(width, VIEW_HEIGHT, this.canvas.width, this.canvas.height, buttonsBottom);
    this.insets = frameInsets(this.placement, this.canvas.width, inset("Left"), inset("Right"), buttonsBottom);
  }
}
