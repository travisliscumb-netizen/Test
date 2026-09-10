/*
 * Bundles the game into one self-contained HTML file.
 *
 * Every script (three.js included) is inlined, so the result runs anywhere a
 * single file can be dropped - a Claude Artifact, a static host, an email
 * attachment - with no relative paths and no network access.
 *
 *   node tools/build-artifact.js [outfile]
 *
 * By default it writes dist/block-stack-3d.html as a complete standalone
 * document. Pass --artifact to emit the body-only form the Artifact tool
 * expects (it supplies its own doctype/head/body wrapper).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const artifactMode = process.argv.includes('--artifact');
const outArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const out = outArg || path.join(ROOT, 'dist',
  artifactMode ? 'block-stack-3d.artifact.html' : 'block-stack-3d.html');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let html = read('game.html');

/* inline every <script src="..."> in place */
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const code = read(src);
  if (/<\/script/i.test(code)) throw new Error(src + ' contains a </script sequence and cannot be inlined');
  return '<script>\n/* ' + src + ' */\n' + code + '\n</script>';
});

/* the manifest is a separate file, so inline it as a data URL */
const manifest = JSON.stringify(JSON.parse(read('manifest.webmanifest')));
html = html.replace('<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="manifest" href="data:application/manifest+json,' + encodeURIComponent(manifest) + '">');

if (artifactMode) {
  /*
   * Artifact form: the host supplies <!doctype>, <head> and <body>, so strip
   * ours and re-apply the head metadata at runtime instead. The viewport meta
   * matters - the host's default has no viewport-fit=cover and allows pinch
   * zoom, both of which break a full-screen game on iPhone.
   */
  const headMeta = `<script>
/* the Artifact host supplies its own <head>; restore the metadata this game needs */
(function () {
  var d = document;
  function meta(name, content) {
    var m = d.querySelector('meta[name="' + name + '"]');
    if (!m) { m = d.createElement('meta'); m.setAttribute('name', name); d.head.appendChild(m); }
    m.setAttribute('content', content);
  }
  meta('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
  meta('theme-color', '#3CA5DE');
  meta('apple-mobile-web-app-capable', 'yes');
  meta('mobile-web-app-capable', 'yes');
  meta('apple-mobile-web-app-status-bar-style', 'black-translucent');
})();
</script>`;

  const title = (html.match(/<title>[\s\S]*?<\/title>/) || [''])[0];
  const style = (html.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const body = html.slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('</body>'));
  html = [title, headMeta, style, body.trim()].join('\n');
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(out, '->', (fs.statSync(out).size / 1024).toFixed(0) + ' KB',
  artifactMode ? '(artifact form)' : '(standalone document)');
