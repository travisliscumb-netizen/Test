/* Saves across city layouts (CITY_SPREAD.md S6): a save made with the city in one layout loads in another with every
   position beside the same buildings it was beside, and loading it again moves nothing.
   - a save made under 'classic' (the square, what every save before the city spread was made under) with the player
     on the Nightlife Strip, and points in Crestmoor Heights, in the core and out at Valen Point;
   - loaded under 'island': the Strip's and the Heights' points move by their precincts' offsets, the core's and Valen
     Point's stay, the player continues on the same pavement, the stamp is 'island';
   - saved and loaded again under 'island': nothing moves.

   node underworld/tests/relocate.mjs */
import { launch, open, check, frames, startNew, finish, FILE } from './lib.mjs';
process.env.UW_QUERY = '?layout=classic'; // the save is made under the square (island is the default layout)
const b = await launch();
const { page, errors } = await open(b);
const ev = (fn, a) => page.evaluate(fn, a);
const KEY = 'pvunderworld.save.v1';
const P = 80;
const offsetOf = (id, lx, lz) => ev(([id, lx, lz]) => { const T = window.__pv.CITY_LAYOUTS[id]; const p = T.find(q => lx >= q.lx0 && lx <= q.lx1 && lz >= q.lz0 && lz <= q.lz1); return [p.ox * 80, p.oz * 80]; }, [id, lx, lz]);

// ---------------------------------------------------------------- 1. a save made under classic
await startNew(page);
const made = await ev(() => {
  const g = window.game, w = g.world, pv = window.__pv;
  const strip = w.block(5, 9), heights = w.block(1, 2), core = w.block(6, 5);
  // the player on the pavement in front of the casino block; three marks saved with the game
  const px = strip.cx, pz = strip.z1 + 3.2;
  g.resetPlayerState(px, pz, 0);
  g.save.stats.playTime = Math.max(g.save.stats.playTime, 60); // (a career Continue offers: more than a few seconds played)
  g.save.flags.relocTest = { heights: { x: heights.cx + 7, z: heights.cz - 11, h: 1 }, core: { x: core.cx, z: core.cz }, vp: { x: 1600, z: 500 }, deep: [{ x: strip.cx - 20, z: strip.cz }] };
  const ok = g.saveGame(true);
  const raw = JSON.parse(localStorage.getItem('pvunderworld.save.v1') || '{}');
  return { ok, layout: pv.CityLayout.id, stamp: raw.layout, pos: raw.pos, marks: raw.flags && raw.flags.relocTest };
});
check('a save made under the classic layout carries its stamp and the player\'s place', made.ok && made.layout === 'classic' && made.stamp === 'classic' && made.pos && Math.abs(made.pos.x - made.marks.deep[0].x - 20) < 2, JSON.stringify({ stamp: made.stamp, pos: made.pos }));

// a save from before the stamp existed is a classic one
await ev(() => { const raw = JSON.parse(localStorage.getItem('pvunderworld.save.v1')); delete raw.layout; localStorage.setItem('pvunderworld.save.v1', JSON.stringify(raw)); });

// ---------------------------------------------------------------- 2. loaded under island
const boot = async q => {
  await page.goto('file://' + FILE + q);
  await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 180000 });
  await page.evaluate(() => window.game.quality.setMode(0));
  await page.click('#btnContinue');
  await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000 });
  await frames(page, 20);
};
await boot('?layout=island');
const [sx, sz] = await offsetOf('island', 5, 9), [hx, hz] = await offsetOf('island', 1, 2), [cx, cz] = await offsetOf('island', 6, 5);
const got = await ev(() => { const g = window.game, s = g.save; return { layout: window.__pv.CityLayout.id, stamp: s.layout, from: s.flags.relocatedFrom, pos: [g.player.pos.x, g.player.pos.z], marks: s.flags.relocTest, strip: [g.world.block(5, 9).cx, g.world.block(5, 9).z1], ground: g.player.pos.y }; });
const m0 = made.marks, m1 = got.marks, near = (a, b) => Math.abs(a - b) < 0.01;
check('loaded under island: the stamp is island and the save says where it came from', got.layout === 'island' && got.stamp === 'island' && got.from === 'classic', JSON.stringify({ stamp: got.stamp, from: got.from }));
check('the player continues on the same pavement in front of the casino block, where the Nightlife Strip now stands',
  sx !== 0 && Math.abs(got.pos[0] - (made.pos.x + sx)) < 1 && Math.abs(got.pos[1] - (made.pos.z + sz)) < 1 && Math.abs(got.pos[0] - got.strip[0]) < 2 && Math.abs(got.pos[1] - (got.strip[1] + 3.2)) < 2,
  JSON.stringify({ was: [made.pos.x, made.pos.z], now: got.pos, strip: got.strip, off: [sx, sz] }));
check('a point in Crestmoor Heights moves with the Heights; one in the core and one at Valen Point stay where they were',
  hx !== 0 && near(m1.heights.x, m0.heights.x + hx) && near(m1.heights.z, m0.heights.z + hz) && m1.heights.h === 1 && cx === 0 && near(m1.core.x, m0.core.x) && near(m1.core.z, m0.core.z) && m1.vp.x === 1600 && m1.vp.z === 500,
  JSON.stringify({ heights: [m0.heights, m1.heights], core: [m0.core, m1.core], vp: m1.vp }));
check('a point deep inside the save (a list in an object) moves too', near(m1.deep[0].x, m0.deep[0].x + sx) && near(m1.deep[0].z, m0.deep[0].z + sz), JSON.stringify([m0.deep[0], m1.deep[0]]));

// ---------------------------------------------------------------- 3. saved and loaded again under island: nothing moves
const again0 = await ev(() => { const g = window.game; g.saveGame(true); return JSON.parse(localStorage.getItem('pvunderworld.save.v1')); });
await boot('?layout=island');
const again1 = await ev(() => { const g = window.game; return { pos: [g.player.pos.x, g.player.pos.z], marks: g.save.flags.relocTest, stamp: g.save.layout }; });
check('loading an island save under island moves nothing', again0.layout === 'island' && again1.stamp === 'island' && Math.abs(again1.pos[0] - again0.pos.x) < 0.5 && Math.abs(again1.pos[1] - again0.pos.z) < 0.5 && near(again1.marks.heights.x, m1.heights.x) && near(again1.marks.deep[0].z, m1.deep[0].z),
  JSON.stringify({ saved: again0.pos, loaded: again1.pos }));
check('no console errors', errors.length === 0, errors.slice(0, 6).join(' | '));
await finish(b, 'relocate');
