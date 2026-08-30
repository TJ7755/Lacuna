import { describe, expect, it } from 'vitest';
import config, { workbox } from '../vite.config';

describe('service-worker asset caching', () => {
  it('keeps optional CSS out of the install-time application shell', () => {
    expect(workbox.globPatterns).toContain('assets/index-*.css');
    expect(workbox.globPatterns).not.toContain('**/*.{html,css,ico,png,svg}');
  });

  it('serves immutable lazy scripts without repeat network revalidation', () => {
    const scriptRule = workbox.runtimeCaching?.find(
      (rule) => typeof rule.urlPattern === 'function' && rule.options?.cacheName === 'script-cache',
    );

    expect(scriptRule).toMatchObject({ handler: 'CacheFirst' });
    const matches = scriptRule?.urlPattern as
      | ((context: { request: Request; url: URL }) => boolean)
      | undefined;
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
      build?: { rollupOptions?: { output?: { assetFileNames?: string } } };
    };

    expect(generatedConfig.build?.rollupOptions?.output?.assetFileNames).toBe(
      'assets/[name]-[hash][extname]',
    );
  });

  it('keeps shared Babel helpers out of the optional charts chunk', () => {
    const generatedConfig = config as {
      build?: {
        rollupOptions?: { output?: { manualChunks?: (id: string) => string | undefined } };
      };
    };

    expect(
      generatedConfig.build?.rollupOptions?.output?.manualChunks?.(
        '/node_modules/@babel/runtime/helpers/extends.js',
      ),
    ).toBe('vendor');
  });
});
