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

test('skips an already published master and retries drafts through the shared release builder', async () => {
  const { main } = await import('./nightly-release.mjs');
  const calls = [];
  const options = {
    git: (...args) => (args[1] === 'HEAD' ? 'head' : 'head'),
    gh: (...args) => {
      calls.push(args);
      return JSON.stringify([[{ draft: false, tag_name: 'v0.2.18', published_at: '2026-11-01' }]]);
    },
    repository: 'owner/repo',
    version: '0.2.18',
    timestamp: 1793498400,
    runId: 12345,
    output: null,
  };
  main(options);
  assert.equal(calls.length, 1);
  calls.length = 0;
  main({
    ...options,
    gh: (...args) => {
      calls.push(args);
      return JSON.stringify([[{ draft: true, tag_name: 'v0.2.18' }]]);
    },
  });
  assert.deepEqual(calls[1], [
    'api',
    '--method',
    'POST',
    'repos/owner/repo/git/refs',
    '-f',
    'ref=refs/tags/v0.2.19-beta.nightly.1793498400.12345',
    '-f',
    'sha=head',
  ]);
  assert.deepEqual(calls[2], [
    'workflow',
    'run',
    'release.yml',
    '--ref',
    'v0.2.19-beta.nightly.1793498400.12345',
  ]);
});
