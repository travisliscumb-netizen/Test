/**
 * Route — the full list, and reordering.
 *
 * Reordering is the interaction most likely to feel like a website if it is
 * done carelessly, so it is built as a direct-manipulation gesture rather than
 * HTML5 drag-and-drop (which on iOS Safari is unusable: no touch support, no
 * control over the drag image, and it fights the scroller).
 *
 * The row under the finger is lifted onto its own compositor layer and tracks
 * the pointer exactly. Every other row translates out of the way on a spring,
 * so the gap opens rather than appearing. Near the edges the list auto-scrolls
 * at a rate proportional to how far past the threshold the finger is, which is
 * what makes moving a stop from the bottom of a 48-stop day to the top
 * possible with one thumb.
 */

import { h, svg, ICON, clear, reconcile } from '../dom.js';
import { Spring, SPRING, ticker, prefersCalm } from '../motion/spring.js';
import { haptic } from '../motion/haptics.js';
import { formatClock, formatDuration } from '../../core/time.js';
import { describeTiming } from '../../services/insights.js';

const EDGE = 92;          // px from the edge where auto-scroll begins
const MAX_SCROLL = 17;    // px per frame at full deflection

export class RouteScreen {
  constructor(ctx) {
    this.ctx = ctx;
    this.reordering = false;
    this.drag = null;
  }

  mount(container) {
    this.el = h('div.page');
    this.el.append(
      this.head = h('header.routehead'),
      this.listEl = h('div.stoplist'),
      this.foot = h('div.routefoot')
    );
    container.appendChild(this.el);
    this.scroller = container;
    this.update();
    return this.el;
  }

  unmount() { this.cancelDrag(); this.el?.remove(); }

  update() {
    this.renderHead();
    // Re-ordering the DOM while a row is being dragged would move the list out
    // from under the finger. Any refresh that arrives mid-gesture is deferred
    // until the drop.
    if (this.drag) { this.pendingUpdate = true; return; }
    this.renderList();
    this.renderFoot();
  }

  renderHead() {
    const { stops } = this.ctx;
    const remaining = stops.filter((s) => s.status === 'pending').length;
    const done = stops.filter((s) => s.status === 'done').length;
    clear(this.head);
    this.el.dataset.reorder = String(this.reordering);
    this.head.append(
      h('div.routehead-top', null,
        h('div.seam-lab', { text: this.reordering ? 'Reordering' : 'The order of the day' }),
        h('button.link.go', {
          type: 'button',
          onclick: () => { this.reordering = !this.reordering; haptic('select'); this.update(); },
          text: this.reordering ? 'Finished' : 'Reorder',
        })),
      h('p.prose', { text: this.reordering
        ? 'Drag a stop by its handle. Completed stops hold their place, and nothing here touches the master route.'
        : `${remaining} still to do, ${done} done, ${stops.length} on the day.` })
    );
  }

  renderList() {
    const { stops, currentIndex } = this.ctx;
    this.listEl.dataset.reorder = String(this.reordering);
    const rows = stops.map((s, i) => ({ ...s, index: i, current: i === currentIndex }));
    reconcile(this.listEl, rows, (s) => s.id, (s) => this.buildRow(s), (n, s) => this.updateRow(n, s));
  }

  buildRow(s) {
    const row = h('div.stop', { dataset: { status: s.status, current: String(!!s.current), id: s.id } },
      h('span.rail'),
      // The whole row is the target — a chevron chip on every line is 22
      // identical decorations competing with 22 addresses. Stretched over the
      // row rather than wrapping it, so the reorder handle can still sit above.
      h('button.stop-open', { type: 'button', onclick: () => this.ctx.openProperty(s) }),
      h('span.ord'),
      h('span.meat', null, h('span.addr'), h('span.meta')),
      h('span.tail')
    );
    this.updateRow(row, s);
    return row;
  }

  updateRow(row, s) {
    row.dataset.status = s.status;
    row.dataset.current = String(!!s.current);
    row.dataset.id = s.id;
    row.querySelector('.ord').textContent = String(s.index + 1);
    row.querySelector('.addr').textContent = s.address;
    row.querySelector('.stop-open').setAttribute('aria-label', `Open ${s.address}`);

    const timing = describeTiming(this.ctx.model, s);
    const bits = [];
    if (s.status === 'done' && s.doneAt) bits.push(`Done ${formatClock(s.doneAt)}`);
    else if (s.status === 'skipped') bits.push('Skipped');
    else if (s.status === 'pushed') bits.push('Pushed to next week');
    else if (timing.minutes) bits.push(`${Math.round(timing.minutes)} min`);
    if (this.ctx.day.pinned?.includes(s.id)) bits.push('Pinned');
    row.querySelector('.meta').textContent = bits.join(' · ');

    const tail = row.querySelector('.tail');
    clear(tail);
    if (this.reordering && s.status !== 'done') {
      const grip = h('span.grip', { 'aria-label': `Reorder ${s.address}` }, svg(ICON.grip, { size: 20 }));
      grip.addEventListener('pointerdown', (e) => this.beginDrag(e, row, s), { passive: false });
      tail.appendChild(grip);
    }
  }

  renderFoot() {
    const { optimization, day } = this.ctx;
    clear(this.foot);
    const changedFromMaster = JSON.stringify(day.order) !== JSON.stringify(day.masterOrder);

    // Left-rule notes rather than icon-and-heading cards: the same voice the
    // advice on Today speaks in, so a suggestion reads the same wherever it
    // appears.
    if (optimization?.changed && optimization.savedMinutes > 0.5) {
      this.foot.appendChild(h('div.note', { dataset: { tone: 'suggest' } },
        h('div.note-t', { text: `A different order finishes about ${formatDuration(optimization.savedMinutes)} sooner` }),
        h('div.note-b', { text: `${optimization.moved.length} of the remaining stops would move. Driving drops from ${formatDuration(optimization.baselineTravel)} to ${formatDuration(optimization.optimizedTravel)}.` }),
        h('div.note-a', null,
          h('button.link.go', { type: 'button', text: 'Apply it', onclick: () => this.ctx.applyOptimization() }),
          h('button.link.dim', { type: 'button', text: 'See it on the map', onclick: () => this.ctx.goTo('map') }))
      ));
    } else if (this.ctx.stops.filter((s) => s.status === 'pending').length >= 3) {
      this.foot.appendChild(h('div.note', null,
        h('div.note-t', { text: 'This order is already efficient' }),
        h('div.note-b', { text: 'No reordering of the remaining stops would save meaningful time.' })
      ));
    }

    if (changedFromMaster) {
      this.foot.appendChild(h('div.note', { dataset: { tone: 'info' } },
        h('div.note-t', { text: "Today's order differs from the master route" }),
        h('div.note-b', { text: 'The master route is what next week starts from, and it has not been changed.' }),
        h('div.note-a', null,
          h('button.link.go', { type: 'button', text: 'Restore master route order', onclick: () => this.ctx.revertOrder() }))
      ));
    }
  }

  // ------------------------------------------------------------------ drag

  beginDrag(e, row, stop) {
    if (!this.reordering) return;
    e.preventDefault();
    const rows = [...this.listEl.querySelectorAll('.stop')];
    const rects = rows.map((r) => r.getBoundingClientRect());
    const index = rows.indexOf(row);
    if (index < 0) return;

    haptic('lift');
    row.classList.add('lifted');
    row.style.willChange = 'transform';
    row.style.zIndex = '5';

    const gap = (rects[1]?.top ?? 0) - (rects[0]?.bottom ?? 0);
    const step = rects[index].height + Math.max(0, gap);

    this.drag = {
      row, stop, rows, rects, index, target: index, step,
      startY: e.clientY,
      offset: new Spring(0, SPRING.lift),
      scrollAtStart: this.scroller.scrollTop,
      pointerId: e.pointerId,
      lastY: e.clientY,
      shifts: new Map(),
      autoScroll: 0,
    };

    row.setPointerCapture?.(e.pointerId);
    this._move = (ev) => this.onDragMove(ev);
    this._up = (ev) => this.endDrag(ev);
    window.addEventListener('pointermove', this._move, { passive: false });
    window.addEventListener('pointerup', this._up);
    window.addEventListener('pointercancel', this._up);

    // A single loop drives the lifted row, the displaced rows and auto-scroll,
    // so they can never disagree about where the gap is.
    ticker.add((dt) => {
      if (!this.drag) return false;
      const d = this.drag;
      if (d.autoScroll) {
        const before = this.scroller.scrollTop;
        this.scroller.scrollTop += d.autoScroll;
        const actual = this.scroller.scrollTop - before;
        if (actual) this.applyDragPosition();
      }
      return true;
    });

    if (!prefersCalm()) {
      row.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.025)' }],
        { duration: 160, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' });
    }
  }

  onDragMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    e.preventDefault();
    d.lastY = e.clientY;

    const box = this.scroller.getBoundingClientRect();
    const topGap = e.clientY - box.top;
    const botGap = box.bottom - e.clientY;
    if (topGap < EDGE) d.autoScroll = -MAX_SCROLL * (1 - Math.max(0, topGap) / EDGE);
    else if (botGap < EDGE) d.autoScroll = MAX_SCROLL * (1 - Math.max(0, botGap) / EDGE);
    else d.autoScroll = 0;

    this.applyDragPosition();
  }

  applyDragPosition() {
    const d = this.drag;
    if (!d) return;
    const scrolled = this.scroller.scrollTop - d.scrollAtStart;
    const dy = d.lastY - d.startY + scrolled;
    d.row.style.transform = `translate3d(0, ${dy.toFixed(1)}px, 0)`;

    // Where would it land? Compare the dragged row's centre against the
    // original centres of the others.
    const centre = d.rects[d.index].top + d.rects[d.index].height / 2 + dy - scrolled + (this.scroller.scrollTop - d.scrollAtStart);
    let target = d.index;
    for (let i = 0; i < d.rows.length; i++) {
      if (i === d.index) continue;
      const c = d.rects[i].top + d.rects[i].height / 2;
      if (i < d.index && centre < c) { target = Math.min(target, i); }
      if (i > d.index && centre > c) { target = Math.max(target, i); }
    }
    // Completed stops are anchors: the remaining route reorders around them.
    while (target > 0 && this.ctx.stops[target]?.status === 'done') target--;

    if (target !== d.target) {
      d.target = target;
      haptic('select');
      this.applyShifts();
    }
  }

  applyShifts() {
    const d = this.drag;
    for (let i = 0; i < d.rows.length; i++) {
      if (i === d.index) continue;
      let shift = 0;
      if (d.target > d.index && i > d.index && i <= d.target) shift = -d.step;
      else if (d.target < d.index && i >= d.target && i < d.index) shift = d.step;

      let spring = d.shifts.get(i);
      if (!spring) {
        spring = new Spring(0, SPRING.glide);
        d.shifts.set(i, spring);
        ticker.add((dt) => {
          const s = d.shifts.get(i);
          if (!s) return false;
          const moving = s.advance(dt);
          d.rows[i].style.transform = Math.abs(s.value) < 0.01 ? '' : `translate3d(0, ${s.value.toFixed(1)}px, 0)`;
          return moving || this.drag === d;
        });
      }
      spring.to(shift);
    }
  }

  endDrag() {
    const d = this.drag;
    if (!d) return;
    window.removeEventListener('pointermove', this._move);
    window.removeEventListener('pointerup', this._up);
    window.removeEventListener('pointercancel', this._up);
    d.autoScroll = 0;

    const from = d.index;
    const to = d.target;
    this.drag = null;

    for (const row of d.rows) { row.style.transform = ''; row.style.willChange = ''; row.style.zIndex = ''; }
    d.row.classList.remove('lifted');
    d.row.getAnimations().forEach((a) => a.cancel());

    if (this.pendingUpdate) { this.pendingUpdate = false; this.renderList(); this.renderFoot(); }
    if (from === to) { haptic('tap'); return; }
    haptic('drop');
    this.ctx.moveStop(from, to);
  }

  cancelDrag() {
    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;
    window.removeEventListener('pointermove', this._move);
    window.removeEventListener('pointerup', this._up);
    for (const row of d.rows) { row.style.transform = ''; row.style.willChange = ''; }
    d.row.classList.remove('lifted');
  }
}
