import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, mergeConfig, type UserConfig } from 'vite';

/**
 * Reads workspace dependencies from the calling app's package.json.
 * These are excluded from Vite's dependency pre-bundling so HMR works
 * across workspace packages without container restarts.
 */
function getWorkspaceDeps(appDir: string): string[] {
  const pkg = JSON.parse(readFileSync(resolve(appDir, 'package.json'), 'utf-8')) as {
    dependencies?: Record<string, string>;
  };
  return Object.entries(pkg.dependencies ?? {})
    .filter(([, version]) => typeof version === 'string' && version.startsWith('workspace:'))
    .map(([name]) => name);
}

/**
 * Create a Vite config with shared Typhoon defaults (React, Tailwind, workspace
 * dep exclusion, Docker HMR/polling). Apps pass only what differs.
 */
export function createViteConfig(appDir: string, overrides: UserConfig = {}): UserConfig {
  const workspaceDeps = getWorkspaceDeps(appDir);

  const base = defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': resolve(appDir, './src') },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      exclude: workspaceDeps,
    },
    server: {
      hmr: process.env.HMR_CLIENT_PORT ? { clientPort: Number(process.env.HMR_CLIENT_PORT) } : undefined,
      watch: process.env.VITE_USE_POLLING ? { usePolling: true, interval: 300 } : undefined,
    },
  });

  return mergeConfig(base, overrides);
}
