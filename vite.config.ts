import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { version } from './package.json';

// Cross-origin isolation headers required by the FSRS WASM trainer worker.
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// Lacuna is a static, serverless single-page application.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // Use the custom manifest in public/
      workbox: {
        // Precache only the application shell. Lazy routes and their large optional
        // assets are cached when visited instead of all being downloaded on install.
        globPatterns: ['**/*.{html,css,ico,png,svg}', 'assets/{app,vendor}-*.js'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) =>
              request.destination === 'script' || request.destination === 'worker',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'script-cache',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^.*\.wasm$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wasm-cache',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // A development worker can cache Vite modules from different optimiser
        // generations, leaving React and its renderer with incompatible instances.
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    headers: crossOriginIsolationHeaders,
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
  // Surface the package version to the app (used by the diagnostic bundle).
  define: {
    __APP_VERSION__: JSON.stringify(version),
    // Vercel serves the analytics endpoint itself. Do not inject a script that
    // will 404 on local previews, Electron or other static hosts.
    __VERCEL_ANALYTICS_ENABLED__: JSON.stringify(process.env.VERCEL === '1'),
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'motion'],
  },
  // Pre-bundle the heavy dependencies up front so the dev server never pauses to
  // re-optimise (and full-page reload) the first time a lazy route pulls one in.
  // Without this, navigating to a route that imports recharts/katex/highlight.js
  // froze the page for several seconds while Vite re-ran dependency optimisation.
  optimizeDeps: {
    exclude: ['@open-spaced-repetition/binding'],
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'motion/react',
      'recharts',
      'katex',
      'react-markdown',
      'remark-gfm',
      'remark-math',
      'rehype-katex',
      'rehype-highlight',
      'rehype-raw',
      'highlight.js',
      'dexie',
      'dexie-react-hooks',
      'ts-fsrs',
    ],
  },
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        // Give the eager application entry a distinct name so Workbox can precache
        // it and its vendor dependency without downloading every lazy JavaScript chunk.
        entryFileNames: 'assets/app-[hash].js',
        // Keep production chunks sensible: framework, charts and the markdown/maths
        // stack each get their own chunk so a page that needs none of them stays light.
        // A package-list object manual chunk also captures Rollup helpers generated for
        // the eager entry. In this project that placed Object.assign beside recharts,
        // making the chart chunk an eager dependency. Package-based routing keeps the
        // helper with the entry while the actual chart library remains lazy.
        manualChunks(id) {
          if (id.includes('/node_modules/recharts/')) return 'charts';
          if (
            [
              'react-markdown',
              'remark-gfm',
              'remark-math',
              'rehype-katex',
              'rehype-highlight',
              'rehype-raw',
              'katex',
              'highlight.js',
            ].some((packageName) => id.includes(`/node_modules/${packageName}/`))
          ) {
            return 'markdown';
          }
          if (
            ['react', 'react-dom', 'react-router-dom', 'motion'].some((packageName) =>
              id.includes(`/node_modules/${packageName}/`),
            )
          ) {
            return 'vendor';
          }
          return undefined;
        },
      },
    },
  },
});
