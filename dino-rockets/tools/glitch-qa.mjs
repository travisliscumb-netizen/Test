/* Glitch QA: every crew scene (normal and mirrored) and a long stretch of
   the crew hanging out, traced frame by frame at real speed, checked with
   tools/glitch.mjs.   node tools/glitch-qa.mjs [scene ids...] */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '../../tools/serve.mjs';
import { findGlitches } from './glitch.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const VP = { width: 390, height: 844 };
const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
const WORDS = { 1: 'A', 2: 'GO', 3: 'THE', 4: 'SAID', 5: 'WHERE' };

const { server, url } = await serve(ROOT);
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
const page = await (await browser.newContext({ viewport: VP, deviceScaleFactor: 1 })).newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
await page.goto(url + '/tools/scene-lab.html');
await page.waitForFunction(() => !!window.__lab);
const scenes = await page.evaluate(() => window.__lab.scenes);

let pass = 0, fail = 0;
function verdict(label, glitches) {
  if (!glitches.length) { pass++; return; }
  fail++;
  const firsts = glitches.filter(g => g.first);
  console.log(`  FAIL ${label}: ${glitches.length} glitch frames`);
  for (const g of firsts.slice(0, 6)) console.log(`       ${g.rule} ${g.who} @${g.t}ms ${g.detail}`);
}

const FUMBLES = await page.evaluate(() => window.__lab.FUMBLES);
for (const s0 of scenes) for (const mirror of [false, true]) for (const fumble of FUMBLES.includes(s0.id) ? [false, true] : [false]) {
  if (only.length && !only.includes(s0.id)) continue;
  await page.evaluate(f => window.__lab.setFumble(f), fumble);
  const leads = await page.evaluate(i => window.__lab.leadsFor(i), s0.id);
  for (const lead of leads) {
    for (const n of [3, 5]) {
      const word = WORDS[Math.max(s0.min || 1, n)];
      await page.evaluate(() => window.__lab.trace(true));
      await page.evaluate(([i, w, l, m]) => window.__lab.run(i, w, l, m), [s0.id, word, lead, mirror]);
      await page.waitForFunction(() => window.__labDone, null, { timeout: 60000 });
      const frames = await page.evaluate(() => window.__lab.traced());
      await page.evaluate(() => window.__lab.trace(false));
      verdict(`${s0.id}${mirror ? '~m' : ''}${fumble ? '~f' : ''} ${lead} "${word}" (${frames.length} frames)`, findGlitches(frames, VP.width, VP.height));
    }
  }
}

if (!only.length) {
  /* the crew hanging out: four on the ground, then two under a card, with cheers and oopses */
  for (const [keys, ceil] of [[['rex', 'trike', 'dash', 'swoop'], null], [['swoop', 'dash'], 560]]) {
    await page.evaluate(() => window.__lab.trace(true));
    await page.evaluate(([k, c]) => window.__lab.ambient(k, c), [keys, ceil]);
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(1500);
      await page.evaluate(k => window.__lab.react(k), ['cheer', 'oops', 'hop', 'wave'][i % 4]);
    }
    const frames = await page.evaluate(() => window.__lab.traced());
    await page.evaluate(() => { window.__lab.trace(false); window.__lab.stopAmbient(); });
    verdict(`ambient ${keys.join('+')}${ceil ? ' under a card' : ''} (${frames.length} frames)`, findGlitches(frames, VP.width, VP.height));
  }
}
if (pageErrors.length) { fail++; console.log('  FAIL page errors: ' + pageErrors.slice(0, 3).join(' | ')); }
console.log(`\n${pass} clean, ${fail} with glitches`);
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
