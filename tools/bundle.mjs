/* Builds a single self-contained HTML file -- scripts, styles and the font
   inlined -- for hosts that can show one file but not serve a folder (chat
   previews, email attachments, file:// double-click). The PWA pieces (service
   worker, manifest, icons) are dropped: they cannot work from a lone file.

   Needs esbuild: `npm i -D esbuild`, or point ESBUILD_DIR at a folder whose
   node_modules has it.  Usage: node tools/bundle.mjs [out.html] */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'dist', 'pacman.html'));
const require = createRequire(path.join(process.env.ESBUILD_DIR || ROOT, 'package.json'));
const esbuild = require('esbuild');

const js = esbuild.buildSync({
  entryPoints: [path.join(ROOT, 'src', 'main.js')],
  bundle: true, format: 'iife', minify: true, write: false, target: ['es2020'],
  legalComments: 'none'
}).outputFiles[0].text;

const font = fs.readFileSync(path.join(ROOT, 'src', 'fonts', 'outfit-latin.woff2')).toString('base64');
let css = fs.readFileSync(path.join(ROOT, 'src', 'ui.css'), 'utf8')
  .replace("url('fonts/outfit-latin.woff2')", `url(data:font/woff2;base64,${font})`);
css = esbuild.transformSync(css, { loader: 'css', minify: true }).code;

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const drop = [
  /<link rel="manifest"[^>]*>\n/, /<link rel="icon"[^>]*>\n/g, /<link rel="apple-touch-icon"[^>]*>\n/,
  /<link rel="preload"[^>]*>\n/, /<meta property="og:[^>]*>\n/g, /<meta name="twitter:[^>]*>\n/g
];
for (const re of drop) html = html.replace(re, '');
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error(`bundle: expected to find ${from}`);
  html = html.replace(from, () => to);
};
swap('<link rel="stylesheet" href="src/ui.css">', `<style>${css}</style>`);
/* A JSON-escaped "</script" can't close the tag early. */
swap('<script type="module" src="src/main.js"></script>', `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`bundle: ${path.relative(process.cwd(), OUT)} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
