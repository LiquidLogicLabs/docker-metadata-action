import {defineConfig} from 'vitest/config';
import * as path from 'path';

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
    coverage: {
      provider: 'v8',
      reporter: ['clover'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/main.ts']
    }
  }
});
