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
    // One figure and a sentence, not a row of stat tiles. Three numbers side
    // by side under three labels is the shape of a business dashboard, and it
    // makes the reader compare things that are not comparable.
    this.el.appendChild(h('section.panel', null,
      h('div.panel-head', null, h('span.panel-lab', { text: 'What the app has learned' })),
      h('div.figure', { text: `${learned.length} of ${props.length} lawns` }),
      h('p.prose', { text: `have their own timing now — ${confident.length} of them confidently. `
        + `Built from ${model?.sampleCount ?? 0} service samples across ${model?.sessionCount ?? 0} recorded days.` }),
      h('p.prose', { text: 'A lawn needs about four consistent visits before its own timing overrides the day average, so the rest are still being measured.' })
    ));

    // ---- travel model -------------------------------------------------
    const t = model?.travel;
    if (t) {
      this.el.appendChild(h('section.panel', null,
        h('div.panel-head', null, h('span.panel-lab', { text: 'Your driving' })),
        h('div.figure', { text: `${(60 / t.perKmMin).toFixed(1)} km/h` }),
        h('p.prose', {
          text: `Effective door-to-door speed including parking and ramps — ${t.perKmMin.toFixed(2)} min per km plus ${t.fixedMin.toFixed(1)} min stopped at each property.` }),
        h('p.prose', {
          text: t.refit
            ? `Fitted from ${t.n} of your own stop-to-stop transitions, using a method that ignores the slowest and fastest quarter so a lunch break cannot skew it.`
            : `Using the starting model — ${t.n} clean transitions recorded so far, ${Math.max(0, 40 - t.n)} more needed before it re-fits to you.` })
      ));
    }

    // ---- day load -----------------------------------------------------
    // Drawn in the same language as the day ribbon rather than as a bar chart:
    // each weekday is a length of route with its stops as ticks, so the width
    // says how long the day is and the ticks say how it is divided. A bar would
    // have said only the first of those, and would have looked like a report.
    const rows = DAY_KEYS.map((d) => {
      const dayProps = store.propertiesForWeekday(d, settings.crew);
      const mins = dayProps.map((p) => statsFor(model, p.id)?.minutes ?? model?.global?.minutes ?? 15);
      return { day: d, count: dayProps.length, mins, total: mins.reduce((a, b) => a + b, 0) };
    });
    const maxMins = Math.max(1, ...rows.map((r) => r.total));
    this.el.appendChild(h('section.panel', null,
      h('div.panel-head', null, h('span.panel-lab', { text: 'Weekly load' })),
      h('div.loadlist', null, ...rows.map((r) => h('div.loadrow', { dataset: { heavy: String(r.total >= maxMins * 0.92) } },
        h('div.loadhead', null,
          h('span.loadday', { text: DAY_FULL[r.day] }),
          h('span.loadnum', { text: `${r.count} stops · ${formatDuration(r.total)}${r.total >= maxMins * 0.92 ? ' · longest' : ''}` })),
        dayBar(r, maxMins)
      ))),
      h('p.prose', {
        text: 'Cutting time only — driving is on top of this. The longest day is the one worth splitting.' })
    ));

    // ---- trending slower ----------------------------------------------
    const trending = props
      .map((p) => ({ p, s: statsFor(model, p.id) }))
      .filter((r) => r.s?.trend)
      .sort((a, b) => Math.abs(b.s.trend.deltaMin) - Math.abs(a.s.trend.deltaMin))
      .slice(0, 6);
    if (trending.length) {
      this.el.appendChild(h('section.panel', null,
        h('div.panel-head', null, h('span.panel-lab', { text: 'Changing pace' })),
        h('div.plainlist', null, ...trending.map(({ p, s }) => h('div.stop', null,
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
      this.el.appendChild(h('section.panel', null,
        h('div.panel-head', null, h('span.panel-lab', { text: 'Longest lawns' })),
        h('div.plainlist', null, ...ranked.slice(0, 5).map(({ p, s }) => h('div.stop', null,
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

/**
 * One weekday drawn as a length of route rather than as a bar: a rule sitting
 * on a baseline, with each stop as a riser. The length says how long the day
 * is, the risers say how it is divided, and neither needs a colour key.
 */
function dayBar(row, maxMins) {
  const NSU = 'http://www.w3.org/2000/svg';
  const W = 320, H = 14, BASE = 11;
  const svgEl = document.createElementNS(NSU, 'svg');
  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svgEl.setAttribute('preserveAspectRatio', 'none');
  svgEl.setAttribute('class', 'loadbar');
  svgEl.setAttribute('aria-hidden', 'true');
  const w = Math.max(2, W * (row.total / maxMins));

  const base = document.createElementNS(NSU, 'line');
  base.setAttribute('x1', 0); base.setAttribute('x2', W);
  base.setAttribute('y1', BASE); base.setAttribute('y2', BASE);
  base.setAttribute('class', 'loadbar-base');
  svgEl.appendChild(base);

  const rule = document.createElementNS(NSU, 'line');
  rule.setAttribute('x1', 0); rule.setAttribute('x2', w);
  rule.setAttribute('y1', BASE); rule.setAttribute('y2', BASE);
  rule.setAttribute('class', 'loadbar-rule');
  svgEl.appendChild(rule);

  let x = 0;
  for (const m of row.mins) {
    const t = document.createElementNS(NSU, 'line');
    t.setAttribute('x1', x); t.setAttribute('x2', x);
    t.setAttribute('y1', BASE); t.setAttribute('y2', 3);
    t.setAttribute('class', 'loadbar-tick');
    svgEl.appendChild(t);
    x += (m / Math.max(1, row.total)) * w;
  }
  return svgEl;
}

