import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, dirname, join, resolve, win32 } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const pin = JSON.parse(readFileSync(new URL('./security-bun.json', import.meta.url), 'utf8'));

export function verifyArchive(bytes, expected) {
  if (createHash('sha256').update(bytes).digest('hex') !== expected) {
    throw new Error(
      'Bun download checksum mismatch. Review the next patched stable release before updating the pin.',
    );
  }
}

export function verifyRevision(actual) {
  if (actual.trim() !== pin.revision) {
    throw new Error(`Bun revision mismatch: expected ${pin.revision}, received ${actual.trim()}`);
  }
}

// The complete ZIP has already passed its pinned checksum. Extract only Bun's named
// executable, without relying on unzip being present in a minimal browser container.
function bunExecutable(bytes, archiveName) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('Bun archive has no ZIP directory');
  let offset = bytes.readUInt32LE(end + 16);
  const count = bytes.readUInt16LE(end + 10);
  for (let entry = 0; entry < count; entry++) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid Bun ZIP directory');
    const nameLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (name === `${archiveName}/bun`) {
      const local = bytes.readUInt32LE(offset + 42);
      if (bytes.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid Bun ZIP entry');
      const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
      const compressed = bytes.subarray(start, start + bytes.readUInt32LE(offset + 20));
      const size = bytes.readUInt32LE(offset + 24);
      const method = bytes.readUInt16LE(offset + 10);
      const binary =
        method === 0
          ? compressed
          : method === 8
            ? inflateRawSync(compressed, { maxOutputLength: size })
            : undefined;
      if (!binary || binary.length !== size) throw new Error('Unsupported Bun ZIP executable');
      return binary;
    }
    offset += 46 + nameLength + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  throw new Error('Bun archive is missing its executable');
}

export function extractArchive(
  directory,
  {
    platform = process.platform,
    systemRoot = process.env.SystemRoot,
    execute = execFileSync,
    archiveName = `bun-${platform}-${process.arch === 'arm64' ? 'aarch64' : process.arch}`,
  } = {},
) {
  if (platform === 'win32') {
    if (!systemRoot) throw new Error('SystemRoot is required to find the native Windows tar.exe');
    execute(win32.join(systemRoot, 'System32', 'tar.exe'), ['-xf', 'bun.zip'], { cwd: directory });
  } else {
    const binary = bunExecutable(readFileSync(join(directory, 'bun.zip')), archiveName);
    mkdirSync(join(directory, archiveName), { recursive: true });
    writeFileSync(join(directory, archiveName, 'bun'), binary);
  }
}

export async function installBun() {
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const architecture = process.arch === 'arm64' ? 'aarch64' : process.arch;
  const archiveName = `bun-${platform}-${architecture}`;
  const asset = pin.assets[`${archiveName}.zip`];
  if (!asset) throw new Error(`No reviewed Bun binary for ${platform}/${architecture}`);
  const directory = join(
    root,
    'node_modules',
    '.cache',
    'security-runtime',
    pin.commit,
    archiveName,
  );
  const binary = join(directory, process.platform === 'win32' ? 'bun.exe' : 'bun');
  if (!existsSync(binary)) {
    mkdirSync(dirname(directory), { recursive: true });
    const temporary = mkdtempSync(join(dirname(directory), '.download-'));
    try {
      const cachedArchive = join(
        root,
        'node_modules',
        '.cache',
        'security-runtime',
        'downloads',
        `${pin.commit}-${archiveName}.zip`,
      );
      let bytes;
      if (existsSync(cachedArchive)) {
        bytes = readFileSync(cachedArchive);
      } else {
        const response = await fetch(asset.url, { signal: AbortSignal.timeout(120_000) });
        if (!response.ok) throw new Error(`Bun download failed: HTTP ${response.status}`);
        bytes = Buffer.from(await response.arrayBuffer());
      }
      // Cache downloads, never trust an extracted executable supplied by a cache.
      verifyArchive(bytes, asset.sha256);
      mkdirSync(dirname(cachedArchive), { recursive: true });
      writeFileSync(cachedArchive, bytes);
      const archive = join(temporary, 'bun.zip');
      writeFileSync(archive, bytes);
      extractArchive(temporary, { archiveName });
      if (process.platform !== 'win32') {
        chmodSync(join(temporary, archiveName, 'bun'), 0o755);
      }
      const extracted = join(
        temporary,
        archiveName,
        process.platform === 'win32' ? 'bun.exe' : 'bun',
      );
      verifyRevision(execFileSync(extracted, ['--revision'], { encoding: 'utf8' }));
      renameSync(join(temporary, archiveName), directory);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  verifyRevision(execFileSync(binary, ['--revision'], { encoding: 'utf8' }));
  const bunx = join(directory, process.platform === 'win32' ? 'bunx.exe' : 'bunx');
  if (!existsSync(bunx)) {
    if (process.platform === 'win32') copyFileSync(binary, bunx);
    else symlinkSync('bun', bunx);
  }
  return binary;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const binary = await installBun();
  if (process.argv[2] === '--install') {
    if (process.env.GITHUB_PATH) appendFileSync(process.env.GITHUB_PATH, `${dirname(binary)}\n`);
    console.log(`Installed Bun ${pin.revision} in ${dirname(binary)}`);
  } else {
    const result = spawnSync(binary, process.argv.slice(2), {
      stdio: 'inherit',
      env: { ...process.env, PATH: `${dirname(binary)}${delimiter}${process.env.PATH}` },
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
}
