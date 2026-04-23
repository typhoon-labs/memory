import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@typhoon/chat',
    include: ['src/**/*.test.ts'],
  },
});
