/* Save compatibility across the city's redevelopment (CITY_REBUILD.md §1, the Phase 1 gate).
   fixtures/save-pre-phase1.json is a real save made on the build before Phase 1 (0beff6a: the city still on its grid),
   through the game's own API: 26 properties bought in every district that has since been rebuilt (Uptown, Crestmoor,
   Northgate, Parkside, the port, the Strip, the freight park, the Old Quarter, Linden), and the player standing on an
   Uptown lattice street that no longer runs (1760, -360). It is continued on this build:
   - it loads, at the current save version, and every property it owned is still owned;
   - every owned door stands on a street, off its carriageway, and the GPS finds it;
   - the player comes back where they saved if that spot can still walk to a road, else on the pavement of the nearest
     street, never inside anything built; and the same save, saved on an old street that a building now stands on, comes
     back on the nearest street. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, open, check, boot, frames, finish } from './lib.mjs';

const RAW = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'save-pre-phase1.json'), 'utf8');
const SAVED = JSON.parse(RAW);
const OWNED = Object.keys(SAVED.uw.props).filter(id => SAVED.uw.props[id] && SAVED.uw.props[id].owned);
const b = await launch();
// (the save is in place before the page loads, as it would be in a player's browser)
const { page, errors } = await open(b, {}, `if (!sessionStorage.getItem('uw.fixture')) { localStorage.setItem('pvunderworld.save.v1', ${JSON.stringify(RAW)}); sessionStorage.setItem('uw.fixture', '1'); }`);
const ev = (f, a) => page.evaluate(f, a);
await boot(page);
await page.waitForFunction(() => { const l = document.getElementById('loading'); return !l || l.style.display === 'none' || l.classList.contains('hidden') || getComputedStyle(l).opacity === '0' || !l.isConnected; }, null, { timeout: 180000, polling: 200 });
await page.click('#btnContinue', { timeout: 120000 });
await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000, polling: 100 });
await frames(page, 5);

const R = await ev(([owned, saved]) => {
  const g = window.game, P = window.__pv, w = g.world, RG = P.RoadGraph, out = {};
  out.version = g.save.version; out.state = g.state;
  out.lost = owned.filter(id => !g.uw.props.owned(id));
  // the doors
  const from = RG.nearest(g.player.pos.x, g.player.pos.z, { maxD: 400 });
  out.doors = owned.map(id => {
    const L = g.uw.loc('prop', id); if (!L) return { id, err: 'no door' };
    const d = P.PROP_BY_ID[id], h = d && d.home && w.homes.find(x => x.id === d.home), house = !!(h && !h.flat && h.type !== 'apartment');
    const road = RG.nearest(L.x, L.z, { maxD: 40 }); let rd = road ? road.d : null;
    // (a house round a cul-de-sac faces its turning circle)
    for (const Lk of w.links) if (Lk.ring) { const dc = Math.hypot(L.x - Lk.ring.x, L.z - Lk.ring.z) - Lk.ring.r; if (rd === null || dc < rd) rd = dc; }
    const rt = from ? RG.route(from.x, from.z, L.x, L.z) : null;
    return { id, house, road: rd === null ? null : +rd.toFixed(1), onRoad: P.isOnRoad(L.x, L.z), gps: !!(rt && Math.hypot(rt.g.x - L.x, rt.g.z - L.z) < 30) };
  });
  // the player
  const p = g.player.pos, gy = P.groundY(p.x, p.z), hit = w.grid.resolveCircle(p.x, p.z, 0.5, gy + 0.3, gy + 1.6, {}).hit;
  out.player = { x: Math.round(p.x), z: Math.round(p.z), inside: !!hit, walks: g.reachesRoad(p.x, p.z), moved: Math.round(Math.hypot(p.x - saved.x, p.z - saved.z)), savedWalks: g.reachesRoad(saved.x, saved.z) };
  return out;
}, [OWNED, SAVED.pos]);

check(`the pre-Phase 1 save loads and is brought to the current version (${OWNED.length} properties owned in it)`, R.state === 'playing' && R.version >= SAVED.version && OWNED.length >= 20, JSON.stringify({ state: R.state, v: R.version, was: SAVED.version, n: OWNED.length }));
check('every property it owned is still owned', R.lost.length === 0, JSON.stringify(R.lost));
// (12 m for a door the district kit builds flush behind, 124, as the rebuild suite asks; a door in a cell the city builds
// as it always did, a yard's or a works', stands at its own facade a little further back: 14 m)
const badDoor = d => d.err || d.road === null || d.road > (d.house ? 18 : 14) || d.onRoad || !d.gps;
check('every owned door is on a street, off its carriageway, and the GPS finds it', R.doors.length === OWNED.length && !R.doors.some(badDoor), JSON.stringify(R.doors.filter(badDoor)));
check('the player comes back where they saved when it still reaches a road, else on the nearest street\'s pavement, never inside anything', !R.player.inside && R.player.walks && (R.player.savedWalks ? R.player.moved <= 7 : R.player.moved <= 80), JSON.stringify(R.player));
// ---- the same save, saved where the city has since been built over: on Uptown's old lattice streets, the first spot
// along them that is inside a building now, well back from any road (more than 10 m)
const spot = await ev(() => {
  const g = window.game, w = g.world, P = window.__pv;
  for (const [x0, z0, x1, z1] of [[1760, -398, 1760, -82], [1680, -398, 1680, -82], [1602, -320, 1918, -320], [1602, -240, 1918, -240], [1840, -398, 1840, -82]]) {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2);
    for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n, gy = P.groundY(x, z), r = {}; w.grid.resolveCircle(x, z, 0.5, gy + 0.3, gy + 1.6, r); if (r.hit && r.col && r.col.kind === 'bld' && P.RoadGraph.surfaceDist(x, z, { r: 30 }) > 10) return { x, z, h: 0 }; }
  }
  return null;
});
if (spot) {
  // (the spot is written into the save after the reload, at the title screen, where nothing saves: the old page's own
  // save on its way out would write the player's spot back over it)
  await page.reload({ timeout: 180000 }); await boot(page);
  await ev(sp => { const raw = JSON.parse(localStorage.getItem('pvunderworld.save.v1')); raw.pos = sp; localStorage.setItem('pvunderworld.save.v1', JSON.stringify(raw)); }, spot);
  // (what the save holds as it is continued: the edited spot)
  var pre = await ev(() => JSON.parse(localStorage.getItem('pvunderworld.save.v1')).pos);
  await page.waitForFunction(() => { const l = document.getElementById('loading'); return !l || l.style.display === 'none' || l.classList.contains('hidden') || getComputedStyle(l).opacity === '0' || !l.isConnected; }, null, { timeout: 180000, polling: 200 });
  await page.click('#btnContinue', { timeout: 120000 });
  await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 90000, polling: 100 });
  await frames(page, 5);
}
const R2 = spot && await ev(sp => {
  const g = window.game, P = window.__pv, p = g.player.pos, gy = P.groundY(p.x, p.z), hit = g.world.grid.resolveCircle(p.x, p.z, 0.5, gy + 0.3, gy + 1.6, {}).hit;
  return { saved: [Math.round(sp.x), Math.round(sp.z)], at: [Math.round(p.x), Math.round(p.z)], inside: !!hit, walks: g.reachesRoad(p.x, p.z), moved: Math.round(Math.hypot(p.x - sp.x, p.z - sp.z)), owned: g.uw.props.owned('salon') };
}, spot);
check('saved where a building stands now: the player comes back on the nearest street\'s pavement, free to walk, the save otherwise as it was', !!R2 && pre && Math.hypot(pre.x - spot.x, pre.z - spot.z) < 0.01 && !R2.inside && R2.walks && R2.moved >= 1 && R2.moved <= 80 && R2.owned, JSON.stringify({ ...R2, pre }));
check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await finish(b, 'savecompat');
