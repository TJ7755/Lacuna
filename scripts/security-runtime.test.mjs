import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parse } from 'yaml';
import { zipSync } from 'fflate';
import { extractArchive, verifyArchive, verifyRevision } from '../relay/scripts/security-bun.mjs';

const root = new URL('../', import.meta.url);
const version = readFileSync(new URL('.bun-version', root), 'utf8').trim();
const pin = JSON.parse(readFileSync(new URL('relay/scripts/security-bun.json', root), 'utf8'));
const action = parse(readFileSync(new URL('.github/actions/setup-bun/action.yml', root), 'utf8'));

test('Windows ZIP extraction uses native tar rather than Git tar interpreting a drive as a host', () => {
  const calls = [];
  const directory = 'D:\\a\\Lacuna\\runtime download';
  extractArchive(directory, {
    platform: 'win32',
    systemRoot: 'C:\\Windows',
    execute: (...args) => calls.push(args),
  });
  assert.deepEqual(calls, [
    ['C:\\Windows\\System32\\tar.exe', ['-xf', 'bun.zip'], { cwd: directory }],
  ]);
});

test('the Bun security guard rejects changed downloads and unreviewed revisions', () => {
  assert.doesNotThrow(() => verifyRevision(pin.revision));
  for (const installed of ['1.4.3+c6da4a4d3', '1.4.4-canary.1+963452075', '1.4.4+unreviewed']) {
    assert.throws(() => verifyRevision(installed), /Bun revision mismatch/);
  }
  const archive = Buffer.from('reviewed download');
  const expected = createHash('sha256').update(archive).digest('hex');
  assert.doesNotThrow(() => verifyArchive(archive, expected));
  assert.throws(
    () => verifyArchive(Buffer.from('changed download'), expected),
    /checksum mismatch/,
  );
  assert.equal(action.runs.steps.at(-1).run, 'node relay/scripts/security-bun.mjs --install');
});

test('every Bun workflow uses the security guard and manifests share its pin', () => {
  for (const file of readdirSync(new URL('.github/workflows/', root))) {
    if (!file.endsWith('.yml')) continue;
    const workflow = parse(readFileSync(new URL(`.github/workflows/${file}`, root), 'utf8'));
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        assert.ok(!step.uses?.startsWith('oven-sh/setup-bun@'), `${file} bypasses the Bun guard`);
        if (step.uses?.startsWith('actions/setup-node@')) {
          assert.equal(step.with['node-version'], '24.22.1', file);
        }
      }
    }
  }
  for (const file of [
    'package.json',
    'relay/package.json',
    'tooling/handwriting-maths/package.json',
  ]) {
    const manifest = JSON.parse(readFileSync(new URL(file, root), 'utf8'));
    assert.equal(manifest.packageManager, `bun@${version}`, file);
  }
});

test('Vercel builds use the verified Bun bootstrap instead of vulnerable bunx downloads', () => {
  for (const file of [
    'vercel.json',
    'gaps/vercel.json',
    'library/vercel.json',
    'relay/vercel.json',
  ]) {
    const config = JSON.parse(readFileSync(new URL(file, root), 'utf8'));
    assert.match(
      config.installCommand,
      /node (?:relay\/)?scripts\/security-bun\.mjs install --frozen-lockfile/,
    );
    if (config.buildCommand)
      assert.match(config.buildCommand, /node relay\/scripts\/security-bun\.mjs run build/);
  }
  assert.equal(pin.version, version);
  assert.equal(pin.revision, `${version}+${pin.commit.slice(0, 9)}`);
  for (const [name, asset] of Object.entries(pin.assets)) {
    assert.equal(
      asset.url,
      `https://github.com/oven-sh/bun/releases/download/bun-v${version}/${name}`,
    );
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  }
});

test('a tampered cached Bun archive fails before extraction or installation', () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'lacuna-bun-cache-')));
  try {
    const archiveName = `bun-${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch === 'arm64' ? 'aarch64' : process.arch}`;
    const scripts = join(directory, 'scripts');
    const downloads = join(directory, 'node_modules', '.cache', 'security-runtime', 'downloads');
    mkdirSync(scripts, { recursive: true });
    mkdirSync(downloads, { recursive: true });
    copyFileSync(
      new URL('../relay/scripts/security-bun.mjs', import.meta.url),
      join(scripts, 'security-bun.mjs'),
    );
    writeFileSync(
      join(scripts, 'security-bun.json'),
      JSON.stringify({
        commit: 'fixture',
        revision: 'fixture-revision',
        assets: {
          [`${archiveName}.zip`]: {
            url: 'https://invalid.invalid/must-not-download',
            sha256: createHash('sha256').update('reviewed bytes').digest('hex'),
          },
        },
      }),
    );
    writeFileSync(join(downloads, `fixture-${archiveName}.zip`), 'tampered cache');
    const result = spawnSync(process.execPath, [join(scripts, 'security-bun.mjs'), '--install'], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Bun download checksum mismatch/);
    assert.doesNotMatch(result.stderr, /Bun download failed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Unix bootstrap extracts only the reviewed Bun executable without a system unzip', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lacuna-bun-zip-'));
  try {
    const binary = new TextEncoder().encode('reviewed executable');
    for (const level of [0, 6]) {
      writeFileSync(join(directory, 'bun.zip'), zipSync({ 'bun-test/bun': binary }, { level }));
      extractArchive(directory, {
        platform: 'linux',
        archiveName: 'bun-test',
        execute: () => {
          throw new Error('System extraction must not run');
        },
      });
      assert.deepEqual(readFileSync(join(directory, 'bun-test', 'bun')), Buffer.from(binary));
    }
    writeFileSync(join(directory, 'bun.zip'), zipSync({ 'other/bun': binary }));
    assert.throws(
      () => extractArchive(directory, { platform: 'linux', archiveName: 'bun-test' }),
      /missing its executable/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
