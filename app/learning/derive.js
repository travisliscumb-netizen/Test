/**
 * Turns a raw stream of completion events into service-time samples.
 *
 * This is the part of the system that has to be honest. The only thing the
 * phone ever records is *when Done was tapped*. It does not record when work
 * started, and the tap is frequently late or batched. So a recorded gap is
 *
 *     gap(prev -> cur) = travel(prev, cur) + service(cur) + idle
 *
 * and the job here is to recover `service` while refusing to invent numbers
 * where the evidence does not support one. Each sample is labelled with how it
 * was obtained and carries a weight; downstream estimators respect both.
 */

import { haversineKm } from '../core/geo.js';
import { dateKey } from '../core/time.js';
import { theilSen } from './robust.js';

/** A burst of taps closer together than this is one person catching up. */
export const BATCH_TAP_SECONDS = 90;
/** Beyond this, a gap contains something that is not this lawn. */
export const IDLE_GAP_MINUTES = 75;
/** No lawn on this route is plausibly quicker than this. */
export const MIN_SERVICE_MINUTES = 3;
/** Or slower than this without it being an unusual visit. */
export const MAX_SERVICE_MINUTES = 95;

/** Default travel model, fitted from 24 real work days of Ted's 2026 season. */
export const DEFAULT_TRAVEL_MODEL = {
  fixedMin: 2.0,      // park, ramps down, ramps up, pull away
  perKmMin: 4.16,     // ≈14.4 km/h effective door-to-door with a trailer
  fittedFrom: 'seed-2026-season',
  n: 291,
};

export function travelMinutes(model, km) {
  if (!Number.isFinite(km)) return model.fixedMin;
  return model.fixedMin + model.perKmMin * Math.max(0, km);
}

/**
 * Groups completion events into work sessions. A session is one operator's
 * continuous run on one civil day; the boundary is the calendar day rather
 * than a fixed number of hours, because a long day is still one day.
 *
 * @param {Array<{propertyId,at,dateKey?}>} events
 * @returns {Map<string, Array>} keyed by date
 */
export function groupIntoSessions(events) {
  const byDay = new Map();
  for (const e of events) {
    if (!e || !Number.isFinite(e.at)) continue;
    const k = e.dateKey || dateKey(e.at);
    let arr = byDay.get(k);
    if (!arr) byDay.set(k, (arr = []));
    arr.push(e);
  }
  for (const arr of byDay.values()) arr.sort((a, b) => a.at - b.at);
  return byDay;
}

/**
 * Extracts service samples from one ordered session.
 *
 * Batch taps are the interesting case. When k stops are all marked within
 * BATCH_TAP_SECONDS of each other, the work for all k happened between the
 * previous real anchor and the burst. Assigning each of them a ~0 minute
 * service time would be a lie that permanently depresses their estimates, and
 * throwing the burst away discards real elapsed work. Instead the elapsed
 * window minus its travel is divided across the burst in proportion to each
 * stop's current prior, and every resulting sample is marked `inferred` and
 * weighted down.
 *
 * Without a day-start anchor the very first stop of every session yields no
 * sample at all, because there is no preceding completion to measure from.
 * Over a season that would leave the first property on each weekday
 * permanently un-learned, so when the day's start instant is known it is used
 * as a synthetic anchor at the depot.
 *
 * @param {Array} session          ordered events for one day
 * @param {Function} coordOf       propertyId -> {lat,lng} | null
 * @param {Function} priorOf       propertyId -> expected minutes
 * @param {object} model           travel model
 * @param {?{at:number, coord:?object}} anchor  known start of the work day
 */
export const START_ANCHOR_ID = '\u0000start';

export function samplesFromSession(session, coordOf, priorOf, model = DEFAULT_TRAVEL_MODEL, anchor = null) {
  const out = [];
  if (!session || session.length === 0) return out;

  // Partition the session into bursts of near-simultaneous taps.
  const bursts = [];
  let cur = [session[0]];
  for (let i = 1; i < session.length; i++) {
    const dt = (session[i].at - session[i - 1].at) / 1000;
    if (dt <= BATCH_TAP_SECONDS) cur.push(session[i]);
    else { bursts.push(cur); cur = [session[i]]; }
  }
  bursts.push(cur);

  // A start anchor becomes burst zero, so the existing loop handles the first
  // real stop with no special case. It emits no sample of its own.
  if (anchor && Number.isFinite(anchor.at) && anchor.at < bursts[0][0].at) {
    const gapMin = (bursts[0][0].at - anchor.at) / 60000;
    // A "start" recorded hours before the first stop is a stale flag, not a
    // measurement, and must not be turned into a four-hour lawn.
    if (gapMin > 0 && gapMin < IDLE_GAP_MINUTES * 1.5) {
      const anchorCoord = anchor.coord || null;
      const baseCoordOf = coordOf;
      coordOf = (id) => (id === START_ANCHOR_ID ? anchorCoord : baseCoordOf(id));
      bursts.unshift([{ propertyId: START_ANCHOR_ID, at: anchor.at }]);
    }
  }

  for (let b = 1; b < bursts.length; b++) {
    const prevBurst = bursts[b - 1];
    const burst = bursts[b];
    const anchor = prevBurst[prevBurst.length - 1];
    const elapsedMin = (burst[burst.length - 1].at - anchor.at) / 60000;
    if (!(elapsedMin > 0)) continue;

    // Travel actually driven across this window: anchor -> each stop in order.
    let travelKm = 0;
    let from = coordOf(anchor.propertyId);
    for (const e of burst) {
      const to = coordOf(e.propertyId);
      if (from && to) travelKm += haversineKm(from, to);
      if (to) from = to;
    }
    const travelMin = burst.length * model.fixedMin + model.perKmMin * travelKm;
    let workMin = elapsedMin - travelMin;

    // A window containing an hour of nothing is not evidence about a lawn.
    const idle = elapsedMin > IDLE_GAP_MINUTES * burst.length;
    if (workMin <= 0) continue;

    if (burst.length === 1) {
      const v = workMin;
      if (v < MIN_SERVICE_MINUTES || v > MAX_SERVICE_MINUTES || idle) {
        out.push({
          propertyId: burst[0].propertyId, at: burst[0].at,
          minutes: Math.min(Math.max(v, MIN_SERVICE_MINUTES), MAX_SERVICE_MINUTES),
          quality: idle ? 'idle-suspect' : 'out-of-range', weight: 0.15,
        });
      } else {
        out.push({
          propertyId: burst[0].propertyId, at: burst[0].at,
          minutes: v, quality: 'direct', weight: 1,
        });
      }
      continue;
    }

    // Distribute proportionally to each stop's prior expectation.
    const priors = burst.map((e) => Math.max(1, priorOf(e.propertyId)));
    const priorSum = priors.reduce((a, b) => a + b, 0);
    for (let i = 0; i < burst.length; i++) {
      const share = workMin * (priors[i] / priorSum);
      out.push({
        propertyId: burst[i].propertyId,
        at: burst[i].at,
        minutes: Math.min(Math.max(share, MIN_SERVICE_MINUTES), MAX_SERVICE_MINUTES),
        quality: idle ? 'batch-idle' : 'batch',
        weight: idle ? 0.1 : 0.35,
      });
    }
  }
  return out;
}

/**
 * Re-fits the travel model from observed gaps. Uses only clean single-stop
 * transitions, then Theil–Sen so that a handful of lunch breaks cannot drag
 * the slope. Refuses to return a model it cannot defend, in which case the
 * caller keeps the previous one — a silently bad travel model would corrupt
 * both the optimizer and the finish estimate.
 */
export function fitTravelModel(sessions, coordOf, previous = DEFAULT_TRAVEL_MODEL) {
  const pts = [];
  for (const session of sessions) {
    for (let i = 1; i < session.length; i++) {
      const dtMin = (session[i].at - session[i - 1].at) / 60000;
      if (dtMin < BATCH_TAP_SECONDS / 60 || dtMin > IDLE_GAP_MINUTES) continue;
      const a = coordOf(session[i - 1].propertyId);
      const b = coordOf(session[i].propertyId);
      if (!a || !b) continue;
      pts.push({ x: haversineKm(a, b), y: dtMin });
    }
  }
  if (pts.length < 40) return { ...previous, refit: false, n: pts.length };

  // Bucket first: raw pairwise Theil-Sen over ~300 points is 45k slopes and the
  // distance distribution is heavily skewed toward very short hops, which
  // would let the dense short-hop cloud dominate the median slope.
  const edges = [0, 0.1, 0.25, 0.5, 1, 2, 4, 8, 40];
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
  const buckets = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const inB = pts.filter((p) => p.x >= edges[i] && p.x < edges[i + 1]);
    if (inB.length >= 5) buckets.push({ x: med(inB.map((p) => p.x)), y: med(inB.map((p) => p.y)) });
  }
  if (buckets.length < 3) return { ...previous, refit: false, n: pts.length };

  const fit = theilSen(buckets);
  if (!fit || !(fit.slope > 0.5) || !(fit.slope < 25)) {
    return { ...previous, refit: false, n: pts.length };
  }
  // The intercept of this fit is (service + fixed travel overhead) at zero
  // distance. Only the slope is a pure travel quantity; the fixed cost of
  // stopping is not separable from service by observation alone, so it is held
  // at its prior rather than being invented from the intercept.
  return {
    fixedMin: previous.fixedMin,
    perKmMin: Math.min(12, Math.max(1, fit.slope)),
    impliedBaseMin: fit.intercept,
    fittedFrom: 'observed',
    n: pts.length,
    refit: true,
  };
}
