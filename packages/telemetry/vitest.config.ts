import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@typhoon/telemetry',
    include: ['src/**/*.test.ts'],
  },
});
