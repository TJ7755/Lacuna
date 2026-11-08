import { describe, expect, it } from 'vitest';
import config, { workbox } from '../../../vite.config';
import {
  collectAppShellScripts,
  collectAppShellStyles,
  collectOfflineCardsDependencies,
  collectOfflineImportRoute,
} from '../../../scripts/app-shell-precache';

describe('service-worker asset caching', () => {
  it('excludes landing films and local posters from the offline application shell', () => {
    expect(workbox.globIgnores).toEqual(expect.arrayContaining(['films/**', 'landing/films/**']));
  });
  it('precaches the daily backup worker before first offline use', () => {
    expect(workbox.globPatterns).toContain('assets/dailyBackup.worker-*.js');
  });

  it.each([
    ['daily backup launcher', 'backups'],
    ['restore decoder', 'portability'],
    ['restore cleanup', 'relay'],
    ['embedded-image processing', 'markdownAssets'],
    ['Quick search', 'CommandPalette'],
    ['course actions', 'CourseActions'],
    ['lesson ordering', 'lessonOrder'],
    ['welcome-course seed', 'seed'],
    ['motion features', 'motionFeatures'],
    ['route announcements', 'RouteAnnouncement'],
  ])('precaches deferred %s and its dependencies', (_feature, chunkName) => {
    const entry = 'assets/app-ENTRY001.js';
    const deferred = `assets/${chunkName}-DEFERRED.js`;
    const dependency = 'assets/shared-SHARED01.js';

    expect(
      collectAppShellScripts([
        { fileName: entry, isEntry: true, imports: [] },
        { fileName: deferred, isEntry: false, imports: [dependency] },
        { fileName: dependency, isEntry: false, imports: [] },
      ]),
    ).toEqual([entry, deferred, dependency]);
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

  it('precaches the offline Import panel and its dependencies when another chunk shares its name', () => {
    const shared = 'assets/shared-SHARED01.js';
    const catalogue = 'assets/ImportPanel-CATALOG1.js';
    const panel = 'assets/ImportPanel-IMPORT01.js';
    const styles = 'assets/ImportPanel-IMPORT01.css';
    const chunks = [
      { fileName: 'assets/app-ENTRY001.js', isEntry: true, imports: [shared], moduleIds: [] },
      { fileName: shared, isEntry: false, imports: [], moduleIds: [] },
      {
        fileName: catalogue,
        isEntry: false,
        imports: [],
        moduleIds: ['/src/library/catalogue.ts'],
      },
      {
        fileName: panel,
        isEntry: false,
        imports: [shared, catalogue],
        moduleIds: ['/src/components/import/ImportPanel.tsx'],
        viteMetadata: { importedCss: new Set([styles]) },
      },
    ];

    expect(collectOfflineImportRoute(chunks)).toEqual([panel, catalogue, styles]);
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
  for (const path of ['/courses/', '/courses/biology4bi1/', '/llms.txt']) {
    expect(workbox.navigateFallbackDenylist.some((pattern) => pattern.test(path))).toBe(true);
  }
  expect(workbox.globIgnores).toContain('courses/**');
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
