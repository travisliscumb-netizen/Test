import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { Scene } from '@babylonjs/core/scene';

export interface BootScene {
  /** Height of the falling probe crate; proves the fixed-step physics loop is running. */
  probeHeight(): number;
}

const CRATE_COLORS: readonly Color3[] = [
  new Color3(0.85, 0.35, 0.2),
  new Color3(0.25, 0.6, 0.85),
  new Color3(0.9, 0.75, 0.25),
];

function material(scene: Scene, name: string, color: Color3): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = color;
  mat.specularColor = new Color3(0.15, 0.15, 0.15);
  return mat;
}

/**
 * Milestone 0 scaffold scene: a lit floor and physics crates. It exists to prove the
 * renderer, Havok and the fixed-step loop end to end, and is replaced by the M1 room.
 * Physics must already be enabled on `scene`.
 */
export function createBootScene(scene: Scene): BootScene {
  scene.clearColor = new Color4(0.04, 0.045, 0.06, 1);

  const camera = new FreeCamera('camera', new Vector3(0, 4, -11), scene);
  camera.setTarget(new Vector3(0, 1.5, 0));
  camera.minZ = 0.05;

  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.35;
  ambient.groundColor = new Color3(0.08, 0.08, 0.12);

  const sun = new DirectionalLight('sun', new Vector3(-0.4, -1, 0.6), scene);
  sun.intensity = 0.9;

  const ground = CreateGround('ground', { width: 20, height: 20 }, scene);
  ground.material = material(scene, 'groundMat', new Color3(0.3, 0.32, 0.35));
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);

  const crates: Mesh[] = CRATE_COLORS.map((color, i) => {
    const crate = CreateBox(`crate${String(i)}`, { size: 1 }, scene);
    crate.position.set((i - 1) * 0.35, 3 + i * 2.5, (i - 1) * 0.2);
    crate.rotation.set(0.3 * i, 0.5 * i, 0.15);
    crate.material = material(scene, `crateMat${String(i)}`, color);
    new PhysicsAggregate(crate, PhysicsShapeType.BOX, { mass: 1, restitution: 0.2 }, scene);
    return crate;
  });

  // The highest crate falls furthest, so it is the clearest evidence physics is stepping.
  const probe = crates.at(-1);
  if (probe === undefined) {
    throw new Error('Boot scene has no probe crate.');
  }

  return {
    probeHeight: () => probe.position.y,
  };
}
