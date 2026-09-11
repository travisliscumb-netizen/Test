/*
 * Prepares deploy/ - a static site that serves the game at the root URL.
 *
 * Static hosts want index.html at the root, and iOS reads the home screen icon
 * from a real apple-touch-icon file, so this lays the game out that way. Vendor
 * code is NOT copied in: deploy/package.json declares three.js and the deploy's
 * own build step compiles the global bundle, so the tree stays small enough to
 * hand to a host API and the dependency stays pinned in one place.
 *
 *   node tools/build-deploy.js
 *   cd deploy && npm install && npm run build      # -> deploy/public
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'deploy');
const THREE_VERSION = '0.180.0';

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const write = (rel, data) => {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
};

fs.rmSync(OUT, { recursive: true, force: true });

/* ---- the page, served at / ---- */
let html = read('game.html');
// one 512 icon covers the manifest; iOS takes the 180 apple-touch-icon
html = html.replace(
  /<link rel="icon"[^>]*>\s*/g, '');
html = html.replace('<link rel="apple-touch-icon" sizes="180x180" href="icons/icon-180.png">',
  '<link rel="apple-touch-icon" sizes="180x180" href="icons/icon-180.png">\n' +
  '<link rel="icon" type="image/png" sizes="512x512" href="icons/icon-512.png">\n' +
  '<link rel="icon" type="image/png" sizes="64x64" href="icons/icon-64.png">');

/*
 * Game sources, concatenated in load order and minified into one file. The
 * readable source is the repository; a deploy only needs to be small and fast,
 * and one request beats three.
 */
const SOURCES = ['src/logic.js', 'src/render.js', 'src/game.js'];
function findEsbuild() {
  for (const dir of [path.join(OUT, 'node_modules'), path.join(ROOT, 'deploy/node_modules'),
                     path.join(ROOT, 'node_modules')]) {
    const bin = path.join(dir, '.bin/esbuild');
    if (fs.existsSync(bin)) return [bin, []];
  }
  return ['npx', ['--yes', 'esbuild@0.25.12']];
}
const combined = SOURCES.map((f) => '/* ' + f + ' */\n' + read(f)).join('\n;\n');
const tmp = path.join(require('os').tmpdir(), 'bs3d-combined.js');
fs.writeFileSync(tmp, combined);
const [bin, preArgs] = findEsbuild();
const minified = execFileSync(bin, preArgs.concat([tmp, '--minify', '--legal-comments=none']),
                              { maxBuffer: 32 * 1024 * 1024 }).toString();
fs.rmSync(tmp);
write('src/game.min.js', minified);
html = html.replace(
  /<script src="src\/logic\.js"><\/script>\s*<script src="src\/render\.js"><\/script>\s*<script src="src\/game\.js"><\/script>/,
  '<script src="src/game.min.js"></script>');
if (html.indexOf('src/game.min.js') === -1) throw new Error('failed to rewrite the script tags');
write('index.html', html);

/* ---- manifest rooted at / instead of game.html ---- */
const manifest = JSON.parse(read('manifest.webmanifest'));
manifest.start_url = './';
manifest.scope = './';
manifest.icons = [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }];
write('manifest.webmanifest', JSON.stringify(manifest, null, 2));

/* ---- icons: the 180 stays full quality because it is the one on the home
       screen; the others are palette-reduced to keep the tree small ---- */
const py = `
from PIL import Image
import sys
src, dst, size, colors = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src).convert('RGB').resize((size, size), Image.LANCZOS)
if colors:
    im = im.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)
im.save(dst, optimize=True)
`;
fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'icons/icon-180.png'), path.join(OUT, 'icons/icon-180.png'));
for (const [size, colors] of [[512, 128], [64, 0]]) {
  execFileSync('python3', ['-c', py,
    path.join(ROOT, 'icons/icon-1024.png'),
    path.join(OUT, 'icons/icon-' + size + '.png'),
    String(size), String(colors)]);
}

/* ---- the deploy's own build: compile three.js, then assemble public/ ---- */
write('package.json', JSON.stringify({
  name: 'block-stack-3d',
  version: '1.0.0',
  private: true,
  scripts: { build: 'node build.mjs' },
  devDependencies: { three: THREE_VERSION, esbuild: '^0.25.0' }
}, null, 2) + '\n');

write('build.mjs', `/*
 * Deploy build: compile three.js into a classic script that defines a global
 * THREE (the npm package ships ES modules only), then copy the static files
 * into public/.
 */
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';

const OUT = 'public';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'vendor'), { recursive: true });

fs.writeFileSync('entry.js', 'export * from "three";');
await build({
  entryPoints: ['entry.js'],
  bundle: true,
  format: 'iife',
  globalName: 'THREE',
  minify: true,
  legalComments: 'none',
  outfile: path.join(OUT, 'vendor/three.min.js')
});
fs.rmSync('entry.js');

for (const f of ['index.html', 'manifest.webmanifest']) fs.copyFileSync(f, path.join(OUT, f));
for (const dir of ['src', 'icons']) {
  fs.mkdirSync(path.join(OUT, dir), { recursive: true });
  for (const f of fs.readdirSync(dir)) fs.copyFileSync(path.join(dir, f), path.join(OUT, dir, f));
}

const size = (p) => (fs.statSync(p).size / 1024).toFixed(0) + ' KB';
console.log('built ' + OUT + '/ (three.min.js ' + size(path.join(OUT, 'vendor/three.min.js')) + ')');
`);

/* cache headers: the vendor bundle is immutable, the page must not be */
write('vercel.json', JSON.stringify({
  headers: [
    { source: '/vendor/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    { source: '/icons/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }] },
    { source: '/index.html', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] }
  ]
}, null, 2) + '\n');

/* report the tree */
const walk = (dir, pre = '') => fs.readdirSync(path.join(OUT, dir), { withFileTypes: true })
  .flatMap((e) => e.isDirectory()
    ? walk(path.join(dir, e.name), pre)
    : [[path.join(dir, e.name), fs.statSync(path.join(OUT, dir, e.name)).size]]);
let total = 0;
for (const [f, n] of walk('.')) { total += n; console.log((n / 1024).toFixed(1).padStart(8) + ' KB  ' + f); }
console.log((total / 1024).toFixed(1).padStart(8) + ' KB  total to upload');
