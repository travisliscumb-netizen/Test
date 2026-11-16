/* The new districts round the grid, Villa Valen and the Valen Vault (128, CITY_SPREAD.md §10), in the running game.
   node underworld/tests/districts.mjs */
import { launch, open, boot } from './lib.mjs';
let fail = 0;
const check = (name, ok, detail = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };
const b = await launch(); const { page, errors } = await open(b); await boot(page);
const r = await page.evaluate(() => {
  const g = window.game, w = g.world, pv = window.__pv, D = w.isle.districts, out = {};
  const by = {}; for (const L of D.lots) by[L.d] = (by[L.d] || 0) + 1; out.by = by;
  // every lot: off every road's carriageway, dry, on its own level ground, clear of every other lot and of the city
  // (the building area: the lot's front edge meets the street's own bed, which has the last word there)
  out.badLots = D.lots.filter(L => { const r = L.rect, hx = (r[2] - r[0]) * 0.3, hz = (r[3] - r[1]) * 0.3; for (const q of [[L.x - hx, L.z - hz], [L.x + hx, L.z + hz], [L.x - hx, L.z + hz], [L.x + hx, L.z - hz], [L.x, L.z]]) { const dv = Math.abs(pv.groundY(q[0], q[1], 60) - L.P.y); out.worst = Math.max(out.worst || 0, dv); if (dv > 0.3) return true; if (!pv.offCity(q[0], q[1])) return true; } return pv.isOnRoad(L.x, L.z); }).map(L => L.i);
  out.overlap = 0; for (let i = 0; i < D.lots.length; i++) for (let j = i + 1; j < D.lots.length; j++) { const a = D.lots[i].rect, c = D.lots[j].rect; if (a[0] < c[2] && a[2] > c[0] && a[1] < c[3] && a[3] > c[1]) out.overlap++; }
  // the streets: in the road graph, curved, joined to the island's roads at both ends (or a turning circle)
  const names = ['Bayview Crescent', 'Ridgeview Drive', 'Laurel Way', 'Marsh Hollow Road', 'Heron Loop', 'Reed Street', 'Quay Road', 'Foundry Wharf'];
  out.links = names.map(n => (w.links || []).some(L => L.name === n));
  out.edges = names.map(n => pv.RoadGraph.edges.filter(e => e.name === n).length);
  // the GPS finds a way from downtown to each district, the villa and the port
  out.routes = [[-600, -836], [-480, 1466], [-1150, 1280], [-400, -200], [1900, -560]].map(([x, z]) => { const p = pv.RoadGraph.route(480, 480, x, z); return p ? Math.round(p.len || 0) : 0; });
  // the villa: its level grounds, the vault's walls solid, its doorway open, the gallery's cars and the places on the map
  const V = w.isle.villa, Q = V.vault, y = V.y + 1;
  const solid = (x, z) => w.grid.query(x - 0.5, z - 0.5, x + 0.5, z + 0.5, []).some(c => c.y1 > y && c.y0 < y + 1 && (c.r !== undefined ? Math.hypot(c.x - x, c.z - z) < c.r + 0.2 : x > c.x0 - 0.2 && x < c.x1 + 0.2 && z > c.z0 - 0.2 && z < c.z1 + 0.2));
  out.vault = { wall: solid(Q.x0 + 20, Q.z1), door: solid(Q.door, Q.z1), inside: solid(Q.door, Q.z1 - 5), gallery: w.isle.fleet.find(F => F.id === 'vault_gallery').slots.length };
  out.places = ['villa_valen'].map(id => !!w.places[id]).concat(['vault', 'district_bayview', 'district_marsh', 'district_landing'].map(id => w.mapPlaces.some(p => p.id === id)));
  out.blocks = D.blocks.length; out.stream = D.blocks.every(B => w.xblocks[B.i - 1000] && w.xblocks[B.i - 1000].isle);
  return out;
});
check('the districts are built: Bayview Heights, Marsh Hollow, Blackgate Landing, Lake Valen Shore and Gull Harbor all have lots', ['bayview', 'marsh', 'landing', 'lakeside', 'gull'].every(d => r.by[d] > 0) && r.by.bayview > 30 && r.by.marsh > 50, JSON.stringify(r.by));
check('every lot stands on its own level ground, off the city and off every road, and no two lots overlap', r.badLots.length === 0 && r.overlap === 0, JSON.stringify([r.badLots.length, r.badLots.slice(0, 10), r.overlap, +(r.worst || 0).toFixed(2)]));
check('the eight new streets are curved links in the road graph', r.links.every(Boolean) && r.edges.every(n => n > 0), JSON.stringify([r.links, r.edges]));
check('the GPS routes from downtown to Villa Valen, Marsh Hollow, Blackgate Landing, Bayview and the lake shore', r.routes.every(l => l > 100), JSON.stringify(r.routes));
check('the Valen Vault: its walls are solid, its doorway is open and you can drive in, six cars in the gallery', r.vault.wall === true && r.vault.door === false && r.vault.inside === false && r.vault.gallery === 6, JSON.stringify(r.vault));
check('Villa Valen, the vault and the districts are on the map', r.places.every(Boolean), JSON.stringify(r.places));
check('the districts stream as island blocks', r.blocks > 10 && r.stream, String(r.blocks));
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await Promise.race([b.close().catch(() => {}), new Promise(res => setTimeout(res, 5000))]);
console.log(`\ndistricts: ${fail ? 'FAILED' : 'ALL CHECKS PASSED'}`);
process.exit(fail ? 1 : 0);
