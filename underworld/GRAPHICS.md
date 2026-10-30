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
| P1 | Rendering | Interiors drew the whole city behind their walls: the casino cost 222 draw calls / 680k triangles, about the street's (shadow pass included). |
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
  The casino went from 222 to 40 draw calls (680k → 55k triangles), the jewellery store from 198 to 40 (§3).
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
The stress suite (390×844 touch, Low) showed 3–6 s frame gaps on every transition, far beyond the M13 build's on
the same machine. Long-animation-frame timing showed an idle main thread: the cost was in the GPU
process. Ruled out by measurement: shader programs (none new on those frames), streamed geometry (smaller than
M13's), the HUD layer count, the map's vector symbols. A bisection of the stylesheet pinned it to one rule: the
touch buttons' base style (a fractional 1.5 px border on round buttons, translucent label text, a redundant
backdrop override), which made every control change re-rasterise the overlay in software. Fixed (2 px border,
solid text), and the other costs found on the way removed too: icons are background images (not CSS masks),
in-game overlays are flat translucent fills (no blurred shadows or per-button gradients), map symbols come from
cached sprites. Result: stress 30/30, worst gap after the first drive 1.7 s (two solo runs; the M13 build on
the same machine: 30/30 and 29/30, 1.7 s and 3.2 s, the 3.2 s on first entering the jail).

The same hunt also measured the Low preset's pixel ratio (raised to 0.85 earlier in the overhaul; back to 0.7, it
is the weak-device preset) and added a shader warm-up, so a browser that builds shaders on their first draw
(Safari) does it behind the loading screen or a settings change, not on first sight of a room or district. The
first version drew the whole scene, hidden objects included, at one pixel: the size table at the gate showed it
cost ~6 s of boot on software GL and kept every hidden mesh resident. What picks a program is the material, the
object kind and the attribute layout, not the geometry; the warm-up now draws one three-vertex stand-in per
distinct combination (192 in the city) with the real objects masked out by layer, so lights carried by hidden
cars are not switched on and the programs built are the ones play uses. An exhaustive draw afterwards finds no
missing program at boot or after any quality change (the first version missed five under the real light state).
Warm draw 4.1 s → 26 ms; resident geometries after boot 476 → 188. What remains is the compile itself, ~5 s on
software GL before the menu (§3), which M13 paid in play instead.

## 3. Performance (G2, G12)

All in headless Chromium on SwiftShader (CPU rasterised), M13 (`5b19596`) against the after build (`b389ca5`) on
the same machine, one at a time. Draw calls and triangles are exact and carry over to a device; milliseconds do
not (KNOWN_ISSUES).

**Phone profile** (800×400 touch, 4× CPU throttle, auto quality → Medium; `tests/perf.mjs` with PHONE=1 and
`tools/perf-scenarios.mjs`): three runs each, alternating builds, medians. Update = game logic per step; render =
one `render()` call's wall time (software raster: it moves with pixels × shader cost).

| Scene | Draw calls | Triangles | Update ms | Render ms |
|---|---|---|---|---|
| Street at the start (calm) | 250 → 252 | 905k → 809k | 12.3 → 11.6 | 65 → 52 |
| Street, busy | 220 → 224 | 676k → 596k | 12.2 → 12.1 | 86 → 43 |
| Valen Point | 83 → 83 | 187k → 187k | 7.6 → 7.2 | 27 → 37 |
| Cedar Fields | 79 → 80 | 247k → 294k | 7.7 → 8.5 | 17 → 34 |
| Downtown on foot | 234 → 238 | 575k → 483k | 8.1 → 11.6 | 35 → 66 |
| Downtown driving | 269 → 268 | 640k → 579k | 11.9 → 9.3 | 54 → 60 |
| Phone map open | 263 → 267 | 644k → 580k | 9.2 → 11.0 | 39 → 53 |
| Casino | 223 → 40 | 685k → 55k | 8.2 → 10.4 | 35 → 21 |
| Jail | 147 → 52 | 393k → 31k | 8.9 → 12.9 | 30 → 17 |

What the numbers say, and what they do not:
- **Interiors** are the big win: 75–85% fewer draw calls and 90–99% fewer triangles in every room (the 73-scene
  capture set agrees: casino 222 → 40, nine businesses 106–198 → 34–40, homes 109–136 → 33, jail 156 → 54).
- **The street** draws the same number of calls with ~10% fewer triangles (tree LOD), ~5% more from the air and
  +19–28% in Cedar Fields (real canopies where there were boxes).
- **Update** is noisy at 4× throttle (one build's three runs span 6.9–15.7 ms in one scene). A per-subsystem
  profile of 120 steps (downtown on foot, then the jail) puts the after build ~1–2 ms higher, spread over the HUD
  card (+0.45 ms), the minimap's outlined labels and sprite badges (+0.33 ms) and the people's extra parts (faces,
  coats, beanies: +0.5 ms); about +0.3–0.5 ms on an unthrottled CPU.
- **Render** time in the open city is higher by design: Medium's pixel-ratio cap went 0.9 → 1.25 (+23% pixels on
  a 1× screen, up to 1.93× on a 2–3× phone screen), and roofs, foliage, terrain and people shade more per pixel. In
  auto quality (the default) dynamic resolution takes the ratio down to 60% of the preset's when frames run long;
  a player who fixes Medium by hand on a phone pays the full fill. Cedar Fields' terrain shader roughly doubles that
  scene's software-raster time. Interiors render faster than M13's.
- **Frame stalls** (stress suite, 390×844 touch, Low, solo, two runs each): worst gap after the first drive 1.7 s
  both runs, M13 1.7 s and 3.2 s (3.2 s on first entering the jail). The first-drive gap itself is noisy on both
  (after 1.7–6.0 s, M13 4.3–5.5 s).
- **Memory over a session** (soak suite, six cycles): geometries and textures plateau, heap flat (123 MB → 123 MB;
  M13 116 → 116).

## 4. Sizes and start-up

`tools/build-cost.mjs`, one quiet run: bytes, then three cold loads each in headless Chromium (SwiftShader,
960×540), medians. "Boot" is navigation to the menu being up (the game's boot flag, set as the menu shows; the
first menu frames are in it). Heap, geometries and textures after a new game and 10 s of simulated play.

| Build | Raw | gzip -9 | brotli | Boot | JS heap | Geometries | Textures |
|---|---|---|---|---|---|---|---|
| M13 `index.html` (`5b19596`) | 3,617,434 | 965,101 | 753,650 | 10.1 s | 141.6 MB | 233 | 47 |
| After `index.html` (`b389ca5`) | 3,679,563 | 985,095 | 769,534 | 15.2 s | 152.9 MB | 239 | 107 |
| M13 release file | 4,018,323 | 1,257,009 | 909,193 | | | | |
| After release file | 4,080,392 | 1,277,010 | 925,398 | | | | |

- **Download:** +62 KB raw, +20 KB gzip, +16 KB brotli (+2.1%): the overhaul is code (shaders, geometry builders,
  CSS, SVG pictograms), no image or model files.
- **Boot:** +5.1 s on software GL. It is the shader compile moved from play to the loading screen (the warm-up,
  §2): M13's own "Compiling shaders" step takes ~0.1 s and its first menu frames ~5–8 s more as the browser builds
  programs on first draw; the after build builds all 101 programs before the menu, then its first frames take
  ~50 ms. M13 builds the rest on first sight in play. On a GPU the compile is far cheaper; not measured on a device.
- **Textures:** the warm-up binds every material once, so all 66.7 MB of the scene's textures are on the GPU after
  boot (M13: 21.5 MB, the rest uploaded as places are first seen; over a session M13 climbs to the same set, soak
  suite 32 → 74 textures). Geometries are back to M13's (a first version of the warm-up uploaded every hidden
  mesh: 447).
- **Heap:** +11 MB (+8%) at this point; not broken down. Over the soak suite's six cycles it stays flat (123 MB
  start and end; M13 116 MB).

## 5. Save compatibility

No save field was added, renamed or removed by the overhaul; `SAVE_VERSION` is unchanged. The after build reads
M13 saves as they are (it uses the main build's keys, `pvunderworld.save.v1`); the M13 snapshot keeps its own.

## 6. How it was checked

- `tools/vqa-shots.mjs <build> <dir> [scene prefixes]`: the same scenes with the same free camera on any build:
  20 world views (day, night, rain, aerial, every district, Cedar Fields, Valen Point), vehicle line-ups and the ten
  one-offs close up, the player and a crowd, play scenes with the game camera (casino, nine business interiors,
  homes, warehouse, pursuit, race start, jail) and the UI on an iPhone-sized touch viewport (HUD on foot and driving,
  phone, Empire, Market, the map, Royale Billions).
- **Capture sets at the gate** (`.shots/vqa-before`, `.shots/vqa-after`, 1024×576, Medium, not committed): 74
  scenes each from `5b19596`'s and `b389ca5`'s builds, with `stats.json` (draw calls, triangles, geometries,
  textures per scene). An earlier before-set had been taken from an M12 build by mistake (a stale stage file);
  it was discarded and every before figure in this file re-measured on M13.
- **Full regression** (`tools/runall.mjs`, 70 suites, three at a time, on `b389ca5`): 1,827 passed, 6 failed (M13
  gate: 1,834 / 8). Every failure is a known load-timing check and passes solo: stress 30/30, arrest 126/126, ui
  23/23, raid 18/18, threat 25/25, unique 58/58; the shots and cityshots scripts complete solo. qashots had stopped
  at its taxi scene since M11 (its phone scene left the player more product than a cab will carry); fixed, it ran
  solo in two parts, 117 scenes then the remaining 30, with no errors.
  Economy 28/28 and royale-sim 17/17: the overhaul moved no balance number and no odds.
- **The release** (`releases/after-graphics/`): `tools/verify-release.mjs` 20/20 on desktop and iPhone profiles;
  SHA-256 matches RELEASE.json. The M13 snapshot is byte-identical to `2f624b6`.
- **Shader coverage**: after boot and after every quality change, an exhaustive draw (every object, hidden or not,
  no culling, both passes, the real light state) builds no program the warm-up did not.

### Visual QA notes (by eye, before/after pairs)
- Clear gains: interiors lit by their lamps; Cedar Fields (canopies and firs for boxes and cones, grass with
  patches and flowers for flat green); trees across the city; the night street with lamp pools; the HUD card and
  pictogram buttons; map symbols.
- Night rain: the wet film and many overlapping lamp streaks lift the whole carriageway toward grey; it reads wet
  but loses the night's contrast. A tuning candidate (film strength at night).
- People: the rounded torso reads as padded shoulders; faces only read close up.
- Cedar Fields at a low camera: the nearest grass shows a streaky smear.
- The casino looks much as it did from the player's camera (its gain is performance).
