/* Visual QA for the vehicle roster (not a test): every civilian model parked in a row on an empty road,
   photographed side-on and from the front three-quarter, so silhouettes can be compared at a glance.
   Usage: node underworld/tests/carshots.mjs   → underworld/.shots/v6/cars-*.png */
import { launch, open, frames, startNew } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '.shots', 'v6');
fs.mkdirSync(OUT, { recursive: true });
const b = await launch();
const { page } = await open(b, { viewport: { width: 960, height: 400 }, deviceScaleFactor: 1 });
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
await ev(() => { const g = window.game; g.quality.setMode(1); g.events.cool = 1e9; g.police.enabled = false; g.env.time = 12;
  for (const id of ['hud', 'touch', 'moneyFeed', 'toasts', 'tip']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; }
  const U = g.cam.update.bind(g.cam); g.cam.update = (...a) => { U(...a); const f = window.__freeCam; if (f) { g.camera.position.set(f.x, f.y, f.z); g.camera.lookAt(f.lx, f.ly, f.lz); } }; });
// the shore road along the north edge of the stadium blocks: long, straight and quiet in tests
const types = await ev(() => Object.entries(window.__pv.VEHICLES).filter(([, s]) => !s.police && !s.unmarked).map(([k]) => k));
const per = 5;
for (let r = 0; r * per < types.length; r++) {
  const row = types.slice(r * per, r * per + per);
  const base = await ev(row => {
    const g = window.game, P = window.__pv, x0 = 6 * 80 + 8, z = 7 * 80 - 0.5;
    for (const v of g.vehicles.list.slice()) if (v !== g.player.vehicle) g.vehicles.despawn(v);
    g.traffic && (g.traffic.enabled = false);
    g.player.pos.set(x0 + 20, 0, z + 30);
    row.forEach((t, i) => { const v = g.vehicles.spawn(t, x0 + i * 7.5, z, Math.PI / 2, { parked: true }); v.touched = true; v.locked = true; });
    return { x0, z };
  }, row);
  for (const [name, cam] of [['side', { x: base.x0 + 15, y: 2.0, z: base.z - 11 }], ['above', { x: base.x0 + 15, y: 10, z: base.z + 9 }]]) {
    await ev(([c, b2]) => { window.__freeCam = { x: c.x, y: c.y, z: c.z, lx: b2.x0 + 15, ly: 0.8, lz: b2.z }; }, [cam, base]);
    await frames(page, 25);
    await page.screenshot({ path: path.join(OUT, `cars-${r + 1}-${name}.png`) });
  }
  console.log('row', r + 1, row.join(','));
}
await b.close();
