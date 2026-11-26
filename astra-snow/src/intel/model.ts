// Plow intelligence: what is known, what is expected, and how sure we are.
//
// Three tiers, never blended silently:
//   observed   — the City feed says the segment was serviced at T (kind unknown),
//                and/or the driver said what the street looked like.
//   historical — empirical timing from operations this app has recorded
//                (needs MIN_OPS comparable operations before it says anything).
//   prior      — the City's published policy (priority/secondary ≥5 cm first;
//                residential ≥8 cm, target 12–24 h after snowfall ends).
// Every output carries its basis and a confidence label.

export interface ServiceEvent {
  seg: number;
  t: number;
}

export interface Operation {
  id: string;
  start: number;
  end: number;
  events: number;
  /** segment -> first service time within the operation */
  first: Map<number, number>;
}

/** A gap with no service anywhere in the city longer than this ends an operation. */
export const OP_GAP_MS = 3 * 3600_000;
export const MIN_OPS = 3;

export function segmentOperations(events: ServiceEvent[]): Operation[] {
  const sorted = events.slice().sort((a, b) => a.t - b.t);
  const ops: Operation[] = [];
  let cur: Operation | null = null;
  for (const e of sorted) {
    if (!cur || e.t - cur.end > OP_GAP_MS) {
      cur = { id: `op-${e.t}`, start: e.t, end: e.t, events: 0, first: new Map() };
      ops.push(cur);
    }
    cur.end = e.t;
    cur.events++;
    if (!cur.first.has(e.seg)) cur.first.set(e.seg, e.t);
  }
  return ops;
}

export type Basis = 'observed' | 'historical' | 'prior' | 'none';
export type Confidence = 'high' | 'medium' | 'low' | 'none';

export interface StreetObservation {
  roadId: number;
  state: 'plowed' | 'unplowed' | 'unsure';
  t: number;
}

export interface SegmentIntel {
  seg: number;
  /** City service time inside the current operation, if any. */
  servicedThisOp: number | null;
  /** Most recent City service time at all. */
  lastServiced: number | null;
  /** Latest driver observation for this segment this shift. */
  observed: StreetObservation | null;
  /** Is the street believed clear of plow windrow risk right now? */
  state: 'plowed-confirmed' | 'serviced-unconfirmed' | 'not-serviced' | 'unknown';
  /** Expected first service, for a segment not yet serviced this operation. */
  expected: { p10: number; p50: number; p90: number; samples: number } | null;
  basis: Basis;
  confidence: Confidence;
  explain: string;
}

export interface ModelContext {
  now: number;
  /** Start of the current city operation (first service event of it), if active. */
  opStart: number | null;
  plowClass: (seg: number) => 'P' | 'S' | 'R' | null;
  /** Past, completed operations with route coverage, for empirical timing. */
  history: Operation[];
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** Operations that look like plowing runs on residential streets (not salt-only). */
export function plowingOps(ops: Operation[], residentialSegs: number[], coverage = 0.5): Operation[] {
  if (!residentialSegs.length) return [];
  return ops.filter((op) => {
    let hit = 0;
    for (const s of residentialSegs) if (op.first.has(s)) hit++;
    return hit / residentialSegs.length >= coverage;
  });
}

export function segmentIntel(
  seg: number,
  lastServiced: number | null,
  obs: StreetObservation | null,
  ctx: ModelContext,
): SegmentIntel {
  const inOp = ctx.opStart !== null && lastServiced !== null && lastServiced >= ctx.opStart ? lastServiced : null;
  const cls = ctx.plowClass(seg);
  let state: SegmentIntel['state'];
  if (obs?.state === 'plowed') state = 'plowed-confirmed';
  else if (inOp !== null) state = obs?.state === 'unplowed' && obs.t > inOp ? 'not-serviced' : 'serviced-unconfirmed';
  else if (obs?.state === 'unplowed') state = 'not-serviced';
  else if (ctx.opStart !== null) state = 'not-serviced';
  else state = 'unknown';

  // Expected timing for a segment not yet serviced in this operation.
  let expected: SegmentIntel['expected'] = null;
  let basis: Basis = inOp !== null || obs ? 'observed' : 'none';
  let confidence: Confidence = obs?.state === 'plowed' ? 'high' : inOp !== null ? 'medium' : 'none';
  let explain = '';
  if (state === 'plowed-confirmed') explain = 'You confirmed this street plowed.';
  else if (state === 'serviced-unconfirmed') explain = 'City serviced it this storm — plow or salt, the feed does not say.';
  if (inOp === null && state !== 'plowed-confirmed' && ctx.opStart !== null) {
    const offsets = ctx.history.map((op) => op.first.get(seg)).filter((t): t is number => t !== undefined);
    const rel = ctx.history
      .filter((op) => op.first.has(seg))
      .map((op) => op.first.get(seg)! - op.start)
      .sort((a, b) => a - b);
    if (rel.length >= MIN_OPS) {
      expected = {
        p10: ctx.opStart + quantile(rel, 0.1),
        p50: ctx.opStart + quantile(rel, 0.5),
        p90: ctx.opStart + quantile(rel, 0.9),
        samples: rel.length,
      };
      basis = 'historical';
      confidence = rel.length >= 8 ? 'medium' : 'low';
      explain = `In ${rel.length} recorded storms the City reached this street ${fmtH(quantile(rel, 0.5))} after the storm's first service (range ${fmtH(quantile(rel, 0.1))}–${fmtH(quantile(rel, 0.9))}).`;
    } else {
      basis = basis === 'observed' ? 'observed' : 'prior';
      confidence = 'low';
      explain =
        cls === 'R'
          ? `Residential street: the City plows these at ≥8 cm, after priority and secondary roads. ${offsets.length ? `${offsets.length} storm(s) recorded so far — ${MIN_OPS} needed for timing.` : 'No storms recorded yet — timing unknown.'}`
          : cls
            ? 'Priority/secondary road: serviced early in a storm (≥5 cm).'
            : 'Not a City-maintained segment in the feed.';
    }
  }
  if (state === 'unknown') explain = 'No City operation in progress.';
  return { seg, servicedThisOp: inOp, lastServiced, observed: obs, state, expected, basis, confidence, explain };
}

function fmtH(ms: number): string {
  const m = Math.round(ms / 60_000);
  return m < 90 ? `${m} min` : `${(m / 60).toFixed(1)} h`;
}

/**
 * Current-operation detector: the City is "in operation" if the newest
 * service anywhere is within OP_GAP_MS. Its start is the earliest event of the
 * unbroken run that includes now.
 */
export function currentOperation(events: ServiceEvent[], now: number): { start: number; latest: number } | null {
  const ops = segmentOperations(events.filter((e) => e.t <= now));
  const last = ops[ops.length - 1];
  if (!last || now - last.end > OP_GAP_MS) return null;
  return { start: last.start, latest: last.end };
}

// ------------------------------------------------------------------ windrow

export interface WindrowRisk {
  stop: number;
  seg: number;
  doneAt: number;
  servicedAt: number;
  level: 'likely' | 'possible' | 'unlikely';
  why: string;
}

/**
 * A driveway cleared before the City serviced its street may have a windrow
 * across its end. Likelihood rises when the driver had seen the street
 * unplowed and when it is a residential street (only plowed, rarely salted
 * alone, during plow operations — still not certain).
 */
export function windrowRisk(
  stop: number,
  seg: number,
  doneAt: number,
  servicedAt: number | null,
  obsAtDone: StreetObservation['state'] | null,
  cls: 'P' | 'S' | 'R' | null,
): WindrowRisk | null {
  if (servicedAt === null || servicedAt <= doneAt) return null;
  if (obsAtDone === 'plowed') {
    return { stop, seg, doneAt, servicedAt, level: 'unlikely', why: 'Street was already plowed when you cleared it; the later pass was probably salt.' };
  }
  if (obsAtDone === 'unplowed') {
    return { stop, seg, doneAt, servicedAt, level: 'likely', why: 'You cleared it with the street unplowed; the City serviced the street afterwards.' };
  }
  return {
    stop,
    seg,
    doneAt,
    servicedAt,
    level: cls === 'R' ? 'likely' : 'possible',
    why: cls === 'R' ? 'City serviced this residential street after you cleared it.' : 'City serviced this street after you cleared it (plow or salt).',
  };
}

// ------------------------------------------------------- plan penalty (live)

export interface PenaltyInputs {
  intel: Map<number, SegmentIntel>;
  /** Minutes to deal with a windrow (return trip + clearing). */
  reworkMin: number;
  /** Shift end estimate (ms); service after this does not matter tonight. */
  horizon: number;
  /** City operation active? Without one there is no timing signal at all. */
  opActive: boolean;
}

/**
 * Expected rework minutes for clearing a driveway on `seg` at `arrive`.
 * Uses historical timing when available; otherwise the live follow-the-plow
 * rule (serviced streets are safe now; unserviced residential streets in an
 * active operation carry a flat risk, labelled as a prior).
 */
export function reworkPenalty(seg: number, arrive: number, p: PenaltyInputs): number {
  if (!p.opActive) return 0;
  const si = p.intel.get(seg);
  if (!si) return 0;
  if (si.state === 'plowed-confirmed') return 0;
  if (si.state === 'serviced-unconfirmed') return 0.1 * p.reworkMin;
  if (si.expected) {
    // P(first service lands in (arrive, horizon]) under a piecewise-linear CDF.
    const F = (t: number) => cdf(t, si.expected!);
    const pr = Math.max(0, F(p.horizon) - F(arrive));
    return pr * p.reworkMin;
  }
  // Prior: unknown timing — flat risk, small enough not to dominate travel.
  return 0.35 * p.reworkMin;
}

function cdf(t: number, e: { p10: number; p50: number; p90: number }): number {
  if (t <= e.p10) return Math.max(0, 0.1 * (1 - (e.p10 - t) / Math.max(1, e.p50 - e.p10)));
  if (t <= e.p50) return 0.1 + (0.4 * (t - e.p10)) / Math.max(1, e.p50 - e.p10);
  if (t <= e.p90) return 0.5 + (0.4 * (t - e.p50)) / Math.max(1, e.p90 - e.p50);
  return Math.min(1, 0.9 + (0.1 * (t - e.p90)) / Math.max(1, e.p90 - e.p50));
}
