import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

describe('Anki parser boundary', () => {
  it('keeps application storage out of the parsing worker', async () => {
    const result = await build({
      entryPoints: ['src/workers/apkg.worker.ts'],
      bundle: true,
      platform: 'browser',
      format: 'esm',
      packages: 'external',
      external: ['*.wasm?url'],
      write: false,
      metafile: true,
      logLevel: 'silent',
    });
    const inputs = Object.keys(result.metafile.inputs).map((name) => name.replaceAll('\\', '/'));
    expect(
      inputs.filter((name) => /src\/db\/(schema|repository|assets|reviewHistory)\.ts$/.test(name)),
    ).toEqual([]);
    const packages = Object.values(result.metafile.outputs).flatMap((output) => output.imports);
    expect(packages.filter((entry) => entry.path === 'dexie')).toEqual([]);
  });
});
