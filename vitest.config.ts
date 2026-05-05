import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup/logger-mock.ts'],
    coverage: {
      thresholds: {
        lines: 85,
        branches: 75,
        functions: 80,
      },
      exclude: [
        // Driver storage implementations — tested via integration tests (require DATABASE_URL)
        'packages/db/src/drivers/**',
        // Declarative Drizzle schemas and thin query wrappers — no complex runtime logic
        'packages/db/src/schema/**',
        'packages/db/src/queries/**',
        'packages/db/src/client.ts',
        'packages/db/src/connection.ts',
        // Test infrastructure — not application code
        'tests/**',
        // shadcn/ui primitives — vendor-like thin Radix wrappers
        'packages/ui/src/components/ui/**',
      ],
    },
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
      'packages/queue/vitest.config.ts',
      'packages/ingestion/vitest.config.ts',
      'packages/chat/vitest.config.ts',
      'packages/ai/vitest.config.ts',
      'packages/logger/vitest.config.ts',
      'packages/telemetry/vitest.config.ts',
      'packages/ui/vitest.config.ts',
      'apps/api/vitest.config.ts',
      'apps/desk/vitest.config.ts',
      'apps/worker/vitest.config.ts',
      'apps/scheduler/vitest.config.ts',
    ],
  },
});
