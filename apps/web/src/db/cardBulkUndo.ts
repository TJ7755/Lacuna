import { restoreCards, snapshotCards, type CardSnapshot } from './cardDeletion';
import { stampUpdatedAt } from './mutationStamp';
import { db } from './schema';

function fingerprint(snapshot: CardSnapshot): string {
  // Array-owned properties are omitted by JSON.stringify unless named explicitly.
  return JSON.stringify({
    cards: [...snapshot],
    lessonCards: snapshot.lessonCards,
    lessonCardExposures: snapshot.lessonCardExposures,
    reviewHistory: snapshot.reviewHistory,
  });
}

/** Undo is all-or-nothing: any later edit, review, exposure or deletion invalidates it. */
export async function applyUndoableCardChange(
  ids: string[],
  apply: (ids: string[]) => Promise<void>,
): Promise<() => Promise<void>> {
  // Assignment can create backing decks and remove primary-lesson exposures.
  const tables = [
    db.cards,
    db.courses,
    db.lessons,
    db.courseAssessments,
    db.schedulingUnits,
    db.coursePerformance,
    db.schedulingPerformance,
    db.lessonCards,
    db.lessonCardExposures,
    db.reviewHistory,
    db.tombstones,
  ];
  const { before, after } = await db.transaction('rw', tables, async () => {
    const before = await snapshotCards(ids);
    await apply(ids);
    const after = fingerprint(await snapshotCards(ids));
    return { before, after };
  });
  return async () => {
    await db.transaction('rw', tables, async () => {
      if (fingerprint(await snapshotCards(ids)) !== after) {
        throw new Error('The selected cards have changed since this action.');
      }
      await restoreCards(before);
      // Undo is a new mutation for synchronisation, not a return to an old write stamp.
      await db.cards.where('id').anyOf(ids).modify(stampUpdatedAt({}));
    });
  };
}
