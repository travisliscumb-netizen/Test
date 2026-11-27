# Results — what was tested, measured, and not

Status labels: **verified** (run and passed here), **synthetic** (simulation
of a modelled night), **needs the phone / the field** (cannot be done here).

## Route data — verified

| Check | Result |
|---|---|
| Source | Gmail, from the dispatcher, "ROUTE NOV 23/26", 2026-11-23 20:23:56 UTC; no later correction found |
| Rows parsed from the email's HTML table | 162 (plain-text body hard-wraps notes; the table is authoritative) |
| Every stored row byte-identical to its source row, in order | 162/162 |
| First / last stop match the known endpoints | yes / yes |
| Notes preserved verbatim (exact substrings) | 18/18 |
| Matched to a City of Barrie address point | 162/162 |
| Parcel polygon | 162/162 |
| 2016 driveway polygon mapped | 156/162 |
| Clean (no open data issue) | 152/162 |
| Sealed file decrypts to exactly the dataset | yes (sha256 checked) |
| Route address, row, note or key anywhere in 64 public/source files | none |

Open items (all shown in the app on the stop, for field confirmation):
6 stops without a 2016 driveway polygon (street-front point used); 2 corner
lots where the driveway street is ambiguous (#32, #141 — one-tap confirm on
the stop sheet); 1 stop whose note says two driveways but only one is mapped
(#116); 1 deep gravel lot whose address point is 70 m from the street (#3 —
checked on imagery, correct).

Corrections found against earlier work: the street is **Marion Crescent**
(the only "Marion" in Barrie — the summer app's "Marion St" was wrong); the
City spells "North Park" as NORTHPARK and "Bennett" as BENNET. Several
driveways are on the side street of corner lots (e.g. #156's driveway is on
Marion Cres, consistent with Ted placing it between Marion stops).

Method: City address point → parcel → driveway polygon by area overlap →
entrance on the street the polygon actually reaches; every stop reviewed on
the City's 2023 10 cm orthophoto with labelled street lines. Sol 6.2's
house-number file was found to be the same City layer, so it was **not**
counted as independent corroboration.

## Software — verified

| Suite | Result |
|---|---|
| Unit tests (parser, geometry, GPS filter, routing, event log, optimizer, plow model, windrow, ETA, crypto incl. PIN wrap, copilot, feeds) | **52/52** |
| Browser end-to-end, local build, iPhone SE / 14 / 15 Pro Max / 14 landscape | **20/20** (incl. PIN pad: right PIN opens, wrong PIN refused) |
| Same suite against the **live deployment** | **18/18** |
| Live: full reload with the network cut (service worker) | opens in Drive mode, 162 stops, progress intact, DONE works |
| Integrity verifier | **8/8** |

The end-to-end suite covers: PIN pad (right PIN opens in ~0.4 s and is not asked again; wrong PIN refused, nothing revealed); wrong key refused; key removed from URL;
DONE/UNDO persisted across reload; double-bounce; defer/blocked return list;
street observation; offline commits and honest feed labels; arrival detection
from injected GPS; inaccurate-fix pause; all park tabs; corner-lot
confirmation; backup export/import; damaged route file refused; every control
inside the viewport and no sideways scroll on every tab and device.

## Performance — verified here (headless Chromium in a container)

| Measure | Result |
|---|---|
| Boot to preflight (local / live, cold) | ~0.25–0.3 s / 0.76 s |
| DONE tap → next stop in the DOM (incl. IndexedDB write) | 8–15 ms |
| Full HUD render | ~3 ms |
| Street-block plan analysis | 0.1 s (was 62.8 s before a fix found by testing) |
| 162×162 network distance matrix | 29 ms |
| App code / map engine / styles (gzip) | 31 KB / 285 KB / 15 KB |
| Offline data: road network / sealed route (gzip) | 224 KB / 335 KB |

**Needs the phone:** real frame rate, battery drain per hour, IndexedDB write
latency on Safari, thermal behaviour in cold.

## Simulation — synthetic

`tools/simulate.mjs` runs the real engine over the real route geometry
against a model of a night (noisy GPS with jumps and dropouts, working up and
down each driveway, forgotten taps, blocked driveways, City sweeps with salt
passes overwriting the feed, restarts). It shows the engine behaves as
designed **under the model**. It is not field evidence.

| Measure (8–10 nights per run) | Result |
|---|---|
| Stop marked done without a tap | 0 (by design) |
| State after replaying a shuffled, duplicated event log | identical, every night |
| False "mark it done?" prompts | 0 in 1,296 driveways (was several per night before the property-aware redesign) |
| Forgotten taps caught | 65–69 % (was ~27 % before) |
| Finish forecast, median absolute error | night 1: 8–17 min → night 8: 3–8 min; actual finish inside the 80 % range 88–100 % of checks |
| Windrow watch | recall 100 % (by model construction), precision 75–85 % (salt passes look like plow passes in the feed) |
| Street-block plan made at shift start (≥ 3 storms recorded) | median 0 % change in re-clears across 10 seeds (range −4 % … +42 %) |
| Live re-plan when City crews are seen starting | fewer re-clears in 9 of 10 seeds (7–31 %, one −4 %), costing 12–31 extra minutes per night |

Plain reading: the City's start time is the dominant unknown. Planning at
shift start rarely helps; re-planning when crews are actually seen helps in
the model, partly by simply deferring streets the City has not reached yet.
Whether Barrie's sweeps are consistent enough to learn is **unknown** until
storms are recorded.

## Comparison with Sol 6.2 (snow-route-pro-2.vercel.app)

Its route data is behind a PIN on its own server, so only its public code
could be examined; its route data, flows and speed could **not** be measured.

| | Sol 6.2 (from its public bundle) | ASTRA |
|---|---|---|
| Map | Leaflet, raster tiles | MapLibre GL vector; heading-up 2.5D; basemap from City roads bundled offline |
| Stop location | City address points | address point → parcel → driveway entrance, visually reviewed |
| Paths between stops | public OSRM demo server | own network on City centrelines, offline |
| Route protection | 4-digit PIN on a server | 256-bit key, no server, data unreadable without it |
| Progress | events synced to its server | event log on the phone, export/import backup |
| City data | via its server; history on the phone | direct; history on the phone; collector ready |
| "Plowed" | not determinable from the bundle | always "serviced (plow or salt)" unless the driver confirms |
| Prompts | spoken stop and note | property-aware arrival/leaving, forgotten-tap detection, never auto-completes |

## Not done

- Field use. Everything in `FIELD-TEST.md` is unverified until then.
- Background collector is written and tested but **not active** (needs
  permission to add a workflow to `main`, or a private repository).
