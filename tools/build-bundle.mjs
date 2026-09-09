/**
 * Builds a restore file for the operator's real route from the 1.0 data.
 *
 * Output is an ordinary Ted's Route backup, deliberately: first run then uses
 * exactly the same validated restore path as every later restore, rather than
 * a bespoke import screen with its own bugs.
 *
 * Input files are customer data and are never committed. Run:
 *   node tools/build-bundle.mjs <privateDir> <outFile>
 */

import fs from 'node:fs';
import path from 'node:path';
import { makeProperty, GEO_SOURCE, SCHEMA_VERSION } from '../app/data/schema.js';
import { buildBackup } from '../app/data/backup.js';
import { parseWindowFromNote } from '../app/routing/optimize.js';
import { inServiceRegion } from '../app/core/geo.js';

const [, , dir = process.argv[2], outFile = process.argv[3]] = process.argv;
if (!dir || !outFile) {
  console.error('usage: node tools/build-bundle.mjs <privateDir> <outFile>');
  process.exit(2);
}

const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const seed = read('seed-1.0.json');
const overlay = read('verified-coords.json');
const backup = read('backup-1.0.json');

/** The yard is the first Monday stop on this route and is also a property. */
function depotFromSeed(rows) {
  const first = rows.find((r) => r.c === 'south' && r.d === 'Mon' && Number.isFinite(r.lat));
  return first ? { lat: first.lat, lng: first.lng, label: first.a } : null;
}

const stats = { manual: 0, imported: 0, geocoded: 0, seed: 0, none: 0, rejected: 0 };
const byId = new Map();

for (const s of seed) {
  const win = parseWindowFromNote(s.n) || {};
  byId.set(s.id, makeProperty({
    id: s.id,
    legacyId: s.id,
    address: s.a,
    city: s.city || 'Barrie',
    crew: s.c,
    day: s.d,
    note: s.n || '',
    lat: s.lat ?? null,
    lng: s.lng ?? null,
    geoSource: Number.isFinite(s.lat) ? GEO_SOURCE.seed : GEO_SOURCE.none,
    pushMow: !!win.pushMow,
    earliestMin: win.earliestMin ?? null,
    latestMin: win.latestMin ?? null,
    preferLateInWeek: !!win.preferLateInWeek,
  }));
}

// 1.0 coordinate edits: the operator's own corrections in the previous app.
for (const [id, e] of Object.entries(backup.edits || {})) {
  const p = byId.get(id);
  if (!p || !Number.isFinite(e.lat) || !Number.isFinite(e.lng)) continue;
  p.lat = e.lat; p.lng = e.lng; p.geoSource = GEO_SOURCE.imported;
}

// Coordinate overlay: municipal address points plus one field-confirmed pin.
for (const row of (overlay.coords || overlay)) {
  const [id, lat, lng, src] = Array.isArray(row)
    ? row
    : [row.legacyId, row.lat, row.lng, row.source || 'manual'];
  const p = byId.get(id);
  if (!p || !Number.isFinite(lat)) continue;
  p.lat = lat; p.lng = lng;
  p.geoSource = src === 'manual' ? GEO_SOURCE.manual : GEO_SOURCE.geocoded;
}

// Properties the operator retired in 1.0 stay in the file, marked inactive:
// their history is still evidence, and deleting them would lose it.
for (const [id, r] of Object.entries(backup.removed || {})) {
  const p = byId.get(id);
  if (p) { p.active = false; p.inactiveReason = `Removed in the previous app on ${new Date(r.at).toISOString().slice(0, 10)}`; }
}

// Route order: the saved per-day order where the operator had one, otherwise
// the order the route sheet was transcribed in.
const seedRank = new Map(seed.map((s, i) => [s.id, i]));
const grouped = new Map();
for (const p of byId.values()) {
  const k = `${p.crew}|${p.day}`;
  if (!grouped.has(k)) grouped.set(k, []);
  grouped.get(k).push(p);
}
for (const [k, list] of grouped) {
  const saved = backup.order?.[k];
  const rank = saved ? new Map(saved.map((id, i) => [id, i])) : null;
  list.sort((a, b) => {
    const ra = rank?.get(a.id) ?? (1000 + seedRank.get(a.id));
    const rb = rank?.get(b.id) ?? (1000 + seedRank.get(b.id));
    return ra - rb;
  });
  list.forEach((p, i) => { p.order = i; });
}

for (const p of byId.values()) {
  if (!Number.isFinite(p.lat)) { p.needsLocationReview = true; stats.none++; continue; }
  if (!inServiceRegion(p)) { p.needsLocationReview = true; stats.rejected++; continue; }
  stats[p.geoSource]++;
}

// --- events: every recorded completion, plus the day it belongs to ---------
const events = [];
const seen = new Set();
const dk = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const addCompletion = (id, at, crew) => {
  if (!byId.has(id) || !Number.isFinite(at)) return;
  const key = `${id}@${Math.round(at / 1000)}`;
  if (seen.has(key)) return;
  seen.add(key);
  events.push({ type: 'complete', propertyId: id, at, date: `${dk(at)}|${crew}`, source: 'imported' });
};

for (const week of backup.history || []) {
  for (const s of week.stops || []) {
    if (s.st === 'done' && Number.isFinite(s.at)) addCompletion(s.id, s.at, s.c || byId.get(s.id)?.crew || 'south');
  }
}
for (const [id, j] of Object.entries(backup.jobs || {})) {
  if (j.status === 'done' && Number.isFinite(j.at)) addCompletion(id, j.at, byId.get(id)?.crew || 'south');
}
events.sort((a, b) => a.at - b.at);

events.unshift({
  type: 'import',
  at: Date.now(),
  payload: {
    source: 'Ted\'s 1.0 backup 2026-08-27 + verified coordinate overlay',
    properties: byId.size,
    completions: events.length,
  },
});

const doc = buildBackup({
  properties: [...byId.values()],
  days: [],
  events,
  settings: {
    crew: 'south',
    startTime: backup.meta?.startTime || '07:30',
    returnToDepot: true,
    // The shop travels with the operator's data, never with the program.
    depot: depotFromSeed(seed),
  },
  dataOrigin: {
    label: "Ted's 1.0 migration",
    at: Date.now(),
    schemaVersion: SCHEMA_VERSION,
    sources: ['seed-1.0.json', 'backup-1.0-2026-08-27.json', 'verified-coords.json'],
  },
});

fs.writeFileSync(outFile, JSON.stringify(doc, null, 1));

const props = [...byId.values()];
const active = props.filter((p) => p.active);
console.log('--- reconciliation ------------------------------------');
console.log(`  total                ${props.length}`);
console.log(`  active               ${active.length}`);
console.log(`  with coordinates     ${props.filter((p) => Number.isFinite(p.lat)).length}`);
console.log(`    human-confirmed    ${stats.manual}`);
console.log(`    from 1.0 edits     ${stats.imported}`);
console.log(`    from 1.0 seed      ${stats.seed}`);
console.log(`    overlay geocoded   ${stats.geocoded}`);
console.log(`    rejected (region)  ${stats.rejected}`);
console.log(`  missing coordinates  ${stats.none}`);
console.log(`  completions          ${events.filter((e) => e.type === 'complete').length}`);
console.log(`  push-mow flagged     ${props.filter((p) => p.pushMow).length}`);
console.log(`  time windows parsed  ${props.filter((p) => p.earliestMin != null || p.latestMin != null).length}`);
console.log(`  late-in-week flagged ${props.filter((p) => p.preferLateInWeek).length}`);
console.log(`  checksum             ${doc.checksum}`);
console.log(`  bytes                ${fs.statSync(outFile).size}`);
