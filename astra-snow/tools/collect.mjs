// Background collector for City of Barrie winter-servicing data.
//
//   node --experimental-strip-types tools/collect.mjs <data-dir>
//
// Run every 5–15 minutes by a scheduler (GitHub Actions workflow in
// .github-workflow-template/, or any cron). Each run:
//   1. fetches every segment's LASTSERVICED and the current vehicle points;
//   2. diffs against <data-dir>/state.json and appends only NEW observations
//      to <data-dir>/service-YYYY-MM.ndjson and <data-dir>/pings-YYYY-MM.ndjson;
//   3. rewrites <data-dir>/history.json in the app's backup format
//      (schema astra.intel/1) so the phone can import it.
// The City service keeps no history; this builds one, legitimately, from the
// public feed. It holds no customer data.

import fs from 'node:fs';
import path from 'node:path';
import { fetchServiceStatus, fetchVehicles, diffService } from '../src/intel/city.ts';

const dir = path.resolve(process.argv[2] ?? 'intel-data');
fs.mkdirSync(dir, { recursive: true });
const statePath = path.join(dir, 'state.json');
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { serviced: [], pings: [], runs: 0 };
const prev = new Map(state.serviced);

const now = new Date();
const month = now.toISOString().slice(0, 7);
let added = 0;
let pingsAdded = 0;
const errors = [];

try {
  const snap = await fetchServiceStatus();
  const fresh = diffService(prev, snap.serviced);
  if (fresh.length) {
    fs.appendFileSync(path.join(dir, `service-${month}.ndjson`), fresh.map((f) => JSON.stringify({ seg: f.seg, t: f.t, seenAt: snap.checkedAt })).join('\n') + '\n');
  }
  added = fresh.length;
  state.serviced = [...snap.serviced.entries()];
  state.lastServiceCheck = snap.checkedAt;
} catch (e) {
  errors.push(`service: ${e.message}`);
}

try {
  const v = await fetchVehicles();
  const seen = new Set(state.pings.map((p) => `${p.vehicle}|${p.t}`));
  const fresh = v.pings.filter((p) => !seen.has(`${p.vehicle}|${p.t}`));
  if (fresh.length) fs.appendFileSync(path.join(dir, `pings-${month}.ndjson`), fresh.map((p) => JSON.stringify(p)).join('\n') + '\n');
  pingsAdded = fresh.length;
  // Keep only recent pings for de-duplication.
  state.pings = [...state.pings, ...fresh].filter((p) => Date.now() - p.t < 6 * 3600_000);
  state.lastVehicleCheck = v.checkedAt;
  state.lastVehicleCount = v.pings.length;
} catch (e) {
  errors.push(`vehicles: ${e.message}`);
}

state.runs = (state.runs ?? 0) + 1;
state.lastRun = now.toISOString();
state.lastErrors = errors;
fs.writeFileSync(statePath, JSON.stringify(state));

// App-importable history: the last 60 days of service events.
const cutoff = Date.now() - 60 * 86_400_000;
const service = [];
for (const f of fs.readdirSync(dir).filter((f) => /^service-\d{4}-\d{2}\.ndjson$/.test(f)).sort()) {
  for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line);
    if (r.t >= cutoff) service.push(r);
  }
}
fs.writeFileSync(path.join(dir, 'history.json'), JSON.stringify({ schema: 'astra.intel/1', generatedAt: now.toISOString(), source: 'City of Barrie BarrieRoadSegments_View (public)', service }));
console.log(`collect: +${added} service events, +${pingsAdded} vehicle pings, ${service.length} events in history.json${errors.length ? ', errors: ' + errors.join('; ') : ''}`);
process.exit(errors.length === 2 ? 1 : 0);
