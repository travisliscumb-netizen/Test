// Cashpilot — SVG charts.
//
// Hand-rolled rather than a charting library: this app has no build step and
// must work offline, so a CDN <script> would be both a CSP hole and a hard
// dependency on being online. These are the four chart types the app needs.
//
// Every chart returns an SVG string. Colours come from CSS custom properties so
// light and dark themes are handled by the stylesheet, not by JS.

import { formatMoneyShort, formatMoney, esc, formatMonth } from './util.js';

const PALETTE = [
  'var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)',
  'var(--c6)', 'var(--c7)', 'var(--c8)',
];

export const colorFor = (i) => PALETTE[i % PALETTE.length];

/** Nice round axis maximum so gridlines land on readable numbers. */
function niceMax(value) {
  if (value <= 0) return 100;
  const mag = 10 ** Math.floor(Math.log10(value));
  const norm = value / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

const svgOpen = (w, h, cls) =>
  `<svg viewBox="0 0 ${w} ${h}" class="chart ${cls}" preserveAspectRatio="xMidYMid meet" role="img">`;

function emptyChart(w, h, message) {
  return `${svgOpen(w, h, 'chart-empty')}<text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="middle" class="chart-empty-text">${esc(message)}</text></svg>`;
}

// --- grouped bars: income vs spending by month -------------------------------

export function incomeVsSpendingChart(months, { width = 720, height = 260 } = {}) {
  if (!months.length) return emptyChart(width, height, 'No months to chart yet');

  const pad = { top: 16, right: 12, bottom: 34, left: 56 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(1, ...months.flatMap((m) => [m.incomeCents, m.spendingCents])));
  const y = (cents) => pad.top + plotH - (cents / max) * plotH;

  const slot = plotW / months.length;
  const barW = Math.max(4, Math.min(22, slot / 3));

  const gridlines = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const gy = pad.top + plotH - f * plotH;
    return `<line x1="${pad.left}" y1="${gy}" x2="${width - pad.right}" y2="${gy}" class="grid"/>`
      + `<text x="${pad.left - 8}" y="${gy + 4}" text-anchor="end" class="axis">${esc(formatMoneyShort(max * f))}</text>`;
  }).join('');

  const bars = months.map((m, i) => {
    const cx = pad.left + slot * i + slot / 2;
    const incomeY = y(m.incomeCents);
    const spendY = y(m.spendingCents);
    return `
      <rect x="${cx - barW - 1}" y="${incomeY}" width="${barW}" height="${Math.max(0, pad.top + plotH - incomeY)}" rx="2" class="bar-income">
        <title>${esc(formatMonth(m.month))} income ${esc(formatMoney(m.incomeCents))}</title>
      </rect>
      <rect x="${cx + 1}" y="${spendY}" width="${barW}" height="${Math.max(0, pad.top + plotH - spendY)}" rx="2" class="bar-spend">
        <title>${esc(formatMonth(m.month))} spending ${esc(formatMoney(m.spendingCents))}</title>
      </rect>`;
  }).join('');

  // Label every month when there is room, otherwise every other one.
  const stride = slot < 46 ? 2 : 1;
  const labels = months.map((m, i) => (i % stride ? '' :
    `<text x="${pad.left + slot * i + slot / 2}" y="${height - 12}" text-anchor="middle" class="axis">${esc(m.month.slice(5))}</text>`)).join('');

  return `${svgOpen(width, height, 'chart-bars')}${gridlines}${bars}${labels}
    <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${width - pad.right}" y2="${pad.top + plotH}" class="axis-line"/>
  </svg>`;
}

// --- donut: category breakdown ----------------------------------------------

export function categoryDonut(rows, { size = 200, thickness = 26, max = 8 } = {}) {
  const total = rows.reduce((a, r) => a + r.cents, 0);
  if (!total) return emptyChart(size, size, 'No spending yet');

  // Collapse the long tail so the legend stays readable.
  const top = rows.slice(0, max);
  const restCents = rows.slice(max).reduce((a, r) => a + r.cents, 0);
  const slices = restCents > 0 ? [...top, { category: 'Other categories', cents: restCents }] : top;

  const r = size / 2 - thickness / 2;
  const cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  const arcs = slices.map((s, i) => {
    const frac = s.cents / total;
    const dash = `${frac * circumference} ${circumference}`;
    const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
      stroke="${colorFor(i)}" stroke-width="${thickness}"
      stroke-dasharray="${dash}" stroke-dashoffset="${-offset}"
      transform="rotate(-90 ${cx} ${cy})">
      <title>${esc(s.category)} ${esc(formatMoney(s.cents))} (${Math.round(frac * 100)}%)</title>
    </circle>`;
    offset += frac * circumference;
    return el;
  }).join('');

  return `${svgOpen(size, size, 'chart-donut')}${arcs}
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="donut-total">${esc(formatMoneyShort(total))}</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="donut-label">spent</text>
  </svg>`;
}

/** Legend rows matching categoryDonut's colour order. */
export function donutLegend(rows, { max = 8 } = {}) {
  const total = rows.reduce((a, r) => a + r.cents, 0);
  if (!total) return '';
  const top = rows.slice(0, max);
  const restCents = rows.slice(max).reduce((a, r) => a + r.cents, 0);
  const slices = restCents > 0 ? [...top, { category: 'Other categories', cents: restCents }] : top;
  return slices.map((s, i) => `
    <li class="legend-row">
      <span class="swatch" style="background:${colorFor(i)}"></span>
      <span class="legend-name">${esc(s.category)}</span>
      <span class="legend-value">${esc(formatMoney(s.cents))}</span>
      <span class="legend-share">${Math.round((s.cents / total) * 100)}%</span>
    </li>`).join('');
}

// --- line: balance forecast --------------------------------------------------

export function forecastChart(rows, { width = 720, height = 220 } = {}) {
  if (!rows.length) return emptyChart(width, height, 'Not enough history to forecast');

  const pad = { top: 16, right: 12, bottom: 28, left: 56 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const values = rows.map((r) => r.balanceCents);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = Math.max(1, hi - lo);
  const x = (i) => pad.left + (i / Math.max(1, rows.length - 1)) * plotW;
  const y = (v) => pad.top + plotH - ((v - lo) / span) * plotH;

  const line = rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r.balanceCents).toFixed(1)}`).join(' ');
  const area = `${line} L${x(rows.length - 1).toFixed(1)},${y(Math.max(lo, 0)).toFixed(1)} L${x(0).toFixed(1)},${y(Math.max(lo, 0)).toFixed(1)} Z`;

  const zeroY = y(0);
  const negative = values.some((v) => v < 0);
  // The first day the projection goes negative is the single most useful mark
  // on this chart, so it gets an explicit label rather than a tooltip.
  const firstNegative = rows.findIndex((r) => r.balanceCents < 0);

  return `${svgOpen(width, height, 'chart-line')}
    <line x1="${pad.left}" y1="${zeroY}" x2="${width - pad.right}" y2="${zeroY}" class="zero-line"/>
    <text x="${pad.left - 8}" y="${zeroY + 4}" text-anchor="end" class="axis">${esc(formatMoneyShort(0))}</text>
    <text x="${pad.left - 8}" y="${y(hi) + 4}" text-anchor="end" class="axis">${esc(formatMoneyShort(hi))}</text>
    ${negative ? `<text x="${pad.left - 8}" y="${y(lo) + 4}" text-anchor="end" class="axis">${esc(formatMoneyShort(lo))}</text>` : ''}
    <path d="${area}" class="${negative ? 'area area-warn' : 'area'}"/>
    <path d="${line}" class="${negative ? 'line line-warn' : 'line'}" fill="none"/>
    ${firstNegative > 0 ? `
      <circle cx="${x(firstNegative).toFixed(1)}" cy="${y(rows[firstNegative].balanceCents).toFixed(1)}" r="4" class="marker-warn"/>
      <text x="${Math.min(width - pad.right - 4, x(firstNegative) + 8).toFixed(1)}" y="${(y(rows[firstNegative].balanceCents) - 10).toFixed(1)}" class="marker-label" text-anchor="${x(firstNegative) > width * 0.7 ? 'end' : 'start'}">short by ${esc(rows[firstNegative].date.slice(5))}</text>` : ''}
    <text x="${pad.left}" y="${height - 8}" class="axis">${esc(rows[0].date.slice(5))}</text>
    <text x="${width - pad.right}" y="${height - 8}" text-anchor="end" class="axis">${esc(rows.at(-1).date.slice(5))}</text>
  </svg>`;
}

// --- sparkline ---------------------------------------------------------------

export function sparkline(values, { width = 120, height = 32 } = {}) {
  if (values.length < 2) return '';
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(1, hi - lo);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - 2) + 1;
    const y = height - 1 - ((v - lo) / span) * (height - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `${svgOpen(width, height, 'chart-spark')}<polyline points="${pts}" class="spark" fill="none"/></svg>`;
}

// --- budget bar --------------------------------------------------------------

export function budgetBar(spentCents, budgetCents) {
  const pct = budgetCents > 0 ? Math.min(1.35, spentCents / budgetCents) : 0;
  const over = spentCents > budgetCents;
  return `<div class="budget-bar" role="img" aria-label="${esc(formatMoney(spentCents))} of ${esc(formatMoney(budgetCents))}">
    <div class="budget-fill ${over ? 'over' : ''}" style="width:${Math.min(100, pct * 100).toFixed(1)}%"></div>
    ${over ? '<div class="budget-overflow"></div>' : ''}
  </div>`;
}
