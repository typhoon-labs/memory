import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/db/src/**/*.integration.test.ts', 'packages/services/src/**/*.integration.test.ts'],
    testTimeout: 30_000,
    // All tests share the same database — must run sequentially to avoid TRUNCATE conflicts
    fileParallelism: false,
  },
});
