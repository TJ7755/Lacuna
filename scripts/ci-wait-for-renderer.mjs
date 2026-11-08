import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Windows dependency setup overlaps the Ubuntu build. Partial retries can reuse
// a successful renderer from an earlier attempt for the same source.
export async function waitForRenderer({
  repository,
  runId,
  attempt,
  sourceSha,
  token,
  request = fetch,
  // Match GitHub's existing six-hour job budget; do not add a shorter build limit.
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  polls = Infinity,
  timeoutMs = 6 * 60 * 60 * 1000,
}) {
  assert.match(repository ?? '', /^[\w.-]+\/[\w.-]+$/);
  assert.match(String(runId), /^[1-9]\d*$/);
  assert.match(String(attempt), /^[1-9]\d*$/);
  assert.match(sourceSha ?? '', /^[a-f0-9]{40}$/);
  assert.ok(token, 'The workflow read token is required');
  const runUrl = `https://api.github.com/repos/${repository}/actions/runs/${runId}`;
  const read = async (path) => {
    const response = await request(`${runUrl}/${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000),
    });
    assert.ok(response.ok, `Cannot read workflow ${path}: HTTP ${response.status}`);
    return response.json();
  };
  const deadline = Date.now() + timeoutMs;
  for (let index = 0; index < polls && Date.now() < deadline; index++) {
    const { jobs, total_count: count } = await read(`attempts/${attempt}/jobs?per_page=100`);
    assert.ok(
      Array.isArray(jobs) && Number.isInteger(count) && count < 100,
      'The job inventory is incomplete; update pagination before expanding the workflow',
    );
    const producers = jobs.filter((job) => job.name === 'electron-renderer');
    assert.ok(producers.length <= 1, 'Ambiguous desktop renderer job');
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
        assert.equal(producer.conclusion, 'success', 'The desktop renderer job did not pass');
        const publication = producer.steps?.find(
          (step) =>
            step.name === 'Share the desktop renderer build' &&
            step.status === 'completed' &&
            step.conclusion === 'success',
        );
        assert.ok(publication, 'The desktop renderer job did not publish its build');
        const started = Date.parse(publication.started_at);
        const finished = Date.parse(producer.completed_at);
        assert.ok(
          Number.isFinite(started) && started <= finished,
          'Invalid build publication time',
        );

        // GitHub can copy successful jobs into a partial retry with a new attempt
        // number. The original publication times and artefact name stay fixed.
        for (let candidate = producer.run_attempt; candidate > 0; candidate--) {
          const name = `windows-electron-renderer-${candidate}`;
          const { artifacts, total_count: count } = await read(`artifacts?name=${name}`);
          assert.ok(
            Array.isArray(artifacts) && artifacts.length === count && count <= 1,
            `Ambiguous desktop renderer artefact: ${name}`,
          );
          const artifact = artifacts[0];
          if (!artifact) continue;
          assert.equal(artifact.name, name, 'Unexpected desktop renderer artefact');
          assert.equal(artifact.workflow_run?.id, Number(runId), 'Artefact belongs to another run');
          assert.equal(
            artifact.workflow_run.head_sha,
            sourceSha,
            'Artefact built another source commit',
          );
          const created = Date.parse(artifact.created_at);
          assert.ok(Number.isFinite(created), 'Invalid artefact creation time');
          if (created < started || created > finished) continue;
          assert.equal(artifact.expired, false, 'The desktop renderer artefact has expired');
          assert.ok(Number.isSafeInteger(artifact.id) && artifact.id > 0, 'Invalid artefact ID');
          return artifact.id;
        }
        throw new Error('No desktop renderer artefact matches the successful publication');
      }
      assert.ok(
        ['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(producer.status),
        'Unknown build state',
      );
    }
    // The consumers share the repository token's rate limit. Back off to one
    // request per minute each if a build is unusually slow.
    if (index + 1 < polls)
      await sleep(index < 3 ? 3_000 : index < 8 ? 15_000 : index < 12 ? 30_000 : 60_000);
  }
  throw new Error('Timed out waiting for the desktop renderer build');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const artifactId = await waitForRenderer({
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID,
    attempt: process.env.GITHUB_RUN_ATTEMPT,
    sourceSha: process.env.SOURCE_SHA,
    token: process.env.GH_TOKEN,
  });
  appendFileSync(process.env.GITHUB_OUTPUT, `artifact_id=${artifactId}\n`);
}
