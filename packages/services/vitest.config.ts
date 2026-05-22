import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@typhoon/services',
    include: ['src/**/*.test.ts'],
    // Integration tests require a live database — run via `bun run test:integration`
    exclude: ['src/**/*.integration.test.ts'],
  },
});
