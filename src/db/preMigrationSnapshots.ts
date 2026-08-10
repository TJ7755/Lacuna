// Pre-migration snapshots live in their own IndexedDB so a failed schema upgrade
// on the main database never rolls the snapshot back with it.

import Dexie, { type Table } from 'dexie';
import type { BackupFile } from './types';

interface PreMigrationSnapshot {
  id?: number;
  targetVersion: number;
  createdAt: number;
  payload: BackupFile;
}

class PreMigrationDb extends Dexie {
  snapshots!: Table<PreMigrationSnapshot, number>;

  constructor() {
    super('lacuna-pre-migration');
    this.version(1).stores({
      snapshots: '++id, targetVersion',
    });
  }
}

export async function savePreMigrationSnapshot(
  targetVersion: number,
  payload: BackupFile,
): Promise<void> {
  const preMigrationDb = new PreMigrationDb();
  try {
    await preMigrationDb.snapshots.add({ targetVersion, createdAt: Date.now(), payload });
  } finally {
    preMigrationDb.close();
  }
  // Also mirror to the configured folder so the snapshot survives browser data clearing.
  // Fire-and-forget so the snapshot is committed immediately; the mirror is best-effort.
  const { mirrorToFolder } = await import('./backups');
  void mirrorToFolder(payload).catch((e: unknown) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('Pre-migration folder mirror failed:', e);
    }
  });
}

export async function getPreMigrationSnapshot(
  targetVersion: number,
): Promise<PreMigrationSnapshot | undefined> {
  const preMigrationDb = new PreMigrationDb();
  try {
    return await preMigrationDb.snapshots.where({ targetVersion }).last();
  } finally {
    preMigrationDb.close();
  }
}
