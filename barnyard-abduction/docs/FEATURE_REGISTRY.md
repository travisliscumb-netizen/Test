# Feature Registry — Barnyard Abduction (repo build, 2026-08-24)

Status vocabulary: PLANNED | DESIGN_FINAL | BUILDING | REVIEW_READY | TESTING | FINALIZED | BLOCKED

**Read the Implementation column, not the Design column, to know what is
actually playable.** Nothing here is FINALIZED — per the project's own rule,
only the owner marks FINALIZED, and only after on-device review.

| Step | System | Design | Implementation | Notes |
|---|---|---|---|---|
| S01 | Foundation | DESIGN_FINAL | REVIEW_READY | Single-file Three.js r128, iPhone-first, no build step. |
| S02 | Farm World | DESIGN_FINAL | REVIEW_READY | Rebuilt to exact spec coordinates. Fence, farmhouse, barn, shed, windmill, pond, grove, plowed field w/ furrow geometry, bezier roads, outside scenery. Region blending via terrain vertex colours. |
| S03 | UFO Controller | DESIGN_FINAL | REVIEW_READY | Momentum lerp, bank/tilt, bob, boost, altitude 4–35, fence clamp, radial push-out vs. 3 solid landmarks. Dead-centre collision case fixed. |
| S04 | Camera + Scout | DESIGN_FINAL | REVIEW_READY | Chase cam w/ velocity lead. Scout height derived from fov+aspect each frame; verified to frame fence + 5% at 390×844, 844×390 and 820×1180. |
| S05 | Missions / Progression | DESIGN_FINAL | REVIEW_READY | 5 Farm missions, linear unlock, replayable, per-mission best score. Campaign screen shows the other 9 maps as explicitly not-built. |
| S06 | Tractor Beam | DESIGN_FINAL | REVIEW_READY | Hold-to-activate, layered cone + travelling rings + ground pool, auto-lock nearest eligible, pulsing telegraph ring, per-species resistance, release drops target. |
| S07 | Farmer AI | DESIGN_FINAL | REVIEW_READY | Suspicion meter drives PATROL/SUSPICIOUS/ALERT/CHASE/AIM. Navigates around buildings. Cartoon turnip projectiles with deliberate inaccuracy. |
| S08 | Farmer Abduction | DESIGN_FINAL | REVIEW_READY | Comedic flailing lift, never harmed, returns from the farmhouse after a delay and resumes patrol. Verified end-to-end. |
| S09 | Damage / Shields / Danger | DESIGN_FINAL | REVIEW_READY | Shields w/ i-frames and delayed regen, shield bubble visual, damage flash, music danger ramp, forgiving non-graphic failure. |
| S10 | Scoring / Combos | DESIGN_FINAL | REVIEW_READY | Per-species values, combo window w/ tiers to 7×, career total, breakdown on the results screen. |
| S11 | Cheats + HUD | DESIGN_FINAL | REVIEW_READY | All 25 cheats via one central modifier table with mutual-exclusion groups. HUD always visible. |
| S12 | Environmental Effects | DESIGN_FINAL | REVIEW_READY | Pooled particles, beam dust, impact bursts, shader-wind grass, water sheen, rotating windmill, 5 weather modes. |
| S13 | UI / Settings / Saving | DESIGN_FINAL | REVIEW_READY | Title/pause/result/campaign/upgrades/cheats/settings. Autosave w/ corrupt-save recovery. Permanent upgrades. |
| S14 | Audio | DESIGN_FINAL | REVIEW_READY | Fully synthesised WebAudio — no external assets. Semantic event layer, per-species calls, dynamic danger music. |
| S15 | Optimisation | DESIGN_FINAL | PARTIAL | Instancing, particle pooling, distance-throttled AI, shared geometry, auto quality step-down are in. **Real device profiling has not happened** — that is the main open item. |
| S16 | Full Regression Pass | DESIGN_FINAL | PARTIAL | 86 automated headless checks pass. On-device regression not done. |
| S17 | Polish / Campaign Expansion | DESIGN_FINAL | PLANNED | Maps 2–10 deliberately not built — each needs its own research pass per the map-authenticity rule. |

## Campaign

Map 1 (Farm) is built. Maps 2–10 are declared in the registry with
`built:false` and shown in the UI as not-yet-built. They are **not stubbed** —
faking them would violate the no-stub rule. Core systems are already
map-agnostic, so each new map plugs in by supplying bounds, regions, landmarks,
prop palette, spawn zones, NPC set, missions and lighting.

## Before anything here is marked FINALIZED

The owner must open `barnyard-abduction.html` on iPhone Safari and confirm the
checklist in `REVIEW_QUEUE.md`. Automated checks cannot substitute for that.
