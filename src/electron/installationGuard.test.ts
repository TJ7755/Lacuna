import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INSTALLATION_MARKER_FILENAME,
  installationMarkerDirectory,
  shouldExitForInstallation,
} from '../../electron/installationGuard';

const temporaryDirectories: string[] = [];

async function profileDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lacuna-installation-guard-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('Windows installation process guard', () => {
  it('uses per-user local state independently of a custom Electron profile', () => {
    expect(
      installationMarkerDirectory('D:\\Profiles\\Lacuna school', 'win32', {
        LOCALAPPDATA: 'C:\\Users\\student\\AppData\\Local',
      }),
    ).toBe('C:\\Users\\student\\AppData\\Local/Lacuna');
  });

  it('stops a companion from relaunching while the owning installer is active', async () => {
    const directory = await profileDirectory();
    await writeFile(path.join(directory, INSTALLATION_MARKER_FILENAME), '4127', 'utf8');
    const processIsRunning = vi.fn((pid: number) => pid === 4127);

    expect(shouldExitForInstallation(directory, { processIsRunning })).toBe(true);
    expect(processIsRunning).toHaveBeenCalledWith(4127);
  });

  it('removes an abandoned marker instead of permanently blocking Lacuna', async () => {
    const directory = await profileDirectory();
    const marker = path.join(directory, INSTALLATION_MARKER_FILENAME);
    await writeFile(marker, '4127', 'utf8');

    expect(shouldExitForInstallation(directory, { processIsRunning: () => false })).toBe(false);
    await expect(readFile(marker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['', 'not-a-pid', '0', '-4', '1.5'])('ignores an invalid marker: %j', async (value) => {
    const directory = await profileDirectory();
    await writeFile(path.join(directory, INSTALLATION_MARKER_FILENAME), value, 'utf8');

    expect(shouldExitForInstallation(directory, { processIsRunning: vi.fn() })).toBe(false);
  });

  it('ignores a marker left behind beyond the installation window', async () => {
    const directory = await profileDirectory();
    const marker = path.join(directory, INSTALLATION_MARKER_FILENAME);
    await writeFile(marker, '4127', 'utf8');

    expect(
      shouldExitForInstallation(directory, {
        processIsRunning: () => true,
        now: () => Date.now() + 60 * 60 * 1_000 + 1,
      }),
    ).toBe(false);
    await expect(readFile(marker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
