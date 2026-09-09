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
import { formatDistance, boundsOf } from '../../core/geo.js';
import { formatDuration } from '../../core/time.js';
import { canNavigate } from '../../services/navigation.js';
import { haptic } from '../motion/haptics.js';

export class MapScreen {
  constructor(ctx) { this.ctx = ctx; this.engine = null; this.following = false; }

  mount(container) {
    this.el = h('div.page.flush', { style: { position: 'absolute', inset: 0, display: 'block' } });
    const wrap = h('div.mapwrap.mapfull');
    const canvas = h('canvas', { 'aria-label': 'Route map' });
    wrap.appendChild(canvas);

    wrap.appendChild(h('div.mapctl', { style: { top: 'var(--s4)' } },
      this.followBtn = h('button.iconbtn', {
        type: 'button', 'aria-label': 'Centre on my location',
        onclick: () => this.toggleFollow(),
      }, svg(ICON.target, { size: 20 })),
      h('button.iconbtn', {
        type: 'button', 'aria-label': 'Fit the whole route',
        onclick: () => { haptic('tap'); this.engine.fitRoute({ animate: true }); this.following = false; this.syncFollow(); },
      }, svg(ICON.layers, { size: 20 })),
      h('button.iconbtn', { type: 'button', 'aria-label': 'Zoom in', onclick: () => this.engine.zoomBy(1) }, h('span', { text: '+', style: { font: '700 22px/1 var(--font-num)' } })),
      h('button.iconbtn', { type: 'button', 'aria-label': 'Zoom out', onclick: () => this.engine.zoomBy(-1) }, h('span', { text: '−', style: { font: '700 22px/1 var(--font-num)' } }))
    ));

    wrap.appendChild(this.legend = h('div.maplegend'));
    wrap.appendChild(this.attr = h('div.mapattr'));
    this.el.appendChild(wrap);
    this.el.appendChild(this.sel = h('div', {
      style: { position: 'absolute', left: 'var(--s4)', right: 'var(--s4)', bottom: 'var(--s4)', zIndex: 5 },
    }));
    container.appendChild(this.el);

    this.engine = new MapEngine(canvas, { theme: this.ctx.theme, tiles: this.ctx.settings.mapTiles });
    this.engine.addEventListener('select', (e) => { haptic('select'); this.select(e.detail); });
    this.engine.addEventListener('deselect', () => this.select(null));
    // The canvas already states this, at the top where nothing collides with
    // it; duplicating it in the attribution line produced two overlapping
    // messages along the bottom edge.
    this.engine.addEventListener('tiles-unavailable', () => { this.attr.textContent = ''; });

    this.update();
    this.renderLegend();
    requestAnimationFrame(() => this.engine.fitRoute({ animate: false }));
    return this.el;
  }

  unmount() { this.engine?.destroy(); this.el?.remove(); }

  renderLegend() {
    // Only the states actually on today's route: a legend explaining colours
    // that are not on screen is noise, and it is what made this wrap.
    const stops = this.ctx.stops || [];
    const has = (st) => stops.some((s) => s.status === st);
    const items = [['--next', 'Current'], ['--accent', 'Remaining']];
    if (has('done')) items.push(['--done', 'Done']);
    if (has('skipped')) items.push(['--skipped', 'Skipped']);
    if (has('pushed')) items.push(['--pushed', 'Pushed']);
    clear(this.legend);
    for (const [v, label] of items) {
      this.legend.appendChild(h('span', null,
        h('i', { style: { background: `var(${v})` } }), label));
    }
  }

  update() {
    if (!this.engine) return;
    if (this.legend) this.renderLegend();
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
    if (stop && Number.isFinite(stop.lat)) this.engine.flyTo(stop.lat, stop.lng, undefined, { animate: true });
    this.renderSelection();
  }

  renderSelection() {
    clear(this.sel);
    const stop = this.selected && this.ctx.stops.find((s) => s.id === this.selected.id);
    if (!stop) return;
    const dist = this.ctx.location?.fresh ? this.ctx.location.distanceKmTo(stop) : null;
    const idx = this.ctx.stops.indexOf(stop);

    this.sel.appendChild(h('div.card.tight.enter', null,
      h('div.row.between', null,
        h('div', { style: { minWidth: 0 } },
          h('div.card-title', { text: `Stop ${idx + 1} · ${statusLabel(stop.status)}` }),
          h('div', { style: { font: 'var(--t-title2)', marginTop: '2px' }, text: stop.address }),
          h('div', { class: 'muted', style: { font: 'var(--t-label)', marginTop: '2px' },
            text: [dist != null ? formatDistance(dist) : null, stop.city !== 'Barrie' ? stop.city : null].filter(Boolean).join(' · ') })
        ),
        h('button.iconbtn', { type: 'button', 'aria-label': 'Close', onclick: () => this.select(null) }, svg(ICON.close, { size: 18 }))
      ),
      h('div.row', { style: { marginTop: 'var(--s4)', gap: 'var(--s3)' } },
        h('button.btn.sm.nav', { type: 'button', disabled: !canNavigate(stop), style: { flex: 1 }, onclick: () => this.ctx.navigate(stop) }, svg(ICON.nav, { size: 17 }), 'Navigate'),
        stop.status === 'pending'
          ? h('button.btn.sm.primary', { type: 'button', style: { flex: 1 }, onclick: (e) => this.ctx.completeStop(stop, e.currentTarget) }, svg(ICON.check, { size: 17 }), 'Done')
          : null,
        h('button.btn.sm.ghost', { type: 'button', onclick: () => this.ctx.openProperty(stop) }, 'Details')
      )
    ));
  }
}

function statusLabel(s) {
  return s === 'done' ? 'Complete' : s === 'skipped' ? 'Skipped' : s === 'pushed' ? 'Pushed' : 'Remaining';
}
