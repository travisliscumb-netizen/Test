// Environment and Climate Change Canada data (Open Government Licence – Canada).
//
// Why not a forecast-model API: on 2026-11-24 the Open-Meteo model showed zero
// snowfall in Barrie while ECCC's Egbert CS station recorded 5 mm of
// precipitation and 10 cm on the ground. Radar and station observations, not
// model fields, drive this app.

export const RADAR_LAYER = 'RADAR_1KM_RSNO'; // radar precipitation rate for snow, cm/h, 6-minute cadence
const GEOMET = 'https://geo.weather.gc.ca/geomet';

/** MapLibre raster tile template for the snow-rate radar mosaic. */
export function radarTileUrl(): string {
  return `${GEOMET}?service=WMS&version=1.3.0&request=GetMap&layers=${RADAR_LAYER}&styles=&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png&transparent=true`;
}

export interface RadarSample {
  /** cm/h of snow at the point (0 when nothing is detected) */
  cmPerHour: number;
  label: string;
  /** radar scan time, ms */
  scanAt: number;
  checkedAt: number;
}

export async function radarAt(lng: number, lat: number, fetchImpl: typeof fetch = fetch): Promise<RadarSample> {
  const d = 0.02;
  const u = new URL(GEOMET);
  const params: Record<string, string> = {
    service: 'WMS',
    version: '1.3.0',
    request: 'GetFeatureInfo',
    layers: RADAR_LAYER,
    query_layers: RADAR_LAYER,
    crs: 'EPSG:4326',
    bbox: `${lat - d},${lng - d},${lat + d},${lng + d}`,
    width: '11',
    height: '11',
    i: '5',
    j: '5',
    info_format: 'application/json',
  };
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetchImpl(u, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`radar ${res.status}`);
  const body = await res.json();
  const p = body?.features?.[0]?.properties;
  if (!p) throw new Error('radar: no data at point');
  const v = Number(p.value);
  return {
    cmPerHour: Number.isFinite(v) ? v : 0,
    label: String(p.class ?? ''),
    scanAt: Date.parse(p.time) || Date.now(),
    checkedAt: Date.now(),
  };
}

export function describeRate(cmPerHour: number): string {
  if (cmPerHour <= 0) return 'No snow on radar';
  if (cmPerHour < 0.5) return 'Light snow';
  if (cmPerHour < 2) return 'Moderate snow';
  if (cmPerHour < 4) return 'Heavy snow';
  return 'Very heavy snow';
}

export interface StationObs {
  station: string;
  airTempC: number | null;
  observedAt: number;
}

/**
 * Latest surface observation from the nearest ECCC SWOB station to Barrie.
 * Returns null rather than throwing when the service is unreachable.
 */
export async function stationNow(fetchImpl: typeof fetch = fetch): Promise<StationObs | null> {
  try {
    const u = 'https://api.weather.gc.ca/collections/swob-realtime/items?f=json&limit=6&sortby=-date_tm-value&bbox=-79.95,44.25,-79.45,44.6';
    const res = await fetchImpl(u, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const body = await res.json();
    for (const f of body?.features ?? []) {
      const p = f.properties ?? {};
      const temp = Number(p['air_temp'] ?? p['air_temp-value']);
      const at = Date.parse(p['date_tm-value'] ?? p['obs_date_tm'] ?? '');
      if (Number.isFinite(temp) && Number.isFinite(at)) {
        return { station: String(p['stn_nam-value'] ?? 'ECCC station'), airTempC: temp, observedAt: at };
      }
    }
    return null;
  } catch {
    return null;
  }
}
