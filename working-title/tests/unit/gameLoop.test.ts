import { describe, expect, it } from 'vitest';

import { FixedTimestep } from '../../src/core/fixedTimestep';
import { GameLoop } from '../../src/core/gameLoop';

const STEP = 1 / 60;

function harness() {
  let nowMs = 1000;
  const calls: string[] = [];
  const alphas: number[] = [];
  const loop = new GameLoop(
    new FixedTimestep({ stepSeconds: STEP, maxStepsPerFrame: 8, maxFrameSeconds: 0.25 }),
    {
      fixedUpdate: (dt) => {
        expect(dt).toBe(STEP);
        calls.push('tick');
      },
      render: (alpha) => {
        alphas.push(alpha);
        calls.push('render');
      },
    },
    () => nowMs,
  );
  return {
    loop,
    calls,
    alphas,
    advanceMs: (ms: number) => {
      nowMs += ms;
    },
  };
}

describe('GameLoop', () => {
  it('renders the first frame without ticking', () => {
    const { loop, calls } = harness();
    loop.frame();
    expect(calls).toEqual(['render']);
  });

  it('runs all ticks for a frame before rendering it', () => {
    const { loop, calls, advanceMs } = harness();
    loop.frame();
    calls.length = 0;
    advanceMs(STEP * 3 * 1000);
    loop.frame();
    expect(calls).toEqual(['tick', 'tick', 'tick', 'render']);
  });

  it('simulates the same number of ticks at 30 fps and 144 fps', () => {
    const run = (hz: number) => {
      const h = harness();
      for (let i = 0; i <= hz; i += 1) {
        h.loop.frame();
        h.advanceMs(1000 / hz);
      }
      return h.loop.stats.ticks;
    };
    expect(run(30)).toBe(60);
    expect(run(144)).toBe(60);
  });

  it('counts frames, ticks and dropped time', () => {
    const { loop, advanceMs } = harness();
    loop.frame();
    advanceMs(1000);
    loop.frame();
    expect(loop.stats.frames).toBe(2);
    expect(loop.stats.ticks).toBe(8);
    expect(loop.stats.droppedSeconds).toBeGreaterThan(0.85);
  });

  it('does not replay or count a pause after resetClock', () => {
    const { loop, calls, advanceMs } = harness();
    loop.frame();
    advanceMs(30_000);
    loop.resetClock();
    calls.length = 0;
    loop.frame();
    expect(calls).toEqual(['render']);
    expect(loop.stats.droppedSeconds).toBe(0);
  });
});
