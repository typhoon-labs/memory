import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@typhoon/api-client',
    include: ['src/**/*.test.ts'],
  },
});
