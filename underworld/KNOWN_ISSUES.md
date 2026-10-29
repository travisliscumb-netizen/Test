# KNOWN ISSUES

## Load/timing flakes (pass solo; fail when 3 browser suites run at once on SwiftShader)
- gambling: scratch-card timing and casino fps checks (wall clock).
- stress: a frame stall > 2.5 s under load.
- threat: real-seconds clock check under load.
- prison: one random dice/cards outcome.
- compound: hostile crew / gate-ram checks under load.
- shots / cityshots: timeouts under load (screenshot scripts, no checks).
- taxi: a cab stuck in traffic under load (the full-ride and recovery checks; 20/20 solo, M13 gate).
- stress: the 2.5 s frame-stall check under load (30/30 solo, M13 gate).
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

## Fixed at the M13 gate (were intermittent)
- gambling's reel-stop check measured wall-clock gaps between timers on a main thread that software GL blocks for
  300–600 ms a frame; it now checks the scheduled stops and their order (the game was right).
- races' pink-slip check expected the won car on the street; a finish 500 m ahead leaves it beyond the registry's
  340 m keep radius, so it is stored where it stopped. The check now goes there and finds it, yours.

## For the graphics / UI overhaul (not content)
- Inside the casino the frame still costs ~223 draw calls / ~683k triangles on the phone profile, about the
  street's, so the city behind the interior appears not to be culled (perf-scenarios, M13; not yet traced).
  A presentation-pass target.
- The jail HUD was compacted (M8) but still sits top-centre over the view; the phone and service screens are
  functional, not designed.
- Themed business interiors (M10) are box-kit rooms; one layout for every trade.
- Royale Billions one-hour sessions end ahead 3–5% of the time (measured M13: a 95% machine with a lottery tail).
  Kept by ruling (§45.40); the presentation pass may want to soften how a losing hour feels, not the odds.
