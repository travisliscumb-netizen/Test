import HavokPhysics from '@babylonjs/havok';
import havokWasmUrl from '@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { PhysicsEngine } from '@babylonjs/core/Physics/v2/physicsEngine';
import type { Scene } from '@babylonjs/core/scene';
// Side effects: Scene.enablePhysics / getPhysicsEngine and the physics observables (joined),
// TransformNode.physicsBody (v2). Without them Babylon 9 installs silent stubs.
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';
import '@babylonjs/core/Physics/v2/physicsEngineComponent';

export interface PhysicsWorld {
  /** Advance the physics world by exactly `stepSeconds`. Call only from the fixed tick. */
  step(stepSeconds: number): void;
}

const BASE64_DATA_URL = /^data:[^;,]*;base64,/;

/**
 * In the single-file build the wasm is inlined as a data: URL. It is decoded here and handed
 * over as bytes, so loading physics makes no network request at all (strict CSPs block
 * fetches, including of data: URLs). Normal builds let Havok fetch the emitted file.
 */
function havokModuleOptions(
  wasmUrl: string,
): { wasmBinary: ArrayBuffer } | { locateFile: () => string } {
  if (!wasmUrl.startsWith('data:')) {
    return { locateFile: () => wasmUrl };
  }
  const prefix = BASE64_DATA_URL.exec(wasmUrl);
  if (prefix === null) {
    throw new Error('Inlined Havok wasm is not a base64 data URL.');
  }
  const binary = atob(wasmUrl.slice(prefix[0].length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { wasmBinary: bytes.buffer };
}

/**
 * Loads Havok and attaches it to `scene` with automatic stepping disabled.
 *
 * Babylon normally steps physics once per `scene.render()`, which ties simulation speed
 * to frame rate. Here the scene never steps physics itself; the game loop calls `step`
 * once per fixed tick instead. Babylon's before/after physics observables still fire.
 */
export async function createPhysicsWorld(scene: Scene, gravityY: number): Promise<PhysicsWorld> {
  const havok = await HavokPhysics(havokModuleOptions(havokWasmUrl));
  // useDeltaForWorldStep: Havok integrates the delta we pass rather than its own constant.
  const plugin = new HavokPlugin(true, havok);
  if (!scene.enablePhysics(new Vector3(0, gravityY, 0), plugin)) {
    throw new Error('Failed to enable Havok physics on the scene.');
  }
  scene.physicsEnabled = false;

  const engine = scene.getPhysicsEngine();
  if (!(engine instanceof PhysicsEngine)) {
    throw new Error('Expected a v2 physics engine after enablePhysics.');
  }

  return {
    step(stepSeconds: number): void {
      scene.onBeforePhysicsObservable.notifyObservers(scene);
      plugin.executeStep(stepSeconds, engine.getBodies());
      scene.onAfterPhysicsObservable.notifyObservers(scene);
    },
  };
}
