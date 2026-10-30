# GRAPHICS.md — the Session 14 graphics / presentation / UI-UX overhaul

The before/after record of the overhaul: what was audited, what changed and why, what it costs, and how it was
checked. The "before" is the content-complete M13 build (`5b19596`, tag `underworld-pre-graphics-m13`), kept as one
self-contained file in `releases/pre-graphics-m13/` (saves under their own `pvunderworld.m13.*` keys).

## 1. The audit (G1)

Real captures of every scene family with the same cameras on both builds (`tools/vqa-shots.mjs`, see §6), plus
draw-call / triangle counts per scene and the M13 phone-profile perf baseline. What the M13 build looked like, by
priority (P1 = seen every minute of play, P3 = occasional):

| Pri | Area | Finding |
|---|---|---|
| P1 | Rendering | Interiors drew the whole city behind their walls: the casino cost 255 draw calls / 704k triangles, about the street's, of which the sun's shadow pass alone was ~93 calls / 270k triangles. |
| P1 | Lighting | Flat, grey, heavy haze; street lamps lit nothing on the ground; the night street was dark except windows. |
| P1 | HUD | No Rank or Rep on screen; the two currencies were both green text; touch buttons were plain text circles ("Atk", "Blk", "Rld"). |
| P1 | Foliage | Trees were a few cubes on a stick (city) or a box and a cone (Cedar Fields); a park of them was 1.2M triangles once given real canopies, with no LOD. |
| P1 | Interiors | Every room was unlit: baked vertex colours under a MeshBasicMaterial, so lamps glowed but lit nothing. |
| P2 | Characters | Box limbs and torso, no face (no eyes, nose, mouth or brows), three hairstyles. |
| P2 | Vehicles | Extruded side profiles with square plan corners and flat panels: slabs. |
| P2 | Cedar Fields | The countryside was flat, untextured vertex green; Valen Point's infield likewise. |
| P2 | Weather | Rain darkened the ground but nothing looked wet: no sheen, no reflected lights. |
| P2 | Map | Letters in squares (W, D, S, M, L, A, G, B, C …) with no legend on screen; on a landscape phone the toolbar covered the top of the city. |
| P2 | Phone | One app group per row on a landscape phone: two or three tiles and a wide empty panel, scrolling for the rest. |
| P3 | Roofs | Uniform grey slabs. |
| P3 | Screens | Royale Billions on a landscape phone: the reels and SPIN below the fold. |
| P3 | Feedback | A new Rank was a plain banner; one-offs had nothing at their discovery spot. |

Plan (executed in this order, cheapest-for-the-most-screen first): interior culling → lighting balance and lamp
light → foliage with LOD → HUD v2 and the currency language → terrain → characters → vehicles → interiors' light →
wet weather → map and phone → feedback → quality scaling → final gate.

## 2. What changed

### Rendering architecture (G2)
- **The outdoors is one group** (`game.outdoor`): every system that puts the city in the scene (chunks, props,
  static scenery, Valen Point, Cedar Fields, vehicles, the helicopter, pickups and neon, compounds, races, crates,
  entrances, packages) adds to it. Inside a room without a real view out (every interior but the penthouse), the
  group is hidden, street people and contact shadows are skipped and the sun's shadow map stops re-rendering.
  The casino went from 255 to 49 draw calls (704k → 53k triangles), the jewellery store from 213 to 39.
- **Foliage LOD and culling** (`150`): each tree type has a far model; instances within 18 m always draw, beyond
  that a sphere test against the frustum, the full model to 70 m and the far one past it, re-sorted when the
  camera moves 6 m or turns. The new canopies would have cost a park 1.21M triangles; with LOD it is ~735k.
- **Dynamic resolution** (`610`, auto quality only): every second a long frame (>21 ms) takes 8% of the pixel ratio
  away (to 60% of the preset's), a quick one (<15 ms) gives 5% back; whole presets only drop when that is not
  enough. Medium's pixel-ratio cap went from 0.9 (under a phone's CSS resolution, visibly soft) to 1.25.

### World (G3, G7)
- **Light**: a warmer, stronger sun; ambient and fog rebalanced (the grey haze lifted); street lamps throw warm pools
  on the ground at night, brighter on wet roads; a little more saturation and contrast in the grade.
- **Trees**: leaf-clump canopies with baked shading on branched trunks, tiered firs, bushes and planters; Cedar Fields'
  box-and-cone trees replaced by the same families.
- **Roofs**: membrane with seams, tar, gravel, green roofs and tinted concrete, weathered and stained.
- **Cedar Fields terrain** (new terrain shader over the height field's own vertex colours; physics untouched):
  sun-dried and lush grass patches, clumps, blades and wildflowers near the eye (filtered by pixel footprint, so no
  shimmer at a glancing angle), soil grain and pebbles, rock on steep slopes, puddles and a sheen in the rain,
  passing cloud shadows and the city's fog. **Valen Point** uses it too, with mowing stripes on the infield and its
  track asphalt brought up to the city roads' tone.
- **Wet ground**: a water film mirrors the sky (Fresnel, strongest in puddles, dimmer between buildings); at night
  every street lamp throws a long reflected streak on the wet road toward the eye (computed from the lamp layout,
  no reflection pass). Capture scenes now soak the ground the way a while in the rain does.

### Interiors (G4)
- Rooms were unlit (baked colours under a basic material). Every lamp of a room now lights it per pixel: a warm
  pool with distance falloff on the surfaces facing it, ceilings darker than the floor under them, and floors
  catching a soft reflection of the lamps. Up to 20 lamps at once (the ones nearest the camera in a bigger room);
  one shader program for every room. Applies to the casino, every business, homes, warehouses, the jail and the
  underground garages.

### Vehicles and the one-offs (G5)
- Bodies shaped from the extruded profiles: rounded nose and tail in plan, tucked sills and rolled shoulders, crowned
  hood and deck, smooth normals on the paint (wheels, dimensions and physics untouched).
- The Golden Corsair is gold leaf: its own metalness (a per-car `finish.metal`).
- A one-off still standing where its clue put it is lit like a car on a stand: a warm pool of light round it and,
  from dusk, a soft beam from above; both go the moment it leaves its spot or is taken. Spotting one and acquiring
  one are fanfare banners.

### People (G6)
- Faces (eyes, brows, nose, ears, mouth), six hairstyles, rounded limbs, torso and hips (no box edges), long coats
  over jackets and knitted beanies in the street mix (drawn last, so a seeded look keeps everything it had).

### UI / UX (G8, G11)
- **HUD**: a status card with the Rank and a Rep bar to the next Rank, Dirty Cash in green with a CASH tag, Clean
  Bank in blue with a bank glyph, heat and the clock; compact on a landscape phone so it ends above the Use button.
  Touch buttons carry pictograms over a small label; gas green, brake red.
- **The currency language**: Dirty green, Clean blue, everywhere money is shown (`<b class="cash dirty|clean">`):
  the phone header, the Empire tiles, every service screen's balance line (`Money.html`), the casino.
- **Map**: round symbols with pictograms (house, garage, warehouse, briefcase, wrench, shield, cross, crown, car …)
  on the big map, the minimap, the index, the legend and the cards; on a landscape phone the tools sit in a block at
  the right, clear of the city; minimap labels outlined.
- **Phone**: app groups flow side by side; a slimmer header and smaller tiles on a landscape phone.
- **Royale Billions**: on a landscape phone the controls sit beside the cabinet, so the reels and SPIN are on one
  screen; the odds are untouched.
- **Banners**: a kicker line over the title; a gold fanfare with a light sweep for a new Rank and a one-off
  acquired; the HUD's Rank chip pulses when the Rank changes.

### The stall hunt at the gate (G2)
The stress suite (390×844 touch, Low) showed 3–6 s frame gaps on transitions that M13 did not have on the same
machine (M13: 0.6–2.4 s). Long-animation-frame timing showed an idle main thread: the cost was in the GPU
process. Ruled out by measurement: shader programs (none new on those frames), streamed geometry (smaller than
M13's), the HUD layer count, the map's vector symbols. A bisection of the stylesheet pinned it to one rule: the
touch buttons' base style (a fractional 1.5 px border on round buttons, translucent label text, a redundant
backdrop override), which made every control change re-rasterise the overlay in software. Fixed (2 px border,
solid text), and the other costs found on the way removed too: icons are background images (not CSS masks),
in-game overlays are flat translucent fills (no blurred shadows or per-button gradients), map symbols come from
cached sprites. Result: stress 30/30, worst gap 1.2 s.

The same hunt also measured the Low preset's pixel ratio (raised to 0.85 earlier in the overhaul; back to 0.7, it
is the weak-device preset) and added shader warm-up: a quality change that turns shadows on or off recompiles
every program, and everything is drawn once at one pixel at boot and after such a change, so a browser that
compiles shaders on first draw (Safari) does it behind the loading screen.

## 3. Performance (G2, G12)

_(measured at the gate)_

## 4. Sizes

_(measured at the gate)_

## 5. Save compatibility

No save field was added, renamed or removed by the overhaul; `SAVE_VERSION` is unchanged. The after build reads
M13 saves as they are (it uses the main build's keys, `pvunderworld.save.v1`); the M13 snapshot keeps its own.

## 6. How it was checked

- `tools/vqa-shots.mjs <build> <dir> [scene prefixes]`: the same scenes with the same free camera on any build:
  20 world views (day, night, rain, aerial, every district, Cedar Fields, Valen Point), vehicle line-ups and the ten
  one-offs close up, the player and a crowd, play scenes with the game camera (casino, nine business interiors,
  homes, warehouse, pursuit, race start, jail) and the UI on an iPhone-sized touch viewport (HUD on foot and driving,
  phone, Empire, Market, the map, Royale Billions).
