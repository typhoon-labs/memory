import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/db/src/drivers/pg/*.integration.test.ts'],
    testTimeout: 30_000,
  },
});
