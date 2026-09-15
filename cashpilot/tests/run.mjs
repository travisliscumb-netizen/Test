// Cashpilot test suite. Pure-logic modules only (no DOM, no network).
// Run: node tests/run.mjs

import assert from 'node:assert/strict';
import * as U from '../src/util.js';
import * as M from '../src/model.js';
import * as A from '../src/analytics.js';
import { generateInsights } from '../src/insights.js';
import { mergeLedgers, tombstone } from '../src/store.js';
import { TOOL_DEFS, MUTATING_TOOLS } from '../src/tools.js';
import { trimHistory } from '../src/agent.js';
import { seedLedger, SEED_PAYSTUBS, SEED_BILLS } from '../src/seed.js';

let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (err) { fail++; failures.push([name, err]); console.log(`  FAIL ${name}\n       ${err.message}`); }
}
function group(name) { console.log(`\n${name}`); }

// ---------------------------------------------------------------- util
group('util: money');
test('parses currency text to exact cents', () => {
  assert.equal(U.parseMoney('$1,234.56'), 123456);
  assert.equal(U.parseMoney('0.07'), 7);
  assert.equal(U.parseMoney('(45.99)'), -4599);
  assert.equal(U.parseMoney('1 234,50'), 123450);
});
test('negative zero never reaches the display', () => {
  // -sumCents([]) is -0, which Intl renders as "-$0.00" and the UI then prefixes
  // with its own minus sign, producing "--$0.00" on screen.
  assert.equal(U.formatMoney(-0), U.formatMoney(0));
  assert.ok(!U.formatMoney(-0).includes('-'), `got ${U.formatMoney(-0)}`);
  assert.ok(!U.formatMoney(A.spendTotal([])).includes('-'));
  assert.ok(Object.is(U.sumCents([]), 0), 'sumCents([]) must be +0, not -0');
});

test('no float drift over many additions', () => {
  // The canonical failure: 0.1+0.2 in float dollars. In cents it is exact.
  const cents = Array.from({ length: 10000 }, () => 10);
  assert.equal(U.sumCents(cents), 100000);
  let f = 0; for (let i = 0; i < 10000; i++) f += 0.1;
  assert.notEqual(f, 1000); // proves why we do not store dollars
});
test('allocate never loses or invents a cent', () => {
  for (const [total, n] of [[100, 3], [1, 7], [-100, 3], [99999, 13]]) {
    const parts = U.allocate(total, n);
    assert.equal(parts.length, n);
    assert.equal(U.sumCents(parts), total, `${total}/${n}`);
  }
});

group('util: dates');
test('ISO date round-trips in local time', () => {
  assert.equal(U.toISODate(U.fromISODate('2026-09-15')), '2026-09-15');
});
test('month arithmetic clamps end-of-month', () => {
  assert.equal(U.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(U.addMonths('2026-03-31', -1), '2026-02-28');
  assert.equal(U.endOfMonth('2028-02-05'), '2028-02-29'); // leap year
});

// ---------------------------------------------------------------- model
group('model: transactions');
test('expense sign is forced negative regardless of input sign', () => {
  const t = M.makeTransaction({ kind: 'expense', amount: '47.25', date: '2026-09-01', merchant: 'Shell' });
  assert.equal(t.amountCents, -4725);
});
test('income sign is forced positive', () => {
  const t = M.makeTransaction({ kind: 'income', amount: '-1500', date: '2026-09-01' });
  assert.equal(t.amountCents, 150000);
});
test('rejects an impossible date instead of coercing it', () => {
  assert.throws(() => M.makeTransaction({ amount: 10, date: '2026-02-31' }), /date/);
  assert.throws(() => M.makeTransaction({ amount: 10, date: 'yesterday' }), /date/);
});
test('rejects a missing amount', () => {
  assert.throws(() => M.makeTransaction({ date: '2026-09-01' }), /amount/);
});
test('unknown category falls back to Other rather than corrupting the enum', () => {
  const t = M.makeTransaction({ amount: 10, date: '2026-09-01', category: 'Fnord' });
  assert.equal(t.category, 'Other');
});
test('category match is case-insensitive', () => {
  const t = M.makeTransaction({ amount: 10, date: '2026-09-01', category: 'groceries' });
  assert.equal(t.category, 'Groceries');
});
test('a bare positive amount is an expense, never inferred income', () => {
  // A model emitting {amount: 47.25, category: "Groceries"} means a purchase.
  const t = M.makeTransaction({ amount: 47.25, date: '2026-09-01', category: 'Groceries', merchant: 'Loblaws' });
  assert.equal(t.kind, 'expense');
  assert.equal(t.amountCents, -4725);
});
test('an income category infers income', () => {
  const t = M.makeTransaction({ amount: 1200, date: '2026-09-01', category: 'Salary' });
  assert.equal(t.kind, 'income');
  assert.equal(t.amountCents, 120000);
});
test('amountCents is read as cents, amount as dollars', () => {
  // Conflating these multiplies money by 100 on every round trip.
  assert.equal(M.makeTransaction({ amountCents: -4725, date: '2026-09-01' }).amountCents, -4725);
  assert.equal(M.makeTransaction({ amount: -47.25, date: '2026-09-01' }).amountCents, -4725);
});
test('a fractional cent is rejected rather than silently rounded', () => {
  assert.throws(() => M.makeTransaction({ amountCents: -47.25, date: '2026-09-01' }), /whole number of cents/);
});
test('editing a transaction does not inflate its amount', () => {
  const t = M.makeTransaction({ amount: 47.25, date: '2026-09-01', merchant: 'Loblaws', category: 'Groceries' });
  let cur = t;
  for (let i = 0; i < 5; i++) cur = M.updateTransaction(cur, { note: `edit ${i}` });
  assert.equal(cur.amountCents, -4725, 'repeated edits must not change the amount');
});
test('changing kind preserves magnitude and flips sign once', () => {
  const t = M.makeTransaction({ amount: 100, date: '2026-09-01', category: 'Groceries' });
  assert.equal(t.amountCents, -10000);
  const flipped = M.updateTransaction(t, { kind: 'income' });
  assert.equal(flipped.amountCents, 10000);
});
test('flags a pay stub whose gross - deductions does not equal net', () => {
  const t = M.makeTransaction({ kind: 'income', date: '2026-09-01', amount: 1000, gross: 1500, deductions: 200 });
  assert.equal(t.netMismatchCents, 30000); // 1300 implied vs 1000 stated
});
test('accepts a pay stub whose arithmetic checks out', () => {
  const t = M.makeTransaction({ kind: 'income', date: '2026-09-01', amount: 1300, gross: 1500, deductions: 200 });
  assert.equal(t.netMismatchCents, undefined);
});

group('model: bills');
test('monthly equivalent of a biweekly bill', () => {
  const b = M.makeBill({ name: 'Car', amount: 200, frequency: 'biweekly', nextDue: '2026-09-04' });
  assert.equal(M.billMonthlyCents(b), Math.round(20000 * 26 / 12));
});
test('bill occurrences land inside the requested window only', () => {
  const b = M.makeBill({ name: 'Rent', amount: 1500, frequency: 'monthly', nextDue: '2026-09-01' });
  const occ = M.billOccurrences(b, '2026-09-01', '2026-11-30');
  assert.deepEqual(occ, ['2026-09-01', '2026-10-01', '2026-11-01']);
});
test('a stale bill due date rolls forward instead of firing repeatedly', () => {
  const b = M.makeBill({ name: 'Old', amount: 50, frequency: 'monthly', nextDue: '2020-01-15' });
  assert.equal(M.advanceBillDue(b, '2026-09-10'), '2026-09-15');
});

group('model: rules');
test('longest merchant rule wins', () => {
  const rules = [M.makeRule({ match: 'CANADIAN TIRE', category: 'Shopping' }),
                 M.makeRule({ match: 'CANADIAN TIRE GAS', category: 'Gas' })];
  assert.equal(M.categoryForMerchant(rules, 'Canadian Tire Gas #421'), 'Gas');
});

group('model: migration');
test('folds a legacy Spendwise export into unified transactions', () => {
  const legacy = {
    expenses: [{ id: 'e1', date: '2026-08-01', amount: 42.5, merchant: 'Loblaws', category: 'Groceries' }],
    paystubs: [{ id: 'p1', date: '2026-08-02', net: 1200.55, gross: 1600, deductions: 399.45 }],
  };
  const d = M.migrate(legacy);
  assert.equal(d.transactions.length, 2);
  const inc = d.transactions.find((t) => t.kind === 'income');
  const exp = d.transactions.find((t) => t.kind === 'expense');
  assert.equal(exp.amountCents, -4250);
  assert.equal(inc.amountCents, 120055);
  assert.equal(inc.grossCents, 160000);
  assert.equal(d.expenses, undefined, 'legacy arrays are removed, not left to double-count');
  assert.equal(d.paystubs, undefined);
});
test('migrating garbage yields an empty ledger, not a crash', () => {
  assert.equal(M.migrate(null).transactions.length, 0);
  assert.equal(M.migrate('nonsense').transactions.length, 0);
  assert.equal(M.migrate({ transactions: 'not-an-array' }).transactions.length, 0);
});
test('migration preserves updatedAt so merges stay correct', () => {
  // migrate() runs on every load. If normalization restamped updatedAt, the
  // local copy would always look newer than the remote and would win every
  // merge conflict, silently discarding the other device's edits.
  const stamp = '2026-03-04T05:06:07.000Z';
  const d = M.migrate({ transactions: [{
    id: 'x', kind: 'expense', date: '2026-03-04', amountCents: -100,
    merchant: 'M', category: 'Other', createdAt: stamp, updatedAt: stamp, docIds: [],
  }] });
  assert.equal(d.transactions[0].updatedAt, stamp);
  assert.equal(d.transactions[0].createdAt, stamp);
});

test('de-duplicates by id keeping the newest', () => {
  const d = M.migrate({ transactions: [
    { id: 'x', kind: 'expense', date: '2026-01-01', amountCents: -100, updatedAt: '2026-01-01T00:00:00Z', category: 'Other', merchant: 'a' },
    { id: 'x', kind: 'expense', date: '2026-01-01', amountCents: -999, updatedAt: '2026-06-01T00:00:00Z', category: 'Other', merchant: 'a' },
  ] });
  assert.equal(d.transactions.length, 1);
  assert.equal(d.transactions[0].amountCents, -999);
});

// ---------------------------------------------------------------- fixture
function fixture() {
  const data = M.emptyData();
  const now = new Date('2026-09-15T12:00:00');
  // Biweekly pay, 9 stubs, every second Friday ending 2026-09-11.
  let d = '2026-05-22';
  for (let i = 0; i < 9; i++) {
    data.transactions.push(M.makeTransaction({
      kind: 'income', date: d, amount: 1450, gross: 1900, deductions: 450,
      employer: 'Payworks', category: 'Hourly', hours: 80, source: 'import',
    }, { now }));
    d = U.addDays(d, 14);
  }
  // Rent on the 1st, four months.
  for (const m of ['2026-06', '2026-07', '2026-08', '2026-09']) {
    data.transactions.push(M.makeTransaction({ kind: 'expense', date: `${m}-01`, amount: 1500, merchant: 'Landlord', category: 'Rent' }, { now }));
  }
  // A genuine monthly subscription never entered as a bill.
  for (const m of ['2026-06', '2026-07', '2026-08', '2026-09']) {
    data.transactions.push(M.makeTransaction({ kind: 'expense', date: `${m}-14`, amount: 22.99, merchant: 'Streamflix', category: 'Subscriptions' }, { now }));
  }
  // Groceries twice a week, irregular amounts.
  let g = '2026-06-02';
  let seed = 7;
  while (g <= '2026-09-14') {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const amt = 40 + (seed % 6000) / 100;
    data.transactions.push(M.makeTransaction({ kind: 'expense', date: g, amount: amt.toFixed(2), merchant: 'Loblaws', category: 'Groceries' }, { now }));
    g = U.addDays(g, 4);
  }
  // Dining spike in September only.
  for (let i = 1; i <= 12; i++) {
    data.transactions.push(M.makeTransaction({ kind: 'expense', date: `2026-09-${String(i).padStart(2, '0')}`, amount: 55, merchant: 'Some Bistro', category: 'Dining' }, { now }));
  }
  data.bills.push(M.makeBill({ name: 'Rent', amount: 1500, frequency: 'monthly', nextDue: '2026-10-01', category: 'Rent' }, { now }));
  data.bills.push(M.makeBill({ name: 'Car Loan', amount: 412.18, frequency: 'monthly', nextDue: '2026-09-20', category: 'Debt' }, { now }));
  data.budgets.push(M.makeBudget({ category: 'Dining', monthlyCents: 20000 }, { now }));
  data.budgets.push(M.makeBudget({ category: 'Groceries', monthlyCents: 90000 }, { now }));
  return data;
}

const ASOF = '2026-09-15';
const D = fixture();

group('analytics: totals');
test('income and spending are separated by kind, not by sign guessing', () => {
  const s = A.summarize(D, '2026-09-01', '2026-09-30');
  assert.equal(s.incomeCents, 145000, 'one biweekly pay date (Sep 11) falls in September');
  assert.ok(s.spendingCents > 0, 'spending is reported as a positive magnitude');
  assert.equal(s.netCents, s.incomeCents - s.spendingCents - s.savedCents);
});
test('transfers are excluded from both income and spending', () => {
  const d = M.migrate(structuredClone(D));
  d.transactions.push(M.makeTransaction({ kind: 'transfer', date: '2026-09-05', amount: -50000, merchant: 'To Savings' }));
  const before = A.summarize(D, '2026-09-01', '2026-09-30');
  const after = A.summarize(d, '2026-09-01', '2026-09-30');
  assert.equal(before.spendingCents, after.spendingCents);
  assert.equal(before.incomeCents, after.incomeCents);
});
test('category shares sum to 1', () => {
  const rows = A.byCategory(A.inWindow(D.transactions, '2026-09-01', '2026-09-30'));
  const total = rows.reduce((a, r) => a + r.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `shares summed to ${total}`);
});
test('merchant grouping normalizes store numbers together', () => {
  const d = M.migrate(structuredClone(D));
  d.transactions.push(M.makeTransaction({ kind: 'expense', date: '2026-09-02', amount: 10, merchant: 'Loblaws #4412', category: 'Groceries' }));
  const rows = A.byMerchant(A.inWindow(d.transactions, '2026-09-01', '2026-09-30'), 10);
  const loblaws = rows.filter((r) => r.key === 'LOBLAWS');
  assert.equal(loblaws.length, 1, 'Loblaws and Loblaws #4412 must be one group');
});

group('analytics: income cadence');
test('detects biweekly pay from history', () => {
  const p = A.incomeProfile(D, { asOf: ASOF });
  assert.equal(p.cadence, 'biweekly');
  assert.equal(p.medianGapDays, 14);
  assert.equal(p.averageNetCents, 145000);
});
test('refuses to guess a cadence from a single pay event', () => {
  const d = M.emptyData();
  d.transactions.push(M.makeTransaction({ kind: 'income', date: '2026-09-01', amount: 1000 }));
  const p = A.incomeProfile(d, { asOf: ASOF });
  assert.equal(p.cadence, null, 'one data point must not produce a cadence');
  assert.equal(p.monthlyEstimateCents, null);
});

group('analytics: safe to spend');
test('components reconcile exactly to the headline number', () => {
  const s = A.safeToSpend(D, { asOf: ASOF });
  const recomputed = s.forecastIncomeCents - s.billsRemainingCents - s.spentCents - s.savedCents - s.bufferCents;
  assert.equal(s.safeCents, recomputed, 'headline must equal the shown arithmetic');
  assert.equal(s.forecastIncomeCents, s.receivedCents + s.expectedRemainingCents);
});
test('only counts bills still ahead of today', () => {
  const s = A.safeToSpend(D, { asOf: ASOF });
  // Car Loan due Sep 20 is ahead; Rent due Oct 1 is outside September.
  assert.equal(s.billsRemainingCents, 41218);
});
test('a configured buffer reduces safe-to-spend one-for-one', () => {
  const d = M.migrate(structuredClone(D));
  d.settings.safeToSpendBufferCents = 50000;
  const a = A.safeToSpend(D, { asOf: ASOF }).safeCents;
  const b = A.safeToSpend(d, { asOf: ASOF }).safeCents;
  assert.equal(a - b, 50000);
});
test('marks the forecast partial when cadence is unknown', () => {
  const d = M.emptyData();
  d.transactions.push(M.makeTransaction({ kind: 'income', date: '2026-09-01', amount: 1000 }));
  assert.equal(A.safeToSpend(d, { asOf: ASOF }).incomeForecastIsPartial, true);
});

group('analytics: recurring detection');
test('finds an untracked monthly subscription', () => {
  const found = A.detectRecurring(D, { asOf: ASOF });
  const sub = found.find((r) => r.key === 'STREAMFLIX');
  assert.ok(sub, 'Streamflix charged monthly 4× should be detected');
  assert.equal(sub.cadence, 'monthly');
  assert.equal(sub.averageCents, 2299);
  assert.equal(sub.annualEquivalentCents, 2299 * 12);
  assert.ok(sub.amountIsFixed);
});
test('does not re-report something already tracked as a bill', () => {
  const found = A.detectRecurring(D, { asOf: ASOF });
  assert.ok(!found.some((r) => r.key === 'RENT'), 'Rent is a bill and must not appear');
});
test('irregular merchants are not misreported as recurring', () => {
  const found = A.detectRecurring(D, { asOf: ASOF });
  const bistro = found.find((r) => r.key === 'SOME BISTRO');
  assert.ok(!bistro || bistro.confidence < 0.5, 'daily dining is not a subscription');
});

group('analytics: budgets');
test('detects an over-budget category', () => {
  const rows = A.budgetStatus(D, '2026-09', { asOf: ASOF });
  const dining = rows.find((r) => r.category === 'Dining');
  assert.equal(dining.spentCents, 66000);
  assert.equal(dining.status, 'over');
  assert.equal(dining.remainingCents, 20000 - 66000);
});
test('projects a full month from elapsed pace', () => {
  const rows = A.budgetStatus(D, '2026-09', { asOf: ASOF });
  const dining = rows.find((r) => r.category === 'Dining');
  assert.ok(dining.projectedCents > dining.spentCents, 'mid-month projection must exceed spend to date');
});

group('analytics: forecast');
test('forecast rows cover every requested day and apply bills on their due dates', () => {
  const f = A.forecast(D, { asOf: ASOF, days: 30 });
  assert.equal(f.rows.length, 30);
  const sep20 = f.rows.find((r) => r.date === '2026-09-20');
  assert.equal(sep20.billCents, 41218, 'car loan must land on Sep 20');
  const oct1 = f.rows.find((r) => r.date === '2026-10-01');
  assert.equal(oct1.billCents, 150000, 'rent must land on Oct 1');
});
test('variable daily spend resists outliers far better than a mean would', () => {
  const d = M.migrate(structuredClone(D));
  const before = A.variableDailySpend(d, { asOf: ASOF });
  const OUTLIER = 900000; // $9,000 transmission job
  for (const day of ['2026-09-03', '2026-08-07', '2026-07-10']) {
    d.transactions.push(M.makeTransaction({ kind: 'expense', date: day, amountCents: -OUTLIER, merchant: 'Transmission Repair', category: 'Auto' }));
  }
  const after = A.variableDailySpend(d, { asOf: ASOF });
  const meanShift = (OUTLIER * 3) / 90; // what an untrimmed mean would absorb
  assert.ok(after - before < meanShift * 0.1,
    `trimmed estimate moved ${after - before}, an untrimmed mean would move ~${Math.round(meanShift)}`);
  // And the conservative bound must still reflect the outliers honestly.
  const detail = A.variableDailySpendDetail(d, { asOf: ASOF });
  assert.ok(detail.rawMeanCents > detail.trimmedCents,
    'the untrimmed bound must stay above the trimmed estimate');
});
test('a zero median does not collapse the daily estimate to zero', () => {
  // Most days have no spending at all; the estimate must still be positive.
  const d = M.emptyData();
  for (const day of ['2026-09-01', '2026-09-08', '2026-09-15']) {
    d.transactions.push(M.makeTransaction({ kind: 'expense', date: day, amount: 70, merchant: 'Store', category: 'Groceries' }));
  }
  assert.ok(A.variableDailySpend(d, { asOf: ASOF }) > 0,
    'sparse-but-real spending must not forecast as zero');
});
test('a bill payment is excluded from variable spend even when the merchant name differs', () => {
  const d = M.emptyData();
  d.bills.push(M.makeBill({ name: 'Rent', amount: 1500, frequency: 'monthly', nextDue: '2026-10-01', category: 'Rent' }));
  for (const m of ['2026-07', '2026-08', '2026-09']) {
    // Merchant "Landlord" shares no words with the bill named "Rent".
    d.transactions.push(M.makeTransaction({ kind: 'expense', date: `${m}-01`, amount: 1500, merchant: 'Landlord', category: 'Rent' }));
  }
  assert.equal(A.variableDailySpend(d, { asOf: ASOF }), 0,
    'rent paid to "Landlord" must still be recognised as the tracked Rent bill');
});
test('a small purchase in a bill category is not mistaken for the bill', () => {
  const d = M.emptyData();
  d.bills.push(M.makeBill({ name: 'Rent', amount: 1500, frequency: 'monthly', nextDue: '2026-10-01', category: 'Rent' }));
  const coffee = M.makeTransaction({ kind: 'expense', date: '2026-09-02', amount: 30, merchant: 'Cafe', category: 'Rent' });
  assert.equal(A.looksLikeBillPayment(coffee, d.bills), false);
});

group('insights');
test('produces concrete, ranked, non-empty advice with no API key', () => {
  const ins = generateInsights(D, { asOf: ASOF });
  assert.ok(ins.length >= 3, `expected several insights, got ${ins.length}`);
  for (let i = 1; i < ins.length; i++) {
    assert.ok((ins[i - 1].annualCents || 0) >= (ins[i].annualCents || 0), 'insights must be sorted by impact');
  }
  for (const i of ins) {
    assert.ok(i.title && i.body, 'every insight needs a title and body');
    assert.ok(Array.isArray(i.evidence), 'every insight must carry its evidence');
  }
});
test('surfaces the untracked subscription as a savings idea', () => {
  const ins = generateInsights(D, { asOf: ASOF });
  assert.ok(ins.some((i) => i.id === 'recurring-untracked'), 'untracked recurring charges must be reported');
});
test('flags the over-budget dining category', () => {
  const ins = generateInsights(D, { asOf: ASOF });
  assert.ok(ins.some((i) => i.id === 'budget-over-Dining'));
});
test('empty data produces no insights and does not throw', () => {
  const ins = generateInsights(M.emptyData(), { asOf: ASOF });
  assert.ok(Array.isArray(ins));
});


// ---------------------------------------------------------------- sync merge

group('sync: merge');
const tx = (id, amount, updatedAt, extra = {}) => ({
  ...M.makeTransaction({ id, kind: 'expense', date: '2026-09-01', amountCents: -amount, merchant: 'M', category: 'Other', ...extra }),
  updatedAt,
});

test('union keeps rows unique to either side', () => {
  const local = { ...M.emptyData(), transactions: [tx('a', 100, '2026-09-01T00:00:00Z')] };
  const remote = { ...M.emptyData(), transactions: [tx('b', 200, '2026-09-01T00:00:00Z')] };
  const merged = mergeLedgers(local, remote);
  assert.deepEqual(merged.transactions.map((t) => t.id).sort(), ['a', 'b']);
});

test('newer updatedAt wins on a conflicting edit', () => {
  const local = { ...M.emptyData(), transactions: [tx('a', 100, '2026-09-05T00:00:00Z')] };
  const remote = { ...M.emptyData(), transactions: [tx('a', 999, '2026-09-01T00:00:00Z')] };
  assert.equal(mergeLedgers(local, remote).transactions[0].amountCents, -100);
  // ...and symmetrically the other way round.
  const local2 = { ...M.emptyData(), transactions: [tx('a', 100, '2026-09-01T00:00:00Z')] };
  const remote2 = { ...M.emptyData(), transactions: [tx('a', 999, '2026-09-05T00:00:00Z')] };
  assert.equal(mergeLedgers(local2, remote2).transactions[0].amountCents, -999);
});

test('a deletion on one device is not resurrected by the other', () => {
  // The canonical naive-sync failure: phone deletes a row, desktop still has it,
  // merge unions them back together and the delete is silently undone.
  const remote = { ...M.emptyData(), transactions: [tx('a', 100, '2026-09-01T00:00:00Z')] };
  const local = { ...M.emptyData(), transactions: [] };
  tombstone(local, 'a');
  const merged = mergeLedgers(local, remote);
  assert.equal(merged.transactions.length, 0, 'deleted row must stay deleted');
  assert.ok(merged.tombstones.a, 'tombstone must be carried forward');
});

test('an edit made after a deletion wins over the deletion', () => {
  const local = { ...M.emptyData(), transactions: [] };
  tombstone(local, 'a');
  local.tombstones.a = '2026-09-01T00:00:00Z';
  const remote = { ...M.emptyData(), transactions: [tx('a', 100, '2026-09-09T00:00:00Z')] };
  const merged = mergeLedgers(local, remote);
  assert.equal(merged.transactions.length, 1, 'a later edit revives the row deliberately');
});

test('merge is idempotent', () => {
  const local = { ...M.emptyData(), transactions: [tx('a', 100, '2026-09-05T00:00:00Z')] };
  const remote = { ...M.emptyData(), transactions: [tx('b', 200, '2026-09-05T00:00:00Z')] };
  const once = mergeLedgers(local, remote);
  const twice = mergeLedgers(once, mergeLedgers(local, remote));
  assert.deepEqual(twice.transactions.map((t) => t.id).sort(), once.transactions.map((t) => t.id).sort());
});

test('merging never loses a transaction across a three-way round trip', () => {
  const base = { ...M.emptyData(), transactions: [tx('shared', 100, '2026-09-01T00:00:00Z')] };
  const phone = { ...M.emptyData(), transactions: [...base.transactions, tx('phone', 50, '2026-09-02T00:00:00Z')] };
  const desktop = { ...M.emptyData(), transactions: [...base.transactions, tx('desk', 75, '2026-09-03T00:00:00Z')] };
  const merged = mergeLedgers(phone, mergeLedgers(desktop, base));
  assert.deepEqual(merged.transactions.map((t) => t.id).sort(), ['desk', 'phone', 'shared']);
});

// ---------------------------------------------------------------- agent tools
group('agent: tool schemas');

test('every tool declares a well-formed JSON Schema', () => {
  assert.ok(TOOL_DEFS.length > 0, 'there must be tools');
  for (const t of TOOL_DEFS) {
    assert.ok(t.name && /^[a-z0-9_]+$/.test(t.name), `bad tool name: ${t.name}`);
    assert.ok(t.description && t.description.length > 20, `${t.name} needs a real description`);
    assert.equal(t.input_schema?.type, 'object', `${t.name} input_schema must be an object`);
    assert.ok(t.input_schema.properties && typeof t.input_schema.properties === 'object', `${t.name} needs properties`);
    for (const [key, prop] of Object.entries(t.input_schema.properties)) {
      assert.ok(prop.type || prop.enum, `${t.name}.${key} needs a type`);
      assert.ok(prop.description, `${t.name}.${key} needs a description — the model relies on it`);
    }
    for (const req of t.input_schema.required || []) {
      assert.ok(t.input_schema.properties[req], `${t.name} requires "${req}" but never defines it`);
    }
  }
});

test('tool names are unique', () => {
  const names = TOOL_DEFS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length, 'duplicate tool name');
});

test('every mutating tool actually exists', () => {
  const names = new Set(TOOL_DEFS.map((t) => t.name));
  for (const m of MUTATING_TOOLS) assert.ok(names.has(m), `MUTATING_TOOLS lists "${m}" which is not a tool`);
});

test('no tool can delete a Dropbox file', () => {
  // Destructive file ops are deliberately absent; "get rid of it" is a move to
  // Archive. This asserts the guarantee the README makes.
  for (const t of TOOL_DEFS) {
    assert.ok(!/dropbox_delete|delete_file|remove_file/.test(t.name),
      `${t.name} would let the agent destroy a file irrecoverably`);
  }
});

test('the whole tool schema serializes cleanly for the API', () => {
  const json = JSON.stringify(TOOL_DEFS);
  assert.ok(json.length > 500);
  assert.deepEqual(JSON.parse(json), TOOL_DEFS);
});

group('agent: history trimming');

const userMsg = (text) => ({ role: 'user', content: text });
const aiToolCall = (id) => ({ role: 'assistant', content: [{ type: 'tool_use', id, name: 'query_transactions', input: {} }] });
const toolResult = (id) => ({ role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: '{}' }] });

test('short history is returned untouched', () => {
  const h = [userMsg('a'), { role: 'assistant', content: 'b' }];
  assert.equal(trimHistory(h, 40), h);
});

test('trimming never orphans a tool_result from its tool_use', () => {
  // An orphaned tool_result is a 400 from the API, so the cut must land on a
  // real user turn, never in the middle of a tool exchange.
  const h = [];
  for (let i = 0; i < 12; i++) {
    h.push(userMsg(`q${i}`), aiToolCall(`t${i}`), toolResult(`t${i}`), { role: 'assistant', content: `a${i}` });
  }
  const trimmed = trimHistory(h, 10);
  assert.ok(trimmed.length <= 12, `expected a trimmed history, got ${trimmed.length}`);
  const first = trimmed[0];
  const firstIsToolResult = Array.isArray(first.content) && first.content.some((b) => b.type === 'tool_result');
  assert.ok(!firstIsToolResult, 'history must not begin with an orphaned tool_result');
  assert.equal(first.role, 'user', 'history must begin with a user turn');

  // And every surviving tool_result must still have its tool_use ahead of it.
  const seen = new Set();
  for (const m of trimmed) {
    for (const b of Array.isArray(m.content) ? m.content : []) {
      if (b.type === 'tool_use') seen.add(b.id);
      if (b.type === 'tool_result') {
        assert.ok(seen.has(b.tool_use_id), `tool_result ${b.tool_use_id} has no matching tool_use`);
      }
    }
  }
});

// ---------------------------------------------------------------- seed data
group('seed: legacy bill migration');

test('a legacy bill in float dollars becomes exact cents, not NaN', () => {
  // The real Spendwise export stores `amount: 1400` and no `amountCents`.
  // Passing it through untouched makes billMonthlyCents return NaN, which then
  // poisons safe-to-spend, the fixed-cost ratio and the entire forecast.
  const d = M.migrate({ bills: [{ id: 'b1', name: 'Rent', amount: 1400, frequency: 'monthly', nextDue: '' }] });
  const rent = d.bills[0];
  assert.equal(rent.amountCents, 140000);
  assert.ok(Number.isFinite(M.billMonthlyCents(rent)), 'monthly equivalent must be a number');
  assert.equal(M.billMonthlyCents(rent), 140000);
});

test('a blank due date falls through to a default instead of throwing', () => {
  const d = M.migrate({ bills: [{ id: 'b1', name: 'Rent', amount: 1400, frequency: 'monthly', nextDue: '' }] });
  assert.equal(d.bills.length, 1, 'the bill must survive migration');
  assert.ok(U.isValidISODate(d.bills[0].nextDue), `expected a real date, got ${d.bills[0].nextDue}`);
});

test('a monthly bill with no due date defaults forward, not into the past', () => {
  const d = M.migrate({ bills: [{ name: 'Rent', amount: 1400, frequency: 'monthly', nextDue: '' }] });
  assert.ok(d.bills[0].nextDue > U.toISODate(),
    'defaulting to today would invent a charge in the current month');
});

test('no NaN reaches any headline figure after a legacy import', () => {
  const d = M.migrate({
    paystubs: [{ date: '2026-09-11', net: 1301.82, gross: 1782, deductions: 480.18, hours: 81, rate: 22 }],
    bills: [{ name: 'Rent', amount: 1400, frequency: 'monthly', nextDue: '' },
            { name: 'BMO car loan', amount: 274.90, frequency: 'biweekly', nextDue: '2026-09-17' }],
  });
  const sts = A.safeToSpend(d, { asOf: ASOF });
  for (const [k, v] of Object.entries(sts)) {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `safeToSpend.${k} is ${v}`);
  }
  assert.ok(Number.isFinite(A.fixedMonthlyCents(d)), 'fixed monthly total must be finite');
  const f = A.forecast(d, { asOf: ASOF, days: 30 });
  for (const row of f.rows) {
    assert.ok(Number.isFinite(row.balanceCents), `forecast row ${row.date} is NaN`);
  }
});

group('seed: the real Spendwise data');

const SEED = M.migrate(seedLedger());

test('all nine pay stubs load as income', () => {
  const pay = SEED.transactions.filter((t) => t.kind === 'income');
  assert.equal(pay.length, 9);
  assert.equal(pay.length, SEED_PAYSTUBS.length);
  for (const p of pay) assert.ok(p.amountCents > 0, 'income must be positive');
});

test('every stub reconciles: gross - deductions = net', () => {
  for (const t of SEED.transactions.filter((x) => x.kind === 'income')) {
    assert.equal(t.grossCents - t.deductionsCents, t.amountCents,
      `${t.date}: ${t.grossCents} - ${t.deductionsCents} !== ${t.amountCents}`);
    assert.equal(t.netMismatchCents, undefined, `${t.date} should not be flagged`);
  }
});

test('every stub reconciles: hours x rate = gross', () => {
  for (const t of SEED.transactions.filter((x) => x.kind === 'income')) {
    assert.equal(Math.round(t.hours * t.rateCents), t.grossCents,
      `${t.date}: ${t.hours}h x ${t.rateCents} !== ${t.grossCents}`);
  }
});

test('exact totals, carried across the float-to-cents conversion', () => {
  const pay = SEED.transactions.filter((t) => t.kind === 'income');
  assert.equal(U.sumCents(pay.map((t) => t.amountCents)), 1230783, 'total net must be $12,307.83');
  assert.equal(U.sumCents(pay.map((t) => t.grossCents)), 1685235, 'total gross must be $16,852.35');
  assert.equal(U.sumCents(pay.map((t) => t.deductionsCents)), 454452, 'total deductions must be $4,544.52');
});

test('the four bills load with correct cents and categories', () => {
  assert.equal(SEED.bills.length, 4);
  assert.equal(SEED.bills.length, SEED_BILLS.length);
  const byName = Object.fromEntries(SEED.bills.map((b) => [b.name, b]));
  assert.equal(byName['Rent'].amountCents, 140000);
  assert.equal(byName['BMO car loan'].amountCents, 27490);
  assert.equal(byName['BMO car loan'].frequency, 'biweekly');
  assert.equal(byName['Travelers car insurance'].amountCents, 15333);
  assert.equal(byName['Rogers phone'].amountCents, 12600);
  for (const b of SEED.bills) assert.ok(Number.isFinite(M.billMonthlyCents(b)));
});

test('fixed monthly cost is the real figure, not a rounded guess', () => {
  // 1400 + 153.33 + 126 monthly, plus 274.90 biweekly (x26/12 = 595.62).
  const expected = 140000 + 15333 + 12600 + Math.round(27490 * 26 / 12);
  assert.equal(A.fixedMonthlyCents(SEED), expected);
});

test('biweekly pay cadence is detected from the real dates', () => {
  const p = A.incomeProfile(SEED, { asOf: ASOF });
  assert.equal(p.cadence, 'biweekly');
  assert.equal(p.medianGapDays, 14);
  assert.equal(p.averageNetCents, Math.round(1230783 / 9));
});

test('the seed produces a finite, coherent safe-to-spend', () => {
  const sts = A.safeToSpend(SEED, { asOf: ASOF });
  assert.ok(Number.isFinite(sts.safeCents));
  assert.equal(sts.safeCents,
    sts.forecastIncomeCents - sts.billsRemainingCents - sts.spentCents - sts.savedCents - sts.bufferCents);
  assert.equal(sts.incomeForecastIsPartial, false, 'nine stubs is plenty to establish cadence');
});

test('loading the seed twice does not duplicate anything', () => {
  // The seed goes through the ordinary merge path, so it must be idempotent.
  const once = M.migrate(seedLedger());
  const twice = mergeLedgers(M.migrate(seedLedger()), once);
  assert.equal(twice.transactions.length, once.transactions.length, 'pay stubs duplicated');
  assert.equal(twice.bills.length, once.bills.length, 'bills duplicated');
});

console.log(`\n${'='.repeat(52)}`);
console.log(`${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFailures:'); for (const [n, e] of failures) console.log(`  ${n}: ${e.message}`); process.exit(1); }
