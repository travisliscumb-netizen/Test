/**
 * Watches real frame intervals and decides when to render at a lower pixel
 * density. If the median interval over a window is slower than the target,
 * it asks for the next lower density. It only ever steps down, so it can't
 * oscillate.
 */
export class FrameBudget {
  private samples: number[] = [];
  private level = 0;

  constructor(
    /** Densities to try, highest first (device pixels per CSS pixel caps). */
    readonly densities: readonly number[] = [3, 2, 1.5],
    /** Median frame interval above which the density is lowered. */
    private readonly slowMs = 22,
    private readonly window = 90,
  ) {}

  /** The density cap currently in force. */
  get density(): number {
    return this.densities[this.level]!;
  }

  /** Records one frame interval. Returns the new density cap if it should drop now, else null. */
  record(intervalMs: number): number | null {
    // Ignore stalls (tab switches, debugger) so one long pause can't trigger a downgrade.
    if (intervalMs <= 0 || intervalMs > 250) return null;
    this.samples.push(intervalMs);
    if (this.samples.length < this.window) return null;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    this.samples = [];
    if (median > this.slowMs && this.level < this.densities.length - 1) {
      this.level++;
      return this.density;
    }
    return null;
  }
}
