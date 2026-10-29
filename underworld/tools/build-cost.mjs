/* What a build costs to ship and to start, side by side for any number of builds (the graphics overhaul's size table).

   node underworld/tools/build-cost.mjs <a.html> [b.html ...]

   For each file: bytes raw / gzip -9 / brotli (max), then in headless Chromium (SwiftShader, 960x540, no throttling),
   three cold loads: milliseconds from navigation to the game's boot flag (parse, compile, world generation, first
   frames), and after a new game and 10 s of play on the simulation clock, the JS heap in use and the renderer's live
   geometries and textures. Medians of the three. Run it on a quiet machine: wall times are only comparable between
   builds measured in the same run. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let playwright; try { playwright = require('playwright'); } catch { playwright = createRequire(path.join(process.execPath, '../../lib/node_modules/'))('playwright'); }
const { chromium } = playwright;

const files = process.argv.slice(2).map(f => path.resolve(f));
if (!files.length) { console.error('usage: build-cost.mjs <a.html> [b.html ...]'); process.exit(2); }
const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const rows = [];
for (const f of files) {
  const buf = fs.readFileSync(f);
  const row = { file: path.basename(f), raw: buf.length, gzip: zlib.gzipSync(buf, { level: 9 }).length, brotli: zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length, boot: [], heap: [], geo: [], tex: [] };
  for (let k = 0; k < 3; k++) {
    const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
    await ctx.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.reject(new Error('off')); }; });
    const page = await ctx.newPage();
    const t0 = Date.now();
    await page.goto('file://' + f);
    await page.waitForFunction(() => window.__pvBooted === true, null, { timeout: 300000, polling: 50 });
    row.boot.push(Date.now() - t0);
    await page.evaluate(() => window.game.quality.setMode(1));
    await page.waitForFunction(() => { const l = document.getElementById('loading'); return !l || l.style.display === 'none' || l.classList.contains('hidden') || getComputedStyle(l).opacity === '0' || !l.isConnected; }, null, { timeout: 180000, polling: 200 });
    await page.click('#btnNew', { timeout: 120000 });
    await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading, null, { timeout: 240000 });
    const m = await page.evaluate(() => {
      const g = window.game; g.events.cool = 1e9; g.save.settings.guide = false;
      for (let n = 0; n < 600; n++) g.update(1 / 60, 1 / 60);
      g.render(); const i = g.renderer.info;
      return { heap: performance.memory ? performance.memory.usedJSHeapSize : 0, geo: i.memory.geometries, tex: i.memory.textures };
    });
    row.heap.push(m.heap); row.geo.push(m.geo); row.tex.push(m.tex);
    await ctx.close();
  }
  rows.push({ file: row.file, raw: row.raw, gzip: row.gzip, brotli: row.brotli, bootMs: med(row.boot), heapMB: +(med(row.heap) / 1048576).toFixed(1), geometries: med(row.geo), textures: med(row.tex), boots: row.boot });
}
await b.close();
console.log(JSON.stringify(rows, null, 1));
console.log('| build | raw | gzip | brotli | boot ms | JS heap MB | geometries | textures |');
console.log('|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.file} | ${r.raw.toLocaleString('en-US')} | ${r.gzip.toLocaleString('en-US')} | ${r.brotli.toLocaleString('en-US')} | ${r.bootMs} | ${r.heapMB} | ${r.geometries} | ${r.textures} |`);
