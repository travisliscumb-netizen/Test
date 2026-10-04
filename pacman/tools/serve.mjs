/* Tiny static server for local play, icon generation and the playtest.
   Not part of the shipped game.  Usage: node tools/serve.mjs [port] */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

/* Mirror the production security headers so CSP violations surface locally. */
function productionHeaders(base) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(base, 'vercel.json'), 'utf8'));
    const all = cfg.headers.find((h) => h.source === '/(.*)');
    return Object.fromEntries(all.headers.map((h) => [h.key, h.value]));
  } catch {
    return {};
  }
}

export function serve(root, port = 0) {
  const base = path.resolve(root);
  const extra = productionHeaders(base);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.resolve(base, '.' + path.posix.normalize(p));
    if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { ...extra, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: p } = server.address();
      resolve({ server, port: p, url: `http://127.0.0.1:${p}` });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { url } = await serve(root, Number(process.argv[2]) || 8080);
  console.log(`serving ${root} at ${url}`);
}
