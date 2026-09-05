import {defineConfig} from 'vitest/config';
import * as path from 'path';
import {EXCEPTIONS} from './__tests__/vendored-exceptions.js';

// Escape regex metacharacters in a literal test title before it goes into a
// pattern. Test titles from the vendored suite contain characters like
// `(`, `[`, `.` and `{{ }}` that would otherwise change what the pattern
// matches (or break it outright).
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// EXCEPTIONS lists vendored-suite test titles that cannot pass in a fork
// making no GitHub API calls (see __tests__/vendored-exceptions.ts). Rather
// than hand-editing the vendored __tests__/meta.test.ts to skip them — which
// is what previously kept that file out of the byte-for-byte `vendored` set
// — the exclusion is applied here, in a file that is never overwritten by a
// sync. When EXCEPTIONS is empty (the common case) this is left undefined so
// nothing is filtered.
const testNamePattern = EXCEPTIONS.length > 0 ? new RegExp(`^(?!.*(?:${EXCEPTIONS.map(escapeRegExp).join('|')})).*$`) : undefined;

export default defineConfig({
  resolve: {
    alias: {
      '@docker/actions-toolkit/lib/context.js': path.resolve(__dirname, 'src/shims/toolkit-context.ts'),
      '@docker/actions-toolkit/lib/types/github/github.js': path.resolve(__dirname, 'src/shims/github-types.ts'),
      '@docker/actions-toolkit/lib/github/github.js': path.resolve(__dirname, 'src/shims/github.ts'),
      '@docker/actions-toolkit/lib/toolkit.js': path.resolve(__dirname, 'src/shims/toolkit.ts')
    }
  },
  test: {
    clearMocks: true,
    environment: 'node',
    setupFiles: ['./__tests__/setup.unit.ts'],
    include: ['**/*.test.ts'],
    testNamePattern,
    coverage: {
      provider: 'v8',
      reporter: ['clover'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/main.ts']
    }
  }
});
