/* Visual QA for building frontages and entrances (not a test): the casino forecourt and a sample of usable
   doors (gas station, shop, business, house, dealership, apartment, mansion gate) by day, at night and in rain.
   Usage: node underworld/tests/frontshots.mjs [tag]   → underworld/.shots/v6/front-<tag>-*.png */
import { launch, open, frames, startNew } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
const TAG = process.argv[2] || 'after';
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '.shots', 'v6');
fs.mkdirSync(OUT, { recursive: true });
const b = await launch();
const { page } = await open(b, { viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
await ev(() => { const g = window.game; g.quality.setMode(1); g.save.settings.guide = false; g.events.cool = 1e9; g.police.enabled = false;
  for (const id of ['hud', 'touch', 'moneyFeed', 'toasts', 'tip']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; }
  const U = g.cam.update.bind(g.cam); g.cam.update = (...a) => { U(...a); const f = window.__freeCam; if (f) { g.camera.position.set(f.x, f.y, f.z); g.camera.lookAt(f.lx, f.ly, f.lz); } }; });
const look = async (name, door, dist, up, side = 0) => {
  await ev(([d, dist, up, side]) => {
    const g = window.game, fx = Math.sin(d.h), fz = Math.cos(d.h), rx = Math.cos(d.h), rz = -Math.sin(d.h);
    g.player.pos.set(d.x + fx * 30, 0, d.z + fz * 30);
    window.__freeCam = { x: d.x + fx * dist + rx * side, y: up, z: d.z + fz * dist + rz * side, lx: d.x, ly: 1.6, lz: d.z };
  }, [door, dist, up, side]);
  for (const [w, t, rain] of [['day', 13, 0], ['night', 22.5, 0], ['rain', 15, 1]]) {
    await ev(([t, rain]) => { const g = window.game; g.env.time = t; g.env.setWeather ? g.env.setWeather(rain ? 'rain' : 'clear', true) : (g.env.rain = rain, g.env.rainT = rain); }, [t, rain]);
    await frames(page, 30); await page.screenshot({ path: path.join(OUT, `front-${TAG}-${name}-${w}.png`) });
  }
};
const doors = await ev(() => {
  const g = window.game, W = g.world, out = {};
  const pl = W.places; out.casino = pl.casino.door;
  for (const k in pl) { const p = pl[k]; if (!p || !p.door) continue; if (/station|fuel/i.test(k) && !out.station) out.station = p.door; if (k === 'dealer' || /dealer/.test(k)) out.dealer = out.dealer || p.door; if (k === 'motorworks') out.motorworks = p.door; }
  // property doors come from the underworld's locations (homes, businesses, the mansion)
  const L = g.uw.locs.filter(x => x.kind === 'prop'), D = x => ({ x: x.x, z: x.z, h: x.h });
  const biz = L.find(x => x.def.kind === 'business' && x.def.cat); if (biz) out.business = D(biz);
  const house = L.find(x => x.def.kind === 'safehouse' && x.def.tier === 3); if (house) out.house = D(house);
  const apt = L.find(x => x.def.kind === 'safehouse' && x.def.tier === 2); if (apt) out.apartment = D(apt);
  const man = L.find(x => x.def.id === 'mansion'); if (man) out.mansion = D(man);
  for (const k of ['usedlot', 'prestige']) if (pl[k]) out[k] = pl[k].door;
  return out;
});
await look('casino', doors.casino, 22, 6);
await look('casino-close', doors.casino, 9, 2.2, 3);
for (const k of ['station', 'business', 'house', 'apartment', 'dealer', 'motorworks', 'mansion']) if (doors[k]) await look(k, doors[k], 11, 3.2, 2);
for (const k of ['dealer', 'usedlot', 'prestige']) if (doors[k]) await look(k + '-lot', doors[k], 38, 12, 0);
console.log(JSON.stringify(Object.keys(doors)));
await b.close();
