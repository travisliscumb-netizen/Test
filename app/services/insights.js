/**
 * Proactive assistance.
 *
 * The product principle is "anticipate the next action", and the failure mode
 * of that principle is an app that nags. Every insight here therefore has to
 * earn its place against three rules:
 *
 *   1. It must be actionable now. An observation the operator can do nothing
 *      about is noise.
 *   2. It must state its reasoning. "Reorder to save 18 minutes" is a claim;
 *      "these four remaining stops form a shorter loop" is a reason.
 *   3. It must be silenceable and must not return immediately once dismissed.
 *
 * Insights are ranked and the caller shows at most one or two. Anything that
 * cannot beat the threshold is simply not raised.
 */

import { haversineKm, formatDistance } from '../core/geo.js';
import { formatDuration, formatClock, DAY_FULL } from '../core/time.js';
import { findClusters, findBacktracks } from '../routing/metric.js';
import { statsFor } from '../learning/predict.js';

export const PRIORITY = { critical: 100, high: 70, medium: 45, low: 20 };

/**
 * @param {object} ctx
 * @param {Array} ctx.stops         today's stops in order, with status
 * @param {number} ctx.currentIndex
 * @param {object} ctx.model        learning model
 * @param {object} ctx.location     LocationService
 * @param {object} ctx.forecast     forecastDay() result for the remainder
 * @param {object} ctx.pace         paceToday() result
 * @param {object} ctx.optimization optimizeRoute() result for the remainder
 * @param {Set<string>} ctx.dismissed
 * @param {object} [ctx.weather]
 * @param {number} ctx.thresholdMin minimum saving worth interrupting for
 */
export function buildInsights(ctx) {
  const out = [];
  const {
    stops = [], currentIndex = -1, model, location, forecast, pace,
    optimization, dismissed = new Set(), weather, thresholdMin = 6,
  } = ctx;

  const remaining = stops.filter((s) => s.status === 'pending');
  const current = currentIndex >= 0 ? stops[currentIndex] : null;

  // ---- arrival ----------------------------------------------------------
  if (current && location) {
    const v = location.arrivalVerdict(current);
    if (v.ok) {
      push(out, {
        id: `arrive:${current.id}`,
        priority: PRIORITY.critical,
        tone: 'suggest',
        title: `You appear to be at ${current.address}`,
        body: `GPS puts you ${Math.round(v.metres)} m away, accurate to about ${Math.round(v.accuracy)} m.`,
        action: { kind: 'complete', propertyId: current.id, label: 'Mark done' },
      }, dismissed);
    } else if (v.reason && location.state === 'live' && v.accuracy > 65) {
      // Explaining the silence is the point: the operator should never wonder
      // why the app stopped offering something it offered yesterday.
      push(out, {
        id: 'gps-accuracy',
        priority: PRIORITY.low,
        tone: 'info',
        title: 'Arrival hints paused',
        body: v.reason,
      }, dismissed);
    }
  }

  // ---- a stop that was probably finished but never tapped ---------------
  const missed = findProbableMissedStop(stops, currentIndex, location);
  if (missed) {
    push(out, {
      id: `missed:${missed.stop.id}`,
      priority: PRIORITY.high,
      tone: 'warn',
      title: `Did you finish ${missed.stop.address}?`,
      body: missed.reason,
      action: { kind: 'complete', propertyId: missed.stop.id, label: 'Mark done' },
      secondary: { kind: 'skip', propertyId: missed.stop.id, label: 'Skip it' },
    }, dismissed);
  }

  // ---- reordering -------------------------------------------------------
  if (optimization?.changed && optimization.savedMinutes >= thresholdMin) {
    const moved = optimization.moved.length;
    const why = explainOptimization(optimization, remaining);
    push(out, {
      id: `optimize:${Math.round(optimization.savedMinutes)}:${remaining.length}`,
      priority: optimization.savedMinutes >= 15 ? PRIORITY.high : PRIORITY.medium,
      tone: 'suggest',
      title: `Reordering the remaining ${remaining.length} stops saves about ${formatDuration(optimization.savedMinutes)}`,
      body: why,
      detail: `${moved} stop${moved === 1 ? '' : 's'} would move. Your master route is kept and can be restored in one tap.`,
      action: { kind: 'apply-optimization', label: 'Apply' },
    }, dismissed);
  }

  // ---- clusters ---------------------------------------------------------
  const clusters = findClusters(remaining.slice(0, 8), 0.32, 3);
  if (clusters.length) {
    const c = clusters[0];
    const span = c.reduce((m, p, i) => (i ? Math.max(m, haversineKm(c[0], p)) : 0), 0);
    push(out, {
      id: `cluster:${c[0].id}:${c.length}`,
      priority: PRIORITY.low,
      tone: 'info',
      title: `The next ${c.length} stops are tightly clustered`,
      body: `${c.map((s) => s.address).slice(0, 3).join(', ')}${c.length > 3 ? '…' : ''} are all within ${formatDistance(span)}. You can stage the truck once and walk them.`,
    }, dismissed);
  }

  // ---- pace -------------------------------------------------------------
  if (pace && Math.abs(pace.deltaMin) >= 12) {
    const weekday = DAY_FULL[stops[0]?.day] || 'this day';
    push(out, {
      id: 'pace',
      priority: PRIORITY.low,
      tone: pace.state === 'ahead' ? 'suggest' : 'info',
      title: pace.state === 'ahead'
        ? `You are ${formatDuration(pace.deltaMin)} ahead of a normal ${weekday}`
        : `You are ${formatDuration(-pace.deltaMin)} behind a normal ${weekday}`,
      body: `Expected ${formatDuration(pace.expectedMin)} for the stops done so far; actual ${formatDuration(pace.actualMin)}.`,
    }, dismissed);
  }

  // ---- forecast reliability --------------------------------------------
  if (forecast && !forecast.reliable && forecast.unknownCount > 0) {
    push(out, {
      id: 'forecast-wide',
      priority: PRIORITY.low,
      tone: 'info',
      title: 'Finish estimate is a wide range today',
      body: `${forecast.unknownCount} of the ${forecast.stopCount} remaining stops have little or no timing history yet, so the estimate spans about ${formatDuration(forecast.sdMin * 2)}. It narrows as they are serviced.`,
    }, dismissed);
  }

  // ---- weather ----------------------------------------------------------
  const rain = weather?.nextRain?.(60);
  if (rain && rain.at - Date.now() < 5 * 3600e3) {
    const mins = Math.round((rain.at - Date.now()) / 60000);
    push(out, {
      id: `rain:${rain.at}`,
      priority: mins < 90 ? PRIORITY.medium : PRIORITY.low,
      tone: 'warn',
      title: `Rain likely from about ${formatClock(rain.at)}`,
      body: `${rain.precipProb}% chance in that hour${mins < 120 ? ` — roughly ${formatDuration(mins)} away` : ''}. Consider running the exposed or push-mow properties first.`,
    }, dismissed);
  }

  // ---- coordinates needing review --------------------------------------
  const review = stops.filter((s) => s.needsLocationReview || !Number.isFinite(s.lat));
  if (review.length) {
    push(out, {
      id: `review:${review.length}`,
      priority: PRIORITY.low,
      tone: 'warn',
      title: `${review.length} propert${review.length === 1 ? 'y needs' : 'ies need'} a location`,
      body: 'They appear in the list but not on the map, and route optimisation ignores them. You can drop a pin from the property card while you are there.',
    }, dismissed);
  }

  out.sort((a, b) => b.priority - a.priority);
  return out;
}

function push(list, insight, dismissed) {
  if (dismissed.has(insight.id)) return;
  list.push(insight);
}

/**
 * Looks for a stop the operator has plainly driven past.
 *
 * Two independent signals, because either alone produces false positives:
 * the truck is now closer to a *later* stop than to the pending one, and
 * enough time has elapsed since the last completion that work has clearly
 * happened. Both must hold.
 */
function findProbableMissedStop(stops, currentIndex, location) {
  if (currentIndex < 1 || !location?.fresh) return null;
  const pos = location.position;
  if (!pos || (pos.accuracy ?? 999) > 90) return null;

  const pending = stops.slice(0, currentIndex).filter((s) => s.status === 'pending' && Number.isFinite(s.lat));
  if (!pending.length) return null;

  const lastDone = stops.filter((s) => s.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0))[0];
  const sinceLast = lastDone?.doneAt ? (Date.now() - lastDone.doneAt) / 60000 : 0;
  if (sinceLast < 22) return null;

  const candidate = pending[pending.length - 1];
  const dHere = haversineKm(pos, candidate);
  const later = stops.slice(currentIndex).filter((s) => Number.isFinite(s.lat));
  const nearestLater = later.reduce((m, s) => Math.min(m, haversineKm(pos, s)), Infinity);
  if (!(dHere > 0.3 && nearestLater < dHere)) return null;

  return {
    stop: candidate,
    reason: `It is still marked pending, you are now ${formatDistance(dHere)} past it, and nothing has been marked done for ${formatDuration(sinceLast)}.`,
  };
}

/** Turns an optimisation result into a sentence about geography, not numbers. */
function explainOptimization(opt, remaining) {
  const parts = [];
  const travelSaved = opt.baselineTravel - opt.optimizedTravel;
  if (travelSaved > 1) parts.push(`${formatDuration(travelSaved)} of it is less driving`);
  if (opt.lateBefore > opt.lateAfter + 1) {
    parts.push(`it also stops ${formatDuration(opt.lateBefore - opt.lateAfter)} of arriving outside a property's time window`);
  }
  const back = findBacktracks(remaining, null, 0.6);
  if (back.length) {
    parts.push(`the current order doubles back at ${back[0].stop.address}`);
  } else if (opt.moved.length) {
    parts.push('the reordered stops form a shorter loop');
  }
  return parts.length ? capitalise(parts.join('; ')) + '.' : 'The reordered stops form a shorter loop.';
}

function capitalise(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/** A one-line, plain-language summary of what is known about a property's timing. */
export function describeTiming(model, property) {
  const s = statsFor(model, property.id);
  if (!s || s.samples === 0) {
    return { text: 'No timing history yet — using the day average.', confidence: 0 };
  }
  const lo = Math.round(s.low);
  const hi = Math.round(s.high);
  const base = lo === hi
    ? `Usually about ${lo} min`
    : `Usually ${lo}–${hi} min`;
  const from = `${s.samples} visit${s.samples === 1 ? '' : 's'}`;
  const trend = s.trend
    ? ` Trending ${s.trend.direction} by about ${formatDuration(Math.abs(s.trend.deltaMin))}.`
    : '';
  return {
    text: `${base}, from ${from}.${trend}`,
    confidence: s.confidence,
    minutes: s.minutes,
    low: s.low,
    high: s.high,
    trend: s.trend,
  };
}
