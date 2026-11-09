import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const version = '24.22.1';
// From https://nodejs.org/dist/v24.22.1/SHASUMS256.txt.
const checksums = {
  'darwin-arm64': '89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7',
  'darwin-x64': 'd132557e7ee2b85af08b0c8c34338e65c6430f2238d01f727728ef42dc83b035',
  'linux-arm64': '33c37be234ba8bee041961047b19160f4d7d0f164e8e246f78bdd10feff148b3',
  'linux-x64': 'eb6728e77c576a35162c122c45ccadf224d89ff00abc8dae46cc2897c6002d7c',
  'win-arm64': 'a0c807319fede24c4a0d8f84564c82a619bd313b16b10c007c383c2609e99171',
  'win-x64': 'd2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5',
};

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  assert.ok(response.ok, `Node archive download returned HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

assert.equal(process.argv[2], version, 'Node version must match the pinned archive checksums');
const { GITHUB_PATH, RUNNER_TEMP, SystemRoot } = process.env;
assert.ok(GITHUB_PATH && RUNNER_TEMP, 'Expected a GitHub Actions runner');

const windows = process.platform === 'win32';
const target = `${windows ? 'win' : process.platform}-${process.arch}`;
const checksum = checksums[target];
assert.ok(checksum, `No Node archive is pinned for ${target}`);
const directoryName = `node-v${version}-${target}`;
const archiveName = `${directoryName}${windows ? '.zip' : '.tar.gz'}`;
const url = `https://nodejs.org/dist/v${version}/${archiveName}`;
const cache = path.join(RUNNER_TEMP, 'lacuna-node-archives');
const archivePath = path.join(cache, archiveName);
const digest = (archive) => createHash('sha256').update(archive).digest('hex');
const cached = await readFile(archivePath).catch((error) => {
  if (error.code !== 'ENOENT') throw error;
  return null;
});
if (cached && digest(cached) === checksum) {
  console.log(`Verified cached Node archive ${archiveName}`);
} else {
  console.log(`Downloading ${url}`);
  const archive = await download(url).catch((error) => {
    console.warn(`Node archive download failed, retrying: ${error.message}`);
    return download(url);
  });
  assert.equal(digest(archive), checksum, 'Node checksum mismatch');
  await mkdir(cache, { recursive: true });
  await writeFile(archivePath, archive);
}

// Git tar on Windows can interpret drive letters as remote hosts and cannot read ZIP files.
if (windows) assert.ok(SystemRoot, 'SystemRoot is required to locate Windows tar');
const tar = windows ? path.join(SystemRoot, 'System32', 'tar.exe') : 'tar';
const scratch = await mkdtemp(path.join(RUNNER_TEMP, 'lacuna-node-'));
execFileSync(tar, ['-xf', archivePath], { cwd: scratch, stdio: 'inherit', windowsHide: true });

const bin = path.join(scratch, directoryName, windows ? '' : 'bin');
const executable = path.join(bin, windows ? 'node.exe' : 'node');
const installed = execFileSync(executable, ['--version'], {
  encoding: 'utf8',
  windowsHide: true,
}).trim();
assert.equal(installed, `v${version}`, 'Node runtime version mismatch');
await appendFile(GITHUB_PATH, `${bin}\n`);
console.log(`Installed verified Node ${installed}`);
