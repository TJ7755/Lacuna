import type { Card } from './types';
import { db } from './schema';

/** Read the materialised timestamp-only projection for the supplied live cards. */
export async function readReviewActivity(
  cards: readonly Pick<Card, 'id'>[],
): Promise<Map<string, number[]>> {
  if (cards.length === 0) return new Map();

  const liveCardIds = new Set(cards.map((card) => card.id));
  const rows = await db.reviewActivity.toArray();
  const activity = new Map<string, number[]>();

  for (const row of rows) {
    if (liveCardIds.has(row.cardId)) activity.set(row.cardId, row.timestamps);
  }

  return activity;
}
