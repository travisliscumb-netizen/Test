# Baseline — v5

The rebuild starts from `graysons-spelling-game-v5.html`, which lives in
Dropbox at `/Games/Grayson's Spelling Game/Backups/` (104,277 bytes,
sha256 80b2cb32…c434e6). v1–v5 are all intact there, so it is deliberately
not duplicated into this repository.

Worth knowing: the Dropbox folder's live root file,
`graysons-spelling-game.html`, is **missing** — only `README.md`,
`Backups/` and `Notes/` remain. v5 in `Backups/` is therefore the current
build.

## What the baseline established (must not regress)

- Stage order **FIND -> BUILD -> LEARN**, with LEARN the letter-hunt.
- Grown-ups passcode `9999`; word-list add/remove/reset; device-local only.
- **Letter voice** corrections for A and E, with defaults `eigh` and `eee`
  chosen because engines say "ay"/"aye" as /aɪ/ and clip "ee" to /ɪ/.
- The launch **self-check** banner on the menu.
- A pure, DOM-free core-logic block exported for a node test suite.
- Character identity encoded as data (`airborne` / `falls` / `tumbles`)
  with a rotation budget per character, so "Blip never tumbles" is a
  checked invariant rather than a convention.

## Defects found by reading v5 (drove the rebuild)

1. `attachDrag` adds `mousemove`/`mouseup` listeners **to `window` per
   tile** and never removes them; every re-render leaks another set.
2. `speak()` calls `synth.cancel()` and `synth.speak()` back to back —
   the known iOS race that either drops the utterance or queues both.
3. The `setTimeout(..., 380)` speech kickoffs in `renderFind`/`renderBuild`/
   `renderLearn` are never cancelled, so navigating quickly stacks them.
4. `speakLetters`' per-letter 1600 ms watchdogs keep firing after the
   screen is torn down and go on advancing the chain.
5. No epoch or token on utterances, so a stale `onend` from a cancelled
   utterance still advances the sequence.

(3), (4) and (5) together are the repeated-letter bug: two live chains
speaking the same position. The rebuild removes the class of fault rather
than patching the instance.
