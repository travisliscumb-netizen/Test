import { FIXED_DT_MS, MAX_FRAME_MS } from "../tuning";

/**
 * Fixed-timestep accumulator. Real elapsed time is converted into a whole
 * number of simulation steps; the remainder becomes the interpolation factor
 * used to render between the previous and current simulation states.
 */
export class FixedStep {
  private accumulator = 0;

  constructor(
    private readonly stepMs = FIXED_DT_MS,
    private readonly maxFrameMs = MAX_FRAME_MS,
  ) {}

  /** Returns how many steps to simulate and the render blend factor in [0, 1). */
  advance(elapsedMs: number): { steps: number; alpha: number } {
    const clamped = Math.min(Math.max(elapsedMs, 0), this.maxFrameMs);
    this.accumulator += clamped;
    let steps = 0;
    while (this.accumulator >= this.stepMs) {
      this.accumulator -= this.stepMs;
      steps++;
    }
    return { steps, alpha: this.accumulator / this.stepMs };
  }

  reset(): void {
    this.accumulator = 0;
  }
}

/** Drives a FixedStep from requestAnimationFrame for the life of the page. */
export function runLoop(update: () => void, render: (alpha: number, intervalMs: number) => void): void {
  const clock = new FixedStep();
  let last = performance.now();

  const frame = (now: number): void => {
    const interval = now - last;
    const { steps, alpha } = clock.advance(interval);
    last = now;
    for (let i = 0; i < steps; i++) update();
    render(alpha, interval);
    requestAnimationFrame(frame);
  };

  // Never try to catch up on time spent hidden.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      last = performance.now();
      clock.reset();
    }
  });
  requestAnimationFrame(frame);
}
