import { UnsupportedRendererError } from '../render/createEngine';

/** Replaces the game view with a readable error. Used when boot cannot continue. */
export function showFatalError(error: unknown): void {
  const panel = document.getElementById('fatal');
  const message = document.getElementById('fatal-message');
  if (panel === null || message === null) {
    return;
  }
  message.textContent =
    error instanceof UnsupportedRendererError
      ? `${error.message} This game needs a browser with WebGL2 or WebGPU.`
      : 'Something went wrong while starting the game. Reload the page to try again.';
  panel.hidden = false;
}
