/* Builds the claude.ai Artifact variant of hellbreach/index.html. The Artifact
   host supplies its own doctype/html/head/body skeleton (with charset and a
   viewport-fit=cover viewport), so this strips ours and keeps everything else.
   Usage: node tools/hellbreach-artifact.mjs <out.html> */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'hellbreach', 'index.html'), 'utf8');
const head = src.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset="utf-8">\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
const body = src.match(/<body>([\s\S]*)<\/body>/)[1];
const out = process.argv[2];
if (!out) { console.error('usage: node tools/hellbreach-artifact.mjs <out.html>'); process.exit(1); }
fs.writeFileSync(out, head.trim() + '\n' + body.trim() + '\n');
console.log(`wrote ${out} (${fs.statSync(out).size} bytes)`);
