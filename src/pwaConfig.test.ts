import { describe, expect, it } from 'vitest';
import config, { workbox } from '../vite.config';

describe('service-worker WASM caching', () => {
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
});
