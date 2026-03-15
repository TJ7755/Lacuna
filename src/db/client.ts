/**
 * SQLite client — sqlite-wasm + Drizzle ORM
 *
 * Uses the OPFS (Origin Private File System) VFS for persistent in-browser
 * storage. Falls back to an in-memory database when OPFS is unavailable (e.g.
 * in environments without the required COOP/COEP headers).
 *
 * The database is a singleton: `getDb()` initialises once and reuses the same
 * Drizzle client for the lifetime of the page.
 *
 * React integration lives in `./DbProvider` to satisfy fast-refresh constraints.
 */

import { sqlite3Worker1Promiser } from '@sqlite.org/sqlite-wasm';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema';
import migrations from './migrations/index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DrizzleClient = SqliteRemoteDatabase<typeof schema>;
type SqliteWorkerPromiser = Awaited<ReturnType<typeof sqlite3Worker1Promiser>>;
type WorkerBindingSpec = readonly (
  | string
  | number
  | null
  | bigint
  | Uint8Array
  | Int8Array
  | ArrayBuffer
  | boolean
  | undefined
)[];

// ---------------------------------------------------------------------------
// Migration runner
// ---------------------------------------------------------------------------

function toWorkerBinding(params: unknown[]): WorkerBindingSpec {
  return params as WorkerBindingSpec;
}

async function execRun(
  promiser: SqliteWorkerPromiser,
  sql: string,
  bind: WorkerBindingSpec = [],
): Promise<void> {
  await promiser({ type: 'exec', args: { sql, bind } });
}

async function execRows(
  promiser: SqliteWorkerPromiser,
  sql: string,
  bind: WorkerBindingSpec = [],
): Promise<unknown[][]> {
  const { result } = await promiser({
    type: 'exec',
    args: {
      sql,
      bind,
      rowMode: 'array',
      returnValue: 'resultRows',
    },
  });

  return (result.resultRows as unknown[][] | undefined) ?? [];
}

async function runMigrations(promiser: SqliteWorkerPromiser): Promise<void> {
  // Create the migrations tracking table if it does not already exist.
  await execRun(
    promiser,
    `CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT    NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    )`,
  );

  for (const migration of migrations) {
    // Check whether this migration has already been applied.
    const applied = await execRows(
      promiser,
      'SELECT hash FROM __drizzle_migrations WHERE hash = ?',
      [migration.hash],
    );

    if (applied.length > 0) continue;

    // Split on the drizzle-kit statement separator and execute each fragment.
    const statements = migration.sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      await execRun(promiser, stmt);
    }

    await execRun(
      promiser,
      'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
      [migration.hash, Date.now()],
    );

    console.log(`[lacuna/db] Applied migration: ${migration.hash}`);
  }
}

// ---------------------------------------------------------------------------
// DB initialisation
// ---------------------------------------------------------------------------

let _initPromise: Promise<DrizzleClient> | null = null;

async function initDb(): Promise<DrizzleClient> {
  const promiser = await sqlite3Worker1Promiser();

  const isCrossOriginIsolated =
    typeof crossOriginIsolated === 'boolean' && crossOriginIsolated;

  if (typeof SharedArrayBuffer === 'undefined' || !isCrossOriginIsolated) {
    console.warn(
      '[Lacuna] SharedArrayBuffer unavailable or cross-origin isolation inactive. ' +
        'OPFS persistence may not work. Falling back to in-memory SQLite.',
    );
  }

  const config = await promiser({ type: 'config-get' });
  if (config.type !== 'config-get') {
    throw new Error('[lacuna/db] Unexpected worker response for config-get.');
  }
  const hasOpfsVfs = config.result.vfsList.includes('opfs');
  let usingPersistentOpfs = false;

  if (hasOpfsVfs) {
    try {
      const opened = await promiser({
        type: 'open',
        args: { filename: 'file:lacuna.db?vfs=opfs' },
      });
      usingPersistentOpfs = opened.result.persistent;

      if (usingPersistentOpfs) {
        console.log('[lacuna/db] Using OPFS persistent storage.');
      } else {
        console.warn(
          '[lacuna/db] OPFS VFS opened without persistence. Falling back to in-memory SQLite.',
        );
        await promiser({ type: 'close', args: {} });
        await promiser({ type: 'open', args: { filename: ':memory:' } });
      }
    } catch (err) {
      console.warn(
        '[lacuna/db] OPFS initialisation failed; falling back to in-memory storage.',
        err,
      );
      await promiser({ type: 'open', args: { filename: ':memory:' } });
    }
  } else {
    console.warn(
      '[lacuna/db] OPFS is not available. ' +
        'Data will not persist across page reloads. ' +
        'Ensure COOP/COEP headers are set correctly.',
    );
    await promiser({ type: 'open', args: { filename: ':memory:' } });
  }

  await runMigrations(promiser);

  // Wrap the sqlite-wasm OO1 API in a Drizzle proxy.
  // Worker1 API exec() is asynchronous, so Drizzle operations await it.
  const client = drizzle(
    async (sql, params, method) => {
      if (method === 'run') {
        await execRun(promiser, sql, toWorkerBinding(params));
        return { rows: [] };
      }

      const rows = await execRows(promiser, sql, toWorkerBinding(params));

      return { rows };
    },
    { schema },
  );

  return client;
}

/**
 * Returns a promise resolving to the singleton Drizzle client.
 * Safe to call multiple times — initialisation happens exactly once.
 */
export function getDb(): Promise<DrizzleClient> {
  if (!_initPromise) {
    _initPromise = initDb().catch((err: unknown) => {
      // Reset so a subsequent call can retry.
      _initPromise = null;
      console.error('[lacuna/db] Failed to initialise database.', err);
      throw err;
    });
  }
  return _initPromise;
}
