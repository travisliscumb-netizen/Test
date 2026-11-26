// Geometry for a city-scale operating area.
//
// Everything here works in a local tangent plane (metres east/north of a fixed
// origin). Across Barrie (~15 km) an equirectangular projection centred on the
// city errs by well under 0.1 %, far below GPS noise, and it keeps every
// computation exact, cheap and dependency-free.

export type LngLat = [number, number];
export type XY = [number, number];

export const EARTH_R = 6_371_008.8;
const DEG = Math.PI / 180;

/** Reference latitude/longitude for the local plane (central Barrie). */
export const ORIGIN: LngLat = [-79.6903, 44.3894];
const COS0 = Math.cos(ORIGIN[1] * DEG);
const M_PER_DEG_LAT = EARTH_R * DEG;
const M_PER_DEG_LNG = EARTH_R * DEG * COS0;

export function toXY(p: LngLat): XY {
  return [(p[0] - ORIGIN[0]) * M_PER_DEG_LNG, (p[1] - ORIGIN[1]) * M_PER_DEG_LAT];
}

export function toLngLat(q: XY): LngLat {
  return [q[0] / M_PER_DEG_LNG + ORIGIN[0], q[1] / M_PER_DEG_LAT + ORIGIN[1]];
}

/** Great-circle distance in metres. */
export function haversine(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * DEG;
  const dLng = (b[0] - a[0]) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * DEG) * Math.cos(b[1] * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Planar distance in metres (fast; valid inside the operating area). */
export function dist(a: LngLat, b: LngLat): number {
  const dx = (b[0] - a[0]) * M_PER_DEG_LNG;
  const dy = (b[1] - a[1]) * M_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

/** Initial bearing a→b in degrees clockwise from true north, [0, 360). */
export function bearing(a: LngLat, b: LngLat): number {
  const dx = (b[0] - a[0]) * M_PER_DEG_LNG;
  const dy = (b[1] - a[1]) * M_PER_DEG_LAT;
  const deg = Math.atan2(dx, dy) / DEG;
  return (deg + 360) % 360;
}

/** Smallest absolute difference between two headings, [0, 180]. */
export function headingDelta(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

export interface Projection {
  /** Closest point on the geometry. */
  point: LngLat;
  /** Distance from the query point, metres. */
  distance: number;
  /** Index of the segment (vertex i → i+1) holding the closest point. */
  segment: number;
  /** Fraction 0..1 along that segment. */
  t: number;
  /** Distance from the start of the line to the closest point, metres. */
  along: number;
  /** Bearing of the segment holding the closest point. */
  segmentBearing: number;
}

/** Project a point onto a polyline. Returns null for degenerate lines. */
export function projectOnLine(p: LngLat, line: LngLat[]): Projection | null {
  if (line.length < 2) return null;
  const P = toXY(p);
  let best: Projection | null = null;
  let walked = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const A = toXY(line[i]);
    const B = toXY(line[i + 1]);
    const vx = B[0] - A[0];
    const vy = B[1] - A[1];
    const len2 = vx * vx + vy * vy;
    const len = Math.sqrt(len2);
    let t = len2 === 0 ? 0 : ((P[0] - A[0]) * vx + (P[1] - A[1]) * vy) / len2;
    t = Math.max(0, Math.min(1, t));
    const C: XY = [A[0] + t * vx, A[1] + t * vy];
    const d = Math.hypot(P[0] - C[0], P[1] - C[1]);
    if (!best || d < best.distance) {
      best = {
        point: toLngLat(C),
        distance: d,
        segment: i,
        t,
        along: walked + t * len,
        segmentBearing: (Math.atan2(vx, vy) / DEG + 360) % 360,
      };
    }
    walked += len;
  }
  return best;
}

export function lineLength(line: LngLat[]): number {
  let s = 0;
  for (let i = 1; i < line.length; i++) s += dist(line[i - 1], line[i]);
  return s;
}

/** Point at a given distance along a polyline (clamped to its ends). */
export function pointAlong(line: LngLat[], d: number): LngLat {
  if (line.length === 0) throw new Error('empty line');
  if (d <= 0) return line[0];
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const seg = dist(line[i - 1], line[i]);
    if (walked + seg >= d) {
      const t = seg === 0 ? 0 : (d - walked) / seg;
      return [
        line[i - 1][0] + t * (line[i][0] - line[i - 1][0]),
        line[i - 1][1] + t * (line[i][1] - line[i - 1][1]),
      ];
    }
    walked += seg;
  }
  return line[line.length - 1];
}

/** Ray-casting point-in-polygon over a ring list (outer ring + holes). */
export function pointInPolygon(p: LngLat, rings: LngLat[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const crosses = yi > p[1] !== yj > p[1];
      if (crosses && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Signed area (m²) of a ring in the local plane; positive = counter-clockwise. */
export function ringArea(ring: LngLat[]): number {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = toXY(ring[j]);
    const b = toXY(ring[i]);
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/** Area-weighted centroid of a polygon's outer ring. */
export function ringCentroid(ring: LngLat[]): LngLat {
  let cx = 0;
  let cy = 0;
  let a2 = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = toXY(ring[j]);
    const b = toXY(ring[i]);
    const f = a[0] * b[1] - b[0] * a[1];
    cx += (a[0] + b[0]) * f;
    cy += (a[1] + b[1]) * f;
    a2 += f;
  }
  if (Math.abs(a2) < 1e-9) {
    // Degenerate ring: fall back to the vertex mean.
    const n = ring.length;
    return [ring.reduce((s, q) => s + q[0], 0) / n, ring.reduce((s, q) => s + q[1], 0) / n];
  }
  return toLngLat([cx / (3 * a2), cy / (3 * a2)]);
}

/** Minimum distance between a point and the boundary of a polygon. */
export function distanceToRing(p: LngLat, ring: LngLat[]): number {
  const pr = projectOnLine(p, ring);
  return pr ? pr.distance : Infinity;
}

export interface BBox {
  w: number;
  s: number;
  e: number;
  n: number;
}

export function bboxOf(points: Iterable<LngLat>, padMetres = 0): BBox {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of points) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  const dLng = padMetres / M_PER_DEG_LNG;
  const dLat = padMetres / M_PER_DEG_LAT;
  return { w: w - dLng, s: s - dLat, e: e + dLng, n: n + dLat };
}

export function inBBox(p: LngLat, b: BBox): boolean {
  return p[0] >= b.w && p[0] <= b.e && p[1] >= b.s && p[1] <= b.n;
}

/** Douglas–Peucker simplification with a tolerance in metres. */
export function simplify(line: LngLat[], tolerance: number): LngLat[] {
  if (line.length <= 2) return line.slice();
  const keep = new Uint8Array(line.length);
  keep[0] = 1;
  keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let maxD = -1;
    let idx = -1;
    for (let k = i + 1; k < j; k++) {
      const pr = projectOnLine(line[k], [line[i], line[j]]);
      const d = pr ? pr.distance : 0;
      if (d > maxD) {
        maxD = d;
        idx = k;
      }
    }
    if (maxD > tolerance && idx > 0) {
      keep[idx] = 1;
      stack.push([i, idx], [idx, j]);
    }
  }
  return line.filter((_, k) => keep[k] === 1);
}

/** Round coordinates to ~1 cm to keep payloads small and deterministic. */
export function round7(p: LngLat): LngLat {
  return [Math.round(p[0] * 1e7) / 1e7, Math.round(p[1] * 1e7) / 1e7];
}
