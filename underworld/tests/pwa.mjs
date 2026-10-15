/* App icon and install metadata: the crest at every size (1024 master, 512, 192, Apple touch 180, favicon 32),
   a web app manifest served over http(s) with the icons (one maskable), and none of it requested or failing
   when the game is opened offline from a file. */
import { chromium, check, FILE, summary } from './lib.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.dirname(FILE);
const types = { '.html': 'text/html', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.js': 'text/javascript' };
const srv = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch();
const page = await b.newPage(), bad = [];
page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
await page.goto(base + 'index.html', { waitUntil: 'domcontentloaded' });
const head = await page.evaluate(() => ({ manifest: document.querySelector('link[rel=manifest]')?.href, apple: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'), icon: document.querySelector('link[rel=icon]')?.getAttribute('href'), title: document.querySelector('meta[name=apple-mobile-web-app-title]')?.content }));
check('over http the page links a manifest, an Apple touch icon and a favicon', !!head.manifest && head.apple === 'icons/apple-touch-icon.png' && !!head.icon && head.title === 'The Underworld', JSON.stringify(head));
const man = await page.evaluate(async u => (await fetch(u)).json(), head.manifest);
check('the manifest names the game, opens full-screen in landscape and lists 192 and 512 icons (one maskable)', man.name === 'The Underworld' && man.display === 'fullscreen' && man.orientation === 'landscape' && man.icons.some(i => i.sizes === '192x192') && man.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'), JSON.stringify(man));
const sizes = await page.evaluate(async list => Promise.all(list.map(src => new Promise(r => { const im = new Image(); im.onload = () => r([src, im.naturalWidth, im.naturalHeight]); im.onerror = () => r([src, 0, 0]); im.src = src; }))), ['icons/icon-1024.png', 'icons/icon-512.png', 'icons/icon-192.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png']);
const want = { 'icons/icon-1024.png': 1024, 'icons/icon-512.png': 512, 'icons/icon-192.png': 192, 'icons/apple-touch-icon.png': 180, 'icons/favicon-32.png': 32 };
check('every icon exists at its exact size', sizes.every(([s, w, h]) => w === want[s] && h === want[s]), JSON.stringify(sizes));
check('nothing the page asks for is missing', bad.length === 0, bad.join(' | '));
const p2 = await b.newPage(), errs = [];
p2.on('console', m => { if (m.type() === 'error' && /manifest|icon/i.test(m.text())) errs.push(m.text()); });
await p2.goto('file://' + FILE, { waitUntil: 'domcontentloaded' });
const fileHead = await p2.evaluate(() => !!document.querySelector('link[rel=manifest]'));
check('opened from a file (offline), no manifest is requested and no icon errors', !fileHead && errs.length === 0, JSON.stringify({ fileHead, errs }));
summary('pwa');
await b.close(); srv.close();
