import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { main as foldChangelog } from './changelog.mjs';
import { releaseAssets } from './release-assets.mjs';

const repository = 'TJ7755/Lacuna';
const root = resolve(import.meta.dirname, '..');

/** Reads the published installer digest GitHub recorded for a release. */
export function installerDigest(release, version) {
  assert(!release.draft, `v${version} is still a draft; publish it before preparing the next`);
  const name = `Lacuna-Setup-${version}.exe`;
  const digest = release.assets.find((asset) => asset.name === name)?.digest;
  assert.match(digest ?? '', /^sha256:[a-f0-9]{64}$/, `v${version} has no ${name} digest`);
  return digest.slice('sha256:'.length);
}

/**
 * Bumps package.json, folds the changelog fragments and pins the Windows upgrade gate to
 * the release being replaced. Release notes in docs/releases/<version>.md stay hand-written.
 */
export async function main(args, { directory = root, fetchRelease } = {}) {
  const [version, ...title] = args;
  assert(version, 'Usage: release:prepare <x.y.z> [title]');
  releaseAssets(version);
  const packagePath = join(directory, 'package.json');
  const packageText = readFileSync(packagePath, 'utf8');
  const previous = JSON.parse(packageText).version;
  assert.notEqual(previous, version, `package.json is already ${version}`);
  const release = await (fetchRelease ?? fetchGitHubRelease)(`v${previous}`);
  const baseline = { version: previous, sha256: installerDigest(release, previous) };

  foldChangelog([version, ...title], {
    changes: join(directory, 'docs', 'CHANGES.md'),
    fragments: join(directory, 'docs', 'changes', 'unreleased'),
  });
  writeFileSync(
    packagePath,
    packageText.replace(`"version": "${previous}"`, `"version": "${version}"`),
  );
  writeFileSync(
    join(directory, 'scripts', 'windows-release-baseline.json'),
    `${JSON.stringify(baseline, null, 2)}\n`,
  );
  console.log(
    `Prepared ${version} (upgrade gate from ${previous}). Write docs/releases/${version}.md, ` +
      'then merge; CI tags, builds and publishes it.',
  );
}

async function fetchGitHubRelease(tag) {
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/tags/${tag}`, {
    headers: { accept: 'application/vnd.github+json' },
  });
  assert(response.ok, `Could not read ${tag}: HTTP ${response.status}`);
  return response.json();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
