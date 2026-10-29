# KNOWN ISSUES

## Load/timing flakes (pass solo; fail when 3 browser suites run at once on SwiftShader)
- gambling: scratch-card timing and casino fps checks (wall clock).
- stress: a frame stall > 2.5 s under load.
- threat: real-seconds clock check under load.
- prison: one random dice/cards outcome.
- compound: hostile crew / gate-ram checks under load.
- shots / cityshots: timeouts under load (screenshot scripts, no checks).
- gambling: the reel-stop timing check (first reel late under load).
- police: a parked cruiser's pull-out distance; raid: real-time clock and save-clock checks; roadnet: the
  estate-relocation reload check (all pass solo; seen failing only in the 3-wide run, m12-full).

## Economy (M13) — watch in playtesting
- Pickpocketing: after the M13 rich-district wariness, circling the rich districts measures ≈ $6.6k an hour against
  ≈ $5.0k in ordinary ones (seeded model of a brisk pace, ECONOMY.md); a human pace will differ. `PICK_WARY` is
  the knob if playtests disagree.
- Hourly figures in ECONOMY.md assume a focused player's pace; no human playthrough has timed them yet.
- The economy suite fixes the bands; the probe's passive simulations use 4–6 econ days (random ±10% gross).

## Accepted limitations
- One-off hiding places are clear kerb spots (§45.39); the Widowmaker count starts with 6D; a pushed untaken
  one-off returns to its spot on reload.
- No physical kerbs along curved streets; no signals off the grid (Curved Roads limits).
- Countryside trees/rocks are solid, not destructible; the extension boundary is a fenced rectangle.

## For the graphics / UI overhaul (not content)
- The jail HUD was compacted (M8) but still sits top-centre over the view; the phone and service screens are
  functional, not designed.
- Themed business interiors (M10) are box-kit rooms; one layout for every trade.
- Royale Billions one-hour sessions end ahead 3–5% of the time (measured M13: a 95% machine with a lottery tail).
  Kept by ruling (§45.40); the presentation pass may want to soften how a losing hour feels, not the odds.
