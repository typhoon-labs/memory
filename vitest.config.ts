import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    tsconfigRaw: JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        esModuleInterop: true,
        skipLibCheck: true,
        resolveJsonModule: true,
        isolatedModules: true,
      },
    }),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    projects: [
      {
        test: {
          name: 'root',
          include: ['tests/**/*.test.ts'],
        },
        esbuild: {
          tsconfigRaw: JSON.stringify({
            compilerOptions: {
              strict: true,
              target: 'ES2022',
              module: 'NodeNext',
              moduleResolution: 'NodeNext',
              esModuleInterop: true,
              skipLibCheck: true,
              resolveJsonModule: true,
              isolatedModules: true,
            },
          }),
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
