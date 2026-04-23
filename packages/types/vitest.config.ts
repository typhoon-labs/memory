import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@typhoon/types',
    include: ['src/**/*.test.ts'],
  },
});
