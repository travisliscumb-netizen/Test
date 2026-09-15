// Cashpilot — UI controller.

import * as store from './store.js';
import * as actions from './actions.js';
import * as dbx from './dropbox.js';
import * as anthropic from './anthropic.js';
import * as camera from './camera.js';
import * as blobs from './blobs.js';
import * as A from './analytics.js';
import * as charts from './charts.js';
import { generateInsights } from './insights.js';
import { runAgent, trimHistory } from './agent.js';
import { seedLedger, SEED_ASSUMPTIONS, SEED_PAYSTUBS, SEED_BILLS } from './seed.js';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, FREQUENCIES, DBX_INBOX, DBX_ROOT, LS } from './config.js';
import {
  formatMoney, formatDate, formatMonth, toISODate, startOfMonth, endOfMonth, monthKey,
  addMonths, addDays, esc, parseMoney, debounce,
} from './util.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let currentView = 'home';
let chatHistory = [];
let chatTranscript = [];
let agentRunning = false;
let agentAbort = null;

// --- boot --------------------------------------------------------------------

async function boot() {
  try {
    await store.load();
  } catch (err) {
    showBootError(err);
    return;
  }

  // Finish a Dropbox redirect if we came back from one.
  const settings = store.getSettings();
  if (settings.dropboxAppKey) {
    try {
      const token = await dbx.completeAuthFromUrl(settings.dropboxAppKey);
      if (token) {
        await dbx.ensureFolders();
        toast('Dropbox connected.', 'good');
        void store.sync();
      }
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  $('#boot').hidden = true;
  $('.topbar').hidden = false;
  $('#app').hidden = false;
  $('#tabbar').hidden = false;

  wireChrome();
  store.subscribe(onStoreChange);
  render();

  if (dbx.isConnected()) void store.sync();
  registerServiceWorker();

  // Re-pull when the app comes back to the foreground, so a change made on the
  // phone shows up on the desktop without a manual refresh.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && dbx.isConnected()) {
      store.pull().catch(() => {});
    }
  });
  window.addEventListener('online', () => { if (dbx.isConnected()) void store.sync(); });
}

function showBootError(err) {
  $('#boot').innerHTML = `
    <div class="boot-mark">!</div>
    <p class="boot-error">Cashpilot could not start.</p>
    <p class="boot-text">${esc(err.message)}</p>
    <p class="boot-text small">This usually means the browser is blocking site data. Check that cookies and site data are allowed for this page, then reload.</p>`;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // file:// has no service worker scope; skip rather than throwing on open-by-file.
  if (location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
}

function onStoreChange(_data, reason) {
  renderSyncChip();
  // A settings-only change does not need a full re-render of the current view.
  if (reason !== 'settings') render();
}

// --- chrome ------------------------------------------------------------------

function wireChrome() {
  $$('[data-goto]').forEach((btn) => btn.addEventListener('click', () => goto(btn.dataset.goto)));
  $('#open-settings').addEventListener('click', openSettings);
  $('#sync-chip').addEventListener('click', onSyncChipClick);
  $$('[data-close-sheet]').forEach((el) => el.addEventListener('click', closeSheet));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#sheet-host').hidden) closeSheet();
  });
  renderSyncChip();
}

function goto(view) {
  currentView = view;
  $$('.view').forEach((el) => { el.hidden = el.dataset.view !== view; });
  $$('.tab').forEach((el) => el.classList.toggle('active', el.dataset.goto === view));
  render();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function renderSyncChip() {
  const meta = store.getSyncMeta();
  const dot = $('#sync-dot');
  const label = $('#sync-label');
  if (!dot) return;
  // Reset to the neutral class; never classList.add('') — an empty token throws
  // and this runs during boot, which took the whole app down with it.
  dot.className = 'dot';
  if (!dbx.isConnected()) { label.textContent = 'Local only'; return; }
  if (meta.pending) { dot.classList.add('busy'); label.textContent = 'Syncing…'; return; }
  if (meta.lastError) { dot.classList.add('bad'); label.textContent = 'Sync failed'; return; }
  dot.classList.add('ok');
  label.textContent = meta.lastSyncAt ? `Synced ${timeAgo(meta.lastSyncAt)}` : 'Dropbox ready';
}

function onSyncChipClick() {
  const meta = store.getSyncMeta();
  if (!dbx.isConnected()) { openSettings(); return; }
  if (meta.lastError) { toast(meta.lastError, 'bad'); }
  store.sync().then((r) => {
    if (r?.error) toast(r.error, 'bad');
    else if (!r?.skipped) toast('Synced with Dropbox.', 'good');
  });
}

function timeAgo(iso) {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// --- render dispatch ---------------------------------------------------------

function render() {
  const data = store.getData();
  switch (currentView) {
    case 'home': renderHome(data); break;
    case 'activity': renderActivity(data); break;
    case 'insights': renderInsights(data); break;
    case 'capture': renderCapture(data); break;
    case 'chat': renderChat(); break;
  }
  renderSyncChip();
}

// --- home --------------------------------------------------------------------

function renderHome(data) {
  const el = $('#view-home');
  const asOf = toISODate();
  const sts = A.safeToSpend(data, { asOf });
  const summary = A.summarize(data, startOfMonth(asOf), endOfMonth(asOf));
  const months = A.monthlySeries(data).slice(-12);
  const cats = A.byCategory(A.inWindow(data.transactions, startOfMonth(asOf), endOfMonth(asOf)));
  const fc = A.forecast(data, { asOf, days: 60 });
  const empty = data.transactions.length === 0;

  el.innerHTML = `
    <div class="card">
      <p class="eyebrow">Safe to spend · ${esc(formatMonth(monthKey(asOf)))}</p>
      <p class="headline-amount ${sts.safeCents < 0 ? 'neg' : ''}">${esc(formatMoney(sts.safeCents))}</p>
      <p class="card-sub">${sts.daysLeft} day${sts.daysLeft === 1 ? '' : 's'} left${sts.safeCents > 0 && sts.daysLeft > 0 ? ` · about ${esc(formatMoney(sts.perDayCents))} a day` : ''}</p>
      <ul class="breakdown">
        <li><span class="k">Income received</span><span class="v plus">${esc(formatMoney(sts.receivedCents))}</span></li>
        <li><span class="k">Expected before month end</span><span class="v plus">${esc(formatMoney(sts.expectedRemainingCents))}</span></li>
        <li><span class="k">Bills still due</span><span class="v minus">−${esc(formatMoney(sts.billsRemainingCents))}</span></li>
        <li><span class="k">Already spent</span><span class="v minus">−${esc(formatMoney(sts.spentCents))}</span></li>
        ${sts.savedCents ? `<li><span class="k">Moved to savings</span><span class="v minus">−${esc(formatMoney(sts.savedCents))}</span></li>` : ''}
        ${sts.bufferCents ? `<li><span class="k">Your buffer</span><span class="v minus">−${esc(formatMoney(sts.bufferCents))}</span></li>` : ''}
        <li class="total"><span class="k">Safe to spend</span><span class="v">${esc(formatMoney(sts.safeCents))}</span></li>
      </ul>
      ${sts.incomeForecastIsPartial ? `<p class="note">Your pay rhythm isn't established yet, so nothing is assumed for income still to come. Add a couple more pay stubs and this number gets sharper.</p>` : ''}
    </div>

    <div class="quick">
      <button type="button" data-act="add-expense"><span class="qi">＋</span>Expense</button>
      <button type="button" data-act="add-income"><span class="qi">↥</span>Income</button>
      <button type="button" data-act="scan"><span class="qi">▣</span>Scan</button>
      <button type="button" data-act="add-bill"><span class="qi">↻</span>Bill</button>
    </div>

    ${empty ? emptyStateCard() : ''}

    <div class="card">
      <div class="card-head">
        <h3 class="card-title">This month</h3>
        <p class="card-sub">${esc(formatDate(startOfMonth(asOf)))} – ${esc(formatDate(asOf))}</p>
      </div>
      <div class="stat-grid">
        <div class="stat"><div class="label">Income</div><div class="value good">${esc(formatMoney(summary.incomeCents))}</div></div>
        <div class="stat"><div class="label">Spending</div><div class="value">${esc(formatMoney(summary.spendingCents))}</div></div>
        <div class="stat"><div class="label">Net</div><div class="value ${summary.netCents < 0 ? 'bad' : 'good'}">${esc(formatMoney(summary.netCents))}</div></div>
        <div class="stat"><div class="label">Fixed bills</div><div class="value">${esc(formatMoney(A.fixedMonthlyCents(data)))}<span class="small dim">/mo</span></div></div>
      </div>
    </div>

    ${cats.length ? `
    <div class="card">
      <div class="card-head"><h3 class="card-title">Where it went</h3><p class="card-sub">${esc(formatMonth(monthKey(asOf)))}</p></div>
      <div class="donut-wrap">
        ${charts.categoryDonut(cats)}
        <ul class="legend">${charts.donutLegend(cats)}</ul>
      </div>
    </div>` : ''}

    ${months.length > 1 ? `
    <div class="card">
      <div class="card-head"><h3 class="card-title">Income vs spending</h3><p class="card-sub">Last ${months.length} months</p></div>
      <div class="chart-scroll">${charts.incomeVsSpendingChart(months)}</div>
    </div>` : ''}

    ${data.transactions.length >= 5 ? `
    <div class="card">
      <div class="card-head">
        <h3 class="card-title">Next 60 days</h3>
        <p class="card-sub">Projected change from bills, pay and typical spending</p>
      </div>
      ${charts.forecastChart(fc.rows)}
      <p class="card-sub small" style="margin-top:8px">
        Assumes about ${esc(formatMoney(fc.variablePerDayCents))}/day of everyday spending
        (${esc(formatMoney(fc.variablePerDayRawCents))}/day if unusual months repeat).
        This is a change from today, not a bank balance.
      </p>
    </div>` : ''}

    ${renderRecentCard(data)}
  `;

  wireQuickActions(el);
  wireRowClicks(el);
}

function emptyStateCard() {
  return `
    <div class="card empty">
      <div class="big">◎</div>
      <p><strong>Nothing recorded yet.</strong></p>
      <p class="small dim">Add an expense, photograph a receipt, or import your old Spendwise export from Settings. The AI can also read receipts straight out of your Dropbox Inbox.</p>
      <div class="btn-row" style="justify-content:center;margin-top:12px">
        <button type="button" class="btn primary" data-act="load-seed">Load my Spendwise data</button>
        <button type="button" class="btn" data-act="add-expense">Add an expense</button>
        <button type="button" class="btn" data-act="import">Import JSON</button>
      </div>
      <p class="small dim" style="margin-top:10px">
        ${SEED_PAYSTUBS.length} pay stubs and ${SEED_BILLS.length} bills carried over from your old build.
      </p>
    </div>`;
}

function renderRecentCard(data) {
  const recent = data.transactions.slice(0, 8);
  if (!recent.length) return '';
  return `
    <div class="card">
      <div class="card-head">
        <h3 class="card-title">Recent activity</h3>
        <button type="button" class="chip" data-goto="activity">See all</button>
      </div>
      <ul class="rows">${recent.map(txRow).join('')}</ul>
    </div>`;
}

function txRow(t) {
  const cls = t.kind === 'income' ? 'in' : t.kind === 'transfer' ? 'transfer' : '';
  return `
    <li class="row" data-tx="${esc(t.id)}">
      <div class="row-main">${esc(t.merchant)}</div>
      <div class="row-meta">
        <span>${esc(formatDate(t.date))}</span>
        <span class="pill">${esc(t.category)}</span>
        ${t.source === 'ai' ? '<span class="pill ai">AI</span>' : ''}
        ${t.docIds?.length ? '<span class="pill">📎</span>' : ''}
        ${t.netMismatchCents ? '<span class="pill" title="Gross minus deductions does not equal net">⚠ check</span>' : ''}
      </div>
      <div class="row-amt ${cls}">${esc(formatMoney(t.amountCents, { sign: t.kind === 'income' }))}</div>
    </li>`;
}

// --- activity ----------------------------------------------------------------

let activityFilters = { from: '', to: '', category: '', kind: '', q: '' };

function renderActivity(data) {
  const el = $('#view-activity');
  const f = activityFilters;
  let rows = data.transactions.filter((t) => {
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (f.kind && t.kind !== f.kind) return false;
    if (f.category && t.category !== f.category) return false;
    if (f.q) {
      const hay = `${t.merchant} ${t.note} ${t.category}`.toLowerCase();
      if (!hay.includes(f.q.toLowerCase())) return false;
    }
    return true;
  });

  const totalIn = rows.filter((t) => t.kind === 'income').reduce((a, t) => a + t.amountCents, 0);
  const totalOut = -rows.filter(A.isSpending).reduce((a, t) => a + t.amountCents, 0);
  const shown = rows.slice(0, 300);

  el.innerHTML = `
    <div class="card">
      <div class="card-head"><h3 class="card-title">Activity</h3>
        <button type="button" class="chip" data-act="add-expense">＋ Add</button></div>
      <div class="filters">
        <input type="search" id="f-q" placeholder="Search merchant or note" value="${esc(f.q)}">
        <select id="f-kind">
          <option value="">All kinds</option>
          <option value="expense"${f.kind === 'expense' ? ' selected' : ''}>Expenses</option>
          <option value="income"${f.kind === 'income' ? ' selected' : ''}>Income</option>
          <option value="transfer"${f.kind === 'transfer' ? ' selected' : ''}>Transfers</option>
        </select>
        <select id="f-cat">
          <option value="">All categories</option>
          ${[...new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])].map((c) =>
            `<option value="${esc(c)}"${f.category === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
        <input type="date" id="f-from" value="${esc(f.from)}" aria-label="From date">
        <input type="date" id="f-to" value="${esc(f.to)}" aria-label="To date">
        ${Object.values(f).some(Boolean) ? '<button type="button" class="chip" id="f-clear">Clear</button>' : ''}
      </div>
      <div class="stat-grid" style="margin-top:12px">
        <div class="stat"><div class="label">Matching rows</div><div class="value">${rows.length}</div></div>
        <div class="stat"><div class="label">In</div><div class="value good">${esc(formatMoney(totalIn))}</div></div>
        <div class="stat"><div class="label">Out</div><div class="value">${esc(formatMoney(totalOut))}</div></div>
      </div>
    </div>

    <div class="card">
      ${shown.length
        ? `<ul class="rows">${shown.map(txRow).join('')}</ul>
           ${rows.length > shown.length ? `<p class="card-sub small" style="margin-top:10px">Showing the first ${shown.length} of ${rows.length}. Narrow the filters to see the rest.</p>` : ''}`
        : '<div class="empty"><div class="big">≡</div><p>No transactions match.</p></div>'}
    </div>`;

  const bind = (id, key, ev = 'change') => {
    const node = $(`#${id}`, el);
    if (node) node.addEventListener(ev, () => { activityFilters[key] = node.value; renderActivity(store.getData()); });
  };
  bind('f-kind', 'kind'); bind('f-cat', 'category'); bind('f-from', 'from'); bind('f-to', 'to');
  const q = $('#f-q', el);
  if (q) {
    const run = debounce(() => { activityFilters.q = q.value; renderActivity(store.getData()); }, 220);
    q.addEventListener('input', run);
  }
  const clear = $('#f-clear', el);
  if (clear) clear.addEventListener('click', () => {
    activityFilters = { from: '', to: '', category: '', kind: '', q: '' };
    renderActivity(store.getData());
  });
  wireQuickActions(el);
  wireRowClicks(el);
}

// --- insights ----------------------------------------------------------------

function renderInsights(data) {
  const el = $('#view-insights');
  const asOf = toISODate();
  const ideas = generateInsights(data, { asOf });
  const budgets = A.budgetStatus(data, monthKey(asOf), { asOf });
  const recurring = A.detectRecurring(data, { asOf });
  const totalAnnual = ideas.reduce((a, i) => a + Math.max(0, i.annualCents || 0), 0);

  el.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h3 class="card-title">Ways to save</h3>
        <p class="card-sub">${ideas.length ? `Up to ${esc(formatMoney(totalAnnual))}/year identified` : 'Computed on this device'}</p>
      </div>
      ${ideas.length ? `<div style="display:grid;gap:10px">${ideas.map(insightCard).join('')}</div>`
        : `<div class="empty"><div class="big">◆</div><p>Not enough history yet.</p>
           <p class="small dim">Record a few weeks of spending and specific, numbered savings ideas will appear here — no API key needed.</p></div>`}
    </div>

    <div class="card">
      <div class="card-head">
        <h3 class="card-title">Budgets</h3>
        <button type="button" class="chip" data-act="add-budget">＋ Set a budget</button>
      </div>
      ${budgets.length ? budgets.map(budgetRow).join('')
        : '<p class="card-sub">No budgets yet. Budgets turn on pace warnings and overspend alerts.</p>'}
    </div>

    <div class="card">
      <div class="card-head">
        <h3 class="card-title">Recurring charges</h3>
        <p class="card-sub">Detected from your own history</p>
      </div>
      ${recurring.length ? `<ul class="rows">${recurring.map((r) => `
        <li class="row" data-add-bill="${esc(JSON.stringify({ name: r.merchant, amount: r.averageCents / 100, frequency: r.cadence === 'biweekly' || r.cadence === 'weekly' || r.cadence === 'monthly' || r.cadence === 'quarterly' || r.cadence === 'yearly' ? r.cadence : 'monthly', category: r.category }))}">
          <div class="row-main">${esc(r.merchant)}</div>
          <div class="row-meta">
            <span>${esc(r.cadence)}</span><span>${r.occurrences}× seen</span>
            <span>${esc(formatMoney(r.annualEquivalentCents))}/yr</span>
            ${r.amountIsFixed ? '<span class="pill">fixed</span>' : '<span class="pill">varies</span>'}
          </div>
          <div class="row-amt">${esc(formatMoney(r.averageCents))}</div>
        </li>`).join('')}</ul>
        <p class="card-sub small" style="margin-top:10px">Tap one to track it as a bill so it counts against safe-to-spend.</p>`
        : '<p class="card-sub">Nothing regular detected yet. This needs at least three charges from the same merchant on a steady rhythm.</p>'}
    </div>

    ${renderAuditCard(data)}`;

  wireQuickActions(el);
  $$('[data-add-bill]', el).forEach((row) => row.addEventListener('click', () => {
    openBillSheet(JSON.parse(row.dataset.addBill));
  }));
}

function insightCard(i) {
  return `
    <div class="insight ${esc(i.severity)}">
      <div class="insight-head">
        <h4 class="insight-title">${esc(i.title)}</h4>
        ${i.annualCents > 0 ? `<span class="insight-impact">${esc(formatMoney(i.annualCents))}/yr</span>` : ''}
      </div>
      <p class="insight-body">${esc(i.body)}</p>
      ${i.evidence?.length ? `<details><summary>Show the numbers</summary><ul>${i.evidence.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></details>` : ''}
    </div>`;
}

function budgetRow(b) {
  return `
    <div class="budget-row">
      <div class="budget-top">
        <strong>${esc(b.category)}</strong>
        <span class="mono">${esc(formatMoney(b.spentCents))} / ${esc(formatMoney(b.monthlyCents))}</span>
      </div>
      ${charts.budgetBar(b.spentCents, b.monthlyCents)}
      <div class="budget-meta">
        ${b.remainingCents >= 0
          ? `${esc(formatMoney(b.remainingCents))} left`
          : `<span style="color:var(--bad)">${esc(formatMoney(-b.remainingCents))} over</span>`}
        · on pace for ${esc(formatMoney(b.projectedCents))}
      </div>
    </div>`;
}

function renderAuditCard(data) {
  const log = Array.isArray(data.auditLog) ? data.auditLog.slice(0, 12) : [];
  if (!log.length) return '';
  return `
    <div class="card">
      <div class="card-head"><h3 class="card-title">What the AI changed</h3>
        <p class="card-sub">Every write the assistant made</p></div>
      <ul class="rows">${log.map((e) => `
        <li class="row" style="cursor:default">
          <div class="row-main">${esc(e.summary || e.tool)}</div>
          <div class="row-meta"><span class="pill ai">${esc(e.tool)}</span><span>${esc(timeAgo(e.at))}</span></div>
        </li>`).join('')}</ul>
    </div>`;
}

// --- capture -----------------------------------------------------------------

function renderCapture(data) {
  const el = $('#view-capture');
  const docs = data.documents.slice(0, 40);

  el.innerHTML = `
    <div class="card">
      <div class="card-head"><h3 class="card-title">Add a receipt or pay stub</h3></div>
      <div class="btn-row">
        <button type="button" class="btn primary" data-act="camera">📷 Take a photo</button>
        <button type="button" class="btn" data-act="upload">Choose files</button>
      </div>
      <div class="dropzone" id="dropzone" style="margin-top:12px">
        Drop images or files here
        <div class="small dim" style="margin-top:4px">
          Saved on this device${dbx.isConnected() ? ` and uploaded to ${esc(DBX_ROOT)}` : ' (connect Dropbox to sync them)'}
        </div>
      </div>
    </div>

    ${dbx.isConnected() ? `
    <div class="card">
      <div class="card-head">
        <h3 class="card-title">Dropbox inbox</h3>
        <button type="button" class="chip" data-act="refresh-inbox">Refresh</button>
      </div>
      <p class="card-sub">Drop receipts into <code>${esc(DBX_INBOX)}</code> from your phone, then ask the AI to process them.</p>
      <div id="inbox-list" class="small dim" style="margin-top:10px">Loading…</div>
      <div class="btn-row" style="margin-top:12px">
        <button type="button" class="btn primary" data-act="process-inbox">Have the AI process the inbox</button>
      </div>
    </div>` : `
    <div class="card">
      <p class="card-sub">Connect Dropbox in Settings to drop files in from your phone and let the AI read them.</p>
      <button type="button" class="btn" data-act="settings" style="margin-top:10px">Open Settings</button>
    </div>`}

    <div class="card">
      <div class="card-head"><h3 class="card-title">Saved documents</h3>
        <p class="card-sub">${data.documents.length} total</p></div>
      ${docs.length ? `<div class="thumb-grid" id="thumbs">${docs.map((d) => `
        <div class="thumb" data-doc="${esc(d.id)}">
          <div class="thumb-tag">${esc(d.name)}</div>
        </div>`).join('')}</div>`
        : '<div class="empty"><div class="big">▣</div><p>No documents yet.</p></div>'}
    </div>`;

  wireQuickActions(el);
  wireDropzone($('#dropzone', el));
  void hydrateThumbs(el, docs);
  if (dbx.isConnected()) void loadInbox(el);
}

async function hydrateThumbs(root, docs) {
  for (const d of docs) {
    const node = $(`[data-doc="${CSS.escape(d.id)}"]`, root);
    if (!node) continue;
    node.addEventListener('click', () => openDocumentSheet(d));
    if (!d.blobKey || !/^image\//.test(d.mime)) continue;
    const url = await blobs.blobUrl(d.blobKey).catch(() => null);
    if (url && node.isConnected) node.insertAdjacentHTML('afterbegin', `<img src="${esc(url)}" alt="${esc(d.name)}" loading="lazy">`);
  }
}

async function loadInbox(root) {
  const target = $('#inbox-list', root);
  if (!target) return;
  try {
    const entries = await dbx.listFolder(DBX_INBOX);
    const files = entries.filter((e) => e.tag === 'file');
    target.innerHTML = files.length
      ? `<ul class="rows">${files.map((f) => `
          <li class="row" style="cursor:default">
            <div class="row-main">${esc(f.name)}</div>
            <div class="row-meta"><span>${esc(camera.formatBytes(f.size || 0))}</span><span>${esc(f.modified ? timeAgo(f.modified) : '')}</span></div>
          </li>`).join('')}</ul>`
      : '<p class="card-sub">Inbox is empty.</p>';
  } catch (err) {
    target.innerHTML = `<p class="card-sub" style="color:var(--bad)">${esc(err.message)}</p>`;
  }
}

function wireDropzone(zone) {
  if (!zone) return;
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { stop(e); zone.classList.add('hot'); }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { stop(e); zone.classList.remove('hot'); }));
  zone.addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) void ingestFiles(files);
  });
  zone.addEventListener('click', () => quickAction('upload'));
}

async function ingestFiles(files) {
  let saved = 0;
  for (const file of files) {
    try {
      const kind = /pay|stub/i.test(file.name) ? 'paystub' : /receipt/i.test(file.name) ? 'receipt' : 'other';
      const { uploadError } = await actions.addDocument(file, { name: file.name, kind });
      saved++;
      if (uploadError) toast(`Saved "${file.name}" locally, but Dropbox upload failed: ${uploadError}`, 'bad');
    } catch (err) {
      toast(`Could not save ${file.name}: ${err.message}`, 'bad');
    }
  }
  if (saved) {
    toast(`Saved ${saved} file${saved === 1 ? '' : 's'}.`, 'good');
    render();
  }
}

// --- chat --------------------------------------------------------------------

const SUGGESTIONS = [
  'What can I cut this month?',
  'Process everything in my Dropbox inbox',
  'How much did I spend on groceries last month?',
  'Am I on track this month?',
];

function renderChat() {
  const el = $('#view-chat');
  const hasKey = anthropic.hasApiKey();

  el.innerHTML = `
    ${hasKey ? '' : `
      <div class="card">
        <div class="card-head"><h3 class="card-title">Connect Claude</h3></div>
        <p class="card-sub">The assistant needs an Anthropic API key. It is stored only in this browser and sent only to api.anthropic.com.</p>
        <div class="btn-row" style="margin-top:12px"><button type="button" class="btn primary" data-act="settings">Add an API key</button></div>
      </div>`}

    <div class="card">
      <div class="card-head">
        <h3 class="card-title">Ask Cashpilot</h3>
        ${chatTranscript.length ? '<button type="button" class="chip" data-act="clear-chat">Clear</button>' : ''}
      </div>
      <div class="chat-log" id="chat-log">
        ${chatTranscript.length ? chatTranscript.map(renderChatEntry).join('') : `
          <div class="empty"><div class="big">✦</div>
            <p>Tell it what to do.</p>
            <p class="small dim">It can read your ledger, record transactions, read receipts out of Dropbox, and file them away.</p>
          </div>`}
      </div>
      ${chatTranscript.length ? '' : `<div class="suggestions" style="margin-top:12px">
        ${SUGGESTIONS.map((s) => `<button type="button" class="suggestion" data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}
      </div>`}
      <div class="composer">
        <textarea id="chat-input" rows="1" placeholder="${hasKey ? 'Log $47 of gas yesterday…' : 'Add an API key to start'}" ${hasKey ? '' : 'disabled'}></textarea>
        <button type="button" class="btn primary" id="chat-send" ${hasKey ? '' : 'disabled'}>${agentRunning ? 'Stop' : 'Send'}</button>
      </div>
    </div>`;

  wireQuickActions(el);
  $$('[data-suggest]', el).forEach((b) => b.addEventListener('click', () => sendChat(b.dataset.suggest)));

  const input = $('#chat-input', el);
  const send = $('#chat-send', el);
  if (input) {
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = `${Math.min(150, input.scrollHeight)}px`;
    });
    input.addEventListener('keydown', (e) => {
      // Enter sends; Shift+Enter is a newline. On a phone the on-screen keyboard
      // sends a plain Enter for "return", so only do this on a wide viewport.
      if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 620px)').matches) {
        e.preventDefault();
        sendChat(input.value);
      }
    });
  }
  if (send) send.addEventListener('click', () => {
    if (agentRunning) { agentAbort?.abort(); return; }
    sendChat(input.value);
  });
  scrollChatToEnd();
}

function renderChatEntry(entry) {
  if (entry.role === 'user') return `<div class="msg user">${esc(entry.text)}</div>`;
  if (entry.role === 'tools') {
    return `<div class="tool-trace">${entry.lines.map((l) => `
      <div class="tool-line ${l.isError ? 'err' : l.mutating ? 'mut' : ''}">
        ${l.done ? (l.isError ? '✕' : '✓') : '<span class="spinner"></span>'}
        <span>${esc(l.label)}</span>
      </div>`).join('')}</div>`;
  }
  if (entry.role === 'error') return `<div class="msg err">${esc(entry.text)}</div>`;
  return `<div class="msg ai">${renderMarkdownish(entry.text)}</div>`;
}

/** Deliberately tiny: bold, inline code, and line breaks. No HTML passthrough. */
function renderMarkdownish(text) {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function scrollChatToEnd() {
  const log = $('#chat-log');
  if (log) log.scrollTop = log.scrollHeight;
  window.scrollTo({ top: document.body.scrollHeight });
}

async function sendChat(raw) {
  const text = String(raw || '').trim();
  if (!text || agentRunning) return;
  if (!anthropic.hasApiKey()) { openSettings(); return; }

  chatTranscript.push({ role: 'user', text });
  const toolEntry = { role: 'tools', lines: [] };
  agentRunning = true;
  agentAbort = new AbortController();
  renderChat();

  const onEvent = (ev) => {
    if (ev.type === 'tool-start') {
      if (!chatTranscript.includes(toolEntry)) chatTranscript.push(toolEntry);
      toolEntry.lines.push({ id: ev.id, label: describeTool(ev.name, ev.input), done: false });
      renderChat();
    } else if (ev.type === 'tool-end') {
      const line = toolEntry.lines.find((l) => l.id === ev.id);
      if (line) {
        line.done = true;
        line.isError = ev.isError;
        line.mutating = ev.mutating;
        if (ev.summary) line.label = ev.summary;
      }
      renderChat();
    }
  };

  try {
    chatHistory = trimHistory(chatHistory);
    const result = await runAgent(chatHistory, text, { onEvent, signal: agentAbort.signal });
    chatHistory = result.history;
    if (result.stopped === 'aborted') chatTranscript.push({ role: 'error', text: 'Stopped.' });
    else if (result.text) chatTranscript.push({ role: 'ai', text: result.text });
    else chatTranscript.push({ role: 'error', text: 'The assistant returned nothing. Try rephrasing.' });
    persistChat();
  } catch (err) {
    chatTranscript.push({ role: 'error', text: err.message || String(err) });
  } finally {
    agentRunning = false;
    agentAbort = null;
    renderChat();
    render();
  }
}

function describeTool(name, input) {
  switch (name) {
    case 'query_transactions': return 'Searching transactions…';
    case 'get_analytics': return `Analysing ${String(input?.report || '').replace(/_/g, ' ')}…`;
    case 'list_records': return `Reading ${input?.what || 'records'}…`;
    case 'add_transactions': return `Recording ${input?.transactions?.length || 0} transaction(s)…`;
    case 'update_transaction': return 'Updating a transaction…';
    case 'delete_transaction': return 'Deleting a transaction…';
    case 'recategorize_merchant': return `Recategorising ${input?.merchant || ''}…`;
    case 'manage_bill': return `${input?.operation || 'Changing'} bill…`;
    case 'manage_budget': return `${input?.operation || 'Changing'} budget…`;
    case 'manage_goal': return `${input?.operation || 'Changing'} goal…`;
    case 'dropbox_list': return `Listing ${input?.path || 'Dropbox'}…`;
    case 'dropbox_search': return `Searching Dropbox for "${input?.query || ''}"…`;
    case 'read_document': return `Reading ${input?.path || 'document'}…`;
    case 'dropbox_organize': return 'Filing a document…';
    case 'save_report': return `Writing ${input?.filename || 'report'}…`;
    default: return name;
  }
}

function persistChat() {
  try {
    localStorage.setItem(LS.chat, JSON.stringify(chatTranscript.slice(-60)));
  } catch { /* quota or private mode */ }
}

function restoreChat() {
  try {
    const raw = localStorage.getItem(LS.chat);
    if (raw) chatTranscript = JSON.parse(raw);
  } catch { chatTranscript = []; }
}

// --- quick actions -----------------------------------------------------------

function wireQuickActions(root) {
  $$('[data-act]', root).forEach((btn) =>
    btn.addEventListener('click', () => quickAction(btn.dataset.act)));
  $$('[data-goto]', root).forEach((btn) =>
    btn.addEventListener('click', () => goto(btn.dataset.goto)));
}

function wireRowClicks(root) {
  $$('[data-tx]', root).forEach((row) => row.addEventListener('click', () => {
    const tx = store.getData().transactions.find((t) => t.id === row.dataset.tx);
    if (tx) openTransactionSheet(tx);
  }));
}

async function quickAction(act) {
  switch (act) {
    case 'add-expense': openTransactionSheet(null, 'expense'); break;
    case 'add-income': openTransactionSheet(null, 'income'); break;
    case 'add-bill': openBillSheet(); break;
    case 'add-budget': openBudgetSheet(); break;
    case 'settings': openSettings(); break;
    case 'import': openImportSheet(); break;
    case 'scan': goto('capture'); setTimeout(() => quickAction('camera'), 60); break;
    case 'upload': {
      const files = await camera.pickFiles();
      if (files.length) await ingestFiles(files);
      break;
    }
    case 'camera': await openCameraSheet(); break;
    case 'refresh-inbox': void loadInbox($('#view-capture')); break;
    case 'process-inbox':
      goto('chat');
      setTimeout(() => sendChat(`Look in ${DBX_INBOX}, read every receipt and pay stub you find there, record the transactions, and file each processed file into Receipts/YYYY-MM or Paystubs/YYYY-MM. Tell me what you recorded.`), 80);
      break;
    case 'load-seed': await loadSeed(); break;
    case 'clear-chat':
      chatTranscript = []; chatHistory = []; persistChat(); renderChat();
      break;
  }
}

/**
 * Load the carried-over Spendwise data.
 *
 * Goes through the ordinary import path, so it is validated and de-duplicated
 * like any other file — running it twice is harmless. The assumptions it had to
 * make are surfaced rather than buried.
 */
async function loadSeed() {
  const existing = store.getData().transactions.length;
  const message = existing
    ? `You already have ${existing} transactions. Loading merges the ${SEED_PAYSTUBS.length} Spendwise pay stubs and ${SEED_BILLS.length} bills in; duplicates are skipped. Continue?`
    : `Load ${SEED_PAYSTUBS.length} pay stubs and ${SEED_BILLS.length} bills from your old Spendwise build?`;
  if (!confirm(message)) return;
  try {
    const res = await store.importJSON(JSON.stringify(seedLedger()), { mode: 'merge' });
    toast(`Loaded ${res.transactions} pay stubs and ${res.bills} bills.`, 'good');
    render();
    if (SEED_ASSUMPTIONS.length) {
      openSheet('Check these dates', `
        <p class="card-sub">Your data is loaded. These bills had no due date in the old build, so
        Cashpilot defaulted them to the 1st of next month. Due dates move the safe-to-spend
        number, so correct any that are wrong.</p>
        <ul class="rows" style="margin-top:12px">
          ${SEED_ASSUMPTIONS.map((a) => `<li class="row" style="cursor:default"><div class="row-main">${esc(a)}</div></li>`).join('')}
        </ul>
        <div class="btn-row" style="margin-top:14px">
          <button type="button" class="btn primary" data-close-sheet>Got it</button>
        </div>`, (root) => {
        $$('[data-close-sheet]', root).forEach((b) => b.addEventListener('click', closeSheet));
      });
    }
  } catch (err) {
    toast(err.message, 'bad');
  }
}

// --- sheets ------------------------------------------------------------------

function openSheet(title, html, wire) {
  $('#sheet-title').textContent = title;
  $('#sheet-body').innerHTML = html;
  $('#sheet-host').hidden = false;
  document.body.style.overflow = 'hidden';
  if (wire) wire($('#sheet-body'));
}

function closeSheet() {
  $('#sheet-host').hidden = true;
  $('#sheet-body').innerHTML = '';
  document.body.style.overflow = '';
  if (activeCamera) { activeCamera.stop(); activeCamera = null; }
}

function catOptions(list, selected) {
  return list.map((c) => `<option value="${esc(c)}"${c === selected ? ' selected' : ''}>${esc(c)}</option>`).join('');
}

function openTransactionSheet(existing = null, defaultKind = 'expense') {
  const t = existing;
  const kind = t?.kind || defaultKind;
  const isIncome = kind === 'income';

  openSheet(t ? 'Edit transaction' : isIncome ? 'Add income' : 'Add expense', `
    <div class="field">
      <label for="tx-amount">Amount</label>
      <input id="tx-amount" type="text" inputmode="decimal" placeholder="0.00"
             value="${t ? esc((Math.abs(t.amountCents) / 100).toFixed(2)) : ''}">
      <span class="hint">Enter a positive number. ${isIncome ? 'Recorded as money in.' : 'Recorded as money out.'}</span>
    </div>
    <div class="field">
      <label for="tx-merchant">${isIncome ? 'Source / employer' : 'Merchant'}</label>
      <input id="tx-merchant" type="text" value="${esc(t?.merchant || '')}" placeholder="${isIncome ? 'Payworks' : 'Loblaws'}">
    </div>
    <div class="field-row">
      <div class="field">
        <label for="tx-date">Date</label>
        <input id="tx-date" type="date" value="${esc(t?.date || toISODate())}">
      </div>
      <div class="field">
        <label for="tx-cat">Category</label>
        <select id="tx-cat">${catOptions(isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES, t?.category)}</select>
      </div>
    </div>
    <div class="field">
      <label for="tx-kind">Kind</label>
      <select id="tx-kind">
        <option value="expense"${kind === 'expense' ? ' selected' : ''}>Expense — money out</option>
        <option value="income"${kind === 'income' ? ' selected' : ''}>Income — money in</option>
        <option value="transfer"${kind === 'transfer' ? ' selected' : ''}>Transfer — between my own accounts</option>
      </select>
    </div>
    ${isIncome ? `
    <div class="field-row">
      <div class="field"><label for="tx-gross">Gross pay (optional)</label>
        <input id="tx-gross" type="text" inputmode="decimal" value="${t?.grossCents !== undefined ? esc((t.grossCents / 100).toFixed(2)) : ''}"></div>
      <div class="field"><label for="tx-ded">Deductions (optional)</label>
        <input id="tx-ded" type="text" inputmode="decimal" value="${t?.deductionsCents !== undefined ? esc((t.deductionsCents / 100).toFixed(2)) : ''}"></div>
    </div>
    <div class="field"><label for="tx-hours">Hours (optional)</label>
      <input id="tx-hours" type="text" inputmode="decimal" value="${t?.hours ?? ''}"></div>` : ''}
    <div class="field">
      <label for="tx-note">Note (optional)</label>
      <input id="tx-note" type="text" value="${esc(t?.note || '')}">
    </div>
    ${t?.netMismatchCents ? `<p class="note">Gross minus deductions is ${esc(formatMoney(t.grossCents - t.deductionsCents))}, which doesn't match the net of ${esc(formatMoney(t.amountCents))}. Worth a second look.</p>` : ''}
    <div class="btn-row">
      <button type="button" class="btn primary" id="tx-save">${t ? 'Save changes' : 'Add'}</button>
      ${t ? '<button type="button" class="btn danger" id="tx-delete">Delete</button>' : ''}
    </div>
  `, (root) => {
    const amount = $('#tx-amount', root);
    amount.focus();

    // Re-render when the kind changes, so the category list and the pay-stub
    // fields match the kind instead of silently disagreeing with it.
    $('#tx-kind', root).addEventListener('change', (e) => {
      const draft = collectTx(root, t);
      closeSheet();
      openTransactionSheet(t ? { ...t, ...draft, kind: e.target.value } : { ...draft, kind: e.target.value, id: null }, e.target.value);
    });

    $('#tx-save', root).addEventListener('click', async () => {
      try {
        const draft = collectTx(root, t);
        if (parseMoney(draft.amount) === null) throw new Error('Enter an amount.');
        if (t?.id) await actions.editTransaction(t.id, draft);
        else await actions.addTransaction({ ...draft, source: 'manual' });
        closeSheet();
        toast(t?.id ? 'Transaction updated.' : 'Transaction added.', 'good');
      } catch (err) { toast(err.message, 'bad'); }
    });

    const del = $('#tx-delete', root);
    if (del) del.addEventListener('click', async () => {
      if (!confirm(`Delete ${t.merchant} ${formatMoney(t.amountCents)}? This cannot be undone.`)) return;
      try {
        await actions.deleteTransaction(t.id);
        closeSheet();
        toast('Transaction deleted.');
      } catch (err) { toast(err.message, 'bad'); }
    });
  });
}

function collectTx(root, existing) {
  const val = (id) => $(`#${id}`, root)?.value ?? '';
  const out = {
    amount: val('tx-amount'),
    merchant: val('tx-merchant'),
    date: val('tx-date'),
    category: val('tx-cat'),
    kind: val('tx-kind'),
    note: val('tx-note'),
  };
  if (out.kind === 'income') {
    if (val('tx-gross')) out.gross = val('tx-gross');
    if (val('tx-ded')) out.deductions = val('tx-ded');
    if (val('tx-hours')) out.hours = val('tx-hours');
    out.employer = out.merchant;
  }
  if (existing?.docIds) out.docIds = existing.docIds;
  return out;
}

function openBillSheet(prefill = null, existing = null) {
  const b = existing || prefill || {};
  openSheet(existing ? 'Edit bill' : 'Add a bill', `
    <div class="field"><label for="b-name">Name</label>
      <input id="b-name" type="text" value="${esc(b.name || '')}" placeholder="Rent"></div>
    <div class="field-row">
      <div class="field"><label for="b-amount">Amount</label>
        <input id="b-amount" type="text" inputmode="decimal" value="${b.amountCents ? esc((b.amountCents / 100).toFixed(2)) : esc(b.amount ?? '')}"></div>
      <div class="field"><label for="b-freq">Frequency</label>
        <select id="b-freq">${FREQUENCIES.map((f) => `<option value="${f}"${f === (b.frequency || 'monthly') ? ' selected' : ''}>${f}</option>`).join('')}</select></div>
    </div>
    <div class="field-row">
      <div class="field"><label for="b-due">Next due</label>
        <input id="b-due" type="date" value="${esc(b.nextDue || toISODate())}"></div>
      <div class="field"><label for="b-cat">Category</label>
        <select id="b-cat">${catOptions(EXPENSE_CATEGORIES, b.category)}</select></div>
    </div>
    <div class="btn-row">
      <button type="button" class="btn primary" id="b-save">${existing ? 'Save' : 'Add bill'}</button>
      ${existing ? '<button type="button" class="btn danger" id="b-delete">Delete</button>' : ''}
    </div>
  `, (root) => {
    $('#b-save', root).addEventListener('click', async () => {
      try {
        const payload = {
          name: $('#b-name', root).value,
          amount: $('#b-amount', root).value,
          frequency: $('#b-freq', root).value,
          nextDue: $('#b-due', root).value,
          category: $('#b-cat', root).value,
        };
        if (existing) await actions.editBill(existing.id, payload);
        else await actions.addBill(payload);
        closeSheet();
        toast(existing ? 'Bill updated.' : 'Bill added.', 'good');
      } catch (err) { toast(err.message, 'bad'); }
    });
    const del = $('#b-delete', root);
    if (del) del.addEventListener('click', async () => {
      if (!confirm(`Delete the bill "${existing.name}"?`)) return;
      await actions.deleteBill(existing.id);
      closeSheet();
      toast('Bill deleted.');
    });
  });
}

function openBudgetSheet() {
  const existing = store.getData().budgets;
  openSheet('Budgets', `
    <div class="field"><label for="bu-cat">Category</label>
      <select id="bu-cat">${catOptions(EXPENSE_CATEGORIES)}</select></div>
    <div class="field"><label for="bu-amt">Monthly limit</label>
      <input id="bu-amt" type="text" inputmode="decimal" placeholder="400.00"></div>
    <div class="btn-row"><button type="button" class="btn primary" id="bu-save">Set budget</button></div>
    ${existing.length ? `<h3 class="card-title" style="margin:18px 0 8px">Current budgets</h3>
      <ul class="rows">${existing.map((b) => `
        <li class="row" style="cursor:default">
          <div class="row-main">${esc(b.category)}</div>
          <div class="row-amt">${esc(formatMoney(b.monthlyCents))}
            <button type="button" class="icon-btn" data-del-budget="${esc(b.category)}" style="margin-left:8px" aria-label="Remove">✕</button>
          </div>
        </li>`).join('')}</ul>` : ''}
  `, (root) => {
    $('#bu-save', root).addEventListener('click', async () => {
      const cents = parseMoney($('#bu-amt', root).value);
      if (cents === null) { toast('Enter a monthly amount.', 'bad'); return; }
      await actions.setBudget($('#bu-cat', root).value, Math.abs(cents));
      closeSheet();
      toast('Budget set.', 'good');
    });
    $$('[data-del-budget]', root).forEach((btn) => btn.addEventListener('click', async () => {
      await actions.deleteBudget(btn.dataset.delBudget);
      closeSheet();
      toast('Budget removed.');
    }));
  });
}

async function openDocumentSheet(doc) {
  const url = doc.blobKey ? await blobs.blobUrl(doc.blobKey).catch(() => null) : null;
  openSheet(doc.name, `
    ${url ? `<img src="${esc(url)}" alt="${esc(doc.name)}" style="width:100%;border-radius:12px;margin-bottom:14px">` : ''}
    <ul class="breakdown">
      <li><span class="k">Kind</span><span class="v">${esc(doc.kind)}</span></li>
      <li><span class="k">Added</span><span class="v">${esc(formatDate(doc.addedAt.slice(0, 10)))}</span></li>
      <li><span class="k">Size</span><span class="v">${esc(camera.formatBytes(doc.size))}</span></li>
      <li><span class="k">In Dropbox</span><span class="v">${doc.dropboxPath ? esc(doc.dropboxPath) : 'not uploaded'}</span></li>
    </ul>
    <div class="btn-row" style="margin-top:14px">
      <button type="button" class="btn primary" id="d-extract">Have the AI read it</button>
      <button type="button" class="btn danger" id="d-delete">Delete</button>
    </div>
  `, (root) => {
    $('#d-extract', root).addEventListener('click', () => {
      closeSheet();
      goto('chat');
      setTimeout(() => sendChat(`Read the document with id ${doc.id} ("${doc.name}") and record whatever transactions it contains.`), 80);
    });
    $('#d-delete', root).addEventListener('click', async () => {
      if (!confirm(`Delete "${doc.name}"?`)) return;
      await actions.deleteDocument(doc.id);
      closeSheet();
      toast('Document deleted.');
    });
  });
}

let activeCamera = null;

async function openCameraSheet() {
  if (!camera.cameraSupported()) {
    const file = await camera.takePhotoNative();
    if (file) await ingestFiles([file]);
    return;
  }
  openSheet('Take a photo', `
    <div class="camera-stage">
      <div id="cam-mount"></div>
      <div class="btn-row">
        <button type="button" class="btn primary" id="cam-shoot">Capture</button>
        <button type="button" class="btn" id="cam-flip">Flip</button>
        <button type="button" class="btn" id="cam-native">Use system camera</button>
      </div>
      <div class="field">
        <label for="cam-kind">Save as</label>
        <select id="cam-kind">
          <option value="receipt">Receipt</option>
          <option value="paystub">Pay stub</option>
          <option value="other">Other document</option>
        </select>
      </div>
    </div>
  `, async (root) => {
    try {
      activeCamera = await camera.openCamera();
      $('#cam-mount', root).appendChild(activeCamera.video);
    } catch (err) {
      $('#cam-mount', root).innerHTML = `<p class="card-sub" style="color:var(--bad)">${esc(err.message)}</p>`;
      $('#cam-shoot', root).disabled = true;
      $('#cam-flip', root).disabled = true;
    }

    $('#cam-shoot', root).addEventListener('click', async () => {
      if (!activeCamera) return;
      try {
        const blob = await activeCamera.capture();
        const kind = $('#cam-kind', root).value;
        closeSheet();
        const file = new File([blob], `${kind}-${toISODate()}-${Date.now()}.jpg`, { type: 'image/jpeg' });
        await ingestFiles([file]);
      } catch (err) { toast(err.message, 'bad'); }
    });
    $('#cam-flip', root).addEventListener('click', () => activeCamera?.switchCamera().catch((e) => toast(e.message, 'bad')));
    $('#cam-native', root).addEventListener('click', async () => {
      closeSheet();
      const file = await camera.takePhotoNative();
      if (file) await ingestFiles([file]);
    });
  });
}

function openImportSheet() {
  openSheet('Import data', `
    <p class="card-sub">Paste a Cashpilot or Spendwise JSON export, or choose the file. Old Spendwise exports with separate expense and pay-stub lists are converted automatically.</p>
    <div class="field" style="margin-top:12px">
      <label for="imp-text">JSON</label>
      <textarea id="imp-text" rows="7" placeholder='{"transactions": [...]}'></textarea>
    </div>
    <div class="field">
      <label for="imp-mode">Mode</label>
      <select id="imp-mode">
        <option value="merge">Merge with what I have (safe)</option>
        <option value="replace">Replace everything</option>
      </select>
    </div>
    <div class="btn-row">
      <button type="button" class="btn" id="imp-file">Choose a file</button>
      <button type="button" class="btn primary" id="imp-go">Import</button>
    </div>
    <h3 class="card-title" style="margin:20px 0 8px">Export</h3>
    <div class="btn-row">
      <button type="button" class="btn" id="exp-download">Download JSON</button>
      <button type="button" class="btn" id="exp-copy">Copy to clipboard</button>
    </div>
  `, (root) => {
    $('#imp-file', root).addEventListener('click', async () => {
      const [file] = await camera.pickFiles({ accept: 'application/json,.json', multiple: false });
      if (file) $('#imp-text', root).value = await file.text();
    });
    $('#imp-go', root).addEventListener('click', async () => {
      try {
        const res = await store.importJSON($('#imp-text', root).value, { mode: $('#imp-mode', root).value });
        closeSheet();
        toast(`Imported ${res.transactions} transactions. Ledger now has ${res.total}.`, 'good');
      } catch (err) { toast(err.message, 'bad'); }
    });
    $('#exp-download', root).addEventListener('click', () => {
      const blob = new Blob([store.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `cashpilot-${toISODate()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('#exp-copy', root).addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(store.exportJSON()); toast('Copied.', 'good'); }
      catch { toast('Clipboard blocked — use Download instead.', 'bad'); }
    });
  });
}

function openSettings() {
  const settings = store.getSettings();
  const data = store.getData();
  const connected = dbx.isConnected();
  const keySet = anthropic.hasApiKey();

  openSheet('Settings', `
    <h3 class="card-title">Dropbox</h3>
    <p class="card-sub" style="margin-bottom:10px">
      ${connected ? `Connected. Data and files sync to <code>${esc(DBX_ROOT)}</code>.`
        : 'Not connected. Cashpilot works fine without it, but files and multi-device sync need it.'}
    </p>
    <div class="field">
      <label for="s-dbx-key">Dropbox app key</label>
      <input id="s-dbx-key" type="text" value="${esc(settings.dropboxAppKey || '')}" placeholder="abc123xyz">
      <span class="hint">From dropbox.com/developers/apps. Create a Scoped App with full Dropbox access, add
        <code>${esc(dbx.redirectUri())}</code> as a redirect URI, and enable the files.content and files.metadata scopes.
        An app key is public, not a secret.</span>
    </div>
    <div class="btn-row">
      ${connected
        ? '<button type="button" class="btn danger" id="s-dbx-disconnect">Disconnect</button><button type="button" class="btn" id="s-dbx-sync">Sync now</button>'
        : '<button type="button" class="btn primary" id="s-dbx-connect">Connect Dropbox</button>'}
    </div>

    <h3 class="card-title" style="margin:22px 0 6px">AI assistant</h3>
    <div class="field">
      <label for="s-key">Anthropic API key</label>
      <input id="s-key" type="password" placeholder="${keySet ? 'Key saved — type to replace' : 'sk-ant-...'}" autocomplete="off">
      <span class="hint">Stored only in this browser, sent only to api.anthropic.com. Anyone with access to this
        device can read it, so use a key you can revoke at console.anthropic.com. Uses Claude Opus 5.</span>
    </div>
    <div class="btn-row">
      <button type="button" class="btn primary" id="s-key-save">Save key</button>
      ${keySet ? '<button type="button" class="btn danger" id="s-key-clear">Remove key</button>' : ''}
    </div>

    <h3 class="card-title" style="margin:22px 0 6px">Safe-to-spend buffer</h3>
    <div class="field">
      <label for="s-buffer">Hold back each month</label>
      <input id="s-buffer" type="text" inputmode="decimal" value="${esc(((data.settings?.safeToSpendBufferCents || 0) / 100).toFixed(2))}">
      <span class="hint">Subtracted from safe-to-spend so the number you see already has your cushion removed.</span>
    </div>
    <div class="btn-row"><button type="button" class="btn" id="s-buffer-save">Save buffer</button></div>

    <h3 class="card-title" style="margin:22px 0 6px">Data</h3>
    <ul class="breakdown">
      <li><span class="k">Transactions</span><span class="v">${data.transactions.length}</span></li>
      <li><span class="k">Bills</span><span class="v">${data.bills.length}</span></li>
      <li><span class="k">Documents</span><span class="v">${data.documents.length}</span></li>
      <li><span class="k">Last sync</span><span class="v">${store.getSyncMeta().lastSyncAt ? esc(timeAgo(store.getSyncMeta().lastSyncAt)) : 'never'}</span></li>
    </ul>
    <div class="btn-row" style="margin-top:12px">
      <button type="button" class="btn" id="s-import">Import / export</button>
      <button type="button" class="btn" id="s-seed">Load Spendwise data</button>
      <button type="button" class="btn danger" id="s-reset">Erase local data</button>
    </div>
    <p class="card-sub small" style="margin-top:14px">Cashpilot ${esc(document.title)} · everything runs in this browser.</p>
  `, (root) => {
    const connect = $('#s-dbx-connect', root);
    if (connect) connect.addEventListener('click', async () => {
      const key = $('#s-dbx-key', root).value.trim();
      if (!key) { toast('Enter your Dropbox app key first.', 'bad'); return; }
      store.setSettings({ dropboxAppKey: key });
      try { await dbx.beginAuth(key); } catch (err) { toast(err.message, 'bad'); }
    });
    const disconnect = $('#s-dbx-disconnect', root);
    if (disconnect) disconnect.addEventListener('click', () => {
      if (!confirm('Disconnect Dropbox? Your data stays on this device and in Dropbox; they just stop syncing.')) return;
      dbx.clearToken();
      closeSheet();
      toast('Dropbox disconnected.');
      render();
    });
    const syncNow = $('#s-dbx-sync', root);
    if (syncNow) syncNow.addEventListener('click', async () => {
      const r = await store.sync();
      toast(r?.error ? r.error : 'Synced.', r?.error ? 'bad' : 'good');
    });

    $('#s-key-save', root).addEventListener('click', () => {
      const key = $('#s-key', root).value.trim();
      if (!key) { toast('Paste a key first.', 'bad'); return; }
      if (!anthropic.looksLikeApiKey(key)) {
        if (!confirm('That does not look like an Anthropic key (they start with "sk-ant-"). Save it anyway?')) return;
      }
      anthropic.setApiKey(key);
      closeSheet();
      toast('API key saved.', 'good');
      render();
    });
    const clearKey = $('#s-key-clear', root);
    if (clearKey) clearKey.addEventListener('click', () => {
      anthropic.setApiKey('');
      closeSheet();
      toast('API key removed.');
      render();
    });

    $('#s-buffer-save', root).addEventListener('click', async () => {
      const cents = parseMoney($('#s-buffer', root).value) ?? 0;
      await actions.setSetting('safeToSpendBufferCents', Math.abs(cents));
      closeSheet();
      toast('Buffer saved.', 'good');
    });

    $('#s-import', root).addEventListener('click', () => { closeSheet(); openImportSheet(); });
    $('#s-seed', root).addEventListener('click', () => { closeSheet(); void quickAction('load-seed'); });
    $('#s-reset', root).addEventListener('click', async () => {
      if (!confirm('Erase all Cashpilot data on this device? Anything already synced to Dropbox stays there.')) return;
      if (!confirm('Really erase? This cannot be undone.')) return;
      await store.resetLocal();
      closeSheet();
      toast('Local data erased.');
    });
  });
}

// --- toast -------------------------------------------------------------------

function toast(message, tone = '') {
  const host = $('#toast-host');
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), tone === 'bad' ? 7000 : 3600);
}

// --- go ----------------------------------------------------------------------

restoreChat();
boot().catch(showBootError);

// Exposed for the smoke test in tests/smoke.mjs.
window.__cashpilot = { store, actions, A, goto, toast, render };
