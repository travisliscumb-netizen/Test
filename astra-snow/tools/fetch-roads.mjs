// Fetch the City of Barrie road segment network (static attributes only) and
// write public/data/roads.json: the offline basemap, the routing graph and the
// join table for live winter-servicing status.
//
// Public municipal data, whole city — it contains nothing about the route.
//
//   node --experimental-strip-types tools/fetch-roads.mjs

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { queryAll, CITY } from './arcgis.mjs';
import { simplify, round7 } from '../src/core/geo.ts';

const OUT = path.resolve(import.meta.dirname, '../public/data/roads.json');

const FIELDS = [
  'OBJECTID', 'ASSETID', 'ROADSEGFK', 'NAME', 'SUFFIX', 'DIR', 'ONEWAYDIR', 'PLOWCLASS', 'PLOWROUTE',
  'SALTSANDROUTE', 'BRINEROUTE', 'CARTOCLASS', 'ROADCLASS', 'SPEED_LIMIT', 'WIDTH', 'ROADFROM', 'ROADTO', 'STATUS',
].join(',');

const CLASS = { PRIORITY: 'P', SECONDARY: 'S', RESIDENTI: 'R' };

const feats = await queryAll(CITY.roads, { outFields: FIELDS, pageSize: 2000 });
const ids = new Set();
const assets = new Map();
const segments = [];
let vertsIn = 0;
let vertsOut = 0;
for (const f of feats) {
  const p = f.properties;
  if (ids.has(p.OBJECTID)) throw new Error(`duplicate OBJECTID ${p.OBJECTID}`);
  ids.add(p.OBJECTID);
  if (p.ASSETID) assets.set(p.ASSETID, (assets.get(p.ASSETID) ?? 0) + 1);
  const g = f.geometry;
  if (!g) continue;
  const parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
  const lines = parts
    .map((line) => {
      vertsIn += line.length;
      const s = simplify(line, 0.6).map(round7);
      vertsOut += s.length;
      return s;
    })
    .filter((l) => l.length >= 2);
  if (!lines.length) continue;
  const name = [p.NAME, p.SUFFIX, p.DIR].filter(Boolean).join(' ').trim();
  segments.push({
    id: p.OBJECTID,
    asset: p.ASSETID ?? null,
    name,
    oneway: p.ONEWAYDIR ?? null,
    plowClass: CLASS[p.PLOWCLASS] ?? null,
    plowRoute: p.PLOWROUTE ?? null,
    saltRoute: p.SALTSANDROUTE ?? null,
    carto: p.CARTOCLASS ?? null,
    speed: p.SPEED_LIMIT ?? null,
    width: p.WIDTH ?? null,
    from: p.ROADFROM ?? null,
    to: p.ROADTO ?? null,
    lines,
  });
}
const dupAssets = [...assets.values()].filter((n) => n > 1).length;
segments.sort((a, b) => a.id - b.id);
const body = { segments };
const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
const doc = {
  schema: 'astra.roads/1',
  source: CITY.roads,
  licence: '© City of Barrie. The City does not warrant the accuracy, completeness, content, or currency of the information provided.',
  fetchedAt: new Date().toISOString(),
  count: segments.length,
  sha256: hash,
  ...body,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(doc));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`roads: ${segments.length} segments (${feats.length} fetched), vertices ${vertsIn} -> ${vertsOut}, ${kb} KB, duplicate ASSETIDs: ${dupAssets}`);
console.log(`plow classes: ${JSON.stringify(segments.reduce((m, s) => ((m[s.plowClass] = (m[s.plowClass] ?? 0) + 1), m), {}))}`);
console.log(`oneway: ${JSON.stringify(segments.reduce((m, s) => ((m[s.oneway] = (m[s.oneway] ?? 0) + 1), m), {}))}`);
