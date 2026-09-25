# Grayson's Dino Rockets

A spelling game for a six-year-old. It's a single HTML file that works offline.
The week's spelling words become a mission through space: one planet per word.
He picks a crew of four dino astronauts, who clear the letters on each planet.
Every finished planet hatches a baby dino with its own super power, and he can
put it in his crew. The week ends with a boss battle against the Meteor King,
which wins rocket parts for new rocket paint jobs.

Open `graysons-dino-rockets.html` in Safari or Chrome. On an iPad or iPhone,
use **Share → Add to Home Screen** and it runs full-screen with its own icon.
Nothing is sent anywhere: words and progress are saved on the device.

## For grown-ups

- Tap the gear on the launch pad. The passcode is **9999**.
- Type or paste the week's list. Commas, spaces, numbering and new lines all
  work. Words need 2 to 12 letters, and a week can have up to 30.
- Any change to the list starts a new mission. Stars earned on a word are
  kept, so a word that comes back later starts from where he left it.
- **How it's going** shows 0–3 stars per word. A star is earned for each
  clean spell from memory. A word that needed help loses one star and gets
  its practice steps back.
- If a phone says "A" oddly when spelling, choose another way of saying A
  or E under **Letter voice** and tap Test.

## The crew

- **Species:** four originals (Rex the T. rex, Trike, Dash the raptor, and
  Swoop the pterosaur), plus every baby he hatches. Each species has its own
  moves:
  - Rex: roars, tail whips, and Rocket Jump grabs.
  - Trike: stomps, charges, Tow Truck, and Boost Jump.
  - Dash: speed sweeps, whirlwinds, Lasso Round-up, and High Jump.
  - Swoop: dive bombs, joy rides, and Sky Hook.
  - Anyone who walks: Tightrope.
- **Super powers:** each baby also has one of its own: Lasso, Bubble Blower,
  Super Magnet, Tunnel Digger or Frost Breath.
- **Dino Base:** everyone he has hatched lives here. Tap a dino, then a crew
  spot, to swap it in. The crew of four is who performs in the scenes and
  hangs out on the planet.
- **Levels:** every scene earns experience (the lead earns most), and so does
  every finished planet.
  - Level 2 brings rope tricks. The originals start there.
  - Level 3 brings Tightrope and the Boost Jump team-up.
  - Level 4 earns a gold star badge, and level 5 a crown.
  - Babies grow up as they level: baby, then kid, then grown.
- **Rocket parts:** beating the Meteor King earns one part a week. Parts
  unlock new rocket paint in the **Hangar**, and the chosen rocket flies the
  missions.

## How a word is practised

Each planet runs a short set of activities. Which ones depends on how well
he already knows the word:

| Stars | Activities |
|---|---|
| 0 (new) | Meet → Zap → Build → Blast |
| 1 | Meet → Letter Race → Missing pieces → Blast |
| 2 | Meet → Spell Check → Rhyme Time (or Missing pieces) → Blast |
| 3 | Meet → Letter Race or Spell Check (taking turns) → Rhyme Time (or Missing pieces) → Blast |

- **Meet:** the word is shown and spelled aloud. Tap any letter to hear it.
- **Zap:** meteors carrying look-alike words fly past, and he zaps the word
  he hears (2 rounds).
- **Build:** he taps or drags letter crystals into the rocket's fuel cells,
  in order.
- **Missing pieces:** he fills the gaps from 3 believable letters. The gaps
  go where he has slipped before.
- **Letter Race:** the word flashes up and disappears, then he races a
  comet to catch its letters as they float around. Beating the comet is a
  bonus; finishing always counts.
- **Spell Check:** he picks the right spelling from three. The wrong ones
  are believable mistakes, never real words. If a grown-up has added an
  example sentence for the word (the ✎ button in the word list), it is shown
  with a blank.
- **Rhyme Time:** only for words in a hand-checked list of true rhyme
  families, so no eye-rhymes like COME/HOME. The shared ending is
  highlighted.
- **Blast:** he spells the word from memory. Two misses on the same letter
  flash the word and light the key. That counts as help, so the word keeps
  its practice next time.

Every correct spelling gets a countdown and a rocket launch, then a crew
scene.
- There are 23 scenes. They include ropes (lasso, tow rope, kite tail, sky
  hook, a washing line of letters to jump for, a tightrope), team-ups, and
  the five super powers.
- Some scenes bring a buddy who watches, gasps and cheers.
- The lead is whoever has waited longest, and the tempo varies a little each
  time.
- A scene never comes back within 3 plays of itself. If one has to repeat
  within 10, it plays the other way round.

When every planet is done, the **Meteor King** boss battle brings back up to
4 of the shakiest words to spell from memory once more (a spaced review).
Each one blasts him with a laser.

The design follows the research on early spelling:
- **Retrieval, not copying:** the word is hidden for Blast.
- **Orthographic mapping:** letter names are heard as each letter is placed.
- **Spacing:** the finale review.
- **Mastery-based fading of support:** the activities get harder as a word
  earns stars.

If he stalls for 9 seconds, he gets a nudge: the prompt again, and a buddy
waving at the answer.

## Developing

The sources live in `src/` and are joined into the one shipped file by
`tools/assemble.mjs`.

| File | What it holds |
|---|---|
| `00-shell.html` | screens |
| `10-ui.css` | interface (phone, small phone and tablet sizes) |
| `15-stage.css` | the crew layer |
| `20-core.js` | pure logic (tested in node): words, mastery, planets, cast, scene planner and validator |
| `30-speech.js` | speech controller |
| `40-sfx.js` | synthesised sound effects and music |
| `50-dinos.js` | character art |
| `60-stage.js` | scene executor and the ambient crew |
| `80-activities.js` | the five activities |
| `90-app.js` | the mission flow |

```
npm run build          # rebuild graysons-dino-rockets.html
npm test               # core + speech unit tests, and a check the built file is current
npm run test:app       # end-to-end playtest in a real browser, with screenshots at 3 sizes
npm run qa:scenes      # every crew scene, normal and mirrored, with filmstrips
npm run qa:glitch      # every scene with every possible lead, traced frame by frame for snaps and pops
node tools/make-icon.mjs && npm run build   # after changing the art
```

The browser tests use Playwright with the Chromium at `/opt/pw-browsers`.
Screenshots go to `../.shots/dino-app` and filmstrips to
`../.shots/dino-scenes`.

URL switches for testing:
- `?mute`: no sound.
- `?speed=4`: crew scenes at 4× speed.
- `?fast`: short flights between planets.
