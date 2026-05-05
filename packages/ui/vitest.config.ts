import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@typhoon/ui',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'happy-dom',
  },
});
