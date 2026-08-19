# Decisions

Non-obvious architectural calls, and the spec ambiguities I resolved.

## Repository

- `index.html` in this repo previously held an unrelated project ("Ted's Lawn
  Care"). The build spec fixes the output path at `./index.html`, so that file
  was replaced. The original is intact in git history at commit `81fc73c`.

## Renderer

- **Two shader programs, not one.** The spec asks for one program for *world
  geometry*; particles need a different vertex layout and additive blending, so
  they get a second, small program. World geometry is genuinely one program.
- **One unit-cube VBO for everything dynamic.** Enemies, the first-person
  weapon, pickups, terminals, the data core and bullet decals are all the same
  cube buffer drawn with a per-draw model matrix and a colour uniform. That
  keeps buffer count at three (static level, unit cube, particle scratch) and
  makes the low-poly silhouette style consistent for free.
- **`uBaked` mixes baked colour against the runtime directional term.** Static
  geometry passes 0.66 (mostly the baked bake, some live shaping); dynamic
  objects pass ~0.25 so they respond to the light direction and read as
  separate objects rather than painted-on decals.
- **The bake is a lighting multiplier, not an additive fraction.** The first
  implementation summed fractions of the albedo and produced a mean vertex
  luminance of 0.11 — effectively black on a phone in daylight. It now computes
  a hemisphere-ambient multiplier plus point-light contributions and multiplies
  the albedo, giving a mean of ~0.31 with a 0.06–1.0 range.
- **No dynamic lights at all.** The spec caps them; the answer here is zero.
  Muzzle flashes, sparks and the lightning flash are particles and a global
  ambient lift, so no per-frame light uniform work happens.
- **Decals are flattened cubes in the world pass**, capped by quality preset and
  distance-culled at 30m, rather than a separate projected-decal system.
- **The viewmodel gets its own projection and a cleared depth buffer.** Simplest
  reliable way to stop the weapon clipping into walls without a depth-range hack.

## Collision & navigation

- **Per-axis AABB resolution against a uniform grid, with a 0.46m step-up.**
  Every level primitive is an axis-aligned box, so this is exact rather than
  approximate. Staircases are runs of boxes climbed by the step-up rule; there
  is no ramp or slope code anywhere.
- **The waypoint graph is hand-authored, and patrol routes do not path-find.**
  Patrols walk straight lines between consecutive nodes; only chase/search
  behaviour runs breadth-first search over the graph. That means every authored
  patrol leg has to be geometrically clear — `verify.js` walks every leg and
  every edge as a body would (following the floor, checking head clearance and
  step height) and fails the build if one is blocked. That found two blocked
  edges, three blocked patrol legs, two waypoints embedded in solid geometry,
  and a staircase whose top step stopped 0.8m below the catwalk it was meant to
  reach — all fixed.
- **The culvert is deliberately excluded from the waypoint graph.** It is 1.5m
  high; a 1.78m guard sent in there would wedge against the ceiling and burn the
  stuck-failsafe forever. Keeping guards out is also what makes the stealth
  route worth taking.
- **Jump-free vertical handling**, as specified: gravity, ground snap and
  step-up only. There is no jump button on any input path.

## Gameplay resolutions

- **"Dock open for ninety seconds" does not fail the mission.** The spec lists
  exactly one failure condition (health reaches zero). Letting the extraction
  window expire raises the alarm instead of ending the run, so the stated
  failure condition stays the only one.
- **Death carries across checkpoint restarts, but restarting from the briefing
  clears it.** Otherwise the no-death cheat unlock would be free — die, restart,
  claim it.
- **The sidearm is suppressed.** It needed a mechanical identity beyond
  "moderate damage": its noise radius is 7m against the SMG's 21m and the
  shotgun's 29m, which is what makes a quiet run with it possible.
- **Alarm is raised by an enemy finishing a call-in**, not instantly on sight —
  guards take 2.4s, drones 0.85s. Killing the caller first is the counterplay,
  and it is why the drone is the dangerous one for a silent run.
- **Detection is awareness-accumulating, not binary.** Rate scales with
  distance, stance and movement. Measured: 12m inside a guard's cone is 0.98s
  standing and 3.35s crouched. `verify.js` asserts that ratio so a later tuning
  change cannot quietly kill the stealth route.
- **Enemies have no cover behaviour**, only strafing while attacking. The spec
  requires none, and cover-seeking AI in a waypoint-only world tends to produce
  the exact lock-ups the stuck-failsafe exists to prevent.

## Platform defects

- **Touch is the input path, not a fallback.** Pointer Lock does not exist on
  iPhone. It is requested only on a desktop click, and both drag-to-look and
  free mouse-look work when it is absent.
- **Audio is created inside the Start Game handler and a 1-sample silent buffer
  is played synchronously.** Nothing about unlocking is deferred to a promise
  callback, because that lands outside the iOS gesture window. The game is fully
  playable when audio never initialises — verified headless with no
  `AudioContext` present.
- **DPR is capped at 1.0 / 1.25 / 1.5** by quality preset. A 3x iPhone
  backbuffer is the single biggest frame-time sink available.
- **Auto quality has explicit hysteresis**: 26ms down-shift, 13.5ms up-shift,
  45 consecutive samples, 5.2s cooldown. The gap between thresholds is what
  stops it oscillating.
- **Every localStorage read and write is wrapped**, and a failed write flips the
  save to memory-only permanently rather than retrying every frame. Loaded saves
  are validated field by field, by type and range — verified against corrupt
  JSON, hostile field types, a throwing store and no store at all.
- **Fullscreen is feature-detected and never on a required path.** The settings
  button reports "Unavailable" rather than failing silently.

## Performance

- Pools have hard ceilings and recycle the oldest entry: 320 particles, 64
  decals, 24 tracers, 14 damage numbers, 10 corpses. The free-slot search scans
  a 24-slot window before recycling, so spawning stays O(1)-ish rather than
  O(pool).
- Damage numbers are a fixed pool of 14 DOM nodes reused by world-to-screen
  projection. The HUD never creates a node per frame.
- The radar is a 92px 2D canvas redrawn at 14Hz, not DOM.
- Black Current is 1,456 triangles in a single draw call; Signal Yard is 370.
  Measured peak was 67 draw calls per frame including every dynamic cube, the
  particle pass and the viewmodel.

## What the browser pass changed

`verify.js` runs headless against stubs, which proves logic but shows nothing.
Rendering the real page in Chromium (SwiftShader) and looking at the frames
found four things the headless suite could not:

- **The viewmodel was off-screen in portrait.** A phone's 0.5 aspect ratio makes
  the horizontal frustum very narrow, so a fixed x-offset put the weapon outside
  it. The offset now scales with aspect, which also keeps it in the same
  apparent place in landscape.
- **Large surfaces had only corner vertices.** The 56m yard floor was one quad,
  so per-vertex baked light had nowhere to land and every room read dead flat.
  Faces are now tessellated on a 1.7m grid (1,456 → 20,286 triangles, still one
  draw call, ~2MB VBO) and the light pools actually appear.
- **The lighting was washed out.** First pass ambient was high enough to erase
  the local lights. Ambient came down and the light contribution went up 5x,
  which is what makes the palette read as pools of cyan and amber in the dark.
- **A passive player died in five seconds.** Three guards firing accurate
  three-round bursts is 40 damage/second each. Damage, rate of fire and spread
  were cut, spread now grows with range, and enemies take a 0.55s beat before
  their first burst. A player who stands still in the open and does nothing now
  survives about twelve seconds — enough to react, not enough to ignore.

The same pass also confirmed, in a real browser with real touch events, that two
simultaneous fingers drive movement and look independently, that the stick zeroes
on release, that the FIRE button fires, that a full silent run reaches the
victory screen and unlocks all four cheats, that the save survives a reload, and
that the network panel stays empty.

## What is still untested

No physical iPhone. Chromium's software renderer says nothing about how iOS
Safari schedules WebGL, how the frame rate holds on real silicon, whether the
fog reads right on an OLED panel in daylight, or whether the buttons land where
a thumb expects them. Audio was exercised against a stubbed and a real
`AudioContext` but never actually listened to — the procedural weapon sounds are
built from theory, not from hearing them. Long-session behaviour (tens of
minutes, repeated backgrounding on a real device) is likewise unverified.
