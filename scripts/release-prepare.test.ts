import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installerDigest, main } from './release-prepare.mjs';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

const hash = 'a'.repeat(64);
const published = {
  draft: false,
  assets: [{ name: 'Lacuna-Setup-0.2.13.exe', digest: `sha256:${hash}` }],
};

function repository() {
  const directory = mkdtempSync(join(tmpdir(), 'lacuna-prepare-test-'));
  directories.push(directory);
  for (const folder of ['scripts', 'docs/changes/unreleased']) {
    mkdirSync(join(directory, folder), { recursive: true });
  }
  writeFileSync(
    join(directory, 'package.json'),
    '{\n  "name": "lacuna",\n  "version": "0.2.13"\n}\n',
  );
  writeFileSync(
    join(directory, 'docs/CHANGES.md'),
    '# Lacuna — version 0.2.13\n\n## Unreleased\n\n## 0.2.13 beta\n\n- Older.\n',
  );
  writeFileSync(join(directory, 'docs/changes/unreleased/fix.md'), '- A fix.\n');
  return directory;
}

describe('release preparation', () => {
  it('bumps the version, folds fragments and pins the replaced release as upgrade baseline', async () => {
    const directory = repository();
    const tags: string[] = [];
    await main(['0.2.14', 'Title'], {
      directory,
      fetchRelease: async (tag: string) => (tags.push(tag), published),
    });
    expect(tags).toEqual(['v0.2.13']);
    expect(readFileSync(join(directory, 'package.json'), 'utf8')).toContain('"version": "0.2.14"');
    expect(readFileSync(join(directory, 'docs/CHANGES.md'), 'utf8')).toContain(
      '## 0.2.14 beta — Title\n\n- A fix.',
    );
    expect(existsSync(join(directory, 'docs/changes/unreleased/fix.md'))).toBe(false);
    expect(
      JSON.parse(readFileSync(join(directory, 'scripts/windows-release-baseline.json'), 'utf8')),
    ).toEqual({ version: '0.2.13', sha256: hash });
  });

  it('changes nothing when the previous release cannot serve as a baseline', async () => {
    const directory = repository();
    await expect(
      main(['0.2.14'], { directory, fetchRelease: async () => ({ ...published, draft: true }) }),
    ).rejects.toThrow(/draft/);
    expect(readFileSync(join(directory, 'package.json'), 'utf8')).toContain('"version": "0.2.13"');
    expect(existsSync(join(directory, 'docs/changes/unreleased/fix.md'))).toBe(true);
  });

  it('requires a SHA-256 digest for the replaced Windows installer', () => {
    expect(installerDigest(published, '0.2.13')).toBe(hash);
    expect(() => installerDigest({ draft: false, assets: [] }, '0.2.13')).toThrow(/digest/);
  });
});
