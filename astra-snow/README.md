# ASTRA — night snow-operations system

One tractor, one route, one iPhone, in the dark. ASTRA shows the next
driveway and its notes, takes one big DONE per driveway, keeps every tap safe
through crashes and dead zones, watches the City's plows and the snow radar,
and learns how long the night will take.

It is a separate app from the existing deployments, which are untouched.

## Put it on the phone

1. Open the app's address in **Safari** on the iPhone and enter the
   **route PIN** on the keypad (given privately, not written anywhere in this
   repository).
2. **Share → Add to Home Screen.** Open ASTRA from the home screen from then
   on (better storage protection, screen wake lock, full screen).
3. The phone now keeps the route key itself: the PIN is needed again only if
   Safari's website data is cleared. The original unlock link (`#k=…`) still
   works as an alternative.

## A night with ASTRA

- **Preflight** checks the route (162/162, integrity hash), storage, GPS,
  City feed, radar and sound. Tap **ENABLE GPS**, then **BEGIN SHIFT**.
- **Drive mode**: the map turns with the tractor; the panel shows the next
  stop number, address, and the dispatcher's note word for word (amber), the
  City's status for that street, and the next two stops.
  - **DONE** — the only way a driveway is ever marked done. 7-second UNDO bar.
    A double-bounce within 0.7 s counts once.
  - **STREET PLOWED?** — tap to cycle plowed / not plowed / not sure. Your
    answer is saved with the next DONE and carries to the next house on the
    same street, so it is usually zero extra taps. It is the only ground truth
    for "actually plowed".
  - **LATER** / **BLOCKED** — moves the stop to the return list (done after
    the rest, or retried when you pass it). The route itself is not reordered.
- **Voice** announces the next stop as you approach, with its note (asides in
  brackets stay on screen, not spoken). If you leave a driveway, or start the
  next one, without tapping DONE, it asks "mark it done?". It never decides
  for you.
- **PARK** (top right) opens mission control: ROUTE (search, return list,
  windrow watch), INTEL (City crews, your streets, radar), PLAN (compare
  Ted's order with a street-block plan), NIGHT (live stats, end shift),
  SYSTEM (integrity, voice/sound, red night vision, dimmer, backup).

## What the City data can and cannot tell you

The City's feed records the last time each street was **plowed or salted —
it does not say which**. ASTRA says "serviced (plow or salt)" and asks you.
Details in [docs/MUNICIPAL-DATA.md](docs/MUNICIPAL-DATA.md).

## Data and privacy

- The customer route never exists in this repository in readable form.
  `public/data/route.sealed.json` is AES-GCM-256 ciphertext under a random
  256-bit key, which the phone stores after the first unlock.
- **The PIN is the weak point.** It wraps that key with PBKDF2-SHA256
  (600,000 iterations), but a 4-digit PIN has only 10,000 possibilities: anyone
  who downloads the public file can try them all offline in minutes. It stops
  casual viewers, not a determined person. To remove the PIN and go back to
  link-only protection, re-seal without `ASTRA_PIN`.
- Nothing leaves the phone except requests to the City of Barrie GIS and
  Environment Canada. No accounts, analytics or tracking.
- `private/` (plaintext route, key, review sheets) is git-ignored. The build
  refuses to ship if anything private or the key appears in `dist/`.

## Updating the route (when Ted sends a new list)

```
# rows.json = JSON array of the email's rows, in order; route_meta.json beside it
node --experimental-strip-types tools/fetch-roads.mjs           # refresh City roads (occasionally)
ROUTE_ROWS=<rows.json> node --experimental-strip-types tools/build-route.mjs
python3 tools/contact-sheet.py                                   # visual QA over City imagery
ASTRA_PIN=<pin> node --experimental-strip-types tools/seal.mjs   # same key unless private/route.key is deleted; omit ASTRA_PIN for link-only
ROUTE_ROWS=<rows.json> node --experimental-strip-types tools/verify-integrity.mjs
npm run build
```

Any Barrie street is understood (the parser matches the City's full street
list); a row it cannot read with certainty stops the build with the reason.

## Develop and test

```
npm ci
npm run dev                      # http://127.0.0.1:5180
npm test                         # 52 unit tests (Node, no browser)
npm run build && npx vite preview --port 5181 &
ROUTE_PIN=<pin> node tests/e2e/run.mjs   # 20 browser tests on 4 iPhone sizes (needs private/route.key)
node --experimental-strip-types tools/simulate.mjs 10 1 consistent   # synthetic full-shift simulation
```

## Documents

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — decisions and trade-offs
- [docs/MUNICIPAL-DATA.md](docs/MUNICIPAL-DATA.md) — verified City and ECCC data facts
- [docs/RESULTS.md](docs/RESULTS.md) — what was tested and measured, and what was not
- [docs/FIELD-TEST.md](docs/FIELD-TEST.md) — the plan for the first real nights

Data: © City of Barrie (no warranty of accuracy or currency); radar and
observations © Environment and Climate Change Canada (OGL – Canada). Map
glyphs: Noto Sans, SIL Open Font License.
