// Drop tombstones older than the retention window. A device offline longer
// than this cannot merge correctly and must reset from a pull instead.

import { db } from './schema';
import { TOMBSTONE_RETENTION_MS } from './mutationStamp';

export async function pruneExpiredTombstones(
  now = Date.now(),
  retentionMs = TOMBSTONE_RETENTION_MS,
): Promise<number> {
  const cutoff = now - retentionMs;
  return db.tombstones.where('deletedAt').below(cutoff).delete();
}
