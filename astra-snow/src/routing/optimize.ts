// Advisory sequencing of the remaining stops.
//
// Objective = travel time + service time + a caller-supplied, time-dependent
// penalty per stop (the plow model's expected rework) + a stability cost for
// breaking the dispatcher's adjacencies, so the route only changes where the
// gain is worth the disruption.
//
// Search: Or-opt (move runs of 1–3 stops) and 2-opt (reverse a run), first
// improvement, repeated to a local optimum. Deterministic. n ≤ ~200, so a full
// O(n) schedule evaluation per candidate is affordable.

export interface PlanInput {
  /** n×n travel distance matrix in metres, row-major, over stop indices. */
  matrix: Float64Array;
  n: number;
  /** Ordered remaining stop indices to sequence. */
  order: number[];
  /** Metres from the current position to each stop index (length n). */
  fromHere: Float64Array | number[];
  /** Service minutes per stop index. */
  serviceMin: number[];
  /** Travel speed, metres per minute. */
  metresPerMin: number;
  /** Clock at the start, ms epoch. */
  startMs: number;
  /** Expected extra minutes caused by serving stop i at time ms (≥ 0). */
  penalty?: (stop: number, arriveMs: number) => number;
  /** Minutes charged per dispatcher adjacency broken. 0 disables. */
  stability?: number;
  /** The dispatcher's order, to measure broken adjacencies against. */
  baseOrder?: number[];
  /** Iteration cap (safety). */
  maxPasses?: number;
}

export interface Schedule {
  order: number[];
  travelMetres: number;
  travelMin: number;
  serviceMin: number;
  penaltyMin: number;
  stabilityMin: number;
  totalMin: number;
  finishMs: number;
  /** arrival ms per position */
  arrivals: number[];
}

export function evaluate(inp: PlanInput, order: number[]): Schedule {
  const { matrix, n, fromHere, serviceMin, metresPerMin, startMs, penalty } = inp;
  let t = startMs;
  let metres = 0;
  let pen = 0;
  let svc = 0;
  const arrivals: number[] = new Array(order.length);
  for (let k = 0; k < order.length; k++) {
    const s = order[k];
    const leg = k === 0 ? fromHere[s] : matrix[order[k - 1] * n + s];
    metres += leg;
    t += (leg / metresPerMin) * 60_000;
    arrivals[k] = t;
    if (penalty) pen += penalty(s, t);
    svc += serviceMin[s];
    t += serviceMin[s] * 60_000;
  }
  const stab = inp.stability && inp.baseOrder ? inp.stability * brokenAdjacencies(inp.baseOrder, order) : 0;
  const travelMin = metres / metresPerMin;
  return {
    order: order.slice(),
    travelMetres: metres,
    travelMin,
    serviceMin: svc,
    penaltyMin: pen,
    stabilityMin: stab,
    totalMin: travelMin + svc + pen + stab,
    finishMs: t,
    arrivals,
  };
}

/** Dispatcher adjacencies (a directly before b), computed once per base order. */
const adjCache = new WeakMap<number[], Map<number, number>>();
function baseNext(base: number[]): Map<number, number> {
  let m = adjCache.get(base);
  if (!m) {
    m = new Map();
    for (let i = 0; i < base.length - 1; i++) m.set(base[i], base[i + 1]);
    adjCache.set(base, m);
  }
  return m;
}

/** Count dispatcher adjacencies (a directly before b) that the plan does not keep. */
export function brokenAdjacencies(base: number[], plan: number[]): number {
  // Plans here are always permutations of the base, so "kept" means the
  // plan places b right after a.
  const want = baseNext(base);
  let kept = 0;
  for (let i = 0; i < plan.length - 1; i++) if (want.get(plan[i]) === plan[i + 1]) kept++;
  return Math.max(0, base.length - 1 - kept);
}

export function optimize(inp: PlanInput): Schedule {
  let best = evaluate(inp, inp.order);
  const n = best.order.length;
  if (n < 3) return best;
  const passes = inp.maxPasses ?? 50;
  for (let pass = 0; pass < passes; pass++) {
    let improved = false;
    // Or-opt: move a run [i, i+len) to before position j.
    for (let len = 1; len <= 3 && !improved; len++) {
      for (let i = 0; i + len <= n && !improved; i++) {
        for (let j = 0; j <= n - len && !improved; j++) {
          if (j === i) continue;
          const o = best.order;
          const run = o.slice(i, i + len);
          const rest = o.slice(0, i).concat(o.slice(i + len));
          const cand = rest.slice(0, j).concat(run, rest.slice(j));
          const s = evaluate(inp, cand);
          if (s.totalMin < best.totalMin - 1e-6) {
            best = s;
            improved = true;
          }
        }
      }
    }
    // 2-opt: reverse o[i..k].
    for (let i = 0; i < n - 1 && !improved; i++) {
      for (let k = i + 1; k < n && !improved; k++) {
        const o = best.order;
        const cand = o.slice(0, i).concat(o.slice(i, k + 1).reverse(), o.slice(k + 1));
        const s = evaluate(inp, cand);
        if (s.totalMin < best.totalMin - 1e-6) {
          best = s;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

/**
 * Block-level search: the dispatcher's within-street order is kept; whole
 * blocks (consecutive stops on one street) may move or be driven in reverse.
 * This is the operational unit the plow model reasons about.
 */
export function optimizeBlocks(inp: PlanInput, blocks: number[][]): Schedule {
  let cur = blocks.map((b) => b.slice());
  const flat = (bs: number[][]) => bs.flat();
  let best = evaluate(inp, flat(cur));
  const passes = inp.maxPasses ?? 60;
  for (let pass = 0; pass < passes; pass++) {
    let improved = false;
    const m = cur.length;
    for (let i = 0; i < m; i++) {
      // reverse block i
      const rev = cur.map((b, k) => (k === i ? b.slice().reverse() : b));
      let s = evaluate(inp, flat(rev));
      if (s.totalMin < best.totalMin - 1e-6) {
        cur = rev;
        best = s;
        improved = true;
      }
      // relocate block i to every other slot
      for (let j = 0; j < m; j++) {
        if (j === i) continue;
        const rest = cur.filter((_, k) => k !== i);
        const cand = rest.slice(0, j).concat([cur[i]], rest.slice(j));
        s = evaluate(inp, flat(cand));
        if (s.totalMin < best.totalMin - 1e-6) {
          cur = cand;
          best = s;
          improved = true;
          break;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

/** Split an order into blocks of consecutive stops that share a key (street). */
export function blocksOf(order: number[], key: (stop: number) => string): number[][] {
  const out: number[][] = [];
  for (const s of order) {
    const last = out[out.length - 1];
    if (last && key(last[last.length - 1]) === key(s)) last.push(s);
    else out.push([s]);
  }
  return out;
}

export interface Comparison {
  base: Schedule;
  plan: Schedule;
  savedMin: number;
  savedMetres: number;
  moved: number;
}

export function compare(inp: PlanInput): Comparison {
  const base = evaluate({ ...inp, stability: 0 }, inp.order);
  const plan = optimize(inp);
  const planNoStab = evaluate({ ...inp, stability: 0 }, plan.order);
  let moved = 0;
  for (let i = 0; i < plan.order.length; i++) if (plan.order[i] !== inp.order[i]) moved++;
  return {
    base,
    plan: planNoStab,
    savedMin: base.totalMin - planNoStab.totalMin,
    savedMetres: base.travelMetres - planNoStab.travelMetres,
    moved,
  };
}
