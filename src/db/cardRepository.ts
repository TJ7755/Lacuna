// High-level data operations that combine the FSRS engine with persistence.
// Components call these rather than touching Dexie tables directly.

import {
  buildCardConcept,
  conceptMatchesCardScope,
  conceptNameForCard,
} from '../questions/concepts';
import { scheduleAssetGc } from './assets';
import { ensureCourseBankBackingDeck, ensureLessonBackingDeck } from './backingDecks';
import { friendlyDbError } from './dbErrors';
import {
  clearTombstones,
  lessonCardExposureId,
  recordTombstones,
  stampUpdatedAt,
} from './mutationStamp';
import {
  projectCardsForStorage,
  reviewHistoryEntriesForCard,
  type ReviewHistoryEntry,
} from './reviewHistory';
import { db, makeId } from './schema';
import type { Card, CardType, ItemPayload, LessonCardExposure, LessonCardLink } from './types';
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
    existing.map((c) => `${c.type}:${normaliseCardText(c.front)}:${normaliseCardText(c.back)}`),
  );
  const seen = new Set<string>();
  const duplicates = new Set<number>();
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    const key = `${d.type}:${normaliseCardText(d.front)}:${normaliseCardText(d.back)}`;
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
  opts?: Pick<Card, 'courseId' | 'primaryLessonId' | 'payload'> & { conceptId?: string },
): Promise<Card> {
  try {
    await assertValidCardPayload(type, opts?.payload);
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
    conceptId?: string;
  }[],
  opts?: { courseId?: string | null; primaryLessonId?: string | null },
): Promise<Card[]> {
  try {
    for (const draft of drafts) await assertValidCardPayload(draft.type, draft.payload);
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
  opts?: { courseId?: string | null; primaryLessonId?: string | null },
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
  opts?: { courseId?: string | null; primaryLessonId?: string | null },
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
): Promise<Card> {
  const deckId = await ensureLessonDeck(courseId, lessonId);
  return createCard(deckId, type, front, back, tags, {
    courseId,
    primaryLessonId: lessonId,
    payload,
  });
}

/** Lesson-scoped equivalent of {@link createCardWithReverse}. */
export async function createLessonCardWithReverse(
  courseId: string,
  lessonId: string,
  front: string,
  back: string,
  tags: string[] = [],
): Promise<{ card: Card; reverse: Card }> {
  const deckId = await ensureLessonDeck(courseId, lessonId);
  return createCardWithReverse(deckId, front, back, tags, { courseId, primaryLessonId: lessonId });
}

/** Lesson-scoped equivalent of {@link createBasicReversedPair}. */
export async function createLessonBasicReversedPair(
  courseId: string,
  lessonId: string,
  front: string,
  back: string,
  tags: string[] = [],
): Promise<{ card: Card; reverse: Card }> {
  const deckId = await ensureLessonDeck(courseId, lessonId);
  return createBasicReversedPair(deckId, front, back, tags, {
    courseId,
    primaryLessonId: lessonId,
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
): Promise<Card> {
  const deckId = await ensureCourseBankDeck(courseId);
  return createCard(deckId, type, front, back, tags, { courseId, primaryLessonId: null, payload });
}

/** Course-bank equivalent of {@link createCardWithReverse}. */
export async function createCourseCardWithReverse(
  courseId: string,
  front: string,
  back: string,
  tags: string[] = [],
): Promise<{ card: Card; reverse: Card }> {
  const deckId = await ensureCourseBankDeck(courseId);
  return createCardWithReverse(deckId, front, back, tags, { courseId, primaryLessonId: null });
}

/** Course-bank equivalent of {@link createBasicReversedPair}. */
export async function createCourseBasicReversedPair(
  courseId: string,
  front: string,
  back: string,
  tags: string[] = [],
): Promise<{ card: Card; reverse: Card }> {
  const deckId = await ensureCourseBankDeck(courseId);
  return createBasicReversedPair(deckId, front, back, tags, { courseId, primaryLessonId: null });
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
  const deckId = lessonId
    ? await ensureLessonDeck(courseId, lessonId)
    : await ensureCourseBankDeck(courseId);
  await db.transaction(
    'rw',
    [db.cards, db.lessonCardExposures, db.reviewHistory, db.tombstones],
    async (tx) => {
      const cards = await db.cards.where('id').anyOf(ids).toArray();
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

/**
 * Sequence-generated cards (those with a `sequenceItemId`) and occlusion-generated cards
 * (those with an `occlusionRegionId`) may only be added, edited, moved or removed via
 * their owning sequence/occlusion, which keeps them synced with `sequenceGeneration`'s and
 * `occlusionGeneration`'s diffing. Guard the generic bulk card mutations against being
 * pointed at either by mistake.
 */
async function assertNoGeneratedCards(ids: string[]): Promise<void> {
  const generatedCount = await db.cards
    .where('id')
    .anyOf(ids)
    .filter(
      (card) =>
        (card.sequenceItemId !== null && card.sequenceItemId !== undefined) ||
        (card.occlusionRegionId !== null && card.occlusionRegionId !== undefined),
    )
    .count();
  if (generatedCount > 0) {
    throw new Error(
      'One or more cards were generated by a sequence or occlusion and can only be deleted or moved via that sequence or occlusion.',
    );
  }
}

export async function deleteCards(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction(
    'rw',
    [db.cards, db.lessonCards, db.lessonCardExposures, db.reviewHistory, db.tombstones],
    async (tx) => {
      await assertNoGeneratedCards(ids);
      const [lessonCards, exposures] = await Promise.all([
        db.lessonCards.where('cardId').anyOf(ids).toArray(),
        db.lessonCardExposures.where('cardId').anyOf(ids).toArray(),
      ]);
      await db.lessonCards.where('cardId').anyOf(ids).delete();
      await db.lessonCardExposures.where('cardId').anyOf(ids).delete();
      await db.reviewHistory.where('cardId').anyOf(ids).delete();
      await db.cards.bulkDelete(ids);
      await recordTombstones(tx, 'cards', ids);
      await recordTombstones(
        tx,
        'lessonCards',
        lessonCards.map((link) => link.id),
      );
      await recordTombstones(
        tx,
        'lessonCardExposures',
        exposures.map((exposure) => lessonCardExposureId(exposure.lessonId, exposure.cardId)),
      );
    },
  );
  scheduleAssetGc();
}

export type CardSnapshot = Card[] & {
  lessonCards: LessonCardLink[];
  lessonCardExposures: LessonCardExposure[];
  reviewHistory: ReviewHistoryEntry[];
};

export async function replaceReviewHistoryForCards(
  cardIds: string[],
  entries: ReviewHistoryEntry[],
): Promise<void> {
  if (cardIds.length > 0) {
    await db.reviewHistory.where('cardId').anyOf(cardIds).delete();
  }
  if (entries.length > 0) await db.reviewHistory.bulkPut(entries);
}

/** Capture card rows and dependent lesson progress before an undoable mutation. */
export async function snapshotCards(ids: string[]): Promise<CardSnapshot> {
  const [cards, lessonCards, lessonCardExposures, reviewHistory] = await Promise.all([
    db.cards.where('id').anyOf(ids).toArray(),
    db.lessonCards.where('cardId').anyOf(ids).toArray(),
    db.lessonCardExposures.where('cardId').anyOf(ids).toArray(),
    db.reviewHistory.where('cardId').anyOf(ids).toArray(),
  ]);
  return Object.assign(cards, { lessonCards, lessonCardExposures, reviewHistory });
}

/** Re-insert previously captured cards (the inverse of deleteCards). */
export async function restoreCards(cards: CardSnapshot): Promise<void> {
  try {
    const cardsToRestore = projectCardsForStorage(cards);
    const reviewHistoryToRestore =
      cards.reviewHistory ?? cards.flatMap((card) => reviewHistoryEntriesForCard(card));
    await db.transaction(
      'rw',
      [db.cards, db.lessonCards, db.lessonCardExposures, db.reviewHistory, db.tombstones],
      async (tx) => {
        await replaceReviewHistoryForCards(
          cardsToRestore.map((card) => card.id),
          reviewHistoryToRestore,
        );
        await db.cards.bulkPut(cardsToRestore);
        await db.lessonCards.bulkPut(cards.lessonCards);
        await db.lessonCardExposures.bulkPut(cards.lessonCardExposures);
        await clearTombstones(
          tx,
          'cards',
          cardsToRestore.map((card) => card.id),
        );
        await clearTombstones(
          tx,
          'lessonCards',
          cards.lessonCards.map((link) => link.id),
        );
        await clearTombstones(
          tx,
          'lessonCardExposures',
          cards.lessonCardExposures.map((exposure) =>
            lessonCardExposureId(exposure.lessonId, exposure.cardId),
          ),
        );
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/** Withhold a card from all study and from progress/objective until un-suspended. */
export async function suspendCard(id: string): Promise<void> {
  await db.cards.update(id, stampUpdatedAt({ suspended: true }));
}

/** Return a suspended card to normal scheduling. */
export async function unsuspendCard(id: string): Promise<void> {
  await db.cards.update(id, stampUpdatedAt({ suspended: false }));
}

/** Suspend or un-suspend many cards at once (used by the card list's bulk actions). */
export async function setCardsSuspended(ids: string[], suspended: boolean): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    await db.cards.where('id').anyOf(ids).modify(stampUpdatedAt({ suspended }));
  });
}

/** Add a tag to many cards at once, leaving cards that already have it untouched. */
export async function addTagToCards(ids: string[], tag: string): Promise<void> {
  const clean = tag.trim();
  if (!clean) return;
  const now = Date.now();
  await db.transaction('rw', db.cards, async () => {
    await db.cards
      .where('id')
      .anyOf(ids)
      .modify((card) => {
        const tags = card.tags ?? [];
        if (!tags.includes(clean)) card.tags = [...tags, clean];
        card.updatedAt = stampUpdatedAt(card, now).updatedAt;
      });
  });
}

/** Remove a tag from many cards at once. */
export async function removeTagFromCards(ids: string[], tag: string): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.cards, async () => {
    await db.cards
      .where('id')
      .anyOf(ids)
      .modify((card) => {
        if (card.tags?.length) card.tags = card.tags.filter((t) => t !== tag);
        card.updatedAt = stampUpdatedAt(card, now).updatedAt;
      });
  });
}

/** Skip a card until the given instant (defaults to the caller-supplied next midnight). */
export async function buryCard(id: string, until: number): Promise<void> {
  await db.cards.update(id, stampUpdatedAt({ buriedUntil: until }));
}

/** Skip many cards until the given instant. */
export async function buryCards(ids: string[], until: number): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    await db.cards
      .where('id')
      .anyOf(ids)
      .modify(stampUpdatedAt({ buriedUntil: until }));
  });
}

export interface RescheduleOptions {
  /** Reset selected cards to the New state, clearing all scheduling data. */
  reset?: boolean;
  /** Set a specific due date (epoch ms). Takes precedence over reset. */
  due?: number;
}

/**
 * Bulk-reschedule cards: either reset them to New (clearing stability, difficulty,
 * due, etc.) or set a custom due date. History is preserved in both cases.
 */
export async function rescheduleCards(ids: string[], options: RescheduleOptions): Promise<void> {
  if (options.due === undefined && !options.reset) {
    throw new Error('Reschedule requires either reset: true or a due date.');
  }
  const now = Date.now();
  await db.transaction('rw', db.cards, async () => {
    if (options.due !== undefined) {
      await db.cards
        .where('id')
        .anyOf(ids)
        .modify(stampUpdatedAt({ due: options.due, buriedUntil: null }, now));
    } else if (options.reset) {
      await db.cards
        .where('id')
        .anyOf(ids)
        .modify((card) => {
          card.state = 0;
          card.stability = null;
          card.difficulty = null;
          card.due = null;
          card.scheduledDays = 0;
          card.learningSteps = 0;
          card.lastReviewed = null;
          card.buriedUntil = null;
          card.updatedAt = stampUpdatedAt(card, now).updatedAt;
        });
    }
  });
}

/** Set or clear a card's flag (a user marker for quick filtering and follow-up). */
export async function setCardFlag(id: string, flagged: boolean): Promise<void> {
  await db.cards.update(id, stampUpdatedAt({ flagged }));
}
