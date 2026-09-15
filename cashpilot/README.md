# Cashpilot

Personal finance tracking with an AI copilot, your receipts, and your Dropbox.

A static, offline-capable PWA. No server, no build step, no monthly bill. Your
Dropbox is the backend; your Anthropic API key is the AI.

---

## What it does

- **Track** income, expenses and transfers, with pay-stub detail (gross,
  deductions, hours) on the income rows themselves.
- **Capture** receipts and pay stubs — take a photo in-app, upload files, drag
  and drop, or drop them into Dropbox from your phone.
- **Ask an AI** to do the work: *"log $47 of gas yesterday"*, *"process my
  Dropbox inbox"*, *"recategorize all Costco to Groceries"*, *"what can I cut?"*
  It reads your ledger, writes to it, reads your receipt images, and files them.
- **Analyse**: safe-to-spend, category and merchant breakdowns, monthly trends,
  60-day cash-flow forecast, budget pace, recurring-charge detection, spending
  anomalies, and a ranked list of concrete savings ideas.
- **Sync** across iPhone and desktop through Dropbox, with a real merge (not
  last-writer-wins).

Everything except the AI works with no API key and no network.

---

## Setup

### 1. Host it

Any static host. It is already configured for Vercel:

```bash
cd cashpilot
npx vercel deploy --prod
```

It **must** be served over HTTPS. The camera, service worker, and Dropbox OAuth
all require a secure context.

To run locally:

```bash
npm install
npm run serve     # http://localhost:8123
```

### 2. Connect Dropbox (optional but recommended)

1. Go to <https://www.dropbox.com/developers/apps> → **Create app**
2. Choose **Scoped access** → **Full Dropbox** → name it `Cashpilot`
3. On the app's **Settings** tab, add your deployed URL as a **Redirect URI**
   (e.g. `https://cashpilot.vercel.app/`). Add `http://localhost:8123/` too if
   you want to develop locally.
4. On the **Permissions** tab, enable:
   `account_info.read`, `files.metadata.read`, `files.metadata.write`,
   `files.content.read`, `files.content.write` — then **Submit**.
5. Copy the **App key** into Cashpilot → Settings → Dropbox, and press Connect.

The app key is *not* a secret — this uses OAuth with PKCE, which is exactly what
makes a server-free app possible.

Cashpilot then creates and uses only these folders:

```
/Cashpilot
├── data.json      ← your ledger (the sync source of truth)
├── Inbox/         ← drop receipts here from your phone
├── Receipts/      ← filed by year-month
├── Paystubs/
├── Reports/       ← anything the AI writes for you
└── Archive/
```

It never reads or writes anything outside `/Cashpilot`.

### 3. Connect the AI (optional)

Get a key at <https://console.anthropic.com> and paste it into
Settings → AI assistant. It uses **Claude Opus 5**.

Read the security note below first.

### 4. Add to your home screen

Open the URL in Safari on iPhone → Share → **Add to Home Screen**. It then runs
full-screen like a native app, works offline, and the camera button opens the
real camera.

---

## Security model — read this

**Your Anthropic API key is stored in this browser's `localStorage` and sent
directly from your phone to `api.anthropic.com`.**

This is a deliberate, documented mode (the Anthropic SDK calls it
`dangerouslyAllowBrowser`), and Anthropic's own guidance says it is reasonable
for *internal tools with trusted users*. A single-user personal finance app on
your own phone is that case. But be clear about what you are accepting:

- Anyone with access to your unlocked device, or to the browser's dev tools on
  it, can read the key.
- Any script running on the page could exfiltrate it. Cashpilot loads **zero**
  third-party scripts and ships a strict CSP (`script-src 'self'`) to keep it
  that way — but that guarantee only holds if you don't add any.
- The key is never sent anywhere except `api.anthropic.com`.

**Mitigations you should actually use:**

1. Create a **separate API key** for Cashpilot so you can revoke it alone.
2. Set a **monthly spend limit** on it in the Anthropic Console.
3. Revoke it at <https://console.anthropic.com> if the device is lost.

If that tradeoff isn't acceptable for you, the alternative is a backend that
holds the key server-side. That is a different architecture with a different
cost, and it is the right call the moment this stops being a single-user tool.

**Dropbox** is scoped to a single folder and enforced in code
(`dropbox.js: assertInRoot`), not by prompt wording. The AI physically cannot
reach the rest of your Dropbox, and there is deliberately **no delete tool** —
"get rid of this file" is implemented as a move to `Archive/`.

Every write the AI makes is recorded in an audit log, visible under
**Insights → What the AI changed**.

---

## Architecture

| Module | Responsibility |
|---|---|
| `config.js` | Every tunable constant |
| `util.js` | Money (integer cents), dates, formatting |
| `model.js` | Data shapes, validation, migration — no browser APIs, fully testable |
| `analytics.js` | All computation: summaries, forecast, recurring detection, anomalies |
| `insights.js` | Deterministic savings-idea engine (works with no API key) |
| `charts.js` | Hand-rolled SVG charts, no dependencies |
| `store.js` | State, IndexedDB persistence, Dropbox sync and merge |
| `actions.js` | The single mutation API used by both the UI and the AI |
| `dropbox.js` | OAuth PKCE + file API, path-scoped |
| `anthropic.js` | Messages API client, image downscaling |
| `tools.js` | The AI's tool surface |
| `agent.js` | The tool-use loop |
| `app.js` | UI |

### Decisions worth knowing

**Money is integer cents, everywhere.** Never floats. `0.1 + 0.2 !== 0.3`, and a
ledger that drifts a cent per transaction is worthless. The `amount` (dollars)
and `amountCents` (cents) input fields never share a code path — conflating them
multiplies every round-tripped value by 100.

**Income and expenses are one table.** Pay-stub detail lives on the income row
rather than in a parallel `paystubs` table joined back in. A separate table is
the standard way to end up double-counting income.

**A bare positive number is an expense.** Models and people both write `47.25`
for a purchase far more often than for a deposit, so sign alone never flips a row
to the income side.

**Sync merges, with tombstones.** Rows are unioned by id, newest `updatedAt`
wins, and deletions are carried as dated tombstones. Without tombstones, a row
deleted on the phone is merely *absent* from that side and the desktop copy
silently resurrects it.

**Safe-to-spend is an income-and-obligations model, not a balance.** There is no
bank connection, so it answers "of the money this month will bring in, how much
isn't already claimed?" Every component is shown on screen so you can see the
subtraction rather than trusting a number.

**The daily-spend estimate is a winsorized mean.** A plain mean lets one $9,000
car repair add ~$100/day to every day of the forecast; a median is worse, because
most days have zero spending so the median is $0 and the forecast predicts no
spending at all. Days are capped at the 90th percentile *of days that had
spending*, then averaged. The uncapped mean is shown alongside as the
conservative bound.

**No CDN, no build step.** Charts, storage and the API client are hand-rolled so
the app works fully offline and the CSP can stay at `script-src 'self'`.

---

## Verification

```bash
npm test         # 78 assertions: money, dates, validation, analytics, insights, sync merge, agent tools, seed data
npm run smoke    # 23 assertions: boots real Chromium, drives the real UI
```

`npm test` covers the pure logic. `npm run smoke` launches Chromium, boots the
app, seeds a ledger, walks every view, adds a transaction through the actual
form, reloads to prove IndexedDB persistence, checks for horizontal overflow at
360px, and **fails on any console error or page exception**.

Add `--shots` to write screenshots of every view to `.shots/`, or `--headed` to
watch it run.

Both suites are offline and cost nothing — no API key, no network.

---

## Your starting data

The 9 Payworks pay stubs (22 May – 11 Sep 2026) and 4 bills from the old
Spendwise build are carried over in `src/seed.js`. Load them from the empty
state or Settings → **Load Spendwise data**. It goes through the ordinary import
path, so running it twice is harmless.

| | |
|---|---|
| Pay stubs | 9, biweekly, net $1,197.26 – $1,464.79 (total $12,307.83) |
| Gross | $16,852.35 · deductions $4,544.52 |
| Bills | Rent $1,400/mo · BMO car loan $274.90 biweekly · Travelers $153.33/mo · Rogers $126/mo |
| Fixed monthly total | $2,274.95 |

**Verify these against your real pay stubs.** Every stub deducts 26.91–26.99% of
gross — effectively a flat 27%. Real Canadian payroll does not behave that way:
CPP and EI stop at their annual maximums part-way through the year and income tax
is progressive, so the rate should drift across May–September rather than holding
constant. The figures are internally flawless (gross − deductions = net to the
cent, hours × rate = gross exactly, a perfect 14-day cadence) — and that
flawlessness is itself the tell that they may have been generated rather than
read off real stubs.

Three bills (Rent, Travelers, Rogers) had **no due date** in the source. The app
defaults them to the 1st of next month and tells you so on load. Due dates move
the safe-to-spend figure, so correct any that are wrong.

## Importing your old Spendwise data

Settings → Import / export. Paste a Spendwise JSON export (or choose the file).
Old exports with separate `expenses` and `paystubs` arrays and float dollars are
converted automatically: amounts become integer cents, pay stubs fold into income
rows, and the legacy arrays are dropped so nothing is double-counted.

Import defaults to **merge**, which is safe to run twice — rows de-duplicate by
id.
