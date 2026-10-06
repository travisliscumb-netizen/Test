// Post-build guard: fails the build if dev-only code reached the production bundle,
// and prints the size of what ships.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// Usage: node tools/check-bundle.mjs [dist|dist-single]
const target = process.argv[2] ?? 'dist';
const distDir = fileURLToPath(new URL(`../${target}`, import.meta.url));
const singleFile = target === 'dist-single';

/** Strings that only exist in dev-only modules. Any hit means tree-shaking failed. */
const FORBIDDEN_MARKERS = [
  { marker: 'ShowInspector', reason: 'Babylon Inspector entry point' },
  { marker: '@babylonjs/inspector', reason: 'Babylon Inspector package' },
  { marker: '@fluentui/', reason: 'Inspector UI dependency' },
  { marker: 'installInspectorToggle', reason: 'dev inspector toggle' },
  {
    marker: '__VITE_PRELOAD__',
    reason: 'unreplaced Vite preload marker (ReferenceError at runtime)',
  },
];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

let files;
try {
  files = walk(distDir);
} catch {
  console.error(`check-bundle: ${distDir} not found. Run vite build first.`);
  process.exit(1);
}

const shipped = files.filter((f) => extname(f) !== '.map');
const violations = [];
for (const file of shipped.filter((f) => ['.js', '.html'].includes(extname(f)))) {
  const text = readFileSync(file, 'utf8');
  for (const { marker, reason } of FORBIDDEN_MARKERS) {
    if (text.includes(marker)) {
      violations.push(`${relative(distDir, file)} contains "${marker}" (${reason})`);
    }
  }
}

if (singleFile) {
  if (shipped.length !== 1 || !shipped[0].endsWith('index.html')) {
    violations.push(
      `Expected only index.html, found: ${shipped.map((f) => relative(distDir, f)).join(', ')}`,
    );
  }
  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  const wasmCopies = html.split('data:application/wasm;base64,').length - 1;
  if (wasmCopies !== 1) {
    violations.push(`Expected exactly one inlined Havok wasm, found ${String(wasmCopies)}.`);
  }
} else if (!shipped.some((f) => extname(f) === '.wasm')) {
  violations.push('No .wasm file emitted; Havok physics would fail to load.');
}

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
let totalRaw = 0;
let totalGzip = 0;
console.log('check-bundle: shipped files (excluding source maps)');
for (const file of shipped.sort()) {
  const data = readFileSync(file);
  const gz = gzipSync(data).length;
  totalRaw += data.length;
  totalGzip += gz;
  console.log(
    `  ${relative(distDir, file).padEnd(48)} ${kib(data.length).padStart(12)} ${kib(gz).padStart(12)} gz`,
  );
}
console.log(
  `  ${'total'.padEnd(48)} ${kib(totalRaw).padStart(12)} ${kib(totalGzip).padStart(12)} gz`,
);

if (violations.length > 0) {
  console.error('\ncheck-bundle: FAILED');
  for (const v of violations) {
    console.error(`  - ${v}`);
  }
  process.exit(1);
}
console.log('\ncheck-bundle: OK (no dev-only code in production bundle)');
