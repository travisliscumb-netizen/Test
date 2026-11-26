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
