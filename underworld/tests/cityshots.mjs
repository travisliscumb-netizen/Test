/* City visual pass: aerial and street-level views of every district, the big map at several
   zoom levels, and the new interactive landmarks (SHOT_DIR, default underworld/.shots/city). */
import { launch, open, frames, startNew } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
const DIR = process.env.SHOT_DIR || path.resolve('.shots/city');
fs.mkdirSync(DIR, { recursive: true });
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const b = await launch();
const { page, errors } = await open(b, { viewport: { width: 1100, height: 620 } });
await startNew(page);
await page.evaluate(() => { const g = window.game; g.quality.setMode(1); g.env.time = 11; g.env.setWeather('clear', true); g.events.cool = 1e9; g.police.enabled = false; });
const shot = async (name) => { await frames(page, 20); await page.screenshot({ path: path.join(DIR, name + '.png') }); console.log('shot', name); };
// fly the camera: player parked under the view so chunks stream in, camera aimed by hand
async function view(name, px, pz, cam, look) {
  if (ONLY && !ONLY.includes(name)) return;
  await page.evaluate(([px, pz, cam, look]) => {
    const g = window.game; g.resetPlayerState(px, pz, 0);
    if (!g.cam._orig) g.cam._orig = g.cam.update;
    g.cam.update = function () { g.camera.position.set(cam[0], cam[1], cam[2]); g.camera.lookAt(look[0], look[1], look[2]); };
    for (let k = 0; k < 60; k++) g.chunks.update(px, pz, g.frame + k);
  }, [px, pz, cam, look]);
  await frames(page, 50);
  await shot(name);
}
await view('a-suburbs', 80, 680, [-40, 120, 580], [80, 0, 700]);
await view('b-crestmoor-estate', 100, 80, [190, 110, 210], [80, 0, 60]);
await view('c-park', 280, 240, [420, 130, 360], [280, 0, 250]);
await view('d-stadium', 700, 720, [560, 120, 600], [712, 0, 720]);
await view('e-stadium-inside', 700, 720, [700, 9, 720], [760, 0, 720]);
await view('f-terminal', 880, 880, [760, 110, 760], [890, 0, 890]);
await view('g-fields', 160, 910, [160, 90, 800], [160, 0, 920]);
await view('h-parkade', 440, 520, [360, 60, 470], [440, 6, 520]);
await view('i-downtown', 520, 440, [480, 40, 300], [520, 30, 480]);
await view('j-oldquarter', 120, 420, [60, 25, 330], [140, 5, 440]);
await view('k-industrial-port', 860, 560, [700, 90, 420], [880, 0, 620]);
await view('l-street-suburb', 70, 600, [45, 4, 588], [80, 2, 640]);
await page.evaluate(() => { const g = window.game; g.cam.update = g.cam._orig; });
if (!ONLY || ONLY.includes('map')) {
  await page.keyboard.press('KeyM'); await frames(page, 6); await shot('m-map-1x');
  await page.evaluate(() => { const v = window.game.ui.mapView; v.zoomAt(3, v.W * 0.3, v.H * 0.75, true); }); await frames(page, 6); await shot('n-map-3x');
  await page.evaluate(() => { const v = window.game.ui.mapView; v.zoomAt(2.2, v.W / 2, v.H / 2, true); }); await frames(page, 6); await shot('o-map-6x');
  await page.evaluate(() => window.game.ui.mapView.openDrawer()); await frames(page, 6); await shot('p-map-index');
  await page.keyboard.press('KeyM');
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await b.close();
process.exit(0);
