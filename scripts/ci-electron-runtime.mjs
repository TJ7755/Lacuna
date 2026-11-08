import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const [platform, arch] = process.argv.slice(2);
assert.ok(
  (platform === 'win32' && arch === 'x64') || (platform === 'darwin' && arch === 'arm64'),
  'Expected win32 x64 or darwin arm64',
);
assert.equal(platform, process.platform, 'Electron cache must be seeded on the target OS');

const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const manifest = require.resolve('electron/package.json');
const { version } = JSON.parse(await readFile(manifest, 'utf8'));
assert.match(version, /^\d+\.\d+\.\d+$/);
const checksums = JSON.parse(await readFile(join(dirname(manifest), 'checksums.json'), 'utf8'));
const filename = `electron-v${version}-${platform}-${arch}.zip`;
const expected = checksums[filename];
assert.match(expected ?? '', /^[a-f0-9]{64}$/, `No locked checksum for ${filename}`);

// Both pinned @electron/get versions hash the official release directory into their cache key.
const releaseDirectory = `https://github.com/electron/electron/releases/download/v${version}`;
const cacheRoot =
  platform === 'win32'
    ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'electron', 'Cache')
    : join(homedir(), 'Library', 'Caches', 'electron');
const cacheDirectory = join(cacheRoot, createHash('sha256').update(releaseDirectory).digest('hex'));
const archive = join(cacheDirectory, filename);

async function matchesChecksum(path) {
  const hash = createHash('sha256');
  try {
    await pipeline(createReadStream(path), hash);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  return hash.digest('hex') === expected;
}

async function download(url, path, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(120_000) });
  assert.ok(response.status === 200 && response.body, `Electron archive HTTP ${response.status}`);
  await pipeline(response.body, createWriteStream(path));
  assert.ok(await matchesChecksum(path), `Electron archive SHA-256 mismatch for ${filename}`);
}

async function downloadFromReleaseApi(path) {
  const api = 'https://api.github.com/repos/electron/electron/releases';
  const response = await fetch(`${api}/tags/v${version}`, { signal: AbortSignal.timeout(10_000) });
  assert.ok(response.ok, `Electron release metadata HTTP ${response.status}`);
  const { assets } = await response.json();
  const asset = assets.find(({ name }) => name === filename);
  assert.ok(Number.isSafeInteger(asset?.id) && asset.id > 0, `Missing release asset ${filename}`);
  await download(`${api}/assets/${asset.id}`, path, { Accept: 'application/octet-stream' });
}

if (!(await matchesChecksum(archive))) {
  await mkdir(cacheDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(join(cacheDirectory, '.download-'));
  const temporaryArchive = join(temporaryDirectory, filename);
  try {
    try {
      // The public REST asset endpoint can work when the release download URL returns 504.
      await downloadFromReleaseApi(temporaryArchive);
    } catch (error) {
      console.warn(`Electron release API failed (${error.message}); trying the release URL`);
      await download(`${releaseDirectory}/${filename}`, temporaryArchive);
    }
    await rename(temporaryArchive, archive);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

// Electron Builder reads this version-specific map before asking GitHub for SHASUMS256.txt.
await writeFile(join(cacheRoot, `SHASUMS256.txt-${version}`), `${expected} *${filename}\n`);
console.log(`Verified Electron runtime ${filename}`);
