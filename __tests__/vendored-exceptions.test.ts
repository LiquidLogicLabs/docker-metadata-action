import {describe, expect, test} from 'vitest';
import {EXCEPTIONS, EXPECTED_EXCEPTION_COUNT} from './vendored-exceptions.js';

describe('vendored suite exception list', () => {
  test('has not silently grown', () => {
    expect(EXCEPTIONS.length).toBe(EXPECTED_EXCEPTION_COUNT);
  });

  test('contains no wildcards', () => {
    for (const name of EXCEPTIONS) {
      expect(name).not.toContain('*');
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });

  test('is small enough to review by eye', () => {
    expect(EXCEPTIONS.length).toBeLessThanOrEqual(40);
  });
});
