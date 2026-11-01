import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function nextPatch(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

export function nightlyVersion(version, timestamp, runId) {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.match(String(timestamp), /^[1-9]\d*$/);
  assert.match(String(runId), /^[1-9]\d*$/);
  return `${nextPatch(version)}-beta.nightly.${timestamp}.${runId}`;
}

export function matchesReleaseVersion(source, version) {
  return (
    source === version ||
    new RegExp(
      `^${nextPatch(source).replaceAll('.', '\\.')}-beta\\.nightly\\.[1-9]\\d*\\.[1-9]\\d*$`,
    ).test(version)
  );
}

export function main({
  git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim(),
  gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim(),
  repository = process.env.GITHUB_REPOSITORY,
  runId = process.env.GITHUB_RUN_ID,
  timestamp = Math.floor(Date.now() / 1000),
  version = JSON.parse(readFileSync('package.json', 'utf8')).version,
  output = process.env.GITHUB_OUTPUT,
} = {}) {
  const head = git('rev-parse', 'HEAD');
  // Include prereleases, exclude drafts, and do not rely on GitHub's stable-only latest endpoint.
  const releases = JSON.parse(
    gh('api', '--paginate', '--slurp', `repos/${repository}/releases?per_page=100`),
  ).flat();
  const latest = releases
    .filter((release) => !release.draft)
    .sort((a, b) => b.published_at.localeCompare(a.published_at))[0];
  if (latest && git('rev-parse', `${latest.tag_name}^{commit}`) === head) {
    console.log('Master has not changed since the last published release.');
    return;
  }
  const next = nightlyVersion(version, timestamp, runId);
  const tag = `v${next}`;
  gh(
    'api',
    '--method',
    'POST',
    `repos/${repository}/git/refs`,
    '-f',
    `ref=refs/tags/${tag}`,
    '-f',
    `sha=${head}`,
  );
  gh('workflow', 'run', 'release.yml', '--ref', tag);
  if (output) appendFileSync(output, `version=${next}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
