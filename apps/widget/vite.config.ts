import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Derive workspace deps from package.json so optimizeDeps.exclude
// auto-updates when new workspace packages are added.
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as {
  dependencies?: Record<string, string>;
};
const workspaceDeps = Object.entries(pkg.dependencies ?? {})
  .filter(([, version]) => typeof version === 'string' && version.startsWith('workspace:'))
  .map(([name]) => name);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    exclude: workspaceDeps,
  },
  build: {
    // Build as a single JS file for embedding
    rollupOptions: {
      output: {
        entryFileNames: 'typhoon-widget.js',
        assetFileNames: 'typhoon-widget.[ext]',
      },
    },
  },
  server: {
    port: 5175,
    hmr: process.env.HMR_CLIENT_PORT ? { clientPort: Number(process.env.HMR_CLIENT_PORT) } : undefined,
    // Polling watcher for Docker bind mounts where native fs events don't
    // reliably fire for newly created files. Gated behind env var so host-
    // native dev keeps cheap native events.
    watch: process.env.VITE_USE_POLLING ? { usePolling: true, interval: 300 } : undefined,
  },
});
