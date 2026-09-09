# Ted's Route

A personal route command centre for a one-truck lawn maintenance day. It runs
on one iPhone, works with no signal, and gets better at predicting the day the
more the day is worked.

It is a static site. No build step, no bundler, no framework, no backend, no
accounts. Open `index.html` and it runs.

---

## What it does

Open the phone and the screen answers, in this order:

1. **When do I finish** — a predicted finish time with an honest range that
   widens when the remaining stops have little history.
2. **What is next** — one property, with its standing instructions, its usual
   service time, the distance to it, and Navigate and Done a thumb apart.
3. **How far through am I** — progress, pace against a normal day of this
   weekday, and what is left.

Everything else is a tap away: the full route with drag reordering, a real map
of the day's spatial state, and what the app has learned.

### The parts that matter

- **Local-first.** Every property, completion, note and learned timing lives in
  IndexedDB on the device. There is no server to be offline from.
- **Learns real service times.** The only thing a phone can record is *when
  Done was tapped*, so service time is recovered from the gaps between taps,
  with travel subtracted and batched taps split by prior rather than recorded
  as zero-minute lawns. Estimates are shrunk toward the day average until
  there is enough evidence to justify a property's own number.
- **Optimises for the finish time**, not the distance — respecting pinned
  stops, time windows parsed out of the operator's own notes ("after 9am",
  "Thursdays after 11am so gate open"), and a stability cost so the route does
  not churn for a trivial theoretical gain. The master order is never
  destroyed and can be restored in one tap.
- **Explains itself.** "Reordering the remaining 11 stops saves about 18
  minutes; 14 minutes of it is less driving; the current order doubles back at
  14 Sorrelwood Place."
- **Refuses to guess.** A 190 m GPS fix will not suggest that you are standing
  on a particular lawn, and it says so rather than going quiet.
- **Backup that means something.** One tap writes a checksummed file. A restore
  is parsed, validated, counted and summarised before a single byte of the
  device's data is touched, and a damaged or foreign file is refused with the
  specific reason.

---

## Your route data is not in this repository

The route is 238 real addresses, their service notes and a season of service
history — customer data. This repository is private, and the program is still
built so that it never needs to hold any of it.

So the program is here and the data is not. On first run the app asks for a
route file, which you keep in Files or iCloud and select once. After that it
lives on the phone.

See [`docs/DATA-PRIVACY.md`](docs/DATA-PRIVACY.md).

To try the app without any real data, first run offers a **demo route**: 32
invented properties around Barrie with six weeks of synthetic history, so every
feature — learning, optimisation, the map, insights — works immediately.

---

## Getting it on the phone

It is deployed from this branch on every push:

**https://operation-blackgate-2-git-claude-teds-route-reb-786137-travis16.vercel.app**

Open that in Safari, then **Share → Add to Home Screen**. That gets the
standalone shell, the offline cache, and a better chance of Safari granting
protected storage. Then restore your route file once.

The URL is unlovely because the Vercel project this repository was already
linked to is named after an earlier project. Renaming the project in its Vercel
settings changes the hostname.

> **The production branch is `main`.** This branch deploys to a preview URL, and
> nothing has ever deployed `main`. Pushing to `main` while it still holds the
> old `index.html` would publish that file — and the customer addresses in it —
> to the production URL. Merging this rebuild into `main` removes that hazard.

### Running it locally

```
node tools/serve.mjs                  # source tree,  http://127.0.0.1:8099
node tools/build.mjs                  # build to dist/
SERVE_ROOT=dist node tools/serve.mjs  # the built artifact
```

### Tests

```
node tests/unit.mjs                                       # 41 tests, no browser
BUNDLE=<route.json> node tests/e2e.mjs                    # full workflows in Chromium
BUNDLE=<route.json> SERVE_ROOT=dist node tests/e2e.mjs    # against the built artifact
BUNDLE=<route.json> BASE_URL=<origin> node tests/e2e.mjs  # against a deployed origin
```

Both trees pass 26/26: the bundle is verified as what ships, not assumed
equivalent to the source.

`tests/unit.mjs` covers the statistics, service-time derivation, the travel
metric, the optimiser, time handling and backup validation — all of it pure,
all of it runnable in Node. `tests/e2e.mjs` drives the real interface on a
phone-sized viewport through the workflows that actually happen: rapid
completion, reload recovery, going offline, restoring a corrupt file, dragging
a stop, denied GPS, an inaccurate fix, the 48-stop day, both themes and
reduced motion.

---

## Layout

```
index.html              shell
sw.js                   offline cache: app shell + map tiles
app/
  core/                 geometry, time — pure, no DOM
  data/                 IndexedDB, schema, store, backup/restore, demo data
  learning/             robust statistics, service-time derivation, forecasting
  routing/              travel metric, optimiser
  services/             geolocation, navigation handoff, weather, insights
  ui/                   DOM helpers, motion system, map engine, screens
  styles/               design tokens, components
tools/                  static server, bundle builder
tests/                  unit and end-to-end suites
```

The boundaries are real: `core`, `data`, `learning` and `routing` have no
reference to the DOM and are tested in Node. Screens read a context object and
call actions on it; they never touch the database and never recompute a model.
That is what would let a later rebuild put a sync engine underneath without
rewriting a screen.

---

## Deliberate omissions

No accounts, no cloud sync, no admin portal, no crew management, no device
enrolment, no Firebase. The data model carries stable ids and `updatedAt` on
every record and writes an append-only event log, which is what a later
multi-device merge would need — but none of that machinery is in this version,
because none of it makes the workday better today.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for why each significant
choice was made, including the ones that went against the obvious answer.
