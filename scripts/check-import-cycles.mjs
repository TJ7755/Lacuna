import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkCycles } from './import-architecture.mjs';

const root = resolve(process.argv[2] ?? '.');
const exceptionFile = join(root, 'scripts/import-cycle-exceptions.json');
const exceptions = existsSync(exceptionFile) ? JSON.parse(readFileSync(exceptionFile, 'utf8')) : [];
const { cycles, errors } = checkCycles(root, exceptions);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Import cycles: ${cycles.length} tracked exceptions; no untracked cycles in src.`);
}
