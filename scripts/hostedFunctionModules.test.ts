import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { expect, test } from 'vitest';

test('hosted functions load after Vercel-style ESM transpilation', async () => {
  const root = resolve(import.meta.dirname, '..');
  const entries = ['api/ai/session.ts', 'api/ai/inference.ts'];
  const traced = await build({
    entryPoints: entries.map((entry) => join(root, entry)),
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    metafile: true,
    outdir: join(root, '.hosted-esm-trace'),
    write: false,
    logLevel: 'silent',
  });
  const output = mkdtempSync(join(root, '.hosted-esm-'));
  try {
    await build({
      entryPoints: Object.keys(traced.metafile!.inputs).map((input) => resolve(root, input)),
      outbase: root,
      outdir: output,
      platform: 'node',
      format: 'esm',
      target: 'node24',
      logLevel: 'silent',
    });
    const urls = entries.map((entry) =>
      pathToFileURL(join(output, entry.replace(/\.ts$/, '.js'))).href,
    );
    expect(() => execFileSync(process.execPath, [
      '--input-type=module',
      '-e',
      `await Promise.all(${JSON.stringify(urls)}.map((url) => import(url)));`,
    ], { cwd: root, encoding: 'utf8', timeout: 10_000 })).not.toThrow();
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
