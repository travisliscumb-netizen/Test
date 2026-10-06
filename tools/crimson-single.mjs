/* Bundles Crimson Realm into ONE self-contained HTML file: every module,
   the stylesheet and the icon inlined. It runs from file://, a USB stick,
   an email attachment -- no server. (Home Screen install and offline
   caching still need the hosted folder: a PWA needs a real origin.)

   Each module is wrapped in its own function scope so top-level names can
   never collide; imports become reads from the exporting module's object. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'crimson-realm');
const OUT = process.argv[2] || path.join(ROOT, 'crimson-realm.html');
const ORDER = ['config', 'skeleton', 'engine', 'ai', 'color', 'fighter-art', 'stages', 'render', 'audio', 'input', 'save', 'icon', 'main'];

function wrap(name) {
  let src = fs.readFileSync(path.join(ROOT, 'src', name + '.js'), 'utf8');
  const imports = [];
  src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*'\.\/([\w-]+)\.js';?/gm, (_, names, mod) => {
    if (!ORDER.includes(mod) || ORDER.indexOf(mod) >= ORDER.indexOf(name)) throw new Error(`${name}: bad import order for ${mod}`);
    const list = names.split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/\s+as\s+/, ': '));
    imports.push(`const { ${list.join(', ')} } = __mods[${JSON.stringify(mod)}];`);
    return '';
  });
  if (/^\s*import\s/m.test(src)) throw new Error(`${name}: unhandled import`);
  const exported = [];
  src = src.replace(/^export\s+(async\s+function|function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm, (_, kw, id) => {
    exported.push(id);
    return `${kw} ${id}`;
  });
  if (/^export\s/m.test(src)) throw new Error(`${name}: unhandled export`);
  return `/* ---- src/${name}.js ---- */\n__mods[${JSON.stringify(name)}] = (() => {\n${imports.join('\n')}\n${src}\nreturn { ${exported.join(', ')} };\n})();\n`;
}

const js = `'use strict';\nconst __mods = {};\n` + ORDER.map(wrap).join('\n');
const css = fs.readFileSync(path.join(ROOT, 'src', 'ui.css'), 'utf8');
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'icons', f)).toString('base64');

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
html = html
  .replace(/^\s*<link rel="manifest"[^>]*>\n/m, '')
  .replace(/^\s*<link rel="apple-touch-startup-image"[^>]*>\n/gm, '')
  .replace(/^\s*<link rel="icon" href="favicon.ico"[^>]*>\n/m, '')
  .replace(/^\s*<meta property="og:image"[^>]*>\n/m, '')
  .replace('href="icons/favicon-32.png"', `href="${b64('favicon-32.png')}"`)
  .replace('href="icons/favicon-16.png"', `href="${b64('favicon-16.png')}"`)
  .replace('href="icons/apple-touch-icon-180.png"', `href="${b64('apple-touch-icon-180.png')}"`)
  .replace('<link rel="stylesheet" href="src/ui.css">', () => `<style>\n${css}</style>`)
  .replace('<script type="module" src="src/main.js"></script>', () => `<script type="module">\n${js.replace(/<\/script/gi, '<\\/script')}</script>`);
for (const bad of ['src="src/', 'href="src/', 'icons/', 'manifest.webmanifest']) {
  if (html.includes(bad)) throw new Error('leftover external reference: ' + bad);
}
fs.writeFileSync(OUT, html);
console.log('wrote', OUT, (html.length / 1024).toFixed(0) + ' KB');
