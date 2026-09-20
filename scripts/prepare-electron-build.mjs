import { spawnSync } from 'node:child_process';
import { buildSync } from 'esbuild';

const commands = [
  [process.execPath, ['node_modules/@typescript/native/bin/tsc', '-p', 'electron/tsconfig.json']],
  [
    process.execPath,
    ['node_modules/@typescript/native/bin/tsc', '-p', 'electron/tsconfig.preload.json'],
  ],
  [process.execPath, ['electron/mcp/build.mjs']],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

buildSync({
  entryPoints: ['electron/preload.ts'],
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: 'electron/dist-electron/preload.cjs',
  sourcemap: true,
});
