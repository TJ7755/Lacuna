import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { expect, it } from 'vitest';

it('runs SQLite with the WASM binary shipped to the Anki worker', async () => {
  // Fixture generation uses the package binary and can hide a mismatched bundled runtime.
  const SQL = await initSqlJs({
    wasmBinary: new Uint8Array(readFileSync('src/assets/sql-wasm.wasm')).buffer,
  });
  const collection = new SQL.Database();
  try {
    expect(collection.exec('SELECT 42 AS answer')).toEqual([
      { columns: ['answer'], values: [[42]] },
    ]);
  } finally {
    collection.close();
  }
});
