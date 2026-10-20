/* Build integrity (Node, no browser). src/ is the source of truth and index.html is generated from it by
   tools/build.mjs. This suite fails when index.html was edited by hand or src/ changed without a rebuild,
   when the manifest and the files under src/ disagree, or when a module script no longer parses.

   node underworld/tests/build.mjs */
import fs from 'node:fs';
import { assemble, syntaxCheck, readParts, OUT } from '../tools/build.mjs';

let fail = 0;
const check = (name, ok, detail = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };

let parts = null, html = null;
try { parts = readParts(); check('src/manifest.json lists every file under src/ exactly once, all with Unix newlines', true, `${parts.length} parts`); }
catch (e) { check('src/manifest.json lists every file under src/ exactly once, all with Unix newlines', false, e.message); }
if (parts) {
  html = assemble();
  const cur = fs.readFileSync(OUT, 'utf8');
  check('index.html is exactly what src/ builds (rebuild with node underworld/tools/build.mjs)', cur === html, `${Buffer.byteLength(html)} bytes built, ${Buffer.byteLength(cur)} committed`);
  try { check('both inline module scripts (three.js bundle, game) parse', syntaxCheck(html) === 2); }
  catch (e) { check('both inline module scripts (three.js bundle, game) parse', false, e.message); }
  check('the game module is split into subsystem files', parts.filter(p => p.rel.startsWith('game/')).length >= 60, `${parts.filter(p => p.rel.startsWith('game/')).length} game/ files`);
  check('the page is still one self-contained file (no external script or stylesheet)', !/<script[^>]+src=|<link[^>]+rel="stylesheet"/.test(html));
}
console.log(`\nbuild: ${fail ? 'FAILED' : 'ALL CHECKS PASSED'}`);
process.exit(fail ? 1 : 0);
