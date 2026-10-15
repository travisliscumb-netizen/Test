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
const { page, errors } = await open(b, { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
await ev(() => { const g = window.game; g.quality.setMode(2); g.events.cool = 1e9; g.police.enabled = false; g.save.money = 2e6; window.__hideHud = on => { document.getElementById('hud').style.visibility = on ? 'hidden' : ''; document.getElementById('touch').style.visibility = on ? 'hidden' : ''; }; });
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
console.log('errors', errors.slice(0, 5));
await b.close();
