/**
 * The travel metric.
 *
 * Straight-line distance systematically understates driving on a real street
 * network, and it understates it *unevenly*: two houses 200 m apart across a
 * ravine are a five-minute drive, while 200 m along the same crescent is
 * thirty seconds. Rather than pretend, this module applies a detour factor
 * that grows for very short hops (where cul-de-sacs and one-ways dominate) and
 * settles toward a stable arterial ratio over longer legs.
 *
 * The parameters are not invented. The linear term was fitted by Theil–Sen
 * regression over 291 clean stop-to-stop transitions from 24 recorded work
 * days on this exact route.
 */

import { haversineKm, makeLocalProjection } from '../core/geo.js';
import { travelMinutes, DEFAULT_TRAVEL_MODEL } from '../learning/derive.js';

/**
 * Detour factor: road distance / straight-line distance.
 * ~1.55 for sub-200 m hops within a subdivision, easing to ~1.25 on longer runs.
 */
export function detourFactor(km) {
  if (!(km > 0)) return 1;
  return 1.25 + 0.30 * Math.exp(-km / 0.55);
}

export function roadKm(a, b) {
  const d = haversineKm(a, b);
  return d * detourFactor(d);
}

/**
 * Precomputes the symmetric travel-time matrix for a set of nodes.
 *
 * Node 0 is the origin (current position, or the depot). Nodes 1..n are stops.
 * A stop with no coordinate is not a routing failure — it is a stop that
 * cannot be optimised, and it is given the median leg cost so that including
 * it neither attracts nor repels the solver.
 */
export function buildMatrix(nodes, model = DEFAULT_TRAVEL_MODEL) {
  const n = nodes.length;
  const proj = makeLocalProjection(nodes.find((p) => Number.isFinite(p?.lat))?.lat ?? 44.39);
  const xy = nodes.map((p) =>
    Number.isFinite(p?.lat) && Number.isFinite(p?.lng) ? proj.toMetres(p) : null
  );
  const time = new Float32Array(n * n);
  const dist = new Float32Array(n * n);
  const known = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = xy[i], b = xy[j];
      let km;
      if (a && b) {
        const dx = a.x - b.x, dy = a.y - b.y;
        km = Math.sqrt(dx * dx + dy * dy) / 1000;
        km *= detourFactor(km);
        known.push(km);
      } else {
        km = NaN;
      }
      dist[i * n + j] = dist[j * n + i] = km;
    }
  }

  // Fill unknowns with the median known leg so they are cost-neutral.
  known.sort((a, b) => a - b);
  const fallbackKm = known.length ? known[known.length >> 1] : 0.5;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) { time[i * n + j] = 0; continue; }
      let km = dist[i * n + j];
      if (!Number.isFinite(km)) { km = fallbackKm; dist[i * n + j] = km; }
      time[i * n + j] = travelMinutes(model, km);
    }
  }
  return { n, time, dist, fallbackKm };
}

/**
 * Detects tight clusters in the remaining route — consecutive stops all within
 * a short walk/drive of each other. Used to tell the operator when the next
 * stretch is dense, which changes how they stage the truck.
 */
export function findClusters(stops, thresholdKm = 0.35, minSize = 3) {
  const out = [];
  let run = [];
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    if (!Number.isFinite(s.lat)) { if (run.length >= minSize) out.push(run); run = []; continue; }
    if (!run.length) { run = [s]; continue; }
    const prev = run[run.length - 1];
    if (haversineKm(prev, s) <= thresholdKm) run.push(s);
    else { if (run.length >= minSize) out.push(run); run = [s]; }
  }
  if (run.length >= minSize) out.push(run);
  return out;
}

/**
 * Finds legs that double back — a leg substantially longer than the direct
 * path from its predecessor to its successor. These are the "why am I driving
 * past this street twice" moments, and naming them is more useful than a bare
 * "reorder available" prompt.
 */
export function findBacktracks(orderedStops, origin, minExcessKm = 0.8) {
  const pts = [origin, ...orderedStops].filter((p) => p && Number.isFinite(p.lat));
  const out = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const via = roadKm(pts[i - 1], pts[i]) + roadKm(pts[i], pts[i + 1]);
    const direct = roadKm(pts[i - 1], pts[i + 1]);
    const excess = via - direct;
    if (excess >= minExcessKm) out.push({ stop: pts[i], excessKm: excess, index: i - 1 });
  }
  out.sort((a, b) => b.excessKm - a.excessKm);
  return out;
}
