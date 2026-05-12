import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@typhoon/evals',
    include: ['src/**/*.test.ts'],
  },
});
