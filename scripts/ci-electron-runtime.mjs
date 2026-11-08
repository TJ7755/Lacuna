import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const [platform, arch, packagingTools, ...extraArgs] = process.argv.slice(2);
assert.ok(
  (platform === 'win32' && arch === 'x64') || (platform === 'darwin' && arch === 'arm64'),
  'Expected win32 x64 or darwin arm64',
);
assert.ok(
  extraArgs.length === 0 &&
    (packagingTools === undefined || packagingTools === '--packaging-tools'),
  'Expected optional --packaging-tools',
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
const electronRepo = 'electron/electron';
const electronTag = `v${version}`;
const cacheRoot =
  platform === 'win32'
    ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'electron', 'Cache')
    : join(homedir(), 'Library', 'Caches', 'electron');
const cacheKey = createHash('sha256')
  .update(`https://github.com/${electronRepo}/releases/download/${electronTag}`)
  .digest('hex');

async function matchesChecksum(path, expected) {
  const hash = createHash('sha256');
  try {
    await pipeline(createReadStream(path), hash);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  return hash.digest('hex') === expected;
}

async function download(url, path, filename, expected, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(120_000) });
  assert.ok(response.status === 200 && response.body, `Electron archive HTTP ${response.status}`);
  await pipeline(response.body, createWriteStream(path));
  assert.ok(
    await matchesChecksum(path, expected),
    `Electron archive SHA-256 mismatch for ${filename}`,
  );
}

async function downloadFromReleaseApi(repo, tag, filename, expected, path) {
  const api = `https://api.github.com/repos/${repo}/releases`;
  const response = await fetch(`${api}/tags/${tag}`, { signal: AbortSignal.timeout(10_000) });
  assert.ok(response.ok, `Electron release metadata HTTP ${response.status}`);
  const { assets } = await response.json();
  const asset = assets.find(({ name }) => name === filename);
  assert.ok(Number.isSafeInteger(asset?.id) && asset.id > 0, `Missing release asset ${filename}`);
  await download(`${api}/assets/${asset.id}`, path, filename, expected, {
    Accept: 'application/octet-stream',
  });
}

async function seedArchive(repo, tag, filename, expected, cacheDirectory) {
  const archive = join(cacheDirectory, filename);
  if (await matchesChecksum(archive, expected)) return;

  await mkdir(cacheDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(join(cacheDirectory, '.download-'));
  const temporaryArchive = join(temporaryDirectory, filename);
  try {
    try {
      // The public REST asset endpoint can work when the release download URL returns 504.
      await downloadFromReleaseApi(repo, tag, filename, expected, temporaryArchive);
    } catch (error) {
      console.warn(`Release API failed for ${filename} (${error.message}); trying the release URL`);
      await download(
        `https://github.com/${repo}/releases/download/${tag}/${filename}`,
        temporaryArchive,
        filename,
        expected,
      );
    }
    await rename(temporaryArchive, archive);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function seedElectron() {
  await seedArchive(electronRepo, electronTag, filename, expected, join(cacheRoot, cacheKey));
  // Electron Builder reads this version-specific map before asking GitHub for SHASUMS256.txt.
  await writeFile(join(cacheRoot, `SHASUMS256.txt-${version}`), `${expected} *${filename}\n`);
  console.log(`Verified Electron runtime ${filename}`);
}

async function seedPackagingTools() {
  const builderRequire = createRequire(require.resolve('electron-builder/package.json'));
  assert.equal(
    builderRequire('app-builder-lib/package.json').version,
    '26.18.0',
    'Recheck packaging tool archive checksums',
  );
  const { getCacheDirectory } = builderRequire('app-builder-lib/out/util/electronGet.js');
  const builderCache = getCacheDirectory({ allowEnvVarOverride: true });
  const repo = 'electron-userland/electron-builder-binaries';
  if (platform === 'win32') {
    assert.equal(process.arch, 'x64', 'The Windows tool archives require an x64 runner');
  }
  // These checksums come from the pinned Builder's icon, legacy Windows and 7-Zip toolsets.
  const windowsTools = [
    [
      'winCodeSign-2.6.0',
      'winCodeSign-2.6.0.7z',
      'cdaec7154dda7cc31f88d886e2489379a0625a737d610b5ae7f62a12f16743a4',
    ],
    [
      'nsis-3.0.4.1',
      'nsis-3.0.4.1.7z',
      '9877df902530f96357d13a7a31ae2b9df67f48b11ffc9a1700a7c961574ec5fa',
    ],
    [
      'nsis-resources-3.4.1',
      'nsis-resources-3.4.1.7z',
      '593a9a92ef958321293ac6a2ee61e64bf1bd543142a5bd6b3d310709cc924103',
    ],
    [
      '7zip@1.0.0',
      '7zip-win-x64.tar.gz',
      'be071f15bd6da2f78fe81c6ddef2009b0c4d8a51f36b780cb806c7e6df95e1b3',
    ],
  ];
  const tools = [
    [
      'icons@1.2.3',
      'icons-bundle.tar.gz',
      '4e5bb546c9d3ab0c2bbacc22857467bf415f742a34c2be9dd138779d2fc066f9',
    ],
    ...(platform === 'win32' ? windowsTools : []),
  ];
  // Builder's offline archive layout lets it verify the same checksums again before extraction.
  await Promise.all(
    tools.map(async ([tag, filename, checksum]) => {
      await seedArchive(repo, tag, filename, checksum, join(builderCache, tag));
      console.log(`Verified Electron Builder tool ${filename}`);
    }),
  );
}

await Promise.all([seedElectron(), packagingTools ? seedPackagingTools() : undefined]);
