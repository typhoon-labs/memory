import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@typhoon/blob-store',
    include: ['src/**/*.test.ts'],
    setupFiles: ['../../tests/setup/logger-mock.ts'],
  },
});
