// Encrypt private/route.json into public/data/route.sealed.json.
//
//   [ASTRA_PIN=<digits>] node --experimental-strip-types tools/seal.mjs [--print-key]
//
// The key lives in private/route.key (git-ignored) and is reused across
// rebuilds so an unlock link already on the phone keeps working. Rotate it by
// deleting that file; every phone then needs the new link.

import fs from 'node:fs';
import path from 'node:path';
import { seal, unseal, newKey, isKeyString, wrapKeyWithPin, unwrapKeyWithPin } from '../src/core/crypto.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const KEY_FILE = path.join(ROOT, 'private/route.key');
const SRC = path.join(ROOT, 'private/route.json');
const OUT = path.join(ROOT, 'public/data/route.sealed.json');

const text = fs.readFileSync(SRC, 'utf8');
const doc = JSON.parse(text);
if (doc.schema !== 'astra.route/1') throw new Error('private/route.json is not a route');
if (doc.stops.length !== doc.source.rows) throw new Error(`stops ${doc.stops.length} != source rows ${doc.source.rows}`);

let key;
if (fs.existsSync(KEY_FILE)) key = fs.readFileSync(KEY_FILE, 'utf8').trim();
if (!key || !isKeyString(key)) {
  key = newKey();
  fs.writeFileSync(KEY_FILE, key + '\n', { mode: 0o600 });
  console.log('generated a new route key in private/route.key');
}

const sealed = await seal(text, key, doc.title, doc.stops.length);
// Optional PIN (ASTRA_PIN, never written to the repository): wraps the key.
if (process.env.ASTRA_PIN) {
  sealed.pin = await wrapKeyWithPin(key, process.env.ASTRA_PIN);
  if ((await unwrapKeyWithPin(sealed.pin, process.env.ASTRA_PIN)) !== key) throw new Error('PIN round-trip mismatch');
  console.log(`PIN unlock enabled (PBKDF2-SHA256, ${sealed.pin.iterations} iterations)`);
}
// Prove the round trip before writing anything public.
const back = await unseal(sealed, key);
if (back !== text) throw new Error('round-trip mismatch');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(sealed));
console.log(`sealed ${doc.stops.length} stops -> public/data/route.sealed.json (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB), plaintext sha256 ${sealed.sha256.slice(0, 16)}…`);
if (process.argv.includes('--print-key')) console.log(`unlock fragment: #k=${key}`);
