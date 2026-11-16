import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readUc02Config } from './scripts/uc02-ios-config.mjs';

// The native bundle is loaded from Capacitor's local WebView origin.
export default defineConfig(({ mode }) => {
  const uc02 = mode === 'uc02-local'
    ? readUc02Config(loadEnv(mode, import.meta.dirname, ['FAC_UC02_', 'VITE_COMMUNITY_TEA_V4']))
    : null;

  return {
    plugins: [react(), ...(uc02 ? [localOnlyHtml(uc02.url)] : [])],
    define: { __FAC_UC02_IOS_CONFIG__: JSON.stringify(uc02) },
    base: './',
    build: {
      outDir: 'dist-native',
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(import.meta.dirname, 'index.html'),
      },
    },
  };
});

function localOnlyHtml(url) {
  return {
    name: 'fac-uc02-local-only',
    transformIndexHtml() {
      return [
        { tag: 'meta', attrs: { name: 'fac-uc02-local', content: url }, injectTo: 'head-prepend' },
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: `connect-src 'self' ${url}; img-src 'self' data: blob: ${url}`,
          },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}
