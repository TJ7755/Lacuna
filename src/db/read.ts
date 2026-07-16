// Plain, React-free read-side query module over Dexie.
//
// This is the non-React counterpart to src/state/useData.ts / useCourseData.ts: the
// hooks keep using useLiveQuery for the UI, while this module is for callers with no
// React tree — chiefly the future MCP tool surface (src/mcp/tools/read.ts), but usable
// by any non-React caller. Every function is a plain async function built directly on
// Dexie (see src/db/diagnostics.ts for the established non-hook style of touching the
// database) and the existing pure analytics modules — no scoring/eligibility logic is
// reimplemented here, only composed.
//
// Cards carry their courseId/primaryLessonId directly (see src/db/types.ts), so
// course-scoped card queries read the cards table's courseId index without needing to
// resolve a course's hidden backing decks; those decks exist only to give the FSRS
// engine a UserPerformance/calibration home per lesson (see ensureLessonDeck/
// ensureCourseBankDeck in repository.ts) and are irrelevant to read-side queries.

import { db } from './schema';
import type { Card, Course, CourseExamDate, Lesson, PracticeNode, Sequence } from './types';
import { gatherCounts, type DiagnosticBundle } from './diagnostics';
import { listNotes as repositoryListNotes, listSequences as repositoryListSequences } from './repository';
import { availableCards, dueCards, studyPool } from '../fsrs/eligibility';
import {
  makeObjectiveContext,
  progressValue,
  scoreCard,
  sortByObjective,
} from '../fsrs/objective';
import { isLeech } from '../fsrs/leech';
import { buildDeckSecondsMap, computeStudyStats, type StudyStats } from '../fsrs/stats';
import { makeExamDateContext } from '../fsrs/examDate';
import { courseHeaderStats, type CourseHeaderStats } from '../course/headerStats';

// ---------------------------------------------------------------------------
// Courses / lessons
// ---------------------------------------------------------------------------

/** Every course, ordered by creation time (mirrors useCourses). */
export async function listCourses(): Promise<Course[]> {
  return db.courses.orderBy('createdAt').toArray();
}

/** A single course, or null if it does not exist. */
export async function getCourse(courseId: string): Promise<Course | null> {
  return (await db.courses.get(courseId)) ?? null;
}

/** A course's lessons, ordered by path position (mirrors useLessons). */
export async function listLessons(courseId: string): Promise<Lesson[]> {
  return db.lessons.where('courseId').equals(courseId).sortBy('orderIndex');
}

/** A single lesson, or null if it does not exist. */
export async function getLesson(lessonId: string): Promise<Lesson | null> {
  return (await db.lessons.get(lessonId)) ?? null;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** Every card belonging to a course (mirrors useCourseCards). */
export async function listCardsForCourse(courseId: string): Promise<Card[]> {
  return db.cards.where('courseId').equals(courseId).toArray();
}

/**
 * Cards taught in a lesson: those whose primaryLessonId is the lesson, plus any
 * additionally linked via LessonCardLink, de-duplicated by card id. Mirrors
 * useLessonCards exactly (LessonCardLink is display-only, never an FSRS duplicate).
 */
export async function listCardsForLesson(lessonId: string): Promise<Card[]> {
  const [links, primaryCards] = await Promise.all([
    db.lessonCards.where('lessonId').equals(lessonId).toArray(),
    db.cards.where('primaryLessonId').equals(lessonId).toArray(),
  ]);
  const linkedCardIds = links.map((link) => link.cardId);
  const linkedCards =
    linkedCardIds.length > 0 ? await db.cards.where('id').anyOf(linkedCardIds).toArray() : [];
  const seen = new Set<string>();
  const result: Card[] = [];
  for (const card of [...primaryCards, ...linkedCards]) {
    if (!seen.has(card.id)) {
      seen.add(card.id);
      result.push(card);
    }
  }
  return result;
}

/** A single card, or null if it does not exist. */
export async function getCard(cardId: string): Promise<Card | null> {
  return (await db.cards.get(cardId)) ?? null;
}

/**
 * Cards a study session would serve right now for a course: due reviews plus
 * brand-new cards admitted under the course's newCardsPerDay cap (studyPool),
 * ranked by the course's objective (sortByObjective) and capped at `limit` when
 * given. Mirrors the "due now" semantics in src/course/headerStats.ts.
 */
export async function listDueCards(
  courseId: string,
  limit?: number,
  now: number = Date.now(),
): Promise<Card[]> {
  const course = await getCourse(courseId);
  if (!course) return [];
  const [cards, lessons, examDates] = await Promise.all([
    listCardsForCourse(courseId),
    listLessons(courseId),
    listCourseExamDates(courseId),
  ]);
  const pool = studyPool(cards, course, now);
  const servable = dueCards(pool, now).concat(pool.filter((c) => c.state === 0));
  const examDateContext = makeExamDateContext(course, lessons, examDates);
  const oc = makeObjectiveContext(course, examDateContext);
  const sorted = sortByObjective(servable, oc, now).map((s) => s.card);
  return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
}

/** A card ranked as weak: leeches first, then ascending objective score (worst first). */
export interface WeakCard {
  card: Card;
  /** Whether the card has lapsed past the course's (or default) leech threshold. */
  leech: boolean;
  /** The course's objective score for this card (src/fsrs/objective.ts's scoreCard). Lower is weaker. */
  score: number;
}

/**
 * The course's weakest available cards: leeches (see src/fsrs/leech.ts) ranked
 * first, then every other card ascending by objective score (src/fsrs/objective.ts),
 * so the lowest-scoring, least-secured cards surface first. Capped at `limit` when given.
 */
export async function getWeakCards(
  courseId: string,
  limit?: number,
  now: number = Date.now(),
): Promise<WeakCard[]> {
  const course = await getCourse(courseId);
  if (!course) return [];
  const [cards, lessons, examDates] = await Promise.all([
    listCardsForCourse(courseId),
    listLessons(courseId),
    listCourseExamDates(courseId),
  ]);
  const examDateContext = makeExamDateContext(course, lessons, examDates);
  const oc = makeObjectiveContext(course, examDateContext);
  const scored: WeakCard[] = availableCards(cards, now).map((card) => ({
    card,
    leech: isLeech(card, course.leechThreshold),
    score: scoreCard(card, oc, now),
  }));
  scored.sort((a, b) => {
    if (a.leech !== b.leech) return a.leech ? -1 : 1;
    return a.score - b.score;
  });
  return typeof limit === 'number' ? scored.slice(0, limit) : scored;
}

// ---------------------------------------------------------------------------
// Course stats
// ---------------------------------------------------------------------------

export interface CourseStats {
  header: CourseHeaderStats;
  /** Total lessons on the course path (extension lessons included; contrast CourseSummary in useCourseData.ts). */
  lessonCount: number;
  /** Total cards belonging to the course. */
  cardCount: number;
  studyStats: StudyStats;
}

/**
 * Bundled stats for a course: nearest-exam/mastery/due-count header stats
 * (src/course/headerStats.ts) plus the study forecast (src/fsrs/stats.ts), both
 * scoped to this course's own cards. Returns null if the course does not exist.
 */
export async function getCourseStats(
  courseId: string,
  now: number = Date.now(),
): Promise<CourseStats | null> {
  const course = await getCourse(courseId);
  if (!course) return null;
  const [lessons, cards, examDates, perf] = await Promise.all([
    listLessons(courseId),
    listCardsForCourse(courseId),
    listCourseExamDates(courseId),
    db.userPerformance.toArray(),
  ]);
  const examDateContext = makeExamDateContext(course, lessons, examDates);
  const mastery = progressValue(availableCards(cards, now), course, now, examDateContext);
  const header = courseHeaderStats(course, examDates, cards, mastery, now);
  const deckSeconds = buildDeckSecondsMap(perf);
  const studyStats = computeStudyStats(cards, deckSeconds, now);
  return { header, lessonCount: lessons.length, cardCount: cards.length, studyStats };
}

// ---------------------------------------------------------------------------
// Sequences / notes
// ---------------------------------------------------------------------------

/** All sequences for a course, ordered by createdAt ascending. Re-exports repository.ts's implementation. */
export const listSequences = repositoryListSequences;

/** A single sequence, or null if it does not exist. */
export async function getSequence(sequenceId: string): Promise<Sequence | null> {
  return (await db.sequences.get(sequenceId)) ?? null;
}

/** All notes for a lesson, ordered by orderIndex ascending. Re-exports repository.ts's implementation. */
export const listNotes = repositoryListNotes;

// ---------------------------------------------------------------------------
// Practice / exam dates
// ---------------------------------------------------------------------------

/** All practice nodes for a course (manual and auto). */
export async function listPracticeNodes(courseId: string): Promise<PracticeNode[]> {
  return db.practiceNodes.where('courseId').equals(courseId).toArray();
}

/** All exam dates/checkpoints for a course, ordered by date ascending (mirrors useCourseExamDates). */
export async function listCourseExamDates(courseId: string): Promise<CourseExamDate[]> {
  return db.courseExamDates.where('courseId').equals(courseId).sortBy('examDate');
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/** Course-scoped record counts, for a course-level diagnostic summary. */
export interface CourseDiagnosticsSummary {
  courseId: string;
  lessons: number;
  cards: number;
  notes: number;
  lessonCards: number;
  practiceNodes: number;
  courseExamDates: number;
  sequences: number;
}

/**
 * Record counts for a diagnostic summary: whole-database counts (same shape as
 * src/db/diagnostics.ts's gatherCounts) when no courseId is given, or counts scoped
 * to a single course otherwise.
 */
export async function diagnosticsSummary(
  courseId?: string,
): Promise<DiagnosticBundle['data'] | CourseDiagnosticsSummary> {
  if (!courseId) return gatherCounts();

  const lessons = await listLessons(courseId);
  const lessonIds = lessons.map((lesson) => lesson.id);
  const [cards, notesCounts, lessonCardsCounts, practiceNodes, courseExamDates, sequences] =
    await Promise.all([
      listCardsForCourse(courseId),
      Promise.all(lessonIds.map((id) => db.notes.where('lessonId').equals(id).count())),
      Promise.all(lessonIds.map((id) => db.lessonCards.where('lessonId').equals(id).count())),
      db.practiceNodes.where('courseId').equals(courseId).count(),
      db.courseExamDates.where('courseId').equals(courseId).count(),
      db.sequences.where('courseId').equals(courseId).count(),
    ]);

  return {
    courseId,
    lessons: lessons.length,
    cards: cards.length,
    notes: notesCounts.reduce((sum, count) => sum + count, 0),
    lessonCards: lessonCardsCounts.reduce((sum, count) => sum + count, 0),
    practiceNodes,
    courseExamDates,
    sequences,
  };
}
