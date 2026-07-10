// High-level data operations that combine the FSRS engine with persistence.
// Components call these rather than touching Dexie tables directly.

import { db, makeId } from './schema';
import type {
  Card,
  CardType,
  Course,
  CourseExamDate,
  Deck,
  Folder,
  Grade,
  Lesson,
  LessonCardLink,
  Note,
  PracticeNode,
  ReviewLog,
  SchedulerConfig,
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
import { scheduleAssetGc } from './assets';

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

/** Archive a deck: keep all data but withdraw it from active study and progress totals. */
export async function archiveDeck(id: string): Promise<void> {
  await db.decks.update(id, { archived: true });
}

/** Return an archived deck to active study. */
export async function unarchiveDeck(id: string): Promise<void> {
  await db.decks.update(id, { archived: false });
}

/** Set a deck's exam date (used to resolve the passed-exam state with a fresh date). */
export async function setExamDate(id: string, examDate: number): Promise<void> {
  await db.decks.update(id, { examDate });
}

export async function deleteDeck(id: string): Promise<void> {
  await db.transaction(
    'rw',
    db.decks,
    db.cards,
    db.sessionHistory,
    db.userPerformance,
    async () => {
      await db.cards.where('deckId').equals(id).delete();
      await db.sessionHistory.where('deckId').equals(id).delete();
      await db.userPerformance.delete(id);
      await db.decks.delete(id);
    },
  );
  scheduleAssetGc();
}

export async function deleteDecks(ids: string[]): Promise<void> {
  await db.transaction(
    'rw',
    db.decks,
    db.cards,
    db.sessionHistory,
    db.userPerformance,
    async () => {
      for (const id of ids) {
        await db.cards.where('deckId').equals(id).delete();
        await db.sessionHistory.where('deckId').equals(id).delete();
        await db.userPerformance.delete(id);
        await db.decks.delete(id);
      }
    },
  );
  scheduleAssetGc();
}

/** A complete copy of one or more decks and everything that hangs off them. */
export interface DeckSnapshot {
  decks: Deck[];
  cards: Card[];
  sessionHistory: SessionHistoryEntry[];
  userPerformance: UserPerformance[];
}

/**
 * Capture decks plus their cards, session history and performance before deletion,
 * so the action can be offered with an "Undo". Call this *before* deleteDecks.
 */
export async function snapshotDecks(ids: string[]): Promise<DeckSnapshot> {
  const idSet = new Set(ids);
  const [decks, cards, sessionHistory, userPerformance] = await Promise.all([
    db.decks.where('id').anyOf(ids).toArray(),
    db.cards.where('deckId').anyOf(ids).toArray(),
    db.sessionHistory.where('deckId').anyOf(ids).toArray(),
    db.userPerformance.where('deckId').anyOf(ids).toArray(),
  ]);
  // Guard against any stray records the indexes might miss.
  return {
    decks: decks.filter((d) => idSet.has(d.id)),
    cards,
    sessionHistory,
    userPerformance,
  };
}

/** Re-insert a previously captured DeckSnapshot (the inverse of deleteDecks). */
export async function restoreDecks(snapshot: DeckSnapshot): Promise<void> {
  try {
    await db.transaction(
      'rw',
      db.decks,
      db.cards,
      db.sessionHistory,
      db.userPerformance,
      async () => {
        await Promise.all([
          db.decks.bulkPut(snapshot.decks),
          db.cards.bulkPut(snapshot.cards),
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

/**
 * Merge several decks into a chosen target. The target keeps its name, exam date and
 * performance profile; all other decks' cards are reassigned to it, their session history
 * is concatenated onto the target, and the emptied decks are removed.
 */
export async function mergeDecks(sourceIds: string[], targetId: string): Promise<void> {
  const others = sourceIds.filter((id) => id !== targetId);
  if (others.length === 0) return;
  const now = Date.now();
  await db.transaction(
    'rw',
    db.decks,
    db.cards,
    db.sessionHistory,
    db.userPerformance,
    async () => {
      for (const sourceId of others) {
        await db.cards.where('deckId').equals(sourceId).modify({ deckId: targetId });
        await db.sessionHistory
          .where('deckId')
          .equals(sourceId)
          .modify({ deckId: targetId });
        await db.userPerformance.delete(sourceId);
        await db.decks.delete(sourceId);
      }
      await db.decks.update(targetId, { lastInteractedAt: now });
    },
  );
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export async function createFolder(name: string, parentId?: string | null): Promise<Folder> {
  try {
    const folder: Folder = {
      id: makeId(),
      name: name.trim() || 'Untitled folder',
      parentId: parentId ?? null,
      createdAt: Date.now(),
    };
    await db.folders.add(folder);
    return folder;
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function updateFolder(id: string, changes: Partial<Folder>): Promise<void> {
  try {
    await db.folders.update(id, changes);
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/** Move a deck into (or out of) a folder. Pass null to move to top level. */
export async function moveDeckToFolder(deckId: string, folderId: string | null): Promise<void> {
  try {
    await db.decks.update(deckId, { folderId });
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/** Move a folder into (or out of) another folder. Pass null to move to top level. */
export async function moveFolder(folderId: string, parentId: string | null): Promise<void> {
  try {
    await db.folders.update(folderId, { parentId });
  } catch (err) {
    throw friendlyDbError(err);
  }
}

/** Move many decks into (or out of) a folder at once. */
export async function moveDecksToFolder(deckIds: string[], folderId: string | null): Promise<void> {
  await db.transaction('rw', db.decks, async () => {
    await db.decks.where('id').anyOf(deckIds).modify({ folderId });
  });
}

/**
 * Delete a folder. Its child decks are moved to the top level (folderId set to null).
 * Child folders are re-parented to the deleted folder's parent (or top level).
 */
export async function deleteFolder(id: string): Promise<void> {
  await db.transaction('rw', db.folders, db.decks, async () => {
    const target = await db.folders.get(id);
    if (!target) return;
    // Re-parent child folders to the deleted folder's parent.
    await db.folders.where('parentId').equals(id).modify({ parentId: target.parentId });
    // Move decks out of this folder to the top level (or parent folder).
    await db.decks.where('folderId').equals(id).modify({ folderId: target.parentId });
    await db.folders.delete(id);
  });
}

/** All folders in creation order. */
export async function listFolders(): Promise<Folder[]> {
  return db.folders.orderBy('createdAt').toArray();
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

/** Create a deck and immediately populate it with imported cards, in one go. */
export async function createDeckWithCards(
  name: string,
  drafts: { type: CardType; front: string; back: string; tags?: string[] }[],
): Promise<Deck> {
  try {
    const deck = await createDeck(name);
    if (drafts.length > 0) await createCards(deck.id, drafts);
    return deck;
  } catch (err) {
    throw friendlyDbError(err);
  }
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
  await db.transaction('rw', db.cards, async () => {
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
  await db.cards.bulkDelete(ids);
  scheduleAssetGc();
}

/** Capture card rows before deletion so the action can be offered with an "Undo". */
export async function snapshotCards(ids: string[]): Promise<Card[]> {
  return db.cards.where('id').anyOf(ids).toArray();
}

/** Re-insert previously captured cards (the inverse of deleteCards). */
export async function restoreCards(cards: Card[]): Promise<void> {
  try {
    await db.cards.bulkPut(cards);
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
export type ReviewUnitKind = 'deck' | 'course';

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

  const sessionHistoryId = await db.transaction(
    'rw',
    [db.cards, db.decks, db.courses, db.sessionHistory, db.userPerformance],
    async () => {
      await db.cards.put(updatedCard);
      if (kind === 'course') {
        await db.courses.update(deck.id, { lastInteractedAt: now });
      } else {
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

    return { card: updatedCard, sessionHistoryId, kind };
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
   * Recorded by `recordReview` (see {@link RecordReviewResult.kind}) so a future
   * `lastInteractedAt` restore on undo (not yet implemented — `undoReview` does not
   * currently touch `lastInteractedAt`) knows which table to look the id up in.
   */
  kind: ReviewUnitKind;
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
      db.cards,
      db.sessionHistory,
      db.userPerformance,
      async () => {
        await db.cards.put(undo.cardBefore);
        if (undo.perfBefore) {
          await db.userPerformance.put(undo.perfBefore);
        } else {
          await db.userPerformance.delete(undo.deckId);
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
      ...practiceDefaults,
      ...opts,
    };
    await db.courses.add(course);
    return course;
  } catch (err) {
    throw friendlyDbError(err);
  }
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
    [db.courses, db.lessons, db.notes, db.lessonCards, db.practiceNodes, db.courseExamDates, db.cards],
    async () => {
      const lessonIds = await db.lessons.where('courseId').equals(id).primaryKeys();
      if (lessonIds.length > 0) {
        await db.notes.where('lessonId').anyOf(lessonIds).delete();
        await db.lessonCards.where('lessonId').anyOf(lessonIds).delete();
      }
      await db.lessons.where('courseId').equals(id).delete();
      await db.practiceNodes.where('courseId').equals(id).delete();
      await db.courseExamDates.where('courseId').equals(id).delete();
      await db.cards.where('courseId').equals(id).delete();
      await db.courses.delete(id);
    },
  );
  // Deleting the course's cards may orphan image assets; reclaim them, as deleteDeck does.
  scheduleAssetGc();
}

export async function listCourses(): Promise<Course[]> {
  return db.courses.orderBy('createdAt').toArray();
}

export async function getCourse(id: string): Promise<Course | undefined> {
  return db.courses.get(id);
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
  await db.transaction('rw', db.lessons, db.notes, db.lessonCards, db.cards, async () => {
    await db.notes.where('lessonId').equals(id).delete();
    await db.lessonCards.where('lessonId').equals(id).delete();
    await db.cards.where('primaryLessonId').equals(id).modify({ primaryLessonId: null });
    await db.lessons.delete(id);
  });
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
  await db.notes.delete(id);
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
// Lesson-card links
// ---------------------------------------------------------------------------

/**
 * Link a card into a lesson for display/grouping purposes. Idempotent: if a link
 * for the (lessonId, cardId) pair already exists, it is returned unchanged.
 */
export async function linkCardToLesson(lessonId: string, cardId: string): Promise<LessonCardLink> {
  try {
    const existing = await db.lessonCards
      .where('lessonId')
      .equals(lessonId)
      .filter((lc) => lc.cardId === cardId)
      .first();
    if (existing) return existing;
    const link: LessonCardLink = {
      id: makeId(),
      lessonId,
      cardId,
      createdAt: Date.now(),
    };
    await db.lessonCards.add(link);
    return link;
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function unlinkCardFromLesson(lessonId: string, cardId: string): Promise<void> {
  await db.lessonCards
    .where('lessonId')
    .equals(lessonId)
    .filter((lc) => lc.cardId === cardId)
    .delete();
}

export async function listLessonCardLinks(lessonId: string): Promise<LessonCardLink[]> {
  return db.lessonCards.where('lessonId').equals(lessonId).toArray();
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
  await db.practiceNodes.delete(id);
}

export async function listPracticeNodes(courseId: string): Promise<PracticeNode[]> {
  return db.practiceNodes.where('courseId').equals(courseId).toArray();
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
