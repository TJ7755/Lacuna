import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
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
 * Bumps package.json and pins the Windows upgrade gate to
 * the release being replaced. Release notes in docs/releases/<version>.md stay hand-written.
 */
export async function main(args, { directory = root, fetchRelease } = {}) {
  const { values, positionals } = parseArgs({
    args,
    options: { 'use-pinned-baseline': { type: 'boolean' } },
    allowPositionals: true,
  });
  assert(positionals.length === 1, 'Usage: release:prepare <x.y.z> [--use-pinned-baseline]');
  const [version] = positionals;
  releaseAssets(version);
  const packagePath = join(directory, 'package.json');
  const packageText = readFileSync(packagePath, 'utf8');
  const previous = JSON.parse(packageText).version;
  assert.notEqual(previous, version, `package.json is already ${version}`);
  const baselinePath = join(directory, 'scripts', 'windows-release-baseline.json');
  // Recover from an unpublished version without changing the scheduled release gate.
  const usePinnedBaseline = values['use-pinned-baseline'];
  const pinned = usePinnedBaseline ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;
  const baselineVersion = usePinnedBaseline ? pinned?.version : previous;
  if (usePinnedBaseline) {
    assert.equal(typeof baselineVersion, 'string', 'Pinned baseline requires a version');
    assert.match(
      pinned.sha256 ?? '',
      /^[a-f0-9]{64}$/,
      'Pinned baseline requires a SHA-256 digest',
    );
  }
  releaseAssets(baselineVersion);
  const release = await (fetchRelease ?? fetchGitHubRelease)(`v${baselineVersion}`);
  const sha256 = installerDigest(release, baselineVersion);
  if (usePinnedBaseline)
    assert.equal(sha256, pinned.sha256, 'Published installer differs from the pinned digest');
  const baseline = { version: baselineVersion, sha256 };

  writeFileSync(
    packagePath,
    packageText.replace(`"version": "${previous}"`, `"version": "${version}"`),
  );
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(
    `Prepared ${version} (upgrade gate from ${baselineVersion}). Write docs/releases/${version}.md, ` +
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
