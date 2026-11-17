/* Flying (and driving) on a phone (2026-11-17): a thumb that slides from one held button onto another. A touch belonged
   to the button it started on, so a thumb sliding from a helicopter's Up onto Down kept Up held: it climbed on and Down
   did nothing until the thumb came off the glass (in a car, Gas stayed down sliding onto Brake). Now the touch follows
   the thumb: onto Down it lets go of Up and holds Down; lifted, it lets go of whatever it holds. Taps fly as before:
   Up climbs, letting go holds the height, Down brings it onto its skids. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const { page, errors } = await open(b, { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
// one thumb (one touch identifier): down on a button, moved to over another, lifted (the events go to the element the
// touch started on, as a browser sends them)
const thumb = (kind, from, over) => ev(([kind, from, over]) => {
  const el = document.querySelector(`#touch .tbtn[data-act="${from}"]`), at = document.querySelector(`#touch .tbtn[data-act="${over || from}"]`).getBoundingClientRect();
  const t = new Touch({ identifier: 41, target: el, clientX: at.x + at.width / 2, clientY: at.y + at.height / 2 });
  el.dispatchEvent(new TouchEvent(kind, { changedTouches: [t], touches: kind === 'touchend' ? [] : [t], bubbles: true, cancelable: true }));
  const inp = window.game.input, lit = a => document.querySelector(`#touch .tbtn[data-act="${a}"]`).classList.contains('on'); return { up: inp.isDown('gas'), down: inp.isDown('brake'), upLit: lit('gas'), downLit: lit('brake') };
}, [kind, from, over]);
await ev(() => { const g = window.game; g.police.enabled = false; g.events.cool = 1e9; g.traffic.enabled = false; });
// Villa Valen's helicopter on its pad
await ev(() => {
  const g = window.game, X = -540, Z = -870; g.resetPlayerState(X, Z, 0); g.fleet.update(X, Z); for (let k = 0; k < 40; k++) g.isleScene.update(X, Z);
  for (let i = 0; i < 30; i++) g.update(1 / 60, 1 / 60); g.fleet.update(X, Z);
  const v = g.vehicles.list.find(v => v.type === 'aurelia'); g.player.pos.set(v.pos.x + 2.2, v.pos.y, v.pos.z + 0.4); g.beginEnter(g.nearestVehicle(2.4)); window.__h = v;
});
await frames(page, 60);
const step = (n) => ev(n => { const g = window.game, v = window.__h; for (let i = 0; i < n; i++) g.update(1 / 60, 1 / 60); return { state: g.player.state, agl: +v.air.agl.toFixed(2), vy: +v.air.vy.toFixed(2), lift: v.ctl.lift, grounded: v.air.grounded }; }, n);
const idle = await step(200);
check('in Villa Valen’s helicopter, nothing held: it stays on its pad', idle.state === 'vehicle' && idle.grounded && idle.lift === 0, JSON.stringify(idle));
// a tap-and-hold of Up, then let go: it climbs, then holds its height
await thumb('touchstart', 'gas'); const up = await step(240); await thumb('touchend', 'gas');
await step(150); const h1 = await step(1); const h2 = await step(180);
check('Up held: it lifts off and climbs; let go: it holds its height', !up.grounded && up.agl > 8 && Math.abs(h2.agl - h1.agl) < 1.5 && h2.lift === 0, JSON.stringify({ up, h1, h2 }));
// the slide: Up held, the thumb slides onto Down
await thumb('touchstart', 'gas'); await step(60);
const slid = await thumb('touchmove', 'gas', 'brake');
let dn = null; for (let k = 0; k < 12 && !(dn && dn.grounded); k++) dn = await step(120);
const lifted = await thumb('touchend', 'gas', 'brake');
check('a thumb sliding from Up onto Down lets go of Up and holds Down', !slid.up && slid.down, JSON.stringify(slid));
check('and the helicopter comes down onto its skids', dn.grounded && dn.agl < 0.5, JSON.stringify(dn));
check('the thumb lifted: nothing is held', !lifted.up && !lifted.down && !lifted.upLit && !lifted.downLit, JSON.stringify(lifted));
// a car: Gas held, sliding onto Brake, it stops driving and brakes
const car = await ev(async () => {
  const g = window.game, h = window.__h; g.exitVehicle(true);
  const P = window.__pv, kp = P.nearestRoadPoint(h.pos.x + 40, h.pos.z); g.resetPlayerState(kp.x, kp.z, 0);
  const v = g.vehicles.spawn('sedan', kp.x, kp.z, 0); v.owned = true; g.completeEnter(v); window.__c = v; return g.player.state;
});
await thumb('touchstart', 'gas'); await ev(() => { const g = window.game; for (let i = 0; i < 90; i++) g.update(1 / 60, 1 / 60); });
const s1 = await thumb('touchmove', 'gas', 'brake');
const cs = await ev(() => { const g = window.game, v = window.__c; const sp0 = v.speed; for (let i = 0; i < 60; i++) g.update(1 / 60, 1 / 60); return { sp0: +sp0.toFixed(1), sp1: +v.speed.toFixed(1), thr: v.ctl.throttle }; });
await thumb('touchend', 'gas', 'brake');
check('in a car, sliding from Gas onto Brake lets go of Gas and brakes', car === 'vehicle' && !s1.up && s1.down && cs.thr < 0 && cs.sp1 < cs.sp0, JSON.stringify({ s1, cs }));
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await finish(b, 'flighttouch');
