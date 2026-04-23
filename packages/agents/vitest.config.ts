import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@typhoon/agents',
    include: ['src/**/*.test.ts'],
    setupFiles: ['../../tests/setup/logger-mock.ts'],
  },
});
