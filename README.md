# AGENT 64: SPY OPS

A mobile-first browser FPS in a single self-contained `index.html`. Cold-war
espionage in a near-future hydroelectric research station, during a storm.

Everything — geometry, materials, lighting, particles, UI and audio — is
generated procedurally at runtime. There are no images, models, fonts, sound
files, libraries or network requests of any kind.

## Running it

Open `index.html`. That is the whole procedure.

- Double-click the file (`file://` works — there is no build step and no server needed).
- Or drop the file on any static host (Netlify, GitHub Pages) and open the URL.
- Works with zero network access. The browser network panel stays empty after load.

Primary target is iPhone Safari in portrait or landscape; desktop keyboard and
mouse is the secondary path. Requires WebGL. If WebGL is unavailable the game
shows a message instead of a blank canvas.

## The mission — "Black Current"

Infiltrate the Kelvara station's control wing and extract a classified data core,
then reach the extraction pad. Three surveillance relays can be disabled as a
secondary objective. Trigger the alarm and the whole station starts hunting you.

Two routes into the facility, both completable:

- **Main gate** — fast, well lit, two guards standing in it.
- **West maintenance culvert** — a crouch-height drain that bypasses the gate
  hall and most of the turbine floor. Slower, and you cannot stand up in it.

You lose when your health reaches zero. Checkpoints are taken at the turbine
hall, the north corridor, the control wing and the moment the core leaves its cradle.

## Bot arena — "Signal Yard"

A walled sparring yard with four training bots that patrol, detect, pursue,
attack and respawn. First to the score cap wins; on time-out the higher score
takes it. Local only — nothing here touches a network, and cheats are ignored inside.

## Controls

**Touch (primary)**

| | |
|---|---|
| Move | Left thumb — the stick appears wherever you press |
| Sprint | Push the stick to the rim |
| Look | Drag anywhere on the right side of the screen |
| Fire / Aim | FIRE and AIM buttons, bottom right |
| Reload / Crouch / Swap | RLD · CRCH · SWAP |
| Interact | USE — appears in amber only when something is in reach |
| Pause | Top-left |

**Keyboard & mouse (secondary)**

`WASD` move · mouse look · LMB fire · RMB aim · `Shift` sprint · `C` crouch ·
`R` reload · `1` `2` `3` weapon select · `Q`/wheel cycle · `E` interact ·
`Esc` pause · `F` debug panel.

Clicking the view requests pointer lock where the browser supports it. Where it
does not (every iPhone), drag-to-look and free mouse-look both work.

## Weapons

| | Fire | Damage | Mag | Reload | Recoil | Range |
|---|---|---|---|---|---|---|
| Agent Sidearm | Semi-auto, suppressed | 34 | 12 | 1.15s | Light | Accurate to 65m |
| Vector SMG | Full-auto 880rpm | 15 | 34 | 1.85s | Climbing | Falls off past 14m |
| Breach Shotgun | Pump, 9 pellets | 13/pellet | 6 | 2.7s | Strong | Very short, wide |

The sidearm is quiet — it barely carries. The SMG and shotgun will bring guards
from across a room.

## Cheats

Earned, never given. Complete the mission, complete it under 6:00, complete it
without triggering the alarm, complete it without dying. Each unlocks one of:
infinite ammo, invulnerability, low gravity, enemy outlines. All four are
disabled inside the bot arena and never affect saved best times.

## Settings

Quality preset (low/medium/high), automatic quality scaling, look sensitivity,
invert Y, master volume, screen shake, debug panel, fullscreen where it exists,
and erase save data. Progress and preferences persist in `localStorage`; in
Safari Private Browsing the game silently falls back to an in-memory save and
keeps running.

## Verifying

```
node verify.js
```

Runs 175 static and headless-runtime checks against `index.html`: parse, offline
purity, viewport and safe-area handling, handler and screen-id resolution,
weapon/enemy config completeness, FSM coverage, then boots the real script
against DOM/WebGL stubs to play the mission, the arena and five restarts —
including proof that both infiltration routes reach the vault.
