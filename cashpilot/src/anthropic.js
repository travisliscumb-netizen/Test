// Cashpilot — Claude Messages API client, called directly from the browser.
//
// WHY RAW FETCH AND NOT THE SDK: this app is a zero-build static PWA. Pulling in
// @anthropic-ai/sdk would mean adding a bundler to the project or loading a CDN
// script at runtime, which costs offline capability and widens the CSP. The
// Messages API is a single JSON endpoint; hand-rolling it is the smaller cost.
//
// WHY THE KEY IS IN THE BROWSER: browser access is a documented, deliberately
// gated mode (the SDK calls it `dangerouslyAllowBrowser`). It is appropriate
// here for the reason Anthropic's own docs give — a single-user internal tool
// with a trusted operator. See README "Security model" for the full tradeoff and
// how to revoke.

import {
  ANTHROPIC_API_BASE, ANTHROPIC_VERSION, MODEL_AGENT, FALLBACK_BETA, LS,
  VISION_MAX_EDGE, VISION_JPEG_QUALITY,
} from './config.js';

export class AnthropicError extends Error {
  constructor(message, { status = 0, type = '', requestId = '', retryable = false } = {}) {
    super(message);
    this.name = 'AnthropicError';
    this.status = status;
    this.type = type;
    this.requestId = requestId;
    this.retryable = retryable;
  }
}

// --- key storage -------------------------------------------------------------

export function getApiKey() {
  try { return localStorage.getItem(LS.anthropicKey) || ''; } catch { return ''; }
}

export function setApiKey(key) {
  try {
    const trimmed = String(key || '').trim();
    if (trimmed) localStorage.setItem(LS.anthropicKey, trimmed);
    else localStorage.removeItem(LS.anthropicKey);
  } catch { /* private mode */ }
}

export const hasApiKey = () => Boolean(getApiKey());

/** Cheap shape check so an obviously-wrong paste fails before a network call. */
export function looksLikeApiKey(key) {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(String(key || '').trim());
}

// --- request -----------------------------------------------------------------

function buildHeaders(apiKey, betas) {
  const headers = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    // Required for direct browser calls; without it the request fails CORS
    // preflight rather than returning a useful error.
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (betas && betas.length) headers['anthropic-beta'] = betas.join(',');
  return headers;
}

function classify(status, payload) {
  const type = payload?.error?.type || '';
  const message = payload?.error?.message || '';
  const requestId = payload?.request_id || '';
  const retryable = status === 408 || status === 409 || status === 429 || status >= 500;

  let friendly;
  switch (status) {
    case 401:
      friendly = 'Claude rejected the API key. Check it in Settings — it should start with "sk-ant-".';
      break;
    case 402:
      friendly = 'The Anthropic account has a billing problem. Add credit at console.anthropic.com.';
      break;
    case 403:
      friendly = 'This API key does not have permission for that request.';
      break;
    case 413:
      friendly = 'That request was too large. Try fewer or smaller images.';
      break;
    case 429:
      friendly = 'Rate limited by the Claude API. Wait a moment and try again.';
      break;
    case 529:
      friendly = 'The Claude API is temporarily overloaded. Try again shortly.';
      break;
    default:
      friendly = status >= 500
        ? `The Claude API had a server error (${status}). Try again.`
        : message || `Claude API error ${status}`;
  }
  if (message && status !== 401 && status < 500) friendly = `${friendly}${message && !friendly.includes(message) ? ` (${message})` : ''}`;
  return new AnthropicError(friendly, { status, type, requestId, retryable });
}

/**
 * POST /v1/messages.
 *
 * Opts into server-side refusal fallbacks by default. If the endpoint rejects
 * that beta the call is retried once without it, so opting in can never be the
 * reason a request hard-fails.
 */
export async function createMessage(body, { signal, apiKey = getApiKey(), useFallbacks = true } = {}) {
  if (!apiKey) {
    throw new AnthropicError('No Claude API key is set. Add one in Settings to use the AI assistant.', { status: 401 });
  }

  const attempt = async (withFallbacks) => {
    const payload = { model: MODEL_AGENT, ...body };
    // Opus 5 runs adaptive thinking when `thinking` is omitted, which is what we
    // want; `budget_tokens` is rejected on this model and must never be sent.
    if (withFallbacks) payload.fallbacks = 'default';

    const res = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
      method: 'POST',
      headers: buildHeaders(apiKey, withFallbacks ? [FALLBACK_BETA] : []),
      body: JSON.stringify(payload),
      signal,
    });

    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = { error: { message: text } }; }

    if (!res.ok) {
      const err = classify(res.status, json);
      err.requestId = err.requestId || res.headers.get('request-id') || '';
      throw err;
    }
    return json;
  };

  if (!useFallbacks) return attempt(false);

  try {
    return await attempt(true);
  } catch (err) {
    // A 400 naming the beta or the parameter means this endpoint does not
    // support it; drop it and go again rather than failing the user's request.
    const isBetaRejection = err instanceof AnthropicError && err.status === 400
      && /fallback|beta/i.test(err.message);
    if (!isBetaRejection) throw err;
    return attempt(false);
  }
}

/** Network-level retry with backoff for the transient statuses only. */
export async function createMessageWithRetry(body, { signal, apiKey, maxRetries = 2 } = {}) {
  let lastErr;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await createMessage(body, { signal, apiKey });
    } catch (err) {
      lastErr = err;
      const transient = (err instanceof AnthropicError && err.retryable)
        || err.name === 'TypeError'; // fetch network failure
      if (!transient || i === maxRetries || signal?.aborted) break;
      await new Promise((r) => setTimeout(r, 600 * 2 ** i));
    }
  }
  throw lastErr;
}

// --- response helpers --------------------------------------------------------

export const textOf = (message) => (message?.content || [])
  .filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();

export const toolUsesOf = (message) => (message?.content || []).filter((b) => b.type === 'tool_use');

/**
 * A refusal arrives as HTTP 200 with stop_reason "refusal" — reading `content`
 * without checking this yields a confusing empty reply.
 */
export function refusalOf(message) {
  if (message?.stop_reason !== 'refusal') return null;
  const details = message.stop_details || {};
  return details.explanation || `Claude declined this request${details.category ? ` (${details.category})` : ''}.`;
}

// --- images ------------------------------------------------------------------

/**
 * Downscale and re-encode a photo before sending it.
 *
 * A modern phone photo is 12 MP. The API downscales anything over 2576px on the
 * long edge anyway, so shipping the original just burns upload time and can trip
 * the 10 MB base64 ceiling. HEIC is also decoded here via the browser, since the
 * API accepts only JPEG/PNG/GIF/WebP.
 *
 * @returns {Promise<{data: string, media_type: string, width: number, height: number, bytes: number}>}
 */
export async function imageBlockSource(blob, { maxEdge = VISION_MAX_EDGE, quality = VISION_JPEG_QUALITY } = {}) {
  const bitmap = await decodeImage(blob);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  if (typeof bitmap.close === 'function') bitmap.close();

  const outBlob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image.'))), 'image/jpeg', quality);
  });

  return {
    data: await blobToBase64(outBlob),
    media_type: 'image/jpeg',
    width,
    height,
    bytes: outBlob.size,
  };
}

async function decodeImage(blob) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob); } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That file could not be read as an image. HEIC photos may need to be exported as JPEG first.'));
      img.src = url;
    });
  } finally {
    // Revoked on the next frame so the decode has definitely consumed it.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(blob);
  });
}

/** Build the content block the Messages API expects for an image. */
export const imageBlock = (source) => ({
  type: 'image',
  source: { type: 'base64', media_type: source.media_type, data: source.data },
});
