import fs from 'node:fs';
import path from 'node:path';

export const INSTALLATION_MARKER_FILENAME = 'installation-in-progress';
const MAX_MARKER_AGE_MS = 60 * 60 * 1_000;
// The NSIS hook appends one PID per invocation, so cap the read: a marker past
// this size is corrupt or abused, and parsing it must not block startup.
const MAX_MARKER_BYTES = 64 * 1024;
const WINDOWS_MARKER_DIRECTORY = 'Lacuna';

interface InstallationGuardDependencies {
  processIsRunning?: (pid: number) => boolean;
  now?: () => number;
}

function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function removeMarker(markerPath: string): void {
  try {
    fs.rmSync(markerPath, { force: true });
  } catch {
    // A stale marker is harmless once no installer process owns it.
  }
}

export function installationMarkerDirectory(
  hostUserDataPath: string,
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return platform === 'win32' && environment.LOCALAPPDATA
    ? path.win32.join(environment.LOCALAPPDATA, WINDOWS_MARKER_DIRECTORY)
    : hostUserDataPath;
}

/** Stop installed executables from being relaunched while NSIS replaces their files. */
export function shouldExitForInstallation(
  hostUserDataPath: string,
  dependencies: InstallationGuardDependencies = {},
): boolean {
  const markerPath = path.join(hostUserDataPath, INSTALLATION_MARKER_FILENAME);
  let contents: string;
  let modifiedAt: number;
  try {
    const stats = fs.statSync(markerPath);
    if (stats.size > MAX_MARKER_BYTES) {
      removeMarker(markerPath);
      return false;
    }
    contents = fs.readFileSync(markerPath, 'utf8');
    modifiedAt = stats.mtimeMs;
  } catch {
    return false;
  }

  const now = dependencies.now ?? Date.now;
  if (now() - modifiedAt > MAX_MARKER_AGE_MS) {
    removeMarker(markerPath);
    return false;
  }

  // One PID per installer invocation: bound the parse so a hostile marker
  // cannot wedge the main thread, and ignore anything that is not a PID.
  const installerPids = contents
    .split(/\r?\n/, 4096)
    .filter((value) => /^\d{1,10}$/.test(value))
    .map(Number)
    .filter((pid) => Number.isSafeInteger(pid) && pid > 0)
    .slice(0, 1024);
  const isRunning = dependencies.processIsRunning ?? processIsRunning;
  if (installerPids.some((pid) => isRunning(pid))) return true;

  removeMarker(markerPath);
  return false;
}
