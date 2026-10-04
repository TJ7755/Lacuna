import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { foldChangelog, fragmentNames, main, validateFragment } from './changelog.mjs';

// Shape of docs/CHANGES.md immediately before and after the 0.2.13 release commit
// (972275f), with the unrelated body shortened.
const bullet = [
  '- Fixed text imports to a new course failing with “Transaction committed too early”.',
  '  Card validation now runs before the import transaction.',
].join('\n');
const older = '## 0.2.12 beta — course links and desktop improvements\n\n- Older entry.\n';
const before = `# Lacuna — version 0.2.12\n\n## Unreleased\n\n${bullet}\n\n${older}`;
const gate = '- Updated the Windows installed-upgrade gate to use the verified v0.2.12 baseline.\n';
const drag = '- Stabilised the browser lesson-drag assertion.\n';
const after =
  '# Lacuna — version 0.2.13\n\n## Unreleased\n\n' +
  '## 0.2.13 beta — course overview, website and import fix\n\n' +
  `${gate}${drag}\n${bullet}\n\n${older}`;

const fragments = [
  { name: '348-a-gate.md', text: gate },
  { name: '349-b-drag.md', text: drag },
];

describe('foldChangelog', () => {
  it('reproduces the 0.2.13 release structure from fragments plus Unreleased bullets', () => {
    const folded = foldChangelog({
      changes: before,
      fragments,
      version: '0.2.13',
      title: 'course overview, website and import fix',
    });
    expect(folded).toBe(after);
  });

  it('folds fragments alone into an empty Unreleased section', () => {
    const changes = `# Lacuna — version 0.2.12\n\n## Unreleased\n\n${older}`;
    const folded = foldChangelog({ changes, fragments, version: '0.2.13' });
    expect(folded).toBe(
      `# Lacuna — version 0.2.13\n\n## Unreleased\n\n## 0.2.13 beta\n\n${gate}${drag}\n${older}`,
    );
  });

  it('folds existing Unreleased bullets when there are no fragments', () => {
    const folded = foldChangelog({ changes: before, fragments: [], version: '0.2.13' });
    expect(folded).toBe(
      `# Lacuna — version 0.2.13\n\n## Unreleased\n\n## 0.2.13 beta\n\n${bullet}\n\n${older}`,
    );
  });

  it('changes nothing with no fragments and an empty Unreleased section', () => {
    const changes = `# Lacuna — version 0.2.12\n\n## Unreleased\n\n${older}`;
    expect(foldChangelog({ changes, fragments: [], version: '0.2.13' })).toBe(changes);
  });

  it('refuses a version that already has a section', () => {
    expect(() => foldChangelog({ changes: after, fragments, version: '0.2.13' })).toThrow(/already/);
  });
});

describe('fragments', () => {
  it('ignores README.md and non-Markdown files, and sorts by name', () => {
    expect(fragmentNames(['README.md', '9-z.md', '10-a.md', 'notes.txt'])).toEqual(['10-a.md', '9-z.md']);
  });

  it('rejects empty and non-bullet fragments', () => {
    expect(validateFragment('a.md', '- Fine (#1).\n')).toBeNull();
    expect(validateFragment('a.md', '  \n')).toMatch(/empty/);
    expect(validateFragment('a.md', 'No bullet')).toMatch(/must start/);
  });
});

describe('main', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
  });
  function scratch(files: Record<string, string>) {
    const directory = mkdtempSync(join(tmpdir(), 'lacuna-changelog-test-'));
    directories.push(directory);
    const fragmentsDirectory = join(directory, 'unreleased');
    mkdirSync(fragmentsDirectory);
    for (const [name, text] of Object.entries(files)) writeFileSync(join(fragmentsDirectory, name), text);
    const changes = join(directory, 'CHANGES.md');
    writeFileSync(changes, before);
    return { changes, fragments: fragmentsDirectory };
  }

  it('fails --check on a malformed fragment', () => {
    const paths = scratch({ 'bad.md': 'not a bullet' });
    expect(() => main(['--check'], paths)).toThrow(/bad.md/);
  });

  it('folds, writes and deletes fragments but keeps README.md', () => {
    const paths = scratch({ 'README.md': 'About', '348-a-gate.md': gate, '349-b-drag.md': drag });
    main(['0.2.13', 'course overview, website and import fix'], paths);
    expect(readFileSync(paths.changes, 'utf8')).toBe(after);
    expect(readdirSync(paths.fragments)).toEqual(['README.md']);
  });
});
