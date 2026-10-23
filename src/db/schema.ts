export { makeId } from '../utils/id';
import type { BackupFile } from './types';
import { savePreMigrationSnapshot } from './preMigrationSnapshots';
import { db } from './database';
export { db } from './database';

const CURRENT_SCHEMA_VERSION = 30;
const DESTRUCTIVE_SCHEMA_VERSIONS = new Set([22, 24, 26]);

/** Possible outcomes when trying to open the database. */
export type DbOpenResult =
  | { ok: true }
  | { ok: false; reason: 'quota' | 'corrupt' | 'blocked' | 'unknown'; message: string };

/**
 * Explicitly open the database so that corruption or quota errors surface early,
 * before any data operation runs. Dexie auto-opens on first query, which would
 * surface the error somewhere deep in the component tree; calling open() here
 * lets the UI show a clear failure screen instead.
 */
export async function openDatabase(): Promise<DbOpenResult> {
  try {
    await db.open();
    void import('./tombstonePrune')
      .then(({ pruneExpiredTombstones }) => pruneExpiredTombstones())
      .catch(() => undefined);
    return { ok: true };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      return {
        ok: false,
        reason: 'quota',
        message:
          'Your browser storage is full. Lacuna needs space to save your cards and progress. Free up disk space, or if you are in private browsing mode, switch to a normal window.',
      };
    }
    if (err instanceof DOMException && err.name === 'VersionError') {
      return {
        ok: false,
        reason: 'corrupt',
        message:
          'The local database appears to be from a newer version of Lacuna. Please refresh the page, or export a backup from the newer version and import it here.',
      };
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        reason: 'corrupt',
        message:
          'The local database could not be opened — it may be corrupted. Try exporting your data from Settings if you can access it, then reset the app storage.',
      };
    }
    if (err instanceof Error && err.message?.includes('blocked')) {
      return {
        ok: false,
        reason: 'blocked',
        message:
          'Lacuna is already open in another tab or window. Close the other instance and try again.',
      };
    }
    return {
      ok: false,
      reason: 'unknown',
      message: `Failed to open the local database: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function getCurrentDbVersion(name: string): Promise<number> {
  if ('databases' in indexedDB) {
    try {
      const dbs = await indexedDB.databases();
      const db = dbs.find((d) => d.name === name);
      return db?.version ? db.version / 10 : 0;
    } catch {
      // Fall through to raw open fallback.
    }
  }

  // Some browsers do not expose indexedDB.databases(). Opening without a version
  // reads an existing database without upgrading it. If the name is new, the open
  // creates a temporary v1 database; remove that probe before reporting no data.
  return new Promise((resolve, reject) => {
    let createdByProbe = false;
    const request = indexedDB.open(name);
    request.onupgradeneeded = (event) => {
      createdByProbe = (event as IDBVersionChangeEvent).oldVersion === 0;
    };
    request.onsuccess = () => {
      const opened = request.result;
      const version = opened.version;
      opened.close();
      if (!createdByProbe) {
        resolve(version / 10);
        return;
      }

      const deletion = indexedDB.deleteDatabase(name);
      deletion.onsuccess = () => resolve(0);
      deletion.onerror = () => reject(deletion.error);
      deletion.onblocked = () =>
        reject(new Error('Temporary database probe could not be removed because it is blocked'));
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database version probe is blocked'));
  });
}

export async function readAllDataFromVersion(
  name: string,
  expectedVersion?: number,
): Promise<BackupFile> {
  const { readAllDataFromVersion } = await import('./rawDatabaseSnapshot');
  return readAllDataFromVersion(name, expectedVersion);
}

// Cache the in-flight snapshot promise so concurrent calls await the same
// operation instead of racing or skipping.
const snapshotPromises = new Map<string, Promise<void>>();

export async function capturePreMigrationSnapshot(
  dbName: string,
  targetVersion: number,
  saveSnapshot: typeof savePreMigrationSnapshot = savePreMigrationSnapshot,
): Promise<void> {
  const currentVersion = await getCurrentDbVersion(dbName);
  await capturePreMigrationSnapshotFromVersion(dbName, currentVersion, targetVersion, saveSnapshot);
}

async function capturePreMigrationSnapshotFromVersion(
  dbName: string,
  currentVersion: number,
  targetVersion: number,
  saveSnapshot: typeof savePreMigrationSnapshot,
): Promise<void> {
  if (currentVersion === 0 || currentVersion >= targetVersion) return;

  const payload = await readAllDataFromVersion(dbName, currentVersion);
  await saveSnapshot(targetVersion, payload);
}

/**
 * Detect a pending schema upgrade and, if one is pending, capture a full
 * pre-migration snapshot in a separate committed transaction before the
 * destructive migration runs. The snapshot is written to the dedicated
 * `lacuna-pre-migration` database so it survives even if the main upgrade
 * aborts and rolls back.
 *
 * Concurrent calls for the same database name coalesce into a single snapshot
 * operation rather than racing each other.
 */
export async function ensurePreMigrationSnapshot(
  dbName: string = 'lacuna',
  targetVersion: number = CURRENT_SCHEMA_VERSION,
  saveSnapshot: typeof savePreMigrationSnapshot = savePreMigrationSnapshot,
): Promise<void> {
  const snapshotKey = `${dbName}:${targetVersion}`;
  const existing = snapshotPromises.get(snapshotKey);
  if (existing) return existing;

  const promise = (async () => {
    let currentVersion: number | undefined;
    try {
      currentVersion = await getCurrentDbVersion(dbName);
      await capturePreMigrationSnapshotFromVersion(
        dbName,
        currentVersion,
        targetVersion,
        saveSnapshot,
      );
    } catch (e) {
      console.error('Pre-migration snapshot failed:', e);
      // Remove from cache so a future call can retry. Destructive upgrades
      // propagate the failure to every caller sharing this promise.
      snapshotPromises.delete(snapshotKey);
      if (currentVersion === undefined) throw e;
      const versionBeforeUpgrade = currentVersion;
      if (
        [...DESTRUCTIVE_SCHEMA_VERSIONS].some(
          (version) => versionBeforeUpgrade < version && version <= targetVersion,
        )
      ) {
        throw e;
      }
    }
  })();

  snapshotPromises.set(snapshotKey, promise);
  return promise;
}
