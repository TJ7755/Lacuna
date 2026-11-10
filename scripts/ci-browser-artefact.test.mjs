import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requireBrowserArtefact } from './ci-browser-artefact.mjs';

const sourceSha = 'a'.repeat(40);
const artifactId = '13610574896';
const names = [
  'browser-tests (1)',
  'browser-tests (2)',
  'browser-timing (chromium-image-performance, 1, 1)',
  'browser-timing (chromium-study-performance, 1, 3)',
  'browser-timing (chromium-study-performance, 2, 3)',
  'browser-timing (chromium-study-performance, 3, 3)',
];
const successfulJobs = () =>
  names.map((name) => ({
    name,
    run_id: 42,
    run_attempt: 2,
    head_sha: sourceSha,
    status: 'completed',
    conclusion: 'success',
    steps: [
      {
        name: `Download production web build ${artifactId}`,
        status: 'completed',
        conclusion: 'success',
      },
    ],
  }));

const check = (jobs, count = jobs.length) =>
  requireBrowserArtefact({
    repository: 'owner/repository',
    runId: '42',
    attempt: '2',
    sourceSha,
    token: 'test-token',
    artifactId,
    functionalShards: 2,
    request: async (url, init) => {
      assert.match(url, /\/runs\/42\/attempts\/2\/jobs\?per_page=100$/);
      assert.equal(init.headers.Authorization, 'Bearer test-token');
      return { ok: true, json: async () => ({ jobs, total_count: count }) };
    },
  });

test('the full browser gate requires every functional and timing job to test the production artefact', async () => {
  const jobs = successfulJobs();
  await check(jobs);
  await assert.rejects(check(jobs.slice(1)), /browser job inventory is incomplete/);
  await assert.rejects(check(jobs, jobs.length + 1), /job inventory is incomplete/);
  await assert.rejects(check([...jobs.slice(1), jobs[1]]), /duplicate browser job/);
});

test('copied browser results cannot pass after the build publishes a replacement artefact', async () => {
  for (const [overrides, expected] of [
    [{ name: 'Download production web build 13610574895' }, /tested another artefact/],
    [
      { name: 'Download production web build ${{ steps.web-dist.outputs.artifact_id }}' },
      /tested another artefact/,
    ],
    [{ conclusion: 'failure' }, /failed its artefact download/],
  ]) {
    const jobs = successfulJobs();
    Object.assign(jobs[0].steps[0], overrides);
    await assert.rejects(check(jobs), expected);
  }
  const jobs = successfulJobs();
  jobs[0].head_sha = 'b'.repeat(40);
  await assert.rejects(check(jobs), /tested another source commit/);
});
