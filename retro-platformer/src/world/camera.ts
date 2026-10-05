import { CAMERA } from "../tuning";

/**
 * Side-scrolling camera that only ever moves forward, like the 1985 classic:
 * it advances once the target passes a lead line and never scrolls back, so
 * the left edge of the view doubles as a wall the player cannot cross.
 */
export class Camera {
  x = 0;
  prevX = 0;

  constructor(
    private viewWidth: number,
    private readonly levelWidth: number,
  ) {}

  get width(): number {
    return this.viewWidth;
  }

  get maxX(): number {
    return Math.max(0, this.levelWidth - this.viewWidth);
  }

  setViewWidth(width: number): void {
    this.viewWidth = width;
    this.x = Math.min(this.x, this.maxX);
    this.prevX = Math.min(this.prevX, this.maxX);
  }

  /** Call once per step before moving the target. */
  beginStep(): void {
    this.prevX = this.x;
  }

  follow(targetCenterX: number): void {
    const wanted = targetCenterX - this.viewWidth * CAMERA.followFraction;
    this.x = Math.min(Math.max(this.x, wanted), this.maxX);
  }

  /** Places the camera so the target sits at the lead line (or as close as the level allows). */
  snapTo(targetCenterX: number): void {
    this.x = Math.min(Math.max(0, targetCenterX - this.viewWidth * CAMERA.followFraction), this.maxX);
    this.prevX = this.x;
  }

  interpolated(alpha: number): number {
    return this.prevX + (this.x - this.prevX) * alpha;
  }
}
