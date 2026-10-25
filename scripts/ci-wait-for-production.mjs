import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Let setup overlap the build. Partial retries reuse successful producers from
// earlier attempts, just as a needs dependency does. Source identity must match.
export async function waitForProduction({
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
  const deadline = Date.now() + timeoutMs;
  for (let index = 0; index < polls && Date.now() < deadline; index++) {
    const response = await request(
      `https://api.github.com/repos/${repository}/actions/runs/${runId}/jobs?filter=latest&per_page=100`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(10_000),
      },
    );
    assert.ok(response.ok, `Cannot read production status: HTTP ${response.status}`);
    const { jobs, total_count: count } = await response.json();
    assert.ok(
      Array.isArray(jobs) && Number.isInteger(count) && count < 100,
      'The job inventory is incomplete; update pagination before expanding the workflow',
    );
    const producers = jobs.filter((job) => job.name === 'production');
    assert.ok(producers.length <= 1, 'Ambiguous production job');
    const producer = producers[0];
    if (producer) {
      assert.equal(producer.run_id, Number(runId), 'Production belongs to another run');
      assert.equal(producer.head_sha, sourceSha, 'Production tested another source commit');
      assert.ok(
        Number.isSafeInteger(producer.run_attempt) &&
          producer.run_attempt > 0 &&
          producer.run_attempt <= Number(attempt),
        'Invalid production attempt',
      );
      if (producer.status === 'completed') {
        assert.equal(producer.conclusion, 'success', 'The production gate did not pass');
        return;
      }
      assert.ok(
        ['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(producer.status),
        'Unknown production state',
      );
    }
    // Twelve consumers share the repository token's rate limit. Back off to one
    // request per minute each if a build is unusually slow.
    if (index + 1 < polls)
      await sleep(index < 3 ? 3_000 : index < 8 ? 15_000 : index < 12 ? 30_000 : 60_000);
  }
  throw new Error('Timed out waiting for the production gate');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await waitForProduction({
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID,
    attempt: process.env.GITHUB_RUN_ATTEMPT,
    sourceSha: process.env.SOURCE_SHA,
    token: process.env.GH_TOKEN,
  });
}
