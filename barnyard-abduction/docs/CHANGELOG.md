# Changelog — Barnyard Abduction (repo build)

Format: Date | Section/Step | Reason | Description | Affected dependencies | Testing performed

This is the changelog for the repository build. The Dropbox project folder has
its own live `CHANGELOG.md`; this entry should be copied there if this build is
promoted to canon.

---

## 2026-08-24 — Full-game implementation pass, S05–S17 (owner-directed one-shot)

- **Section:** S05 Missions · S06 Tractor Beam · S07 Farmer AI · S08 Farmer
  Abduction · S09 Damage/Shields/Danger music · S10 Scoring & Combos ·
  S11 Cheats & HUD · S12 Environmental effects · S13 UI/Settings/Saving ·
  S14 Audio · S15 Optimisation hooks. S02–S04 rebuilt from spec.

- **Reason:** Owner explicitly directed a single-pass build of the whole game
  from the full Dropbox corpus. **This overrides `NEXT_TASK.md`**, which scoped
  the next session to S06 only, and overrides the incremental build rule
  (D-026, Constitution Rule 3). Recording the override rather than pretending
  the incremental process was followed. The owner is the project owner and this
  was a direct instruction, not an inference.

- **Description:**
  - Rebuilt Map 1 to the exact `STEP2_WORLD_SPEC` coordinates: 425×425 ground,
    white picket perimeter fence (instanced) with driveway gate gap and posts,
    farmhouse (-125,-125) and barn (-165,-95) hub, shed (-145,-55), pickup
    (-105,-145), working tractor (-125,-80), plow tractor (120,-105), windmill
    (155,145) h32, kidney pond (115,135), 6-tree irregular grove (-115,120),
    four curved bezier dirt roads, distant tree line and silos beyond the fence.
  - Region and road transitions painted into terrain vertex colours with
    smoothstep falloff — satisfies D-006 (no hard quadrant borders) at zero
    extra draw calls.
  - Barn and farmhouse built as hero assets to Art Bible §6/§7 (gambrel roof,
    frame, cladding, trim, doors with hardware, loft, cupola, weather vane;
    porch, eaves, recessed windows with sills, chimney, storytelling props).
  - Six species + farmer modelled to D-011 / spec §8 with readable anatomy.
    No blocky/voxel forms anywhere in character art.
  - UFO controller: momentum via velocity lerp, bank/tilt, hover bob, boost,
    altitude envelope 4–35, fence clamp, radial push-out vs. the three solid
    landmarks.
  - Camera: chase cam with velocity lead; hold-to-scout height derived per
    frame from `camera.fov` + aspect so the full fence + 5% margin is
    guaranteed in both orientations.
  - Tractor beam split into acquisition / telegraph / renderer / lift /
    consequence per Tech Arch §8. Layered cone, travelling rings, ground pool,
    pulsing lock ring, per-species resistance, release-drops-target.
  - Farmer AI on a rising/falling suspicion meter (PATROL → SUSPICIOUS → ALERT
    → CHASE → AIM), navigates around buildings, fires cartoon turnips with
    deliberate inaccuracy. Abductable; returns unharmed after a delay.
  - Scoring with per-species values, combo tiers to 7×, career total, permanent
    upgrades (5 tracks × 5 levels) paid from career points.
  - All 25 cheats from §27 behind one central `CHEATS.mod` modifier table with
    mutual-exclusion groups.
  - HUD (score/objective/timer/beam state/alert/shields/boost), title, pause,
    result, campaign, upgrades, cheat and settings screens. Autosave.
  - Audio fully synthesised in WebAudio — no external assets, works offline.
    Relaxed loop that ramps on danger (D-018).
  - Auto-quality step-down (shadows, then pixel ratio) if frame time degrades.

- **Affected dependencies:** Everything. S02–S04 were rebuilt rather than
  patched, because the previous `barnyard-abduction.html` could not be read
  (see Assumptions). All later steps sit on this build.

- **Testing performed:** `tools/verify.js` — 86 checks executing the real game
  script against a stubbed Three.js r128 + DOM, driving several thousand
  simulated frames. Covers: construction of world/creatures/UFO, spec
  coordinate conformance, scout framing maths at three real aspect ratios,
  end-to-end beam capture, farmer abduction and return, collision ejection from
  all three solid buildings, mission win/timeout/shield-loss, combo tiers, all
  25 cheats individually plus a 9-cheat stack at 520 animals and 10 farmers,
  save round-trip and corrupt-save recovery, and every UI screen.
  **NOT tested:** anything visual, real GPU performance, or touch on device —
  no browser or GPU is available in the build environment. Two defects were
  found and fixed by this harness: a lost `this` binding in the farmer model
  builder, and a collision dead-centre case where `d == 0` produced no push-out
  direction, leaving the UFO parked inside a building.
