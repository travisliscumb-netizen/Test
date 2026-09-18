/* Visual QA for the animation executor.

   Plays every scene at NORMAL SPEED in an iPhone-sized viewport, samples
   the stage between frames, asserts the things that make a scene read
   correctly, and writes one filmstrip per scene so the result can actually
   be looked at rather than inferred from assertions. */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '../../tools/serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = process.env.QA_DIR || path.join(ROOT, '..', '.shots', 'scenes');
fs.mkdirSync(OUT, { recursive: true });

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const VIEWPORT = { width: 390, height: 844 };   /* iPhone 14 */

const only = process.argv.slice(2).filter(a => !a.startsWith('-'));

const { server, url } = await serve(ROOT);
const browser = await chromium.launch({
  executablePath: fs.existsSync(CHROME) ? CHROME : undefined
});
const ctx = await browser.newContext({
  viewport: VIEWPORT, deviceScaleFactor: 2, isMobile: true, hasTouch: true
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e.message)));
page.on('console', m => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
await page.goto(url + '/tools/scene-lab.html', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__lab);

const scenes = await page.evaluate(() => window.__lab.scenes);
const WORDS = { 2: 'IT', 3: 'THE', 4: 'FROG', 5: 'HORSE', 6: 'SPRING' };

let fail = 0;
const report = [];
function check(scene, name, ok, detail = '') {
  if (!ok) fail++;
  report.push({ scene, name, ok, detail });
  if (!ok) console.log(`  FAIL  ${name}${detail ? ' -- ' + detail : ''}`);
}

/* Which lead each scene needs, and a word length it supports. */
function castFor(s) {
  const lead = s.lead === 'any' ? 'blip' : s.lead;
  const n = Math.max(s.min || 1, 4);
  return { lead, word: WORDS[Math.min(6, n)] || 'FROG' };
}

for (const s of scenes) {
  if (only.length && !only.includes(s.id)) continue;
  const { lead, word } = castFor(s);
  process.stdout.write(`\n${s.id}  (${s.name}, lead=${lead}, "${word}")\n`);

  const plan = await page.evaluate(([id, w, l]) => window.__lab.plan(id, w, l), [s.id, word, lead]);
  const frames = [];
  const samples = [];

  await page.evaluate(([id, w, l]) => { window.__lab.run(id, w, l); }, [s.id, word, lead]);

  const t0 = Date.now();
  const limit = plan.duration + 1200;
  let shotEvery = Math.max(1, Math.round((plan.duration / 10) / 110));
  let i = 0;
  while (Date.now() - t0 < limit) {
    const p = await page.evaluate(() => window.__lab.probe());
    samples.push({ t: Date.now() - t0, p });
    if (i % shotEvery === 0 && frames.length < 12) {
      frames.push({
        t: Date.now() - t0,
        png: (await page.screenshot({ type: 'png' })).toString('base64')
      });
    }
    i++;
    const done = await page.evaluate(() => window.__labDone);
    if (done) break;
    await page.waitForTimeout(90);
  }

  const residue = await page.evaluate(() => window.__lab.residue());
  const errs = await page.evaluate(() => window.__labErrors);

  /* ---- assertions over the samples ---- */
  const mid = samples.filter(s2 => s2.t > 200 && s2.p.live);

  check(s.id, 'no handler threw', !errs || errs.length === 0, JSON.stringify(errs));

  /* every letter is accounted for on every frame: never silently gone */
  const expected = word.length;
  const lost = mid.filter(m => m.p.props.length !== expected);
  check(s.id, 'no letter vanishes mid-scene', lost.length === 0,
    lost.length ? `${lost.length} frames had ${lost[0].p.props.length}/${expected} props` : '');

  /* a character who is visible must not sit perfectly still for long */
  const frozen = {};
  for (let k = 1; k < mid.length; k++) {
    const prev = mid[k - 1].p.actors, cur = mid[k].p.actors;
    for (const name of Object.keys(cur)) {
      const a = cur[name], b = prev[name];
      const ACTOR = 148;
      const offscreen = a.x > VIEWPORT.width || a.x + ACTOR < 0 ||
                        a.y > VIEWPORT.height || a.y + ACTOR < 0;
      if (!b || a.op < 0.1 || offscreen) { frozen[name] = 0; continue; }
      const still = a.x === b.x && a.y === b.y && a.rot === b.rot;
      frozen[name] = still ? (frozen[name] || 0) + (mid[k].t - mid[k - 1].t) : 0;
      if (frozen[name] > 900) frozen[name + '!'] = frozen[name];
    }
  }
  const stalled = Object.keys(frozen).filter(k => k.endsWith('!'));
  check(s.id, 'no visible character freezes', stalled.length === 0, stalled.join(','));

  /* roped letters: the cord must read slack before it reads taut */
  const tautSeq = mid.map(m => m.p.cords.some(c => c.taut));
  const roped = plan.events.some(e => e.kind === 'tow' && e.roped);
  if (roped) {
    const firstTaut = tautSeq.indexOf(true);
    check(s.id, 'cord shows slack before it snaps taut',
      firstTaut === -1 ? false : tautSeq.slice(0, firstTaut).every(v => v === false) && firstTaut > 0,
      `first taut at sample ${firstTaut}`);
  }

  /* stacked letters must stay readable: no two props sharing a centre */
  const hiddenFrames = new Set();
  for (const m of mid) {
    const b = m.p.props;
    for (let x = 0; x < b.length; x++) {
      for (let y = x + 1; y < b.length; y++) {
        const dx = Math.abs((b[x].x + b[x].w / 2) - (b[y].x + b[y].w / 2));
        const dy = Math.abs((b[x].y + b[x].h / 2) - (b[y].y + b[y].h / 2));
        if (dx < b[x].w * 0.22 && dy < b[x].h * 0.22) hiddenFrames.add(m.t);
      }
    }
  }
  /* a letter may be hidden for a beat as it is caught, but never for long */
  const hiddenPct = mid.length ? hiddenFrames.size / mid.length : 0;
  check(s.id, 'no letter stays hidden behind another', hiddenPct < 0.15,
    `hidden in ${Math.round(hiddenPct * 100)}% of frames`);

  /* every letter must have been taken by somebody by the end: a letter left
     loose on the floor is one the characters walked away from */
  const tail = mid.filter(m => m.t > plan.duration * 0.82 && m.p.states && m.p.states.length);
  if (tail.length) {
    const lastStates = tail[tail.length - 1].p.states;
    const abandoned = lastStates.filter(v => v === 'free' || v === 'idle').length;
    check(s.id, 'no letter is abandoned on the floor', abandoned === 0,
      `${abandoned} of ${lastStates.length} left as ${JSON.stringify(lastStates)}`);
  }

  /* cleanup: nothing of the performance may survive it */
  check(s.id, 'no stranded props after the scene', residue.props === 0, `${residue.props} left`);
  check(s.id, 'no stranded shards', residue.shards === 0, `${residue.shards} left`);
  check(s.id, 'no cord left drawn', residue.cordsWithPath === 0, `${residue.cordsWithPath} left`);
  check(s.id, 'every character parked', residue.visibleActors === 0, `${residue.visibleActors} visible`);
  check(s.id, 'shake reset', residue.layerTransform === '', residue.layerTransform);

  /* ---- filmstrip ---- */
  const cells = frames.map(f =>
    `<figure><img src="data:image/png;base64,${f.png}"><figcaption>${f.t}ms</figcaption></figure>`).join('');
  const sheet = `<!DOCTYPE html><meta charset="utf-8"><style>
    body{margin:0;background:#11151c;color:#cfe3ff;font:600 12px/1.4 ui-monospace,Menlo,monospace;padding:10px}
    h1{font-size:14px;margin:0 0 8px;color:#fff}
    .grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
    figure{margin:0}img{width:100%;display:block;border-radius:4px;border:1px solid #2a3550}
    figcaption{text-align:center;padding-top:2px;color:#8fb4e8}
  </style><h1>${s.id} — ${s.name} — lead ${lead} — "${word}" — ${plan.duration}ms</h1>
  <div class="grid">${cells}</div>`;
  const sheetPath = path.join(OUT, `${s.id}.html`);
  fs.writeFileSync(sheetPath, sheet);
  const sheetPage = await ctx.newPage();
  await sheetPage.setViewportSize({ width: 1400, height: 560 });
  await sheetPage.goto('file://' + sheetPath, { waitUntil: 'load' });
  await sheetPage.screenshot({ path: path.join(OUT, `${s.id}.png`), fullPage: true });
  await sheetPage.close();
  fs.unlinkSync(sheetPath);
}

check('page', 'no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

const passed = report.filter(r => r.ok).length;
console.log(`\n${passed} passed, ${fail} failed`);
console.log(`filmstrips: ${OUT}`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
