import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const repository = fileURLToPath(new URL('../', import.meta.url));
const pin = JSON.parse(readFileSync(join(repository, 'relay/scripts/security-bun.json'), 'utf8'));

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'lacuna-local-checks-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = join(directory, 'repository');
  const bin = join(directory, 'bin');
  mkdirSync(bin);
  for (const path of [
    'scripts/setup.mjs',
    'scripts/verify.mjs',
    'scripts/local-checks.mjs',
    'scripts/ci-change-scope.mjs',
    'relay/scripts/security-bun.mjs',
    'relay/scripts/security-bun.json',
    '.bun-version',
    'package.json',
    'CONTRIBUTING.md',
  ]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(join(repository, path), join(root, path));
  }
  for (const tool of [
    'handwriting-maths',
    'lacuna-ai-mcp',
    'short-term-memory',
    'semantic-answer-match',
  ]) {
    mkdirSync(join(root, 'tooling', tool), { recursive: true });
    writeFileSync(join(root, 'tooling', tool, '.keep'), '');
  }
  writeFileSync(join(root, '.gitignore'), 'artifacts/\n');
  const executable = join(bin, 'bun');
  writeFileSync(
    executable,
    `#!${process.execPath}
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === '--revision') console.log(process.env.FAKE_REVISION);
else {
  console.log('fake output');
  console.error('fake diagnostic');
  if (process.env.FAKE_CHANGE) appendFileSync(process.env.FAKE_CHANGE, '\\nchanged');
  if (process.env.FAKE_SIGNAL) process.kill(process.pid, process.env.FAKE_SIGNAL);
  process.exitCode = Number(process.env.FAKE_STATUS || 0);
}
`,
  );
  chmodSync(executable, 0o755);
  for (const name of ['node', 'uv']) copyFileSync(executable, join(bin, name));
  // Keep the executable outside the repository and use the ordinary PATH seam.
  writeFileSync(join(bin, 'package.json'), '{"type":"module"}');
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    }).trim();
  git('init', '-q');
  git('add', '.');
  git(
    '-c',
    'user.name=CLI tests',
    '-c',
    'user.email=cli@example.invalid',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '-qm',
    'Fixture',
  );
  const change = (path) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), 'changed\n');
    git('add', path);
  };
  const run = (script, args = [], env = {}) => {
    const result = spawnSync(process.execPath, [join(root, 'scripts', script), ...args], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        FAKE_REVISION: pin.revision,
        ...env,
      },
    });
    const match = result.stdout.match(/Evidence: (.+)/);
    const report = match ? JSON.parse(readFileSync(join(match[1], 'report.json'), 'utf8')) : null;
    return { ...result, report };
  };
  return { root, run, change, git };
}

describe('POSIX PATH executable fixtures', { skip: process.platform === 'win32' }, () => {
  test('setup verifies the full revision and performs only the three frozen installs', (t) => {
    const { run, root, git } = fixture(t);
    const result = run('setup.mjs');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.report.source.commit, git('rev-parse', 'HEAD'));
    const installs = result.report.commands.slice(1);
    assert.deepEqual(
      installs.map(({ cwd }) => cwd),
      ['.', 'relay', 'tooling/handwriting-maths'],
    );
    for (const command of installs) {
      assert.deepEqual(command.args, ['install', '--frozen-lockfile']);
      assert.equal(command.exitCode, 0);
      assert.ok(command.durationMs >= 0);
      assert.match(readFileSync(command.log, 'utf8'), /fake diagnostic/);
    }
    assert.equal(readdirSync(join(root, 'artifacts/local-checks')).length, 1);
  });

  test('setup rejects an unreviewed revision before installing', (t) => {
    const { run } = fixture(t);
    const result = run('setup.mjs', [], { FAKE_REVISION: `${pin.version}+wrong` });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Bun revision mismatch/);
    assert.equal(result.report.commands.length, 1);
  });

  test('setup preserves command failure status and diagnostic evidence, then stops', (t) => {
    const { run } = fixture(t);
    const result = run('setup.mjs', [], { FAKE_STATUS: '37' });
    assert.equal(result.status, 37);
    assert.equal(result.report.commands.length, 2);
    assert.equal(result.report.commands[1].exitCode, 37);
    assert.match(result.stderr, /fake diagnostic/);
  });

  test('a terminated command cannot become a pass', { skip: process.platform === 'win32' }, (t) => {
    const { run } = fixture(t);
    const result = run('setup.mjs', [], { FAKE_SIGNAL: 'SIGTERM' });
    assert.equal(result.status, 143);
    assert.equal(result.report.commands[1].signal, 'SIGTERM');
  });

  test('docs-only changes run only the documentation check, even when invoked elsewhere', (t) => {
    const { change, run } = fixture(t);
    change('docs/new.md');
    const result = run('verify.mjs');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.report.scope.docs_only, true);
    assert.deepEqual(
      result.report.commands.slice(1).map(({ args }) => args),
      [['run', 'docs:check']],
    );
    assert.match(result.report.source.diffSha256, /^[a-f0-9]{64}$/);
    assert.match(result.report.source.status, /docs\/new.md/);
  });

  test('base selection includes committed changes and both rename endpoints', (t) => {
    const { change, run, git } = fixture(t);
    change('docs/old.md');
    git(
      '-c',
      'user.name=CLI tests',
      '-c',
      'user.email=cli@example.invalid',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-qm',
      'Docs',
    );
    const base = git('rev-parse', 'HEAD');
    git('mv', 'docs/old.md', 'tooling/handwriting-maths/renamed.md');
    git(
      '-c',
      'user.name=CLI tests',
      '-c',
      'user.email=cli@example.invalid',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-qm',
      'Move',
    );
    const result = run('verify.mjs', ['--base', base, '--plan']);
    assert.equal(result.status, 2);
    assert.ok(result.report.paths.includes('docs/old.md'));
    assert.ok(result.report.paths.includes('tooling/handwriting-maths/renamed.md'));
    assert.equal(result.report.scope.handwriting, true);
    assert.equal(result.report.scope.app, false);
    assert.equal(result.report.commands.length, 1);
  });

  test('unknown changes and explicit full mode select the CONTRIBUTING matrix and expose native gaps', (t) => {
    const { change, run } = fixture(t);
    change('unknown/new.txt');
    const automatic = run('verify.mjs', ['--plan']);
    const full = run('verify.mjs', ['--full', '--plan']);
    assert.equal(automatic.status, 2);
    assert.deepEqual(automatic.report.plan, full.report.plan);
    const policy = readFileSync(join(repository, 'CONTRIBUTING.md'), 'utf8');
    // Read the independent policy instead of copying the runner's command inventory.
    const rootMatrix = policy.split('# Root\n')[1].split('# Relay')[0];
    for (const match of rootMatrix.matchAll(/^bun run (\S+)/gm)) {
      assert.ok(
        full.report.plan.some(
          ({ command, args, cwd }) =>
            command === 'bun' && cwd === '.' && args[0] === 'run' && args[1] === match[1],
        ),
        match[1],
      );
    }
    assert.ok(full.report.outstanding.some((entry) => /Windows|linux|darwin/.test(entry)));
    assert.ok(full.report.outstanding.some((entry) => /not executed/.test(entry)));
  });

  test('full execution records completed commands but cannot pass outstanding native checks', (t) => {
    const { run } = fixture(t);
    const result = run('verify.mjs', ['--full']);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.report.commands.length, result.report.plan.length + 1);
    assert.ok(result.report.commands.every(({ exitCode }) => exitCode === 0));
    assert.ok(result.report.outstanding.length > 0);
    const browser = result.report.commands.find(({ args }) => args[1] === 'test:e2e:web');
    assert.deepEqual(browser.env, { CI: 'true' });
  });

  test('a selected verification check preserves its failure status and stops', (t) => {
    const { change, run } = fixture(t);
    change('docs/new.md');
    const result = run('verify.mjs', [], { FAKE_STATUS: '23' });
    assert.equal(result.status, 23);
    assert.deepEqual(result.report.commands.at(-1).args, ['run', 'docs:check']);
  });

  test('untracked source and changes during checks invalidate evidence', (t) => {
    const { root, run, change } = fixture(t);
    writeFileSync(join(root, 'new.txt'), 'untracked');
    const untracked = run('setup.mjs');
    assert.equal(untracked.status, 1);
    assert.match(untracked.stderr, /Stage new files/);
    assert.equal(untracked.report.commands.length, 0);
    change('new.txt');
    const changed = run('setup.mjs', [], { FAKE_CHANGE: join(root, 'CONTRIBUTING.md') });
    assert.equal(changed.status, 1);
    assert.match(changed.stderr, /Source changed/);
  });

  test('invalid options and invalid base revisions fail rather than silently selecting checks', (t) => {
    const { run } = fixture(t);
    for (const args of [['--unknown'], ['--base'], ['--base', 'missing-commit']]) {
      const result = run('verify.mjs', args);
      assert.equal(result.status, 1);
      assert.equal(result.report.commands.length, 1);
      assert.equal(result.report.plan, undefined);
    }
  });
});
