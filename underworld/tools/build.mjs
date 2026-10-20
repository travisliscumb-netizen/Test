/* Builds underworld/index.html from underworld/src/.

   The game ships as one self-contained offline HTML file. Its source lives in src/ as ordinary files
   (shell HTML, CSS, the vendored three.js bundle and one file per game subsystem), and src/manifest.json lists
   them in build order. The build concatenates them byte for byte: no transforms, no minification. Every part
   therefore shares the single <script type="module"> scope it always had, so splitting or moving code between
   game/ files never changes behaviour as long as the order stays the same.

   node underworld/tools/build.mjs            write underworld/index.html
   node underworld/tools/build.mjs --check    exit 1 if index.html is not what src/ builds (nothing written)
   node underworld/tools/build.mjs --out f    write somewhere else
   node underworld/tools/build.mjs --where N  which src/ file and line index.html line N comes from

   Never edit index.html by hand: edit src/ and rebuild. tests/build.mjs fails when the two disagree. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SRC = path.join(ROOT, 'src');
export const OUT = path.join(ROOT, 'index.html');

// read and validate the manifest: every file under src/ is listed exactly once, every part is UTF-8 text with
// Unix newlines that ends in a newline (so concatenation never glues two lines together)
export function readParts() {
  const man = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
  if (!man || !Array.isArray(man.parts) || !man.parts.length) throw new Error('src/manifest.json: "parts" must be a non-empty array');
  const seen = new Set(), problems = [];
  const parts = man.parts.map(rel => {
    if (typeof rel !== 'string' || rel.includes('..') || path.isAbsolute(rel)) { problems.push(`bad path ${JSON.stringify(rel)}`); return null; }
    if (seen.has(rel)) problems.push(`listed twice: ${rel}`);
    seen.add(rel);
    const f = path.join(SRC, rel);
    if (!fs.existsSync(f)) { problems.push(`missing: ${rel}`); return null; }
    const text = fs.readFileSync(f, 'utf8');
    if (text.includes('\r')) problems.push(`CR characters (use Unix newlines): ${rel}`);
    if (!text.endsWith('\n')) problems.push(`does not end with a newline: ${rel}`);
    return { rel, text };
  });
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.relative(SRC, path.join(d, e.name)).split(path.sep).join('/')]);
  for (const rel of walk(SRC)) if (rel !== 'manifest.json' && !seen.has(rel)) problems.push(`not in the manifest: ${rel}`);
  if (problems.length) throw new Error('src/manifest.json:\n  ' + problems.join('\n  '));
  return parts;
}

export function assemble() { return readParts().map(p => p.text).join(''); }

// syntax check of every inline module script in the built page (node --check parses, never runs)
// where a line of the built page came from: { rel, line } in src/
export function sourceOf(globalLine, parts = readParts()) {
  let at = 1;
  for (const p of parts) { const n = p.text.split('\n').length - 1; if (globalLine < at + n) return { rel: p.rel, line: globalLine - at + 1 }; at += n; }
  return null;
}
export function syntaxCheck(html) {
  const re = /<script type="module"[^>]*>\n([\s\S]*?)<\/script>/g, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uw-build-'));
  let m, i = 0, first = 0;
  try {
    while ((m = re.exec(html))) {
      // line in the page where this script's body starts (the line after its opening tag)
      first = html.slice(0, m.index).split('\n').length + 1;
      const f = path.join(dir, `module-${i++}.mjs`);
      fs.writeFileSync(f, m[1]);
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    }
  } catch (e) {
    const err = String(e.stderr || e.message), ln = /module-\d+\.mjs:(\d+)/.exec(err), src = ln ? sourceOf(first + +ln[1] - 1) : null;
    throw new Error(`syntax error in an inline module script${src ? ` at src/${src.rel}:${src.line}` : ''}:\n` + err.replace(/^.*module-\d+\.mjs:\d+\n/, ''));
  }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
  if (i < 2) throw new Error(`expected the three.js and game module scripts, found ${i}`);
  return i;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), check = args.includes('--check');
  const wi = args.indexOf('--where');
  if (wi >= 0) { // node underworld/tools/build.mjs --where 49776 → src/game/520-underworld-prison.js:143
    const parts = readParts();
    for (const a of args.slice(wi + 1)) { const s = sourceOf(+a, parts); console.log(s ? `index.html:${a} → src/${s.rel}:${s.line}` : `index.html:${a} → out of range`); }
    process.exit(0);
  }
  const oi = args.indexOf('--out'), out = oi >= 0 ? path.resolve(args[oi + 1]) : OUT;
  try {
    const html = assemble();
    const n = syntaxCheck(html);
    if (check) {
      const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
      if (cur !== html) {
        let at = '';
        if (cur !== null) { let k = 0; while (k < cur.length && cur[k] === html[k]) k++; at = ` (first difference at line ${cur.slice(0, k).split('\n').length})`; }
        console.error(`${path.relative(process.cwd(), out)} is out of date with src/${at}. Run: node underworld/tools/build.mjs`);
        process.exit(1);
      }
      console.log(`${path.relative(process.cwd(), out)} is up to date (${Buffer.byteLength(html)} bytes, ${n} module scripts parse)`);
    } else {
      fs.writeFileSync(out, html);
      console.log(`wrote ${path.relative(process.cwd(), out)} (${Buffer.byteLength(html)} bytes, ${n} module scripts parse)`);
    }
  } catch (e) { console.error(e.message); process.exit(1); }
}
