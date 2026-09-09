/**
 * Robust statistics.
 *
 * Every estimator here is resistant to the failure modes this app actually
 * sees: a truck left idling, a stop marked complete an hour late, five stops
 * tapped at once at the end of a street, one lawn that took triple because of
 * a hedge. A mean would be poisoned by any of those. Medians and MAD are not.
 *
 * All functions accept weighted samples so recency and confidence can be
 * expressed without duplicating rows.
 */

/**
 * Weighted quantile over {v, w} samples.
 *
 * Uses mid-rank plotting positions, so with equal weights it agrees with the
 * conventional median (the median of 1,3,5 is 3, not an interpolated 2) while
 * still degrading smoothly as weights diverge.
 */
export function weightedQuantile(samples, q) {
  const pts = samples.filter((s) => Number.isFinite(s.v) && s.w > 0);
  if (!pts.length) return NaN;
  if (pts.length === 1) return pts[0].v;
  pts.sort((a, b) => a.v - b.v);
  const total = pts.reduce((t, s) => t + s.w, 0);
  if (!(total > 0)) return NaN;

  // Mid-rank position of each sample within the cumulative weight.
  const pos = new Array(pts.length);
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    pos[i] = (acc + pts[i].w / 2) / total;
    acc += pts[i].w;
  }
  if (q <= pos[0]) return pts[0].v;
  if (q >= pos[pts.length - 1]) return pts[pts.length - 1].v;
  for (let i = 1; i < pts.length; i++) {
    if (q <= pos[i]) {
      const span = pos[i] - pos[i - 1];
      const t = span > 0 ? (q - pos[i - 1]) / span : 0;
      return pts[i - 1].v + (pts[i].v - pts[i - 1].v) * t;
    }
  }
  return pts[pts.length - 1].v;
}

export function weightedMedian(samples) {
  return weightedQuantile(samples, 0.5);
}

/**
 * Median absolute deviation, scaled to be a consistent estimator of sigma for
 * normally distributed data (the 1.4826 factor).
 */
export function weightedMAD(samples, centre) {
  const c = Number.isFinite(centre) ? centre : weightedMedian(samples);
  if (!Number.isFinite(c)) return NaN;
  const dev = samples
    .filter((s) => Number.isFinite(s.v) && s.w > 0)
    .map((s) => ({ v: Math.abs(s.v - c), w: s.w }));
  const mad = weightedMedian(dev);
  return Number.isFinite(mad) ? mad * 1.4826 : NaN;
}

/**
 * Effective sample size for weighted data (Kish). Two samples at weight 0.1
 * are not two samples' worth of evidence, and the confidence score must know
 * the difference.
 */
export function effectiveN(samples) {
  let s1 = 0, s2 = 0;
  for (const s of samples) {
    if (!Number.isFinite(s.v) || !(s.w > 0)) continue;
    s1 += s.w;
    s2 += s.w * s.w;
  }
  return s2 > 0 ? (s1 * s1) / s2 : 0;
}

/**
 * Empirical-Bayes shrinkage toward a prior. With one observation of a lawn we
 * genuinely do not know its service time; claiming we do is how a prediction
 * engine loses trust. The estimate slides from the prior to the observed
 * median as evidence accumulates.
 *
 * @param {number} observed  robust location of the samples
 * @param {number} prior     population/day-level location
 * @param {number} nEff      effective sample size
 * @param {number} k         samples at which the estimate is half-way to observed
 */
export function shrink(observed, prior, nEff, k = 2.5) {
  if (!Number.isFinite(observed)) return prior;
  if (!Number.isFinite(prior)) return observed;
  const w = nEff / (nEff + k);
  return prior + (observed - prior) * w;
}

/**
 * Confidence in [0,1]. Rises with evidence, falls with dispersion. Deliberately
 * conservative: it takes roughly four consistent observations to clear 0.6.
 */
export function confidenceScore(nEff, spread, centre) {
  if (!(nEff > 0)) return 0;
  const evidence = 1 - Math.exp(-nEff / 3);
  const rel = Number.isFinite(spread) && centre > 0 ? spread / centre : 0.6;
  const consistency = 1 / (1 + Math.max(0, rel) * 2.2);
  return clamp01(evidence * 0.62 + evidence * consistency * 0.38);
}

export function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * Exponential recency weight. A lawn in May is not the same lawn in August;
 * six weeks is roughly the horizon over which growth rate and route habits
 * change enough to matter.
 */
export function recencyWeight(ageDays, halfLifeDays = 42) {
  if (!Number.isFinite(ageDays) || ageDays < 0) return 1;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * Theil–Sen slope: the median of all pairwise slopes. Immune to up to ~29% of
 * the points being garbage, which is roughly the batch-tap rate in the real
 * history, so it is the right tool for re-fitting the travel model in the field.
 */
export function theilSen(points) {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 2) return null;
  const slopes = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[j].x - pts[i].x;
      if (Math.abs(dx) < 1e-9) continue;
      slopes.push((pts[j].y - pts[i].y) / dx);
    }
  }
  if (!slopes.length) return null;
  slopes.sort((a, b) => a - b);
  const slope = slopes[slopes.length >> 1];
  const ints = pts.map((p) => p.y - slope * p.x).sort((a, b) => a - b);
  return { slope, intercept: ints[ints.length >> 1], n: pts.length };
}
