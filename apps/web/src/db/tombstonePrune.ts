// Drop tombstones older than the retention window. A device offline longer
// than this cannot merge correctly and must reset from a pull instead.

import { db } from './database';
import { TOMBSTONE_RETENTION_MS } from './mutationStamp';

export async function pruneExpiredTombstones(): Promise<number> {
  const cutoff = Date.now() - TOMBSTONE_RETENTION_MS;
  return db.tombstones.where('deletedAt').below(cutoff).delete();
}
