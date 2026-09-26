/* Browser test runner for Operation Blackgate.

   Boots the built operation-blackgate.html in headless Chromium (WebGL through
   SwiftShader, so it runs on a machine with no GPU), then:
     1. injects tests/unit.js into the live page and collects its results;
     2. runs tests/e2e.js scenarios, which drive the real simulation step by step;
     3. checks the page made no network requests and logged no errors;
     4. boots the page at phone viewports with touch emulation and checks layout.

   Usage: node tests/run.mjs [--shots]   (--shots writes screenshots to .shots/) */
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME = pathToFileURL(path.join(ROOT, 'operation-blackgate.html')).href;
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = path.join(ROOT, '.shots');
if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });

const LAUNCH = {
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
         '--autoplay-policy=no-user-gesture-required']
};

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name + (detail ? '  -- ' + detail : '')); }
  else { fail++; failures.push(name + (detail ? ' -- ' + detail : '')); console.log('  FAIL  ' + name + (detail ? ' -- ' + detail : '')); }
}

/* Open the game and wait until the world is booted and the title is up. */
async function openGame(browser, contextOpts) {
  const context = await browser.newContext(contextOpts || { viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) requests.push(r.url()); });
  await page.goto(GAME, { timeout: 120000 });
  await page.waitForFunction(() => window.GAME && GAME.booted && GAME.screen === 'screenTitle', null, { timeout: 60000 });
  return { context, page, errors, requests };
}

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOT_DIR, name + '.png') });
}

const browser = await chromium.launch(LAUNCH);
try {
  /* Each page is checked for hygiene and closed before the next one opens:
     two pages rendering under SwiftShader at once starve each other. */
  async function hygiene(s, label) {
    check('no page errors (' + label + ')', s.errors.length === 0, s.errors.slice(0, 3).join(' | '));
    check('zero network requests (' + label + ')', s.requests.length === 0, s.requests.slice(0, 3).join(' | '));
    await s.context.close();
  }

  /* ---------- 1. unit suite ---------- */
  console.log('\n1. Unit suite (injected into the live page)');
  const g = await openGame(browser);
  await shot(g.page, 'title');
  await g.page.addScriptTag({ path: path.join(ROOT, 'tests', 'unit.js') });
  const results = await g.page.evaluate(() => window.__TESTS__.results);
  for (const r of results) check(r.name, r.pass, r.error || '');
  check('unit suite ran a meaningful number of cases', results.length >= 40, results.length + ' cases');
  await hygiene(g, 'unit page');

  /* ---------- 2. scenarios ---------- */
  console.log('\n2. Scenarios (real simulation, stepped)');
  const e2e = await openGame(browser);
  await e2e.page.addScriptTag({ path: path.join(ROOT, 'tests', 'e2e.js') });
  const names = await e2e.page.evaluate(() => Object.keys(window.__E2E__));
  for (const name of names) {
    const t0 = Date.now();
    const r = await e2e.page.evaluate(n => window.__E2E__[n](), name);
    check(name, r && r.ok, (r && r.detail) + '  [' + ((Date.now() - t0) / 1000).toFixed(1) + 's]');
  }
  await hygiene(e2e, 'scenario page');

  /* ---------- 3. persistence across a reload ---------- */
  console.log('\n3. Persistence');
  {
    const s = await openGame(browser);
    await s.page.evaluate(() => {
      SAVE.settings.sensitivity = 1.7; SAVE.settings.invertY = true; SAVE.settings.lookMode = 'stick';
      SAVE.best[2] = 123.4; SAVE.unlocked.paintball = true; SAVE.cheatsOn.paintball = true;
      writeSave();
    });
    await s.page.reload();
    await s.page.waitForFunction(() => window.GAME && GAME.booted && GAME.screen === 'screenTitle', null, { timeout: 120000 });
    const r = await s.page.evaluate(() => ({
      sens: INPUT.sensitivity, inv: INPUT.invertY, look: INPUT.lookMode, best: SAVE.best[2],
      paint: cheatOn('paintball'), slider: document.getElementById('rngSens').value
    }));
    check('settings, best time and cheats survive a reload',
      r.sens === 1.7 && r.inv === true && r.look === 'stick' && r.best === 123.4 && r.paint && r.slider === '170',
      JSON.stringify(r));
    // the page saves on pagehide; stop that so the staged storage is what the reload sees
    await s.page.evaluate(() => { window.writeSave = function () {}; localStorage.clear(); localStorage.setItem('blackgate.save.v1', JSON.stringify({ best: 99 })); });
    await s.page.reload();
    await s.page.waitForFunction(() => window.GAME && GAME.booted, null, { timeout: 120000 });
    const m = await s.page.evaluate(() => SAVE.best.join(','));
    check('a v1 save carries its best time forward', m === '0,99,0', m);
    await s.page.evaluate(() => { window.writeSave = function () {}; localStorage.setItem('blackgate.save.v2', '{not json'); });
    await s.page.reload();
    await s.page.waitForFunction(() => window.GAME && GAME.booted, null, { timeout: 120000 });
    const c = await s.page.evaluate(() => SAVE.settings.lookMode + '/' + SAVE.best.join(','));
    check('a corrupt save boots with defaults (falling back to the v1 record)', c === 'swipe/0,99,0', c);
    await s.page.evaluate(() => localStorage.clear());
    await hygiene(s, 'persistence page');
  }

  /* ---------- 4. phone layouts ---------- */
  console.log('\n4. Phone layouts (touch emulation)');
  const phones = [
    { name: 'landscape 844x390', viewport: { width: 844, height: 390 } },
    { name: 'portrait 390x844', viewport: { width: 390, height: 844 } },
    { name: 'small landscape 667x375', viewport: { width: 667, height: 375 } }
  ];
  for (const ph of phones) {
    const s = await openGame(browser, { viewport: ph.viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await s.page.addScriptTag({ path: path.join(ROOT, 'tests', 'layout.js') });
    const r = await s.page.evaluate(() => window.__LAYOUT__());
    check(ph.name + ': touch controls do not overlap each other or the HUD', r.ok, r.detail);
    await s.page.waitForTimeout(600);
    await shot(s.page, 'phone-' + ph.viewport.width + 'x' + ph.viewport.height + '-hud');
    // a real tap on WEAP is exactly one weapon change
    await s.page.evaluate(() => { WEAPONS.list[1].owned = true; window.__cyc = 0; const o = cycleWeapon; cycleWeapon = function (d) { window.__cyc++; return o(d); }; });
    await s.page.tap('#btnWeap');
    await s.page.waitForTimeout(300);
    const cyc = await s.page.evaluate(() => window.__cyc);
    check(ph.name + ': one tap on WEAP is one weapon change', cyc === 1, cyc + ' calls');
    await s.page.evaluate(() => abortMission());
    const titleTop = await s.page.evaluate(() => {
      const el = document.querySelector('#screenTitle h1');
      document.getElementById('screenTitle').scrollTop = 0;
      return el.getBoundingClientRect().top;
    });
    check(ph.name + ': title screen scrolls to its top (nothing clipped above)', titleTop >= 0, 'h1 top ' + titleTop.toFixed(0) + 'px');
    await shot(s.page, 'phone-' + ph.viewport.width + 'x' + ph.viewport.height + '-title');
    check(ph.name + ': no page errors', s.errors.length === 0, s.errors.slice(0, 3).join(' | '));
    await s.context.close();
  }
} finally {
  await browser.close();
}

console.log('\n' + '='.repeat(58));
console.log('PASSED ' + pass + '   FAILED ' + fail);
console.log('='.repeat(58));
if (fail) { console.log('\nFailures:\n  ' + failures.join('\n  ')); process.exit(1); }
