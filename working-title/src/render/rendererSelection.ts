export type RendererKind = 'webgpu' | 'webgl2';
export type RendererPreference = 'auto' | RendererKind;

const PREFERENCES: readonly RendererPreference[] = ['auto', 'webgpu', 'webgl2'];

/**
 * Reads the `renderer` query parameter (`?renderer=webgl2`). Unknown or missing values
 * fall back to `auto`, which tries WebGPU first and falls back to WebGL2.
 */
export function parseRendererPreference(search: string): RendererPreference {
  const value = new URLSearchParams(search).get('renderer')?.toLowerCase();
  return PREFERENCES.find((p) => p === value) ?? 'auto';
}

/** Renderers to attempt, in order, for a preference. WebGL2 is always the last resort. */
export function rendererAttemptOrder(
  preference: RendererPreference,
  webgpuSupported: boolean,
): RendererKind[] {
  if (preference === 'webgl2' || !webgpuSupported) {
    return ['webgl2'];
  }
  return ['webgpu', 'webgl2'];
}
