import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parse } from 'yaml';
import { githubApi, recoverStaleJob } from './ci-recover-stale-jobs.mjs';

const retryGroup =
  "ci-${{ github.run_attempt > 1 && format('retry-{0}', github.run_id) || github.event.pull_request.number || github.sha }}";

function fixture(overrides = {}, jobOverrides = {}) {
  const run = {
    display_title: `${overrides.path === '.github/workflows/security.yml' ? 'Security' : 'CI validation'} ${'a'.repeat(40)}`,
    id: 42,
    run_attempt: 1,
    status: 'completed',
    conclusion: 'success',
    head_sha: 'candidate',
    head_branch: 'feature',
    repository: { full_name: 'owner/repo' },
    head_repository: { full_name: 'owner/repo' },
    path: '.github/workflows/ci.yml',
    ...overrides,
  };
  const job = {
    id: 7,
    run_id: 42,
    head_sha: 'candidate',
    name: 'browser-smoke',
    status: 'in_progress',
    steps: [
      { name: 'Require all browser jobs', status: 'completed', conclusion: 'success' },
      { name: 'Require successful reused validation', status: 'completed', conclusion: 'skipped' },
      { name: 'Complete job', status: 'completed', conclusion: 'success' },
    ],
    ...jobOverrides,
  };
  const writes = [];
  const requests = [];
  let reads = 0;
  const invoke = ({
    jobs = [job],
    current = run,
    head = 'candidate',
    definition = { concurrency: { group: retryGroup }, jobs: {} },
  } = {}) =>
    recoverStaleJob({
      repository: 'owner/repo',
      runId: 42,
      api(endpoint, options = {}) {
        requests.push(endpoint);
        if (options.method === 'POST') {
          writes.push(endpoint);
          return {};
        }
        if (options.paginate) return [{ jobs: [] }, { jobs }];
        if (endpoint.includes('/git/ref/')) return { object: { sha: head } };
        if (endpoint.includes('/contents/'))
          return {
            encoding: 'base64',
            content: Buffer.from(JSON.stringify(definition)).toString('base64'),
          };
        return ++reads === 1 ? run : current;
      },
    });
  return { run, job, writes, requests, invoke };
}

test('recovers the observed completed-workflow/running-job mismatch using one real rerun', () => {
  for (const path of ['.github/workflows/ci.yml', '.github/workflows/security.yml']) {
    const f = fixture({ path });
    assert.match(f.invoke(), /Requested one retry/);
    assert.deepEqual(f.writes, ['repos/owner/repo/actions/jobs/7/rerun']);
  }
});

test('never retries failed, cancelled, active, unrelated or fork runs', () => {
  for (const overrides of [
    { conclusion: 'failure' },
    { conclusion: 'cancelled' },
    { status: 'in_progress' },
    { path: '.github/workflows/release.yml' },
    { head_repository: { full_name: 'fork/repo' } },
    { repository: { full_name: 'other/repo' } },
  ]) {
    const f = fixture(overrides);
    assert.match(f.invoke(), /No recovery/);
    assert.deepEqual(f.writes, []);
  }
});

test('leaves actual work and missing or failed completion evidence alone', () => {
  for (const overrides of [
    { status: 'queued' },
    { run_id: 99 },
    { head_sha: 'other' },
    { steps: [] },
    { steps: [{ name: 'Complete job', status: 'in_progress', conclusion: null }] },
    { steps: [{ name: 'Complete job', status: 'completed', conclusion: 'failure' }] },
    { steps: [{ name: 'Tests', status: 'completed', conclusion: 'success' }] },
    {
      steps: [
        { name: 'Tests', status: 'completed', conclusion: 'failure' },
        { name: 'Complete job', status: 'completed', conclusion: 'success' },
      ],
    },
  ]) {
    const f = fixture({}, overrides);
    assert.throws(() => f.invoke(), /no evidence/);
    assert.deepEqual(f.writes, []);
  }
});

test('does not retry again or start overlapping recoveries', () => {
  const repeated = fixture({ run_attempt: 2 });
  assert.throws(() => repeated.invoke(), /after a retry/);
  const multiple = fixture();
  assert.throws(
    () => multiple.invoke({ jobs: [multiple.job, { ...multiple.job, id: 8 }] }),
    /Multiple/,
  );
  const changed = fixture();
  assert.match(changed.invoke({ current: { ...changed.run, run_attempt: 2 } }), /workflow changed/);
  for (const f of [repeated, multiple, changed]) assert.deepEqual(f.writes, []);
});

test('normal successful runs need no writes', () => {
  const f = fixture({ run_attempt: 2 }, { status: 'completed' });
  assert.match(f.invoke(), /No stale jobs/);
  assert.deepEqual(f.writes, []);
});

test('privileged recovery runs default-branch code and rejects unsuccessful or fork events', () => {
  const workflow = parse(
    readFileSync(new URL('../.github/workflows/ci-recovery.yml', import.meta.url), 'utf8'),
  );
  assert.deepEqual(Object.keys(workflow.on), ['workflow_run']);
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'write' });
  const job = workflow.jobs.recover;
  const checkout = job.steps.find((step) => step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with.ref, '${{ github.sha }}');
  assert.equal(checkout.with['persist-credentials'], false);
  for (const [conclusion, repository, expected] of [
    ['success', 'owner/repo', true],
    ['failure', 'owner/repo', false],
    ['cancelled', 'owner/repo', false],
    ['success', 'fork/repo', false],
  ]) {
    assert.equal(
      runInNewContext(job.if, {
        github: {
          repository: 'owner/repo',
          event: {
            workflow_run: { conclusion, head_repository: { full_name: repository } },
          },
        },
      }),
      expected,
    );
  }
});

test('the gh wrapper accepts an empty successful POST without hiding command or GET failures', () => {
  let called;
  const result = githubApi('repos/owner/repo/actions/jobs/7/rerun', {
    method: 'POST',
    execute(command, args) {
      called = { command, args };
      return '';
    },
  });
  assert.equal(result, null);
  assert.deepEqual(called, {
    command: 'gh',
    args: ['api', 'repos/owner/repo/actions/jobs/7/rerun', '--method', 'POST'],
  });
  assert.throws(() => githubApi('read', { execute: () => '' }), SyntaxError);
  assert.throws(
    () =>
      githubApi('write', {
        method: 'POST',
        execute() {
          throw new Error('HTTP 403');
        },
      }),
    /HTTP 403/,
  );
});

test('old candidates and workflow definitions without retry isolation cannot start recovery', () => {
  const obsolete = fixture();
  assert.match(obsolete.invoke({ head: 'newer-commit' }), /branch has moved/);
  assert.deepEqual(obsolete.writes, []);
  for (const definition of [
    { concurrency: { group: 'ci-${{ github.event.pull_request.number }}' } },
    { jobs: { check: { concurrency: { group: 'shared' } } } },
  ]) {
    const legacy = fixture();
    assert.match(legacy.invoke({ definition }), /concurrency is not isolated/);
    assert.deepEqual(legacy.writes, []);
  }
  const security = fixture({ path: '.github/workflows/security.yml' });
  assert.match(security.invoke({ definition: { jobs: {} } }), /Requested one retry/);
});

test('inspects the tested merge commit instead of the PR head and excludes unversioned legacy runs', () => {
  const f = fixture();
  assert.match(f.invoke(), /Requested one retry/);
  assert.ok(
    f.requests.includes(`repos/owner/repo/contents/.github/workflows/ci.yml?ref=${'a'.repeat(40)}`),
  );
  assert.ok(!f.requests.some((endpoint) => endpoint.endsWith('?ref=candidate')));
  const legacy = fixture({ display_title: 'Old workflow' });
  assert.match(legacy.invoke(), /tested workflow commit is not recorded/);
  assert.deepEqual(legacy.writes, []);
});
