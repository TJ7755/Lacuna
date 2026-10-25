import type { Transaction } from 'dexie';
import { type Table } from 'dexie';
import type { Card } from './types';
import {
  projectCardForStorage,
  reviewHistoryEntriesForCard,
  type ReviewHistoryEntry,
} from './reviewHistory';
import { type ReviewActivityRow } from './reviewActivityProjection';

function containsReviewProjection(
  persisted: ReviewHistoryEntry[],
  projected: ReviewHistoryEntry[],
): boolean {
  const available = new Map<string, number>();
  for (const entry of persisted) {
    const key = migratedReviewHistoryIdentity(entry);
    available.set(key, (available.get(key) ?? 0) + 1);
  }
  for (const entry of projected) {
    const key = migratedReviewHistoryIdentity(entry);
    const count = available.get(key) ?? 0;
    if (count === 0) return false;
    available.set(key, count - 1);
  }
  return true;
}

/**
 * Card ownership fields are compatibility projections, not review identity. A
 * card may have moved Course or Lesson since an older canonical row was written;
 * that must not turn one review into two during a later migration.
 */
function migratedReviewHistoryIdentity(entry: ReviewHistoryEntry): string {
  const {
    id: _id,
    deckId: _deckId,
    courseId: _courseId,
    primaryLessonId: _primaryLessonId,
    schedulingUnitId: _schedulingUnitId,
    ...identity
  } = entry;
  return JSON.stringify(identity);
}

/**
 * Write one migration batch while checking only the destination keys needed for
 * collision resolution. The destination table is the durable collision index, so
 * migration does not need to retain every historical event in JavaScript memory.
 */
async function putMigratedReviewHistoryEntries(
  table: Table<ReviewHistoryEntry, string>,
  entries: ReviewHistoryEntry[],
): Promise<void> {
  for (const entry of entries) {
    const identity = migratedReviewHistoryIdentity(entry);
    let id = entry.id;
    let existing = await table.get(id);
    if (existing) {
      if (migratedReviewHistoryIdentity(existing) === identity) continue;

      const suffix =
        existing.cardId === entry.cardId
          ? `${entry.id}:duplicate`
          : `${entry.id}:card:${encodeURIComponent(entry.cardId)}`;
      id = suffix;
      existing = await table.get(id);
      let collision = 1;
      while (existing) {
        if (migratedReviewHistoryIdentity(existing) === identity) {
          id = '';
          break;
        }
        id = `${suffix}:${collision++}`;
        existing = await table.get(id);
      }
      if (!id) continue;
    }
    await table.put({ ...entry, id });
  }
}

export async function upgradeCanonicalReviewHistory(tx: Transaction): Promise<void> {
  const cardsTable = tx.table('cards');
  const reviewHistoryTable = tx.table('reviewHistory');
  const batchSize = 100;
  // Resolve collisions against rows already written to the destination table.
  // This keeps migration memory bounded by the batch rather than retaining a
  // process-wide index of every migrated event.
  let offset = 0;
  for (;;) {
    const cards = await cardsTable.offset(offset).limit(batchSize).toArray();
    if (cards.length === 0) break;
    const entries = cards.flatMap((card) => reviewHistoryEntriesForCard(card as Card));
    await putMigratedReviewHistoryEntries(reviewHistoryTable, entries);
    offset += cards.length;
  }
}

export async function upgradeStoredReviewProjection(tx: Transaction): Promise<void> {
  const cardsTable = tx.table<Card, string>('cards');
  const reviewHistoryTable = tx.table<ReviewHistoryEntry, string>('reviewHistory');
  const batchSize = 100;
  let offset = 0;

  for (;;) {
    const cards = await cardsTable.offset(offset).limit(batchSize).toArray();
    if (cards.length === 0) break;

    for (const card of cards) {
      const projectedEntries = reviewHistoryEntriesForCard(card);
      if (projectedEntries.length > 0) {
        await putMigratedReviewHistoryEntries(reviewHistoryTable, projectedEntries);
        const persisted = await reviewHistoryTable.where('cardId').equals(card.id).toArray();
        if (!containsReviewProjection(persisted, projectedEntries)) {
          throw new Error(`Review-history migration verification failed for card ${card.id}`);
        }
      }
      await cardsTable.put(projectCardForStorage(card));
    }
    offset += cards.length;
  }
}

export async function upgradeReviewActivity(tx: Transaction): Promise<void> {
  const timestamps = new Map<string, number[]>();
  await tx
    .table<ReviewHistoryEntry, string>('reviewHistory')
    .orderBy('cardId')
    .each((entry) => {
      const values = timestamps.get(entry.cardId) ?? [];
      values.push(entry.timestamp);
      timestamps.set(entry.cardId, values);
    });
  if (timestamps.size > 0) {
    await tx.table<ReviewActivityRow, string>('reviewActivity').bulkPut(
      [...timestamps].map(([cardId, values]) => ({
        cardId,
        timestamps: values.sort((a, b) => a - b),
      })),
    );
  }
}
