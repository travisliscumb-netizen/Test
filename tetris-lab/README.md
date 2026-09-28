# Prismfall

A modern falling-block puzzle game in two parts:

- **Classic** — Marathon, Sprint (40 lines) and Ultra (2 minutes) with the Super
  Rotation System, hold, ghost, a six-piece preview, guideline scoring (Tetrises,
  T-Spins, back-to-back, combos, perfect clears), and a **hidden assist** that
  quietly shapes the piece sequence around your board.
- **AI Tetris Lab** — a design laboratory that invents new falling-block games,
  builds them, play-tests them with bots, critiques the results, redesigns them
  and only then lets you play them. Designs can be saved, renamed, edited,
  re-tested, compared, mixed into custom piece sets, and replayed.

Zero-build static site: plain ES modules, synthesised audio, no runtime
dependencies, installable and fully playable offline.

---

## Running

```
cd tetris-lab
npm start            # serves on http://127.0.0.1:8080
```

Any static server works; ES modules need a real origin, so `file://` does not.

## Verifying

```
npm test             # 80 unit tests (engine, input, assist, Lab, save)   ~15 s
npm run playtest     # end-to-end in Chromium: keyboard + touch play, pause,
                     #   results, a full Lab session -> save -> play -> modify
                     #   -> re-test, settings, reload persistence, corrupted
                     #   save recovery; fails on any console error      ~90 s
npm run shots        # screenshots of every screen at six viewports -> .shots/
```

The playtest and screenshot tools use Playwright's Chromium.

---

## Layout

```
src/
  engine/        DOM-free, deterministic, runs identically in Node
    rng.js         seeded PRNG; nothing in engine/ or lab/ uses Math.random
    lattice.js     square + hexagonal geometry: rotation, adjacency, projection
    pieces.js      generalised piece definitions -> compiled states + kick tables
    board.js       grid, collision, line / gap / colour-group detection,
                   bombs, cascade gravity, garbage
    clearing.js    clear detection/application shared by game and bot
    rules.js       concept (JSON) -> ruleset compiler, the one data contract
    game.js        the state machine: spawn, SRS, lock delay, hold, IRS/IHS,
                   scoring, levels, goals, clear animation phases, events
    randomizer.js  bag / weighted / scripted generators
    bot.js         general placement bot (El-Tetris features, any lattice)
    assist.js      the hidden assist
  lab/           the AI designer, also DOM-free
    generator.js   14 design archetypes + procedural piece growth
    validate.js    structural safety gate
    simulate.js    expert + human-proxy bot play-testing, invariant checks
    critic.js      metrics -> scored review with named weaknesses
    refine.js      targeted fixes for each weakness
    designer.js    the loop: generate -> validate -> simulate -> critique ->
                   refine -> ... -> confirm on fresh seeds
    claude.js      optional Claude designer (your own API key)
    worker.js      runs sessions off the main thread
  render/        sprite-cached blocks, board renderer, particles, background, themes
  audio/         synthesised SFX + adaptive generative music
  ui/            app shell, screens, debug panel
  input.js       DAS/ARR keyboard controller, touch gestures, gamepad
  save.js        versioned, sanitising persistence; progression; achievements
tests/           node:test suites + Chromium playtest
tools/           static server, screenshot tour, contact sheets, icon rasteriser
```

---

## Design decisions worth knowing

**One engine, many games.** Classic is not special-cased: it is a concept
(`CLASSIC_CONCEPT` in `rules.js`) compiled like any Lab design. Every
experimental mechanic — hexagonal cells, wrap-around walls, colour matching,
cascade chains, bombs, wild cells, rising garbage, gap-tolerant rows, morphing
pieces, mirror-only pieces, diagonal and gapped pieces, per-piece weight, and
timed (gravity-free) placement — is a field in that same JSON. Adding a mechanic
means adding a field, a check in `validate.js`, and a clause in `critic.js`.

**Cells are not assumed to be square.** Geometry lives in `lattice.js`. Hex
pieces are authored in axial coordinates and stored on an odd-q offset board;
translating a hex shape by one column shifts half its cells vertically, so each
compiled state carries two offset variants (one per column parity). Collision,
ghost, line clears, bombs, rendering and the bot then work unchanged.

**The hidden assist projects before it helps.** With a five-piece preview, a
piece entering the queue is played five pieces from now, so evaluating the
current board would be pointless. The assist lets the bot play the queue on a
scratch board, scores every candidate piece there, and tilts probabilities by
`exp(beta * z)`. `beta` rises with danger and falls as the player's placements
approach the bot's own. A long-run fairness term, drought boosts, a hard
anti-repeat rule and a 42% probability cap keep the sequence patternless.
Measured: frequencies within ±1% of uniform, never three in a row, and a
struggling player's survival rose from 8/16 to 13/16 runs compared with the 7-bag.
Open the developer panel during a Classic game to watch its decisions live.

**The Lab's critic is calibrated against Classic.** The simulator plays Classic
with the same bots, and those numbers (player survives ~77% of a 200-piece test,
stack ~50%, a clear every ~4 pieces) define the "well-tuned" band. Classic
itself scores well but is rejected as a Lab result for lack of novelty. Every
weakness costs points, designs that perfect play cannot survive are capped, and
an accepted design is re-simulated on fresh seeds before acceptance stands.

**Claude never gets a free pass.** Concepts from Claude pass through the same
validator, simulator and critic; the critic's findings are sent back to Claude
for a revision round. The key stays in the browser (never in save exports) and
requests go only to `api.anthropic.com`.

**Nothing trusts saved or generated data.** Saves are re-validated field by
field on load, unparseable saves are backed up before being replaced, a save
written by a newer build is never overwritten, and a design cannot reach the
game without passing `validateConcept`.

---

## Developer panel

Ctrl+Shift+D, `?debug` in the URL, or tap the title logo seven times. Includes:
live assist decisions (utilities, z-scores, probabilities, danger, mastery,
player skill) and a strength slider; force the next piece; board presets
(I-well, T-spin double slot, danger stack); level, gravity freeze and bot
autoplay; effect and sound triggers; save corruption tests; Lab stress tools;
frame-time and particle counters.

## Known limits

- The simulator plays instantly, so time pressure (gravity, the placement clock,
  heavy pieces) is modelled as reduced accuracy of the human-proxy bot rather
  than timed play. It is a proxy, and the critic's scores should be read that way.
- Without network access the Fredoka display font falls back to the system
  rounded/sans font; every layout is checked to hold with the fallback.
- "Tetris" is a trademark of The Tetris Company. The product is named Prismfall;
  the Lab's name follows the brief and should be reviewed before public release.
