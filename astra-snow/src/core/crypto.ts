// Route sealing: AES-GCM-256 with a random key that never touches a server.
//
// The ciphertext is a static file; the 256-bit key reaches the phone once, in
// the URL fragment (#k=...), which browsers never send over the network. A
// 256-bit random key is not brute-forceable, unlike a 4-digit PIN guarding a
// file an attacker can download.

import type { SealedDoc } from '../data/schema.ts';

const subtle = globalThis.crypto.subtle;

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  const d = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function isKeyString(k: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(k);
}

async function importKey(k: string): Promise<CryptoKey> {
  if (!isKeyString(k)) throw new Error('Key is malformed');
  return subtle.importKey('raw', unb64url(k), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function newKey(): string {
  return b64url(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}

export async function seal(plaintext: string, key: string, label: string, stops: number): Promise<SealedDoc> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(key), new TextEncoder().encode(plaintext));
  return {
    schema: 'astra.sealed/1',
    alg: 'AES-GCM-256',
    iv: b64url(iv),
    data: b64url(new Uint8Array(ct)),
    sha256: await sha256Hex(plaintext),
    label,
    stops,
  };
}

export class UnsealError extends Error {}

/** Decrypt and verify. Throws UnsealError on a wrong key or a damaged file. */
export async function unseal(doc: SealedDoc, key: string): Promise<string> {
  if (doc?.schema !== 'astra.sealed/1' || doc.alg !== 'AES-GCM-256') throw new UnsealError('Not a sealed route file');
  let pt: ArrayBuffer;
  try {
    pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64url(doc.iv) }, await importKey(key), unb64url(doc.data));
  } catch {
    throw new UnsealError('This key does not open this route');
  }
  const text = new TextDecoder().decode(pt);
  if ((await sha256Hex(text)) !== doc.sha256) throw new UnsealError('Route file failed its integrity check');
  return text;
}

// ------------------------------------------------------------------ PIN
//
// A short PIN wraps the random 256-bit route key: PBKDF2-SHA256 stretches the
// PIN into a key-encryption key, which AES-GCM-encrypts the route key. After
// the first unlock the phone stores the route key itself, so the PIN is typed
// once per phone. Stretching slows each guess; it cannot make 10,000 possible
// PINs safe against someone who downloads the file (see docs/ARCHITECTURE.md).

export const PIN_ITERATIONS = 600_000;

export interface PinWrap {
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  /** base64url 16-byte salt */
  salt: string;
  /** base64url 12-byte IV */
  iv: string;
  /** base64url AES-GCM(route key bytes) */
  data: string;
}

export function isPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

async function pinKey(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function wrapKeyWithPin(routeKey: string, pin: string, iterations = PIN_ITERATIONS): Promise<PinWrap> {
  if (!isPin(pin)) throw new Error('PIN must be 4-8 digits');
  if (!isKeyString(routeKey)) throw new Error('Route key is malformed');
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, await pinKey(pin, salt, iterations), unb64url(routeKey));
  return { kdf: 'PBKDF2-SHA256', iterations, salt: b64url(salt), iv: b64url(iv), data: b64url(new Uint8Array(ct)) };
}

/** The route key for this PIN. Throws UnsealError('Wrong PIN') otherwise. */
export async function unwrapKeyWithPin(wrap: PinWrap, pin: string): Promise<string> {
  if (wrap?.kdf !== 'PBKDF2-SHA256') throw new UnsealError('This route file has no PIN set up');
  if (!isPin(pin)) throw new UnsealError('Wrong PIN');
  let raw: ArrayBuffer;
  try {
    raw = await subtle.decrypt({ name: 'AES-GCM', iv: unb64url(wrap.iv) }, await pinKey(pin, unb64url(wrap.salt), wrap.iterations), unb64url(wrap.data));
  } catch {
    throw new UnsealError('Wrong PIN');
  }
  return b64url(new Uint8Array(raw));
}
