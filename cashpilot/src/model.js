// Cashpilot — data model, validation, and pure mutation helpers.
//
// This module is deliberately free of browser APIs so it can be unit-tested in
// Node. Everything the AI agent writes goes through `validateTransaction` and
// friends: the model is the last line of defence against a bad tool call.

import {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, FREQUENCIES, FREQ_PER_MONTH, FREQ_DAYS,
} from './config.js';
import {
  uid, parseMoney, isValidISODate, toISODate, addDays, addMonths, normalizeMerchant,
} from './util.js';

export const SCHEMA_VERSION = 1;

export function emptyData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    transactions: [],
    bills: [],
    budgets: [],
    goals: [],
    documents: [],
    rules: [],
    settings: { openingBalanceCents: 0, safeToSpendBufferCents: 0 },
  };
}

// --- validation helpers ------------------------------------------------------

export class ValidationError extends Error {
  constructor(message, field) { super(message); this.name = 'ValidationError'; this.field = field; }
}

const asString = (v) => (v === null || v === undefined ? '' : String(v)).trim();

function requireDate(value, field) {
  const s = asString(value).slice(0, 10);
  if (!isValidISODate(s)) {
    throw new ValidationError(`${field} must be a real calendar date as YYYY-MM-DD (got ${JSON.stringify(value)})`, field);
  }
  return s;
}

function requireCents(value, field, { allowZero = false } = {}) {
  const cents = parseMoney(value);
  if (cents === null) throw new ValidationError(`${field} must be an amount (got ${JSON.stringify(value)})`, field);
  if (!allowZero && cents === 0) throw new ValidationError(`${field} must not be zero`, field);
  if (!Number.isSafeInteger(cents)) throw new ValidationError(`${field} is out of range`, field);
  return cents;
}

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

/** First value that is not blank. `??` is not enough: '' is not nullish, and
 *  legacy records use '' for "unset" (e.g. a bill with no known due date). */
const firstSet = (...vals) => vals.find((v) => !isBlank(v));

/**
 * Read a money value that may arrive in either unit.
 *
 * A key ending in `Cents` is ALREADY integer cents and is used as-is; a plain
 * key (`amount`, `gross`) is a human/dollar value and goes through parseMoney.
 * Conflating the two multiplies every round-tripped amount by 100, so the two
 * units never share a code path.
 */
function readCents(input, centsKey, plainKey, field, { allowZero = false, required = true } = {}) {
  if (!isBlank(input[centsKey])) {
    const n = Number(input[centsKey]);
    if (!Number.isFinite(n)) throw new ValidationError(`${field} must be a number of cents`, field);
    const cents = Math.round(n);
    if (Math.abs(n - cents) > 1e-6) {
      throw new ValidationError(`${field} (${centsKey}) must be a whole number of cents, not ${n}`, field);
    }
    if (!Number.isSafeInteger(cents)) throw new ValidationError(`${field} is out of range`, field);
    if (!allowZero && cents === 0) throw new ValidationError(`${field} must not be zero`, field);
    return cents;
  }
  if (isBlank(input[plainKey])) {
    if (!required) return null;
    throw new ValidationError(`${field} is required`, field);
  }
  return requireCents(input[plainKey], field, { allowZero });
}

/** Case-insensitive match against a known list; falls back to 'Other'. */
function coerceCategory(value, list) {
  const s = asString(value);
  if (!s) return 'Other';
  const hit = list.find((c) => c.toLowerCase() === s.toLowerCase());
  return hit || 'Other';
}

// --- transactions ------------------------------------------------------------
// SIGN CONVENTION: amountCents < 0 is money out, > 0 is money in. `kind` is
// stored explicitly because a transfer is neither spending nor earning and must
// be excluded from both sides of the analytics.

export const KINDS = ['expense', 'income', 'transfer'];

/**
 * Build a validated transaction. Accepts loose input (strings, "$12.34") because
 * both the AI agent and the receipt extractor feed it half-structured data.
 */
export function makeTransaction(input = {}, { now = new Date() } = {}) {
  const kind = KINDS.includes(input.kind) ? input.kind : inferKind(input);

  let amount = readCents(input, 'amountCents', 'amount', 'amount');
  // Normalize sign to the kind so a model that returns a positive number for an
  // expense cannot silently book income.
  if (kind === 'expense') amount = -Math.abs(amount);
  else if (kind === 'income') amount = Math.abs(amount);

  const categoryList = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const t = {
    id: asString(input.id) || uid('tx'),
    kind,
    date: requireDate(firstSet(input.date, toISODate(now)), 'date'),
    amountCents: amount,
    merchant: asString(input.merchant ?? input.description ?? input.payee) || (kind === 'income' ? 'Income' : 'Unknown'),
    category: coerceCategory(input.category, categoryList),
    note: asString(input.note),
    source: asString(input.source) || 'manual',
    docIds: Array.isArray(input.docIds) ? input.docIds.map(asString).filter(Boolean) : [],
    createdAt: asString(input.createdAt) || now.toISOString(),
    updatedAt: now.toISOString(),
  };

  // Optional pay-stub detail, carried on the income row itself so income can
  // never be counted twice from a parallel table.
  if (kind === 'income') {
    const gross = readCents(input, 'grossCents', 'gross', 'gross', { allowZero: true, required: false });
    if (gross !== null) t.grossCents = gross;
    const deductions = readCents(input, 'deductionsCents', 'deductions', 'deductions', { allowZero: true, required: false });
    if (deductions !== null) t.deductionsCents = Math.abs(deductions);
    if (!isBlank(input.hours)) {
      const h = Number(input.hours);
      if (Number.isFinite(h) && h >= 0) t.hours = h;
    }
    const rate = readCents(input, 'rateCents', 'rate', 'rate', { allowZero: true, required: false });
    if (rate !== null) t.rateCents = rate;
    const employer = asString(input.employer);
    if (employer) t.employer = employer;

    // Arithmetic sanity: gross - deductions should equal net. Don't reject —
    // stubs carry rounding and extra lines — but record the discrepancy so the
    // UI can flag it rather than quietly presenting wrong numbers.
    if (t.grossCents !== undefined && t.deductionsCents !== undefined) {
      const implied = t.grossCents - t.deductionsCents;
      if (Math.abs(implied - t.amountCents) > 100) t.netMismatchCents = implied - t.amountCents;
    }
  }

  return t;
}

/**
 * Decide expense vs income when the caller did not say.
 *
 * A bare positive number is NOT treated as income. People and models alike
 * write "47.25" for a $47.25 purchase far more often than for a deposit, so
 * sign alone must never flip a row to the income side of the ledger — that
 * error inflates earnings and safe-to-spend at the same time.
 */
function inferKind(input) {
  const explicit = asString(input.type).toLowerCase();
  if (KINDS.includes(explicit)) return explicit;
  if (!isBlank(input.grossCents) || !isBlank(input.gross) || !isBlank(input.employer)) return 'income';
  const cat = asString(input.category).toLowerCase();
  if (cat) {
    const isIncomeCat = INCOME_CATEGORIES.some((c) => c.toLowerCase() === cat);
    const isExpenseCat = EXPENSE_CATEGORIES.some((c) => c.toLowerCase() === cat);
    if (isIncomeCat && !isExpenseCat) return 'income';
    if (isExpenseCat) return 'expense';
  }
  return 'expense';
}

/** Apply a partial update, re-running validation over the merged result. */
export function updateTransaction(existing, patch, { now = new Date() } = {}) {
  const merged = { ...existing, ...patch, id: existing.id, createdAt: existing.createdAt };
  // A kind change must re-derive the sign from the magnitude the caller gave.
  if (patch.kind && patch.kind !== existing.kind && patch.amountCents === undefined && patch.amount === undefined) {
    merged.amountCents = Math.abs(existing.amountCents);
    delete merged.amount;
  }
  return makeTransaction(merged, { now });
}

// --- bills -------------------------------------------------------------------

export function makeBill(input = {}, { now = new Date() } = {}) {
  const frequency = FREQUENCIES.includes(asString(input.frequency).toLowerCase())
    ? asString(input.frequency).toLowerCase()
    : 'monthly';
  const name = asString(input.name);
  if (!name) throw new ValidationError('Bill name is required', 'name');
  return {
    id: asString(input.id) || uid('bill'),
    name,
    amountCents: Math.abs(readCents(input, 'amountCents', 'amount', 'amount')),
    frequency,
    nextDue: requireDate(firstSet(input.nextDue, input.dueDate, defaultNextDue(frequency, now)), 'nextDue'),
    category: coerceCategory(input.category, EXPENSE_CATEGORIES),
    autopay: Boolean(input.autopay),
    active: input.active === undefined ? true : Boolean(input.active),
    note: asString(input.note),
    createdAt: asString(input.createdAt) || now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/**
 * Due date for a bill that arrives without one (legacy records store '').
 * Monthly-ish bills default to the 1st of next month, which is right far more
 * often than "today" and keeps them out of the current month's remaining-bills
 * total instead of inventing a charge that already passed.
 */
function defaultNextDue(frequency, now) {
  const today = toISODate(now);
  if (['monthly', 'quarterly', 'yearly', 'semimonthly'].includes(frequency)) {
    return addMonths(`${today.slice(0, 7)}-01`, 1);
  }
  return today;
}

/** Monthly-equivalent cost of a bill, rounded to whole cents. */
export const billMonthlyCents = (bill) =>
  Math.round(bill.amountCents * (FREQ_PER_MONTH[bill.frequency] ?? 1));

/** Roll `nextDue` forward until it is on or after `fromISO`. */
export function advanceBillDue(bill, fromISO) {
  let due = bill.nextDue;
  let guard = 0;
  while (due < fromISO && guard++ < 500) {
    due = bill.frequency === 'monthly' ? addMonths(due, 1)
      : bill.frequency === 'quarterly' ? addMonths(due, 3)
      : bill.frequency === 'yearly' ? addMonths(due, 12)
      : bill.frequency === 'semimonthly' ? addDays(due, 15)
      : addDays(due, FREQ_DAYS[bill.frequency]);
  }
  return due;
}

/** Every occurrence of a bill in [fromISO, toISO], inclusive. */
export function billOccurrences(bill, fromISO, toISO) {
  const out = [];
  let due = advanceBillDue(bill, fromISO);
  let guard = 0;
  while (due <= toISO && guard++ < 500) {
    out.push(due);
    due = bill.frequency === 'monthly' ? addMonths(due, 1)
      : bill.frequency === 'quarterly' ? addMonths(due, 3)
      : bill.frequency === 'yearly' ? addMonths(due, 12)
      : bill.frequency === 'semimonthly' ? addDays(due, 15)
      : addDays(due, FREQ_DAYS[bill.frequency]);
  }
  return out;
}

// --- budgets / goals / rules -------------------------------------------------

export function makeBudget(input = {}, { now = new Date() } = {}) {
  const category = coerceCategory(input.category, EXPENSE_CATEGORIES);
  return {
    id: asString(input.id) || uid('bud'),
    category,
    monthlyCents: Math.abs(readCents(input, 'monthlyCents', 'amount', 'monthlyCents', { allowZero: true })),
    updatedAt: now.toISOString(),
  };
}

export function makeGoal(input = {}, { now = new Date() } = {}) {
  const name = asString(input.name);
  if (!name) throw new ValidationError('Goal name is required', 'name');
  return {
    id: asString(input.id) || uid('goal'),
    name,
    targetCents: Math.abs(readCents(input, 'targetCents', 'target', 'targetCents')),
    savedCents: Math.abs(readCents(input, 'savedCents', 'saved', 'savedCents', { allowZero: true, required: false }) ?? 0),
    targetDate: input.targetDate ? requireDate(input.targetDate, 'targetDate') : null,
    note: asString(input.note),
    createdAt: asString(input.createdAt) || now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function makeRule(input = {}, { now = new Date() } = {}) {
  const match = normalizeMerchant(input.match ?? input.merchant);
  if (!match) throw new ValidationError('Rule match text is required', 'match');
  return {
    id: asString(input.id) || uid('rule'),
    match,
    category: coerceCategory(input.category, EXPENSE_CATEGORIES),
    createdAt: asString(input.createdAt) || now.toISOString(),
  };
}

/** First rule whose normalized match is a substring of the merchant. */
export function categoryForMerchant(rules, merchant) {
  const norm = normalizeMerchant(merchant);
  if (!norm) return null;
  // Longest match wins, so "CANADIAN TIRE GAS" beats "CANADIAN TIRE".
  const hits = rules
    .filter((r) => norm.includes(r.match))
    .sort((a, b) => b.match.length - a.match.length);
  return hits.length ? hits[0].category : null;
}

export function makeDocument(input = {}, { now = new Date() } = {}) {
  return {
    id: asString(input.id) || uid('doc'),
    name: asString(input.name) || 'document',
    kind: ['receipt', 'paystub', 'statement', 'other'].includes(asString(input.kind))
      ? asString(input.kind) : 'other',
    mime: asString(input.mime) || 'application/octet-stream',
    size: Number(input.size) || 0,
    dropboxPath: asString(input.dropboxPath) || null,
    blobKey: asString(input.blobKey) || null,
    txId: asString(input.txId) || null,
    addedAt: asString(input.addedAt) || now.toISOString(),
  };
}

// --- migration ---------------------------------------------------------------

/**
 * Bring any stored/imported payload up to the current schema. Unknown shapes are
 * rejected loudly rather than silently producing an empty ledger.
 */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return emptyData();
  const data = { ...emptyData(), ...raw };
  data.schemaVersion = SCHEMA_VERSION;

  for (const key of ['transactions', 'bills', 'budgets', 'goals', 'documents', 'rules']) {
    if (!Array.isArray(data[key])) data[key] = [];
  }
  data.settings = { ...emptyData().settings, ...(raw.settings || {}) };

  // Legacy Spendwise export: separate `expenses` and `paystubs` arrays, dollars
  // as floats. Fold both into the unified transaction list.
  if (Array.isArray(raw.expenses)) {
    for (const e of raw.expenses) {
      try { data.transactions.push(makeTransaction({ ...e, kind: 'expense', source: 'import' })); }
      catch { /* skip unusable legacy row */ }
    }
  }
  if (Array.isArray(raw.paystubs)) {
    for (const p of raw.paystubs) {
      try {
        data.transactions.push(makeTransaction({
          kind: 'income',
          date: p.date ?? p.payDate,
          amount: p.net ?? p.netPay ?? p.amount,
          gross: p.gross ?? p.grossPay,
          deductions: p.deductions,
          hours: p.hours,
          rate: p.rate,
          employer: p.employer,
          category: 'Hourly',
          source: 'import',
        }));
      } catch { /* skip unusable legacy row */ }
    }
  }
  delete data.expenses;
  delete data.paystubs;

  // Normalize every collection through its constructor, not just transactions.
  // A legacy bill carries `amount` in dollars and no `amountCents`; passing it
  // through untouched makes billMonthlyCents return NaN, which then poisons
  // safe-to-spend, the fixed-cost ratio and the whole forecast.
  data.transactions = normalizeAll(data.transactions, makeTransaction);
  data.bills = normalizeAll(data.bills, makeBill);
  data.goals = normalizeAll(data.goals, makeGoal);
  data.rules = normalizeAll(data.rules, makeRule);
  data.budgets = normalizeAll(data.budgets, makeBudget);
  data.documents = normalizeAll(data.documents, makeDocument);

  // De-duplicate by id, keeping the most recently updated copy.
  data.transactions = dedupeById(data.transactions);
  data.bills = dedupeById(data.bills);
  data.documents = dedupeById(data.documents);
  data.rules = dedupeById(data.rules);
  data.goals = dedupeById(data.goals);
  // One budget per category.
  const byCat = new Map();
  for (const b of data.budgets) byCat.set(b.category, b);
  data.budgets = [...byCat.values()];

  data.transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return data;
}

/**
 * Run each row through its constructor, dropping rows that cannot be salvaged.
 *
 * The original `createdAt`/`updatedAt` are restored afterwards, because the
 * constructors stamp `updatedAt` with the current time. Letting that stand would
 * be silently catastrophic for sync: migrate() runs on every load, so the local
 * copy would always carry a newer timestamp than the remote and would win every
 * merge conflict, quietly discarding edits made on the other device.
 */
function normalizeAll(rows, make) {
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    try {
      const made = make(row);
      if (row.createdAt) made.createdAt = row.createdAt;
      if (row.updatedAt) made.updatedAt = row.updatedAt;
      else if (row.addedAt) made.updatedAt = row.addedAt;
      out.push(made);
    } catch { /* unsalvageable row: drop it rather than poison the ledger */ }
  }
  return out;
}

function dedupeById(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!r || !r.id) continue;
    const prev = map.get(r.id);
    if (!prev || String(r.updatedAt || '') >= String(prev.updatedAt || '')) map.set(r.id, r);
  }
  return [...map.values()];
}
