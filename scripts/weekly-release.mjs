import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fragmentNames } from './changelog.mjs';
import { main as prepareRelease } from './release-prepare.mjs';

const root = resolve(import.meta.dirname, '..');

// Paths that end up in the desktop packages. Relay, server and API changes deploy separately,
// and docs, tests, tooling and CI changes alone never justify a release.
const shippedPaths = [
  /^src\//,
  /^electron\//,
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

/** Changelog bullets awaiting release: fragments first, then any under "## Unreleased". */
export function pendingBullets(changes, fragments) {
  const lines = changes.split('\n');
  const start = lines.indexOf('## Unreleased');
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const unreleased = start < 0 ? [] : lines.slice(start + 1, end < 0 ? undefined : end);
  return [...fragments.flatMap((text) => text.split('\n')), ...unreleased]
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith('- '));
}

export function releaseNotes(version, bullets) {
  return `## Lacuna ${version} Beta\n\n${bullets.join('\n')}\n`;
}

/**
 * Prepares the weekly patch release on master: returns the new version, or null when the
 * previous release is still in flight or nothing shipped has a changelog entry since it.
 */
export async function main({
  directory = root,
  git = runGit,
  fetchRelease,
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
  const fragmentsDirectory = join(directory, 'docs', 'changes', 'unreleased');
  const fragments = fragmentNames(readdirSync(fragmentsDirectory)).map((name) =>
    readFileSync(join(fragmentsDirectory, name), 'utf8'),
  );
  const bullets = pendingBullets(
    readFileSync(join(directory, 'docs', 'CHANGES.md'), 'utf8'),
    fragments,
  );
  if (!bullets.length || !shipsChanges(changed)) {
    log(`Nothing shipped with a changelog entry since ${tag}; no release this week.`);
    return null;
  }
  const next = nextPatch(version);
  await prepareRelease([next], { directory, fetchRelease });
  mkdirSync(join(directory, 'docs', 'releases'), { recursive: true });
  writeFileSync(join(directory, 'docs', 'releases', `${next}.md`), releaseNotes(next, bullets));
  return next;
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
