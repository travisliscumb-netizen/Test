// Full-shift simulator. SYNTHETIC — it measures the engine against a model of
// a night, not against reality. Real-world performance needs field data.
//
//   node --experimental-strip-types tools/simulate.mjs [nights=8] [seed=1] [sweep=consistent|random]
//
// Runs the real modules (graph, GPS filter, copilot, event log, ETA, plow
// model, optimizer) over the real route geometry (private/route.json) and
// scores them against ground truth the simulator knows and the app does not.
//
// Modelled: tractor speed and per-driveway service times (log-normal, with a
// per-driveway "true" median the app must learn); GPS noise, multipath jumps
// and dropouts; working up and down each real driveway polygon; forgotten
// Done taps (drive off, or start the next driveway); 2 % blocked driveways
// retried at the end; City plow sweeps over residential streets, with later
// SALT passes that overwrite LASTSERVICED (the feed never says which); app
// restarts (event log replayed shuffled and duplicated).

import fs from 'node:fs';
import path from 'node:path';
import { buildGraph, locate, distanceMatrix, path as netPath, areaAround } from '../src/core/graph.ts';
import { GpsFilter } from '../src/core/kalman.ts';
import { Copilot } from '../src/copilot/copilot.ts';
import { reduce, nextStop, upcoming, eventId } from '../src/data/events.ts';
import { priorServiceMin, deriveSamples, learnedServiceMin, paceFactor, forecast, DEFAULT_ETA, MEAN_FACTOR } from '../src/routing/eta.ts';
import { optimizeBlocks, blocksOf } from '../src/routing/optimize.ts';
import { segmentIntel, reworkPenalty, windrowRisk, segmentOperations, plowingOps } from '../src/intel/model.ts';
import { dist, pointAlong, lineLength, toXY, toLngLat } from '../src/core/geo.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const NIGHTS = Number(process.argv[2] ?? 8);
const SEED = Number(process.argv[3] ?? 1);
const SWEEP = process.argv[4] ?? 'consistent';
let seed = SEED;
const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const logn = (median, sigma) => median * Math.exp(sigma * gauss());

const route = JSON.parse(fs.readFileSync(path.join(ROOT, 'private/route.json'), 'utf8'));
const roads = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/roads.json'), 'utf8'));
const stops = route.stops;
const n = stops.length;
const ORDER = stops.map((s) => s.seq);
const g = buildGraph(roads.segments, areaAround(stops.map((s) => s.stopPoint), 1500));
const locs = stops.map((s) => locate(g, s.stopPoint, s.approachRoadId));
const M = distanceMatrix(g, locs);
const segClass = new Map(roads.segments.map((s) => [s.id, s.plowClass]));
const routeSegs = [...new Set(stops.map((s) => s.approachRoadId))];
const resSegs = routeSegs.filter((s) => segClass.get(s) === 'R');
const zones = stops.map((s) => [s.parcel, ...s.driveways.map((d) => d.polygon)].filter((r) => r && r.length >= 3));
const cstop = (q) => ({ seq: q, stopPoint: stops[q - 1].stopPoint, target: stops[q - 1].target, zone: zones[q - 1] });

// Ground truth the app must learn.
const trueMedian = stops.map((s) => priorServiceMin(s.flags) * logn(1, 0.35));
// The City's "habitual" residential order (consistent regime): a fixed
// permutation with per-segment habitual offsets from the sweep start.
const habitual = resSegs.slice().sort(() => rnd() - 0.5);
const habitualOffset = new Map();
{
  let t = 0;
  for (const s of habitual) {
    t += (2 + rnd() * 5) * 60_000;
    habitualOffset.set(s, t);
  }
}

const pct = (xs, q) => {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * q)))] : NaN;
};

/** City activity for one night: plow passes (truth) and what the feed shows. */
function cityNight(T0) {
  const plowNight = rnd() > 0.25;
  const plow = new Map();
  const feed = new Map(); // what LASTSERVICED shows: latest of plow/salt
  const events = [];
  // Priority/secondary approach streets: serviced before and through the night.
  for (const s of routeSegs) if (segClass.get(s) !== 'R') {
    const t = T0 - (0.5 + rnd() * 2) * 3600_000;
    feed.set(s, t);
    events.push({ seg: s, t });
  }
  if (plowNight) {
    const start = T0 + (0.5 + rnd() * 3) * 3600_000;
    if (SWEEP === 'consistent') {
      for (const s of resSegs) plow.set(s, start + habitualOffset.get(s) * logn(1, 0.12) + gauss() * 4 * 60_000);
    } else {
      let t = start;
      for (const s of resSegs.slice().sort(() => rnd() - 0.5)) plow.set(s, (t += (2 + rnd() * 5) * 60_000));
    }
  }
  for (const s of resSegs) {
    let last = plow.get(s) ?? null;
    if (last !== null) events.push({ seg: s, t: last });
    // Salt pass: 40 % of residential segments, 1–3 h after the plow (or alone on salt nights).
    if (rnd() < 0.4) {
      const salt = (last ?? T0 + rnd() * 6 * 3600_000) + (1 + rnd() * 2) * 3600_000;
      events.push({ seg: s, t: salt });
      last = Math.max(last ?? 0, salt);
    }
    if (last !== null) feed.set(s, last);
  }
  return { plowNight, plow, feed, events };
}

function night(k, learned, history) {
  const T0 = Date.UTC(2026, 11, 1 + k, 4, 0, 0); // 23:00 EST
  const speed = 3.3 * logn(1, 0.08);
  const city = cityNight(T0);
  const gps = new GpsFilter();
  const cop = new Copilot();
  const events = [];
  const shift = `SIM-${k}`;
  const truth = { forgot: new Map(), blocked: new Set() };
  const m = { arrivedTrue: 0, fixes: 0, gpsPaused: 0 };
  const cueLog = [];
  const etaChecks = [];
  let t = T0;
  const commit = (input, at) => events.push({ ...input, id: eventId(at), t: at, shift });

  function fix(p, at, moving) {
    if (rnd() < 0.02) return; // dropout
    const acc = moving ? 5 + rnd() * 6 : 7 + rnd() * 10;
    let [x, y] = toXY(p);
    x += gauss() * acc * 0.7;
    y += gauss() * acc * 0.7;
    if (rnd() < 0.03) {
      x += (rnd() - 0.5) * 220;
      y += (rnd() - 0.5) * 220;
    }
    const q = toLngLat([x, y]);
    const tr = gps.update({ lng: q[0], lat: q[1], accuracy: acc, t: at });
    m.fixes++;
    const st = reduce(ORDER, events);
    const ns = nextStop(st);
    const fol = upcoming(st, 1)[0];
    const r = cop.update(tr, ns !== null ? cstop(ns) : null, [], at, fol !== undefined ? cstop(fol) : null);
    if (!r.view.gpsUsable) m.gpsPaused++;
    for (const c of r.cues) cueLog.push({ ...c, at });
  }
  const drive = (from, to) => {
    const p = netPath(g, locs[from - 1], locs[to - 1]);
    const L = lineLength(p.coords);
    const secs = Math.max(1, Math.round(L / speed));
    for (let s = 1; s <= secs; s++) fix(pointAlong(p.coords, (L * s) / secs), t + s * 1000, true);
    t += secs * 1000;
  };
  const work = (seq, minutes) => {
    // Up and down the primary driveway (or around the entrance without one).
    const st = stops[seq - 1];
    const dw = st.driveways[0];
    let axis = [st.target, st.target];
    if (dw) {
      const far = dw.polygon.reduce((a, b) => (dist(b, dw.entrance) > dist(a, dw.entrance) ? b : a), dw.entrance);
      axis = [dw.entrance, far];
    }
    const L = Math.max(4, dist(axis[0], axis[1]));
    const secs = Math.round(minutes * 60);
    for (let s = 0; s < secs; s++) {
      const phase = (s * 1.8) / L; // ~1.8 m/s blower passes
      const f = Math.abs(((phase % 2) + 2) % 2 - 1); // 0..1..0
      const p = pointAlong(axis, (1 - f) * L * 0.9);
      fix(p, t + s * 1000, s % 30 > 3);
    }
    t += secs * 1000;
  };

  let prev = null;
  for (let i = 0; i < n; i++) {
    const seq = i + 1;
    if (prev !== null) drive(prev, seq);
    if ([16, 40, 81, 121, 146].includes(seq)) {
      const st = reduce(ORDER, events);
      const rem = [...ORDER.filter((s) => st.stops.get(s).status === 'pending'), ...ORDER.filter((s) => st.stops.get(s).status === 'blocked')];
      const done = [...st.stops.entries()].filter(([, v]) => v.status === 'done').map(([stop, v]) => ({ stop, t: v.at })).sort((a, b) => a.t - b.t);
      const svcOf = (s) => learned.get(s)?.mean ?? priorServiceMin(stops[s - 1].flags) * MEAN_FACTOR;
      const completed = [];
      for (let j = 1; j < done.length; j++) {
        const actual = (done[j].t - done[j - 1].t) / 60_000;
        if (actual <= 25) completed.push({ predicted: M[(done[j - 1].stop - 1) * n + done[j].stop - 1] / DEFAULT_ETA.metresPerMin + svcOf(done[j].stop), actual });
      }
      const legs = rem.map((s, j) => (j === 0 ? 0 : M[(rem[j - 1] - 1) * n + s - 1]));
      const learnedShare = rem.filter((s) => (learned.get(s)?.n ?? 0) > 0).length / Math.max(1, rem.length);
      etaChecks.push({ seq, fc: forecast(t, rem.map(svcOf), legs, DEFAULT_ETA.metresPerMin, paceFactor({ completed }), learnedShare) });
    }
    if (rnd() < 0.02) {
      truth.blocked.add(seq);
      commit({ type: 'blocked', stop: seq, reason: 'vehicle' }, t + 20_000);
      t += 30_000;
      prev = seq;
      continue;
    }
    m.arrivedTrue++;
    work(seq, trueMedian[i] * logn(1, 0.25));
    const plowed = city.plow.has(stops[i].approachRoadId) ? city.plow.get(stops[i].approachRoadId) <= t : segClass.get(stops[i].approachRoadId) !== 'R';
    const obs = rnd() < 0.85 ? (plowed ? 'plowed' : 'unplowed') : rnd() < 0.5 ? 'unsure' : null;
    if (rnd() < 0.06 && i < n - 1) {
      // Forgot to tap. 60 %: starts the next driveway; 40 %: drives off.
      const mode = rnd() < 0.6 ? 'at-next' : 'drove-away';
      truth.forgot.set(seq, mode);
      if (mode === 'at-next') {
        drive(seq, seq + 1);
        work(seq + 1, 0.8);
      } else {
        const L2 = 140;
        const away = netPath(g, locs[i], locs[Math.min(n - 1, i + 8)]).coords;
        for (let s = 1; s <= 45; s++) fix(pointAlong(away, Math.min(lineLength(away), s * speed)), t + s * 1000, true);
        t += 45_000;
        void L2;
      }
    }
    commit({ type: 'done', stop: seq, street: obs, roadId: stops[i].approachRoadId, pos: null, acc: null }, t);
    prev = seq;
  }
  for (const seq of truth.blocked) {
    drive(prev, seq);
    work(seq, trueMedian[seq - 1]);
    commit({ type: 'done', stop: seq, street: null, roadId: stops[seq - 1].approachRoadId, pos: null, acc: null }, t);
    prev = seq;
  }
  const finish = t;
  const final = reduce(ORDER, events);

  // Copilot scoring
  const leaving = cueLog.filter((c) => c.kind === 'leaving-undone');
  const cop_ = {
    approach: new Set(cueLog.filter((c) => c.kind === 'approach').map((c) => c.seq)).size,
    arrived: new Set(cueLog.filter((c) => c.kind === 'arrived').map((c) => c.seq)).size,
    forgot: truth.forgot.size,
    caught: [...truth.forgot.keys()].filter((s) => leaving.some((c) => c.seq === s)).length,
    falsePrompts: leaving.filter((c) => !truth.forgot.has(c.seq)).length,
    autoCompleted: events.filter((e) => e.type === 'done').length - n,
  };
  const restartIdentical = JSON.stringify([...reduce(ORDER, [...events, ...events.slice(0, 25)].sort(() => rnd() - 0.5)).stops]) === JSON.stringify([...final.stops]);

  // Windrow watch: app sees FEED times (plow or salt); truth is the plow time.
  let wTrue = 0;
  let wFlag = 0;
  let wHit = 0;
  for (const [seq, v] of final.stops) {
    const seg = stops[seq - 1].approachRoadId;
    const real = city.plow.has(seg) && city.plow.get(seg) > v.at;
    const r = windrowRisk(seq, seg, v.at, city.feed.get(seg) ?? null, v.street, segClass.get(seg));
    const flagged = !!r && r.level !== 'unlikely';
    wTrue += real ? 1 : 0;
    wFlag += flagged ? 1 : 0;
    wHit += real && flagged ? 1 : 0;
  }

  // Order comparison: Ted's order vs a block plan made at T0 from history
  // (no live knowledge of tonight's plows yet).
  const svcExp = (s) => learned.get(s)?.mean ?? priorServiceMin(stops[s - 1].flags) * MEAN_FACTOR;
  const runOrder = (order) => {
    let tt = T0;
    let pv = null;
    let re = 0;
    for (const s of order) {
      tt += (pv === null ? 0 : (M[(pv - 1) * n + s - 1] / speed) * 1000) + trueMedian[s - 1] * 60_000;
      const p = city.plow.get(stops[s - 1].approachRoadId);
      if (p !== undefined && p > tt) re++;
      pv = s;
    }
    return { re, hours: (tt - T0) / 3600_000 };
  };
  const ops = plowingOps(segmentOperations(history), resSegs, 0.5);
  // Planning assumes an operation starting ~1.5 h in (the median start of
  // previous plow operations relative to the shift, learned the same way).
  const relStarts = ops.map((o) => o.start - Math.floor((o.start - Date.UTC(2026, 11, 1, 4)) / 86_400_000) * 86_400_000 - Date.UTC(2026, 11, 1, 4));
  const opStart = T0 + (relStarts.length ? pct(relStarts, 0.5) : 1.5 * 3600_000);
  const intel = new Map(routeSegs.map((s) => [s, segmentIntel(s, null, null, { now: T0, opStart, plowClass: (x) => segClass.get(x), history: ops })]));
  const idx = ORDER.map((s) => s - 1);
  const inp = {
    matrix: M, n, order: idx, fromHere: Array.from({ length: n }, (_, j) => M[j]),
    serviceMin: stops.map((s) => svcExp(s.seq)), metresPerMin: speed * 60, startMs: T0,
    penalty: (j, at) => reworkPenalty(stops[j].approachRoadId, at, { intel, reworkMin: 4, horizon: T0 + 12 * 3600_000, opActive: true }),
    stability: 1.5, baseOrder: idx,
  };
  const plan = optimizeBlocks(inp, blocksOf(idx, (j) => stops[j].street));
  const base = runOrder(ORDER);
  const planned = runOrder(plan.order.map((j) => j + 1));
  // Live re-plan: Ted's order until the City's residential sweep is SEEN
  // starting (first residential service in the feed), then a block plan of
  // the remaining stops anchored on that observed start.
  let live = base;
  let liveMoved = 0;
  if (city.plowNight && ops.length >= 3) {
    const seen = Math.min(...[...city.plow.values()]);
    let tt = T0;
    let pv = null;
    const doneBefore = [];
    for (const s of ORDER) {
      const next = tt + (pv === null ? 0 : (M[(pv - 1) * n + s - 1] / speed) * 1000) + trueMedian[s - 1] * 60_000;
      if (next > seen) break;
      tt = next;
      pv = s;
      doneBefore.push(s);
    }
    const remIdx = ORDER.filter((s) => !doneBefore.includes(s)).map((s) => s - 1);
    const intelLive = new Map(routeSegs.map((sg) => [sg, segmentIntel(sg, null, null, { now: seen, opStart: seen, plowClass: (x) => segClass.get(x), history: ops })]));
    const inpLive = { ...inp, order: remIdx, baseOrder: remIdx, startMs: tt, fromHere: Array.from({ length: n }, (_, j) => (pv === null ? 0 : M[(pv - 1) * n + j])), penalty: (j, at) => reworkPenalty(stops[j].approachRoadId, at, { intel: intelLive, reworkMin: 4, horizon: T0 + 12 * 3600_000, opActive: true }) };
    const lp = optimizeBlocks(inpLive, blocksOf(remIdx, (j) => stops[j].street));
    liveMoved = lp.order.filter((v, j) => v !== remIdx[j]).length;
    live = runOrder([...doneBefore, ...lp.order.map((j) => j + 1)]);
  }
  const hist = [...intel.values()].filter((x) => x.basis === 'historical').length;

  return {
    plowNight: city.plowNight, hours: (finish - T0) / 3600_000, cop: cop_, restartIdentical, gpsPaused: m.gpsPaused,
    eta: etaChecks.map((c) => ({ seq: c.seq, err: (c.fc.finishMs - finish) / 60_000, inRange: finish >= c.fc.earlyMs && finish <= c.fc.lateMs })),
    windrow: { wTrue, wFlag, wHit },
    order: { base: base.re, plan: planned.re, baseH: base.hours, planH: planned.hours, moved: plan.order.filter((v, j) => v !== idx[j]).length, histSegs: hist, opsKnown: ops.length, live: live.re, liveH: live.hours, liveMoved },
    completions: [...final.stops.entries()].filter(([, v]) => v.status === 'done').map(([stop, v]) => ({ stop, t: v.at })).sort((a, b) => a.t - b.t),
    cityEvents: city.events,
  };
}

// ------------------------------------------------------------------ run
const learned = new Map();
const samples = new Map();
const history = [];
const res = [];
for (let k = 0; k < NIGHTS; k++) {
  const r = night(k, learned, history);
  res.push(r);
  history.push(...r.cityEvents);
  for (const s of deriveSamples(r.completions, (a, b) => M[(a - 1) * n + b - 1], DEFAULT_ETA.metresPerMin)) samples.set(s.stop, [...(samples.get(s.stop) ?? []), s.minutes]);
  for (const s of stops) learned.set(s.seq, learnedServiceMin(priorServiceMin(s.flags), samples.get(s.seq) ?? [], DEFAULT_ETA.priorWeight));
}

const L = [];
const out = (s = '') => {
  L.push(s);
  console.log(s);
};
out(`# Simulation report (SYNTHETIC) — ${NIGHTS} nights, seed ${SEED}, City sweep: ${SWEEP}`);
out();
out('Every figure below is a model of a night run through the real engine code. It shows the engine behaves as designed under the modelled conditions. It is not field evidence.');
out();
out('## Copilot and persistence');
out();
out('| Night | City | Hours | Approach cues | Arrivals detected | Forgot Done | Caught | False prompts | Auto-completions | Restart identical |');
out('|---|---|---|---|---|---|---|---|---|---|');
res.forEach((r, k) => out(`| ${k + 1} | ${r.plowNight ? 'plowed' : 'salt only'} | ${r.hours.toFixed(2)} | ${r.cop.approach}/${n} | ${r.cop.arrived}/${n - 0} | ${r.cop.forgot} | ${r.cop.caught} | ${r.cop.falsePrompts} | ${r.cop.autoCompleted} | ${r.restartIdentical ? 'yes' : 'NO'} |`));
const tot = res.reduce((a, r) => ({ f: a.f + r.cop.forgot, c: a.c + r.cop.caught, fp: a.fp + r.cop.falsePrompts }), { f: 0, c: 0, fp: 0 });
out();
out(`Forgotten taps caught: ${tot.c}/${tot.f} (${((100 * tot.c) / Math.max(1, tot.f)).toFixed(0)} %). False "mark it done?" prompts: ${tot.fp} in ${NIGHTS * n} driveways.`);
out();
out('## Finish-time prediction (minutes, predicted − actual)');
out();
out('| Night | stop 16 | 40 | 81 | 121 | 146 | actual inside 80 % range |');
out('|---|---|---|---|---|---|---|');
res.forEach((r, k) => out(`| ${k + 1} | ${r.eta.map((e) => e.err.toFixed(0)).join(' | ')} | ${r.eta.filter((e) => e.inRange).length}/${r.eta.length} |`));
const absN = (r) => pct(r.eta.map((e) => Math.abs(e.err)), 0.5);
const inR = res.flatMap((r) => r.eta).filter((e) => e.inRange).length / res.flatMap((r) => r.eta).length;
out();
out(`Median absolute error: night 1 ${absN(res[0]).toFixed(0)} min, night ${NIGHTS} ${absN(res[NIGHTS - 1]).toFixed(0)} min. Range coverage overall: ${(100 * inR).toFixed(0)} % (target 80 %).`);
out();
out('## Windrow watch (the feed shows plow OR salt; truth is the plow pass)');
out();
const w = res.reduce((a, r) => ({ t: a.t + r.windrow.wTrue, f: a.f + r.windrow.wFlag, h: a.h + r.windrow.wHit }), { t: 0, f: 0, h: 0 });
out(`Real windrows: ${w.t}. Flagged: ${w.f}. Caught: ${w.h}. Recall ${((100 * w.h) / Math.max(1, w.t)).toFixed(0)} %, precision ${((100 * w.h) / Math.max(1, w.f)).toFixed(0)} %.`);
out();
out("## Ted's order vs street-block plan made at shift start from recorded history");
out();
out('| Night | City | Storms on record | Streets with timing | Original re-clears | Plan@start re-clears | Live re-plan re-clears | Original h | Live h | Moved (live) |');
out('|---|---|---|---|---|---|---|---|---|---|');
res.forEach((r, k) => out(`| ${k + 1} | ${r.plowNight ? 'plowed' : 'salt only'} | ${r.order.opsKnown} | ${r.order.histSegs} | ${r.order.base} | ${r.order.plan} | ${r.order.live} | ${r.order.baseH.toFixed(2)} | ${r.order.liveH.toFixed(2)} | ${r.order.liveMoved} |`));
const late = res.filter((r) => r.order.opsKnown >= 3 && r.plowNight);
if (late.length) {
  const b = late.reduce((a, r) => a + r.order.base, 0);
  const p = late.reduce((a, r) => a + r.order.plan, 0);
  out();
  const lv = late.reduce((a, r) => a + r.order.live, 0);
  out(`Plow nights with ≥ 3 storms on record: plan@start re-clears ${b} → ${p} (${b ? ((100 * (b - p)) / b).toFixed(0) : 0} % fewer, ${(late.reduce((a, r) => a + r.order.planH - r.order.baseH, 0) / late.length * 60).toFixed(0)} min/night); live re-plan ${b} → ${lv} (${b ? ((100 * (b - lv)) / b).toFixed(0) : 0} % fewer, ${(late.reduce((a, r) => a + r.order.liveH - r.order.baseH, 0) / late.length * 60).toFixed(0)} min/night).`);
}
fs.writeFileSync(path.join(ROOT, `private/simulation-${SWEEP}.md`), L.join('\n'));
