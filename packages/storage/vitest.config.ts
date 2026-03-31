import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@typhoon/storage',
    include: ['src/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
  },
});
