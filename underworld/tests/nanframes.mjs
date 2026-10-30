/* NaN frames: no shader may write a NaN or an infinity into the frame. One such pixel is enough: the bloom pass
   blurs it across its mip chain and a third to nine-tenths of the screen goes black (the graphics gate found
   Valen Point's terrain doing it from the causeway, the docks and the skyline: bump mapping normalised a zero
   vector where the screen derivatives degenerate). Each scene is rendered into a full-size float target and every
   pixel checked, at Medium (what auto quality picks on a phone; rooms lit per lamp) and High (shadows): the
   causeway looking at Valen Point, the skyline at dusk, the docks from the air, Valen Point from the air, Cedar
   Fields at eye level, downtown at night in the rain (the wet film and lamp streaks) and the casino (lamp light). */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b);
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);

await ev(() => {
  const g = window.game;
  g.events.cool = 1e9; g.save.settings.guide = false; g.police.enabled = false; g.player.health = 1e6; if (g.debug) g.debug.god = true;
  const U = g.cam.update.bind(g.cam); g.cam.update = (...a) => { U(...a); const c = window.__cam; if (c) { g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(c[3], c[4], c[5]); } };
  // every pixel of the scene as the composer's first pass sees it, in float (three's FloatType): [NaN, infinite, scanned]
  const FLOAT = 1015;
  window.__scan = () => {
    const R = g.renderer, RT = g.composer.renderTarget1.constructor, W = R.domElement.width, H = R.domElement.height;
    const rt = new RT(W, H, { type: FLOAT }), buf = new Float32Array(W * H * 4);
    R.setRenderTarget(rt); R.clear(); R.shadowMap.needsUpdate = true; R.render(g.scene, g.camera);
    R.readRenderTargetPixels(rt, 0, 0, W, H, buf); R.setRenderTarget(null); rt.dispose();
    let nan = 0, inf = 0; for (let i = 0; i < buf.length; i++) { const v = buf[i]; if (v !== v) nan++; else if (v === Infinity || v === -Infinity) inf++; }
    return [nan, inf, W * H];
  };
});

const view = (px, pz, cam, time, weather = 'clear') => ev(([px, pz, cam, time, weather]) => {
  const g = window.game, I = g.content.interiors; if (I && I.cur) I.exit(true);
  if (g.player.vehicle) g.exitVehicle(true);
  g.resetPlayerState(px, pz, 0); g.env.time = time; g.env.setWeather(weather, true); g.env.wet = g.env.rain;
  window.__cam = cam; for (let k = 0; k < 40; k++) g.chunks.update(px, pz, g.frame + k);
}, [px, pz, cam, time, weather]);
const scenes = [
  ['the causeway looking at Valen Point', () => view(1100, 530, [1080, 4.2, 530, 1080, 0.6, 512], 13)],
  ['the skyline at dusk', () => view(480, 480, [-60, 40, 1000, 480, 40, 480], 19.2)],
  ['the docks from the air', () => view(800, 120, [870, 36, 30, 800, 0, 150], 14)],
  ['Valen Point from the air', () => view(1650, 520, [1480, 60, 520, 1750, 0, 500], 14)],
  ['Cedar Fields at eye level', () => view(220, 1180, [200, 2.2, 1150, 260, 1, 1250], 16)],
  ['downtown at night in the rain', () => view(560, 410, [563.5, 1.8, 418, 560, 9, 330], 22, 'rain')],
  ['the casino', () => ev(() => { const g = window.game; window.__cam = null; g.env.time = 22; g.env.setWeather('clear', true); g.content.enterCasino(); })],
];
for (const [mode, label] of [[1, 'Medium'], [2, 'High']]) {
  await ev(m => { const g = window.game; g.quality.mode = m; g.quality.setMode(m); }, mode);
  for (const [name, set] of scenes) {
    await set();
    await page.waitForFunction(() => !window.game.fading, null, { timeout: 60000, polling: 100 });
    await frames(page, 30);
    const r = await ev(() => window.__scan());
    check(`${label}: ${name}: no NaN or infinite pixel`, r[0] === 0 && r[1] === 0, `NaN ${r[0]}, infinite ${r[1]} of ${r[2]} pixels`);
  }
  await ev(() => { const I = window.game.content.interiors; if (I.cur) I.exit(true); });
}
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'nanframes');
