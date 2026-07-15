// High-level data operations that combine the FSRS engine with persistence.
// Components call these rather than touching Dexie tables directly.

import { db, makeId } from './schema';
import type {
  Card,
  CardType,
  Course,
  CourseExamDate,
  Deck,
  Grade,
  Lesson,
  LessonCardExposure,
  LessonCardLink,
  LessonCompletion,
  Note,
  NoteAnnotation,
  PracticeMilestone,
  PracticeNode,
  ReviewLog,
  SchedulerConfig,
  Sequence,
  SequenceItem,
  SessionHistoryEntry,
  UserPerformance,
} from './types';
import { applyReview, makeEngine } from '../fsrs/fsrs';
import { defaultFsrsParameters, FSRS_VERSION } from '../fsrs/params';
import { emptyPerformance, updatePerformance } from '../fsrs/grading';
import { isLeech } from '../fsrs/leech';
import { averagePredictedRetrievability } from '../fsrs/progress';
import { defaultExamDate, getLocalTimeZone } from '../utils/datetime';
import { readPracticeDefaults } from '../state/practiceDefaults';
import { readLessonViewMode } from '../state/lessonViewMode';
import { scheduleAssetGc } from './assets';
import {
  diffRegeneration,
  generateCards,
  LABEL_CARD_SUFFIX,
  type GeneratedCardPayload,
} from './sequenceGeneration';

/** Convert low-level IndexedDB errors into user-friendly messages. */
function friendlyDbError(err: unknown): Error {
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return new Error('Your browser storage is full. Free up space or export your data to a file.');
  }
  if (err instanceof Error) return err;
  return new Error(String(err));
}

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

export async function createDeck(name: string, colour?: string): Promise<Deck> {
  try {
    const createdAt = Date.now();
    const deck: Deck = {
      id: makeId(),
      name: name.trim() || 'Untitled deck',
      examDate: defaultExamDate(createdAt),
      timeZone: getLocalTimeZone(),
      createdAt,
      fsrsVersion: FSRS_VERSION,
      fsrsParameters: defaultFsrsParameters(),
      examObjective: 'expectedMarks',
      lastInteractedAt: createdAt,
      ...(colour ? { colour } : {}),
    };
    await db.decks.add(deck);
    await db.userPerformance.add(emptyPerformance(deck.id));
    return deck;
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function updateDeck(id: string, changes: Partial<Deck>): Promise<void> {
  try {
    await db.decks.update(id, changes);
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function deleteDeck(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.decks,
      db.cards,
      db.lessonCards,
      db.lessonCardExposures,
      db.sessionHistory,
      db.userPerformance,
    ],
    async () => {
      const cardIds = await db.cards.where('deckId').equals(id).primaryKeys();
      if (cardIds.length > 0) {
        await db.lessonCards.where('cardId').anyOf(cardIds).delete();
        await db.lessonCardExposures.where('cardId').anyOf(cardIds).delete();
      }
      await db.cards.where('deckId').equals(id).delete();
      await db.sessionHistory.where('deckId').equals(id).delete();
      await db.userPerformance.delete(id);
      await db.decks.delete(id);
    },
  );
  scheduleAssetGc();
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** Normalise card text for duplicate comparison: trim, lowercase, collapse whitespace. */
function normaliseCardText(text: string): string {
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
  const existing = await db.cards.where('deckId').equals(deckId).toArray();
  return existing.find((c) => {
    if (c.type !== type) return false;
    if (excludeId && c.id === excludeId) return false;
    return normaliseCardText(c.front) === normalisedFront && normaliseCardText(c.back) === normalisedBack;
  });
}

/** Check many drafts against a deck in a single DB read, returning the indices of duplicates. */
export async function checkDuplicatesBatch(
  deckId: string,
  drafts: { type: CardType; front: string; back: string }[],
): Promise<Set<number>> {
  const existing = await db.cards.where('deckId').equals(deckId).toArray();
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
  opts?: { courseId?: string | null; primaryLessonId?: string | null },
): Promise<Card> {
  try {
    const card: Card = {
      id: makeId(),
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
      createdAt: Date.now(),
      tags,
      suspended: false,
      buriedUntil: null,
      ...opts,
    };
    await db.cards.add(card);
    return card;
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
  drafts: { type: CardType; front: string; back: string; tags?: string[] }[],
): Promise<Card[]> {
  try {
    const now = Date.now();
    const cards: Card[] = drafts.map((draft, i) => ({
      id: makeId(),
      deckId,
      type: draft.type,
      front: draft.front,
      back: draft.back,
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
      createdAt: now + i,
      tags: draft.tags ?? [],
      suspended: false,
      buriedUntil: null,
    }));
    await db.cards.bulkAdd(cards);
    return cards;
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
  const card = await createCard(deckId, 'front_back', front, back, tags, opts);
  const reverse = await createCard(deckId, 'front_back', back, front, tags, opts);
  return { card, reverse };
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
  const reverse = await createCard(deckId, 'front_back', back, front, tags, opts);
  const card = await createCard(deckId, 'basic_reversed', front, back, tags, opts);
  await db.cards.update(card.id, { reverseCardId: reverse.id });
  await db.cards.update(reverse.id, { reverseCardId: card.id });
  return { card: { ...card, reverseCardId: reverse.id }, reverse: { ...reverse, reverseCardId: card.id } };
}

/**
 * Every course card still needs a real backing Deck (recordReview and userPerformance
 * both key off deckId). This lazily creates one hidden deck per lesson, inheriting the
 * course's scheduling fields, and reuses it on subsequent calls for the same lesson. May
 * run inside an outer transaction (e.g. share import), so it never opens its own
 * `db.transaction` — only plain table operations.
 */
export async function ensureLessonDeck(courseId: string, lessonId: string): Promise<string> {
  const existing = await db.cards.where('primaryLessonId').equals(lessonId).first();
  if (existing) return existing.deckId;

  const course = await db.courses.get(courseId);
  const lesson = await db.lessons.get(lessonId);
  const createdAt = Date.now();
  const deck: Deck = {
    id: makeId(),
    name: lesson?.name ?? 'Untitled lesson',
    examDate: course?.examDate ?? defaultExamDate(createdAt),
    timeZone: course?.timeZone ?? getLocalTimeZone(),
    createdAt,
    fsrsVersion: course?.fsrsVersion ?? FSRS_VERSION,
    fsrsParameters: course?.fsrsParameters ?? defaultFsrsParameters(),
    examObjective: course?.examObjective ?? 'expectedMarks',
    lastInteractedAt: createdAt,
    ...(course?.colour ? { colour: course.colour } : {}),
  };
  await db.decks.add(deck);
  await db.userPerformance.add(emptyPerformance(deck.id));
  return deck.id;
}

/** Create a card that belongs to a lesson, lazily creating the lesson's backing deck. */
export async function createLessonCard(
  courseId: string,
  lessonId: string,
  type: CardType,
  front: string,
  back: string,
  tags: string[] = [],
): Promise<Card> {
  const deckId = await ensureLessonDeck(courseId, lessonId);
  return createCard(deckId, type, front, back, tags, { courseId, primaryLessonId: lessonId });
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
  return createBasicReversedPair(deckId, front, back, tags, { courseId, primaryLessonId: lessonId });
}

/**
 * Every unassigned course card (primaryLessonId null) also needs a real backing Deck,
 * for the same reasons as {@link ensureLessonDeck}. Lazily creates one hidden "question
 * bank" deck per course and reuses it for every card in that course with no lesson.
 */
export async function ensureCourseBankDeck(courseId: string): Promise<string> {
  const existing = await db.cards
    .where('courseId')
    .equals(courseId)
    .filter((c) => c.primaryLessonId === null || c.primaryLessonId === undefined)
    .first();
  if (existing) return existing.deckId;

  const course = await db.courses.get(courseId);
  const createdAt = Date.now();
  const deck: Deck = {
    id: makeId(),
    name: course ? `${course.name} — Question bank` : 'Question bank',
    examDate: course?.examDate ?? defaultExamDate(createdAt),
    timeZone: course?.timeZone ?? getLocalTimeZone(),
    createdAt,
    fsrsVersion: course?.fsrsVersion ?? FSRS_VERSION,
    fsrsParameters: course?.fsrsParameters ?? defaultFsrsParameters(),
    examObjective: course?.examObjective ?? 'expectedMarks',
    lastInteractedAt: createdAt,
    ...(course?.colour ? { colour: course.colour } : {}),
  };
  await db.decks.add(deck);
  await db.userPerformance.add(emptyPerformance(deck.id));
  return deck.id;
}

/** Create a course-scoped card with no lesson, lazily creating the course's bank deck. */
export async function createCourseCard(
  courseId: string,
  type: CardType,
  front: string,
  back: string,
  tags: string[] = [],
): Promise<Card> {
  const deckId = await ensureCourseBankDeck(courseId);
  return createCard(deckId, type, front, back, tags, { courseId, primaryLessonId: null });
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
  await db.transaction('rw', db.cards, db.lessonCardExposures, async () => {
    const cards = await db.cards.where('id').anyOf(ids).toArray();
    const removedPrimaryExposures = cards
      .filter(
        (card) =>
          typeof card.primaryLessonId === 'string' && card.primaryLessonId !== lessonId,
      )
      .map((card) => [card.primaryLessonId as string, card.id] as [string, string]);
    if (removedPrimaryExposures.length > 0) {
      await db.lessonCardExposures.bulkDelete(removedPrimaryExposures);
    }
    await db.cards.where('id').anyOf(ids).modify({ primaryLessonId: lessonId, deckId });
  });
}

export async function updateCard(id: string, changes: Partial<Card>): Promise<void> {
  try {
    await db.cards.update(id, changes);
    if ('front' in changes || 'back' in changes) {
      scheduleAssetGc();
    }
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function deleteCards(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction('rw', db.cards, db.lessonCards, db.lessonCardExposures, async () => {
    await db.lessonCards.where('cardId').anyOf(ids).delete();
    await db.lessonCardExposures.where('cardId').anyOf(ids).delete();
    await db.cards.bulkDelete(ids);
  });
  scheduleAssetGc();
}

export type CardSnapshot = Card[] & {
  lessonCards: LessonCardLink[];
  lessonCardExposures: LessonCardExposure[];
};

/** Capture card rows and dependent lesson progress before an undoable mutation. */
export async function snapshotCards(ids: string[]): Promise<CardSnapshot> {
  const [cards, lessonCards, lessonCardExposures] = await Promise.all([
    db.cards.where('id').anyOf(ids).toArray(),
    db.lessonCards.where('cardId').anyOf(ids).toArray(),
    db.lessonCardExposures.where('cardId').anyOf(ids).toArray(),
  ]);
  return Object.assign(cards, { lessonCards, lessonCardExposures });
}

/** Re-insert previously captured cards (the inverse of deleteCards). */
export async function restoreCards(cards: CardSnapshot): Promise<void> {
  try {
    await db.transaction('rw', db.cards, db.lessonCards, db.lessonCardExposures, async () => {
      await db.cards.bulkPut(cards);
      await db.lessonCards.bulkPut(cards.lessonCards);
      await db.lessonCardExposures.bulkPut(cards.lessonCardExposures);
    });
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function moveCards(ids: string[], targetDeckId: string): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    await db.cards.where('id').anyOf(ids).modify({ deckId: targetDeckId });
  });
}

/** Withhold a card from all study and from progress/objective until un-suspended. */
export async function suspendCard(id: string): Promise<void> {
  await db.cards.update(id, { suspended: true });
}

/** Return a suspended card to normal scheduling. */
export async function unsuspendCard(id: string): Promise<void> {
  await db.cards.update(id, { suspended: false });
}

/** Suspend or un-suspend many cards at once (used by the card list's bulk actions). */
export async function setCardsSuspended(ids: string[], suspended: boolean): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    await db.cards.where('id').anyOf(ids).modify({ suspended });
  });
}

/** Add a tag to many cards at once, leaving cards that already have it untouched. */
export async function addTagToCards(ids: string[], tag: string): Promise<void> {
  const clean = tag.trim();
  if (!clean) return;
  await db.transaction('rw', db.cards, async () => {
    await db.cards.where('id').anyOf(ids).modify((card) => {
      const tags = card.tags ?? [];
      if (!tags.includes(clean)) card.tags = [...tags, clean];
    });
  });
}

/** Remove a tag from many cards at once. */
export async function removeTagFromCards(ids: string[], tag: string): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    await db.cards.where('id').anyOf(ids).modify((card) => {
      if (card.tags?.length) card.tags = card.tags.filter((t) => t !== tag);
    });
  });
}

/** Skip a card until the given instant (defaults to the caller-supplied next midnight). */
export async function buryCard(id: string, until: number): Promise<void> {
  await db.cards.update(id, { buriedUntil: until });
}

/** Skip many cards until the given instant. */
export async function buryCards(ids: string[], until: number): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    await db.cards.where('id').anyOf(ids).modify({ buriedUntil: until });
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
  await db.transaction('rw', db.cards, async () => {
    if (options.due !== undefined) {
      await db.cards.where('id').anyOf(ids).modify({ due: options.due, buriedUntil: null });
    } else if (options.reset) {
      await db.cards.where('id').anyOf(ids).modify((card) => {
        card.state = 0;
        card.stability = null;
        card.difficulty = null;
        card.due = null;
        card.scheduledDays = 0;
        card.learningSteps = 0;
        card.lastReviewed = null;
        card.buriedUntil = null;
      });
    }
  });
}

/** Set or clear a card's flag (a user marker for quick filtering and follow-up). */
export async function setCardFlag(id: string, flagged: boolean): Promise<void> {
  await db.cards.update(id, { flagged });
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

/** Which table owns the reviewed unit: a legacy Deck, or a course/lesson-scoped Course. */
type ReviewUnitKind = 'deck' | 'course';

export interface RecordReviewArgs {
  card: Card;
  /**
   * The Deck (legacy per-deck/global-Today scope) or Course (course/lesson scope) this
   * review is scheduled and calibrated against. Both satisfy SchedulerConfig, so the
   * FSRS maths is identical either way; only the bookkeeping below (lastInteractedAt
   * table, and the card set the retrievability snapshot spans) differs by `kind`.
   */
  deck: SchedulerConfig;
  /** Defaults to 'deck' so every existing Deck-keyed caller is unaffected. */
  kind?: ReviewUnitKind;
  grade: Grade;
  responseTimeSec: number;
  distracted: boolean;
  /** Whether the answer was correct (grade > 1); drives per-deck calibration stats. */
  correct: boolean;
  now?: number;
}

/** The result of recording a review: the updated card plus undo bookkeeping. */
export interface RecordReviewResult {
  card: Card;
  /** Id of the SessionHistory row written for this review, so it can be undone. */
  sessionHistoryId: number;
  /** The review kind this was recorded against (see {@link RecordReviewArgs.kind}), so
   * the caller can carry it straight into {@link ReviewUndo} without re-deriving it. */
  kind: ReviewUnitKind;
  /**
   * The unit's `lastInteractedAt` immediately before this review overwrote it (undefined
   * if the unit had none yet), so the caller can carry it into {@link ReviewUndo} and
   * restore it on undo.
   */
  lastInteractedAtBefore: number | undefined;
}

/**
 * Record a single review: apply the FSRS update to the card, append a review log,
 * update the deck's calibration profile (correct reviews only), and write a
 * SessionHistory snapshot of the deck's average predicted exam-day retrievability.
 * Returns the updated card (for immediate re-scoring) and the SessionHistory id
 * (so the review can be undone, see undoReview).
 */
export async function recordReview(args: RecordReviewArgs): Promise<RecordReviewResult> {
  try {
    const { card, deck, grade, responseTimeSec, distracted, correct } = args;
    const kind: ReviewUnitKind = args.kind ?? 'deck';
    const now = args.now ?? Date.now();

  // All FSRS-6 maths is delegated to ts-fsrs via the engine wrapper.
  const engine = makeEngine(deck.fsrsParameters);
  const { memory, retrievabilityAtReview } = applyReview(engine, card, grade, now);

  const log: ReviewLog = {
    timestamp: now,
    grade,
    responseTimeSec,
    distracted,
    stabilityBefore: card.stability,
    stabilityAfter: memory.stability,
    difficultyBefore: card.difficulty,
    difficultyAfter: memory.difficulty,
    retrievabilityAtReview,
  };

  const updatedCard: Card = {
    ...card,
    stability: memory.stability,
    difficulty: memory.difficulty,
    lastReviewed: memory.lastReviewed,
    due: memory.due,
    scheduledDays: memory.scheduledDays,
    learningSteps: memory.learningSteps,
    reps: memory.reps,
    lapses: memory.lapses,
    state: memory.state,
    history: [...card.history, log],
  };

  // Leech auto-action: if the card just crossed the threshold, act on it.
  const action = deck.leechAction ?? 'suspend';
  const threshold = deck.leechThreshold;
  if (action !== 'none' && isLeech(updatedCard, threshold) && !isLeech(card, threshold)) {
    if (action === 'suspend') {
      updatedCard.suspended = true;
    } else if (action === 'tag') {
      const tags = updatedCard.tags ?? [];
      if (!tags.includes('leech')) {
        updatedCard.tags = [...tags, 'leech'];
      }
    }
  }

  let lastInteractedAtBefore: number | undefined;
  const sessionHistoryId = await db.transaction(
    'rw',
    [db.cards, db.decks, db.courses, db.sessionHistory, db.userPerformance],
    async () => {
      await db.cards.put(updatedCard);
      if (kind === 'course') {
        lastInteractedAtBefore = (await db.courses.get(deck.id))?.lastInteractedAt;
        await db.courses.update(deck.id, { lastInteractedAt: now });
      } else {
        lastInteractedAtBefore = (await db.decks.get(deck.id))?.lastInteractedAt;
        await db.decks.update(deck.id, { lastInteractedAt: now });
      }

      if (correct) {
        // Per decision: UserPerformance keeps its existing deckId-named primary key;
        // for course/lesson-scoped reviews we simply write the courseId string into
        // that same field (no schema bump).
        const perf =
          (await db.userPerformance.get(deck.id)) ?? emptyPerformance(deck.id);
        await db.userPerformance.put(updatePerformance(perf, responseTimeSec));
      }

      // Read the unit's cards inside the transaction so concurrent reviews cannot
      // race the average predicted retrievability calculation. Deck scope spans the
      // deck's own cards; course scope spans every card in the course (across lessons).
      const allUnitCards =
        kind === 'course'
          ? await db.cards.where('courseId').equals(deck.id).toArray()
          : await db.cards.where('deckId').equals(deck.id).toArray();
      const unitCards = allUnitCards.map((c) =>
        c.id === updatedCard.id ? updatedCard : c,
      );
      const avgRetrievability = averagePredictedRetrievability(unitCards, deck);

      return db.sessionHistory.add({
        timestamp: now,
        // deckId always identifies the backing (possibly shadow) deck the card lives
        // in; courseId is populated in addition for course/lesson-scoped reviews.
        deckId: updatedCard.deckId,
        ...(kind === 'course' ? { courseId: deck.id } : {}),
        averagePredictedRetrievability: avgRetrievability,
      });
    },
  );

    return { card: updatedCard, sessionHistoryId, kind, lastInteractedAtBefore };
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/** Snapshot needed to reverse a single review (see undoReview). */
export interface ReviewUndo {
  /** The card exactly as it was before the review. */
  cardBefore: Card;
  /** The deck's calibration profile before the review (null if none existed). */
  perfBefore: UserPerformance | null;
  /** The SessionHistory row id written by the review. */
  sessionHistoryId: number;
  /**
   * The UserPerformance key of the unit that was reviewed (a deckId for deck scope,
   * or a courseId for course/lesson scope — see {@link RecordReviewArgs.kind}).
   */
  deckId: string;
  /**
   * Which table `deckId` belongs to: a legacy Deck, or a course/lesson-scoped Course.
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
}

/**
 * Reverse the most recent review: restore the card and the deck's calibration
 * profile wholesale (no Welford inverse maths) and delete the SessionHistory row
 * the review appended. Single-step, used by the in-session Undo affordance.
 */
export async function undoReview(undo: ReviewUndo): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [db.cards, db.decks, db.courses, db.sessionHistory, db.userPerformance],
      async () => {
        await db.cards.put(undo.cardBefore);
        if (undo.perfBefore) {
          await db.userPerformance.put(undo.perfBefore);
        } else {
          await db.userPerformance.delete(undo.deckId);
        }
        // Dexie's update() deletes the property when the patch value is undefined, so
        // this also correctly restores "never interacted" (no prior lastInteractedAt).
        if (undo.kind === 'course') {
          await db.courses.update(undo.deckId, { lastInteractedAt: undo.lastInteractedAtBefore });
        } else {
          await db.decks.update(undo.deckId, { lastInteractedAt: undo.lastInteractedAtBefore });
        }
        await db.sessionHistory.delete(undo.sessionHistoryId);
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export async function createCourse(name: string, opts?: Partial<Course>): Promise<Course> {
  try {
    const createdAt = Date.now();
    const practiceDefaults = readPracticeDefaults();
    const course: Course = {
      id: makeId(),
      name: name.trim() || 'Untitled course',
      description: '',
      createdAt,
      examDate: defaultExamDate(createdAt),
      timeZone: getLocalTimeZone(),
      fsrsVersion: FSRS_VERSION,
      fsrsParameters: defaultFsrsParameters(),
      examObjective: 'expectedMarks',
      unlockMode: 'open',
      // New courses default to edit mode (see src/course/lessonViewMode.ts).
      // Share-code import (src/db/share.ts) overrides this to 'study' via opts.
      lessonViewMode: 'edit',
      ...practiceDefaults,
      ...opts,
    };
    await db.courses.add(course);
    return course;
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

export async function updateCourse(id: string, changes: Partial<Course>): Promise<void> {
  try {
    await db.courses.update(id, changes);
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * Delete a course and cascade to all dependent rows in one transaction:
 * notes and lessonCard links belonging to the course's lessons, the lessons
 * themselves, practice nodes, course exam dates, and cards whose courseId
 * matches. Cards are deleted (not unassigned) because they were created for
 * this course; the cascade mirrors deleteDeck deleting its cards.
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
      db.courseExamDates,
      db.cards,
      db.decks,
      db.sessionHistory,
      db.userPerformance,
    ],
    async () => {
      const lessonIds = await db.lessons.where('courseId').equals(id).primaryKeys();
      if (lessonIds.length > 0) {
        const noteIds = await db.notes.where('lessonId').anyOf(lessonIds).primaryKeys();
        if (noteIds.length > 0) {
          await db.noteAnnotations.where('noteId').anyOf(noteIds).delete();
        }
        await db.notes.where('lessonId').anyOf(lessonIds).delete();
        await db.lessonCards.where('lessonId').anyOf(lessonIds).delete();
        await db.lessonCardExposures.where('lessonId').anyOf(lessonIds).delete();
        await db.lessonCompletions.where('lessonId').anyOf(lessonIds).delete();
      }
      // Every course card has a hidden backing deck (see ensureLessonDeck /
      // ensureCourseBankDeck); nothing else can reference those decks, so they and
      // their per-deck calibration profiles must be swept up alongside the cards.
      const deckIds = [
        ...new Set((await db.cards.where('courseId').equals(id).toArray()).map((c) => c.deckId)),
      ];
      await db.lessons.where('courseId').equals(id).delete();
      await db.practiceNodes.where('courseId').equals(id).delete();
      await db.practiceMilestones.where('courseId').equals(id).delete();
      await db.courseExamDates.where('courseId').equals(id).delete();
      await db.cards.where('courseId').equals(id).delete();
      if (deckIds.length > 0) {
        await db.decks.where('id').anyOf(deckIds).delete();
        await db.sessionHistory.where('deckId').anyOf(deckIds).delete();
        await db.userPerformance.where('deckId').anyOf(deckIds).delete();
      }
      // The course-level calibration profile and session history are keyed by the
      // course id itself for course/lesson-scoped reviews (see recordReview).
      await db.userPerformance.delete(id);
      await db.sessionHistory.where('courseId').equals(id).delete();
      await db.courses.delete(id);
    },
  );
  // Deleting the course's cards may orphan image assets; reclaim them, as deleteDeck does.
  scheduleAssetGc();
}

/** A complete copy of a course and everything that hangs off it: lessons, notes,
 * lesson-card links, practice nodes, exam dates, cards and their hidden backing decks
 * (plus the session history and calibration profiles keyed to either). */
export interface CourseSnapshot {
  course: Course;
  lessons: Lesson[];
  notes: Note[];
  lessonCards: LessonCardLink[];
  lessonCardExposures: LessonCardExposure[];
  lessonCompletions: LessonCompletion[];
  practiceNodes: PracticeNode[];
  practiceMilestones: PracticeMilestone[];
  courseExamDates: CourseExamDate[];
  cards: Card[];
  decks: Deck[];
  sessionHistory: SessionHistoryEntry[];
  userPerformance: UserPerformance[];
}

/**
 * Capture a course plus everything {@link deleteCourse} removes, so the action can be
 * offered with an "Undo". Call this *before* deleteCourse. Also captures the lessons'
 * hidden backing decks (see {@link ensureLessonDeck} /
 * {@link ensureCourseBankDeck}) since deleteCourse removes those too. Returns null if the
 * course no longer exists.
 */
export async function snapshotCourse(id: string): Promise<CourseSnapshot | null> {
  const course = await db.courses.get(id);
  if (!course) return null;

  const [lessons, practiceNodes, practiceMilestones, courseExamDates, cards, coursePerf] = await Promise.all([
    db.lessons.where('courseId').equals(id).toArray(),
    db.practiceNodes.where('courseId').equals(id).toArray(),
    db.practiceMilestones.where('courseId').equals(id).toArray(),
    db.courseExamDates.where('courseId').equals(id).toArray(),
    db.cards.where('courseId').equals(id).toArray(),
    db.userPerformance.get(id),
  ]);
  const lessonIds = lessons.map((l) => l.id);
  const deckIds = [...new Set(cards.map((c) => c.deckId))];

  const [notes, lessonCards, lessonCardExposures, lessonCompletions, decks, deckSessionHistory, courseSessionHistory, deckPerf] =
    await Promise.all([
      lessonIds.length > 0 ? db.notes.where('lessonId').anyOf(lessonIds).toArray() : [],
      lessonIds.length > 0 ? db.lessonCards.where('lessonId').anyOf(lessonIds).toArray() : [],
      lessonIds.length > 0 ? db.lessonCardExposures.where('lessonId').anyOf(lessonIds).toArray() : [],
      lessonIds.length > 0 ? db.lessonCompletions.where('lessonId').anyOf(lessonIds).toArray() : [],
      deckIds.length > 0 ? db.decks.where('id').anyOf(deckIds).toArray() : [],
      deckIds.length > 0 ? db.sessionHistory.where('deckId').anyOf(deckIds).toArray() : [],
      db.sessionHistory.where('courseId').equals(id).toArray(),
      deckIds.length > 0 ? db.userPerformance.where('deckId').anyOf(deckIds).toArray() : [],
    ]);
  // A backing deck's session history is always course-scoped too (see recordReview),
  // so de-duplicate by row id between the deckId and courseId lookups.
  const sessionHistoryById = new Map(
    [...deckSessionHistory, ...courseSessionHistory].map((entry) => [entry.id, entry]),
  );

  return {
    course,
    lessons,
    notes,
    lessonCards,
    lessonCardExposures,
    lessonCompletions,
    practiceNodes,
    practiceMilestones,
    courseExamDates,
    cards,
    decks,
    sessionHistory: [...sessionHistoryById.values()],
    userPerformance: coursePerf ? [...deckPerf, coursePerf] : deckPerf,
  };
}

/** Re-insert a previously captured CourseSnapshot (the inverse of deleteCourse). */
export async function restoreCourse(snapshot: CourseSnapshot): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [
        db.courses,
        db.lessons,
        db.notes,
        db.lessonCards,
        db.lessonCardExposures,
        db.lessonCompletions,
        db.practiceNodes,
        db.practiceMilestones,
        db.courseExamDates,
        db.cards,
        db.decks,
        db.sessionHistory,
        db.userPerformance,
      ],
      async () => {
        await Promise.all([
          db.courses.put(snapshot.course),
          db.lessons.bulkPut(snapshot.lessons),
          db.notes.bulkPut(snapshot.notes),
          db.lessonCards.bulkPut(snapshot.lessonCards),
          db.lessonCardExposures.bulkPut(snapshot.lessonCardExposures),
          db.lessonCompletions.bulkPut(snapshot.lessonCompletions),
          db.practiceNodes.bulkPut(snapshot.practiceNodes),
          db.practiceMilestones.bulkPut(snapshot.practiceMilestones),
          db.courseExamDates.bulkPut(snapshot.courseExamDates),
          db.cards.bulkPut(snapshot.cards),
          db.decks.bulkPut(snapshot.decks),
          db.userPerformance.bulkPut(snapshot.userPerformance),
          // Drop the old auto-increment ids so Dexie reassigns them cleanly.
          db.sessionHistory.bulkAdd(
            snapshot.sessionHistory.map(({ id: _id, ...rest }) => rest as SessionHistoryEntry),
          ),
        ]);
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
    const lesson: Lesson = {
      id: makeId(),
      courseId,
      name: name.trim() || 'Untitled lesson',
      orderIndex: maxIndex + 1,
      isExtension: false,
      createdAt: Date.now(),
      ...opts,
    };
    await db.lessons.add(lesson);
    return lesson;
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function updateLesson(id: string, changes: Partial<Lesson>): Promise<void> {
  try {
    await db.lessons.update(id, changes);
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
export async function ratchetLessonUnlock(lessonId: string, now: number = Date.now()): Promise<void> {
  await db.transaction('rw', db.lessons, async () => {
    const lesson = await db.lessons.get(lessonId);
    if (!lesson || lesson.unlockedAt !== undefined) return;
    await db.lessons.update(lessonId, { unlockedAt: now });
  });
}

/**
 * Delete a lesson: remove its notes and lessonCard links in one transaction.
 * Cards whose primaryLessonId pointed here become unassigned (primaryLessonId set
 * to null) rather than deleted — they remain in the question bank. Sibling
 * lessons are not renumbered.
 */
export async function deleteLesson(id: string): Promise<void> {
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
    ],
    async () => {
      const noteIds = await db.notes.where('lessonId').equals(id).primaryKeys();
      if (noteIds.length > 0) {
        await db.noteAnnotations.where('noteId').anyOf(noteIds).delete();
      }
      await db.notes.where('lessonId').equals(id).delete();
      await db.lessonCards.where('lessonId').equals(id).delete();
      await db.lessonCardExposures.where('lessonId').equals(id).delete();
      await db.lessonCompletions.delete(id);
      await db.cards.where('primaryLessonId').equals(id).modify({ primaryLessonId: null });
      await db.lessons.delete(id);
    },
  );
}

/** All lessons for a course, ordered by orderIndex ascending. */
export async function listLessons(courseId: string): Promise<Lesson[]> {
  return db.lessons.where('courseId').equals(courseId).sortBy('orderIndex');
}

/**
 * Assign a fresh orderIndex to each lesson based on its position in
 * orderedLessonIds, in one transaction.
 */
export async function reorderLessons(_courseId: string, orderedLessonIds: string[]): Promise<void> {
  await db.transaction('rw', db.lessons, async () => {
    for (let i = 0; i < orderedLessonIds.length; i++) {
      await db.lessons.update(orderedLessonIds[i], { orderIndex: i });
    }
  });
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function createNote(
  lessonId: string,
  name: string,
  content?: string,
  opts?: Partial<Note>,
): Promise<Note> {
  try {
    const existing = await db.notes.where('lessonId').equals(lessonId).toArray();
    const maxIndex = existing.reduce((m, n) => Math.max(m, n.orderIndex), -1);
    const note: Note = {
      id: makeId(),
      lessonId,
      name: name.trim() || 'Untitled note',
      content: content ?? '',
      orderIndex: maxIndex + 1,
      createdAt: Date.now(),
      ...opts,
    };
    await db.notes.add(note);
    return note;
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function updateNote(id: string, changes: Partial<Note>): Promise<void> {
  try {
    await db.notes.update(id, changes);
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function deleteNote(id: string): Promise<void> {
  await db.transaction('rw', db.notes, db.noteAnnotations, async () => {
    await db.noteAnnotations.where('noteId').equals(id).delete();
    await db.notes.delete(id);
  });
}

/** All notes for a lesson, ordered by orderIndex ascending. */
export async function listNotes(lessonId: string): Promise<Note[]> {
  return db.notes.where('lessonId').equals(lessonId).sortBy('orderIndex');
}

/** Assign a fresh orderIndex to each note based on its position in orderedNoteIds. */
export async function reorderNotes(_lessonId: string, orderedNoteIds: string[]): Promise<void> {
  await db.transaction('rw', db.notes, async () => {
    for (let i = 0; i < orderedNoteIds.length; i++) {
      await db.notes.update(orderedNoteIds[i], { orderIndex: i });
    }
  });
}

// ---------------------------------------------------------------------------
// Device-local note annotations
// ---------------------------------------------------------------------------

export async function createNoteAnnotation(
  noteId: string,
  startOffset: number,
  endOffset: number,
  selectedText: string,
  body?: string,
): Promise<NoteAnnotation> {
  if (startOffset < 0 || endOffset <= startOffset) {
    throw new Error('Annotation offsets must describe a non-empty source range.');
  }
  const now = Date.now();
  const annotation: NoteAnnotation = {
    id: makeId(),
    noteId,
    startOffset,
    endOffset,
    selectedText,
    ...(body?.trim() ? { body: body.trim() } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await db.noteAnnotations.add(annotation);
  return annotation;
}

export async function updateNoteAnnotation(
  id: string,
  changes: Pick<Partial<NoteAnnotation>, 'body' | 'startOffset' | 'endOffset' | 'selectedText'>,
): Promise<void> {
  await db.noteAnnotations.update(id, { ...changes, updatedAt: Date.now() });
}

export async function deleteNoteAnnotation(id: string): Promise<void> {
  await db.noteAnnotations.delete(id);
}

export async function listNoteAnnotations(noteId: string): Promise<NoteAnnotation[]> {
  return db.noteAnnotations.where('noteId').equals(noteId).sortBy('startOffset');
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
        .map((cardId) => ({ id: makeId(), lessonId, cardId, createdAt: now }));
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

export async function listLessonCardLinks(lessonId: string): Promise<LessonCardLink[]> {
  return db.lessonCards.where('lessonId').equals(lessonId).toArray();
}

/** Remove a display link and the teaching progress specific to that link. */
export async function unlinkCardFromLesson(lessonId: string, cardId: string): Promise<void> {
  await db.transaction('rw', db.lessonCards, db.lessonCardExposures, async () => {
    await db.lessonCards
      .where('lessonId')
      .equals(lessonId)
      .filter((link) => link.cardId === cardId)
      .delete();
    await db.lessonCardExposures.delete([lessonId, cardId]);
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
  const exposure = { lessonId, cardId, taughtAt };
  await db.lessonCardExposures.add(exposure);
  return exposure;
}

export async function listLessonCardExposures(lessonId: string): Promise<LessonCardExposure[]> {
  return db.lessonCardExposures.where('lessonId').equals(lessonId).toArray();
}

export async function markLessonComplete(
  lessonId: string,
  completedAt: number = Date.now(),
): Promise<LessonCompletion> {
  const existing = await db.lessonCompletions.get(lessonId);
  if (existing) return existing;
  const completion = { lessonId, completedAt };
  await db.lessonCompletions.add(completion);
  return completion;
}

export async function getLessonCompletion(lessonId: string): Promise<LessonCompletion | undefined> {
  return db.lessonCompletions.get(lessonId);
}

// ---------------------------------------------------------------------------
// Practice nodes
// ---------------------------------------------------------------------------

export async function createPracticeNode(
  courseId: string,
  opts: Partial<PracticeNode> & Pick<PracticeNode, 'type' | 'name'>,
): Promise<PracticeNode> {
  try {
    const node: PracticeNode = {
      id: makeId(),
      courseId,
      createdAt: Date.now(),
      ...opts,
    };
    await db.practiceNodes.add(node);
    return node;
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function updatePracticeNode(
  id: string,
  changes: Partial<PracticeNode>,
): Promise<void> {
  try {
    await db.practiceNodes.update(id, changes);
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function deletePracticeNode(id: string): Promise<void> {
  await db.transaction('rw', db.practiceNodes, db.practiceMilestones, async () => {
    await db.practiceMilestones.delete(id);
    await db.practiceNodes.delete(id);
  });
}

export async function listPracticeNodes(courseId: string): Promise<PracticeNode[]> {
  return db.practiceNodes.where('courseId').equals(courseId).toArray();
}

/**
 * Persist the last measured progress for a path node. Changing scopeVersion
 * atomically replaces stale progress for an older effective card scope.
 */
export async function savePracticeMilestoneProgress(
  nodeKey: string,
  courseId: string,
  scopeVersion: string,
  securedCardCount: number,
  totalCardCount: number,
  completed: boolean = false,
  now: number = Date.now(),
): Promise<PracticeMilestone> {
  const existing = await db.practiceMilestones.get(nodeKey);
  const sameScope = existing?.scopeVersion === scopeVersion;
  const milestone: PracticeMilestone = {
    nodeKey,
    courseId,
    scopeVersion,
    securedCardCount: Math.max(0, Math.min(securedCardCount, totalCardCount)),
    totalCardCount: Math.max(0, totalCardCount),
    updatedAt: now,
    ...((completed || (sameScope && existing.completedAt !== undefined))
      ? { completedAt: sameScope && existing?.completedAt !== undefined ? existing.completedAt : now }
      : {}),
  };
  await db.practiceMilestones.put(milestone);
  return milestone;
}

/** Return progress only when it belongs to the caller's current effective scope. */
export async function getPracticeMilestone(
  nodeKey: string,
  scopeVersion: string,
): Promise<PracticeMilestone | undefined> {
  const milestone = await db.practiceMilestones.get(nodeKey);
  return milestone?.scopeVersion === scopeVersion ? milestone : undefined;
}

// ---------------------------------------------------------------------------
// Course exam dates
// ---------------------------------------------------------------------------

export async function createCourseExamDate(
  courseId: string,
  name: string,
  examDate: number,
  opts?: Partial<CourseExamDate>,
): Promise<CourseExamDate> {
  try {
    const entry: CourseExamDate = {
      id: makeId(),
      courseId,
      name,
      examDate,
      createdAt: Date.now(),
      ...opts,
    };
    await db.courseExamDates.add(entry);
    return entry;
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function updateCourseExamDate(
  id: string,
  changes: Partial<CourseExamDate>,
): Promise<void> {
  try {
    await db.courseExamDates.update(id, changes);
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function deleteCourseExamDate(id: string): Promise<void> {
  await db.courseExamDates.delete(id);
}

/** All exam dates for a course, ordered by examDate ascending. */
export async function listCourseExamDates(courseId: string): Promise<CourseExamDate[]> {
  return db.courseExamDates.where('courseId').equals(courseId).sortBy('examDate');
}

// ---------------------------------------------------------------------------
// Sequences
// ---------------------------------------------------------------------------

// Guarantees `createSequence`'s createdAt strictly increases even when two sequences are
// created within the same millisecond (e.g. back-to-back in a test or a scripted import),
// so `listSequences`'s createdAt ordering doesn't fall back to comparing (random) ids.
let lastSequenceTimestamp = 0;
function nextSequenceTimestamp(): number {
  lastSequenceTimestamp = Math.max(Date.now(), lastSequenceTimestamp + 1);
  return lastSequenceTimestamp;
}

/** Every `Card.sequenceItemId` a sequence could ever have produced (positional + label), keyed by item. */
function sequenceItemKeys(sequence: Sequence): string[] {
  return sequence.items.flatMap((item) => [item.id, `${item.id}${LABEL_CARD_SUFFIX}`]);
}

/** Turn a generation payload into a full Card row with fresh FSRS defaults (mirrors {@link createCards}). */
function generatedCardFromPayload(deckId: string, payload: GeneratedCardPayload, createdAt: number): Card {
  return {
    id: makeId(),
    deckId,
    courseId: payload.courseId,
    primaryLessonId: payload.primaryLessonId,
    type: payload.type,
    front: payload.front,
    back: payload.back,
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
    tags: [],
    suspended: false,
    buriedUntil: null,
    sequenceItemId: payload.sequenceItemId,
  };
}

/** All cards ever generated from a sequence (positional and label cards alike). */
export async function cardsForSequence(sequence: Sequence): Promise<Card[]> {
  const keys = sequenceItemKeys(sequence);
  if (keys.length === 0) return [];
  return db.cards.where('sequenceItemId').anyOf(keys).toArray();
}

/**
 * Create a Sequence and, in the same transaction, every card {@link generateCards} derives
 * from it. Cards get a real backing deck via the same lazy lesson/question-bank deck as
 * ordinary lesson/course cards (see {@link ensureLessonDeck} / {@link ensureCourseBankDeck}),
 * looked up before the transaction since those helpers may open their own table writes.
 */
export async function createSequence(
  courseId: string,
  primaryLessonId: string | null,
  name: string,
  items: SequenceItem[],
  opts?: Partial<Sequence>,
): Promise<Sequence> {
  try {
    const sequence: Sequence = {
      id: makeId(),
      courseId,
      primaryLessonId,
      name: name.trim() || 'Untitled sequence',
      items,
      cueWindow: 2,
      createdAt: nextSequenceTimestamp(),
      ...opts,
    };
    const deckId = primaryLessonId
      ? await ensureLessonDeck(courseId, primaryLessonId)
      : await ensureCourseBankDeck(courseId);
    const payloads = generateCards(sequence);
    const now = Date.now();
    const cards = payloads.map((payload, i) => generatedCardFromPayload(deckId, payload, now + i));
    await db.transaction('rw', db.sequences, db.cards, async () => {
      await db.sequences.add(sequence);
      await db.cards.bulkAdd(cards);
    });
    return sequence;
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/**
 * Persist an edited Sequence and regenerate its cards to match: loads the previously-stored
 * sequence to find its prior generated cards, diffs against the new sequence via
 * {@link diffRegeneration}, and applies creates/updates/deletes to the cards table — all in
 * one transaction alongside the sequence write. Updates only ever touch front/back, never
 * FSRS/scheduling fields, so existing memory state survives content-only regeneration.
 */
export async function updateSequence(sequence: Sequence): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [
        db.sequences,
        db.cards,
        db.lessonCards,
        db.lessonCardExposures,
        db.decks,
        db.userPerformance,
        db.courses,
        db.lessons,
      ],
      async () => {
        const previous = await db.sequences.get(sequence.id);
        const existingCards = previous ? await cardsForSequence(previous) : [];
        const diff = diffRegeneration(sequence, existingCards);

        await db.sequences.put(sequence);

        if (diff.deletes.length > 0) {
          await db.lessonCards.where('cardId').anyOf(diff.deletes).delete();
          await db.lessonCardExposures.where('cardId').anyOf(diff.deletes).delete();
          await db.cards.bulkDelete(diff.deletes);
        }
        for (const update of diff.updates) {
          const { id, ...changes } = update;
          await db.cards.update(id, changes);
        }
        if (diff.creates.length > 0) {
          const deckId = sequence.primaryLessonId
            ? await ensureLessonDeck(sequence.courseId, sequence.primaryLessonId)
            : await ensureCourseBankDeck(sequence.courseId);
          const now = Date.now();
          const newCards = diff.creates.map((payload, i) => generatedCardFromPayload(deckId, payload, now + i));
          await db.cards.bulkAdd(newCards);
        }

        if (diff.updates.length > 0 || diff.deletes.length > 0) {
          scheduleAssetGc();
        }
      },
    );
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/** Delete a sequence and every card it generated, in one transaction. */
export async function deleteSequence(id: string): Promise<void> {
  await db.transaction('rw', [db.sequences, db.cards, db.lessonCards, db.lessonCardExposures], async () => {
    const sequence = await db.sequences.get(id);
    if (!sequence) return;
    const keys = sequenceItemKeys(sequence);
    if (keys.length > 0) {
      const cardIds = await db.cards.where('sequenceItemId').anyOf(keys).primaryKeys();
      if (cardIds.length > 0) {
        await db.lessonCards.where('cardId').anyOf(cardIds).delete();
        await db.lessonCardExposures.where('cardId').anyOf(cardIds).delete();
      }
      await db.cards.where('sequenceItemId').anyOf(keys).delete();
    }
    await db.sequences.delete(id);
  });
  scheduleAssetGc();
}

/** All sequences for a course, ordered by createdAt ascending. */
export async function listSequences(courseId: string): Promise<Sequence[]> {
  return db.sequences.where('courseId').equals(courseId).sortBy('createdAt');
}

/** A sequence plus every card it generated, with full FSRS state — for the undo-toast pattern. */
export interface SequenceSnapshot {
  sequence: Sequence;
  cards: Card[];
  lessonCards: LessonCardLink[];
  lessonCardExposures: LessonCardExposure[];
}

/** Capture a sequence and its generated cards before deletion/regeneration, so the
 *  action can be offered with an "Undo". Returns null if the sequence no longer exists. */
export async function snapshotSequence(id: string): Promise<SequenceSnapshot | null> {
  const sequence = await db.sequences.get(id);
  if (!sequence) return null;
  const cards = await cardsForSequence(sequence);
  const cardIds = cards.map((card) => card.id);
  const [lessonCards, lessonCardExposures] = cardIds.length > 0
    ? await Promise.all([
        db.lessonCards.where('cardId').anyOf(cardIds).toArray(),
        db.lessonCardExposures.where('cardId').anyOf(cardIds).toArray(),
      ])
    : [[], []];
  return { sequence, cards, lessonCards, lessonCardExposures };
}

/** Re-insert a previously captured SequenceSnapshot (the inverse of deleteSequence/updateSequence). */
export async function restoreSequence(snapshot: SequenceSnapshot): Promise<void> {
  try {
    await db.transaction('rw', [db.sequences, db.cards, db.lessonCards, db.lessonCardExposures], async () => {
      await db.sequences.put(snapshot.sequence);
      await db.cards.bulkPut(snapshot.cards);
      await db.lessonCards.bulkPut(snapshot.lessonCards);
      await db.lessonCardExposures.bulkPut(snapshot.lessonCardExposures);
    });
  } catch (err) {
    throw friendlyDbError(err);
  }
}
