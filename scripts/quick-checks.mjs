import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownerFor, workspaceChecks } from './check-catalogue.mjs';
import { isDocsPath, isQuestionBankFixture } from './ci-change-scope.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const code = /\.(?:[cm]?[jt]sx?)$/;

export function quickChecks(paths) {
  const commands = [];
  const add = (command, args, cwd = '.') => commands.push({ command, args, cwd });
  const bun = (script, cwd = '.', extra = []) => add('bun', ['run', script, ...extra], cwd);
  const owners = [...new Set(paths.filter((path) => !isDocsPath(path)).map(ownerFor))];
  // Unknown/configuration changes have no trustworthy narrow dependency boundary.
  const broad = !paths.length || owners.some(({ id }) => ['shared', 'unknown'].includes(id));
  if (paths.some(isDocsPath) || paths.some(isQuestionBankFixture) || broad) bun('docs:check');
  if (!owners.length && !broad) return { commands, broad };

  const surviving = paths.filter((path) => existsSync(resolve(root, path)));
  const deleted = paths.some((path) => !surviving.includes(path));
  if (broad) {
    bun('lint');
    bun('typecheck');
    bun('test:ci:unit', '.', ['--', '--maxWorkers=1']);
    add('node', ['--test', '--test-concurrency=1', 'scripts/local-checks.test.mjs']);
  } else {
    const lintPaths = surviving.filter(
      (path) =>
        code.test(path) &&
        !path.startsWith('apps/relay/') &&
        !path.startsWith('tooling/lacuna-ai-mcp/'),
    );
    if (lintPaths.length)
      add('bun', ['x', '--no-install', 'eslint', '--max-warnings=0', '--', ...lintPaths]);
    for (const script of new Set(owners.flatMap((owner) => owner.typechecks ?? []))) bun(script);
    if (deleted) bun('test:ci:unit', '.', ['--', '--maxWorkers=1']);
    else {
      const related = surviving.filter((path) => code.test(path) && ownerFor(path).related);
      if (related.length)
        add('bun', [
          'x',
          '--no-install',
          'vitest',
          'related',
          '--run',
          '--config',
          'tests/config/vitest.config.ts',
          '--maxWorkers=1',
          '--passWithNoTests',
          ...related,
        ]);
    }
    if (owners.some(({ nodeTests }) => nodeTests)) {
      const tests = new Set(['scripts/local-checks.test.mjs']);
      for (const path of surviving.filter((path) => path.endsWith('.mjs'))) {
        const companion = path.replace(/\.mjs$/, '.test.mjs');
        if (path.endsWith('.test.mjs')) tests.add(path);
        else if (existsSync(resolve(root, companion))) tests.add(companion);
      }
      add('node', ['--test', '--test-concurrency=1', ...tests]);
    }
  }
  const workspaces = broad
    ? Object.keys(workspaceChecks)
    : [...new Set(owners.flatMap((owner) => owner.workspaces ?? []))];
  for (const cwd of workspaces) {
    for (const script of workspaceChecks[cwd]) {
      bun(script, cwd, script === 'test' ? ['--', '--maxWorkers=1'] : []);
    }
  }
  if (broad || owners.some(({ python }) => python)) {
    for (const tool of ['short-term-memory', 'semantic-answer-match']) {
      add('uv', ['run', '--locked', 'pytest'], `tooling/${tool}`);
    }
  }
  return { commands, broad };
}
