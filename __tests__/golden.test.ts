import {describe, expect, test, beforeAll} from 'vitest';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

describe('golden output parity', () => {
  beforeAll(() => {
    execFileSync('node', ['scripts/golden.mjs'], {stdio: 'pipe'});
  });

  test('emitted tags and labels are unchanged', () => {
    const expected = JSON.parse(readFileSync('__tests__/golden/expected.json', 'utf8'));
    const actual = JSON.parse(readFileSync('__tests__/golden/actual.json', 'utf8'));
    expect(actual).toEqual(expected);
  });

  test('every scenario produced output', () => {
    const actual = JSON.parse(readFileSync('__tests__/golden/actual.json', 'utf8'));
    for (const [name, lines] of Object.entries(actual)) {
      expect((lines as string[]).length, `scenario ${name} produced no output`).toBeGreaterThan(0);
    }
  });
});
