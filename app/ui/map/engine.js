/**
 * The map.
 *
 * This is a purpose-built slippy-map renderer rather than Leaflet or MapLibre,
 * and the reason is specific rather than ideological:
 *
 *   - Leaflet places every marker as a DOM node and moves them with CSS during
 *     a pan. At 48 markers plus a route line plus a spring camera on an iPhone
 *     that is a measurable frame cost, and it makes marker state changes
 *     animate as layout rather than on the compositor.
 *   - MapLibre would need a vector style and, in practice, a keyed tile
 *     endpoint, which is a running dependency and a cost this personal app has
 *     no reason to take on.
 *   - Neither gives direct control of the camera integrator, and the camera
 *     is the single most important piece of motion in the product.
 *
 * Everything draws to one canvas: tiles, route, markers, the operator. Tiles
 * are ordinary raster tiles and are cached by the service worker, so a route
 * driven yesterday renders fully offline today. When no tile is available the
 * map degrades to an art-directed ground that says so, rather than to a grey
 * void or — worse — a fabricated street grid.
 */

import {
  lngToNormX, latToNormY, normXToLng, normYToLat,
  boundsOf, padBounds, haversineKm,
} from '../../core/geo.js';
import { Spring, SPRING, ticker, prefersCalm } from '../motion/spring.js';

const TILE = 256;
const MIN_Z = 9;
const MAX_Z = 18;

const TILE_SOURCES = {
  carto: {
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    subdomains: ['a', 'b', 'c', 'd'],
    attribution: '© OpenStreetMap contributors © CARTO',
    maxZoom: 19,
  },
  osm: {
    dark: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    light: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: [''],
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  },
};

export const MARKER_STATE = {
  done: 'done',
  current: 'current',
  next: 'next',
  remaining: 'remaining',
  skipped: 'skipped',
  pushed: 'pushed',
  review: 'review',
};

/** A bounded LRU so a long day of panning cannot grow memory without limit. */
class TileCache {
  constructor(limit = 220) { this.limit = limit; this.map = new Map(); }
  get(k) {
    const v = this.map.get(k);
    if (v) { this.map.delete(k); this.map.set(k, v); }
    return v;
  }
  set(k, v) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value;
      const img = this.map.get(oldest);
      if (img && img.el) img.el.src = '';
      this.map.delete(oldest);
    }
  }
  has(k) { return this.map.has(k); }
  clear() { this.map.clear(); }
}

export class MapEngine extends EventTarget {
  constructor(canvas, opts = {}) {
    super();
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.dpr = 1;
    this.w = 0; this.h = 0;

    this.centre = { lat: opts.lat ?? 44.389, lng: opts.lng ?? -79.69 };
    this.zoom = opts.zoom ?? 13;

    // Camera is expressed in normalised Mercator so panning is linear at every
    // zoom and the springs never have to reason about latitude distortion.
    this.camX = new Spring(lngToNormX(this.centre.lng), SPRING.camera);
    this.camY = new Spring(latToNormY(this.centre.lat), SPRING.camera);
    this.camZ = new Spring(this.zoom, SPRING.camera);

    this.stops = [];
    this.route = [];
    this.currentIndex = -1;
    this.selectedId = null;
    this.user = null;
    this.theme = opts.theme || 'night';
    this.sourceKey = opts.tiles || 'carto';
    this.tilesEnabled = this.sourceKey !== 'none';
    this.interactive = opts.interactive !== false;

    this.tiles = new TileCache();
    this.failedTiles = new Set();
    this.tileFailures = 0;
    this.tileSuccesses = 0;
    this.routeReveal = new Spring(1, SPRING.settle);
    this.pulse = 0;

    this._dirty = true;
    this._stop = null;
    this._ro = null;

    this._bindGestures();
    this._observe();
    this.start();
  }

  // ------------------------------------------------------------------ sizing

  _observe() {
    const fit = () => {
      const r = this.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const w = Math.round(r.width * this.dpr);
      const h = Math.round(r.height * this.dpr);
      if (w === this.canvas.width && h === this.canvas.height) return;
      this.canvas.width = w;
      this.canvas.height = h;
      this.w = r.width; this.h = r.height;
      this.invalidate();
    };
    fit();
    this._ro = new ResizeObserver(fit);
    this._ro.observe(this.canvas);
  }

  // ------------------------------------------------------------- projection

  get scale() { return Math.pow(2, this.camZ.value) * TILE; }

  project(lat, lng) {
    const s = this.scale;
    return {
      x: (lngToNormX(lng) - this.camX.value) * s + this.w / 2,
      y: (latToNormY(lat) - this.camY.value) * s + this.h / 2,
    };
  }

  unproject(px, py) {
    const s = this.scale;
    const nx = (px - this.w / 2) / s + this.camX.value;
    const ny = (py - this.h / 2) / s + this.camY.value;
    return { lat: normYToLat(ny), lng: normXToLng(nx) };
  }

  // ---------------------------------------------------------------- camera

  // Both of these drop the tile cache, so they must no-op when nothing changed:
  // they are called on every render pass, and re-fetching every visible tile
  // each time would be both slow and rude to the tile server.
  setTheme(theme) {
    if (!theme || theme === this.theme) return;
    this.theme = theme;
    this.tiles.clear();
    this.failedTiles.clear();
    this.invalidate();
  }

  setTileSource(key) {
    if (!key || key === this.sourceKey) return;
    this.sourceKey = key;
    this.tilesEnabled = key !== 'none';
    this.tiles.clear();
    this.failedTiles.clear();
    this.tileFailures = 0;
    this.tileSuccesses = 0;
    this.invalidate();
  }

  flyTo(lat, lng, zoom, { animate = true } = {}) {
    const x = lngToNormX(lng), y = latToNormY(lat);
    const z = Math.max(MIN_Z, Math.min(MAX_Z, zoom ?? this.camZ.target));
    if (!animate || prefersCalm()) {
      this.camX.jump(x); this.camY.jump(y); this.camZ.jump(z);
    } else {
      this.camX.to(x); this.camY.to(y); this.camZ.to(z);
    }
    this.invalidate();
  }

  /**
   * Per-side padding matters on a phone: chrome sits along the bottom edge, so
   * a symmetric fit centres the route under the panel that is covering it. The
   * camera is aimed at the middle of the *visible* rectangle instead.
   */
  fitBounds(bounds, { padding = 56, padTop = padding, padBottom = padding, animate = true, maxZoom = 16.5 } = {}) {
    if (!bounds || !this.w || !this.h) return;
    const b = padBounds(bounds, 0.06);
    const x0 = lngToNormX(b.minLng), x1 = lngToNormX(b.maxLng);
    const y0 = latToNormY(b.maxLat), y1 = latToNormY(b.minLat);
    const availW = Math.max(40, this.w - padding * 2);
    const availH = Math.max(40, this.h - padTop - padBottom);
    const spanX = Math.max(1e-9, x1 - x0);
    const spanY = Math.max(1e-9, y1 - y0);
    const z = Math.max(MIN_Z, Math.min(maxZoom, Math.min(
      Math.log2(availW / (spanX * TILE)),
      Math.log2(availH / (spanY * TILE))
    )));

    // Shift the target so the bounds land centred in the visible band rather
    // than in the canvas.
    const scale = TILE * Math.pow(2, z);
    const offsetPx = (padTop - padBottom) / 2;
    const cy = (y0 + y1) / 2 - offsetPx / scale;
    const lat = normYToLat(cy);
    const lng = normXToLng((x0 + x1) / 2);
    this.flyTo(lat, lng, z, { animate });
  }

  fitRoute(opts) {
    const pts = this.stops.filter((s) => Number.isFinite(s.lat));
    if (this.user) pts.push(this.user);
    const b = boundsOf(pts);
    if (b) this.fitBounds(b, opts);
  }

  /**
   * The opening frame: where the work is right now, not the whole week's
   * geography. Fitting 22 stops into a tall phone screen produces a small
   * cluster in a field of nothing; framing you, the stop you are on and the
   * next couple fills the screen with the part that is actually being used.
   */
  fitFocus({ currentIndex = -1, lookahead = 2, ...opts } = {}) {
    const pts = [];
    if (this.user) pts.push(this.user);
    const located = this.stops.filter((s) => Number.isFinite(s.lat));
    if (currentIndex >= 0) {
      const from = located.indexOf(this.stops[currentIndex]);
      if (from >= 0) pts.push(...located.slice(from, from + 1 + lookahead));
    }
    if (pts.length < 2) return this.fitRoute(opts);
    const b = boundsOf(pts);
    if (b) this.fitBounds(b, { maxZoom: 16.8, ...opts });
  }

  zoomBy(delta, anchor) {
    const z = Math.max(MIN_Z, Math.min(MAX_Z, this.camZ.target + delta));
    if (anchor) {
      const before = this.unproject(anchor.x, anchor.y);
      this.camZ.jump(z);
      const after = this.unproject(anchor.x, anchor.y);
      this.camX.jump(this.camX.value + (lngToNormX(before.lng) - lngToNormX(after.lng)));
      this.camY.jump(this.camY.value + (latToNormY(before.lat) - latToNormY(after.lat)));
    } else {
      this.camZ.to(z);
    }
    this.invalidate();
  }

  // ------------------------------------------------------------------- data

  setRoute({ stops = [], currentIndex = -1, animateReveal = false }) {
    this.stops = stops;
    this.currentIndex = currentIndex;
    if (animateReveal && !prefersCalm()) {
      this.routeReveal.jump(0);
      this.routeReveal.set(SPRING.settle).to(1);
    } else {
      this.routeReveal.jump(1);
    }
    this.invalidate();
  }

  setUserLocation(loc) { this.user = loc; this.invalidate(); }
  setSelected(id) { this.selectedId = id; this.invalidate(); }

  // --------------------------------------------------------------- gestures

  _bindGestures() {
    if (!this.interactive) return;
    const c = this.canvas;
    const pointers = new Map();
    let last = null;
    let pinchDist = 0;
    let moved = 0;
    let vx = 0, vy = 0, lastMove = 0;

    const down = (e) => {
      c.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        last = { x: e.clientX, y: e.clientY };
        moved = 0; vx = 0; vy = 0;
        this.camX.jump(this.camX.value); this.camY.jump(this.camY.value);
      } else if (pointers.size === 2) {
        pinchDist = pointerSpread(pointers);
      }
    };

    const move = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const now = performance.now();

      if (pointers.size >= 2) {
        const d = pointerSpread(pointers);
        if (pinchDist > 0 && d > 0) {
          const mid = pointerMid(pointers);
          const rect = c.getBoundingClientRect();
          this.zoomBy(Math.log2(d / pinchDist), { x: mid.x - rect.left, y: mid.y - rect.top });
        }
        pinchDist = d;
        return;
      }
      if (!last) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      moved += Math.abs(dx) + Math.abs(dy);
      const s = this.scale;
      this.camX.jump(this.camX.value - dx / s);
      this.camY.jump(this.camY.value - dy / s);
      const dt = Math.max(8, now - lastMove);
      vx = dx / dt; vy = dy / dt;
      lastMove = now;
      last = { x: e.clientX, y: e.clientY };
      this.invalidate();
    };

    const up = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (pointers.size === 0) {
        if (moved < 8) this._handleTap(e);
        else if (!prefersCalm() && (Math.abs(vx) > 0.15 || Math.abs(vy) > 0.15)) {
          // Inertia: throw the camera and let the spring catch it.
          const s = this.scale;
          this.camX.to(this.camX.value - (vx * 160) / s);
          this.camY.to(this.camY.value - (vy * 160) / s);
          this.camX.set(SPRING.settle); this.camY.set(SPRING.settle);
          this.invalidate();
        }
        last = null;
      }
    };

    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      this.zoomBy(-e.deltaY * 0.0022, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    }, { passive: false });
    c.addEventListener('dblclick', (e) => {
      const rect = c.getBoundingClientRect();
      this.zoomBy(1, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    });
  }

  _handleTap(e) {
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let best = null, bestD = 30;   // generous: this is used with gloves on
    for (const s of this.stops) {
      if (!Number.isFinite(s.lat)) continue;
      const p = this.project(s.lat, s.lng);
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < bestD) { bestD = d; best = s; }
    }
    this.dispatchEvent(new CustomEvent(best ? 'select' : 'deselect', { detail: best || null }));
  }

  // ----------------------------------------------------------------- render

  invalidate() { this._dirty = true; this.start(); }

  start() {
    if (this._stop) return;
    this._stop = ticker.add((dt) => {
      const moving =
        this.camX.advance(dt) | this.camY.advance(dt) | this.camZ.advance(dt) | this.routeReveal.advance(dt);
      this.pulse += dt;
      const wantPulse = this.currentIndex >= 0 && !prefersCalm();
      if (moving || this._dirty || wantPulse) {
        this._dirty = false;
        this._draw();
        return true;
      }
      this._stop = null;
      return false;
    });
  }

  _draw() {
    const { ctx } = this;
    if (!this.w || !this.h) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const css = getComputedStyle(this.canvas);
    const ground = css.getPropertyValue('--map-ground').trim() || '#0c1210';
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, this.w, this.h);

    const drewTiles = this.tilesEnabled ? this._drawTiles(css) : false;
    if (!drewTiles) this._drawFallbackGround(css);

    this._drawRoute(css);
    this._drawMarkers(css);
    if (this.user) this._drawUser(css);
    this._drawScale(css);
  }

  _drawTiles(css) {
    const src = TILE_SOURCES[this.sourceKey];
    if (!src) return false;
    const { ctx } = this;
    const z = Math.max(MIN_Z, Math.min(src.maxZoom, Math.round(this.camZ.value)));
    const worldSize = Math.pow(2, z) * TILE;
    const scale = this.scale / worldSize;
    const n = Math.pow(2, z);

    const originX = this.camX.value * worldSize - this.w / (2 * scale);
    const originY = this.camY.value * worldSize - this.h / (2 * scale);
    const x0 = Math.floor(originX / TILE);
    const y0 = Math.floor(originY / TILE);
    const x1 = Math.floor((originX + this.w / scale) / TILE);
    const y1 = Math.floor((originY + this.h / scale) / TILE);

    let drew = 0, wanted = 0;
    const retina = this.dpr > 1.4 && this.sourceKey === 'carto';

    for (let ty = y0; ty <= y1; ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = x0; tx <= x1; tx++) {
        wanted++;
        const wx = ((tx % n) + n) % n;
        const key = `${this.sourceKey}/${this.theme}/${z}/${wx}/${ty}${retina ? '@2x' : ''}`;
        const px = (tx * TILE - originX) * scale;
        const py = (ty * TILE - originY) * scale;
        const size = TILE * scale + 0.6;   // overlap kills seam shimmer

        let entry = this.tiles.get(key);
        if (!entry && !this.failedTiles.has(key)) entry = this._loadTile(key, src, z, wx, ty, retina);
        if (entry && entry.ready) {
          ctx.drawImage(entry.el, px, py, size, size);
          drew++;
        }
      }
    }
    if (drew === 0) return false;
    // Tiles are designed for general use; a light veil pushes them back so the
    // route reads as the foreground rather than competing with street labels.
    const tint = Number(css.getPropertyValue('--map-tint')) || 1;
    if (tint < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - tint;
      ctx.fillStyle = css.getPropertyValue('--map-ground').trim() || '#0c1210';
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }
    return drew / Math.max(1, wanted) > 0.25;
  }

  _loadTile(key, src, z, x, y, retina) {
    const url = (this.theme === 'day' ? src.light : src.dark)
      .replace('{s}', src.subdomains[(x + y) % src.subdomains.length])
      .replace('{z}', z).replace('{x}', x).replace('{y}', y)
      .replace('{r}', retina ? '@2x' : '');
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.decoding = 'async';
    const entry = { el, ready: false };
    this.tiles.set(key, entry);
    el.onload = () => { entry.ready = true; this.tileSuccesses++; this.invalidate(); };
    el.onerror = () => {
      this.failedTiles.add(key);
      this.tileFailures++;
      if (this.tileFailures > 6 && this.tileSuccesses === 0) {
        this.dispatchEvent(new CustomEvent('tiles-unavailable'));
      }
      this.invalidate();
    };
    el.src = url;
    return entry;
  }

  /**
   * The offline ground.
   *
   * Deliberately abstract. Drawing a plausible-looking street grid would be
   * inventing geography, and a map that invents geography is worse than one
   * that admits it has none. What is drawn instead is a soft corridor around
   * the actual route, which is real information, plus a clear statement of
   * what is missing.
   */
  _drawFallbackGround(css) {
    const { ctx } = this;
    const ink = css.getPropertyValue('--map-ink').trim() || 'rgba(255,255,255,.5)';
    const accent = css.getPropertyValue('--map-route').trim() || '#4ade80';

    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, withAlpha(ink, 0.055));
    g.addColorStop(1, withAlpha(ink, 0.015));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);

    // A soft halo along the route: where the work is, without pretending to
    // know what is between the stops.
    const pts = this.stops.filter((s) => Number.isFinite(s.lat)).map((s) => this.project(s.lat, s.lng));
    if (pts.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of pts) {
        const r = 68;
        const rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        rg.addColorStop(0, withAlpha(accent, 0.075));
        rg.addColorStop(1, withAlpha(accent, 0));
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // A band along the top edge rather than a floating pill: a pill sized to
    // fit the canvas clipped its own text on a narrow phone, and centred, it
    // sat underneath the map controls.
    const label = this.tilesEnabled
      ? 'NO MAP IMAGERY — PIN POSITIONS ARE EXACT'
      : 'MAP IMAGERY OFF — PIN POSITIONS ARE EXACT';
    ctx.save();
    const bandH = 34;
    const grad = ctx.createLinearGradient(0, 0, 0, bandH);
    grad.addColorStop(0, withAlpha(ink, 0.16));
    grad.addColorStop(1, withAlpha(ink, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.w, bandH);
    ctx.font = '700 10px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = withAlpha(ink, 0.8);
    ctx.fillText(label, 16, 15);
    ctx.restore();
  }

  _drawRoute(css) {
    const { ctx } = this;
    const nodes = [];
    if (this.user) nodes.push({ ...this.user, virtual: true, status: 'user' });
    for (const s of this.stops) if (Number.isFinite(s.lat)) nodes.push(s);
    if (nodes.length < 2) return;

    const routeColor = css.getPropertyValue('--map-route').trim() || '#4ade80';
    const doneColor = css.getPropertyValue('--map-route-done').trim() || 'rgba(140,150,145,.4)';
    const reveal = this.routeReveal.value;

    const segs = [];
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1], b = nodes[i];
      const isDone = b.status === 'done' || (a.status === 'done' && b.status === 'done');
      segs.push({ a: this.project(a.lat, a.lng), b: this.project(b.lat, b.lng), done: isDone });
    }
    const shown = Math.ceil(segs.length * reveal);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Completed legs first, underneath: they are context, not the subject.
    ctx.strokeStyle = doneColor;
    ctx.lineWidth = 3;
    ctx.setLineDash([1, 7]);
    ctx.beginPath();
    for (let i = 0; i < shown; i++) {
      const s = segs[i];
      if (!s.done) continue;
      ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y);
    }
    ctx.stroke();

    // Remaining route: a wide soft under-stroke, then the crisp line.
    ctx.setLineDash([]);
    ctx.strokeStyle = withAlpha(routeColor, 0.16);
    ctx.lineWidth = 11;
    ctx.beginPath();
    for (let i = 0; i < shown; i++) {
      const s = segs[i];
      if (s.done) continue;
      ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y);
    }
    ctx.stroke();

    ctx.strokeStyle = routeColor;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    for (let i = 0; i < shown; i++) {
      const s = segs[i];
      if (s.done) continue;
      ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawMarkers(css) {
    const { ctx } = this;
    const palette = {
      done: css.getPropertyValue('--done').trim() || '#3ba368',
      current: css.getPropertyValue('--next').trim() || '#ffb638',
      next: css.getPropertyValue('--next').trim() || '#ffb638',
      remaining: css.getPropertyValue('--accent').trim() || '#4ade80',
      skipped: css.getPropertyValue('--skipped').trim() || '#8b93a5',
      pushed: css.getPropertyValue('--pushed').trim() || '#a98bff',
      review: css.getPropertyValue('--warn').trim() || '#ff9d4d',
    };
    const surface = css.getPropertyValue('--surface').trim() || '#141a17';
    const ink = css.getPropertyValue('--ink').trim() || '#f2f7f3';

    // Painter's order: finished work at the back, the live stop on top.
    const order = ['done', 'skipped', 'pushed', 'remaining', 'review', 'next', 'current'];
    const buckets = new Map(order.map((k) => [k, []]));
    this.stops.forEach((s, i) => {
      if (!Number.isFinite(s.lat)) return;
      const state = markerStateOf(s, i, this.currentIndex);
      buckets.get(state)?.push({ s, i, state });
    });

    for (const key of order) {
      for (const { s, i, state } of buckets.get(key)) {
        const p = this.project(s.lat, s.lng);
        if (p.x < -40 || p.y < -40 || p.x > this.w + 40 || p.y > this.h + 40) continue;
        const selected = this.selectedId === s.id;
        const big = state === 'current' || selected;
        const r = big ? 15 : state === 'done' ? 7.5 : 10;
        const color = palette[state] || palette.remaining;

        if (state === 'current') {
          // A slow breathing ring so the live stop is findable at a glance
          // without being a flashing element in the corner of the eye.
          const t = (Math.sin(this.pulse * 2.1) + 1) / 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 6 + t * 9, 0, Math.PI * 2);
          ctx.fillStyle = withAlpha(color, 0.16 * (1 - t * 0.55));
          ctx.fill();
        }

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.45)';
        ctx.shadowBlur = big ? 12 : 6;
        ctx.shadowOffsetY = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = state === 'done' ? withAlpha(color, 0.85) : color;
        ctx.fill();
        ctx.restore();

        ctx.lineWidth = big ? 3 : 2;
        ctx.strokeStyle = surface;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();

        if (state === 'done') {
          ctx.strokeStyle = surface;
          ctx.lineWidth = 2.2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x - 3.2, p.y);
          ctx.lineTo(p.x - 0.8, p.y + 2.6);
          ctx.lineTo(p.x + 3.4, p.y - 2.8);
          ctx.stroke();
        } else if (r >= 10) {
          ctx.fillStyle = contrastInk(color, surface, ink);
          ctx.font = `800 ${big ? 13 : 11}px -apple-system, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(i + 1), p.x, p.y + 0.5);
        }

        if (state === 'review') {
          ctx.fillStyle = palette.review;
          ctx.beginPath();
          ctx.arc(p.x + r * 0.72, p.y - r * 0.72, 4.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = surface; ctx.lineWidth = 1.6; ctx.stroke();
        }
      }
    }
  }

  _drawUser(css) {
    const { ctx } = this;
    const info = css.getPropertyValue('--info').trim() || '#5fb8ff';
    const surface = css.getPropertyValue('--surface').trim() || '#141a17';
    const p = this.project(this.user.lat, this.user.lng);

    if (Number.isFinite(this.user.accuracy)) {
      // The accuracy circle is drawn to true scale. When GPS is poor the
      // circle is large, and that is the point: the operator can see the
      // uncertainty rather than being told a precise-looking lie.
      const mPerPx = metresPerPixel(this.user.lat, this.camZ.value);
      const rad = this.user.accuracy / mPerPx;
      if (rad > 3) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.min(rad, Math.max(this.w, this.h)), 0, Math.PI * 2);
        ctx.fillStyle = withAlpha(info, 0.11);
        ctx.fill();
        ctx.strokeStyle = withAlpha(info, 0.34);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.save();
    ctx.shadowColor = withAlpha(info, 0.6);
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = info;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = surface;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawScale(css) {
    const { ctx } = this;
    const mPerPx = metresPerPixel(this.centreLat(), this.camZ.value);
    let target = 90 * mPerPx;
    const nice = [10, 25, 50, 100, 200, 500, 1000, 2000, 5000];
    const m = nice.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a), nice[0]);
    const px = m / mPerPx;
    const ink = css.getPropertyValue('--map-ink').trim() || 'rgba(255,255,255,.5)';
    // Top-left: the bottom edge belongs to the legend and the attribution.
    const x = 14, y = 52;
    ctx.save();
    ctx.strokeStyle = withAlpha(ink, 0.75);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + px, y); ctx.lineTo(x + px, y - 5);
    ctx.stroke();
    ctx.font = '600 10px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = withAlpha(ink, 0.85);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(m >= 1000 ? `${m / 1000} km` : `${m} m`, x + 3, y - 8);
    ctx.restore();
  }

  centreLat() { return normYToLat(this.camY.value); }

  attribution() {
    return this.tilesEnabled ? (TILE_SOURCES[this.sourceKey]?.attribution ?? '') : '';
  }

  destroy() {
    this._ro?.disconnect();
    if (this._stop) this._stop();
    this._stop = null;
    this.tiles.clear();
  }
}

function markerStateOf(s, i, currentIndex) {
  if (s.needsLocationReview) return MARKER_STATE.review;
  if (s.status === 'done') return MARKER_STATE.done;
  if (s.status === 'skipped') return MARKER_STATE.skipped;
  if (s.status === 'pushed') return MARKER_STATE.pushed;
  if (i === currentIndex) return MARKER_STATE.current;
  if (i === currentIndex + 1) return MARKER_STATE.next;
  return MARKER_STATE.remaining;
}


function pointerSpread(pointers) {
  const [a, b] = [...pointers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}
function pointerMid(pointers) {
  const [a, b] = [...pointers.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function metresPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

function withAlpha(color, alpha) {
  const c = String(color).trim();
  if (c.startsWith('#')) {
    const hex = c.length === 4
      ? c.slice(1).split('').map((x) => x + x).join('')
      : c.slice(1, 7);
    const n = parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) {
    const [r, g, b] = m[1].split(',').map((v) => parseFloat(v));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return c;
}

function contrastInk(bg, dark, light) {
  const c = String(bg).trim();
  let r = 128, g = 128, b = 128;
  if (c.startsWith('#')) {
    const hex = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1, 7);
    const n = parseInt(hex, 16);
    r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
  }
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.55 ? '#0b120e' : '#ffffff';
}

export { haversineKm };
