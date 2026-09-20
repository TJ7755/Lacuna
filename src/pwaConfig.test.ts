import { describe, expect, it } from 'vitest';
import config, { pwaInjectRegister, workbox } from '../vite.config';
import { collectAppShellScripts } from '../scripts/app-shell-precache';

describe('service-worker asset caching', () => {
  it('leaves worker registration to the protocol-aware application bootstrap', () => {
    expect(pwaInjectRegister).toBeNull();
  });

  it('keeps optional CSS out of the install-time application shell', () => {
    expect(workbox.globPatterns).toContain('assets/index-*.css');
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

  it('reuses the hosted font stylesheet without a repeat network request', () => {
    const stylesheetRule = workbox.runtimeCaching?.find(
      (rule) => rule.options?.cacheName === 'font-stylesheet-cache',
    );

    expect(stylesheetRule).toMatchObject({ handler: 'CacheFirst' });
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
