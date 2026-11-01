import assert from 'node:assert/strict';
import test from 'node:test';
import { prerequisites } from './deploy-prerequisites.mjs';

test('deployment requires both latest successful master push runs for the exact commit', () => {
  const runs = ['ci', 'security'].map((name, id) => ({
    id,
    path: `.github/workflows/${name}.yml`,
    head_sha: 'source',
    head_branch: 'master',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
  }));
  assert(prerequisites(runs, 'source').every(({ state }) => state === 'success'));
  assert(prerequisites(runs, 'other').every(({ state }) => state === 'pending'));
  assert.equal(prerequisites([runs[0]], 'source')[1].state, 'pending');
  assert.equal(
    prerequisites([...runs, { ...runs[0], id: 5, conclusion: 'failure' }], 'source')[0].state,
    'failed',
  );
  assert.equal(
    prerequisites([{ ...runs[0], event: 'pull_request' }], 'source')[0].state,
    'pending',
  );
});
