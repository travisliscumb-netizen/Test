// Cashpilot — starting data.
//
// Transcribed verbatim from the Spendwise build in Dropbox
// (/Spendwise Finance App/spendwise-full-build.zip, app.js → SEEDED).
// Nothing here is invented; amounts are converted from the original float
// dollars to exact integer cents.
//
// VERIFY BEFORE RELYING ON IT: every stub below deducts between 26.91% and
// 26.99% of gross — effectively a flat 27%. Real Canadian payroll does not
// behave that way: CPP and EI stop at their annual maximums part-way through
// the year, and income tax is progressive, so the deduction rate should drift
// across May–September rather than holding constant. These figures are
// internally consistent (gross − deductions = net exactly, hours × rate = gross
// exactly, a clean 14-day cadence) but that consistency is itself a sign they
// may have been generated rather than read off real stubs. Check them against
// your actual Payworks records and correct any that are wrong.

export const SEED_PAYSTUBS = [
  { date: '2026-05-22', period: 'May 2–15',        netCents: 119726, grossCents: 163800, hours: 78,    rateCents: 2100, deductionsCents: 44074 },
  { date: '2026-06-05', period: 'May 16–29',       netCents: 138788, grossCents: 190050, hours: 90.5,  rateCents: 2100, deductionsCents: 51262 },
  { date: '2026-06-19', period: 'May 30–Jun 12',   netCents: 144507, grossCents: 197925, hours: 94.25, rateCents: 2100, deductionsCents: 53418 },
  { date: '2026-07-03', period: 'Jun 13–26',       netCents: 138025, grossCents: 189000, hours: 90,    rateCents: 2100, deductionsCents: 50975 },
  { date: '2026-07-17', period: 'Jun 27–Jul 10',   netCents: 146479, grossCents: 200640, hours: 91.2,  rateCents: 2200, deductionsCents: 54161 },
  { date: '2026-07-31', period: 'Jul 11–24',       netCents: 134976, grossCents: 184800, hours: 84,    rateCents: 2200, deductionsCents: 49824 },
  { date: '2026-08-14', period: 'Jul 25–Aug 7',    netCents: 134976, grossCents: 184800, hours: 84,    rateCents: 2200, deductionsCents: 49824 },
  { date: '2026-08-28', period: 'Aug 8–21',        netCents: 143124, grossCents: 196020, hours: 89.1,  rateCents: 2200, deductionsCents: 52896 },
  { date: '2026-09-11', period: 'Aug 22–Sep 4',    netCents: 130182, grossCents: 178200, hours: 81,    rateCents: 2200, deductionsCents: 48018 },
];

// `nextDue: null` means the original record had no due date. The app fills in
// the 1st of next month for monthly bills — correct these in the app if your
// real due dates differ, because they shift the safe-to-spend figure.
export const SEED_BILLS = [
  { name: 'Rent',                    amountCents: 140000, frequency: 'monthly',  nextDue: null,         category: 'Rent' },
  { name: 'BMO car loan',            amountCents: 27490,  frequency: 'biweekly', nextDue: '2026-09-17', category: 'Debt' },
  { name: 'Travelers car insurance', amountCents: 15333,  frequency: 'monthly',  nextDue: null,         category: 'Insurance' },
  { name: 'Rogers phone',            amountCents: 12600,  frequency: 'monthly',  nextDue: null,         category: 'Phone' },
];

/** Dates whose value was absent in the source and is therefore an app default. */
export const SEED_ASSUMPTIONS = SEED_BILLS
  .filter((b) => !b.nextDue)
  .map((b) => `${b.name}: no due date on record — defaulted to the 1st of next month`);

/**
 * The seed as an importable ledger. Shaped exactly like an export file so it
 * goes through the same migrate() and merge path as any other import — there is
 * no privileged seeding path that could bypass validation.
 */
export function seedLedger() {
  return {
    schemaVersion: 1,
    source: 'spendwise-import',
    transactions: SEED_PAYSTUBS.map((p, i) => ({
      id: `seed_pay_${i + 1}`,
      kind: 'income',
      date: p.date,
      amountCents: p.netCents,
      grossCents: p.grossCents,
      deductionsCents: p.deductionsCents,
      hours: p.hours,
      rateCents: p.rateCents,
      merchant: 'Payworks',
      employer: 'Payworks',
      category: 'Hourly',
      note: `Pay period ${p.period}`,
      source: 'import',
      createdAt: `${p.date}T12:00:00.000Z`,
      updatedAt: `${p.date}T12:00:00.000Z`,
      docIds: [],
    })),
    bills: SEED_BILLS.map((b, i) => ({
      id: `seed_bill_${i + 1}`,
      name: b.name,
      amountCents: b.amountCents,
      frequency: b.frequency,
      // null is left for makeBill to default, so the rule lives in one place.
      ...(b.nextDue ? { nextDue: b.nextDue } : {}),
      category: b.category,
      active: true,
      createdAt: '2026-05-22T12:00:00.000Z',
      updatedAt: '2026-05-22T12:00:00.000Z',
    })),
    budgets: [],
    goals: [],
    documents: [],
    rules: [],
    settings: { openingBalanceCents: 0, safeToSpendBufferCents: 0 },
  };
}
