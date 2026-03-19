// ---------------------------------------------------------------------------
// Browser migration runner
//
// Imports each generated SQL migration file as a raw string via Vite's
// `?raw` feature. Add new entries here whenever `drizzle-kit generate` is run.
// The hash is the migration filename (without .sql) and doubles as a unique
// identifier tracked in the __drizzle_migrations table.
// ---------------------------------------------------------------------------

import sql0000 from './0000_friendly_energizer.sql?raw';
import sql0001 from './0001_hesitant_reaper.sql?raw';
import sql0002 from './0002_wise_rocket.sql?raw';

export type Migration = {
  hash: string;
  sql: string;
};

const migrations: Migration[] = [
  { hash: '0000_friendly_energizer', sql: sql0000 },
  { hash: '0001_hesitant_reaper', sql: sql0001 },
  { hash: '0002_wise_rocket', sql: sql0002 },
];

export default migrations;
