import { describe, expect, it } from 'vitest';
import config, { pwaInjectRegister, workbox } from '../vite.config';
import {
  collectAppShellScripts,
  collectAppShellStyles,
  collectOfflineCardsDependencies,
  collectOfflineImportRoute,
} from '../scripts/app-shell-precache';

describe('service-worker asset caching', () => {
  it('precaches the daily backup worker and launcher dependencies before first offline use', () => {
    expect(workbox.globPatterns).toContain('assets/dailyBackup.worker-*.js');
    expect(collectAppShellScripts([
      { fileName: 'assets/app-ENTRY001.js', isEntry: true, imports: [] },
      { fileName: 'assets/backups-BACKUP01.js', isEntry: false, imports: ['assets/snapshot-BACKUP02.js'] },
      { fileName: 'assets/snapshot-BACKUP02.js', isEntry: false, imports: [] },
    ])).toEqual(['assets/app-ENTRY001.js', 'assets/backups-BACKUP01.js', 'assets/snapshot-BACKUP02.js']);
  });
  it('precaches the restore decoder and its dependencies before the first offline restore', () => {
    expect(collectAppShellScripts([
      { fileName: 'assets/app-ENTRY001.js', isEntry: true, imports: [] },
      { fileName: 'assets/portability-RESTORE1.js', isEntry: false, imports: ['assets/validation-RESTORE2.js'] },
      { fileName: 'assets/validation-RESTORE2.js', isEntry: false, imports: [] },
    ])).toEqual(['assets/app-ENTRY001.js', 'assets/portability-RESTORE1.js', 'assets/validation-RESTORE2.js']);
  });
  it('precaches the required device-local AI cleanup hook for offline restore', () => {
    expect(collectAppShellScripts([
      { fileName: 'assets/app-ENTRY001.js', isEntry: true, imports: [] },
      { fileName: 'assets/relay-CLEANUP1.js', isEntry: false, imports: ['assets/deviceState-CLEANUP2.js'] },
      { fileName: 'assets/deviceState-CLEANUP2.js', isEntry: false, imports: [] },
    ])).toEqual(['assets/app-ENTRY001.js', 'assets/relay-CLEANUP1.js', 'assets/deviceState-CLEANUP2.js']);
  });
  it('precaches deferred embedded-image processing before the first offline import', () => {
    expect(
      collectAppShellScripts([
        { fileName: 'assets/app-ENTRY001.js', isEntry: true, imports: [] },
        {
          fileName: 'assets/markdownAssets-IMAGE001.js',
          isEntry: false,
          imports: ['assets/imageHelpers-IMAGE002.js'],
        },
        { fileName: 'assets/imageHelpers-IMAGE002.js', isEntry: false, imports: [] },
      ]),
    ).toEqual([
      'assets/app-ENTRY001.js',
      'assets/markdownAssets-IMAGE001.js',
      'assets/imageHelpers-IMAGE002.js',
    ]);
  });

  it('precaches deferred Quick search and its dependencies before first offline use', () => {
    expect(collectAppShellScripts([
      { fileName: 'assets/app-ENTRY001.js', isEntry: true, imports: [] },
      { fileName: 'assets/CommandPalette-SEARCH01.js', isEntry: false, imports: ['assets/search-SEARCH02.js'] },
      { fileName: 'assets/search-SEARCH02.js', isEntry: false, imports: [] },
    ])).toEqual(['assets/app-ENTRY001.js', 'assets/CommandPalette-SEARCH01.js', 'assets/search-SEARCH02.js']);
  });
  it('precaches on-demand course actions and their static dependencies before first offline use', () => {
    expect(collectAppShellScripts([
      { fileName: 'assets/app-ENTRY001.js', isEntry: true, imports: [] },
      { fileName: 'assets/CourseActions-ACTIONS1.js', isEntry: false, imports: ['assets/action-ui-ACTION01.js'] },
      { fileName: 'assets/action-ui-ACTION01.js', isEntry: false, imports: [] },
    ])).toEqual(['assets/app-ENTRY001.js', 'assets/CourseActions-ACTIONS1.js', 'assets/action-ui-ACTION01.js']);
  });
  it('precaches deferred lesson ordering and its guard before the first offline save', () => {
    expect(collectAppShellScripts([
      { fileName: 'assets/app-ENTRY001.js', isEntry: true, imports: [] },
      { fileName: 'assets/lessonOrder-ORDER001.js', isEntry: false, imports: ['assets/lessonOrder-RESOLVE1.js'] },
      { fileName: 'assets/lessonOrder-RESOLVE1.js', isEntry: false, imports: [] },
    ])).toEqual(['assets/app-ENTRY001.js', 'assets/lessonOrder-ORDER001.js', 'assets/lessonOrder-RESOLVE1.js']);
  });
  it('precaches the welcome-course seed that start-up loads on demand', () => {
    expect(collectAppShellScripts([
      { fileName: 'assets/app-ENTRY001.js', isEntry: true, imports: [] },
      { fileName: 'assets/seed-SEEDCHK1.js', isEntry: false, imports: [] },
    ])).toContain('assets/seed-SEEDCHK1.js');
  });
  it('precaches the motion features that start-up loads straight after first paint', () => {
    expect(collectAppShellScripts([
      { fileName: 'assets/app-ENTRY001.js', isEntry: true, imports: [] },
      { fileName: 'assets/motionFeatures-MOTION01.js', isEntry: false, imports: ['assets/features-max-FEATMAX1.js'] },
      { fileName: 'assets/features-max-FEATMAX1.js', isEntry: false, imports: [] },
    ])).toEqual(['assets/app-ENTRY001.js', 'assets/motionFeatures-MOTION01.js', 'assets/features-max-FEATMAX1.js']);
  });
  it('leaves worker registration to the protocol-aware application bootstrap', () => {
    expect(pwaInjectRegister).toBeNull();
  });

  it('keeps optional CSS out of the install-time application shell', () => {
    expect(workbox.globPatterns).not.toContain('assets/*.css');
    expect(workbox.globPatterns).not.toContain('**/*.{html,css,ico,png,svg}');
  });

  it('serves immutable lazy scripts without repeat network revalidation', () => {
    const scriptRule = workbox.runtimeCaching?.find(
      (rule) => typeof rule.urlPattern === 'function' && rule.options?.cacheName === 'script-cache',
    );

    expect(scriptRule).toMatchObject({
      handler: 'CacheFirst',
      options: { expiration: { maxEntries: 60 } },
    });
    const matches = scriptRule?.urlPattern as
      ((context: { request: Request; url: URL }) => boolean) | undefined;
    expect(
      matches?.({
        request: { destination: 'script' } as Request,
        url: new URL('https://lacuna.example/assets/route-CONTENT1.js'),
      }),
    ).toBe(true);
    expect(
      matches?.({
        request: { destination: 'script' } as Request,
        url: new URL('https://lacuna.example/registerSW.js'),
      }),
    ).toBe(false);
  });

  it('precaches the eager application closure without downloading lazy routes on install', () => {
    const scripts = collectAppShellScripts([
      { fileName: 'assets/app-ENTRY001.js', isEntry: true, imports: ['assets/shared-SHARED01.js'] },
      {
        fileName: 'assets/shared-SHARED01.js',
        isEntry: false,
        imports: ['assets/helper-HELPER01.js'],
      },
      { fileName: 'assets/helper-HELPER01.js', isEntry: false, imports: [] },
      {
        fileName: 'assets/CardsPage-CARDS001.js',
        isEntry: false,
        imports: ['assets/shared-SHARED01.js'],
      },
    ]);

    expect(scripts).toEqual([
      'assets/app-ENTRY001.js',
      'assets/shared-SHARED01.js',
      'assets/helper-HELPER01.js',
    ]);
    expect(workbox.globPatterns).not.toContain('assets/*Page-*.js');
    expect(workbox.globPatterns).not.toContain('assets/*.js');
  });

  it('precaches deferred route announcements loaded before worker control', () => {
    expect(
      collectAppShellScripts([
        { fileName: 'assets/app-ENTRY001.js', isEntry: true, imports: [] },
        {
          fileName: 'assets/RouteAnnouncement-ANNOUNCE.js',
          isEntry: false,
          imports: ['assets/labels-LABELS01.js'],
        },
        { fileName: 'assets/labels-LABELS01.js', isEntry: false, imports: [] },
        { fileName: 'assets/CardsPage-CARDS001.js', isEntry: false, imports: [] },
      ]),
    ).toEqual([
      'assets/app-ENTRY001.js',
      'assets/RouteAnnouncement-ANNOUNCE.js',
      'assets/labels-LABELS01.js',
    ]);
  });

  it('retains shared Cards imports loaded before worker control without precaching the route', () => {
    const chunks = [
      { fileName: 'assets/app-ENTRY001.js', isEntry: true, imports: ['assets/shared-SHARED01.js'] },
      { fileName: 'assets/shared-SHARED01.js', isEntry: false, imports: [] },
      {
        fileName: 'assets/CardsPage-CARDS001.js',
        isEntry: false,
        imports: ['assets/shared-SHARED01.js', 'assets/cardCore-CORE0001.js'],
      },
      {
        fileName: 'assets/cardCore-CORE0001.js',
        isEntry: false,
        imports: ['assets/validation-VALID001.js'],
      },
      { fileName: 'assets/validation-VALID001.js', isEntry: false, imports: [] },
      { fileName: 'assets/MarkdownView-MARKDOWN.js', isEntry: false, imports: [] },
    ];

    expect(collectOfflineCardsDependencies(chunks)).toEqual([
      'assets/cardCore-CORE0001.js',
      'assets/validation-VALID001.js',
    ]);
  });

  it('precaches the Import route so a course file can be received on first use offline', () => {
    const chunks = [
      { fileName: 'assets/app-ENTRY001.js', isEntry: true, imports: ['assets/shared-SHARED01.js'] },
      { fileName: 'assets/shared-SHARED01.js', isEntry: false, imports: [] },
      {
        fileName: 'assets/ImportPanel-IMPORT01.js',
        isEntry: false,
        imports: ['assets/shared-SHARED01.js', 'assets/courseFile-COURSE01.js'],
        viteMetadata: { importedCss: new Set(['assets/ImportPanel-IMPORT01.css']) },
      },
      { fileName: 'assets/courseFile-COURSE01.js', isEntry: false, imports: [] },
      { fileName: 'assets/MarkdownView-MARKDOWN.js', isEntry: false, imports: [] },
    ];

    expect(collectOfflineImportRoute(chunks)).toEqual([
      'assets/ImportPanel-IMPORT01.js',
      'assets/courseFile-COURSE01.js',
      'assets/ImportPanel-IMPORT01.css',
    ]);
  });

  it('caches visited content-hashed lazy styles without adding them to the install shell', () => {
    const styleRule = workbox.runtimeCaching?.find(
      (rule) => typeof rule.urlPattern === 'function' && rule.options?.cacheName === 'style-cache',
    );

    expect(styleRule).toMatchObject({
      handler: 'CacheFirst',
      options: { expiration: { maxEntries: 10 } },
    });
    const matches = styleRule?.urlPattern as
      ((context: { request: Request; url: URL }) => boolean) | undefined;
    expect(
      matches?.({
        request: { destination: 'style' } as Request,
        url: new URL('https://lacuna.example/assets/markdown-CONTENT1.css'),
      }),
    ).toBe(true);
    expect(
      matches?.({
        request: { destination: 'style' } as Request,
        url: new URL('https://lacuna.example/styles.css'),
      }),
    ).toBe(false);
  });

  it('caches only the exact content-addressed WASM URL requested by its bundle', () => {
    const wasmRule = workbox.runtimeCaching?.find(
      (rule) =>
        rule.urlPattern instanceof RegExp &&
        rule.urlPattern.test('/assets/sql-wasm-CONTENTHASH.wasm'),
    );

    expect(wasmRule).toMatchObject({
      handler: 'CacheFirst',
      options: { cacheName: 'wasm-cache' },
    });
  });

  it('emits imported assets with content hashes in their filenames', () => {
    const generatedConfig = config as {
      build?: { rolldownOptions?: { output?: { assetFileNames?: string } } };
    };

    expect(generatedConfig.build?.rolldownOptions?.output?.assetFileNames).toBe(
      'assets/[name]-[hash][extname]',
    );
  });
});

it('keeps comparison navigation and assets out of the app shell', () => {
  expect(
    collectAppShellScripts([
      {
        fileName: 'assets/quizlet-PUBLIC01.js',
        isEntry: true,
        imports: ['assets/marketing-PUBLIC02.js'],
      },
      { fileName: 'assets/app-ENTRY001.js', isEntry: true, imports: [] },
      { fileName: 'assets/marketing-PUBLIC02.js', isEntry: false, imports: [] },
    ]),
  ).toEqual(['assets/app-ENTRY001.js']);
  expect(
    workbox.navigateFallbackDenylist.some((pattern) => pattern.test('/compare/quizlet/')),
  ).toBe(true);
  expect(workbox.globIgnores).toContain('compare/**');
});

it('precaches CSS from the app entry graph even when it is shared with public pages', () => {
  expect(
    collectAppShellStyles([
      { fileName: 'assets/app-ENTRY001.js', isEntry: true, imports: ['assets/shared-SHARED01.js'] },
      {
        fileName: 'assets/shared-SHARED01.js',
        isEntry: false,
        imports: [],
        viteMetadata: { importedCss: new Set(['assets/shared-SHARED01.css']) },
      },
      {
        fileName: 'assets/quizlet-PUBLIC01.js',
        isEntry: true,
        imports: [],
        viteMetadata: { importedCss: new Set(['assets/quizlet-PUBLIC01.css']) },
      },
    ]),
  ).toEqual(['assets/shared-SHARED01.css']);
});
