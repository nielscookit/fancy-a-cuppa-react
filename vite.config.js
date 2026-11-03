import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages path is independent of the existing V2 repository.
  base: '/fancy-a-cuppa-react/',
});
