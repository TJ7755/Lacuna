import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { affectedProjects } from './vercel-deploy-scope.mjs';

test('documentation changes deploy nothing', () => {
  assert.deepEqual(affectedProjects(['docs/maintenance/release.md']), []);
});
test('shared and unknown changes fail open to all projects', () => {
  for (const paths of [[], ['bun.lock'], ['packages/core/src/index.ts']]) {
    assert.equal(affectedProjects(paths).length, 4);
  }
});
test('standalone site changes retain the shared frontend build dependency', () => {
  assert.deepEqual(
    affectedProjects(['apps/gaps/src/main.ts']).map(({ name }) => name),
    ['lacuna', 'lacuna-gaps', 'lacuna-library'],
  );
});
test('all projects disable Git deployments without an ignored-build hook', () => {
  for (const path of [
    'vercel.json',
    'apps/relay/vercel.json',
    'apps/gaps/vercel.json',
    'apps/library/vercel.json',
  ]) {
    const config = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(config.git.deploymentEnabled, false);
    assert.equal(config.ignoreCommand, undefined);
  }
});
