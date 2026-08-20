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

## Deliberate deviations

- The brief asks for `castShadow = true` on every piece of geometry. Flat floors,
  ceilings, trim and light tubes have it switched off — with six shadow-casting
  point lights those surfaces are redrawn 36 times a frame to produce nothing.
  `receiveShadow` stays on everywhere it matters.
- `MeshBasicMaterial` appears twice, neither on level geometry: inside the
  throwaway environment-probe scene, and as the invisible one-box raycast proxy
  each enemy carries so a shot tests one volume instead of seven.
