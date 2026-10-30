# KNOWN ISSUES

## Load/timing flakes (pass solo; fail when 3 browser suites run at once on SwiftShader)
- gambling: scratch-card timing and casino fps checks (wall clock).
- stress: a frame stall > 2.5 s under load.
- threat: real-seconds clock check under load.
- prison: one random dice/cards outcome.
- compound: hostile crew / gate-ram checks under load.
- shots / cityshots: timeouts under load (screenshot scripts, no checks).
- qashots (screenshot script, no checks): in the 3-wide run it either stops at the taxi scene (the cab is not
  there after the phone scenes; M13 gate too, and the scene alone runs) or reaches the runner's 75-minute limit
  (graphics gate). Run it alone.
- taxi: a cab stuck in traffic under load (the full-ride and recovery checks; 20/20 solo, M13 gate).
- stress: the 2.5 s frame-stall check under load (30/30 solo, M13 gate and graphics gate). The M13 build itself
  fails it solo now and then (29/30 in one of two runs at the graphics gate: 3.2 s on first entering the jail).
- arrest: the hands-up pose check with the map open (a 4 s real-time window); unique: the won-Widowmaker check;
  ui: the second (touch) page's boot exceeding its 180 s wait while the first page runs. All pass solo (graphics
  gate: 126/126, 58/58, 23/23).
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

## Graphics overhaul (Session 14) — status of the items it inherited
- Casino (and every interior) drawing the city behind its walls: **fixed** (casino 255 → 49 draw calls; GRAPHICS.md).
- Jail HUD over the view: placed by the HUD layout clear of the top controls and now translucent; on a 640×360
  view it still sits in the upper middle. A smaller jail panel is a candidate for the polish pass.
- Phone and service screens: phone home redesigned (groups side by side; all 14 apps on one landscape screen),
  currency colours on every balance line; the individual app screens keep their M11 layouts.
- Business interiors: lit per pixel and themed per trade (floor, ceiling, lamp colour); still one floor plan for
  every trade (the plan carries the heist's spots).
- Royale Billions' losing hour: unchanged by ruling (§45.40); the presentation pass only made the machine fit a
  landscape phone. Odds untouched.

## Graphics overhaul (Session 14) — known limits
- Not measured on a physical iPhone: every frame time is SwiftShader in headless Chromium (CPU rasterised). Draw
  calls, triangles, geometries and update ms carry over; wall ms per frame does not.
- Building facades, street furniture, alleys, fences and the animation set are as M13 left them (roofs and lighting
  changed); police cars keep their M13 livery.
- Wet-road lamp reflections come from the city's lamp grid: lamps off the grid (curved streets, Cedar Fields) and
  car headlights are not mirrored.
- Interior lamps light without shadows (no light passes through walls inside one room, but furniture casts none).
- Boot compiles every shader before the menu (the warm-up, GRAPHICS.md §2): ~5 s more to the menu on software
  GL (M13 ~10 s, after ~15 s), where M13 compiled lazily and paid in play (up to 3.2 s on first entering the
  jail in one solo stress run). Untested on a device. The alternative for the optimisation phase: compile in the
  background behind the menu and finish behind the new-game fade.
