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

/**
 * Loads Havok and attaches it to `scene` with automatic stepping disabled.
 *
 * Babylon normally steps physics once per `scene.render()`, which ties simulation speed
 * to frame rate. Here the scene never steps physics itself; the game loop calls `step`
 * once per fixed tick instead. Babylon's before/after physics observables still fire.
 */
export async function createPhysicsWorld(scene: Scene, gravityY: number): Promise<PhysicsWorld> {
  const havok = await HavokPhysics({ locateFile: () => havokWasmUrl });
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
