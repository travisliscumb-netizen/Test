/* Regenerates everything under vendor/ and fonts/ from pinned npm packages.

   The game ships as plain static files with no runtime build step, so the one
   third-party dependency (three.js plus the handful of addons the renderer
   uses) is pre-bundled into a single tree-shaken, minified ES module. Run this
   only when bumping a version in package.json:

     npm install && npm run vendor
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NM = path.join(ROOT, 'node_modules');

/* Only the names the game actually imports are bundled, so three.js can be
   tree-shaken. The list is read from the source, so it can never drift. */
const ADDONS = {
  EffectComposer: 'three/addons/postprocessing/EffectComposer.js',
  RenderPass: 'three/addons/postprocessing/RenderPass.js',
  UnrealBloomPass: 'three/addons/postprocessing/UnrealBloomPass.js',
  OutputPass: 'three/addons/postprocessing/OutputPass.js',
  RoundedBoxGeometry: 'three/addons/geometries/RoundedBoxGeometry.js',
  RoomEnvironment: 'three/addons/environments/RoomEnvironment.js'
};
const names = new Set();
for (const f of fs.readdirSync(path.join(ROOT, 'src')).filter((f) => f.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'\.\.\/vendor\/three\.js'/g)) {
    for (const n of m[1].split(',').map((x) => x.trim()).filter(Boolean)) names.add(n);
  }
}
const core = [...names].filter((n) => !ADDONS[n]).sort();
const ENTRY = [
  `export { ${core.join(', ')} } from 'three';`,
  ...[...names].filter((n) => ADDONS[n]).map((n) => `export { ${n} } from '${ADDONS[n]}';`)
].join('\n');

const version = JSON.parse(fs.readFileSync(path.join(NM, 'three', 'package.json'), 'utf8')).version;

await build({
  stdin: { contents: ENTRY, resolveDir: ROOT, loader: 'js' },
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  legalComments: 'none',
  banner: { js: `/* three.js ${version} + addons | MIT License | https://threejs.org */` },
  outfile: path.join(ROOT, 'vendor', 'three.js')
});

const FONTS = [
  ['@fontsource/orbitron', 'orbitron-latin-500-normal.woff2'],
  ['@fontsource/orbitron', 'orbitron-latin-700-normal.woff2'],
  ['@fontsource/orbitron', 'orbitron-latin-900-normal.woff2'],
  ['@fontsource/exo-2', 'exo-2-latin-400-normal.woff2'],
  ['@fontsource/exo-2', 'exo-2-latin-600-normal.woff2'],
  ['@fontsource/exo-2', 'exo-2-latin-800-normal.woff2']
];
fs.mkdirSync(path.join(ROOT, 'fonts'), { recursive: true });
for (const [pkg, file] of FONTS) {
  fs.copyFileSync(path.join(NM, pkg, 'files', file), path.join(ROOT, 'fonts', file));
}
fs.copyFileSync(path.join(NM, '@fontsource/orbitron', 'LICENSE'), path.join(ROOT, 'fonts', 'OFL-Orbitron.txt'));
fs.copyFileSync(path.join(NM, '@fontsource/exo-2', 'LICENSE'), path.join(ROOT, 'fonts', 'OFL-Exo2.txt'));

const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0);
console.log(`vendor/three.js  ${kb(path.join(ROOT, 'vendor', 'three.js'))} KB  (three ${version})`);
console.log(`exports          ${names.size} names`);
console.log(`fonts/           ${FONTS.length} files`);
