export interface FixedTimestepOptions {
  /** Duration of one simulation tick, in seconds. */
  readonly stepSeconds: number;
  /** Upper bound on ticks run for a single rendered frame (spiral-of-death guard). */
  readonly maxStepsPerFrame: number;
  /** Frame durations longer than this are clamped before being accumulated, in seconds. */
  readonly maxFrameSeconds: number;
}

export interface FrameAdvance {
  /** Number of fixed ticks to run this frame. */
  readonly steps: number;
  /** Interpolation factor in [0, 1) between the previous and the current simulation state. */
  readonly alpha: number;
  /** Simulation time discarded this frame because the frame was too long, in seconds. */
  readonly droppedSeconds: number;
}

/**
 * Tolerance for comparing accumulated time against the step length. Without it,
 * accumulating 1/60 sixty times lands a hair under 1.0 and a whole tick is lost.
 */
const EPSILON_SECONDS = 1e-9;

/**
 * Accumulator for a fixed-timestep simulation with render interpolation.
 * Pure arithmetic: owns no clock, so it is deterministic under test.
 */
export class FixedTimestep {
  readonly stepSeconds: number;
  private readonly maxStepsPerFrame: number;
  private readonly maxFrameSeconds: number;
  private accumulator = 0;

  constructor(options: FixedTimestepOptions) {
    const { stepSeconds, maxStepsPerFrame, maxFrameSeconds } = options;
    if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
      throw new RangeError(
        `stepSeconds must be a positive finite number, got ${String(stepSeconds)}`,
      );
    }
    if (!Number.isInteger(maxStepsPerFrame) || maxStepsPerFrame < 1) {
      throw new RangeError(
        `maxStepsPerFrame must be an integer >= 1, got ${String(maxStepsPerFrame)}`,
      );
    }
    if (!Number.isFinite(maxFrameSeconds) || maxFrameSeconds < stepSeconds) {
      throw new RangeError(
        `maxFrameSeconds must be finite and >= stepSeconds, got ${String(maxFrameSeconds)}`,
      );
    }
    this.stepSeconds = stepSeconds;
    this.maxStepsPerFrame = maxStepsPerFrame;
    this.maxFrameSeconds = maxFrameSeconds;
  }

  /** Feed one rendered frame's elapsed wall time and get the ticks to run for it. */
  advance(frameSeconds: number): FrameAdvance {
    const safeFrame = Number.isFinite(frameSeconds) && frameSeconds > 0 ? frameSeconds : 0;
    const clamped = Math.min(safeFrame, this.maxFrameSeconds);
    let dropped = safeFrame - clamped;

    this.accumulator += clamped;

    let steps = 0;
    while (this.accumulator + EPSILON_SECONDS >= this.stepSeconds) {
      if (steps === this.maxStepsPerFrame) {
        // Keep the partial tick so alpha stays meaningful; discard whole ticks we cannot afford.
        const excessTicks = Math.floor((this.accumulator + EPSILON_SECONDS) / this.stepSeconds);
        const excess = excessTicks * this.stepSeconds;
        this.accumulator -= excess;
        dropped += excess;
        break;
      }
      this.accumulator -= this.stepSeconds;
      steps += 1;
    }

    if (this.accumulator < 0) {
      this.accumulator = 0;
    }

    return {
      steps,
      alpha: Math.min(this.accumulator / this.stepSeconds, 1 - Number.EPSILON),
      droppedSeconds: dropped,
    };
  }

  /** Discard any partially accumulated tick, e.g. after the tab was hidden. */
  reset(): void {
    this.accumulator = 0;
  }
}
