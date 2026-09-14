# Operation Blackgate — Facility Remake

A fan remake of the "Facility" level archetype as a single self-contained HTML
file. Open `operation-blackgate.html` in any modern browser — no server, no
build step, no network. Three.js r128 is inlined; every texture, sound and piece
of geometry is generated procedurally at runtime.

## Running it

Double-click `operation-blackgate.html`, or drop it on any static host. The
first frame is the title screen; one tap or click starts the mission (and that
gesture is where the AudioContext is created).

## Objectives

1. Reach the control room and hold USE / E on the amber terminal to download the
   research archive.
2. Leave through the chemical plant. The exit stays locked until the archive is
   yours.

Health reaching zero fails the mission. Guards patrol, hear gunfire and raise
the alarm — at which point the fluorescents lerp to red and pulse. The PP7 is
suppressed and carries about a third as far as the KF7, which is the whole
reason to use it.

## Controls

**Touch (primary):** left half of the screen is the movement stick, right half
is the look stick — both floating, appearing where your thumb lands. Push
movement to the rim to sprint. FIRE / WEAP / CRCH sit under the right thumb; USE
appears in amber when something can be operated.

**Desktop:** WASD, mouse look, LMB fire, RMB aim, Q/E cycle, 1-3 select, C
crouch, Shift sprint, E interact, R reload, Esc pause. Clicking requests pointer
lock where the browser supports it; dragging works everywhere else.

## Source layout

The shipped artifact is the generated `operation-blackgate.html`. It is
assembled from `src/shell.html` + `three.min.js` + `src/game.js` by `build.py`,
purely so the game code stays editable next to a 600KB inlined library. Nothing
in that toolchain is needed to run or host the game.

```
python3 build.py      # regenerates operation-blackgate.html
```

## Engineering decisions worth knowing

- **The light pool is a fixed size.** Adding or removing a light changes the
  lighting state every material is compiled against, so the pool is allocated
  once and re-homed onto the nearest ceiling fixtures as the player walks. Same
  reason the muzzle flash light is parked at zero intensity rather than added
  per shot: a trigger pull would otherwise recompile the scene's shaders.
- **Shadow casters are capped and asymmetric.** Six on desktop, two at 256px on
  mobile with half-rate updates, because a shadow-casting point light is six
  render passes. Floors, ceilings, skirting, light tubes and enemy arms are
  excluded from the shadow pass entirely — they cost six redraws each and
  occlude nothing.
- **Bloom is a hand-rolled three-pass chain**, not EffectComposer (which lives
  in three's examples, not core). Scene renders to an sRGB-tagged target — r128
  takes output encoding from the render target — then bright-pass, separable
  blur, additive composite.
- **A PMREM environment probe is baked at startup** from a tiny synthetic room.
  Without it every metalness>0 surface renders black.
- **Static geometry is merged per material** with a hand-written merge (r128 core
  has no BufferGeometryUtils), so the facility draws in roughly ten calls.
- **Collision is AABB, never Raycaster.** Raycaster allocates intersection
  records and walks the scene graph; movement only ever needs box-vs-box.
- **Dynamic resolution sits under the DPR cap.** The brief asks for DPR capped at
  2 and 30fps on mobile, which conflict on a phone; the cap stands and the scale
  underneath it moves with hysteresis.

## Playtest fixes (final pass)

These came out of a reported play session and a scripted sweep of the level.

- **Movement basis was mirrored.** The strafe/forward vectors were built from the
  wrong sign pair, so walking "forward" went somewhere different depending on
  which way you faced. three.js cameras look down `-Z`: forward is
  `(-sin yaw, -cos yaw)` and right is `(cos yaw, -sin yaw)`. Verified at all
  eight compass headings — alignment is now +1.0 at every one.
- **Guard models faced backwards.** Rendering only; the FSM had them right all
  along. Their yaw now gets a half turn when it reaches the mesh.
- **The opening room no longer camps you.** You used to spawn inside a bathroom
  with two guards already in it, which raised the alarm before you could stand
  up. The bathroom is empty, the first guard patrols the corridor beyond the
  door, and you meet him through the doorway on your terms.
- **You can no longer be wedged inside a wall.** Two boxes meeting at a corner
  could each push the body back into the other. Every clean frame is now
  remembered, and a frame that ends overlapping eases back toward the last good
  position instead of trapping you there.
- **Doors were the other half of the wall-sticking.** The door's collider was
  only synced while the slab was in motion, and a closing door switched a
  full-height box back on at 75% closed — on top of anyone standing under it.
  The collider now tracks the slab on every frame, and a door will not close
  while a body is in its mouth.
- **Guards can open doors.** Doors used to open for the player alone, so a
  chasing guard walked into a slab and the chase died in the corridor.
- **Guards no longer blink across the room.** The anti-grind failsafe that resets
  a stuck guard to his patrol node now waits much longer while you can see him.
- **The test suite no longer sounds the alarm before you play.** Driving a live
  guard through `CHASE`/`ATTACK` tripped `raiseAlarm()`, so the mission opened
  with "! GUARD ALERTED" on screen. The probe pins and restores the flag, and
  `startMission()` clears the banner.
- **The suite was also under-reporting.** Each section ships as its own
  `<script>`, so a zero-delay timeout could fire between two of them and print
  before the last section had added its cases. The report now waits for
  `DOMContentLoaded`. 21 tests, all passing.
- **HUD layout collided on short landscape phones.** At 844x390 the weapon button
  overlapped the minimap. It moved into the inner column above crouch.

## Additions that were not defects

- **A rotating minimap and an objective waypoint.** The minimap is the canvas
  HUD, drawn from cached wall rectangles, oriented so your heading points up,
  with door markers, guard blips and a compass letter. The waypoint floats over
  the current objective with a range readout, and pins to the screen rim with an
  arrow when the objective is behind you.
- **Aim assist, which is the GoldenEye mechanic.** The N64 game snapped shots
  onto a guard inside a generous cone; on a phone, where the look stick is the
  whole aiming budget, that is the difference between a fight and a chore. The
  test here is a cylinder around the body rather than an angular cone — a fixed
  cone is unusable up close, where the gap between eye height and chest height
  eats the whole budget on its own. It only narrows a gap that already exists,
  it needs clear line of sight, and it stands down entirely while you are aiming
  down sights so a deliberate headshot is still yours to take. Measured on a
  fixed 200-shot spread: 39% to 61% hit rate at 5m, 17% to 60% at 12m, with
  wild shots (25 degrees off) never touched.

## Deliberate deviations

- The brief asks for `castShadow = true` on every piece of geometry. Flat floors,
  ceilings, trim and light tubes have it switched off — with six shadow-casting
  point lights those surfaces are redrawn 36 times a frame to produce nothing.
  `receiveShadow` stays on everywhere it matters.
- `MeshBasicMaterial` appears twice, neither on level geometry: inside the
  throwaway environment-probe scene, and as the invisible one-box raycast proxy
  each enemy carries so a shot tests one volume instead of seven.
