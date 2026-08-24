# Assumptions, deviations and open questions

Written per the Definition of Done in `NEXT_TASK.md` §5 and the Assumptions
Register (studio doc 16). Everything here is a decision I made without being
able to ask, or a documented departure from the written process.

---

## A-1 — The existing prototype's code could not be read

`barnyard-abduction.html` (17 KB, the canonical build) could not be retrieved.
The network policy in this environment blocks `dropboxusercontent.com`, and the
Dropbox text-extraction path strips `<script>` contents, so only the visible
HTML text came back — none of the JavaScript.

**Consequence:** S02–S04 were rebuilt from `STEP2_WORLD_SPEC.md` and
`STEP4_CORE_GAMEPLAY_SPEC.md` rather than extended in place. The specs are
precise enough that the rebuilt world should match the described one closely,
but this is a rebuild, not a patch, and the previous session's actual
implementation choices are not preserved.

**If that matters,** the prior file is untouched in Dropbox and can be diffed
against this build by someone with read access to it.

---

## A-2 — Scope override: whole game instead of S06 only

`NEXT_TASK.md` (the newest file in the folder) scoped the next session to
**S06 Tractor Beam only**, ending with "Stop. Do not start S07 or any other
step." D-026 and Constitution Rule 3 say the same thing structurally.

The owner explicitly directed a single-pass build of the entire game from the
full corpus. That is an owner decision overriding a queued task, so I built the
whole thing — but the override is recorded here and in the changelog rather
than quietly glossed over. **The incremental build/test/freeze discipline was
not followed for S05–S17.** They were built together and verified together.

---

## A-3 — What stands in for a "target" is now real, not a placeholder

`NEXT_TASK.md` anticipated that S06 would need a placeholder target type
because no animals existed yet. That is moot: S05 creatures were built in the
same pass, so the beam acquires real animals and real farmers. No placeholder
target type exists in the build.

---

## A-4 — Values I chose that the docs deliberately left open

The design docs set direction and explicitly deferred numbers to play testing.
These are my starting points, all in `TUNE` / `SPECIES` and trivially tunable:

| Thing | Value | Basis |
|---|---|---|
| Species points | chicken 10, sheep 25, goat 30, pig 35, cow 60, horse 80 | §11 hierarchy: smaller/easier = lower |
| Beam grab time | base 1.0s × species resist (0.6 chicken → 2.4 cow) | §5 "chicken quick, cow longer" |
| Combo window | 4.2s, tiers at 2/3/5/8/12/20 → 2×…7× | §12 asks for 2×/3×/5×/10× feel |
| Mission set | 5 missions, 8→34 animals, 165–210s | §5 core loop; escalation via count + farmers |
| Farmer damage | 12 per hit, 100 shields (+25/upgrade) | §7 "forgiving by default" ≈ 8 hits |
| Upgrade costs | 700–16000 career points, 5 levels × 5 tracks | no guidance existed; tuned so level 1 lands after ~2 missions |

None of this is balanced by play. It is balanced by arithmetic and needs a real
session with the intended player.

---

## A-5 — Slow-motion does not slow the mission timer

The Slow Motion cheat scales world simulation but not the player's controller
and not the countdown. Otherwise it would be a straight difficulty reduction
disguised as a visual toy. §27 says "slows world simulation while maintaining
usable player control", which I read as supporting this. Flag it if you meant
the timer to slow too.

---

## A-6 — Three.js loads from a CDN

The file needs one online load of Three.js r128. Everything else — geometry,
materials, audio, UI — is generated at runtime, so there are no asset files and
nothing else is fetched. If fully-offline play matters, the library would need
to be inlined, which would add roughly 600 KB to the file.

---

## A-7 — Maps 2–10 are declared, not stubbed

They appear in the campaign screen as locked with "not built yet". I did not
generate placeholder versions, because the map-authenticity rule (D-023) says
each environment must be researched before implementation and must not recycle
farm assets. Ten fake maps would have been the fastest way to violate the
clearest rule in the corpus.

---

## Open questions for the owner

1. **Promote or keep separate?** This build lives in the repo. The Dropbox
   canon still points at the old `barnyard-abduction.html`. Per the prototype
   policy in `PROTOTYPE_EXPERIMENTS.md`, this is an unreviewed build until you
   review it — it should not be referenced as current until you say so.
2. **The two large prototypes** (`-full.html`, `-visual-upgrade.html`, ~650 KB
   each) are still unreviewed. I did not read them — same network block as A-1.
   They may contain UI or rendering ideas worth salvaging.
3. **Difficulty.** Is 8 turnip hits before failure right for the intended
   player, or should the default be more forgiving still?
4. **Which map is next?** Small Town is next in the locked order and would need
   its own research pass before implementation.
