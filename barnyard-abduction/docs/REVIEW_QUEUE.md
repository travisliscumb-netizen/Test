# Review Queue — Barnyard Abduction

## Entry 001 — Full game build (S02–S14), 2026-08-24

**What was built:** The complete game — farm world, UFO controller, camera and
scout view, tractor beam, six animal species with personality AI, farmer AI with
projectiles and abduction, shields/damage, scoring and combos, five missions,
permanent upgrades, all 25 cheats, full UI, autosave, and synthesised audio.

**File changed:** `barnyard-abduction/barnyard-abduction.html` (single file,
~199 KB, ~4,400 lines). Authoring sections in `build/`, reassembled by
`tools/assemble.sh`.

**Changelog entry:** `docs/CHANGELOG.md`, 2026-08-24.

**Status:** REVIEW_READY. Not FINALIZED — only you mark that, and only after
the checks below on a real device.

---

## What to check on iPhone Safari

Automated verification covers logic and maths. It cannot see the screen or feel
the controls. These are the things only you can confirm.

### Blocking — the build is not review-passed without these

1. **Movement has real momentum.** The saucer should coast and settle, not snap
   to a stop when you lift your thumb. If it feels rigid, `TUNE.ufo.drag` and
   `accel` are the two knobs.
2. **Scout framing.** Hold SCOUT. The entire white fence must be visible with a
   clear margin outside it on all four sides — in **both portrait and
   landscape**. Rotate the phone while holding it. This is the check that has
   historically been got wrong; the maths is derived rather than hard-coded, so
   if it fails the fault is in the derivation, not a stale constant.
3. **Collision.** You cannot pass through the barn, farmhouse or windmill, and
   you cannot leave the fence. Ramming a building should push you out smoothly,
   never stick or clip.
4. **Beam readability.** Hold BEAM near an animal. You should immediately
   understand: what is targeted (pulsing gold ring), that it is being lifted
   (ring turns blue, animal spins upward), and that you got it (burst + score).
   A five-year-old should not need this explained.
5. **Frame rate.** Normal play should feel smooth. The build steps down shadows
   then resolution on its own if it detects trouble — note whether that kicks in,
   because it means the default settings are too ambitious for the device.

### Visual — against `barnyard photo.jpg`

6. Is it **bright, saturated and cheerful**, or has it drifted dull/muddy?
7. Do the **barn and farmhouse read as real buildings** with construction logic,
   or as decorated boxes? This is the Art Bible's hardest bar.
8. Do **animals read as their species** at gameplay distance and from scout view?
9. Anything **blocky or Minecraft-like** anywhere? That is an automatic reject
   per D-010 / D-011.
10. Does the farm feel **lived-in** — troughs, bales, barrels, paddock, scarecrow
    in the right places, or randomly sprinkled?

### Feel and tuning

11. Is the farmer **fun-annoying or genuinely frustrating**? Default is meant to
    be forgiving.
12. Are the **missions the right length**? 8 animals in 3 minutes to start.
13. Do **combos feel achievable**, or is the 4.2s window too tight?
14. Is the **HUD readable** without covering anything important?
15. Try **Peaceful Farmer + God Mode** — is that a genuinely relaxing way for a
    young child to just fly around?

### Stress

16. Turn on **10× Animals** (520 animals) and **Farmer Army at 10**. Note what
    happens to the frame rate — this is the intended stress test from §25.

---

## Known open items

- **No device profiling has been done.** S15 optimisation is partial.
- Balance numbers are arithmetic, not play-tested. See `ASSUMPTIONS.md` A-4.
- The prior `barnyard-abduction.html` could not be read, so S02–S04 are a
  rebuild from spec rather than a patch. See `ASSUMPTIONS.md` A-1.
- Maps 2–10 are intentionally not built.

---

## After review

If it passes: promote per the prototype policy — review against DECISIONS and
WORLD_BIBLE, document what changed, sign off, and merge into the single
canonical file in Dropbox. If it fails, note which numbered check failed; every
one of them maps to a specific tunable or builder function.
