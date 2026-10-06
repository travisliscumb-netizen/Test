import './styles.css';

import { SetMissingSideEffectWarningsEnabled } from '@babylonjs/core/Misc/devTools';
import { Scene } from '@babylonjs/core/scene';

import { GRAVITY_Y, SIMULATION_TIMESTEP } from './config/simulation';
import { exposeDiagnostics, setBootState, type BootState } from './core/diagnostics';
import { FixedTimestep } from './core/fixedTimestep';
import { GameLoop } from './core/gameLoop';
import { createPhysicsWorld } from './core/physics';
import { createEngine } from './render/createEngine';
import { parseRendererPreference, type RendererKind } from './render/rendererSelection';
import { showFatalError } from './ui/fatalError';
import { createBootScene, type BootScene } from './world/bootScene';

const LOG_PREFIX = '[working-title]';

interface Runtime {
  state: BootState;
  renderer: RendererKind | null;
  loop: GameLoop | null;
  world: BootScene | null;
}

const runtime: Runtime = { state: 'booting', renderer: null, loop: null, world: null };

function setState(state: BootState): void {
  runtime.state = state;
  setBootState(state);
}

if (import.meta.env.DEV) {
  // Babylon 9 replaces augmented methods whose side-effect import is missing with silent
  // stubs (e.g. Scene.enablePhysics returning undefined). Make every such call warn.
  SetMissingSideEffectWarningsEnabled(true);
}

async function boot(): Promise<void> {
  const initialCanvas = document.getElementById('render-canvas');
  if (!(initialCanvas instanceof HTMLCanvasElement)) {
    throw new Error('Missing #render-canvas element.');
  }

  const { engine, kind, canvas } = await createEngine(
    initialCanvas,
    parseRendererPreference(window.location.search),
  );
  runtime.renderer = kind;
  console.info(`${LOG_PREFIX} Renderer: ${kind === 'webgpu' ? 'WebGPU' : 'WebGL2'}`);

  const scene = new Scene(engine);
  const physics = await createPhysicsWorld(scene, GRAVITY_Y);
  runtime.world = createBootScene(scene);

  const loop = new GameLoop(
    new FixedTimestep(SIMULATION_TIMESTEP),
    {
      fixedUpdate: (dt) => {
        physics.step(dt);
      },
      render: () => {
        scene.render();
      },
    },
    () => performance.now(),
  );
  runtime.loop = loop;

  new ResizeObserver(() => {
    engine.resize();
  }).observe(canvas);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loop.resetClock();
    }
  });

  if (import.meta.env.DEV) {
    const { installInspectorToggle } = await import('./dev/inspectorToggle');
    installInspectorToggle(scene);
  }

  await scene.whenReadyAsync();
  engine.runRenderLoop(() => {
    loop.frame();
  });
  setState('running');
}

exposeDiagnostics(() => {
  const stats = runtime.loop?.stats;
  return {
    state: runtime.state,
    renderer: runtime.renderer,
    frames: stats?.frames ?? 0,
    ticks: stats?.ticks ?? 0,
    droppedSeconds: stats?.droppedSeconds ?? 0,
    probeHeight: runtime.world?.probeHeight() ?? null,
  };
});

boot().catch((error: unknown) => {
  setState('error');
  console.error(`${LOG_PREFIX} Boot failed.`, error);
  showFatalError(error);
});
