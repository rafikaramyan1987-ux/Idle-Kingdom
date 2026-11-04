import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    __CRAZYGAMES__: JSON.stringify(mode === 'crazygames'),
  },
  build: {
    outDir: mode === 'crazygames' ? 'dist-crazygames' : 'dist',
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: { main: 'index.html' },
    },
  },
  server: { host: true },
}));
