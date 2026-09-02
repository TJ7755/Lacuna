import { access, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export interface ResolvePackagedExecutableOptions {
  appDir?: string;
  releaseDir?: string;
  platform?: NodeJS.Platform;
  arch?: string;
}

async function isFile(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

async function macApplicationCandidates(directory: string): Promise<string[]> {
  let names: string[] = [];
  try {
    names = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.endsWith('.app'))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
  return names.map((name) =>
    path.join(directory, name, 'Contents', 'MacOS', path.basename(name, '.app')),
  );
}

async function candidatesForDirectory(
  directory: string,
  platform: NodeJS.Platform,
  arch: string,
): Promise<string[]> {
  if (platform === 'darwin') {
    const directApplications = await macApplicationCandidates(directory);
    return [
      path.join(directory, 'Contents', 'MacOS', path.basename(directory, '.app')),
      ...directApplications,
      path.join(directory, `mac-${arch}`, 'Lacuna.app', 'Contents', 'MacOS', 'Lacuna'),
      path.join(directory, 'mac-arm64', 'Lacuna.app', 'Contents', 'MacOS', 'Lacuna'),
      path.join(directory, 'mac', 'Lacuna.app', 'Contents', 'MacOS', 'Lacuna'),
    ];
  }
  if (platform === 'win32') {
    return [path.join(directory, 'Lacuna.exe'), path.join(directory, 'win-unpacked', 'Lacuna.exe')];
  }
  return [
    path.join(directory, 'lacuna'),
    path.join(directory, 'Lacuna'),
    path.join(directory, 'linux-unpacked', 'lacuna'),
    path.join(directory, 'linux-unpacked', 'Lacuna'),
  ];
}

/** Resolve a packaged executable for the current host without unpacking or modifying artefacts. */
export async function resolvePackagedExecutable(
  options: ResolvePackagedExecutableOptions = {},
): Promise<string> {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const explicit = options.appDir ? path.resolve(options.appDir) : undefined;
  const releaseDirectory = path.resolve(options.releaseDir ?? 'release');
  const roots = explicit ? [explicit] : [releaseDirectory];
  const attempted: string[] = [];

  for (const root of roots) {
    if (await isFile(root)) {
      await access(root);
      return realpath(root);
    }
    const candidates = await candidatesForDirectory(root, platform, arch);
    for (const candidate of candidates) {
      if (attempted.includes(candidate)) continue;
      attempted.push(candidate);
      if (await isFile(candidate)) return realpath(candidate);
    }
  }

  const source = explicit ? `--app-dir ${explicit}` : releaseDirectory;
  throw new Error(
    `No packaged Lacuna executable for ${platform}/${arch} was found beneath ${source}.` +
      (attempted.length > 0 ? ` Tried:\n- ${attempted.join('\n- ')}` : ''),
  );
}

export function argumentValue(args: readonly string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
