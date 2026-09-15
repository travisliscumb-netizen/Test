// Cashpilot — deterministic savings-idea engine.
//
// These run with no API key and no network. The AI can add judgement on top, but
// the app must produce real, specific, numeric advice on its own — an insights
// panel that is empty without a paid API call is a broken feature.
//
// Every insight carries the arithmetic behind it (`evidence`) and an annualized
// impact, so advice is rankable rather than a wall of platitudes.

import {
  detectRecurring, byCategory, byMerchant, inWindow, budgetStatus, incomeProfile,
  categoryAnomalies, fixedMonthlyCents, safeToSpend, monthlySeries, median, isSpending,
} from './analytics.js';
import { toISODate, addDays, addMonths, monthKey, endOfMonth, formatMoney, sumCents } from './util.js';

/**
 * @returns {Array<{id,severity,title,body,annualCents,evidence,action}>}
 * sorted by annualized impact, biggest first.
 */
export function generateInsights(data, { asOf = toISODate() } = {}) {
  const out = [];
  const push = (i) => { if (i) out.push(i); };

  push(...subscriptionInsights(data, asOf));
  push(smallRecurringCreep(data, asOf));
  push(...budgetInsights(data, asOf));
  push(...anomalyInsights(data, asOf));
  push(fixedCostRatio(data, asOf));
  push(savingsRateInsight(data, asOf));
  push(topMerchantConcentration(data, asOf));
  push(diningVsGroceries(data, asOf));
  push(feeInsight(data, asOf));
  push(runwayInsight(data, asOf));
  push(unbudgetedCategories(data, asOf));

  return out
    .filter(Boolean)
    .sort((a, b) => (b.annualCents || 0) - (a.annualCents || 0));
}

const SEV = { high: 'high', medium: 'medium', low: 'low' };

// --- individual rules --------------------------------------------------------

function subscriptionInsights(data, asOf) {
  const recurring = detectRecurring(data, { asOf });
  const untracked = recurring.filter((r) => r.confidence >= 0.5);
  if (!untracked.length) return [];

  const rows = [];
  const totalAnnual = sumCents(untracked.map((r) => r.annualEquivalentCents));
  rows.push({
    id: 'recurring-untracked',
    severity: untracked.length >= 3 ? SEV.high : SEV.medium,
    title: `${untracked.length} recurring charge${untracked.length === 1 ? '' : 's'} not tracked as a bill`,
    body: `These repeat on a regular schedule but are not in your bills list, so they are invisible to your safe-to-spend number. Together they run ${formatMoney(totalAnnual)}/year.`,
    annualCents: totalAnnual,
    evidence: untracked.slice(0, 8).map((r) =>
      `${r.merchant}: ${formatMoney(r.averageCents)} × ${r.cadence} (${r.occurrences} seen) = ${formatMoney(r.annualEquivalentCents)}/yr`),
    action: { type: 'review-recurring', items: untracked.map((r) => r.key) },
  });

  // Call out individually expensive ones so the big fish are separately visible.
  for (const r of untracked.slice(0, 3)) {
    if (r.annualEquivalentCents < 24000) continue; // under $240/yr isn't headline material
    rows.push({
      id: `recurring-${r.key}`,
      severity: SEV.medium,
      title: `${r.merchant} costs ${formatMoney(r.annualEquivalentCents)}/year`,
      body: `Charged ${formatMoney(r.averageCents)} ${r.cadence}, last on ${r.lastDate}. ${r.amountIsFixed ? 'The amount is fixed, which usually means a subscription rather than usage.' : 'The amount varies, so this may be usage-based and reducible without cancelling.'}`,
      annualCents: r.annualEquivalentCents,
      evidence: [`${r.occurrences} charges, median ${r.medianGapDays} days apart`],
      action: { type: 'add-bill', merchant: r.merchant, amountCents: r.averageCents, cadence: r.cadence },
    });
  }
  return rows;
}

function smallRecurringCreep(data, asOf) {
  const recurring = detectRecurring(data, { asOf }).filter((r) => r.monthlyEquivalentCents < 2500 && r.confidence >= 0.5);
  if (recurring.length < 4) return null;
  const annual = sumCents(recurring.map((r) => r.annualEquivalentCents));
  return {
    id: 'small-subs-creep',
    severity: SEV.medium,
    title: `${recurring.length} small subscriptions add up to ${formatMoney(annual)}/year`,
    body: 'Each is under $25/month, which is why they never feel worth cancelling individually. Collectively they are a meaningful line item.',
    annualCents: annual,
    evidence: recurring.map((r) => `${r.merchant}: ${formatMoney(r.monthlyEquivalentCents)}/mo`),
    action: { type: 'review-recurring', items: recurring.map((r) => r.key) },
  };
}

function budgetInsights(data, asOf) {
  const rows = budgetStatus(data, monthKey(asOf), { asOf });
  const out = [];
  for (const b of rows) {
    if (b.status === 'over') {
      const overBy = -b.remainingCents;
      out.push({
        id: `budget-over-${b.category}`,
        severity: SEV.high,
        title: `${b.category} is ${formatMoney(overBy)} over budget`,
        body: `Spent ${formatMoney(b.spentCents)} against a ${formatMoney(b.monthlyCents)} budget with the month not yet done.`,
        annualCents: overBy * 12,
        evidence: [`Projected full-month: ${formatMoney(b.projectedCents)}`],
        action: { type: 'open-category', category: b.category },
      });
    } else if (b.status === 'ahead') {
      const projectedOver = Math.max(0, b.projectedCents - b.monthlyCents);
      if (projectedOver < 1000) continue;
      out.push({
        id: `budget-pace-${b.category}`,
        severity: SEV.medium,
        title: `${b.category} is pacing ${Math.round((b.pace - 1) * 100)}% hot`,
        body: `At the current rate this category lands at ${formatMoney(b.projectedCents)} against a ${formatMoney(b.monthlyCents)} budget.`,
        annualCents: projectedOver * 12,
        evidence: [`${formatMoney(b.spentCents)} spent so far`, `Budget ${formatMoney(b.monthlyCents)}`],
        action: { type: 'open-category', category: b.category },
      });
    }
  }
  return out;
}

function anomalyInsights(data, asOf) {
  return categoryAnomalies(data, { asOf }).slice(0, 4).map((a) => ({
    id: `anomaly-${a.category}`,
    severity: a.ratio >= 2 ? SEV.high : SEV.medium,
    title: `${a.category} is ${a.ratio.toFixed(1)}× your usual month`,
    body: `${formatMoney(a.currentCents)} this month versus a ${formatMoney(a.medianCents)} median over the last ${a.monthsCompared} months.`,
    annualCents: a.deltaCents * 12,
    evidence: [`Difference: ${formatMoney(a.deltaCents)} this month`],
    action: { type: 'open-category', category: a.category },
  }));
}

function fixedCostRatio(data, asOf) {
  const fixed = fixedMonthlyCents(data);
  const profile = incomeProfile(data, { asOf });
  const income = profile.monthlyEstimateCents;
  if (!income || income <= 0 || !fixed) return null;
  const ratio = fixed / income;
  if (ratio < 0.5) return null;
  const targetFixed = Math.round(income * 0.5);
  return {
    id: 'fixed-cost-ratio',
    severity: ratio >= 0.7 ? SEV.high : SEV.medium,
    title: `Fixed bills eat ${Math.round(ratio * 100)}% of your income`,
    body: `${formatMoney(fixed)}/month of committed cost against an estimated ${formatMoney(income)}/month of net income. Above roughly 50% there is very little room to absorb a surprise, and the fix is structural (renegotiate, refinance, or drop a commitment) rather than behavioural.`,
    annualCents: Math.max(0, fixed - targetFixed) * 12,
    evidence: data.bills.filter((b) => b.active !== false)
      .sort((a, b) => b.amountCents - a.amountCents).slice(0, 6)
      .map((b) => `${b.name}: ${formatMoney(b.amountCents)} ${b.frequency}`),
    action: { type: 'open-bills' },
  };
}

function savingsRateInsight(data, asOf) {
  const series = monthlySeries(data).slice(-6);
  if (series.length < 3) return null;
  const rates = series.filter((m) => m.incomeCents > 0)
    .map((m) => (m.incomeCents - m.spendingCents) / m.incomeCents);
  if (rates.length < 3) return null;
  const med = rates.slice().sort((a, b) => a - b)[rates.length >> 1];
  if (med >= 0.15) return null;
  const avgIncome = Math.round(sumCents(series.map((m) => m.incomeCents)) / series.length);
  const gapMonthly = Math.round(avgIncome * (0.15 - med));
  return {
    id: 'savings-rate',
    severity: med < 0 ? SEV.high : SEV.medium,
    title: med < 0
      ? 'You are spending more than you earn'
      : `Savings rate is ${Math.round(med * 100)}%`,
    body: med < 0
      ? `Across the last ${series.length} months, spending exceeded income in the median month. This is the one number that has to change before any other optimisation matters.`
      : `A 15% rate would mean setting aside about ${formatMoney(Math.round(avgIncome * 0.15))}/month on ${formatMoney(avgIncome)} average income — ${formatMoney(gapMonthly)}/month more than now.`,
    annualCents: Math.max(0, gapMonthly) * 12,
    evidence: series.map((m) => `${m.month}: in ${formatMoney(m.incomeCents)}, out ${formatMoney(m.spendingCents)}`),
    action: { type: 'open-trends' },
  };
}

function topMerchantConcentration(data, asOf) {
  const from = addDays(asOf, -90);
  const txs = inWindow(data.transactions, from, asOf);
  const top = byMerchant(txs, 5);
  if (!top.length) return null;
  const total = sumCents(byCategory(txs).map((c) => c.cents));
  if (total <= 0) return null;
  const topShare = top[0].cents / total;
  if (topShare < 0.15 || top[0].count < 4) return null;
  return {
    id: 'merchant-concentration',
    severity: SEV.low,
    title: `${top[0].merchant} is ${Math.round(topShare * 100)}% of your 90-day spending`,
    body: `${formatMoney(top[0].cents)} across ${top[0].count} visits. A 10% reduction at a single merchant this concentrated is worth more than trimming several small categories.`,
    annualCents: Math.round(top[0].cents * 0.1 * 4),
    evidence: top.map((m) => `${m.merchant}: ${formatMoney(m.cents)} (${m.count}×)`),
    action: { type: 'open-merchant', merchant: top[0].merchant },
  };
}

function diningVsGroceries(data, asOf) {
  const from = addDays(asOf, -90);
  const rows = byCategory(inWindow(data.transactions, from, asOf));
  const dining = rows.find((r) => r.category === 'Dining')?.cents || 0;
  const groceries = rows.find((r) => r.category === 'Groceries')?.cents || 0;
  if (dining < 15000 || dining <= groceries) return null;
  const target = Math.round(dining * 0.4);
  return {
    id: 'dining-vs-groceries',
    severity: SEV.medium,
    title: `Dining out exceeds groceries by ${formatMoney(dining - groceries)}`,
    body: `Over 90 days: ${formatMoney(dining)} dining vs ${formatMoney(groceries)} groceries. Shifting 40% of dining to home cooking is roughly ${formatMoney(target)} per quarter, and it is the single most elastic category most budgets have.`,
    annualCents: target * 4,
    evidence: [`Dining 90d: ${formatMoney(dining)}`, `Groceries 90d: ${formatMoney(groceries)}`],
    action: { type: 'open-category', category: 'Dining' },
  };
}

function feeInsight(data, asOf) {
  const from = addDays(asOf, -180);
  const txs = inWindow(data.transactions, from, asOf)
    .filter((t) => isSpending(t) && (t.category === 'Fees' || /\b(fee|nsf|overdraft|interest charge|late)\b/i.test(t.merchant + ' ' + t.note)));
  if (!txs.length) return null;
  const total = sumCents(txs.map((t) => -t.amountCents));
  if (total < 2000) return null;
  return {
    id: 'fees',
    severity: SEV.high,
    title: `${formatMoney(total)} in fees and interest over 6 months`,
    body: 'Fees are pure loss — no goods, no service, fully avoidable. This is the highest-return thing on this list because eliminating it requires no lifestyle change at all.',
    annualCents: total * 2,
    evidence: txs.slice(0, 8).map((t) => `${t.date} ${t.merchant}: ${formatMoney(-t.amountCents)}`),
    action: { type: 'open-category', category: 'Fees' },
  };
}

function runwayInsight(data, asOf) {
  const sts = safeToSpend(data, { asOf });
  if (sts.safeCents >= 0) return null;
  return {
    id: 'negative-safe-to-spend',
    severity: SEV.high,
    title: `This month is short by ${formatMoney(-sts.safeCents)}`,
    body: `Forecast income ${formatMoney(sts.forecastIncomeCents)} minus ${formatMoney(sts.billsRemainingCents)} of remaining bills and ${formatMoney(sts.spentCents)} already spent leaves a shortfall${sts.bufferCents ? ` after your ${formatMoney(sts.bufferCents)} buffer` : ''}.${sts.incomeForecastIsPartial ? ' Note: income cadence is not yet established, so remaining income is counted as zero — add more pay history to sharpen this.' : ''}`,
    annualCents: -sts.safeCents,
    evidence: [
      `Received: ${formatMoney(sts.receivedCents)}`,
      `Expected remaining: ${formatMoney(sts.expectedRemainingCents)}`,
      `Bills remaining: ${formatMoney(sts.billsRemainingCents)}`,
      `Spent: ${formatMoney(sts.spentCents)}`,
    ],
    action: { type: 'open-dashboard' },
  };
}

function unbudgetedCategories(data, asOf) {
  if (!data.budgets.length) {
    const rows = byCategory(inWindow(data.transactions, addDays(asOf, -90), asOf));
    if (rows.length < 3) return null;
    const top = rows.slice(0, 3);
    return {
      id: 'no-budgets',
      severity: SEV.low,
      title: 'No budgets set',
      body: `Your three biggest categories over 90 days are ${top.map((t) => `${t.category} (${formatMoney(t.cents)})`).join(', ')}. Budgets are what turn the pace and anomaly warnings on.`,
      annualCents: 0,
      evidence: top.map((t) => `${t.category}: ${formatMoney(Math.round(t.cents / 3))}/mo average`),
      action: { type: 'suggest-budgets', categories: top.map((t) => ({ category: t.category, monthlyCents: Math.round(t.cents / 3) })) },
    };
  }
  const budgeted = new Set(data.budgets.map((b) => b.category));
  const rows = byCategory(inWindow(data.transactions, addDays(asOf, -90), asOf))
    .filter((r) => !budgeted.has(r.category) && r.cents >= 30000);
  if (!rows.length) return null;
  return {
    id: 'unbudgeted',
    severity: SEV.low,
    title: `${rows.length} significant categor${rows.length === 1 ? 'y has' : 'ies have'} no budget`,
    body: `These are over $300 across 90 days but have no ceiling, so they never trigger a pace warning.`,
    annualCents: 0,
    evidence: rows.slice(0, 5).map((r) => `${r.category}: ${formatMoney(r.cents)} / 90d`),
    action: { type: 'suggest-budgets', categories: rows.slice(0, 5).map((r) => ({ category: r.category, monthlyCents: Math.round(r.cents / 3) })) },
  };
}
