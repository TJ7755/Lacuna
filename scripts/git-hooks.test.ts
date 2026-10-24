import { afterEach, beforeEach, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let directory: string;
const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
const run = (command: string, args: string[]) =>
  spawnSync(command, args, {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, CI: '', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
const git = (...args: string[]) => run('git', args);
const write = (file: string, content: string) => writeFileSync(join(directory, file), content);
const read = (file: string) => readFileSync(join(directory, file), 'utf8');

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'lacuna-hooks-#'));
  mkdirSync(join(directory, '.githooks'));
  mkdirSync(join(directory, 'scripts'));
  copyFileSync('.githooks/pre-commit', join(directory, '.githooks/pre-commit'));
  chmodSync(join(directory, '.githooks/pre-commit'), 0o755);
  copyFileSync('scripts/install-git-hooks.mjs', join(directory, 'scripts/install-git-hooks.mjs'));
  copyFileSync('.prettierrc', join(directory, '.prettierrc'));
  write('package.json', JSON.stringify({ scripts: { 'format:staged': scripts['format:staged'] } }));
  expect(git('init', '-q').status).toBe(0);
  git('config', 'user.email', 'hooks@example.invalid');
  git('config', 'user.name', 'Hook test');
  expect(run('node', ['scripts/install-git-hooks.mjs']).status).toBe(0);
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

it('formats and commits staged code without changing unstaged files or documentation', () => {
  write('staged file.ts', 'export const value=1');
  write('untouched.ts', 'export const untouched=2');
  write('note.md', '#  Keep this exactly\n');
  git('add', 'staged file.ts', 'note.md');
  const result = git('commit', '-qm', 'Format staged files');
  expect(result.status, result.stderr).toBe(0);
  expect(git('show', 'HEAD:staged file.ts').stdout).toBe('export const value = 1;\n');
  expect(read('untouched.ts')).toBe('export const untouched=2');
  expect(read('note.md')).toBe('#  Keep this exactly\n');
  expect(git('show', 'HEAD:note.md').stdout).toBe(read('note.md'));
});

it('rejects unformatted partial staging without changing either version', () => {
  write('partial.ts', 'export const staged=1');
  git('add', 'partial.ts');
  write('partial.ts', 'export const staged=1\nexport const unstaged=2');
  const result = git('commit', '-qm', 'Partial change');
  expect(result.status).not.toBe(0);
  expect(git('show', ':partial.ts').stdout).toBe('export const staged=1');
  expect(read('partial.ts')).toBe('export const staged=1\nexport const unstaged=2');
});

it('allows formatted partial staging without committing the unstaged changes', () => {
  write('partial.ts', 'export const staged = 1;\n');
  git('add', 'partial.ts');
  write('partial.ts', 'export const staged = 1;\nexport const unstaged=2');
  const result = git('commit', '-qm', 'Partial change');
  expect(result.status, result.stderr).toBe(0);
  expect(git('show', 'HEAD:partial.ts').stdout).toBe('export const staged = 1;\n');
  expect(read('partial.ts')).toBe('export const staged = 1;\nexport const unstaged=2');
});

it('rejects syntax errors instead of committing them', () => {
  write('broken.ts', 'export const =');
  git('add', 'broken.ts');
  expect(git('commit', '-qm', 'Invalid code').status).not.toBe(0);
  expect(git('show', ':broken.ts').stdout).toBe('export const =');
});

it('retains an existing custom hook path', () => {
  git('config', '--local', 'core.hooksPath', 'custom-hooks');
  expect(run('node', ['scripts/install-git-hooks.mjs']).status).toBe(0);
  expect(git('config', '--get', 'core.hooksPath').stdout.trim()).toBe('custom-hooks');
});

it('retains an existing default pre-commit hook', () => {
  git('config', '--local', '--unset', 'core.hooksPath');
  write('.git/hooks/pre-commit', '#!/bin/sh\nexit 0\n');
  expect(run('node', ['scripts/install-git-hooks.mjs']).status).toBe(0);
  expect(git('config', '--get', 'core.hooksPath').status).toBe(1);
  expect(read('.git/hooks/pre-commit')).toBe('#!/bin/sh\nexit 0\n');
});

it('does not change Git configuration during CI installation', () => {
  git('config', '--local', '--unset', 'core.hooksPath');
  const result = spawnSync('node', ['scripts/install-git-hooks.mjs'], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
  });
  expect(result.status, result.stderr).toBe(0);
  expect(git('config', '--local', '--get', 'core.hooksPath').status).toBe(1);
});

it('installs from a linked worktree where .git is a file', () => {
  git('add', '.');
  expect(git('commit', '-qm', 'Bootstrap').status).toBe(0);
  const linked = join(directory, 'linked');
  expect(git('worktree', 'add', '-qb', 'linked', linked).status).toBe(0);
  git('config', '--local', '--unset', 'core.hooksPath');
  const result = spawnSync('node', ['scripts/install-git-hooks.mjs'], {
    cwd: linked,
    encoding: 'utf8',
    env: { ...process.env, CI: '' },
  });
  expect(result.status, result.stderr).toBe(0);
  expect(git('config', '--get', 'core.hooksPath').stdout.trim()).toBe('.githooks');
});

it('preserves an absolute default hook path in a linked worktree', () => {
  git('add', '.');
  expect(git('commit', '-qm', 'Bootstrap').status).toBe(0);
  const linked = join(directory, 'linked');
  expect(git('worktree', 'add', '-qb', 'linked', linked).status).toBe(0);
  git('config', '--local', '--unset', 'core.hooksPath');
  write('.git/hooks/pre-commit', '#!/bin/sh\nexit 0\n');
  const result = spawnSync('node', ['scripts/install-git-hooks.mjs'], {
    cwd: linked,
    encoding: 'utf8',
    env: { ...process.env, CI: '' },
  });
  expect(result.status, result.stderr).toBe(0);
  expect(git('config', '--local', '--get', 'core.hooksPath').status).toBe(1);
  expect(read('.git/hooks/pre-commit')).toBe('#!/bin/sh\nexit 0\n');
});
