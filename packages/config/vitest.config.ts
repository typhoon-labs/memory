import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@typhoon/config',
    include: ['src/**/*.test.ts'],
  },
});
