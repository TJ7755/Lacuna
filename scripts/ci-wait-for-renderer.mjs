import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const builds = {
  renderer: {
    job: 'electron-renderer',
    publication: 'Share the desktop renderer build',
    prefix: 'windows-electron-renderer-',
    label: 'desktop renderer',
  },
  web: {
    job: 'web-build',
    publication: 'Share the production web build',
    prefix: 'browser-web-dist-',
    label: 'production web',
  },
};

export function readWorkflowRun({ repository, runId, token, request = fetch }) {
  assert.match(repository ?? '', /^[\w.-]+\/[\w.-]+$/);
  assert.match(String(runId), /^[1-9]\d*$/);
  assert.ok(token, 'The workflow read token is required');
  const runUrl = `https://api.github.com/repos/${repository}/actions/runs/${runId}`;
  return async (path) => {
    const response = await request(`${runUrl}/${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000),
    });
    assert.ok(response.ok, `Cannot read workflow ${path}: HTTP ${response.status}`);
    return response.json();
  };
}

export async function readAttemptJobs(read, attempt) {
  assert.match(String(attempt), /^[1-9]\d*$/);
  const { jobs, total_count: count } = await read(`attempts/${attempt}/jobs?per_page=100`);
  assert.ok(
    Array.isArray(jobs) && jobs.length === count && count < 100,
    'The job inventory is incomplete; update pagination before expanding the workflow',
  );
  return jobs;
}

// Consumer setup can overlap the build. Partial retries can reuse a successful
// publication from an earlier attempt for the same source.
export async function waitForRenderer({
  kind = 'renderer',
  repository,
  runId,
  attempt,
  sourceSha,
  token,
  request = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  polls = Infinity,
  // A queued producer must not hold the entire browser matrix indefinitely.
  timeoutMs = kind === 'web' ? 5 * 60 * 1000 : 6 * 60 * 60 * 1000,
}) {
  assert.ok(Object.hasOwn(builds, kind), 'Unknown build kind');
  const build = builds[kind];
  assert.match(String(attempt), /^[1-9]\d*$/);
  assert.match(sourceSha ?? '', /^[a-f0-9]{40}$/);
  const read = readWorkflowRun({ repository, runId, token, request });
  const deadline = Date.now() + timeoutMs;
  const pollIntervals = [
    ...Array(kind === 'web' ? 8 : 3).fill(3_000),
    ...Array(5).fill(15_000),
    ...Array(4).fill(30_000),
  ];
  const steadyInterval = kind === 'web' ? 300_000 : 60_000;
  for (let index = 0; index < polls && Date.now() < deadline; index++) {
    const jobs = await readAttemptJobs(read, attempt);
    const producers = jobs.filter((job) => job.name === build.job);
    assert.ok(producers.length <= 1, `Ambiguous ${build.label} job`);
    const producer = producers[0];
    if (producer) {
      assert.equal(producer.run_id, Number(runId), 'Build belongs to another run');
      assert.equal(producer.head_sha, sourceSha, 'Build tested another source commit');
      assert.ok(
        Number.isSafeInteger(producer.run_attempt) &&
          producer.run_attempt > 0 &&
          producer.run_attempt <= Number(attempt),
        'Invalid build attempt',
      );
      if (producer.status === 'completed') {
        assert.equal(producer.conclusion, 'success', `The ${build.label} job did not pass`);
        const publication = producer.steps?.find(
          (step) =>
            step.name === build.publication &&
            step.status === 'completed' &&
            step.conclusion === 'success',
        );
        assert.ok(publication, `The ${build.label} job did not publish its build`);
        const started = Date.parse(publication.started_at);
        const finished = Date.parse(producer.completed_at);
        assert.ok(
          Number.isFinite(started) && started <= finished,
          'Invalid build publication time',
        );

        // GitHub can copy successful jobs into a partial retry with a new attempt
        // number. The original publication times and artefact name stay fixed.
        for (let candidate = producer.run_attempt; candidate > 0; candidate--) {
          const name = `${build.prefix}${candidate}`;
          const { artifacts, total_count: count } = await read(`artifacts?name=${name}`);
          assert.ok(
            Array.isArray(artifacts) && artifacts.length === count && count <= 1,
            `Ambiguous ${build.label} artefact: ${name}`,
          );
          const artifact = artifacts[0];
          if (!artifact) continue;
          assert.equal(artifact.name, name, `Unexpected ${build.label} artefact`);
          assert.equal(artifact.workflow_run?.id, Number(runId), 'Artefact belongs to another run');
          assert.equal(
            artifact.workflow_run.head_sha,
            sourceSha,
            'Artefact built another source commit',
          );
          const created = Date.parse(artifact.created_at);
          assert.ok(Number.isFinite(created), 'Invalid artefact creation time');
          if (created < started || created > finished) continue;
          assert.equal(artifact.expired, false, `The ${build.label} artefact has expired`);
          assert.ok(Number.isSafeInteger(artifact.id) && artifact.id > 0, 'Invalid artefact ID');
          return artifact.id;
        }
        throw new Error(`No ${build.label} artefact matches the successful publication`);
      }
      assert.ok(
        ['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(producer.status),
        'Unknown build state',
      );
    }
    // Browser consumers start their lookup during install. Keep fast polling
    // through a normal build, then back off during a producer stall.
    if (index + 1 < polls) {
      const interval = pollIntervals[index] ?? steadyInterval;
      await sleep(Math.min(interval, Math.max(0, deadline - Date.now())));
    }
  }
  throw new Error(`Timed out waiting for the ${build.label} build`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const artifactId = await waitForRenderer({
    kind: process.argv[2],
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID,
    attempt: process.env.GITHUB_RUN_ATTEMPT,
    sourceSha: process.env.SOURCE_SHA,
    token: process.env.GH_TOKEN,
  });
  appendFileSync(process.env.GITHUB_OUTPUT, `artifact_id=${artifactId}\n`);
}
