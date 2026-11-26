// City of Barrie winter-operations feeds (public ArcGIS layers, CORS-open).
//
// What the data IS (verified 2026-11-26 against the services themselves):
//  - BarrieRoadSegments_View.LASTSERVICED: the most recent time a segment was
//    "plowed OR treated (brine, salt, sand)" (the City's own item description).
//    It is overwritten; the service keeps no history. It does NOT say which.
//  - BarriePlowLocations_View: VEHICLEID, DATETIME, point. No vehicle type, no
//    blade/spreader state. The view is filtered to DATETIME IS NOT NULL and is
//    empty when no units are reporting.
// So nothing here may be presented as "plowed". It is "serviced", with the
// kind unknown, until a driver observation says otherwise.

export const ROADS_URL =
  'https://services3.arcgis.com/C964zBpHgJUpj4d0/arcgis/rest/services/BarrieRoadSegments_View/FeatureServer/0';
export const PLOWS_URL =
  'https://services3.arcgis.com/C964zBpHgJUpj4d0/arcgis/rest/services/BarriePlowLocations_View/FeatureServer/0';

export interface ServiceSnapshot {
  /** segment OBJECTID -> LASTSERVICED ms */
  serviced: Map<number, number>;
  /** when we fetched it */
  checkedAt: number;
  /** newest LASTSERVICED anywhere in the city */
  newest: number | null;
}

export interface VehiclePing {
  vehicle: string;
  t: number;
  lng: number;
  lat: number;
}

export interface VehicleSnapshot {
  pings: VehiclePing[];
  checkedAt: number;
}

export type FeedError = { kind: 'offline' | 'timeout' | 'http' | 'format'; message: string };

export class CityFeedError extends Error {
  readonly detail: FeedError;
  constructor(detail: FeedError) {
    super(detail.message);
    this.detail = detail;
  }
}

async function getJson(url: string, timeoutMs: number, fetchImpl: typeof fetch): Promise<any> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CityFeedError({ kind: 'offline', message: 'Phone is offline' });
  }
  let res: Response;
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
  } catch (e) {
    const name = (e as Error)?.name;
    throw new CityFeedError({ kind: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'offline', message: String(e) });
  }
  if (!res.ok) throw new CityFeedError({ kind: 'http', message: `City server answered ${res.status}` });
  let body: any;
  try {
    body = await res.json();
  } catch {
    throw new CityFeedError({ kind: 'format', message: 'City server sent unreadable data' });
  }
  if (body?.error) throw new CityFeedError({ kind: 'http', message: `City server error ${body.error.code ?? ''}` });
  return body;
}

function q(base: string, params: Record<string, string>): string {
  const u = new URL(`${base}/query`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

export async function fetchServiceStatus(fetchImpl: typeof fetch = fetch, timeoutMs = 20_000): Promise<ServiceSnapshot> {
  const serviced = new Map<number, number>();
  let newest: number | null = null;
  for (let offset = 0; offset < 20_000; offset += 2000) {
    const body = await getJson(
      q(ROADS_URL, {
        where: 'LASTSERVICED IS NOT NULL',
        outFields: 'OBJECTID,LASTSERVICED',
        returnGeometry: 'false',
        orderByFields: 'OBJECTID',
        resultOffset: String(offset),
        resultRecordCount: '2000',
        f: 'json',
      }),
      timeoutMs,
      fetchImpl,
    );
    if (!Array.isArray(body?.features)) throw new CityFeedError({ kind: 'format', message: 'Unexpected road status format' });
    for (const f of body.features) {
      const id = f?.attributes?.OBJECTID;
      const t = f?.attributes?.LASTSERVICED;
      if (Number.isInteger(id) && Number.isFinite(t)) {
        serviced.set(id, t);
        if (newest === null || t > newest) newest = t;
      }
    }
    if (!body.exceededTransferLimit && body.features.length < 2000) break;
  }
  return { serviced, checkedAt: Date.now(), newest };
}

export async function fetchVehicles(fetchImpl: typeof fetch = fetch, timeoutMs = 20_000): Promise<VehicleSnapshot> {
  const body = await getJson(
    q(PLOWS_URL, { where: '1=1', outFields: 'VEHICLEID,DATETIME', returnGeometry: 'true', outSR: '4326', resultRecordCount: '2000', f: 'json' }),
    timeoutMs,
    fetchImpl,
  );
  if (!Array.isArray(body?.features)) throw new CityFeedError({ kind: 'format', message: 'Unexpected vehicle format' });
  const pings: VehiclePing[] = [];
  for (const f of body.features) {
    const v = f?.attributes?.VEHICLEID;
    const t = f?.attributes?.DATETIME;
    const x = f?.geometry?.x;
    const y = f?.geometry?.y;
    if (v != null && Number.isFinite(t) && Number.isFinite(x) && Number.isFinite(y)) pings.push({ vehicle: String(v), t, lng: x, lat: y });
  }
  return { pings, checkedAt: Date.now() };
}

/** Service events = (segment, time) pairs that appeared since the previous snapshot. */
export function diffService(prev: Map<number, number> | null, next: Map<number, number>): { seg: number; t: number }[] {
  const out: { seg: number; t: number }[] = [];
  for (const [seg, t] of next) {
    const p = prev?.get(seg);
    if (p === undefined || t > p) out.push({ seg, t });
  }
  return out;
}

export type Freshness = 'live' | 'recent' | 'stale' | 'none';

/** How much to trust a feed snapshot, by its age. */
export function freshness(checkedAt: number | null, now: number): Freshness {
  if (checkedAt === null || checkedAt === undefined || !Number.isFinite(checkedAt)) return 'none';
  const age = now - checkedAt;
  if (age < 3 * 60_000) return 'live';
  if (age < 15 * 60_000) return 'recent';
  return 'stale';
}
