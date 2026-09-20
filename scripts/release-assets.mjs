import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

// Parse metadata with the same YAML dependency as the installed updater.
const require = createRequire(import.meta.url);
const yaml = createRequire(require.resolve('electron-updater'))('js-yaml');
export const digest = (bytes, algorithm, encoding = 'hex') =>
  createHash(algorithm).update(bytes).digest(encoding);

export function releaseAssets(version) {
  assert.match(
    version,
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
    'Use a numeric release version, e.g. 0.2.11',
  );
  return [
    `Lacuna-Setup-${version}.exe`,
    `Lacuna-Setup-${version}.exe.blockmap`,
    `Lacuna-Portable-${version}.exe`,
    'latest.yml',
    `Lacuna-${version}.AppImage`,
    `lacuna_${version}_amd64.deb`,
    'latest-linux.yml',
    'SHA256SUMS-github.txt',
  ];
}

export function verifyAssets(directory, version) {
  const expected = releaseAssets(version);
  const read = (name) => readFileSync(join(directory, name));
  for (const name of expected)
    assert(statSync(join(directory, name)).size > 0, `Empty asset: ${name}`);
  const verified = new Set();
  const manifest = read('SHA256SUMS-github.txt').toString().trim().split(/\r?\n/);
  assert.equal(manifest.length, expected.length - 1, 'Incomplete checksum manifest');
  for (const line of manifest) {
    const match = /^([a-f0-9]{64})\s+\*?(?:\.\/)?([^/\\]+)$/.exec(line);
    assert(match, 'Invalid checksum line');
    const [, hash, name] = match;
    assert(
      expected.slice(0, -1).includes(name) && !verified.has(name),
      `Unexpected or repeated asset: ${name}`,
    );
    assert.equal(digest(read(name), 'sha256'), hash, `SHA-256 mismatch: ${name}`);
    verified.add(name);
  }
  for (const [name, targets] of [
    ['latest.yml', [`Lacuna-Setup-${version}.exe`]],
    ['latest-linux.yml', [`Lacuna-${version}.AppImage`, `lacuna_${version}_amd64.deb`]],
  ]) {
    const metadata = yaml.load(read(name).toString());
    assert.equal(metadata.version, version, `${name}: version mismatch`);
    assert.deepEqual(
      metadata.files.map((file) => file.url).sort(),
      [...targets].sort(),
      `${name}: wrong updater targets`,
    );
    for (const file of metadata.files) {
      const bytes = read(file.url);
      assert.equal(file.size, bytes.length, `${name}: size mismatch`);
      assert.equal(file.sha512, digest(bytes, 'sha512', 'base64'), `${name}: SHA-512 mismatch`);
    }
    assert.equal(metadata.path, targets[0], `${name}: wrong legacy updater target`);
    assert.equal(
      metadata.sha512,
      digest(read(metadata.path), 'sha512', 'base64'),
      `${name}: legacy SHA-512 mismatch`,
    );
  }
  const blockmap = JSON.parse(gunzipSync(read(`Lacuna-Setup-${version}.exe.blockmap`)));
  assert(blockmap.files.length > 0, 'Empty Windows block map');
  for (const file of blockmap.files) {
    assert(file.sizes.length > 0, 'Empty block map file');
    assert.equal(file.sizes.length, file.checksums.length, 'Invalid block map entries');
  }
  return {
    version,
    assets: expected,
    sha256: 'pass',
    updaterMetadata: 'pass',
    windowsBlockmap: 'pass',
  };
}
