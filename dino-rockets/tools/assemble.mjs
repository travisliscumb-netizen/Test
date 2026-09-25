/* Build the single-file game from src/.

   The shipped game is ONE html file: it has to open from Dropbox or a home
   screen icon with no server and no network. The sources stay split so
   the pure core can be tested in node; this joins them back together.

     node tools/assemble.mjs          write graysons-dino-rockets.html
     node tools/assemble.mjs --check  fail if the committed file is stale */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'graysons-dino-rockets.html');

const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const STYLES = ['10-ui.css', '15-stage.css'];
const SCRIPTS = ['20-core.js', '30-speech.js', '40-sfx.js', '50-dinos.js', '60-stage.js', '80-activities.js', '90-app.js'];

export function build() {
  let html = read('00-shell.html');
  const css = STYLES.map(f => `/* ---- ${f} ---- */\n${read(f)}`).join('\n');
  const js = SCRIPTS.map(f => {
    const body = read(f);
    if (/<\/script/i.test(body)) throw new Error(`${f} contains a closing script tag`);
    return `/* ---- ${f} ---- */\n${body}`;
  }).join('\n');

  const iconPath = path.join(ROOT, 'assets', 'icon-180.png');
  const icon = fs.existsSync(iconPath)
    ? `<link rel="apple-touch-icon" href="data:image/png;base64,${fs.readFileSync(iconPath).toString('base64')}">`
    : '<link rel="icon" href="data:,">';

  for (const marker of ['<!-- @ICON -->', '<!-- @STYLES -->', '<!-- @SCRIPTS -->']) {
    if (!html.includes(marker)) throw new Error(`shell is missing ${marker}`);
  }
  html = html
    .replace('<!-- @ICON -->', () => icon)
    .replace('<!-- @STYLES -->', () => `<style>\n${css}</style>`)
    .replace('<!-- @SCRIPTS -->', () => `<script>\n${js}</script>`);
  return html;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const html = build();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== html) {
      console.error('graysons-dino-rockets.html is out of date: run `npm run build`');
      process.exit(1);
    }
    console.log('graysons-dino-rockets.html is up to date');
  } else {
    fs.writeFileSync(OUT, html);
    console.log(`wrote ${path.relative(process.cwd(), OUT)} (${(html.length / 1024).toFixed(1)} KB)`);
  }
}
