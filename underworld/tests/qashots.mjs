/* Visual-QA screenshots for this pass (not a test): interiors (mansion both floors, game room, penthouse,
   houses by tier), the parkade decks, gas stations, phone apps, taxi map, jail, vehicles, entrances,
   districts. Written to underworld/.shots/qa. */
import { launch, open, frames, startNew } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '.shots', 'qa');
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const want = n => !only.length || only.some(o => n.startsWith(o));
const b = await launch();
const { page, errors } = await open(b, { viewport: { width: 1100, height: 520 }, deviceScaleFactor: 1 });
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
await ev(() => { const g = window.game; g.quality.setMode(2); g.events.cool = 1e9; g.police.enabled = false; g.save.money = 2e6; window.__hideHud = on => { for (const id of ['hud', 'touch', 'moneyFeed', 'toasts']) { const el = document.getElementById(id); if (el) el.style.visibility = on ? 'hidden' : ''; } };
  // a free camera for photos: after the rig updates, put the lens where window.__freeCam says
  const U = g.cam.update.bind(g.cam); g.cam.update = (...a) => { U(...a); const f = window.__freeCam; if (f) { g.camera.position.set(f.x, f.y, f.z); g.camera.lookAt(f.lx, f.ly, f.lz); } }; });
const shot = async (name) => { await frames(page, 8); await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('shot', name); };
const fadeDone = () => page.waitForFunction(() => !window.game.fading, null, { timeout: 30000, polling: 100 });
// place the player inside the current interior at local (x, y, z), facing yaw, camera pitch
const at = (x, y, z, yaw, pitch = -0.15) => ev(([x, y, z, yaw, pitch]) => { const g = window.game, d = g.content.interiors.cur, p = g.player; p.pos.set(d.ox + x, d.fy + y, d.oz + z); p.vel.set(0, 0, 0); p.h = yaw; g.cam.yaw = yaw; g.cam.pitch = pitch; g.cam.init = false; }, [x, y, z, yaw, pitch]);
if (want('mansion')) {
  await ev(() => { const g = window.game; g.uw.S.props.mansion = { owned: true, dmg: 0, since: 1 }; g.content.enterHome('mansion'); }); await fadeDone();
  await at(0, 0, 9.0, Math.PI, -0.05); await shot('mansion-foyer-stairs');
  await at(-6.5, 0, 8.5, -2.3, -0.12); await shot('mansion-living');
  await at(-6.0, 0, -3.0, -2.2, -0.2); await shot('mansion-kitchen');
  await at(0, 4.2, -3.2, Math.PI * 0.95, -0.35); await shot('mansion-gallery-overlook');
  await at(-6.5, 4.2, -1.5, -2.4, -0.18); await shot('mansion-master-bedroom');
  await at(5.2, 4.2, -2.6, 2.1, -0.25); await shot('mansion-game-room');
  await ev(() => window.game.content.interiors.exit(true));
}
if (want('penthouse')) {
  await ev(() => { const g = window.game; g.uw.S.props.penthouse = { owned: true, dmg: 0, since: 1 }; g.save.owns.penthouse = true; g.content.interiors.enter('penthouse', true); });
  await at(0, 0, -4.0, 0.0, -0.12); await shot('penthouse-living');
  await at(-2.8, 0, -2.6, -2.6, -0.2); await shot('penthouse-master');
  await at(1.0, 0, 0.5, 2.3, -0.15); await shot('penthouse-kitchen-bar');
  await ev(() => window.game.content.interiors.exit(true));
}
if (want('house')) {
  const P = await ev(() => { const g = window.game, out = []; for (const id of ['semi', 'apt', 'single1', 'double1', 'triple1']) { const d = window.__pv.PROP_BY_ID[id]; if (d && d.home) out.push(id); } return out; });
  for (const id of P) {
    await ev(id => { const g = window.game; g.uw.S.props[id] = { owned: true, dmg: 0, since: 1 }; g.content.enterHome(id); }, id); await fadeDone();
    const d = await ev(() => { const c = window.game.content.interiors.cur; return { w: c.w, d: c.d, tier: c.tier }; });
    await at(-d.w / 2 + 1.0, 0, d.d / 2 - 1.0, Math.PI * 0.82, -0.32); await shot(`house-tier${d.tier}-${id}`);
    await ev(() => window.game.content.interiors.exit(true));
  }
}
if (want('cars')) {
  // a line-up of every class on a quiet street, three-quarter front and rear views
  const types = await ev(() => Object.keys(window.__pv.VEHICLES).filter(t => !['police', 'truck', 'utility', 'unmarked'].includes(t)));
  await ev(() => { const g = window.game; g.traffic.enabled = false; g.peds.enabled = false; for (const v of g.vehicles.list.slice()) g.vehicles.despawn(v); g.env.time = 13; });
  for (let i = 0; i < types.length; i += 4) {
    const grp = types.slice(i, i + 4);
    await ev(grp => {
      const g = window.game, x0 = 6 * 80 + 14, z0 = 3 * 80 + 4;
      for (const v of g.vehicles.list.slice()) g.vehicles.despawn(v);
      grp.forEach((t, k) => { g.vehicles.spawn(t, x0 + k * 6.2, z0, 0.35, { parked: true }); });
      g.resetPlayerState(x0 + 9, z0 - 30, 0); window.__hideHud(true);
      window.__freeCam = { x: x0 + 13, y: 2.6, z: z0 + 9.5, lx: x0 + 7, ly: 0.7, lz: z0 };
    }, grp);
    await frames(page, 20); await shot('cars-' + grp.join('-'));
    await ev(() => { const x0 = 6 * 80 + 14, z0 = 3 * 80 + 4; window.__freeCam = { x: x0 + 1, y: 2.4, z: z0 - 8.5, lx: x0 + 8, ly: 0.7, lz: z0 }; });
    await frames(page, 20); await shot('cars-rear-' + grp.join('-'));
  }
  await ev(() => { window.__hideHud(false); window.__freeCam = null; });
}
console.log('errors', errors.slice(0, 5));
await b.close();
