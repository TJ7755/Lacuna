import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { version } from './package.json';
import { settingsStaticClosurePlugin } from './scripts/settings-static-closure';

// Cross-origin isolation headers required by the FSRS WASM trainer worker.
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export const workbox = {
  // Precache only the application shell. Lazy routes and their large optional
  // assets are cached when visited instead of all being downloaded on install.
  globPatterns: [
    '**/*.{html,ico,png,svg}',
    'assets/index-*.css',
    'assets/{app,vendor}-*.js',
    // These shared modules load during the first launch before the newly
    // installed worker controls the page, but the Cards route imports them too.
    // Precache that core closure; unrelated lazy pages remain runtime-only.
    'assets/{types,payloadValidation,numericAnswerSpec,verify,domain,scheduler,revisionPlan}-*.js',
  ],
  runtimeCaching: [
    {
      urlPattern: ({ request, url }: { request: Request; url: URL }) =>
        (request.destination === 'script' || request.destination === 'worker') &&
        /^\/assets\/.+-[A-Za-z0-9_-]{8}\.js$/.test(url.pathname),
      // Production scripts are content-addressed. Revalidating an immutable URL
      // on every visit spends bandwidth without any possibility of fresher bytes.
      handler: 'CacheFirst' as const,
      options: {
        cacheName: 'script-cache',
        expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: ({ request, url }: { request: Request; url: URL }) =>
        request.destination === 'style' &&
        /^\/assets\/.+-[A-Za-z0-9_-]{8}\.css$/.test(url.pathname),
      // Markdown and maths styles stay out of the install shell, but a route
      // visited online must retain its content-addressed stylesheet for reloads.
      handler: 'CacheFirst' as const,
      options: {
        cacheName: 'style-cache',
        expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: ({ request }: { request: Request }) => request.destination === 'font',
      handler: 'CacheFirst' as const,
      options: {
        cacheName: 'font-cache',
        expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      // Keep the hosted stylesheet so the full Google Fonts language coverage
      // remains intact without another third-party request on repeat launches.
      urlPattern: ({ url }: { url: URL }) => url.origin === 'https://fonts.googleapis.com',
      handler: 'CacheFirst' as const,
      options: {
        cacheName: 'font-stylesheet-cache',
        expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: /^.*\.wasm$/i,
      // Vite emits content-hashed WASM filenames, so a cached response can only
      // belong to the JavaScript bundle that requested that exact URL.
      handler: 'CacheFirst' as const,
      options: {
        cacheName: 'wasm-cache',
        expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
};

// Registration is gated by the page protocol in src/webBootstrap.ts so the
// packaged app never tries to install a worker from app://.
export const pwaInjectRegister = null;

// Lacuna is a static, serverless single-page application.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    settingsStaticClosurePlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: pwaInjectRegister,
      manifest: false, // Use the custom manifest in public/
      workbox,
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
        assetFileNames: 'assets/[name]-[hash][extname]',
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
            ['react', 'react-dom', 'react-router-dom', 'motion', '@babel/runtime'].some(
              (packageName) => id.includes(`/node_modules/${packageName}/`),
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
