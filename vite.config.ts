import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import packageJson from './package.json' with { type: 'json' };
import { settingsStaticClosurePlugin } from './scripts/settings-static-closure.ts';
import { topicPagesPlugin } from './scripts/course-topics.ts';
import { publicPagePrerenderPlugin } from './scripts/public-page-prerender.ts';
import { appShellPrecachePlugin } from './scripts/app-shell-precache.ts';

// Cross-origin isolation headers required by the FSRS WASM trainer worker.
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export const workbox = {
  // Precache the application shell and the Cards route's shared import spine.
  // Lazy route entries and large optional assets are cached when visited.
  globPatterns: ['**/*.{html,ico,png,svg}', 'fonts/*.ttf', 'assets/dailyBackup.worker-*.js'],
  navigateFallbackDenylist: [
    /^\/(?:compare|courses)(?:\/|$)/,
    /^\/(?:sitemap\.xml|robots\.txt|llms\.txt)$/,
  ],
  globIgnores: [
    'films/**',
    'landing/films/**',
    'compare/**',
    'courses/**',
    'assets/course-*.png',
    'assets/lesson-*.png',
    'assets/recall-*.png',
    'assets/settings-*.png',
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

// Registration is gated by the page protocol in apps/web/src/webBootstrap.ts so the
// packaged app never tries to install a worker from app://.
export const pwaInjectRegister = null;

// Lacuna is a static, serverless single-page application.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    settingsStaticClosurePlugin(),
    publicPagePrerenderPlugin(),
    topicPagesPlugin(),
    appShellPrecachePlugin(),
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
    watch: {
      ignored: [
        '**/artifacts/**',
        '**/coverage/**',
        '**/playwright-report/**',
        '**/electron/dist-electron/**',
      ],
    },
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
  // Surface the package version to the app (used by the diagnostic bundle).
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
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
      'react-dom/server',
      'react-router-dom',
      'motion/react',
      'mermaid',
      'recharts',
      'katex',
      'react-markdown',
      'remark-gfm',
      'remark-breaks',
      'remark-math',
      'rehype-katex',
      'rehype-highlight',
      'rehype-raw',
      'rehype-sanitize',
      'react-qr-code',
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
    manifest: true,
    rolldownOptions: {
      input: {
        index: 'index.html',
        quizlet: 'compare/quizlet/index.html',
        courses: 'courses/index.html',
      },
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        // Give the eager application entry a distinct name so Workbox can precache
        // it and its vendor dependency without downloading every lazy JavaScript chunk.
        entryFileNames: (chunk) =>
          chunk.name === 'index' ? 'assets/app-[hash].js' : 'assets/[name]-[hash].js',
        codeSplitting: {
          // Separate shared page requirements: coupling these makes the course
          // catalogue download motion/router code, or the landing page download the app.
          groups: [
            {
              // These scheduling helpers are shared by the same study entry points.
              name: 'study-eligibility',
              test: /[\\/]src[\\/]fsrs[\\/](?:eligibility|horizon|assessmentTiming)\.ts$/,
              includeDependenciesRecursively: false,
            },
            {
              // Replay and its shared merge helpers form one lazy package asset.
              name: 'snapshot-replay',
              test: /[\\/]src[\\/](?:sync[\\/](?:snapshotReviews|snapshotRecords)|questions[\\/](?:questionSetAttemptMerge|backup)|db[\\/]scheduleEdits)\.ts$/,
              includeDependenciesRecursively: false,
            },
            {
              // The retry entry needs its own chunk. Shared chart maths must stay out of it:
              // otherwise the first attempt imports this chunk and a retry fetches nothing new.
              name: 'ForecastChartRecovery',
              test: /[\\/]src[\\/]components[\\/]dashboard[\\/](?:ForecastChartRecovery\.ts|ForecastChart\.tsx\?flow-retry)$/,
              includeDependenciesRecursively: false,
            },
            {
              name: 'dexie',
              test: /[\\/]node_modules[\\/](?:dexie|dexie-react-hooks)[\\/]/,
              includeDependenciesRecursively: false,
            },
            {
              name: 'database',
              test: /[\\/]src[\\/](?:utils[\\/]id|db[\\/](?:database|schema|reviewActivityProjection|schemaFloor|assessmentMigration|backingDecks|schedulingUnitBuilder|reviewHistory|mutationStamp|preMigrationSnapshots))\.ts$/,
              includeDependenciesRecursively: false,
            },
            {
              name: 'study-entrance',
              test: /[\\/]src[\\/]components[\\/]learn[\\/](?:StudyEntrance|StudyFlowMessage)\.tsx$/,
              includeDependenciesRecursively: false,
            },
            {
              name: 'specification-data',
              test: /[\\/]src[\\/]specifications[\\/](?:catalogue|data|linkSchemas|tagResolver)\.ts$/,
              includeDependenciesRecursively: false,
            },
            {
              name: 'specification-study',
              test: /[\\/]src[\\/](?:course[\\/]specificationStudyScope\.ts|pages[\\/](?:SpecificationStudyFlow\.tsx|learn[\\/]specificationSessionPool\.ts))$/,
              includeDependenciesRecursively: false,
            },
            {
              name: 'concept-practice',
              test: /[\\/]src[\\/](?:questions[\\/](?:conceptPractice|techniqueEvidence|grading)|state[\\/]useCourseConceptPractice)\.ts$/,
              includeDependenciesRecursively: false,
            },
            {
              name: 'course-sequencing',
              test: /[\\/]src[\\/](?:course[\\/](?:lessonOrder|assessmentCoverage)|fsrs[\\/]examDate)\.ts$/,
            },
            {
              name: 'web-runtime',
              test(id) {
                const path = id.replaceAll('\\', '/');
                return (
                  path === '\0vite/preload-helper.js' ||
                  /\/src\/(?:webBootstrap|landingHandover|pwa\/staleChunkRecovery|onboarding\/onboardingState)\.ts$/.test(
                    path,
                  ) ||
                  /\/src\/components\/ui\/(?:icons|Field|SectionCard)\.tsx$/.test(path) ||
                  /\/node_modules\/react-dom\/client\.js$/.test(path)
                );
              },
            },
            {
              name: 'landing-motion',
              test: /[\\/](?:src[\\/](?:state[\\/]motionSpeed\.ts|components[\\/]layout[\\/]LandingTransition\.tsx)$|node_modules[\\/]framer-motion[\\/]dist[\\/]es[\\/]components[\\/]LazyMotion[\\/])/,
            },
            {
              name: 'router',
              test: /[\\/]node_modules[\\/]react-router(?:-dom)?[\\/]/,
            },
          ],
        },
      },
    },
  },
});
