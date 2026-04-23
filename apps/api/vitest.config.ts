import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@typhoon/api',
    include: ['src/**/*.test.ts'],
    setupFiles: ['../../tests/setup/logger-mock.ts', '../../tests/setup/mastra-server-mock.ts'],
  },
});
