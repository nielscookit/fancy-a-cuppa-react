import { resolve } from 'node:path';
import { defineConfig, loadEnv, normalizePath } from 'vite';
import react from '@vitejs/plugin-react';
import { readUc02Config } from './scripts/uc02-ios-config.mjs';
import { iosPilotMode, iosPilotMarker, verifyIosPilotBackend } from './scripts/ios-pilot-config.mjs';

// The native bundle is loaded from Capacitor's local WebView origin.
export default defineConfig(async ({ mode }) => {
  const uc02 = mode === 'uc02-local'
    ? readUc02Config(loadEnv(mode, import.meta.dirname, ['FAC_UC02_', 'VITE_COMMUNITY_TEA_V4']))
    : null;

  const pilot = mode === iosPilotMode ? await verifyIosPilotBackend() : null;

  return {
    plugins: [
      react(),
      ...(uc02 ? [v4Client(uc02), localOnlyHtml(uc02.url)] : []),
      ...(pilot ? [v4Client(pilot), {
        name: 'fac-ios-pilot-build',
        transformIndexHtml: () => [
          { tag: 'meta', attrs: { name: iosPilotMarker, content: '4' }, injectTo: 'head-prepend' },
        ],
      }] : []),
    ],
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

function v4Client(config) {
  const clientPath = normalizePath(resolve(import.meta.dirname, 'src/data/supabaseConfig.js'));
  return {
    name: 'fac-uc02-v4-client',
    enforce: 'pre',
    transform(_source, id) {
      if (id !== clientPath) return;
      return {
        code: `export const uc02IosEnabled = true;
export const supabaseConfig = Object.freeze(${JSON.stringify(config)});`,
        map: null,
      };
    },
  };
}

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
