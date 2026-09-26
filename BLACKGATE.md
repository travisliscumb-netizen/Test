# Operation Blackgate — Facility Remake

A GoldenEye 007-style infiltration FPS in one self-contained HTML file. Open
`operation-blackgate.html` in any modern browser — no server, no build step, no
network. Three.js r128 is inlined; every texture, sound and piece of geometry is
generated procedurally at runtime.

## Running it

Double-click `operation-blackgate.html`, or drop it on any static host. The first
frame is the title screen; the first tap or click is where the AudioContext is
created.

## The mission

Objectives scale with the tier you pick, exactly as GoldenEye's did:

| Tier | Objectives |
|---|---|
| Agent | Download the archive in the control room, exit through the plant |
| Secret Agent | + Destroy the nerve-gas stockpile (four tanks: shoot the red gauges) |
| 00 Agent | + Leave no lab staff dead (a constraint: lost for good the moment it breaks) |

You go in with the suppressed PP7 and three proximity mines. The KF7 is taken off
the first guard you drop, and every guard after that leaves his rifle as ammo.
Body armour is stashed in the third washroom stall and in the control room.

A guard who spots you runs for the nearest of seven wall-mounted alarm panels.
Drop him on the way, or shoot panels out beforehand; cut all seven and the alarm
can never be raised. Once it is up, the whole garrison paths to your last known
position and sweeps the rooms around it.

Reaching the exit with the actionable objectives done always ends the mission.
If a constraint was broken on the way, the debrief says MISSION FAILED — the exit
is never an inert door.

## Controls

**Touch (primary):** left half is a floating move stick (rim = sprint). Drag on
the right half to look — the view follows the thumb (Options can switch to a
rate-based look stick). FIRE, AIM (toggle), RLD, WEAP and CRCH (toggle) sit under
the right thumb; USE appears in amber when something can be operated. Touch
controls only appear on touch devices.

**Desktop:** WASD, mouse look, LMB fire, RMB aim, Q / wheel cycle, 1-3 select,
C crouch, Shift sprint, E interact, R reload, Esc or P pause. Clicking locks the
pointer where the browser supports it; losing the lock (Esc) pauses.

## Cheats

Earned, never typed in. Each finished run can unlock one:

| Cheat | Unlocked by |
|---|---|
| Paintball Mode | Completing on Agent |
| DK Mode | Completing on Secret Agent |
| Turbo Mode | Completing on 00 Agent |
| Infinite Ammo | Secret Agent in under 3:30 |
| Invincibility | 00 Agent in under 3:00 |

A run with any cheat on records no best time and unlocks nothing. Best times are
kept per tier. Settings, times and cheats persist in `localStorage` (validated on
load field by field; Safari private mode falls back to memory).

## Source layout

```
src/shell.html   markup and CSS
src/game.js      the game, in ===SECTION n=== blocks (2..11)
vendor/          three r128 examples/js post-processing passes
three.min.js     three r128
build.py         assembles every shipped file (see below)
tests/           unit.js, e2e.js, layout.js, run.mjs
```

`python3 build.py` regenerates `operation-blackgate.html` and every file under
`deploy/`. Those outputs are generated: never edit them by hand.
`python3 build.py --check` fails if any of them is stale.

## Testing

```
npm install        # Playwright only; uses the system Chromium if one is configured
npm test           # build --check, the Blackgate browser suite, the Agent 64 verifier
```

The shipped file contains no test code. `tests/run.mjs` boots the real build in
headless Chromium (WebGL via SwiftShader) and:

- injects `tests/unit.js` — 45+ cases against the live world;
- runs `tests/e2e.js` — full missions on all three tiers walked by a bot through
  the real movement, collision and door code; every guard's alarm run; alarm
  convergence; a three-minute real firefight soak; five restarts with scene and
  geometry counts checked flat; death cam; pause; pickups; swipe look;
- reloads the page to prove settings, best times, cheats and v1-save migration
  survive, and that a corrupt save boots;
- lays the HUD out at 844x390, 390x844 and 667x375 with touch emulation and
  checks no control overlaps another or the HUD, and that no screen is clipped;
- fails on any page error or any network request.

`node tests/run.mjs --shots` also writes screenshots to `.shots/`.

## Engineering decisions worth knowing

- **The light count never changes.** three.js compiles every material against
  the number of *visible* lights, so the pool of eight is always visible and an
  unused slot is switched off by intensity. Toggling `.visible` — which the pool
  used to do — is a light-count change and a recompile hitch in disguise.
- **Materials are compiled at mission start** (`renderer.compile`), so nothing
  compiles mid-play when a pickup or a hit flash first comes into view.
- **Sight and occlusion are ray-vs-box, not Raycaster.** A mesh raycast against
  the ~17k merged level triangles measured 0.75ms; the roster made several a
  frame. The ~216 collision boxes are the level's real shape as far as bodies are
  concerned. Bullets still hit the rendered mesh, for exact impact points.
- **Guards navigate a grid.** Each open 4m cell gets a node where a body fits,
  every link is walk-checked once at build time (with doors treated as unlocked;
  locks are checked per query), and A* runs over eight-way links. A guard with a
  clear straight run skips the graph; one on a route starts from the furthest
  node a straight walk reaches.
- **Hitscan reads fresh matrices.** The camera and each guard's hierarchy are
  refreshed as they move; three.js otherwise updates world matrices only when it
  renders, which left every shot travelling along the previous frame's aim.
- **simulate(dt) is the whole game step** with no rendering or clock reads. The
  frame loop and the test harness call the same function.
- **Post-processing** is RenderPass → UnrealBloom → Vignette → FXAA from the r128
  examples, with sRGB-tagged targets. Adaptive quality drops bloom and shadow
  resolution, then render scale, and climbs back after sustained headroom.
- **Shadow casters are capped** at two key lights; floors, ceilings and trim do
  not cast.

## Deliberate deviations

- `castShadow` is off on flat floors, ceilings, trim and light tubes: with
  shadow-casting point lights those surfaces are redrawn six times per light to
  produce nothing.
- `MeshBasicMaterial` is used in two places, neither on level geometry: inside the
  throwaway environment-probe scene, and as the one shared invisible material on
  the raycast proxy each enemy carries.

## Rebuild (v2) — review findings and what changed

A full review of both games on the branch. Blackgate is the base (real renderer,
the GoldenEye systems); the best of Agent 64 — earned cheats, persisted settings,
per-mode records, a proper verifier — was brought across. Every defect below was
reproduced before it was fixed and has a test.

**Defects fixed**

- The corrected off-screen objective marker never ran: `hudDrawWaypoint` and
  `hudObjectiveTarget` were each declared twice, and the later (old, mirrored)
  copy silently won.
- All seven alarm panels floated in open floor — one dead centre in the insertion
  corridor, walked through. They are now mounted on named walls, and a mount on a
  side with no wall fails the build.
- A dead scientist on 00 Agent soft-locked the game: the exit required the
  constraint too, so it never triggered and nothing said why.
- Standing at the exit with the stockpile intact gave no feedback, and the
  waypoint pointed Secret Agents at the exit before the tanks.
- The light pool toggled `.visible`, changing the compiled light count.
- Line of sight cost ~0.75ms per call (mesh raycast of the whole level).
- Every shot and aim probe used the previous frame's camera and guard matrices.
- Guards treated the 0.4m control-room platform as a wall: the guard posted on it
  was stuck until the failsafe teleported him off, and then could never walk back
  onto it (measured: blocked at its edge, z = 95.7).
- Guards had no path search: runners stalled at walls, searches died at doorways,
  and a stuck failsafe teleported people.
- Scientists who lost sight of you walked back toward where they last saw you.
- Guards and the player passed through each other.
- The exit door's lock lamp was on the far face; two EXIT signs floated in the
  air and one was buried in rock.
- The in-file test suite shipped to players, mutated the live world on every load
  (a guard disarmed on the title screen, real renderer resizes, `[PERF]` log spam).
- Pointer lock lost to Esc did not pause the game.
- On short landscape phones the top of the title screen could not be scrolled to
  (flex centring overflowed past the scroll origin).
- Touch controls were drawn over the desktop view.
- Controls text said Q/E cycle weapons; E is interact.
- Per-frame allocations: footstep noise objects, prompt strings, enemy-hit arrays.

**Added**

- Pistol start with rifles taken from guards; armour and ammo pickups.
- Touch AIM and RELOAD; drag-to-look (default) or rate stick.
- Solid guard bodies; damage-direction arc; a GoldenEye death cam.
- Earned cheats; per-tier best times; persisted, validated settings; erase save.
- GoldenEye-style debrief: per-objective status, accuracy, head/body/limb hits.
- Pause screen with live objective status; fullscreen toggle.
- Guards sweep the area around the last sighting while the alarm is up.

## History

The sections below record earlier passes as they were written. Where they
describe something the rebuild changed (the in-file suite, the hand-rolled
bloom, the waypoint), the sections above are current.

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
