// Build the verified route dataset from the dispatcher's list.
//
//   ROUTE_ROWS=<rows.json> LAWN_HTML=<optional> SOL_NUMBERS=<optional> \
//   node --experimental-strip-types tools/build-route.mjs
//
// Inputs are PRIVATE (customer addresses) and are read from paths outside the
// repository. Outputs go to private/ (git-ignored):
//   private/route.json   the full dataset the app loads (after encryption)
//   private/review.md    per-row verification report for a human
//
// Pipeline per row:
//   parse → City address point (exact number/street match) → parcel polygon →
//   2016 driveway polygons assigned to the parcel by area overlap → driveway
//   entrance (the driveway edge nearest the street centreline) → curb point on
//   the street → independent cross-checks.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { queryAll, getJson, CITY } from './arcgis.mjs';
import { parseRoute, indexStreets } from '../src/data/route-parse.ts';
import {
  dist, projectOnLine, pointInPolygon, ringCentroid, ringArea, bboxOf, toXY, toLngLat, round7, bearing,
} from '../src/core/geo.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const rowsPath = process.env.ROUTE_ROWS;
if (!rowsPath) throw new Error('Set ROUTE_ROWS to the JSON array of dispatcher rows.');
const rows = JSON.parse(fs.readFileSync(rowsPath, 'utf8'));
const source = JSON.parse(fs.readFileSync(process.env.ROUTE_META ?? path.join(path.dirname(rowsPath), 'route_meta.json'), 'utf8'));
const roads = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/roads.json'), 'utf8'));

// The City's complete street list: address-point streets plus road segments.
const groups = await getJson(`${CITY.addresses}/query`, {
  where: '1=1',
  groupByFieldsForStatistics: 'SSTRNAME,SSTRSUFF,SSTRDIR',
  outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: 'OBJECTID_1', outStatisticFieldName: 'n' }]),
  resultRecordCount: '5000',
  f: 'json',
});
const cityStreets = groups.features.map((f) => ({ name: f.attributes.SSTRNAME, suffix: f.attributes.SSTRSUFF, dir: f.attributes.SSTRDIR ?? null })).filter((s) => s.name && s.suffix);
const roadStreets = await queryAll(CITY.roads, { outFields: 'NAME,SUFFIX,DIR', returnGeometry: false, pageSize: 2000 });
for (const f of roadStreets) {
  const p = f.properties;
  if (p.NAME && p.SUFFIX && !cityStreets.some((s) => s.name === p.NAME && s.suffix === p.SUFFIX && s.dir === (p.DIR ?? null))) cityStreets.push({ name: p.NAME, suffix: p.SUFFIX, dir: p.DIR ?? null });
}
console.log(`City street list: ${cityStreets.length} (name, suffix, direction) combinations`);
const streetIdx = indexStreets(cityStreets);
const parsed = parseRoute(rows, streetIdx);
if (parsed.length !== source.expectedCount) throw new Error(`Expected ${source.expectedCount} rows, parsed ${parsed.length}`);
// Human QA overlay (private/qa.json): visual verification results. Applied
// only when it agrees with a driveway the data actually has; never invents one.
const qaPath = path.join(ROOT, 'private/qa.json');
const qa = fs.existsSync(qaPath) ? JSON.parse(fs.readFileSync(qaPath, 'utf8')) : { drivewayStreet: {}, unresolved: {} };

// ---------------------------------------------------------------- addresses
const streetNames = [...new Set([...parsed.map((r) => r.streetName), ...parsed.flatMap((r) => r.flags.drivewayStreets.map((k) => k.split(' ').slice(0, -1).join(' ')))])];
const where = `SSTRNAME IN (${streetNames.map((s) => `'${s}'`).join(',')})`;
const addrFeats = await queryAll(CITY.addresses, { where, outFields: 'ADDRESSID,PARCELID,STATUS,ADDRNUMBER,SSTRNAME,SSTRSUFF,SSTRDIR,FULLADDR,UNITNUMBER,LASTUPDATE', pageSize: 2000, orderBy: 'OBJECTID_1' });
console.log(`address points on route streets: ${addrFeats.length}`);

function matchAddress(r) {
  const cands = addrFeats.filter((f) => {
    const p = f.properties;
    return (
      String(p.ADDRNUMBER).toUpperCase() === r.number &&
      p.SSTRNAME === r.streetName &&
      p.SSTRSUFF === r.streetSuffix &&
      (p.SSTRDIR ?? null) === r.streetDir
    );
  });
  const current = cands.filter((f) => (f.properties.STATUS ?? '').toLowerCase() === 'current');
  const pool = current.length ? current : cands;
  const base = pool.filter((f) => !f.properties.UNITNUMBER);
  const chosen = base[0] ?? pool[0] ?? null;
  return { chosen, candidates: cands.length, units: pool.length - base.length, nonCurrent: cands.length - current.length };
}

// ------------------------------------------------------------------ parcels
const matches = parsed.map((r) => ({ r, m: matchAddress(r) }));
const parcelIds = [...new Set(matches.map((x) => x.m.chosen?.properties.PARCELID).filter(Boolean))];
const parcelFeats = [];
for (let i = 0; i < parcelIds.length; i += 80) {
  const chunk = parcelIds.slice(i, i + 80);
  parcelFeats.push(...(await queryAll(CITY.parcels, { where: `PARCELID IN (${chunk.map((s) => `'${s}'`).join(',')})`, outFields: 'PARCELID,ROLL_NO,LASTUPDATE' })));
}
const parcels = new Map();
for (const f of parcelFeats) {
  const rings = f.geometry?.type === 'Polygon' ? f.geometry.coordinates : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates.flat() : null;
  if (!rings) continue;
  const prev = parcels.get(f.properties.PARCELID);
  // A parcel id can come back as several polygons; keep all rings.
  parcels.set(f.properties.PARCELID, prev ? prev.concat(rings) : rings);
}
console.log(`parcels: ${parcels.size}/${parcelIds.length}`);

// ---------------------------------------------------------------- driveways
const pts = matches.map((x) => x.m.chosen?.geometry?.coordinates).filter(Boolean);
const bb = bboxOf(pts, 120);
const dwFeats = await queryAll(CITY.driveways, { geometry: `${bb.w},${bb.s},${bb.e},${bb.n}`, outFields: 'OBJECTID,UNIQUEID,SUBLAYERNAME' });
const driveways = dwFeats
  .map((f) => {
    const rings = f.geometry?.type === 'Polygon' ? f.geometry.coordinates : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates[0] : null;
    if (!rings) return null;
    return { id: f.properties.OBJECTID, rings, outer: rings[0], area: Math.abs(ringArea(rings[0])), centroid: ringCentroid(rings[0]), kind: f.properties.SUBLAYERNAME ?? null };
  })
  .filter(Boolean);
console.log(`driveway polygons in route area: ${driveways.length}`);

/** Fraction of a driveway polygon's area inside a parcel, by 0.5 m grid sampling. */
function overlapFraction(dw, parcelRings) {
  const xy = dw.outer.map(toXY);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  let inDw = 0;
  let inBoth = 0;
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.5) {
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.5) {
      const ll = toLngLat([x, y]);
      if (!pointInPolygon(ll, dw.rings)) continue;
      inDw++;
      if (pointInPolygon(ll, parcelRings)) inBoth++;
    }
  }
  return inDw ? inBoth / inDw : 0;
}

// Assign each nearby driveway to the parcel holding most of it.
const owner = new Map(); // driveway id -> { parcelId, share }
const parcelBoxes = [...parcels].map(([id, rings]) => ({ id, rings, bb: bboxOf(rings.flat(), 30) }));
for (const dw of driveways) {
  for (const pb of parcelBoxes) {
    if (dw.centroid[0] < pb.bb.w || dw.centroid[0] > pb.bb.e || dw.centroid[1] < pb.bb.s || dw.centroid[1] > pb.bb.n) continue;
    const share = overlapFraction(dw, pb.rings);
    if (share > 0.2 && share > (owner.get(dw.id)?.share ?? 0)) owner.set(dw.id, { parcelId: pb.id, share });
  }
}

// -------------------------------------------------------------- road lookup
const roadIndex = roads.segments.map((s) => ({ s, bb: bboxOf(s.lines.flat(), 60) }));
function nearestRoad(p, nameFilter) {
  let best = null;
  for (const { s, bb: b } of roadIndex) {
    if (p[0] < b.w || p[0] > b.e || p[1] < b.s || p[1] > b.n) continue;
    if (nameFilter && !nameFilter(s.name)) continue;
    for (const line of s.lines) {
      const pr = projectOnLine(p, line);
      if (pr && (!best || pr.distance < best.pr.distance)) best = { s, pr, line };
    }
  }
  return best;
}
const roadName = (r) => [r.streetName, r.streetSuffix, r.streetDir].filter(Boolean).join(' ');

/** Driveway entrance: the polygon boundary point closest to the street line. */
function entranceOf(dw, road) {
  let best = null;
  const ring = dw.outer;
  for (let i = 0; i < ring.length - 1; i++) {
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const q = [ring[i][0] + t * (ring[i + 1][0] - ring[i][0]), ring[i][1] + t * (ring[i + 1][1] - ring[i][1])];
      const pr = projectOnLine(q, road.line);
      if (pr && (!best || pr.distance < best.d)) best = { q, d: pr.distance, curb: pr.point };
    }
  }
  return best;
}

// ------------------------------------------------- independent cross-checks
// (a) a previous season's geocodes for overlapping addresses (lawn app), and
// (b) Sol 6.2's house-number label positions. Neither is authoritative; both
// are independent of the City address-point layer for most rows.
const lawn = new Map();
if (process.env.LAWN_HTML && fs.existsSync(process.env.LAWN_HTML)) {
  const html = fs.readFileSync(process.env.LAWN_HTML, 'utf8');
  // Entries look like {c:"east",d:"Mon",a:"<number> <street>",n:"<note>",lat:<lat>,lng:<lng>}
  for (const m of html.matchAll(/a:"([^"]+)",n:"(?:[^"\\]|\\.)*",lat:(-?[\d.]+),lng:(-?[\d.]+)/g)) {
    const key = m[1].toUpperCase().replace(/\s+/g, ' ').replace(/^(\d+) NORTH PARK /, '$1 NORTHPARK ');
    lawn.set(key, [Number(m[3]), Number(m[2])]);
  }
  console.log(`previous-season geocodes available: ${lawn.size}`);
}
const solNumbers = process.env.SOL_NUMBERS && fs.existsSync(process.env.SOL_NUMBERS) ? JSON.parse(fs.readFileSync(process.env.SOL_NUMBERS, 'utf8')) : [];
function solNear(number, p) {
  let best = Infinity;
  for (const [n, lat, lng] of solNumbers) if (String(n) === number) best = Math.min(best, dist(p, [lng, lat]));
  return best;
}
const LAWN_SUFFIX = { ST: 'ST', CRES: 'CRES', RD: 'RD', AVE: 'AVE', SQ: 'SQ', CRT: 'CT' };

// ------------------------------------------------------------------ build
const stops = [];
const report = [];
for (const { r, m } of matches) {
  const issues = [...r.warnings];
  const a = m.chosen;
  if (!a) {
    issues.push('NO CITY ADDRESS POINT');
    stops.push({ ...base(r), verified: false, issues });
    continue;
  }
  if (m.candidates > 1 + m.units) issues.push(`${m.candidates} candidate address points`);
  const addrPt = round7(a.geometry.coordinates);
  const parcelId = a.properties.PARCELID ?? null;
  const parcelRings = parcelId ? parcels.get(parcelId) : null;
  if (!parcelRings) issues.push('no parcel polygon');
  else if (!pointInPolygon(addrPt, parcelRings)) issues.push('address point outside its parcel');

  // Frontage street: the named street nearest the address point.
  const front = nearestRoad(addrPt, (n) => n === roadName(r));
  if (!front) issues.push(`street ${roadName(r)} not found near the address point`);

  // Driveways owned by this parcel.
  const owned = parcelRings ? driveways.filter((d) => owner.get(d.id)?.parcelId === parcelId) : [];
  const dws = [];
  for (const d of owned) {
    // The driveway's street is the road its boundary actually reaches: for
    // each nearby road, the closest approach of the polygon edge to that
    // centreline; the smallest wins, the address street winning near-ties
    // (corner lots). Nearest-to-centroid is wrong at corners.
    const cands = [];
    for (const { s, bb: b } of roadIndex) {
      if (d.centroid[0] < b.w || d.centroid[0] > b.e || d.centroid[1] < b.s || d.centroid[1] > b.n) continue;
      for (const line of s.lines) {
        const pr = projectOnLine(d.centroid, line);
        if (!pr || pr.distance > 70) continue;
        const ent = entranceOf(d, { s, line });
        if (ent) cands.push({ s, line, ent });
      }
    }
    if (!cands.length) continue;
    const front = roadName(r);
    cands.sort((x, y) => x.ent.d - y.ent.d);
    const bestD = cands[0].ent.d;
    const pick = cands.find((c) => c.s.name === front && c.ent.d <= bestD + 1.5) ?? cands[0];
    const near = { s: pick.s, line: pick.line };
    const ent = pick.ent;
    // Other streets this driveway nearly reaches: a corner lot the 2016
    // polygon alone cannot settle. Recorded, never silently resolved.
    const alternatives = [];
    for (const c of cands) {
      if (c.s.name === pick.s.name || alternatives.some((a) => a.street === c.s.name)) continue;
      if (c.ent.d <= ent.d + 4) alternatives.push({ street: c.s.name, roadId: c.s.id, gapMetres: Math.round((c.ent.d - ent.d) * 10) / 10 });
    }
    dws.push({
      id: d.id,
      area: Math.round(d.area),
      street: near.s.name,
      roadId: near.s.id,
      entrance: round7(ent.q),
      curb: round7(ent.curb),
      polygon: d.outer.map(round7),
      share: Math.round(owner.get(d.id).share * 100) / 100,
      streetConfidence: alternatives.length ? 'ambiguous' : 'clear',
      alternatives,
    });
  }
  // Order: driveways on a street the note names first, then on the frontage street, then by size.
  const named = new Set(r.flags.drivewayStreets);
  dws.sort((x, y) => Number(named.has(y.street)) - Number(named.has(x.street)) || Number(y.street === roadName(r)) - Number(x.street === roadName(r)) || y.area - x.area);
  if (owned.length === 0) issues.push('no 2016 driveway polygon on this parcel');
  const qaStreet = qa.drivewayStreet[String(r.seq)];
  if (qaStreet && dws[0]) {
    if (dws[0].street === qaStreet) dws[0].streetConfidence = 'ortho-verified';
    else issues.push(`QA says driveway on ${qaStreet}; data says ${dws[0].street}`);
  }
  if (dws[0]?.streetConfidence === 'ambiguous') issues.push(`corner lot: driveway street ${dws[0].street} vs ${dws[0].alternatives.map((a) => a.street).join('/')} — confirm in field`);
  if (r.flags.driveways > 1 && dws.length < r.flags.driveways) issues.push(`note says x${r.flags.driveways} driveways; ${dws.length} mapped`);
  for (const s of named) if (!dws.some((d) => d.street === s)) issues.push(`note names a driveway on ${s}; none mapped there`);

  // The point the tractor should stop at: the primary driveway's curb point;
  // without a driveway polygon, the frontage street point nearest the house.
  const primary = dws[0] ?? null;
  const approachRoad = primary ? roads.segments.find((s) => s.id === primary.roadId) : front?.s;
  const stopPt = primary ? primary.curb : front ? round7(front.pr.point) : addrPt;
  const target = primary ? primary.entrance : addrPt;

  // Cross-checks.
  const checks = {};
  const lawnKey = `${r.number} ${r.streetName} ${LAWN_SUFFIX[r.streetSuffix] ?? r.streetSuffix}${r.streetDir ? ' ' + r.streetDir : ''}`;
  const lawnAlt = `${r.number} ${r.streetName} ST`; // the lawn list wrote "Marion St"
  const lp = lawn.get(lawnKey) ?? (r.streetName === 'MARION' ? lawn.get(lawnAlt) : undefined);
  if (lp) checks.lawnMetres = Math.round(dist(addrPt, lp));
  const sn = solNear(r.number, addrPt);
  if (Number.isFinite(sn)) checks.solLabelMetres = Math.round(sn);
  if (checks.lawnMetres !== undefined && checks.lawnMetres > 40) issues.push(`previous-season geocode ${checks.lawnMetres} m away`);
  if (checks.solLabelMetres !== undefined && checks.solLabelMetres > 45) issues.push(`nearest Sol house-number label ${checks.solLabelMetres} m away`);
  const frontDist = front ? Math.round(front.pr.distance) : null;
  if (frontDist !== null && frontDist > 60) issues.push(`address point ${frontDist} m from ${roadName(r)}`);

  stops.push({
    ...base(r),
    addressId: a.properties.ADDRESSID,
    parcelId,
    roll: parcelId ? parcelFeats.find((f) => f.properties.PARCELID === parcelId)?.properties.ROLL_NO ?? null : null,
    point: addrPt,
    stopPoint: stopPt,
    target,
    approachRoadId: approachRoad?.id ?? null,
    frontRoadId: front?.s.id ?? null,
    plowRoute: approachRoad?.plowRoute ?? null,
    plowClass: approachRoad?.plowClass ?? null,
    side: front ? sideOf(front, addrPt) : null,
    parcel: parcelRings ? parcelRings[0].map(round7) : null,
    driveways: dws,
    checks,
    verified: issues.filter((i) => !i.startsWith('street suffix')).length === 0,
    issues,
  });
}

function base(r) {
  return {
    seq: r.seq,
    raw: r.raw,
    address: r.address,
    number: r.number,
    street: roadName(r),
    note: r.note,
    flags: r.flags,
  };
}

function sideOf(front, p) {
  // Which side of the street (relative to digitised direction) the house is on.
  const b = front.pr.segmentBearing;
  const toHouse = bearing(front.pr.point, p);
  const rel = (toHouse - b + 360) % 360;
  return rel < 180 ? 'R' : 'L';
}

// ------------------------------------------------------------------ outputs
const rawHash = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const route = {
  schema: 'astra.route/1',
  id: source.id,
  title: source.title,
  source: { kind: 'email', from: source.from, subject: source.subject, sentAt: source.sentAt, rows: rows.length, sha256: rawHash },
  builtAt: new Date().toISOString(),
  datasets: {
    addressPoints: CITY.addresses,
    parcels: CITY.parcels,
    driveways: `${CITY.driveways} (2016 survey)`,
    roads: roads.source,
  },
  stops,
};
fs.mkdirSync(path.join(ROOT, 'private'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'private/route.json'), JSON.stringify(route, null, 1));

const n = stops.length;
const verified = stops.filter((s) => s.verified).length;
const withDw = stops.filter((s) => s.driveways?.length).length;
const lines = [];
lines.push(`# Route verification — ${source.title}`, '', `Built ${route.builtAt}. Source rows: ${rows.length}, sha256 ${rawHash.slice(0, 16)}…`, '');
lines.push(`- City address point matched: **${stops.filter((s) => s.point).length}/${n}**`);
lines.push(`- Driveway polygon mapped: **${withDw}/${n}**`);
lines.push(`- Clean (no open issue): **${verified}/${n}**`);
const lawnChecks = stops.filter((s) => s.checks?.lawnMetres !== undefined);
const solChecks = stops.filter((s) => s.checks?.solLabelMetres !== undefined);
const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
lines.push(`- Previous-season geocode agreement: ${lawnChecks.length} overlapping rows, median ${med(lawnChecks.map((s) => s.checks.lawnMetres))} m, max ${Math.max(...lawnChecks.map((s) => s.checks.lawnMetres))} m`);
lines.push(`- Sol 6.2 house-number labels: ${solChecks.length} rows at median ${med(solChecks.map((s) => s.checks.solLabelMetres))} m — the same City address-point layer, so NOT independent corroboration`);
lines.push(`- Visual QA (2023 orthophoto): ${Object.keys(qa.drivewayStreet).length} corner-lot driveways confirmed, ${Object.keys(qa.unresolved).length} left for field confirmation`, '');
lines.push('| # | Address | Note | Drwy | Street | City rte | Checks | Issues |', '|---|---|---|---|---|---|---|---|');
for (const s of stops) {
  lines.push(`| ${s.seq} | ${s.address} | ${s.note.replace(/\|/g, '/')} | ${s.driveways?.length ?? 0} | ${s.driveways?.[0]?.street ?? '-'} | ${s.plowClass ?? '-'}${s.plowRoute ?? ''} | ${Object.entries(s.checks ?? {}).map(([k, v]) => `${k}=${v}`).join(' ')} | ${s.issues.join('; ')} |`);
}
fs.writeFileSync(path.join(ROOT, 'private/review.md'), lines.join('\n'));
console.log(lines.slice(0, 9).join('\n'));
console.log(`issues: ${stops.filter((s) => s.issues.length).length} rows`);
