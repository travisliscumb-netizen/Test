/* Visual QA: every scene at normal speed in a phone-sized viewport, sampled
   between frames, with a filmstrip per scene to look at.
     node tools/scene-qa.mjs [--both] [scene ids...] */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '../../tools/serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = process.env.QA_DIR || path.join(ROOT, '..', '.shots', 'dino-scenes');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const VIEWPORT = { width: 390, height: 844 };
const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
const MIRRORS = process.argv.includes('--both') ? [false, true] : [false];

const { server, url } = await serve(ROOT);
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e.message)));
await page.goto(url + '/tools/scene-lab.html', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__lab);
const scenes = await page.evaluate(() => window.__lab.scenes);
const WORDS = { 1: 'A', 2: 'GO', 3: 'THE', 4: 'SAID', 5: 'WHERE' };

let fail = 0;
function check(scene, name, ok, detail = '') { if (!ok) { fail++; console.log(`  FAIL  ${name}${detail ? ' -- ' + detail : ''}`); } return ok; }
let passed = 0;
for (const s0 of scenes) for (const mirror of MIRRORS) {
  if (only.length && !only.includes(s0.id)) continue;
  const lead = (await page.evaluate(i => window.__lab.leadsFor(i), s0.id))[0];
  const word = WORDS[Math.max(s0.min || 1, 4)];
  const id = s0.id + (mirror ? '~m' : '');
  process.stdout.write(`\n${id}  (${s0.name}, lead=${lead}, "${word}")\n`);
  const plan = await page.evaluate(([i, w, l, m]) => window.__lab.plan(i, w, l, m), [s0.id, word, lead, mirror]);
  await page.evaluate(([i, w, l, m]) => { window.__lab.run(i, w, l, m); }, [s0.id, word, lead, mirror]);
  const t0 = Date.now(), frames = [], samples = [];
  const every = Math.max(1, Math.round((plan.duration / 11) / 110));
  let i = 0;
  while (Date.now() - t0 < plan.duration + 1500) {
    const p = await page.evaluate(() => window.__lab.probe());
    samples.push({ t: Date.now() - t0, p });
    if (i % every === 0 && frames.length < 12) frames.push({ t: Date.now() - t0, png: (await page.screenshot({ type: 'png' })).toString('base64') });
    i++;
    if (await page.evaluate(() => window.__labDone)) break;
    await page.waitForTimeout(90);
  }
  const residue = await page.evaluate(() => window.__lab.residue());
  const errs = await page.evaluate(() => window.__labErrors);
  const mid = samples.filter(x => x.t > 200 && x.p.live);
  const checks = [
    check(id, 'no handler threw', !errs || errs.length === 0, JSON.stringify(errs)),
    check(id, 'no letter vanishes mid-scene', mid.every(m => m.p.props.length === word.length)),
  ];
  /* a visible dino must not freeze */
  const still = {};
  let frozen = '';
  for (let k = 1; k < mid.length; k++) for (const [n, a] of Object.entries(mid[k].p.actors)) {
    const b = mid[k - 1].p.actors[n];
    const off = a.x > VIEWPORT.width || a.x + 150 < 0 || a.y > VIEWPORT.height || a.y + 150 < 0;
    if (!b || a.op < 0.1 || off) { still[n] = 0; continue; }
    still[n] = (a.x === b.x && a.y === b.y && a.rot === b.rot) ? (still[n] || 0) + (mid[k].t - mid[k - 1].t) : 0;
    if (still[n] > 1100) frozen = n;
  }
  checks.push(check(id, 'no visible dino freezes', !frozen, frozen));
  /* letters that are visible must not sit hidden behind each other for long */
  let hidden = 0, window_first = '';
  for (const m of mid) {
    const b = m.p.props.filter(r => r.op > 0.3 && r.x + r.w > 0 && r.x < VIEWPORT.width && r.y + r.h > 0 && r.y < VIEWPORT.height);
    let h = false;
    for (let x = 0; x < b.length; x++) for (let y = x + 1; y < b.length; y++) {
      if (Math.abs(b[x].x - b[y].x) < b[x].w * 0.22 && Math.abs(b[x].y - b[y].y) < b[x].h * 0.22) h = true;
    }
    if (h){ hidden++; if (!window_first) window_first = `t=${m.t} ${JSON.stringify(m.p.states)} ${JSON.stringify(b.map(r => [r.x, r.y]))}`; }
  }
  checks.push(check(id, 'no letter stays hidden behind another', !mid.length || hidden / mid.length < 0.15, `${Math.round(hidden / Math.max(1, mid.length) * 100)}% first ${window_first}`));
  /* at the end, every letter has left the screen with somebody, or been beamed/whacked away */
  const tail = mid.filter(m => m.t > plan.duration * 0.85);
  if (tail.length) {
    const last = tail[tail.length - 1].p;
    const onScreen = last.props.filter(r => r.op > 0.3 && r.x + r.w > 0 && r.x < VIEWPORT.width && r.y + r.h > 0 && r.y < VIEWPORT.height);
    const loose = last.states.filter(s => s === 'free' || s === 'idle' || s === 'float').length;
    checks.push(check(id, 'no letter left loose at the end', loose === 0, JSON.stringify(last.states)));
    checks.push(check(id, 'no letter still on screen as the scene ends', onScreen.length === 0, `${onScreen.length} visible, states ${JSON.stringify(last.states)}`));
  }
  checks.push(check(id, 'cleanup: no props', residue.props === 0, `${residue.props}`));
  checks.push(check(id, 'cleanup: no particles, ship or beam', residue.fx === 0, `${residue.fx}`));
  checks.push(check(id, 'cleanup: every dino parked', residue.visibleActors === 0, `${residue.visibleActors}`));
  checks.push(check(id, 'cleanup: shake reset', residue.layerTransform === ''));
  passed += checks.filter(Boolean).length;
  const cells = frames.map(f => `<figure><img src="data:image/png;base64,${f.png}"><figcaption>${f.t}ms</figcaption></figure>`).join('');
  const sheet = path.join(OUT, `${id}.html`);
  fs.writeFileSync(sheet, `<!DOCTYPE html><meta charset="utf-8"><style>body{margin:0;background:#11151c;color:#cfe3ff;font:600 12px monospace;padding:10px}
    .g{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}figure{margin:0}img{width:100%;display:block;border-radius:4px}figcaption{text-align:center;color:#8fb4e8}</style>
    <h3>${id} — ${s0.name} — ${lead} — "${word}" — ${plan.duration}ms</h3><div class="g">${cells}</div>`);
  const sp = await ctx.newPage();
  await sp.setViewportSize({ width: 1400, height: 560 });
  await sp.goto('file://' + sheet);
  await sp.screenshot({ path: path.join(OUT, `${id}.png`), fullPage: true });
  await sp.close();
  fs.unlinkSync(sheet);
}
if (pageErrors.length) { fail++; console.log('  FAIL page errors: ' + pageErrors.slice(0, 3).join(' | ')); }
console.log(`\n${passed} passed, ${fail} failed\nfilmstrips: ${OUT}`);
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
