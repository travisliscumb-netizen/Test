// The tactical map: MapLibre GL with a basemap built from the City's own road
// network (bundled, so it renders with no tile server and no signal), plus
// optional City 2023 orthophoto and ECCC snow radar overlays.
//
// Live City status is applied as per-segment feature-state, so a refresh
// changes a few hundred numbers instead of re-uploading geometry.

import maplibregl, { type Map as MLMap, type GeoJSONSource, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type * as GeoJSON from 'geojson';
import type { RoadsDoc, Stop } from '../data/schema.ts';
import type { LngLat } from '../core/geo.ts';
import { bboxOf } from '../core/geo.ts';
import { radarTileUrl } from '../intel/weather.ts';
import type { StopStatus } from '../data/events.ts';

const ORTHO = 'https://gisapps.barrie.ca/image/rest/services/Public/Barrie_Ortho_2023_10cm_Cache_WebMercator/MapServer/tile/{z}/{y}/{x}';

export const COLORS = {
  void: '#04070c',
  road: '#16263a',
  roadHi: '#22384f',
  casing: '#08111c',
  label: '#7f95ad',
  ice: '#7fe9ff',
  done: '#6cffb4',
  note: '#ffb84d',
  blocked: '#ff5c7a',
  city: '#b79cff',
};

type FC = GeoJSON.FeatureCollection;

export interface MapApi {
  map: MLMap;
  ready: Promise<void>;
  setStops(stops: Stop[], status: Map<number, StopStatus>, next: number | null, order: number[]): void;
  setSpine(coords: LngLat[]): void;
  setTractor(pos: LngLat | null, heading: number | null, accuracy: number | null): void;
  setServiceAges(serviced: Map<number, number>, opStart: number | null, now: number): void;
  setVehicles(trails: { vehicle: string; coords: LngLat[]; last: number }[], now: number): void;
  setImagery(on: boolean): void;
  setRadar(on: boolean, stamp: number): void;
  follow(pos: LngLat, heading: number | null, drive: boolean): void;
  overview(points: LngLat[], bottomPad?: number): void;
  resize(): void;
}

function style(): StyleSpecification {
  return {
    version: 8,
    glyphs: `${location.origin}/fonts/{fontstack}/{range}.pbf`,
    sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': COLORS.void } }],
  };
}

export function createMap(container: HTMLElement, roads: RoadsDoc, stops: Stop[], onSourceError?: (source: string) => void): MapApi {
  const bb = bboxOf(stops.map((s) => s.target), 300);
  const map = new maplibregl.Map({
    container,
    style: style(),
    bounds: [bb.w, bb.s, bb.e, bb.n],
    attributionControl: false,
    pitchWithRotate: true,
    dragRotate: true,
    maxZoom: 21.5,
    minZoom: 11,
    fadeDuration: 0,
    // Battery: render only when something changes.
    renderWorldCopies: false,
  });
  map.touchZoomRotate.enableRotation();

  const roadFC: FC = {
    type: 'FeatureCollection',
    features: roads.segments.map((s) => ({
      type: 'Feature',
      id: s.id,
      properties: { id: s.id, name: s.name, cls: s.plowClass ?? 'X', route: s.plowRoute ?? 0 },
      geometry: s.lines.length === 1 ? { type: 'LineString', coordinates: s.lines[0] } : { type: 'MultiLineString', coordinates: s.lines },
    })),
  };

  const parcelsFC: FC = {
    type: 'FeatureCollection',
    features: stops.filter((s) => s.parcel).map((s) => ({ type: 'Feature', properties: { seq: s.seq }, geometry: { type: 'Polygon', coordinates: [s.parcel!] } })),
  };
  const drivewaysFC = (status?: Map<number, StopStatus>, next?: number | null): FC => ({
    type: 'FeatureCollection',
    features: stops.flatMap((s) =>
      s.driveways.map((d) => ({
        type: 'Feature' as const,
        properties: { seq: s.seq, st: s.seq === next ? 'next' : (status?.get(s.seq) ?? 'pending') },
        geometry: { type: 'Polygon' as const, coordinates: [d.polygon] },
      })),
    ),
  });

  map.on('error', (e: { sourceId?: string }) => {
    if (e.sourceId && onSourceError) onSourceError(e.sourceId);
  });
  let radarStamp = 0;

  const ready = new Promise<void>((resolve) => {
    map.on('load', () => {
      map.addSource('ortho', { type: 'raster', tiles: [ORTHO], tileSize: 256, minzoom: 11, maxzoom: 22, attribution: 'Imagery © City of Barrie (2023)' });
      map.addLayer({ id: 'ortho', type: 'raster', source: 'ortho', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.82, 'raster-brightness-max': 0.62, 'raster-saturation': -0.35, 'raster-contrast': 0.08 } });

      map.addSource('roads', { type: 'geojson', data: roadFC, promoteId: 'id' });
      map.addLayer({
        id: 'road-casing',
        type: 'line',
        source: 'roads',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': COLORS.casing, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, 2, 16, 14, 19, 48, 21, 120] },
      });
      map.addLayer({
        id: 'road',
        type: 'line',
        source: 'roads',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['match', ['get', 'cls'], 'P', COLORS.roadHi, 'S', '#1c3047', COLORS.road],
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, 1, 16, 10, 19, 40, 21, 104],
        },
      });
      // City service glow: brightest for the last 2 h, fading to 12 h; none otherwise.
      map.addLayer({
        id: 'road-service',
        type: 'line',
        source: 'roads',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': COLORS.city,
          'line-blur': ['interpolate', ['linear'], ['zoom'], 13, 1, 18, 6],
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, 1.5, 16, 5, 19, 14, 21, 30],
          'line-opacity': [
            'case',
            ['==', ['coalesce', ['feature-state', 'age'], -1], -1],
            0,
            ['interpolate', ['linear'], ['feature-state', 'age'], 0, 0.95, 120, 0.7, 480, 0.3, 720, 0.12, 721, 0],
          ],
        },
      });
      map.addLayer({
        id: 'road-label',
        type: 'symbol',
        source: 'roads',
        minzoom: 14.5,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 15, 10, 19, 15],
          'text-letter-spacing': 0.18,
          'text-max-angle': 30,
          'symbol-spacing': 320,
        },
        paint: { 'text-color': COLORS.label, 'text-halo-color': COLORS.void, 'text-halo-width': 1.6 },
      });

      map.addSource('parcels', { type: 'geojson', data: parcelsFC });
      map.addLayer({ id: 'parcel', type: 'line', source: 'parcels', minzoom: 15.5, paint: { 'line-color': '#2b4560', 'line-width': 1, 'line-dasharray': [2, 2], 'line-opacity': 0.8 } });

      map.addSource('driveways', { type: 'geojson', data: drivewaysFC() });
      map.addLayer({
        id: 'driveway',
        type: 'fill',
        source: 'driveways',
        minzoom: 15,
        paint: {
          'fill-color': ['match', ['get', 'st'], 'next', COLORS.ice, 'done', COLORS.done, 'deferred', COLORS.note, 'blocked', COLORS.blocked, '#2d5b78'],
          'fill-opacity': ['match', ['get', 'st'], 'next', 0.55, 'done', 0.28, 0.32],
        },
      });
      map.addLayer({
        id: 'driveway-edge',
        type: 'line',
        source: 'driveways',
        minzoom: 15,
        paint: { 'line-color': ['match', ['get', 'st'], 'next', COLORS.ice, 'done', COLORS.done, '#3d7fa3'], 'line-width': ['match', ['get', 'st'], 'next', 2, 1] },
      });

      // The radar is a 1 km product: a few z9 tiles cover the whole city and
      // are stretched for closer zooms — far fewer requests to ECCC than one
      // per street-level tile, so far fewer chances for one to fail.
      map.addSource('radar', { type: 'raster', tiles: [radarTileUrl()], tileSize: 256, maxzoom: 9, attribution: 'Radar © ECCC' });
      map.addLayer({ id: 'radar', type: 'raster', source: 'radar', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.7, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' } });

      map.addSource('vehicles', { type: 'geojson', data: empty() });
      map.addLayer({
        id: 'vehicle-trail',
        type: 'line',
        source: 'vehicles',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': COLORS.city, 'line-width': 2.5, 'line-opacity': ['interpolate', ['linear'], ['get', 'age'], 0, 0.9, 60, 0.15] },
      });
      map.addLayer({
        id: 'vehicle',
        type: 'circle',
        source: 'vehicles',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 7, 'circle-color': COLORS.city, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5, 'circle-opacity': ['interpolate', ['linear'], ['get', 'age'], 0, 1, 60, 0.35] },
      });

      map.addSource('spine', { type: 'geojson', data: empty(), lineMetrics: true });
      map.addLayer({
        id: 'spine-glow',
        type: 'line',
        source: 'spine',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': COLORS.ice, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 4, 18, 16], 'line-blur': 8, 'line-opacity': 0.35 },
      });
      map.addLayer({
        id: 'spine',
        type: 'line',
        source: 'spine',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2, 18, 5],
          'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(127,233,255,1)', 0.35, 'rgba(127,233,255,0.75)', 1, 'rgba(127,233,255,0.08)'],
        },
      });

      map.addSource('stops', { type: 'geojson', data: empty() });
      map.addLayer({
        id: 'stop-dot',
        type: 'circle',
        source: 'stops',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, ['match', ['get', 'st'], 'next', 6, 3], 18, ['match', ['get', 'st'], 'next', 13, 9]],
          'circle-color': ['match', ['get', 'st'], 'next', COLORS.ice, 'done', COLORS.done, 'deferred', COLORS.note, 'blocked', COLORS.blocked, COLORS.void],
          'circle-stroke-color': ['match', ['get', 'st'], 'done', COLORS.done, 'deferred', COLORS.note, 'blocked', COLORS.blocked, COLORS.ice],
          'circle-stroke-width': ['match', ['get', 'st'], 'next', 3, 1.5],
          'circle-opacity': ['match', ['get', 'st'], 'done', 0.55, 1],
        },
      });
      map.addLayer({
        id: 'stop-label',
        type: 'symbol',
        source: 'stops',
        minzoom: 15,
        layout: {
          'text-field': ['to-string', ['get', 'seq']],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 15, 10, 19, 15],
          'text-offset': [0, -1.35],
          'text-allow-overlap': false,
          'symbol-sort-key': ['get', 'rank'],
        },
        paint: {
          'text-color': ['match', ['get', 'st'], 'next', COLORS.ice, 'done', COLORS.done, 'deferred', COLORS.note, 'blocked', COLORS.blocked, '#cfe6ff'],
          'text-halo-color': COLORS.void,
          'text-halo-width': 2,
        },
      });

      map.addSource('tractor', { type: 'geojson', data: empty() });
      map.addLayer({
        id: 'tractor-acc',
        type: 'circle',
        source: 'tractor',
        paint: {
          'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 10, ['/', ['get', 'accPx10'], 1], 22, ['*', ['get', 'accPx10'], 4096]],
          'circle-color': COLORS.ice,
          'circle-opacity': 0.08,
          'circle-stroke-color': COLORS.ice,
          'circle-stroke-opacity': 0.25,
          'circle-stroke-width': 1,
          'circle-pitch-alignment': 'map',
        },
      });
      resolve();
    });
  });

  // Tractor: a DOM marker so its chevron can rotate smoothly with CSS.
  const tractorEl = document.createElement('div');
  tractorEl.className = 'tractor';
  tractorEl.innerHTML = `<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><defs><radialGradient id="tg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#7fe9ff" stop-opacity=".55"/><stop offset="1" stop-color="#7fe9ff" stop-opacity="0"/></radialGradient></defs><circle cx="24" cy="24" r="23" fill="url(#tg)"/><path d="M24 7 L35 37 L24 31 L13 37 Z" fill="#e8f4ff" stroke="#04070c" stroke-width="2" stroke-linejoin="round"/></svg>`;
  const tractor = new maplibregl.Marker({ element: tractorEl, rotationAlignment: 'map', pitchAlignment: 'map' });
  let tractorOn = false;

  const api: MapApi = {
    map,
    ready,
    setStops(all, status, next, order) {
      const rank = new Map(order.map((s, i) => [s, i]));
      const fc: FC = {
        type: 'FeatureCollection',
        features: all.map((s) => ({
          type: 'Feature',
          properties: { seq: s.seq, st: s.seq === next ? 'next' : (status.get(s.seq) ?? 'pending'), rank: s.seq === next ? -1 : (rank.get(s.seq) ?? 999) },
          geometry: { type: 'Point', coordinates: s.target },
        })),
      };
      void ready.then(() => {
        (map.getSource('stops') as GeoJSONSource).setData(fc);
        (map.getSource('driveways') as GeoJSONSource).setData(drivewaysFC(status, next));
      });
    },
    setSpine(coords) {
      void ready.then(() => {
        (map.getSource('spine') as GeoJSONSource).setData(
          coords.length >= 2 ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] } : empty(),
        );
      });
    },
    setTractor(pos, heading, accuracy) {
      if (!pos) {
        if (tractorOn) tractor.remove();
        tractorOn = false;
        return;
      }
      tractor.setLngLat(pos);
      tractor.setRotation(heading ?? 0);
      tractorEl.classList.toggle('no-heading', heading === null);
      if (!tractorOn) {
        tractor.addTo(map);
        tractorOn = true;
      }
      void ready.then(() => {
        // radius in px at zoom 10 for `accuracy` metres at this latitude
        const mpp10 = (156543.03392 * Math.cos((pos[1] * Math.PI) / 180)) / 2 ** 10;
        (map.getSource('tractor') as GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', properties: { accPx10: (accuracy ?? 10) / mpp10 }, geometry: { type: 'Point', coordinates: pos } }],
        });
      });
    },
    setServiceAges(serviced, opStart, now) {
      void ready.then(() => {
        for (const s of roads.segments) {
          const t = serviced.get(s.id);
          // Only show service inside the current operation (or the last 12 h).
          const relevant = t !== undefined && (opStart === null ? now - t < 12 * 3600_000 : t >= opStart);
          map.setFeatureState({ source: 'roads', id: s.id }, { age: relevant ? Math.max(0, (now - t!) / 60_000) : -1 });
        }
      });
    },
    setVehicles(trails, now) {
      const features: GeoJSON.Feature[] = [];
      for (const tr of trails) {
        const age = (now - tr.last) / 60_000;
        if (tr.coords.length >= 2) features.push({ type: 'Feature', properties: { age, v: tr.vehicle }, geometry: { type: 'LineString', coordinates: tr.coords } });
        features.push({ type: 'Feature', properties: { age, v: tr.vehicle }, geometry: { type: 'Point', coordinates: tr.coords[tr.coords.length - 1] } });
      }
      void ready.then(() => (map.getSource('vehicles') as GeoJSONSource).setData({ type: 'FeatureCollection', features }));
    },
    setImagery(on) {
      void ready.then(() => map.setLayoutProperty('ortho', 'visibility', on ? 'visible' : 'none'));
    },
    setRadar(on, stamp) {
      void ready.then(() => {
        map.setLayoutProperty('radar', 'visibility', on ? 'visible' : 'none');
        // New scan (or a retry): point the source at fresh tiles.
        if (on && stamp !== radarStamp) {
          radarStamp = stamp;
          (map.getSource('radar') as maplibregl.RasterTileSource).setTiles([`${radarTileUrl()}&_=${stamp}`]);
        }
      });
    },
    follow(pos, heading, drive) {
      const h = container.clientHeight;
      map.easeTo({
        center: pos,
        bearing: drive && heading !== null ? heading : map.getBearing(),
        pitch: drive ? 52 : map.getPitch(),
        zoom: drive ? Math.max(map.getZoom(), 17.3) : Math.max(map.getZoom(), 16.5),
        padding: drive ? { top: h * 0.38, bottom: 0, left: 0, right: 0 } : { top: 0, bottom: h * 0.6, left: 0, right: 0 },
        duration: 900,
        easing: (t) => t * (2 - t),
        essential: true,
      });
    },
    overview(points, bottomPad = 0) {
      if (!points.length) return;
      const b = bboxOf(points, 60);
      map.fitBounds([b.w, b.s, b.e, b.n], { bearing: 0, pitch: 0, padding: { top: 70, left: 30, right: 100, bottom: 30 + bottomPad }, duration: 900 });
    },
    resize() {
      map.resize();
    },
  };
  return api;
}

function empty(): FC {
  return { type: 'FeatureCollection', features: [] };
}
