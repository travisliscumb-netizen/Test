# CURRENT SESSION

- Phase: **Session 14 — graphics / presentation / UI-UX overhaul (Extra High)**, in progress. GRAPHICS.md is the
  before/after record (audit, what changed, measurements). The M13 build is frozen as
  `releases/pre-graphics-m13/Underworld_M13_Before_Graphics.html` (`2f624b6`, tag `underworld-pre-graphics-m13` on
  `5b19596`, created locally; the proxy refuses tag pushes).
- Done: G0 baseline release; G1 audit; first batch `b21e645` (interior culling, light balance, foliage + LOD,
  roofs, vehicle shaping, faces, the capture tool); second batch (this commit): dynamic resolution and pixel-ratio
  caps, HUD v2 (Rank/Rep chip, CASH/BANK tags, pictogram touch buttons), the Dirty-green / Clean-blue currency
  language, map pictograms and landscape tool block, phone groups side by side, Royale landscape layout, banners
  with kickers and the gold fanfare, Cedar Fields / Valen Point terrain shader, wet-road sky film and lamp streaks,
  per-pixel interior lamp light, per-trade interior floors and lamps, rounded bodies, coats and beanies, the
  one-off showcase light, the gold-leaf Corsair.
- Tools: `tools/vqa-shots.mjs` (before/after captures), `tools/build-cost.mjs` (size / boot / heap table).
- Next: the final gate (full regression, after captures and the baseline's missing scenes, phone-profile perf and
  the size table, `releases/after-graphics/` export + verify, docs), then STOP for review.

## Next: Session 14 — graphics / presentation / UI-UX overhaul (Extra High)
Start from KNOWN_ISSUES.md "For the graphics / UI overhaul" (jail HUD, phone and service screens, box-kit business
interiors, casino interior culling, the losing-hour feel of the Royale) and the mobile baseline numbers. Keep the
economy suite green: presentation work must not move a balance number (ECONOMY.md §11 lists the finalised values).
