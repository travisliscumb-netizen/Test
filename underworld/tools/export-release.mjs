/* Packages a committed build of the game as a stand-alone release: one HTML file that plays from any static host
   (Vercel, a phone's Files app, file://) with nothing beside it.

   node underworld/tools/export-release.mjs --ref <git ref> --dir <release dir> --name <file.html> [--save-ns <ns>]

   - The page is the build committed at <ref> (underworld/index.html), checked byte for byte against a fresh
     assembly of that ref's src/ (manifest order), so the release is exactly what that commit built.
   - Packaging only, each substitution asserted to happen exactly once:
       the three icon links and the web-app manifest become data: URIs (no relative files to go missing);
       with --save-ns, the save and settings localStorage keys gain that namespace, so two builds served from one
       origin (one Vercel project) never read, migrate or overwrite each other's saves;
       a <meta name="release"> line records the ref, its commit and the namespace.
     Nothing else in the page changes: gameplay, rendering, controls, balance and the save format are the ref's.
   - Writes <dir>/<name>, <dir>/index.html (a redirect to it, so the folder deploys as a site as is) and
     <dir>/RELEASE.json (commit, sizes, SHA-256, the substitutions made). */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { syntaxCheck } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), REPO = path.resolve(ROOT, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const ref = arg('--ref'), dir = arg('--dir'), name = arg('--name'), ns = arg('--save-ns', '');
if (!ref || !dir || !name) { console.error('usage: export-release.mjs --ref <git ref> --dir <release dir> --name <file.html> [--save-ns <ns>]'); process.exit(2); }
const git = (...a) => execFileSync('git', a, { cwd: REPO, maxBuffer: 1 << 28 });
const commit = git('rev-parse', ref + '^{commit}').toString().trim();
const show = rel => git('show', `${commit}:underworld/${rel}`);

// the committed build, and the same ref's src/ assembled in manifest order: they must agree byte for byte
const built = show('index.html').toString('utf8');
const man = JSON.parse(show('src/manifest.json').toString('utf8'));
const assembled = man.parts.map(p => show('src/' + p).toString('utf8')).join('');
if (assembled !== built) { console.error(`${ref}: underworld/index.html is not what its src/ builds; refusing to export`); process.exit(1); }

let html = built;
const subs = [];
const once = (what, from, to) => {
  const n = html.split(from).length - 1;
  if (n !== 1) { console.error(`${what}: expected exactly one occurrence of ${JSON.stringify(from).slice(0, 120)}, found ${n}`); process.exit(1); }
  html = html.replace(from, () => to); subs.push(what);
};
const dataUri = rel => 'data:image/png;base64,' + show(rel).toString('base64');

once('favicon inlined', 'href="icons/favicon-32.png"', `href="${dataUri('icons/favicon-32.png')}"`);
once('192px icon inlined', 'href="icons/icon-192.png"', `href="${dataUri('icons/icon-192.png')}"`);
once('home-screen icon inlined', 'href="icons/apple-touch-icon.png"', `href="${dataUri('icons/apple-touch-icon.png')}"`);
// the manifest keeps its fields; its icons become data: URIs (the 1024 px one is dropped: 512 is the largest any
// install prompt uses) and start_url/scope go, so the page that opens it is the start page wherever it is served
const wm = JSON.parse(show('manifest.webmanifest').toString('utf8'));
delete wm.start_url; delete wm.scope;
wm.icons = wm.icons.filter(i => !/1024/.test(i.src)).map(i => ({ ...i, src: dataUri(i.src) }));
if (ns) { wm.name += ` (${ns})`; wm.short_name += ` ${ns}`; }
once('web-app manifest inlined', "l.href = 'manifest.webmanifest';", `l.href = ${JSON.stringify('data:application/manifest+json,' + encodeURIComponent(JSON.stringify(wm)))};`);
if (ns) {
  once('save key namespaced', "const SAVE_KEY = 'pvunderworld.save.v1';", `const SAVE_KEY = 'pvunderworld.${ns}.save.v1';`);
  once('settings key namespaced', "const SETTINGS_KEY = 'pvunderworld.settings.v1';", `const SETTINGS_KEY = 'pvunderworld.${ns}.settings.v1';`);
  once('title marked', '<title>The Underworld</title>', `<title>The Underworld (${ns})</title>`);
}
once('release recorded', '<meta charset="UTF-8">\n', `<meta charset="UTF-8">\n<meta name="release" content="${ref} ${commit}${ns ? ' save-ns=' + ns : ''}">\n`);

// nothing relative may be left: no src/href to a file beside the page
const rel = [...html.matchAll(/\b(?:src|href)\s*=\s*["'](?!data:|https?:|#|javascript:|blob:)([^"']+)["']/g)].map(m => m[1]);
if (rel.length) { console.error('relative references left in the page: ' + rel.slice(0, 10).join(', ')); process.exit(1); }
const scripts = syntaxCheck(html);

const out = path.resolve(dir);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, name), html);
fs.writeFileSync(path.join(out, 'index.html'), `<!DOCTYPE html>\n<html lang="en"><head><meta charset="UTF-8"><title>The Underworld</title>\n<meta http-equiv="refresh" content="0; url=${name}">\n</head><body><a href="${name}">${name}</a></body></html>\n`);
const buf = Buffer.from(html, 'utf8');
const info = {
  ref, commit, file: name, saveNamespace: ns || null,
  saveKeys: ns ? { save: `pvunderworld.${ns}.save.v1`, settings: `pvunderworld.${ns}.settings.v1` } : { save: 'pvunderworld.save.v1', settings: 'pvunderworld.settings.v1' },
  bytes: buf.length, gzipBytes: zlib.gzipSync(buf, { level: 9 }).length, brotliBytes: zlib.brotliCompressSync(buf).length,
  sha256: crypto.createHash('sha256').update(buf).digest('hex'), moduleScripts: scripts, substitutions: subs
};
fs.writeFileSync(path.join(out, 'RELEASE.json'), JSON.stringify(info, null, 1) + '\n');
console.log(JSON.stringify(info, null, 1));
