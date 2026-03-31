import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  },
});
