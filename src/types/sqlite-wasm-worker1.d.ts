import type { Sqlite3Static } from '@sqlite.org/sqlite-wasm';

declare module '@sqlite.org/sqlite-wasm' {
  export const sqlite3Worker1Promiser: Sqlite3Static['Worker1Promiser']['v2'];
}
