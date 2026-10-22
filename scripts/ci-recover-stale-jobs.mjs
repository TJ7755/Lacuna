import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const workflows = new Set(['.github/workflows/ci.yml', '.github/workflows/security.yml']);

function githubApi(endpoint, { method = 'GET', paginate = false } = {}) {
  const args = ['api', endpoint, '--method', method];
  if (paginate) args.push('--paginate', '--slurp');
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }));
}

export function recoverStaleJob({ repository, runId, api = githubApi }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^[1-9]\d*$/.test(String(runId))) {
    throw new Error('A repository and numeric workflow run id are required');
  }
  const base = `repos/${repository}/actions`;
  const run = api(`${base}/runs/${runId}`);
  if (
    run.repository?.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    !workflows.has(run.path) ||
    run.status !== 'completed' ||
    run.conclusion !== 'success'
  ) {
    return 'No recovery: only successful CI or Security runs from this repository are eligible.';
  }
  const pages = api(`${base}/runs/${runId}/jobs?filter=latest&per_page=100`, { paginate: true });
  const pending = pages.flatMap((page) => page.jobs).filter((job) => job.status !== 'completed');
  if (!pending.length) return 'No stale jobs: all job records are complete.';
  if (run.run_attempt !== 1) {
    throw new Error('Job records are still incomplete after a retry; inspect the run manually.');
  }
  // Retrying a job can also rerun its dependants. Never start a second recovery attempt.
  if (pending.length !== 1) {
    throw new Error('Multiple job records are incomplete; inspect the run before retrying.');
  }
  const job = pending[0];
  if (
    job.status !== 'in_progress' ||
    job.run_id !== run.id ||
    job.head_sha !== run.head_sha ||
    !job.steps?.length ||
    !job.steps.every(
      (step) => step.status === 'completed' && ['success', 'skipped'].includes(step.conclusion),
    ) ||
    job.steps.at(-1).name !== 'Complete job' ||
    job.steps.at(-1).conclusion !== 'success'
  ) {
    throw new Error('The incomplete job has no evidence of successful runner completion; no retry.');
  }
  // Check again immediately before writing: another actor may already have retried the run.
  const current = api(`${base}/runs/${runId}`);
  if (current.run_attempt !== 1 || current.status !== 'completed' || current.conclusion !== 'success') {
    return 'No recovery: the workflow changed while its jobs were inspected.';
  }
  api(`${base}/jobs/${job.id}/rerun`, { method: 'POST' });
  return `Requested one retry of ${job.name} (job ${job.id}); its real result still controls merging.`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(recoverStaleJob({ repository: process.env.GH_REPO, runId: process.env.RUN_ID }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
