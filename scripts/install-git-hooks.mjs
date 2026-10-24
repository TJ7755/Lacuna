import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

if (!process.env.CI && existsSync(new URL('../.git', import.meta.url))) {
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  const configured = git('config', '--get', 'core.hooksPath');
  const current = configured.stdout?.trim();
  const defaultHook = git('rev-parse', '--git-path', 'hooks/pre-commit').stdout?.trim();
  if (
    (current && current !== '.githooks') ||
    (!current && defaultHook && existsSync(new URL(defaultHook, new URL('../', import.meta.url))))
  ) {
    process.stderr.write(
      'Existing Git hooks retained; run bun run format:staged before committing.\n',
    );
  } else {
    const result = git('config', '--local', 'core.hooksPath', '.githooks');
    if (result.status !== 0) {
      process.stderr.write(result.stderr || 'Unable to install Git hooks.\n');
      process.exitCode = 1;
    }
  }
}
