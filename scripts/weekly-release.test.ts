import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, nextPatch, shipsChanges } from './weekly-release.mjs';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

const published = {
  draft: false,
  assets: [{ name: 'Lacuna-Setup-0.2.14.exe', digest: `sha256:${'b'.repeat(64)}` }],
};

function repository() {
  const directory = mkdtempSync(join(tmpdir(), 'lacuna-weekly-test-'));
  directories.push(directory);
  mkdirSync(join(directory, 'scripts'));
  writeFileSync(join(directory, 'package.json'), '{\n  "version": "0.2.14"\n}\n');
  return directory;
}

function git(tags: string, changed: string) {
  return (args: string[]) => {
    if (args[0] === 'tag') return tags;
    if (args[0] === 'rev-parse') return 'c'.repeat(40);
    return changed;
  };
}

const quiet = () => {};

describe('weekly release', () => {
  it('prepares shipped changes using notes generated between the release tag and exact head', async () => {
    const directory = repository();
    const requests: unknown[] = [];
    const version = await main({
      directory,
      git: git('v0.2.14', 'src/app.tsx\ndocs/x.md'),
      fetchRelease: async () => published,
      generateNotes: async (input: unknown) => {
        requests.push(input);
        return "## What's Changed\n* Fixed a crash by @tester in https://github.com/TJ7755/Lacuna/pull/600\n";
      },
      log: quiet,
    });
    expect(version).toBe('0.2.15');
    expect(readFileSync(join(directory, 'package.json'), 'utf8')).toContain('"0.2.15"');
    expect(readFileSync(join(directory, 'docs/releases/0.2.15.md'), 'utf8')).toBe(
      "## Lacuna 0.2.15 Beta\n\n## What's Changed\n* Fixed a crash by @tester in https://github.com/TJ7755/Lacuna/pull/600\n",
    );
    expect(requests).toEqual([{
      tag_name: 'v0.2.15',
      previous_tag_name: 'v0.2.14',
      target_commitish: 'c'.repeat(40),
    }]);
  });

  it('skips when only unshipped paths changed', async () => {
    const directory = repository();
    const version = await main({
      directory,
      git: git('v0.2.14', '.github/workflows/ci.yml\nrelay/index.ts'),
      log: quiet,
    });
    expect(version).toBeNull();
    expect(readFileSync(join(directory, 'package.json'), 'utf8')).toContain('"0.2.14"');
  });

  it('leaves the checkout unchanged when generating notes fails', async () => {
    const directory = repository();
    await expect(main({
      directory,
      git: git('v0.2.14', 'src/app.tsx'),
      generateNotes: async () => { throw new Error('GitHub unavailable'); },
      log: quiet,
    })).rejects.toThrow('GitHub unavailable');
    expect(readFileSync(join(directory, 'package.json'), 'utf8')).toContain('"0.2.14"');
    expect(existsSync(join(directory, 'scripts/windows-release-baseline.json'))).toBe(false);
    expect(existsSync(join(directory, 'docs/releases/0.2.15.md'))).toBe(false);
  });

  it('skips while the current version is still awaiting its tag', async () => {
    const directory = repository();
    expect(await main({ directory, git: git('', 'src/app.tsx'), log: quiet })).toBeNull();
  });

  it('bumps only the patch number', () => {
    expect(nextPatch('0.2.9')).toBe('0.2.10');
    expect(shipsChanges(['electron/main.ts'])).toBe(true);
    expect(shipsChanges(['docs/a.md', 'tests/b.spec.ts', 'server/c.ts'])).toBe(false);
  });
});
