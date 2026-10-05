/* Packs the whole game into ONE self-contained HTML file: every module
   (three.js included) bundled into a single inline script, the stylesheet
   inlined, and fonts and icons embedded as data URIs. The result opens from
   anywhere, including file:// and chat previews, with nothing else beside it.

     npm install && npm run single      ->  dist/tetris-3d.html
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'tetris-3d.html');
const read = (rel, enc) => fs.readFileSync(path.join(ROOT, rel), enc);
const dataUri = (rel, mime) => `data:${mime};base64,${read(rel).toString('base64')}`;

// One script: esbuild follows the static imports and inlines the dynamic
// import('./render.js') too (no code splitting).
const js = (await build({
  entryPoints: [path.join(ROOT, 'src', 'main.js')],
  bundle: true, format: 'esm', minify: true, target: 'es2020',
  legalComments: 'none', write: false
})).outputFiles[0].text;

const css = read('src/ui.css', 'utf8').replace(/url\(\.\.\/fonts\/([^)]+\.woff2)\)/g,
  (_, f) => `url(${dataUri(`fonts/${f}`, 'font/woff2')})`);

let html = read('index.html', 'utf8');
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error(`index.html no longer contains: ${from}`);
  html = html.replace(from, to);
};
swap('<link rel="manifest" href="manifest.webmanifest">\n', '');
swap('<link rel="icon" href="icons/icon.svg" type="image/svg+xml">', `<link rel="icon" href="${dataUri('icons/icon.svg', 'image/svg+xml')}" type="image/svg+xml">`);
swap('<link rel="icon" href="icons/favicon-32.png" sizes="32x32" type="image/png">\n', '');
swap('<link rel="apple-touch-icon" href="icons/apple-touch-icon-180.png">', `<link rel="apple-touch-icon" href="${dataUri('icons/apple-touch-icon-180.png', 'image/png')}">`);
html = html.replace(/<link rel="preload"[^>]*>\n/g, '').replace(/<link rel="modulepreload"[^>]*>\n/g, '');
swap('<link rel="stylesheet" href="src/ui.css">', () => `<style>\n${css}\n</style>`);
// Escape any "</script" inside the bundle so it cannot end the inline tag early.
const inline = js.replace(/<\/script/gi, '<\\/script');
swap('<script type="module" src="src/main.js"></script>', () => `<script>window.__SINGLE_FILE__ = true;</script>\n<script type="module">\n${inline}\n</script>`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
const left = [...html.matchAll(/(?:src|href)="(?!data:|#|https?:)([^"]+)"/g)].map((m) => m[1]);
if (left.length) throw new Error(`external references left in the single file: ${left.join(', ')}`);
console.log(`dist/tetris-3d.html  ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB, no external files`);
