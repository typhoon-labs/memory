import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5172',
        changeOrigin: true,
        // Prevent http-proxy from timing out SSE/streaming connections
        timeout: 0,
        proxyTimeout: 0,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            // Disable buffering so SSE events flush immediately
            proxyRes.headers['cache-control'] = 'no-cache';
            proxyRes.headers['x-accel-buffering'] = 'no';
            // Prevent http-proxy from corrupting chunked encoding
            // by flushing each chunk as it arrives
            res.flushHeaders();
          });
        },
      },
    },
  },
});
