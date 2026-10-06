# Build Brief — Modern Sprite FPS (Doom-style remake)

**Owner:** Travis
**Builder:** Claude Code
**Status:** Ready to start at Milestone 0

---

## 1. Vision

A modern remake of the classic Doom experience. The soul stays the same: fast run-and-gun combat, sprite-based enemies, weapons, and pickups. Everything around the sprites is pushed to today's standards — real 3D levels, dynamic lighting, shadows, particles, and post-processing.

**Rule: no old constraints.** Do not imitate 1993 limitations (no raycaster, no flat single-height maps, no low-res rendering, no palette limits). If something can look or feel better with modern techniques, do it — as long as it keeps the sprite aesthetic and hits the performance targets in Section 9.

---

## 2. Legal guardrail

- Do **not** use any original Doom assets, WADs, sounds, music, logos, or the name "Doom" in the shipped game.
- The game is *inspired by* Doom. All art comes from Travis or is original placeholder art made by Claude Code.
- Working title is TBD (see Section 14). Use `working-title` in code and config until named.

---

## 3. Target platforms

- **Desktop browsers:** Chrome, Edge, Firefox, Safari (latest stable).
- **Mobile browsers:** iOS Safari and Android Chrome (latest stable). Landscape orientation.
- Installable as a **PWA** (manifest + service worker for offline play after first load).
- One codebase for both. Input and quality settings adapt to the device; gameplay does not.

---

## 4. Tech stack

| Area | Choice | Notes |
|---|---|---|
| Engine | **Babylon.js** (latest stable, ES module packages) | `@babylonjs/core`, `@babylonjs/loaders`, `@babylonjs/gui` as needed |
| Physics | **Havok** via `@babylonjs/havok` | Babylon's official physics plugin. Do not use Cannon/Ammo/Oimo. |
| Debugging | `@babylonjs/inspector` | **Dev builds only**, toggled by a key (e.g. backtick). Must not ship in production bundle. |
| Language | **TypeScript** (strict mode) | |
| Build tool | **Vite** | Dev server, production build, asset handling |
| Testing | **Vitest** (unit) + **Playwright** (browser smoke tests) | See Section 12 |
| Renderer | **WebGL2 baseline**; WebGPU optional | Detect WebGPU at runtime and use it if available and stable; always fall back to WebGL2. WebGL2 path must be fully supported and tested. |

Import only the Babylon modules used (tree-shaking). Do not import the full `babylonjs` UMD bundle.

---

## 5. Rendering — sprites (billboards)

All characters, weapons-in-world, pickups, and decorations are **sprites in true 3D space**.

### 5.1 How sprites are built
- Each sprite is a **textured quad mesh**, not Babylon's `SpriteManager` (SpriteManager sprites do not take scene lighting or cast shadows properly).
- Quads use **Y-axis billboarding** (`BILLBOARDMODE_Y`) so they turn to face the camera but stay upright — no tilting when the player looks up or down.
- Materials use **alpha testing** (cutout), not alpha blending, so sprites sort correctly, write depth, and cast clean shadows. Alpha blending only for effects (smoke, glows).
- Feet are anchored to the ground (quad pivot at bottom center).

### 5.2 8-direction rotation
- Enemies have **8 view angles** like the original. Each frame, pick the angle from the camera's position relative to the enemy's facing direction.
- Support **mirroring** so Travis can supply 5 angles (front, front-side, side, back-side, back) and the other 3 are flipped automatically. Config flag per sprite set.

### 5.3 Modern sprite upgrades (required)
- **Dynamic lighting:** sprites are lit by scene lights (muzzle flashes, fire, lamps).
- **Normal maps (optional per asset):** if a `_n` normal map is supplied, use it so light wraps across the sprite for depth. If not supplied, sprites still render and light correctly as flat.
- **Emissive maps (optional per asset):** `_e` map for glowing eyes, fireballs, screens — feeds into bloom.
- **Shadows:** sprites cast and receive shadows using their alpha cutout.
- **Hit flash:** brief white/red flash shader when damaged.
- **Death dissolve or gib effect:** shader-driven, plus particles.
- **Rim/back light:** subtle edge light so enemies read clearly in dark areas (toggle in quality settings).
- **Texture filtering:** high-res art uses mipmaps + trilinear/anisotropic filtering. Provide a per-asset option for nearest-neighbor if Travis makes deliberately pixel-art assets.

### 5.4 First-person weapon
- The held weapon is a **screen-space sprite** (rendered on top, not clipping into walls), with idle bob, recoil, and fire animation.
- Lit by muzzle flash and tinted by nearby light color so it sits in the scene, not pasted on.

---

## 6. Rendering — world and effects

### 6.1 Level geometry
- Real 3D geometry: varied floor and ceiling heights, stairs, slopes, stacked rooms, windows, open areas.
- Textured with tiling PBR-style materials (albedo, optional normal/roughness).
- **Static geometry uses baked lighting** (lightmaps) plus dynamic lights for gameplay effects. This is the main way to get rich lighting while staying fast on mobile.

### 6.2 Lighting
- Colored dynamic lights (point and spot) for muzzle flashes, explosions, lamps, alarms, flickering lights.
- **Light budget:** cap simultaneous dynamic lights per material (configurable per quality tier). Muzzle flash lights are pooled and short-lived.
- One main shadow-casting light per area where it matters; cascaded or limited shadows on mobile tiers.

### 6.3 Particles
- Muzzle flash, bullet impacts (sparks + debris + decal), blood, explosions, smoke, embers, fire.
- Use GPU particles where supported, CPU particle fallback.
- Pooled systems — no creating/destroying per shot.

### 6.4 Post-processing
- Bloom, tone mapping (ACES), FXAA or MSAA, SSAO, light film grain, vignette, subtle chromatic aberration on damage.
- Fog / height fog for atmosphere.
- Volumetric light shafts where they add atmosphere (high tier only).
- Every effect is controlled by the quality tier (Section 9).

### 6.5 Decals
- Bullet holes and scorch marks on walls, capped count with oldest removed first.

---

## 7. Gameplay

### 7.1 Player
- Movement: walk, sprint, strafe, **jump** (default on — see Section 14).
- Smooth acceleration/deceleration, fast classic feel. Tunable constants in one config file.
- Full mouse/touch look including vertical aim.
- Health, armor, ammo per weapon type.
- Collision via Havok character controller (or kinematic capsule) — no sticking on corners, smooth stairs.

### 7.2 Weapons
- Hitscan weapons via ray picking; projectile weapons as physics or kinematic projectiles.
- Each weapon defined in data (damage, fire rate, spread, ammo type, sprite set, sounds).
- Weapon switching with animation.

### 7.3 Enemies
- State machine: idle → alert → chase → attack → pain → death.
- Line-of-sight checks, hearing (gunshots alert nearby enemies).
- Pathfinding with a navigation mesh (Recast plugin in Babylon) so enemies navigate 3D levels with height changes.
- Each enemy type defined in data (health, speed, attack type, sprite set, sounds).

### 7.4 Pickups and interactables
- Health, armor, ammo, weapons, keys.
- Doors (key-locked and normal), switches, lifts.

### 7.5 HUD
- Health, armor, ammo, current weapon, keys, crosshair, damage direction indicator.
- Built as an **HTML/CSS overlay** above the canvas (crisp on all screen densities, easy to make responsive, cheap to render).
- Respect iPhone safe areas (notch, home indicator).

### 7.6 Menus
- Title screen, pause, settings (quality tier, sensitivity, invert-look, volume, control layout), game over, level complete.
- Settings persist in `localStorage`.

---

## 8. Controls

### Desktop
- WASD move, mouse look (Pointer Lock API), left click fire, right click alt-fire (if weapon has one), Space jump, Shift sprint, 1–9 / scroll wheel weapon select, E use, Esc pause.
- Gamepad support via the Gamepad API.

### Mobile
- Left virtual joystick: move.
- Right side drag: look.
- On-screen buttons: fire, jump, use, weapon switch.
- Buttons sized for thumbs, positioned clear of safe areas, layout adjustable in settings.
- Fullscreen request on start; prompt to rotate if in portrait.
- Haptic feedback where supported (Android; iOS web support is limited — fail silently).

### Both
- Input layer is abstracted: game logic reads actions (`move`, `look`, `fire`), never raw keys or touches.

---

## 9. Performance targets and quality tiers

| Tier | Target | Example features |
|---|---|---|
| **Low** | Older phones, 30–60 fps | No SSAO, no volumetrics, limited shadows, lower render scale |
| **Medium** | Recent phones, 60 fps | Bloom, basic shadows, reduced particles |
| **High** | Desktop / flagship phones, 60+ fps | Everything on |

- Auto-detect a starting tier from device and a quick benchmark; user can override in settings.
- **Dynamic resolution scaling:** lower render scale automatically if frame rate drops below target, raise it when headroom returns.
- Dev builds show an FPS / draw-call / memory overlay.

---

## 10. Assets

### 10.1 Location
- Assets live **inside the project repo** under `public/assets/` (not Dropbox).
- Structure:

```
public/assets/
  sprites/
    enemies/<enemy-name>/
    weapons/<weapon-name>/
    pickups/
    decorations/
  textures/
  audio/
    sfx/
    music/
  levels/
  manifest.json
```

### 10.2 Sprite format (spec for Travis)
- **PNG with transparent background.**
- Enemy frame height: **512 px** recommended (256 px minimum). Same canvas size for every frame in a set.
- Character's feet at the same baseline position in every frame.
- Animation sets per enemy: `idle`, `walk`, `attack`, `pain`, `death` (frame count is up to Travis; defined in the manifest).
- Angles: 8, or 5 with mirroring.
- Optional maps with the same dimensions: `_n` (normal map), `_e` (emissive).
- Naming: `<enemy>_<anim>_<angle>_<frame>.png` (e.g. `imp_walk_a3_02.png`), or packed sprite sheets — Claude Code provides a packing script either way.
- `manifest.json` describes every sprite set: frame size, frame counts, frame rate per animation, angle count, mirroring, which optional maps exist.

### 10.3 Asset pipeline
- Script to pack individual frames into texture atlases and update the manifest.
- Compressed textures (KTX2/Basis) for production to cut memory on mobile, with PNG fallback.
- Loading screen with progress bar.

### 10.4 Placeholder art
- **Claude Code must not be blocked waiting on art.** Generate original placeholder sprites, textures, and sounds that follow the exact spec above, so Travis's real assets drop in by replacing files — no code changes.

---

## 11. Code architecture

```
src/
  main.ts            entry, engine + renderer selection
  config/            tunables: player, weapons, enemies, quality tiers
  core/              game loop, fixed-timestep update, events, state
  input/             action mapping for keyboard, mouse, touch, gamepad
  render/            billboard sprite system, materials, post-processing, quality tiers
  world/             level loader, geometry, lighting, doors/lifts
  entities/          player, enemies, projectiles, pickups
  ai/                enemy state machines, navigation
  weapons/           weapon logic and data
  fx/                particles, decals, screen effects
  audio/             sound manager, 3D positional audio
  ui/                HTML HUD and menus
  assets/            loader, manifest parsing
tools/               sprite packer, other build scripts
tests/               unit + Playwright
```

- Gameplay runs on a **fixed timestep**; rendering interpolates. Physics and gameplay behave the same at 30 fps and 144 fps.
- Data-driven: weapons, enemies, and levels defined in JSON/config, not hard-coded.
- No global mutable state outside a single game-state module.
- Object pooling for projectiles, particles, decals, and lights.

### Levels
- Level format: JSON (geometry definitions, entity placements, lights, triggers).
- First levels are built by Claude Code in that format. Whether Travis also builds levels in an external tool (e.g. Blender exported as glTF) is TBD — see Section 14. The loader should be designed so glTF geometry can be added later.

### Audio
- Babylon's audio engine with 3D positional sound for enemies, weapons, and ambience.
- Audio unlocks on the first user tap/click (required by iOS and most browsers).

---

## 12. Milestones and acceptance criteria

Each milestone is **done only when** its checklist passes and the verification commands succeed. Do not start the next milestone until the current one is verified.

### M0 — Scaffold
- Vite + TypeScript + Babylon + Havok project runs.
- Engine picks WebGPU or WebGL2 and logs which.
- Inspector toggles in dev only.
- Lint, typecheck, unit test, and Playwright smoke test all run.

### M1 — "Walk and shoot" vertical slice
1. One detailed room: textured floor, walls, ceiling, a height change (step or platform), baked + dynamic lighting.
2. Player movement and look on **desktop and mobile**, with collision.
3. One hitscan weapon: first-person sprite, fire animation, muzzle flash light, impact particles, decal, sound.
4. One enemy sprite: 8-direction rotation, idle animation, takes damage with hit flash, plays death animation.
5. Basic HUD (health, ammo, crosshair).
6. Post-processing on (bloom, tone mapping, AA).
7. Holds target frame rate on desktop and a recent iPhone.

### M2 — Enemy AI and combat loop
- Enemy state machine, navmesh pathfinding, enemy attacks, player damage and death, respawn/restart.

### M3 — Arsenal and pickups
- 3+ weapons (including one projectile weapon), ammo types, health/armor/ammo pickups, weapon switching.

### M4 — Full level
- Complete level with verticality, doors, keys, switches, lifts, multiple enemy types, level start and exit.

### M5 — Polish and platform
- Full menus and settings, quality tiers with auto-detect, dynamic resolution, PWA install and offline play, music, final effects pass.

---

## 13. Verification (required every milestone)

Run and report results of:

```
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
```

- `test:e2e` (Playwright) must at minimum: load the built game, confirm the canvas renders non-blank frames, confirm zero console errors, and simulate input to confirm the player moves and the weapon fires.
- Run the e2e test against both a desktop viewport and a mobile viewport with touch emulation.
- Provide a short manual test checklist for Travis to run on his iPhone and a desktop browser.
- Report measured FPS for each quality tier on whatever hardware is available.

---

## 14. Open decisions (defaults in place until Travis says otherwise)

| Decision | Default | Needs Travis? |
|---|---|---|
| Game title | `working-title` | Yes |
| Jump / vertical aim | On | Confirm |
| Who builds levels long-term | Claude Code (JSON format) | Yes — Claude Code only, or Travis in Blender too? |
| Repo and hosting | Git repo; deploy target TBD | Yes — where should it live and deploy? |

---

## 15. Rules for Claude Code

- **No stubs or partial code.** Every delivered feature is complete and working.
- **Ask, don't assume.** If something in this brief is ambiguous, ask Travis a short question before building on a guess.
- **Correct over easy.** Take the right approach, not the quick one. Flag tradeoffs with evidence and let Travis decide.
- **Verify every milestone** per Section 13 before moving on.
- Keep a `PROGRESS.md` in the repo: current milestone, what's done, what's next, open questions.
- Keep this brief in the repo as `BRIEF.md`; propose changes to it rather than silently deviating.
