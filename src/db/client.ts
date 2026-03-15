/**
 * SQLite client initialisation.
 *
 * On the web the database runs in-browser via sqlite-wasm, using the OPFS
 * (Origin Private File System) storage backend for persistence.
 *
 * This module is a stub — full initialisation will be implemented when the
 * first data access is required.
 */

// TODO: initialise sqlite-wasm with OPFS backend and expose a drizzle client.
// This requires a SharedArrayBuffer-compatible environment (COOP/COEP headers).

export type DbClient = null; // placeholder until full initialisation

let _client: DbClient = null;

export function getDbClient(): DbClient {
  return _client;
}
