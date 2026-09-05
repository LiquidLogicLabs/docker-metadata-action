import {describe, expect, test} from 'vitest';
import {ProbeContext} from '@docker/actions-toolkit/lib/context.js';

describe('seam probe', () => {
  test('the aliased specifier resolves to our shim', () => {
    process.env.RUNNER_TEMP = '/probe-tmp';
    expect(ProbeContext.tmpDir()).toBe('/probe-tmp');
  });
});
