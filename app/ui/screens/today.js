/**
 * Today.
 *
 * The organising idea is that a route is a *line* — a path through space and
 * time — so the screen is built as one, rather than as a stack of rounded
 * rectangles each holding a different fact.
 *
 * Three parts, in the order the question is actually asked:
 *
 *   the hero    when do I finish, and am I ahead — a time, and the ribbon
 *   the spine   a single continuous thread with every stop as a node on it
 *   the ground  the same route, drawn on the map, bleeding to the screen edge
 *
 * The current stop is not a card. It is the point where the thread opens out:
 * the address at display size, its facts on one line, and the two actions that
 * matter under the thumb. Everything before it is drawn thin and quiet;
 * everything after it is hollow. Nothing is boxed, because a box would imply
 * these are separate objects when they are one route.
 */

import { h, svg, ICON, reconcile, clear, longPress } from '../dom.js';
import { formatClock, formatDuration, DAY_FULL, formatDateHuman } from '../../core/time.js';
import { formatDistance } from '../../core/geo.js';
import { animateNumber, prefersCalm, Spring, SPRING, ticker } from '../motion/spring.js';
import { transition } from '../motion/flip.js';
import { describeTiming } from '../../services/insights.js';
import { serviceMinutesFor } from '../../learning/predict.js';
import { canNavigate } from '../../services/navigation.js';
import { MapEngine } from '../map/engine.js';
import { DayRibbon, ribbonModel } from '../components/ribbon.js';

/** Completed stops collapse once there are more than this many. */
const TRAIL_MIN_HIDDEN = 3;   // collapsing one or two stops is just noise
const TRAIL_VISIBLE = 2;

export class TodayScreen {
  constructor(ctx) {
    this.ctx = ctx;
    this.preview = null;
    this.ribbon = new DayRibbon();
    this.trailOpen = false;
    this.lastFinish = null;
    this.lastDone = -1;
  }

  mount(container) {
    this.el = h('div.today');
    this.el.append(
      this.hero = h('header.hero'),
      this.advice = h('div.advice'),
      this.spine = h('ol.spine'),
      this.ground = h('div.ground')
    );
    container.appendChild(this.el);
    this.update();
    return this.el;
  }

  unmount() {
    this.preview?.destroy();
    this.ribbon.destroy();
    this.el?.remove();
  }

  /** The id whose marker should play the seal on this render. */
  markSealed(id) { this._seal = id; }

  update() {
    this.renderHero();
    this.renderAdvice();
    this.renderSpine();
    this.renderGround();
  }

  // ------------------------------------------------------------------- hero

  renderHero() {
    const { stops, forecast, pace, model, isToday, currentIndex, location } = this.ctx;
    const done = stops.filter((s) => s.status === 'done').length;
    const total = stops.length;
    const remaining = stops.filter((s) => s.status === 'pending').length;
    const planning = !isToday;

    if (!this.hero.firstChild) {
      this.hero.append(
        this.whenEl = h('div.hero-when'),
        h('div.hero-cap', null,
          this.capEl = h('span', { text: 'Predicted finish' }),
          this.confEl = h('span.hero-conf')),
        this.valEl = h('div.hero-val'),
        this.ribbon.root,
        this.readoutEl = h('div.hero-read')
      );
    }

    clear(this.whenEl);
    if (planning) {
      this.whenEl.append(
        h('span', { text: `Viewing ${DAY_FULL[stops[0]?.day] || ''} · ${formatDateHuman(this.ctx.date)}`.replace('  ', ' ') }),
        h('button.link.go', { type: 'button', text: 'Back to today', onclick: () => this.ctx.goToToday() })
      );
    }

    const finishText = total === 0 ? 'Nothing scheduled'
      : remaining === 0 ? `Finished ${formatClock(lastDoneAt(stops))}`
      : planning ? formatDuration(forecast.totalMin)
      : formatClock(forecast.finishTs);

    this.capEl.textContent = total === 0 ? 'This day'
      : remaining === 0 ? 'Route complete'
      : planning ? 'Work in this day' : 'Predicted finish';

    if (this.lastFinish !== finishText) {
      this.lastFinish = finishText;
      clear(this.valEl);
      const ap = /(am|pm)$/.exec(finishText);
      this.valEl.append(document.createTextNode(ap ? finishText.slice(0, -2) : finishText));
      if (ap) this.valEl.append(h('span.ap', { text: ap[1] }));
      this.valEl.dataset.size = finishText.length > 12 ? 'sm' : 'lg';
      if (!prefersCalm()) {
        this.valEl.animate(
          [{ transform: 'translate3d(0,-7px,0)', opacity: 0.25, filter: 'blur(3px)' },
           { transform: 'none', opacity: 1, filter: 'none' }],
          { duration: 380, easing: 'cubic-bezier(.16,1,.3,1)' }
        );
      }
    }

    // Confidence lives next to the claim it qualifies, not in a separate meter.
    if (total && remaining && !planning) {
      const wide = !forecast.reliable;
      this.confEl.textContent = wide
        ? `wide range · ${formatClock(forecast.lowTs)}–${formatClock(forecast.highTs)}`
        : `${formatClock(forecast.lowTs)}–${formatClock(forecast.highTs)}`;
      this.confEl.dataset.wide = String(wide);
    } else {
      this.confEl.textContent = '';
    }

    this.ribbon.update(ribbonModel({ stops, forecast, pace, model, planning }));

    // One readout line. Counts animate; nothing here is a tile.
    if (!this.readoutEl.firstChild) {
      this.readoutEl.append(
        this.doneNum = h('b', { text: '0' }),
        h('span', { text: ' done' }),
        this.restEl = h('span'),
        this.paceEl = h('span.pace')
      );
    }
    if (this.lastDone !== done) {
      const from = this.lastDone < 0 ? done : this.lastDone;
      this.lastDone = done;
      animateNumber(from, done, (v) => { this.doneNum.textContent = String(Math.round(v)); });
    }
    this.restEl.textContent = total ? ` of ${total} · ${remaining} to go` : '';
    const next = currentIndex >= 0 ? stops[currentIndex] : null;
    const dist = next && location?.fresh ? location.distanceKmTo(next) : null;
    // On a finished day the closing statement at the end of the spine states
    // the pace properly; repeating it here would be the same fact twice.
    if (total && remaining === 0 && !planning) {
      this.paceEl.textContent = '';
    } else if (pace && Math.abs(pace.deltaMin) >= 4 && !planning) {
      this.paceEl.textContent = ` · ${formatDuration(Math.abs(pace.deltaMin))} ${pace.state}`;
      this.paceEl.dataset.tone = pace.state;
    } else if (dist != null) {
      this.paceEl.textContent = ` · ${formatDistance(dist)} to next`;
      this.paceEl.dataset.tone = 'flat';
    } else {
      this.paceEl.textContent = '';
    }
  }

  // ----------------------------------------------------------------- advice

  renderAdvice() {
    const all = this.ctx.insights.filter((i) => i.id !== 'pace');
    const urgent = all.filter((i) => i.priority >= 70).slice(0, 1);
    const rest = all.filter((i) => !urgent.includes(i)).slice(0, 1);
    const shown = [...urgent, ...rest];
    reconcile(this.advice, shown, (i) => `${i.id}#${i.title}`, (i) => this.buildAdvice(i));
  }

  buildAdvice(i) {
    return h('div.note.enter', { dataset: { tone: i.tone } },
      h('p.note-t', { text: i.title }),
      i.body ? h('p.note-b', { text: i.body }) : null,
      h('div.note-a', null,
        i.action ? h('button.link.go', { type: 'button', text: i.action.label, onclick: (e) => this.ctx.runInsightAction(i, i.action, e.currentTarget) }) : null,
        i.secondary ? h('button.link', { type: 'button', text: i.secondary.label, onclick: (e) => this.ctx.runInsightAction(i, i.secondary, e.currentTarget) }) : null,
        h('button.link.dim', { type: 'button', text: 'Dismiss', onclick: () => this.ctx.dismissInsight(i.id) })
      )
    );
  }

  // ------------------------------------------------------------------ spine

  renderSpine() {
    const { stops, currentIndex } = this.ctx;
    const doneStops = stops.filter((s) => s.status === 'done');
    let hidden = Math.max(0, doneStops.length - TRAIL_VISIBLE);
    if (hidden < TRAIL_MIN_HIDDEN) hidden = 0;

    const rows = [];
    stops.forEach((s, i) => {
      const isCurrent = i === currentIndex;
      if (s.status === 'done' && !this.trailOpen && hidden > 0) {
        const rank = doneStops.indexOf(s);
        if (rank === 0) rows.push({ kind: 'collapse', id: '__trail', count: hidden });
        if (rank < hidden) return;
      }
      rows.push({ kind: isCurrent ? 'current' : 'stop', id: s.id, stop: s, index: i, isCurrent });
    });
    if (!stops.length) rows.push({ kind: 'empty', id: '__empty' });
    if (currentIndex < 0 && stops.length) rows.push({ kind: 'finished', id: '__fin' });

    const settled = stops.filter((s) => s.status !== 'pending').length;
    const pct = stops.length ? Math.round((settled / stops.length) * 100) : 0;
    this.spine.style.setProperty('--spine-done', `${pct}%`);

    transition(this.spine, '.node', () => {
      reconcile(this.spine, rows, (r) => r.id, (r) => this.buildRow(r), (n, r) => this.syncRow(n, r));
    }, { stagger: 0 });
  }

  buildRow(r) {
    if (r.kind === 'collapse') {
      return h('li.node.node-more', null,
        h('button.more', { type: 'button', onclick: () => { this.trailOpen = true; this.renderSpine(); } },
          `${r.count} earlier stop${r.count === 1 ? '' : 's'} done`));
    }
    if (r.kind === 'empty') {
      return h('li.node.node-msg', null,
        h('p.msg-t', { text: 'Nothing scheduled' }),
        h('p.msg-b', { text: 'No properties fall on this weekday for this crew.' }));
    }
    if (r.kind === 'finished') return this.buildClosing();
    const node = r.isCurrent ? this.buildCurrent(r) : this.buildStop(r);
    return node;
  }

  syncRow(node, r) {
    const wantCurrent = r.kind === 'current';
    const isCurrent = node.classList.contains('is-current');
    if (wantCurrent && isCurrent && node.dataset.id === r.stop.id) {
      this.syncCurrent(node, r);
      return;
    }
    if (wantCurrent !== isCurrent) return this.buildRow(r);
    if (r.kind === 'stop') this.syncStop(node, r);
    else if (wantCurrent) this.syncCurrent(node, r);
  }

  /** Updates the live stop's volatile facts without rebuilding it. */
  syncCurrent(node, r) {
    const facts = node.querySelector('.live-facts');
    if (!facts) return;
    const text = this.currentFacts(r.stop).join('  ·  ');
    if (facts.textContent !== text) facts.textContent = text;
    const rank = node.querySelector('.live-rank');
    const want = `Stop ${r.index + 1} of ${this.ctx.stops.length}`;
    if (rank && rank.textContent !== want) rank.textContent = want;
  }

  currentFacts(s) {
    const timing = describeTiming(this.ctx.model, s);
    const dist = this.ctx.location?.fresh ? this.ctx.location.distanceKmTo(s) : null;
    const facts = [];
    if (timing.minutes) facts.push(`${Math.round(timing.low)}\u2013${Math.round(timing.high)} min`);
    if (dist != null) facts.push(formatDistance(dist));
    if (timing.confidence > 0) facts.push(`${Math.round(timing.confidence * 100)}% confident`);
    if (s.pushMow) facts.push('push mow');
    return facts;
  }

  buildStop(r) {
    const s = r.stop;
    const li = h('li.node.node-stop', {
      dataset: { status: s.status, id: s.id },
      style: { 'view-transition-name': `stop-${cssIdent(s.id)}` },
    },
      h('span.pip'),
      h('button.stop-hit', { type: 'button', onclick: () => this.ctx.openProperty(s) },
        h('span.stop-addr'),
        h('span.stop-meta'))
    );
    this.syncStop(li, r);
    if (this._seal === s.id) {
      const pip = li.querySelector('.pip');
      pip?.classList.add('just-sealed');
      this._seal = null;
      pip?.addEventListener('animationend', () => pip.classList.remove('just-sealed'), { once: true });
    }
    return li;
  }

  syncStop(li, r) {
    const s = r.stop;
    li.dataset.status = s.status;
    const addr = li.querySelector('.stop-addr');
    const meta = li.querySelector('.stop-meta');
    if (addr.textContent !== s.address) addr.textContent = s.address;

    const timing = describeTiming(this.ctx.model, s);
    const bits = [];
    if (s.status === 'done' && s.doneAt) bits.push(formatClock(s.doneAt));
    else if (s.status === 'skipped') bits.push('Skipped');
    else if (s.status === 'pushed') bits.push('Pushed');
    else bits.push(`${Math.round(timing.minutes || 15)} min`);
    if (s.pushMow) bits.push('push mow');
    if (s.note) bits.push('note');
    if (!Number.isFinite(s.lat)) bits.push('no pin');
    const text = bits.join(' · ');
    if (meta.textContent !== text) meta.textContent = text;
  }

  /**
   * The end of the day.
   *
   * The last thing the operator sees before the phone goes in the pocket, so
   * it says what the day actually was rather than "Route complete". Every
   * figure is measured, not congratulatory: the clock, the comparison against
   * the app's own estimate, and the lawn that took the longest — which is the
   * one worth thinking about tomorrow.
   */
  buildClosing() {
    const { stops, pace, model } = this.ctx;
    const done = stops.filter((s) => s.status === 'done' && s.doneAt);
    const settled = stops.filter((s) => s.status !== 'pending');
    const skipped = stops.filter((s) => s.status === 'skipped' || s.status === 'pushed');

    const node = h('li.node.node-msg.is-done', null,
      h('p.msg-t', { text: done.length === stops.length ? 'The day is done' : 'Nothing left to do' }));

    const lines = [];
    if (done.length) {
      const first = Math.min(...done.map((s) => s.doneAt));
      const last = Math.max(...done.map((s) => s.doneAt));
      const elapsed = (last - first) / 60000;
      lines.push(`${done.length} stop${done.length === 1 ? '' : 's'} cut`
        + (elapsed > 5 ? `, ${formatClock(first)} to ${formatClock(last)} — ${formatDuration(elapsed)} on the clock.` : '.'));
    }
    if (skipped.length) {
      lines.push(`${skipped.length} left for another day: ${skipped.map((s) => s.address).join(', ')}.`);
    }
    if (pace && Math.abs(pace.deltaMin) >= 4) {
      lines.push(pace.deltaMin > 0
        ? `${formatDuration(pace.deltaMin)} faster than the app expected.`
        : `${formatDuration(-pace.deltaMin)} slower than the app expected — it will take that into account.`);
    } else if (pace) {
      lines.push('Almost exactly the pace the app predicted.');
    }
    const byExpected = done.slice().sort((a, b) => serviceMinutesFor(model, b) - serviceMinutesFor(model, a))[0];
    if (byExpected) {
      lines.push(`Longest on the day was ${byExpected.address}, about ${Math.round(serviceMinutesFor(model, byExpected))} minutes.`);
    }

    for (const text of lines) node.appendChild(h('p.msg-b', { text }));
    if (settled.length && !prefersCalm()) {
      node.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
        { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)' });
    }
    return node;
  }

  /** Where the thread opens out. Not a card: the page *is* this stop here. */
  buildCurrent(r) {
    const s = r.stop;
    const facts = this.currentFacts(s);

    const li = h('li.node.node-stop.is-current', {
      dataset: { status: s.status, id: s.id },
      style: { 'view-transition-name': `stop-${cssIdent(s.id)}` },
    },
      h('span.pip.pip-live'),
      h('div.live', null,
        h('div.live-rank', { text: `Stop ${r.index + 1} of ${this.ctx.stops.length}` }),
        h('h2.live-addr', { text: s.address }),
        h('div.live-facts', { text: facts.join('  ·  ') }),
        s.note ? h('p.live-note', { text: s.note }) : null,
        h('div.live-act', null,
          h('button.act.act-nav', {
            type: 'button', disabled: !canNavigate(s),
            onclick: () => this.ctx.navigate(s),
          }, svg(ICON.nav, { size: 19 }), 'Navigate'),
          h('button.act.act-done', {
            type: 'button',
            onclick: (e) => this.ctx.completeStop(s, e.currentTarget),
          }, svg(ICON.check, { size: 20 }), 'Done')
        ),
        h('div.live-more', null,
          h('button.link', { type: 'button', text: 'Details', onclick: () => this.ctx.openProperty(s) }),
          h('button.link', { type: 'button', text: 'Skip', onclick: () => this.ctx.setStatus(s, 'skipped') }),
          h('button.link', { type: 'button', text: 'Push', onclick: () => this.ctx.setStatus(s, 'pushed') })
        )
      )
    );
    return li;
  }

  // ----------------------------------------------------------------- ground

  renderGround() {
    if (!this.ground.firstChild) {
      const wrap = h('div.groundmap');
      const canvas = h('canvas', { 'aria-label': 'Route map' });
      wrap.append(canvas, h('button.ground-open', {
        type: 'button', onclick: () => this.ctx.goTo('map'),
      }, 'Open map'));
      this.ground.append(h('div.ground-cap', { text: 'The day on the ground' }), wrap);
      this.preview = new MapEngine(canvas, {
        theme: this.ctx.theme, tiles: this.ctx.settings.mapTiles, interactive: false,
      });
      this.preview.addEventListener('select', (e) => this.ctx.openProperty(e.detail));
      requestAnimationFrame(() => this.preview.fitRoute({ animate: false, padding: 30 }));
    }
    this.preview.setTheme(this.ctx.theme);
    this.preview.setTileSource(this.ctx.settings.mapTiles);
    this.preview.setRoute({ stops: this.ctx.stops, currentIndex: this.ctx.currentIndex });
    if (this.ctx.location?.position) this.preview.setUserLocation(this.ctx.location.position);
  }
}

function lastDoneAt(stops) {
  return stops.reduce((m, s) => (s.doneAt && s.doneAt > m ? s.doneAt : m), 0) || Date.now();
}

/** view-transition-name must be a CSS identifier. */
function cssIdent(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
}
