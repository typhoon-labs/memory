import { createViteConfig } from '@typhoon/config/vite';

export default createViteConfig(__dirname, {
  server: {
    port: 5174,
    proxy: {
      '/api': process.env.API_PROXY_TARGET || 'http://localhost:5172',
    },
  },
});
