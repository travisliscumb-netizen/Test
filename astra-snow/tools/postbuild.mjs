// After `vite build`: generate dist/sw.js with the exact precache list and a
// cache name tied to the release, and assert nothing private leaked into dist.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const version = fs.readFileSync(path.join(ROOT, 'src/version.ts'), 'utf8').match(/VERSION = '([^']+)'/)[1];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}
const files = walk(DIST).map((f) => '/' + path.relative(DIST, f).split(path.sep).join('/'));

// Privacy gate: the build must never contain the plaintext route or its key.
const forbidden = [/private\//, /route\.json$/, /route\.key$/, /review\.md$/, /qa\.json$/, /\.jpg$/];
const leaked = files.filter((f) => forbidden.some((re) => re.test(f)));
if (leaked.length) throw new Error(`private files in dist: ${leaked.join(', ')}`);
const keyFile = path.join(ROOT, 'private/route.key');
if (fs.existsSync(keyFile)) {
  const key = fs.readFileSync(keyFile, 'utf8').trim();
  for (const f of walk(DIST)) if (fs.readFileSync(f).includes(key)) throw new Error(`route key found in ${f}`);
}

const precache = ['/', '/index.html', ...files.filter((f) => f !== '/sw.js' && f !== '/index.html' && !f.endsWith('.map') && !f.endsWith('OFL.txt'))];
const sw = fs
  .readFileSync(path.join(ROOT, 'tools/sw.template.js'), 'utf8')
  .replace('__VERSION__', `${version}-${Date.now().toString(36)}`)
  .replace('__PRECACHE__', JSON.stringify(precache, null, 0));
fs.writeFileSync(path.join(DIST, 'sw.js'), sw);
const bytes = files.reduce((s, f) => s + fs.statSync(path.join(DIST, f)).size, 0);
console.log(`postbuild: sw.js with ${precache.length} precached files, dist ${(bytes / 1024 / 1024).toFixed(2)} MB, privacy gate passed`);
