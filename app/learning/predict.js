/**
 * Service-time learning and day prediction.
 *
 * Two jobs:
 *   1. per-property expected service time, with an honest confidence
 *   2. a finish-time forecast for the rest of the day, as a range
 *
 * The governing rule is that the app never states more precision than the data
 * supports. A property seen once gets an estimate close to the day prior; a
 * property seen ten times consistently gets its own number and says so.
 */

import { haversineKm } from '../core/geo.js';
import {
  weightedMedian, weightedQuantile, weightedMAD, effectiveN,
  shrink, confidenceScore, recencyWeight, clamp,
} from './robust.js';
import {
  DEFAULT_TRAVEL_MODEL, travelMinutes, groupIntoSessions,
  samplesFromSession, fitTravelModel,
} from './derive.js';
import { daysBetween, dateKey } from '../core/time.js';

/** Used before any history exists. Matches the season median for this route. */
export const FALLBACK_SERVICE_MIN = 15;
/** Assumed dispersion for a property with no usable history. */
export const FALLBACK_SPREAD_MIN = 6;

/**
 * Builds the complete learning model from the event log.
 *
 * Deliberately a pure function of (properties, completion events): it can be
 * rebuilt from scratch at any time, so a corrupt cache is never load-bearing.
 */
export function buildLearningModel(properties, completions, opts = {}) {
  const today = opts.today || dateKey();
  // dayStarts: { [dateKey]: epochMs } — recorded when a route is started.
  const dayStarts = opts.dayStarts || {};
  const depot = opts.depot || null;
  const coords = new Map();
  for (const p of properties) {
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) coords.set(p.id, { lat: p.lat, lng: p.lng });
  }
  const coordOf = (id) => coords.get(id) || null;

  const sessionMap = groupIntoSessions(completions);
  const sessions = [...sessionMap.values()];

  // 1. Travel model first — service extraction depends on it.
  const travel = fitTravelModel(sessions, coordOf, opts.travel || DEFAULT_TRAVEL_MODEL);

  // 2. First pass with a flat prior, to get a usable prior for the batch split.
  const flatPrior = () => FALLBACK_SERVICE_MIN;
  const anchorFor = (session) => {
    const k = session[0]?.dateKey || dateKey(session[0]?.at);
    const at = dayStarts[k];
    return Number.isFinite(at) ? { at, coord: depot } : null;
  };
  let samples = [];
  for (const s of sessions) samples.push(...samplesFromSession(s, coordOf, flatPrior, travel, anchorFor(s)));

  // 3. Second pass using pass-one medians as the prior, so batched bursts are
  //    divided by how long each lawn actually tends to take rather than evenly.
  const pass1 = aggregate(samples, properties, today, FALLBACK_SERVICE_MIN);
  const prior1 = (id) => pass1.byProperty.get(id)?.minutes ?? pass1.global.minutes;
  samples = [];
  for (const s of sessions) samples.push(...samplesFromSession(s, coordOf, prior1, travel, anchorFor(s)));

  const agg = aggregate(samples, properties, today, pass1.global.minutes);
  return {
    travel,
    global: agg.global,
    byDay: agg.byDay,
    byProperty: agg.byProperty,
    sampleCount: samples.length,
    sessionCount: sessions.length,
    builtAt: Date.now(),
  };
}

function aggregate(samples, properties, today, fallbackMedian) {
  const byId = new Map();
  for (const s of samples) {
    let arr = byId.get(s.propertyId);
    if (!arr) byId.set(s.propertyId, (arr = []));
    arr.push(s);
  }

  const weigh = (s) => ({
    v: s.minutes,
    w: s.weight * recencyWeight(daysBetween(dateKey(s.at), today)),
    at: s.at,
  });

  const all = samples.map(weigh);
  const globalMedian = Number.isFinite(weightedMedian(all)) ? weightedMedian(all) : fallbackMedian;
  const globalSpread = Number.isFinite(weightedMAD(all, globalMedian)) ? weightedMAD(all, globalMedian) : FALLBACK_SPREAD_MIN;
  const global = {
    minutes: clamp(globalMedian, 5, 60),
    spread: clamp(globalSpread, 2, 25),
    nEff: effectiveN(all),
  };

  // Day-of-week priors: a Wednesday lawn on this route is not a Friday lawn.
  const byDay = new Map();
  const dayGroups = new Map();
  for (const p of properties) {
    const arr = byId.get(p.id);
    if (!arr) continue;
    let g = dayGroups.get(p.day);
    if (!g) dayGroups.set(p.day, (g = []));
    g.push(...arr.map(weigh));
  }
  for (const [day, arr] of dayGroups) {
    const m = weightedMedian(arr);
    byDay.set(day, {
      minutes: Number.isFinite(m) ? clamp(m, 5, 60) : global.minutes,
      spread: clamp(weightedMAD(arr, m) || global.spread, 2, 25),
      nEff: effectiveN(arr),
    });
  }

  const byProperty = new Map();
  for (const p of properties) {
    const raw = byId.get(p.id) || [];
    const w = raw.map(weigh).filter((s) => s.w > 0.01);
    const dayPrior = byDay.get(p.day) || global;
    if (!w.length) {
      byProperty.set(p.id, {
        minutes: dayPrior.minutes,
        spread: Math.max(dayPrior.spread, FALLBACK_SPREAD_MIN),
        nEff: 0, samples: 0, confidence: 0, basis: 'prior',
        recentMinutes: null, trend: null, low: null, high: null, lastServedAt: null,
      });
      continue;
    }
    const observed = weightedMedian(w);
    const nEff = effectiveN(w);
    const spread = clamp(weightedMAD(w, observed) || dayPrior.spread, 1.5, 25);
    const minutes = clamp(shrink(observed, dayPrior.minutes, nEff), 4, 90);
    const confidence = confidenceScore(nEff, spread, observed);

    // Trend: newest third against the rest, only when there is enough to say so.
    const sorted = [...w].sort((a, b) => a.at - b.at);
    let recentMinutes = null, trend = null;
    if (sorted.length >= 4) {
      const cut = Math.max(2, Math.round(sorted.length / 3));
      const recent = sorted.slice(-cut);
      const older = sorted.slice(0, -cut);
      recentMinutes = weightedMedian(recent);
      const olderMed = weightedMedian(older);
      if (Number.isFinite(recentMinutes) && Number.isFinite(olderMed)) {
        const delta = recentMinutes - olderMed;
        // Only call it a trend if it clears the noise floor.
        if (Math.abs(delta) > Math.max(2.5, spread * 0.75)) {
          trend = { direction: delta > 0 ? 'slower' : 'faster', deltaMin: delta };
        }
      }
    }

    byProperty.set(p.id, {
      minutes,
      spread,
      nEff,
      samples: w.length,
      confidence,
      basis: nEff >= 1.5 ? 'observed' : 'blended',
      recentMinutes,
      trend,
      low: clamp(weightedQuantile(w, 0.25), 3, 90),
      high: clamp(weightedQuantile(w, 0.75), 4, 120),
      lastServedAt: sorted[sorted.length - 1].at,
    });
  }
  return { global, byDay, byProperty };
}

/** Expected service minutes for a property, honouring a manual override. */
export function serviceMinutesFor(model, property) {
  if (Number.isFinite(property?.serviceOverrideMin)) return property.serviceOverrideMin;
  const s = model?.byProperty?.get(property.id);
  if (s) return s.minutes;
  return model?.global?.minutes ?? FALLBACK_SERVICE_MIN;
}

export function statsFor(model, propertyId) {
  return model?.byProperty?.get(propertyId) || null;
}

/**
 * Forecasts the rest of the day.
 *
 * Returns a median finish and a band. The band widens with the number of
 * low-confidence stops remaining, which is exactly the behaviour the operator
 * needs to see: a day full of never-before-timed lawns should *look* uncertain.
 */
export function forecastDay({ stops, startFrom, nowTs, model, returnToDepot = null }) {
  const travel = model?.travel || DEFAULT_TRAVEL_MODEL;
  let serviceMin = 0;
  let travelMin = 0;
  let varianceMin2 = 0;
  let unknownCount = 0;

  let cursor = startFrom || null;
  for (const p of stops) {
    const stat = model?.byProperty?.get(p.id);
    const svc = serviceMinutesFor(model, p);
    const sd = stat && stat.confidence > 0.15
      ? stat.spread
      : Math.max(FALLBACK_SPREAD_MIN, (model?.global?.spread ?? FALLBACK_SPREAD_MIN) * 1.35);
    if (!stat || stat.confidence < 0.25) unknownCount++;

    serviceMin += svc;
    varianceMin2 += sd * sd;

    const to = Number.isFinite(p.lat) ? { lat: p.lat, lng: p.lng } : null;
    if (cursor && to) {
      const km = haversineKm(cursor, to);
      travelMin += travelMinutes(travel, km);
      // Travel is itself uncertain; ~25% relative sd is consistent with the fit.
      const t = travelMinutes(travel, km);
      varianceMin2 += (t * 0.25) ** 2;
    } else {
      travelMin += travel.fixedMin + travel.perKmMin * 0.45;
      varianceMin2 += 9;
    }
    if (to) cursor = to;
  }

  if (returnToDepot && cursor) {
    travelMin += travelMinutes(travel, haversineKm(cursor, returnToDepot));
  }

  const totalMin = serviceMin + travelMin;
  const sd = Math.sqrt(varianceMin2);
  const base = nowTs ?? Date.now();
  return {
    stopCount: stops.length,
    serviceMin,
    travelMin,
    totalMin,
    sdMin: sd,
    unknownCount,
    finishTs: base + totalMin * 60000,
    lowTs: base + Math.max(0, totalMin - sd) * 60000,
    highTs: base + (totalMin + sd) * 60000,
    // A band wider than this is not a forecast, and saying so is more useful
    // than drawing a confident line through noise.
    reliable: stops.length === 0 || sd / Math.max(1, totalMin) < 0.45,
  };
}

/**
 * Pace against this route's own normal. Compares the time actually spent on
 * the stops already done today with what the model expected them to take.
 */
export function paceToday({ completed, model, dayStartTs, nowTs }) {
  if (!completed.length || !dayStartTs) return null;
  const expected = completed.reduce((t, p) => t + serviceMinutesFor(model, p), 0);
  const travel = model?.travel || DEFAULT_TRAVEL_MODEL;
  let km = 0;
  for (let i = 1; i < completed.length; i++) {
    const a = completed[i - 1], b = completed[i];
    if (Number.isFinite(a.lat) && Number.isFinite(b.lat)) km += haversineKm(a, b);
  }
  const expectedTotal = expected + completed.length * travel.fixedMin + km * travel.perKmMin;
  const actual = ((nowTs ?? Date.now()) - dayStartTs) / 60000;
  const deltaMin = expectedTotal - actual;   // positive = ahead
  return {
    expectedMin: expectedTotal,
    actualMin: actual,
    deltaMin,
    state: Math.abs(deltaMin) < 8 ? 'on-pace' : deltaMin > 0 ? 'ahead' : 'behind',
    perStopActual: actual / completed.length,
  };
}
