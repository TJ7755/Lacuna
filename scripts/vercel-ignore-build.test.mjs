import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';

const source = resolve('.');
const projects = ['lacuna', 'relay', 'gaps', 'library'];

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'lacuna-vercel-ignore-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
    }).trim();
  git('init', '--initial-branch=master');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Fixture');
  git('config', 'core.hooksPath', '/dev/null');
  const write = (path, content = 'initial\n') => {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), content);
  };
  for (const path of [
    'scripts/ci-change-scope.mjs',
    'scripts/vercel-ignore-build.mjs',
    'vercel.json',
    'apps/relay/vercel.json',
    'apps/gaps/vercel.json',
    'apps/library/vercel.json',
  ]) {
    write(path, readFileSync(join(source, path)));
  }
  for (const path of ['apps/web/src/main.ts', 'docs/guide.md', 'apps/library/index.html'])
    write(path);
  const commit = (message = 'Fixture change') => {
    git('add', '--all');
    git('commit', '--quiet', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const base = commit();
  const run = (project, previous = base, extra = {}, cwd) => {
    const root = cwd ?? directory;
    const projectRoot = project === 'lacuna' ? root : join(root, 'apps', project);
    const config = JSON.parse(readFileSync(join(projectRoot, 'vercel.json'), 'utf8'));
    const result = spawnSync(config.ignoreCommand, {
      cwd: projectRoot,
      shell: true,
      encoding: 'utf8',
      env: {
        ...process.env,
        VERCEL_ENV: 'production',
        VERCEL_GIT_COMMIT_REF: 'master',
        VERCEL_GIT_PREVIOUS_SHA: previous,
        VERCEL_GIT_COMMIT_SHA: git('rev-parse', 'HEAD'),
        ...extra,
      },
    });
    assert.ifError(result.error);
    assert.ok([0, 1].includes(result.status), result.stderr);
    return result.status;
  };
  const results = (...args) => projects.map((project) => run(project, ...args));
  return { directory, git, write, commit, base, run, results };
}

test('configured commands preserve previews, both root exceptions and manual/local builds', (t) => {
  const f = fixture(t);
  assert.deepEqual(f.results('', { VERCEL_ENV: 'preview' }), [0, 0, 0, 0]);
  for (const branch of ['redesign/direction-c', 'feature/594-gaps']) {
    assert.deepEqual(
      f.results('', { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: branch }),
      [1, 0, 0, 0],
    );
  }
  assert.deepEqual(f.results('', { VERCEL_ENV: '' }), [1, 1, 1, 1]);
});

test('docs skip; a site change spares relay and accumulates across skipped commits', (t) => {
  const f = fixture(t);
  f.write('docs/guide.md', 'documentation change\n');
  const docs = f.commit();
  assert.deepEqual(f.results(), [0, 0, 0, 0]);
  f.write('apps/library/index.html', 'site change\n');
  const site = f.commit();
  assert.deepEqual(f.results(), [1, 0, 1, 1]);
  f.write('docs/guide.md', 'next documentation change\n');
  f.commit();
  assert.deepEqual(f.results(site), [0, 0, 0, 0]);
  assert.deepEqual(f.results(docs), [1, 0, 1, 1]);
});

test('an explicit intermediate commit defers deployment until the final batch commit', (t) => {
  const f = fixture(t);
  f.write('unrecognised/file', 'intermediate change\n');
  f.commit('Maintain the application [skip vercel]');
  assert.deepEqual(f.results(''), [0, 0, 0, 0]);
  assert.deepEqual(f.results('', { VERCEL_GIT_COMMIT_SHA: f.base }), [1, 1, 1, 1]);
  f.write('docs/guide.md', 'final batch note\n');
  f.commit('Release the batch\n\n[skip vercel]');
  assert.deepEqual(f.results(), [1, 1, 1, 1]);
});

for (const path of [
  'apps/relay/shared/protocol.ts',
  'apps/relay/scripts/security-bun.json',
  'apps/web/src/main.ts',
  'package.json',
  'unrecognised/file',
]) {
  test(`${path} conservatively builds all projects`, (t) => {
    const f = fixture(t);
    f.write(path, 'changed\n');
    f.commit();
    assert.deepEqual(f.results(), [1, 1, 1, 1]);
  });
}

test('moving source into docs and deleting source both require builds', (t) => {
  const f = fixture(t);
  f.git('mv', 'apps/web/src/main.ts', 'docs/moved.md');
  f.commit();
  assert.deepEqual(f.results(), [1, 1, 1, 1]);
  f.git('reset', '--hard', f.base);
  f.git('rm', 'apps/web/src/main.ts');
  f.commit();
  assert.deepEqual(f.results(), [1, 1, 1, 1]);
});

test('missing history, mismatched checkout and empty comparisons build', (t) => {
  const f = fixture(t);
  assert.deepEqual(f.results(), [1, 1, 1, 1]);
  f.write('docs/guide.md', 'change\n');
  f.commit();
  for (const previous of ['', 'HEAD^', 'f'.repeat(40)]) {
    assert.deepEqual(f.results(previous), [1, 1, 1, 1]);
  }
  assert.deepEqual(f.results(f.base, { VERCEL_GIT_COMMIT_SHA: f.base }), [1, 1, 1, 1]);
  const tree = f.git('rev-parse', 'HEAD^{tree}');
  const unrelated = f.git('commit-tree', tree, '-m', 'Unrelated root');
  assert.deepEqual(f.results(unrelated), [1, 1, 1, 1]);
});

test('shallow history skips only when the complete comparison is available', (t) => {
  const f = fixture(t);
  f.write('docs/guide.md', 'change\n');
  f.commit();
  const shallow = join(f.directory, 'shallow');
  f.git('clone', '--quiet', '--depth=2', `file://${f.directory}`, shallow);
  assert.deepEqual(f.results(f.base, {}, shallow), [0, 0, 0, 0]);
  const missingPrevious = join(f.directory, 'missing-previous');
  f.git('clone', '--quiet', '--depth=1', `file://${f.directory}`, missingPrevious);
  assert.deepEqual(f.results(f.base, {}, missingPrevious), [1, 1, 1, 1]);
  const detached = mkdtempSync(join(tmpdir(), 'lacuna-without-git-'));
  t.after(() => rmSync(detached, { recursive: true, force: true }));
  for (const path of ['scripts', 'vercel.json', 'relay', 'gaps', 'library']) {
    cpSync(join(shallow, path), join(detached, path), { recursive: true });
  }
  assert.deepEqual(f.results(f.base, {}, detached), [1, 1, 1, 1]);
});

test('a readable commit with a missing tree fails closed when the diff fails', (t) => {
  const f = fixture(t);
  const tree = f.git('rev-parse', `${f.base}^{tree}`);
  f.write('docs/guide.md', 'change\n');
  const current = f.commit();
  rmSync(join(f.directory, '.git/objects', tree.slice(0, 2), tree.slice(2)));
  f.git('merge-base', '--is-ancestor', f.base, current);
  assert.throws(() => f.git('diff', '--name-status', '-z', f.base, current));
  assert.deepEqual(f.results(), [1, 1, 1, 1]);
});
