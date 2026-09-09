/**
 * Insights.
 *
 * The brief warned against turning the product into an analytics project, so
 * this screen answers only questions that change what the operator does:
 * which lawns are getting slower, which day is overloaded, how good the
 * predictions actually are, and what the app has learned about driving.
 *
 * Every figure states the evidence behind it. A number with no sample count is
 * a number nobody should act on.
 */

import { h, svg, ICON, clear } from '../dom.js';
import { formatDuration, DAY_FULL, DAY_KEYS, formatDateHuman, formatClock } from '../../core/time.js';
import { statsFor } from '../../learning/predict.js';
import { formatDistance } from '../../core/geo.js';

export class InsightsScreen {
  constructor(ctx) { this.ctx = ctx; }

  mount(container) {
    this.el = h('div.page');
    container.appendChild(this.el);
    this.update();
    return this.el;
  }
  unmount() { this.el?.remove(); }

  update() {
    const { model, store, settings } = this.ctx;
    clear(this.el);

    const props = store.activeProperties(settings.crew);
    const learned = props.filter((p) => (statsFor(model, p.id)?.samples || 0) > 0);
    const confident = props.filter((p) => (statsFor(model, p.id)?.confidence || 0) >= 0.55);

    // ---- what the app knows ------------------------------------------
    this.el.appendChild(h('section.card', null,
      h('div.card-head', null, h('span.card-title', { text: 'What the app has learned' })),
      h('div.deck-foot', { style: { marginTop: 0, paddingTop: 0, borderTop: 0 } },
        stat('Timed lawns', `${learned.length} of ${props.length}`),
        stat('Confident', String(confident.length)),
        stat('Work days seen', String(model?.sessionCount ?? 0))
      ),
      h('p', { class: 'muted', style: { font: 'var(--t-label)', marginTop: 'var(--s4)' },
        text: `Built from ${model?.sampleCount ?? 0} service samples across ${model?.sessionCount ?? 0} recorded days. A lawn needs about four consistent visits before its own timing overrides the day average.` })
    ));

    // ---- travel model -------------------------------------------------
    const t = model?.travel;
    if (t) {
      this.el.appendChild(h('section.card', null,
        h('div.card-head', null, h('span.card-title', { text: 'Your driving' })),
        h('div', { style: { font: 'var(--t-hero)', letterSpacing: 'var(--ls-title)' },
          text: `${(60 / t.perKmMin).toFixed(1)} km/h` }),
        h('p', { class: 'muted', style: { font: 'var(--t-label)', marginTop: 'var(--s2)' },
          text: `Effective door-to-door speed including parking and ramps — ${t.perKmMin.toFixed(2)} min per km plus ${t.fixedMin.toFixed(1)} min stopped at each property.` }),
        h('p', { class: 'muted', style: { font: 'var(--t-label)', marginTop: 'var(--s3)' },
          text: t.refit
            ? `Fitted from ${t.n} of your own stop-to-stop transitions, using a method that ignores the slowest and fastest quarter so a lunch break cannot skew it.`
            : `Using the starting model — ${t.n} clean transitions recorded so far, ${Math.max(0, 40 - t.n)} more needed before it re-fits to you.` })
      ));
    }

    // ---- day load -----------------------------------------------------
    const rows = DAY_KEYS.map((d) => {
      const dayProps = store.propertiesForWeekday(d, settings.crew);
      const mins = dayProps.reduce((sum, p) => sum + (statsFor(model, p.id)?.minutes ?? model?.global?.minutes ?? 15), 0);
      return { day: d, count: dayProps.length, mins };
    });
    const maxMins = Math.max(1, ...rows.map((r) => r.mins));
    this.el.appendChild(h('section.card', null,
      h('div.card-head', null, h('span.card-title', { text: 'Weekly load' })),
      ...rows.map((r) => h('div', { style: { display: 'grid', gap: '5px', marginBottom: 'var(--s4)' } },
        h('div.row.between', null,
          h('span', { style: { font: 'var(--t-label)' }, text: DAY_FULL[r.day] }),
          h('span', { class: 'muted num', style: { font: 'var(--t-label)' },
            text: `${r.count} stops · ~${formatDuration(r.mins)} of cutting` })),
        h('div.confbar', { style: { height: '7px' } },
          h('i', { style: { width: `${(r.mins / maxMins) * 100}%`, background: r.mins / maxMins > 0.92 ? 'var(--warn)' : 'var(--accent)' } }))
      )),
      h('p', { class: 'muted', style: { font: 'var(--t-label)' },
        text: 'Cutting time only — driving is on top of this. A day that is much taller than the others is the one worth splitting.' })
    ));

    // ---- trending slower ----------------------------------------------
    const trending = props
      .map((p) => ({ p, s: statsFor(model, p.id) }))
      .filter((r) => r.s?.trend)
      .sort((a, b) => Math.abs(b.s.trend.deltaMin) - Math.abs(a.s.trend.deltaMin))
      .slice(0, 6);
    if (trending.length) {
      this.el.appendChild(h('section.card', null,
        h('div.card-head', null, h('span.card-title', { text: 'Changing pace' })),
        h('div.stoplist', null, ...trending.map(({ p, s }) => h('div.stop', { style: { gridTemplateColumns: 'minmax(0,1fr) auto' } },
          h('span.meat', null,
            h('span.addr', { text: p.address }),
            h('span.meta', { text: `${Math.round(s.minutes)} min now · ${s.samples} visits` })),
          h('span.chip', {
            dataset: { kind: s.trend.direction === 'slower' ? 'time' : 'note' },
            text: `${s.trend.direction === 'slower' ? '+' : '−'}${Math.abs(Math.round(s.trend.deltaMin))} min`,
          })
        )))
      ));
    }

    // ---- longest / shortest -------------------------------------------
    const ranked = props
      .map((p) => ({ p, s: statsFor(model, p.id) }))
      .filter((r) => r.s && r.s.samples >= 2)
      .sort((a, b) => b.s.minutes - a.s.minutes);
    if (ranked.length >= 4) {
      this.el.appendChild(h('section.card', null,
        h('div.card-head', null, h('span.card-title', { text: 'Longest lawns' })),
        h('div.stoplist', null, ...ranked.slice(0, 5).map(({ p, s }) => h('div.stop', { style: { gridTemplateColumns: 'minmax(0,1fr) auto' } },
          h('span.meat', null,
            h('span.addr', { text: p.address }),
            h('span.meta', { text: `${DAY_FULL[p.day]} · ${s.samples} visits · confidence ${Math.round(s.confidence * 100)}%` })),
          h('span', { class: 'num', style: { font: 'var(--t-title2)' }, text: `${Math.round(s.minutes)}m` })
        )))
      ));
    }

    if (!learned.length) {
      this.el.appendChild(h('div.empty', null,
        h('div.art', null, svg(ICON.chart, { size: 34 })),
        h('h3', { text: 'Nothing learned yet' }),
        h('p', { text: 'Timing predictions build themselves from completed stops. After a few days of tapping Done, this screen fills in.' })
      ));
    }
  }
}

function stat(k, v) {
  return h('div.stat', null, h('div.k', { text: k }), h('div.v', { text: v }));
}
