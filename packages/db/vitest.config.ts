import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@typhoon/db',
    include: ['src/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
  },
});
