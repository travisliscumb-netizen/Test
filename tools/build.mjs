/**
 * Production build.
 *
 * The source is deliberately unbundled — 30 small ES modules, no build step,
 * open in a browser and it runs. That is the right shape for working on, but
 * it means 30 requests on a cold load over a phone connection, so the deployed
 * artifact is bundled and minified.
 *
 * The service worker's precache list is generated from what is actually
 * emitted rather than hand-maintained: a shell list that drifts from the build
 * is an app that installs a broken offline cache and does not tell you.
 */

import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'dist');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });

const js = await esbuild.build({
  entryPoints: [path.join(ROOT, 'app/main.js')],
  bundle: true,
  format: 'esm',
  target: ['safari16', 'chrome109'],
  minify: true,
  legalComments: 'none',
  // Wrapped rather than one enormous line: a single 137 kB line is fragile to
  // move around and impossible to diff or inspect.
  lineLimit: 400,
  outfile: path.join(OUT, 'assets/app.js'),
  metafile: true,
});

const css = await esbuild.build({
  entryPoints: [path.join(ROOT, 'app/styles/bundle.css')],
  bundle: true,
  minify: true,
  loader: { '.css': 'css' },
  outfile: path.join(OUT, 'assets/app.css'),
});

// index.html, repointed at the bundle.
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
html = html
  .replace('<link rel="stylesheet" href="./app/styles/tokens.css">\n<link rel="stylesheet" href="./app/styles/app.css">',
           '<link rel="stylesheet" href="./assets/app.css">')
  .replace('<script type="module" src="./app/main.js"></script>',
           '<script type="module" src="./assets/app.js"></script>');
fs.writeFileSync(path.join(OUT, 'index.html'), html);

for (const f of ['manifest.webmanifest', 'vercel.json']) {
  fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
}
for (const f of fs.readdirSync(path.join(ROOT, 'icons'))) {
  fs.copyFileSync(path.join(ROOT, 'icons', f), path.join(OUT, 'icons', f));
}

// Service worker with a generated precache list and a version derived from the
// build's own content, so a changed build always invalidates the old shell.
const shell = ['./', './index.html', './manifest.webmanifest', './assets/app.js', './assets/app.css',
  ...fs.readdirSync(path.join(OUT, 'icons')).map((f) => `./icons/${f}`)];
const hash = crypto.createHash('sha256');
for (const f of ['assets/app.js', 'assets/app.css', 'index.html']) {
  hash.update(fs.readFileSync(path.join(OUT, f)));
}
const version = hash.digest('hex').slice(0, 12);

let sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
sw = sw.replace(/const VERSION = '[^']*';/, `const VERSION = 'teds-route-${version}';`);
sw = sw.replace(/const SHELL_FILES = \[[\s\S]*?\n\];/,
  `const SHELL_FILES = ${JSON.stringify(shell, null, 2)};`);
fs.writeFileSync(path.join(OUT, 'sw.js'), sw);

const size = (f) => fs.statSync(path.join(OUT, f)).size;
console.log(`  assets/app.js   ${(size('assets/app.js') / 1024).toFixed(1)} kB`);
console.log(`  assets/app.css  ${(size('assets/app.css') / 1024).toFixed(1)} kB`);
console.log(`  index.html      ${(size('index.html') / 1024).toFixed(1)} kB`);
console.log(`  sw.js           ${(size('sw.js') / 1024).toFixed(1)} kB   version ${version}`);
let total = 0;
for (const f of walk(OUT)) total += fs.statSync(f).size;
console.log(`  total           ${(total / 1024).toFixed(1)} kB  (${[...walk(OUT)].length} files)`);

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else yield p;
  }
}
