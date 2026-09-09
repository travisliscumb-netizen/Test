/**
 * Map — full screen.
 *
 * The list and the map are two views of the same ordered route, and moving
 * between them preserves selection, so tapping a pin and then switching to the
 * list leaves you looking at the same stop. The camera is never snapped: every
 * move is a spring, because an instant jump destroys the sense of where you
 * just were.
 */

import { h, svg, ICON, clear } from '../dom.js';
import { MapEngine } from '../map/engine.js';
import { formatDistance } from '../../core/geo.js';
import { roadKm } from '../../routing/metric.js';
import { canNavigate } from '../../services/navigation.js';
import { haptic } from '../motion/haptics.js';

export class MapScreen {
  constructor(ctx) { this.ctx = ctx; this.engine = null; this.following = false; }

  mount(container) {
    this.el = h('div.page.flush', { style: { position: 'absolute', inset: 0, display: 'block' } });
    const wrap = h('div.mapwrap.mapfull');
    const canvas = h('canvas', { 'aria-label': 'Route map' });
    wrap.appendChild(canvas);

    // Two controls, bottom right, where a thumb reaches on a 6-inch phone.
    // Zoom buttons are gone: pinch and double-tap both already work, and four
    // stacked squares in the top corner were chrome nobody could reach anyway.
    wrap.appendChild(h('div.mapctl', null,
      this.followBtn = h('button.iconbtn', {
        type: 'button', 'aria-label': 'Centre on my location',
        onclick: () => this.toggleFollow(),
      }, svg(ICON.target, { size: 20 })),
      h('button.iconbtn', {
        type: 'button', 'aria-label': 'Frame the whole route',
        onclick: () => { haptic('tap'); this.wide = !this.wide; this.frame({ animate: true }); this.following = false; this.syncFollow(); },
      }, svg(ICON.layers, { size: 20 }))
    ));

    // The colour key is replaced by what the operator actually wants read off
    // the map: how much of the day is left and how far it is.
    wrap.appendChild(this.status = h('div.mapstatus'));
    wrap.appendChild(this.attr = h('div.mapattr'));
    this.el.appendChild(wrap);
    this.el.appendChild(this.sel = h('div.mapsel'));
    container.appendChild(this.el);

    this.engine = new MapEngine(canvas, { theme: this.ctx.theme, tiles: this.ctx.settings.mapTiles });
    this.engine.addEventListener('select', (e) => { haptic('select'); this.select(e.detail); });
    this.engine.addEventListener('deselect', () => this.select(null));
    // The canvas already states this, at the top where nothing collides with
    // it; duplicating it in the attribution line produced two overlapping
    // messages along the bottom edge.
    this.engine.addEventListener('tiles-unavailable', () => { this.attr.textContent = ''; });

    this.update();
    requestAnimationFrame(() => this.frame({ animate: false }));
    return this.el;
  }

  unmount() { this.engine?.destroy(); this.el?.remove(); }

  /** Frame on the work in hand by default; the whole route on demand. */
  frame({ animate = true } = {}) {
    const pad = { padding: 46, padTop: 74, padBottom: this.selected ? 250 : 150 };
    if (this.wide) this.engine.fitRoute({ ...pad, animate });
    else this.engine.fitFocus({ currentIndex: this.ctx.currentIndex, ...pad, animate });
  }

  renderStatus() {
    const stops = this.ctx.stops || [];
    const remaining = stops.filter((s) => s.status === 'pending');
    const done = stops.filter((s) => s.status === 'done').length;
    const km = remainingKm(this.ctx, remaining);
    clear(this.status);
    if (!stops.length) return;
    // Two deliberate lines rather than one that wraps wherever it happens to
    // run out of room next to the controls.
    this.status.append(
      h('div.mapstatus-lab', { text: this.wide ? 'The whole day' : 'Around you now' }),
      h('div.mapstatus-line', { text: remaining.length === 0
        ? `All ${stops.length} stops done`
        : `${remaining.length} to go · ${done} done` }),
      remaining.length && km
        ? h('div.mapstatus-sub', { text: `${formatDistance(km)} still to drive` })
        : null
    );
  }

  update() {
    if (!this.engine) return;
    if (this.status) this.renderStatus();
    this.engine.setTheme(this.ctx.theme);
    this.engine.setTileSource(this.ctx.settings.mapTiles);
    this.engine.setRoute({ stops: this.ctx.stops, currentIndex: this.ctx.currentIndex });
    const pos = this.ctx.location?.position;
    if (pos) this.engine.setUserLocation(pos);
    if (this.following && pos) this.engine.flyTo(pos.lat, pos.lng, undefined, { animate: true });
    this.attr.textContent = this.engine.tileSuccesses > 0 ? this.engine.attribution() : '';
    this.syncFollow();
    this.renderSelection();
  }

  toggleFollow() {
    const pos = this.ctx.location?.position;
    if (!pos) {
      this.ctx.requestLocation();
      return;
    }
    this.following = !this.following;
    haptic('tap');
    if (this.following) this.engine.flyTo(pos.lat, pos.lng, Math.max(15, this.engine.camZ.target), { animate: true });
    this.syncFollow();
  }

  syncFollow() {
    if (!this.followBtn) return;
    this.followBtn.dataset.on = String(this.following);
  }

  select(stop) {
    this.selected = stop;
    this.engine.setSelected(stop?.id ?? null);
    // Off-centre on purpose: the panel that is about to rise covers the lower
    // third, so the pin is flown to the middle of what will still be visible.
    if (stop && Number.isFinite(stop.lat)) {
      this.engine.fitBounds({ minLat: stop.lat, maxLat: stop.lat, minLng: stop.lng, maxLng: stop.lng },
        { padding: 46, padTop: 74, padBottom: 250, maxZoom: 16.6, animate: true });
    }
    this.renderSelection();
  }

  renderSelection() {
    clear(this.sel);
    const stop = this.selected && this.ctx.stops.find((s) => s.id === this.selected.id);
    this.sel.dataset.open = String(!!stop);
    if (!stop) return;
    const dist = this.ctx.location?.fresh ? this.ctx.location.distanceKmTo(stop) : null;
    const idx = this.ctx.stops.indexOf(stop);

    // Same masthead-then-keys shape as the dossier, raised off the map on a
    // scrim rather than boxed in a card, so the map stays the subject.
    this.sel.append(
      h('div.mapsel-head', null,
        h('div.masthead-eyebrow', { dataset: { status: stop.status },
          text: `Stop ${idx + 1} of ${this.ctx.stops.length} · ${statusLabel(stop.status)}` }),
        h('button.link.dim', { type: 'button', text: 'Close', onclick: () => this.select(null) })),
      h('div.mapsel-addr', { text: stop.address }),
      h('div.mapsel-facts', { text: [
        dist != null ? `${formatDistance(dist)} away` : null,
        stop.city && stop.city !== 'Barrie' ? stop.city : null,
        stop.pushMow ? 'Push mow' : null,
      ].filter(Boolean).join(' · ') }),
      h('div.live-act', null,
        h('button.act.act-nav', { type: 'button', disabled: !canNavigate(stop),
          onclick: () => this.ctx.navigate(stop) }, svg(ICON.nav, { size: 20 }), 'Navigate'),
        stop.status === 'pending'
          ? h('button.act.act-done', { type: 'button',
              onclick: (e) => this.ctx.completeStop(stop, e.currentTarget) }, svg(ICON.check, { size: 20 }), 'Done')
          : h('button.act.act-nav', { type: 'button',
              onclick: () => this.ctx.openProperty(stop) }, 'Open details')),
      stop.status === 'pending'
        ? h('button.link', { type: 'button', text: 'Everything about this property', onclick: () => this.ctx.openProperty(stop) })
        : null
    );
  }
}

/**
 * Driving distance still to cover, in the order the day is actually in. Uses
 * the same detour factor the optimiser uses, so the figure on the map and the
 * figure the routing engine plans against are the same number.
 */
function remainingKm(ctx, remaining) {
  const pts = [];
  const here = ctx.location?.fresh ? ctx.location.position : null;
  if (here) pts.push(here);
  for (const s of remaining) if (Number.isFinite(s.lat)) pts.push(s);
  if (pts.length < 2) return 0;
  let km = 0;
  for (let i = 1; i < pts.length; i += 1) km += roadKm(pts[i - 1], pts[i]);
  return km;
}

function statusLabel(s) {
  return s === 'done' ? 'Complete' : s === 'skipped' ? 'Skipped' : s === 'pushed' ? 'Pushed' : 'Remaining';
}
