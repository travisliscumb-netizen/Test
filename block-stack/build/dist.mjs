/* Assemble the deployable static tree.

   Output is an explicit dist/ rather than the project root so that build-time
   files -- node_modules, the build scripts themselves -- can never end up
   served alongside the game. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const copy = (rel) => {
  const from = path.join(ROOT, rel);
  if (!fs.existsSync(from)) throw new Error(`missing build input: ${rel}`);
  fs.cpSync(from, path.join(DIST, rel), { recursive: true });
};

['index.html', 'manifest.webmanifest', 'sw.js', 'favicon.ico', 'src', 'icons'].forEach(copy);

let count = 0, bytes = 0;
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else { count++; bytes += fs.statSync(full).size; }
  }
};
walk(DIST);
console.log(`dist: ${count} files, ${(bytes / 1024).toFixed(0)} KB`);
