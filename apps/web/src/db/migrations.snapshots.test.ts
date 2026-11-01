import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPreMigrationSnapshot, savePreMigrationSnapshot } from './preMigrationSnapshots';
import type { BackupFile } from '@lacuna/core/db/types';

describe('pre-migration snapshot ordering', () => {
  beforeEach(async () => {
    // Clean up the pre-migration DB between tests.
    const preDb = new Dexie('lacuna-pre-migration');
    await preDb.delete();
  });

  it('writes a snapshot before the destructive upgrade and it survives a failed migration', async () => {
    const dbName = `lacuna-pre-mig-${Date.now()}`;

    // 1. Create a v3 database with some data.
    const v3 = new Dexie(dbName);
    v3.version(3).stores({
      decks: 'id, createdAt, examDate',
      cards: 'id, deckId, type, lastReviewed',
      sessionHistory: '++id, deckId, timestamp',
      userPerformance: 'deckId',
      backups: '++id, createdAt',
      appState: 'key',
    });
    await v3.open();
    await v3.table('decks').add({
      id: 'd1',
      name: 'Pre-migration deck',
      examDate: 1000,
      createdAt: 0,
    });
    await v3.table('cards').add({
      id: 'c1',
      deckId: 'd1',
      schedulingUnitId: 'd1',
      type: 'front_back',
      front: 'question',
      back: 'answer',
      stability: null,
      difficulty: null,
      lastReviewed: null,
      reps: 0,
      lapses: 0,
      state: 0,
      due: null,
      scheduledDays: 0,
      learningSteps: 0,
      history: [],
      createdAt: 0,
    });
    v3.close();

    // 2. Simulate the pre-migration snapshot capture (mirrors ensurePreMigrationSnapshot).
    const { readAllDataFromVersion } = await import('./schema');
    const payload = await readAllDataFromVersion(dbName);
    expect(payload.decks).toHaveLength(1);
    expect(payload.cards).toHaveLength(1);
    await savePreMigrationSnapshot(4, payload);

    // 3. Open at v4 with a migration that deliberately throws.
    const v4 = new Dexie(dbName);
    v4.version(3).stores({
      decks: 'id, createdAt, examDate',
      cards: 'id, deckId, type, lastReviewed',
      sessionHistory: '++id, deckId, timestamp',
      userPerformance: 'deckId',
      backups: '++id, createdAt',
      appState: 'key',
    });
    v4.version(4)
      .stores({
        decks: 'id, createdAt, examDate',
        cards: 'id, deckId, type, lastReviewed',
        sessionHistory: '++id, deckId, timestamp',
        userPerformance: 'deckId',
        backups: '++id, createdAt',
        appState: 'key',
        assets: 'hash, createdAt',
      })
      .upgrade(async () => {
        throw new Error('Simulated migration failure');
      });

    await expect(v4.open()).rejects.toThrow();

    // 4. The pre-migration snapshot still exists and is restorable.
    const snapshot = await getPreMigrationSnapshot(4);
    expect(snapshot).toBeDefined();
    expect(snapshot!.payload.decks).toHaveLength(1);
    expect(snapshot!.payload.decks![0].name).toBe('Pre-migration deck');
    expect(snapshot!.payload.cards).toHaveLength(1);
    expect(snapshot!.payload.cards[0].front).toBe('question');

    v4.close();
  });

  it('captures Deck and Folder rows from a v21 database before v22', async () => {
    const dbName = `lacuna-v21-snapshot-${Date.now()}`;
    const v21 = new Dexie(dbName);
    v21.version(21).stores({
      decks: 'id, createdAt, examDate, folderId',
      folders: 'id, parentId, createdAt',
    });
    await v21.open();
    await v21.table('folders').add({ id: 'folder-1', name: 'Legacy folder', createdAt: 1 });
    await v21.table('decks').add({
      id: 'deck-1',
      name: 'Legacy deck',
      folderId: 'folder-1',
      examDate: 1000,
      createdAt: 2,
    });
    v21.close();

    const { readAllDataFromVersion } = await import('./schema');
    const payload = await readAllDataFromVersion(dbName, 21);

    expect(payload.decks).toEqual([
      expect.objectContaining({ id: 'deck-1', name: 'Legacy deck', folderId: 'folder-1' }),
    ]);
    expect(payload.folders).toEqual([
      expect.objectContaining({ id: 'folder-1', name: 'Legacy folder' }),
    ]);
    await new Dexie(dbName).delete();
  });

  it('detects an existing database when indexedDB.databases is unavailable', async () => {
    const dbName = `lacuna-v21-no-databases-api-${Date.now()}`;
    const v21 = new Dexie(dbName);
    v21.version(21).stores({ decks: 'id, createdAt' });
    await v21.open();
    await v21.table('decks').add({ id: 'deck-1', name: 'Protected', createdAt: 1 });
    v21.close();

    const originalDatabases = indexedDB.databases;
    let payload: BackupFile | undefined;
    Object.defineProperty(indexedDB, 'databases', { value: undefined, configurable: true });
    try {
      const { capturePreMigrationSnapshot } = await import('./schema');
      await capturePreMigrationSnapshot(dbName, 22, async (_targetVersion, snapshot) => {
        payload = snapshot;
      });
    } finally {
      Object.defineProperty(indexedDB, 'databases', {
        value: originalDatabases,
        configurable: true,
      });
      await new Dexie(dbName).delete();
    }

    expect(payload?.decks).toEqual([expect.objectContaining({ id: 'deck-1', name: 'Protected' })]);
  });

  it('blocks a destructive v22 upgrade when its snapshot cannot be committed', async () => {
    const dbName = `lacuna-v22-snapshot-failure-${Date.now()}`;
    const v21 = new Dexie(dbName);
    v21.version(21).stores({ decks: 'id, createdAt' });
    await v21.open();
    await v21.table('decks').add({ id: 'deck-1', name: 'Protected', createdAt: 1 });
    v21.close();

    const snapshotFailure = new Error('Snapshot storage unavailable');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ensurePreMigrationSnapshot } = await import('./schema');
    await expect(
      ensurePreMigrationSnapshot(dbName, 22, async () => Promise.reject(snapshotFailure)),
    ).rejects.toBe(snapshotFailure);
    consoleError.mockRestore();

    const unchanged = new Dexie(dbName);
    unchanged.version(21).stores({ decks: 'id, createdAt' });
    await unchanged.open();
    expect(await unchanged.table('decks').get('deck-1')).toEqual(
      expect.objectContaining({ name: 'Protected' }),
    );
    unchanged.close();
    await unchanged.delete();
  });

  it('does not open a default-target upgrade across v22 when its snapshot fails, and permits retry', async () => {
    const dbName = `lacuna-default-snapshot-failure-${Date.now()}`;
    const v21 = new Dexie(dbName);
    v21.version(21).stores({ decks: 'id, createdAt' });
    await v21.open();
    await v21.table('decks').add({ id: 'deck-1', name: 'Protected', createdAt: 1 });
    v21.close();

    const snapshotFailure = new Error('Snapshot storage unavailable');
    const saveSnapshot = vi
      .fn()
      .mockRejectedValueOnce(snapshotFailure)
      .mockResolvedValue(undefined);
    const openUpgradedDatabase = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ensurePreMigrationSnapshot } = await import('./schema');
    try {
      await expect(
        (async () => {
          await ensurePreMigrationSnapshot(dbName, undefined, saveSnapshot);
          openUpgradedDatabase();
        })(),
      ).rejects.toBe(snapshotFailure);
      expect(openUpgradedDatabase).not.toHaveBeenCalled();

      const unchanged = new Dexie(dbName);
      unchanged.version(21).stores({ decks: 'id, createdAt' });
      await unchanged.open();
      expect(await unchanged.table('decks').get('deck-1')).toEqual(
        expect.objectContaining({ name: 'Protected' }),
      );
      unchanged.close();

      await ensurePreMigrationSnapshot(dbName, undefined, saveSnapshot);
      expect(saveSnapshot).toHaveBeenCalledTimes(2);
    } finally {
      consoleError.mockRestore();
      await new Dexie(dbName).delete();
    }
  });

  it('continues a non-destructive v26-to-v27 upgrade when its snapshot fails', async () => {
    const dbName = `lacuna-v26-snapshot-failure-${Date.now()}`;
    const v26 = new Dexie(dbName);
    v26.version(26).stores({ appState: 'key' });
    await v26.open();
    v26.close();

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ensurePreMigrationSnapshot } = await import('./schema');
    try {
      await expect(
        ensurePreMigrationSnapshot(dbName, undefined, async () => {
          throw new Error('Snapshot storage unavailable');
        }),
      ).resolves.toBeUndefined();
    } finally {
      consoleError.mockRestore();
      await new Dexie(dbName).delete();
    }
  });

  it('does not take a snapshot when the database is already at the target version', async () => {
    const dbName = `lacuna-current-${Date.now()}`;
    const v4 = new Dexie(dbName);
    v4.version(4).stores({
      decks: 'id, createdAt, examDate',
      cards: 'id, deckId, type, lastReviewed',
      sessionHistory: '++id, deckId, timestamp',
      userPerformance: 'deckId',
      backups: '++id, createdAt',
      appState: 'key',
      assets: 'hash, createdAt',
    });
    await v4.open();
    await v4.table('decks').add({
      id: 'd1',
      name: 'Current deck',
      examDate: 1000,
      createdAt: 0,
    });
    v4.close();

    // Call the actual production helper: it should skip writing because
    // currentVersion (4) is not less than targetVersion (4).
    const { ensurePreMigrationSnapshot } = await import('./schema');
    await ensurePreMigrationSnapshot(dbName, 4);

    const snapshot = await getPreMigrationSnapshot(4);
    expect(snapshot).toBeUndefined();

    v4.close();
  });
});
