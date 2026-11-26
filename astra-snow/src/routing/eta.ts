// Finish-time prediction that improves as nights are worked.
//
// A phone only knows WHEN Done was tapped. Service time at a stop is recovered
// as (gap since previous Done) − (network travel between them ÷ speed), then
// shrunk toward a prior until a stop has its own evidence. Tonight's pace
// (actual vs predicted for completed stops) corrects the remainder, bounded so
// one odd driveway cannot swing the whole night.

import type { NoteFlags } from '../data/schema.ts';

export interface EtaParams {
  /** Default minutes per driveway before any learning. */
  baseServiceMin: number;
  /** Tractor travel speed between stops, m/min (12 km/h ≈ 200). */
  metresPerMin: number;
  /** Prior strength in pseudo-observations. */
  priorWeight: number;
}

export const DEFAULT_ETA: EtaParams = { baseServiceMin: 3.0, metresPerMin: 200, priorWeight: 3 };

export function priorServiceMin(flags: NoteFlags, p: EtaParams = DEFAULT_ETA): number {
  let m = p.baseServiceMin;
  if (flags.driveways > 1) m *= 1 + 0.75 * (flags.driveways - 1);
  if (flags.throwRule) m += 0.5;
  if (flags.hazards.length) m += 0.4;
  if (flags.conditional) m += 0.5;
  return m;
}

export interface Sample {
  stop: number;
  minutes: number;
}

/**
 * Derive service-time samples from a completion sequence.
 * `done` must be one shift's completions in time order.
 * Gaps longer than `breakMin` (a break, refuelling, a jam) are discarded.
 */
export function deriveSamples(
  done: { stop: number; t: number }[],
  travelMetres: (a: number, b: number) => number,
  metresPerMin: number,
  breakMin = 25,
): Sample[] {
  const out: Sample[] = [];
  for (let i = 1; i < done.length; i++) {
    const gap = (done[i].t - done[i - 1].t) / 60_000;
    if (gap <= 0 || gap > breakMin) continue;
    const travel = travelMetres(done[i - 1].stop, done[i].stop) / metresPerMin;
    const svc = gap - travel;
    // A batch of taps (e.g. marking three after the fact) yields ~0: unusable.
    if (svc < 0.5) continue;
    out.push({ stop: done[i].stop, minutes: svc });
  }
  return out;
}

/**
 * Typical log-scale spread of one driveway's service time night to night.
 * Service times are right-skewed (log-normal): a TOTAL is a sum of means, and
 * the mean exceeds the median by exp(σ²/2). Summing medians made every
 * forecast early (seen in simulation before this correction).
 */
export const LOG_SIGMA = 0.3;
export const MEAN_FACTOR = Math.exp(0.5 * LOG_SIGMA * LOG_SIGMA);

/**
 * Per-stop estimate. Median shrunk toward the prior on a log scale
 * ((log prior·w + Σ log x) / (w + n)); `mean` is the expected minutes used
 * for forecasting and planning; `median` is the typical visit shown to a person.
 */
export function learnedServiceMin(prior: number, samples: number[], w: number): { mean: number; median: number; n: number } {
  if (!samples.length) return { mean: prior * MEAN_FACTOR, median: prior, n: 0 };
  const logs = samples.map((x) => Math.log(Math.max(0.3, x)));
  const lp = Math.log(prior);
  const m = (lp * w + logs.reduce((a, b) => a + b, 0)) / (w + logs.length);
  return { mean: Math.exp(m) * MEAN_FACTOR, median: Math.exp(m), n: samples.length };
}

export interface PaceInput {
  /** Completed stops this shift with their predicted and actual minutes (service + travel). */
  completed: { predicted: number; actual: number }[];
}

/** Multiplicative pace factor, bounded to [0.6, 1.6], trusted more with more stops. */
export function paceFactor(p: PaceInput): number {
  const xs = p.completed.filter((c) => c.predicted > 0 && c.actual > 0 && c.actual / c.predicted < 4);
  if (xs.length < 3) return 1;
  const pred = xs.reduce((a, c) => a + c.predicted, 0);
  const act = xs.reduce((a, c) => a + c.actual, 0);
  const raw = Math.max(0.6, Math.min(1.6, act / pred));
  const trust = Math.min(1, xs.length / 20);
  return 1 + (raw - 1) * trust;
}

export interface Forecast {
  remainingMin: number;
  finishMs: number;
  /** 80 % range */
  earlyMs: number;
  lateMs: number;
  stopsLeft: number;
  travelMetres: number;
}

/**
 * Forecast for the remaining sequence.
 * `legsMetres[i]` is the travel to remaining stop i (from here for i = 0).
 */
export function forecast(now: number, serviceMin: number[], legsMetres: number[], metresPerMin: number, pace: number, learnedShare: number): Forecast {
  let svc = 0;
  let varSum = 0;
  for (const m of serviceMin) {
    svc += m;
    // Per-stop spread: ±45 % with no learning, ±25 % when learned.
    const cv = 0.45 - 0.2 * learnedShare;
    varSum += (m * cv) ** 2;
  }
  const travelMetres = legsMetres.reduce((a, b) => a + b, 0);
  const travel = travelMetres / metresPerMin;
  const remaining = (svc + travel) * pace;
  // Pace uncertainty dominates long tails: 8 % of the remainder, plus stop noise.
  const sd = Math.sqrt(varSum + (0.08 * remaining) ** 2);
  return {
    remainingMin: remaining,
    finishMs: now + remaining * 60_000,
    earlyMs: now + Math.max(0, remaining - 1.28 * sd) * 60_000,
    lateMs: now + (remaining + 1.28 * sd) * 60_000,
    stopsLeft: serviceMin.length,
    travelMetres,
  };
}
