/**
 * The day ribbon.
 *
 * This replaces a progress donut, a finish-time readout, a confidence range and
 * a row of stat tiles with one instrument, because those five things are all
 * answers to the same question: *where am I in this day?*
 *
 * The ribbon is a time axis. It runs from when the day started to when it is
 * predicted to end. Every stop is a segment along it, as wide as the time that
 * stop is expected to take, so the shape of the day is legible: a run of short
 * lawns looks different from one long one. Completed segments are filled.
 *
 * The single most useful thing on it is the relationship between two marks:
 *
 *   the fill edge   — how much work is actually finished
 *   the now line    — where the plan says that edge should have reached by now
 *
 * The distance between them *is* the pace. Ahead reads as fill past the line;
 * behind reads as the line past the fill. No number has to be interpreted, and
 * the gap grows and shrinks continuously as the day is worked.
 *
 * The forecast's uncertainty is drawn as a soft tail beyond the predicted
 * finish rather than printed as "±34 min", so a day the model is unsure about
 * visibly frays at the end instead of asserting a precise time it cannot know.
 *
 * Rendered as SVG: a few dozen nodes, crisp at any density, animatable on the
 * compositor, and it costs nothing when nothing is moving.
 */

import { h } from '../dom.js';
import { Spring, SPRING, ticker, prefersCalm } from '../motion/spring.js';
import { formatClock, formatDuration } from '../../core/time.js';

const NS = 'http://www.w3.org/2000/svg';
const H = 54;              // drawing height
const TRACK_Y = 30;        // baseline of the ribbon
const TRACK_H = 16;        // thickness of the bar
const MIN_SEG = 3;         // a stop is never invisible, however short

function el(name, attrs = {}) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
  return n;
}

export class DayRibbon {
  constructor() {
    this.root = h('div.ribbon');
    this.svg = el('svg', { viewBox: `0 0 360 ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    this.svg.classList.add('ribbon-svg');
    this.root.appendChild(this.svg);
    this.fill = new Spring(0, SPRING.settle);
    this.nowX = new Spring(0, SPRING.settle);
    this._stop = null;
    this._last = null;
  }

  /**
   * @param {object} m
   * @param {Array} m.segments   [{ id, minutes, status }] in route order
   * @param {number} m.doneRatio 0..1 of expected work completed
   * @param {number} m.paceRatio 0..1 where the plan says the fill should be
   * @param {number} m.spreadRatio width of the forecast tail, 0..1
   * @param {boolean} m.planning  viewing a day that is not being worked now
   */
  update(m) {
    const key = JSON.stringify([
      m.segments.map((s) => [s.status, Math.round(s.minutes)]),
      Math.round(m.doneRatio * 500), Math.round(m.paceRatio * 500),
      Math.round(m.spreadRatio * 500), m.planning, m.complete,
    ]);
    if (key === this._last) return;
    const first = this._last == null;
    this._last = key;
    this.model = m;
    this.draw();

    const targetFill = m.doneRatio;
    const targetNow = m.paceRatio;
    if (first || prefersCalm()) {
      this.fill.jump(targetFill);
      this.nowX.jump(targetNow);
      this.paint();
    } else {
      this.fill.to(targetFill);
      this.nowX.to(targetNow);
      this.run();
    }
  }

  run() {
    if (this._stop) return;
    this._stop = ticker.add((dt) => {
      const a = this.fill.advance(dt);
      const b = this.nowX.advance(dt);
      this.paint();
      if (!a && !b) { this._stop = null; return false; }
      return true;
    });
  }

  /**
   * Rebuilds the static geometry.
   *
   * One continuous track, not a row of blocks: per-stop rectangles turned the
   * whole thing into a barcode that had to be decoded rather than read. Stops
   * are hairline ticks laid *over* the track instead, so the day can still be
   * counted while the shape stays a single bar.
   */
  draw() {
    const m = this.model;
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    const W = 360;
    const total = m.segments.reduce((t, s) => t + Math.max(1, s.minutes), 0) || 1;

    const defs = el('defs');
    const grad = el('linearGradient', { id: 'ribbonFill', x1: '0', x2: '1', y1: '0', y2: '0' });
    grad.appendChild(el('stop', { offset: '0', 'stop-color': 'var(--ribbon-fill-a)' }));
    grad.appendChild(el('stop', { offset: '1', 'stop-color': 'var(--ribbon-fill-b)' }));
    defs.appendChild(grad);
    const tail = el('linearGradient', { id: 'ribbonTail', x1: '0', x2: '1', y1: '0', y2: '0' });
    tail.appendChild(el('stop', { offset: '0', 'stop-color': 'var(--ribbon-tail)', 'stop-opacity': '0.4' }));
    tail.appendChild(el('stop', { offset: '1', 'stop-color': 'var(--ribbon-tail)', 'stop-opacity': '0' }));
    defs.appendChild(tail);
    const clip = el('clipPath', { id: 'ribbonClip' });
    clip.appendChild(el('rect', { x: 0, y: TRACK_Y - TRACK_H / 2, width: W, height: TRACK_H, rx: TRACK_H / 2 }));
    defs.appendChild(clip);
    this.svg.appendChild(defs);

    const band = el('g', { 'clip-path': 'url(#ribbonClip)' });

    band.appendChild(el('rect', {
      x: 0, y: TRACK_Y - TRACK_H / 2, width: W, height: TRACK_H, class: 'ribbon-track',
    }));

    if (m.spreadRatio > 0.01 && !m.planning) {
      const tailW = Math.min(W * 0.32, W * m.spreadRatio);
      band.appendChild(el('rect', {
        x: W - tailW, y: TRACK_Y - TRACK_H / 2, width: tailW, height: TRACK_H,
        fill: 'url(#ribbonTail)',
      }));
    }

    // Work completed.
    this.fillRect = el('rect', {
      x: 0, y: TRACK_Y - TRACK_H / 2, width: 0, height: TRACK_H,
      fill: 'url(#ribbonFill)', class: 'ribbon-fill',
    });
    band.appendChild(this.fillRect);

    // The pace gap, over the fill but under the ticks.
    this.gapBand = el('rect', { y: TRACK_Y - TRACK_H / 2, height: TRACK_H, class: 'ribbon-gap' });
    band.appendChild(this.gapBand);

    // Stops as ticks; skipped and pushed keep a colour so they stay findable.
    let x = 0;
    this.markEls = [];
    m.segments.forEach((s, i) => {
      const w = Math.max(MIN_SEG, (Math.max(1, s.minutes) / total) * W);
      if (i > 0) {
        band.appendChild(el('line', {
          x1: x, x2: x, y1: TRACK_Y - TRACK_H / 2, y2: TRACK_Y + TRACK_H / 2, class: 'ribbon-tick',
        }));
      }
      if (s.status === 'current' || s.status === 'skipped' || s.status === 'pushed') {
        band.appendChild(el('rect', {
          x: x + 0.5, y: TRACK_Y - TRACK_H / 2, width: Math.max(2, w - 1), height: TRACK_H,
          class: `ribbon-mark is-${s.status}`,
        }));
      }
      x += w;
    });
    this.svg.appendChild(band);

    // Outline last, so the bar always has a crisp edge in bright light.
    this.svg.appendChild(el('rect', {
      x: 0.5, y: TRACK_Y - TRACK_H / 2 + 0.5, width: W - 1, height: TRACK_H - 1,
      rx: (TRACK_H - 1) / 2, class: 'ribbon-edge-line',
    }));

    this.fillEdge = el('rect', { y: TRACK_Y - TRACK_H / 2 - 2, width: 2.5, height: TRACK_H + 4, rx: 1.25, class: 'ribbon-edge' });
    this.paceLine = el('line', { y1: TRACK_Y - TRACK_H / 2 - 9, y2: TRACK_Y + TRACK_H / 2 + 5, class: 'ribbon-now' });
    this.paceFlag = el('polygon', { points: '0,6 4.5,0 -4.5,0', class: 'ribbon-nowflag' });
    this.svg.append(this.fillEdge, this.paceLine, this.paceFlag);
  }

  paint() {
    const W = 360;
    const f = Math.max(0, Math.min(1, this.fill.value));
    const n = Math.max(0, Math.min(1, this.nowX.value));
    const fx = f * W;
    const nx = n * W;

    this.fillRect.setAttribute('width', fx.toFixed(1));
    this.fillEdge.setAttribute('x', (fx - 1.25).toFixed(1));
    this.paceLine.setAttribute('x1', nx.toFixed(1));
    this.paceLine.setAttribute('x2', nx.toFixed(1));
    this.paceFlag.setAttribute('transform', `translate(${nx.toFixed(1)}, ${TRACK_Y - TRACK_H / 2 - 9})`);

    const lo = Math.min(fx, nx), hi = Math.max(fx, nx);
    this.gapBand.setAttribute('x', lo.toFixed(1));
    this.gapBand.setAttribute('width', Math.max(0, hi - lo).toFixed(1));
    this.gapBand.setAttribute('data-tone', fx >= nx ? 'ahead' : 'behind');
    const level = Math.abs(fx - nx) < 4;
    this.root.dataset.tone = level ? 'level' : fx > nx ? 'ahead' : 'behind';
    // A finished bar is one length of work, not a row of divisions. The stop
    // ticks fade out so the completed day reads as whole.
    this.root.dataset.complete = String(!!this.model?.complete);
    // Nothing to be ahead of or behind on a day with no work left in it.
    const hideNow = this.model?.planning || this.model?.complete;
    this.paceLine.style.opacity = hideNow ? '0' : '';
    this.paceFlag.style.opacity = hideNow ? '0' : '';
  }

  destroy() { if (this._stop) this._stop(); this._stop = null; }
}

/** Builds the ribbon's model from today's stops and the forecast. */
export function ribbonModel({ stops, forecast, pace, model, planning }) {
  const minutesOf = (s) => {
    const stat = model?.byProperty?.get(s.id);
    return stat?.minutes ?? model?.global?.minutes ?? 15;
  };
  const firstPending = stops.findIndex((s) => s.status === 'pending');
  const segments = stops.map((s, i) => ({
    id: s.id, minutes: minutesOf(s),
    status: i === firstPending && !planning ? 'current' : s.status,
  }));
  const total = segments.reduce((t, s) => t + s.minutes, 0) || 1;
  const doneMin = segments.filter((s) => s.status === 'done').reduce((t, s) => t + s.minutes, 0);
  const settledMin = segments.filter((s) => s.status !== 'pending').reduce((t, s) => t + s.minutes, 0);

  // Where the plan says the fill should have reached by now.
  let paceRatio = doneMin / total;
  if (pace && Number.isFinite(pace.actualMin) && pace.expectedMin > 0) {
    const ratio = pace.actualMin / Math.max(1, pace.expectedMin);
    paceRatio = Math.max(0, Math.min(1, (doneMin * ratio) / total));
  }
  const spread = forecast && forecast.totalMin > 0
    ? Math.min(0.5, (forecast.sdMin * 2) / Math.max(30, forecast.totalMin + doneMin))
    : 0;

  // On a finished day the pace mark has nothing left to measure against, so it
  // is parked on the edge rather than left stranded mid-bar as if there were
  // still work to be behind on.
  const complete = firstPending < 0 && stops.length > 0;
  return {
    segments,
    doneRatio: settledMin / total,
    paceRatio: planning || complete ? settledMin / total : paceRatio,
    spreadRatio: complete ? 0 : spread,
    planning: !!planning,
    complete,
  };
}
