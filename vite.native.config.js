import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The native bundle is loaded from Capacitor's local WebView origin.
// Keep vite.config.js and its GitHub Pages base/path settings unchanged.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-native',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'index.html'),
    },
  },
});
