import type { Card } from '@lacuna/core/db/types';
import { db } from './schema';

/** Read the materialised timestamp-only projection for the supplied live cards. */
export async function readReviewActivity(
  cards: readonly Pick<Card, 'id'>[],
  scope: 'library' | 'selection' = 'library',
): Promise<Map<string, number[]>> {
  if (cards.length === 0) return new Map();

  const liveCardIds = new Set(cards.map((card) => card.id));
  // Individual key requests beat cloning unrelated histories for a small
  // course. Keep dense reads implicit to share the library's cached getAll.
  const sparse = scope === 'selection' && (await db.reviewActivity.count()) >= liveCardIds.size * 4;
  const rows = sparse
    ? await db.reviewActivity.bulkGet([...liveCardIds])
    : await db.reviewActivity.toArray();
  const activity = new Map<string, number[]>();

  for (const row of rows) {
    if (row && liveCardIds.has(row.cardId)) activity.set(row.cardId, row.timestamps);
  }

  return activity;
}
