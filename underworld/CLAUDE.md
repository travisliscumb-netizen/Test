# CLAUDE.md — working on The Underworld

Read this first, then `CURRENT_SESSION.md` (what is in progress and the exact next action) and `ROADMAP.md`.

## Authority
- `docs/THE_UNDERWORLD_MASTER_HANDOFF_FINAL.md` is the design. Owner rulings are §45.1–§45.n at its end and win
  over older text. §45.39 sets the current phase: autonomous pre-graphics build to CONTENT COMPLETE.
- `docs/THE_UNDERWORLD_BUILD_SESSION_PROMPTS.md`: the session plan (Sessions 7–13 remain; 14 graphics is NOT this phase).
- `OVERHAUL_STATUS.md`: the detailed per-session history (long). `DECISIONS.md` summarises the rulings that matter.

## Repository rules
- Branch `claude/practical-lamport-zld81y`; push with `git push -u origin claude/practical-lamport-zld81y`.
- No pull requests unless asked. No model identifiers in commits or files. Commit messages end with the
  Co-Authored-By / Claude-Session lines the harness gives.
- Source is `src/` (concatenated in `src/manifest.json` order). Build: `node underworld/tools/build.mjs`
  (`--check` verifies `index.html` is byte-identical to the build). Never edit `index.html` by hand.
- Commit and push working progress often; a stop hook requires a clean, pushed tree.

## Engineering rules
- One source of truth per system; no parallel legacy paths. Old sessions are history, not frozen code.
- Every money movement goes through `Money` (`035`) with a declared source tag (static-money suite enforces it).
- Save fields: add a default in `SaveSystem.defaults`, sanitize in the owning system's `static sanitize`, keep
  loads idempotent; never bump `SAVE_VERSION` for an additive field.
- Police are not omniscient: knowledge comes from sight (`copCanSee`), witnesses, cameras, plates, the case file.
- Mobile budget: 60 FPS ideal, 45 acceptable, 30 floor. Stream, instance, reuse; measure big additions.
- Stop for the owner only per §45.39 (true blocker, very large rewrite, High/Extra High checkpoint, CONTENT COMPLETE).

## Tests
See `TESTING.md`. Every milestone: its own suite, the affected suites, then the full regression runner.
