// Pure mapping helpers for the staged Deck/Folder -> Course/Lesson migration.
//
// These functions are deliberately side-effect free so they can be unit-tested
// in isolation and reused by the schema-version-9 upgrade. They take legacy
// Deck/Folder records and return the new Course/Lesson rows plus lookup maps the
// caller uses to stamp courseId/primaryLessonId onto cards, session history and
// performance profiles. New ids are produced by an injected generator so this
// module never imports schema.ts (which would create a circular dependency).
// British English throughout.

import { defaultFsrsParameters, FSRS_VERSION } from '../fsrs/params';
import { defaultExamDate } from '../utils/datetime';
import type { Course, Deck, Folder, Lesson } from './types';

/** A function that produces a fresh, collision-resistant id (e.g. makeId). */
export type IdGenerator = () => string;

/** The scheduling fields a Course inherits verbatim from a Deck. */
type CourseScheduling = Pick<
  Course,
  | 'examDate'
  | 'timeZone'
  | 'examDatePromptDismissed'
  | 'fsrsVersion'
  | 'fsrsParameters'
  | 'examObjective'
  | 'newCardsPerDay'
  | 'maxReviewsPerDay'
  | 'archived'
  | 'autoOptimise'
  | 'leechThreshold'
  | 'leechAction'
  | 'dailyReviewGoal'
  | 'sessionTimeLimitMinutes'
  | 'lastInteractedAt'
  | 'colour'
>;

/** Course-path defaults applied to every course created by the migration. */
const COURSE_PATH_DEFAULTS = {
  unlockMode: 'open',
  autoPractice: true,
  practiceThresholdMinutesFar: 8,
  practiceThresholdMinutesNear: 4,
  practiceUrgentWindowDays: 7,
  practiceMaxGap: 2,
} as const satisfies Pick<
  Course,
  | 'unlockMode'
  | 'autoPractice'
  | 'practiceThresholdMinutesFar'
  | 'practiceThresholdMinutesNear'
  | 'practiceUrgentWindowDays'
  | 'practiceMaxGap'
>;

/** Copy a deck's scheduling fields verbatim into the Course-shaped subset. */
function schedulingFromDeck(deck: Deck): CourseScheduling {
  return {
    examDate: deck.examDate,
    timeZone: deck.timeZone,
    examDatePromptDismissed: deck.examDatePromptDismissed,
    fsrsVersion: deck.fsrsVersion,
    fsrsParameters: deck.fsrsParameters,
    examObjective: deck.examObjective,
    newCardsPerDay: deck.newCardsPerDay,
    maxReviewsPerDay: deck.maxReviewsPerDay,
    archived: deck.archived,
    autoOptimise: deck.autoOptimise,
    leechThreshold: deck.leechThreshold,
    leechAction: deck.leechAction,
    dailyReviewGoal: deck.dailyReviewGoal,
    sessionTimeLimitMinutes: deck.sessionTimeLimitMinutes,
    lastInteractedAt: deck.lastInteractedAt,
    colour: deck.colour,
  };
}

/** Sensible scheduling defaults for a folder that has no decks to inherit from. */
function schedulingDefaults(): CourseScheduling {
  return {
    examDate: defaultExamDate(),
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
  };
}

/** The result of mapping legacy decks/folders into the course-path model. */
export interface CourseMigrationResult {
  courses: Course[];
  lessons: Lesson[];
  /** Maps a legacy deck id to the id of the course it was folded into. */
  courseIdByDeckId: Map<string, string>;
  /** Maps a legacy deck id to the id of the lesson it became. */
  lessonIdByDeckId: Map<string, string>;
}

/**
 * Build the Course/Lesson rows for every legacy deck and folder.
 *
 *  - A standalone deck (no folderId) becomes one single-lesson course; the
 *    course inherits the deck's scheduling fields verbatim.
 *  - A folder becomes one course whose decks become ordered lessons (by
 *    createdAt ascending). The course inherits the earliest deck's scheduling
 *    fields; any later deck whose examDate differs keeps it as a per-lesson
 *    override so no exam date is lost.
 *
 * Nested folders are flattened: parentId is ignored for grouping, since folders
 * are single-level in practice.
 */
export function buildCourseMigration(
  decks: Deck[],
  folders: Folder[],
  genId: IdGenerator,
): CourseMigrationResult {
  const courses: Course[] = [];
  const lessons: Lesson[] = [];
  const courseIdByDeckId = new Map<string, string>();
  const lessonIdByDeckId = new Map<string, string>();

  // Group decks by folder; decks with no folderId — or a folderId that points to
  // a folder that no longer exists (a dangling reference) — are treated as
  // standalone so no deck and none of its cards are dropped during migration.
  const folderIds = new Set(folders.map((f) => f.id));
  const decksByFolder = new Map<string, Deck[]>();
  const standaloneDecks: Deck[] = [];
  for (const deck of decks) {
    if (deck.folderId === null || deck.folderId === undefined || !folderIds.has(deck.folderId)) {
      standaloneDecks.push(deck);
    } else {
      const group = decksByFolder.get(deck.folderId);
      if (group) group.push(deck);
      else decksByFolder.set(deck.folderId, [deck]);
    }
  }

  // Standalone deck -> single-lesson course.
  for (const deck of standaloneDecks) {
    const courseId = genId();
    courses.push({
      id: courseId,
      name: deck.name,
      description: '',
      createdAt: deck.createdAt,
      ...schedulingFromDeck(deck),
      ...COURSE_PATH_DEFAULTS,
    });
    const lessonId = genId();
    lessons.push({
      id: lessonId,
      courseId,
      name: deck.name,
      orderIndex: 0,
      createdAt: deck.createdAt,
      isExtension: false,
    });
    courseIdByDeckId.set(deck.id, courseId);
    lessonIdByDeckId.set(deck.id, lessonId);
  }

  // Folder -> course with one lesson per deck, ordered by deck.createdAt.
  for (const folder of folders) {
    const folderDecks = (decksByFolder.get(folder.id) ?? [])
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt);
    const courseId = genId();
    const scheduling = folderDecks.length > 0
      ? schedulingFromDeck(folderDecks[0])
      : schedulingDefaults();
    courses.push({
      id: courseId,
      name: folder.name,
      description: '',
      createdAt: folder.createdAt,
      ...scheduling,
      ...COURSE_PATH_DEFAULTS,
    });

    folderDecks.forEach((deck, index) => {
      const lessonId = genId();
      const lesson: Lesson = {
        id: lessonId,
        courseId,
        name: deck.name,
        orderIndex: index,
        createdAt: deck.createdAt,
        isExtension: false,
      };
      // Preserve a deck's exam date as a per-lesson override when it differs
      // from the course-level date, so nothing is lost when folding in.
      if (deck.examDate !== scheduling.examDate) {
        lesson.examDate = deck.examDate;
        lesson.timeZone = deck.timeZone;
      }
      lessons.push(lesson);
      courseIdByDeckId.set(deck.id, courseId);
      lessonIdByDeckId.set(deck.id, lessonId);
    });
  }

  return { courses, lessons, courseIdByDeckId, lessonIdByDeckId };
}
