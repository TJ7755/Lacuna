import type {
  Card,
  CourseAssessment,
  CourseRecord,
  LegacyDeckRecord,
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

type StorageMigrationCard = Omit<Card, 'schedulingUnitId'> & { schedulingUnitId?: string };

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

/** Combine Welford summaries without expanding the underlying review history. */
function combineStats(performances: UserPerformance[]) {
  let count = 0;
  let mean = 0;
  let m2 = 0;

  for (const performance of performances) {
    const incomingCount = performance.totalCorrectReviews;
    if (incomingCount <= 0) continue;
    if (count === 0) {
      count = incomingCount;
      mean = performance.runningMeanResponseTime;
      m2 = performance.m2;
      continue;
    }

    const delta = performance.runningMeanResponseTime - mean;
    const combinedCount = count + incomingCount;
    mean += delta * (incomingCount / combinedCount);
    m2 += performance.m2 + (delta * delta * count * incomingCount) / combinedCount;
    count = combinedCount;
  }

  return count > 0
    ? {
        runningMeanResponseTime: mean,
        runningStdDevResponseTime: Math.sqrt(m2 / count),
        m2,
        totalCorrectReviews: count,
      }
    : emptyPerformanceStats();
}

export function schedulingUnitFromLegacyDeck(deck: LegacyDeckRecord): SchedulingUnitRecord {
  return {
    id: deck.id,
    createdAt: deck.createdAt,
    updatedAt: deck.createdAt,
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
  decks: LegacyDeckRecord[],
  cards: StorageMigrationCard[],
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
    if (!units.has(deck.id)) units.set(deck.id, schedulingUnitFromLegacyDeck(deck));
    schedulingUnitByDeckId.set(deck.id, deck.id);
  }

  const schedulingUnitByCardId = new Map<string, string>();
  const deckUnitCandidates = new Map<string, Set<string>>();
  for (const card of cards) {
    const legacyDeckId = card.deckId ?? card.schedulingUnitId;
    if (!legacyDeckId) continue;
    const primaryLesson = card.primaryLessonId ? lessonsById.get(card.primaryLessonId) : undefined;
    const lessonBelongsToCardCourse =
      primaryLesson !== undefined &&
      (card.courseId === null || card.courseId === undefined || primaryLesson.courseId === card.courseId);
    const unitId =
      lessonBelongsToCardCourse && units.get(primaryLesson.id)?.kind === 'lesson'
        ? primaryLesson.id
        : card.courseId && units.get(card.courseId)?.kind === 'course'
          ? card.courseId
          : schedulingUnitByDeckId.get(legacyDeckId) ?? legacyDeckId;
    schedulingUnitByCardId.set(card.id, unitId);
    const candidates = deckUnitCandidates.get(legacyDeckId) ?? new Set<string>();
    candidates.add(unitId);
    deckUnitCandidates.set(legacyDeckId, candidates);
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
  const performanceByUnitId = new Map<string, UserPerformance[]>();
  for (const deck of decks) {
    const unitId = schedulingUnitByDeckId.get(deck.id);
    const performance = performanceByKey.get(deck.id);
    if (!unitId || !performance) continue;
    const sources = performanceByUnitId.get(unitId) ?? [];
    sources.push(performance);
    performanceByUnitId.set(unitId, sources);
  }

  const schedulingPerformance: SchedulingPerformance[] = [];
  for (const unit of units.values()) {
    const sources = performanceByUnitId.get(unit.id) ?? [];
    if (sources.length === 0 && unit.kind === 'legacy-deck') {
      const performance = performanceByKey.get(unit.id);
      if (performance) sources.push(performance);
    }
    schedulingPerformance.push({
      schedulingUnitId: unit.id,
      ...(unit.courseId ? { courseId: unit.courseId } : {}),
      ...(unit.lessonId ? { lessonId: unit.lessonId } : {}),
      ...combineStats(sources),
      updatedAt: 0,
    });
  }

  const coursePerformance: CoursePerformance[] = courses.map((course) => ({
    courseId: course.id,
    ...statsFrom(performanceByKey.get(course.id)),
    updatedAt: 0,
  }));

  return {
    schedulingUnits: [...units.values()],
    coursePerformance,
    schedulingPerformance,
    schedulingUnitByCardId,
    schedulingUnitByDeckId,
  };
}
