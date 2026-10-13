# Port Valen master template — 1.0-STABLE

`templates/master-template-1.0-stable.html` is the frozen, reusable single-file
game foundation. It is byte-identical to the `index.html` it was frozen from.
The file carries `MASTER_TEMPLATE_VERSION = '1.0-STABLE'`, and its SHA-256 is
recorded in `templates/master-template-1.0-stable.sha256`.

**Do not edit the master.** Every new game starts from a copy:

```
MASTER TEMPLATE  ->  duplicate  ->  NEW GAME BUILD
cp port-valen/templates/master-template-1.0-stable.html my-new-game/index.html
```

To confirm the master is untouched, run this from `port-valen/templates/`:

```
sha256sum -c master-template-1.0-stable.sha256
```

## What is engine and what is content

Every section header in the script is tagged:

| Tag | Meaning | In a new game |
| --- | --- | --- |
| `[CORE]` | Reusable engine system | Keep |
| `[CONTENT]` | Port Valen–specific data or generation | Replace |
| `[CORE+CONTENT]` | Engine code with its data tables at the top of the section | Keep the code, swap the tables |

`GAME_CONFIG` (just above `[CORE] BOOT`) is a frozen index of every tunable and
data table. It covers world layout, zones, landmarks, keymap, quality presets,
weather, police heat, vehicles, props, economy, contacts, campaign, races,
events, interiors, outfits, achievements, secrets and fast-travel points. Start
there when replacing content.

### Core systems

- Utilities, save system with migration and sanitizing, and input (keyboard, mouse, touch, gamepad)
- Synthesized audio with a voice cap
- Procedural materials and atmosphere, geometry builder, collision grid with DDA raycasts
- Prop and chunk streaming with an LRU cache
- Instanced character renderer, player controller, camera rig
- Spatial hash, vehicle physics with a NaN/Infinity guard, vehicle manager and pools
- Particles and FX
- Traffic AI, drive AI, pedestrians and police, each with stuck-recovery failsafes
- Combat, environment (time and weather)
- Mission manager and campaign stage engine, interiors kit
- UI manager, quality manager, post-processing, `Game` loop, boot

### State-handling rules the template relies on

- Player resets go through `Game.resetPlayerState(x, z, h)`. It calls `Player.resetTransient()` and `CameraRig.reset()` and picks a clear spot and an open heading. Never zero pose or input fields ad hoc.
- The arrest pose uses its own `pose.surrender` channel. `pose.crouch` is only for cowering.
- Screen fades are serialized through `Game.fade(mid, force)`. Respawn and start fades are forced, and the screen always comes back even if the callback throws.
- Delayed gameplay calls use `Game.later(ms, fn)`, which is dropped on quit or new career. Death and arrest timers use `lifeToken`.
- The game state is mirrored to `<body data-gs>`, so CSS hides HUD layers on pause, death and arrest.
- Mission completion is idempotent: `MissionManager.pass()` pays once. The last failed job can be retried from the pause menu.

## Tests (headless Chromium + SwiftShader)

```
node port-valen/tests/playtest.mjs    # 36 checks: play, police, all job templates, saves, touch
node port-valen/tests/campaign.mjs    # all 19 story missions through the stage engine
node port-valen/tests/stability.mjs   # arrest regression, fix checks, long-session soak
```

To run offline, add `THREE_DIR=/path/to/three@0.160.0/package` in front of any command.
