/**
 * Geometry and geography primitives.
 *
 * Pure functions only. No DOM, no storage, no side effects — this module is
 * unit-testable in Node and is shared by the optimizer worker.
 */

export const EARTH_RADIUS_KM = 6371.0088;

const RAD = Math.PI / 180;

/** Great-circle distance in kilometres. */
export function haversineKm(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const la1 = a.lat * RAD;
  const la2 = b.lat * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Local equirectangular projection to metres, accurate to well under a metre
 * across a service area this size and roughly 20x cheaper than haversine.
 * Used inside the optimizer's inner loop where it runs millions of times.
 */
export function makeLocalProjection(originLat) {
  const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * originLat * RAD);
  const mPerDegLng = 111412.84 * Math.cos(originLat * RAD) - 93.5 * Math.cos(3 * originLat * RAD);
  return {
    mPerDegLat,
    mPerDegLng,
    toMetres(p) {
      return { x: p.lng * mPerDegLng, y: p.lat * mPerDegLat };
    },
  };
}

/** Web-Mercator normalised coordinates in [0,1]. Used by the map engine. */
export function lngToNormX(lng) {
  return (lng + 180) / 360;
}
export function latToNormY(lat) {
  const s = Math.sin(lat * RAD);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}
export function normXToLng(x) {
  return x * 360 - 180;
}
export function normYToLat(y) {
  const n = Math.PI * (1 - 2 * y);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

/** Initial bearing from a to b, in degrees clockwise from north. */
export function bearingDeg(a, b) {
  const dLng = (b.lng - a.lng) * RAD;
  const la1 = a.lat * RAD;
  const la2 = b.lat * RAD;
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

/** Bounding box of a list of {lat,lng}. Returns null for an empty list. */
export function boundsOf(points) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  let n = 0;
  for (const p of points) {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    n++;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return n ? { minLat, maxLat, minLng, maxLng } : null;
}

export function boundsCentre(b) {
  return { lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 };
}

export function padBounds(b, frac = 0.12) {
  const dLat = Math.max((b.maxLat - b.minLat) * frac, 0.0015);
  const dLng = Math.max((b.maxLng - b.minLng) * frac, 0.0015);
  return {
    minLat: b.minLat - dLat, maxLat: b.maxLat + dLat,
    minLng: b.minLng - dLng, maxLng: b.maxLng + dLng,
  };
}

/**
 * The service region. Anything outside is rejected on import rather than
 * silently dropping a pin in the ocean — a coordinate typo in a backup file
 * is a data-integrity event, not a rendering curiosity.
 */
export const SERVICE_REGION = { minLat: 44.0, maxLat: 44.9, minLng: -80.4, maxLng: -79.1 };

export function inServiceRegion(p) {
  return (
    !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
    p.lat >= SERVICE_REGION.minLat && p.lat <= SERVICE_REGION.maxLat &&
    p.lng >= SERVICE_REGION.minLng && p.lng <= SERVICE_REGION.maxLng
  );
}

/** Formats a distance for a glanceable field readout. */
export function formatDistance(km) {
  if (!Number.isFinite(km)) return '—';
  if (km < 0.95) return `${Math.round(km * 1000 / 10) * 10} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
