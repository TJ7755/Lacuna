import assert from 'node:assert/strict';
import { test } from 'node:test';
import { waitForProduction } from './ci-wait-for-production.mjs';

const sourceSha = 'a'.repeat(40);
const producer = (status, conclusion = null) => ({
  name: 'production',
  run_id: 42,
  run_attempt: 2,
  head_sha: sourceSha,
  status,
  conclusion,
});
const options = (states) => ({
  repository: 'owner/repository',
  runId: '42',
  attempt: '2',
  sourceSha,
  token: 'test-token',
  polls: states.length,
  sleep: async () => {},
  request: async (url, init) => {
    assert.equal(
      url,
      'https://api.github.com/repos/owner/repository/actions/runs/42/jobs?filter=latest&per_page=100',
    );
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    const jobs = states.shift();
    return { ok: true, json: async () => ({ jobs, total_count: jobs.length }) };
  },
});

test('partial retries reuse a successful producer from an earlier attempt with the same source', async () => {
  await waitForProduction(options([[{ ...producer('completed', 'success'), run_attempt: 1 }]]));
  for (const overrides of [{ run_attempt: 3 }, { run_attempt: 0 }, { head_sha: 'b'.repeat(40) }])
    await assert.rejects(
      waitForProduction(options([[{ ...producer('completed', 'success'), ...overrides }]])),
    );
});

test('browser setup can overlap production but consumers wait for the current successful attempt', async () => {
  const states = [
    [],
    [producer('queued')],
    [producer('in_progress')],
    [producer('completed', 'success')],
  ];
  await waitForProduction(options(states));
  assert.equal(states.length, 0);
});

test('failed, skipped, cancelled, ambiguous, foreign and unknown production states fail closed', async () => {
  for (const conclusion of ['failure', 'skipped', 'cancelled', null])
    await assert.rejects(waitForProduction(options([[producer('completed', conclusion)]])));
  for (const jobs of [
    [producer('completed', 'success'), producer('completed', 'success')],
    [{ ...producer('completed', 'success'), run_id: 43 }],
    [producer('unknown')],
  ])
    await assert.rejects(waitForProduction(options([jobs])));
  await assert.rejects(waitForProduction(options([[]])), /Timed out/);
});

test('unavailable and truncated API responses cannot authorise a download', async () => {
  for (const response of [
    { ok: false, status: 403 },
    {
      ok: true,
      json: async () => ({ jobs: [producer('completed', 'success')], total_count: 101 }),
    },
  ]) {
    await assert.rejects(waitForProduction({ ...options([[]]), request: async () => response }));
  }
  await assert.rejects(waitForProduction({ ...options([[]]), token: '' }));
  await assert.rejects(waitForProduction({ ...options([[]]), attempt: '0' }));
  await assert.rejects(waitForProduction({ ...options([[]]), timeoutMs: 0 }), /Timed out/);
});

test('slow builds back off within the shared repository API budget', async () => {
  const delays = [];
  await waitForProduction({
    ...options([...Array.from({ length: 14 }, () => []), [producer('completed', 'success')]]),
    sleep: async (delay) => {
      delays.push(delay);
    },
  });
  assert.deepEqual(delays, [
    ...Array(3).fill(3_000),
    ...Array(5).fill(15_000),
    ...Array(4).fill(30_000),
    ...Array(2).fill(60_000),
  ]);
});
