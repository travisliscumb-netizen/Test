# ASTRA — architecture and decisions

## The problem, restated from first principles

One operator, one tractor, one iPhone, ~162 driveways a night, in the dark,
gloved, often at 2–6 a.m. The costs that matter, in order:

1. **A missed or wrongly marked driveway** (customer harm). Nothing may be
   marked done except by the operator; nothing may be lost on a crash.
2. **Re-clearing** a driveway after the City plow leaves a windrow.
3. **Attention**: every glance and tap while operating is a cost.
4. **Driving** between stops — the smallest of the four (see below).

## Measured before designing

- Ted's order covers **13.17 km** of street on the City network. Unconstrained
  local search finds **11.45 km** — 8.6 minutes of tractor driving in a
  ~10 h night (~1.6 %). With even a 2-minute cost per broken dispatcher
  adjacency, **no change is worth making.** A shortest-distance "optimize"
  button would add risk for almost no gain, so ASTRA does not have one.
- The real lever is **timing relative to City plows** — see the simulation
  results in `RESULTS.md`.

## Concepts considered

| Concept | Idea | Verdict |
|---|---|---|
| A. Instrument HUD | one live instrument: map above, one decision below | **core of the work screen** |
| B. Audio-first copilot | spoken cues, glanceable screen | **merged into A** (voice + tones + haptics) |
| C. Mission control | rich parked planning/analysis | **the MENU** (tabs) |
| D. Route ribbon | linear tape of stops, map secondary | rejected as primary — loses spatial context at corners and blocks; kept as the progress strip |
| E. Native iOS app | background GPS, CarPlay, real haptics | rejected for now — needs Xcode, a Mac and a $99/yr developer account; cannot be built or shipped from here. PWA first; revisit if field tests show background GPS matters |

## Delivery: installable web app (PWA)

What iOS Safari actually provides (feature-detected, never assumed):
geolocation while visible; Screen Wake Lock (iOS 16.4+, home-screen apps more
reliably from 18.4); IndexedDB with `storage.persist()`; Web Speech
synthesis; Web Audio; offline service worker. **Not available:** background
geolocation, `navigator.vibrate`, push without a server. Haptics use the iOS 18
`<input type=checkbox switch>` behaviour inside taps. All of these need
confirmation on the actual phone (`FIELD-TEST.md`).

## Module map

```
src/core/      geo (local-plane geometry), kalman (GPS filter), graph (routing), crypto (sealing)
src/data/      schema, route-parse (data-driven against the City street list),
               events (event-sourced shift log), db (IndexedDB)
src/intel/     city (ArcGIS feeds), model (operations, intel, windrow, plan penalty), weather (ECCC)
src/routing/   eta (learning finish forecast), optimize (Or-opt / 2-opt / street-block search)
src/copilot/   copilot (proximity state machine), feedback (voice, tones, haptics)
src/ui/        app (controller), view (all screens), map (MapLibre), dom
tools/         fetch-roads, build-route, contact-sheet, seal, verify-integrity, collect, simulate, postbuild
```

## Key decisions and why

**Route data is sealed; a PIN is the owner's convenience choice.** The
repository is public. The route (addresses, notes, parcels, driveways) is
published only as AES-GCM-256 ciphertext under a random 256-bit key, which the
phone keeps in IndexedDB after the first unlock. It can reach the phone two
ways: the original link (`#k=…` fragment, never sent to a server; strong), or
a 4-digit PIN that unwraps the key (PBKDF2-SHA256, 600,000 iterations). The
owner chose the PIN after the link proved hard to deliver. **Trade-off,
stated plainly:** 10,000 PINs can be tried offline against the public file in
minutes, so with the PIN enabled the route is protected from casual viewers
only. Stronger options, if wanted later: a longer passphrase, or a private
repository plus a server-checked PIN with rate limiting. No server, no
account, works offline.

**Event-sourced progress.** Every action is an immutable event; state is a
pure fold. Reload/crash loses nothing written; duplicates are idempotent; undo
is an event (and undoable). The dispatcher's order is never mutated — a plan is
an overlay event, revertible in one tap. The screen updates at once and the
write runs concurrently; a failed write rolls back loudly ("NOT SAVED").

**Geocoding to the driveway, not the house.** City address point → parcel →
2016 driveway polygons assigned by area overlap → the driveway's street
entrance (the polygon edge nearest the street it actually touches). Corner
lots that the data cannot settle are marked and confirmed in the field.
Every stop was checked visually over the City's 2023 10 cm orthophoto.

**A basemap built from the City's own roads.** MapLibre GL renders the City
road network (bundled, 250 KB gz) — no tile server, works with no signal,
labels in vendored OFL glyphs. City 2023 imagery and ECCC radar are optional
overlays. Live service status is applied as per-segment feature-state.

**Presence is judged against the property.** The copilot uses the parcel and
driveway polygons, so working 60 m up a long driveway is not "leaving". It
never completes a stop; it asks. Forgotten taps are caught both when the
tractor drives off and when it starts the next driveway.

**Plow intelligence in three labelled tiers** — observed (City time + driver
observation), historical (needs ≥ 3 recorded storms), policy prior — never
blended silently. Plow-risk planning requires positive snow evidence (a City
operation **and** radar snow).

**Plans are advisory and street-level.** The optimizer keeps Ted's order inside
each street and only moves or reverses whole streets, with a stability cost
per broken adjacency. It never applies itself.

## Costs

| Item | Cost |
|---|---|
| Hosting (static) | $0 (existing Vercel account, preview of this branch) |
| City and ECCC data | $0, no keys |
| Background collector (optional) | $0 on GitHub Actions for a public repo; not enabled |
| Native iOS (not built) | $99/yr Apple developer + a Mac |

No subscriptions were purchased or enabled.
