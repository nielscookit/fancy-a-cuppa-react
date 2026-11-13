import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const projectRoot = import.meta.dirname;
const fillPath = 'media/timer-kit/fill.mp4';

export default defineConfig({
  root: resolve(projectRoot, 'dev/ios-fill'),
  base: './',
  publicDir: false,
  plugins: [{
    name: 'copy-bundled-fill',
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: fillPath,
        source: await readFile(resolve(projectRoot, 'public', fillPath)),
      });
    },
  }],
  build: {
    // Capacitor already reads this directory. The normal native build replaces it.
    outDir: resolve(projectRoot, 'dist-native'),
    emptyOutDir: true,
  },
});
