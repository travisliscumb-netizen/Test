import { describe, expect, it } from 'vitest';

import { parseRendererPreference, rendererAttemptOrder } from '../../src/render/rendererSelection';

describe('parseRendererPreference', () => {
  it.each([
    ['', 'auto'],
    ['?renderer=webgl2', 'webgl2'],
    ['?renderer=WebGPU', 'webgpu'],
    ['?renderer=auto', 'auto'],
    ['?renderer=webgl', 'auto'],
    ['?renderer=', 'auto'],
    ['?foo=1&renderer=webgl2', 'webgl2'],
  ])('parses %j as %s', (search, expected) => {
    expect(parseRendererPreference(search)).toBe(expected);
  });
});

describe('rendererAttemptOrder', () => {
  it('tries WebGPU then WebGL2 when WebGPU is supported', () => {
    expect(rendererAttemptOrder('auto', true)).toEqual(['webgpu', 'webgl2']);
    expect(rendererAttemptOrder('webgpu', true)).toEqual(['webgpu', 'webgl2']);
  });

  it('uses only WebGL2 when WebGPU is unsupported', () => {
    expect(rendererAttemptOrder('auto', false)).toEqual(['webgl2']);
    expect(rendererAttemptOrder('webgpu', false)).toEqual(['webgl2']);
  });

  it('honours an explicit WebGL2 preference even when WebGPU is supported', () => {
    expect(rendererAttemptOrder('webgl2', true)).toEqual(['webgl2']);
  });
});
