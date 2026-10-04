import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const changesPath = join(root, 'docs', 'CHANGES.md');
const fragmentsDirectory = join(root, 'docs', 'changes', 'unreleased');

/** Fragment file names, sorted; README.md and non-Markdown files are not fragments. */
export function fragmentNames(names) {
  return names.filter((name) => name.endsWith('.md') && name !== 'README.md').sort();
}

/** Returns a problem description, or null when the fragment is valid. */
export function validateFragment(name, text) {
  const body = text.trim();
  if (!body) return `${name}: empty fragment`;
  if (!body.startsWith('- ')) return `${name}: must start with "- "`;
  return null;
}

/**
 * Folds fragments and any bullets already under "## Unreleased" into a new release
 * section, matching the release commits (for example 0.2.13): the title version is
 * bumped, "## Unreleased" is left empty, and "## <version> beta" follows it with the
 * fragments first. Returns the input unchanged when there is nothing to fold.
 */
export function foldChangelog({ changes, fragments, version, title }) {
  const heading = title ? `## ${version} beta — ${title}` : `## ${version} beta`;
  const lines = changes.split('\n');
  if (lines.some((line) => line.startsWith(`## ${version} beta`))) {
    throw new Error(`CHANGES.md already has a section for ${version}`);
  }
  const unreleased = lines.indexOf('## Unreleased');
  if (unreleased < 0) throw new Error('CHANGES.md has no "## Unreleased" section');
  let end = lines.findIndex((line, index) => index > unreleased && line.startsWith('## '));
  if (end < 0) end = lines.length;
  const existing = lines.slice(unreleased + 1, end).join('\n').trim();
  const added = fragments.map((fragment) => fragment.text.trim()).join('\n');
  if (!existing && !added) return changes;
  const head = lines
    .slice(0, unreleased)
    .map((line) => (line.startsWith('# Lacuna — version ') ? `# Lacuna — version ${version}` : line))
    .join('\n');
  const body = [added, existing].filter(Boolean).join('\n\n');
  const tail = lines.slice(end).join('\n');
  return `${head}\n## Unreleased\n\n${heading}\n\n${body}\n\n${tail}`;
}

function readFragments(directory) {
  if (!existsSync(directory)) return [];
  return fragmentNames(readdirSync(directory)).map((name) => ({
    name,
    text: readFileSync(join(directory, name), 'utf8'),
  }));
}

export function main(args, paths = { changes: changesPath, fragments: fragmentsDirectory }) {
  const fragments = readFragments(paths.fragments);
  const problems = fragments.map((f) => validateFragment(f.name, f.text)).filter(Boolean);
  if (problems.length) throw new Error(problems.join('\n'));
  if (args.includes('--check')) return console.log(`${fragments.length} fragment(s) valid`);
  const [version, ...rest] = args;
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('Usage: changelog:release <x.y.z> [title] | --check');
  }
  const changes = readFileSync(paths.changes, 'utf8');
  const folded = foldChangelog({ changes, fragments, version, title: rest.join(' ') });
  if (folded !== changes) writeFileSync(paths.changes, folded);
  for (const fragment of fragments) unlinkSync(join(paths.fragments, fragment.name));
  console.log(`Folded ${fragments.length} fragment(s) into ${version}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
