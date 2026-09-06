import { db } from './schema';
import type { ReviewHistoryEntry } from './reviewHistory';

/** The caller owns the import transaction and has resolved duplicate event identities. */
export async function addReviewHistoryInBatches(
  entries: readonly ReviewHistoryEntry[],
): Promise<void> {
  const batchSize = 2_000;
  for (let offset = 0; offset < entries.length; offset += batchSize) {
    await db.reviewHistory.bulkAdd(entries.slice(offset, offset + batchSize));
  }
}
