import { type ReviewHistoryEntry } from './reviewHistory';
import { db } from './schema';

export async function replaceReviewHistoryForCards(
  cardIds: string[],
  entries: ReviewHistoryEntry[],
): Promise<void> {
  if (cardIds.length > 0) {
    await db.reviewHistory.where('cardId').anyOf(cardIds).delete();
  }
  if (entries.length > 0) await db.reviewHistory.bulkPut(entries);
}
