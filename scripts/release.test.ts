import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { digest, releaseAssets, verifyAssets } from './release-assets.mjs';
import { main, publicationAssets, releaseIdentity, workflowState } from './release.mjs';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'lacuna-release-test-'));
  directories.push(directory);
  const version = '0.2.11';
  const names = releaseAssets(version);
  const write = (name: string, data: string | Buffer) => writeFileSync(join(directory, name), data);
  // Small deterministic bytes exercise integrity checks; these are not application packages.
  for (const name of names) write(name, `test bytes for ${name}`);
  write(names[1], gzipSync(JSON.stringify({ files: [{ sizes: [10], checksums: ['test'] }] })));
  for (const [name, targets] of [
    ['latest.yml', [names[0]]],
    ['latest-linux.yml', [names[4], names[5]]],
  ] as const) {
    const files = targets.map((url) => {
      const bytes = readFileSync(join(directory, url));
      return { url, size: bytes.length, sha512: digest(bytes, 'sha512', 'base64') };
    });
    write(name, JSON.stringify({ version, files, path: targets[0], sha512: files[0].sha512 }));
  }
  const manifest = () =>
    write(
      names[7],
      names
        .slice(0, -1)
        .map(
          (name: string) => `${digest(readFileSync(join(directory, name)), 'sha256')}  ./${name}`,
        )
        .join('\n'),
    );
  manifest();
  return { directory, version, names, write, manifest };
}

describe('release asset verification', () => {
  it('verifies all packages, both updater feeds and the Windows block map', () => {
    const f = fixture();
    expect(verifyAssets(f.directory, f.version).updaterMetadata).toBe('pass');
  });
  it.each(['../0.2.11', 'v0.2.11', '0.2', '0.2.11-beta', '00.2.11'])(
    'rejects unsafe or unsupported version %s',
    (version) => {
      expect(() => releaseAssets(version)).toThrow();
    },
  );
  it('rejects corrupted installers', () => {
    const f = fixture();
    f.write(f.names[0], 'changed');
    expect(() => verifyAssets(f.directory, f.version)).toThrow(/SHA-256/);
  });
  it.each(['version', 'size', 'sha512', 'target', 'legacy'])(
    'rejects incorrect updater %s even with matching SHA-256 manifest',
    (field) => {
      const f = fixture();
      const feed = JSON.parse(readFileSync(join(f.directory, 'latest.yml'), 'utf8'));
      if (field === 'version') feed.version = '0.2.10';
      if (field === 'size') feed.files[0].size++;
      if (field === 'sha512') feed.files[0].sha512 = 'wrong';
      if (field === 'target') feed.files[0].url = f.names[2];
      if (field === 'legacy') feed.path = f.names[2];
      f.write('latest.yml', JSON.stringify(feed));
      f.manifest();
      expect(() => verifyAssets(f.directory, f.version)).toThrow();
    },
  );
  it('rejects repeated and unsafe manifest entries', () => {
    const f = fixture();
    const valid = readFileSync(join(f.directory, f.names[7]), 'utf8');
    f.write(f.names[7], valid.replace(f.names[2], f.names[0]));
    expect(() => verifyAssets(f.directory, f.version)).toThrow(/repeated/);
    f.write(f.names[7], valid.replace(f.names[2], '../outside'));
    expect(() => verifyAssets(f.directory, f.version)).toThrow(/Invalid checksum/);
  });
  it('rejects malformed block maps even with matching checksums', () => {
    const f = fixture();
    f.write(f.names[1], gzipSync(JSON.stringify({ files: [{ sizes: [10], checksums: [] }] })));
    f.manifest();
    expect(() => verifyAssets(f.directory, f.version)).toThrow(/block map/);
  });
});

describe('release orchestration gates', () => {
  const run = {
    id: 1,
    path: '.github/workflows/ci.yml',
    head_sha: 'abc',
    event: 'push',
    head_branch: 'master',
    status: 'completed',
    conclusion: 'success',
    html_url: 'https://example.test/run',
  };
  const state = (runs: object[]) => workflowState(runs, run.path, 'abc', ['master']).state;
  it('requires a successful push for the exact commit, workflow path and branch', () => {
    expect(state([run])).toBe('success');
    for (const change of [
      { head_sha: 'other' },
      { event: 'pull_request' },
      { head_branch: 'feature' },
      { path: 'other.yml' },
    ]) {
      expect(state([{ ...run, ...change }])).toBe('pending');
    }
  });
  it('does not reuse old success while the newest run is pending or failed', () => {
    expect(state([run, { ...run, id: 2, status: 'in_progress' }])).toBe('pending');
    expect(state([run, { ...run, id: 2, conclusion: 'failure' }])).toBe('failed');
    expect(state([{ ...run, conclusion: 'cancelled' }])).toBe('failed');
  });
  it('requires exactly the Windows/Linux assets for explicit publication', () => {
    const assets = releaseAssets('0.2.11').map((name: string) => ({ name }));
    expect(() => publicationAssets(assets, '0.2.11')).not.toThrow();
    expect(() => publicationAssets(assets.slice(1), '0.2.11')).toThrow();
    expect(() => publicationAssets([...assets, { name: 'mac.dmg' }], '0.2.11')).toThrow();
  });
  it('ignores download counters but detects replaced assets', () => {
    const before = { isDraft: true, assets: [{ name: 'installer', id: 1, downloadCount: 0 }] };
    expect(
      releaseIdentity({ ...before, assets: [{ ...before.assets[0], downloadCount: 1 }] }),
    ).toEqual(releaseIdentity(before));
    expect(releaseIdentity({ ...before, assets: [{ ...before.assets[0], id: 2 }] })).not.toEqual(
      releaseIdentity(before),
    );
  });
  it('rejects publication without explicit scope and notes before running any command', async () => {
    await expect(main(['publish', '0.2.11'])).rejects.toThrow(/windows-linux-only/);
    await expect(main(['draft', '0.2.11', '--publish'])).rejects.toThrow(/Unexpected/);
  });
});

describe('release command orchestration', () => {
  function commands({ failAttestation = false, replaceAsset = false, failCi = false } = {}) {
    const f = fixture();
    const calls: string[][] = [];
    let views = 0;
    let published = false;
    const draft = {
      id: 'release',
      isDraft: true,
      isPrerelease: true,
      tagName: 'v0.2.11',
      url: 'https://example.test/release',
      assets: f.names.map((name: string) => ({ name, id: name, downloadCount: 0 })),
    };
    const execute = (_program: string, args: string[]) => {
      calls.push(args);
      if (args[0] === 'api') {
        if (args.includes('--paginate'))
          return JSON.stringify([
            {
              workflow_runs: ['ci', 'security', 'release'].map((name) => ({
                id: 1,
                path: `.github/workflows/${name}.yml`,
                head_sha: 'abc',
                event: 'push',
                head_branch: name === 'release' ? 'v0.2.11' : 'master',
                status: 'completed',
                conclusion: failCi && name === 'ci' ? 'failure' : 'success',
              })),
            },
          ]);
        return JSON.stringify({ default_branch: 'master' });
      }
      if (args[0] === 'rev-parse') return 'abc';
      if (args[0] === 'show') return JSON.stringify({ version: f.version });
      if (args[0] === 'attestation' && failAttestation) throw new Error('Attestation rejected');
      if (args[0] === 'release' && args[1] === 'view') {
        views++;
        return JSON.stringify({
          ...draft,
          isDraft: !published,
          assets: draft.assets.map((asset: object) => ({
            ...asset,
            downloadCount: views,
            ...(replaceAsset && views > 1 ? { id: 'replacement' } : {}),
          })),
        });
      }
      if (args[0] === 'release' && args[1] === 'download') {
        const name = args[args.indexOf('--pattern') + 1];
        copyFileSync(join(f.directory, name), join(args[args.indexOf('--dir') + 1], name));
      }
      if (args[0] === 'release' && args[1] === 'edit') published = true;
      return '';
    };
    f.write('notes.md', 'Release notes');
    const publishArgs = [
      'publish',
      f.version,
      '--windows-linux-only',
      '--notes',
      join(f.directory, 'notes.md'),
    ];
    return {
      ...f,
      calls,
      publishArgs,
      dependencies: { execute, reportDirectory: join(f.directory, 'reports') },
    };
  }
  it('waits for exact CI before pushing a tag and stops at a draft', async () => {
    const f = commands();
    await main(['draft', f.version], f.dependencies);
    const push = f.calls.findIndex((args) => args[0] === 'push');
    expect(push).toBeGreaterThan(f.calls.findIndex((args) => args.includes('--paginate')));
    expect(f.calls[push].at(-1)).toContain(':refs/tags/v0.2.11');
    expect(f.calls.some((args) => args[1] === 'edit')).toBe(false);
  });
  it('does not push when exact CI fails', async () => {
    const f = commands({ failCi: true });
    await expect(main(['draft', f.version], f.dependencies)).rejects.toThrow(/workflow failed/);
    expect(f.calls.some((args) => args[0] === 'push')).toBe(false);
  });
  it('downloads and attests every asset afresh before explicit publication', async () => {
    const f = commands();
    await main(f.publishArgs, f.dependencies);
    expect(f.calls.filter((args) => args[1] === 'download')).toHaveLength(8);
    expect(f.calls.filter((args) => args[0] === 'attestation')).toHaveLength(8);
    const edit = f.calls.find((args) => args[1] === 'edit');
    expect(edit).toContain('--draft=false');
    expect(readFileSync(edit![edit!.indexOf('--notes-file') + 1], 'utf8')).toContain(
      'no macOS package',
    );
  });
  it.each([{ failAttestation: true }, { replaceAsset: true }])(
    'never publishes when verification fails: %j',
    async (failure) => {
      const f = commands(failure);
      await expect(main(f.publishArgs, f.dependencies)).rejects.toThrow();
      expect(f.calls.some((args) => args[1] === 'edit')).toBe(false);
    },
  );
});
