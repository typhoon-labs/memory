import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The UI reads its settings from /config.json at run time. In the image the
// server serves that file; when the UI runs on its own port (18194) it is
// proxied to the server, so one build works anywhere.
const server = process.env.CHAT_ASSISTANT_URL ?? 'http://localhost:18193';
const proxy = { '/config.json': { target: server, changeOrigin: true } };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: { port: 18194, strictPort: true, host: '127.0.0.1', proxy },
  preview: { port: 18194, strictPort: true, host: '127.0.0.1', proxy },
  build: { outDir: 'dist', sourcemap: true },
});
