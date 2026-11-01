import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { workflowState } from './release.mjs';

export function prerequisites(runs, sha) {
  return ['ci', 'security'].map((name) =>
    workflowState(runs, `.github/workflows/${name}.yml`, sha, ['master']),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const deadline = Date.now() + 5 * 60 * 60 * 1000;
  for (;;) {
    const pages = JSON.parse(
      execFileSync(
        'gh',
        [
          'api',
          '--paginate',
          '--slurp',
          `repos/${process.env.GITHUB_REPOSITORY}/actions/runs?head_sha=${process.env.GITHUB_SHA}&per_page=100`,
        ],
        { encoding: 'utf8' },
      ),
    );
    const states = prerequisites(
      pages.flatMap((page) => page.workflow_runs),
      process.env.GITHUB_SHA,
    );
    assert(
      !states.some(({ state }) => state === 'failed'),
      'CI or Security failed for this commit',
    );
    if (states.every(({ state }) => state === 'success')) break;
    assert(Date.now() < deadline, 'Timed out waiting for CI and Security');
    await setTimeout(60_000);
  }
}
