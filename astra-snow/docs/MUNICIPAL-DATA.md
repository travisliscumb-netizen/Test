# City of Barrie winter-operations data — what it is, verified

Everything here was checked against the live services on 2026-11-26, not
taken from earlier notes. Where something could not be verified, it says so.

## The services

| Layer | URL | What it holds |
|---|---|---|
| Road segments | `services3.arcgis.com/C964zBpHgJUpj4d0/…/BarrieRoadSegments_View/FeatureServer/0` | 3,292 polylines (EPSG 26917 natively). Static attributes plus `LASTSERVICED`. |
| Vehicle points | `…/BarriePlowLocations_View/FeatureServer/0` | `VEHICLEID`, `DATETIME`, point. View filter `DATETIME IS NOT NULL`. |
| Public app | ArcGIS Experience "City of Barrie Plow Tracker Map 2024" (owner BarrieGIS), web map "Roads Plow Map 2.0" | The two layers above, plus a sidewalk layer (`TrackMyPlowSIDEWALKSegments`). |

Both layers are public, query-only, allow CORS from any origin, and need no
key. The phone queries them directly; there is no proxy server.

Licence text on both items: *"© Copyright City of Barrie. The City of Barrie
does not warrant the accuracy, completeness, content, or currency of the
information provided."* Access credit: "City of Barrie and Esri Canada".

## What `LASTSERVICED` means — and does not

The City's own description of the road layer: *"the last time a city road was
plowed **and/or treated (brine, salt)**"*; of the public app: *"plowed **OR**
treated (brine, salt, sand)"*.

- It is **one timestamp per segment, overwritten** by each pass. The service
  keeps no history (oldest value present on 2026-11-26: 2026-11-16).
- It **does not say whether a pass plowed or salted.** Nothing in either layer
  distinguishes plowing, salting, sanding, brining, pre-treatment, or a truck
  driving past with the blade up. There is no vehicle type field.
- Only 1,634 of 3,292 segments had any value on 2026-11-26.

ASTRA therefore never says "plowed" on the strength of the feed. It says
**"serviced (plow or salt)"** until the driver confirms the street with the
STREET button.

## Attributes nobody was using

The road layer carries the City's own route assignment for every segment:

| Field | Meaning (from alias) | Values |
|---|---|---|
| `PLOWCLASS` | plow priority class | PRIORITY 430, SECONDARY 972, RESIDENTI 1,890 |
| `PLOWROUTE` | plow route number | 1–19 |
| `SALTSANDROUTE`, `BRINEROUTE` | treatment routes | (empty in the view) |
| `ONEWAYDIR` | one-way | **"B" on every segment** — cannot be trusted for one-way streets |

Almost every residential street on the current route is **City plow route 3**
(151 segments city-wide). That is the unit whose behaviour matters most.

## Observed behaviour

- **Road layer update cadence:** edited in near real time during operations
  (last edit 17:14 UTC on a dry afternoon; priority roads serviced minutes
  earlier).
- **Vehicle layer:** its edit timestamp ticked every ~5–7 minutes for 40
  minutes of sampling while it held **zero** vehicles — even though roads had
  been serviced at 17:14 UTC. Vehicle points therefore appear to be retained
  only briefly (≤ ~15 min). **Not yet confirmed during an active storm.**
- **The Nov 23–24 storm:** ECCC Egbert CS (closest active station) recorded
  1.5 mm precipitation on Nov 23 and 5 mm on Nov 24 with **10 cm on the
  ground**. City residential service times cluster 02:00–09:00 UTC
  (21:00–04:00 local). Of route 3's 151 segments only 66 carry any time.
  Consistent with City policy (residential plowing at ≥ 8 cm), partial
  residential service is plausible; whether unrecorded segments were plowed by
  equipment without telemetry is **unknown**.
- **Model weather is not good enough:** Open-Meteo's model showed **no
  snowfall at all** for those days. ASTRA uses ECCC radar and station
  observations instead.

## City policy (barrie.ca, winter maintenance pages)

- Priority and secondary roads: serviced at ≥ 5 cm, cleanup ~8 h after
  snowfall ends.
- Residential roads: plowed at ≥ 8 cm; target 12–24 h after snowfall ends.
- Telemetry: GeoTab AVL on City **and contractor** units, processed by ArcGIS
  GeoEvent Server (Esri Canada case material). Sidewalk machines historically
  had no GPS.

Operational meaning: City residential plowing often lands **after** a night
driveway route — the source of windrows across cleared driveways.

## Weather sources

| Source | Use | Licence |
|---|---|---|
| ECCC GeoMet `RADAR_1KM_RSNO` (WMS) | map overlay; point query = **snowfall rate in cm/h at the tractor**, 6-minute scans | Open Government Licence – Canada |
| ECCC SWOB real-time | air temperature from the nearest station, with observation time | OGL – Canada |

GeoMet intermittently fails a request outright (about 1 in 4 in testing), and
those failures carry no CORS header. The app retries once and otherwise shows
"unavailable".

## Building our own history

The City keeps none, so ASTRA records it:

1. **On the phone** — every 75 s while open: new `(segment, time)` service
   events and vehicle points into IndexedDB. Storm nights are exactly when the
   phone is open, so this captures the nights that matter, including vehicle
   tracks at fine resolution.
2. **Background collector** — `tools/collect.mjs` appends only new
   observations to monthly NDJSON files and writes `history.json`, which the
   app imports (SYSTEM → RESTORE BACKUP / IMPORT CITY HISTORY). A ready
   GitHub Actions workflow is in `ops/astra-intel.workflow.yml`.
   **It is not active:** GitHub runs schedules only from the default branch,
   which needs the owner's permission. It costs nothing on a public repository,
   but it would republish City data publicly; a private repository is the
   better home for it.

A 15-minute background cadence captures essentially every street-service
event; it will **not** capture vehicle tracks (points appear to live
≤ ~15 min). Vehicle tracks come from the phone during shifts.

## What could improve the data

- Ask the City (Service Barrie / GIS) whether a history or a pass-type field
  can be published, and whether all residential contractor units report AVL.
- Driver observations (STREET button) are the only ground truth for
  "actually plowed" — they accumulate with every shift.
