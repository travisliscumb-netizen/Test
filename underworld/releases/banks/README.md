# The Underworld — with the banks of Port Valen

The game as commit `fc97fd5` built it: the content-complete M13 game, the Session 14 graphics / presentation /
UI-UX overhaul (`../after-graphics/` is that build alone) and the three banks (ECONOMY.md §12, DECISIONS.md "The
banks"). This is the current playable build.

| File | What it is |
|---|---|
| `Underworld_Banks.html` | The whole game in one file: three.js, the code, the CSS, the icons and the web-app manifest. Nothing else is needed. |
| `index.html` | A one-line redirect to the file above, so the folder deploys as a site as is. |
| `RELEASE.json` | The commit, the size (raw / gzip / brotli), the SHA-256 and the packaging changes made. |

## Playing it
- **On a computer:** open the HTML file in a browser. It runs offline from `file://`.
- **Any static host:** deploy this folder; the site root redirects to the game. Or upload the HTML on its own.
- **On an iPhone:** open the hosted URL in Safari; Share → Add to Home Screen gives a full-screen launcher.

## The banks
- Old Quarter Neighborhood Bank, Downtown Commercial Bank and Port Valen Central Bank: open from a new game, no Rank,
  mission or reputation gate. Each shows on the map once its district has been discovered.
- Walk in through the front door: the tellers serve the Clean Bank account, or rob a window (a note, or a gun), then
  the back office, the security room, the cash room, the vault (Downtown and Central; the Neighborhood bank has none)
  and the deposit boxes, each deeper and slower.
- Takings are Dirty Cash in hand. Guards warn, fight or restrain; the alarm brings the police, who contain the
  building and storm it in waves. What is taken stays taken through leaving, saving, reloading, arrest and death;
  the reserves recover over economic days and security rises after each robbery.

## Saves
The main game's browser keys, `pvunderworld.save.v1` and `pvunderworld.settings.v1`: an existing career loads as
it is (the banks add one save field with its own default).

## How it was made and checked
- `node underworld/tools/export-release.mjs --ref fc97fd5 --dir underworld/releases/banks --name Underworld_Banks.html`
  (refuses unless the committed `index.html` is byte-identical to that commit's `src/`; the only changes are the
  icons and manifest inlined as `data:` URIs and a `<meta name="release">` line).
- `node underworld/tools/verify-release.mjs underworld/releases/banks Underworld_Banks.html`: RELEASE VERIFIED in
  both profiles, desktop and iPhone (touch, mobile Safari UA, 4× CPU throttle): boot, a new game, walking (keys and
  the touch stick), driving, the phone and the map, save, reload and Continue, no errors, no outside requests.
- This is headless Chromium, not Safari on an iPhone. It proves the package, not the device.
