/* The kart simulator (356, owner 2026-11-17): started at the rig in the bunker's games room; the track (a figure of
   eight about 900 m round, a bridge over the crossing, a tunnel, kerbs, tyre walls); a lights-out start with six karts;
   three laps, every kart finishes (none stuck); the player's kart answers the controls (throttle, steering, brakes) and
   the handling settings change it; pause freezes the race; the settings and the best lap are saved; quit returns to the
   bunker with the game as it was. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b, { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
await ev(() => { const g = window.game; g.police.enabled = false; g.events.cool = 1e9; window.__pv.VillaValen.enterBunker(g); });
await page.waitForFunction(() => window.game.content.interiors.cur && window.game.content.interiors.cur.id === 'villa_bunker' && !window.game.fading, null, { timeout: 60000 });
const rig = await ev(() => { const g = window.game, d = g.content.interiors.cur, s = d.spots.find(x => x.id === 'v:kart'); g.content.spotAct('v:kart'); const k = g.kart; return { label: s && s.label, active: k && k.active, n: k.T.n, bridge: k.T.S.filter(x => x.bridge).length, tunnel: k.T.S.filter(x => x.tunnel).length, hud: getComputedStyle(document.getElementById('hud')).display, ui: getComputedStyle(document.getElementById('kartUI')).display }; });
check('the rig in the games room starts the simulator: its own overlay up, the game’s HUD aside', /Kart simulator/.test(rig.label || '') && rig.active && rig.hud === 'none' && rig.ui !== 'none', JSON.stringify(rig));
check('the circuit: about 900 m round, a bridge over the crossing and a tunnel', rig.n > 800 && rig.n < 1100 && rig.bridge > 60 && rig.tunnel > 40, JSON.stringify(rig));
// the start: nobody moves before the lights go out
const grid = await ev(() => { const g = window.game, k = g.kart, inp = g.input; inp.down.add('gas'); for (let i = 0; i < 120; i++) k._step(1 / 60, inp); inp.down.delete('gas'); return { t: +k.t.toFixed(2), speeds: k.karts.map(x => +Math.abs(x.vf).toFixed(2)) }; });
check('the lights: before they go out nobody moves, the throttle held or not', grid.t < 0 && grid.speeds.every(v => v < 0.3), JSON.stringify(grid));
// the player's kart answers: throttle, steering both ways, brakes; the settings change how hard it turns
const drive = await ev(() => {
  const g = window.game, k = g.kart, inp = g.input, me = k.karts[0], out = {};
  const run = (s, keys) => { for (const x of keys) inp.down.add(x); for (let i = 0; i < s * 60; i++) k._step(1 / 60, inp); for (const x of keys) inp.down.delete(x); };
  k.t = 0; run(3, ['gas']); out.v = +me.vf.toFixed(1);
  const h0 = me.h; run(0.6, ['gas', 'left']); out.left = +(me.h - h0).toFixed(2);
  const h1 = me.h; run(0.6, ['gas', 'right']); out.right = +(me.h - h1).toFixed(2);
  const v0 = me.vf; run(1, ['brake']); out.braked = +(v0 - me.vf).toFixed(1);
  // the same turn with the steering set loose turns harder
  const turn = st => { k.reset(); k.t = 0; k.S.steer = st; run(2.5, ['gas']); const h = me.h; run(0.5, ['gas', 'left']); return Math.abs(me.h - h); };
  out.tight = +turn(0.6).toFixed(3); out.loose = +turn(1.5).toFixed(3); k.S.steer = 1;
  return out;
});
check('the kart answers: the throttle takes it to speed, it steers both ways, the brakes stop it', drive.v > 12 && drive.left > 0.05 && drive.right < -0.05 && drive.braked > 5, JSON.stringify(drive));
check('the steering setting changes it: loose turns harder than tight', drive.loose > drive.tight * 1.2, JSON.stringify(drive));
// pause: the race stands still
const paused = await ev(() => { const g = window.game, k = g.kart, inp = g.input; k.paused = true; k._pauseUI(true); const t0 = k.clock; for (let i = 0; i < 30; i++) k.frame(1 / 60); const vis = getComputedStyle(document.querySelector('#kartUI .kp')).display; k.paused = false; k._pauseUI(false); return { still: k.clock === t0, vis }; });
check('pause freezes the race and shows the settings', paused.still && paused.vis === 'flex', JSON.stringify(paused));
// a whole race with the player's kart driven by the rivals' driver: three laps each, every kart home
const race = await ev(() => { const g = window.game, k = g.kart, inp = g.input; k.reset(); k.karts[0].ai = true; k.karts[0].sk = 0.95; for (let i = 0; i < 260 * 60 && !k.karts.every(x => x.done); i++) k._step(1 / 60, inp); k.karts[0].ai = false; return { laps: k.karts.map(x => x.lap), done: k.karts.every(x => x.done), times: k.karts.map(x => +x.fin.toFixed(1)), best: +k.karts[0].best.toFixed(2), saved: g.save.kart.best, result: !!k.result }; });
check('a full race: three laps, every kart finishes (none stuck), within half a minute of each other', race.done && race.laps.every(l => l === 3) && Math.max(...race.times) - Math.min(...race.times) < 30, JSON.stringify(race));
check('your best lap is kept, and saved as the record', race.best > 20 && race.saved > 0 && race.saved <= race.best + 1e-6 && race.result, JSON.stringify(race));
// the settings are saved with the game
await ev(() => { const g = window.game; g.kart.S.rgrip = 0.75; g.saveGame(true); });
const persisted = await ev(() => { const raw = window.__pv.SaveSystem.load ? null : null; return window.game.save.kart.rgrip; });
check('the handling settings are part of the save', persisted === 0.75, String(persisted));
// quit: back to the bunker, the game running again
await ev(() => { const k = window.game.kart; k.paused = true; k._pauseUI(true); document.querySelector('#kartUI .kp [data-a="quit"]').click(); });
await frames(page, 20);
const back = await ev(() => { const g = window.game; return { active: g.kart.active, int: g.content.interiors.cur && g.content.interiors.cur.id, hud: getComputedStyle(document.getElementById('hud')).display, ui: getComputedStyle(document.getElementById('kartUI')).display, state: g.state }; });
check('quit: back in the bunker, the game running, its HUD back', !back.active && back.int === 'villa_bunker' && back.hud !== 'none' && back.ui === 'none' && back.state === 'playing', JSON.stringify(back));
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await finish(b, 'kart');
