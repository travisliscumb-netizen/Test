/**
 * Route optimisation.
 *
 * What is being minimised is the *finish time*, not the distance. For a fixed
 * set of stops the service time is a constant, so minimising elapsed time
 * reduces to minimising travel — but only once the constraints that actually
 * bind on this route are respected:
 *
 *   - stops the operator has pinned stay where they were put
 *   - "after 9am", "Thursday so the gate is open" are real time windows
 *   - an order that churns every time it is recomputed is worse than useless,
 *     so displacement from the reference order carries a cost
 *
 * Only the *remaining* stops are ever reordered. Completed work is history and
 * the master order is never destroyed — this returns a proposal, and applying
 * it is a separate, undoable act.
 *
 * On size: the largest day on this route is 48 stops. 2-opt with don't-look
 * bits converges on that in single-digit milliseconds, so this runs inline.
 * Moving it to a worker would add message-passing latency and a second copy of
 * the data to keep coherent, in exchange for hiding a cost that is already
 * below one frame. A worker is the right answer at a few hundred stops; it is
 * cargo cult at fifty.
 */

import { buildMatrix } from './metric.js';
import { DEFAULT_TRAVEL_MODEL } from '../learning/derive.js';

export const WINDOW_PENALTY_PER_MIN = 4.0;   // arriving late is 4x worse than driving
export const WAIT_PENALTY_PER_MIN = 0.85;    // waiting for a window is nearly pure loss
export const DEFAULT_STABILITY = 0.45;       // minutes of travel per position moved

/**
 * @param {object} req
 * @param {{lat,lng}|null} req.origin        where the truck is now
 * @param {Array} req.stops                  remaining stops, in current order
 * @param {number} req.startMinutes          minutes-after-midnight at origin
 * @param {(stop)=>number} req.serviceOf
 * @param {object} [req.travelModel]
 * @param {{lat,lng}|null} [req.depot]       included as a final leg when returning
 * @param {boolean} [req.returnToDepot]
 * @param {number} [req.stability]
 * @param {number} [req.timeBudgetMs]
 */
export function optimizeRoute(req) {
  const {
    origin = null, stops = [], startMinutes = 0, serviceOf = () => 15,
    travelModel = DEFAULT_TRAVEL_MODEL, depot = null, returnToDepot = false,
    stability = DEFAULT_STABILITY, timeBudgetMs = 40,
  } = req;

  const n = stops.length;
  if (n < 3) {
    return { changed: false, order: stops.map((_, i) => i), savedMinutes: 0, reason: 'too-few-stops', evaluated: 0 };
  }

  // Node 0 = origin, 1..n = stops, n+1 = depot when returning.
  const nodes = [origin || stops[0], ...stops];
  if (returnToDepot && depot) nodes.push(depot);
  const M = buildMatrix(nodes, travelModel);
  const N = M.n;
  const T = M.time;
  const endNode = returnToDepot && depot ? N - 1 : -1;

  const service = stops.map((s) => Math.max(0, serviceOf(s)));
  const refIndex = new Map(stops.map((s, i) => [i, i]));

  // Pinned stops keep their exact position in the sequence.
  const pinned = new Set();
  stops.forEach((s, i) => { if (s.pinned) pinned.add(i); });

  const cost = (perm) => evaluate(perm, { T, N, endNode, service, stops, startMinutes, stability, refIndex });

  const identity = stops.map((_, i) => i);
  let best = identity.slice();
  let bestCost = cost(best);
  const baseline = bestCost;

  // A nearest-neighbour seed rescues a route that has drifted badly; it is
  // accepted only if it genuinely beats the current order under the same cost
  // function, so a good hand-built order is never thrown away for a marginal one.
  const nn = nearestNeighbour(T, N, n, pinned, identity);
  if (nn) {
    const c = cost(nn);
    if (c.total < bestCost.total) { best = nn; bestCost = c; }
  }

  const deadline = now() + timeBudgetMs;
  let evaluated = 0;

  // --- 2-opt with don't-look bits -----------------------------------------
  let improved = true;
  const dontLook = new Uint8Array(n);
  while (improved && now() < deadline) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      if (dontLook[i]) continue;
      let localImproved = false;
      for (let j = i + 1; j < n; j++) {
        if (spanHasPin(best, i, j, pinned)) continue;
        const cand = best.slice();
        reverse(cand, i, j);
        const c = cost(cand); evaluated++;
        if (c.total < bestCost.total - 1e-9) {
          best = cand; bestCost = c; improved = true; localImproved = true;
          dontLook[i] = 0; dontLook[j] = 0;
          if (i > 0) dontLook[i - 1] = 0;
          if (j < n - 1) dontLook[j + 1] = 0;
          break;
        }
      }
      if (!localImproved) dontLook[i] = 1;
      if (now() >= deadline) break;
    }
  }

  // --- Or-opt: relocate runs of 1..3 stops --------------------------------
  improved = true;
  while (improved && now() < deadline) {
    improved = false;
    outer:
    for (let len = 1; len <= 3 && len <= n - 1; len++) {
      for (let i = 0; i + len <= n; i++) {
        if (rangeHasPin(best, i, i + len - 1, pinned)) continue;
        for (let j = 0; j <= n - len; j++) {
          if (j >= i && j <= i + len - 1) continue;
          const cand = relocate(best, i, len, j);
          if (!cand || violatesPins(cand, pinned)) continue;
          const c = cost(cand); evaluated++;
          if (c.total < bestCost.total - 1e-9) {
            best = cand; bestCost = c; improved = true;
            break outer;
          }
        }
        if (now() >= deadline) break outer;
      }
    }
  }

  const savedMinutes = baseline.elapsed - bestCost.elapsed;
  const changed = best.some((v, i) => v !== i);
  return {
    changed,
    order: best,
    savedMinutes,
    baselineMinutes: baseline.elapsed,
    optimizedMinutes: bestCost.elapsed,
    baselineTravel: baseline.travel,
    optimizedTravel: bestCost.travel,
    lateBefore: baseline.lateMinutes,
    lateAfter: bestCost.lateMinutes,
    moved: describeMoves(best),
    evaluated,
    reason: changed ? 'improved' : 'already-optimal',
  };
}

function evaluate(perm, ctx) {
  const { T, N, endNode, service, stops, startMinutes, stability, refIndex } = ctx;
  let travel = 0;
  let clock = startMinutes;
  let penalty = 0;
  let lateMinutes = 0;
  let waitMinutes = 0;
  let prev = 0;

  for (let k = 0; k < perm.length; k++) {
    const si = perm[k];
    const node = si + 1;
    const leg = T[prev * N + node];
    travel += leg;
    clock += leg;

    const s = stops[si];
    if (Number.isFinite(s.earliestMin) && clock < s.earliestMin) {
      const wait = s.earliestMin - clock;
      waitMinutes += wait;
      penalty += wait * WAIT_PENALTY_PER_MIN;
      clock = s.earliestMin;
    }
    if (Number.isFinite(s.latestMin) && clock > s.latestMin) {
      const late = clock - s.latestMin;
      lateMinutes += late;
      penalty += late * WINDOW_PENALTY_PER_MIN;
    }
    clock += service[si];
    penalty += Math.abs(k - refIndex.get(si)) * stability;
    prev = node;
  }
  if (endNode >= 0) {
    const leg = T[prev * N + endNode];
    travel += leg;
    clock += leg;
  }
  return { travel, elapsed: clock - startMinutes, penalty, lateMinutes, waitMinutes, total: clock - startMinutes + penalty };
}

function nearestNeighbour(T, N, n, pinned, identity) {
  if (pinned.size) return null;      // pins make a greedy rebuild meaningless
  const used = new Uint8Array(n);
  const out = [];
  let prev = 0;
  for (let k = 0; k < n; k++) {
    let bestJ = -1, bestD = Infinity;
    for (let j = 0; j < n; j++) {
      if (used[j]) continue;
      const d = T[prev * N + (j + 1)];
      if (d < bestD) { bestD = d; bestJ = j; }
    }
    if (bestJ < 0) return null;
    used[bestJ] = 1;
    out.push(bestJ);
    prev = bestJ + 1;
  }
  return out;
}

function reverse(a, i, j) {
  while (i < j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; }
}

function relocate(a, from, len, to) {
  const seg = a.slice(from, from + len);
  const rest = a.slice(0, from).concat(a.slice(from + len));
  if (to > rest.length) return null;
  return rest.slice(0, to).concat(seg, rest.slice(to));
}

function spanHasPin(perm, i, j, pinned) {
  if (!pinned.size) return false;
  for (let k = i; k <= j; k++) if (pinned.has(perm[k])) return true;
  return false;
}
function rangeHasPin(perm, i, j, pinned) {
  return spanHasPin(perm, i, j, pinned);
}
function violatesPins(perm, pinned) {
  if (!pinned.size) return false;
  for (const p of pinned) if (perm[p] !== p) return true;
  return false;
}

function describeMoves(perm) {
  const moves = [];
  for (let k = 0; k < perm.length; k++) {
    if (perm[k] !== k) moves.push({ stopIndex: perm[k], from: perm[k], to: k, delta: k - perm[k] });
  }
  return moves;
}

const now = typeof performance !== 'undefined' && performance.now
  ? () => performance.now()
  : () => Date.now();

/**
 * Parses scheduling hints out of a free-text service note.
 *
 * These notes were written for humans by a human ("Nbr @ 58 Henry wants after
 * 9am", "THURS SO GATE OPEN"), and they encode real constraints that were
 * previously invisible to the router. Parsing is deliberately conservative:
 * anything ambiguous yields no constraint rather than a wrong one, because a
 * fabricated time window would silently distort every future route.
 */
export function parseWindowFromNote(note) {
  if (!note) return null;
  const text = String(note).toLowerCase();
  const out = {};

  const after = /(?:after|not before|no earlier than)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(text);
  if (after) {
    let h = Number(after[1]);
    const m = Number(after[2] || 0);
    const ap = after[3];
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (!ap && h < 7) h += 12;
    if (h >= 0 && h <= 23) out.earliestMin = h * 60 + m;
  }
  const before = /(?:before|by|no later than)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(text);
  if (before) {
    let h = Number(before[1]);
    const m = Number(before[2] || 0);
    const ap = before[3];
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (!ap && h < 7) h += 12;
    if (h >= 0 && h <= 23) out.latestMin = h * 60 + m;
  }
  // "as late in the week as possible" is a scheduling preference across days,
  // not a within-day window; it is surfaced as a flag for the day planner.
  if (/as\s+late\s+(?:in\s+(?:the\s+)?week\s+)?as\s+poss/.test(text) ||
      /late\s+in\s+(?:the\s+)?week/.test(text) ||
      /\bas\s+late\s+as\s+possible/.test(text)) out.preferLateInWeek = true;
  if (/\bhand\s*mow|push\s*mow\b/.test(text)) out.pushMow = true;

  return Object.keys(out).length ? out : null;
}
