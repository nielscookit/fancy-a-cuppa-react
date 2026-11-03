import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // V2 and V3 remain separate GitHub Pages projects.
  base: '/fancy-a-cuppa-react/',
  // Two independent HTML entries, no client-side routing fallback required.
  input: {
    app: resolve(import.meta.dirname, 'index.html'),
    lab: resolve(import.meta.dirname, 'lab/index.html'),
  },
});
