import type { FixedTimestep } from './fixedTimestep';

export interface GameLoopCallbacks {
  /** Advance the simulation by exactly one fixed tick of `stepSeconds`. */
  fixedUpdate(stepSeconds: number): void;
  /**
   * Draw one frame. `alpha` in [0, 1) is how far wall time has progressed past the last
   * tick, for interpolating between the previous and current simulation states.
   */
  render(alpha: number, frameSeconds: number): void;
}

export interface GameLoopStats {
  readonly frames: number;
  readonly ticks: number;
  readonly droppedSeconds: number;
}

/** Monotonic clock in milliseconds. */
export type Clock = () => number;

/**
 * Drives fixed-timestep simulation and variable-rate rendering from one per-frame call.
 * Gameplay and physics see identical tick lengths at 30 fps and at 144 fps.
 */
export class GameLoop {
  private lastTimeMs: number | null = null;
  private frames = 0;
  private ticks = 0;
  private droppedSeconds = 0;

  constructor(
    private readonly timestep: FixedTimestep,
    private readonly callbacks: GameLoopCallbacks,
    private readonly clock: Clock,
  ) {}

  /** Run one frame: zero or more fixed ticks, then exactly one render. */
  frame(): void {
    const now = this.clock();
    const frameSeconds = this.lastTimeMs === null ? 0 : (now - this.lastTimeMs) / 1000;
    this.lastTimeMs = now;

    const advance = this.timestep.advance(frameSeconds);
    for (let i = 0; i < advance.steps; i += 1) {
      this.callbacks.fixedUpdate(this.timestep.stepSeconds);
      this.ticks += 1;
    }
    this.droppedSeconds += advance.droppedSeconds;

    this.callbacks.render(advance.alpha, frameSeconds);
    this.frames += 1;
  }

  /**
   * Forget the previous frame time so a long pause (hidden tab, breakpoint) is not
   * replayed or counted as dropped time when frames resume.
   */
  resetClock(): void {
    this.lastTimeMs = null;
    this.timestep.reset();
  }

  get stats(): GameLoopStats {
    return { frames: this.frames, ticks: this.ticks, droppedSeconds: this.droppedSeconds };
  }
}
