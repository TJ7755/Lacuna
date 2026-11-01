import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nightlyVersion, matchesReleaseVersion } from './nightly-release.mjs';

test('nightlies occupy the next patch prerelease and reject unrelated source versions', () => {
  const version = nightlyVersion('0.2.18', 1793498400, 12345);
  assert.equal(version, '0.2.19-beta.nightly.1793498400.12345');
  assert(matchesReleaseVersion('0.2.18', version));
  assert(matchesReleaseVersion('0.2.19', '0.2.19'));
  assert(!matchesReleaseVersion('0.2.19', version));
  assert(!matchesReleaseVersion('0.2.18', '0.2.19-beta.nightly.01.12345'));
  assert.throws(() => nightlyVersion('0.2.18', 1, 'bad'));
});

function fixture({ releases = [], runs = successfulRuns(), current = 'head', event } = {}) {
  const calls = [];
  const messages = [];
  return {
    calls,
    messages,
    options: {
      git: () => 'head',
      gh: (...args) => {
        calls.push(args);
        if (args.some((arg) => arg.includes('/releases?'))) return JSON.stringify([releases]);
        if (args.some((arg) => arg.includes('/actions/runs?')))
          return JSON.stringify([{ workflow_runs: runs }]);
        if (args.some((arg) => arg.endsWith('/git/ref/heads/master')))
          return JSON.stringify({ object: { sha: current } });
        return '';
      },
      repository: 'owner/repo',
      version: '0.2.18',
      timestamp: 1793498400,
      runId: 12345,
      output: null,
      summary: null,
      event,
    },
  };
}
function successfulRuns() {
  return ['ci', 'security'].map((name, id) => ({
    id,
    path: `.github/workflows/${name}.yml`,
    head_sha: 'head',
    head_branch: 'master',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
  }));
}

import { main } from './nightly-release.mjs';

test('skips unchanged published nightlies but excludes drafts', () => {
  const unchanged = fixture({
    releases: [{ draft: false, tag_name: 'v0.2.19-beta.nightly.1.1', published_at: '2026-11-01' }],
  });
  main(unchanged.options);
  assert.equal(unchanged.calls.length, 1);
  const draft = fixture({ releases: [{ draft: true, tag_name: 'v0.2.19-beta.nightly.1.1' }] });
  main(draft.options);
  assert(draft.calls.some((args) => args.includes('POST')));
  assert(draft.calls.some((args) => args[0] === 'workflow'));
});

test('cancelled, pending, failed and superseded exact-SHA runs never create a tag', () => {
  for (const name of ['ci', 'security']) {
    for (const conclusion of ['cancelled', 'failure', 'timed_out', 'skipped', null]) {
      const runs = successfulRuns();
      const previous = runs.find((run) => run.path.includes(`/${name}.`));
      runs.push({
        ...previous,
        id: 100,
        conclusion,
        status: conclusion ? 'completed' : 'in_progress',
      });
      const scenario = fixture({ runs });
      main(scenario.options);
      assert(!scenario.calls.some((args) => args.includes('POST')), `${name}: ${conclusion}`);
    }
  }
  for (const runs of [[], successfulRuns().map((run) => ({ ...run, head_sha: 'older' }))]) {
    const scenario = fixture({ runs });
    main(scenario.options);
    assert(!scenario.calls.some((args) => args.includes('POST')));
  }
});

test('skips a superseded checkout and the first scheduled night', () => {
  for (const scenario of [fixture({ current: 'newer' }), fixture({ event: 'schedule' })]) {
    main(scenario.options);
    assert(!scenario.calls.some((args) => args.includes('POST')));
  }
});
