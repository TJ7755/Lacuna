import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackupFile } from './types';

const mirrorToFolder = vi.fn<(payload: BackupFile) => Promise<void>>();
vi.mock('./backupFolder', () => ({ mirrorToFolder }));

const { getPreMigrationSnapshot, savePreMigrationSnapshot } =
  await import('./preMigrationSnapshots');

const payload = { exportedAt: 1 } as BackupFile;

describe('pre-migration folder mirror failures', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('keeps the snapshot and warns in development when the mirror fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failure = new Error('folder gone');
    mirrorToFolder.mockRejectedValueOnce(failure);

    await savePreMigrationSnapshot(901, payload);
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith('Pre-migration folder mirror failed:', failure),
    );
    expect((await getPreMigrationSnapshot(901))?.payload).toEqual(payload);
  });

  it('stays silent outside development', async () => {
    vi.stubEnv('DEV', false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let rejected!: () => void;
    mirrorToFolder.mockImplementationOnce(
      () => new Promise((_, reject) => (rejected = () => reject(new Error('folder gone')))),
    );

    await savePreMigrationSnapshot(902, payload);
    rejected();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warn).not.toHaveBeenCalled();
    expect(await getPreMigrationSnapshot(902)).toBeDefined();
  });
});
