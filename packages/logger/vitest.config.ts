import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@typhoon/logger',
    include: ['src/**/*.test.ts'],
  },
});
