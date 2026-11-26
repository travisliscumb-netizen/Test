// Minimal ArcGIS REST query client for build tools (Node 22+, global fetch).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function getJson(url, params = {}, { retries = 3, timeoutMs = 60_000 } = {}) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${u}`);
      const body = await res.json();
      if (body && body.error) throw new Error(`ArcGIS error ${JSON.stringify(body.error)} for ${u}`);
      return body;
    } catch (e) {
      lastErr = e;
      await sleep(800 * 2 ** attempt);
    }
  }
  throw lastErr;
}

/**
 * Query every feature matching `where` (paginated), returned as GeoJSON features
 * in WGS84. `pageSize` must not exceed the layer's maxRecordCount.
 */
export async function queryAll(layerUrl, { where = '1=1', outFields = '*', geometry, pageSize = 1000, returnGeometry = true, orderBy = 'OBJECTID' } = {}) {
  const out = [];
  for (let offset = 0; ; offset += pageSize) {
    const params = {
      where,
      outFields,
      outSR: '4326',
      returnGeometry: String(returnGeometry),
      orderByFields: orderBy,
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      f: 'geojson',
    };
    if (geometry) {
      params.geometry = geometry;
      params.geometryType = 'esriGeometryEnvelope';
      params.inSR = '4326';
      params.spatialRel = 'esriSpatialRelIntersects';
    }
    const page = await getJson(`${layerUrl}/query`, params);
    const feats = page.features ?? [];
    out.push(...feats);
    const more = page.exceededTransferLimit || page.properties?.exceededTransferLimit;
    if (feats.length < pageSize && !more) break;
    if (feats.length === 0) break;
  }
  return out;
}

export const CITY = {
  roads: 'https://services3.arcgis.com/C964zBpHgJUpj4d0/arcgis/rest/services/BarrieRoadSegments_View/FeatureServer/0',
  plows: 'https://services3.arcgis.com/C964zBpHgJUpj4d0/arcgis/rest/services/BarriePlowLocations_View/FeatureServer/0',
  addresses: 'https://services3.arcgis.com/C964zBpHgJUpj4d0/arcgis/rest/services/COB_ADDRESS_POINT/FeatureServer/0',
  parcels: 'https://gispublic.barrie.ca/arcgis/rest/services/Open_Data/ParcelPublishing/MapServer/2',
  driveways: 'https://gispublic.barrie.ca/arcgis/rest/services/Open_Data/ExternalData/MapServer/6',
};
