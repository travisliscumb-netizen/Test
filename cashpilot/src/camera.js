// Cashpilot — camera capture and file intake.
//
// Two paths, because one is not enough in practice:
//
//  1. getUserMedia live preview with a shutter button. Best on desktop and it
//     lets the user reframe a long receipt before committing.
//  2. A file input with capture="environment". This is the reliable path on
//     iOS — it hands off to the native camera UI, which handles focus, torch and
//     HEIC conversion far better than a canvas grab, and it still works when
//     getUserMedia is blocked by permissions or a non-secure context.
//
// openCamera() tries (1) and transparently falls back to (2).

const SECURE = () => globalThis.isSecureContext || location.hostname === 'localhost';

export function cameraSupported() {
  return SECURE() && Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * Show a file picker and resolve with the chosen files.
 * @returns {Promise<File[]>} empty when the user cancels.
 */
export function pickFiles({ accept = 'image/*,application/pdf', multiple = true, capture = null } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    if (capture) input.capture = capture;
    input.style.position = 'fixed';
    input.style.left = '-9999px';

    let settled = false;
    const finish = (files) => {
      if (settled) return;
      settled = true;
      input.remove();
      window.removeEventListener('focus', onFocus);
      resolve(files);
    };

    input.addEventListener('change', () => finish([...(input.files || [])]));
    // A cancelled picker fires no event on most browsers; window focus returning
    // with no selection is the only reliable signal, so the promise can settle.
    const onFocus = () => setTimeout(() => {
      if (!settled && (!input.files || input.files.length === 0)) finish([]);
    }, 500);

    document.body.appendChild(input);
    window.addEventListener('focus', onFocus, { once: true });
    input.click();
  });
}

/** Native camera hand-off. Resolves with a single photo, or null if cancelled. */
export async function takePhotoNative() {
  const files = await pickFiles({ accept: 'image/*', multiple: false, capture: 'environment' });
  return files[0] || null;
}

/**
 * Live camera session.
 *
 * @returns {Promise<{video: HTMLVideoElement, capture: () => Promise<Blob>, stop: () => void, switchCamera: () => Promise<void>}>}
 */
export async function openCamera({ facingMode = 'environment' } = {}) {
  if (!SECURE()) {
    throw new Error('The camera needs a secure connection (https). Open Cashpilot over https and try again.');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not expose a camera to web apps.');
  }

  let current = facingMode;
  let stream = await requestStream(current);

  const video = document.createElement('video');
  video.playsInline = true;      // iOS refuses to inline-play without this
  video.muted = true;
  video.autoplay = true;
  video.srcObject = stream;
  await video.play().catch(() => { /* some browsers resolve play() late */ });

  const capture = async () => {
    if (!video.videoWidth) throw new Error('The camera is not ready yet.');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not capture the frame.'))),
        'image/jpeg',
        0.92,
      );
    });
  };

  const stop = () => {
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };

  const switchCamera = async () => {
    const next = current === 'environment' ? 'user' : 'environment';
    const newStream = await requestStream(next);
    for (const track of stream.getTracks()) track.stop();
    stream = newStream;
    current = next;
    video.srcObject = stream;
    await video.play().catch(() => {});
  };

  return { video, capture, stop, switchCamera, get facing() { return current; } };
}

async function requestStream(facingMode) {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
  } catch (err) {
    throw new Error(describeCameraError(err));
  }
}

function describeCameraError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access was denied. Allow camera permission for this site in your browser settings, then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No usable camera was found on this device.';
    case 'NotReadableError':
      return 'The camera is already in use by another app.';
    default:
      return `The camera could not be opened: ${err?.message || err}`;
  }
}

/** Human-readable size for upload confirmations. */
export function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
