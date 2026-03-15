/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
          dest: '.',
        },
      ],
    }),
  ],

  // sqlite-wasm ships its own worker and wasm file; excluding it from Vite's
  // pre-bundler lets it resolve internal URLs (new URL(..., import.meta.url))
  // correctly at runtime.
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },

  // SharedArrayBuffer — required by sqlite-wasm's OPFS backend — is only
  // available in cross-origin isolated contexts. These two headers enable
  // that isolation in the dev server.
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },

  // Apply the same headers in preview mode.
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },

  test: {
    environment: 'node',
  },
});
