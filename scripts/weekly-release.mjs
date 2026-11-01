import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { main as prepareRelease } from './release-prepare.mjs';

const root = resolve(import.meta.dirname, '..');

// Paths that end up in the desktop packages. Relay, server and API changes deploy separately,
// and docs, tests, tooling and CI changes alone never justify a release.
const shippedPaths = [
  /^packages\/core\//,
  /^packages\/protocol\//,
  /^apps\/web\/src\//,
  /^apps\/desktop\//,
  /^public\//,
  /^index\.html$/,
  /^package\.json$/,
  /^bun\.lock$/,
  /^vite\.config\.ts$/,
];

export function nextPatch(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

export function shipsChanges(paths) {
  return paths.some((path) => shippedPaths.some((pattern) => pattern.test(path)));
}

/**
 * Prepares the weekly patch release on master: returns the new version, or null when the
 * previous release is still in flight or nothing shipped has changed since it.
 */
export async function main({
  directory = root,
  git = runGit,
  fetchRelease,
  generateNotes = generateGitHubNotes,
  log = console.log,
} = {}) {
  const version = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).version;
  const tag = `v${version}`;
  if (!git(['tag', '--list', tag])) {
    log(`${tag} is not tagged yet, so its release is still in progress.`);
    return null;
  }
  const changed = git(['diff', '--name-only', `${tag}..HEAD`])
    .split('\n')
    .filter(Boolean);
  if (!shipsChanges(changed)) {
    log(`Nothing shipped since ${tag}; no release this week.`);
    return null;
  }
  const next = nextPatch(version);
  const notes = await generateNotes({
    tag_name: `v${next}`,
    previous_tag_name: tag,
    target_commitish: git(['rev-parse', 'HEAD']),
  });
  assert(typeof notes === 'string' && notes.trim(), 'GitHub returned empty release notes');
  await prepareRelease([next], { directory, fetchRelease });
  mkdirSync(join(directory, 'docs', 'releases'), { recursive: true });
  writeFileSync(
    join(directory, 'docs', 'releases', `${next}.md`),
    `## Lacuna ${next} Beta\n\n${notes.trim()}\n`,
  );
  return next;
}

function generateGitHubNotes(input) {
  const response = execFileSync(
    'gh',
    ['api', '--method', 'POST', 'repos/TJ7755/Lacuna/releases/generate-notes', '--input', '-'],
    { input: JSON.stringify(input), encoding: 'utf8' },
  );
  return JSON.parse(response).body;
}

function runGit(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main()
    .then((version) => {
      if (version && process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
      }
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
