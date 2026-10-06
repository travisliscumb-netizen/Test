import { describe, expect, it } from 'vitest';

import { FixedTimestep, type FixedTimestepOptions } from '../../src/core/fixedTimestep';

const OPTIONS: FixedTimestepOptions = {
  stepSeconds: 1 / 60,
  maxStepsPerFrame: 8,
  maxFrameSeconds: 0.25,
};

function ticksFor(frameSeconds: number, frames: number, options = OPTIONS): number {
  const timestep = new FixedTimestep(options);
  let ticks = 0;
  for (let i = 0; i < frames; i += 1) {
    ticks += timestep.advance(frameSeconds).steps;
  }
  return ticks;
}

describe('FixedTimestep', () => {
  it.each([
    ['30 Hz', 30],
    ['60 Hz', 60],
    ['120 Hz', 120],
    ['144 Hz', 144],
    ['240 Hz', 240],
  ])('runs 60 ticks for one second of frames at %s', (_label, hz) => {
    expect(ticksFor(1 / hz, hz)).toBe(60);
  });

  it('does not lose a tick to floating-point drift over a long session', () => {
    // Ten minutes at 144 Hz.
    expect(ticksFor(1 / 144, 144 * 600)).toBe(60 * 600);
  });

  it('gives the same tick count for jittery frames as for steady frames of equal total time', () => {
    const timestep = new FixedTimestep(OPTIONS);
    const pattern = [0.004, 0.021, 0.013, 0.009, 0.033, 0.0029, 0.0171];
    const total = pattern.reduce((a, b) => a + b, 0);
    const repeats = 200;
    let ticks = 0;
    for (let r = 0; r < repeats; r += 1) {
      for (const frame of pattern) {
        ticks += timestep.advance(frame).steps;
      }
    }
    expect(ticks).toBe(Math.floor((total * repeats) / OPTIONS.stepSeconds + 1e-6));
  });

  it('reports alpha as the fraction of a tick left over', () => {
    const timestep = new FixedTimestep(OPTIONS);
    const result = timestep.advance(OPTIONS.stepSeconds * 2.25);
    expect(result.steps).toBe(2);
    expect(result.alpha).toBeCloseTo(0.25, 9);
  });

  it('keeps alpha within [0, 1)', () => {
    const timestep = new FixedTimestep(OPTIONS);
    for (let i = 0; i < 1000; i += 1) {
      const { alpha } = timestep.advance(((i * 7919) % 50) / 1000);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('clamps a long frame and reports the discarded time', () => {
    const timestep = new FixedTimestep(OPTIONS);
    const result = timestep.advance(2);
    expect(result.steps).toBe(OPTIONS.maxStepsPerFrame);
    // 2 s in, 8 ticks (0.1333 s) simulated, the 0.25 s clamp keeps a partial tick for alpha.
    const simulated = result.steps * OPTIONS.stepSeconds;
    const keptPartial = result.alpha * OPTIONS.stepSeconds;
    expect(result.droppedSeconds + simulated + keptPartial).toBeCloseTo(2, 9);
  });

  it('never runs more than maxStepsPerFrame ticks in one frame', () => {
    const timestep = new FixedTimestep({ ...OPTIONS, maxFrameSeconds: 10 });
    expect(timestep.advance(10).steps).toBe(OPTIONS.maxStepsPerFrame);
    // The backlog was discarded, not deferred: the next short frame runs normally.
    expect(timestep.advance(OPTIONS.stepSeconds).steps).toBe(1);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'treats an invalid frame time (%s) as zero',
    (frame) => {
      const timestep = new FixedTimestep(OPTIONS);
      expect(timestep.advance(frame)).toEqual({ steps: 0, alpha: 0, droppedSeconds: 0 });
    },
  );

  it('discards the partial tick on reset', () => {
    const timestep = new FixedTimestep(OPTIONS);
    timestep.advance(OPTIONS.stepSeconds * 0.9);
    timestep.reset();
    expect(timestep.advance(OPTIONS.stepSeconds * 0.5).steps).toBe(0);
  });

  it.each<[string, Partial<FixedTimestepOptions>]>([
    ['zero step', { stepSeconds: 0 }],
    ['negative step', { stepSeconds: -1 }],
    ['NaN step', { stepSeconds: Number.NaN }],
    ['zero max steps', { maxStepsPerFrame: 0 }],
    ['fractional max steps', { maxStepsPerFrame: 1.5 }],
    ['max frame below step', { maxFrameSeconds: 0.001 }],
  ])('rejects invalid options: %s', (_label, override) => {
    expect(() => new FixedTimestep({ ...OPTIONS, ...override })).toThrow(RangeError);
  });
});
