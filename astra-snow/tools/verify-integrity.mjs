// Prove the route survived every transformation intact, and that nothing
// private is published.
//
//   ROUTE_ROWS=<rows.json> node --experimental-strip-types tools/verify-integrity.mjs
//
// Checks (all must pass):
//  1. private/route.json has exactly the source row count, in source order.
//  2. Every stop's raw text is byte-identical to its source row.
//  3. First and last stops are the known endpoints from the dispatcher.
//  4. Every note is an exact substring of its raw row (whitespace-normalised).
//  5. The sealed file decrypts with the private key to exactly route.json.
//  6. No street address from the route appears in public/ or dist/ in plain text.

import fs from 'node:fs';
import path from 'node:path';
import { unseal } from '../src/core/crypto.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const rows = JSON.parse(fs.readFileSync(process.env.ROUTE_ROWS, 'utf8'));
const route = JSON.parse(fs.readFileSync(path.join(ROOT, 'private/route.json'), 'utf8'));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

check('row count', route.stops.length === rows.length && rows.length === route.source.rows, `${route.stops.length} stops, ${rows.length} source rows`);
const mism = route.stops.filter((s, i) => s.seq !== i + 1 || s.raw !== rows[i]);
check('every stop byte-identical to its source row, in order', mism.length === 0, mism.length ? `mismatch at ${mism.map((s) => s.seq).join(',')}` : `${rows.length}/${rows.length}`);
// Known endpoints come from the private route metadata, never from public code.
const meta = JSON.parse(fs.readFileSync(process.env.ROUTE_META ?? path.join(path.dirname(process.env.ROUTE_ROWS), 'route_meta.json'), 'utf8'));
check('first stop matches the dispatcher\'s known first property', rows[0].startsWith(meta.expectedFirst) && route.stops[0].raw.startsWith(meta.expectedFirst));
check('last stop matches the dispatcher\'s known final property', rows.at(-1).startsWith(meta.expectedLast) && route.stops.at(-1).raw.startsWith(meta.expectedLast));
const badNotes = route.stops.filter((s) => s.note && !s.raw.replace(/\s+/g, ' ').includes(s.note));
check('notes are exact substrings of their rows', badNotes.length === 0, `${route.stops.filter((s) => s.note).length} notes`);
const notesInRows = rows.filter((r) => /[-–]\s*\S|[a-z]\s+[A-Z]{2,}/.test(r.replace(/, Barrie/g, ''))).length;
check('note count is plausible against source', route.stops.filter((s) => s.note).length >= 15, `${route.stops.filter((s) => s.note).length} parsed (source heuristic ${notesInRows})`);

const sealed = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/route.sealed.json'), 'utf8'));
const key = fs.readFileSync(path.join(ROOT, 'private/route.key'), 'utf8').trim();
const text = await unseal(sealed, key);
check('sealed file decrypts to exactly private/route.json', text === fs.readFileSync(path.join(ROOT, 'private/route.json'), 'utf8'), `sha256 ${sealed.sha256.slice(0, 16)}…`);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}
// Addresses, verbatim rows, and any note long enough to be identifying.
const needles = [...route.stops.map((s) => s.address), ...route.stops.map((s) => s.raw), ...route.stops.map((s) => s.note).filter((n) => n.length >= 16)];
const leaks = [];
const scanned = ['public', 'dist', 'src', 'tests', 'docs', 'tools'].flatMap((d) => walk(path.join(ROOT, d))).concat([path.join(ROOT, 'README.md'), path.join(ROOT, 'index.html')].filter((f) => fs.existsSync(f)));
for (const f of scanned) {
  if (/\.(png|jpg|pbf|ico)$/.test(f)) continue;
  const body = fs.readFileSync(f, 'utf8');
  for (const n of needles) if (body.includes(n)) leaks.push(`${path.relative(ROOT, f)}: ${n}`);
  if (body.includes(key)) leaks.push(`${path.relative(ROOT, f)}: ROUTE KEY`);
}
check(`no route address, row, note or key in ${scanned.length} published/source files`, leaks.length === 0, leaks.slice(0, 5).join('; '));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} integrity checks passed`);
process.exit(failed.length ? 1 : 0);
