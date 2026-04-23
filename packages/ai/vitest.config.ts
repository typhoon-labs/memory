import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@typhoon/ai',
    include: ['src/**/*.test.ts'],
  },
});
