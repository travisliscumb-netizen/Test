// Cashpilot — the AI agent's tool surface.
//
// SAFETY MODEL (the user granted this agent autonomous read, write, Dropbox-read
// and Dropbox-write, so the guard rails are structural rather than prompts):
//
//  1. Every mutation goes through actions.js, the same validated path the UI
//     uses. The agent has no privileged write.
//  2. Every Dropbox path is checked against /Cashpilot by dropbox.assertInRoot.
//     Prompt wording is not a security boundary; that function is.
//  3. There is deliberately NO Dropbox delete tool. "Organize my files" is
//     served by move, and the destructive variant is archive-by-move, so an
//     autonomous tidy-up is always recoverable from the user's Dropbox.
//  4. Every mutating call is appended to the audit log with its arguments, so
//     the user can see exactly what the AI changed and when.

import * as actions from './actions.js';
import * as dbx from './dropbox.js';
import { getData, mutate } from './store.js';
import { getBlob } from './blobs.js';
import { imageBlockSource, imageBlock } from './anthropic.js';
import * as A from './analytics.js';
import { generateInsights } from './insights.js';
import {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, FREQUENCIES, DBX_ROOT, DBX_INBOX, DBX_RECEIPTS,
  DBX_PAYSTUBS, DBX_REPORTS,
} from './config.js';
import {
  toISODate, monthKey, startOfMonth, endOfMonth, addDays, addMonths, formatMoney,
  normalizeMerchant,
} from './util.js';

const DBX_ARCHIVE = `${DBX_ROOT}/Archive`;
const MAX_IMAGES_PER_CALL = 4;

// --- schema helpers ----------------------------------------------------------

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const num = (description, extra = {}) => ({ type: 'number', description, ...extra });
const bool = (description) => ({ type: 'boolean', description });

const DATE_DESC = 'Calendar date as YYYY-MM-DD.';
const AMOUNT_DESC = 'Amount in dollars as a positive number (e.g. 47.25). The sign is set by "kind", never by you.';

const TX_FIELDS = {
  date: str(DATE_DESC),
  amount: num(AMOUNT_DESC),
  merchant: str('Who the money went to, or came from.'),
  category: str('One of the allowed categories.', { enum: [...new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])] }),
  kind: str('expense = money out, income = money in, transfer = moved between your own accounts (excluded from both spending and earnings).', { enum: ['expense', 'income', 'transfer'] }),
  note: str('Optional free-text note.'),
};

// --- tool definitions --------------------------------------------------------

export const TOOL_DEFS = [
  // ---- read -----------------------------------------------------------------
  {
    name: 'query_transactions',
    description: 'Search the ledger. Use this before answering any question about what was spent or earned — never guess from memory of earlier turns.',
    input_schema: {
      type: 'object',
      properties: {
        from: str(`Start date, inclusive. ${DATE_DESC}`),
        to: str(`End date, inclusive. ${DATE_DESC}`),
        category: str('Restrict to one category.'),
        merchant: str('Case-insensitive substring match on the merchant.'),
        kind: str('Restrict to expense, income or transfer.', { enum: ['expense', 'income', 'transfer'] }),
        min_amount: num('Only rows whose absolute amount is at least this many dollars.'),
        limit: num('Maximum rows to return (default 50, max 500).'),
      },
    },
  },
  {
    name: 'get_analytics',
    description: 'Computed financial analysis. Prefer this over adding up transactions yourself — these figures are what the dashboard shows, so using them keeps your answer consistent with the app.',
    input_schema: {
      type: 'object',
      properties: {
        report: str('Which analysis to run.', {
          enum: ['summary', 'safe_to_spend', 'category_breakdown', 'merchant_breakdown',
            'monthly_trend', 'budgets', 'forecast', 'recurring', 'insights',
            'income_profile', 'anomalies', 'overview'],
        }),
        from: str(`Start date for window-based reports. ${DATE_DESC}`),
        to: str(`End date for window-based reports. ${DATE_DESC}`),
        month: str('Month as YYYY-MM, for budgets.'),
        days: num('Horizon in days, for forecast (default 60).'),
      },
      required: ['report'],
    },
  },
  {
    name: 'list_records',
    description: 'List bills, budgets, goals, categorization rules, or stored documents.',
    input_schema: {
      type: 'object',
      properties: {
        what: str('Which collection.', { enum: ['bills', 'budgets', 'goals', 'rules', 'documents'] }),
      },
      required: ['what'],
    },
  },

  // ---- write ----------------------------------------------------------------
  {
    name: 'add_transactions',
    description: 'Record one or more transactions. Use a single call with several items rather than many calls. If you extracted these from a receipt or pay stub, pass the document_id so the record links back to the image.',
    input_schema: {
      type: 'object',
      properties: {
        transactions: {
          type: 'array',
          description: 'The transactions to add.',
          items: {
            type: 'object',
            properties: {
              ...TX_FIELDS,
              gross: num('Pay stubs only: gross pay in dollars.'),
              deductions: num('Pay stubs only: total deductions in dollars.'),
              hours: num('Pay stubs only: hours worked.'),
              employer: str('Pay stubs only: employer name.'),
              document_id: str('Id of a stored document this came from.'),
            },
            required: ['date', 'amount', 'kind'],
          },
        },
      },
      required: ['transactions'],
    },
  },
  {
    name: 'update_transaction',
    description: 'Change fields on one existing transaction. Get its id from query_transactions first.',
    input_schema: {
      type: 'object',
      properties: { id: str('Transaction id.'), ...TX_FIELDS },
      required: ['id'],
    },
  },
  {
    name: 'delete_transaction',
    description: 'Delete one transaction. Only do this when the user clearly asked for a removal, or to remove a duplicate you have confirmed by querying first.',
    input_schema: {
      type: 'object',
      properties: { id: str('Transaction id.'), reason: str('Why this row is being removed.') },
      required: ['id'],
    },
  },
  {
    name: 'recategorize_merchant',
    description: 'Recategorize every past transaction from a merchant and remember the choice for future ones. This is the right tool for "all my X purchases should be Y".',
    input_schema: {
      type: 'object',
      properties: {
        merchant: str('Merchant name or substring.'),
        category: str('Category to apply.', { enum: EXPENSE_CATEGORIES }),
        learn_rule: bool('Also apply automatically to future transactions (default true).'),
      },
      required: ['merchant', 'category'],
    },
  },
  {
    name: 'manage_bill',
    description: 'Create, update, or remove a recurring bill. Bills drive the safe-to-spend and forecast numbers, so a known recurring charge belongs here rather than only as past transactions.',
    input_schema: {
      type: 'object',
      properties: {
        operation: str('What to do.', { enum: ['add', 'update', 'delete'] }),
        id: str('Bill id, required for update and delete.'),
        name: str('Bill name.'),
        amount: num('Amount in dollars per occurrence.'),
        frequency: str('How often it recurs.', { enum: FREQUENCIES }),
        next_due: str(`Next due date. ${DATE_DESC}`),
        category: str('Category.', { enum: EXPENSE_CATEGORIES }),
        active: bool('Set false to pause without deleting.'),
      },
      required: ['operation'],
    },
  },
  {
    name: 'manage_budget',
    description: 'Set or remove a monthly budget for a category. Budgets are what enable pace and overspend warnings.',
    input_schema: {
      type: 'object',
      properties: {
        operation: str('What to do.', { enum: ['set', 'delete'] }),
        category: str('Category.', { enum: EXPENSE_CATEGORIES }),
        monthly_amount: num('Monthly limit in dollars, for set.'),
      },
      required: ['operation', 'category'],
    },
  },
  {
    name: 'manage_goal',
    description: 'Create or update a savings goal.',
    input_schema: {
      type: 'object',
      properties: {
        operation: str('What to do.', { enum: ['add', 'update', 'delete'] }),
        id: str('Goal id, for update and delete.'),
        name: str('Goal name.'),
        target: num('Target amount in dollars.'),
        saved: num('Amount saved so far in dollars.'),
        target_date: str(`Optional target date. ${DATE_DESC}`),
      },
      required: ['operation'],
    },
  },

  // ---- Dropbox read ---------------------------------------------------------
  {
    name: 'dropbox_list',
    description: `List files in the Cashpilot Dropbox folder. Everything lives under ${DBX_ROOT}: Inbox (things dropped in from the phone), Receipts, Paystubs, Reports, Archive.`,
    input_schema: {
      type: 'object',
      properties: {
        path: str(`Folder to list. Defaults to ${DBX_INBOX}.`),
        recursive: bool('Include subfolders.'),
      },
    },
  },
  {
    name: 'dropbox_search',
    description: 'Find files by name inside the Cashpilot folder.',
    input_schema: {
      type: 'object',
      properties: { query: str('Search text.'), limit: num('Max results (default 25).') },
      required: ['query'],
    },
  },
  {
    name: 'read_document',
    description: 'Read a receipt, pay stub, or other document so you can see it. Images come back as pictures you can read directly; text and CSV files come back as text. Use this to extract amounts, dates and merchants, then record them with add_transactions.',
    input_schema: {
      type: 'object',
      properties: {
        path: str('Dropbox path of the file.'),
        document_id: str('Alternatively, the id of a document already stored in the app.'),
      },
    },
  },

  // ---- Dropbox write --------------------------------------------------------
  {
    name: 'dropbox_organize',
    description: `Move or rename a file inside the Cashpilot folder — for filing a processed receipt into Receipts/YYYY-MM, for example. To get rid of a file, move it to ${DBX_ARCHIVE} rather than deleting it; there is no delete tool on purpose.`,
    input_schema: {
      type: 'object',
      properties: {
        from_path: str('Current Dropbox path.'),
        to_path: str('New Dropbox path, including the filename.'),
      },
      required: ['from_path', 'to_path'],
    },
  },
  {
    name: 'save_report',
    description: `Write a text or Markdown report into ${DBX_REPORTS}. Use this when the user asks for something written down, exported, or shared.`,
    input_schema: {
      type: 'object',
      properties: {
        filename: str('File name, e.g. "September review.md".'),
        content: str('Full file content.'),
      },
      required: ['filename', 'content'],
    },
  },
];

/** Names of tools that change something — used for the audit log and UI labels. */
export const MUTATING_TOOLS = new Set([
  'add_transactions', 'update_transaction', 'delete_transaction', 'recategorize_merchant',
  'manage_bill', 'manage_budget', 'manage_goal', 'dropbox_organize', 'save_report',
]);

// --- dispatch ----------------------------------------------------------------

/**
 * Run one tool call.
 * @returns {Promise<{content: string|Array, isError?: boolean, summary: string}>}
 */
export async function runTool(name, input, { onAudit } = {}) {
  try {
    const result = await TOOL_IMPLS[name]?.(input ?? {});
    if (result === undefined) {
      return { content: `Unknown tool "${name}".`, isError: true, summary: `unknown tool ${name}` };
    }
    if (MUTATING_TOOLS.has(name) && onAudit) {
      onAudit({ tool: name, input, summary: result.summary, at: new Date().toISOString() });
    }
    return result;
  } catch (err) {
    // Tool failures are reported back to the model as tool_result errors so it
    // can correct itself, rather than aborting the whole conversation.
    return {
      content: `Error: ${err.message}`,
      isError: true,
      summary: `${name} failed: ${err.message}`,
    };
  }
}

const ok = (payload, summary) => ({ content: JSON.stringify(payload), summary });

// --- implementations ---------------------------------------------------------

const TOOL_IMPLS = {
  query_transactions(input) {
    const data = getData();
    const limit = Math.min(Math.max(1, Number(input.limit) || 50), 500);
    const merchantKey = input.merchant ? normalizeMerchant(input.merchant) : null;
    const minCents = input.min_amount ? Math.round(Number(input.min_amount) * 100) : 0;

    let rows = data.transactions.filter((t) => {
      if (input.from && t.date < input.from) return false;
      if (input.to && t.date > input.to) return false;
      if (input.kind && t.kind !== input.kind) return false;
      if (input.category && t.category.toLowerCase() !== String(input.category).toLowerCase()) return false;
      if (merchantKey && !normalizeMerchant(t.merchant).includes(merchantKey)) return false;
      if (minCents && Math.abs(t.amountCents) < minCents) return false;
      return true;
    });

    const totalMatches = rows.length;
    rows = rows.slice(0, limit);
    return ok({
      total_matches: totalMatches,
      returned: rows.length,
      truncated: totalMatches > rows.length,
      total_amount: formatMoney(rows.reduce((a, t) => a + t.amountCents, 0)),
      transactions: rows.map(publicTx),
    }, `queried ${totalMatches} transactions`);
  },

  get_analytics(input) {
    const data = getData();
    const asOf = toISODate();
    const from = input.from || startOfMonth(asOf);
    const to = input.to || endOfMonth(asOf);

    switch (input.report) {
      case 'summary':
        return ok(money(A.summarize(data, from, to)), `summary ${from}..${to}`);
      case 'safe_to_spend':
        return ok(money(A.safeToSpend(data, { asOf })), 'safe-to-spend');
      case 'category_breakdown':
        return ok({
          from, to,
          categories: A.byCategory(A.inWindow(data.transactions, from, to))
            .map((r) => ({ category: r.category, amount: formatMoney(r.cents), share: `${Math.round(r.share * 100)}%`, count: r.count })),
        }, 'category breakdown');
      case 'merchant_breakdown':
        return ok({
          from, to,
          merchants: A.byMerchant(A.inWindow(data.transactions, from, to), 25)
            .map((r) => ({ merchant: r.merchant, amount: formatMoney(r.cents), count: r.count, last: r.lastDate })),
        }, 'merchant breakdown');
      case 'monthly_trend':
        return ok({
          months: A.monthlySeries(data, input.from, input.to).map((m) => ({
            month: m.month,
            income: formatMoney(m.incomeCents),
            spending: formatMoney(m.spendingCents),
            net: formatMoney(m.netCents),
          })),
        }, 'monthly trend');
      case 'budgets':
        return ok({
          month: input.month || monthKey(asOf),
          budgets: A.budgetStatus(data, input.month || monthKey(asOf), { asOf }).map((b) => ({
            category: b.category,
            budget: formatMoney(b.monthlyCents),
            spent: formatMoney(b.spentCents),
            remaining: formatMoney(b.remainingCents),
            projected_full_month: formatMoney(b.projectedCents),
            status: b.status,
          })),
        }, 'budget status');
      case 'forecast': {
        const f = A.forecast(data, { asOf, days: Math.min(Number(input.days) || 60, 365) });
        return ok({
          as_of: f.asOf,
          days: f.days,
          estimated_daily_variable_spend: formatMoney(f.variablePerDayCents),
          conservative_daily_variable_spend: formatMoney(f.variablePerDayRawCents),
          ending_balance_change: formatMoney(f.rows.at(-1)?.balanceCents ?? 0),
          lowest_point: (() => {
            const low = f.rows.reduce((m, r) => (r.balanceCents < m.balanceCents ? r : m), f.rows[0]);
            return low ? { date: low.date, balance_change: formatMoney(low.balanceCents) } : null;
          })(),
          notable_days: f.rows.filter((r) => r.incomeCents || r.billCents)
            .map((r) => ({ date: r.date, income: formatMoney(r.incomeCents), bills: formatMoney(r.billCents) })),
        }, 'forecast');
      }
      case 'recurring':
        return ok({
          recurring_charges: A.detectRecurring(data, { asOf }).map((r) => ({
            merchant: r.merchant,
            cadence: r.cadence,
            average: formatMoney(r.averageCents),
            monthly_equivalent: formatMoney(r.monthlyEquivalentCents),
            annual_equivalent: formatMoney(r.annualEquivalentCents),
            occurrences: r.occurrences,
            last_seen: r.lastDate,
            amount_is_fixed: r.amountIsFixed,
            confidence: Number(r.confidence.toFixed(2)),
          })),
        }, 'recurring detection');
      case 'insights':
        return ok({
          insights: generateInsights(data, { asOf }).map((i) => ({
            title: i.title, detail: i.body, severity: i.severity,
            estimated_annual_impact: formatMoney(i.annualCents || 0),
            evidence: i.evidence,
          })),
        }, 'insights');
      case 'income_profile':
        return ok(money(A.incomeProfile(data, { asOf })), 'income profile');
      case 'anomalies':
        return ok({
          anomalies: A.categoryAnomalies(data, { asOf }).map((a) => ({
            category: a.category,
            this_month: formatMoney(a.currentCents),
            usual: formatMoney(a.medianCents),
            multiple: `${a.ratio.toFixed(1)}x`,
          })),
        }, 'anomalies');
      case 'overview':
      default:
        return ok({
          today: asOf,
          safe_to_spend: money(A.safeToSpend(data, { asOf })),
          this_month: money(A.summarize(data, startOfMonth(asOf), endOfMonth(asOf))),
          income_profile: money(A.incomeProfile(data, { asOf })),
          fixed_monthly_bills: formatMoney(A.fixedMonthlyCents(data)),
          transaction_count: data.transactions.length,
        }, 'overview');
    }
  },

  list_records(input) {
    const data = getData();
    switch (input.what) {
      case 'bills':
        return ok({
          bills: data.bills.map((b) => ({
            id: b.id, name: b.name, amount: formatMoney(b.amountCents), frequency: b.frequency,
            next_due: b.nextDue, category: b.category, active: b.active !== false,
            monthly_equivalent: formatMoney(Math.round(b.amountCents * ({ weekly: 52 / 12, biweekly: 26 / 12, semimonthly: 2, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }[b.frequency] ?? 1))),
          })),
        }, `${data.bills.length} bills`);
      case 'budgets':
        return ok({ budgets: data.budgets.map((b) => ({ id: b.id, category: b.category, monthly: formatMoney(b.monthlyCents) })) }, `${data.budgets.length} budgets`);
      case 'goals':
        return ok({
          goals: data.goals.map((g) => ({
            id: g.id, name: g.name, target: formatMoney(g.targetCents),
            saved: formatMoney(g.savedCents), target_date: g.targetDate,
          })),
        }, `${data.goals.length} goals`);
      case 'rules':
        return ok({ rules: data.rules.map((r) => ({ id: r.id, match: r.match, category: r.category })) }, `${data.rules.length} rules`);
      case 'documents':
        return ok({
          documents: data.documents.slice(0, 200).map((d) => ({
            id: d.id, name: d.name, kind: d.kind, dropbox_path: d.dropboxPath,
            added: d.addedAt, linked_transaction: d.txId,
          })),
        }, `${data.documents.length} documents`);
      default:
        return ok({ error: `Unknown collection "${input.what}"` }, 'unknown collection');
    }
  },

  async add_transactions(input) {
    const list = Array.isArray(input.transactions) ? input.transactions : [];
    if (!list.length) return ok({ added: 0, note: 'No transactions were supplied.' }, 'nothing to add');

    const { added, failed } = await actions.addTransactions(list.map((t) => ({
      date: t.date,
      amount: t.amount,
      kind: t.kind,
      merchant: t.merchant,
      category: t.category,
      note: t.note,
      gross: t.gross,
      deductions: t.deductions,
      hours: t.hours,
      employer: t.employer,
      source: 'ai',
      docIds: t.document_id ? [t.document_id] : [],
    })));

    for (const t of added) {
      const docId = list.find((x) => x.document_id && Math.abs(Math.round(Number(x.amount) * 100)) === Math.abs(t.amountCents))?.document_id;
      if (docId) await actions.linkDocumentToTransaction(docId, t.id).catch(() => {});
    }

    return ok({
      added: added.length,
      rejected: failed.length,
      transactions: added.map(publicTx),
      rejections: failed.map((f) => ({ input: f.input, reason: f.error })),
    }, `added ${added.length} transaction${added.length === 1 ? '' : 's'}${failed.length ? `, ${failed.length} rejected` : ''}`);
  },

  async update_transaction(input) {
    const patch = {};
    for (const [k, v] of Object.entries({
      date: input.date, amount: input.amount, merchant: input.merchant,
      category: input.category, kind: input.kind, note: input.note,
    })) if (v !== undefined) patch[k] = v;
    const tx = await actions.editTransaction(input.id, patch);
    return ok({ updated: publicTx(tx) }, `updated ${tx.merchant} ${formatMoney(tx.amountCents)}`);
  },

  async delete_transaction(input) {
    const removed = await actions.deleteTransaction(input.id);
    return ok({ deleted: publicTx(removed) }, `deleted ${removed.merchant} ${formatMoney(removed.amountCents)}`);
  },

  async recategorize_merchant(input) {
    const changed = await actions.recategorizeMerchant(input.merchant, input.category, {
      alsoLearnRule: input.learn_rule !== false,
    });
    return ok({
      changed: changed.length,
      category: input.category,
      rule_learned: input.learn_rule !== false,
    }, `recategorized ${changed.length} row${changed.length === 1 ? '' : 's'} to ${input.category}`);
  },

  async manage_bill(input) {
    if (input.operation === 'delete') {
      const removed = await actions.deleteBill(input.id);
      return ok({ deleted: removed.name }, `deleted bill ${removed.name}`);
    }
    if (input.operation === 'update') {
      const patch = {};
      for (const [k, v] of [['name', input.name], ['amount', input.amount], ['frequency', input.frequency],
        ['nextDue', input.next_due], ['category', input.category], ['active', input.active]]) {
        if (v !== undefined) patch[k] = v;
      }
      const bill = await actions.editBill(input.id, patch);
      return ok({ updated: publicBill(bill) }, `updated bill ${bill.name}`);
    }
    const bill = await actions.addBill({
      name: input.name, amount: input.amount, frequency: input.frequency,
      nextDue: input.next_due, category: input.category, active: input.active,
    });
    return ok({ added: publicBill(bill) }, `added bill ${bill.name} ${formatMoney(bill.amountCents)}`);
  },

  async manage_budget(input) {
    if (input.operation === 'delete') {
      const removed = await actions.deleteBudget(input.category);
      return ok({ deleted: removed.category }, `removed ${removed.category} budget`);
    }
    const b = await actions.setBudget(input.category, Math.round(Number(input.monthly_amount) * 100));
    return ok({ category: b.category, monthly: formatMoney(b.monthlyCents) },
      `set ${b.category} budget to ${formatMoney(b.monthlyCents)}`);
  },

  async manage_goal(input) {
    if (input.operation === 'delete') {
      const removed = await actions.deleteGoal(input.id);
      return ok({ deleted: removed.name }, `deleted goal ${removed.name}`);
    }
    if (input.operation === 'update') {
      const patch = {};
      for (const [k, v] of [['name', input.name], ['target', input.target], ['saved', input.saved], ['targetDate', input.target_date]]) {
        if (v !== undefined) patch[k] = v;
      }
      const g = await actions.editGoal(input.id, patch);
      return ok({ updated: { id: g.id, name: g.name, target: formatMoney(g.targetCents), saved: formatMoney(g.savedCents) } }, `updated goal ${g.name}`);
    }
    const g = await actions.addGoal({ name: input.name, target: input.target, saved: input.saved, targetDate: input.target_date });
    return ok({ added: { id: g.id, name: g.name, target: formatMoney(g.targetCents) } }, `added goal ${g.name}`);
  },

  async dropbox_list(input) {
    requireDropbox();
    const path = input.path || DBX_INBOX;
    const entries = await dbx.listFolder(path, { recursive: Boolean(input.recursive) });
    return ok({
      path,
      count: entries.length,
      entries: entries.map((e) => ({
        name: e.name, path: e.path, type: e.tag, size: e.size, modified: e.modified,
        is_image: dbx.isImagePath(e.path),
      })),
    }, `listed ${entries.length} item${entries.length === 1 ? '' : 's'} in ${path}`);
  },

  async dropbox_search(input) {
    requireDropbox();
    const entries = await dbx.search(input.query, { limit: Math.min(Number(input.limit) || 25, 100) });
    return ok({
      query: input.query,
      results: entries.map((e) => ({ name: e.name, path: e.path, type: e.tag, modified: e.modified })),
    }, `found ${entries.length} file${entries.length === 1 ? '' : 's'}`);
  },

  async read_document(input) {
    let blob;
    let label;

    if (input.document_id) {
      const doc = getData().documents.find((d) => d.id === input.document_id);
      if (!doc) throw new Error(`No document with id ${input.document_id}`);
      label = doc.name;
      blob = doc.blobKey ? await getBlob(doc.blobKey) : null;
      if (!blob && doc.dropboxPath) {
        requireDropbox();
        blob = (await dbx.download(doc.dropboxPath)).blob;
      }
      if (!blob) throw new Error(`The file for "${doc.name}" is no longer available on this device or in Dropbox.`);
    } else if (input.path) {
      requireDropbox();
      label = input.path;
      blob = (await dbx.download(input.path)).blob;
    } else {
      throw new Error('Provide either a Dropbox path or a document_id.');
    }

    const isImage = /^image\//.test(blob.type) || dbx.isImagePath(label);
    if (isImage) {
      const source = await imageBlockSource(blob);
      // Returned as real image content so the model reads the receipt itself,
      // rather than a second extraction call guessing at OCR text.
      return {
        content: [
          imageBlock(source),
          { type: 'text', text: `Above: ${label} (${source.width}x${source.height}). Read the amounts, date and merchant from the image, then record them with add_transactions.` },
        ],
        summary: `read image ${label}`,
      };
    }

    if (/^(text\/|application\/json|application\/csv)/.test(blob.type) || /\.(txt|csv|json|md)$/i.test(label)) {
      const text = await blob.text();
      const clipped = text.length > 60000 ? `${text.slice(0, 60000)}\n...[truncated, ${text.length} characters total]` : text;
      return ok({ path: label, content: clipped }, `read text ${label}`);
    }

    throw new Error(`"${label}" is a ${blob.type || 'binary'} file, which cannot be read directly. Images (JPEG, PNG, WebP, GIF) and text files are supported. A PDF needs to be exported as images first.`);
  },

  async dropbox_organize(input) {
    requireDropbox();
    // assertInRoot runs inside dbx.move for both paths; this is the structural
    // guarantee that an autonomous reorganization stays inside /Cashpilot.
    const parent = input.to_path.slice(0, input.to_path.lastIndexOf('/'));
    if (parent) await dbx.createFolder(parent).catch(() => {});
    const moved = await dbx.move(input.from_path, input.to_path);
    return ok({ from: input.from_path, to: moved.path }, `moved ${input.from_path} to ${moved.path}`);
  },

  async save_report(input) {
    const path = await actions.writeReport(input.filename, input.content);
    return ok({ saved_to: path }, `saved report to ${path}`);
  },
};

// --- helpers -----------------------------------------------------------------

function requireDropbox() {
  if (!dbx.isConnected()) {
    throw new Error('Dropbox is not connected. Ask the user to connect it in Settings, then try again.');
  }
}

/** Shape a transaction for the model: money as readable strings, ids preserved. */
const publicTx = (t) => ({
  id: t.id,
  date: t.date,
  kind: t.kind,
  amount: formatMoney(t.amountCents),
  amount_cents: t.amountCents,
  merchant: t.merchant,
  category: t.category,
  note: t.note || undefined,
  employer: t.employer,
  gross: t.grossCents !== undefined ? formatMoney(t.grossCents) : undefined,
  deductions: t.deductionsCents !== undefined ? formatMoney(t.deductionsCents) : undefined,
  hours: t.hours,
  source: t.source,
});

const publicBill = (b) => ({
  id: b.id, name: b.name, amount: formatMoney(b.amountCents),
  frequency: b.frequency, next_due: b.nextDue, category: b.category, active: b.active !== false,
});

/**
 * Convert every *Cents field into a formatted money string for the model.
 * Models reason about "$1,234.56" far more reliably than about 123456, and the
 * raw integer is kept only where the app needs to round-trip it.
 */
function money(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.endsWith('Cents') && typeof v === 'number') {
      out[k.replace(/Cents$/, '').replace(/([A-Z])/g, (m) => `_${m.toLowerCase()}`)] = formatMoney(v);
    } else if (Array.isArray(v)) {
      out[snake(k)] = v.map((item) => (item && typeof item === 'object' ? money(item) : item));
    } else if (v && typeof v === 'object') {
      out[snake(k)] = money(v);
    } else {
      out[snake(k)] = v;
    }
  }
  return out;
}

const snake = (k) => k.replace(/([A-Z])/g, (m) => `_${m.toLowerCase()}`);

export { DBX_ARCHIVE };
