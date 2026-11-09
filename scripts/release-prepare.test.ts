import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  mkdirSync(join(directory, 'scripts'));
  writeFileSync(
    join(directory, 'package.json'),
    '{\n  "name": "lacuna",\n  "version": "0.2.13"\n}\n',
  );
  return directory;
}

describe('release preparation', () => {
  it('prepares a release without a changelog and pins the replaced installer', async () => {
    const directory = repository();
    const tags: string[] = [];
    await main(['0.2.14'], {
      directory,
      fetchRelease: async (tag: string) => (tags.push(tag), published),
    });
    expect(tags).toEqual(['v0.2.13']);
    expect(readFileSync(join(directory, 'package.json'), 'utf8')).toContain('"version": "0.2.14"');
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
  });

  it('can release past an unpublished version using the pinned published installer', async () => {
    const directory = repository();
    const packagePath = join(directory, 'package.json');
    writeFileSync(packagePath, '{"version": "0.2.14"}\n');
    const baselinePath = join(directory, 'scripts/windows-release-baseline.json');
    writeFileSync(baselinePath, JSON.stringify({ version: '0.2.13', sha256: hash }));
    const fetchRelease = async (tag: string) => {
      if (tag !== 'v0.2.13') throw new Error(`Could not read ${tag}: HTTP 404`);
      return published;
    };

    await expect(main(['0.2.15'], { directory, fetchRelease })).rejects.toThrow(/HTTP 404/);
    expect(readFileSync(packagePath, 'utf8')).toContain('"0.2.14"');
    await expect(
      main(['0.2.15', '--use-pinned-baseline'], {
        directory,
        fetchRelease: async () => ({
          ...published,
          assets: [{ ...published.assets[0], digest: `sha256:${'b'.repeat(64)}` }],
        }),
      }),
    ).rejects.toThrow(/pinned digest/);
    expect(readFileSync(packagePath, 'utf8')).toContain('"0.2.14"');

    writeFileSync(baselinePath, 'null');
    await expect(
      main(['0.2.15', '--use-pinned-baseline'], { directory, fetchRelease }),
    ).rejects.toThrow(/Pinned baseline requires a version/);
    expect(readFileSync(packagePath, 'utf8')).toContain('"0.2.14"');

    writeFileSync(baselinePath, JSON.stringify({ version: '0.2.13', sha256: hash }));
    await main(['0.2.15', '--use-pinned-baseline'], { directory, fetchRelease });
    expect(readFileSync(packagePath, 'utf8')).toContain('"0.2.15"');
    expect(JSON.parse(readFileSync(baselinePath, 'utf8'))).toEqual({
      version: '0.2.13',
      sha256: hash,
    });
  });

  it('requires a SHA-256 digest for the replaced Windows installer', () => {
    expect(installerDigest(published, '0.2.13')).toBe(hash);
    expect(() => installerDigest({ draft: false, assets: [] }, '0.2.13')).toThrow(/digest/);
  });
});
