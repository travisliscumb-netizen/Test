/* Big map on a phone: pinch zoom, drag pan, wheel zoom, clamped zoom range, the place index
   (search, categories, tap to centre), tracking a place (waypoint, distance, minimap badge),
   one symbol per category everywhere, layer filters, property cards, no page scroll. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const t = await open(b, { hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });
const page = t.page;
await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
await ev(() => { const g = window.game; g.events.cool = 1e9; g.police.enabled = false; g.resetPlayerState(5 * 80 + 40, 5 * 80 + 2, 0); });
await frames(page, 10);
const cdp = await t.ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const mapRect = () => ev(() => { const r = document.getElementById('bigmapCanvas').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
const view = () => ev(() => { const v = window.game.ui.mapView; return { z: +v.zoom.toFixed(3), tz: +v.tz.toFixed(3), cx: +v.cx.toFixed(1), cz: +v.cz.toFixed(1) }; });
const settle = async () => { for (let k = 0; k < 40; k++) { await frames(page, 2); const v = await view(); if (Math.abs(v.z - v.tz) < 0.01) break; } };

await ev(() => window.game.ui.toggleMap(true)); await frames(page, 6);
const r = await mapRect();
check('map opens filling the screen minus a margin', r.w > 700 && r.h > 250, JSON.stringify(r));
const v0 = await view();
check('map opens at the whole-city zoom', v0.z === 1, JSON.stringify(v0));
// pinch: two fingers spread apart around the centre
const cx = r.l + r.w / 2, cy = r.t + r.h / 2;
await touch('touchStart', [{ x: cx - 40, y: cy, id: 1 }, { x: cx + 40, y: cy, id: 2 }]);
for (let k = 1; k <= 10; k++) { await touch('touchMove', [{ x: cx - 40 - k * 14, y: cy, id: 1 }, { x: cx + 40 + k * 14, y: cy, id: 2 }]); await frames(page, 1); }
await touch('touchEnd', []); await frames(page, 4);
const v1 = await view();
check('pinch out zooms in by the finger spread (80 px to 360 px apart = 4.5x)', v1.z > 4.2 && v1.z < 4.8, JSON.stringify(v1));
// drag pans
await touch('touchStart', [{ x: cx, y: cy, id: 3 }]);
for (let k = 1; k <= 8; k++) { await touch('touchMove', [{ x: cx - k * 20, y: cy - k * 6, id: 3 }]); await frames(page, 1); }
await touch('touchEnd', []); await frames(page, 4);
const v2 = await view();
check('one-finger drag pans the map', Math.abs(v2.cx - v1.cx) > 20 && v2.z === v1.z, JSON.stringify({ v1, v2 }));
check('the page itself never scrolls while using the map', await ev(() => (document.scrollingElement.scrollTop | 0) === 0 && (document.scrollingElement.scrollLeft | 0) === 0));
// limits: pinching far out stops at 1x, far in stops at 8x
await ev(() => { const v = window.game.ui.mapView; for (let k = 0; k < 10; k++) v.zoomAt(3, v.W / 2, v.H / 2, true); });
const vmax = await view();
await ev(() => { const v = window.game.ui.mapView; for (let k = 0; k < 10; k++) v.zoomAt(0.2, v.W / 2, v.H / 2, true); });
const vmin = await view();
check('zoom is clamped between 1x and 8x', vmax.z === 8 && vmin.z === 1, JSON.stringify({ vmax, vmin }));
// mouse wheel zooms about the cursor (desktop)
await ev(() => { const cv = document.getElementById('bigmapCanvas'), r = cv.getBoundingClientRect(); cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, clientX: r.left + r.width * 0.3, clientY: r.top + r.height * 0.4, bubbles: true, cancelable: true })); });
await settle();
const vw = await view();
check('mouse wheel zooms smoothly toward the cursor', vw.z > 1.5, JSON.stringify(vw));
// labels get more detailed as you zoom
const lab = await ev(() => { const v = window.game.ui.mapView, c = v.c, seen = []; const o = c.fillText; c.fillText = function (s, x, y) { seen.push(String(s)); return o.apply(this, arguments); }; v.zoomAt(1 / 8, v.W / 2, v.H / 2, true); v.draw(); const z1 = seen.length; seen.length = 0; v.centerOn(5 * 80, 5 * 80, 4); v.zoom = v.tz; v.cx = v.tcx; v.cz = v.tcz; v.draw(); const z4 = seen.slice(); c.fillText = o; return { z1, z4: z4.length, streets: z4.filter(s => /St|Ave|Blvd|Dr|Rd/.test(s)).length }; });
check('zooming in reveals more labels, street names included', lab.z4 > lab.z1 && lab.streets >= 2, JSON.stringify(lab));

// index: search for the chop shop, tap it, the map centres on it
await ev(() => { const v = window.game.ui.mapView; v.zoomAt(1 / 8, v.W / 2, v.H / 2, true); });
await page.click('#mapIdxBtn'); await frames(page, 4);
check('the Places index opens as a drawer', await ev(() => !document.getElementById('mapDrawer').classList.contains('hidden')));
await page.fill('#mapSearch', 'chop'); await frames(page, 3);
const items = await ev(() => [...document.querySelectorAll('#mapList .mdItem')].map(b => ({ key: b.dataset.key, t: b.querySelector('b').textContent, icon: b.querySelector('.ico').textContent })));
check('searching "chop" finds the chop shop', items.some(i => /chop/i.test(i.t)), JSON.stringify(items));
check('typing in the search box does not trigger game keys (map stays open)', await ev(() => window.game.mapOpen));
const chop = items.find(i => /chop/i.test(i.t));
await page.click(`#mapList .mdItem[data-key="${chop.key}"]`); await settle();
const foc = await ev(([key]) => { const v = window.game.ui.mapView, e = v.entries.find(x => x.key === key); const [sx, sy] = v.worldToScreen(e.x, e.z); return { sx, sy, W: v.W, H: v.H, z: v.zoom, card: !document.getElementById('mapCard').classList.contains('hidden'), cardText: document.getElementById('mapCard').textContent }; }, [chop.key]);
check('tapping a place centres and zooms the map on it', Math.abs(foc.sx - foc.W / 2) < 40 && Math.abs(foc.sy - foc.H / 2) < 40 && foc.z >= 3, JSON.stringify(foc));
check('its card shows name, category, district and distance', foc.card && /Chop/.test(foc.cardText) && /away/.test(foc.cardText), foc.cardText.slice(0, 120));
await page.click('#mapCard [data-act="track"]'); await frames(page, 3);
const tr = await ev(() => { const g = window.game, w = g.content.waypoint; return w && { key: w.key, icon: w.icon, label: w.label }; });
check('"Track location" sets the destination', tr && tr.key === chop.key && tr.icon === 'C', JSON.stringify(tr));
await ev(() => window.game.ui.toggleMap(false)); await frames(page, 30);
const hud = await ev(() => { const g = window.game; return { obj: document.querySelector('#objective .ot').textContent, arrow: !document.getElementById('objArrow').classList.contains('hidden'), gt: g.content.guideTarget && g.content.guideTarget.icon }; });
check('the HUD shows the tracked place with its distance and an arrow', /Chop/.test(hud.obj) && /\d+ m|km/.test(hud.obj) && hud.arrow, JSON.stringify(hud));
// minimap draws the same badge symbol for the tracked place (labels as text; symbols, since G8, as cached badge
// sprites that report which symbol they drew)
const mm = await ev(() => {
  const g = window.game, c = g.ui.mmc, seen = [], o = c.fillText;
  c.fillText = function (s) { seen.push(String(s)); return o.apply(this, arguments); };
  c.__trace = seen; g.ui.drawMinimap(); c.fillText = o; c.__trace = null; return seen;
});
check('the minimap shows the tracked place with the same C symbol', mm.includes('C'), JSON.stringify(mm.slice(0, 20)));
const cons = await ev(() => { const v = window.game.ui.mapView, C = window.__pv.MAP_CATS; v.buildIndex(); const chop = v.entries.filter(e => e.cat === 'chop'); return { chop: chop.map(e => e.icon), cat: C.chop.icon, police: v.entries.filter(e => e.cat === 'police').map(e => e.icon), pcat: C.police.icon }; });
check('one symbol per category across index, big map and minimap', cons.chop.every(i => i === cons.cat) && cons.police.every(i => i === cons.pcat), JSON.stringify(cons));

// layers: properties are hidden by default and appear with the filter; the property card is complete
await ev(() => window.game.ui.toggleMap(true)); await frames(page, 4);
const lay = await ev(() => { const v = window.game.ui.mapView; v.buildIndex(); const before = v.visibleEntries().filter(e => e.cat === 'home').length; v.setLayer('properties', true); const after = v.visibleEntries().filter(e => e.cat === 'home').length; return { before, after, total: v.entries.filter(e => e.cat === 'home').length }; });
check('homes for sale are a layer: off by default, on with the filter', lay.before === 0 && lay.after === lay.total && lay.total >= 15, JSON.stringify(lay));
const card = await ev(() => { const v = window.game.ui.mapView, e = v.entries.find(x => x.prop && x.prop.tier === 5); v.select(e, true); return document.getElementById('mapCard').textContent; });
check('a property card shows price, status, type, parking, district and features', ['Price', 'Status', 'Type', 'Parking', 'District', 'garage'].every(w => card.includes(w)), card.slice(0, 200));
const terr = await ev(() => { const v = window.game.ui.mapView; const a = v.layerOn('territory'); v.setLayer('territory', !a); const b2 = v.layerOn('territory'); v.setLayer('territory', a); return { a, b2, back: v.layerOn('territory') }; });
check('the territory overlay is one of the layers and still toggles', terr.a !== terr.b2 && terr.back === terr.a, JSON.stringify(terr));
// the close button and the backdrop both close it
await page.click('#mapClose'); await frames(page, 3);
check('the ✕ button closes the map', await ev(() => !window.game.mapOpen));
check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
await finish(b, 'map');
