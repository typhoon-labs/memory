import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@typhoon/desk',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'happy-dom',
    setupFiles: ['../../tests/setup/logger-mock.ts', '../../tests/setup/dom-cleanup.ts'],
  },
});
