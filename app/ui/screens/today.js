/**
 * Today — the command centre.
 *
 * Information hierarchy is the whole design here. Glanced at from a running
 * mower, the screen has to answer, in this order:
 *
 *     when do I finish  ->  what is next  ->  how far through am I
 *
 * so the finish time is the largest object on the screen, the next property is
 * the only card with a coloured edge, and everything else is progressively
 * disclosed. There is deliberately no dashboard of small tiles: four numbers
 * the size of body text are four numbers nobody reads outdoors.
 */

import { h, svg, ICON, reconcile, clear } from '../dom.js';
import { formatClock, formatDuration, DAY_FULL, formatDateHuman } from '../../core/time.js';
import { formatDistance } from '../../core/geo.js';
import { animateNumber, prefersCalm, Spring, SPRING, ticker } from '../motion/spring.js';
import { transition } from '../motion/flip.js';
import { describeTiming } from '../../services/insights.js';
import { canNavigate } from '../../services/navigation.js';
import { MapEngine } from '../map/engine.js';

export class TodayScreen {
  constructor(ctx) {
    this.ctx = ctx;
    this.el = null;
    this.preview = null;
    this.lastDone = -1;
    this.lastFinish = null;
  }

  mount(container) {
    this.el = h('div.page');
    this.el.append(
      this.deck = h('section.deck'),
      // Only an insight that demands action *right now* is allowed above the
      // next property. Everything advisory sits below it, so "what is next" is
      // always on the first screen — that is the whole point of this view.
      this.urgentSlot = h('div', { style: { display: 'grid', gap: 'var(--s3)' } }),
      this.nextSlot = h('div'),
      this.insightSlot = h('div', { style: { display: 'grid', gap: 'var(--s3)' } }),
      this.mapSlot = h('div'),
      this.listSlot = h('section')
    );
    container.appendChild(this.el);
    this.update();
    return this.el;
  }

  unmount() {
    this.preview?.destroy();
    this.preview = null;
    this.el?.remove();
  }

  update() {
    this.renderDeck();
    this.renderInsights();
    this.renderNext();
    this.renderMap();
    this.renderList();
  }

  // ------------------------------------------------------------------ deck

  renderDeck() {
    const { stops, forecast, pace, location, currentIndex, day } = this.ctx;
    const done = stops.filter((s) => s.status === 'done').length;
    const total = stops.length;
    const remaining = stops.filter((s) => s.status === 'pending').length;
    const pct = total ? done / total : 0;

    const finishText = total === 0 ? '—'
      : remaining === 0 ? 'Done'
      : formatClock(forecast.finishTs);

    if (!this.deck.firstChild) {
      this.deck.append(
        h('div.deck-grid', null,
          this.finishBox = h('div.finish', null,
            h('span.cap', { text: 'Predicted finish' }),
            this.finishVal = h('div.val'),
            this.bandEl = h('div.band')
          ),
          this.arcWrap = h('div.arcwrap', null,
            this.arc = h('div.arc'),
            h('div.inner', null,
              this.countEl = h('div.count', { text: '0' }),
              this.ofEl = h('div.of', { text: 'of 0' })
            )
          )
        ),
        this.footEl = h('div.deck-foot')
      );
      this.arcSpring = new Spring(0, SPRING.settle);
    }

    // Finish time: animated only when it actually moves, so the deck is calm
    // while nothing is happening.
    if (this.lastFinish !== finishText) {
      this.lastFinish = finishText;
      clear(this.finishVal);
      if (remaining === 0 && total > 0) {
        this.finishVal.append(document.createTextNode('Done'));
        this.finishVal.append(h('span.suffix', { text: `· ${formatClock(lastDoneAt(stops))}` }));
      } else {
        this.finishVal.append(document.createTextNode(finishText.replace(/(am|pm)$/, '')));
        const ap = /(am|pm)$/.exec(finishText);
        if (ap) this.finishVal.append(h('span.suffix', { text: ap[1] }));
      }
      if (!prefersCalm()) {
        this.finishVal.animate(
          [{ transform: 'translate3d(0,-6px,0)', opacity: .3 }, { transform: 'none', opacity: 1 }],
          { duration: 320, easing: 'cubic-bezier(.16,1,.3,1)' }
        );
      }
    }

    const bandWide = forecast && !forecast.reliable;
    this.bandEl.className = `band${bandWide ? ' wide' : ''}`;
    clear(this.bandEl);
    if (total === 0) {
      this.bandEl.append(h('span', { text: 'No stops scheduled' }));
    } else if (remaining === 0) {
      this.bandEl.append(h('span', { text: `${done} stop${done === 1 ? '' : 's'} complete` }));
    } else {
      // Two short lines beat one that wraps unpredictably at three.
      this.bandEl.append(
        h('span', { text: `Typically ${formatClock(forecast.lowTs)} – ${formatClock(forecast.highTs)}` }),
        h('span', { text: `${formatDuration(forecast.totalMin)} of work left` })
      );
    }

    // Counter and arc animate together; both are cheap and both read as "the
    // day moved" rather than "a number was replaced".
    if (this.lastDone !== done) {
      const from = this.lastDone < 0 ? done : this.lastDone;
      this.lastDone = done;
      animateNumber(from, done, (v) => { this.countEl.textContent = String(Math.round(v)); });
      this.arcSpring.to(pct);
      ticker.add((dt) => {
        const m = this.arcSpring.advance(dt);
        this.arc.style.setProperty('--p', this.arcSpring.value.toFixed(4));
        return m;
      });
    } else {
      this.arc.style.setProperty('--p', pct.toFixed(4));
      this.countEl.textContent = String(done);
    }
    this.ofEl.textContent = `of ${total}`;

    // Foot stats: three, never more. Each one is something that changes a
    // decision in the next ten minutes.
    const next = currentIndex >= 0 ? stops[currentIndex] : null;
    const dist = next && location?.fresh ? location.distanceKmTo(next) : null;
    const paceTone = pace ? (pace.state === 'ahead' ? 'ahead' : pace.state === 'behind' ? 'behind' : 'flat') : 'flat';
    const stats = [
      { k: 'Remaining', v: `${remaining} stop${remaining === 1 ? '' : 's'}` },
      { k: 'To next', v: dist == null ? (next ? '—' : 'Nothing left') : formatDistance(dist) },
      {
        // Signed and short: this tile is a third of the width and "14m ahe…"
        // is worse than useless. The full sentence is in the pace insight.
        k: 'Pace',
        v: !pace ? '—' : pace.state === 'on-pace' ? 'On pace'
          : `${pace.deltaMin > 0 ? '+' : '−'}${formatDuration(Math.abs(pace.deltaMin))}`,
        tone: paceTone,
      },
    ];
    reconcile(this.footEl, stats, (s) => s.k,
      (s) => h('div.stat', null, h('div.k', { text: s.k }), h('div.v', { text: s.v, dataset: { tone: s.tone || 'flat' } })),
      (node, s) => {
        const v = node.querySelector('.v');
        if (v.textContent !== s.v) v.textContent = s.v;
        v.dataset.tone = s.tone || 'flat';
      });
  }

  // -------------------------------------------------------------- insights

  renderInsights() {
    // Keyed by content, not just id: an insight whose wording changed is a new
    // node. Mutating one in place would mean reconciling a node the caller has
    // already replaced, which reinserts the stale element.
    const key = (i) => `${i.id}#${insightRev(i)}`;
    const all = this.ctx.insights;
    const urgent = all.filter((i) => i.priority >= 70).slice(0, 1);
    const rest = all.filter((i) => !urgent.includes(i)).slice(0, 2);
    reconcile(this.urgentSlot, urgent, key, (i) => this.buildInsight(i));
    reconcile(this.insightSlot, rest, key, (i) => this.buildInsight(i));
  }

  buildInsight(i) {
    const el = h('div.banner.enter', { dataset: { tone: i.tone, rev: insightRev(i) } },
      h('div.ico', null, svg(i.tone === 'warn' ? ICON.warn : i.tone === 'info' ? ICON.info : ICON.bolt, { size: 18 })),
      h('div', null,
        h('h4', { text: i.title }),
        i.body ? h('p', { text: i.body }) : null,
        i.detail ? h('p', { text: i.detail, style: { marginTop: '4px', opacity: .8 } }) : null,
        h('div.row', null,
          i.action ? h('button.btn.sm.primary', { type: 'button', text: i.action.label, onclick: (e) => this.ctx.runInsightAction(i, i.action, e.currentTarget) }) : null,
          i.secondary ? h('button.btn.sm.ghost', { type: 'button', text: i.secondary.label, onclick: (e) => this.ctx.runInsightAction(i, i.secondary, e.currentTarget) }) : null,
          h('button.btn.sm.ghost', { type: 'button', text: 'Dismiss', onclick: () => this.ctx.dismissInsight(i.id) })
        )
      )
    );
    return el;
  }

  // ------------------------------------------------------------- next card

  renderNext() {
    const { stops, currentIndex, model, location } = this.ctx;
    clear(this.nextSlot);
    const stop = currentIndex >= 0 ? stops[currentIndex] : null;

    if (!stop) {
      const total = stops.length;
      this.nextSlot.appendChild(h('div.card.enter', null,
        h('div.empty', { style: { padding: 'var(--s6) 0' } },
          h('div.art', null, svg(ICON.check, { size: 34 })),
          h('h3', { text: total ? 'Route complete' : 'Nothing scheduled today' }),
          h('p', {
            text: total
              ? `All ${total} stops on ${DAY_FULL[stops[0]?.day] || 'today'} are accounted for. Finished at ${formatClock(lastDoneAt(stops))}.`
              : 'There are no properties on this weekday for the selected crew.',
          }))
      ));
      return;
    }

    const timing = describeTiming(model, stop);
    const dist = location?.fresh ? location.distanceKmTo(stop) : null;
    const flags = [];
    if (stop.pushMow) flags.push({ kind: 'push', text: 'Push mow' });
    if (Number.isFinite(stop.earliestMin)) flags.push({ kind: 'time', text: `After ${clockLabel(stop.earliestMin)}` });
    if (Number.isFinite(stop.latestMin)) flags.push({ kind: 'time', text: `Before ${clockLabel(stop.latestMin)}` });
    if (!canNavigate(stop)) flags.push({ kind: 'warn', text: 'No location' });
    if (stop.preferLateInWeek) flags.push({ kind: 'time', text: 'Late in week' });

    const card = h('article.nextcard.enter', null,
      h('div.body', null,
        h('div.eyebrow', null, svg(ICON.pin, { size: 13 }), `Stop ${currentIndex + 1} of ${stops.length}`),
        h('h2.addr', { text: stop.address }),
        h('div.sub', null,
          h('span', null, timing.minutes ? [document.createTextNode('Usually '), h('b', { text: `${Math.round(timing.low)}–${Math.round(timing.high)} min` })] : 'No timing history yet'),
          dist != null ? h('span', null, [document.createTextNode('Distance '), h('b', { text: formatDistance(dist) })]) : null,
          stop.city && stop.city !== 'Barrie' ? h('span', { text: stop.city }) : null
        ),
        flags.length ? h('div.flagrow', null, ...flags.map((f) => h('span.flag', { dataset: { kind: f.kind }, text: f.text }))) : null,
        stop.note ? h('div.notebox', { text: stop.note }) : null,
        timing.confidence > 0 ? h('div', { style: { marginTop: 'var(--s4)' } },
          h('div.row.between', { style: { marginBottom: '5px' } },
            h('span', { class: 'muted', style: { font: 'var(--t-micro)', letterSpacing: 'var(--ls-micro)', textTransform: 'uppercase' }, text: 'Timing confidence' }),
            h('span', { class: 'muted num', style: { font: 'var(--t-micro)' }, text: `${Math.round(timing.confidence * 100)}%` })),
          h('div.confbar', { dataset: { level: timing.confidence > 0.55 ? 'good' : timing.confidence > 0.25 ? 'low' : 'none' } },
            h('i', { style: { width: `${Math.max(4, timing.confidence * 100)}%` } }))
        ) : null
      ),
      h('div.actions', null,
        h('button.btn.nav', {
          type: 'button', disabled: !canNavigate(stop),
          onclick: () => this.ctx.navigate(stop),
        }, svg(ICON.nav, { size: 19 }), 'Navigate'),
        h('button.btn.primary.done-key', {
          type: 'button',
          onclick: (e) => this.ctx.completeStop(stop, e.currentTarget),
        }, svg(ICON.check, { size: 20 }), 'Done')
      ),
      h('div.actions', { style: { gridTemplateColumns: 'repeat(3, 1fr)', paddingTop: 0 } },
        h('button.btn.ghost.sm', { type: 'button', onclick: () => this.ctx.openProperty(stop) }, svg(ICON.info, { size: 17 }), 'Details'),
        h('button.btn.ghost.sm', { type: 'button', onclick: () => this.ctx.setStatus(stop, 'skipped') }, svg(ICON.skip, { size: 17 }), 'Skip'),
        h('button.btn.ghost.sm', { type: 'button', onclick: () => this.ctx.setStatus(stop, 'pushed') }, svg(ICON.push, { size: 17 }), 'Push')
      )
    );
    this.nextSlot.appendChild(card);
  }

  // ------------------------------------------------------------------- map

  renderMap() {
    if (!this.mapSlot.firstChild) {
      const wrap = h('div.mapwrap.mapcard', null);
      const canvas = h('canvas', { 'aria-label': 'Route map preview' });
      wrap.append(canvas,
        h('button.btn.sm.ghost', {
          type: 'button',
          style: { position: 'absolute', right: 'var(--s3)', top: 'var(--s3)', background: 'var(--chrome-bg)' },
          onclick: () => this.ctx.goTo('map'),
          text: 'Open map',
        }));
      this.mapSlot.appendChild(wrap);
      this.preview = new MapEngine(canvas, {
        theme: this.ctx.theme, tiles: this.ctx.settings.mapTiles, interactive: false,
      });
      this.preview.addEventListener('select', (e) => this.ctx.openProperty(e.detail));
      requestAnimationFrame(() => this.preview.fitRoute({ animate: false, padding: 34 }));
    }
    this.preview.setTheme(this.ctx.theme);
    this.preview.setRoute({ stops: this.ctx.stops, currentIndex: this.ctx.currentIndex });
    if (this.ctx.location?.position) this.preview.setUserLocation(this.ctx.location.position);
  }

  // ------------------------------------------------------------------ list

  renderList() {
    const { stops, currentIndex } = this.ctx;
    if (!this.listSlot.firstChild) {
      this.listSlot.append(
        h('div.card-head', null,
          h('span.card-title', { text: 'Route' }),
          h('button.btn.sm.ghost', { type: 'button', onclick: () => this.ctx.goTo('route') }, 'Reorder')
        ),
        this.listEl = h('div.stoplist')
      );
    }
    const rows = stops.map((s, i) => ({ ...s, index: i, current: i === currentIndex }));
    transition(this.listEl, '.stop', () => {
      reconcile(this.listEl, rows, (s) => s.id,
        (s) => this.buildRow(s),
        (node, s) => this.updateRow(node, s));
    }, { stagger: 0 });
  }

  buildRow(s) {
    const row = h('button.stop', {
      type: 'button',
      dataset: { status: s.status, current: String(!!s.current), nocoord: String(!Number.isFinite(s.lat)) },
      onclick: () => this.ctx.openProperty(s),
    },
      h('span.rail', { text: s.status === 'done' ? '' : String(s.index + 1) }),
      h('span.meat', null,
        h('span.addr', { text: s.address }),
        h('span.meta')
      ),
      h('span.tail')
    );
    this.updateRow(row, s);
    return row;
  }

  updateRow(row, s) {
    row.dataset.status = s.status;
    row.dataset.current = String(!!s.current);
    row.dataset.nocoord = String(!Number.isFinite(s.lat));
    const rail = row.querySelector('.rail');
    const wanted = s.status === 'done' ? '✓' : String(s.index + 1);
    if (rail.textContent !== wanted) rail.textContent = wanted;
    row.querySelector('.addr').textContent = s.address;

    const meta = row.querySelector('.meta');
    const timing = describeTiming(this.ctx.model, s);
    const bits = [];
    if (s.status === 'done' && s.doneAt) bits.push(formatClock(s.doneAt));
    else if (timing.minutes) bits.push(`${Math.round(timing.minutes)} min`);
    if (s.status === 'skipped') bits.push('Skipped');
    if (s.status === 'pushed') bits.push('Pushed to next visit');
    if (s.city && s.city !== 'Barrie') bits.push(s.city);
    const text = bits.join(' · ');
    if (meta.textContent !== text) meta.textContent = text;

    const tail = row.querySelector('.tail');
    clear(tail);
    if (s.pushMow) tail.appendChild(h('span.chip', { dataset: { kind: 'push' }, text: 'Push' }));
    if (s.note) tail.appendChild(h('span.chip', { dataset: { kind: 'note' }, text: 'Note' }));
    if (Number.isFinite(s.earliestMin) || Number.isFinite(s.latestMin)) {
      tail.appendChild(h('span.chip', { dataset: { kind: 'time' }, text: 'Timed' }));
    }
    tail.appendChild(svg(ICON.chevron, { size: 15 }));
  }
}

function insightRev(i) { return `${i.title}|${i.body || ''}`; }
function lastDoneAt(stops) {
  return stops.reduce((m, s) => (s.doneAt && s.doneAt > m ? s.doneAt : m), 0) || Date.now();
}
function clockLabel(min) {
  const h24 = Math.floor(min / 60), m = min % 60;
  const ap = h24 >= 12 ? 'pm' : 'am';
  const hh = h24 % 12 || 12;
  return m ? `${hh}:${String(m).padStart(2, '0')}${ap}` : `${hh}${ap}`;
}
