import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRow, parseRoute, parseNote, indexStreets, type CityStreet } from '../../src/data/route-parse.ts';
import { dist, haversine, projectOnLine, pointInPolygon, bearing, headingDelta, simplify, toXY, toLngLat, type LngLat } from '../../src/core/geo.ts';
import { GpsFilter } from '../../src/core/kalman.ts';
import { seal, unseal, newKey, UnsealError, isKeyString, wrapKeyWithPin, unwrapKeyWithPin, PIN_ITERATIONS } from '../../src/core/crypto.ts';
import { speakable } from '../../src/copilot/feedback.ts';

// ------------------------------------------------------------------ parser
// Synthetic streets and rows only: no customer data in this public file.
const STREETS: CityStreet[] = [
  { name: 'MAPLE', suffix: 'ST', dir: null },
  { name: 'MAPLEWOOD', suffix: 'CRES', dir: null },
  { name: 'HARBOUR VIEW', suffix: 'SQ', dir: null },
  { name: 'LAKESHORE', suffix: 'RD', dir: null },
  { name: 'NORTHGATE', suffix: 'RD', dir: null },
  { name: 'KINGSWAY', suffix: 'AVE', dir: null },
  { name: 'BIRCH', suffix: 'ST', dir: 'E' },
  { name: 'BIRCH', suffix: 'ST', dir: 'W' },
  { name: 'CEDAR', suffix: 'CRT', dir: null },
  { name: 'ST LAURENT', suffix: 'ST', dir: null },
  { name: 'ASPEN', suffix: 'ST', dir: null },
  { name: 'ASPEN', suffix: 'CRES', dir: null },
  { name: 'WILLOWBROOK', suffix: 'RD', dir: null },
];
const IDX = indexStreets(STREETS);

test('parser: plain row with locality', () => {
  const r = parseRow('9001 Maple St, Barrie', 1, IDX);
  assert.equal(r.number, '9001');
  assert.equal(r.streetKey, 'MAPLE ST');
  assert.equal(r.note, '');
  assert.equal(r.address, '9001 Maple St');
  assert.deepEqual(r.warnings, []);
});

test('parser: bare street name infers a unique suffix and warns', () => {
  const r = parseRow('9002 Maplewood', 5, IDX);
  assert.equal(r.streetKey, 'MAPLEWOOD CRES');
  assert.equal(r.warnings.length, 1);
});

test('parser: an unwritten, ambiguous suffix is an error, not a guess', () => {
  assert.throws(() => parseRow('9003 Aspen, Barrie', 1, IDX), /ambiguous/);
  assert.equal(parseRow('9003 Aspen Crescent, Barrie', 1, IDX).streetKey, 'ASPEN CRES');
});

test('parser: direction words resolve; missing direction on a split street is an error', () => {
  assert.equal(parseRow('9004 Birch St E, Barrie', 1, IDX).streetKey, 'BIRCH ST E');
  assert.throws(() => parseRow('9004 Birch St, Barrie', 1, IDX), /ambiguous/);
});

test('parser: note separators are stripped, note text kept verbatim', () => {
  assert.equal(parseRow('9010 Maple St, Barrie-PAVERS-Plastic blade only after frost', 1, IDX).note, 'PAVERS-Plastic blade only after frost');
  assert.equal(parseRow('9011 Birch St E, Barrie- DRIVEWAY ON WILLOWBROK', 2, IDX).note, 'DRIVEWAY ON WILLOWBROK');
  assert.equal(parseRow('9012 Maplewood Crescent, Barrie - x2 Driveways-Bench near garage', 3, IDX).note, 'x2 Driveways-Bench near garage');
  assert.equal(parseRow('9013 Kingsway GAS METER BY DOOR', 4, IDX).note, 'GAS METER BY DOOR');
  assert.equal(parseRow('9014 Lakeshore Rd, Barrie LOW FENCE RIGHT SIDE', 5, IDX).note, 'LOW FENCE RIGHT SIDE');
  assert.equal(parseRow('9015 Cedar-Upper pad ONLY', 6, IDX).note, 'Upper pad ONLY');
});

test('parser: suffix-less street followed by a note still warns', () => {
  assert.equal(parseRow('9016 Kingsway GAS METER', 7, IDX).warnings.length, 1);
  assert.equal(parseRow('9017 Lakeshore-Clear wide', 8, IDX).warnings.length, 1);
});

test('parser: longest City name wins; spaced spellings match joined City names', () => {
  assert.equal(parseRow('9020 Maplewood Cres, Barrie', 1, IDX).streetKey, 'MAPLEWOOD CRES');
  assert.equal(parseRow('9020 Maple St, Barrie', 1, IDX).streetKey, 'MAPLE ST');
  assert.equal(parseRow('9021 North Gate Rd, Barrie', 1, IDX).streetKey, 'NORTHGATE RD');
  assert.equal(parseRow('9022 Harbour View Square, Barrie', 1, IDX).streetKey, 'HARBOUR VIEW SQ');
  assert.equal(parseRow('9023 St Laurent St', 1, IDX).streetKey, 'ST LAURENT ST');
});

test('parser: unknown street and missing number are errors, never guesses', () => {
  assert.throws(() => parseRow('9030 Nowhere Lane, Barrie', 1, IDX), /no City street/);
  assert.throws(() => parseRow('Maple St, Barrie', 1, IDX), /no house number/);
});

test('parser: note flags are advisory reads of the note', () => {
  const f = parseNote('x2 Driveways-Bench @ back stake @ Cedar drvwy', IDX);
  assert.equal(f.driveways, 2);
  assert.deepEqual(f.drivewayStreets, ['CEDAR CRT']);
  assert.equal(parseNote('Blow on side lawn only', IDX).throwRule, true);
  assert.equal(parseNote('GRAVEL-only once base is frozen', IDX).conditional, true);
  // one-letter misspelling of a City street resolves
  assert.deepEqual(parseNote('DRIVEWAY ON WILLOWBROK', IDX).drivewayStreets, ['WILLOWBROOK RD']);
  assert.deepEqual(parseNote('nothing to see', IDX).drivewayStreets, []);
});

test('parser: route keeps order and count', () => {
  const rows = ['9040 Maple St, Barrie', '9041 Maple St, Barrie', '9042 Kingsway Ave, Barrie'];
  const out = parseRoute(rows, IDX);
  assert.deepEqual(out.map((r) => r.seq), [1, 2, 3]);
  assert.deepEqual(out.map((r) => r.raw), rows);
});

// -------------------------------------------------------------------- geo
const A: LngLat = [-79.68, 44.4];
test('geo: planar distance agrees with haversine within 0.1 % across the city', () => {
  for (const d of [10, 500, 5000, 12000]) {
    const B: LngLat = [A[0] + d / 79_500, A[1] + d / 111_195];
    const h = haversine(A, B);
    assert.ok(Math.abs(dist(A, B) - h) / h < 0.001, `d=${d}`);
  }
});

test('geo: XY round trip', () => {
  const p: LngLat = [-79.6712345, 44.4012345];
  const q = toLngLat(toXY(p));
  assert.ok(dist(p, q) < 0.001);
});

test('geo: projection onto a line', () => {
  const line: LngLat[] = [toLngLat([0, 0]), toLngLat([100, 0])];
  const pr = projectOnLine(toLngLat([40, 10]), line)!;
  assert.ok(Math.abs(pr.distance - 10) < 0.01);
  assert.ok(Math.abs(pr.along - 40) < 0.01);
  assert.ok(Math.abs(pr.segmentBearing - 90) < 0.01);
});

test('geo: point in polygon with a hole', () => {
  const sq = (s: number): LngLat[] => [toLngLat([-s, -s]), toLngLat([s, -s]), toLngLat([s, s]), toLngLat([-s, s]), toLngLat([-s, -s])];
  assert.equal(pointInPolygon(toLngLat([0, 0]), [sq(10)]), true);
  assert.equal(pointInPolygon(toLngLat([0, 0]), [sq(10), sq(2)]), false);
  assert.equal(pointInPolygon(toLngLat([5, 5]), [sq(10), sq(2)]), true);
  assert.equal(pointInPolygon(toLngLat([20, 0]), [sq(10)]), false);
});

test('geo: bearings and heading deltas', () => {
  assert.ok(Math.abs(bearing(toLngLat([0, 0]), toLngLat([0, 100])) - 0) < 0.01);
  assert.ok(Math.abs(bearing(toLngLat([0, 0]), toLngLat([100, 0])) - 90) < 0.01);
  assert.equal(headingDelta(350, 10), 20);
  assert.equal(headingDelta(10, 190), 180);
});

test('geo: simplification keeps corners, drops collinear points', () => {
  const line = [0, 10, 20, 30, 40].map((x) => toLngLat([x, 0])).concat([toLngLat([40, 40])]);
  const s = simplify(line, 0.5);
  assert.equal(s.length, 3);
});

// ----------------------------------------------------------------- kalman
test('kalman: smooths noise on a straight drive and estimates speed', () => {
  const f = new GpsFilter();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  let last;
  const speeds: number[] = [];
  let rawSq = 0;
  let filtSq = 0;
  let n = 0;
  for (let i = 0; i < 90; i++) {
    const truth = toLngLat([i * 3, 0]); // 3 m/s east
    const noisy = toLngLat([i * 3 + rnd() * 6, rnd() * 6]);
    last = f.update({ lng: noisy[0], lat: noisy[1], accuracy: 8, t: i * 1000 });
    if (i >= 30) {
      speeds.push(last.speed);
      rawSq += dist(noisy, truth) ** 2;
      filtSq += dist(last.position, truth) ** 2;
      n++;
    }
  }
  const rawRms = Math.sqrt(rawSq / n);
  const filtRms = Math.sqrt(filtSq / n);
  assert.ok(filtRms < 0.75 * rawRms, `filtered RMS ${filtRms.toFixed(2)} vs raw ${rawRms.toFixed(2)}`);
  // Unbiased: the converged mean speed is close to the truth (single samples wander ±0.7 m/s at this noise).
  const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  assert.ok(Math.abs(mean - 3) < 0.35, `mean speed ${mean}`);
  assert.ok(headingDelta(last!.heading!, 90) < 15);
});

test('kalman: rejects a single wild jump, recovers after three', () => {
  const f = new GpsFilter();
  for (let i = 0; i < 10; i++) f.update({ lng: toLngLat([i, 0])[0], lat: toLngLat([i, 0])[1], accuracy: 5, t: i * 1000 });
  const far = toLngLat([900, 0]);
  const r1 = f.update({ lng: far[0], lat: far[1], accuracy: 5, t: 10_000 });
  assert.equal(r1.accepted, false);
  assert.ok(dist(r1.position, toLngLat([10, 0])) < 15);
  f.update({ lng: far[0], lat: far[1], accuracy: 5, t: 11_000 });
  const r3 = f.update({ lng: far[0], lat: far[1], accuracy: 5, t: 12_000 });
  assert.equal(r3.accepted, true);
  assert.ok(dist(r3.position, far) < 10);
});

test('kalman: a stationary tractor stays put under noise', () => {
  const f = new GpsFilter();
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  let t;
  for (let i = 0; i < 90; i++) {
    const p = toLngLat([rnd() * 10, rnd() * 10]);
    t = f.update({ lng: p[0], lat: p[1], accuracy: 10, t: i * 1000, speed: 0 });
  }
  assert.ok(dist(t!.position, toLngLat([0, 0])) < 5);
  assert.ok(t!.speed < 0.8, `speed ${t!.speed}`);
});

// ----------------------------------------------------------------- crypto
test('crypto: seal/unseal round trip, integrity, wrong key, tamper', async () => {
  const key = newKey();
  assert.ok(isKeyString(key));
  const doc = await seal('{"hello":"world"}', key, 'label', 1);
  assert.equal(await unseal(doc, key), '{"hello":"world"}');
  await assert.rejects(unseal(doc, newKey()), UnsealError);
  const bad = { ...doc, data: doc.data.slice(0, -4) + (doc.data.endsWith('AAAA') ? 'BBBB' : 'AAAA') };
  await assert.rejects(unseal(bad, key), UnsealError);
  await assert.rejects(unseal({ ...doc, sha256: '0'.repeat(64) }, key), /integrity/);
  await assert.rejects(unseal({ ...doc, schema: 'x' } as never, key), /Not a sealed/);
});

test('crypto: two seals of the same text differ (random IV)', async () => {
  const key = newKey();
  const a = await seal('same', key, 'l', 1);
  const b = await seal('same', key, 'l', 1);
  assert.notEqual(a.data, b.data);
  assert.notEqual(a.iv, b.iv);
});

test('crypto: a PIN unwraps the route key; wrong PIN and tampering are refused', async () => {
  const key = newKey();
  const wrap = await wrapKeyWithPin(key, '1234');
  assert.equal(wrap.iterations, PIN_ITERATIONS);
  assert.ok(PIN_ITERATIONS >= 600_000);
  assert.equal(await unwrapKeyWithPin(wrap, '1234'), key);
  await assert.rejects(unwrapKeyWithPin(wrap, '1235'), /Wrong PIN/);
  await assert.rejects(unwrapKeyWithPin(wrap, 'abcd'), /Wrong PIN/);
  await assert.rejects(unwrapKeyWithPin({ ...wrap, salt: wrap.salt.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) }, '1234'), /Wrong PIN/);
  await assert.rejects(wrapKeyWithPin(key, '12'), /4-8 digits/);
  // the PIN never appears in the wrap
  assert.ok(!JSON.stringify(wrap).includes('1234'));
});

// ------------------------------------------------------------------ voice
test('voice: expands abbreviations and drops parenthetical asides', () => {
  assert.equal(speakable('9001 Maple St'), '9001 Maple Street');
  assert.equal(speakable('9023 St Laurent St'), '9023 Saint Laurent Street');
  assert.equal(speakable('SHOVEL STEPS FIRST. NOT the side door (remark about the owner)'), 'Shovel steps first. not the side door');
  assert.equal(speakable('AC ON DRWY BY GARAGE'), 'A C on driveway by garage');
  assert.equal(speakable('WATCH POST ON RET. WALL WEST SIDE@CURB'), 'Watch post on retaining wall west side at curb');
  assert.match(speakable('Leave 3 feet clear @ end of drvwy for grbg bins'), /end of driveway for garbage bins/);
  assert.match(speakable('BOLT STICKS UP 2"'), /2 inch/);
});
