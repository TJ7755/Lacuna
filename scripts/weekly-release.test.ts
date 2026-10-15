import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, nextPatch, pendingBullets, shipsChanges } from './weekly-release.mjs';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

const published = {
  draft: false,
  assets: [{ name: 'Lacuna-Setup-0.2.14.exe', digest: `sha256:${'b'.repeat(64)}` }],
};

function repository(fragment?: string) {
  const directory = mkdtempSync(join(tmpdir(), 'lacuna-weekly-test-'));
  directories.push(directory);
  for (const folder of ['scripts', 'docs/changes/unreleased']) {
    mkdirSync(join(directory, folder), { recursive: true });
  }
  writeFileSync(join(directory, 'package.json'), '{\n  "version": "0.2.14"\n}\n');
  writeFileSync(
    join(directory, 'docs/CHANGES.md'),
    '# Lacuna — version 0.2.14\n\n## Unreleased\n\n## 0.2.14 beta\n\n- Older.\n',
  );
  writeFileSync(join(directory, 'docs/changes/unreleased/README.md'), 'Not a fragment.\n');
  if (fragment) writeFileSync(join(directory, 'docs/changes/unreleased/fix.md'), fragment);
  return directory;
}

function git(tags: string, changed: string) {
  return (args: string[]) => (args[0] === 'tag' ? tags : changed);
}

const quiet = () => {};

describe('weekly release', () => {
  it('bumps the patch and writes notes when shipped code has changelog entries', async () => {
    const directory = repository('- Fixed a crash (#600)\n');
    const version = await main({
      directory,
      git: git('v0.2.14', 'src/app.tsx\ndocs/x.md'),
      fetchRelease: async () => published,
      log: quiet,
    });
    expect(version).toBe('0.2.15');
    expect(readFileSync(join(directory, 'package.json'), 'utf8')).toContain('"0.2.15"');
    expect(readFileSync(join(directory, 'docs/releases/0.2.15.md'), 'utf8')).toBe(
      '## Lacuna 0.2.15 Beta\n\n- Fixed a crash (#600)\n',
    );
    expect(existsSync(join(directory, 'docs/changes/unreleased/fix.md'))).toBe(false);
  });

  it('skips when only unshipped paths changed', async () => {
    const directory = repository('- CI tweak\n');
    const version = await main({
      directory,
      git: git('v0.2.14', '.github/workflows/ci.yml\nrelay/index.ts'),
      log: quiet,
    });
    expect(version).toBeNull();
    expect(readFileSync(join(directory, 'package.json'), 'utf8')).toContain('"0.2.14"');
  });

  it('skips when shipped code changed without a changelog entry', async () => {
    const directory = repository();
    expect(await main({ directory, git: git('v0.2.14', 'src/app.tsx'), log: quiet })).toBeNull();
  });

  it('skips while the current version is still awaiting its tag', async () => {
    const directory = repository('- Fixed a crash\n');
    expect(await main({ directory, git: git('', 'src/app.tsx'), log: quiet })).toBeNull();
  });

  it('reads bullets from fragments and the Unreleased section', () => {
    const changes = '# T\n\n## Unreleased\n\n- Left over\n\n## 0.2.14 beta\n\n- Older.\n';
    expect(pendingBullets(changes, ['- New\n'])).toEqual(['- New', '- Left over']);
  });

  it('bumps only the patch number', () => {
    expect(nextPatch('0.2.9')).toBe('0.2.10');
    expect(shipsChanges(['electron/main.ts'])).toBe(true);
    expect(shipsChanges(['docs/a.md', 'tests/b.spec.ts', 'server/c.ts'])).toBe(false);
  });
});
