import { existsSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const commands = [
  ['tsc', ['-p', 'electron/tsconfig.json']],
  ['tsc', ['-p', 'electron/tsconfig.preload.json']],
  ['bun', ['run', 'build:mcp']],
];

for (const [command, args] of commands) {
  const executable = command === 'tsc' && process.platform === 'win32' ? 'tsc.cmd' : command;
  const result = spawnSync(executable, args, { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const source = 'electron/dist-electron/preload.js';
const destination = 'electron/dist-electron/preload.cjs';
if (!existsSync(source)) throw new Error(`Electron preload build did not produce ${source}`);
rmSync(destination, { force: true });
renameSync(source, destination);
