# vendor/

`three.min.js` is [three.js](https://threejs.org) r180 (npm `three@0.180.0`), bundled
as a classic script that defines a global `THREE`, so the game runs from a plain
`file://` open with no build step, no import maps and no CDN dependency.

It was produced with:

```
npm i three@0.180.0 esbuild
echo 'export * from "three";' > entry.js
esbuild entry.js --bundle --format=iife --global-name=THREE --minify \
  --legal-comments=none --outfile=three.min.js
```

three.js is MIT licensed — see `three.LICENSE`.
