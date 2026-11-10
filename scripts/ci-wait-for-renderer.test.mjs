import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readAttemptJobs, waitForRenderer } from './ci-wait-for-renderer.mjs';

const sourceSha = 'a'.repeat(40);
const publication = {
  name: 'Share the desktop renderer build',
  status: 'completed',
  conclusion: 'success',
  started_at: '2026-11-08T08:44:52Z',
  completed_at: '2026-11-08T08:45:00Z',
};
const producer = (status, conclusion = null) => ({
  name: 'electron-renderer',
  run_id: 42,
  run_attempt: 2,
  head_sha: sourceSha,
  status,
  conclusion,
  completed_at: '2026-11-08T08:45:04Z',
  steps: status === 'completed' ? [publication] : [],
});
const artifact = (attempt) => ({
  id: 13610574896 + attempt,
  name: `windows-electron-renderer-${attempt}`,
  expired: false,
  created_at: publication.completed_at,
  workflow_run: { id: 42, head_sha: sourceSha },
});
const options = (states, artifacts = [artifact(2)]) => ({
  repository: 'owner/repository',
  runId: '42',
  attempt: '2',
  sourceSha,
  token: 'test-token',
  polls: states.length,
  sleep: async () => {},
  request: async (url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    const search = new URL(url);
    if (search.pathname.endsWith('/artifacts')) {
      const results = artifacts.filter((item) => item.name === search.searchParams.get('name'));
      return { ok: true, json: async () => ({ artifacts: results, total_count: results.length }) };
    }
    assert.equal(
      url,
      'https://api.github.com/repos/owner/repository/actions/runs/42/attempts/2/jobs?per_page=100',
    );
    const jobs = states.shift();
    return { ok: true, json: async () => ({ jobs, total_count: jobs.length }) };
  },
});

test('a copied successful job on a retry still selects the artefact it actually uploaded', async () => {
  assert.equal(
    await waitForRenderer(options([[producer('completed', 'success')]], [artifact(1)])),
    artifact(1).id,
  );
});

test('a copied web build selects its own published artefact during browser setup', async () => {
  const renderer = producer('completed', 'success');
  const web = {
    ...renderer,
    name: 'web-build',
    steps: [{ ...publication, name: 'Share the production web build' }],
  };
  const published = { ...artifact(1), name: 'browser-web-dist-1' };
  const unrelated = {
    ...artifact(2),
    name: 'browser-web-dist-2',
    created_at: '2026-11-08T08:41:00Z',
  };
  assert.equal(
    await waitForRenderer({
      ...options([[renderer, web]], [artifact(2), unrelated, published]),
      kind: 'web',
    }),
    published.id,
  );
});

test('Windows setup can overlap a renderer build that must complete before use', async () => {
  const states = [
    [],
    [producer('queued')],
    [producer('in_progress')],
    [{ ...producer('in_progress'), steps: [publication] }],
    [producer('completed', 'success')],
  ];
  assert.equal(await waitForRenderer(options(states)), artifact(2).id);
  assert.equal(states.length, 0);
});

test('another publication, expired artefacts and foreign artefacts cannot satisfy the renderer job', async () => {
  const completed = producer('completed', 'success');
  for (const [candidate, message] of [
    [{ ...artifact(1), created_at: '2026-11-08T08:41:00Z' }, /matches the successful publication/],
    [{ ...artifact(2), expired: true }, /has expired/],
    [{ ...artifact(2), workflow_run: { id: 43, head_sha: sourceSha } }, /belongs to another run/],
    [
      { ...artifact(2), workflow_run: { id: 42, head_sha: 'b'.repeat(40) } },
      /another source commit/,
    ],
  ]) {
    await assert.rejects(waitForRenderer(options([[completed]], [candidate])), message);
  }
});

test('failed, skipped, cancelled, ambiguous, foreign and unknown renderer states fail closed', async () => {
  for (const conclusion of ['failure', 'skipped', 'cancelled', null])
    await assert.rejects(waitForRenderer(options([[producer('completed', conclusion)]])));
  for (const jobs of [
    [producer('completed', 'success'), producer('completed', 'success')],
    [{ ...producer('completed', 'success'), run_id: 43 }],
    [{ ...producer('completed', 'success'), run_attempt: 3 }],
    [{ ...producer('completed', 'success'), run_attempt: 0 }],
    [{ ...producer('completed', 'success'), head_sha: 'b'.repeat(40) }],
    [{ ...producer('completed', 'success'), steps: [] }],
    [{ ...producer('completed', 'success'), steps: [{ ...publication, conclusion: 'failure' }] }],
    [producer('unknown')],
  ])
    await assert.rejects(waitForRenderer(options([jobs])));
  await assert.rejects(waitForRenderer(options([[]])), /Timed out/);
});

test('unavailable and truncated API responses cannot authorise a download', async () => {
  for (const response of [
    { ok: false, status: 403 },
    {
      ok: true,
      json: async () => ({ jobs: [producer('completed', 'success')], total_count: 101 }),
    },
  ]) {
    await assert.rejects(waitForRenderer({ ...options([[]]), request: async () => response }));
  }
  await assert.rejects(waitForRenderer({ ...options([[]]), token: '' }));
  await assert.rejects(waitForRenderer({ ...options([[]]), attempt: '0' }));
  await assert.rejects(waitForRenderer({ ...options([[]]), timeoutMs: 0 }), /Timed out/);
});

test('temporarily incomplete job inventory is retried without accepting a partial list', async () => {
  const jobs = [producer('completed', 'success')];
  let reads = 0;
  const sleep = async () => {};
  const read = async () => ({ jobs, total_count: ++reads < 3 ? 2 : 1 });
  assert.deepEqual(await readAttemptJobs(read, 2, sleep), jobs);
  assert.equal(reads, 3);
  await assert.rejects(
    readAttemptJobs(async () => ({ jobs, total_count: 2 }), 2, sleep),
    /incomplete after retrying/,
  );
});

test('slow builds back off within the shared repository API budget', async () => {
  for (const [kind, fastPolls, steadyInterval] of [
    ['renderer', 3, 60_000],
    ['web', 8, 300_000],
  ]) {
    const delays = [];
    await assert.rejects(
      waitForRenderer({
        ...options(Array.from({ length: fastPolls + 12 }, () => [])),
        kind,
        timeoutMs: 600_000,
        sleep: async (delay) => {
          delays.push(delay);
        },
      }),
      /Timed out/,
    );
    assert.deepEqual(delays, [
      ...Array(fastPolls).fill(3_000),
      ...Array(5).fill(15_000),
      ...Array(4).fill(30_000),
      ...Array(2).fill(steadyInterval),
    ]);
  }
});
