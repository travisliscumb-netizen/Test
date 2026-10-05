// Dev helper: screenshots a page served by the Vite dev server.
// Usage: node tools/shoot.mjs <url> <out.png> [width] [height] [clipX,clipY,clipW,clipH]
import { chromium } from "@playwright/test";

const [url, out, w = "1280", h = "900", clipArg] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: node tools/shoot.mjs <url> <out.png> [width] [height]");
  process.exit(2);
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url);
await page.waitForFunction(() => document.body.dataset.ready === "1", null, { timeout: 15000 }).catch(() => {});
if (clipArg) {
  const [x, y, width, height] = clipArg.split(",").map(Number);
  await page.screenshot({ path: out, fullPage: true, clip: { x, y, width, height } });
} else {
  await page.screenshot({ path: out, fullPage: true });
}
await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`saved ${out}`);
