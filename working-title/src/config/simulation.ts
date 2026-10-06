import type { FixedTimestepOptions } from '../core/fixedTimestep';

/** Simulation clock. Gameplay and physics tick at this rate regardless of display refresh. */
export const SIMULATION_TIMESTEP: FixedTimestepOptions = {
  stepSeconds: 1 / 60,
  maxStepsPerFrame: 8,
  maxFrameSeconds: 0.25,
};

/** World units are metres. */
export const GRAVITY_Y = -9.81;
