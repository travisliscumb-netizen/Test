import { VIEW_HEIGHT, VIEW_MAX_WIDTH, VIEW_MIN_WIDTH } from "../tuning";

/** Logical view width (even, clamped) for a screen of the given CSS size. */
export function viewWidthFor(cssWidth: number, cssHeight: number): number {
  if (cssWidth <= 0 || cssHeight <= 0) return VIEW_MIN_WIDTH;
  const ideal = (VIEW_HEIGHT * cssWidth) / cssHeight;
  return Math.min(VIEW_MAX_WIDTH, Math.max(VIEW_MIN_WIDTH, Math.round(ideal / 2) * 2));
}

export interface Placement {
  /** Destination rectangle on the display canvas, in device pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

/**
 * Fits the view into the display. In portrait (lots of spare height) the game
 * is pinned near the top so on-screen controls get the space below it.
 */
export function placeView(viewW: number, viewH: number, dispW: number, dispH: number, topInset: number): Placement {
  const scale = Math.min(dispW / viewW, dispH / viewH);
  const width = Math.round(viewW * scale);
  const height = Math.round(viewH * scale);
  const x = Math.floor((dispW - width) / 2);
  const spare = dispH - height;
  const portrait = spare > dispH * 0.25;
  const y = portrait ? Math.min(Math.floor(spare / 2), Math.round(topInset + dispH * 0.06)) : Math.floor(spare / 2);
  return { x, y, width, height, scale };
}

/** Owns the on-screen canvas and the low-resolution frame the game draws into. */
export class Display {
  readonly frame: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private readonly out: CanvasRenderingContext2D;
  private readonly prescaled: HTMLCanvasElement;
  private readonly prescaledCtx: CanvasRenderingContext2D;
  private placement: Placement = { x: 0, y: 0, width: 1, height: 1, scale: 1 };
  viewWidth = VIEW_MIN_WIDTH;
  readonly viewHeight = VIEW_HEIGHT;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onViewWidth: (width: number) => void,
  ) {
    this.out = context(canvas);
    this.frame = document.createElement("canvas");
    this.ctx = context(this.frame);
    this.prescaled = document.createElement("canvas");
    this.prescaledCtx = context(this.prescaled);
    const resize = (): void => this.resize();
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    this.resize();
  }

  /** Fraction of the display height the game occupies, from the top (used to lay out touch controls). */
  get gameBottomFraction(): number {
    return (this.placement.y + this.placement.height) / Math.max(1, this.canvas.height);
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
    const width = viewWidthFor(cssW, cssH);
    if (width !== this.viewWidth || this.frame.width !== width) {
      this.viewWidth = width;
      this.frame.width = width;
      this.frame.height = VIEW_HEIGHT;
      this.onViewWidth(width);
    }
    // env() is only resolvable through a real property, so read it from a probe element.
    const probe = document.getElementById("safe-probe");
    const topInset = probe ? parseFloat(getComputedStyle(probe).paddingTop) || 0 : 0;
    this.placement = placeView(width, VIEW_HEIGHT, this.canvas.width, this.canvas.height, topInset * dpr);
    const k = Math.max(1, Math.ceil(this.placement.scale - 0.001));
    this.prescaled.width = width * k;
    this.prescaled.height = VIEW_HEIGHT * k;
    this.ctx.imageSmoothingEnabled = false;
  }

  /** Copies the low-res frame to the screen with crisp, evenly sized pixels. */
  present(): void {
    const p = this.placement;
    const out = this.out;
    out.fillStyle = "#000";
    out.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const integer = Math.abs(p.scale - Math.round(p.scale)) < 0.001;
    if (integer) {
      out.imageSmoothingEnabled = false;
      out.drawImage(this.frame, p.x, p.y, p.width, p.height);
      return;
    }
    // Sharp bilinear: nearest-neighbour up to an integer multiple, then one smooth downscale.
    this.prescaledCtx.imageSmoothingEnabled = false;
    this.prescaledCtx.drawImage(this.frame, 0, 0, this.prescaled.width, this.prescaled.height);
    out.imageSmoothingEnabled = true;
    out.imageSmoothingQuality = "high";
    out.drawImage(this.prescaled, p.x, p.y, p.width, p.height);
  }
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D is not available");
  return ctx;
}
