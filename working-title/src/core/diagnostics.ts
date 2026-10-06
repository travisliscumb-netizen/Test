import type { RendererKind } from '../render/rendererSelection';

export type BootState = 'booting' | 'running' | 'error';

/** Read-only runtime facts exposed for automated browser tests and field debugging. */
export interface DiagnosticsSnapshot {
  readonly state: BootState;
  readonly renderer: RendererKind | null;
  readonly frames: number;
  readonly ticks: number;
  readonly droppedSeconds: number;
  readonly probeHeight: number | null;
}

declare global {
  interface Window {
    /** Diagnostics accessor. Exposes snapshots only; nothing on it mutates game state. */
    readonly __workingTitle?: { readonly snapshot: () => DiagnosticsSnapshot };
  }
}

/** Publishes `source` on `window.__workingTitle` and mirrors boot state onto `<html data-state>`. */
export function exposeDiagnostics(source: () => DiagnosticsSnapshot): void {
  Object.defineProperty(window, '__workingTitle', {
    value: Object.freeze({ snapshot: () => Object.freeze({ ...source() }) }),
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

export function setBootState(state: BootState): void {
  document.documentElement.dataset['state'] = state;
}
