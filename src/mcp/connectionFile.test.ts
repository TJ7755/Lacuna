import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  companionEndpoint,
  companionHostUserDataPath,
  companionLaunchCommand,
  writeCompanionConnectionFile,
} from '../../electron/mcp/connectionFile';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe('companion connection metadata', () => {
  it('uses an unguessable Windows LOCAL named-pipe endpoint', () => {
    const first = companionEndpoint('C:\\Users\\managed\\AppData\\Roaming\\Lacuna', 'win32');
    const second = companionEndpoint('C:\\Users\\managed\\AppData\\Roaming\\Lacuna', 'win32');

    expect(first).toMatch(/^\\\\\.\\pipe\\LOCAL\\lacuna-[a-f0-9]{32}$/);
    expect(second).toMatch(/^\\\\\.\\pipe\\LOCAL\\lacuna-[a-f0-9]{32}$/);
    expect(second).not.toBe(first);
  });

  it('writes a newly rotated 256-bit hexadecimal token', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'lacuna-connection-test-'));
    temporaryDirectories.push(directory);

    const first = await writeCompanionConnectionFile(directory, '1.0.0');
    const second = await writeCompanionConnectionFile(directory, '1.0.0');
    const persisted = JSON.parse(await readFile(path.join(directory, 'mcp', 'connection.json'), 'utf8')) as {
      token: string;
      aiToken: string;
    };

    expect(first.token).toMatch(/^[a-f0-9]{64}$/);
    expect(second.token).toMatch(/^[a-f0-9]{64}$/);
    expect(second.token).not.toBe(first.token);
    expect(first.aiToken).toMatch(/^[a-f0-9]{64}$/);
    expect(second.aiToken).toMatch(/^[a-f0-9]{64}$/);
    expect(second.aiToken).not.toBe(second.token);
    expect(second.aiToken).not.toBe(first.aiToken);
    expect(persisted.token).toBe(second.token);
    expect(persisted.aiToken).toBe(second.aiToken);
  });

  it('advertises the original portable executable on Windows', () => {
    expect(companionLaunchCommand({
      appPath: 'C:\\Users\\managed\\AppData\\Local\\Temp\\lacuna\\resources\\app.asar',
      execPath: 'C:\\Users\\managed\\AppData\\Local\\Temp\\lacuna\\Lacuna.exe',
      isPackaged: true,
      platform: 'win32',
      userDataPath: 'C:\\Users\\managed\\AppData\\Roaming\\Lacuna',
      companionUserDataPath: 'C:\\Users\\managed\\AppData\\Local\\Temp\\lacuna-companion-ai',
      portableExecutableFile: 'D:\\Apps\\Lacuna-Portable.exe',
    }, '--ai-companion')).toEqual({
      command: 'D:\\Apps\\Lacuna-Portable.exe',
      args: [
        '--ai-companion',
        '--lacuna-host-user-data-dir=C:\\Users\\managed\\AppData\\Roaming\\Lacuna',
        '--user-data-dir=C:\\Users\\managed\\AppData\\Local\\Temp\\lacuna-companion-ai',
      ],
    });
  });

  it('advertises the stable AppImage wrapper instead of its temporary mount executable', () => {
    expect(companionLaunchCommand({
      appPath: '/tmp/.mount_Lacuna/resources/app.asar',
      execPath: '/tmp/.mount_Lacuna/lacuna',
      isPackaged: true,
      platform: 'linux',
      userDataPath: '/home/student/.config/Lacuna',
      companionUserDataPath: '/tmp/lacuna-companion-ai',
      appImageFile: '/home/student/Applications/Lacuna.AppImage',
    }, '--ai-companion')).toEqual({
      command: '/home/student/Applications/Lacuna.AppImage',
      args: [
        '--ai-companion',
        '--lacuna-host-user-data-dir=/home/student/.config/Lacuna',
        '--user-data-dir=/tmp/lacuna-companion-ai',
      ],
    });
  });

  it('keeps the development app path before the companion flag', () => {
    expect(companionLaunchCommand({
      appPath: '/repo',
      execPath: '/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
      isPackaged: false,
      platform: 'darwin',
      userDataPath: '/Users/student/Library/Application Support/Lacuna',
      companionUserDataPath: '/tmp/lacuna-companion-data',
    }, '--mcp-companion')).toEqual({
      command: '/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
      args: [
        '/repo',
        '--mcp-companion',
        '--lacuna-host-user-data-dir=/Users/student/Library/Application Support/Lacuna',
        '--user-data-dir=/tmp/lacuna-companion-data',
      ],
    });
  });

  it('keeps the host mailbox separate from each companion Electron profile', () => {
    const environment = {
      appPath: '/repo',
      execPath: '/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
      isPackaged: false,
      platform: 'darwin' as const,
      userDataPath: '/tmp/lacuna-v022-manual.Q3lViI',
    };

    expect(companionLaunchCommand({
      ...environment,
      companionUserDataPath: '/tmp/lacuna-companion-ai',
    }, '--ai-companion')).toEqual({
      command: '/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
      args: [
        '/repo',
        '--ai-companion',
        '--lacuna-host-user-data-dir=/tmp/lacuna-v022-manual.Q3lViI',
        '--user-data-dir=/tmp/lacuna-companion-ai',
      ],
    });
    expect(companionLaunchCommand({
      ...environment,
      companionUserDataPath: '/tmp/lacuna-companion-data',
    }, '--mcp-companion')).toEqual({
      command: '/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
      args: [
        '/repo',
        '--mcp-companion',
        '--lacuna-host-user-data-dir=/tmp/lacuna-v022-manual.Q3lViI',
        '--user-data-dir=/tmp/lacuna-companion-data',
      ],
    });
  });

  it('reads the host mailbox path without confusing it with Electron userData', () => {
    expect(companionHostUserDataPath([
      '/repo',
      '--ai-companion',
      '--lacuna-host-user-data-dir=/tmp/lacuna host',
      '--user-data-dir=/tmp/lacuna companion',
    ], '/fallback')).toBe('/tmp/lacuna host');
    expect(companionHostUserDataPath(['/repo', '--ai-companion'], '/fallback')).toBe('/fallback');
  });
});
