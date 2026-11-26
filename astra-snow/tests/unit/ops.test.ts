import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, nextStop, upcoming, revisitQueue, skippedBehind, type ShiftEvent, type EventInput } from '../../src/data/events.ts';
import { buildGraph, locate, distanceMatrix, path } from '../../src/core/graph.ts';
import { toLngLat, lineLength, type LngLat } from '../../src/core/geo.ts';
import { evaluate, optimize, optimizeBlocks, blocksOf, brokenAdjacencies } from '../../src/routing/optimize.ts';
import { segmentOperations, currentOperation, segmentIntel, windrowRisk, reworkPenalty, plowingOps, OP_GAP_MS } from '../../src/intel/model.ts';
import { deriveSamples, learnedServiceMin, paceFactor, forecast, priorServiceMin, MEAN_FACTOR } from '../../src/routing/eta.ts';
import { diffService, freshness } from '../../src/intel/city.ts';
import { Copilot } from '../../src/copilot/copilot.ts';
import type { RoadSegment } from '../../src/data/schema.ts';

// --------------------------------------------------------------- events
const ORDER = [1, 2, 3, 4, 5];
let clock = 1_000;
const ev = (input: EventInput, id?: string): ShiftEvent => ({ ...input, id: id ?? `e${clock}`, t: clock++, shift: 'S' }) as ShiftEvent;

test('events: done advances next; duplicates are idempotent', () => {
  const d = ev({ type: 'done', stop: 1, street: null, roadId: null, pos: null, acc: null });
  const s = reduce(ORDER, [d, d, { ...d }]);
  assert.equal(s.doneCount, 1);
  assert.equal(nextStop(s), 2);
  assert.deepEqual(upcoming(s, 2), [3, 4]);
});

test('events: undo cancels, undo of undo restores', () => {
  const d = ev({ type: 'done', stop: 1, street: null, roadId: null, pos: null, acc: null }, 'd1');
  const u = ev({ type: 'undo', target: 'd1' }, 'u1');
  assert.equal(reduce(ORDER, [d, u]).doneCount, 0);
  const uu = ev({ type: 'undo', target: 'u1' }, 'u2');
  assert.equal(reduce(ORDER, [d, u, uu]).doneCount, 1);
  // order of arrival does not matter
  assert.equal(reduce(ORDER, [uu, d, u]).doneCount, 1);
});

test('events: defer and blocked go to the return list after the pending ones', () => {
  const s = reduce(ORDER, [
    ev({ type: 'defer', stop: 1 }),
    ev({ type: 'blocked', stop: 2, reason: 'vehicle' }),
  ]);
  assert.equal(nextStop(s), 3);
  assert.deepEqual(revisitQueue(s), [1, 2]);
  const s2 = reduce(ORDER, [
    ev({ type: 'defer', stop: 1 }),
    ...[2, 3, 4, 5].map((n) => ev({ type: 'done', stop: n, street: null, roadId: null, pos: null, acc: null })),
  ]);
  assert.equal(nextStop(s2), 1);
});

test('events: focus works a stop out of order, then returns to the earliest pending', () => {
  const s = reduce(ORDER, [ev({ type: 'focus', stop: 4 })]);
  assert.equal(nextStop(s), 4);
  const s2 = reduce(ORDER, [ev({ type: 'focus', stop: 4 }), ev({ type: 'done', stop: 4, street: null, roadId: null, pos: null, acc: null })]);
  assert.equal(nextStop(s2), 1);
  assert.equal(s2.focus, null);
});

test('events: skipped-behind detects a pending stop left behind', () => {
  const s = reduce(ORDER, [
    ev({ type: 'done', stop: 1, street: null, roadId: null, pos: null, acc: null }),
    ev({ type: 'focus', stop: 3 }),
    ev({ type: 'done', stop: 3, street: null, roadId: null, pos: null, acc: null }),
  ]);
  assert.deepEqual(skippedBehind(s), [2]);
});

test('events: plans must be permutations; null restores the original', () => {
  const bad = reduce(ORDER, [ev({ type: 'plan', order: [1, 2, 3], label: 'bad' })]);
  assert.deepEqual(bad.order, ORDER);
  const good = reduce(ORDER, [ev({ type: 'plan', order: [5, 4, 3, 2, 1], label: 'rev' })]);
  assert.deepEqual(good.order, [5, 4, 3, 2, 1]);
  assert.equal(nextStop(good), 5);
  const back = reduce(ORDER, [ev({ type: 'plan', order: [5, 4, 3, 2, 1], label: 'rev' }), ev({ type: 'plan', order: null, label: 'orig' })]);
  assert.deepEqual(back.order, ORDER);
});

test('events: a done with a street observation records it for the road', () => {
  const s = reduce(ORDER, [ev({ type: 'done', stop: 1, street: 'unplowed', roadId: 77, pos: null, acc: null })]);
  assert.equal(s.streetObs.get(77)?.state, 'unplowed');
  assert.equal(s.stops.get(1)?.street, 'unplowed');
});

test('events: unknown stops are ignored, never crash', () => {
  const s = reduce(ORDER, [ev({ type: 'done', stop: 999, street: null, roadId: null, pos: null, acc: null })]);
  assert.equal(s.doneCount, 0);
});

// ---------------------------------------------------------------- graph
// A 3×3 grid of 100 m blocks.
function grid(): RoadSegment[] {
  const segs: RoadSegment[] = [];
  let id = 1;
  const seg = (a: [number, number], b: [number, number], name: string): RoadSegment => ({
    id: id++, asset: null, name, oneway: 'B', plowClass: 'R', plowRoute: 3, saltRoute: null, carto: null, speed: 40, width: 8, from: null, to: null,
    lines: [[toLngLat(a), toLngLat(b)]],
  });
  for (let y = 0; y <= 200; y += 100) for (let x = 0; x < 200; x += 100) segs.push(seg([x, y], [x + 100, y], `H${y}`));
  for (let x = 0; x <= 200; x += 100) for (let y = 0; y < 200; y += 100) segs.push(seg([x, y], [x, y + 100], `V${x}`));
  return segs;
}

test('graph: network distance respects streets, mid-edge attachment', () => {
  const g = buildGraph(grid());
  assert.equal(g.nodes.length, 9);
  const a = locate(g, toLngLat([50, 2]))!; // mid H0
  const b = locate(g, toLngLat([150, 198]))!; // mid H200 east block
  const m = distanceMatrix(g, [a, b]);
  // 50 to corner (100,0) + 200 north + 50 east = 300
  assert.ok(Math.abs(m[1] - 300) < 0.5, `got ${m[1]}`);
  const p = path(g, a, b);
  assert.ok(Math.abs(p.length - 300) < 0.5);
  assert.ok(Math.abs(lineLength(p.coords) - 300) < 1.5, `geometry ${lineLength(p.coords)}`);
});

test('graph: same-edge points use the direct distance', () => {
  const g = buildGraph(grid());
  const a = locate(g, toLngLat([10, 1]))!;
  const b = locate(g, toLngLat([70, 1]))!;
  assert.ok(Math.abs(distanceMatrix(g, [a, b])[1] - 60) < 0.5);
});

// ------------------------------------------------------------- optimizer
test('optimizer: never worse than the input; fixes an obvious zig-zag', () => {
  // points on a line at 0, 300, 100, 200 → best order 0,100,200,300
  const xs = [0, 300, 100, 200];
  const n = xs.length;
  const M = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) M[i * n + j] = Math.abs(xs[i] - xs[j]);
  const inp = { matrix: M, n, order: [0, 1, 2, 3], fromHere: xs.map((x) => x), serviceMin: [1, 1, 1, 1], metresPerMin: 100, startMs: 0 };
  const base = evaluate(inp, inp.order);
  const best = optimize(inp);
  assert.ok(best.totalMin <= base.totalMin);
  assert.deepEqual(best.order, [0, 2, 3, 1]);
});

test('optimizer: a stability cost keeps the dispatcher order when gains are small', () => {
  const xs = [0, 120, 100, 200];
  const n = xs.length;
  const M = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) M[i * n + j] = Math.abs(xs[i] - xs[j]);
  const inp = { matrix: M, n, order: [0, 1, 2, 3], fromHere: xs, serviceMin: [1, 1, 1, 1], metresPerMin: 100, startMs: 0, stability: 5, baseOrder: [0, 1, 2, 3] };
  assert.deepEqual(optimize(inp).order, [0, 1, 2, 3]);
  assert.equal(brokenAdjacencies([0, 1, 2, 3], [0, 2, 1, 3]), 3);
});

test('optimizer: block search moves a whole street to avoid a penalty', () => {
  // Two streets, A (0,1) and B (2,3), side by side; serving B before t=10 min
  // costs 30 min. With 5-min driveways, doing A first gets B past the window.
  const n = 4;
  const M = new Float64Array(n * n).fill(10);
  for (let i = 0; i < n; i++) M[i * n + i] = 0;
  const pen = (s: number, t: number) => (s >= 2 && t < 10 * 60_000 ? 30 : 0);
  const inp = { matrix: M, n, order: [2, 3, 0, 1], fromHere: [10, 10, 10, 10], serviceMin: [5, 5, 5, 5], metresPerMin: 100, startMs: 0, penalty: pen };
  assert.equal(evaluate(inp, inp.order).penaltyMin, 60);
  const blocks = blocksOf(inp.order, (i) => (i >= 2 ? 'B' : 'A'));
  assert.equal(blocks.length, 2);
  const best = optimizeBlocks(inp, blocks);
  assert.deepEqual(best.order.slice(0, 2).sort(), [0, 1]);
  assert.equal(best.penaltyMin, 0);
});

// ----------------------------------------------------------------- model
test('model: operations split on 3 h quiet gaps', () => {
  const H = 3600_000;
  const ops = segmentOperations([{ seg: 1, t: 0 }, { seg: 2, t: H }, { seg: 1, t: 2 * H }, { seg: 3, t: 2 * H + OP_GAP_MS + 1 }]);
  assert.equal(ops.length, 2);
  assert.equal(ops[0].first.get(1), 0);
  assert.equal(currentOperation([{ seg: 1, t: 0 }], 4 * H), null);
  assert.deepEqual(currentOperation([{ seg: 1, t: 0 }, { seg: 2, t: H }], 2 * H), { start: 0, latest: H });
});

test('model: serviced is never shown as plowed without a driver observation', () => {
  const ctx = { now: 10, opStart: 0, plowClass: () => 'R' as const, history: [] };
  assert.equal(segmentIntel(1, 5, null, ctx).state, 'serviced-unconfirmed');
  assert.equal(segmentIntel(1, 5, { roadId: 1, state: 'plowed', t: 6 }, ctx).state, 'plowed-confirmed');
  assert.equal(segmentIntel(1, null, null, ctx).state, 'not-serviced');
  assert.equal(segmentIntel(1, null, null, { ...ctx, opStart: null }).state, 'unknown');
  // unserviced during an operation with no history: prior basis, low confidence
  const i = segmentIntel(1, null, null, ctx);
  assert.equal(i.basis, 'prior');
  assert.equal(i.confidence, 'low');
  assert.equal(i.expected, null);
});

test('model: historical timing needs 3 comparable operations', () => {
  const H = 3600_000;
  const mk = (start: number, off: number) => ({ id: 'x', start, end: start + off, events: 1, first: new Map([[1, start + off]]) });
  const two = [mk(0, 2 * H), mk(100 * H, 3 * H)];
  const ctx = (history: ReturnType<typeof mk>[]) => ({ now: 1000 * H, opStart: 1000 * H, plowClass: () => 'R' as const, history });
  assert.equal(segmentIntel(1, null, null, ctx(two)).expected, null);
  const three = [...two, mk(200 * H, 4 * H)];
  const e = segmentIntel(1, null, null, ctx(three)).expected!;
  assert.equal(e.samples, 3);
  assert.equal(e.p50, 1000 * H + 3 * H);
});

test('model: plowingOps filters salt-only operations by residential coverage', () => {
  const op = (segs: number[]) => ({ id: 'o', start: 0, end: 1, events: segs.length, first: new Map(segs.map((s) => [s, 0])) });
  assert.equal(plowingOps([op([1, 2, 3]), op([1])], [1, 2, 3, 4], 0.5).length, 1);
});

test('windrow: only when the City serviced the street after the driveway', () => {
  assert.equal(windrowRisk(1, 9, 100, 50, null, 'R'), null);
  assert.equal(windrowRisk(1, 9, 100, null, null, 'R'), null);
  assert.equal(windrowRisk(1, 9, 100, 200, 'unplowed', 'S')!.level, 'likely');
  assert.equal(windrowRisk(1, 9, 100, 200, 'plowed', 'R')!.level, 'unlikely');
  assert.equal(windrowRisk(1, 9, 100, 200, null, 'S')!.level, 'possible');
});

test('penalty: zero without an operation; confirmed plowed streets are free', () => {
  const intel = new Map([[1, segmentIntel(1, null, { roadId: 1, state: 'plowed', t: 1 }, { now: 1, opStart: 0, plowClass: () => 'R', history: [] })]]);
  assert.equal(reworkPenalty(1, 10, { intel, reworkMin: 4, horizon: 100, opActive: false }), 0);
  assert.equal(reworkPenalty(1, 10, { intel, reworkMin: 4, horizon: 100, opActive: true }), 0);
  const intel2 = new Map([[2, segmentIntel(2, null, null, { now: 1, opStart: 0, plowClass: () => 'R', history: [] })]]);
  assert.ok(reworkPenalty(2, 10, { intel: intel2, reworkMin: 4, horizon: 100, opActive: true }) > 0);
});

// ------------------------------------------------------------------- eta
test('eta: samples subtract travel and drop batches and breaks', () => {
  const done = [
    { stop: 1, t: 0 },
    { stop: 2, t: 4 * 60_000 },
    { stop: 3, t: 4 * 60_000 + 5_000 }, // batch tap
    { stop: 4, t: 60 * 60_000 }, // break
    { stop: 5, t: 64 * 60_000 },
  ];
  const s = deriveSamples(done, () => 200, 200);
  assert.deepEqual(s.map((x) => x.stop), [2, 5]);
  assert.ok(Math.abs(s[0].minutes - 3) < 1e-9);
});

test('eta: learned estimates shrink toward the prior; mean exceeds median', () => {
  assert.equal(learnedServiceMin(3, [], 3).median, 3);
  assert.ok(Math.abs(learnedServiceMin(3, [], 3).mean - 3 * MEAN_FACTOR) < 1e-12);
  const one = learnedServiceMin(3, [9], 3).median;
  assert.ok(one > 3 && one < 9);
  const many = learnedServiceMin(3, Array(30).fill(6), 3);
  assert.ok(Math.abs(many.median - 6) < 0.6);
  assert.ok(many.mean > many.median);
});

test('eta: pace factor is bounded and needs evidence', () => {
  assert.equal(paceFactor({ completed: [{ predicted: 3, actual: 9 }] }), 1);
  const f = paceFactor({ completed: Array(30).fill({ predicted: 3, actual: 30 }) });
  assert.equal(f, 1);
  const g = paceFactor({ completed: Array(30).fill({ predicted: 3, actual: 9 }) });
  assert.ok(g <= 1.6 && g > 1.5);
});

test('eta: forecast range brackets the point estimate', () => {
  const f = forecast(0, [3, 3, 3], [100, 200, 200], 200, 1, 0);
  assert.ok(f.earlyMs < f.finishMs && f.finishMs < f.lateMs);
  assert.equal(f.remainingMin, 9 + 2.5);
  assert.equal(priorServiceMin({ driveways: 2, drivewayStreets: [], hazards: [], throwRule: false, conditional: false }), 5.25);
});

// ------------------------------------------------------------------ city
test('city: diff reports only new or newer service times', () => {
  const prev = new Map([[1, 100], [2, 200]]);
  const next = new Map([[1, 100], [2, 250], [3, 50]]);
  assert.deepEqual(diffService(prev, next), [{ seg: 2, t: 250 }, { seg: 3, t: 50 }]);
  assert.equal(diffService(null, next).length, 3);
  assert.equal(freshness(null, 0), 'none');
  assert.equal(freshness(0, 60_000), 'live');
  assert.equal(freshness(0, 10 * 60_000), 'recent');
  assert.equal(freshness(0, 60 * 60_000), 'stale');
});

// --------------------------------------------------------------- copilot
test('copilot: approach → at → leaving prompt; never completes a stop', () => {
  const c = new Copilot();
  const stop = { seq: 7, stopPoint: toLngLat([0, 0]) as LngLat, target: toLngLat([0, 8]) as LngLat };
  const tr = (x: number, y: number, speed: number, t: number) => ({ position: toLngLat([x, y]) as LngLat, speed, heading: 0, sigma: 5, accuracy: 6, t, accepted: true, rejects: 0 });
  const cues: string[] = [];
  let t = 0;
  for (let y = -400; y <= -30; y += 30) for (const c2 of c.update(tr(0, y, 4, (t += 7000)), stop, [], t).cues) cues.push(c2.kind);
  assert.deepEqual(cues, ['approach']);
  for (let i = 0; i < 20; i++) for (const c2 of c.update(tr(0, 2, 0.2, (t += 5000)), stop, [], t).cues) cues.push(c2.kind);
  assert.ok(cues.includes('arrived'));
  // drive away at 4 m/s; departure must persist 6 s before it counts
  for (let i = 1; i <= 15; i++) for (const c2 of c.update(tr(0, 2 + 4 * i * 3, 4, (t += 1000)), stop, [], t).cues) cues.push(c2.kind);
  assert.equal(cues.filter((k) => k === 'leaving-undone').length, 1);
  assert.equal(cues[cues.length - 1], 'leaving-undone');
});

test('copilot: a poor fix pauses proximity and says so', () => {
  const c = new Copilot();
  const stop = { seq: 1, stopPoint: toLngLat([0, 0]) as LngLat, target: toLngLat([0, 0]) as LngLat };
  const good = { position: toLngLat([0, 500]) as LngLat, speed: 0, heading: null, sigma: 5, accuracy: 5, t: 0, accepted: true, rejects: 0 };
  c.update(good, stop, [], 0);
  const r = c.update({ ...good, position: toLngLat([0, 1]) as LngLat, accuracy: 80, sigma: 80, t: 1000 }, stop, [], 1000);
  assert.equal(r.view.gpsUsable, false);
  assert.ok(r.cues.some((x) => x.kind === 'gps-poor'));
  assert.ok(!r.cues.some((x) => x.kind === 'arrived' || x.kind === 'approach'));
});

test('copilot: brief stop on the way past is not an arrival', () => {
  const c = new Copilot();
  const stop = { seq: 1, stopPoint: toLngLat([0, 0]) as LngLat, target: toLngLat([0, 0]) as LngLat };
  const tr = (y: number, speed: number, t: number) => ({ position: toLngLat([0, y]) as LngLat, speed, heading: 0, sigma: 4, accuracy: 5, t, accepted: true, rejects: 0 });
  const kinds: string[] = [];
  for (const [y, sp, t] of [[-50, 4, 0], [-10, 3, 3000], [0, 0.5, 5000], [10, 3, 7000], [80, 4, 20_000]] as const) for (const k of c.update(tr(y, sp, t), stop, [], t).cues) kinds.push(k.kind);
  assert.ok(!kinds.includes('arrived'));
  assert.ok(!kinds.includes('leaving-undone'));
});

test('copilot: working deep in a long driveway is not leaving', () => {
  const c = new Copilot();
  // driveway polygon 6 m wide, 70 m deep, entrance at the street (y=0)
  const dw: LngLat[] = [toLngLat([-3, 0]), toLngLat([3, 0]), toLngLat([3, 70]), toLngLat([-3, 70]), toLngLat([-3, 0])];
  const stop = { seq: 3, stopPoint: toLngLat([0, -6]) as LngLat, target: toLngLat([0, 0]) as LngLat, zone: [dw] };
  const tr = (y: number, speed: number, t: number) => ({ position: toLngLat([0, y]) as LngLat, speed, heading: 0, sigma: 4, accuracy: 5, t, accepted: true, rejects: 0 });
  const kinds: string[] = [];
  let t = 0;
  for (let i = 0; i < 6; i++) for (const k of c.update(tr(0, 0.3, (t += 1000)), stop, [], t).cues) kinds.push(k.kind);
  // blow up and down the 70 m driveway at working speed for 3 minutes
  for (let i = 0; i < 180; i++) for (const k of c.update(tr(35 + 34 * Math.sin(i / 10), 2.5, (t += 1000)), stop, [], t).cues) kinds.push(k.kind);
  assert.ok(kinds.includes('arrived'));
  assert.ok(!kinds.includes('leaving-undone'), kinds.join(','));
});

test('copilot: dwelling at the next driveway with this one unmarked prompts', () => {
  const c = new Copilot();
  const a = { seq: 1, stopPoint: toLngLat([0, 0]) as LngLat, target: toLngLat([0, 5]) as LngLat };
  const b = { seq: 2, stopPoint: toLngLat([37, 0]) as LngLat, target: toLngLat([37, 5]) as LngLat };
  const tr = (x: number, speed: number, t: number) => ({ position: toLngLat([x, 4]) as LngLat, speed, heading: 90, sigma: 4, accuracy: 5, t, accepted: true, rejects: 0 });
  const cues: { kind: string; reason?: string }[] = [];
  let t = 0;
  for (let i = 0; i < 90; i++) cues.push(...c.update(tr(0, 0.3, (t += 1000)), a, [], t, b).cues);
  for (let i = 0; i < 30; i++) cues.push(...c.update(tr(37, 0.3, (t += 1000)), a, [], t, b).cues);
  const p = cues.find((x) => x.kind === 'leaving-undone');
  assert.ok(p, 'expected a prompt');
  assert.equal(p!.reason, 'at-next');
});
