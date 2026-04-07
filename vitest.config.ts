import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    projects: [
      {
        test: {
          name: 'root',
          include: ['tests/**/*.test.ts'],
        },
      },
      'packages/config/vitest.config.ts',
      'packages/types/vitest.config.ts',
      'packages/db/vitest.config.ts',
      'packages/storage/vitest.config.ts',
      'packages/agents/vitest.config.ts',
      'packages/ingestion/vitest.config.ts',
      'packages/pg/vitest.config.ts',
    ],
  },
});
