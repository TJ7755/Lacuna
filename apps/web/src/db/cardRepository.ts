import {
  buildCardConcept,
  conceptMatchesCardScope,
  conceptNameForCard,
} from '../questions/concepts';
import { scheduleAssetGc } from './assets';
import { ensureCourseBankBackingDeck, ensureLessonBackingDeck } from './backingDecks';
import { friendlyDbError } from './dbErrors';
import { lessonCardExposureId, recordTombstones, stampUpdatedAt } from './mutationStamp';
import { db, makeId } from './schema';
import type { AnswerMode, Card, CardType, ItemPayload } from '@lacuna/core/db/types';

async function assertValidCardPayload(type: CardType, payload: unknown): Promise<void> {
  if (payload === undefined || payload === null) return;
  const { assertValidCardPayload: validate } = await import('../items/payloadValidation');
  validate(type, payload);
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** Normalise card text for duplicate comparison: trim, lowercase, collapse whitespace.
 * Exported so src/mcp/diffImport.ts can reuse the exact same semantics rather than
 * forking them (see checkDuplicatesBatch, which this also backs). */
export function normaliseCardText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Check whether a card with the same type, front, and back already exists in the deck. */
export async function checkDuplicate(
  deckId: string,
  type: CardType,
  front: string,
  back: string,
  excludeId?: string,
): Promise<Card | undefined> {
  const normalisedFront = normaliseCardText(front);
  const normalisedBack = normaliseCardText(back);
  const existing = await db.cards.where('schedulingUnitId').equals(deckId).toArray();
  return existing.find((c) => {
    if (c.type !== type) return false;
    if (excludeId && c.id === excludeId) return false;
    return (
      normaliseCardText(c.front) === normalisedFront && normaliseCardText(c.back) === normalisedBack
    );
  });
}

/** Check many drafts against a deck in a single DB read, returning the indices of duplicates. */
export async function checkDuplicatesBatch(
  deckId: string,
  drafts: { type: CardType; front: string; back: string }[],
): Promise<Set<number>> {
  const existing = await db.cards.where('schedulingUnitId').equals(deckId).toArray();
  const existingSet = new Set(
    existing.map((c) =>
      JSON.stringify([c.type, normaliseCardText(c.front), normaliseCardText(c.back)]),
    ),
  );
  const seen = new Set<string>();
  const duplicates = new Set<number>();
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    const key = JSON.stringify([d.type, normaliseCardText(d.front), normaliseCardText(d.back)]);
    if (existingSet.has(key) || seen.has(key)) {
      duplicates.add(i);
    } else {
      seen.add(key);
    }
  }
  return duplicates;
}

export async function createCard(
  deckId: string,
  type: CardType,
  front: string,
  back: string,
  tags: string[] = [],
  opts?: Pick<Card, 'courseId' | 'primaryLessonId' | 'payload' | 'answerMode'> & {
    conceptId?: string;
  },
): Promise<Card> {
  try {
    // Avoid a non-database await inside a caller's transaction when there is
    // nothing to validate; IndexedDB may otherwise commit prematurely.
    if (opts?.payload !== undefined && opts?.payload !== null)
      await assertValidCardPayload(type, opts.payload);
    return await db.transaction('rw', [db.cards, db.schedulingUnits, db.concepts], async () => {
      const unit = await db.schedulingUnits.get(deckId);
      const courseId = opts?.courseId === undefined ? unit?.courseId : opts.courseId;
      const primaryLessonId =
        opts?.primaryLessonId === undefined ? unit?.lessonId : opts.primaryLessonId;
      const now = Date.now();
      const conceptId = opts?.conceptId ?? makeId();
      if (opts?.conceptId) {
        const concept = await db.concepts.get(opts.conceptId);
        if (!concept || !conceptMatchesCardScope(concept, courseId, deckId)) {
          throw new Error('The selected Concept does not belong to this Card scope.');
        }
      } else {
        await db.concepts.add(
          buildCardConcept({
            id: conceptId,
            courseId,
            schedulingUnitId: deckId,
            name: conceptNameForCard(type, front, back),
            now,
          }),
        );
      }
      const card: Card = stampUpdatedAt(
        {
          id: makeId(),
          conceptId,
          deckId,
          type,
          front,
          back,
          stability: null,
          difficulty: null,
          lastReviewed: null,
          reps: 0,
          lapses: 0,
          state: 0,
          due: null,
          scheduledDays: 0,
          learningSteps: 0,
          history: [],
          createdAt: now,
          tags,
          suspended: false,
          buriedUntil: null,
          schedulingUnitId: deckId,
          updatedAt: now,
          courseId,
          primaryLessonId,
          payload: opts?.payload,
          answerMode: opts?.answerMode,
        },
        now,
      );
      await db.cards.add(card);
      return card;
    });
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * Bulk-create cards from import drafts (front/back/type only). Returns the created
 * cards. createdAt is offset per row so the deck keeps the imported order.
 */
export async function createCards(
  deckId: string,
  drafts: {
    type: CardType;
    front: string;
    back: string;
    tags?: string[];
    payload?: ItemPayload;
    answerMode?: AnswerMode;
    conceptId?: string;
  }[],
  opts?: { courseId?: string | null; primaryLessonId?: string | null; skipValidation?: boolean },
): Promise<Card[]> {
  try {
    // Skip validation entirely when the caller has already validated before
    // opening a transaction. Awaiting per-card validation inside a transaction
    // can let IndexedDB commit prematurely (Dexie PrematureCommitError).
    if (
      !opts?.skipValidation &&
      drafts.some((draft) => draft.payload !== undefined && draft.payload !== null)
    ) {
      for (const draft of drafts) await assertValidCardPayload(draft.type, draft.payload);
    }
    return await db.transaction('rw', [db.cards, db.schedulingUnits, db.concepts], async () => {
      const unit = await db.schedulingUnits.get(deckId);
      const courseId = opts?.courseId === undefined ? unit?.courseId : opts.courseId;
      const primaryLessonId =
        opts?.primaryLessonId === undefined ? unit?.lessonId : opts.primaryLessonId;
      const now = Date.now();
      const concepts = [];
      const cards: Card[] = [];
      for (let i = 0; i < drafts.length; i += 1) {
        const draft = drafts[i];
        const createdAt = now + i;
        const conceptId = draft.conceptId ?? makeId();
        if (draft.conceptId) {
          const concept = await db.concepts.get(draft.conceptId);
          if (!concept || !conceptMatchesCardScope(concept, courseId, deckId)) {
            throw new Error('The selected Concept does not belong to this Card scope.');
          }
        } else {
          concepts.push(
            buildCardConcept({
              id: conceptId,
              courseId,
              schedulingUnitId: deckId,
              name: conceptNameForCard(draft.type, draft.front, draft.back),
              now: createdAt,
            }),
          );
        }
        cards.push(
          stampUpdatedAt(
            {
              id: makeId(),
              conceptId,
              deckId,
              type: draft.type,
              front: draft.front,
              back: draft.back,
              payload: draft.payload,
              answerMode: draft.answerMode,
              stability: null,
              difficulty: null,
              lastReviewed: null,
              reps: 0,
              lapses: 0,
              state: 0,
              due: null,
              scheduledDays: 0,
              learningSteps: 0,
              history: [],
              createdAt,
              tags: draft.tags ?? [],
              suspended: false,
              buriedUntil: null,
              schedulingUnitId: deckId,
              updatedAt: createdAt,
              courseId,
              primaryLessonId,
            },
            createdAt,
          ),
        );
      }
      if (concepts.length > 0) await db.concepts.bulkAdd(concepts);
      if (cards.length > 0) await db.cards.bulkAdd(cards);
      return cards;
    });
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * Create a front/back card together with its reverse (back becomes the prompt). The two
 * are ordinary, fully independent cards with their own FSRS state — editing or scheduling
 * one never touches the other. Tags are shared at creation. Returns both cards.
 */
export async function createCardWithReverse(
  deckId: string,
  front: string,
  back: string,
  tags: string[] = [],
  opts?: { courseId?: string | null; primaryLessonId?: string | null; answerMode?: AnswerMode },
): Promise<{ card: Card; reverse: Card }> {
  return db.transaction('rw', [db.cards, db.schedulingUnits, db.concepts], async () => {
    const card = await createCard(deckId, 'front_back', front, back, tags, opts);
    const reverse = await createCard(deckId, 'front_back', back, front, tags, {
      ...opts,
      conceptId: card.conceptId,
    });
    return { card, reverse };
  });
}

/**
 * Create a basic/reversed pair: two linked cards that test each direction.
 * The primary card has type 'basic_reversed' and stores the reverse card's id.
 */
export async function createBasicReversedPair(
  deckId: string,
  front: string,
  back: string,
  tags: string[] = [],
  opts?: { courseId?: string | null; primaryLessonId?: string | null; answerMode?: AnswerMode },
): Promise<{ card: Card; reverse: Card }> {
  return db.transaction('rw', [db.cards, db.schedulingUnits, db.concepts], async () => {
    const reverse = await createCard(deckId, 'front_back', back, front, tags, opts);
    const card = await createCard(deckId, 'basic_reversed', front, back, tags, {
      ...opts,
      conceptId: reverse.conceptId,
    });
    const now = Date.now();
    await db.cards.update(card.id, stampUpdatedAt({ reverseCardId: reverse.id }, now));
    await db.cards.update(reverse.id, stampUpdatedAt({ reverseCardId: card.id }, now));
    return {
      card: stampUpdatedAt({ ...card, reverseCardId: reverse.id }, now),
      reverse: stampUpdatedAt({ ...reverse, reverseCardId: card.id }, now),
    };
  });
}

/** Resolve or create the hidden scheduling deck for one lesson. */
export const ensureLessonDeck = ensureLessonBackingDeck;

/** Create a card that belongs to a lesson, lazily creating the lesson's backing deck. */
export async function createLessonCard(
  courseId: string,
  lessonId: string,
  type: CardType,
  front: string,
  back: string,
  tags: string[] = [],
  payload?: ItemPayload,
  answerMode?: AnswerMode,
): Promise<Card> {
  const deckId = await ensureLessonDeck(courseId, lessonId);
  return createCard(deckId, type, front, back, tags, {
    courseId,
    primaryLessonId: lessonId,
    payload,
    answerMode,
  });
}

/** Lesson-scoped equivalent of {@link createCardWithReverse}. */
export async function createLessonCardWithReverse(
  courseId: string,
  lessonId: string,
  front: string,
  back: string,
  tags: string[] = [],
  answerMode?: AnswerMode,
): Promise<{ card: Card; reverse: Card }> {
  const deckId = await ensureLessonDeck(courseId, lessonId);
  return createCardWithReverse(deckId, front, back, tags, {
    courseId,
    primaryLessonId: lessonId,
    answerMode,
  });
}

/** Lesson-scoped equivalent of {@link createBasicReversedPair}. */
export async function createLessonBasicReversedPair(
  courseId: string,
  lessonId: string,
  front: string,
  back: string,
  tags: string[] = [],
  answerMode?: AnswerMode,
): Promise<{ card: Card; reverse: Card }> {
  const deckId = await ensureLessonDeck(courseId, lessonId);
  return createBasicReversedPair(deckId, front, back, tags, {
    courseId,
    primaryLessonId: lessonId,
    answerMode,
  });
}

/** Resolve or create the hidden scheduling deck for unassigned course cards. */
export const ensureCourseBankDeck = ensureCourseBankBackingDeck;

/** Create a course-scoped card with no lesson, lazily creating the course's bank deck. */
export async function createCourseCard(
  courseId: string,
  type: CardType,
  front: string,
  back: string,
  tags: string[] = [],
  payload?: ItemPayload,
  answerMode?: AnswerMode,
): Promise<Card> {
  const deckId = await ensureCourseBankDeck(courseId);
  return createCard(deckId, type, front, back, tags, {
    courseId,
    primaryLessonId: null,
    payload,
    answerMode,
  });
}

/** Course-bank equivalent of {@link createCardWithReverse}. */
export async function createCourseCardWithReverse(
  courseId: string,
  front: string,
  back: string,
  tags: string[] = [],
  answerMode?: AnswerMode,
): Promise<{ card: Card; reverse: Card }> {
  const deckId = await ensureCourseBankDeck(courseId);
  return createCardWithReverse(deckId, front, back, tags, {
    courseId,
    primaryLessonId: null,
    answerMode,
  });
}

/** Course-bank equivalent of {@link createBasicReversedPair}. */
export async function createCourseBasicReversedPair(
  courseId: string,
  front: string,
  back: string,
  tags: string[] = [],
  answerMode?: AnswerMode,
): Promise<{ card: Card; reverse: Card }> {
  const deckId = await ensureCourseBankDeck(courseId);
  return createBasicReversedPair(deckId, front, back, tags, {
    courseId,
    primaryLessonId: null,
    answerMode,
  });
}

/**
 * Bulk-assign cards to a lesson (or unassign, with lessonId null). Keeps deckId in sync
 * with primaryLessonId — every lesson (and the course's unassigned bucket) has exactly
 * one backing deck, so reassigning a card's lesson must move it to that deck too.
 * LessonCardLink rows are untouched: this changes the primary lesson, not the display links.
 */
export async function assignCardsToLesson(
  ids: string[],
  courseId: string,
  lessonId: string | null,
): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.cards,
      db.courses,
      db.lessons,
      db.courseAssessments,
      db.schedulingUnits,
      db.coursePerformance,
      db.schedulingPerformance,
      db.lessonCardExposures,
      db.reviewHistory,
      db.tombstones,
    ],
    async (tx) => {
      if (lessonId) {
        const lesson = await db.lessons.get(lessonId);
        if (!lesson || lesson.courseId !== courseId) {
          throw new Error('Lesson does not belong to the selected Course.');
        }
      }
      const cards = await db.cards.where('id').anyOf(ids).toArray();
      if (cards.some((card) => card.courseId !== courseId)) {
        throw new Error('Card does not belong to the selected Course.');
      }
      const deckId = lessonId
        ? await ensureLessonDeck(courseId, lessonId)
        : await ensureCourseBankDeck(courseId);
      const removedPrimaryExposures = cards
        .filter(
          (card) => typeof card.primaryLessonId === 'string' && card.primaryLessonId !== lessonId,
        )
        .map((card) => [card.primaryLessonId as string, card.id] as [string, string]);
      if (removedPrimaryExposures.length > 0) {
        await db.lessonCardExposures.bulkDelete(removedPrimaryExposures);
        await recordTombstones(
          tx,
          'lessonCardExposures',
          removedPrimaryExposures.map(([removedLessonId, cardId]) =>
            lessonCardExposureId(removedLessonId, cardId),
          ),
        );
      }
      await db.cards
        .where('id')
        .anyOf(ids)
        .modify(
          stampUpdatedAt({
            primaryLessonId: lessonId,
            deckId,
            schedulingUnitId: lessonId ?? courseId,
          }),
        );
      await db.reviewHistory
        .where('cardId')
        .anyOf(ids)
        .modify({ primaryLessonId: lessonId, deckId, schedulingUnitId: lessonId ?? courseId });
    },
  );
}

export async function updateCard(id: string, changes: Partial<Card>): Promise<void> {
  try {
    if ('payload' in changes) {
      const card = await db.cards.get(id);
      if (card && changes.payload !== undefined) {
        await assertValidCardPayload(changes.type ?? card.type, changes.payload);
      }
    }
    await db.cards.update(id, stampUpdatedAt(changes));
    if ('front' in changes || 'back' in changes) {
      scheduleAssetGc();
    }
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export { deleteCards, snapshotCards, restoreCards } from './cardDeletion';
export type { CardSnapshot } from './cardDeletion';
export { replaceReviewHistoryForCards } from './cardReviewHistory';
export {
  suspendCard,
  unsuspendCard,
  setCardsSuspended,
  addTagToCards,
  removeTagFromCards,
  buryCard,
  buryCards,
  rescheduleCards,
  setCardFlag,
} from './cardBulkActions';
export type { RescheduleOptions } from './cardBulkActions';
