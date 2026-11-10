import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readAttemptJobs, readWorkflowRun } from './ci-wait-for-renderer.mjs';

const downloadPrefix = 'Download production web build ';

export async function requireBrowserArtefact({
  repository,
  runId,
  attempt,
  sourceSha,
  token,
  artifactId,
  functionalShards,
  request,
}) {
  assert.match(sourceSha ?? '', /^[a-f0-9]{40}$/);
  assert.match(artifactId ?? '', /^[1-9]\d*$/, 'The production web build must publish an artefact');
  assert.ok(Number.isSafeInteger(Number(artifactId)), 'Invalid artefact ID');
  assert.ok(
    Number.isInteger(functionalShards) && functionalShards > 0 && functionalShards <= 32,
    'Invalid functional matrix size',
  );
  const expected = new Set([
    ...Array.from({ length: functionalShards }, (_, index) => `browser-tests (${index + 1})`),
    'browser-timing (chromium-image-performance, 1, 1)',
    'browser-timing (chromium-study-performance, 1, 3)',
    'browser-timing (chromium-study-performance, 2, 3)',
    'browser-timing (chromium-study-performance, 3, 3)',
  ]);
  const read = readWorkflowRun({ repository, runId, token, request });
  const jobs = await readAttemptJobs(read, attempt);
  const consumers = jobs.filter(({ name }) => /^browser-(tests|timing) \(/.test(name));
  assert.equal(consumers.length, expected.size, 'The browser job inventory is incomplete');
  for (const job of consumers) {
    assert.ok(expected.delete(job.name), `Unexpected or duplicate browser job: ${job.name}`);
    assert.equal(job.run_id, Number(runId), `${job.name} belongs to another run`);
    assert.ok(
      Number.isSafeInteger(job.run_attempt) &&
        job.run_attempt > 0 &&
        job.run_attempt <= Number(attempt),
      `${job.name} has an invalid attempt`,
    );
    assert.equal(job.head_sha, sourceSha, `${job.name} tested another source commit`);
    assert.equal(job.status, 'completed', `${job.name} is incomplete`);
    assert.equal(job.conclusion, 'success', `${job.name} did not pass`);
    const downloads = job.steps?.filter((step) => step.name.startsWith(downloadPrefix));
    assert.equal(downloads?.length, 1, `${job.name} must download exactly one production build`);
    const [download] = downloads;
    assert.equal(download.status, 'completed', `${job.name} did not finish its artefact download`);
    assert.equal(download.conclusion, 'success', `${job.name} failed its artefact download`);
    // An isolated build rerun can leave copied browser jobs tied to the previous artefact.
    assert.equal(
      download.name,
      `${downloadPrefix}${artifactId}`,
      `${job.name} tested another artefact`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await requireBrowserArtefact({
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID,
    attempt: process.env.GITHUB_RUN_ATTEMPT,
    sourceSha: process.env.SOURCE_SHA,
    token: process.env.GH_TOKEN,
    artifactId: process.env.WEB_ARTIFACT_ID,
    functionalShards: Number(process.env.FUNCTIONAL_SHARDS),
  });
}
