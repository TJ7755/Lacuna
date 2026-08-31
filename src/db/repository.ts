// High-level data operations that combine the FSRS engine with persistence.
// Components call these rather than touching Dexie tables directly.

import { db, makeId } from './schema';
import type {
  Card,
  CardType,
  CheckerDisputeReport,
  Course,
  CourseAssessment,
  CoursePerformance,
  CourseRecord,
  CourseSchedulingMode,
  Grade,
  ItemPayload,
  LineVerdict,
  Lesson,
  LessonCardExposure,
  LessonCardLink,
  LessonCompletion,
  LineageIdMapping,
  Note,
  NoteAnnotation,
  Occlusion,
  PracticeMilestone,
  PracticeNode,
  PendingMergeReview,
  ReviewLog,
  ReviewSessionKind,
  RevisionPlan,
  RevisionPlanSession,
  RevisionProjection,
  SchedulingPerformance,
  SchedulingUnitRecord,
  SchedulerConfig,
  Sequence,
  SessionHistoryEntry,
  UserPerformance,
  AgentMemory,
} from './types';
import type {
  Concept,
  QuestionAttempt,
  QuestionConceptSet,
  QuestionDefinition,
} from '../questions/types';
import {
  projectCardForStorage,
  projectCardsForStorage,
  reviewHistoryEntriesForCard,
  reviewHistoryEntryForCard,
  reviewHistoryEntryIdForEvent,
  type ReviewHistoryEntry,
} from './reviewHistory';
import { hydrateCardsWithHistory } from './reviewHistoryRead';
import { courseToRecord, finalAssessmentForCourse, hydrateCourse } from './assessmentMigration';
import {
  ensureCourseBankBackingDeck,
  ensureLessonBackingDeck,
  removeCourseSchedulingUnits,
  removeLessonSchedulingUnit,
  restoreReviewUnitPerformance,
  syncCourseSchedulingUnits,
  updateReviewUnitPerformance,
} from './backingDecks';
import { applyReview, makeEngine } from '../fsrs/fsrs';
import { defaultFsrsParameters, FSRS_VERSION } from '../fsrs/params';
import { fsrsWeightsFingerprint } from '../fsrs/weightProvenance';
import { isLeech } from '../fsrs/leech';
import { predictedRetrievabilityAtHorizon } from '../fsrs/progress';
import { addDays } from '../fsrs/heatmap';
import { defaultExamDate, getLocalTimeZone, startOfDay } from '../utils/datetime';
import { readPracticeDefaults } from '../state/practiceDefaults';
import { readLessonViewMode } from '../state/lessonViewMode';
import { scheduleAssetGc } from './assets';
import { resolveAssessmentCoverage } from '../course/assessmentCoverage';
import { currentAssessmentPracticeContext } from '../course/assessmentPractice';
import {
  appendCompletedSession,
  applyPendingRevisionPlanInput,
  applyRevisionPlanInput,
  buildRevisionWindows,
  planIsComplete,
  revisionPlanDays,
  resolveRevisionPlanInput,
} from '../course/revisionPlan';
import { friendlyDbError } from './dbErrors';
import {
  buildCardConcept,
  conceptMatchesCardScope,
  conceptNameForCard,
} from '../questions/concepts';
import {
  stampUpdatedAt,
  recordTombstone,
  recordTombstones,
  clearTombstone,
  clearTombstones,
  lessonCardExposureId,
} from './mutationStamp';
export {
  createPracticeNode,
  updatePracticeNode,
  deletePracticeNode,
  savePracticeMilestoneProgress,
} from './practiceNodeRepository';
export {
  cardsForSequence,
  createSequence,
  updateSequence,
  deleteSequence,
  listSequences,
  snapshotSequence,
  restoreSequence,
} from './sequenceRepository';
export type { SequenceSnapshot } from './sequenceRepository';
export { agentMemoryRepository, AgentMemoryRepository } from './agentMemoryRepository';
export type {
  AgentMemorySearch,
  AgentMemorySearchScope,
  CreateAgentMemoryInput,
  DeletedAgentMemory,
  UpdateAgentMemoryInput,
} from './agentMemoryRepository';
export {
  createNote,
  updateNote,
  deleteNote,
  listNotes,
  reorderNotes,
  createNoteAnnotation,
  updateNoteAnnotation,
  deleteNoteAnnotation,
  listNoteAnnotations,
} from './noteRepository';

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

async function replaceReviewHistoryForCards(
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

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

/** Which target table owns the reviewed unit. */
type ReviewUnitKind = 'scheduling-unit' | 'course';

export interface RecordReviewArgs {
  card: Card;
  /** Stable caller-owned identity reused if the same submission is retried. */
  eventId: string;
  /** Stable identity shared by attempts in the same study session. */
  sessionId: string;
  sessionKind: ReviewSessionKind;
  /** Optional revision provenance for task-planned review windows. */
  revisionPlanId?: string;
  revisionWindowId?: string;
  /**
   * The scheduling unit (global-Today scope) or Course (course/lesson scope) this
   * review is scheduled and calibrated against. Both satisfy SchedulerConfig, so the
   * FSRS maths is identical either way; only the bookkeeping below (lastInteractedAt
   * table, and the card set the retrievability snapshot spans) differs by `kind`.
   */
  deck: SchedulerConfig;
  /** Defaults to the explicit scheduling-unit projection used by global sessions. */
  kind?: ReviewUnitKind;
  grade: Grade;
  responseTimeSec: number;
  distracted: boolean;
  /** Whether a lines-mode hint was used before this review (see ReviewLog.hintUsed). */
  hintUsed?: boolean;
  /** Whether the answer was correct (grade > 1); drives per-deck calibration stats. */
  correct: boolean;
  /** Machine-awarded marks for structured numeric/working items. */
  marksEarned?: number;
  marksAvailable?: number;
  lineVerdicts?: LineVerdict[];
  checkerDisputes?: CheckerDisputeReport[];
  now?: number;
}

/** The result of recording a review: the updated card plus undo bookkeeping. */
export interface RecordReviewResult {
  card: Card;
  /** The exact hydrated state before this transition, used by undo. */
  cardBefore: Card;
  /** False when this eventId had already been committed and no state changed. */
  recorded: boolean;
  /** Id of the SessionHistory row if the post-commit trajectory sample has completed. */
  sessionHistoryId?: number;
  /** The review kind this was recorded against (see {@link RecordReviewArgs.kind}), so
   * the caller can carry it straight into {@link ReviewUndo} without re-deriving it. */
  kind: ReviewUnitKind;
  /**
   * The unit's `lastInteractedAt` immediately before this review overwrote it (undefined
   * if the unit had none yet), so the caller can carry it into {@link ReviewUndo} and
   * restore it on undo.
   */
  lastInteractedAtBefore: number | undefined;
  /**
   * The unit's `updatedAt` immediately before this review overwrote it, so undo
   * can rewind the stamp as well as `lastInteractedAt`.
   */
  updatedAtBefore: number | undefined;
}

export interface ReviewTrajectorySampleArgs {
  eventId: string;
  sessionId: string;
  revisionPlanId?: string;
  revisionWindowId?: string;
  timestamp: number;
  deck: SchedulerConfig;
  kind: ReviewUnitKind;
  cardId: string;
}

function trajectoryUnitMatches(
  entry: SessionHistoryEntry,
  kind: ReviewUnitKind,
  unitId: string,
): boolean {
  return kind === 'course'
    ? entry.courseId === unitId
    : entry.schedulingUnitId === unitId && !entry.courseId;
}

async function hasTrajectorySampleForToday(
  kind: ReviewUnitKind,
  unitId: string,
  now: number,
): Promise<boolean> {
  const dayStart = startOfDay(now);
  const nextDay = addDays(dayStart, 1);
  return Boolean(
    await db.sessionHistory
      .where('timestamp')
      .between(dayStart, nextDay, true, false)
      .filter((entry) => trajectoryUnitMatches(entry, kind, unitId))
      .first(),
  );
}

/** Write one historical trajectory sample after a review has committed. */
export async function sampleReviewTrajectory(args: ReviewTrajectorySampleArgs): Promise<void> {
  if (await hasTrajectorySampleForToday(args.kind, args.deck.id, args.timestamp)) return;

  const cards =
    args.kind === 'course'
      ? await db.cards.where('courseId').equals(args.deck.id).toArray()
      : await db.cards.where('schedulingUnitId').equals(args.deck.id).toArray();
  const total = cards.reduce(
    (sum, card) => sum + predictedRetrievabilityAtHorizon(card, args.deck, args.timestamp),
    0,
  );
  const averagePredictedRetrievability = cards.length > 0 ? total / cards.length : 1;

  // Re-check inside the write transaction so concurrent reviews cannot create
  // two same-day samples, and undo cannot resurrect a deleted review.
  await db.transaction('rw', [db.reviewHistory, db.sessionHistory], async () => {
    const event = await db.reviewHistory.get(reviewHistoryEntryIdForEvent(args.eventId));
    if (!event || event.cardId !== args.cardId) return;
    if (await hasTrajectorySampleForToday(args.kind, args.deck.id, args.timestamp)) return;
    await db.sessionHistory.add({
      eventId: args.eventId,
      sessionId: args.sessionId,
      revisionPlanId: args.revisionPlanId,
      revisionWindowId: args.revisionWindowId,
      timestamp: args.timestamp,
      deckId: event.deckId ?? args.deck.id,
      ...(args.kind === 'course' ? { courseId: args.deck.id } : { schedulingUnitId: args.deck.id }),
      averagePredictedRetrievability,
    });
  });
}

function scheduleReviewTrajectorySample(args: ReviewTrajectorySampleArgs): void {
  // Defer the read and scan until the caller has received the review result.
  globalThis.setTimeout(() => {
    void sampleReviewTrajectory(args).catch(() => {
      // A missing analytics point must not reject a committed review.
    });
  }, 0);
}

/**
 * Record a single review: apply the FSRS update to the card, append a review log,
 * update the deck's calibration profile (correct reviews only), and schedule a
 * once-daily SessionHistory trajectory sample after the transaction commits.
 * Returns the updated card (for immediate re-scoring); the optional SessionHistory
 * id is retained for compatibility with older callers and is not available on the
 * immediate review path.
 */
export async function recordReview(args: RecordReviewArgs): Promise<RecordReviewResult> {
  try {
    const {
      card,
      deck,
      eventId,
      sessionId,
      sessionKind,
      revisionPlanId,
      revisionWindowId,
      grade,
      responseTimeSec,
      distracted,
      hintUsed,
      correct,
      marksEarned,
      marksAvailable,
      lineVerdicts,
      checkerDisputes,
    } = args;
    const kind: ReviewUnitKind = args.kind ?? 'scheduling-unit';
    const now = args.now ?? Date.now();

    if (!eventId.trim() || !sessionId.trim()) {
      throw new Error('Review eventId and sessionId must be non-empty.');
    }

    let lastInteractedAtBefore: number | undefined;
    let updatedAtBefore: number | undefined;
    const result = await db.transaction(
      'rw',
      [
        db.cards,
        db.courses,
        db.schedulingUnits,
        db.sessionHistory,
        db.coursePerformance,
        db.schedulingPerformance,
        db.reviewHistory,
      ],
      async () => {
        const existingReview = await db.reviewHistory.get(reviewHistoryEntryIdForEvent(eventId));
        const existingSession = await db.sessionHistory.where('eventId').equals(eventId).first();
        if (existingReview || existingSession) {
          const persistedCard = await db.cards.get(card.id);
          if (!persistedCard || existingReview?.cardId !== card.id) {
            throw new Error(`Review event ${eventId} belongs to another attempt.`);
          }
          const hydratedCard = (await hydrateCardsWithHistory([persistedCard]))[0];
          return {
            card: hydratedCard,
            cardBefore: hydratedCard,
            recorded: false,
            sessionHistoryId: existingSession?.id,
            kind,
            lastInteractedAtBefore: undefined,
            updatedAtBefore: undefined,
          };
        }

        const persistedCardBefore = await db.cards.get(card.id);
        if (!persistedCardBefore) throw new Error('The reviewed card no longer exists.');
        const cardBefore = (await hydrateCardsWithHistory([persistedCardBefore]))[0];

        // Compute from the transaction's current card, not the caller's potentially
        // stale snapshot. Duplicate detection and the one FSRS transition are atomic.
        const engine = makeEngine(deck.fsrsParameters);
        const { memory, retrievabilityAtReview } = applyReview(engine, cardBefore, grade, now);
        const log: ReviewLog = {
          eventId,
          sessionId,
          sessionKind,
          revisionPlanId,
          revisionWindowId,
          timestamp: now,
          grade,
          correct,
          responseTimeSec,
          distracted,
          hintUsed: hintUsed ?? false,
          marksEarned,
          marksAvailable,
          lineVerdicts,
          checkerDisputes,
          stabilityBefore: cardBefore.stability,
          stabilityAfter: memory.stability,
          difficultyBefore: cardBefore.difficulty,
          difficultyAfter: memory.difficulty,
          retrievabilityAtReview,
          fsrsWeightsFingerprint: fsrsWeightsFingerprint(deck.fsrsParameters),
        };
        const updatedCard: Card = {
          ...cardBefore,
          stability: memory.stability,
          difficulty: memory.difficulty,
          lastReviewed: memory.lastReviewed,
          due: memory.due,
          scheduledDays: memory.scheduledDays,
          learningSteps: memory.learningSteps,
          reps: memory.reps,
          lapses: memory.lapses,
          state: memory.state,
          history: [...cardBefore.history, log],
        };

        const action = deck.leechAction ?? 'suspend';
        const threshold = deck.leechThreshold;
        if (
          action !== 'none' &&
          isLeech(updatedCard, threshold) &&
          !isLeech(cardBefore, threshold)
        ) {
          if (action === 'suspend') {
            updatedCard.suspended = true;
          } else if (action === 'tag') {
            const tags = updatedCard.tags ?? [];
            if (!tags.includes('leech')) updatedCard.tags = [...tags, 'leech'];
          }
        }

        const stampedCard = stampUpdatedAt(updatedCard, now);
        await db.cards.put(projectCardForStorage(stampedCard));
        await db.reviewHistory.put(reviewHistoryEntryForCard(stampedCard, log));
        if (kind === 'course') {
          const before = await db.courses.get(deck.id);
          lastInteractedAtBefore = before?.lastInteractedAt;
          updatedAtBefore = before?.updatedAt;
          await db.courses.update(deck.id, stampUpdatedAt({ lastInteractedAt: now }, now));
        } else {
          const before = await db.schedulingUnits.get(deck.id);
          lastInteractedAtBefore = before?.lastInteractedAt;
          updatedAtBefore = before?.updatedAt;
          await db.schedulingUnits.update(deck.id, stampUpdatedAt({ lastInteractedAt: now }, now));
        }

        if (correct) {
          await updateReviewUnitPerformance(deck.id, responseTimeSec, kind);
        }

        return {
          card: stampedCard,
          cardBefore,
          recorded: true,
          kind,
          lastInteractedAtBefore,
          updatedAtBefore,
        };
      },
    );
    if (result.recorded) {
      scheduleReviewTrajectorySample({
        eventId,
        sessionId,
        revisionPlanId,
        revisionWindowId,
        timestamp: now,
        deck,
        kind,
        cardId: result.card.id,
      });
    }
    return result;
  } catch (err) {
    // A transaction in another tab can win the unique eventId race after this
    // transaction's initial lookup. Resolve that replay as the same no-op result.
    const existingReview = await db.reviewHistory.get(reviewHistoryEntryIdForEvent(args.eventId));
    const existingSession = await db.sessionHistory.where('eventId').equals(args.eventId).first();
    if (existingReview || existingSession) {
      const persistedCard = await db.cards.get(args.card.id);
      if (persistedCard && existingReview?.cardId === args.card.id) {
        const hydratedCard = (await hydrateCardsWithHistory([persistedCard]))[0];
        return {
          card: hydratedCard,
          cardBefore: hydratedCard,
          recorded: false,
          sessionHistoryId: existingSession?.id,
          kind: args.kind ?? 'scheduling-unit',
          lastInteractedAtBefore: undefined,
          updatedAtBefore: undefined,
        };
      }
    }
    throw friendlyDbError(err);
  }
}

/** Snapshot needed to reverse a single review (see undoReview). */
export interface ReviewUndo {
  /** Stable review identity; makes repeated or stale undo requests harmless. */
  eventId: string;
  /** The card exactly as it was before the review. */
  cardBefore: Card;
  /** The deck's calibration profile before the review (null if none existed). */
  perfBefore: UserPerformance | null;
  /** The optional SessionHistory row id written by the daily post-commit sample. */
  sessionHistoryId?: number;
  /**
   * The UserPerformance-shaped key of the scheduling unit or Course reviewed.
   */
  deckId: string;
  /**
   * Which target table `deckId` belongs to: a scheduling unit or Course.
   * Recorded by `recordReview` (see {@link RecordReviewResult.kind}) so the
   * `lastInteractedAt` restore on undo knows which table to look the id up in.
   */
  kind: ReviewUnitKind;
  /**
   * The unit's `lastInteractedAt` immediately before the review (see
   * {@link RecordReviewResult.lastInteractedAtBefore}), restored on undo. Undefined if
   * the unit had no prior interaction.
   */
  lastInteractedAtBefore: number | undefined;
  /**
   * The unit's `updatedAt` immediately before the review (see
   * {@link RecordReviewResult.updatedAtBefore}), restored on undo.
   */
  updatedAtBefore: number | undefined;
}

/**
 * Reverse the most recent review: restore the card and the deck's calibration
 * profile wholesale (no Welford inverse maths) and delete its review event and
 * any post-commit SessionHistory sample. Single-step, used by the in-session Undo
 * affordance.
 */
export async function undoReview(undo: ReviewUndo): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [
        db.cards,
        db.courses,
        db.schedulingUnits,
        db.sessionHistory,
        db.coursePerformance,
        db.schedulingPerformance,
        db.reviewHistory,
      ],
      async () => {
        const session =
          (undo.sessionHistoryId === undefined
            ? await db.sessionHistory.where('eventId').equals(undo.eventId).first()
            : await db.sessionHistory.get(undo.sessionHistoryId)) ??
          (await db.sessionHistory.where('eventId').equals(undo.eventId).first());
        const reviewEvent = await db.reviewHistory.get(reviewHistoryEntryIdForEvent(undo.eventId));
        if (!session && !reviewEvent) return;
        if (session && session.eventId !== undo.eventId) {
          throw new Error('The review event no longer matches its session history entry.');
        }
        await db.cards.put(projectCardForStorage(undo.cardBefore));
        await restoreReviewUnitPerformance(undo.deckId, undo.perfBefore, undo.kind);
        // Dexie's update() deletes the property when the patch value is undefined, so
        // this also correctly restores "never interacted" (no prior lastInteractedAt).
        if (undo.kind === 'course') {
          await db.courses.update(undo.deckId, {
            lastInteractedAt: undo.lastInteractedAtBefore,
            updatedAt: undo.updatedAtBefore,
          });
        } else {
          await db.schedulingUnits.update(undo.deckId, {
            lastInteractedAt: undo.lastInteractedAtBefore,
            updatedAt: undo.updatedAtBefore,
          });
        }
        await db.reviewHistory.delete(reviewHistoryEntryIdForEvent(undo.eventId));
        if (session?.id !== undefined) await db.sessionHistory.delete(session.id);
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export type CreateCourseOptions = Partial<CourseRecord> & {
  schedulingMode?: CourseSchedulingMode;
  examDate?: number;
  timeZone?: string;
};

export async function createCourse(name: string, opts?: CreateCourseOptions): Promise<Course> {
  try {
    const createdAt = Date.now();
    const practiceDefaults = readPracticeDefaults();
    const {
      schedulingMode = 'exam',
      examDate: requestedExamDate,
      timeZone: requestedTimeZone,
      ...recordOptions
    } = opts ?? {};
    if (schedulingMode === 'steady' && requestedExamDate !== undefined) {
      throw new Error('A steady-retention course cannot also have an exam date.');
    }
    const examDate =
      schedulingMode === 'exam' ? (requestedExamDate ?? defaultExamDate(createdAt)) : undefined;
    const timeZone =
      schedulingMode === 'exam' ? (requestedTimeZone ?? getLocalTimeZone()) : undefined;
    const course = stampUpdatedAt(
      {
        id: makeId(),
        name: name.trim() || 'Untitled course',
        description: '',
        createdAt,
        fsrsVersion: FSRS_VERSION,
        fsrsParameters: defaultFsrsParameters(),
        examObjective: 'expectedMarks',
        unlockMode: 'open',
        // New courses default to edit mode (see src/course/lessonViewMode.ts).
        // Share-code import (src/db/share.ts) overrides this to 'study' via opts.
        lessonViewMode: 'edit',
        ...practiceDefaults,
        ...recordOptions,
        schedulingMode,
        ...(examDate === undefined ? {} : { examDate }),
        ...(timeZone === undefined ? {} : { timeZone }),
      } as Course,
      createdAt,
    );
    const record = courseToRecord(course);
    const finalAssessment = stampUpdatedAt(
      {
        id: makeId(),
        courseId: record.id,
        name: schedulingMode === 'steady' ? 'Steady retention' : 'Final exam',
        kind: 'final',
        schedulingMode,
        ...(course.examDate === undefined ? {} : { examDate: course.examDate }),
        ...(course.timeZone !== undefined ? { timeZone: course.timeZone } : {}),
        afterLessonId: null,
        coverageMode: 'prefix',
        excludedCardIds: [],
        createdAt: record.createdAt,
        updatedAt: createdAt,
      } as CourseAssessment,
      createdAt,
    );
    validateAssessmentStructure(finalAssessment);
    await db.transaction(
      'rw',
      [
        db.courses,
        db.lessons,
        db.courseAssessments,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
      ],
      async () => {
        await db.courses.add(record);
        await db.courseAssessments.add(finalAssessment);
        await syncCourseSchedulingUnits(record.id);
      },
    );
    return hydrateCourse(record, finalAssessment);
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * One-shot migration (see App.tsx, guarded by a localStorage flag): stamps
 * every course that predates the mandatory Course.lessonViewMode field with
 * the retired global default's last value, so existing users see no change
 * in behaviour. New courses and share-code imports already set this
 * explicitly (see createCourse/importCourseFromShare), so only old rows are
 * touched. Not a Dexie schema upgrade because the value being migrated lives
 * in localStorage, not IndexedDB — an upgrade() callback cannot depend on it
 * reliably (e.g. across origins/devices with mismatched localStorage).
 */
export async function stampMissingLessonViewModes(): Promise<void> {
  const globalDefault = readLessonViewMode();
  // lessonViewMode is not an indexed field, so this is a full-table filter
  // rather than a where() query — acceptable for a one-off migration.
  const unstamped = await db.courses.filter((c) => c.lessonViewMode === undefined).toArray();
  if (unstamped.length === 0) return;
  await db.courses.bulkUpdate(
    unstamped.map((c) => ({ key: c.id, changes: { lessonViewMode: globalDefault } })),
  );
}

export async function updateCourse(id: string, changes: Partial<CourseRecord>): Promise<void> {
  try {
    const compatibilityChanges = changes as Partial<Course>;
    if (
      Object.prototype.hasOwnProperty.call(compatibilityChanges, 'examDate') ||
      Object.prototype.hasOwnProperty.call(compatibilityChanges, 'timeZone')
    ) {
      throw new Error('Course examDate and timeZone are derived, read-only assessment values.');
    }
    await db.transaction(
      'rw',
      [
        db.courses,
        db.lessons,
        db.courseAssessments,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
      ],
      async () => {
        await db.courses.update(id, stampUpdatedAt(changes));
        await syncCourseSchedulingUnits(id);
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * Publish (or republish) a course for classroom distribution (Arc 7 §7.4).
 * First publish creates `Course.distribution` with a fresh `lineageId` and
 * `revision: 1`; every subsequent call keeps the same `lineageId` and
 * increments `revision` by one. The share-code export path (`src/db/share.ts`)
 * reads `Course.distribution` to decide whether to pack lineage/revision/
 * originating-id fields into the payload — this function only owns the
 * counter, not the encoding.
 */
export async function publishCourse(
  courseId: string,
): Promise<{ lineageId: string; revision: number; publishedAt: number }> {
  try {
    let distribution: { lineageId: string; revision: number; publishedAt: number } | undefined;
    await db.transaction('rw', db.courses, async () => {
      const course = await db.courses.get(courseId);
      if (!course) throw new Error('The course could not be found.');
      distribution = {
        lineageId: course.distribution?.lineageId ?? makeId(),
        revision: (course.distribution?.revision ?? 0) + 1,
        publishedAt: Date.now(),
      };
      await db.courses.update(courseId, stampUpdatedAt({ distribution }));
    });
    return distribution!;
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * Detach a student's imported course from its teacher's lineage (Arc 7 §7.1). A
 * one-way escape hatch from a locked distributed copy: clears `Course.distributedCopy`
 * entirely, which both unlocks the course (absent `distributedCopy` is editable per
 * `canEditLessons`) and severs lineage tracking, so a later re-import of the same share
 * code no longer matches this course and instead falls through to a plain
 * `importCourseSharePayload` — the same "no lineage, treat as new" path a pre-Arc-7
 * course already takes. The lineage's adopted-id membership registry and any pending
 * merge review for this course are removed alongside, since neither can ever be
 * consulted or applied again once the course is detached; the lesson/note/card content
 * itself is untouched.
 */
export async function detachCourse(courseId: string): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [db.courses, db.lineageIdMappings, db.pendingMergeReviews],
      async () => {
        const course = await db.courses.get(courseId);
        if (!course) throw new Error('The course could not be found.');
        const lineageId = course.distributedCopy?.lineageId;
        await db.courses.update(courseId, stampUpdatedAt({ distributedCopy: undefined }));
        if (lineageId) {
          await db.lineageIdMappings.delete(lineageId);
        }
        await db.pendingMergeReviews.where('courseId').equals(courseId).delete();
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * Sets `distributedCopy.autoAcceptUpdates` on a student's imported course (Arc 7 §7.1,
 * §7.9 Task 8). The value is read by the merge-apply decision in `mergeImport.ts` to
 * decide whether a future teacher update is applied silently or queued for review; this
 * function only persists the preference, it does not affect any pending review.
 */
export async function setCourseAutoAcceptUpdates(
  courseId: string,
  autoAcceptUpdates: boolean,
): Promise<void> {
  try {
    const course = await db.courses.get(courseId);
    if (!course) throw new Error('The course could not be found.');
    if (!course.distributedCopy) throw new Error('This course is not a shared copy.');
    await db.courses.update(
      courseId,
      stampUpdatedAt({
        distributedCopy: { ...course.distributedCopy, autoAcceptUpdates },
      }),
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * Delete a course and cascade to all dependent rows in one transaction:
 * notes and lessonCard links belonging to the course's lessons, the lessons
 * themselves, practice nodes, course assessments, occlusions, and cards whose
 * courseId matches. Cards are deleted (not unassigned) because they were
 * created for this course; the cascade mirrors deleteDeck deleting its cards.
 */
export async function deleteCourse(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.courses,
      db.lessons,
      db.notes,
      db.noteAnnotations,
      db.lessonCards,
      db.lessonCardExposures,
      db.lessonCompletions,
      db.practiceNodes,
      db.practiceMilestones,
      db.courseAssessments,
      db.cards,
      db.sessionHistory,
      db.sequences,
      db.revisionPlans,
      db.occlusions,
      db.reviewHistory,
      db.schedulingUnits,
      db.coursePerformance,
      db.schedulingPerformance,
      db.concepts,
      db.questions,
      db.questionConcepts,
      db.questionAttempts,
      db.lineageIdMappings,
      db.pendingMergeReviews,
      db.agentMemories,
      db.tombstones,
    ],
    async (tx) => {
      const lessonIds = (await db.lessons.where('courseId').equals(id).primaryKeys()).map(String);
      const noteIds =
        lessonIds.length > 0
          ? (await db.notes.where('lessonId').anyOf(lessonIds).primaryKeys()).map(String)
          : [];
      const lessonCards =
        lessonIds.length > 0
          ? await db.lessonCards.where('lessonId').anyOf(lessonIds).toArray()
          : [];
      const exposures =
        lessonIds.length > 0
          ? await db.lessonCardExposures.where('lessonId').anyOf(lessonIds).toArray()
          : [];
      const completionIds =
        lessonIds.length > 0
          ? (await db.lessonCompletions.where('lessonId').anyOf(lessonIds).primaryKeys()).map(
              String,
            )
          : [];
      const practiceNodeIds = (
        await db.practiceNodes.where('courseId').equals(id).primaryKeys()
      ).map(String);
      const milestoneIds = (
        await db.practiceMilestones.where('courseId').equals(id).primaryKeys()
      ).map(String);
      const assessmentIds = (
        await db.courseAssessments.where('courseId').equals(id).primaryKeys()
      ).map(String);
      const revisionPlanIds = (
        await db.revisionPlans.where('courseId').equals(id).primaryKeys()
      ).map(String);
      const sequenceIds = (await db.sequences.where('courseId').equals(id).primaryKeys()).map(
        String,
      );
      const cardIds = (await db.cards.where('courseId').equals(id).primaryKeys()).map(String);
      const conceptIds = (await db.concepts.where('courseId').equals(id).primaryKeys()).map(String);
      const questionIds = (await db.questions.where('courseId').equals(id).primaryKeys()).map(
        String,
      );
      const questionConceptIds = (
        await db.questionConcepts.where('courseId').equals(id).primaryKeys()
      ).map(String);
      const questionAttemptIds = (
        await db.questionAttempts.where('courseId').equals(id).primaryKeys()
      ).map(String);
      const lineageMappingIds = (
        await db.lineageIdMappings.where('courseId').equals(id).primaryKeys()
      ).map(String);
      const pendingMergeReviewIds = (
        await db.pendingMergeReviews.where('courseId').equals(id).primaryKeys()
      ).map(String);
      const agentMemories = await db.agentMemories.where('courseId').equals(id).toArray();
      const agentMemoryIds = agentMemories.map((memory) => memory.id);
      const agentMemoryDeletedAt = Math.max(
        Date.now(),
        ...agentMemories.map((memory) => memory.updatedAt + 1),
      );
      const occlusionIds = (await db.occlusions.where('courseId').equals(id).primaryKeys()).map(
        String,
      );
      const schedulingTargetIds = [id, ...lessonIds];
      const existingUnits = await db.schedulingUnits.bulkGet(schedulingTargetIds);
      const schedulingUnitIds = existingUnits
        .filter((unit): unit is SchedulingUnitRecord => unit !== undefined)
        .map((unit) => unit.id);
      const existingSchedulingPerf = await db.schedulingPerformance.bulkGet(schedulingTargetIds);
      const schedulingPerformanceIds = existingSchedulingPerf
        .filter((row): row is SchedulingPerformance => row !== undefined)
        .map((row) => row.schedulingUnitId);
      const coursePerformanceRow = await db.coursePerformance.get(id);

      if (noteIds.length > 0) {
        await db.noteAnnotations.where('noteId').anyOf(noteIds).delete();
      }
      if (lessonIds.length > 0) {
        await db.notes.where('lessonId').anyOf(lessonIds).delete();
        await db.lessonCards.where('lessonId').anyOf(lessonIds).delete();
        await db.lessonCardExposures.where('lessonId').anyOf(lessonIds).delete();
        await db.lessonCompletions.where('lessonId').anyOf(lessonIds).delete();
      }
      await db.lessons.where('courseId').equals(id).delete();
      await db.practiceNodes.where('courseId').equals(id).delete();
      await db.practiceMilestones.where('courseId').equals(id).delete();
      await db.courseAssessments.where('courseId').equals(id).delete();
      await db.revisionPlans.where('courseId').equals(id).delete();
      await db.sequences.where('courseId').equals(id).delete();
      await db.occlusions.where('courseId').equals(id).delete();
      await db.cards.where('courseId').equals(id).delete();
      await db.questionAttempts.where('courseId').equals(id).delete();
      await db.questionConcepts.where('courseId').equals(id).delete();
      await db.questions.where('courseId').equals(id).delete();
      await db.concepts.where('courseId').equals(id).delete();
      await db.lineageIdMappings.where('courseId').equals(id).delete();
      await db.pendingMergeReviews.where('courseId').equals(id).delete();
      await db.agentMemories.where('courseId').equals(id).delete();
      await db.reviewHistory.where('courseId').equals(id).delete();
      // The course-level calibration profile and session history are keyed by the
      // course id itself for course/lesson-scoped reviews (see recordReview).
      await db.sessionHistory.where('courseId').equals(id).delete();
      await removeCourseSchedulingUnits(id, lessonIds);
      await db.courses.delete(id);

      await recordTombstone(tx, 'courses', id);
      await recordTombstones(tx, 'lessons', lessonIds);
      await recordTombstones(tx, 'notes', noteIds);
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
      await recordTombstones(tx, 'lessonCompletions', completionIds);
      await recordTombstones(tx, 'practiceNodes', practiceNodeIds);
      await recordTombstones(tx, 'practiceMilestones', milestoneIds);
      await recordTombstones(tx, 'courseAssessments', assessmentIds);
      await recordTombstones(tx, 'revisionPlans', revisionPlanIds);
      await recordTombstones(tx, 'sequences', sequenceIds);
      await recordTombstones(tx, 'cards', cardIds);
      await recordTombstones(tx, 'concepts', conceptIds);
      await recordTombstones(tx, 'questions', questionIds);
      await recordTombstones(tx, 'questionConcepts', questionConceptIds);
      await recordTombstones(tx, 'questionAttempts', questionAttemptIds);
      await recordTombstones(tx, 'lineageIdMappings', lineageMappingIds);
      await recordTombstones(tx, 'pendingMergeReviews', pendingMergeReviewIds);
      await recordTombstones(tx, 'agentMemories', agentMemoryIds, agentMemoryDeletedAt);
      await recordTombstones(tx, 'occlusions', occlusionIds);
      await recordTombstones(tx, 'schedulingUnits', schedulingUnitIds);
      if (coursePerformanceRow) await recordTombstone(tx, 'coursePerformance', id);
      await recordTombstones(tx, 'schedulingPerformance', schedulingPerformanceIds);
    },
  );
  // Deleting the course's cards may orphan image assets; reclaim them, as deleteDeck does.
  scheduleAssetGc();
}

/** A complete copy of a course and everything that hangs off it: lessons, notes,
 * lesson-card links, practice nodes, assessments, occlusions, cards and their
 * hidden backing decks (plus the session history and calibration profiles keyed
 * to either). */
export interface CourseSnapshot {
  course: CourseRecord;
  lessons: Lesson[];
  notes: Note[];
  noteAnnotations: NoteAnnotation[];
  lessonCards: LessonCardLink[];
  lessonCardExposures: LessonCardExposure[];
  lessonCompletions: LessonCompletion[];
  practiceNodes: PracticeNode[];
  practiceMilestones: PracticeMilestone[];
  courseAssessments: CourseAssessment[];
  revisionPlans: RevisionPlan[];
  sequences: Sequence[];
  occlusions: Occlusion[];
  cards: Card[];
  concepts: Concept[];
  questions: QuestionDefinition[];
  questionConcepts: QuestionConceptSet[];
  questionAttempts: QuestionAttempt[];
  lineageIdMappings: LineageIdMapping[];
  pendingMergeReviews: PendingMergeReview[];
  agentMemories?: AgentMemory[];
  sessionHistory: SessionHistoryEntry[];
  reviewHistory: ReviewHistoryEntry[];
  coursePerformance: CoursePerformance[];
  schedulingUnits: SchedulingUnitRecord[];
  schedulingPerformance: SchedulingPerformance[];
}

/**
 * Capture a course plus everything {@link deleteCourse} removes, so the action can be
 * offered with an "Undo". Call this *before* deleteCourse.
 */
export async function snapshotCourse(id: string): Promise<CourseSnapshot | null> {
  const course = await db.courses.get(id);
  if (!course) return null;

  const [
    lessons,
    practiceNodes,
    practiceMilestones,
    courseAssessments,
    revisionPlans,
    sequences,
    occlusions,
    cards,
    concepts,
    questions,
    questionConcepts,
    questionAttempts,
    lineageIdMappings,
    pendingMergeReviews,
    agentMemories,
    coursePerformance,
  ] = await Promise.all([
    db.lessons.where('courseId').equals(id).toArray(),
    db.practiceNodes.where('courseId').equals(id).toArray(),
    db.practiceMilestones.where('courseId').equals(id).toArray(),
    db.courseAssessments.where('courseId').equals(id).toArray(),
    db.revisionPlans.where('courseId').equals(id).toArray(),
    db.sequences.where('courseId').equals(id).toArray(),
    db.occlusions.where('courseId').equals(id).toArray(),
    db.cards.where('courseId').equals(id).toArray(),
    db.concepts.where('courseId').equals(id).toArray(),
    db.questions.where('courseId').equals(id).toArray(),
    db.questionConcepts.where('courseId').equals(id).toArray(),
    db.questionAttempts.where('courseId').equals(id).toArray(),
    db.lineageIdMappings.where('courseId').equals(id).toArray(),
    db.pendingMergeReviews.where('courseId').equals(id).toArray(),
    db.agentMemories.where('courseId').equals(id).toArray(),
    db.coursePerformance.where('courseId').equals(id).toArray(),
  ]);
  const reviewHistoryForCourse =
    cards.length > 0
      ? await db.reviewHistory
          .where('cardId')
          .anyOf(cards.map((card) => card.id))
          .toArray()
      : [];
  const lessonIds = lessons.map((l) => l.id);
  const targetIds = [id, ...lessonIds];
  const [schedulingUnits, schedulingPerformance] = await Promise.all([
    db.schedulingUnits
      .bulkGet(targetIds)
      .then((rows) => rows.filter((row): row is SchedulingUnitRecord => row !== undefined)),
    db.schedulingPerformance
      .bulkGet(targetIds)
      .then((rows) => rows.filter((row): row is SchedulingPerformance => row !== undefined)),
  ]);
  const [notes, lessonCards, lessonCardExposures, lessonCompletions, courseSessionHistory] =
    await Promise.all([
      lessonIds.length > 0 ? db.notes.where('lessonId').anyOf(lessonIds).toArray() : [],
      lessonIds.length > 0 ? db.lessonCards.where('lessonId').anyOf(lessonIds).toArray() : [],
      lessonIds.length > 0
        ? db.lessonCardExposures.where('lessonId').anyOf(lessonIds).toArray()
        : [],
      lessonIds.length > 0 ? db.lessonCompletions.where('lessonId').anyOf(lessonIds).toArray() : [],
      db.sessionHistory.where('courseId').equals(id).toArray(),
    ]);
  const noteAnnotations =
    notes.length > 0
      ? await db.noteAnnotations
          .where('noteId')
          .anyOf(notes.map((note) => note.id))
          .toArray()
      : [];

  return {
    course,
    lessons,
    notes,
    noteAnnotations,
    lessonCards,
    lessonCardExposures,
    lessonCompletions,
    practiceNodes,
    practiceMilestones,
    courseAssessments,
    revisionPlans,
    sequences,
    occlusions,
    cards,
    concepts,
    questions,
    questionConcepts,
    questionAttempts,
    lineageIdMappings,
    pendingMergeReviews,
    agentMemories,
    sessionHistory: courseSessionHistory,
    reviewHistory: reviewHistoryForCourse,
    coursePerformance,
    schedulingUnits,
    schedulingPerformance,
  };
}

/** Re-insert a previously captured CourseSnapshot (the inverse of deleteCourse). */
export async function restoreCourse(snapshot: CourseSnapshot): Promise<void> {
  try {
    finalAssessmentForCourse(snapshot.course.id, snapshot.courseAssessments);
    const cardsToRestore = projectCardsForStorage(snapshot.cards);
    const reviewHistoryToRestore =
      snapshot.reviewHistory ?? snapshot.cards.flatMap((card) => reviewHistoryEntriesForCard(card));
    for (const assessment of snapshot.courseAssessments) {
      if (assessment.courseId !== snapshot.course.id) {
        throw new Error('A course snapshot cannot contain assessments from another course.');
      }
      validateAssessmentStructure(assessment);
    }
    await db.transaction(
      'rw',
      [
        db.courses,
        db.lessons,
        db.notes,
        db.noteAnnotations,
        db.lessonCards,
        db.lessonCardExposures,
        db.lessonCompletions,
        db.practiceNodes,
        db.practiceMilestones,
        db.courseAssessments,
        db.revisionPlans,
        db.sequences,
        db.occlusions,
        db.cards,
        db.sessionHistory,
        db.reviewHistory,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
        db.concepts,
        db.questions,
        db.questionConcepts,
        db.questionAttempts,
        db.lineageIdMappings,
        db.pendingMergeReviews,
        db.agentMemories,
        db.tombstones,
      ],
      async (tx) => {
        await replaceReviewHistoryForCards(
          cardsToRestore.map((card) => card.id),
          reviewHistoryToRestore,
        );
        await Promise.all([
          db.courses.put(snapshot.course),
          db.lessons.bulkPut(snapshot.lessons),
          db.notes.bulkPut(snapshot.notes),
          db.noteAnnotations.bulkPut(snapshot.noteAnnotations),
          db.lessonCards.bulkPut(snapshot.lessonCards),
          db.lessonCardExposures.bulkPut(snapshot.lessonCardExposures),
          db.lessonCompletions.bulkPut(snapshot.lessonCompletions),
          db.practiceNodes.bulkPut(snapshot.practiceNodes),
          db.practiceMilestones.bulkPut(snapshot.practiceMilestones),
          db.courseAssessments.bulkPut(snapshot.courseAssessments),
          db.revisionPlans.bulkPut(snapshot.revisionPlans),
          db.sequences.bulkPut(snapshot.sequences),
          db.occlusions.bulkPut(snapshot.occlusions),
          db.cards.bulkPut(cardsToRestore),
          db.concepts.bulkPut(snapshot.concepts),
          db.questions.bulkPut(snapshot.questions),
          db.questionConcepts.bulkPut(snapshot.questionConcepts),
          db.questionAttempts.bulkPut(snapshot.questionAttempts),
          db.lineageIdMappings.bulkPut(snapshot.lineageIdMappings),
          db.pendingMergeReviews.bulkPut(snapshot.pendingMergeReviews),
          db.agentMemories.bulkPut(
            await Promise.all(
              (snapshot.agentMemories ?? []).map(async (memory) => {
                const deletion = await db.tombstones.get(['agentMemories', memory.id]);
                return {
                  ...memory,
                  updatedAt: Math.max(
                    Date.now(),
                    memory.updatedAt + 1,
                    (deletion?.deletedAt ?? 0) + 1,
                  ),
                };
              }),
            ),
          ),
          db.schedulingUnits.bulkPut(snapshot.schedulingUnits),
          db.coursePerformance.bulkPut(snapshot.coursePerformance),
          db.schedulingPerformance.bulkPut(snapshot.schedulingPerformance),
          // Drop the old auto-increment ids so Dexie reassigns them cleanly.
          db.sessionHistory.bulkAdd(
            snapshot.sessionHistory.map(({ id: _id, ...rest }) => rest as SessionHistoryEntry),
          ),
        ]);
        await clearTombstone(tx, 'courses', snapshot.course.id);
        await clearTombstones(
          tx,
          'lessons',
          snapshot.lessons.map((lesson) => lesson.id),
        );
        await clearTombstones(
          tx,
          'notes',
          snapshot.notes.map((note) => note.id),
        );
        await clearTombstones(
          tx,
          'lessonCards',
          snapshot.lessonCards.map((link) => link.id),
        );
        await clearTombstones(
          tx,
          'lessonCardExposures',
          snapshot.lessonCardExposures.map((exposure) =>
            lessonCardExposureId(exposure.lessonId, exposure.cardId),
          ),
        );
        await clearTombstones(
          tx,
          'lessonCompletions',
          snapshot.lessonCompletions.map((completion) => completion.lessonId),
        );
        await clearTombstones(
          tx,
          'practiceNodes',
          snapshot.practiceNodes.map((node) => node.id),
        );
        await clearTombstones(
          tx,
          'practiceMilestones',
          snapshot.practiceMilestones.map((milestone) => milestone.nodeKey),
        );
        await clearTombstones(
          tx,
          'courseAssessments',
          snapshot.courseAssessments.map((assessment) => assessment.id),
        );
        await clearTombstones(
          tx,
          'revisionPlans',
          snapshot.revisionPlans.map((plan) => plan.id),
        );
        await clearTombstones(
          tx,
          'sequences',
          snapshot.sequences.map((sequence) => sequence.id),
        );
        await clearTombstones(
          tx,
          'occlusions',
          snapshot.occlusions.map((occlusion) => occlusion.id),
        );
        await clearTombstones(
          tx,
          'cards',
          cardsToRestore.map((card) => card.id),
        );
        await clearTombstones(
          tx,
          'concepts',
          snapshot.concepts.map((concept) => concept.id),
        );
        await clearTombstones(
          tx,
          'questions',
          snapshot.questions.map((question) => question.id),
        );
        await clearTombstones(
          tx,
          'questionConcepts',
          snapshot.questionConcepts.map((set) => set.questionId),
        );
        await clearTombstones(
          tx,
          'questionAttempts',
          snapshot.questionAttempts.map((attempt) => attempt.id),
        );
        await clearTombstones(
          tx,
          'lineageIdMappings',
          snapshot.lineageIdMappings.map((mapping) => mapping.id),
        );
        await clearTombstones(
          tx,
          'pendingMergeReviews',
          snapshot.pendingMergeReviews.map((review) => review.id),
        );
        await clearTombstones(
          tx,
          'agentMemories',
          (snapshot.agentMemories ?? []).map((memory) => memory.id),
        );
        await clearTombstones(
          tx,
          'schedulingUnits',
          snapshot.schedulingUnits.map((unit) => unit.id),
        );
        await clearTombstones(
          tx,
          'coursePerformance',
          snapshot.coursePerformance.map((row) => row.courseId),
        );
        await clearTombstones(
          tx,
          'schedulingPerformance',
          snapshot.schedulingPerformance.map((row) => row.schedulingUnitId),
        );
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

export async function createLesson(
  courseId: string,
  name: string,
  opts?: Partial<Lesson>,
): Promise<Lesson> {
  try {
    const existing = await db.lessons.where('courseId').equals(courseId).toArray();
    const maxIndex = existing.reduce((m, l) => Math.max(m, l.orderIndex), -1);
    const createdAt = Date.now();
    const lesson = stampUpdatedAt(
      {
        id: makeId(),
        courseId,
        name: name.trim() || 'Untitled lesson',
        orderIndex: maxIndex + 1,
        isExtension: false,
        createdAt,
        ...opts,
      },
      createdAt,
    );
    await db.transaction(
      'rw',
      [
        db.courses,
        db.lessons,
        db.courseAssessments,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
      ],
      async () => {
        await db.lessons.add(lesson);
        await syncCourseSchedulingUnits(courseId);
      },
    );
    return lesson;
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function updateLesson(id: string, changes: Partial<Lesson>): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [
        db.courses,
        db.lessons,
        db.courseAssessments,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
      ],
      async () => {
        await db.lessons.update(id, stampUpdatedAt(changes));
        const lesson = await db.lessons.get(id);
        if (lesson) await syncCourseSchedulingUnits(lesson.courseId);
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/** Everything {@link deleteLesson} removes or rewrites, captured for undo. */
export interface LessonSnapshot {
  lesson: Lesson;
  notes: Note[];
  noteAnnotations: NoteAnnotation[];
  lessonCards: LessonCardLink[];
  lessonCardExposures: LessonCardExposure[];
  lessonCompletion?: LessonCompletion;
  cards: Card[];
  sequences: Sequence[];
  sessionHistory: SessionHistoryEntry[];
  courseAssessments: CourseAssessment[];
  reviewHistory: ReviewHistoryEntry[];
  schedulingUnit?: SchedulingUnitRecord;
  schedulingPerformance?: SchedulingPerformance;
}

/** Capture a lesson and every row {@link deleteLesson} changes before deleting it. */
export async function snapshotLesson(id: string): Promise<LessonSnapshot | null> {
  const lesson = await db.lessons.get(id);
  if (!lesson) return null;

  const [
    notes,
    lessonCards,
    lessonCardExposures,
    lessonCompletion,
    cards,
    sequences,
    courseAssessments,
    schedulingUnit,
    schedulingPerformance,
  ] = await Promise.all([
    db.notes.where('lessonId').equals(id).toArray(),
    db.lessonCards.where('lessonId').equals(id).toArray(),
    db.lessonCardExposures.where('lessonId').equals(id).toArray(),
    db.lessonCompletions.get(id),
    db.cards.where('primaryLessonId').equals(id).toArray(),
    db.sequences.where('primaryLessonId').equals(id).toArray(),
    db.courseAssessments.where('courseId').equals(lesson.courseId).toArray(),
    db.schedulingUnits.get(id),
    db.schedulingPerformance.get(id),
  ]);
  const noteIds = notes.map((note) => note.id);
  const [noteAnnotations, sessionHistory, reviewHistory] = await Promise.all([
    noteIds.length > 0 ? db.noteAnnotations.where('noteId').anyOf(noteIds).toArray() : [],
    db.sessionHistory.where('courseId').equals(lesson.courseId).toArray(),
    cards.length > 0
      ? db.reviewHistory
          .where('cardId')
          .anyOf(cards.map((card) => card.id))
          .toArray()
      : [],
  ]);

  return {
    lesson,
    notes,
    noteAnnotations,
    lessonCards,
    lessonCardExposures,
    ...(lessonCompletion ? { lessonCompletion } : {}),
    cards,
    sequences,
    sessionHistory,
    courseAssessments,
    reviewHistory,
    ...(schedulingUnit ? { schedulingUnit } : {}),
    ...(schedulingPerformance ? { schedulingPerformance } : {}),
  };
}

/** Restore a lesson snapshot captured immediately before {@link deleteLesson}. */
export async function restoreLesson(snapshot: LessonSnapshot): Promise<void> {
  try {
    const cardsToRestore = projectCardsForStorage(snapshot.cards);
    const reviewHistoryToRestore =
      snapshot.reviewHistory ?? snapshot.cards.flatMap((card) => reviewHistoryEntriesForCard(card));
    await db.transaction(
      'rw',
      [
        db.lessons,
        db.notes,
        db.noteAnnotations,
        db.lessonCards,
        db.lessonCardExposures,
        db.lessonCompletions,
        db.cards,
        db.sequences,
        db.sessionHistory,
        db.courseAssessments,
        db.reviewHistory,
        db.schedulingUnits,
        db.schedulingPerformance,
        db.tombstones,
      ],
      async (tx) => {
        await replaceReviewHistoryForCards(
          cardsToRestore.map((card) => card.id),
          reviewHistoryToRestore,
        );
        await Promise.all([
          db.lessons.put(snapshot.lesson),
          db.notes.bulkPut(snapshot.notes),
          db.noteAnnotations.bulkPut(snapshot.noteAnnotations),
          db.lessonCards.bulkPut(snapshot.lessonCards),
          db.lessonCardExposures.bulkPut(snapshot.lessonCardExposures),
          snapshot.lessonCompletion
            ? db.lessonCompletions.put(snapshot.lessonCompletion)
            : Promise.resolve(),
          db.cards.bulkPut(cardsToRestore),
          db.sequences.bulkPut(snapshot.sequences),
          db.sessionHistory.bulkPut(snapshot.sessionHistory),
          db.courseAssessments.bulkPut(snapshot.courseAssessments),
          snapshot.schedulingUnit
            ? db.schedulingUnits.put(snapshot.schedulingUnit)
            : Promise.resolve(),
          snapshot.schedulingPerformance
            ? db.schedulingPerformance.put(snapshot.schedulingPerformance)
            : Promise.resolve(),
        ]);
        await clearTombstone(tx, 'lessons', snapshot.lesson.id);
        await clearTombstones(
          tx,
          'notes',
          snapshot.notes.map((note) => note.id),
        );
        await clearTombstones(
          tx,
          'lessonCards',
          snapshot.lessonCards.map((link) => link.id),
        );
        await clearTombstones(
          tx,
          'lessonCardExposures',
          snapshot.lessonCardExposures.map((exposure) =>
            lessonCardExposureId(exposure.lessonId, exposure.cardId),
          ),
        );
        if (snapshot.lessonCompletion) {
          await clearTombstone(tx, 'lessonCompletions', snapshot.lessonCompletion.lessonId);
        }
        await clearTombstones(
          tx,
          'cards',
          cardsToRestore.map((card) => card.id),
        );
        await clearTombstones(
          tx,
          'sequences',
          snapshot.sequences.map((sequence) => sequence.id),
        );
        await clearTombstones(
          tx,
          'courseAssessments',
          snapshot.courseAssessments.map((assessment) => assessment.id),
        );
        if (snapshot.schedulingUnit) {
          await clearTombstone(tx, 'schedulingUnits', snapshot.schedulingUnit.id);
        }
        if (snapshot.schedulingPerformance) {
          await clearTombstone(
            tx,
            'schedulingPerformance',
            snapshot.schedulingPerformance.schedulingUnitId,
          );
        }
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * The semi-linear unlock ratchet (Course Architecture Plan Addendum 2, §I): sets
 * `Lesson.unlockedAt` to `now` the first time the gate is satisfied, and never
 * clears or re-sets it afterwards (a one-way ratchet). No-ops if the lesson does
 * not exist or is already unlocked. Callers determine WHETHER to ratchet via
 * {@link nextLessonUnlockCondition} in src/course/unlock.ts — this function only
 * performs the write, and only under `semi-linear` unlock mode (other modes derive
 * their unlock state at read time in src/course/path.ts and have nothing to write).
 */
export async function ratchetLessonUnlock(
  lessonId: string,
  now: number = Date.now(),
): Promise<void> {
  await db.transaction('rw', db.lessons, async () => {
    const lesson = await db.lessons.get(lessonId);
    if (!lesson || lesson.unlockedAt !== undefined) return;
    await db.lessons.update(lessonId, stampUpdatedAt({ unlockedAt: now }, now));
  });
}

/**
 * Delete a lesson: remove its notes and lessonCard links in one transaction.
 * Cards whose primaryLessonId pointed here become unassigned (primaryLessonId set
 * to null) rather than deleted — they remain in the question bank. Sibling
 * lessons are not renumbered.
 */
export async function deleteLesson(id: string): Promise<void> {
  const lesson = await db.lessons.get(id);
  if (!lesson) return;
  const [cardCount, sequenceCount, orderedLessons] = await Promise.all([
    db.cards.where('primaryLessonId').equals(id).count(),
    db.sequences.where('primaryLessonId').equals(id).count(),
    db.lessons.where('courseId').equals(lesson.courseId).sortBy('orderIndex'),
  ]);
  const deletedIndex = orderedLessons.findIndex((candidate) => candidate.id === id);
  const precedingLessonId = deletedIndex > 0 ? orderedLessons[deletedIndex - 1].id : null;
  const bankDeckId =
    cardCount > 0 || sequenceCount > 0 ? await ensureCourseBankDeck(lesson.courseId) : null;
  await db.transaction(
    'rw',
    [
      db.courses,
      db.lessons,
      db.notes,
      db.noteAnnotations,
      db.lessonCards,
      db.lessonCardExposures,
      db.lessonCompletions,
      db.cards,
      db.sequences,
      db.sessionHistory,
      db.courseAssessments,
      db.reviewHistory,
      db.schedulingUnits,
      db.coursePerformance,
      db.schedulingPerformance,
      db.tombstones,
    ],
    async (tx) => {
      const now = Date.now();
      const noteIds = (await db.notes.where('lessonId').equals(id).primaryKeys()).map(String);
      const lessonCards = await db.lessonCards.where('lessonId').equals(id).toArray();
      const exposures = await db.lessonCardExposures.where('lessonId').equals(id).toArray();
      const completion = await db.lessonCompletions.get(id);
      const schedulingUnit = await db.schedulingUnits.get(id);
      const schedulingPerformance = await db.schedulingPerformance.get(id);
      if (noteIds.length > 0) {
        await db.noteAnnotations.where('noteId').anyOf(noteIds).delete();
      }
      await db.notes.where('lessonId').equals(id).delete();
      await db.lessonCards.where('lessonId').equals(id).delete();
      await db.lessonCardExposures.where('lessonId').equals(id).delete();
      await db.lessonCompletions.delete(id);
      if (bankDeckId) {
        const movedCards = await db.cards.where('primaryLessonId').equals(id).toArray();
        await db.cards
          .where('primaryLessonId')
          .equals(id)
          .modify(
            stampUpdatedAt(
              {
                primaryLessonId: null,
                deckId: bankDeckId,
                schedulingUnitId: lesson.courseId,
              },
              now,
            ),
          );
        if (movedCards.length > 0) {
          await db.reviewHistory
            .where('cardId')
            .anyOf(movedCards.map((card) => card.id))
            .modify({
              primaryLessonId: null,
              deckId: bankDeckId,
              schedulingUnitId: lesson.courseId,
            });
        }
        await db.sequences
          .where('primaryLessonId')
          .equals(id)
          .modify(stampUpdatedAt({ primaryLessonId: null }, now));
      }
      await removeLessonSchedulingUnit(id);
      await db.lessons.delete(id);
      await recordTombstone(tx, 'lessons', id);
      await recordTombstones(tx, 'notes', noteIds);
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
      if (completion) await recordTombstone(tx, 'lessonCompletions', id);
      if (schedulingUnit) await recordTombstone(tx, 'schedulingUnits', id);
      if (schedulingPerformance) await recordTombstone(tx, 'schedulingPerformance', id);

      const [remainingLessons, courseCards, courseLinks, assessments] = await Promise.all([
        db.lessons.where('courseId').equals(lesson.courseId).toArray(),
        db.cards.where('courseId').equals(lesson.courseId).toArray(),
        db.lessonCards.toArray(),
        db.courseAssessments.where('courseId').equals(lesson.courseId).toArray(),
      ]);
      for (const assessment of assessments) {
        const lostPlacement = assessment.afterLessonId === id;
        const lostCustomLesson =
          assessment.coverageMode === 'custom' && assessment.lessonIds.includes(id);
        let updated: CourseAssessment = {
          ...assessment,
          ...(lostPlacement ? { afterLessonId: precedingLessonId } : {}),
          ...(lostCustomLesson
            ? { lessonIds: assessment.lessonIds.filter((lessonId) => lessonId !== id) }
            : {}),
          ...(lostPlacement || lostCustomLesson ? { needsAuthorConfirmation: true } : {}),
        } as CourseAssessment;
        const withoutExclusions = { ...updated, excludedCardIds: [] } as CourseAssessment;
        const coveredCardIds = new Set(
          resolveAssessmentCoverage(
            withoutExclusions,
            remainingLessons,
            courseCards,
            courseLinks,
          ).cards.map((card) => card.id),
        );
        const excludedCardIds = updated.excludedCardIds.filter((cardId) =>
          coveredCardIds.has(cardId),
        );
        if (excludedCardIds.length !== updated.excludedCardIds.length) {
          updated = {
            ...updated,
            excludedCardIds,
            needsAuthorConfirmation: true,
          } as CourseAssessment;
        }
        await db.courseAssessments.put(stampUpdatedAt(updated, now));
      }
      await syncCourseSchedulingUnits(lesson.courseId);
    },
  );
  scheduleAssetGc();
}

/**
 * Assign a fresh orderIndex to each lesson based on its position in
 * orderedLessonIds, in one transaction.
 */
export async function reorderLessons(_courseId: string, orderedLessonIds: string[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.lessons, async () => {
    await db.lessons.bulkUpdate(
      orderedLessonIds.map((id, orderIndex) => ({
        key: id,
        changes: stampUpdatedAt({ orderIndex }, now),
      })),
    );
  });
}

// ---------------------------------------------------------------------------
// Lesson-card links
// ---------------------------------------------------------------------------

/**
 * Link cards into a lesson for display/grouping purposes as one atomic operation.
 *
 * The read-before-write duplicate check is concurrency-safe without a compound unique
 * index: every caller opens a read-write IndexedDB transaction containing `lessonCards`,
 * and overlapping write transactions on that object store are serialised. A later caller
 * therefore cannot read until the earlier caller has committed its inserted links.
 */
export async function linkCardsToLesson(
  lessonId: string,
  cardIds: string[],
): Promise<LessonCardLink[]> {
  const uniqueCardIds = [...new Set(cardIds)];
  if (uniqueCardIds.length === 0) return [];

  try {
    return await db.transaction('rw', db.lessons, db.cards, db.lessonCards, async () => {
      const lesson = await db.lessons.get(lessonId);
      if (!lesson) throw new Error('The lesson could not be found.');

      const cards = await db.cards.bulkGet(uniqueCardIds);
      const missingIndex = cards.findIndex((card) => card === undefined);
      if (missingIndex !== -1) {
        throw new Error(`Card ${uniqueCardIds[missingIndex]} could not be found.`);
      }

      for (const card of cards as Card[]) {
        if (card.courseId !== lesson.courseId) {
          throw new Error('Cards can only be linked within the same course.');
        }
        if (card.primaryLessonId === lessonId) {
          throw new Error('A card already belonging to this lesson cannot also be linked to it.');
        }
      }

      const existing = await db.lessonCards.where('lessonId').equals(lessonId).toArray();
      const existingByCardId = new Map(existing.map((link) => [link.cardId, link]));
      const now = Date.now();
      const created = uniqueCardIds
        .filter((cardId) => !existingByCardId.has(cardId))
        .map((cardId) => stampUpdatedAt({ id: makeId(), lessonId, cardId, createdAt: now }, now));
      if (created.length > 0) await db.lessonCards.bulkAdd(created);
      for (const link of created) existingByCardId.set(link.cardId, link);
      return uniqueCardIds.map((cardId) => existingByCardId.get(cardId)!);
    });
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/** Idempotent single-card convenience wrapper around {@link linkCardsToLesson}. */
export async function linkCardToLesson(lessonId: string, cardId: string): Promise<LessonCardLink> {
  const [link] = await linkCardsToLesson(lessonId, [cardId]);
  return link;
}

/** Remove a display link and the teaching progress specific to that link. */
export async function unlinkCardFromLesson(lessonId: string, cardId: string): Promise<void> {
  await db.transaction('rw', db.lessonCards, db.lessonCardExposures, db.tombstones, async (tx) => {
    const links = await db.lessonCards
      .where('lessonId')
      .equals(lessonId)
      .filter((link) => link.cardId === cardId)
      .toArray();
    const exposure = await db.lessonCardExposures.get([lessonId, cardId]);
    await db.lessonCards
      .where('lessonId')
      .equals(lessonId)
      .filter((link) => link.cardId === cardId)
      .delete();
    await db.lessonCardExposures.delete([lessonId, cardId]);
    await recordTombstones(
      tx,
      'lessonCards',
      links.map((link) => link.id),
    );
    if (exposure) {
      await recordTombstone(tx, 'lessonCardExposures', lessonCardExposureId(lessonId, cardId));
    }
  });
}

// ---------------------------------------------------------------------------
// Lesson progress
// ---------------------------------------------------------------------------

export async function upsertLessonCardExposure(
  lessonId: string,
  cardId: string,
  taughtAt: number = Date.now(),
): Promise<LessonCardExposure> {
  const existing = await db.lessonCardExposures.get([lessonId, cardId]);
  if (existing) return existing;
  const exposure = stampUpdatedAt({ lessonId, cardId, taughtAt }, taughtAt);
  await db.lessonCardExposures.add(exposure);
  return exposure;
}

export async function markLessonComplete(
  lessonId: string,
  completedAt: number = Date.now(),
): Promise<LessonCompletion> {
  const existing = await db.lessonCompletions.get(lessonId);
  if (existing) return existing;
  const completion = stampUpdatedAt({ lessonId, completedAt }, completedAt);
  await db.lessonCompletions.add(completion);
  return completion;
}

// ---------------------------------------------------------------------------
// Course assessments
// ---------------------------------------------------------------------------

function validateAssessmentStructure(assessment: CourseAssessment): void {
  if (assessment.kind !== 'final' && assessment.kind !== 'checkpoint') {
    throw new Error('Assessment kind must be final or checkpoint.');
  }
  if (
    assessment.afterLessonId !== null &&
    (typeof assessment.afterLessonId !== 'string' || assessment.afterLessonId.length === 0)
  ) {
    throw new Error('An assessment path position must be a lesson id or null.');
  }
  if (assessment.kind === 'checkpoint') {
    if (assessment.schedulingMode === 'steady') {
      throw new Error('Only the final assessment can use steady retention.');
    }
    if (!Number.isFinite(assessment.examDate)) {
      throw new Error('An assessment date must be a finite timestamp.');
    }
  } else if (assessment.schedulingMode === 'steady') {
    if (assessment.examDate !== undefined || assessment.timeZone !== undefined) {
      throw new Error('Steady retention cannot store an exam date or time zone.');
    }
  } else if (!Number.isFinite(assessment.examDate)) {
    throw new Error('An exam-targeted final assessment must have a finite timestamp.');
  }
  if (
    assessment.needsAuthorConfirmation !== undefined &&
    typeof assessment.needsAuthorConfirmation !== 'boolean'
  ) {
    throw new Error('Assessment author-confirmation state must be boolean.');
  }
  if (!Array.isArray(assessment.excludedCardIds)) {
    throw new Error('Assessment exclusions must be an explicit card-id array.');
  }
  if (
    assessment.excludedCardIds.some((cardId) => typeof cardId !== 'string' || cardId.length === 0)
  ) {
    throw new Error('Assessment exclusions must contain valid card ids.');
  }
  if (new Set(assessment.excludedCardIds).size !== assessment.excludedCardIds.length) {
    throw new Error('Assessment exclusions cannot contain duplicate card ids.');
  }
  if (assessment.coverageMode === 'prefix') {
    if (assessment.lessonIds !== undefined) {
      throw new Error('Prefix assessment coverage cannot store lesson ids.');
    }
    return;
  }
  if (assessment.coverageMode === 'custom') {
    if (!Array.isArray(assessment.lessonIds) || assessment.lessonIds.length === 0) {
      throw new Error('Custom assessment coverage requires an explicit lesson-id array.');
    }
    if (
      assessment.lessonIds.some((lessonId) => typeof lessonId !== 'string' || lessonId.length === 0)
    ) {
      throw new Error('Custom assessment coverage must contain valid lesson ids.');
    }
    if (new Set(assessment.lessonIds).size !== assessment.lessonIds.length) {
      throw new Error('Custom assessment coverage cannot contain duplicate lesson ids.');
    }
    return;
  }
  throw new Error('Assessment coverage mode must be prefix or custom.');
}

async function validateAssessmentReferences(assessment: CourseAssessment): Promise<void> {
  const [lessons, cards, links] = await Promise.all([
    db.lessons.toArray(),
    db.cards.toArray(),
    db.lessonCards.toArray(),
  ]);
  const issue = resolveAssessmentCoverage(assessment, lessons, cards, links).validation.issues[0];
  if (issue) throw new Error(issue.message);
}

export async function createCourseAssessment(
  courseId: string,
  name: string,
  examDate: number,
  opts?: Partial<CourseAssessment>,
): Promise<CourseAssessment> {
  try {
    let entry: CourseAssessment | undefined;
    await db.transaction(
      'rw',
      [
        db.courses,
        db.lessons,
        db.cards,
        db.lessonCards,
        db.courseAssessments,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
      ],
      async () => {
        if (!(await db.courses.get(courseId))) throw new Error('The course could not be found.');
        const existing = await db.courseAssessments.where('courseId').equals(courseId).toArray();
        finalAssessmentForCourse(courseId, existing);
        const lessons = await db.lessons.where('courseId').equals(courseId).sortBy('orderIndex');
        const coverageMode =
          opts?.coverageMode ??
          (Array.isArray(opts?.lessonIds) && opts.lessonIds.length > 0 ? 'custom' : 'prefix');
        const coveredLessonIds = new Set(coverageMode === 'custom' ? (opts?.lessonIds ?? []) : []);
        const inferredAnchor =
          [...lessons]
            .reverse()
            .find((lesson) => coverageMode === 'prefix' || coveredLessonIds.has(lesson.id))?.id ??
          null;
        const afterLessonId =
          opts !== undefined && Object.prototype.hasOwnProperty.call(opts, 'afterLessonId')
            ? opts.afterLessonId!
            : inferredAnchor;
        const createdAt = Date.now();
        entry = stampUpdatedAt(
          {
            kind: 'checkpoint',
            excludedCardIds: [],
            ...opts,
            id: makeId(),
            courseId,
            name,
            examDate,
            afterLessonId,
            coverageMode,
            createdAt,
          } as CourseAssessment,
          createdAt,
        );
        validateAssessmentStructure(entry);
        await validateAssessmentReferences(entry);
        if (entry.kind === 'final') {
          throw new Error('A course must have exactly one final assessment.');
        }
        await db.courseAssessments.add(entry);
        await syncCourseSchedulingUnits(courseId);
      },
    );
    return entry!;
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function updateCourseAssessment(
  id: string,
  changes: Partial<CourseAssessment>,
): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [
        db.courses,
        db.lessons,
        db.cards,
        db.lessonCards,
        db.courseAssessments,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
      ],
      async () => {
        const existing = await db.courseAssessments.get(id);
        if (!existing) throw new Error('The assessment could not be found.');
        if (changes.courseId !== undefined && changes.courseId !== existing.courseId) {
          throw new Error('An assessment cannot move to another course.');
        }
        const updated = stampUpdatedAt({
          ...existing,
          ...changes,
          id: existing.id,
          courseId: existing.courseId,
          createdAt: existing.createdAt,
        } as CourseAssessment);
        if (updated.kind === 'final' && updated.schedulingMode === 'steady') {
          delete updated.examDate;
          delete updated.timeZone;
        }
        validateAssessmentStructure(updated);
        await validateAssessmentReferences(updated);
        const assessments = await db.courseAssessments
          .where('courseId')
          .equals(existing.courseId)
          .toArray();
        const finalAssessment = finalAssessmentForCourse(existing.courseId, assessments);
        if (existing.kind === 'final' && updated.kind !== 'final') {
          throw new Error('The sole final assessment cannot be demoted.');
        }
        if (existing.kind !== 'final' && updated.kind === 'final' && finalAssessment.id !== id) {
          throw new Error('A course must have exactly one final assessment.');
        }
        await db.courseAssessments.put(updated);
        await syncCourseSchedulingUnits(existing.courseId);
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function deleteCourseAssessment(id: string): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [
        db.courses,
        db.lessons,
        db.courseAssessments,
        db.revisionPlans,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
        db.tombstones,
      ],
      async (tx) => {
        const assessment = await db.courseAssessments.get(id);
        if (!assessment) return;
        if (assessment.kind === 'final') {
          throw new Error('The sole final assessment cannot be deleted.');
        }
        const revisionPlanIds = (
          await db.revisionPlans.where('assessmentId').equals(id).primaryKeys()
        ).map(String);
        await db.revisionPlans.where('assessmentId').equals(id).delete();
        await db.courseAssessments.delete(id);
        await recordTombstone(tx, 'courseAssessments', id);
        await recordTombstones(tx, 'revisionPlans', revisionPlanIds);
        await syncCourseSchedulingUnits(assessment.courseId);
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

// ---------------------------------------------------------------------------
// Revision plans
// ---------------------------------------------------------------------------

async function resolveCurrentRevisionInput(
  assessmentId: string,
  projection: RevisionProjection,
  now: number,
) {
  const assessment = await db.courseAssessments.get(assessmentId);
  if (!assessment) throw new Error('The assessment could not be found.');
  if (assessment.examDate === undefined) {
    throw new Error('Steady retention does not have an assessment deadline.');
  }
  const datedAssessment = assessment as CourseAssessment & { examDate: number };
  const [courseRecord, assessments, lessons, cards, links, exposures, completions] =
    await Promise.all([
      db.courses.get(assessment.courseId),
      db.courseAssessments.where('courseId').equals(assessment.courseId).toArray(),
      db.lessons.where('courseId').equals(assessment.courseId).sortBy('orderIndex'),
      db.cards.where('courseId').equals(assessment.courseId).toArray(),
      db.lessonCards.toArray(),
      db.lessonCardExposures.toArray(),
      db.lessonCompletions.toArray(),
    ]);
  if (!courseRecord) throw new Error('The course could not be found.');
  const hydratedCards = await hydrateCardsWithHistory(cards);
  const course = hydrateCourse(
    courseRecord,
    finalAssessmentForCourse(assessment.courseId, assessments),
  );
  const reachedLessonIds = currentAssessmentPracticeContext({
    course,
    assessments,
    lessons,
    cards: hydratedCards,
    links,
    exposures,
    now,
  }).reachedLessonIds;
  return {
    assessment: datedAssessment,
    resolved: resolveRevisionPlanInput({
      assessment: datedAssessment,
      lessons,
      cards: hydratedCards,
      links,
      exposures,
      completions,
      reachedLessonIds,
      projection,
      now,
    }),
  };
}

export async function createOrResumeRevisionPlan(
  assessmentId: string,
  todayBudgetMinutes: number,
  projection: RevisionProjection,
  now: number = Date.now(),
): Promise<RevisionPlan> {
  try {
    return await db.transaction(
      'rw',
      [
        db.revisionPlans,
        db.courseAssessments,
        db.courses,
        db.lessons,
        db.cards,
        db.lessonCards,
        db.lessonCardExposures,
        db.lessonCompletions,
        db.reviewHistory,
      ],
      async () => {
        const existing = await db.revisionPlans.where('assessmentId').equals(assessmentId).first();
        const { assessment, resolved } = await resolveCurrentRevisionInput(
          assessmentId,
          projection,
          now,
        );
        if (existing) {
          const refreshed = applyRevisionPlanInput(existing, resolved, now);
          const updated =
            assessment.examDate <= now && refreshed.status !== 'completed'
              ? stampUpdatedAt({ ...refreshed, status: 'completed' as const }, now)
              : refreshed === existing
                ? refreshed
                : stampUpdatedAt(refreshed, now);
          if (updated !== existing) await db.revisionPlans.put(updated);
          return updated;
        }
        if (assessment.examDate <= now) {
          throw new Error('A revision plan cannot be created after its assessment deadline.');
        }
        const id = makeId();
        const plan = stampUpdatedAt(
          {
            id,
            assessmentId,
            courseId: assessment.courseId,
            status: 'active' as const,
            revision: 1,
            input: resolved.input,
            scope: resolved.scope,
            cardStates: resolved.cardStates,
            windows: buildRevisionWindows(
              id,
              todayBudgetMinutes,
              now,
              assessment.examDate,
              assessment.timeZone,
            ),
            completedSessions: [],
            replans: [],
            createdAt: now,
          },
          now,
        );
        await db.revisionPlans.add(plan);
        return plan;
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function refreshRevisionPlan(
  planId: string,
  projection: RevisionProjection,
  now: number = Date.now(),
): Promise<RevisionPlan> {
  try {
    return await db.transaction(
      'rw',
      [
        db.revisionPlans,
        db.courseAssessments,
        db.courses,
        db.lessons,
        db.cards,
        db.lessonCards,
        db.lessonCardExposures,
        db.lessonCompletions,
        db.reviewHistory,
      ],
      async () => {
        const plan = await db.revisionPlans.get(planId);
        if (!plan) throw new Error('The revision plan could not be found.');
        const { assessment, resolved } = await resolveCurrentRevisionInput(
          plan.assessmentId,
          projection,
          now,
        );
        const refreshed = applyRevisionPlanInput(plan, resolved, now);
        const updated =
          assessment.examDate <= now && refreshed.status !== 'completed'
            ? stampUpdatedAt({ ...refreshed, status: 'completed' as const }, now)
            : refreshed === plan
              ? refreshed
              : stampUpdatedAt(refreshed, now);
        if (updated !== plan) await db.revisionPlans.put(updated);
        return updated;
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function setRevisionDayBudget(
  planId: string,
  day: string,
  budgetMinutes: number,
  now: number = Date.now(),
): Promise<RevisionPlan> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Revision day must use YYYY-MM-DD.');
  if (!Number.isFinite(budgetMinutes) || budgetMinutes <= 0) {
    throw new Error('The daily revision budget must be greater than zero.');
  }
  return db.transaction('rw', db.revisionPlans, async () => {
    const plan = await db.revisionPlans.get(planId);
    if (!plan) throw new Error('The revision plan could not be found.');
    if (plan.status === 'completed') throw new Error('A completed revision plan is read-only.');
    if (!revisionPlanDays(now, plan.input.deadlineAt, plan.input.timeZone).includes(day)) {
      throw new Error('The revision day must be between today and the assessment deadline.');
    }
    const existing = plan.windows.find((window) => window.day === day);
    if (existing && existing.status !== 'scheduled') {
      throw new Error('An active or completed revision window cannot be edited.');
    }
    if (existing?.budgetMinutes === budgetMinutes) return plan;
    const windows = existing
      ? plan.windows.map((window) =>
          window.id === existing.id ? { ...window, budgetMinutes } : window,
        )
      : [
          ...plan.windows,
          {
            id: `${plan.id}:${day}`,
            day,
            budgetMinutes,
            status: 'scheduled' as const,
            planRevision: plan.revision,
          },
        ];
    const updated = stampUpdatedAt({ ...plan, windows, status: 'active' as const }, now);
    await db.revisionPlans.put(updated);
    return updated;
  });
}

export async function removeRevisionDay(
  planId: string,
  day: string,
  now: number = Date.now(),
): Promise<RevisionPlan> {
  return db.transaction('rw', db.revisionPlans, async () => {
    const plan = await db.revisionPlans.get(planId);
    if (!plan) throw new Error('The revision plan could not be found.');
    if (plan.status === 'completed') throw new Error('A completed revision plan is read-only.');
    const window = plan.windows.find((candidate) => candidate.day === day);
    if (!window) return plan;
    if (window.status !== 'scheduled') {
      throw new Error('An active or completed revision window cannot be removed.');
    }
    const updated = stampUpdatedAt(
      {
        ...plan,
        windows: plan.windows.filter((candidate) => candidate.id !== window.id),
      },
      now,
    );
    updated.status = planIsComplete(updated, now) ? 'completed' : 'active';
    await db.revisionPlans.put(updated);
    return updated;
  });
}

export async function startRevisionWindow(
  planId: string,
  windowId: string,
  startedAt: number = Date.now(),
): Promise<RevisionPlan> {
  return db.transaction('rw', db.revisionPlans, async () => {
    const plan = await db.revisionPlans.get(planId);
    if (!plan) throw new Error('The revision plan could not be found.');
    if (plan.status === 'completed' || startedAt >= plan.input.deadlineAt) {
      throw new Error('A completed revision plan is read-only.');
    }
    const target = plan.windows.find((window) => window.id === windowId);
    if (!target) throw new Error('The revision window could not be found.');
    if (target.status === 'active') return plan;
    if (target.status === 'completed')
      throw new Error('A completed revision window cannot restart.');
    if (plan.windows.some((window) => window.status === 'active')) {
      throw new Error('Another revision window is already active.');
    }
    const updated = stampUpdatedAt(
      {
        ...plan,
        windows: plan.windows.map((window) =>
          window.id === windowId ? { ...window, status: 'active' as const, startedAt } : window,
        ),
      },
      startedAt,
    );
    await db.revisionPlans.put(updated);
    return updated;
  });
}

export async function completeRevisionWindow(
  planId: string,
  windowId: string,
  session: RevisionPlanSession,
  now: number = Date.now(),
): Promise<RevisionPlan> {
  return db.transaction('rw', db.revisionPlans, async () => {
    const plan = await db.revisionPlans.get(planId);
    if (!plan) throw new Error('The revision plan could not be found.');
    if (session.windowId !== windowId) throw new Error('The session belongs to another window.');
    const window = plan.windows.find((candidate) => candidate.id === windowId);
    if (!window) throw new Error('The revision window could not be found.');
    if (window.status === 'completed') {
      if (plan.completedSessions.some((existing) => existing.id === session.id)) return plan;
      throw new Error('A completed revision window cannot accept another session.');
    }
    let updated = stampUpdatedAt(
      {
        ...plan,
        windows: plan.windows.map((candidate) =>
          candidate.id === windowId
            ? { ...candidate, status: 'completed' as const, completedAt: session.completedAt }
            : candidate,
        ),
        completedSessions: appendCompletedSession(plan.completedSessions, session),
      },
      now,
    );
    updated = stampUpdatedAt(applyPendingRevisionPlanInput(updated, now), now);
    updated.status = planIsComplete(updated, now) ? 'completed' : 'active';
    await db.revisionPlans.put(updated);
    return updated;
  });
}
