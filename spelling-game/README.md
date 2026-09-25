# Grayson's Spelling Game (v6)

**`graysons-spelling-game.html` is the whole game.** It's one file with no
install, no account, and no internet needed after it opens.

## Put it on the iPhone or iPad

1. Put `graysons-spelling-game.html` in Dropbox (or AirDrop it, or open it from Files).
2. Open it in **Safari**. Tap **Share**, then **Add to Home Screen**.
3. It gets its own icon (Blip and Zip) and opens full-screen like an app.

## Change the words each week

1. On the main menu, tap **Grown-ups** and enter the passcode **9999**.
2. **Clear all**, tap it a second time to confirm, then type or paste the new list. One word
   per line, commas, spaces or a numbered list all work: `1. frog, jump, said`.
   Any number of words works (up to 30), and each word can be 2–12 letters.
3. Tap **Save & play**.

The list is saved on that device only. Words added on the iPad won't
appear on the iPhone.

**Upgrading from v5:** this version saves its list in a new place, so enter
this week's words once after switching.

**Letter voice:** if spelling AND sounds like "I-N-D", pick a different
spelling for A under *Letter voice* and tap **Test**. Phones don't all
pronounce single letters the same way.

## How a word plays

1. **Intro:** see the word, hear it, hear it spelled.
2. **Find:** listen, then tap the right word out of three real words.
3. **Build:** tap or drag the letters into the boxes, in order.
4. **Learn:** hunt for the letters in a scatter and tap them in order.

After **Build** and after **Learn**, the characters come on and take the
letters away in a short scene. After Learn, they hand the finished word back.

## The characters

| | Moves by | Never |
|---|---|---|
| **Blip** (orange) | jet rig: thrust, rocket rolls, hard braking | tumbles |
| **Zip** (blue) | skateboard: carving, ollies, kickflips, grinds. Very rarely bails | tumbles |
| **Trip** (green) | on foot: runs, stumbles, skids, lands on his backside | does gymnastics |
| **Flip** (red) | acrobatics: cartwheels, handsprings, aerials | falls |

All four share one friendly face: big eyes with pupils that follow what
Grayson taps, brows, and a mouth. So their reactions read even at phone
size: a grin for right, raised brows for surprise, a worried face and a
sweat drop for oops. A thin white rim keeps each one clear against every
world, including orange Blip at sunset and blue Zip at the beach.

### Keeping him going

- **After every correct letter**, one of the buddies does a little hop.
- **The praise changes** ("Great listening!", "Way to go!"…) and never
  repeats the same line back to back.
- **If he stops tapping for about 9 seconds**, the prompt is said again and
  a buddy turns and waves at the answer. This happens at most 3 times per
  screen, so it helps without nagging.
- **Two wrong taps** make the letter he needs glow, in both Build and Learn.

### Why it doesn't look like it's on repeat

- **19 different scenes.** Examples: Blip's tow cord goes slack, then snaps
  taut and topples the stack; Zip bails off a kickflip and chases his board;
  Trip carries a whole tower off and crashes off-screen; Flip kicks letters
  up with handsprings and catches them; the letters line up and march off
  in a parade.
- **Every scene is varied as it plays.** It can be mirrored, run a little
  faster or slower, and a different helper can come in to assist.
- **The four characters take turns leading.** Whoever has waited longest
  goes next.
- **The last 5 scenes are remembered across nights**, so tonight doesn't
  replay last night.
- **Each round has a new world:** morning, sunset, night or beach.
- **Between scenes the characters live on the ground.** They wander and
  show off. They hop over each other, except Trip, who walks straight into
  people. They watch whatever Grayson taps, cheer when he's right and give
  a kind shrug when he's wrong. Tap one and he does a trick.

## For developers

```
src/                 the game, split so the pure logic runs in node
  00-shell.html      markup; the build fills in styles, scripts and icon
  10-app.css         interface
  15-stage.css       characters, cords, particles
  20-core.js         pure logic: words, characters, scene planner (no DOM)
  30-speech.js       the only code that touches speechSynthesis
  40-sfx.js          synthesised sound effects (WebAudio)
  50-art.js          the four characters as rigged SVG
  60-stage.js        the scene executor and the between-scene buddies
  70-app.js          screens and the word round
tools/assemble.mjs   builds graysons-spelling-game.html
tools/make-icon.mjs  renders assets/icon-180.png from the character art
tools/scene-lab.html plays any one scene in a browser
```

```
npm run build        rebuild graysons-spelling-game.html from src/
npm test             pure logic + speech races + "is the build up to date"
npm run test:app     end-to-end playtest of the built file (Playwright)
npm run qa:scenes    every scene, both directions, with filmstrips
```

The game checks itself every time it opens: the green **All set** pill on
the menu runs the word and scene checks. If it turns amber, tap it to see
what it found.
