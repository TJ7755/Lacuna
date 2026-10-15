// Folder mirror selection, permission handling and file naming.

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './schema';
import {
  backupFolderName,
  chooseBackupFolder,
  clearBackupFolder,
  folderMirrorSupported,
  mirrorToFolder,
} from './backupFolder';
import type { BackupFile } from './types';

const picker = window as unknown as { showDirectoryPicker?: unknown };

function folder(permission: { query?: PermissionState; request?: PermissionState }) {
  const write = vi.fn(async (_: string) => undefined);
  const close = vi.fn(async () => undefined);
  const handle = {
    name: 'Backups',
    queryPermission: vi.fn(async () => permission.query ?? 'prompt'),
    requestPermission: vi.fn(async () => permission.request ?? 'denied'),
    getFileHandle: vi.fn(async (_: string, __?: { create?: boolean }) => ({
      createWritable: async () => ({ write, close }),
    })),
  };
  vi.spyOn(db.appState, 'get').mockResolvedValue({ key: 'backupFolderHandle', value: handle });
  return { handle, write, close };
}

describe('backup folder mirror', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete picker.showDirectoryPicker;
  });

  it('remembers the chosen folder until it is cleared', async () => {
    expect(folderMirrorSupported()).toBe(false);
    expect(await chooseBackupFolder()).toBeNull();

    const showDirectoryPicker = vi.fn(async () => ({ name: 'Backups' }));
    picker.showDirectoryPicker = showDirectoryPicker;

    expect(folderMirrorSupported()).toBe(true);
    expect(await chooseBackupFolder()).toBe('Backups');
    expect(showDirectoryPicker).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(await backupFolderName()).toBe('Backups');

    await clearBackupFolder();
    expect(await backupFolderName()).toBeNull();
  });

  it('writes a timestamped file once permission is granted on request', async () => {
    const { handle, write, close } = folder({ request: 'granted' });
    const payload = { exportedAt: Date.UTC(2026, 7, 12, 9, 5, 7) } as BackupFile;

    await mirrorToFolder(payload);

    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(handle.getFileHandle).toHaveBeenCalledWith('lacuna-backup-2026-08-12T09-05-07.json', {
      create: true,
    });
    expect(write).toHaveBeenCalledWith(JSON.stringify(payload, null, 2));
    expect(close).toHaveBeenCalled();
  });

  it('writes nothing when folder permission is refused', async () => {
    const { handle } = folder({ request: 'denied' });

    await mirrorToFolder({ exportedAt: 0 } as BackupFile);

    expect(handle.getFileHandle).not.toHaveBeenCalled();
  });

  it('does nothing without a configured folder', async () => {
    await expect(mirrorToFolder({ exportedAt: 0 } as BackupFile)).resolves.toBeUndefined();
  });
});
