// Post-build guard: fails the build if dev-only code reached the production bundle,
// and prints the size of what ships.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const distDir = fileURLToPath(new URL('../dist', import.meta.url));

/** Strings that only exist in dev-only modules. Any hit means tree-shaking failed. */
const FORBIDDEN_MARKERS = [
  { marker: 'ShowInspector', reason: 'Babylon Inspector entry point' },
  { marker: '@babylonjs/inspector', reason: 'Babylon Inspector package' },
  { marker: '@fluentui/', reason: 'Inspector UI dependency' },
  { marker: 'installInspectorToggle', reason: 'dev inspector toggle' },
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

if (!shipped.some((f) => extname(f) === '.wasm')) {
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
