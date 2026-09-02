import { readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { getRawHeader } from '@electron/asar';

import {
  isWindowsAsarPath,
  packageAssetKind,
  selectAsarCandidate,
} from './electron-package-audit-rules';

type AsarNode = {
  files?: Record<string, AsarNode>;
  size?: number;
};

type FileRecord = {
  path: string;
  bytes: number;
  group: string;
};

const LOCALE = /(?:^|[\\/])locales[\\/][^\\/]+\.pak$/i;
const WINDOWS_PACKAGE_BUDGET = {
  archiveBytes: 22_000_000,
  payloadBytes: 22_000_000,
  payloadFileCount: 1_400,
  sourceMapBytes: 0,
  buildOnlyAssetBytes: 10_000,
  localeBytes: 1_300_000,
  localeFileCount: 2,
} as const;

function usage(): never {
  console.error('Usage: bun scripts/electron-package-audit.ts [--asar <path>] [--check]');
  process.exit(2);
}

function parseArgs(): { asarPath?: string; check: boolean } {
  const args = process.argv.slice(2);
  let asarPath: string | undefined;
  let check = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--check') {
      check = true;
    } else if (arg === '--asar') {
      asarPath = args[++index];
      if (!asarPath || asarPath.startsWith('--')) usage();
    } else {
      usage();
    }
  }
  return { asarPath, check };
}

async function findAsar(): Promise<string> {
  const candidates: string[] = [];
  async function visit(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && entry.name === 'app.asar' && /[\\/]resources$/.test(directory)) {
        candidates.push(entryPath);
      }
    }
  }
  await visit(resolve('release'));
  candidates.sort();
  return selectAsarCandidate(candidates);
}

function groupFor(filePath: string): string {
  const parts = filePath.split('/');
  if (parts[0] === 'node_modules' && parts[1]) {
    return parts[1].startsWith('@') && parts[2]
      ? `node_modules/${parts[1]}/${parts[2]}`
      : `node_modules/${parts[1]}`;
  }
  return parts[0] ?? '(root)';
}

function collectFiles(node: AsarNode, prefix = ''): FileRecord[] {
  const files: FileRecord[] = [];
  for (const [name, child] of Object.entries(node.files ?? {})) {
    const filePath = prefix ? `${prefix}/${name}` : name;
    if (child.files) {
      files.push(...collectFiles(child, filePath));
    } else {
      files.push({
        path: filePath,
        bytes: child.size ?? 0,
        group: groupFor(filePath),
      });
    }
  }
  return files;
}

function summariseGroups(files: FileRecord[]) {
  const groups = new Map<string, { bytes: number; fileCount: number }>();
  for (const file of files) {
    const current = groups.get(file.group) ?? { bytes: 0, fileCount: 0 };
    current.bytes += file.bytes;
    current.fileCount += 1;
    groups.set(file.group, current);
  }
  return [...groups.entries()]
    .map(([group, value]) => ({ group, ...value }))
    .sort((left, right) => (left.group < right.group ? -1 : left.group > right.group ? 1 : 0));
}

async function localeSummary(asarPath: string) {
  const resources = resolve(asarPath, '../..');
  const localeDirectory = join(resources, 'locales');
  let entries;
  try {
    entries = await readdir(localeDirectory, { withFileTypes: true });
  } catch {
    return { bytes: 0, fileCount: 0, available: false };
  }
  const localeFiles = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && LOCALE.test(`locales/${entry.name}`))
      .map(async (entry) => stat(join(localeDirectory, entry.name))),
  );
  return {
    bytes: localeFiles.reduce((total, file) => total + file.size, 0),
    fileCount: localeFiles.length,
    available: localeFiles.length > 0,
  };
}

async function main(): Promise<void> {
  const { asarPath: requestedPath, check } = parseArgs();
  if (check && !requestedPath) {
    throw new Error('--check requires an explicit Windows --asar <path>.');
  }
  const archivePath = resolve(requestedPath ?? (await findAsar()));
  if (check && !isWindowsAsarPath(archivePath)) {
    throw new Error('--check accepts release/win-unpacked/resources/app.asar only.');
  }
  const [archive, header, locales] = await Promise.all([
    stat(archivePath),
    Promise.resolve(getRawHeader(archivePath) as unknown as { header: AsarNode }),
    localeSummary(archivePath),
  ]);
  const files = collectFiles(header.header);
  const sourceMaps = files.filter((file) => packageAssetKind(file.path) === 'source-map');
  const buildOnly = files.filter((file) => packageAssetKind(file.path) === 'build-only');
  const payloadBytes = files.reduce((total, file) => total + file.bytes, 0);
  const sourceMapBytes = sourceMaps.reduce((total, file) => total + file.bytes, 0);
  const buildOnlyAssetBytes = buildOnly.reduce((total, file) => total + file.bytes, 0);
  const failures: string[] = [];
  const budgetChecks: Array<readonly [string, number, number]> = [
    ['archive bytes', archive.size, WINDOWS_PACKAGE_BUDGET.archiveBytes],
    ['payload bytes', payloadBytes, WINDOWS_PACKAGE_BUDGET.payloadBytes],
    ['payload file count', files.length, WINDOWS_PACKAGE_BUDGET.payloadFileCount],
    ['source-map bytes', sourceMapBytes, WINDOWS_PACKAGE_BUDGET.sourceMapBytes],
    ['build-only asset bytes', buildOnlyAssetBytes, WINDOWS_PACKAGE_BUDGET.buildOnlyAssetBytes],
  ];
  if (locales.available) {
    budgetChecks.push(
      ['Electron locale bytes', locales.bytes, WINDOWS_PACKAGE_BUDGET.localeBytes],
      ['Electron locale file count', locales.fileCount, WINDOWS_PACKAGE_BUDGET.localeFileCount],
    );
  } else if (check) {
    failures.push('Electron locale files are unavailable; --check accepts a Windows package only');
  }
  for (const [label, actual, maximum] of budgetChecks) {
    if (actual > maximum) failures.push(`${label}: ${actual} > ${maximum}`);
  }

  const archiveReadable = archive.isFile() && archive.size > 0;
  const fileAccounting = files.every((file) => Number.isSafeInteger(file.bytes) && file.bytes >= 0);
  if (!archiveReadable) failures.push('the ASAR archive is empty or not a file');
  if (!fileAccounting) failures.push('the ASAR header contains invalid file sizes');
  const checks = {
    archiveReadable,
    fileAccounting,
    budgets: WINDOWS_PACKAGE_BUDGET,
    failures,
    status: check ? (failures.length === 0 ? 'pass' : 'fail') : 'not-run',
  };
  const report = {
    schemaVersion: 1,
    asarPath: relative(process.cwd(), archivePath) || '.',
    archiveBytes: archive.size,
    payloadBytes,
    payloadFileCount: files.length,
    groups: summariseGroups(files),
    sourceMaps: {
      bytes: sourceMapBytes,
      fileCount: sourceMaps.length,
    },
    buildOnlyAssets: {
      bytes: buildOnlyAssetBytes,
      fileCount: buildOnly.length,
    },
    electronLocales: locales,
    checks,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (check && checks.failures.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
