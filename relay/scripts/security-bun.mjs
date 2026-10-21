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
import { delimiter, dirname, join, resolve } from 'node:path';
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
      const response = await fetch(asset.url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`Bun download failed: HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      verifyArchive(bytes, asset.sha256);
      const archive = join(temporary, 'bun.zip');
      writeFileSync(archive, bytes);
      if (process.platform === 'win32') {
        execFileSync('tar', ['-xf', archive, '-C', temporary]);
      } else {
        execFileSync('unzip', ['-q', archive, '-d', temporary]);
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
