/**
 * Unit tests for the pure layers: statistics, service-time derivation, the
 * travel metric, the optimiser, backup validation and time handling.
 *
 * These run in plain Node with no DOM, which is the payoff of keeping the
 * domain logic free of the interface.
 */

import assert from 'node:assert/strict';
import {
  weightedMedian, weightedQuantile, weightedMAD, effectiveN, shrink,
  confidenceScore, recencyWeight, theilSen,
} from '../app/learning/robust.js';
import {
  samplesFromSession, groupIntoSessions, fitTravelModel,
  DEFAULT_TRAVEL_MODEL, travelMinutes, BATCH_TAP_SECONDS,
} from '../app/learning/derive.js';
import { buildLearningModel, forecastDay, paceToday, serviceMinutesFor } from '../app/learning/predict.js';
import { optimizeRoute, parseWindowFromNote } from '../app/routing/optimize.js';
import { buildMatrix, detourFactor, findClusters, findBacktracks } from '../app/routing/metric.js';
import { haversineKm, inServiceRegion, boundsOf, formatDistance } from '../app/core/geo.js';
import { dateKey, weekOf, weekdayOf, parseClock, formatDuration, daysBetween } from '../app/core/time.js';
import { buildBackup, inspect, checksum } from '../app/data/backup.js';
import { shouldReplaceGeo, GEO_SOURCE } from '../app/data/schema.js';
import { buildDemoProperties, buildDemoEvents } from '../app/data/demo.js';

let pass = 0, fail = 0;
const results = [];
async function t(name, fn) {
  try { await fn(); pass++; results.push(['PASS', name]); }
  catch (e) { fail++; results.push(['FAIL', `${name} — ${e.message}`]); }
}

// ---------------------------------------------------------------- statistics
await t('weighted median matches the conventional median for equal weights', () => {
  assert.equal(weightedMedian([1, 3, 5].map((v) => ({ v, w: 1 }))), 3);
  assert.equal(weightedMedian([1, 3].map((v) => ({ v, w: 1 }))), 2);
});
await t('median ignores a wild outlier', () => {
  const s = [12, 13, 14, 15, 900].map((v) => ({ v, w: 1 }));
  assert.ok(weightedMedian(s) === 14, `got ${weightedMedian(s)}`);
});
await t('MAD is not moved by a single extreme value', () => {
  const a = weightedMAD([10, 12, 14, 16].map((v) => ({ v, w: 1 })));
  const b = weightedMAD([10, 12, 14, 16, 4000].map((v) => ({ v, w: 1 })));
  assert.ok(Math.abs(a - b) < a * 0.9, `${a} vs ${b}`);
});
await t('quantiles are ordered', () => {
  const s = Array.from({ length: 20 }, (_, i) => ({ v: i, w: 1 }));
  assert.ok(weightedQuantile(s, 0.25) < weightedQuantile(s, 0.5));
  assert.ok(weightedQuantile(s, 0.5) < weightedQuantile(s, 0.75));
});
await t('effective sample size falls when weights are lopsided', () => {
  assert.equal(Math.round(effectiveN([1, 1, 1].map((w) => ({ v: 1, w })))), 3);
  assert.ok(effectiveN([{ v: 1, w: 1 }, { v: 1, w: 0.05 }]) < 1.2);
});
await t('shrinkage moves from prior to observation as evidence accumulates', () => {
  const a = shrink(30, 15, 0.5);
  const b = shrink(30, 15, 12);
  assert.ok(a < b && a > 15 && b < 30, `${a} ${b}`);
  assert.equal(shrink(NaN, 15, 5), 15);
});
await t('confidence rises with evidence and falls with dispersion', () => {
  assert.ok(confidenceScore(1, 4, 15) < confidenceScore(8, 4, 15));
  assert.ok(confidenceScore(8, 12, 15) < confidenceScore(8, 2, 15));
  assert.equal(confidenceScore(0, 1, 15), 0);
});
await t('recency weight halves over the half-life', () => {
  assert.ok(Math.abs(recencyWeight(42, 42) - 0.5) < 1e-9);
  assert.equal(recencyWeight(0), 1);
});
await t('Theil-Sen resists a third of the points being garbage', () => {
  const pts = Array.from({ length: 12 }, (_, i) => ({ x: i, y: 3 * i + 5 }));
  pts.push({ x: 4, y: 900 }, { x: 7, y: -400 }, { x: 2, y: 750 });
  const f = theilSen(pts);
  assert.ok(Math.abs(f.slope - 3) < 0.6, `slope ${f.slope}`);
});

// ------------------------------------------------------------ time handling
await t('week and weekday are computed in local civil time', () => {
  const d = new Date(2026, 8, 9, 23, 30);          // Wednesday 9 Sep 2026, 23:30 local
  assert.equal(weekdayOf(d.getTime()), 'Wed');
  assert.equal(weekOf(dateKey(d.getTime())), '2026-09-07');
});
await t('a late-evening instant does not roll into the next day', () => {
  const d = new Date(2026, 8, 9, 23, 59, 59);
  assert.equal(dateKey(d.getTime()), '2026-09-09');
});
await t('clock parsing rejects nonsense', () => {
  assert.equal(parseClock('07:30'), 450);
  assert.equal(parseClock('25:00'), null);
  assert.equal(parseClock('nope'), null);
});
await t('durations never render as 0h', () => {
  assert.equal(formatDuration(47), '47m');
  assert.equal(formatDuration(120), '2h');
  assert.equal(formatDuration(190), '3h 10m');
});

// -------------------------------------------------------------- geo/metric
await t('haversine is right for a known short leg', () => {
  const d = haversineKm({ lat: 44.3735, lng: -79.7181 }, { lat: 44.3735, lng: -79.7081 });
  assert.ok(Math.abs(d - 0.796) < 0.02, `${d}`);
});
await t('the service region rejects a plainly wrong coordinate', () => {
  assert.ok(inServiceRegion({ lat: 44.39, lng: -79.69 }));
  assert.ok(!inServiceRegion({ lat: 10, lng: 10 }));
  assert.ok(!inServiceRegion({ lat: NaN, lng: -79.69 }));
});
await t('detour factor is largest for short hops', () => {
  assert.ok(detourFactor(0.05) > detourFactor(5));
  assert.ok(detourFactor(20) > 1.2 && detourFactor(0.05) < 1.6);
});
await t('a stop with no coordinate is cost-neutral in the matrix', () => {
  const m = buildMatrix([
    { lat: 44.37, lng: -79.71 }, { lat: 44.38, lng: -79.70 }, { lat: null, lng: null },
  ]);
  assert.ok(Number.isFinite(m.time[0 * 3 + 2]) && m.time[0 * 3 + 2] > 0);
});
await t('clusters and backtracks are detected', () => {
  const tight = [
    { id: 'a', address: 'A', lat: 44.3700, lng: -79.7100 },
    { id: 'b', address: 'B', lat: 44.3702, lng: -79.7102 },
    { id: 'c', address: 'C', lat: 44.3704, lng: -79.7104 },
  ];
  assert.equal(findClusters(tight, 0.35, 3).length, 1);
  const zig = [
    { address: 'A', lat: 44.36, lng: -79.71 },
    { address: 'B', lat: 44.40, lng: -79.71 },
    { address: 'C', lat: 44.362, lng: -79.71 },
  ];
  assert.ok(findBacktracks(zig, { lat: 44.36, lng: -79.71 }, 0.8).length >= 1);
});

// ---------------------------------------------------- service-time derivation
await t('a clean gap yields a direct sample with travel removed', () => {
  const coords = { a: { lat: 44.37, lng: -79.71 }, b: { lat: 44.372, lng: -79.712 } };
  const s = samplesFromSession(
    [{ propertyId: 'a', at: 0 }, { propertyId: 'b', at: 20 * 60000 }],
    (id) => coords[id], () => 15
  );
  assert.equal(s.length, 1);
  assert.equal(s[0].quality, 'direct');
  assert.ok(s[0].minutes > 15 && s[0].minutes < 19, `${s[0].minutes}`);
});
await t('batched taps are split by prior, never recorded as zero-minute lawns', () => {
  const coords = { a: { lat: 44.37, lng: -79.71 }, b: { lat: 44.371, lng: -79.711 }, c: { lat: 44.372, lng: -79.712 } };
  const s = samplesFromSession(
    [{ propertyId: 'a', at: 0 },
     { propertyId: 'b', at: 60 * 60000 },
     { propertyId: 'c', at: 60 * 60000 + 20000 }],
    (id) => coords[id], (id) => (id === 'b' ? 30 : 10)
  );
  assert.equal(s.length, 2);
  assert.ok(s.every((x) => x.quality.startsWith('batch')));
  assert.ok(s.every((x) => x.minutes >= 3), 'no zero-minute samples');
  assert.ok(s.every((x) => x.weight < 0.5), 'batch samples are down-weighted');
  const b = s.find((x) => x.propertyId === 'b');
  const c = s.find((x) => x.propertyId === 'c');
  assert.ok(b.minutes > c.minutes, 'split follows the prior');
});
await t('an implausibly long gap is kept but heavily discounted', () => {
  const coords = { a: { lat: 44.37, lng: -79.71 }, b: { lat: 44.371, lng: -79.711 } };
  const s = samplesFromSession(
    [{ propertyId: 'a', at: 0 }, { propertyId: 'b', at: 200 * 60000 }],
    (id) => coords[id], () => 15
  );
  assert.equal(s.length, 1);
  assert.ok(s[0].weight <= 0.2, `weight ${s[0].weight}`);
  assert.ok(s[0].minutes <= 95);
});
await t('the travel model refuses to refit on thin evidence', () => {
  const m = fitTravelModel([], () => null, DEFAULT_TRAVEL_MODEL);
  assert.equal(m.refit, false);
  assert.equal(m.perKmMin, DEFAULT_TRAVEL_MODEL.perKmMin);
});
await t('the travel model recovers a known slope from synthetic data', () => {
  const props = new Map();
  const sessions = [];
  let id = 0;
  for (let day = 0; day < 12; day++) {
    const session = [];
    let t0 = day * 86400000;
    let prev = null;
    for (let i = 0; i < 12; i++) {
      const pid = `p${id++}`;
      const km = 0.1 + (i % 6) * 0.6;
      const lat = 44.37 + (prev ? 0 : 0);
      props.set(pid, { lat: 44.37 + km / 111.32, lng: -79.71 });
      if (prev) props.set(pid, { lat: props.get(prev).lat + km / 111.32, lng: -79.71 });
      const travel = 2 + 6 * km * 1.25;       // real slope ≈ 7.5 min per straight-line km
      t0 += (15 + travel) * 60000;
      session.push({ propertyId: pid, at: t0 });
      prev = pid;
    }
    sessions.push(session);
  }
  const m = fitTravelModel(sessions, (i) => props.get(i) || null, DEFAULT_TRAVEL_MODEL);
  assert.ok(m.refit, 'should refit');
  assert.ok(m.perKmMin > 4 && m.perKmMin < 11, `slope ${m.perKmMin}`);
});

// -------------------------------------------------------- learning + forecast
await t('a property with no history falls back to the day prior', () => {
  const props = [{ id: 'x', day: 'Mon', lat: 44.37, lng: -79.71 }];
  const m = buildLearningModel(props, [], { today: '2026-09-09' });
  const s = m.byProperty.get('x');
  assert.equal(s.samples, 0);
  assert.equal(s.confidence, 0);
  assert.equal(s.basis, 'prior');
  assert.ok(serviceMinutesFor(m, props[0]) > 5);
});
await t('a manual override wins over the learned value', () => {
  const props = [{ id: 'x', day: 'Mon', lat: 44.37, lng: -79.71, serviceOverrideMin: 42 }];
  const m = buildLearningModel(props, [], { today: '2026-09-09' });
  assert.equal(serviceMinutesFor(m, props[0]), 42);
});
await t('the forecast band widens when stops are unknown', () => {
  const props = [
    { id: 'a', day: 'Mon', lat: 44.370, lng: -79.710 },
    { id: 'b', day: 'Mon', lat: 44.372, lng: -79.712 },
  ];
  const known = buildLearningModel(props, Array.from({ length: 20 }, (_, i) => ([
    { propertyId: 'a', at: Date.parse('2026-08-01') + i * 86400000 },
    { propertyId: 'b', at: Date.parse('2026-08-01') + i * 86400000 + 18 * 60000 },
  ])).flat(), { today: '2026-09-09' });
  const unknown = buildLearningModel(props, [], { today: '2026-09-09' });
  const f1 = forecastDay({ stops: props, startFrom: props[0], nowTs: 0, model: known });
  const f2 = forecastDay({ stops: props, startFrom: props[0], nowTs: 0, model: unknown });
  assert.ok(f2.sdMin > f1.sdMin, `${f2.sdMin} should exceed ${f1.sdMin}`);
  assert.equal(f2.unknownCount, 2);
});
await t('an empty route forecasts zero work, not NaN', () => {
  const f = forecastDay({ stops: [], startFrom: null, nowTs: 1000, model: null });
  assert.equal(f.totalMin, 0);
  assert.equal(f.stopCount, 0);
  assert.ok(Number.isFinite(f.finishTs));
});
await t('pace reports ahead and behind correctly', () => {
  const props = [{ id: 'a', day: 'Mon', lat: 44.37, lng: -79.71 }, { id: 'b', day: 'Mon', lat: 44.372, lng: -79.712 }];
  const m = buildLearningModel(props, [], { today: '2026-09-09' });
  const start = Date.now() - 10 * 60000;
  const fast = paceToday({ completed: props, model: m, dayStartTs: start, nowTs: Date.now() });
  assert.equal(fast.state, 'ahead');
  const slow = paceToday({ completed: props, model: m, dayStartTs: Date.now() - 400 * 60000, nowTs: Date.now() });
  assert.equal(slow.state, 'behind');
});

// ------------------------------------------------------------- optimisation
await t('a zig-zag order is untangled', () => {
  const line = [0, 6, 1, 7, 2, 8, 3, 9, 4, 10, 5, 11]
    .map((i) => ({ id: `p${i}`, lat: 44.35 + i * 0.004, lng: -79.70 }));
  const r = optimizeRoute({ origin: { lat: 44.35, lng: -79.70 }, stops: line, startMinutes: 450, serviceOf: () => 15, stability: 0 });
  assert.ok(r.changed);
  assert.ok(r.optimizedTravel < r.baselineTravel * 0.5, `${r.optimizedTravel} vs ${r.baselineTravel}`);
});
await t('an already-good order is left alone', () => {
  const good = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, lat: 44.35 + i * 0.004, lng: -79.70 }));
  const r = optimizeRoute({ origin: { lat: 44.35, lng: -79.70 }, stops: good, startMinutes: 450, serviceOf: () => 15 });
  assert.equal(r.changed, false);
  assert.equal(r.reason, 'already-optimal');
});
await t('pinned stops never move', () => {
  const line = [0, 6, 1, 7, 2, 8, 3, 9, 4, 10, 5, 11]
    .map((i, k) => ({ id: `p${i}`, lat: 44.35 + i * 0.004, lng: -79.70, pinned: k === 0 || k === 11 }));
  const r = optimizeRoute({ origin: { lat: 44.35, lng: -79.70 }, stops: line, startMinutes: 450, serviceOf: () => 15, stability: 0 });
  assert.equal(r.order[0], 0);
  assert.equal(r.order[11], 11);
});
await t('fewer than three stops is a no-op', () => {
  const r = optimizeRoute({ stops: [{ id: 'a', lat: 44.3, lng: -79.7 }, { id: 'b', lat: 44.3, lng: -79.7 }] });
  assert.equal(r.changed, false);
  assert.equal(r.reason, 'too-few-stops');
});
await t('a time window is respected over raw distance', () => {
  // Stop 0 is nearest but cannot be serviced until much later.
  const stops = [
    { id: 'near-but-late', lat: 44.3505, lng: -79.70, earliestMin: 700 },
    { id: 'far1', lat: 44.360, lng: -79.70 },
    { id: 'far2', lat: 44.365, lng: -79.70 },
    { id: 'far3', lat: 44.370, lng: -79.70 },
  ];
  const r = optimizeRoute({ origin: { lat: 44.350, lng: -79.70 }, stops, startMinutes: 480, serviceOf: () => 15, stability: 0 });
  const pos = r.order.indexOf(0);
  assert.ok(pos > 0, `the windowed stop should not be first; got position ${pos}`);
});
await t('stability keeps the solver from churning for a trivial gain', () => {
  const stops = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, lat: 44.35 + i * 0.003, lng: -79.70 }));
  const swapped = [...stops];
  [swapped[3], swapped[4]] = [swapped[4], swapped[3]];
  const loose = optimizeRoute({ origin: { lat: 44.35, lng: -79.70 }, stops: swapped, startMinutes: 480, serviceOf: () => 15, stability: 0 });
  const tight = optimizeRoute({ origin: { lat: 44.35, lng: -79.70 }, stops: swapped, startMinutes: 480, serviceOf: () => 15, stability: 20 });
  assert.ok(tight.moved.length <= loose.moved.length);
});
await t('note parsing extracts real windows and refuses to guess', () => {
  assert.deepEqual(parseWindowFromNote('Neighbour at 58 wants it after 9am (young baby).'), { earliestMin: 540 });
  assert.deepEqual(parseWindowFromNote('Thursdays after 11am so gate open.'), { earliestMin: 660 });
  assert.deepEqual(parseWindowFromNote('Hand mow.'), { pushMow: true });
  assert.deepEqual(parseWindowFromNote('Cut as late in week as possible.'), { preferLateInWeek: true });
  assert.equal(parseWindowFromNote('Gate code 1234.'), null);
  assert.equal(parseWindowFromNote('Thursday so gate is open.'), null);
  assert.equal(parseWindowFromNote(''), null);
});

// ------------------------------------------------------------------ backup
await t('a round trip validates', async () => {
  const doc = buildBackup({
    properties: [{ id: 'a', address: '1 X St', lat: 44.39, lng: -79.69, active: true }],
    days: [], events: [{ type: 'complete', propertyId: 'a', at: 1 }], settings: {}, dataOrigin: null,
  });
  const r = await inspect(JSON.stringify(doc));
  assert.ok(r.ok);
  assert.equal(r.counts.properties, 1);
  assert.ok(r.meta.checksumVerified);
});
await t('the checksum does not depend on key order', () => {
  const a = checksum({ x: 1, y: [1, 2], z: { p: 1, q: 2 } });
  const b = checksum({ z: { q: 2, p: 1 }, y: [1, 2], x: 1 });
  assert.equal(a, b);
});
await t('every malformed backup is refused with a specific reason', async () => {
  const good = buildBackup({ properties: [{ id: 'a', address: 'A', lat: 44.39, lng: -79.69 }], days: [], events: [], settings: {}, dataOrigin: null });
  const cases = [
    ['not-json', JSON.stringify(good).slice(0, 60)],
    ['wrong-format', JSON.stringify({ hello: 'world' })],
    ['future-schema', JSON.stringify({ ...good, schemaVersion: 99 })],
    ['count-mismatch', JSON.stringify({ ...good, counts: { ...good.counts, properties: 9 } })],
    ['checksum', JSON.stringify({ ...good, properties: [{ id: 'a', address: 'CHANGED', lat: 44.39, lng: -79.69 }] })],
    ['duplicate-id', JSON.stringify({ format: 'teds-route-backup', schemaVersion: 3, properties: [{ id: 'a', address: 'A' }, { id: 'a', address: 'B' }], days: [], events: [] })],
    ['not-object', JSON.stringify([1, 2, 3])],
    ['no-properties', JSON.stringify({ format: 'teds-route-backup', schemaVersion: 3 })],
  ];
  for (const [code, text] of cases) {
    const r = await inspect(text);
    assert.equal(r.ok, false, `${code} should be refused`);
    assert.equal(r.errors[0].code, code, `expected ${code}, got ${r.errors[0].code}`);
    assert.ok(r.errors[0].message.length > 20, `${code} needs a real explanation`);
  }
});
await t('a valid file with soft problems is accepted with warnings', async () => {
  const r = await inspect(JSON.stringify({
    format: 'teds-route-backup', schemaVersion: 3,
    properties: [{ id: 'a', address: 'A', lat: 10, lng: 10 }, { id: 'b', address: 'B' }],
    days: [{ date: '2026-09-09|south', order: ['zzz'], stops: {} }], events: [],
  }));
  assert.ok(r.ok);
  const codes = r.warnings.map((w) => w.code);
  assert.ok(codes.includes('out-of-region'));
  assert.ok(codes.includes('missing-coords'));
  assert.ok(codes.includes('orphan-stops'));
});

// ---------------------------------------------------------------- geo rules
await t('a field-confirmed pin outranks every automated source', () => {
  assert.ok(shouldReplaceGeo(GEO_SOURCE.seed, GEO_SOURCE.geocoded));
  assert.ok(shouldReplaceGeo(GEO_SOURCE.geocoded, GEO_SOURCE.manual));
  assert.ok(!shouldReplaceGeo(GEO_SOURCE.manual, GEO_SOURCE.geocoded));
  assert.ok(!shouldReplaceGeo(GEO_SOURCE.manual, GEO_SOURCE.imported));
});

// --------------------------------------------------------------------- demo
await t('the demo dataset is coherent and learnable', () => {
  const props = buildDemoProperties();
  assert.equal(props.length, 32);
  assert.ok(props.every((p) => inServiceRegion(p)));
  assert.equal(new Set(props.map((p) => p.id)).size, 32);
  const events = buildDemoEvents(props, 6);
  assert.ok(events.filter((e) => e.type === 'complete').length > 150);
  const m = buildLearningModel(props.map((p) => ({ ...p })), events.filter((e) => e.type === 'complete').map((e) => ({ propertyId: e.propertyId, at: e.at })), { today: dateKey() });
  const learned = props.filter((p) => (m.byProperty.get(p.id)?.samples || 0) > 0);
  assert.ok(learned.length > 25, `only ${learned.length} learned`);
});

// -------------------------------------------------------------------- report
const width = Math.max(...results.map((r) => r[1].length));
for (const [status, name] of results) {
  console.log(`${status === 'PASS' ? '  ok  ' : '  FAIL'} ${name}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
