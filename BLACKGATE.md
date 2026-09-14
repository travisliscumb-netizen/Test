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

## Final polish pass

A systematic review of the systems the playtest did not touch, each finding
reproduced with a script before it was changed.

- **A guard's gunshot left a light burning in the level.** All three muzzle
  flashes -- yours, a guard's, a mine blast -- drive one shared point light, but
  only yours armed the timer that turns it off. After the first shot fired at
  you, a lamp sat in the middle of the facility for the rest of the mission.
  Every source now goes through one call that ramps the light down, so a gunshot
  snaps and a blast lingers, and neither can be left on.
- **Mines leaked geometry.** Each throw built a fresh cylinder and sphere, and
  the detonation disposed the body but missed the LED. Both are shared now and
  built once. Verified: the second and third mine add nothing, and a restart
  returns to the baseline count.
- **Adaptive quality judged the machine on its worst moment.** It averaged the
  first 60 frames -- the ones paying for shader compilation and the environment
  bake -- so a perfectly capable phone could lose bloom permanently one second
  in. It now ignores warm-up, caps any single sample so one stall cannot poison
  a window, and climbs back when the machine proves itself over three clean
  windows, with a wide gap between the two thresholds so it cannot flap.
- **The off-screen objective marker could point the wrong way.** A projected
  point behind the camera is meaningless; mirroring it could land the marker
  near the centre of the screen. Off-screen targets are now placed by true
  bearing: straight ahead is up, dead behind is straight down, and an arrow
  rides the border in between. Verified at all eight bearings.
- **Bodies blinked out of existence** on a 12-second timer. They settle through
  the floor over the last second instead.
- **Pausing mid-trigger swallowed your next shot.** The fire latch survived the
  pause, so the first click after resuming did nothing on a semi-automatic.
- **Open doors were drawn as walls on the minimap**, and guards in SEARCH -- the
  ones actively hunting you -- were the one hostile state the map did not show.
- **The AI hot paths allocated every frame.** Line-of-sight built a Raycaster
  and a vector per call, the attack state built three vectors per enemy per
  frame, and every enemy cloned the player's position every frame. All reused
  now. Allocation in a per-frame path is what a garbage collector notices, and a
  collection pause is exactly what makes a game feel rough on a phone.

Checked and found correct, so left alone: semi-automatic fire (one shot per
press, verified), automatic fire, reload against a partial or empty reserve,
weapon switching mid-reload, five full restarts (scene object count, enemy
roster, collidables and light count all flat), pause and resume (no time jump),
and guards engaging you at the control-room terminal -- they see you, switch to
ATTACK and close to their firing standoff, which the earlier report wrongly
flagged as a possible hole.

## Design pass: what the research changed

The build was mechanically clean but thin in exactly the places GoldenEye was
deep. Four systems were added, each drawn from something the N64 game actually
did rather than from a general idea of "more features".

### Objectives scale with the difficulty tier

The most cited structural idea in GoldenEye is that Agent / Secret Agent / 00
Agent did not simply move numbers around -- each tier *added objectives* on top
of the last, so the same level asked something new of you. Here:

| Tier | Objectives |
|---|---|
| Agent | Download the archive, exit through the plant |
| Secret Agent | + Destroy the nerve-gas stockpile (four tanks, shoot the gauges) |
| 00 Agent | + Leave no lab staff dead |

The last one is a *constraint*: it can be failed outright and permanently, and
it turns every panicking scientist who runs across your sights into a problem.
Objectives are data in one table; the HUD, the briefing, the pause screen and
the win condition all read it, so the briefing now tells you what the tier you
picked actually demands before you commit.

### The alarm is a race, not a coin flip

Previously the alarm fired the instant a guard decided you were hostile: spotted
meant caught, and nothing you did about it mattered. Now a guard has to reach
one of seven wall panels and physically pull it. You can drop him on the way,
or shoot the panels out beforehand and take a whole wing off the board. Cut the
last panel and the garrison can never be called at all, which is the quiet run
the suppressed PP7 exists for. Panels are drawn on the minimap, live or cut,
because deciding which one to kill before you are seen is the interesting
decision and you cannot make it if you have to find them by walking into them.

Implemented without a sixth AI state -- the brief fixes the FSM at five, and
there is a test asserting exactly those five. The runner uses CHASE with a panel
as its target instead of the player. Guards have no path search, so a runner
whose way is blocked would otherwise stand in a corner forever and the alarm
would simply never arrive; a run that stops making progress for 2.5s is
abandoned and he turns and fights.

### Shots land somewhere specific

GoldenEye did not treat a guard as one block. Head, torso, arm and leg now take
different damage (2.5x / 1x / 0.5x / 0.5x) and, more importantly, do different
things:

- **Arm** -- the rifle is knocked out of his hands onto the floor and he breaks
  for cover. You can neutralise a guard without killing him, which matters a
  great deal when the tier you picked says no casualties.
- **Leg** -- he stays in the fight at a little over half speed.
- **Head** -- what you would expect.

Detection still uses the single box proxy, one volume per guard rather than
seven; the landing point is classified against the model's real proportions
afterwards, which costs nothing.

### Guards notice a colleague drop

A documented GoldenEye sense that was missing. A body falling in a lit corridor
in plain view of another guard used to change nothing, which is the kind of gap
that makes an AI feel blind. Now any patrolling guard with line of sight to a
death goes to ALERT. It has a real consequence: killing the guard who is running
for a panel in front of witnesses just promotes the next one, so a silent run
means killing cleanly *and* out of sight.

## Interaction pass: making the actionable legible

The complaint was that you could not tell what you were allowed to act on. That
is an affordance problem, and the two games usually cited for solving it solve
it in different halves, so both halves are here.

**Half-Life 2's half: the object says it before the interface does.** Every
interactable now wears the same signature -- a pale hazard bezel, a dark
recessed face and a lit indicator large enough to pick out down a corridor.
None of the building's scenery has any of those three, so a fixture reads as
equipment on sight rather than as another grey box on a grey wall.

**Mirror's Edge's half: one colour means one thing, everywhere.** Red is a thing
to shoot. Amber is a thing to hold USE on. No scenery is permitted either
colour. The stockpile gauges were green before, which broke the rule the moment
there were two kinds of target, so they are red now: *a lit red indicator means
shoot this and something happens*, with no exceptions to learn.

### One probe drives all of it

A single cast down the crosshair each frame classifies what is under it, and the
reticle, the label, the prompt and the object's own highlight all read that one
result. They cannot disagree with each other, and they cannot disagree with what
a shot would actually do.

- **Reticle** turns red on a guard or a destructible, amber on a use target,
  white on nothing. Corner brackets appear only when the probe found something,
  so their presence is itself the signal.
- **Label** names the thing and its range -- `ALARM PANEL 3m` -- above the
  crosshair, with what the trigger would do about it. Above rather than below
  because the hold-USE progress bar already lives underneath, and two lines both
  reading HOLD USE is worse than either alone.
- **Highlight**: the aimed fixture's indicator brightens. Deliberately not an
  outline round the whole object -- it should read as the thing noticing you,
  not as an overlay on the world.
- **Nothing is named through a wall**, and a fixture that no longer does
  anything stops advertising itself.

The reticle stays small and centred throughout. Competitive practice is that a
crosshair which balloons hides the thing you are aiming at, so state is carried
in colour and brackets rather than in size.

### Shoot targets and use targets are found differently, on purpose

A thing you shoot is found by the same ray the bullet takes, so the reticle can
never promise a hit the shot would not make. A thing you hold USE on is found by
proximity and facing instead, because the terminal sits behind a console desk
and a prompt that depends on landing a ray on the box behind it blinks out
exactly when you have walked up to the desk to use it. Beyond arm's reach the
prompt reads MOVE CLOSER rather than vanishing.

One bug worth recording, because it is the kind that hides: the seven panel
registrations were built in a `var`-scoped loop and closed over the loop
variable, so all seven shared one binding and every entry reported the state of
whichever panel was built last. Destroyed panels stayed targetable and the
highlight always lit the wrong one. Each entry now carries its own owner, and a
test asserts that two panels report independently.

## Deliberate deviations

- The brief asks for `castShadow = true` on every piece of geometry. Flat floors,
  ceilings, trim and light tubes have it switched off — with six shadow-casting
  point lights those surfaces are redrawn 36 times a frame to produce nothing.
  `receiveShadow` stays on everywhere it matters.
- `MeshBasicMaterial` appears twice, neither on level geometry: inside the
  throwaway environment-probe scene, and as the invisible one-box raycast proxy
  each enemy carries so a shot tests one volume instead of seven.
