import { createViteConfig } from '@typhoon/config/vite';

export default createViteConfig(__dirname, {
  build: {
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
