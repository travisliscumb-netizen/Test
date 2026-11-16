/* World fingerprint (CITY_SPREAD.md): hashes of everything the world generator and the layout decide, so a
   change that must not move anything can prove it. Not a test; it prints a table and writes JSON.

     node underworld/tools/world-print.mjs [out.json] [index.html]          fingerprint a build
     node underworld/tools/world-print.mjs --cmp a.json b.json              compare two fingerprints (exit 1 on a difference)
     UW_QUERY='?layout=classic' …                                            under another city layout (the baseline is classic)

   Sections: every city block and extra block (buildings, details, props, parked cars, signs, lights, seats ...),
   the world's own lists (local roads, homes, map places, lots, lamps, links), the road net and the road graph, the
   collision grid, the places, and a lattice of samples of the questions everything asks (zone, ground height, on a
   road, a local road, off the city). A block's hash is of its own data only, so a difference names the block. */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (args[0] === '--cmp') {
  const A = JSON.parse(fs.readFileSync(args[1], 'utf8')), B = JSON.parse(fs.readFileSync(args[2], 'utf8'));
  let diff = 0;
  const keys = new Set([...Object.keys(A.sections), ...Object.keys(B.sections)]);
  for (const k of keys) {
    const a = A.sections[k], b = B.sections[k];
    if (!a || !b || a.hash !== b.hash || a.n !== b.n) { diff++; console.log(`DIFF  ${k}  ${a ? a.hash + ' n=' + a.n : '(missing)'}  ->  ${b ? b.hash + ' n=' + b.n : '(missing)'}`); }
  }
  for (const list of ['blocks', 'xblocks']) {
    const a = A[list] || [], b = B[list] || [], bad = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) bad.push(i);
    if (bad.length) { diff++; console.log(`DIFF  ${list}: ${bad.length} of ${Math.max(a.length, b.length)} differ: ${bad.slice(0, 40).join(' ')}${bad.length > 40 ? ' ...' : ''}`); }
  }
  const la = JSON.stringify(A.layout || null), lb = JSON.stringify(B.layout || null);
  if (la !== lb) console.log(`layout  ${la}  ->  ${lb}`);
  console.log(diff ? `\n${diff} difference(s)` : `IDENTICAL  (${keys.size} sections, ${(A.blocks || []).length} blocks, ${(A.xblocks || []).length} extra blocks)`);
  process.exit(diff ? 1 : 0);
}

const out = args[0] || null;
if (args[1]) process.env.UW_FILE = path.resolve(args[1]);
const { launch, open, boot, FILE } = await import('../tests/lib.mjs');

const browser = await launch();
const { page, errors } = await open(browser);
await boot(page);
// WP_SKIP=I,J: leave those keys out of every object (to show that a change adds fields and moves nothing else)
const SKIP = (process.env.WP_SKIP || '').split(',').filter(Boolean);
const print = await page.evaluate((SKIP) => {
  const pv = window.__pv, g = window.game, w = g.world;
  // a running hash over a stream of text (two 32-bit halves, cyrb53's mixing)
  const H = () => {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57, n = 0;
    return {
      add(s) { for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } n += s.length; },
      done() {
        let a = h1, b = h2;
        a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
        b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
        return (b >>> 0).toString(16).padStart(8, '0') + (a >>> 0).toString(16).padStart(8, '0');
      },
      get n() { return n; }
    };
  };
  const skip = v => !v || typeof v !== 'object' ? false : !!(v.isObject3D || v.isBufferGeometry || v.isMaterial || v.isTexture || v.isBufferAttribute || v instanceof Element || v instanceof CanvasRenderingContext2D || v === g || v === w || v === window);
  // a stable walk: own enumerable keys in sorted order, numbers at full precision, anything already on the path or
  // seen under another key written as a mark (so shared and cyclic references cost nothing and stay deterministic)
  function walk(v, h, seen, depth) {
    if (v === null || v === undefined) { h.add('~'); return; }
    const t = typeof v;
    if (t === 'number') { h.add(Object.is(v, -0) ? '-0' : String(v)); h.add(','); return; }
    if (t === 'string') { h.add('"' + v + '"'); return; }
    if (t === 'boolean') { h.add(v ? 'T' : 'F'); return; }
    if (t === 'function' || t === 'symbol') { h.add('f'); return; }
    if (skip(v)) { h.add('@'); return; }
    if (seen.has(v)) { h.add('^' + seen.get(v)); return; }
    seen.set(v, seen.size);
    if (depth > 12) { h.add('…'); return; }
    if (ArrayBuffer.isView(v)) { h.add('<'); for (let i = 0; i < v.length; i++) { h.add(String(v[i])); h.add(','); } h.add('>'); return; }
    if (Array.isArray(v)) { h.add('['); for (let i = 0; i < v.length; i++) walk(v[i], h, seen, depth + 1); h.add(']'); return; }
    if (v instanceof Map) { h.add('M{'); for (const k of [...v.keys()].map(String).sort()) { h.add(k + ':'); } h.add(String(v.size)); h.add('}'); return; }
    if (v instanceof Set) { h.add('S{'); for (const k of [...v].map(x => typeof x === 'object' ? '#' : String(x)).sort()) h.add(k + ','); h.add('}'); return; }
    if (v.isColor) { h.add('c' + v.getHexString()); return; }
    if (v.isVector3) { h.add('v' + v.x + ',' + v.y + ',' + v.z); return; }
    h.add('{');
    for (const k of Object.keys(v).sort()) { if (SKIP.includes(k)) continue; h.add(k + ':'); walk(v[k], h, seen, depth + 1); }
    h.add('}');
  }
  const one = v => { const h = H(); walk(v, h, new Map(), 0); return { hash: h.done(), n: h.n }; };
  const sections = {}, sec = (name, v) => { try { sections[name] = one(v); } catch (e) { sections[name] = { hash: 'ERR ' + e.message, n: 0 }; } };
  // a block without what the streamer hangs on it at run time
  const bare = b => { const o = {}; for (const k of Object.keys(b)) if (k !== 'chunk' && k !== 'group' && k !== 'mesh' && k !== 'place') o[k] = b[k]; return o; };
  const blocks = w.blocks.map(b => one(bare(b)).hash), xblocks = (w.xblocks || []).map(b => one(bare(b)).hash);
  sec('world.localRoads', w.localRoads); sec('world.homes', w.homes); sec('world.mapPlaces', w.mapPlaces); sec('world.lots', w.lots);
  sec('world.lampSet', w.lampSet); sec('world.links', (w.links || []).map(L => ({ name: L.name, pts: L.pts, w: L.w, len: L.len, spur: L.spur, ring: L.ring, ends: L.ends.map(e => ({ axis: e.axis, line: e.line, seg: e.seg, along: e.along, C: e.C, free: !!e.free, onLink: e.onLink || null })) })));
  sec('world.secrets', w.secrets); sec('world.shore', w.shore); sec('world.compounds', w.compounds); sec('world.propTypes', w.propTypes);
  sec('world.places', Object.keys(w.places || {}).sort().map(k => { const p = w.places[k], o = {}; for (const q of Object.keys(p)) { const v = p[q]; if (v === null || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype) o[q] = v; } return o; }));
  sec('roadnet.closed', [...pv.RoadNet.closed].sort((a, b) => a - b));
  const RG = pv.RoadGraph;
  sec('roadgraph.nodes', (RG.nodes || []).map(n => [n.x, n.z, n.y || 0, n.kind || '', (n.out || n.edges || []).length]));
  sec('roadgraph.edges', (RG.edges || []).map(e => [e.a && e.a.id !== undefined ? e.a.id : e.a, e.b && e.b.id !== undefined ? e.b.id : e.b, e.kind || '', e.name || '', e.w || 0, e.len || 0, e.traffic ? 1 : 0, e.pts ? e.pts.length : 0, e.pts ? e.pts[0] : 0, e.pts ? e.pts[e.pts.length - 1] : 0]));
  // the collision grid: every collider once, in a stable order
  { const set = new Set(), G = w.grid; const cells = G.cells instanceof Map ? [...G.cells.values()] : Array.isArray(G.cells) ? G.cells : []; for (const c of cells) if (c) for (const q of c) set.add(q);
    const rows = [...set].map(c => [c.x0, c.z0, c.x1, c.z1, c.y0, c.y1, c.kind || '', c.r === undefined ? '' : c.r, c.x === undefined ? '' : c.x, c.z === undefined ? '' : c.z].join(' ')).sort(); sec('collision.grid', rows); }
  // what everything asks, on a lattice of points: the city and its surroundings every 13 m, the island every 96 m
  { const z1 = [], y1 = [], r1 = [], l1 = [], o1 = [];
    for (let z = -330; z <= 1290; z += 13) for (let x = -330; x <= 1290; x += 13) { z1.push(pv.zoneKey(x, z)); y1.push(pv.groundY(x, z, 2)); r1.push(pv.isOnRoad(x, z) ? 1 : 0); l1.push(pv.localRoadAt(x, z) + pv.localSurfaceAt(x, z) * 2); o1.push(pv.offCity(x, z) ? 1 : 0); }
    sec('ask.city.zone', z1.join('')); sec('ask.city.ground', y1); sec('ask.city.road', r1.join('')); sec('ask.city.local', l1.join('')); sec('ask.city.off', o1.join(''));
    const z2 = [], y2 = [];
    for (let z = -3300; z <= 3050; z += 96) for (let x = -2540; x <= 3050; x += 96) { z2.push(pv.zoneKey(x, z)); y2.push(pv.groundY(x, z, 400)); }
    sec('ask.island.zone', z2.join('')); sec('ask.island.ground', y2); }
  sec('tables.superblocks', pv.SUPERBLOCKS); sec('tables.zones', Object.keys(pv.ZONES).sort().map(k => [k, pv.ZONES[k].name]));
  return { layout: pv.CityLayout ? pv.CityLayout.describe() : null, sections, blocks, xblocks, counts: { blocks: w.blocks.length, xblocks: (w.xblocks || []).length, props: w.totalProps, places: Object.keys(w.places || {}).length, homes: (w.homes || []).length, links: (w.links || []).length } };
}, SKIP);
await Promise.race([browser.close().catch(() => {}), new Promise(r => setTimeout(r, 5000))]);
print.file = path.basename(FILE); print.bytes = fs.statSync(FILE).size;
for (const k of Object.keys(print.sections).sort()) console.log(k.padEnd(24), print.sections[k].hash, String(print.sections[k].n).padStart(10));
console.log('layout', JSON.stringify(print.layout));
console.log('blocks', print.blocks.length, 'extra blocks', print.xblocks.length, JSON.stringify(print.counts));
if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify(print, null, 1)); console.log('written', out); }
process.exit(process.exitCode || 0);
