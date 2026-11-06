import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // V2 and V3 remain separate GitHub Pages projects.
  base: '/fancy-a-cuppa-react/',
  // Standalone HTML entries; direct links do not require SPA fallback.
  input: {
    app: resolve(import.meta.dirname, 'index.html'),
    lab: resolve(import.meta.dirname, 'lab/index.html'),
    timerTest: resolve(import.meta.dirname, 'timer-test/index.html'),
    timerLab: resolve(import.meta.dirname, 'timer-lab/index.html'),
  },
});
