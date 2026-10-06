import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';

import {
  rendererAttemptOrder,
  type RendererKind,
  type RendererPreference,
} from './rendererSelection';

export interface CreatedEngine {
  readonly engine: AbstractEngine;
  readonly kind: RendererKind;
  /**
   * The canvas the engine renders to. May differ from the canvas passed in: a canvas that
   * has handed out a WebGPU context can never return a WebGL2 one, so a WebGPU failure
   * replaces it with a fresh element.
   */
  readonly canvas: HTMLCanvasElement;
}

export class UnsupportedRendererError extends Error {
  override readonly name = 'UnsupportedRendererError';
}

/**
 * Anti-aliasing is owned by the post-processing pipeline (per quality tier), so the
 * default framebuffer is created without MSAA.
 */
const SHARED_OPTIONS = {
  antialias: false,
  stencil: true,
  adaptToDeviceRatio: true,
  powerPreference: 'high-performance',
  audioEngine: false,
} as const;

async function createWebGPU(canvas: HTMLCanvasElement): Promise<AbstractEngine> {
  const engine = new WebGPUEngine(canvas, { ...SHARED_OPTIONS });
  try {
    await engine.initAsync();
  } catch (error: unknown) {
    engine.dispose();
    throw error;
  }
  return engine;
}

function createWebGL2(canvas: HTMLCanvasElement): AbstractEngine {
  const engine = new Engine(
    canvas,
    SHARED_OPTIONS.antialias,
    { ...SHARED_OPTIONS, disableWebGL2Support: false, failIfMajorPerformanceCaveat: false },
    SHARED_OPTIONS.adaptToDeviceRatio,
  );
  if (engine.webGLVersion < 2) {
    engine.dispose();
    throw new UnsupportedRendererError('WebGL2 is not available on this device.');
  }
  return engine;
}

function freshCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const replacement = canvas.cloneNode(false) as HTMLCanvasElement;
  canvas.replaceWith(replacement);
  return replacement;
}

/**
 * Creates a WebGPU engine when supported and allowed by `preference`, otherwise WebGL2.
 * WebGL2 is the guaranteed baseline; WebGL1 is not supported.
 */
export async function createEngine(
  canvas: HTMLCanvasElement,
  preference: RendererPreference,
): Promise<CreatedEngine> {
  const webgpuSupported = preference !== 'webgl2' && (await WebGPUEngine.IsSupportedAsync);
  let target = canvas;
  let lastError: unknown = null;

  for (const kind of rendererAttemptOrder(preference, webgpuSupported)) {
    try {
      if (kind === 'webgpu') {
        return { engine: await createWebGPU(target), kind, canvas: target };
      }
      return { engine: createWebGL2(target), kind, canvas: target };
    } catch (error: unknown) {
      lastError = error;
      if (kind === 'webgpu') {
        console.warn(
          '[working-title] WebGPU initialisation failed; falling back to WebGL2.',
          error,
        );
        target = freshCanvas(target);
      }
    }
  }

  if (lastError instanceof UnsupportedRendererError) {
    throw lastError;
  }
  throw new UnsupportedRendererError(
    `No supported renderer could be created: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
