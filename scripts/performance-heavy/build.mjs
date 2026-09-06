import { build } from 'esbuild';

await build({
  entryPoints: ['scripts/performance-heavy/fixture.ts'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'LacunaHeavyFixture',
  define: { 'import.meta.env.DEV': 'false' },
  outfile: 'artifacts/performance/fixture.js',
  logLevel: 'error',
});
await build({
  entryPoints: ['scripts/performance-heavy/run.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile: 'artifacts/performance/run.mjs',
  logLevel: 'error',
});
