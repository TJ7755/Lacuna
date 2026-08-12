import type {
  Card,
  CourseAssessment,
  CourseRecord,
  Deck,
  Lesson,
  UserPerformance,
} from './types';
import type { SchedulingPerformance, SchedulingUnitRecord, CoursePerformance } from './types';
import { schedulingUnitFromCourse, schedulingUnitFromLesson } from './schedulingUnitBuilder';

export interface DomainStorageMigrationResult {
  schedulingUnits: SchedulingUnitRecord[];
  coursePerformance: CoursePerformance[];
  schedulingPerformance: SchedulingPerformance[];
  schedulingUnitByCardId: Map<string, string>;
  schedulingUnitByDeckId: Map<string, string>;
}

function emptyPerformanceStats() {
  return {
    runningMeanResponseTime: 0,
    runningStdDevResponseTime: 0,
    m2: 0,
    totalCorrectReviews: 0,
  };
}

function statsFrom(performance: UserPerformance | undefined) {
  return performance
    ? {
        runningMeanResponseTime: performance.runningMeanResponseTime,
        runningStdDevResponseTime: performance.runningStdDevResponseTime,
        m2: performance.m2,
        totalCorrectReviews: performance.totalCorrectReviews,
      }
    : emptyPerformanceStats();
}

function unitFromLegacyDeck(deck: Deck): SchedulingUnitRecord {
  return {
    id: deck.id,
    createdAt: deck.createdAt,
    ...(deck.examDatePromptDismissed !== undefined
      ? { examDatePromptDismissed: deck.examDatePromptDismissed }
      : {}),
    kind: 'legacy-deck',
    courseId: null,
    lessonId: null,
    name: deck.name,
    examDate: deck.examDate,
    ...(deck.timeZone ? { timeZone: deck.timeZone } : {}),
    fsrsVersion: deck.fsrsVersion,
    fsrsParameters: deck.fsrsParameters,
    examObjective: deck.examObjective,
    ...(deck.archived !== undefined ? { archived: deck.archived } : {}),
    ...(deck.newCardsPerDay !== undefined ? { newCardsPerDay: deck.newCardsPerDay } : {}),
    ...(deck.maxReviewsPerDay !== undefined ? { maxReviewsPerDay: deck.maxReviewsPerDay } : {}),
    ...(deck.leechThreshold !== undefined ? { leechThreshold: deck.leechThreshold } : {}),
    ...(deck.leechAction !== undefined ? { leechAction: deck.leechAction } : {}),
    ...(deck.autoOptimise !== undefined ? { autoOptimise: deck.autoOptimise } : {}),
    ...(deck.dailyReviewGoal !== undefined ? { dailyReviewGoal: deck.dailyReviewGoal } : {}),
    ...(deck.sessionTimeLimitMinutes !== undefined
      ? { sessionTimeLimitMinutes: deck.sessionTimeLimitMinutes }
      : {}),
    ...(deck.colour ? { colour: deck.colour } : {}),
    ...(deck.lastInteractedAt !== undefined ? { lastInteractedAt: deck.lastInteractedAt } : {}),
  };
}

/**
 * Project the additive Course/Lesson model into explicit scheduling-unit storage.
 * The old Deck rows remain the source for legacy records during this checkpoint;
 * the returned maps make the conversion deterministic for card and history writes.
 */
export function buildDomainStorageMigration(
  courses: CourseRecord[],
  lessons: Lesson[],
  assessments: CourseAssessment[],
  decks: Deck[],
  cards: Card[],
  userPerformance: UserPerformance[],
): DomainStorageMigrationResult {
  const courseIds = new Set(courses.map((course) => course.id));
  const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const coursesById = new Map(courses.map((course) => [course.id, course]));
  const units = new Map<string, SchedulingUnitRecord>();
  const schedulingUnitByDeckId = new Map<string, string>();

  for (const course of courses) {
    units.set(course.id, schedulingUnitFromCourse(course, assessments));
  }
  for (const lesson of lessons) {
    const course = coursesById.get(lesson.courseId);
    if (course) units.set(lesson.id, schedulingUnitFromLesson(course, lesson, assessments));
  }

  for (const deck of decks) {
    const backingLesson = deck.backingLessonId ? lessonsById.get(deck.backingLessonId) : undefined;
    const mappedUnitId =
      deck.backingCourseId && courseIds.has(deck.backingCourseId)
        ? backingLesson && backingLesson.courseId === deck.backingCourseId
          ? backingLesson.id
          : deck.backingCourseId
        : undefined;
    if (mappedUnitId) {
      schedulingUnitByDeckId.set(deck.id, mappedUnitId);
      continue;
    }
    if (!units.has(deck.id)) units.set(deck.id, unitFromLegacyDeck(deck));
    schedulingUnitByDeckId.set(deck.id, deck.id);
  }

  const schedulingUnitByCardId = new Map<string, string>();
  const deckUnitCandidates = new Map<string, Set<string>>();
  for (const card of cards) {
    const primaryLesson = card.primaryLessonId ? lessonsById.get(card.primaryLessonId) : undefined;
    const lessonBelongsToCardCourse =
      primaryLesson !== undefined &&
      (card.courseId === null || card.courseId === undefined || primaryLesson.courseId === card.courseId);
    const unitId =
      lessonBelongsToCardCourse && units.get(primaryLesson.id)?.kind === 'lesson'
        ? primaryLesson.id
        : card.courseId && units.get(card.courseId)?.kind === 'course'
          ? card.courseId
          : schedulingUnitByDeckId.get(card.deckId) ?? card.deckId;
    schedulingUnitByCardId.set(card.id, unitId);
    const candidates = deckUnitCandidates.get(card.deckId) ?? new Set<string>();
    candidates.add(unitId);
    deckUnitCandidates.set(card.deckId, candidates);
  }
  // Legacy Deck ownership metadata is absent on some migrated records. If all cards
  // in such a deck resolve to one Course/Lesson unit, use that evidence to preserve
  // the deck's pacing profile rather than strand it as a compatibility-only row.
  for (const [deckId, candidates] of deckUnitCandidates) {
    if (candidates.size === 1) {
      const [unitId] = candidates;
      if (units.has(unitId)) schedulingUnitByDeckId.set(deckId, unitId);
    }
  }

  const performanceByKey = new Map(userPerformance.map((performance) => [performance.deckId, performance]));
  const schedulingPerformance: SchedulingPerformance[] = [];
  for (const unit of units.values()) {
    const sourceDeck = decks.find((deck) => schedulingUnitByDeckId.get(deck.id) === unit.id);
    const source = sourceDeck
      ? performanceByKey.get(sourceDeck.id)
      : unit.kind === 'legacy-deck'
        ? performanceByKey.get(unit.id)
        : undefined;
    schedulingPerformance.push({
      schedulingUnitId: unit.id,
      ...(unit.courseId ? { courseId: unit.courseId } : {}),
      ...(unit.lessonId ? { lessonId: unit.lessonId } : {}),
      ...statsFrom(source),
    });
  }

  const coursePerformance: CoursePerformance[] = courses.map((course) => ({
    courseId: course.id,
    ...statsFrom(performanceByKey.get(course.id)),
  }));

  return {
    schedulingUnits: [...units.values()],
    coursePerformance,
    schedulingPerformance,
    schedulingUnitByCardId,
    schedulingUnitByDeckId,
  };
}
