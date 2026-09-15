// Cashpilot — Dropbox client.
//
// Auth is OAuth 2 with PKCE. That matters architecturally: PKCE is what lets a
// pure static page authenticate without a client secret, which is what lets this
// app exist with no server at all. The app key is public by design.
//
// Everything here is scoped under DBX_ROOT. The app never reads or writes
// outside /Cashpilot.

import {
  DROPBOX_AUTH_URL, DROPBOX_TOKEN_URL, DROPBOX_API, DROPBOX_CONTENT,
  DROPBOX_SCOPES, DBX_ROOT, DBX_FOLDERS, LS, MAX_UPLOAD_BYTES,
} from './config.js';

// --- token storage -----------------------------------------------------------

export function loadToken() {
  try {
    const raw = localStorage.getItem(LS.dropboxToken);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveToken(tok) {
  try { localStorage.setItem(LS.dropboxToken, JSON.stringify(tok)); } catch { /* private mode */ }
}

export function clearToken() {
  try {
    localStorage.removeItem(LS.dropboxToken);
    localStorage.removeItem(LS.pkceVerifier);
  } catch { /* ignore */ }
}

export const isConnected = () => Boolean(loadToken()?.refresh_token || loadToken()?.access_token);

// --- PKCE --------------------------------------------------------------------

function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return new Uint8Array(digest);
}

/** Redirect URI must match one registered on the Dropbox app exactly. */
export function redirectUri() {
  return `${location.origin}${location.pathname}`;
}

/** Begin the OAuth redirect. Returns nothing — the page navigates away. */
export async function beginAuth(appKey) {
  if (!appKey) {
    throw new Error('A Dropbox app key is required. Create an app at dropbox.com/developers/apps and paste its App key into Settings.');
  }
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = base64url(await sha256(verifier));
  sessionStorage.setItem(LS.pkceVerifier, verifier);
  // Also in localStorage: iOS Safari can discard sessionStorage if it reloads
  // the tab while the user is away on the Dropbox consent screen.
  localStorage.setItem(LS.pkceVerifier, verifier);

  const url = new URL(DROPBOX_AUTH_URL);
  url.searchParams.set('client_id', appKey);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('token_access_type', 'offline'); // we need a refresh token
  url.searchParams.set('scope', DROPBOX_SCOPES);
  location.assign(url.toString());
}

/**
 * Complete the OAuth flow if the URL carries a ?code=. Safe to call on every
 * load; returns null when there is nothing to do.
 */
export async function completeAuthFromUrl(appKey) {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const error = params.get('error');
  if (error) {
    stripAuthParams();
    throw new Error(`Dropbox refused the connection: ${params.get('error_description') || error}`);
  }
  if (!code) return null;

  const verifier = sessionStorage.getItem(LS.pkceVerifier) || localStorage.getItem(LS.pkceVerifier);
  if (!verifier) {
    stripAuthParams();
    throw new Error('The Dropbox sign-in could not be verified (the PKCE verifier was lost). Please connect again.');
  }

  const body = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    client_id: appKey,
    code_verifier: verifier,
    redirect_uri: redirectUri(),
  });
  const res = await fetch(DROPBOX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  stripAuthParams();
  sessionStorage.removeItem(LS.pkceVerifier);
  localStorage.removeItem(LS.pkceVerifier);
  if (!res.ok) {
    throw new Error(`Dropbox token exchange failed: ${json.error_description || json.error || res.status}`);
  }

  const token = {
    access_token: json.access_token,
    refresh_token: json.refresh_token || null,
    expires_at: Date.now() + (Number(json.expires_in || 14400) - 120) * 1000,
    account_id: json.account_id || null,
    app_key: appKey,
  };
  saveToken(token);
  return token;
}

function stripAuthParams() {
  const url = new URL(location.href);
  for (const k of ['code', 'state', 'error', 'error_description']) url.searchParams.delete(k);
  const search = url.search === '?' ? '' : url.search;
  history.replaceState({}, '', url.pathname + search + url.hash);
}

export class DropboxAuthError extends Error {
  constructor(msg) { super(msg); this.name = 'DropboxAuthError'; }
}
export class DropboxError extends Error {
  constructor(msg, status, payload) {
    super(msg); this.name = 'DropboxError'; this.status = status; this.payload = payload;
  }
}

async function refresh(token) {
  if (!token || !token.refresh_token) {
    throw new DropboxAuthError('Dropbox session expired and no refresh token is stored. Reconnect in Settings.');
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: token.refresh_token,
    client_id: token.app_key,
  });
  const res = await fetch(DROPBOX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new DropboxAuthError(`Could not refresh the Dropbox session: ${json.error_description || json.error || res.status}`);
  }
  const next = {
    ...token,
    access_token: json.access_token,
    expires_at: Date.now() + (Number(json.expires_in || 14400) - 120) * 1000,
  };
  saveToken(next);
  return next;
}

async function accessToken() {
  let token = loadToken();
  if (!token) throw new DropboxAuthError('Dropbox is not connected.');
  if (!token.expires_at || Date.now() >= token.expires_at) token = await refresh(token);
  return token.access_token;
}

// --- request plumbing --------------------------------------------------------

/** Dropbox returns structured errors; surface the useful part, not "[object Object]". */
function describeError(status, payload) {
  if (payload && typeof payload === 'object') {
    const tag = payload.error?.['.tag'] || payload.error_summary || payload.error;
    if (typeof tag === 'string') return tag;
    try { return JSON.stringify(payload.error ?? payload); } catch { /* fall through */ }
  }
  return `HTTP ${status}`;
}

async function parseBody(res) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

async function rpc(endpoint, args, { retries = 1 } = {}) {
  const res = await fetch(`${DROPBOX_API}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args ?? null),
  });
  if (res.status === 401 && retries > 0) {
    await refresh(loadToken());
    return rpc(endpoint, args, { retries: retries - 1 });
  }
  if (res.status === 429 && retries > 0) {
    const wait = Number(res.headers.get('Retry-After') || 2);
    await new Promise((r) => setTimeout(r, Math.min(wait, 10) * 1000));
    return rpc(endpoint, args, { retries: retries - 1 });
  }
  const payload = await parseBody(res);
  if (!res.ok) throw new DropboxError(describeError(res.status, payload), res.status, payload);
  return payload;
}

/**
 * Dropbox-API-Arg travels as an HTTP header, so it must be pure ASCII. Photo
 * filenames from a phone routinely contain accents or emoji, which would
 * otherwise fail with an opaque "Failed to execute fetch". Escaping non-ASCII
 * to backslash-u form is what Dropbox documents for this.
 */
function toApiArgHeader(args) {
  const NON_ASCII = /[-￿]/g;
  return JSON.stringify(args).replace(NON_ASCII,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

async function contentDownload(endpoint, args) {
  const res = await fetch(`${DROPBOX_CONTENT}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Dropbox-API-Arg': toApiArgHeader(args),
    },
  });
  if (!res.ok) {
    const payload = await parseBody(res);
    throw new DropboxError(describeError(res.status, payload), res.status, payload);
  }
  const meta = JSON.parse(res.headers.get('Dropbox-API-Result') || '{}');
  return { meta, blob: await res.blob() };
}

async function contentUpload(endpoint, args, body) {
  const res = await fetch(`${DROPBOX_CONTENT}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Dropbox-API-Arg': toApiArgHeader(args),
      'Content-Type': 'application/octet-stream',
    },
    body,
  });
  const payload = await parseBody(res);
  if (!res.ok) throw new DropboxError(describeError(res.status, payload), res.status, payload);
  return payload;
}

// --- path safety -------------------------------------------------------------

/**
 * Reject anything that would escape the app's own folder.
 *
 * This is enforced here rather than at the UI layer because the AI agent also
 * calls these functions: a model that decides to "tidy up" a path outside
 * /Cashpilot must be stopped by the client, not by prompt wording.
 */
export function assertInRoot(path) {
  const p = String(path || '');
  if (!p.startsWith('/')) throw new DropboxError(`Path must be absolute: ${p}`);
  if (p.includes('..')) throw new DropboxError(`Path may not contain "..": ${p}`);
  const root = DBX_ROOT.toLowerCase();
  const lower = p.toLowerCase();
  if (lower !== root && !lower.startsWith(`${root}/`)) {
    throw new DropboxError(`Cashpilot only touches ${DBX_ROOT}; refused: ${p}`);
  }
  return p;
}

// --- public API --------------------------------------------------------------

export const getAccount = () => rpc('/users/get_current_account', null);

export async function ensureFolders() {
  const created = [];
  for (const path of DBX_FOLDERS) {
    try {
      await rpc('/files/create_folder_v2', { path, autorename: false });
      created.push(path);
    } catch (err) {
      // A conflict means the folder already exists, which is success for us.
      if (!/conflict/i.test(err.message)) throw err;
    }
  }
  return created;
}

const normalizeEntry = (e) => ({
  tag: e['.tag'],
  name: e.name,
  path: e.path_display || e.path_lower,
  id: e.id || null,
  size: e.size ?? null,
  modified: e.server_modified || null,
  rev: e.rev || null,
});

export async function listFolder(path = DBX_ROOT, { recursive = false, limit = 2000 } = {}) {
  assertInRoot(path);
  const entries = [];
  let res = await rpc('/files/list_folder', {
    path: path === '/' ? '' : path,
    recursive,
    include_media_info: false,
    include_deleted: false,
    limit: Math.min(limit, 2000),
  });
  entries.push(...res.entries);
  while (res.has_more && entries.length < limit) {
    res = await rpc('/files/list_folder/continue', { cursor: res.cursor });
    entries.push(...res.entries);
  }
  return entries.slice(0, limit).map(normalizeEntry);
}

export async function download(path) {
  assertInRoot(path);
  return contentDownload('/files/download', { path });
}

export async function downloadText(path) {
  const { blob, meta } = await download(path);
  return { text: await blob.text(), rev: meta.rev, meta };
}

/**
 * Upload with optimistic concurrency.
 *
 * Passing `rev` makes Dropbox reject the write if the file changed since we read
 * it. That is what stops two devices from silently clobbering each other's
 * ledger — without it, last-writer-wins quietly destroys transactions.
 */
export async function upload(path, body, { rev = null, mode = 'overwrite', autorename = false } = {}) {
  assertInRoot(path);
  const size = body instanceof Blob ? body.size : new Blob([body]).size;
  if (size > MAX_UPLOAD_BYTES) {
    throw new DropboxError(`File is ${(size / 1048576).toFixed(1)} MB, over the ${MAX_UPLOAD_BYTES / 1048576} MB limit.`);
  }
  const args = {
    path,
    mode: rev ? { '.tag': 'update', update: rev } : mode,
    autorename,
    mute: true,
    strict_conflict: Boolean(rev),
  };
  return contentUpload('/files/upload', args, body);
}

export async function getMetadata(path) {
  assertInRoot(path);
  try {
    return normalizeEntry(await rpc('/files/get_metadata', { path }));
  } catch (err) {
    if (/not_found/i.test(err.message)) return null;
    throw err;
  }
}

export async function move(fromPath, toPath, { autorename = true } = {}) {
  assertInRoot(fromPath); assertInRoot(toPath);
  const res = await rpc('/files/move_v2', { from_path: fromPath, to_path: toPath, autorename });
  return normalizeEntry(res.metadata);
}

export async function createFolder(path) {
  assertInRoot(path);
  try {
    const res = await rpc('/files/create_folder_v2', { path, autorename: false });
    return normalizeEntry(res.metadata);
  } catch (err) {
    if (/conflict/i.test(err.message)) return getMetadata(path);
    throw err;
  }
}

export async function deletePath(path) {
  assertInRoot(path);
  const res = await rpc('/files/delete_v2', { path });
  return normalizeEntry(res.metadata);
}

export async function search(query, { path = DBX_ROOT, limit = 50 } = {}) {
  assertInRoot(path);
  const res = await rpc('/files/search_v2', {
    query,
    options: { path, max_results: Math.min(limit, 100), file_status: 'active' },
  });
  return (res.matches || []).map((m) => normalizeEntry(m.metadata.metadata));
}

/** A temporary direct link, used for img-src previews. Expires in about 4 hours. */
export async function temporaryLink(path) {
  assertInRoot(path);
  const res = await rpc('/files/get_temporary_link', { path });
  return res.link;
}

export const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif)$/i;
export const isImagePath = (p) => IMAGE_EXT.test(String(p || ''));
