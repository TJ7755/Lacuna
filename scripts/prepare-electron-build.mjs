import { spawnSync } from 'node:child_process';
import { buildSync } from 'esbuild';

const commands = [
  [
    process.execPath,
    ['node_modules/@typescript/native/bin/tsc', '-p', 'apps/desktop/tsconfig.json'],
  ],
  [
    process.execPath,
    ['node_modules/@typescript/native/bin/tsc', '-p', 'apps/desktop/tsconfig.preload.json'],
  ],
  [process.execPath, ['apps/desktop/mcp/build.mjs']],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

buildSync({
  entryPoints: ['apps/desktop/preload.ts'],
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: 'apps/desktop/dist-electron/preload.cjs',
  sourcemap: true,
});
