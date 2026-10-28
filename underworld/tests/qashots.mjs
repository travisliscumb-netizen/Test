/* Visual-QA screenshots for this pass (not a test): interiors (mansion both floors, game room, penthouse,
   houses by tier), the parkade decks, gas stations, phone apps, taxi map, jail, vehicles, entrances,
   districts. Written to underworld/.shots/qa. */
import { launch, open, frames, startNew, throughCourt } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '.shots', 'qa');
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const want = n => !only.length || only.some(o => n.startsWith(o));
const b = await launch();
const { page, errors } = await open(b, { viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
await ev(q => { const g = window.game; g.quality.setMode(q); g.save.settings.guide = false; g.events.cool = 1e9; g.police.enabled = false; (g.money.W.clean = g.money.W.dirty.me = 2e6); window.__hideTip = () => { const t = document.getElementById('tip'); if (t) t.style.visibility = 'hidden'; }; window.__hideHud = on => { for (const id of ['hud', 'touch', 'moneyFeed', 'toasts']) { const el = document.getElementById(id); if (el) el.style.visibility = on ? 'hidden' : ''; } };
  // a free camera for photos: after the rig updates, put the lens where window.__freeCam says
  const U = g.cam.update.bind(g.cam); g.cam.update = (...a) => { U(...a); const f = window.__freeCam; if (f) { g.camera.position.set(f.x, f.y, f.z); g.camera.lookAt(f.lx, f.ly, f.lz); } }; }, +(process.env.QA_Q || 1));
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
  { const sp = await ev(() => { const d = window.game.content.interiors.cur, q = d.spots.find(x => /Sleep/i.test(x.label)) || d.spots[0]; return { x: q.x, z: q.z }; }); await at(sp.x + 1.2, 0, sp.z + 1.6, Math.atan2(-1.2, -1.6), -0.25); await shot('penthouse-master'); }
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
  // every class, one at a time on a quiet street: a three-quarter front view and a rear view
  const types = await ev(() => Object.keys(window.__pv.VEHICLES).filter(t => !['truck', 'utility'].includes(t)));
  await ev(() => { const g = window.game; g.traffic.enabled = false; g.peds.enabled = false; g.env.time = 14; });
  for (const t of types) {
    await ev(t => {
      const g = window.game, x0 = 6 * 80 + 30, z0 = 3 * 80 + 3.5;
      for (const v of g.vehicles.list.slice()) if (v !== g.player.vehicle) g.vehicles.despawn(v);
      g.resetPlayerState(x0 - 14, z0 - 9, 0); window.__hideHud(true);
      const v = g.vehicles.spawn(t, x0, z0, Math.PI / 2, { parked: true }); window.__car = v;
      window.__freeCam = { x: x0 + 3.3, y: 1.55, z: z0 + 2.9, lx: x0 + 0.3, ly: 0.6, lz: z0 };
    }, t);
    await frames(page, 6);
    await ev(t => { const g = window.game, x0 = 6 * 80 + 30, z0 = 3 * 80 + 3.5; if (!g.vehicles.list.includes(window.__car)) window.__car = g.vehicles.spawn(t, x0, z0, Math.PI / 2, { parked: true }); window.__car.pos.set(x0, window.__car.pos.y, z0); }, t);
    await frames(page, 10); await shot('car-' + t);
    await ev(() => { const x0 = 6 * 80 + 30, z0 = 3 * 80 + 3.5; window.__freeCam = { x: x0 - 3.6, y: 1.5, z: z0 - 2.8, lx: x0 - 0.3, ly: 0.6, lz: z0 }; });
    await frames(page, 10); await shot('car-rear-' + t);
  }
  await ev(() => { window.__hideHud(false); window.__freeCam = null; });
}
if (want('doors')) {
  // entrances: a shop, a public door, a property and a house, by day, at night and in the rain
  const picks = await ev(() => { const E = window.game.entrances, out = []; for (const k of ['shop', 'public', 'home', 'works']) { const d = E.doors.find(x => x.kind === k && x.wall !== null); if (d) out.push(d); } return out.map(d => ({ x: d.x, z: d.z, h: d.h, kind: d.kind, id: d.id })); });
  for (const [mode, time, wx] of [['day', 13, 'clear'], ['night', 22.5, 'clear'], ['rain', 17, 'rain']]) {
    await ev(([time, wx]) => { const g = window.game; g.env.time = time; g.env.setWeather(wx, true); }, [time, wx]);
    for (const d of picks) {
      await ev(d => { const g = window.game, fx = Math.sin(d.h), fz = Math.cos(d.h), rx = Math.cos(d.h), rz = -Math.sin(d.h);
        g.resetPlayerState(d.x + fx * 1.0 + rx * 1.4, d.z + fz * 1.0 + rz * 1.4, d.h + Math.PI); window.__hideHud(true);
        window.__freeCam = { x: d.x + fx * 6.5 + rx * 3.0, y: 2.4, z: d.z + fz * 6.5 + rz * 3.0, lx: d.x - fx * 1.2, ly: 1.5, lz: d.z - fz * 1.2 }; }, d);
      await frames(page, 16); await shot(`door-${mode}-${d.kind}-${d.id}`);
    }
  }
  await ev(() => { const g = window.game; window.__hideHud(false); window.__freeCam = null; g.env.setWeather('clear', true); g.env.time = 13; });
}
const free = (x, y, z, lx, ly, lz) => ev(a => { window.__freeCam = { x: a[0], y: a[1], z: a[2], lx: a[3], ly: a[4], lz: a[5] }; window.__hideHud(true); }, [x, y, z, lx, ly, lz]);
const unfree = () => ev(() => { window.__freeCam = null; window.__hideHud(false); });
if (want('parkade')) {
  const pk = await ev(() => { const k = window.game.world.parkade; return { x0: k.x0, x1: k.x1, z0: k.z0, z1: k.z1, L: k.L, e: k.entrance }; });
  const xm = (pk.x0 + pk.x1) / 2;
  await ev(pk => { const g = window.game; g.env.time = 13; g.resetPlayerState(pk.e.x + 4, pk.e.z - 6, 0); }, pk);
  await free(xm + 10, 3.2, pk.z0 - 14, xm, 3, pk.z0 + 4); await shot('parkade-ground-entry');
  await free(pk.x0 + 6, pk.L[2] + 1.7, (pk.z0 + pk.z1) / 2, pk.x1 - 10, pk.L[2] + 0.8, (pk.z0 + pk.z1) / 2); await shot('parkade-middle-level');
  await free(pk.x0 + 4, pk.L[3] + 4.5, pk.z1 - 3, pk.x1 - 8, pk.L[3], pk.z0 + 6); await shot('parkade-roof');
  await unfree();
}
if (want('station')) {
  const st = await ev(() => { const d = window.game.world.places.store2.door; return { x: d.x, z: d.z, h: d.h || 0 }; });
  await ev(st => { const g = window.game; g.env.time = 19.5; g.resetPlayerState(st.x + Math.sin(st.h) * 3, st.z + Math.cos(st.h) * 3, st.h + Math.PI); }, st);
  await free(st.x + Math.sin(st.h) * 22 + Math.cos(st.h) * 8, 5, st.z + Math.cos(st.h) * 22 - Math.sin(st.h) * 8, st.x, 2, st.z); await shot('station-exterior-dusk');
  await unfree();
  await ev(() => { const g = window.game; g.env.time = 13; g.content.interiors.enter('store2', true); const d = g.content.interiors.cur; d.staffOpen = true; if (d.cols && d.staffCol !== undefined) d.cols[d.staffCol].on = false; });
  await at(0, 0, 3.5, Math.PI, -0.12); await shot('station-shop');
  await at(3.0, 0, -2.2, 2.6, -0.2); await shot('station-back-office');
  await ev(() => window.game.content.interiors.exit(true));
}
if (want('casino')) {
  await ev(() => { const g = window.game; g.save.rep = 2000; g.police.clear(); g.content.enterCasino(); }); await fadeDone(); await page.waitForFunction(() => window.game.content.interiors.cur, null, { timeout: 30000 });
  await at(0, 0, 11, Math.PI, -0.1); await shot('casino-floor');
  await at(-12, 0, 6, -2.4, -0.15); await shot('casino-slots');
  await ev(() => window.game.content.interiors.exit(true));
}
if (want('phone')) {
  await ev(() => { const g = window.game; g.uw.give({ smokes: 6, green: 4 }, 'buy', { smokes: 20, green: 200 }); g.save.discovered.zones = { o: 1, c: 1, m: 1, s: 1 }; });
  for (const [tab, name] of [[null, 'phone-home'], ['pnl', 'phone-market-mystock'], ['connect', 'phone-street-connect'], ['stashes', 'phone-stashes'], ['garage', 'phone-garage']]) {
    await ev(tab => window.game.uw.ui.open(tab || undefined), tab); await shot(name);
  }
  await ev(() => { const g = window.game; while (g.ui.stack.length) g.ui.back(); });
}
if (want('taxi')) {
  await ev(() => { const g = window.game, P = window.__pv, kp = P.nearestRoadPoint(5 * 80 + 40, 5 * 80); g.resetPlayerState(kp.x, kp.z, 0); g.taxi.call(); let t = 0; while (g.taxi.state === 'coming' && t < 5400) { g.update(1 / 60, 1 / 60); t++; } const v = g.taxi.cab, w = v.toWorld(v.spec.w / 2 + 0.6, 0); g.player.pos.set(w.x, g.player.pos.y, w.z); g.taxi.approach(v); document.querySelector('#svcBody [data-act="hire"]').click(); g.ui.mapView.setPick(9 * 80 + 40, 2 * 80); });
  await shot('taxi-destination-map');
  await ev(() => document.querySelector('#mapPick [data-pk="ok"]').click());
  await frames(page, 30); await shot('taxi-ride-hud');
  await ev(() => { const g = window.game; g.taxi.cab.vel.set(0, 0); g.taxi.getOut(); });
}
if (want('jail')) {
  await ev(() => { const g = window.game; g.uw.S.rap.cur = { pickpocket: 1 }; g.police.setLevel(1); g.uw.S.rap.maxLvl = Math.max(g.uw.S.rap.maxLvl || 0, 3); g.uw.legal.add('assault', 'police'); g.onBusted(); });
  await throughCourt(page);
  await page.waitForFunction(() => window.game.uw.S.jail && !window.game.fading && window.game.state === 'playing', null, { timeout: 120000, polling: 100 });
  await frames(page, 20); await shot('jail-yard-hud');
  await ev(() => window.game.uw.prison.openLife()); await shot('jail-life');
  await ev(() => { const g = window.game; while (g.ui.stack.length) g.ui.back(); g.uw.prison.release ? g.uw.prison.release() : null; });
}
if (want('bend')) {
  const L = await ev(() => { const L = window.game.world.links.find(l => /Bend|Curve|Lane/.test(l.name)); const q = L.pts[Math.floor(L.pts.length / 2)]; return { x: q[0], z: q[1], name: L.name }; });
  await ev(L => { const g = window.game; g.env.time = 12; g.traffic.enabled = true; g.resetPlayerState(L.x + 6, L.z + 6, 0); }, L);
  await free(L.x + 30, 26, L.z + 30, L.x, 0, L.z); await shot('road-bend-' + L.name.replace(/\s+/g, '-'));
  await unfree();
}
if (want('district')) {
  for (const [z, name] of [['c', 'financial'], ['o', 'old-quarter'], ['u', 'crestmoor'], ['p', 'nightlife'], ['l', 'linden-hills']]) {
    const c = await ev(z => window.__pv.ZONE_CENTRE[z], z);
    await ev(c => { const g = window.game; g.env.time = 17.5; g.resetPlayerState(c.x, c.z, 0); }, c);
    await free(c.x - 60, 45, c.z - 60, c.x + 10, 0, c.z + 10); await frames(page, 30); await shot('district-' + name);
  }
  await unfree();
}
console.log('errors', errors.slice(0, 5));
await b.close();
