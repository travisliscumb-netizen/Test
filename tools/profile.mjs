import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'block-stack');
const { server, url } = await serve(ROOT);
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
await page.goto(url + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__blockstack);

async function probe(label, setup) {
  await page.evaluate(setup);
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => new Promise((res) => {
    const g = window.__blockstack.game();
    const c = document.getElementById('stage');
    const ctx = c.getContext('2d');
    let fills = 0, strokes = 0, clips = 0, grads = 0, texts = 0;
    const of = ctx.fill.bind(ctx), os = ctx.stroke.bind(ctx), oc = ctx.clip.bind(ctx);
    const og = ctx.createLinearGradient.bind(ctx), ot = ctx.fillText.bind(ctx);
    ctx.fill = (...a) => { fills++; return of(...a); };
    ctx.stroke = (...a) => { strokes++; return os(...a); };
    ctx.clip = (...a) => { clips++; return oc(...a); };
    ctx.createLinearGradient = (...a) => { grads++; return og(...a); };
    ctx.fillText = (...a) => { texts++; return ot(...a); };
    let n = 0; const t0 = performance.now();
    function tick() {
      n++;
      if (performance.now() - t0 < 1000) requestAnimationFrame(tick);
      else {
        ctx.fill = of; ctx.stroke = os; ctx.clip = oc;
        ctx.createLinearGradient = og; ctx.fillText = ot;
        res({
          fps: n / ((performance.now() - t0) / 1000),
          blocks: g.blocks.length, debris: g.debris.length,
          fillsPerFrame: fills / n, strokesPerFrame: strokes / n,
          clipsPerFrame: clips / n, gradsPerFrame: grads / n, textPerFrame: texts / n
        });
      }
    }
    requestAnimationFrame(tick);
  }));
  console.log(label.padEnd(22), JSON.stringify(r, (k, v) => typeof v === 'number' ? +v.toFixed(1) : v));
}

await probe('level 1', () => window.__blockstack.start(1));
await probe('level 100', () => window.__blockstack.start(100));
await probe('stack h=45', async () => {
  const api = window.__blockstack; api.stack();
  for (let i = 0; i < 45 && api.game().active; i++) {
    const a = api.game().active;
    a.pos = a.axis === 'x' ? api.game().top.x : api.game().top.z;
    api.place();
  }
});
await b.close(); server.close();
