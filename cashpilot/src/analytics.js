// Cashpilot — analytics. Pure functions over a data object, no browser APIs,
// every amount in integer cents.
//
// Design rule: nothing here returns a bare number where the user might ask
// "where did that come from". Composite figures return their components too, so
// the UI can show the arithmetic instead of asserting a total.

import { NON_SPEND_CATEGORIES, FREQ_PER_MONTH } from './config.js';
import {
  monthKey, startOfMonth, endOfMonth, toISODate, addDays, addMonths, daysBetween,
  monthRange, inRange, normalizeMerchant, sumCents, daysInMonth,
} from './util.js';
import { billMonthlyCents, billOccurrences } from './model.js';

// --- selection ---------------------------------------------------------------

export const isSpending = (t) =>
  t.kind === 'expense' && !NON_SPEND_CATEGORIES.has(t.category);

export const isIncome = (t) => t.kind === 'income';

export function inWindow(transactions, from, to) {
  return transactions.filter((t) => inRange(t.date, from, to));
}

/** Money out (positive cents) over a set of transactions. The `|| 0` keeps
 *  negative zero out of the figures the UI renders. */
export const spendTotal = (txs) => -sumCents(txs.filter(isSpending).map((t) => t.amountCents)) || 0;
/** Money in (positive cents). */
export const incomeTotal = (txs) => sumCents(txs.filter(isIncome).map((t) => t.amountCents));

// --- headline summary --------------------------------------------------------

export function summarize(data, from, to) {
  const txs = inWindow(data.transactions, from, to);
  const income = incomeTotal(txs);
  const spending = spendTotal(txs);
  const saved = sumCents(txs.filter((t) => t.kind === 'expense' && NON_SPEND_CATEGORIES.has(t.category))
    .map((t) => -t.amountCents));
  const net = income - spending - saved;
  return {
    from, to,
    incomeCents: income,
    spendingCents: spending,
    savedCents: saved,
    netCents: net,
    // Savings rate counts explicit savings plus whatever income went unspent.
    savingsRate: income > 0 ? (income - spending) / income : null,
    transactionCount: txs.length,
  };
}

// --- breakdowns --------------------------------------------------------------

/** [{category, cents, share, count}] sorted desc. Expenses only. */
export function byCategory(txs) {
  const map = new Map();
  for (const t of txs) {
    if (!isSpending(t)) continue;
    const prev = map.get(t.category) || { category: t.category, cents: 0, count: 0 };
    prev.cents += -t.amountCents;
    prev.count += 1;
    map.set(t.category, prev);
  }
  const rows = [...map.values()].sort((a, b) => b.cents - a.cents);
  const total = sumCents(rows.map((r) => r.cents));
  for (const r of rows) r.share = total > 0 ? r.cents / total : 0;
  return rows;
}

/** [{merchant, cents, count, lastDate}] sorted desc, grouped on normalized name. */
export function byMerchant(txs, limit = 10) {
  const map = new Map();
  for (const t of txs) {
    if (!isSpending(t)) continue;
    const key = normalizeMerchant(t.merchant) || 'UNKNOWN';
    const prev = map.get(key) || { merchant: t.merchant, key, cents: 0, count: 0, lastDate: t.date };
    prev.cents += -t.amountCents;
    prev.count += 1;
    if (t.date > prev.lastDate) { prev.lastDate = t.date; prev.merchant = t.merchant; }
    map.set(key, prev);
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents).slice(0, limit);
}

/** Monthly series across the full span of the data (or an explicit window). */
export function monthlySeries(data, fromISO, toISO) {
  const txs = data.transactions;
  if (!txs.length) return [];
  const first = fromISO || txs.reduce((m, t) => (t.date < m ? t.date : m), txs[0].date);
  const last = toISO || txs.reduce((m, t) => (t.date > m ? t.date : m), txs[0].date);
  const keys = monthRange(first, last);
  const buckets = new Map(keys.map((k) => [k, { month: k, incomeCents: 0, spendingCents: 0, savedCents: 0 }]));
  for (const t of txs) {
    const b = buckets.get(monthKey(t.date));
    if (!b) continue;
    if (isIncome(t)) b.incomeCents += t.amountCents;
    else if (isSpending(t)) b.spendingCents += -t.amountCents;
    else if (t.kind === 'expense') b.savedCents += -t.amountCents;
  }
  const rows = [...buckets.values()];
  for (const r of rows) r.netCents = r.incomeCents - r.spendingCents - r.savedCents;
  return rows;
}

/** Daily cumulative spend within a month — for the burn-down chart. */
export function dailyBurn(data, mKey) {
  const from = `${mKey}-01`, to = endOfMonth(from);
  const txs = inWindow(data.transactions, from, to).filter(isSpending);
  const n = daysInMonth(mKey);
  const perDay = new Array(n).fill(0);
  for (const t of txs) perDay[Number(t.date.slice(8, 10)) - 1] += -t.amountCents;
  let running = 0;
  return perDay.map((cents, i) => {
    running += cents;
    return { day: i + 1, date: `${mKey}-${String(i + 1).padStart(2, '0')}`, dayCents: cents, cumulativeCents: running };
  });
}

// --- income cadence ----------------------------------------------------------

/**
 * Infer pay rhythm from actual income history. Returns null when there are
 * fewer than two pay events — guessing a cadence from one data point would put
 * a fabricated number on the dashboard.
 */
export function incomeProfile(data, { asOf = toISODate(), lookbackDays = 180 } = {}) {
  const from = addDays(asOf, -lookbackDays);
  const pays = data.transactions
    .filter((t) => isIncome(t) && t.date >= from && t.date <= asOf)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (pays.length < 2) {
    return { count: pays.length, medianGapDays: null, averageNetCents: pays.length ? pays[0].amountCents : 0, cadence: null, lastPayDate: pays.at(-1)?.date ?? null, monthlyEstimateCents: null };
  }
  const gaps = [];
  for (let i = 1; i < pays.length; i++) gaps.push(daysBetween(pays[i - 1].date, pays[i].date));
  const medianGap = median(gaps.filter((g) => g > 0));
  const amounts = pays.map((p) => p.amountCents);
  const averageNet = Math.round(sumCents(amounts) / amounts.length);

  const cadence = medianGap == null ? null
    : medianGap <= 9 ? 'weekly'
      : medianGap <= 18 ? 'biweekly'
        : medianGap <= 24 ? 'semimonthly'
          : medianGap <= 45 ? 'monthly' : null;

  const monthlyEstimate = cadence
    ? Math.round(averageNet * FREQ_PER_MONTH[cadence])
    : Math.round(sumCents(amounts) / Math.max(1, daysBetween(pays[0].date, pays.at(-1).date)) * 30.44);

  return {
    count: pays.length,
    medianGapDays: medianGap,
    averageNetCents: averageNet,
    medianNetCents: median(amounts),
    cadence,
    lastPayDate: pays.at(-1).date,
    monthlyEstimateCents: monthlyEstimate,
  };
}

/** Projected pay dates strictly after `lastPayDate` and up to `toISO`. */
export function projectedPayDates(profile, toISO) {
  if (!profile.cadence || !profile.lastPayDate) return [];
  const step = { weekly: 7, biweekly: 14, semimonthly: 15, monthly: 30 }[profile.cadence];
  const out = [];
  let d = addDays(profile.lastPayDate, step);
  let guard = 0;
  while (d <= toISO && guard++ < 200) { out.push(d); d = addDays(d, step); }
  return out;
}

// --- safe to spend -----------------------------------------------------------

/**
 * How much is genuinely free to spend for the rest of the current month.
 *
 * This app has no bank connection, so this is an INCOME-AND-OBLIGATIONS model,
 * not a balance model: it answers "of the money this month will bring in, how
 * much is not already claimed?" Every component is returned so the UI can show
 * the subtraction rather than asking the user to trust a single number.
 */
export function safeToSpend(data, { asOf = toISODate() } = {}) {
  const mKey = monthKey(asOf);
  const from = startOfMonth(asOf);
  const to = endOfMonth(asOf);
  const txs = inWindow(data.transactions, from, to);

  const receivedCents = incomeTotal(txs);
  const profile = incomeProfile(data, { asOf });
  const upcomingPays = projectedPayDates(profile, to).filter((d) => d > asOf);
  const expectedRemainingCents = profile.averageNetCents > 0
    ? upcomingPays.length * profile.averageNetCents
    : 0;
  const forecastIncomeCents = receivedCents + expectedRemainingCents;

  // Bills still due between tomorrow and month end.
  const activeBills = data.bills.filter((b) => b.active !== false);
  let billsRemainingCents = 0;
  const billsRemaining = [];
  for (const b of activeBills) {
    const occ = billOccurrences(b, addDays(asOf, 1), to);
    if (occ.length) {
      billsRemainingCents += b.amountCents * occ.length;
      billsRemaining.push({ id: b.id, name: b.name, amountCents: b.amountCents, dates: occ });
    }
  }

  const spentCents = spendTotal(txs);
  const savedCents = sumCents(txs.filter((t) => t.kind === 'expense' && NON_SPEND_CATEGORIES.has(t.category)).map((t) => -t.amountCents));
  const bufferCents = Math.abs(data.settings?.safeToSpendBufferCents || 0);

  const safeCents = forecastIncomeCents - billsRemainingCents - spentCents - savedCents - bufferCents;

  const daysLeft = Math.max(0, daysBetween(asOf, to));
  return {
    month: mKey, asOf, daysLeft,
    receivedCents,
    expectedRemainingCents,
    upcomingPayDates: upcomingPays,
    forecastIncomeCents,
    billsRemainingCents,
    billsRemaining,
    spentCents,
    savedCents,
    bufferCents,
    safeCents,
    perDayCents: daysLeft > 0 ? Math.floor(safeCents / daysLeft) : safeCents,
    // True when income cadence is unknown, i.e. expectedRemaining is a floor of 0
    // rather than a real forecast. The UI must say so.
    incomeForecastIsPartial: !profile.cadence,
  };
}

// --- budgets -----------------------------------------------------------------

export function budgetStatus(data, mKey = monthKey(toISODate()), { asOf = toISODate() } = {}) {
  const from = `${mKey}-01`, to = endOfMonth(from);
  const spent = byCategory(inWindow(data.transactions, from, to));
  const spentBy = new Map(spent.map((r) => [r.category, r.cents]));

  const dim = daysInMonth(mKey);
  const dayOfMonth = monthKey(asOf) === mKey ? Math.min(dim, Number(asOf.slice(8, 10))) : dim;
  const elapsed = dayOfMonth / dim;

  return data.budgets.map((b) => {
    const spentCents = spentBy.get(b.category) || 0;
    const remainingCents = b.monthlyCents - spentCents;
    // Pace: >1 means spending faster than the month is elapsing.
    const pace = b.monthlyCents > 0 && elapsed > 0 ? (spentCents / b.monthlyCents) / elapsed : null;
    return {
      id: b.id,
      category: b.category,
      monthlyCents: b.monthlyCents,
      spentCents,
      remainingCents,
      usedShare: b.monthlyCents > 0 ? spentCents / b.monthlyCents : null,
      pace,
      projectedCents: elapsed > 0 ? Math.round(spentCents / elapsed) : spentCents,
      status: remainingCents < 0 ? 'over' : pace !== null && pace > 1.15 ? 'ahead' : 'ok',
    };
  }).sort((a, b) => (a.remainingCents) - (b.remainingCents));
}

// --- forecast ----------------------------------------------------------------

/**
 * Day-by-day projected balance change over the next `days`, combining known
 * bills, projected pay, and a per-day variable-spend estimate from history.
 * Starts from 0 (it is a *delta* forecast, not a balance) unless an opening
 * balance is configured.
 */
export function forecast(data, { asOf = toISODate(), days = 60 } = {}) {
  const to = addDays(asOf, days);
  const profile = incomeProfile(data, { asOf });
  const payDates = new Set(projectedPayDates(profile, to).filter((d) => d > asOf));

  const billHits = new Map();
  for (const b of data.bills.filter((x) => x.active !== false)) {
    for (const d of billOccurrences(b, addDays(asOf, 1), to)) {
      billHits.set(d, (billHits.get(d) || 0) + b.amountCents);
    }
  }

  const variable = variableDailySpendDetail(data, { asOf });
  const variablePerDay = variable.trimmedCents;

  let running = Number(data.settings?.openingBalanceCents || 0);
  const rows = [];
  for (let i = 1; i <= days; i++) {
    const date = addDays(asOf, i);
    const incomeCents = payDates.has(date) ? profile.averageNetCents : 0;
    const billCents = billHits.get(date) || 0;
    running += incomeCents - billCents - variablePerDay;
    rows.push({
      date,
      incomeCents,
      billCents,
      variableCents: variablePerDay,
      balanceCents: running,
    });
  }
  return {
    asOf, days,
    variablePerDayCents: variablePerDay,
    // Conservative bound: what the forecast looks like if exceptional days
    // recur at their historical rate rather than being trimmed away.
    variablePerDayRawCents: variable.rawMeanCents,
    openingCents: Number(data.settings?.openingBalanceCents || 0),
    rows,
  };
}

/**
 * Is this transaction the payment of a tracked bill?
 *
 * Matching on merchant name alone is wrong in practice: a bill named "Rent"
 * is paid to a merchant called "Landlord", and "Rogers Phone" appears on a
 * statement as "ROGERS *COMM". Match on the pair that actually holds — same
 * category and an amount within a small tolerance of the bill — and fall back
 * to a name match when one happens to be available.
 */
export function looksLikeBillPayment(t, bills) {
  const amount = Math.abs(t.amountCents);
  const txName = normalizeMerchant(t.merchant);
  for (const b of bills) {
    if (b.active === false) continue;
    const billName = normalizeMerchant(b.name);
    if (billName && txName && (txName.includes(billName) || billName.includes(txName))) return true;
    if (b.category !== t.category) continue;
    // Tolerance: the greater of 2% or $2, so a rent increase or a rounded
    // utility bill still matches, but a $30 coffee never matches a $1500 rent.
    const tolerance = Math.max(200, Math.round(b.amountCents * 0.02));
    if (Math.abs(amount - b.amountCents) <= tolerance) return true;
  }
  return false;
}

/**
 * Expected per-day variable (non-bill) spend, for multiplying across a forecast.
 *
 * Statistic choice matters here and the obvious ones are both wrong:
 *
 *  - A plain MEAN lets one $9,000 transmission job add ~$100/day to every day
 *    of the forecast.
 *  - A MEDIAN is worse: most days have no spending at all, so the median daily
 *    spend is literally $0 and the forecast would predict no variable spending
 *    ever.
 *
 * So: a WINSORIZED mean. Each day is capped before averaging, which keeps the
 * accumulation correct (unlike a median) while denying any single day unbounded
 * influence (unlike a mean).
 *
 * The cap is a percentile of the days that ACTUALLY HAD SPENDING, not of all
 * days. Taking it over all days is a trap: someone who shops twice a week has
 * ~70% zero-days, the percentile lands on $0, and every real purchase gets
 * capped to nothing — the estimate collapses to zero and the forecast predicts
 * no variable spending at all.
 *
 * The uncapped mean is returned alongside as the conservative bound, because a
 * car repair is real money that really does recur — the forecast shows both.
 */
export function variableDailySpend(data, { asOf = toISODate(), lookbackDays = 90, trimPercentile = 0.9 } = {}) {
  return variableDailySpendDetail(data, { asOf, lookbackDays, trimPercentile }).trimmedCents;
}

export function variableDailySpendDetail(data, { asOf = toISODate(), lookbackDays = 90, trimPercentile = 0.9 } = {}) {
  const from = addDays(asOf, -lookbackDays);
  const txs = inWindow(data.transactions, from, asOf).filter(isSpending);
  const empty = { trimmedCents: 0, rawMeanCents: 0, capCents: 0, days: 0, observedDays: 0 };
  if (!txs.length) return empty;

  const perDay = new Map();
  for (const t of txs) {
    if (looksLikeBillPayment(t, data.bills)) continue;
    perDay.set(t.date, (perDay.get(t.date) || 0) + -t.amountCents);
  }
  if (!perDay.size) return empty;

  // Include zero-spend days: the forecast covers every day, not just active ones.
  const span = Math.max(1, daysBetween(from, asOf));
  const values = [];
  for (let i = 0; i < span; i++) values.push(perDay.get(addDays(from, i)) || 0);

  const active = values.filter((v) => v > 0).sort((a, b) => a - b);
  const capIndex = Math.min(active.length - 1, Math.floor(active.length * trimPercentile));
  const capCents = active[capIndex];
  const capped = values.map((v) => Math.min(v, capCents));

  return {
    trimmedCents: Math.round(mean(capped)),
    rawMeanCents: Math.round(mean(values)),
    capCents,
    days: span,
    observedDays: perDay.size,
  };
}

// --- recurring detection -----------------------------------------------------

/**
 * Merchants charged on a regular cadence that are NOT already tracked as bills.
 * These are the subscription-creep candidates.
 */
export function detectRecurring(data, { asOf = toISODate(), lookbackDays = 270, minOccurrences = 3 } = {}) {
  const from = addDays(asOf, -lookbackDays);
  const txs = inWindow(data.transactions, from, asOf).filter(isSpending);
  const knownBills = new Set(data.bills.map((b) => normalizeMerchant(b.name)).filter(Boolean));

  const groups = new Map();
  for (const t of txs) {
    const key = normalizeMerchant(t.merchant);
    if (!key || knownBills.has(key)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  const out = [];
  for (const [key, rows] of groups) {
    if (rows.length < minOccurrences) continue;
    rows.sort((a, b) => (a.date < b.date ? -1 : 1));
    const gaps = [];
    for (let i = 1; i < rows.length; i++) gaps.push(daysBetween(rows[i - 1].date, rows[i].date));
    const medGap = median(gaps);
    if (!medGap || medGap < 5 || medGap > 400) continue;
    // Regular means low dispersion in the gaps.
    const gapSpread = gaps.length > 1 ? stdev(gaps) / medGap : 0;
    if (gapSpread > 0.35) continue;

    const amounts = rows.map((r) => -r.amountCents);
    const amountSpread = amounts.length > 1 ? stdev(amounts) / Math.max(1, mean(amounts)) : 0;

    const cadence = medGap <= 9 ? 'weekly' : medGap <= 18 ? 'biweekly'
      : medGap <= 45 ? 'monthly' : medGap <= 120 ? 'quarterly' : 'yearly';

    out.push({
      merchant: rows.at(-1).merchant,
      key,
      occurrences: rows.length,
      medianGapDays: medGap,
      cadence,
      averageCents: Math.round(mean(amounts)),
      monthlyEquivalentCents: Math.round(mean(amounts) * (FREQ_PER_MONTH[cadence] ?? 1)),
      annualEquivalentCents: Math.round(mean(amounts) * (FREQ_PER_MONTH[cadence] ?? 1) * 12),
      lastDate: rows.at(-1).date,
      category: rows.at(-1).category,
      amountIsFixed: amountSpread < 0.1,
      confidence: Math.max(0, Math.min(1, 1 - gapSpread * 1.5)),
    });
  }
  return out.sort((a, b) => b.monthlyEquivalentCents - a.monthlyEquivalentCents);
}

// --- anomalies ---------------------------------------------------------------

/** Categories whose current-month spend is far above their trailing median. */
export function categoryAnomalies(data, { asOf = toISODate(), months = 6, threshold = 1.5 } = {}) {
  const mKey = monthKey(asOf);
  const history = [];
  for (let i = 1; i <= months; i++) history.push(monthKey(addMonths(`${mKey}-01`, -i)));

  const currentFrom = `${mKey}-01`;
  const current = new Map(byCategory(inWindow(data.transactions, currentFrom, endOfMonth(currentFrom)))
    .map((r) => [r.category, r.cents]));

  const historic = new Map();
  for (const hk of history) {
    const rows = byCategory(inWindow(data.transactions, `${hk}-01`, endOfMonth(`${hk}-01`)));
    for (const r of rows) {
      if (!historic.has(r.category)) historic.set(r.category, []);
      historic.get(r.category).push(r.cents);
    }
  }

  const out = [];
  for (const [category, cents] of current) {
    const hist = historic.get(category) || [];
    if (hist.length < 2) continue;
    const base = median(hist);
    if (!base || base < 2000) continue; // ignore trivial categories (<$20/mo)
    const ratio = cents / base;
    if (ratio >= threshold) {
      out.push({ category, currentCents: cents, medianCents: base, ratio, deltaCents: cents - base, monthsCompared: hist.length });
    }
  }
  return out.sort((a, b) => b.deltaCents - a.deltaCents);
}

// --- stats -------------------------------------------------------------------

export function median(xs) {
  const a = xs.filter((n) => Number.isFinite(n)).slice().sort((p, q) => p - q);
  if (!a.length) return null;
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** Fixed monthly obligation from all active bills. */
export const fixedMonthlyCents = (data) =>
  sumCents(data.bills.filter((b) => b.active !== false).map(billMonthlyCents));
