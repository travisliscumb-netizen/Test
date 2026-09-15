// Cashpilot — shared primitives.
//
// MONEY RULE: every amount in this app is an integer number of cents.
// Floats are used only at the edges (parsing user text, rendering). A dollar
// value never round-trips through a float, because 0.1 + 0.2 !== 0.3 and a
// ledger that drifts by a cent per transaction is worthless.

import { LOCALE, CURRENCY } from './config.js';

// --- ids ---------------------------------------------------------------------

/** Collision-resistant id that sorts roughly by creation time. */
export function uid(prefix = 'id') {
  const t = Date.now().toString(36);
  const r = (crypto.getRandomValues(new Uint32Array(2)));
  return `${prefix}_${t}${r[0].toString(36)}${r[1].toString(36)}`;
}

// --- money -------------------------------------------------------------------

/**
 * Parse arbitrary user/model text into integer cents.
 * Handles "$1,234.56", "1234.5", "-12", "(12.00)" (accounting negative), "12,50"
 * (European decimal comma), and bare numbers. Returns null when there is no
 * number at all, so callers can distinguish "zero" from "absent".
 */
export function parseMoney(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * 100);
  }
  let s = String(input).trim();
  if (!s) return null;

  // Accounting negatives: (12.34) means -12.34
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }

  s = s.replace(/[^0-9.,\-]/g, '');
  if (s.startsWith('-')) { negative = true; }
  s = s.replace(/-/g, '');
  if (!s) return null;

  // Decide which separator is the decimal point.
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized;
  if (lastComma === -1 && lastDot === -1) {
    normalized = s;
  } else if (lastComma > lastDot) {
    // comma is the decimal separator: strip dots (thousands), swap comma
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else {
    // dot is the decimal separator: strip commas (thousands)
    normalized = s.replace(/,/g, '');
  }
  // Collapse any remaining stray separators.
  const parts = normalized.split('.');
  if (parts.length > 2) normalized = parts.shift() + '.' + parts.join('');

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  // Round on the string-derived float exactly once.
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

/** Integer cents -> display string, e.g. -123456 => "-$1,234.56". */
export function formatMoney(cents, { sign = false, cad = false } = {}) {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '—';
  // Normalize negative zero. `-sumCents([])` is -0, and Intl renders that as
  // "-$0.00", which shows up as "−-$0.00" wherever the UI adds its own minus.
  if (cents === 0) cents = 0;
  const fmt = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    currencyDisplay: cad ? 'code' : 'symbol',
  });
  const out = fmt.format(cents / 100);
  return sign && cents > 0 ? `+${out}` : out;
}

/** Compact form for dense chart labels: "$1.2k", "$980". */
export function formatMoneyShort(cents) {
  if (!Number.isFinite(cents)) return '—';
  const abs = Math.abs(cents) / 100;
  const sign = cents < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** Sum integer cents without float drift. */
export const sumCents = (xs) => xs.reduce((a, b) => a + (b | 0), 0) || 0;

/**
 * Split `cents` into `n` parts that sum exactly back to `cents`.
 * Used anywhere an amount is prorated, so remainders are never dropped.
 */
export function allocate(cents, n) {
  if (n <= 0) return [];
  const base = Math.trunc(cents / n);
  let remainder = cents - base * n;
  const step = remainder >= 0 ? 1 : -1;
  const out = new Array(n).fill(base);
  for (let i = 0; remainder !== 0; i = (i + 1) % n) {
    out[i] += step;
    remainder -= step;
  }
  return out;
}

// --- dates -------------------------------------------------------------------
// All dates are stored as 'YYYY-MM-DD' local-calendar strings. We never store a
// bare Date or an ISO timestamp for a transaction date: `new Date('2026-09-15')`
// parses as UTC midnight and renders as Sep 14 in any negative-offset timezone,
// which silently moves transactions into the wrong month.

/** 'YYYY-MM-DD' for a Date in the *local* timezone. */
export function toISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM-DD' -> local Date at midnight. Inverse of toISODate. */
export function fromISODate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function isValidISODate(s) {
  const d = fromISODate(s);
  return !!d && toISODate(d) === String(s).slice(0, 10);
}

export const monthKey = (iso) => String(iso || '').slice(0, 7); // 'YYYY-MM'

export function addDays(iso, days) {
  const d = fromISODate(iso);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function addMonths(iso, months) {
  const d = fromISODate(iso);
  if (!d) return null;
  const targetDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  // Clamp: Jan 31 + 1 month => Feb 28/29, not Mar 3.
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, lastDay));
  return toISODate(d);
}

export function daysBetween(aISO, bISO) {
  const a = fromISODate(aISO), b = fromISODate(bISO);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

export const startOfMonth = (iso) => `${monthKey(iso)}-01`;

export function endOfMonth(iso) {
  const d = fromISODate(startOfMonth(iso));
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return toISODate(d);
}

export function daysInMonth(mKey) {
  const d = fromISODate(`${mKey}-01`);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** Inclusive range check on 'YYYY-MM-DD' strings (lexicographic is correct here). */
export const inRange = (iso, from, to) =>
  (!from || iso >= from) && (!to || iso <= to);

/** List of 'YYYY-MM' keys from `from` to `to` inclusive. */
export function monthRange(fromISO, toISO) {
  const out = [];
  let cur = startOfMonth(fromISO);
  const end = startOfMonth(toISO);
  let guard = 0;
  while (cur <= end && guard++ < 600) {
    out.push(monthKey(cur));
    cur = addMonths(cur, 1);
  }
  return out;
}

export function formatDate(iso, opts = { month: 'short', day: 'numeric' }) {
  const d = fromISODate(iso);
  return d ? new Intl.DateTimeFormat(LOCALE, opts).format(d) : '—';
}

export function formatMonth(mKey) {
  const d = fromISODate(`${mKey}-01`);
  return d ? new Intl.DateTimeFormat(LOCALE, { month: 'short', year: 'numeric' }).format(d) : mKey;
}

// --- misc --------------------------------------------------------------------

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function debounce(fn, ms) {
  let t;
  const wrapped = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

/** Escape for safe interpolation into innerHTML. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Normalize a merchant string for grouping: case/punctuation/store-number noise. */
export function normalizeMerchant(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/[#*]+\s*\d+/g, ' ')        // "COSTCO #123"
    .replace(/\b\d{4,}\b/g, ' ')          // long digit runs (terminal ids)
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Stable JSON stringify so a data file's bytes don't churn on every save. */
export function stableStringify(value, space = 2) {
  const seen = new WeakSet();
  const walk = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) throw new TypeError('Cannot serialize circular structure');
    seen.add(v);
    if (Array.isArray(v)) return v.map(walk);
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, walk(v[k])]));
  };
  return JSON.stringify(walk(value), null, space);
}
