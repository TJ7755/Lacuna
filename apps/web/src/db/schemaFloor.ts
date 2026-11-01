export async function getCurrentDbVersion(name: string): Promise<number> {
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

export const MINIMUM_SCHEMA_VERSION = 27;

export class UnsupportedSchemaError extends Error {
  constructor(version: number) {
    super(
      `This database uses Lacuna schema v${version}, which is older than the supported v27 minimum. Your local data has not been changed. Open the previous Lacuna build using the same browser profile (or desktop profile), export a backup from Settings. Verify that the backup file was saved before clearing this site’s storage (or resetting the desktop profile). Then reopen this build and import the backup from Settings. You can instead import into a separate browser profile to keep the original untouched. Do not clear your browser or app storage before exporting.`,
    );
    this.name = 'UnsupportedSchemaError';
  }
}

export async function assertSupportedDatabase(name: string): Promise<void> {
  const version = await getCurrentDbVersion(name);
  if (version > 0 && version < MINIMUM_SCHEMA_VERSION) throw new UnsupportedSchemaError(version);
}

/** Reject unsupported databases before Dexie's versionchange handler can run. */
export function guardedIndexedDB(factory: IDBFactory): IDBFactory {
  return new Proxy(factory, {
    get(target, property) {
      if (property === 'open') {
        return (name: string, version?: number) => {
          const request = target.open(name, version);
          request.addEventListener('upgradeneeded', (event) => {
            const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
            if (oldVersion > 0 && oldVersion < MINIMUM_SCHEMA_VERSION * 10) {
              event.stopImmediatePropagation();
              request.transaction?.abort();
            }
          });
          return request;
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
