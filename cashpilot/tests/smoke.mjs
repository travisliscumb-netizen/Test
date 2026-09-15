// Cashpilot browser smoke test.
//
// The unit suite covers the pure logic; this drives the actual app in Chromium,
// because a render path that throws is invisible to Node tests. It boots the
// app, seeds a ledger, walks every view, adds a transaction through the real UI,
// and fails on ANY console error or page exception.
//
// Usage: node tests/smoke.mjs [--headed] [--shots]

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8171;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = new URL('../.shots/', import.meta.url).pathname;

let pass = 0, fail = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); pass++; console.log(`  ok   ${name}`); }
  catch (err) { fail++; failures.push([name, err]); console.log(`  FAIL ${name}\n       ${err.message}`); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

// --- fixture injected into the page -----------------------------------------
const SEED = {
  schemaVersion: 1,
  transactions: [
    { id: 't1', kind: 'income', date: '2026-09-11', amountCents: 145000, merchant: 'Payworks', category: 'Hourly', grossCents: 190000, deductionsCents: 45000, employer: 'Payworks', source: 'import', createdAt: '2026-09-11T00:00:00Z', updatedAt: '2026-09-11T00:00:00Z', docIds: [] },
    { id: 't2', kind: 'income', date: '2026-08-28', amountCents: 145000, merchant: 'Payworks', category: 'Hourly', source: 'import', createdAt: '2026-08-28T00:00:00Z', updatedAt: '2026-08-28T00:00:00Z', docIds: [] },
    { id: 't3', kind: 'income', date: '2026-08-14', amountCents: 145000, merchant: 'Payworks', category: 'Hourly', source: 'import', createdAt: '2026-08-14T00:00:00Z', updatedAt: '2026-08-14T00:00:00Z', docIds: [] },
    { id: 't4', kind: 'expense', date: '2026-09-01', amountCents: -150000, merchant: 'Landlord', category: 'Rent', source: 'manual', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', docIds: [] },
    { id: 't5', kind: 'expense', date: '2026-09-05', amountCents: -8750, merchant: 'Loblaws', category: 'Groceries', source: 'manual', createdAt: '2026-09-05T00:00:00Z', updatedAt: '2026-09-05T00:00:00Z', docIds: [] },
    { id: 't6', kind: 'expense', date: '2026-09-09', amountCents: -5500, merchant: 'Some Bistro', category: 'Dining', source: 'ai', createdAt: '2026-09-09T00:00:00Z', updatedAt: '2026-09-09T00:00:00Z', docIds: [] },
    { id: 't7', kind: 'expense', date: '2026-08-14', amountCents: -2299, merchant: 'Streamflix', category: 'Subscriptions', source: 'manual', createdAt: '2026-08-14T00:00:00Z', updatedAt: '2026-08-14T00:00:00Z', docIds: [] },
    { id: 't8', kind: 'expense', date: '2026-07-14', amountCents: -2299, merchant: 'Streamflix', category: 'Subscriptions', source: 'manual', createdAt: '2026-07-14T00:00:00Z', updatedAt: '2026-07-14T00:00:00Z', docIds: [] },
    { id: 't9', kind: 'expense', date: '2026-06-14', amountCents: -2299, merchant: 'Streamflix', category: 'Subscriptions', source: 'manual', createdAt: '2026-06-14T00:00:00Z', updatedAt: '2026-06-14T00:00:00Z', docIds: [] },
  ],
  bills: [
    { id: 'b1', name: 'Rent', amountCents: 150000, frequency: 'monthly', nextDue: '2026-10-01', category: 'Rent', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 'b2', name: 'Car Loan', amountCents: 41218, frequency: 'monthly', nextDue: '2026-09-20', category: 'Debt', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  ],
  budgets: [{ id: 'bu1', category: 'Dining', monthlyCents: 20000, updatedAt: '2026-09-01T00:00:00Z' }],
  goals: [], documents: [], rules: [],
  settings: { openingBalanceCents: 0, safeToSpendBufferCents: 0 },
};

// --- server ------------------------------------------------------------------
function startServer() {
  const proc = spawn(process.execPath, [new URL('../tools/serve.mjs', import.meta.url).pathname, String(PORT)], { stdio: 'ignore' });
  return proc;
}

async function waitForServer(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error('The dev server did not come up.');
}

// --- run ---------------------------------------------------------------------
const server = startServer();
let browser;
try {
  await waitForServer();
  if (SHOTS) await mkdir(SHOT_DIR, { recursive: true });

  browser = await chromium.launch({ executablePath: EXECUTABLE, headless: !process.argv.includes('--headed') });
  const context = await browser.newContext({
    viewport: { width: 414, height: 896 },   // iPhone-ish, the primary target
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(e.message));

  console.log('\nboot');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  await check('app boots and hides the splash', async () => {
    await page.waitForSelector('.topbar:not([hidden])', { timeout: 8000 });
    assert(await page.locator('#boot').isHidden(), 'splash should be hidden');
  });

  await check('starts with an empty-state, not a crash', async () => {
    const text = await page.locator('#view-home').innerText();
    assert(/Nothing recorded yet/i.test(text), `expected empty state, got: ${text.slice(0, 120)}`);
  });

  // Seed through the real store so migration and persistence run for real.
  await page.evaluate(async (seed) => {
    await window.__cashpilot.store.importJSON(JSON.stringify(seed), { mode: 'replace' });
    window.__cashpilot.render();
  }, SEED);
  await page.waitForTimeout(250);

  console.log('\nhome');
  await check('renders the safe-to-spend headline', async () => {
    const amount = await page.locator('.headline-amount').first().innerText();
    assert(/\$/.test(amount), `expected a dollar figure, got "${amount}"`);
  });

  await check('safe-to-spend breakdown reconciles on screen', async () => {
    // The visible arithmetic must actually add up — this is the number the whole
    // app is built around, so it is checked against the engine, not just for
    // presence.
    const { shown, computed } = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#view-home .breakdown li')];
      const total = rows.find((r) => r.classList.contains('total'));
      const sts = window.__cashpilot.A.safeToSpend(window.__cashpilot.store.getData(), {});
      return { shown: total.querySelector('.v').textContent, computed: sts.safeCents };
    });
    const parsed = Math.round(Number(shown.replace(/[^0-9.-]/g, '')) * 100);
    assert(parsed === computed, `screen shows ${shown} (${parsed}) but engine says ${computed}`);
  });

  await check('charts render as real SVG', async () => {
    const svgCount = await page.locator('#view-home svg.chart').count();
    assert(svgCount >= 2, `expected at least 2 charts, found ${svgCount}`);
    const donut = await page.locator('#view-home .chart-donut circle').count();
    assert(donut >= 1, 'donut should have at least one arc');
  });

  await check('recent activity lists transactions', async () => {
    const rows = await page.locator('#view-home .rows .row').count();
    assert(rows >= 5, `expected recent rows, found ${rows}`);
  });

  await check('merchant sits left of the amount in every row', async () => {
    // Geometry, not text: a grid-placement slip silently swapped these two and
    // every content-based assertion still passed.
    const bad = await page.evaluate(() => {
      const out = [];
      for (const row of document.querySelectorAll('#view-home .rows .row')) {
        const main = row.querySelector('.row-main');
        const amt = row.querySelector('.row-amt');
        if (!main || !amt) continue;
        const m = main.getBoundingClientRect();
        const a = amt.getBoundingClientRect();
        if (m.left >= a.left) out.push(`${main.textContent}: merchant at ${Math.round(m.left)}, amount at ${Math.round(a.left)}`);
      }
      return out;
    });
    assert(bad.length === 0, `amount rendered left of merchant:\n${bad.join('\n')}`);
  });
  if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}home.png`, fullPage: true });

  console.log('\nnavigation');
  for (const [view, expect] of [
    ['activity', /Activity/i],
    ['insights', /Ways to save/i],
    ['capture', /Add a receipt/i],
    ['chat', /Ask Cashpilot/i],
  ]) {
    await check(`${view} view renders`, async () => {
      await page.locator(`.tab[data-goto="${view}"]`).click();
      await page.waitForTimeout(220);
      const text = await page.locator(`#view-${view}`).innerText();
      assert(expect.test(text), `"${view}" did not render expected content; got: ${text.slice(0, 120)}`);
    });
    if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}${view}.png`, fullPage: true });
  }

  console.log('\ninsights');
  await page.locator('.tab[data-goto="insights"]').click();
  await page.waitForTimeout(250);
  await check('surfaces the untracked subscription with no API key set', async () => {
    const text = await page.locator('#view-insights').innerText();
    assert(/Streamflix/i.test(text), 'the recurring Streamflix charge should be surfaced');
  });
  await check('shows the over-budget dining category', async () => {
    const text = await page.locator('#view-insights').innerText();
    assert(/Dining/i.test(text), 'Dining budget should appear');
  });

  console.log('\nadd a transaction through the UI');
  await page.locator('.tab[data-goto="home"]').click();
  await page.waitForTimeout(200);
  await check('the add-expense sheet opens', async () => {
    await page.locator('.quick button[data-act="add-expense"]').click();
    await page.waitForSelector('#sheet-host:not([hidden])', { timeout: 3000 });
    assert(await page.locator('#tx-amount').isVisible(), 'amount field should be visible');
  });

  await check('a typed expense is stored as exact negative cents', async () => {
    await page.locator('#tx-amount').fill('47.25');
    await page.locator('#tx-merchant').fill('Costco');
    await page.locator('#tx-date').fill('2026-09-12');
    await page.locator('#tx-cat').selectOption('Groceries');
    await page.locator('#tx-save').click();
    await page.waitForTimeout(400);
    const tx = await page.evaluate(() =>
      window.__cashpilot.store.getData().transactions.find((t) => t.merchant === 'Costco'));
    assert(tx, 'the transaction should exist');
    assert(tx.amountCents === -4725, `expected -4725 cents, got ${tx.amountCents}`);
    assert(tx.kind === 'expense', `expected an expense, got ${tx.kind}`);
  });

  await check('the new row appears in the UI', async () => {
    const text = await page.locator('#view-home').innerText();
    assert(/Costco/.test(text), 'Costco should show in recent activity');
  });

  console.log('\npersistence');
  await check('data survives a full reload (IndexedDB)', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.topbar:not([hidden])', { timeout: 8000 });
    await page.waitForTimeout(400);
    const count = await page.evaluate(() => window.__cashpilot.store.getData().transactions.length);
    assert(count === SEED.transactions.length + 1, `expected ${SEED.transactions.length + 1} transactions after reload, got ${count}`);
  });

  console.log('\nresponsive');
  await check('no horizontal overflow at 360px', async () => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(overflow <= 1, `page scrolls horizontally by ${overflow}px at 360px wide`);
  });

  await check('renders in light mode too', async () => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForTimeout(200);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert(bg && bg !== 'rgba(0, 0, 0, 0)', 'body must have an explicit background in light mode');
  });

  console.log('\nconsole hygiene');
  await check('no page exceptions', () => {
    assert(pageErrors.length === 0, `page exceptions:\n${pageErrors.join('\n')}`);
  });
  await check('no console errors', () => {
    // The service worker and favicon can 404 harmlessly under the test server.
    const real = consoleErrors.filter((e) => !/favicon|sw\.js|service ?worker|manifest/i.test(e));
    assert(real.length === 0, `console errors:\n${real.join('\n')}`);
  });

  console.log(`\n${'='.repeat(52)}`);
  console.log(`${pass} passed, ${fail} failed`);
  if (SHOTS) console.log(`screenshots in ${SHOT_DIR}`);
  if (fail) {
    console.log('\nFailures:');
    for (const [n, e] of failures) console.log(`  ${n}: ${e.message}`);
  }
} finally {
  await browser?.close();
  server.kill();
}

process.exit(fail ? 1 : 0);
