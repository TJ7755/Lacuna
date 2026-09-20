import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { releaseAssets, verifyAssets } from './release-assets.mjs';

const repository = 'TJ7755/Lacuna';
const root = resolve(import.meta.dirname, '..');

export function workflowState(runs, path, sha, branches) {
  const run = runs
    .filter(
      (item) =>
        item.path === path &&
        item.head_sha === sha &&
        item.event === 'push' &&
        branches.includes(item.head_branch),
    )
    .sort((a, b) => b.id - a.id)[0];
  if (!run || run.status !== 'completed') return { state: 'pending', url: run?.html_url };
  return { state: run.conclusion === 'success' ? 'success' : 'failed', url: run.html_url };
}

export function publicationAssets(assets, version) {
  assert.deepEqual(
    assets.map((asset) => asset.name).sort(),
    releaseAssets(version).sort(),
    'Windows/Linux publication requires exactly the eight verified assets. Use the documented manual process for macOS.',
  );
}

export function releaseIdentity(release) {
  return {
    ...release,
    assets: release.assets
      .map(({ downloadCount: _count, ...asset }) => asset)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function main(args, { execute, reportDirectory } = {}) {
  const [command, version, ...options] = args;
  if (command === '--help' || !command) {
    console.log(
      'Usage: bun run release <draft|verify|publish> <0.2.11>\n' +
        'publish requires --windows-linux-only --notes <file>. Draft never publishes.\n' +
        'Use GH_PATH for a gh executable outside PATH; authenticate with gh auth login or GH_TOKEN.',
    );
    return;
  }
  assert(['draft', 'verify', 'publish'].includes(command), 'Unknown release command');
  releaseAssets(version);
  const tag = `v${version}`;
  let notes;
  if (command === 'publish') {
    assert(
      options.length === 3 && options[0] === '--windows-linux-only' && options[1] === '--notes',
      'publish requires --windows-linux-only --notes <file>',
    );
    notes = readFileSync(resolve(options[2]), 'utf8').trim();
    assert(notes.length > 0, 'Release notes must not be empty');
  } else assert.equal(options.length, 0, 'Unexpected options');

  function run(program, argv, inherit = false) {
    if (execute) return execute(program, argv);
    const result = spawnSync(program, argv, {
      cwd: root,
      encoding: 'utf8',
      shell: false,
      stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      timeout: 15 * 60_000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`${program} ${argv[0]} failed: ${result.stderr ?? result.status}`);
    return result.stdout?.trim();
  }
  const git = (...argv) => run('git', argv);
  const gh = (...argv) => run(process.env.GH_PATH || 'gh', argv);
  const api = (endpoint) =>
    JSON.parse(gh('api', `repos/${repository}${endpoint ? `/${endpoint}` : ''}`));
  const release = () =>
    JSON.parse(
      gh(
        'release',
        'view',
        tag,
        '--repo',
        repository,
        '--json',
        'id,isDraft,isPrerelease,tagName,assets,url',
      ),
    );
  const runs = () =>
    JSON.parse(
      gh(
        'api',
        '--paginate',
        '--slurp',
        `repos/${repository}/actions/runs?head_sha=${sha}&per_page=100`,
      ),
    ).flatMap((page) => page.workflow_runs);
  async function waitFor(workflows, branches) {
    const deadline = Date.now() + 45 * 60_000;
    let previous = '';
    while (Date.now() < deadline) {
      const current = runs();
      const states = workflows.map((path) =>
        workflowState(current, `.github/workflows/${path}.yml`, sha, branches),
      );
      const message = states
        .map((state, index) => `${workflows[index]}: ${state.state} ${state.url ?? ''}`)
        .join('\n');
      if (message !== previous) console.log(message);
      previous = message;
      assert(
        !states.some((state) => state.state === 'failed'),
        'A required workflow failed. Fix or rerun it in Actions, then repeat this command.',
      );
      if (states.every((state) => state.state === 'success')) return;
      await setTimeout(15_000);
    }
    throw new Error(
      'Timed out after 45 minutes. No publication occurred; rerun the same command to resume.',
    );
  }

  // Resolve only the canonical GitHub repository, independent of the local branch or remotes.
  const branch = api('').default_branch;
  assert(['master', 'main'].includes(branch), 'Unsupported default branch');
  const remote = `https://github.com/${repository}.git`;
  let sha;
  if (command === 'draft') {
    git('fetch', '--no-tags', remote, `refs/heads/${branch}`);
    sha = git('rev-parse', 'FETCH_HEAD');
    assert.equal(
      JSON.parse(git('show', `${sha}:package.json`)).version,
      version,
      'Merge the version bump first; the default branch version must match',
    );
    console.log(`Preparing ${tag} from ${sha}`);
    await waitFor(['ci', 'security'], [branch]);
    const remoteTag = git('ls-remote', remote, `refs/tags/${tag}`, `refs/tags/${tag}^{}`);
    if (remoteTag) {
      git('fetch', '--no-tags', remote, `refs/tags/${tag}`);
      assert.equal(
        git('rev-parse', 'FETCH_HEAD^{commit}'),
        sha,
        'Existing tag points to another commit',
      );
    } else {
      // A unique local ref avoids changing or deleting any existing local tag.
      const ref = `refs/lacuna-release/${tag}-${Date.now()}`;
      git('update-ref', ref, sha);
      try {
        git('push', remote, `${ref}:refs/tags/${tag}`);
      } finally {
        git('update-ref', '-d', ref);
      }
    }
    await waitFor(['release'], [tag]);
    const draft = release();
    assert(draft.isDraft, 'Release is already published; refusing to change it');
    console.log(`Draft ready: ${draft.url}\nNext: bun run release verify ${version}`);
    return;
  }

  git('fetch', '--no-tags', remote, `refs/tags/${tag}`);
  sha = git('rev-parse', 'FETCH_HEAD^{commit}');
  assert.equal(
    JSON.parse(git('show', `${sha}:package.json`)).version,
    version,
    'Tag/package version mismatch',
  );
  await waitFor(['ci', 'security'], [branch]);
  await waitFor(['release'], [tag]);
  const before = release();
  assert.equal(before.tagName, tag);
  if (command === 'publish') {
    assert(
      before.isDraft && before.isPrerelease,
      'Only an unpublished beta draft may be published',
    );
    publicationAssets(before.assets, version);
  }
  const reportRoot = reportDirectory ?? join(root, 'artifacts', 'releases', tag);
  mkdirSync(reportRoot, { recursive: true });
  const directory = mkdtempSync(join(reportRoot, 'verification-'));
  for (const asset of releaseAssets(version)) {
    gh('release', 'download', tag, '--repo', repository, '--pattern', asset, '--dir', directory);
    run(
      process.env.GH_PATH || 'gh',
      [
        'attestation',
        'verify',
        join(directory, asset),
        '--repo',
        repository,
        '--signer-workflow',
        `${repository}/.github/workflows/release.yml`,
        '--source-digest',
        sha,
        '--source-ref',
        `refs/tags/${tag}`,
      ],
      true,
    );
  }
  const report = {
    ...verifyAssets(directory, version),
    commit: sha,
    provenance: 'pass',
    verifiedAt: new Date().toISOString(),
    installerExecution: 'not-tested',
    profileUpgrade: 'not-tested',
  };
  writeFileSync(join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Verified assets and updater metadata: ${join(directory, 'report.json')}`);
  if (command === 'publish') {
    // Detect replacements during verification rather than publishing an unverified upload.
    const after = release();
    assert(after.isDraft && after.isPrerelease, 'Release changed during verification');
    assert.deepEqual(
      releaseIdentity(after),
      releaseIdentity(before),
      'Release assets or state changed during verification; retry',
    );
    git('fetch', '--no-tags', remote, `refs/tags/${tag}`);
    assert.equal(
      git('rev-parse', 'FETCH_HEAD^{commit}'),
      sha,
      'Release tag changed during verification',
    );
    const notesPath = join(directory, 'release-notes.md');
    writeFileSync(
      notesPath,
      `${notes}\n\nWindows and Linux beta; no macOS package in this release. ` +
        'Packages are unsigned. Windows NSIS and Linux AppImage support automatic updates; ' +
        'Windows portable and Linux DEB require manual updates.\n',
    );
    gh(
      'release',
      'edit',
      tag,
      '--repo',
      repository,
      '--notes-file',
      notesPath,
      '--draft=false',
      '--prerelease',
    );
    const published = release();
    assert(
      !published.isDraft && published.isPrerelease,
      'Publication state was not confirmed; inspect the release before retrying',
    );
    console.log(`Published: ${published.url}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
