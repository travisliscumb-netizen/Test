# SkiFree

A from-scratch modern recreation of the 1991 Windows classic. Ski downhill, weave
through trees, flatten a snowman, get tripped by a dog, hit the F key, and try
to outrun the Abominable Snow Monster.

Every line of code, every drawing and every sound is original. The art is vector
drawn at runtime and the audio is synthesised live with WebAudio, so there are
no image or sound files at all. Not affiliated with Microsoft.

---

## Running it

It is a static site with no build step and no dependencies.

```
cd skifree
node tools/serve.mjs          # http://127.0.0.1:8080
# or: python3 -m http.server 8080
```

ES modules need a real origin, so opening `index.html` from `file://` will not work.

**Deploying:** push the `skifree/` folder to any static host. `vercel.json` and
`netlify.toml` are included. Set the project root to `skifree/` and leave the
build command empty.

---

## Controls

| Key | Action |
|---|---|
| `←` `→` / `A` `D` | Steer. Keep pushing across the hill to stop, then sidestep |
| `↑` / `W` | Swing the skis straight downhill and tuck |
| `↓` / `S` | Snowplough brake |
| `Space` | Hop. Ramps launch you properly |
| In the air | `↑` backflip · `↓` spread eagle · `Space` helicopter. Land it or wipe out |
| `F` | **Go fast.** Much faster, much harder to steer |
| `Esc` / `P` / `F3` | Pause (Resume / Restart / Main menu) |
| `R` / `F2` | Restart the run |
| Mouse | The skier heads toward the pointer, like the original. Click to hop |
| Touch | Hold anywhere: the skier heads for your finger. Flick up/down for tricks. HOP and TURBO buttons (multi-touch). Arrow buttons available in Options |

---

## The game

- **The slope** is endless and deterministic: the same mountain number always
  builds the same mountain. Biome patches (open snow, woods, glades, rock
  fields, mogul fields, terrain parks) blend into each other, and hand-shaped
  set pieces give it landmarks: tree-ringed clearings, a tree wall with one gap,
  jump lines, snowman families, rock gardens, dead groves.
- **The start** has the classic signposts: **Slalom** and **Tree Slalom**
  courses to the left, **Freestyle** to the right (ramps and moguls), and a
  chairlift running down the mountain. The courses are **timed**, as in the
  original: ski through the START arch, thread the gates (each miss adds 5 s),
  cross FINISH. Best times (and best freestyle style) are saved.
- **Tricks:** off a ramp, `↑` backflips, `↓` spread-eagles and `Space`
  helicopters. Landed tricks score style; landing mid-trick is a wipeout.
- **Other people:** skiers, careless beginners, snowboarders who launch off
  ramps, and dogs. Some dogs follow their owners, some wander, and bold ones
  sprint across your line on purpose.
- **Collisions** are comic and short. Trees and big rocks put you on your face,
  stumps, small rocks and dogs make you tumble, snowmen explode, and slalom
  flags just fall over. You're back up in about a second.
- **The Yeti** comes out at **every 1000 m mark** (Classic mode: once, at
  2000 m, at its original pace). The first one is slow and plain skiing loses
  it; every time you get away it comes back a little faster (9 m/s, +1.2 per
  escape, capped at 23). Around the sixth chase it matches your cruising
  speed and from then on you need turbo. The HUD shows its level, and after
  an escape a toast tells you which mark it's coming back at. It also comes
  sooner if you dawdle (40 s without
  real downhill progress, with a warning roar at 28 s) or wander off the side
  of the mountain, just like the original. From behind, from the side, or from
  ahead; a HUD alert shows how far behind it is. It predicts where you're going, steers around trees it sees coming,
  and is faster than you at cruising speed. On `F` you are faster than it, but
  you steer like a shopping trolley. Trees it doesn't dodge knock it flat. Stay
  far enough ahead for long enough and it gives up (+500 style). It comes back
  700 m later, a little faster each time. If it catches you it eats you.
- **Score** = metres travelled + style (air time, ramp jumps, slalom gates,
  Yeti escapes). Best score, longest run and top speed are saved locally.

---

## Layout

```
skifree/
  index.html            shell + every screen's DOM
  icon.svg, manifest.webmanifest
  src/
    config.js      every tuning number in one place                    (pure)
    rng.js         hashing, seeded PRNG, value noise                   (pure)
    objects.js     static object catalogue: footprint, height, reaction (pure)
    world.js       chunked deterministic slope generation              (pure)
    player.js      skier physics: heading vs travel, turbo, jumps      (pure)
    actors.js      skiers, snowboarders, dogs                          (pure)
    yeti.js        pursuit, avoidance, stumble, grab, give up          (pure)
    game.js        one run: collisions, scoring, camera, events        (pure)
    autopilot.js   a bot: drives the title screen and the tests        (pure)
    palette.js     colours and outfits
    sprites.js     scenery vector art, cached per zoom level
    characters.js  skier / boarder / dog / yeti / chairlift, drawn live
    render.js      snow, tracks, particles, y-sorted scene, overlays
    audio.js       synthesised SFX, skiing loops, calm + chase music
    input.js       keyboard, mouse steering, touch buttons
    save.js        versioned, validated localStorage
    main.js        loop, screens, HUD, glue
    styles.css
  tests/
    sim.mjs        headless: determinism, spacing, pathing, physics, yeti, save
    playtest.mjs   end-to-end in Chromium: desktop, phones, touch, soak
  tools/
    serve.mjs      static server
    shots.mjs      captures a scripted run
    moments.mjs    stages poses, eating frames, landmarks and phone layouts
```

Everything marked *pure* imports nothing from the DOM. The tests drive exactly
the code the game runs.

---

## Design decisions worth knowing

**Heading and travel are separate angles.** The player steers the skis; the
skier's actual direction chases them at a grip rate that falls with speed, and
any angle between the two scrubs speed and throws spray. That lag is the whole
"snow is slippery" feel: crisp carving when slow, long sliding arcs on turbo.
Turn rate also falls with speed and is roughly halved again on `F`.

**The Yeti ramps; turbo always wins.** Cruising tops out at 54 km/h and turbo
at 90. The Yeti starts at 32 km/h and gains about 4 km/h per escape, so
early chases are won just by skiing, later ones only on `F`. It is capped at
83 km/h, so `F` is always enough if you keep it off the trees. It gets a mild
catch-up boost when far behind, but never against turbo.

**Nothing can wall you in.** Scatter places at most one object per 64u grid
cell, with jitter confined so that neighbouring centres are at least 42u apart.
The biggest trunk is 13u in radius, which leaves a gap of at least 16u. The
skier is 12u wide, so they always fit through. The Yeti (24u) doesn't, which is
why dense woods cost it ground. Set pieces and fixed features follow the same
rule. `tests/sim.mjs` verifies it over 40 km of slope, and also flood-fills
rasterised bands to prove a top-to-bottom path exists.

**Deterministic, in any order.** Every chunk, region and grid cell hashes its
own seed from `(world seed, coordinates)`, so chunks can be generated,
evicted and regenerated in any order and always come out identical. Actors,
the Yeti's approach and moguls' wipe-out rolls use a per-run stream seeded from
the same number.

**You can't get trapped.** After getting up you ghost through obstacles
briefly, and that ghosting extends for as long as you're still overlapping
something. Impacts also knock you to the side you hit, so you stand up beside
the tree instead of above it.

**The camera trades look-ahead for speed.** As you speed up, the skier slides
up the screen and the view widens by 10%, so turbo gives you more warning, not
less. Small phones relax the minimum view so the skier stays at least about
23 CSS pixels tall.

**Readability.** A tall sprite drawn over the skier gets a ghosted silhouette of
the skier on top. The Yeti gets a pulsing edge marker whenever it's off-screen.
Spray particles have a faint rim so white reads on white.

**Sim at 120 Hz, render at display rate.** Each frame is split into equal
sub-steps of at most 1/120 s, so physics is identical on 60, 120 and 144 Hz
screens and a hitch can't tunnel the skier through a tree.

---

## Testing

```
node tests/sim.mjs                                   # headless suite (~1 min)
node tests/sim.mjs --quick                           # fewer seeds
NODE_PATH=$(npm root -g) node tests/playtest.mjs     # browser suite, needs Playwright
NODE_PATH=$(npm root -g) node tools/moments.mjs      # screenshots to .shots/
```

`sim.mjs` checks world determinism (including generation order and
regeneration), object spacing, that no objects overlap, that the start corridor
is clear, and path existence. It also checks generation and step cost, bot
runs that must never stall with bounded memory, top speed and turbo, that
turning gets harder with speed, stopping and sidestepping, braking, hop height,
no bunny-hopping, that you can't be trapped by one tree, and crash recovery
time. For the Yeti it checks that a stopped skier is eaten, that cruising loses
the first one but not a level-9 one, that turbo still escapes at level 9,
that its pace rises with every escape and stays under turbo, that it is due
at every 1000 m mark (2000 m in Classic) and returns at the next mark, that it never
spawns inside an obstacle, that its approach varies, and that you can jump
over it. It also covers save sanitisation, persistence and blocked storage.

`playtest.mjs` drives the real page: menus, Enter to start, keyboard and WASD
steering, turbo, a sub-frame Space tap, pause freezing the sim and audio, `R`,
the Yeti appearing and switching the music, getting eaten, the game over
screen, instant retry, mouse steering, resize, pausing on blur, and settings
and records surviving a reload. It then runs a 12-second bot soak that checks
FPS and heap growth. At phone sizes it checks touch steering, multi-touch turbo
plus hop, the pause button, that the skier is readable, and that the page
doesn't overflow. It fails on any console error, page error or failed request.
