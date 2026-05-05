import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@typhoon/queue',
    include: ['src/**/*.test.ts'],
  },
});
