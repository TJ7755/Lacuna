import { existsSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const commands = [
  [process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'electron/tsconfig.json']],
  [process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'electron/tsconfig.preload.json']],
  [process.execPath, ['electron/mcp/build.mjs']],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const source = 'electron/dist-electron/preload.js';
const destination = 'electron/dist-electron/preload.cjs';
if (!existsSync(source)) throw new Error(`Electron preload build did not produce ${source}`);
rmSync(destination, { force: true });
renameSync(source, destination);
